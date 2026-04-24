import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CWRGenerateMessage } from '@remi/shared';

const mockPrisma = vi.hoisted(() => ({
  memoryUnit: { findMany: vi.fn() },
  memorySnapshot: { findFirst: vi.fn() },
  issue: { findUnique: vi.fn() },
  currentWorkRecord: { findUnique: vi.fn(), upsert: vi.fn() },
  meaningfulEvent: { createMany: vi.fn() },
  productEvent: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@remi/db', () => ({
  prisma: mockPrisma,
}));

const mockComputeSnapshotSetHash = vi.fn();
const mockCreateOpenAiClient = vi.fn();
const mockRunCwrSynthesis = vi.fn();
const mockDiffCwr = vi.fn();

import { prisma } from '@remi/db';
import { handleCwrGenerate } from '../../apps/worker/src/handlers/cwr-generate.js';

function makeMessage(triggerSource = 'stage2_complete'): CWRGenerateMessage {
  return {
    id: 'm1',
    idempotencyKey: 'k1',
    workspaceId: 'ws1',
    timestamp: new Date().toISOString(),
    type: 'cwr_generate',
    payload: { issueId: 'i1', triggerSource: triggerSource as any },
  };
}

function mockIssue() {
  vi.mocked(prisma.issue.findUnique).mockResolvedValue({
    id: 'i1',
    workspaceId: 'ws1',
    jiraIssueKey: 'PROJ-1',
    status: 'Open',
    assigneeJiraAccountId: null,
    assigneeDisplayName: null,
    priority: null,
  } as any);
}

function cwrDeps() {
  return {
    computeSnapshotSetHash: mockComputeSnapshotSetHash,
    createOpenAiClient: mockCreateOpenAiClient,
    runCwrSynthesis: mockRunCwrSynthesis,
    diffCwr: mockDiffCwr,
  } as any;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockComputeSnapshotSetHash.mockReturnValue('hash123');
  mockCreateOpenAiClient.mockReturnValue({ complete: vi.fn() });
  mockDiffCwr.mockReturnValue([]);
  process.env.OPENAI_API_KEY = 'test-key';
});

describe('handleCwrGenerate', () => {
  it('skips when issue not found', async () => {
    vi.mocked(prisma.issue.findUnique).mockResolvedValue(null);

    await handleCwrGenerate(makeMessage(), cwrDeps());

    expect(mockRunCwrSynthesis).not.toHaveBeenCalled();
  });

  it('skips when snapshotSetHash is unchanged and trigger is not stale_sweep', async () => {
    mockIssue();
    vi.mocked(prisma.memoryUnit.findMany).mockResolvedValue([]);
    mockComputeSnapshotSetHash.mockReturnValue('same-hash');
    vi.mocked(prisma.currentWorkRecord.findUnique).mockResolvedValue({
      snapshotSetHash: 'same-hash',
    } as any);

    await handleCwrGenerate(makeMessage('stage2_complete'), cwrDeps());

    expect(mockRunCwrSynthesis).not.toHaveBeenCalled();
  });

  it('calls runCwrSynthesis when hash changed', async () => {
    mockIssue();
    vi.mocked(prisma.memoryUnit.findMany).mockResolvedValue([]);
    mockComputeSnapshotSetHash.mockReturnValue('new-hash');
    vi.mocked(prisma.currentWorkRecord.findUnique).mockResolvedValue({
      id: 'cwr1',
      snapshotSetHash: 'old-hash',
      isStale: false,
      blockerSummary: null,
      ownerExternalId: null,
      waitingOnType: null,
      waitingOnDescription: null,
      nextStep: null,
      lastJiraStatus: null,
    } as any);
    mockRunCwrSynthesis.mockResolvedValue({
      currentState: 'In progress',
      ownerDisplayName: null,
      ownerExternalId: null,
      ownerSource: null,
      blockerSummary: null,
      waitingOnType: null,
      waitingOnDescription: null,
      openQuestions: [],
      nextStep: null,
      riskScore: 0.2,
      urgencyReason: null,
      isStale: false,
      confidence: 0.8,
      dataSources: ['jira'],
    });
    vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(prisma));
    vi.mocked(prisma.currentWorkRecord.upsert).mockResolvedValue({ id: 'cwr1' } as any);
    vi.mocked(prisma.productEvent.create).mockResolvedValue({} as any);

    await handleCwrGenerate(makeMessage('stage2_complete'), cwrDeps());

    expect(mockRunCwrSynthesis).toHaveBeenCalled();
  });

  it('bypasses hash check for stale_sweep trigger', async () => {
    mockIssue();
    vi.mocked(prisma.memoryUnit.findMany).mockResolvedValue([]);
    mockComputeSnapshotSetHash.mockReturnValue('same-hash');
    vi.mocked(prisma.currentWorkRecord.findUnique).mockResolvedValue({
      id: 'cwr1',
      snapshotSetHash: 'same-hash',
      isStale: false,
      blockerSummary: null,
      ownerExternalId: null,
      waitingOnType: null,
      waitingOnDescription: null,
      nextStep: null,
      lastJiraStatus: null,
    } as any);
    mockRunCwrSynthesis.mockResolvedValue({
      currentState: 'In progress',
      ownerDisplayName: null,
      ownerExternalId: null,
      ownerSource: null,
      blockerSummary: null,
      waitingOnType: null,
      waitingOnDescription: null,
      openQuestions: [],
      nextStep: null,
      riskScore: 0.2,
      urgencyReason: null,
      isStale: true,
      confidence: 0.8,
      dataSources: [],
    });
    vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(prisma));
    vi.mocked(prisma.currentWorkRecord.upsert).mockResolvedValue({ id: 'cwr1' } as any);
    vi.mocked(prisma.productEvent.create).mockResolvedValue({} as any);

    await handleCwrGenerate(makeMessage('stale_sweep'), cwrDeps());

    expect(mockRunCwrSynthesis).toHaveBeenCalled();
  });

  it('bypasses hash check for link_change trigger', async () => {
    mockIssue();
    mockComputeSnapshotSetHash.mockReturnValue('same-hash');
    vi.mocked(prisma.memoryUnit.findMany).mockResolvedValue([]);
    vi.mocked(prisma.currentWorkRecord.findUnique).mockResolvedValue({
      id: 'cwr1',
      snapshotSetHash: 'same-hash',
      isStale: false,
      blockerSummary: null,
      ownerExternalId: null,
      waitingOnType: null,
      waitingOnDescription: null,
      nextStep: null,
      lastJiraStatus: null,
    } as any);
    mockRunCwrSynthesis.mockResolvedValue({
      currentState: 'In progress',
      ownerDisplayName: null,
      ownerExternalId: null,
      ownerSource: null,
      blockerSummary: null,
      waitingOnType: null,
      waitingOnDescription: null,
      openQuestions: [],
      nextStep: null,
      riskScore: 0.2,
      urgencyReason: null,
      isStale: false,
      confidence: 0.8,
      dataSources: ['slack'],
    });
    vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(prisma));
    vi.mocked(prisma.currentWorkRecord.upsert).mockResolvedValue({ id: 'cwr1' } as any);
    vi.mocked(prisma.productEvent.create).mockResolvedValue({} as any);

    await handleCwrGenerate(makeMessage('link_change'), cwrDeps());

    expect(mockRunCwrSynthesis).toHaveBeenCalled();
  });
});
