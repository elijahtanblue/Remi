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
  it('returns no missing signals for a healthy issue', () => {
    const { missingSignals } = scoreCompleteness({
      issue: makeIssue(),
      threads: [emptyThread],
      blockers: [],
      openQuestions: [],
      statusDriftDetected: false,
      missingOwner: false,
      missingHandoff: false,
    });
    expect(missingSignals).toHaveLength(0);
  });

  it('flags missing owner', () => {
    const { missingSignals } = scoreCompleteness({
      issue: makeIssue({ assigneeJiraAccountId: null }),
      threads: [emptyThread],
      blockers: [],
      openQuestions: [],
      statusDriftDetected: false,
      missingOwner: true,
      missingHandoff: false,
    });
    expect(missingSignals).toContain('No assignee');
  });

  it('flags no linked Slack threads', () => {
    const { missingSignals } = scoreCompleteness({
      issue: makeIssue(),
      threads: [],
      blockers: [],
      openQuestions: [],
      statusDriftDetected: false,
      missingOwner: false,
      missingHandoff: false,
    });
    expect(missingSignals).toContain('No linked Slack threads');
  });

  it('flags probable blockers', () => {
    const { missingSignals } = scoreCompleteness({
      issue: makeIssue(),
      threads: [emptyThread],
      blockers: ['b1', 'b2'],
      openQuestions: [],
      statusDriftDetected: false,
      missingOwner: false,
      missingHandoff: false,
    });
    expect(missingSignals).toContain('2 probable blocker(s) detected');
  });

  it('flags status drift', () => {
    const { missingSignals } = scoreCompleteness({
      issue: makeIssue(),
      threads: [emptyThread],
      blockers: [],
      openQuestions: [],
      statusDriftDetected: true,
      missingOwner: false,
      missingHandoff: false,
    });
    expect(missingSignals).toContain('Status has not changed despite recent Slack activity');
  });

  it('flags missing handoff', () => {
    const { missingSignals } = scoreCompleteness({
      issue: makeIssue(),
      threads: [emptyThread],
      blockers: [],
      openQuestions: [],
      statusDriftDetected: false,
      missingOwner: false,
      missingHandoff: true,
    });
    expect(missingSignals).toContain('Assignee changed recently with no handoff comment');
  });

  it('flags completion mismatch (done + open questions)', () => {
    const { missingSignals } = scoreCompleteness({
      issue: makeIssue({ status: 'Done', statusCategory: 'done' }),
      threads: [emptyThread],
      blockers: [],
      openQuestions: ['q1'],
      statusDriftDetected: false,
      missingOwner: false,
      missingHandoff: false,
    });
    expect(missingSignals).toContain('Issue marked done but open questions remain');
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
