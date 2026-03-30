import type { App } from '@slack/bolt';
import { v4 as uuidv4 } from 'uuid';
import { QueueNames } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import { prisma, findIssueByKey, findCurrentSummary, createProductEvent, getMemoryConfig, getLatestSnapshot } from '@remi/db';
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

      // Check if Autonomous Memory is enabled for this workspace
      const memConfig = await getMemoryConfig(prisma, workspaceId);
      if (memConfig?.enabled) {
        const units = await prisma.memoryUnit.findMany({
          where: { workspaceId, issueId: issue.id },
          take: 1,
          orderBy: { updatedAt: 'desc' },
        });
        const unit = units[0];
        if (unit) {
          const snapshot = await getLatestSnapshot(prisma, unit.id);
          if (snapshot) {
            const freshness = new Date(snapshot.freshness).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const keyDecisions = Array.isArray(snapshot.keyDecisions) ? (snapshot.keyDecisions as string[]) : [];
            const openActions = Array.isArray(snapshot.openActions) ? (snapshot.openActions as Array<{ description: string; assignee?: string }>) : [];
            const blockers = Array.isArray(snapshot.blockers) ? (snapshot.blockers as string[]) : [];
            const openQuestions = Array.isArray(snapshot.openQuestions) ? (snapshot.openQuestions as string[]) : [];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const blocks: any[] = [
              { type: 'header', text: { type: 'plain_text', text: `${issueKey} — Memory Brief`, emoji: true } },
              { type: 'section', text: { type: 'mrkdwn', text: `*${snapshot.headline}*\n${snapshot.currentState}` } },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Confidence: ${Math.round(snapshot.confidence * 100)}% · Updated ${freshness}` }] },
            ];

            if (keyDecisions.length > 0) {
              blocks.push({ type: 'divider' });
              blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Key Decisions*\n${keyDecisions.map(d => `• ${d}`).join('\n')}` } });
            }
            if (openActions.length > 0) {
              blocks.push({ type: 'divider' });
              blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Open Actions*\n${openActions.map(a => `• ${a.description}${a.assignee ? ` _(${a.assignee})_` : ''}`).join('\n')}` } });
            }
            if (blockers.length > 0) {
              blocks.push({ type: 'divider' });
              blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Blockers*\n${blockers.map(b => `🔴 ${b}`).join('\n')}` } });
            }
            if (openQuestions.length > 0) {
              blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Open Questions*\n${openQuestions.map(q => `❓ ${q}`).join('\n')}` } });
            }

            void createProductEvent(prisma, {
              workspaceId,
              event: 'memory_brief_viewed',
              actorId: command.user_id,
              properties: { issueKey },
            }).catch((err) => logger.warn({ err, issueKey }, 'Failed to record product event'));
            await respond({ response_type: 'in_channel', blocks, text: `Memory brief for *${issueKey}*` });
            return;
          }
        }
      }
      // Falls through to existing deterministic summary path if memory is disabled or no snapshot exists

      // 3. If issue data is still placeholder (Jira backfill hasn't completed yet),
      //    trigger a Jira backfill which will enqueue a summary job automatically.
      const isStale = issue.title === issue.jiraIssueKey || issue.status === 'Unknown';
      if (isStale) {
        // Find any existing thread link for this issue to use as backfill anchor.
        const anyLink = await prisma.issueThreadLink.findFirst({
          where: { issueId: issue.id },
          include: { thread: true },
        });
        if (anyLink) {
          const backfillKey = uuidv4();
          await queue.send(QueueNames.BACKFILL_JOBS, {
            id: backfillKey,
            idempotencyKey: backfillKey,
            workspaceId,
            timestamp: new Date().toISOString(),
            type: 'backfill_job',
            payload: {
              kind: 'jira_issue_backfill',
              issueId: issue.id,
              threadId: anyLink.threadId,
              linkId: anyLink.id,
            },
          });
        }
        await respond({
          response_type: 'ephemeral',
          text: `Issue data for *${issueKey}* is still being fetched from Jira. Check back in a few seconds, then run \`/brief ${issueKey}\` again.`,
        });
        return;
      }

      // 4. If --refresh or no summary exists: enqueue summary job
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

        void createProductEvent(prisma, {
          workspaceId,
          event: forceRefresh ? 'brief_refreshed' : 'brief_requested',
          actorId: command.user_id,
          properties: { issueKey, channelId: command.channel_id },
        }).catch((err) => logger.warn({ err, issueKey }, 'Failed to record product event'));

        await respond({
          response_type: 'ephemeral',
          text: `Generating summary for *${issueKey}*... Check back shortly.`,
        });
        return;
      }

      // 4. Summary exists — format and respond with Block Kit
      // The DB summary content is stored as a JSON object; cast it to SummaryOutput
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const summaryOutput = summary.content as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks = buildBriefBlocks(summaryOutput) as any[];

      void createProductEvent(prisma, {
        workspaceId,
        event: 'brief_viewed',
        actorId: command.user_id,
        properties: { issueKey, channelId: command.channel_id },
      }).catch((err) => logger.warn({ err, issueKey }, 'Failed to record product event'));

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
