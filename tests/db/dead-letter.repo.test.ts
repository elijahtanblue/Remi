import { describe, expect, it, vi } from 'vitest';
import { deleteDeadLettersByQueue, listDeadLetters } from '../../packages/db/src/repositories/dead-letter.repo.js';

describe('dead letter repository filters', () => {
  it('lists only unresolved dead letters by default', async () => {
    const prisma = {
      queueDeadLetter: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as any;

    await listDeadLetters(prisma, { queue: 'backfill-jobs', limit: 10, offset: 5 });

    expect(prisma.queueDeadLetter.findMany).toHaveBeenCalledWith({
      where: {
        queue: 'backfill-jobs',
        retriedAt: null,
      },
      take: 10,
      skip: 5,
      orderBy: { failedAt: 'desc' },
    });
  });

  it('includes retried dead letters when explicitly requested', async () => {
    const prisma = {
      queueDeadLetter: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as any;

    await listDeadLetters(prisma, { queue: 'backfill-jobs', includeRetried: true });

    expect(prisma.queueDeadLetter.findMany).toHaveBeenCalledWith({
      where: {
        queue: 'backfill-jobs',
      },
      take: 50,
      skip: 0,
      orderBy: { failedAt: 'desc' },
    });
  });

  it('clears only unresolved dead letters by default', async () => {
    const prisma = {
      queueDeadLetter: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    } as any;

    await deleteDeadLettersByQueue(prisma, { queue: 'backfill-jobs' });

    expect(prisma.queueDeadLetter.deleteMany).toHaveBeenCalledWith({
      where: {
        queue: 'backfill-jobs',
        retriedAt: null,
      },
    });
  });

  it('can clear historical dead letters when history mode is selected', async () => {
    const prisma = {
      queueDeadLetter: {
        deleteMany: vi.fn().mockResolvedValue({ count: 4 }),
      },
    } as any;

    await deleteDeadLettersByQueue(prisma, { queue: 'backfill-jobs', includeRetried: true });

    expect(prisma.queueDeadLetter.deleteMany).toHaveBeenCalledWith({
      where: {
        queue: 'backfill-jobs',
      },
    });
  });
});
