import { describe, it, expect } from 'vitest';
import { detectBlockers } from '../../packages/summary-engine/src/analyzers/blocker-detector.js';
import type { ThreadData } from '../../packages/summary-engine/src/types.js';

const NOW = new Date('2024-04-01T12:00:00Z');

function makeThread(messages: Array<{ text: string; daysAgo: number; userId?: string }>): ThreadData {
  return {
    id: 'thread-1',
    channelId: 'C-general',
    messages: messages.map((m, i) => ({
      id: `msg-${i}`,
      slackUserId: m.userId ?? 'U-alice',
      text: m.text,
      sentAt: new Date(NOW.getTime() - m.daysAgo * 86_400_000),
    })),
  };
}

describe('detectBlockers', () => {
  it('returns empty array when there are no threads', () => {
    expect(detectBlockers([], NOW)).toEqual([]);
  });

  it('returns empty array when no messages contain blocker keywords', () => {
    const thread = makeThread([{ text: 'Looking good, almost done', daysAgo: 1 }]);
    expect(detectBlockers([thread], NOW)).toEqual([]);
  });

  it('detects "blocked" keyword', () => {
    const thread = makeThread([{ text: 'I am blocked on the auth service', daysAgo: 1 }]);
    const results = detectBlockers([thread], NOW);
    expect(results).toHaveLength(1);
    expect(results[0].matchedKeyword).toBe('blocked');
    expect(results[0].text).toContain('blocked');
  });

  it('detects "stuck" keyword', () => {
    const thread = makeThread([{ text: 'We are stuck waiting for DB access', daysAgo: 2 }]);
    const results = detectBlockers([thread], NOW);
    expect(results).toHaveLength(1);
    expect(results[0].matchedKeyword).toBe('stuck');
  });

  it('detects "waiting on" keyword', () => {
    const thread = makeThread([{ text: 'waiting on approval from legal', daysAgo: 1 }]);
    const results = detectBlockers([thread], NOW);
    expect(results).toHaveLength(1);
    expect(results[0].matchedKeyword).toBe('waiting on');
  });

  it('is case-insensitive', () => {
    const thread = makeThread([{ text: 'BLOCKED by infrastructure team', daysAgo: 1 }]);
    expect(detectBlockers([thread], NOW)).toHaveLength(1);
  });

  it('ignores messages older than 14 days', () => {
    const thread = makeThread([{ text: 'we were blocked last sprint', daysAgo: 15 }]);
    expect(detectBlockers([thread], NOW)).toHaveLength(0);
  });

  it('includes messages exactly at the 14-day cutoff boundary', () => {
    // exactly 14 days ago = cutoff boundary; sentAt < cutoff means excluded
    // at exactly 14 days sentAt == cutoff, which is NOT < cutoff, so included
    const thread = makeThread([{ text: 'still blocked on this', daysAgo: 14 }]);
    expect(detectBlockers([thread], NOW)).toHaveLength(1);
  });

  it('caps results at 5 even with many blocker messages', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      text: `message ${i}: blocked on item`,
      daysAgo: i,
    }));
    const thread = makeThread(messages);
    const results = detectBlockers([thread], NOW);
    expect(results).toHaveLength(5);
  });

  it('sorts results by most recent first', () => {
    const thread = makeThread([
      { text: 'older blocker: blocked', daysAgo: 5 },
      { text: 'newer blocker: blocked', daysAgo: 1 },
      { text: 'mid blocker: blocked', daysAgo: 3 },
    ]);
    const results = detectBlockers([thread], NOW);
    expect(results[0].text).toContain('newer');
    expect(results[1].text).toContain('mid');
    expect(results[2].text).toContain('older');
  });

  it('only matches one keyword per message (breaks after first match)', () => {
    const thread = makeThread([
      { text: 'blocked and stuck and on hold', daysAgo: 1 },
    ]);
    const results = detectBlockers([thread], NOW);
    expect(results).toHaveLength(1); // single entry even though 3 keywords match
  });

  it('includes slackUserId and sentAt in result', () => {
    const thread = makeThread([{ text: 'blocked on deployment', daysAgo: 2, userId: 'U-bob' }]);
    const results = detectBlockers([thread], NOW);
    expect(results[0].slackUserId).toBe('U-bob');
    expect(results[0].sentAt).toBeInstanceOf(Date);
  });

  it('scans messages across multiple threads', () => {
    const t1 = makeThread([{ text: 'blocked here', daysAgo: 1 }]);
    const t2: ThreadData = {
      id: 'thread-2',
      channelId: 'C-eng',
      messages: [{ id: 'mx', slackUserId: 'U-carol', text: 'stuck on infra', sentAt: new Date(NOW.getTime() - 86_400_000 * 2) }],
    };
    const results = detectBlockers([t1, t2], NOW);
    expect(results).toHaveLength(2);
  });
});
