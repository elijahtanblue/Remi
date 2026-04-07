import { describe, it, expect } from 'vitest';
import { analyzeStatus } from '../../packages/summary-engine/src/analyzers/status-analyzer.js';
import type { IssueEventRecord, ThreadData } from '../../packages/summary-engine/src/types.js';

const NOW = new Date('2024-04-01T12:00:00Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86_400_000);
}

function makeEvent(
  type: string,
  daysAgoN: number,
  changedFields: Record<string, unknown> = {},
  actor: string | null = null,
): IssueEventRecord {
  return {
    id: `evt-${Math.random()}`,
    eventType: type,
    changedFields,
    actorExternalId: actor,
    occurredAt: daysAgo(daysAgoN),
  };
}

function makeThread(messagesWithDays: number[]): ThreadData {
  return {
    id: 'thread-1',
    channelId: 'C-dev',
    messages: messagesWithDays.map((d, i) => ({
      id: `msg-${i}`,
      slackUserId: 'U-a',
      text: 'activity',
      sentAt: daysAgo(d),
    })),
  };
}

describe('analyzeStatus', () => {
  it('returns empty latestImportantChanges with no events', () => {
    const { latestImportantChanges } = analyzeStatus([], [], NOW);
    expect(latestImportantChanges).toHaveLength(0);
  });

  it('filters only important event types (status, assignee, priority)', () => {
    const events = [
      makeEvent('comment_added', 1),
      makeEvent('issue_created', 2),
      makeEvent('status_changed', 1, { from: 'To Do', to: 'In Progress' }),
    ];
    const { latestImportantChanges } = analyzeStatus(events, [], NOW);
    expect(latestImportantChanges).toHaveLength(1);
    expect(latestImportantChanges[0].field).toBe('Status');
  });

  it('dedupes repeated changes on the same field to the most recent event', () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      makeEvent('status_changed', i + 1, { from: 'old', to: 'new' }),
    );
    const { latestImportantChanges } = analyzeStatus(events, [], NOW);
    expect(latestImportantChanges).toHaveLength(1);
    expect(latestImportantChanges[0].field).toBe('Status');
  });

  it('maps eventType to human-readable field label', () => {
    const events = [
      makeEvent('assignee_changed', 1, { from: 'alice', to: 'bob' }),
      makeEvent('priority_changed', 2, { from: 'Low', to: 'High' }),
    ];
    const { latestImportantChanges } = analyzeStatus(events, [], NOW);
    const fields = latestImportantChanges.map((c) => c.field);
    expect(fields).toContain('Assignee');
    expect(fields).toContain('Priority');
  });

  it('extracts from/to strings from changedFields', () => {
    const events = [
      makeEvent('status_changed', 1, { from: 'To Do', to: 'In Progress' }),
    ];
    const { latestImportantChanges } = analyzeStatus(events, [], NOW);
    expect(latestImportantChanges[0].from).toBe('To Do');
    expect(latestImportantChanges[0].to).toBe('In Progress');
  });

  it('handles null from/to in changedFields', () => {
    const events = [makeEvent('status_changed', 1, { from: null, to: 'In Progress' })];
    const { latestImportantChanges } = analyzeStatus(events, [], NOW);
    expect(latestImportantChanges[0].from).toBeNull();
    expect(latestImportantChanges[0].to).toBe('In Progress');
  });

  it('returns previousAssignee from most recent assignee_changed event', () => {
    const events = [
      makeEvent('assignee_changed', 3, { from: 'alice', to: 'bob' }),
      makeEvent('assignee_changed', 1, { from: 'bob', to: 'carol' }),
    ];
    const { previousAssignee } = analyzeStatus(events, [], NOW);
    expect(previousAssignee).toBe('bob'); // most recent: bob → carol
  });

  it('returns null previousAssignee when no assignee_changed events', () => {
    const events = [makeEvent('status_changed', 1, { from: 'To Do', to: 'Done' })];
    const { previousAssignee } = analyzeStatus(events, [], NOW);
    expect(previousAssignee).toBeNull();
  });

  it('detects status drift: Slack activity but no status change in last 5 days', () => {
    const events = [makeEvent('status_changed', 10)]; // old
    const thread = makeThread([2]); // recent activity
    const { statusDriftDetected } = analyzeStatus(events, [thread], NOW);
    expect(statusDriftDetected).toBe(true);
  });

  it('does NOT detect drift when there is a recent status change', () => {
    const events = [makeEvent('status_changed', 2)]; // within 5 days
    const thread = makeThread([1]); // recent activity
    const { statusDriftDetected } = analyzeStatus(events, [thread], NOW);
    expect(statusDriftDetected).toBe(false);
  });

  it('does NOT detect drift when there is no recent Slack activity', () => {
    const events = [makeEvent('status_changed', 10)]; // old
    const thread = makeThread([8]); // also old activity
    const { statusDriftDetected } = analyzeStatus(events, [thread], NOW);
    expect(statusDriftDetected).toBe(false);
  });

  it('does NOT detect drift with no events and no threads', () => {
    const { statusDriftDetected } = analyzeStatus([], [], NOW);
    expect(statusDriftDetected).toBe(false);
  });

  it('includes actorExternalId in latestImportantChanges', () => {
    const events = [makeEvent('status_changed', 1, { from: 'To Do', to: 'Done' }, 'U-actor')];
    const { latestImportantChanges } = analyzeStatus(events, [], NOW);
    expect(latestImportantChanges[0].actor).toBe('U-actor');
  });
});
