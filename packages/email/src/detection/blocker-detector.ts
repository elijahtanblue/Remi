import type { EmailBlockerKind, EmailParticipant } from '@remi/shared';

export interface DetectedBlocker {
  kind: EmailBlockerKind;
  summary: string;
  ownerEmails: string[];
}

export interface EmailThreadSignals {
  subject: string;
  /** Latest message body text, or empty string for signals_only retention. */
  latestBodySnippet: string;
  participants: EmailParticipant[];
  messageCount: number;
  daysSinceLastReply: number;
  /** True when a participant with roleLevel VP or CEO was added mid-thread (not in first message). */
  hasExecutiveEscalation: boolean;
  /** True when participants span more than one internal department/team. */
  hasCrossTeamParticipants: boolean;
  /** Admin-configured keywords to flag as blockers. */
  customBlockerKeywords: string[];
}

// ─── Hard-blocker keyword sets ────────────────────────────────────────────────

const WAITING_ON_RESPONSE_PATTERNS = [
  'no response',
  'waiting on',
  'waiting for',
  'haven\'t heard back',
  'have not heard back',
  'still waiting',
  'no reply',
  'unresponsive',
  'can you please respond',
  'following up',
  'follow up',
  'circling back',
  'any update',
  'any news',
];

const WAITING_ON_APPROVAL_PATTERNS = [
  'pending approval',
  'needs approval',
  'need sign-off',
  'sign-off required',
  'waiting for approval',
  'waiting on approval',
  'awaiting approval',
  'not yet approved',
  'pending review',
  'awaiting sign off',
];

const STALE_THREAD_DAYS = 3;

const MISSING_OWNER_PATTERNS = [
  'who owns',
  'who is responsible',
  'no owner',
  'unassigned',
  'not assigned',
  'nobody is working',
  'unclear owner',
];

const SOFT_RISK_PATTERNS = [
  'at risk',
  'concern',
  'delayed',
  'delay',
  'behind schedule',
  'slipping',
  'might miss',
  'could be a problem',
  'heads up',
  'potential issue',
  'flag',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Words that, when immediately preceding a matched pattern, negate it. */
const NEGATION_WORDS = [
  'not ', "n't ", 'never ', 'no longer ', "don't ", "doesn't ",
  "didn't ", "isn't ", "aren't ", "haven't ", "hasn't ", 'without ',
];

/**
 * Returns true only if `text` contains a pattern from `patterns` AND the
 * match is not immediately preceded by a negation word. This prevents
 * false positives like "we are NOT waiting on a response".
 */
function matchesAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => {
    const idx = lower.indexOf(p);
    if (idx === -1) return false;
    // Check the 25 characters before the match for a negation word
    const window = lower.slice(Math.max(0, idx - 25), idx);
    return !NEGATION_WORDS.some((neg) => window.endsWith(neg) || window.includes(neg));
  });
}

function fromParticipants(participants: EmailParticipant[]): string[] {
  return participants
    .filter((p) => p.role === 'from')
    .map((p) => p.emailAddress);
}

// ─── Detector ────────────────────────────────────────────────────────────────

/**
 * Analyses thread signals and returns all detected blockers.
 * A thread may have multiple blockers of different kinds.
 * Returns an empty array when no blockers are detected.
 */
export function detectBlockers(signals: EmailThreadSignals): DetectedBlocker[] {
  const blockers: DetectedBlocker[] = [];
  const searchText = `${signals.subject} ${signals.latestBodySnippet}`;
  const owners = fromParticipants(signals.participants);

  // 1. Escalation — executive CC'd mid-thread
  if (signals.hasExecutiveEscalation) {
    blockers.push({
      kind: 'escalation',
      summary: 'An executive was escalated into this thread, indicating an unresolved blocker.',
      ownerEmails: owners,
    });
  }

  // 2. Waiting on approval
  if (matchesAny(searchText, WAITING_ON_APPROVAL_PATTERNS)) {
    blockers.push({
      kind: 'waiting_on_approval',
      summary: 'Thread indicates approval or sign-off is pending.',
      ownerEmails: owners,
    });
  }

  // 3. Waiting on response
  else if (matchesAny(searchText, WAITING_ON_RESPONSE_PATTERNS)) {
    blockers.push({
      kind: 'waiting_on_response',
      summary: 'Thread indicates a response is being waited on.',
      ownerEmails: owners,
    });
  }

  // 4. Missing owner
  if (matchesAny(searchText, MISSING_OWNER_PATTERNS)) {
    blockers.push({
      kind: 'missing_owner',
      summary: 'No clear owner has been identified for this thread.',
      ownerEmails: [],
    });
  }

  // 5. Stale thread (no reply within threshold)
  if (
    signals.daysSinceLastReply >= STALE_THREAD_DAYS &&
    signals.messageCount > 1
  ) {
    blockers.push({
      kind: 'stale_thread',
      summary: `Thread has had no reply for ${signals.daysSinceLastReply} days.`,
      ownerEmails: owners,
    });
  }

  // 6. Cross-team dependency gap
  if (signals.hasCrossTeamParticipants && blockers.length === 0) {
    // Only flag as soft_risk if no harder blocker already detected
    if (matchesAny(searchText, SOFT_RISK_PATTERNS)) {
      blockers.push({
        kind: 'soft_risk',
        summary: 'Cross-team thread contains risk signals suggesting a potential blocker.',
        ownerEmails: owners,
      });
    }
  }

  // 7. Custom admin-configured keywords → soft_risk
  const customMatch = signals.customBlockerKeywords.find((kw) =>
    searchText.toLowerCase().includes(kw.toLowerCase()),
  );
  if (customMatch && !blockers.some((b) => b.kind === 'soft_risk')) {
    blockers.push({
      kind: 'soft_risk',
      summary: `Thread matched custom blocker keyword: "${customMatch}".`,
      ownerEmails: owners,
    });
  }

  return blockers;
}
