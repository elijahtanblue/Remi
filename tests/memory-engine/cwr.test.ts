import { describe, expect, it } from 'vitest';
import {
  computeSnapshotSetHash,
  diffCwr,
  fingerprintNextStep,
} from '../../packages/memory-engine/src/pipeline/cwr.js';

describe('computeSnapshotSetHash', () => {
  it('produces the same hash for the same inputs regardless of order', () => {
    const snaps = [
      { memoryUnitId: 'mu2', version: 3 },
      { memoryUnitId: 'mu1', version: 2 },
    ];
    const jira = { status: 'In Progress', assigneeId: 'u1', priority: 'High' };

    const h1 = computeSnapshotSetHash(snaps, jira);
    const h2 = computeSnapshotSetHash([...snaps].reverse(), jira);
    expect(h1).toBe(h2);
  });

  it('produces different hashes when Jira status changes', () => {
    const snaps = [{ memoryUnitId: 'mu1', version: 1 }];
    const h1 = computeSnapshotSetHash(snaps, { status: 'Open', assigneeId: null, priority: null });
    const h2 = computeSnapshotSetHash(snaps, { status: 'Done', assigneeId: null, priority: null });
    expect(h1).not.toBe(h2);
  });
});

describe('fingerprintNextStep', () => {
  it('returns empty string for null', () => {
    expect(fingerprintNextStep(null)).toBe('');
  });

  it('normalises whitespace, case, and punctuation', () => {
    const a = fingerprintNextStep('Follow up with vendor.');
    const b = fingerprintNextStep('  follow up with Vendor! ');
    expect(a).toBe(b);
  });

  it('detects a meaningful change in content', () => {
    const a = fingerprintNextStep('Email the vendor');
    const b = fingerprintNextStep('Schedule a call');
    expect(a).not.toBe(b);
  });
});

describe('diffCwr', () => {
  const base = {
    id: 'cwr1',
    blockerSummary: null,
    ownerExternalId: 'u1',
    waitingOnType: null,
    waitingOnDescription: null,
    nextStep: 'Email vendor',
    isStale: false,
    lastJiraStatus: 'In Progress',
  };

  it('emits blocker_created when blockerSummary appears', () => {
    const events = diffCwr(
      base as any,
      { ...base, blockerSummary: 'Waiting on legal sign-off' } as any,
      'jira',
    );
    expect(events.some((e) => e.eventType === 'blocker_created')).toBe(true);
  });

  it('emits blocker_removed when blockerSummary clears', () => {
    const events = diffCwr(
      { ...base, blockerSummary: 'Old blocker' } as any,
      { ...base, blockerSummary: null } as any,
      'slack',
    );
    expect(events.some((e) => e.eventType === 'blocker_removed')).toBe(true);
  });

  it('emits owner_changed when ownerExternalId changes to new non-null value', () => {
    const events = diffCwr(base as any, { ...base, ownerExternalId: 'u2' } as any, 'jira');
    expect(events.some((e) => e.eventType === 'owner_changed')).toBe(true);
  });

  it('does NOT emit owner_changed when owner clears to null', () => {
    const events = diffCwr(base as any, { ...base, ownerExternalId: null } as any, 'jira');
    expect(events.some((e) => e.eventType === 'owner_changed')).toBe(false);
  });

  it('emits stale_detected when isStale flips to true', () => {
    const events = diffCwr(
      { ...base, isStale: false } as any,
      { ...base, isStale: true } as any,
      'slack',
    );
    expect(events.some((e) => e.eventType === 'stale_detected')).toBe(true);
  });

  it('emits status_changed using lastJiraStatus as from-value', () => {
    const events = diffCwr(
      { ...base, lastJiraStatus: 'In Progress' } as any,
      { ...base, lastJiraStatus: 'Done' } as any,
      'jira',
    );
    const evt = events.find((e) => e.eventType === 'status_changed');
    expect(evt).toBeDefined();
    expect((evt!.metadata as any).from).toBe('In Progress');
    expect((evt!.metadata as any).to).toBe('Done');
  });

  it('emits no events when nothing meaningful changed', () => {
    const events = diffCwr(base as any, base as any, 'jira');
    expect(events).toHaveLength(0);
  });
});
