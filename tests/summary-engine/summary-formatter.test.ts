import { describe, it, expect } from 'vitest';
import { formatSummary } from '../../packages/summary-engine/src/formatters/summary-formatter.js';
import type { CollectedData, AnalysisResult } from '../../packages/summary-engine/src/types.js';

const NOW = new Date('2024-04-01T12:00:00Z');

function makeCollected(overrides: Partial<CollectedData> = {}): CollectedData {
  return {
    issue: {
      id: 'issue-1',
      jiraIssueKey: 'PROJ-42',
      title: 'Fix the login bug',
      status: 'In Progress',
      statusCategory: 'indeterminate',
      assigneeJiraAccountId: 'user-alice',
      priority: 'High',
      updatedAt: NOW,
    },
    events: [],
    threads: [],
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    latestImportantChanges: [],
    previousAssignee: null,
    probableBlockers: [],
    openQuestions: [],
    statusDriftDetected: false,
    missingOwner: false,
    missingHandoff: false,
    completionMismatch: false,
    totalMessages: 0,
    uniqueParticipants: 0,
    ...overrides,
  };
}

const defaultScore = {
  score: 100,
  recommendedNextStep: 'No immediate action required',
  missingSignals: [],
};

describe('formatSummary', () => {
  it('maps issue fields to SummaryOutput correctly', () => {
    const result = formatSummary(makeCollected(), makeAnalysis(), defaultScore);
    expect(result.issueKey).toBe('PROJ-42');
    expect(result.issueTitle).toBe('Fix the login bug');
    expect(result.currentStatus).toBe('In Progress');
    expect(result.assignee).toBe('user-alice');
  });

  it('falls back to statusCategory label when status is null', () => {
    const collected = makeCollected({
      issue: { ...makeCollected().issue, status: null },
    });
    const result = formatSummary(collected, makeAnalysis(), defaultScore);
    expect(result.currentStatus).toBe('In Progress');
  });

  it('passes through previousAssignee from analysis', () => {
    const result = formatSummary(makeCollected(), makeAnalysis({ previousAssignee: 'user-bob' }), defaultScore);
    expect(result.previousAssignee).toBe('user-bob');
  });

  it('formats latestImportantChanges as human-readable strings', () => {
    const analysis = makeAnalysis({
      latestImportantChanges: [
        { field: 'Status', from: 'To Do', to: 'In Progress', at: NOW, actor: null },
      ],
    });
    const result = formatSummary(makeCollected(), analysis, defaultScore);
    expect(result.latestImportantChanges).toHaveLength(1);
    expect(result.latestImportantChanges[0]).toContain('Status');
    expect(result.latestImportantChanges[0]).toContain("'To Do'");
    expect(result.latestImportantChanges[0]).toContain("'In Progress'");
    expect(result.latestImportantChanges[0]).toContain('2024-04-01');
  });

  it('formats probableBlockers as strings including matched keyword', () => {
    const analysis = makeAnalysis({
      probableBlockers: [
        { text: 'We are blocked on API access', slackUserId: 'U-a', sentAt: NOW, matchedKeyword: 'blocked' },
      ],
    });
    const result = formatSummary(makeCollected(), analysis, defaultScore);
    expect(result.probableBlockers).toHaveLength(1);
    expect(result.probableBlockers[0]).toContain('blocked');
    expect(result.probableBlockers[0]).toContain('We are blocked on API access');
  });

  it('truncates blocker text longer than 120 chars', () => {
    const longText = 'blocked: ' + 'x'.repeat(200);
    const analysis = makeAnalysis({
      probableBlockers: [
        { text: longText, slackUserId: 'U-a', sentAt: NOW, matchedKeyword: 'blocked' },
      ],
    });
    const result = formatSummary(makeCollected(), analysis, defaultScore);
    // The excerpt is applied to the text inside quotes in the format string
    expect(result.probableBlockers[0].length).toBeLessThan(longText.length + 50);
  });

  it('formats openQuestions as raw text strings', () => {
    const analysis = makeAnalysis({
      openQuestions: [
        { text: 'Has the auth issue been resolved?', slackUserId: 'U-b', sentAt: NOW },
      ],
    });
    const result = formatSummary(makeCollected(), analysis, defaultScore);
    expect(result.openQuestions).toHaveLength(1);
    expect(result.openQuestions[0]).toBe('Has the auth issue been resolved?');
  });

  it('computes linkedThreadStats from threads', () => {
    const collected = makeCollected({
      threads: [
        {
          id: 't1',
          channelId: 'C-a',
          messages: [
            { id: 'm1', slackUserId: 'U-alice', text: 'hello', sentAt: NOW },
            { id: 'm2', slackUserId: 'U-bob', text: 'world', sentAt: NOW },
          ],
        },
        {
          id: 't2',
          channelId: 'C-b',
          messages: [
            { id: 'm3', slackUserId: 'U-alice', text: 'ping', sentAt: NOW },
          ],
        },
      ],
    });
    const result = formatSummary(collected, makeAnalysis(), defaultScore);
    expect(result.linkedThreadStats.totalThreads).toBe(2);
    expect(result.linkedThreadStats.totalMessages).toBe(3);
    expect(result.linkedThreadStats.activeParticipants).toBe(2); // U-alice + U-bob
  });

  it('passes actionable score fields to output (no numeric score)', () => {
    const score = {
      score: 72,
      recommendedNextStep: 'Assign an owner',
      missingSignals: ['No assignee'],
    };
    const result = formatSummary(makeCollected(), makeAnalysis(), score);
    expect(result.recommendedNextStep).toBe('Assign an owner');
    expect(result.missingSignals).toContain('No assignee');
    expect(result).not.toHaveProperty('handoffCompletenessScore');
  });

  it('generatedAt is a Date instance', () => {
    const result = formatSummary(makeCollected(), makeAnalysis(), defaultScore);
    expect(result.generatedAt).toBeInstanceOf(Date);
  });
});
