import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RiskDigestMessage } from '@remi/shared';

const mockPrisma = vi.hoisted(() => ({
  slackWorkspaceInstall: {
    findMany: vi.fn(),
  },
  workflowScopeConfig: {
    findMany: vi.fn(),
  },
  currentWorkRecord: {
    findMany: vi.fn(),
  },
  scheduledJobRun: {
    deleteMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

const mockPostMessage = vi.hoisted(() => vi.fn());

vi.mock('@remi/db', () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;

      constructor(message: string, code: string) {
        super(message);
        this.code = code;
      }
    },
  },
  prisma: mockPrisma,
}));

import { handleRiskDigestJob } from '../../apps/worker/src/handlers/risk-digest.js';

function makeMessage(): RiskDigestMessage {
  return {
    id: 'risk-1',
    idempotencyKey: 'risk-1',
    workspaceId: 'system',
    timestamp: new Date().toISOString(),
    type: 'risk_digest',
    payload: { cadence: 'weekly' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.scheduledJobRun.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.scheduledJobRun.create.mockResolvedValue({ id: 'run-1' });
  mockPrisma.scheduledJobRun.update.mockResolvedValue({ id: 'run-1' });
});

const testDeps = {
  createSlackClient: () => ({
    chat: {
      postMessage: mockPostMessage,
    },
  } as any),
};

describe('handleRiskDigestJob', () => {
  it('posts a grouped digest to the first configured Slack channel with at most 10 issues', async () => {
    mockPrisma.slackWorkspaceInstall.findMany.mockResolvedValue([
      { workspaceId: 'ws1', botToken: 'xoxb-1' },
    ]);
    mockPrisma.workflowScopeConfig.findMany.mockResolvedValue([
      { includedChannelIds: ['C-RISK'] },
    ]);
    mockPrisma.currentWorkRecord.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, index) => ({
        currentState: `Issue state ${index + 1}`,
        riskScore: 0.9 - index * 0.01,
        isStale: index % 2 === 0,
        issue: {
          jiraIssueKey: `PROJ-${index + 1}`,
          title: `Risk item ${index + 1}`,
          scope: { name: index < 6 ? 'Payments' : 'Support' },
        },
      })),
    );

    await handleRiskDigestJob(makeMessage(), testDeps);

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    expect(mockPrisma.scheduledJobRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobName: 'risk_digest_send',
        periodKey: expect.stringContaining('risk-1:ws1'),
        status: 'reserved',
      }),
    });
    expect(mockPrisma.scheduledJobRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'sent' }),
    }));
    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'C-RISK',
      text: 'Weekly risk digest: 10 at-risk issues',
      blocks: expect.arrayContaining([
        expect.objectContaining({
          type: 'header',
          text: expect.objectContaining({ text: 'Weekly Risk Digest' }),
        }),
        expect.objectContaining({
          type: 'section',
          text: expect.objectContaining({
            text: expect.stringContaining('*Payments*'),
          }),
        }),
        expect.objectContaining({
          type: 'section',
          text: expect.objectContaining({
            text: expect.stringContaining('*Support*'),
          }),
        }),
      ]),
    }));
    const payload = mockPostMessage.mock.calls[0]?.[0] as { blocks: Array<{ text?: { text?: string } }> };
    const combinedText = payload.blocks
      .map((block) => block.text?.text ?? '')
      .join('\n');
    expect(combinedText).toContain('PROJ-1');
    expect(combinedText).not.toContain('PROJ-10');
  });

  it('skips posting when no workflow config channel is available', async () => {
    mockPrisma.slackWorkspaceInstall.findMany.mockResolvedValue([
      { workspaceId: 'ws1', botToken: 'xoxb-1' },
    ]);
    mockPrisma.workflowScopeConfig.findMany.mockResolvedValue([
      { includedChannelIds: [] },
    ]);
    mockPrisma.currentWorkRecord.findMany.mockResolvedValue([
      {
        currentState: 'Blocked',
        riskScore: 0.8,
        isStale: true,
        issue: {
          jiraIssueKey: 'PROJ-1',
          title: 'Risk item 1',
          scope: { name: 'Payments' },
        },
      },
    ]);

    await handleRiskDigestJob(makeMessage(), testDeps);

    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('throws and releases the workspace reservation when Slack posting fails', async () => {
    mockPrisma.slackWorkspaceInstall.findMany.mockResolvedValue([
      { workspaceId: 'ws1', botToken: 'xoxb-1' },
    ]);
    mockPrisma.workflowScopeConfig.findMany.mockResolvedValue([
      { includedChannelIds: ['C-RISK'] },
    ]);
    mockPrisma.currentWorkRecord.findMany.mockResolvedValue([
      {
        currentState: 'Blocked',
        riskScore: 0.8,
        isStale: true,
        issue: {
          jiraIssueKey: 'PROJ-1',
          title: 'Risk item 1',
          scope: { name: 'Payments' },
        },
      },
    ]);
    mockPostMessage.mockRejectedValueOnce(new Error('rate_limited'));

    await expect(handleRiskDigestJob(makeMessage(), testDeps)).rejects.toThrow(
      'Risk digest failed for workspace(s): ws1',
    );

    expect(mockPrisma.scheduledJobRun.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        jobName: 'risk_digest_send',
        periodKey: 'risk-1:ws1',
        status: 'reserved',
      }),
    }));
  });
});
