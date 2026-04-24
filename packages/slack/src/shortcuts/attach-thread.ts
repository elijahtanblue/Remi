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

interface AttachThreadPrivateMetadata {
  channelId: string;
  threadTs: string;
}

export function registerAttachThreadShortcut(app: App, queue: IQueueProducer): void {
  // Message shortcut: opens a modal to link the message's thread to a Jira issue
  app.shortcut('attach_to_issue', async ({ shortcut, ack, client, logger }) => {
    await ack();

    try {
      // Extract channel and thread_ts from the shortcut message
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = (shortcut as any).message;
      const channelId: string = (shortcut as any).channel?.id ?? '';
      const threadTs: string = msg?.thread_ts ?? msg?.ts ?? '';

      const privateMetadata: AttachThreadPrivateMetadata = { channelId, threadTs };

      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'link_issue_modal',
          private_metadata: JSON.stringify(privateMetadata),
          title: {
            type: 'plain_text',
            text: 'Link to Jira Issue',
          },
          submit: {
            type: 'plain_text',
            text: 'Link',
          },
          close: {
            type: 'plain_text',
            text: 'Cancel',
          },
          blocks: [
            {
              type: 'input',
              block_id: 'issue_key_block',
              label: {
                type: 'plain_text',
                text: 'Jira Issue Key',
              },
              element: {
                type: 'plain_text_input',
                action_id: 'issue_key_input',
                placeholder: {
                  type: 'plain_text',
                  text: 'e.g. PROJ-123',
                },
              },
            },
          ],
        },
      });
    } catch (err) {
      logger.error(err);
    }
  });

  // View submission handler for the link_issue_modal
  app.view('link_issue_modal', async ({ ack, view, body, client, logger }) => {
    // Extract issue key from view state values
    const issueKey =
      view.state.values['issue_key_block']?.['issue_key_input']?.value?.trim().toUpperCase() ?? '';

    if (!ISSUE_KEY_RE.test(issueKey)) {
      await ack({
        response_action: 'errors',
        errors: {
          issue_key_block: `Invalid format. Expected something like PROJ-123.`,
        },
      });
      return;
    }

    // Extract private metadata
    let metadata: AttachThreadPrivateMetadata;
    try {
      metadata = JSON.parse(view.private_metadata) as AttachThreadPrivateMetadata;
    } catch {
      await ack({ response_action: 'clear' });
      return;
    }

    const { channelId, threadTs } = metadata;

    if (!threadTs) {
      await ack({
        response_action: 'errors',
        errors: {
          issue_key_block: 'Could not determine thread. Please use this shortcut on a thread message.',
        },
      });
      return;
    }

    // Acknowledge and close the modal
    await ack({ response_action: 'clear' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamId: string = (body as any).team?.id ?? '';
    const userId: string = body.user.id;

    // Resolve workspace from the Slack team install
    try {
      const install = await prisma.slackWorkspaceInstall.findUnique({
        where: { slackTeamId: teamId },
      });

      if (!install) {
        logger.error(`[attach-thread] No SlackWorkspaceInstall for teamId=${teamId}`);
        return;
      }

      const workspaceId = install.workspaceId;

      // Resolve Slack user → Remi User.id (nullable — null if not yet provisioned)
      const slackUserRecord = await prisma.slackUser.findUnique({
        where: { slackUserId_slackTeamId: { slackUserId: userId, slackTeamId: teamId } },
      });
      const linkedByUserId = slackUserRecord?.userId ?? null;

      // Upsert SlackThread
      const thread = await upsertSlackThread(prisma, {
        workspaceId,
        slackTeamId: teamId,
        channelId,
        threadTs,
      });

      // Upsert placeholder Issue
      const issue = await upsertIssue(prisma, {
        workspaceId,
        jiraIssueId: issueKey,
        jiraIssueKey: issueKey,
        jiraSiteUrl: 'pending',
        title: issueKey,
        status: 'Unknown',
      });

      // Check for existing link
      const existingLink = await findIssueThreadLink(prisma, issue.id, thread.id);
      if (existingLink) {
        // Already linked — nothing more to do
        return;
      }

      const link = await createIssueThreadLink(prisma, {
        issueId: issue.id,
        threadId: thread.id,
        linkedByUserId: linkedByUserId ?? undefined,
      });

      // Enqueue backfill job
      const idempotencyKey = uuidv4();
      await queue.send(QueueNames.BACKFILL_JOBS, {
        id: idempotencyKey,
        idempotencyKey,
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

      await queue.send(QueueNames.CWR_GENERATE, {
        id: uuidv4(),
        idempotencyKey: `cwr-generate:${issue.id}:link:${link.id}`,
        workspaceId,
        timestamp: new Date().toISOString(),
        type: 'cwr_generate',
        payload: { issueId: issue.id, triggerSource: 'link_change' },
      });

      // Write AuditLog
      await createAuditLog(prisma, {
        workspaceId,
        action: 'issue_thread_linked',
        actorType: 'slack_user',
        actorId: userId,
        targetType: 'issue_thread_link',
        targetId: link.id,
        metadata: {
          issueKey,
          channelId,
          threadTs,
          slackTeamId: teamId,
          source: 'shortcut',
        },
      });

      // Send ephemeral confirmation to the user
      await client.chat.postEphemeral({
        channel: channelId,
        thread_ts: threadTs,
        user: userId,
        text: `Linked *${issueKey}* to this thread. Fetching issue details...`,
      });
    } catch (err) {
      logger.error(err);
    }
  });
}
