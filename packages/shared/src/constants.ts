// ─── Event Types ───

export enum EventType {
  StatusChanged = "status_changed",
  AssigneeChanged = "assignee_changed",
  PriorityChanged = "priority_changed",
  CommentAdded = "comment_added",
  IssueCreated = "issue_created",
}

// ─── Queue Names ───

export const QueueNames = {
  SLACK_EVENTS: "slack-events",
  JIRA_EVENTS: "jira-events",
  SUMMARY_JOBS: "summary-jobs",
  BACKFILL_JOBS: "backfill-jobs",
  DEAD_LETTER: "dead-letter",
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

// ─── Jira Status Categories ───

export const JiraStatusCategory = {
  TODO: "new",
  IN_PROGRESS: "indeterminate",
  DONE: "done",
} as const;

export type JiraStatusCategoryValue =
  (typeof JiraStatusCategory)[keyof typeof JiraStatusCategory];

// ─── Trigger Reasons ───

export const TriggerReason = {
  STATUS_CHANGE: "status_change",
  ASSIGNEE_CHANGE: "assignee_change",
  PRIORITY_CHANGE: "priority_change",
  NEW_COMMENT: "new_comment",
  SLACK_ACTIVITY: "slack_activity",
  MANUAL_REQUEST: "manual_request",
  SCHEDULED: "scheduled",
  BACKFILL_COMPLETE: "backfill_complete",
} as const;

export type TriggerReasonValue =
  (typeof TriggerReason)[keyof typeof TriggerReason];

// ─── Blocker Keywords ───

export const BLOCKER_KEYWORDS = [
  "blocked",
  "blocker",
  "blocking",
  "stuck",
  "waiting on",
  "waiting for",
  "depends on",
  "dependency",
  "can't proceed",
  "cannot proceed",
  "need help",
  "needs help",
  "impediment",
  "bottleneck",
  "held up",
  "on hold",
  "no response",
  "unresponsive",
] as const;
