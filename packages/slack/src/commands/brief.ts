import type { App } from '@slack/bolt';
import { v4 as uuidv4 } from 'uuid';
import { QueueNames } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import { prisma, findIssueByKey, createProductEvent, getMemoryConfig, getLatestSnapshot } from '@remi/db';
import { generateSummary } from '@remi/summary-engine';
import { JiraClient } from '@remi/jira';
import { buildBriefBlocks } from '../views/brief-blocks.js';

const ISSUE_KEY_RE = /^[A-Z]+-\d+$/;

export function registerBriefCommand(app: App, queue: IQueueProducer): void {
  app.command('/brief', async ({ command, ack, respond, context, logger }) => {
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

      // 3. Check if Autonomous Memory is enabled for this workspace
      const memConfig = await getMemoryConfig(prisma, workspaceId);
      if (memConfig?.enabled) {
        const units = await prisma.memoryUnit.findMany({
          where: { workspaceId, issueId: issue.id },
          orderBy: { updatedAt: 'desc' },
        });

        if (units.length > 0) {
          // Fetch all snapshots across all memory units (Slack threads, email threads, etc.)
          const allSnapshots = (
            await Promise.all(units.map((u) => getLatestSnapshot(prisma, u.id)))
          ).filter((s): s is NonNullable<typeof s> => s !== null);

          if (allSnapshots.length > 0) {
            // Use the highest-confidence snapshot as the base narrative
            const base = allSnapshots.reduce((best, s) =>
              s.confidence > best.confidence ? s : best, allSnapshots[0]!
            );

            // Merge arrays across all snapshots, deduplicating by value
            const keyDecisions = [...new Set(
              allSnapshots.flatMap(s => Array.isArray(s.keyDecisions) ? (s.keyDecisions as string[]) : [])
            )];
            const blockers = [...new Set(
              allSnapshots.flatMap(s => Array.isArray(s.blockers) ? (s.blockers as string[]) : [])
            )];
            const openQuestions = [...new Set(
              allSnapshots.flatMap(s => Array.isArray(s.openQuestions) ? (s.openQuestions as string[]) : [])
            )];
            // Deduplicate open actions by description (case-insensitive)
            const seenActions = new Set<string>();
            const openActions = allSnapshots
              .flatMap(s => Array.isArray(s.openActions) ? (s.openActions as Array<{ description: string; assignee?: string }>) : [])
              .filter((a) => {
                const key = a.description.trim().toLowerCase();
                if (seenActions.has(key)) return false;
                seenActions.add(key);
                return true;
              });
            // Collect data sources across all snapshots
            const dataSources = [...new Set(
              allSnapshots.flatMap(s => Array.isArray(s.dataSources) ? (s.dataSources as string[]) : [])
            )];

            const freshness = new Date(base.freshness).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const sourceLabel = dataSources.length > 1
              ? `Sources: ${dataSources.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')} · `
              : '';

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const blocks: any[] = [
              { type: 'header', text: { type: 'plain_text', text: `${issueKey} — Memory Brief`, emoji: true } },
              { type: 'section', text: { type: 'mrkdwn', text: `*${base.headline}*\n${base.currentState}` } },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `${sourceLabel}Confidence: ${Math.round(base.confidence * 100)}% · Updated ${freshness}` }] },
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
              properties: { issueKey, unitCount: units.length, sourceCount: allSnapshots.length },
            }).catch((err) => logger.warn({ err, issueKey }, 'Failed to record product event'));
            await respond({ response_type: 'in_channel', blocks, text: `Memory brief for *${issueKey}*` });
            return;
          }
        }
      }
      // Falls through to deterministic summary path if memory is disabled or no snapshot exists

      // 4. If issue data is still placeholder (Jira backfill hasn't completed yet),
      //    trigger a Jira backfill and ask the user to check back.
      const isStale = issue.title === issue.jiraIssueKey || issue.status === 'Unknown';
      if (isStale) {
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

      // 5. Pull current state from Jira so the summary always reflects live data.
      //    Non-fatal — if Jira is unreachable we fall back to the DB cache.
      const jiraInstall = await prisma.jiraWorkspaceInstall.findFirst({ where: { workspaceId } });
      if (jiraInstall) {
        try {
          const jiraClient = new JiraClient(jiraInstall.jiraSiteUrl, jiraInstall.sharedSecret);
          const freshIssue = await jiraClient.getIssue(issueKey);
          await prisma.issue.update({
            where: { id: issue.id },
            data: {
              title: freshIssue.summary,
              status: freshIssue.status.name,
              statusCategory: freshIssue.status.statusCategory.key,
              assigneeJiraAccountId: freshIssue.assignee?.accountId ?? null,
              assigneeDisplayName: freshIssue.assignee?.displayName ?? null,
              priority: freshIssue.priority?.name ?? null,
            },
          });
        } catch (jiraErr) {
          logger.warn({ err: jiraErr, issueKey }, '[brief] Jira refresh failed, using cached issue state');
        }
      }

      // 6. Generate a fresh summary now and respond immediately
      const result = await generateSummary(prisma, issue.id, 'manual_request', { force: true });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks = buildBriefBlocks(result.summary) as any[];

      void createProductEvent(prisma, {
        workspaceId,
        event: 'brief_viewed',
        actorId: command.user_id,
        properties: { issueKey, channelId: command.channel_id },
      }).catch((err) => logger.warn({ err, issueKey }, 'Failed to record product event'));

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
