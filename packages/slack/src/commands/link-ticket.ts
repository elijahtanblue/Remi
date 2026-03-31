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
  createProductEvent,
} from '@remi/db';
import { JiraClient } from '@remi/jira';

const ISSUE_KEY_RE = /^[A-Z]+-\d+$/;

// Parses a Slack mention token from slash command text.
// Slack sends @mentions as <@U12345> or <@U12345|displayname>.
// Also handles plain @username if the user types it without autocomplete.
function parseMention(token: string): { slackUserId: string | null; displayName: string | null } {
  if (!token) return { slackUserId: null, displayName: null };

  // Slack autocomplete format: <@U12345> or <@U12345|firstname.lastname>
  const slackMentionMatch = token.match(/^<@([A-Z0-9]+)(?:\|([^>]+))?>$/);
  if (slackMentionMatch) {
    return {
      slackUserId: slackMentionMatch[1],
      displayName: slackMentionMatch[2] ?? null,
    };
  }

  // Plain @username typed without autocomplete
  if (token.startsWith('@')) {
    return { slackUserId: null, displayName: token.slice(1) };
  }

  return { slackUserId: null, displayName: null };
}

export function registerLinkTicketCommand(app: App, queue: IQueueProducer): void {
  app.command('/link-ticket', async ({ command, ack, respond, client, context, logger }) => {
    await ack();

    // 1. Parse command text: /link-ticket ISSUE-KEY [@assignee]
    const parts = command.text.trim().split(/\s+/);
    const issueKey = (parts[0] ?? '').toUpperCase();
    const mentionToken = parts[1] ?? '';

    if (!ISSUE_KEY_RE.test(issueKey)) {
      await respond({
        response_type: 'ephemeral',
        text: `Invalid issue key: *${issueKey || '(empty)'}*. Expected format: \`PROJECT-123\`\nUsage: \`/link-ticket PROJECT-123\` or \`/link-ticket PROJECT-123 @username\``,
      });
      return;
    }

    // 2. Parse optional assignee mention
    const { slackUserId: mentionedUserId, displayName: mentionedName } = parseMention(mentionToken);

    // 3. Resolve workspaceId from middleware context
    const workspaceId: string = (context as Record<string, unknown>).workspaceId as string;
    const teamId = command.team_id;

    // thread_ts is present when used inside a thread reply box.
    // When used from a main channel or DM (no thread_ts), use 'channel' as a
    // synthetic anchor so the whole channel conversation is tracked.
    const threadTs = command.thread_ts ?? 'channel';
    const isChannelLevel = !command.thread_ts;

    try {
      // 4. If a Slack user ID was mentioned, look up their real display name and email
      let assigneeName: string | null = mentionedName;
      let mentionedUserEmail: string | null = null;
      if (mentionedUserId) {
        try {
          const userInfo = await client.users.info({ user: mentionedUserId });
          if (!assigneeName) {
            assigneeName =
              userInfo.user?.profile?.display_name ||
              userInfo.user?.profile?.real_name ||
              userInfo.user?.name ||
              null;
          }
          mentionedUserEmail = userInfo.user?.profile?.email ?? null;
        } catch {
          // Non-fatal — proceed without resolved name/email
        }
      }

      // 4a. Resolve Jira account ID so we can write the assignee back to Jira
      let jiraAccountId: string | null = null;
      let jiraWriteClient: JiraClient | null = null;
      if (assigneeName) {
        const jiraInstall = await prisma.jiraWorkspaceInstall.findFirst({ where: { workspaceId } });
        if (jiraInstall) {
          jiraWriteClient = new JiraClient(jiraInstall.jiraSiteUrl, jiraInstall.sharedSecret);
          try {
            const query = mentionedUserEmail ?? assigneeName;
            const matches = await jiraWriteClient.searchUsersByQuery(query);
            if (mentionedUserEmail) {
              const exact = matches.find(
                (u) => u.emailAddress?.toLowerCase() === mentionedUserEmail!.toLowerCase(),
              );
              jiraAccountId = (exact ?? matches[0])?.accountId ?? null;
            } else {
              jiraAccountId = matches[0]?.accountId ?? null;
            }
          } catch {
            // Non-fatal — skip Jira write if user lookup fails
          }
        }
      }

      // 5. Resolve Slack user → Remi User.id (nullable FK)
      const slackUser = await prisma.slackUser.findUnique({
        where: { slackUserId_slackTeamId: { slackUserId: command.user_id, slackTeamId: teamId } },
      });
      const linkedByUserId = slackUser?.userId ?? null;

      // 6. Upsert SlackThread
      const thread = await upsertSlackThread(prisma, {
        workspaceId,
        slackTeamId: teamId,
        channelId: command.channel_id,
        threadTs,
        isChannelLevel,
      });

      // 7. Upsert placeholder Issue — include Slack-specified assignee if provided
      const issue = await upsertIssue(prisma, {
        workspaceId,
        jiraIssueId: issueKey,
        jiraIssueKey: issueKey,
        jiraSiteUrl: 'pending',
        title: issueKey,
        status: 'Unknown',
        ...(assigneeName ? { assigneeDisplayName: assigneeName } : {}),
      });

      // 8. Check for existing link — if already linked but an assignee was provided,
      // update the assignee instead of rejecting.
      const existingLink = await findIssueThreadLink(prisma, issue.id, thread.id);
      if (existingLink) {
        if (assigneeName) {
          await prisma.issue.update({
            where: { id: issue.id },
            data: {
              assigneeDisplayName: assigneeName,
              ...(jiraAccountId ? { assigneeJiraAccountId: jiraAccountId } : {}),
            },
          });

          // Write assignee to Jira
          if (jiraWriteClient && jiraAccountId) {
            try {
              await jiraWriteClient.updateAssignee(issueKey, jiraAccountId);
            } catch {
              // Non-fatal — local DB already updated
            }
          }

          // Re-trigger Jira backfill so title/status/assignee refresh and
          // the summary regenerates with accurate data.
          const refreshKey = uuidv4();
          await queue.send(QueueNames.BACKFILL_JOBS, {
            id: refreshKey,
            idempotencyKey: refreshKey,
            workspaceId,
            timestamp: new Date().toISOString(),
            type: 'backfill_job',
            payload: {
              kind: 'jira_issue_backfill',
              issueId: issue.id,
              threadId: thread.id,
              linkId: existingLink.id,
            },
          });

          await respond({
            response_type: 'ephemeral',
            text: `Updated assignee for *${issueKey}* to *${assigneeName}*. Refreshing issue data...`,
          });
        } else {
          // Look up who originally linked this ticket so we can name them.
          let linkedByLabel = '';
          if (existingLink.linkedByUserId) {
            try {
              const linkedBySlackUser = await prisma.slackUser.findFirst({
                where: { userId: existingLink.linkedByUserId, slackTeamId: teamId },
              });
              const name = linkedBySlackUser?.slackRealName || linkedBySlackUser?.slackUsername;
              if (name) linkedByLabel = ` by *@${name}*`;
            } catch {
              // Non-fatal
            }
          }
          const locationLabel = isChannelLevel ? 'channel' : 'thread';
          await respond({
            response_type: 'ephemeral',
            text: `Already linked *${issueKey}* to this ${locationLabel}${linkedByLabel}. To update the assignee, use \`/link-ticket ${issueKey} @username\`.`,
          });
        }
        return;
      }

      const link = await createIssueThreadLink(prisma, {
        issueId: issue.id,
        threadId: thread.id,
        linkedByUserId: linkedByUserId ?? undefined,
      });

      // Write assignee to Jira for new links with an assignee specified
      if (jiraWriteClient && jiraAccountId) {
        try {
          await jiraWriteClient.updateAssignee(issueKey, jiraAccountId);
          await prisma.issue.update({
            where: { id: issue.id },
            data: { assigneeJiraAccountId: jiraAccountId },
          });
        } catch {
          // Non-fatal — backfill will still run and sync from Jira
        }
      }

      // 9. Enqueue backfill jobs — Jira changelog + Slack thread history
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

      // 10. Write AuditLog
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
          threadTs,
          slackTeamId: teamId,
          ...(assigneeName ? { assignedTo: assigneeName } : {}),
          ...(mentionedUserId ? { assignedSlackUserId: mentionedUserId } : {}),
        },
      });

      void createProductEvent(prisma, {
        workspaceId,
        event: 'link_ticket_used',
        actorId: command.user_id,
        properties: {
          issueKey,
          channelId: command.channel_id,
          isChannelLevel,
          hasAssignee: !!assigneeName,
        },
      }).catch((err) => logger.warn({ err, issueKey }, 'Failed to record product event'));

      // 11. Confirm
      const locationLabel = isChannelLevel ? 'channel' : 'thread';
      const assigneeLabel = assigneeName ? ` — assigned to *${assigneeName}*` : '';
      await respond({
        response_type: 'ephemeral',
        text: `Linked *${issueKey}* to this ${locationLabel}${assigneeLabel}. Fetching issue details...`,
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
