import type { SummaryOutput } from "./domain.js";

// ─── Link Ticket ───

export interface LinkTicketRequest {
  issueKey: string;
  channelId: string;
  threadTs: string;
  slackTeamId: string;
}

export interface LinkTicketResponse {
  linkId: string;
  issueKey: string;
  issueTitle: string;
}

// ─── Brief ───

export interface BriefRequest {
  issueKey: string;
}

export interface BriefResponse {
  summary: SummaryOutput | null;
}

// ─── Pagination ───

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Error ───

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ─── Coordination Platform ────────────────────────────────────────────────────

export type DataSource = 'slack' | 'jira' | 'email'

export type WaitingOnType =
  | 'internal_person'
  | 'internal_team'
  | 'external_vendor'
  | 'external_customer'
  | 'approval'

export type MeaningfulEventType =
  | 'blocker_created'
  | 'blocker_removed'
  | 'owner_changed'
  | 'waiting_on_changed'
  | 'next_step_changed'
  | 'external_reply_received'
  | 'status_changed'
  | 'stale_detected'
  | 'stale_resolved'

export type QueueSection = 'needs_action' | 'recently_changed' | 'awaiting_approval'

export interface OpenQuestion {
  id?: string
  content: string
  source: DataSource
  sourceRef?: string
  sourceUrl?: string
  askedAt?: string
  ownerName?: string
  status: 'open' | 'answered' | 'superseded'
}

export interface CWRSummary {
  currentState: string
  ownerDisplayName: string | null
  ownerExternalId: string | null
  blockerSummary: string | null
  waitingOnType: WaitingOnType | null
  waitingOnDescription: string | null
  nextStep: string | null
  riskScore: number
  urgencyReason: string | null
  isStale: boolean
  staleSince: string | null
  sourceFreshnessAt: string
  lastMeaningfulChangeAt: string | null
  lastMeaningfulChangeSummary: string | null
  dataSources: DataSource[]
  confidence: number
}

export interface CWRDetail extends CWRSummary {
  ownerSource: DataSource | null
  blockerDetectedAt: string | null
  openQuestions: OpenQuestion[]
  generatedAt: string
  updatedAt: string
}

export interface IssueQueueItem {
  id: string
  jiraIssueKey: string
  jiraIssueUrl: string
  title: string
  status: string | null
  priority: string | null
  scopeId: string | null
  scopeName: string | null
  cwr: CWRSummary | null
  queueSection: QueueSection
  pendingProposalCount: number
}

export interface IssueDetail {
  id: string
  jiraIssueKey: string
  jiraIssueUrl: string
  title: string
  status: string | null
  statusCategory: string | null
  priority: string | null
  issueType: string | null
  scopeId: string | null
  scopeName: string | null
  cwr: CWRDetail | null
}

export interface MeaningfulEventItem {
  id: string
  eventType: MeaningfulEventType
  summary: string
  source: DataSource
  sourceRef: string | null
  sourceUrl: string | null
  actorName: string | null
  occurredAt: string
  metadata: Record<string, unknown> | null
}

export interface EvidenceItem {
  id: string
  category: 'decision' | 'action_item' | 'blocker' | 'open_question' | 'status_update' | 'owner_update' | 'risk'
  content: string
  confidence: number
  sourceApp: DataSource | null
  state: 'active' | 'superseded'
  extractedAt: string
  citationUrls: string[]
}

export interface ProposalItem {
  id: string
  issueId: string
  issueKey: string
  issueTitle: string
  target: 'jira_comment'
  status: 'pending_approval' | 'approved' | 'applied' | 'rejected' | 'failed'
  payload: { jiraIssueKey: string; commentBody: string }
  confidence: number
  createdAt: string
  updatedAt: string
}

export interface ProposalEditRequest {
  commentBody: string
}

export interface TriggerActionRequest {
  type:
    | 'chase_owner'
    | 'draft_update'
    | 'prepare_escalation'
    | 'mark_owner_confirmed'
    | 'mark_blocker_cleared'
  input?: Record<string, unknown>
}

export interface TriggerActionResponse {
  proposalId: string | null
  message: string
}

export interface ScopeItem {
  id: string
  name: string
  type: string
}

export interface WorkflowConfigItem {
  id: string
  scopeId: string
  workflowKey: string
  name: string
  includedChannelIds: string[]
  includedJiraProjects: string[]
  includedMailboxes: string[]
  writebackEnabled: boolean
  approvalRequired: boolean
}

export type WorkflowConfigCreateRequest = Omit<WorkflowConfigItem, 'id'>
