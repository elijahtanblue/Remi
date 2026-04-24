import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeQueueSection,
  findCwrByIssueId,
  upsertCwr,
} from '../../packages/db/src/repositories/cwr.repo.js';

const mockPrisma = {
  currentWorkRecord: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
  },
} as any;

beforeEach(() => vi.clearAllMocks());

describe('upsertCwr', () => {
  it('upserts by issueId', async () => {
    mockPrisma.currentWorkRecord.upsert.mockResolvedValue({ id: 'cwr1' });

    await upsertCwr(mockPrisma, 'issue1', {
      workspaceId: 'ws1',
      currentState: 'In progress',
      openQuestions: [],
      riskScore: 0.3,
      isStale: false,
      sourceMemoryUnitIds: [],
      sourceSnapshotIds: [],
      snapshotSetHash: 'abc',
      dataSources: ['slack'],
      sourceFreshnessAt: new Date('2026-04-24'),
      confidence: 0.9,
      modelId: 'gpt-5.4-nano',
      promptVersion: 'v1',
    });

    const call = mockPrisma.currentWorkRecord.upsert.mock.calls[0][0];
    expect(call.where.issueId).toBe('issue1');
    expect(call.create.issueId).toBe('issue1');
    expect(call.update.currentState).toBe('In progress');
  });
});

describe('findCwrByIssueId', () => {
  it('queries by issueId', async () => {
    mockPrisma.currentWorkRecord.findUnique.mockResolvedValue(null);

    await findCwrByIssueId(mockPrisma, 'issue1');

    expect(mockPrisma.currentWorkRecord.findUnique).toHaveBeenCalledWith({
      where: { issueId: 'issue1' },
    });
  });
});

describe('computeQueueSection', () => {
  it('returns needs_action when isStale', () => {
    const cwr = { isStale: true, riskScore: 0, lastMeaningfulChangeAt: null } as any;
    expect(computeQueueSection(cwr, 0)).toBe('needs_action');
  });

  it('returns needs_action when riskScore >= 0.6', () => {
    const cwr = { isStale: false, riskScore: 0.6, lastMeaningfulChangeAt: null } as any;
    expect(computeQueueSection(cwr, 0)).toBe('needs_action');
  });

  it('returns awaiting_approval when proposals pending and not stale', () => {
    const cwr = { isStale: false, riskScore: 0.1, lastMeaningfulChangeAt: null } as any;
    expect(computeQueueSection(cwr, 2)).toBe('awaiting_approval');
  });

  it('returns recently_changed when changed in last 24h and no higher priority', () => {
    const recentDate = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const cwr = { isStale: false, riskScore: 0.1, lastMeaningfulChangeAt: recentDate } as any;
    expect(computeQueueSection(cwr, 0)).toBe('recently_changed');
  });

  it('needs_action beats awaiting_approval - stale issue with proposals stays needs_action', () => {
    const cwr = { isStale: true, riskScore: 0, lastMeaningfulChangeAt: null } as any;
    expect(computeQueueSection(cwr, 3)).toBe('needs_action');
  });

  it('returns recently_changed when no CWR exists yet', () => {
    expect(computeQueueSection(null, 0)).toBe('recently_changed');
  });
});
