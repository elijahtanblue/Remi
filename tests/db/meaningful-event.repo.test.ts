import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findMeaningfulEventsByIssue,
  upsertMeaningfulEvents,
} from '../../packages/db/src/repositories/meaningful-event.repo.js';

const mockPrisma = {
  meaningfulEvent: {
    createMany: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
} as any;

beforeEach(() => vi.clearAllMocks());

describe('upsertMeaningfulEvents', () => {
  it('uses skipDuplicates to honour idempotency keys', async () => {
    mockPrisma.meaningfulEvent.createMany.mockResolvedValue({ count: 1 });

    await upsertMeaningfulEvents(mockPrisma, [
      {
        issueId: 'i1',
        workspaceId: 'ws1',
        idempotencyKey: 'cwr:c1:owner_changed:abc',
        eventType: 'owner_changed',
        summary: 'Owner changed from Alice to Bob',
        source: 'slack',
        occurredAt: new Date('2026-04-24'),
      },
    ]);

    expect(mockPrisma.meaningfulEvent.createMany).toHaveBeenCalledWith({
      data: expect.any(Array),
      skipDuplicates: true,
    });
  });

  it('does nothing when given an empty array', async () => {
    await upsertMeaningfulEvents(mockPrisma, []);
    expect(mockPrisma.meaningfulEvent.createMany).not.toHaveBeenCalled();
  });
});

describe('findMeaningfulEventsByIssue', () => {
  it('queries by issueId ordered desc with cursor pagination', async () => {
    mockPrisma.meaningfulEvent.findMany.mockResolvedValue([]);

    await findMeaningfulEventsByIssue(mockPrisma, 'i1', { limit: 20 });

    expect(mockPrisma.meaningfulEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { issueId: 'i1' },
        orderBy: { occurredAt: 'desc' },
        take: 21,
      }),
    );
  });

  it('applies cursor when provided', async () => {
    mockPrisma.meaningfulEvent.findMany.mockResolvedValue([]);

    await findMeaningfulEventsByIssue(mockPrisma, 'i1', { limit: 20, before: 'event99' });

    const call = mockPrisma.meaningfulEvent.findMany.mock.calls[0][0];
    expect(call.cursor).toEqual({ id: 'event99' });
    expect(call.skip).toBe(1);
  });
});
