import { describe, it, expect, vi } from 'vitest';

// We test the behaviour of buildIssueDocContext by mocking prisma directly.
// The key behaviours under test:
//   1. Aggregates observations across ALL memory units for the issue (not just the first).
//   2. Sets superseded: true for observations with state === 'superseded'.
//   3. Sets superseded: false for observations with state === 'active'.

const makeObs = (overrides: object) => ({
  id: 'obs-1',
  category: 'blocker',
  content: 'Some blocker',
  sourceApp: 'slack',
  extractedAt: new Date('2026-04-01'),
  state: 'active',
  supersededAt: null,
  ...overrides,
});

const basePrisma = {
  issue: {
    findUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 'issue-1',
      jiraIssueKey: 'KAN-1',
      title: 'Test issue',
      status: 'Done',
      statusCategory: 'done',
      assigneeDisplayName: 'Alice',
      priority: 'High',
      department: null,
      departmentId: null,
    }),
  },
  issueEvent: { findMany: vi.fn().mockResolvedValue([]) },
  memoryUnit: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'unit-1',
        observations: [makeObs({ id: 'obs-1', category: 'blocker', state: 'active' })],
      },
      {
        id: 'unit-2',
        observations: [makeObs({ id: 'obs-2', category: 'decision', content: 'Use JWT', state: 'superseded', supersededAt: new Date('2026-04-08') })],
      },
    ]),
  },
  issueThreadLink: { findMany: vi.fn().mockResolvedValue([]) },
  issueEmailLink: { findMany: vi.fn().mockResolvedValue([]) },
};

// buildIssueDocContext accepts prisma as its first argument, so we pass
// basePrisma directly — no vi.mock needed.
describe('buildIssueDocContext', () => {
  it('aggregates observations from all memory units', async () => {
    const { buildIssueDocContext } = await import('../../packages/confluence/src/build-context.js');
    const ctx = await buildIssueDocContext(basePrisma as any, 'issue-1', 'handoff');
    expect(ctx.blockers).toHaveLength(1);
    expect(ctx.keyDecisions).toHaveLength(1);
  });

  it('marks superseded observations correctly', async () => {
    const { buildIssueDocContext } = await import('../../packages/confluence/src/build-context.js');
    const ctx = await buildIssueDocContext(basePrisma as any, 'issue-1', 'handoff');
    expect(ctx.blockers[0]?.superseded).toBe(false);
    expect(ctx.keyDecisions[0]?.superseded).toBe(true);
    expect(ctx.keyDecisions[0]?.supersededAt).toBeInstanceOf(Date);
  });
});
