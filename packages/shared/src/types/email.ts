// ─── Actor Classification ─────────────────────────────────────────────────────

export type ActorType = 'colleague' | 'vendor' | 'client';

/**
 * Resolved classification of an email participant.
 * mappingSource encodes precedence: contact > domain > default.
 */
export interface ActorProfile {
  actorType: ActorType;
  /**
   * 'department' | 'team'  for colleagues
   * 'company'              for vendors
   * 'tier'                 for clients
   */
  segmentNamespace: string;
  segmentValue: string;
  /** e.g. CEO | VP | Director | Manager | Associate | Contractor */
  roleLevel?: string;
  sensitivityLevel: ThreadSensitivity;
  mappingSource: 'contact' | 'domain' | 'default';
}

// ─── Thread Sensitivity ───────────────────────────────────────────────────────

/** Ordered from lowest to highest. Highest-wins rule applies across participants. */
export type ThreadSensitivity = 'public' | 'internal' | 'confidential' | 'restricted';

export const SENSITIVITY_RANK: Record<ThreadSensitivity, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
} as const;

// ─── Retention & Visibility ───────────────────────────────────────────────────

export type EmailRetentionMode = 'signals_only' | 'full_body_allowed';

// ─── Blocker Kinds ────────────────────────────────────────────────────────────

export type EmailBlockerKind =
  | 'waiting_on_response'
  | 'waiting_on_approval'
  | 'stale_thread'
  | 'missing_owner'
  | 'escalation'
  | 'soft_risk';

// ─── Admin-Managed Classification Mappings ────────────────────────────────────

/** Highest precedence: exact email address match. */
export interface ContactMapping {
  emailAddress: string;
  profile: Omit<ActorProfile, 'mappingSource'>;
}

/** Mid precedence: all addresses at this domain. */
export interface DomainMapping {
  domain: string; // e.g. "acme.com"
  profile: Omit<ActorProfile, 'mappingSource'>;
}

/** Lowest precedence: fallback for unmatched addresses. */
export interface DefaultGroupRule {
  actorType: ActorType;
  segmentNamespace: string;
  segmentValue: string;
  sensitivityLevel: ThreadSensitivity;
}

export interface ActorClassificationConfig {
  workspaceId: string;
  contactMappings: ContactMapping[];
  domainMappings: DomainMapping[];
  defaultRule: DefaultGroupRule;
}

// ─── Mailbox Group Policy ─────────────────────────────────────────────────────

export interface AlertPolicy {
  slackChannel?: string;
  notifyOnNewBlocker: boolean;
  digestFrequency: 'realtime' | 'daily' | 'twice_daily' | 'weekly' | 'never';
}

export interface MailboxGroupPolicy {
  id: string;
  name: string;
  /** Opted-in email addresses or shared mailbox identifiers. Org-wide not permitted in v1. */
  monitoredSources: string[];
  retentionMode: EmailRetentionMode;
  /** blockers_only: non-admin users see only blocker cards; full: all summaries visible */
  visibilityMode: 'blockers_only' | 'full';
  alertPolicy: AlertPolicy;
  sensitivityDefault: ThreadSensitivity;
  /** Threads with no activity older than N days are excluded from ingestion. */
  threadAgeLimitDays: number;
}

// ─── Access Policy ────────────────────────────────────────────────────────────

export interface AccessPolicyRule {
  viewerRoleLevel: string;
  allowedActorTypes: ActorType[];
  allowedSegments?: { namespace: string; values: string[] }[];
  bodyRetentionEligible: boolean;
  threadVisibilityMode: 'blockers_only' | 'full';
}

export interface AccessPolicyConfig {
  workspaceId: string;
  /** Default deny: any viewer role not matched by a rule gets no access. */
  rules: AccessPolicyRule[];
}

// ─── Ingest Records ───────────────────────────────────────────────────────────

export interface AttachmentMetadata {
  filename: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface EmailParticipant {
  emailAddress: string;
  displayName?: string;
  role: 'from' | 'to' | 'cc' | 'bcc';
  resolvedProfile?: ActorProfile;
}

export interface EmailThreadRecord {
  id: string;
  workspaceId: string;
  mailboxGroupId: string;
  provider: 'gmail' | 'outlook';
  externalThreadId: string;
  subject: string;
  participants: EmailParticipant[];
  messageCount: number;
  lastActivityAt: Date;
  /** null when retentionMode is signals_only */
  bodyContent: string | null;
  attachmentMetadata: AttachmentMetadata[];
  sensitivity: ThreadSensitivity;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Blocker Records ──────────────────────────────────────────────────────────

export interface EmailBlockerRecord {
  id: string;
  workspaceId: string;
  threadId: string;
  kind: EmailBlockerKind;
  summary: string;
  ownerEmails: string[];
  detectedAt: Date;
  resolvedAt?: Date;
  /** Manually associated; no auto-create in v1. */
  linkedIssueKey?: string;
}

/** Non-admin view: no confidence score, no raw thread access. */
export interface EmailBlockerCard {
  id: string;
  kind: EmailBlockerKind;
  summary: string;
  detectedAt: Date;
  linkedIssueKey?: string;
}

export interface BlockerDigestRecord {
  id: string;
  workspaceId: string;
  mailboxGroupId: string;
  period: { from: Date; to: Date };
  blockerCount: number;
  newBlockers: EmailBlockerCard[];
  resolvedCount: number;
  deliveredToSlackChannel?: string;
  createdAt: Date;
}
