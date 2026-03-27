import type { IssueSnapshot, ThreadData } from '../types.js';

export interface CompletenessParams {
  issue: IssueSnapshot;
  threads: ThreadData[];
  blockers: unknown[];
  openQuestions: unknown[];
  statusDriftDetected: boolean;
  missingOwner: boolean;
  missingHandoff: boolean;
}

export function scoreCompleteness(params: CompletenessParams): {
  score: number;
  recommendedNextStep: string;
  missingSignals: string[];
} {
  const {
    issue,
    threads,
    blockers,
    openQuestions,
    statusDriftDetected,
    missingOwner,
    missingHandoff,
  } = params;

  let score = 100;
  const missingSignals: string[] = [];

  if (missingOwner) {
    score -= 20;
    missingSignals.push('No assignee');
  }

  if (threads.length === 0) {
    score -= 15;
    missingSignals.push('No linked Slack threads');
  }

  const blockerPenalty = Math.min(blockers.length * 10, 30);
  if (blockerPenalty > 0) {
    score -= blockerPenalty;
    missingSignals.push(`${blockers.length} probable blocker(s) detected`);
  }

  const questionPenalty = Math.min(openQuestions.length * 5, 20);
  if (questionPenalty > 0) {
    score -= questionPenalty;
    missingSignals.push(`${openQuestions.length} open question(s) unresolved`);
  }

  if (statusDriftDetected) {
    score -= 10;
    missingSignals.push('Status has not changed despite recent Slack activity');
  }

  if (missingHandoff) {
    score -= 15;
    missingSignals.push('Assignee changed recently with no handoff comment');
  }

  // Completion mismatch: status is "done" but open questions exist
  const isDone =
    issue.statusCategory?.toLowerCase() === 'done' ||
    issue.status?.toLowerCase() === 'done';
  const completionMismatch = isDone && openQuestions.length > 0;
  if (completionMismatch) {
    score -= 10;
    missingSignals.push('Issue marked done but open questions remain');
  }

  score = Math.max(0, Math.min(100, score));

  // Determine recommended next step based on highest-impact signal
  let recommendedNextStep: string;
  if (missingOwner) {
    recommendedNextStep = 'Assign an owner to this issue';
  } else if (blockers.length > 0) {
    recommendedNextStep = 'Resolve the identified blockers';
  } else if (openQuestions.length > 0) {
    recommendedNextStep = 'Address the open questions in the Slack thread';
  } else if (missingHandoff) {
    recommendedNextStep = 'Add a handoff comment when changing assignee';
  } else if (statusDriftDetected) {
    recommendedNextStep = 'Update the Jira status to reflect current progress';
  } else {
    recommendedNextStep = 'No immediate action required';
  }

  return { score, recommendedNextStep, missingSignals };
}
