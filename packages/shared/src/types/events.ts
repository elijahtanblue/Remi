// ─── Base Queue Message ───

export interface BaseQueueMessage {
  id: string;
  idempotencyKey: string;
  workspaceId: string;
  timestamp: string;
}

// ─── Slack Events ───

export interface SlackEventMessage extends BaseQueueMessage {
  type: "slack_event";
  payload: {
    kind: "message" | "app_home_opened" | "message_changed";
    teamId: string;
    channelId: string;
    userId: string;
    threadTs?: string;
    messageTs: string;
    text?: string;
    rawEvent: Record<string, unknown>;
  };
}

// ─── Jira Events ───

export interface JiraEventMessage extends BaseQueueMessage {
  type: "jira_event";
  payload: {
    kind:
      | "issue_updated"
      | "issue_created"
      | "comment_created"
      | "comment_updated";
    jiraSiteId: string;
    issueId: string;
    issueKey: string;
    webhookEventType: string;
    rawEvent: Record<string, unknown>;
  };
}

// ─── Summary Job ───

export interface SummaryJobMessage extends BaseQueueMessage {
  type: "summary_job";
  payload: {
    issueId: string;
    triggerReason: string;
    summaryRunId?: string;
    force?: boolean;
  };
}

// ─── Backfill Job ───

export interface BackfillJobMessage extends BaseQueueMessage {
  type: "backfill_job";
  payload: {
    kind: "jira_issue_backfill" | "slack_thread_backfill";
    issueId?: string;
    threadId?: string;
    linkId: string;
  };
}

// ─── Memory Jobs ───

export interface MemoryExtractMessage extends BaseQueueMessage {
  type: 'memory_extract';
  payload: {
    memoryUnitId: string;
    sourceType: 'slack_message' | 'jira_event' | 'email_message';
    sourceId: string;
  };
}

export interface MemorySnapshotMessage extends BaseQueueMessage {
  type: 'memory_snapshot';
  payload: {
    memoryUnitId: string;
  };
}

export interface MemoryWritebackProposeMessage extends BaseQueueMessage {
  type: 'memory_writeback_propose';
  payload: {
    memoryUnitId: string;
    snapshotId: string;
  };
}

export interface MemoryWritebackApplyMessage extends BaseQueueMessage {
  type: 'memory_writeback_apply';
  payload: {
    proposalId: string;
  };
}

// ─── Doc Generate Job ───

export interface DocGenerateJobMessage extends BaseQueueMessage {
  type: 'doc_generate_job';
  payload: {
    issueId: string;
    issueKey: string;
    docType: 'handoff' | 'summary' | 'escalation';
    /** Set for manual /doc commands — channel to post the reply into */
    replyChannelId?: string;
    replyThreadTs?: string;
    /** Set for auto-triggered docs — most recently active linked Slack channel */
    triggerChannelId?: string | null;
    /** True when generated automatically by a Jira status change, not a /doc command */
    autoTriggered?: boolean;
  };
}

// ─── Union ───

export type QueueMessage =
  | SlackEventMessage
  | JiraEventMessage
  | SummaryJobMessage
  | BackfillJobMessage
  | MemoryExtractMessage
  | MemorySnapshotMessage
  | MemoryWritebackProposeMessage
  | MemoryWritebackApplyMessage
  | DocGenerateJobMessage;
