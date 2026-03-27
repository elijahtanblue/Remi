import type { App } from '@slack/bolt';
import { v4 as uuidv4 } from 'uuid';
import { QueueNames } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import { prisma, findIssueByKey, findCurrentSummary } from '@remi/db';
import { buildBriefBlocks } from '../views/brief-blocks.js';

const ISSUE_KEY_RE = /^[A-Z]+-\d+$/;

export function registerBriefCommand(app: App, queue: IQueueProducer): void {
  app.command('/brief', async ({ command, ack, respond, context, logger }) => {
    await ack();

    // 1. Parse and validate issue key (strip --refresh flag first)
    const forceRefresh = command.text.includes('--refresh');
    const issueKey = command.text
      .replace('--refresh', '')
      .trim()
      .toUpperCase();

    if (!ISSUE_KEY_RE.test(issueKey)) {
      await respond({
        response_type: 'ephemeral',
        text: `Invalid issue key: *${issueKey || '(empty)'}*. Expected format: \`PROJECT-123\``,
      });
      return;
    }

    const workspaceId: string = (context as Record<string, unknown>).workspaceId as string;

    try {
      // 2. Look up Issue in DB
      const issue = await findIssueByKey(prisma, workspaceId, issueKey);
      if (!issue) {
        await respond({
          response_type: 'ephemeral',
          text: `Issue *${issueKey}* is not linked in Remi. Use \`/link-ticket ${issueKey}\` in a thread first.`,
        });
        return;
      }

      // Find current summary
      const summary = await findCurrentSummary(prisma, issue.id);

      // 3. If --refresh or no summary exists: enqueue summary job
      if (forceRefresh || !summary) {
        const idempotencyKey = uuidv4();
        await queue.send(QueueNames.SUMMARY_JOBS, {
          id: idempotencyKey,
          idempotencyKey,
          workspaceId,
          timestamp: new Date().toISOString(),
          type: 'summary_job',
          payload: {
            issueId: issue.id,
            triggerReason: 'manual_request',
            force: forceRefresh,
          },
        });

        await respond({
          response_type: 'ephemeral',
          text: `Refreshing summary for *${issueKey}*... Check back shortly.`,
        });
        return;
      }

      // 4. Summary exists — format and respond with Block Kit
      // The DB summary content is stored as a JSON object; cast it to SummaryOutput
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const summaryOutput = summary.content as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks = buildBriefBlocks(summaryOutput) as any[];

      // 5. Respond in-channel with the summary
      await respond({
        response_type: 'in_channel',
        blocks,
        text: `Summary for *${issueKey}*`,
      });
    } catch (err) {
      logger.error(err);
      await respond({
        response_type: 'ephemeral',
        text: 'Something went wrong while fetching the brief. Please try again.',
      });
    }
  });
}
