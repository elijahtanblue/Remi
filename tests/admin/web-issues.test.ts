import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../apps/api/src/types/fastify.js';

const mockPrisma = vi.hoisted(() => ({
  issue: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  memoryUnit: {
    findFirst: vi.fn(),
  },
  memoryWritebackProposal: {
    create: vi.fn(),
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

describe('POST /issues/:id/actions', () => {
  it('creates a chase owner proposal when a linked snapshot exists', async () => {
    mockPrisma.issue.findUnique.mockResolvedValue({
      id: 'i1',
      workspaceId: 'ws1',
      jiraIssueKey: 'PROJ-1',
      currentWorkRecord: {
        currentState: 'Waiting on design sign-off',
        ownerDisplayName: 'Alex',
        nextStep: null,
        confidence: 0.82,
      },
    });
    mockPrisma.memoryUnit.findFirst.mockResolvedValue({
      id: 'mu1',
      snapshots: [{ id: 'snap1' }],
    });
    mockPrisma.memoryWritebackProposal.create.mockResolvedValue({ id: 'prop1' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/issues/i1/actions',
      payload: { type: 'chase_owner' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.memoryWritebackProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        memoryUnitId: 'mu1',
        snapshotId: 'snap1',
        target: 'jira_comment',
        status: 'pending_approval',
        payload: {
          jiraIssueKey: 'PROJ-1',
          commentBody:
            'Hi Alex, following up on PROJ-1 — Waiting on design sign-off.\nNext step: Please confirm current status.\nCan you provide an update?',
        },
      }),
    });
    expect(res.json()).toEqual({
      proposalId: 'prop1',
      message: 'Chase drafted — review in Approvals.',
    });
  });

  it('returns 400 for chase owner when no owner is set', async () => {
    mockPrisma.issue.findUnique.mockResolvedValue({
      id: 'i1',
      workspaceId: 'ws1',
      jiraIssueKey: 'PROJ-1',
      currentWorkRecord: {
        currentState: 'Waiting on design sign-off',
        ownerDisplayName: null,
      },
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/issues/i1/actions',
      payload: { type: 'chase_owner' },
    });

    expect(res.statusCode).toBe(400);
    expect(mockPrisma.memoryWritebackProposal.create).not.toHaveBeenCalled();
  });

  it('creates an escalation proposal with CWR details', async () => {
    mockPrisma.issue.findUnique.mockResolvedValue({
      id: 'i1',
      workspaceId: 'ws1',
      jiraIssueKey: 'PROJ-1',
      title: 'Fix onboarding sync failure',
      currentWorkRecord: {
        currentState: 'Blocked on vendor callback',
        ownerDisplayName: 'Alex',
        waitingOnDescription: 'Vendor support to restore webhook access',
        blockerSummary: 'No successful callbacks since Tuesday',
        nextStep: 'Escalate through support manager',
        riskScore: 0.82,
        confidence: 0.67,
        dataSources: ['slack', 'jira'],
        isStale: true,
      },
    });
    mockPrisma.memoryUnit.findFirst.mockResolvedValue({
      id: 'mu1',
      snapshots: [{ id: 'snap1' }],
    });
    mockPrisma.memoryWritebackProposal.create.mockResolvedValue({ id: 'prop2' });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/issues/i1/actions',
      payload: { type: 'prepare_escalation' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.memoryWritebackProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        memoryUnitId: 'mu1',
        snapshotId: 'snap1',
        payload: {
          jiraIssueKey: 'PROJ-1',
          commentBody: [
            '*Escalation Summary — PROJ-1*',
            '*Issue:* Fix onboarding sync failure',
            '*Current state:* Blocked on vendor callback',
            '*Owner:* Alex',
            '*Waiting on:* Vendor support to restore webhook access',
            '*Blocker:* No successful callbacks since Tuesday',
            '*Recommended next step:* Escalate through support manager',
            '*Risk:* 82% · Confidence: 67%',
            '*Sources:* slack, jira',
            '⚠ This issue has gone stale.',
          ].join('\n'),
        },
      }),
    });
    expect(res.json()).toEqual({
      proposalId: 'prop2',
      message: 'Escalation pack ready — review in Approvals.',
    });
  });
});
