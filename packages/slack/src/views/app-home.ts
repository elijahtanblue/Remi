import type { App } from '@slack/bolt';
import { prisma } from '@remi/db';

export function registerAppHome(app: App): void {
  app.event('app_home_opened', async ({ event, client, context, logger }) => {
    const workspaceId: string = (context as Record<string, unknown>).workspaceId as string;
    const userId = event.user;

    try {
      // Query last 10 active IssueThreadLinks for this workspace, including issue data
      const recentLinks = await prisma.issueThreadLink.findMany({
        where: {
          unlinkedAt: null,
          issue: { workspaceId },
        },
        take: 10,
        orderBy: { linkedAt: 'desc' },
        include: {
          issue: {
            select: {
              jiraIssueKey: true,
              title: true,
              status: true,
            },
          },
        },
      });

      // Query last 5 summaries for this workspace
      const recentSummaries = await prisma.summary.findMany({
        where: { issue: { workspaceId } },
        take: 5,
        orderBy: { generatedAt: 'desc' },
        include: {
          issue: {
            select: { jiraIssueKey: true },
          },
        },
      });

      // Build linked issues section blocks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linkedIssueBlocks: any[] = recentLinks.length > 0
        ? recentLinks.map((link) => {
            const linkedAt = new Date(link.linkedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            return {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${link.issue.jiraIssueKey}* — ${link.issue.title ?? '(no title)'}\nStatus: \`${link.issue.status ?? 'Unknown'}\` · Linked on ${linkedAt}`,
              },
            };
          })
        : [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '_No linked issues yet._',
              },
            },
          ];

      // Build summaries section blocks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const summaryBlocks: any[] = recentSummaries.length > 0
        ? recentSummaries.map((s) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const output = s.content as any;
            const nextStep: string = output?.recommendedNextStep ?? '';
            const generatedAt = new Date(s.generatedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            return {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${s.issue.jiraIssueKey}* · ${nextStep ? nextStep + ' · ' : ''}Generated ${generatedAt}`,
              },
            };
          })
        : [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '_No summaries generated yet._',
              },
            },
          ];

      await client.views.publish({
        user_id: userId,
        view: {
          type: 'home',
          blocks: [
            // Header
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: 'Remi — Your operational memory',
                emoji: true,
              },
            },
            { type: 'divider' },

            // Recent linked issues
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Recent Linked Issues*',
              },
            },
            ...linkedIssueBlocks,
            { type: 'divider' },

            // Recent summaries
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Recent Summaries*',
              },
            },
            ...summaryBlocks,
            { type: 'divider' },

            // Footer
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: 'Use `/link-ticket ISSUE-KEY` in any thread to link it',
                },
              ],
            },
          ],
        },
      });
    } catch (err) {
      logger.error(err);
    }
  });
}
