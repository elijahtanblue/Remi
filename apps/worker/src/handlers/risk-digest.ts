import type { RiskDigestMessage } from '@remi/shared';
import { Prisma, prisma } from '@remi/db';
import { WebClient } from '@slack/web-api';

type DigestIssue = {
  issueKey: string;
  title: string;
  currentState: string;
  scopeName: string;
  riskScore: number;
  isStale: boolean;
};

const SLACK_SECTION_TEXT_LIMIT = 2900;
const STALE_RESERVATION_MS = 30 * 60 * 1000;

function issuePriority(a: DigestIssue, b: DigestIssue) {
  if (a.isStale !== b.isStale) return Number(b.isStale) - Number(a.isStale);
  if (a.riskScore !== b.riskScore) return b.riskScore - a.riskScore;
  return a.issueKey.localeCompare(b.issueKey);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function escapeSlackText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatIssue(issue: DigestIssue): string {
  const labels = [`${Math.round(issue.riskScore * 100)}% risk`];
  if (issue.isStale) labels.push('stale');

  return [
    `*${escapeSlackText(truncate(issue.issueKey, 32))}* - ${escapeSlackText(truncate(issue.title, 90))}`,
    `  ${labels.join(' | ')}`,
    `  ${escapeSlackText(truncate(issue.currentState, 140))}`,
  ].join('\n');
}

function buildRiskDigestBlocks(issues: DigestIssue[]) {
  const groups = new Map<string, DigestIssue[]>();

  for (const issue of issues) {
    const scopedIssues = groups.get(issue.scopeName) ?? [];
    scopedIssues.push(issue);
    groups.set(issue.scopeName, scopedIssues);
  }

  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Weekly Risk Digest', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Top ${issues.length} at-risk issue${issues.length === 1 ? '' : 's'} across ${groups.size} scope${groups.size === 1 ? '' : 's'}.`,
      },
    },
  ];

  for (const [scopeName, scopedIssues] of groups) {
    const sectionText = [
      `*${escapeSlackText(truncate(scopeName, 80))}*`,
      ...scopedIssues.map(formatIssue),
    ].join('\n');

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: truncate(sectionText, SLACK_SECTION_TEXT_LIMIT),
      },
    });
  }

  return blocks;
}

export type RiskDigestDependencies = {
  createSlackClient?: (botToken: string) => Pick<WebClient, 'chat'>;
};

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

async function reserveWorkspaceDigest(periodKey: string, workspaceId: string): Promise<boolean> {
  const runPeriodKey = `${periodKey}:${workspaceId}`;
  const staleBefore = new Date(Date.now() - STALE_RESERVATION_MS);

  await prisma.scheduledJobRun.deleteMany({
    where: {
      jobName: 'risk_digest_send',
      periodKey: runPeriodKey,
      status: 'reserved',
      createdAt: { lt: staleBefore },
    },
  });

  try {
    await prisma.scheduledJobRun.create({
      data: {
        jobName: 'risk_digest_send',
        periodKey: runPeriodKey,
        status: 'reserved',
      },
    });
    return true;
  } catch (err) {
    if (isUniqueConstraintError(err)) return false;
    throw err;
  }
}

async function markWorkspaceDigestSent(periodKey: string, workspaceId: string): Promise<void> {
  await prisma.scheduledJobRun.update({
    where: {
      jobName_periodKey: {
        jobName: 'risk_digest_send',
        periodKey: `${periodKey}:${workspaceId}`,
      },
    },
    data: {
      status: 'sent',
      enqueuedAt: new Date(),
    },
  });
}

async function releaseWorkspaceDigestReservation(periodKey: string, workspaceId: string): Promise<void> {
  await prisma.scheduledJobRun.deleteMany({
    where: {
      jobName: 'risk_digest_send',
      periodKey: `${periodKey}:${workspaceId}`,
      status: 'reserved',
    },
  });
}

export async function handleRiskDigestJob(
  message: RiskDigestMessage,
  dependencies: RiskDigestDependencies = {},
): Promise<void> {
  const createSlackClient = dependencies.createSlackClient ?? ((botToken: string) => new WebClient(botToken));
  const periodKey = message.payload.periodKey ?? message.idempotencyKey;
  const installs = await prisma.slackWorkspaceInstall.findMany({
    where: { uninstalledAt: null },
    select: { workspaceId: true, botToken: true },
  });

  const failures: string[] = [];

  for (const install of installs) {
    let reserved = false;
    let posted = false;

    try {
      const configs = await prisma.workflowScopeConfig.findMany({
        where: { workspaceId: install.workspaceId },
        orderBy: { createdAt: 'asc' },
        select: { includedChannelIds: true },
      });

      const channelId = configs.find((config) => config.includedChannelIds.length > 0)?.includedChannelIds[0];
      if (!channelId) continue;

      const cwrs = await prisma.currentWorkRecord.findMany({
        where: {
          workspaceId: install.workspaceId,
          OR: [
            { isStale: true },
            { riskScore: { gte: 0.7 } },
          ],
        },
        include: {
          issue: {
            select: {
              jiraIssueKey: true,
              title: true,
              scope: { select: { name: true } },
            },
          },
        },
        orderBy: [
          { isStale: 'desc' },
          { riskScore: 'desc' },
          { issue: { jiraIssueKey: 'asc' } },
        ],
        take: 10,
      });

      const topIssues = cwrs
        .map((cwr) => ({
          issueKey: cwr.issue.jiraIssueKey,
          title: cwr.issue.title,
          currentState: cwr.currentState,
          scopeName: cwr.issue.scope?.name ?? 'Unscoped',
          riskScore: cwr.riskScore,
          isStale: cwr.isStale,
        }))
        .sort(issuePriority)
        .slice(0, 10);

      if (topIssues.length === 0) continue;

      reserved = await reserveWorkspaceDigest(periodKey, install.workspaceId);
      if (!reserved) continue;

      const slackClient = createSlackClient(install.botToken);
      await slackClient.chat.postMessage({
        channel: channelId,
        text: `Weekly risk digest: ${topIssues.length} at-risk issues`,
        blocks: buildRiskDigestBlocks(topIssues),
      });
      posted = true;
      await markWorkspaceDigestSent(periodKey, install.workspaceId);
    } catch (err) {
      console.warn(`[risk-digest] Failed for workspace ${install.workspaceId}`, err);
      if (reserved && !posted) {
        await releaseWorkspaceDigestReservation(periodKey, install.workspaceId);
      }
      if (!posted) {
        failures.push(install.workspaceId);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Risk digest failed for workspace(s): ${failures.join(', ')}`);
  }
}
