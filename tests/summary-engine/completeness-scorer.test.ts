import { describe, it, expect } from 'vitest';
import { scoreCompleteness } from '../../packages/summary-engine/src/analyzers/completeness-scorer.js';
import type { IssueSnapshot, ThreadData } from '../../packages/summary-engine/src/types.js';

function makeIssue(overrides: Partial<IssueSnapshot> = {}): IssueSnapshot {
  return {
    id: 'issue-1',
    jiraIssueKey: 'PROJ-1',
    title: 'Test issue',
    status: 'In Progress',
    statusCategory: 'indeterminate',
    assigneeJiraAccountId: 'user-abc',
    priority: 'Medium',
    updatedAt: new Date(),
    ...overrides,
  };
}

const emptyThread: ThreadData = { id: 't1', channelId: 'C-x', messages: [] };

describe('scoreCompleteness', () => {
  it('returns score 100 for a fully complete issue', () => {
    const { score } = scoreCompleteness({
      issue: makeIssue(),
      threads: [emptyThread],
      blockers: [],
      openQuestions: [],
      statusDriftDetected: false,
      missingOwner: false,
      missingHandoff: false,
    });
    expect(score).toBe(100);
  });

  it('deducts 20 for missing owner', () => {
    const { score, missingSignals } = scoreCompleteness({
      issue: makeIssue({ assigneeJiraAccountId: null }),
      threads: [emptyThread],
      blockers: [],
      openQuestions: [],
      statusDriftDetected: false,
      missingOwner: true,
      missingHandoff: false,
    });
    expect(score).toBe(80);
    expect(missingSignals).toContain('No assignee');
  });

  it('deducts 15 for no linked Slack threads', () => {
    const { score, missingSignals } = scoreCompleteness({
      issue: makeIssue(),
      threads: [],
      blockers: [],
      openQuestions: [],
      statusDriftDetected: false,
      missingOwner: false,
      missingHandoff: false,
    });
    expect(score).toBe(85);
    expect(missingSignals).toContain('No linked Slack threads');
  });

  it('deducts 10 per blocker (capped at 30)', () => {
    const { score } = scoreCompleteness({
      issue: makeIssue(),
      threads: [emptyThread],
      blockers: ['b1', 'b2', 'b3'],
      openQuestions: [],
      statusDriftDetected: false,
      missingOwner: false,
      missingHandoff: false,
    });
    expect(score).toBe(70); // 100 - 30
  });

  it('blocker penalty never exceeds 30', () => {
    const { score } = scoreCompleteness({
      issue: makeIssue(),
      threads: [emptyThread],
      blockers: ['b1', 'b2', 'b3', 'b4', 'b5'],
      openQuestions: [],
      statusDriftDetected: false,
      missingOwner: false,
      missingHandoff: false,
    });
    expect(score).toBe(70); // still capped at -30
  });

  it('deducts 5 per open question (capped at 20)', () => {
    const { score } = scoreCompleteness({
      issue: makeIssue(),
      threads: [emptyThread],
      blockers: [],
      openQuestions: ['q1', 'q2', 'q3', 'q4', 'q5'],
      statusDriftDetected: false,
      missingOwner: false,
      missingHandoff: false,
    });
    expect(score).toBe(80); // 100 - 20 (capped)
  });

  it('deducts 10 for status drift', () => {
    const { score, missingSignals } = scoreCompleteness({
      issue: makeIssue(),
      threads: [emptyThread],
      blockers: [],
      openQuestions: [],
      statusDriftDetected: true,
      missingOwner: false,
      missingHandoff: false,
    });
    expect(score).toBe(90);
    expect(missingSignals).toContain('Status has not changed despite recent Slack activity');
  });

  it('deducts 15 for missing handoff', () => {
    const { score, missingSignals } = scoreCompleteness({
      issue: makeIssue(),
      threads: [emptyThread],
      blockers: [],
      openQuestions: [],
      statusDriftDetected: false,
      missingOwner: false,
      missingHandoff: true,
    });
    expect(score).toBe(85);
    expect(missingSignals).toContain('Assignee changed recently with no handoff comment');
  });

  it('deducts 10 for completion mismatch (done + open questions)', () => {
    const { score, missingSignals } = scoreCompleteness({
      issue: makeIssue({ status: 'Done', statusCategory: 'done' }),
      threads: [emptyThread],
      blockers: [],
      openQuestions: ['q1'],
      statusDriftDetected: false,
      missingOwner: false,
      missingHandoff: false,
    });
    // -5 for 1 open question, -10 for completion mismatch
    expect(score).toBe(85);
    expect(missingSignals).toContain('Issue marked done but open questions remain');
  });

  it('score never goes below 0', () => {
    const { score } = scoreCompleteness({
      issue: makeIssue({ assigneeJiraAccountId: null }),
      threads: [],
      blockers: ['b1', 'b2', 'b3'],
      openQuestions: ['q1', 'q2', 'q3', 'q4'],
      statusDriftDetected: true,
      missingOwner: true,
      missingHandoff: true,
    });
    expect(score).toBeGreaterThanOrEqual(0);
  });

  describe('recommendedNextStep', () => {
    it('assigns owner when missingOwner', () => {
      const { recommendedNextStep } = scoreCompleteness({
        issue: makeIssue(),
        threads: [emptyThread],
        blockers: [],
        openQuestions: [],
        statusDriftDetected: false,
        missingOwner: true,
        missingHandoff: false,
      });
      expect(recommendedNextStep).toContain('Assign an owner');
    });

    it('resolves blockers when blockers exist (and owner present)', () => {
      const { recommendedNextStep } = scoreCompleteness({
        issue: makeIssue(),
        threads: [emptyThread],
        blockers: ['b1'],
        openQuestions: [],
        statusDriftDetected: false,
        missingOwner: false,
        missingHandoff: false,
      });
      expect(recommendedNextStep).toContain('blockers');
    });

    it('address open questions next priority', () => {
      const { recommendedNextStep } = scoreCompleteness({
        issue: makeIssue(),
        threads: [emptyThread],
        blockers: [],
        openQuestions: ['q1'],
        statusDriftDetected: false,
        missingOwner: false,
        missingHandoff: false,
      });
      expect(recommendedNextStep).toContain('open questions');
    });

    it('returns no immediate action when fully healthy', () => {
      const { recommendedNextStep } = scoreCompleteness({
        issue: makeIssue(),
        threads: [emptyThread],
        blockers: [],
        openQuestions: [],
        statusDriftDetected: false,
        missingOwner: false,
        missingHandoff: false,
      });
      expect(recommendedNextStep).toBe('No immediate action required');
    });
  });
});
