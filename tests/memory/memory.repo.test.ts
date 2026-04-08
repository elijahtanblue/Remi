import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findOrCreateMemoryUnit,
  getMemoryConfig,
  upsertMemoryConfig,
  getLatestSnapshot,
  createObservations,
  listObservationsSince,
  createSnapshot,
  createProposal,
  updateProposalStatus,
} from '../../packages/db/src/repositories/memory.repo.js';

const mockPrisma = {
  workspaceMemoryConfig: { findUnique: vi.fn(), upsert: vi.fn() },
  memoryUnit: { findUnique: vi.fn(), create: vi.fn() },
  memoryObservation: { createMany: vi.fn(), findMany: vi.fn() },
  memorySnapshot: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
  memoryWritebackProposal: { create: vi.fn(), update: vi.fn() },
} as any;

beforeEach(() => { vi.clearAllMocks(); });

describe('getMemoryConfig', () => {
  it('returns null when no config exists', async () => {
    mockPrisma.workspaceMemoryConfig.findUnique.mockResolvedValue(null);
    const result = await getMemoryConfig(mockPrisma, 'ws1');
    expect(result).toBeNull();
    expect(mockPrisma.workspaceMemoryConfig.findUnique).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1' },
    });
  });
});

describe('findOrCreateMemoryUnit', () => {
  it('returns existing unit with created=false', async () => {
    const unit = { id: 'u1', workspaceId: 'ws1', scopeType: 'issue_thread', scopeRef: 't1' };
    mockPrisma.memoryUnit.findUnique.mockResolvedValue(unit);
    const result = await findOrCreateMemoryUnit(mockPrisma, 'ws1', 'issue_thread', 't1');
    expect(result).toEqual({ unit, created: false });
    expect(mockPrisma.memoryUnit.create).not.toHaveBeenCalled();
  });

  it('creates new unit with created=true when not found', async () => {
    const unit = { id: 'u2', workspaceId: 'ws1', scopeType: 'issue_thread', scopeRef: 't2' };
    mockPrisma.memoryUnit.findUnique.mockResolvedValue(null);
    mockPrisma.memoryUnit.create.mockResolvedValue(unit);
    const result = await findOrCreateMemoryUnit(mockPrisma, 'ws1', 'issue_thread', 't2');
    expect(result).toEqual({ unit, created: true });
  });
});

describe('createObservations', () => {
  it('calls createMany with correct shape', async () => {
    mockPrisma.memoryObservation.createMany.mockResolvedValue({ count: 2 });
    const obs = [
      { category: 'decision', content: 'We chose React', confidence: 0.9, citationIds: ['msg1'], modelId: 'gemini-2.5-flash-lite', promptVersion: 'v1' },
      { category: 'blocker', content: 'Auth is broken', confidence: 0.8, citationIds: ['msg2'], modelId: 'gemini-2.5-flash-lite', promptVersion: 'v1' },
    ];
    await createObservations(mockPrisma, 'u1', obs);
    expect(mockPrisma.memoryObservation.createMany).toHaveBeenCalledWith({
      data: obs.map(o => ({ ...o, memoryUnitId: 'u1' })),
    });
  });
});

describe('listObservationsSince', () => {
  it('queries with extractedAt filter', async () => {
    const since = new Date('2026-01-01');
    mockPrisma.memoryObservation.findMany.mockResolvedValue([]);
    await listObservationsSince(mockPrisma, 'u1', since);
    expect(mockPrisma.memoryObservation.findMany).toHaveBeenCalledWith({
      where: { memoryUnitId: 'u1', extractedAt: { gt: since } },
      orderBy: { extractedAt: 'asc' },
    });
  });
});

describe('getLatestSnapshot', () => {
  it('fetches snapshot ordered by version desc', async () => {
    mockPrisma.memorySnapshot.findFirst.mockResolvedValue(null);
    await getLatestSnapshot(mockPrisma, 'u1');
    expect(mockPrisma.memorySnapshot.findFirst).toHaveBeenCalledWith({
      where: { memoryUnitId: 'u1' },
      orderBy: { version: 'desc' },
    });
  });
});

describe('updateProposalStatus', () => {
  it('sets approvedAt when transitioning to approved', async () => {
    mockPrisma.memoryWritebackProposal.update.mockResolvedValue({});
    await updateProposalStatus(mockPrisma, 'p1', 'approved', { approvedBy: 'user1' });
    const call = mockPrisma.memoryWritebackProposal.update.mock.calls[0][0];
    expect(call.data.status).toBe('approved');
    expect(call.data.approvedBy).toBe('user1');
    expect(call.data.approvedAt).toBeInstanceOf(Date);
  });
});

describe('upsertMemoryConfig', () => {
  it('creates config with trackedChannelIds when none exists', async () => {
    const config = {
      id: 'cfg1',
      workspaceId: 'ws1',
      enabled: false,
      excludedChannelIds: [],
      excludedUserIds: [],
      trackedChannelIds: ['C123'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockPrisma.workspaceMemoryConfig.upsert.mockResolvedValue(config);
    const result = await upsertMemoryConfig(mockPrisma, 'ws1', { trackedChannelIds: ['C123'] });
    expect(result.trackedChannelIds).toEqual(['C123']);
    expect(mockPrisma.workspaceMemoryConfig.upsert).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1' },
      create: expect.objectContaining({ trackedChannelIds: ['C123'], workspaceId: 'ws1' }),
      update: { trackedChannelIds: ['C123'] },
    });
  });

  it('defaults trackedChannelIds to [] when not provided', async () => {
    const config = {
      id: 'cfg2', workspaceId: 'ws1', enabled: true,
      excludedChannelIds: [], excludedUserIds: [], trackedChannelIds: [],
      createdAt: new Date(), updatedAt: new Date(),
    };
    mockPrisma.workspaceMemoryConfig.upsert.mockResolvedValue(config);
    await upsertMemoryConfig(mockPrisma, 'ws1', { enabled: true });
    expect(mockPrisma.workspaceMemoryConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ trackedChannelIds: [] }),
      }),
    );
  });
});
