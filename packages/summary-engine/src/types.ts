export interface IssueSnapshot {
  id: string;
  jiraIssueKey: string;
  title: string;
  status: string | null;
  statusCategory: string | null;
  assigneeJiraAccountId: string | null;
  priority: string | null;
  updatedAt: Date;
}

export interface IssueEventRecord {
  id: string;
  eventType: string;
  changedFields: Record<string, unknown> | null;
  actorExternalId: string | null;
  occurredAt: Date;
}

export interface SlackMessageRecord {
  id: string;
  slackUserId: string;
  text: string;
  sentAt: Date;
}

export interface ThreadData {
  id: string;
  channelId: string;
  messages: SlackMessageRecord[];
}

export interface CollectedData {
  issue: IssueSnapshot;
  events: IssueEventRecord[];
  threads: ThreadData[];
}

export interface AnalysisResult {
  latestImportantChanges: Array<{
    field: string;
    from: string | null;
    to: string | null;
    at: Date;
    actor: string | null;
  }>;
  previousAssignee: string | null;
  probableBlockers: Array<{
    text: string;
    slackUserId: string;
    sentAt: Date;
    matchedKeyword: string;
  }>;
  openQuestions: Array<{
    text: string;
    slackUserId: string;
    sentAt: Date;
  }>;
  statusDriftDetected: boolean;
  missingOwner: boolean;
  missingHandoff: boolean;
  completionMismatch: boolean;
  totalMessages: number;
  uniqueParticipants: number;
}
