import {
  prisma,
  createIssueEvent,
  findIssueEventByIdempotencyKey,
  createSlackMessage,
  findSlackMessageByIdempotencyKey,
  upsertIssue,
  PrismaClient as _PrismaClient,
  Prisma,
} from '@remi/db';
import type { BackfillJobMessage } from '@remi/shared';
import { QueueNames, TriggerReason } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import { JiraClient } from '@remi/jira';
import { WebClient } from '@slack/web-api';
import { v4 as uuidv4 } from 'uuid';

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

  // JiraClient constructor: (baseUrl, clientKey, sharedSecret)
  const jiraClient = new JiraClient(install.jiraSiteUrl, install.jiraClientKey, install.sharedSecret);

  // Fetch changelog and create IssueEvent for each entry
  const changelog = await jiraClient.getIssueChangelog(issue.jiraIssueKey);
  for (const entry of changelog) {
    const idempotencyKey = `jira:changelog:${issue.jiraIssueId}:${entry.created}`;
    const exists = await findIssueEventByIdempotencyKey(prisma, idempotencyKey);
    if (exists) continue;

    await createIssueEvent(prisma, {
      issueId: issue.id,
      idempotencyKey,
      eventType: 'changelog_entry',
      source: 'jira_backfill',
      rawPayload: entry as unknown as Record<string, unknown>,
      occurredAt: new Date(entry.created),
    });
  }

  // Update the existing Issue row by id — avoids a duplicate row when jiraSiteUrl
  // was 'pending' (placeholder created at link time) and the real URL differs.
  const freshIssue = await jiraClient.getIssue(issue.jiraIssueKey);
  await prisma.issue.update({
    where: { id: issue.id },
    data: {
      jiraIssueId: freshIssue.id ?? issue.jiraIssueId,
      jiraSiteUrl: install.jiraSiteUrl,
      title: freshIssue.summary,
      status: freshIssue.status.name,
      statusCategory: freshIssue.status.statusCategory.key,
      assigneeJiraAccountId: freshIssue.assignee?.accountId ?? null,
      priority: freshIssue.priority?.name ?? null,
      issueType: freshIssue.issuetype.name,
      rawPayload: freshIssue as unknown as Prisma.InputJsonValue,
    },
  });

  // Enqueue summary after backfill
  const summaryIdempotencyKey = `summary:backfill:${issue.id}:${Date.now()}`;
  await queue.send(QueueNames.SUMMARY_JOBS, {
    type: 'summary_job',
    id: uuidv4(),
    workspaceId,
    idempotencyKey: summaryIdempotencyKey,
    timestamp: new Date().toISOString(),
    payload: {
      issueId: issue.id,
      triggerReason: TriggerReason.BACKFILL_COMPLETE,
      force: true,
    },
  });

  console.log(`[backfill-jobs] Jira backfill complete for issue ${issue.id}`);
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

  const repliesResult = await slackClient.conversations.replies({
    channel: thread.channelId,
    ts: thread.threadTs,
  });

  for (const msg of repliesResult.messages ?? []) {
    if (!msg.ts) continue;

    const idempotencyKey = `slack:backfill:${thread.slackTeamId}:${thread.channelId}:${msg.ts}`;
    const exists = await findSlackMessageByIdempotencyKey(prisma, idempotencyKey);
    if (exists) continue;

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
