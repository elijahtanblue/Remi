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

  const missingSignals: string[] = [];

  if (missingOwner) {
    missingSignals.push('No assignee');
  }

  if (threads.length === 0) {
    missingSignals.push('No linked Slack threads');
  }

  if (blockers.length > 0) {
    missingSignals.push(`${blockers.length} probable blocker(s) detected`);
  }

  if (openQuestions.length > 0) {
    missingSignals.push(`${openQuestions.length} open question(s) unresolved`);
  }

  if (statusDriftDetected) {
    missingSignals.push('Status has not changed despite recent Slack activity');
  }

  if (missingHandoff) {
    missingSignals.push('Assignee changed recently with no handoff comment');
  }

  const isDone =
    issue.statusCategory?.toLowerCase() === 'done' ||
    issue.status?.toLowerCase() === 'done';
  if (isDone && openQuestions.length > 0) {
    missingSignals.push('Issue marked done but open questions remain');
  }

  // Recommended next step based on highest-impact signal
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

  return { recommendedNextStep, missingSignals };
}
