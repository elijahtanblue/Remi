import { describe, it, expect } from 'vitest';
import { analyzeOwnership } from '../../packages/summary-engine/src/analyzers/ownership-analyzer.js';
import type { IssueSnapshot, IssueEventRecord } from '../../packages/summary-engine/src/types.js';

const NOW = new Date('2024-04-01T12:00:00Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86_400_000);
}

function makeIssue(assigneeId: string | null): IssueSnapshot {
  return {
    id: 'issue-1',
    jiraIssueKey: 'PROJ-1',
    title: 'Test issue',
    status: 'In Progress',
    statusCategory: 'indeterminate',
    assigneeJiraAccountId: assigneeId,
    priority: 'Medium',
    updatedAt: daysAgo(1),
  };
}

function makeEvent(type: string, daysAgoN: number): IssueEventRecord {
  return {
    id: `evt-${Math.random()}`,
    eventType: type,
    changedFields: null,
    actorExternalId: null,
    occurredAt: daysAgo(daysAgoN),
  };
}

describe('analyzeOwnership', () => {
  it('missingOwner is true when assigneeJiraAccountId is null', () => {
    const { missingOwner } = analyzeOwnership(makeIssue(null), [], NOW);
    expect(missingOwner).toBe(true);
  });

  it('missingOwner is false when assignee is present', () => {
    const { missingOwner } = analyzeOwnership(makeIssue('user-abc'), [], NOW);
    expect(missingOwner).toBe(false);
  });

  it('missingHandoff is false when no recent assignee change', () => {
    const events = [makeEvent('assignee_changed', 10)]; // older than 7 days
    const { missingHandoff } = analyzeOwnership(makeIssue('user-abc'), events, NOW);
    expect(missingHandoff).toBe(false);
  });

  it('missingHandoff is true when assignee changed recently with no comment', () => {
    const events = [makeEvent('assignee_changed', 2)]; // within 7 days, no comment
    const { missingHandoff } = analyzeOwnership(makeIssue('user-abc'), events, NOW);
    expect(missingHandoff).toBe(true);
  });

  it('missingHandoff is false when assignee changed recently AND a comment was added', () => {
    const events = [
      makeEvent('assignee_changed', 2),
      makeEvent('comment_added', 1),
    ];
    const { missingHandoff } = analyzeOwnership(makeIssue('user-abc'), events, NOW);
    expect(missingHandoff).toBe(false);
  });

  it('missingHandoff is false with no events at all', () => {
    const { missingHandoff } = analyzeOwnership(makeIssue('user-abc'), [], NOW);
    expect(missingHandoff).toBe(false);
  });

  it('comment older than 7 days does not satisfy handoff requirement', () => {
    const events = [
      makeEvent('assignee_changed', 2), // recent
      makeEvent('comment_added', 10),   // too old
    ];
    const { missingHandoff } = analyzeOwnership(makeIssue('user-abc'), events, NOW);
    expect(missingHandoff).toBe(true);
  });

  it('returns both flags correctly for an issue with no owner and recent reassignment', () => {
    const events = [makeEvent('assignee_changed', 1)];
    const result = analyzeOwnership(makeIssue(null), events, NOW);
    expect(result.missingOwner).toBe(true);
    expect(result.missingHandoff).toBe(true);
  });
});
