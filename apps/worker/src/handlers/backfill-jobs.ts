import {
  prisma,
  createIssueEvent,
  createSlackMessage,
  findIssueByJiraId,
  findDepartmentByJiraProjectPrefix,
  mergeIssues,
  PrismaClient as _PrismaClient,
  Prisma,
} from '@remi/db';
import type { BackfillJobMessage } from '@remi/shared';
import { QueueNames, TriggerReason } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import { JiraClient } from '@remi/jira';
import { WebClient } from '@slack/web-api';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';

export async function handleBackfillJob(
  message: BackfillJobMessage,
  queue: IQueueProducer,
): Promise<void> {
  const { payload } = message;

  if (payload.kind === 'jira_issue_backfill') {
    await handleJiraIssueBackfill(message, queue);
  } else if (payload.kind === 'slack_thread_backfill') {
    await handleSlackThreadBackfill(message, queue);
  } else {
    console.warn(`[backfill-jobs] Unknown backfill kind: ${payload.kind}`);
  }
}

async function handleJiraIssueBackfill(
  message: BackfillJobMessage,
  queue: IQueueProducer,
): Promise<void> {
  const { payload, workspaceId } = message;

  if (!payload.issueId) {
    console.warn('[backfill-jobs] jira_issue_backfill missing issueId');
    return;
  }

  const issue = await prisma.issue.findUnique({ where: { id: payload.issueId } });
  if (!issue) {
    console.warn(`[backfill-jobs] Issue not found: ${payload.issueId}`);
    return;
  }

  const install = await prisma.jiraWorkspaceInstall.findFirst({ where: { workspaceId } });
  if (!install) {
    console.warn(`[backfill-jobs] No Jira install found for workspace: ${workspaceId}`);
    return;
  }

  // JiraClient constructor: (baseUrl, sharedSecret)
  const jiraClient = new JiraClient(install.jiraSiteUrl, install.sharedSecret);

  // Always fetch real issue data first — this is the critical path
  const freshIssue = await jiraClient.getIssue(issue.jiraIssueKey);
  const nextAssigneeJiraAccountId = freshIssue.assignee?.accountId ?? null;
  const nextAssigneeDisplayName =
    nextAssigneeJiraAccountId === null
      ? null
      : freshIssue.assignee?.displayName ??
        (issue.assigneeJiraAccountId === nextAssigneeJiraAccountId ? issue.assigneeDisplayName : null);
  const canonicalJiraIssueId = freshIssue.id ?? issue.jiraIssueId;
  const existingCanonical = await findIssueByJiraId(prisma, canonicalJiraIssueId, install.jiraSiteUrl);
  const targetIssue =
    existingCanonical && existingCanonical.id !== issue.id
      ? await mergeIssues(prisma, issue.id, existingCanonical.id)
      : issue;

  const projectPrefix = issue.jiraIssueKey.split('-')[0];
  const department = await findDepartmentByJiraProjectPrefix(prisma, workspaceId, projectPrefix);

  await prisma.issue.update({
    where: { id: targetIssue.id },
    data: {
      jiraIssueId: canonicalJiraIssueId,
      jiraSiteUrl: install.jiraSiteUrl,
      title: freshIssue.summary,
      status: freshIssue.status.name,
      statusCategory: freshIssue.status.statusCategory.key,
      assigneeJiraAccountId: nextAssigneeJiraAccountId,
      assigneeDisplayName: nextAssigneeDisplayName,
      priority: freshIssue.priority?.name ?? null,
      issueType: freshIssue.issuetype.name,
      rawPayload: freshIssue as unknown as Prisma.InputJsonValue,
      ...(department ? { departmentId: department.id } : {}),
    },
  });

  // Fetch changelog and create IssueEvent for each entry — non-fatal.
  // Event types must match what the status-analyzer expects: status_changed,
  // assignee_changed, priority_changed (mirrors the derivation in jira-events.ts).
  try {
    const changelog = await jiraClient.getIssueChangelog(issue.jiraIssueKey);

    // Batch-fetch all existing idempotency keys for this issue in one query
    // to avoid N+1 lookups in the loop below.
    const existingEvents = await prisma.issueEvent.findMany({
      where: { issueId: targetIssue.id, source: 'jira_backfill' },
      select: { idempotencyKey: true },
    });
    const existingKeys = new Set(existingEvents.map((e) => e.idempotencyKey));

    for (const entry of changelog) {
      const idempotencyKey = `jira:changelog:${canonicalJiraIssueId}:${entry.created}`;
      if (existingKeys.has(idempotencyKey)) continue;

      // Derive the primary event type from the changed fields (same precedence as jira-events.ts)
      const fieldNames = entry.items.map((item) => item.field.toLowerCase());
      let derivedEventType = 'changelog_entry';
      let primaryField: string | null = null;
      if (fieldNames.includes('status')) {
        derivedEventType = 'status_changed';
        primaryField = 'status';
      } else if (fieldNames.includes('assignee')) {
        derivedEventType = 'assignee_changed';
        primaryField = 'assignee';
      } else if (fieldNames.includes('priority')) {
        derivedEventType = 'priority_changed';
        primaryField = 'priority';
      }

      // Store flat { from, to } for typed events so the status-analyzer can read them
      let changedFields: Record<string, unknown> = entry as unknown as Record<string, unknown>;
      if (primaryField) {
        const item = entry.items.find((i) => i.field.toLowerCase() === primaryField);
        changedFields = { from: item?.fromString ?? null, to: item?.toString ?? null };
      }

      await createIssueEvent(prisma, {
        issueId: targetIssue.id,
        idempotencyKey,
        eventType: derivedEventType,
        source: 'jira_backfill',
        changedFields,
        rawPayload: entry as unknown as Record<string, unknown>,
        occurredAt: new Date(entry.created),
      });
    }
  } catch (err) {
    console.warn(`[backfill-jobs] Changelog fetch failed for ${issue.jiraIssueKey}, skipping:`, err);
  }

  // Enqueue summary after backfill
  const summaryIdempotencyKey = `summary:backfill:${targetIssue.id}:${Date.now()}`;
  await queue.send(QueueNames.SUMMARY_JOBS, {
    type: 'summary_job',
    id: uuidv4(),
    workspaceId,
    idempotencyKey: summaryIdempotencyKey,
    timestamp: new Date().toISOString(),
    payload: {
      issueId: targetIssue.id,
      triggerReason: TriggerReason.BACKFILL_COMPLETE,
      force: true,
    },
  });

  console.log(`[backfill-jobs] Jira backfill complete for issue ${targetIssue.id}`);
}

async function handleSlackThreadBackfill(
  message: BackfillJobMessage,
  queue: IQueueProducer,
): Promise<void> {
  const { payload, workspaceId } = message;

  if (!payload.threadId) {
    console.warn('[backfill-jobs] slack_thread_backfill missing threadId');
    return;
  }

  const thread = await prisma.slackThread.findUnique({ where: { id: payload.threadId } });
  if (!thread) {
    console.warn(`[backfill-jobs] SlackThread not found: ${payload.threadId}`);
    return;
  }

  const slackInstall = await prisma.slackWorkspaceInstall.findFirst({ where: { workspaceId } });
  if (!slackInstall?.botToken) {
    console.warn(`[backfill-jobs] No Slack bot token for workspace: ${workspaceId}`);
    return;
  }

  const slackClient = new WebClient(slackInstall.botToken);

  // Fetch messages: paginated history for channel-level links, replies for thread-level.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let slackMessages: any[] = [];
  try {
    if (thread.isChannelLevel) {
      // Paginate through history up to SLACK_BACKFILL_LIMIT messages
      let cursor: string | undefined;
      let fetched = 0;
      const limit = config.SLACK_BACKFILL_LIMIT;
      do {
        const pageSize = Math.min(200, limit - fetched);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const historyResult = await (slackClient.conversations.history as any)({
          channel: thread.channelId,
          limit: pageSize,
          ...(cursor ? { cursor } : {}),
        });
        slackMessages = slackMessages.concat(historyResult.messages ?? []);
        fetched += (historyResult.messages ?? []).length;
        cursor = historyResult.response_metadata?.next_cursor;
      } while (cursor && fetched < config.SLACK_BACKFILL_LIMIT);
    } else {
      const repliesResult = await slackClient.conversations.replies({
        channel: thread.channelId,
        ts: thread.threadTs,
      });
      slackMessages = repliesResult.messages ?? [];
    }
  } catch (err: unknown) {
    const slackError = (err as { data?: { error?: string } }).data?.error;
    if (slackError === 'not_in_channel' || slackError === 'channel_not_found') {
      console.warn(
        `[backfill-jobs] Slack ${slackError} for channel ${thread.channelId} — bot not in channel, skipping thread backfill`,
      );
      return;
    }
    throw err;
  }

  // Batch-fetch existing idempotency keys for this thread in one query
  // to avoid N+1 lookups in the loop below.
  const existingMessages = await prisma.slackMessage.findMany({
    where: { threadId: thread.id },
    select: { idempotencyKey: true },
  });
  const existingMessageKeys = new Set(existingMessages.map((m) => m.idempotencyKey));

  for (const msg of slackMessages) {
    if (!msg.ts) continue;

    const idempotencyKey = `slack:backfill:${thread.slackTeamId}:${thread.channelId}:${msg.ts}`;
    if (existingMessageKeys.has(idempotencyKey)) continue;

    await createSlackMessage(prisma, {
      threadId: thread.id,
      idempotencyKey,
      slackMessageTs: msg.ts,
      slackUserId: msg.user ?? 'unknown',
      text: msg.text ?? '',
      rawPayload: msg as unknown as Record<string, unknown>,
      source: 'slack_backfill',
      sentAt: new Date(Number(msg.ts) * 1000),
    });
  }

  // Enqueue summary after backfill — issueId comes from the link
  const link = await prisma.issueThreadLink.findUnique({ where: { id: payload.linkId } });
  if (link) {
    const summaryIdempotencyKey = `summary:slack-backfill:${link.issueId}:${Date.now()}`;
    await queue.send(QueueNames.SUMMARY_JOBS, {
      type: 'summary_job',
      id: uuidv4(),
      workspaceId,
      idempotencyKey: summaryIdempotencyKey,
      timestamp: new Date().toISOString(),
      payload: {
        issueId: link.issueId,
        triggerReason: TriggerReason.BACKFILL_COMPLETE,
        force: true,
      },
    });
  }

  console.log(`[backfill-jobs] Slack backfill complete for thread ${thread.id}`);
}
