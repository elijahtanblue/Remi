import { describe, it, expect } from 'vitest';
import { shouldTriggerSummary } from '../../packages/summary-engine/src/triggers.js';

describe('shouldTriggerSummary', () => {
  it('triggers on status_changed', () => {
    const result = shouldTriggerSummary({ eventType: 'status_changed', hasLinkedThreads: false });
    expect(result.should).toBe(true);
    expect(result.reason).toBe('status_change');
  });

  it('triggers on assignee_changed', () => {
    const result = shouldTriggerSummary({ eventType: 'assignee_changed', hasLinkedThreads: false });
    expect(result.should).toBe(true);
    expect(result.reason).toBe('assignee_change');
  });

  it('triggers on priority_changed', () => {
    const result = shouldTriggerSummary({ eventType: 'priority_changed', hasLinkedThreads: false });
    expect(result.should).toBe(true);
    expect(result.reason).toBe('priority_change');
  });

  it('triggers on slack_activity when hasLinkedThreads is true', () => {
    const result = shouldTriggerSummary({ eventType: 'slack_activity', hasLinkedThreads: true });
    expect(result.should).toBe(true);
    expect(result.reason).toBe('slack_activity');
  });

  it('does NOT trigger on slack_activity when hasLinkedThreads is false', () => {
    const result = shouldTriggerSummary({ eventType: 'slack_activity', hasLinkedThreads: false });
    expect(result.should).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('does NOT trigger on unknown event types', () => {
    const result = shouldTriggerSummary({ eventType: 'comment_added', hasLinkedThreads: true });
    expect(result.should).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('does NOT trigger when eventType is undefined', () => {
    const result = shouldTriggerSummary({ hasLinkedThreads: true });
    expect(result.should).toBe(false);
    expect(result.reason).toBeNull();
  });
});
