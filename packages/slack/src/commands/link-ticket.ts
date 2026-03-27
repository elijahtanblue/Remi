import type { App } from '@slack/bolt';
import { v4 as uuidv4 } from 'uuid';
import { QueueNames } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import {
  prisma,
  upsertSlackThread,
  upsertIssue,
  findIssueThreadLink,
  createIssueThreadLink,
  createAuditLog,
} from '@remi/db';

const ISSUE_KEY_RE = /^[A-Z]+-\d+$/;

export function registerLinkTicketCommand(app: App, queue: IQueueProducer): void {
  app.command('/link-ticket', async ({ command, ack, respond, context, logger }) => {
    await ack();

    // 1. Parse and validate issue key
    const issueKey = command.text.trim().toUpperCase();
    if (!ISSUE_KEY_RE.test(issueKey)) {
      await respond({
        response_type: 'ephemeral',
        text: `Invalid issue key: *${issueKey || '(empty)'}*. Expected format: \`PROJECT-123\``,
      });
      return;
    }

    // 2. Ensure command is run inside a thread
    if (!command.thread_ts) {
      await respond({
        response_type: 'ephemeral',
        text: 'Run this command inside a thread, not in the main channel.',
      });
      return;
    }

    // 3. Resolve workspaceId from middleware context
    const workspaceId: string = (context as Record<string, unknown>).workspaceId as string;
    const teamId = command.team_id;

    try {
      // 4. Resolve Slack user → Remi User.id (nullable FK — null if user not yet in DB)
      const slackUser = await prisma.slackUser.findUnique({
        where: { slackUserId_slackTeamId: { slackUserId: command.user_id, slackTeamId: teamId } },
      });
      const linkedByUserId = slackUser?.userId ?? null;

      // 5. Upsert SlackThread
      const thread = await upsertSlackThread(prisma, {
        workspaceId,
        slackTeamId: teamId,
        channelId: command.channel_id,
        threadTs: command.thread_ts,
      });

      // 6. Upsert placeholder Issue
      const issue = await upsertIssue(prisma, {
        workspaceId,
        jiraIssueId: issueKey,
        jiraIssueKey: issueKey,
        jiraSiteUrl: 'pending',
        title: issueKey,
        status: 'Unknown',
      });

      // 7. Check if already linked, then create IssueThreadLink
      const existingLink = await findIssueThreadLink(prisma, issue.id, thread.id);
      if (existingLink) {
        await respond({
          response_type: 'ephemeral',
          text: `Already linked *${issueKey}* to this thread.`,
        });
        return;
      }

      const link = await createIssueThreadLink(prisma, {
        issueId: issue.id,
        threadId: thread.id,
        linkedByUserId: linkedByUserId ?? undefined,
      });

      // 8. Enqueue both backfill jobs — Jira changelog + Slack thread history
      const jiraBackfillKey = uuidv4();
      await queue.send(QueueNames.BACKFILL_JOBS, {
        id: jiraBackfillKey,
        idempotencyKey: jiraBackfillKey,
        workspaceId,
        timestamp: new Date().toISOString(),
        type: 'backfill_job',
        payload: {
          kind: 'jira_issue_backfill',
          issueId: issue.id,
          threadId: thread.id,
          linkId: link.id,
        },
      });

      const slackBackfillKey = uuidv4();
      await queue.send(QueueNames.BACKFILL_JOBS, {
        id: slackBackfillKey,
        idempotencyKey: slackBackfillKey,
        workspaceId,
        timestamp: new Date().toISOString(),
        type: 'backfill_job',
        payload: {
          kind: 'slack_thread_backfill',
          issueId: issue.id,
          threadId: thread.id,
          linkId: link.id,
        },
      });

      // 9. Write AuditLog
      await createAuditLog(prisma, {
        workspaceId,
        action: 'issue_thread_linked',
        actorType: 'slack_user',
        actorId: command.user_id,
        targetType: 'issue_thread_link',
        targetId: link.id,
        metadata: {
          issueKey,
          channelId: command.channel_id,
          threadTs: command.thread_ts,
          slackTeamId: teamId,
        },
      });

      // 10. Respond ephemerally
      await respond({
        response_type: 'ephemeral',
        text: `Linked *${issueKey}* to this thread. Fetching issue details...`,
      });
    } catch (err) {
      logger.error(err);
      await respond({
        response_type: 'ephemeral',
        text: 'Something went wrong while linking the issue. Please try again.',
      });
    }
  });
}
