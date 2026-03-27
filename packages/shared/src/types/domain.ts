// ─── Workspace ───

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SlackWorkspaceInstall {
  id: string;
  workspaceId: string;
  slackTeamId: string;
  slackTeamName: string;
  botToken: string;
  botUserId: string;
  installedBy: string;
  installedAt: Date;
  scopes: string[];
}

export interface JiraWorkspaceInstall {
  id: string;
  workspaceId: string;
  jiraSiteId: string;
  jiraSiteUrl: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  installedBy: string;
  installedAt: Date;
}

// ─── User ───

export interface User {
  id: string;
  workspaceId: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SlackUser {
  id: string;
  userId: string;
  slackTeamId: string;
  slackUserId: string;
  slackUsername: string;
  slackDisplayName: string;
}

export interface JiraUser {
  id: string;
  userId: string;
  jiraSiteId: string;
  jiraAccountId: string;
  jiraDisplayName: string;
  jiraEmail?: string;
}

export interface UserCrosswalk {
  id: string;
  userId: string;
  slackUserId?: string;
  jiraUserId?: string;
  resolvedAt: Date;
}

// ─── Issue ───

export interface Issue {
  id: string;
  workspaceId: string;
  jiraSiteId: string;
  issueKey: string;
  issueId: string;
  issueTitle: string;
  issueType: string;
  status: string;
  statusCategory: string;
  priority: string;
  assigneeAccountId?: string;
  reporterAccountId?: string;
  projectKey: string;
  labels: string[];
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt: Date;
}

export type IssueEventType =
  | "status_changed"
  | "assignee_changed"
  | "priority_changed"
  | "comment_added"
  | "issue_created";

export interface IssueEvent {
  id: string;
  workspaceId: string;
  issueId: string;
  eventType: IssueEventType;
  actorAccountId: string;
  fromValue?: string;
  toValue?: string;
  body?: string;
  occurredAt: Date;
  rawPayload?: Record<string, unknown>;
  createdAt: Date;
}

// ─── Slack Thread ───

export interface SlackThread {
  id: string;
  workspaceId: string;
  slackTeamId: string;
  channelId: string;
  threadTs: string;
  permalink?: string;
  participantCount: number;
  messageCount: number;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SlackMessage {
  id: string;
  workspaceId: string;
  threadId: string;
  slackTs: string;
  slackUserId: string;
  text: string;
  isEdited: boolean;
  postedAt: Date;
  createdAt: Date;
}

// ─── Link ───

export interface IssueThreadLink {
  id: string;
  workspaceId: string;
  issueId: string;
  threadId: string;
  linkedBy: string;
  linkedAt: Date;
  isActive: boolean;
}

// ─── Summary ───

export interface SummaryOutput {
  issueKey: string;
  issueTitle: string;
  currentStatus: string;
  assignee: string | null;
  previousAssignee: string | null;
  latestImportantChanges: string[];
  linkedThreadStats: {
    totalThreads: number;
    totalMessages: number;
    activeParticipants: number;
  };
  probableBlockers: string[];
  openQuestions: string[];
  recommendedNextStep: string;
  missingSignals: string[];
  generatedAt: Date;
}

export interface Summary {
  id: string;
  workspaceId: string;
  issueId: string;
  summaryRunId: string;
  output: SummaryOutput;
  modelVersion: string;
  createdAt: Date;
}

export interface SummaryRun {
  id: string;
  workspaceId: string;
  issueId: string;
  triggerReason: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  tokenUsage?: number;
  createdAt: Date;
}

// ─── Audit & Dead Letter ───

export interface AuditLog {
  id: string;
  workspaceId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface QueueDeadLetter {
  id: string;
  workspaceId: string;
  queueName: string;
  messageId: string;
  messageBody: Record<string, unknown>;
  errorMessage: string;
  retryCount: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
  createdAt: Date;
}
