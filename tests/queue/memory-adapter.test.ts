import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryQueueAdapter } from '../../packages/queue/src/memory-adapter.js';
import type { SummaryJobMessage } from '../../packages/shared/src/types/events.js';

// Safety net: always restore real timers after each test so fake-timer usage
// in one test cannot leak into subsequent tests if an assertion fails mid-test.
afterEach(() => {
  vi.useRealTimers();
});

function makeMsg(id: string, issueId = 'issue-1'): SummaryJobMessage {
  return {
    id,
    idempotencyKey: `key-${id}`,
    workspaceId: 'ws-001',
    timestamp: new Date().toISOString(),
    type: 'summary_job',
    payload: { issueId, triggerReason: 'status_change' },
  };
}

describe('MemoryQueueAdapter', () => {
  let adapter: MemoryQueueAdapter;

  beforeEach(() => {
    adapter = new MemoryQueueAdapter();
  });

  afterEach(async () => {
    await adapter.stop();
  });

  // ─── send ────────────────────────────────────────────────────────────────

  describe('send', () => {
    it('enqueues a message', async () => {
      await adapter.send('q1', makeMsg('msg-1'));
      expect(adapter.getQueueLength('q1')).toBe(1);
    });

    it('enqueues multiple messages to the same queue', async () => {
      await adapter.send('q1', makeMsg('msg-1'));
      await adapter.send('q1', makeMsg('msg-2'));
      expect(adapter.getQueueLength('q1')).toBe(2);
    });

    it('keeps queues isolated', async () => {
      await adapter.send('q1', makeMsg('msg-1'));
      await adapter.send('q2', makeMsg('msg-2'));
      expect(adapter.getQueueLength('q1')).toBe(1);
      expect(adapter.getQueueLength('q2')).toBe(1);
    });

    it('returns 0 for a queue that has never been used', () => {
      expect(adapter.getQueueLength('nonexistent')).toBe(0);
    });
  });

  // ─── sendBatch ───────────────────────────────────────────────────────────

  describe('sendBatch', () => {
    it('enqueues all messages in the batch', async () => {
      await adapter.sendBatch('q1', [makeMsg('a'), makeMsg('b'), makeMsg('c')]);
      expect(adapter.getQueueLength('q1')).toBe(3);
    });

    it('handles an empty batch without error', async () => {
      await adapter.sendBatch('q1', []);
      expect(adapter.getQueueLength('q1')).toBe(0);
    });
  });

  // ─── poll + handler ──────────────────────────────────────────────────────

  describe('poll', () => {
    it('invokes handler with the message and removes it from the queue', async () => {
      const received: string[] = [];
      await adapter.send('q1', makeMsg('msg-1'));

      adapter.poll('q1', async (msg) => {
        received.push(msg.id);
      });

      await new Promise((r) => setTimeout(r, 700));
      await adapter.stop();

      expect(received).toEqual(['msg-1']);
      expect(adapter.getQueueLength('q1')).toBe(0);
    });

    it('processes messages from multiple sends', async () => {
      const received: string[] = [];

      await adapter.send('q1', makeMsg('a'));
      await adapter.send('q1', makeMsg('b'));

      adapter.poll('q1', async (msg) => {
        received.push(msg.id);
      });

      await new Promise((r) => setTimeout(r, 800));
      await adapter.stop();

      expect(received.sort()).toEqual(['a', 'b']);
    });

    it('re-enqueues a failed message after visibility timeout', async () => {
      vi.useFakeTimers();

      let callCount = 0;
      await adapter.send('q1', makeMsg('retry-me'));

      adapter.poll('q1', async () => {
        callCount++;
        throw new Error('simulated failure');
      }, { visibilityTimeoutSeconds: 1 });

      // First poll fires at 500ms
      await vi.advanceTimersByTimeAsync(600);
      expect(callCount).toBe(1);
      expect(adapter.getQueueLength('q1')).toBe(0); // sitting in-flight
      expect(adapter.getInFlightCount('q1')).toBe(1);

      // Past visibility timeout → message re-enqueued
      await vi.advanceTimersByTimeAsync(1100);
      expect(adapter.getQueueLength('q1')).toBe(1);
      expect(adapter.getInFlightCount('q1')).toBe(0);

      vi.useRealTimers();
    });

    it('removes message from in-flight after successful processing', async () => {
      await adapter.send('q1', makeMsg('ok'));

      adapter.poll('q1', async () => {
        // success — no throw
      });

      await new Promise((r) => setTimeout(r, 700));
      await adapter.stop();

      expect(adapter.getInFlightCount('q1')).toBe(0);
      expect(adapter.getQueueLength('q1')).toBe(0);
    });
  });

  // ─── stop ────────────────────────────────────────────────────────────────

  describe('stop', () => {
    it('stops polling so new messages are not processed', async () => {
      let callCount = 0;

      adapter.poll('q1', async () => {
        callCount++;
      });

      await adapter.stop();

      // Send a message AFTER stop — should not be processed
      await adapter.send('q1', makeMsg('after-stop'));
      await new Promise((r) => setTimeout(r, 700));

      expect(callCount).toBe(0);
    });

    it('can be called multiple times without throwing', async () => {
      await adapter.stop();
      await expect(adapter.stop()).resolves.toBeUndefined();
    });
  });

  // ─── clear ───────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('empties all queues', async () => {
      await adapter.send('q1', makeMsg('a'));
      await adapter.send('q2', makeMsg('b'));
      adapter.clear();
      expect(adapter.getQueueLength('q1')).toBe(0);
      expect(adapter.getQueueLength('q2')).toBe(0);
    });
  });
});
