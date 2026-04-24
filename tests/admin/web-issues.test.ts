import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../apps/api/src/types/fastify.js';

const mockPrisma = vi.hoisted(() => ({
  issue: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  memoryObservation: {
    findMany: vi.fn(),
  },
  currentWorkRecord: {
    update: vi.fn(),
  },
}));

vi.mock('@remi/db', () => ({
  prisma: mockPrisma,
  computeQueueSection: vi.fn(() => 'recently_changed'),
  findMeaningfulEventsByIssue: vi.fn(),
  createProductEvent: vi.fn(),
}));

import { findMeaningfulEventsByIssue } from '@remi/db';
import { issueRoutes } from '../../apps/api/src/routes/web/issues.js';

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async (req) => {
    req.userId = 'u1';
    req.workspaceId = 'ws1';
  });
  await app.register(issueRoutes);
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /issues/:id', () => {
  it('returns 404 when issue not found in workspace', async () => {
    mockPrisma.issue.findUnique.mockResolvedValue(null);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/issues/nonexistent' });

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /issues/:id/timeline', () => {
  it('calls findMeaningfulEventsByIssue with limit and cursor', async () => {
    mockPrisma.issue.findUnique.mockResolvedValue({ workspaceId: 'ws1' });
    vi.mocked(findMeaningfulEventsByIssue).mockResolvedValue({
      events: [],
      nextCursor: null,
    });
    const app = await buildApp();

    await app.inject({
      method: 'GET',
      url: '/issues/i1/timeline?limit=20&before=evt99',
    });

    expect(findMeaningfulEventsByIssue).toHaveBeenCalledWith(
      expect.anything(),
      'i1',
      { limit: 20, before: 'evt99' },
    );
  });
});
