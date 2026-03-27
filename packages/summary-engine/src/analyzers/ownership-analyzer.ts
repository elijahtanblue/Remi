import type { IssueSnapshot, IssueEventRecord } from '../types.js';

const MS_PER_DAY = 86_400_000;

export function analyzeOwnership(
  issue: IssueSnapshot,
  events: IssueEventRecord[],
  now: Date = new Date(),
): { missingOwner: boolean; missingHandoff: boolean } {
  const missingOwner = issue.assigneeJiraAccountId === null;

  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY);

  const recentAssigneeChange = events.some(
    (e) => e.eventType === 'assignee_changed' && e.occurredAt >= sevenDaysAgo,
  );

  const recentHandoffNote = events.some(
    (e) => e.eventType === 'comment_added' && e.occurredAt >= sevenDaysAgo,
  );

  const missingHandoff = recentAssigneeChange && !recentHandoffNote;

  return { missingOwner, missingHandoff };
}
