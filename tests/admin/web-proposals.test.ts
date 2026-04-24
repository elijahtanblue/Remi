import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../apps/api/src/types/fastify.js';

const mockPrisma = vi.hoisted(() => ({
  memoryWritebackProposal: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  },
}));

const mockQueue = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('@remi/db', () => ({
  prisma: mockPrisma,
  createProductEvent: vi.fn(),
}));

vi.mock('../../apps/api/src/queue.js', () => ({
  queue: mockQueue,
}));

import { QueueNames } from '@remi/shared';
import { queue } from '../../apps/api/src/queue.js';
import { proposalRoutes } from '../../apps/api/src/routes/web/proposals.js';

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async (req) => {
    req.userId = 'u1';
    req.workspaceId = 'ws1';
  });
  await app.register(proposalRoutes);
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('POST /proposals/:id/approve', () => {
  it('returns 404 when proposal issue belongs to another workspace', async () => {
    mockPrisma.memoryWritebackProposal.findUnique.mockResolvedValue({
      id: 'p1',
      status: 'pending_approval',
      memoryUnit: { issue: { workspaceId: 'other' } },
    });
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/proposals/p1/approve' });

    expect(res.statusCode).toBe(404);
    expect(queue.send).not.toHaveBeenCalled();
  });

  it('marks pending proposal approved and enqueues apply job', async () => {
    mockPrisma.memoryWritebackProposal.findUnique.mockResolvedValue({
      id: 'p1',
      status: 'pending_approval',
      memoryUnit: { issue: { id: 'i1', workspaceId: 'ws1', jiraIssueKey: 'PROJ-1' } },
    });
    mockPrisma.memoryWritebackProposal.update.mockResolvedValue({});
    mockQueue.send.mockResolvedValue(undefined);
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/proposals/p1/approve' });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.memoryWritebackProposal.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'approved' },
    });
    expect(queue.send).toHaveBeenCalledWith(
      QueueNames.MEMORY_WRITEBACK_APPLY,
      expect.objectContaining({
        type: 'memory_writeback_apply',
        payload: { proposalId: 'p1' },
      }),
    );
  });
});
