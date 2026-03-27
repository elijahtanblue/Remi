import { describe, it, expect } from 'vitest';
import { detectOpenQuestions } from '../../packages/summary-engine/src/analyzers/question-detector.js';
import type { ThreadData } from '../../packages/summary-engine/src/types.js';

const NOW = new Date('2024-04-01T12:00:00Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86_400_000);
}

function makeThread(messages: Array<{ id: string; slackUserId: string; text: string; sentAt: Date }>): ThreadData {
  return { id: 'thread-1', channelId: 'C-dev', messages };
}

describe('detectOpenQuestions', () => {
  it('returns empty array with no threads', () => {
    expect(detectOpenQuestions([], NOW)).toEqual([]);
  });

  it('returns empty when no messages contain a question mark', () => {
    const thread = makeThread([
      { id: 'm1', slackUserId: 'U-a', text: 'all good here', sentAt: daysAgo(1) },
    ]);
    expect(detectOpenQuestions([thread], NOW)).toHaveLength(0);
  });

  it('detects a substantive unanswered question', () => {
    const thread = makeThread([
      { id: 'm1', slackUserId: 'U-a', text: 'Has anyone deployed the new migration script yet?', sentAt: daysAgo(1) },
    ]);
    const results = detectOpenQuestions([thread], NOW);
    expect(results).toHaveLength(1);
    expect(results[0].text).toContain('migration script');
  });

  it('ignores trivial one-word questions like "ok?"', () => {
    const thread = makeThread([
      { id: 'm1', slackUserId: 'U-a', text: 'ok?', sentAt: daysAgo(1) },
    ]);
    expect(detectOpenQuestions([thread], NOW)).toHaveLength(0);
  });

  it('ignores messages shorter than 15 characters even with "?"', () => {
    const thread = makeThread([
      { id: 'm1', slackUserId: 'U-a', text: 'done?', sentAt: daysAgo(1) },
    ]);
    expect(detectOpenQuestions([thread], NOW)).toHaveLength(0);
  });

  it('ignores messages older than 14 days', () => {
    const thread = makeThread([
      { id: 'm1', slackUserId: 'U-a', text: 'Has this been deployed to production yet?', sentAt: daysAgo(15) },
    ]);
    expect(detectOpenQuestions([thread], NOW)).toHaveLength(0);
  });

  it('considers a question answered when 2+ different users reply after it', () => {
    const questionTime = daysAgo(3);
    const thread = makeThread([
      { id: 'm1', slackUserId: 'U-alice', text: 'Can someone review the PR before end of day?', sentAt: questionTime },
      { id: 'm2', slackUserId: 'U-bob', text: 'Sure, looking at it now', sentAt: new Date(questionTime.getTime() + 60_000) },
      { id: 'm3', slackUserId: 'U-carol', text: 'Reviewing it as well', sentAt: new Date(questionTime.getTime() + 120_000) },
    ]);
    expect(detectOpenQuestions([thread], NOW)).toHaveLength(0);
  });

  it('does NOT consider a question answered when only 1 user replies', () => {
    const questionTime = daysAgo(3);
    const thread = makeThread([
      { id: 'm1', slackUserId: 'U-alice', text: 'Can someone review the PR before end of day?', sentAt: questionTime },
      { id: 'm2', slackUserId: 'U-bob', text: 'Sure, looking now', sentAt: new Date(questionTime.getTime() + 60_000) },
    ]);
    // Only 1 unique replier → still open
    expect(detectOpenQuestions([thread], NOW)).toHaveLength(1);
  });

  it('does NOT consider a question answered when the same user replies twice', () => {
    const questionTime = daysAgo(3);
    const thread = makeThread([
      { id: 'm1', slackUserId: 'U-alice', text: 'What is the ETA for the backend fix?', sentAt: questionTime },
      { id: 'm2', slackUserId: 'U-alice', text: 'Actually I meant in staging', sentAt: new Date(questionTime.getTime() + 60_000) },
      { id: 'm3', slackUserId: 'U-alice', text: 'Bump — still no reply from the team', sentAt: new Date(questionTime.getTime() + 120_000) },
    ]);
    // Same user replies — uniqueRepliers.size = 0, so question is not considered answered
    expect(detectOpenQuestions([thread], NOW)).toHaveLength(1);
  });

  it('caps results at 5', () => {
    // All messages from the same user so no "replies" exist → all 8 are unanswered, capped at 5
    const messages = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      slackUserId: 'U-solo',
      text: `What is the status of item number ${i} in the backlog?`,
      sentAt: daysAgo(i + 1),
    }));
    const thread = makeThread(messages);
    expect(detectOpenQuestions([thread], NOW)).toHaveLength(5);
  });

  it('sorts by most recent first', () => {
    const thread = makeThread([
      { id: 'm1', slackUserId: 'U-a', text: 'What is the oldest open question here?', sentAt: daysAgo(5) },
      { id: 'm2', slackUserId: 'U-b', text: 'What is the newest question we have here?', sentAt: daysAgo(1) },
    ]);
    const results = detectOpenQuestions([thread], NOW);
    expect(results[0].sentAt.getTime()).toBeGreaterThan(results[1].sentAt.getTime());
  });

  it('includes slackUserId and sentAt', () => {
    const thread = makeThread([
      { id: 'm1', slackUserId: 'U-zara', text: 'When will the infra ticket be resolved?', sentAt: daysAgo(2) },
    ]);
    const results = detectOpenQuestions([thread], NOW);
    expect(results[0].slackUserId).toBe('U-zara');
    expect(results[0].sentAt).toBeInstanceOf(Date);
  });
});
