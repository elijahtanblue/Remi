import { describe, it, expect } from 'vitest';
import { detectBlockers } from '@remi/email';
import type { EmailThreadSignals } from '@remi/email';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSignals(overrides?: Partial<EmailThreadSignals>): EmailThreadSignals {
  return {
    subject: 'Q3 integration update',
    latestBodySnippet: '',
    participants: [
      { emailAddress: 'alice@internal.com', role: 'from' },
      { emailAddress: 'bob@vendor.io', role: 'to' },
    ],
    messageCount: 3,
    daysSinceLastReply: 0,
    hasExecutiveEscalation: false,
    hasCrossTeamParticipants: false,
    customBlockerKeywords: [],
    ...overrides,
  };
}

// ─── Escalation ───────────────────────────────────────────────────────────────

describe('detectBlockers — escalation', () => {
  it('flags escalation when executive was added mid-thread', () => {
    const blockers = detectBlockers(makeSignals({ hasExecutiveEscalation: true }));
    expect(blockers.some(b => b.kind === 'escalation')).toBe(true);
  });

  it('does not flag escalation when hasExecutiveEscalation is false', () => {
    const blockers = detectBlockers(makeSignals({ hasExecutiveEscalation: false }));
    expect(blockers.some(b => b.kind === 'escalation')).toBe(false);
  });
});

// ─── Waiting on approval ──────────────────────────────────────────────────────

describe('detectBlockers — waiting_on_approval', () => {
  it('detects "pending approval" in subject', () => {
    const blockers = detectBlockers(makeSignals({ subject: 'Contract pending approval from legal' }));
    expect(blockers.some(b => b.kind === 'waiting_on_approval')).toBe(true);
  });

  it('detects "need sign-off" in body snippet', () => {
    const blockers = detectBlockers(makeSignals({ latestBodySnippet: 'We still need sign-off from procurement.' }));
    expect(blockers.some(b => b.kind === 'waiting_on_approval')).toBe(true);
  });

  it('detects "awaiting approval" case-insensitively', () => {
    const blockers = detectBlockers(makeSignals({ latestBodySnippet: 'AWAITING APPROVAL from the CTO.' }));
    expect(blockers.some(b => b.kind === 'waiting_on_approval')).toBe(true);
  });
});

// ─── Waiting on response ──────────────────────────────────────────────────────

describe('detectBlockers — waiting_on_response', () => {
  it('detects "no response" in body', () => {
    const blockers = detectBlockers(makeSignals({ latestBodySnippet: 'There has been no response from the vendor.' }));
    expect(blockers.some(b => b.kind === 'waiting_on_response')).toBe(true);
  });

  it('detects "following up" pattern', () => {
    const blockers = detectBlockers(makeSignals({ latestBodySnippet: 'Following up on my earlier message.' }));
    expect(blockers.some(b => b.kind === 'waiting_on_response')).toBe(true);
  });

  it('does not produce waiting_on_response when approval pattern matches instead', () => {
    // approval takes priority due to else-if ordering
    const blockers = detectBlockers(makeSignals({ latestBodySnippet: 'Awaiting approval — following up.' }));
    expect(blockers.some(b => b.kind === 'waiting_on_approval')).toBe(true);
    expect(blockers.some(b => b.kind === 'waiting_on_response')).toBe(false);
  });

  it('does not flag waiting_on_response when negated ("not waiting on")', () => {
    const blockers = detectBlockers(makeSignals({ latestBodySnippet: 'We are not waiting on anyone at this time.' }));
    expect(blockers.some(b => b.kind === 'waiting_on_response')).toBe(false);
  });

  it('does not flag waiting_on_approval when negated ("not pending approval")', () => {
    const blockers = detectBlockers(makeSignals({ latestBodySnippet: 'This is not pending approval anymore.' }));
    expect(blockers.some(b => b.kind === 'waiting_on_approval')).toBe(false);
  });
});

// ─── Stale thread ─────────────────────────────────────────────────────────────

describe('detectBlockers — stale_thread', () => {
  it('flags stale when daysSinceLastReply >= 3 and messageCount > 1', () => {
    const blockers = detectBlockers(makeSignals({ daysSinceLastReply: 3, messageCount: 2 }));
    expect(blockers.some(b => b.kind === 'stale_thread')).toBe(true);
  });

  it('does not flag stale for single-message threads', () => {
    const blockers = detectBlockers(makeSignals({ daysSinceLastReply: 10, messageCount: 1 }));
    expect(blockers.some(b => b.kind === 'stale_thread')).toBe(false);
  });

  it('does not flag stale when under threshold', () => {
    const blockers = detectBlockers(makeSignals({ daysSinceLastReply: 2, messageCount: 5 }));
    expect(blockers.some(b => b.kind === 'stale_thread')).toBe(false);
  });

  it('stale summary includes the day count', () => {
    const blockers = detectBlockers(makeSignals({ daysSinceLastReply: 7, messageCount: 4 }));
    const stale = blockers.find(b => b.kind === 'stale_thread');
    expect(stale?.summary).toContain('7');
  });
});

// ─── Missing owner ────────────────────────────────────────────────────────────

describe('detectBlockers — missing_owner', () => {
  it('detects "who owns" pattern', () => {
    const blockers = detectBlockers(makeSignals({ latestBodySnippet: 'Who owns this deliverable?' }));
    expect(blockers.some(b => b.kind === 'missing_owner')).toBe(true);
  });

  it('detects "no owner" pattern', () => {
    const blockers = detectBlockers(makeSignals({ subject: 'No owner assigned for this task' }));
    expect(blockers.some(b => b.kind === 'missing_owner')).toBe(true);
  });

  it('missing_owner ownerEmails is empty', () => {
    const blockers = detectBlockers(makeSignals({ latestBodySnippet: 'unassigned — who is responsible?' }));
    const mo = blockers.find(b => b.kind === 'missing_owner');
    expect(mo?.ownerEmails).toEqual([]);
  });
});

// ─── Soft risk ────────────────────────────────────────────────────────────────

describe('detectBlockers — soft_risk', () => {
  it('flags soft_risk for cross-team thread with risk signal', () => {
    const blockers = detectBlockers(makeSignals({
      hasCrossTeamParticipants: true,
      latestBodySnippet: 'This is at risk of slipping past the deadline.',
    }));
    expect(blockers.some(b => b.kind === 'soft_risk')).toBe(true);
  });

  it('does not flag soft_risk for cross-team thread with no risk keywords', () => {
    const blockers = detectBlockers(makeSignals({
      hasCrossTeamParticipants: true,
      latestBodySnippet: 'Everything looks good, syncing tomorrow.',
    }));
    expect(blockers.some(b => b.kind === 'soft_risk')).toBe(false);
  });

  it('custom keyword triggers soft_risk', () => {
    const blockers = detectBlockers(makeSignals({
      customBlockerKeywords: ['vendor delay'],
      latestBodySnippet: 'There has been a vendor delay on our shipment.',
    }));
    expect(blockers.some(b => b.kind === 'soft_risk')).toBe(true);
  });

  it('custom keyword match includes keyword in summary', () => {
    const blockers = detectBlockers(makeSignals({
      customBlockerKeywords: ['critical path'],
      subject: 'Issue on critical path for release',
    }));
    const sr = blockers.find(b => b.kind === 'soft_risk');
    expect(sr?.summary).toContain('critical path');
  });
});

// ─── Multiple blockers in one thread ─────────────────────────────────────────

describe('detectBlockers — multiple blockers', () => {
  it('can return multiple blocker kinds for the same thread', () => {
    const blockers = detectBlockers(makeSignals({
      subject: 'pending approval — no response from legal',
      daysSinceLastReply: 5,
      messageCount: 3,
      hasExecutiveEscalation: true,
    }));
    const kinds = blockers.map(b => b.kind);
    expect(kinds).toContain('escalation');
    expect(kinds).toContain('waiting_on_approval');
    expect(kinds).toContain('stale_thread');
  });
});

// ─── Clean thread — no blockers ───────────────────────────────────────────────

describe('detectBlockers — clean thread', () => {
  it('returns empty array for a thread with no blocker signals', () => {
    const blockers = detectBlockers(makeSignals({
      subject: 'Weekly sync notes',
      latestBodySnippet: 'Great call everyone. Action items captured in Jira.',
      daysSinceLastReply: 0,
      messageCount: 2,
    }));
    expect(blockers).toHaveLength(0);
  });
});

// ─── ownerEmails derived from "from" participants ─────────────────────────────

describe('detectBlockers — ownerEmails', () => {
  it('populates ownerEmails from "from" participants', () => {
    const blockers = detectBlockers(makeSignals({
      latestBodySnippet: 'no response from the team',
      participants: [
        { emailAddress: 'sender@internal.com', role: 'from' },
        { emailAddress: 'receiver@vendor.io', role: 'to' },
      ],
    }));
    const b = blockers.find(b => b.kind === 'waiting_on_response');
    expect(b?.ownerEmails).toContain('sender@internal.com');
    expect(b?.ownerEmails).not.toContain('receiver@vendor.io');
  });
});
