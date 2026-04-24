import type {
  IssueQueueItem,
  IssueDetail,
  MeaningfulEventItem,
  EvidenceItem,
  ProposalItem,
  ScopeItem,
  WorkflowConfigItem,
  QueueSection,
  ProposalEditRequest,
  WorkflowConfigCreateRequest,
  TriggerActionRequest,
  TriggerActionResponse,
  CWRSummary,
  CWRDetail,
} from '@remi/shared';

const USE_MOCK = process.env.USE_MOCK_DATA === 'true';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiStatus(err: unknown, status: number): boolean {
  return err instanceof ApiError && err.status === status;
}

// ─── Mock fixtures ────────────────────────────────────────────────────────────

const mockCwrBase: CWRSummary = {
  currentState: 'Waiting on vendor to provide updated API credentials following security incident.',
  ownerDisplayName: 'Sarah Chen',
  ownerExternalId: 'U01ABC123',
  blockerSummary: 'Vendor unresponsive for 8 days. Security team blocking prod deploy.',
  waitingOnType: 'external_vendor',
  waitingOnDescription: 'Acme Payments — updated API credentials',
  nextStep: 'Escalate to vendor account manager and loop in legal',
  riskScore: 0.82,
  urgencyReason: 'Vendor silent 8 days, prod deploy blocked',
  isStale: false,
  staleSince: null,
  sourceFreshnessAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  lastMeaningfulChangeAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
  lastMeaningfulChangeSummary: 'Owner changed from James to Sarah via Slack',
  dataSources: ['slack', 'jira', 'email'],
  confidence: 0.87,
};

const mockCwrDetail: CWRDetail = {
  ...mockCwrBase,
  ownerSource: 'slack',
  blockerDetectedAt: new Date(Date.now() - 8 * 86400_000).toISOString(),
  openQuestions: [
    {
      content: 'Does the new credential set require a new OAuth flow or just a key rotation?',
      source: 'slack',
      askedAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
      ownerName: 'James Liu',
      status: 'open',
    },
  ],
  generatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  updatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
};

const MOCK_ISSUES: IssueQueueItem[] = [
  {
    id: 'issue-1',
    jiraIssueKey: 'SUP-4821',
    jiraIssueUrl: 'https://example.atlassian.net/browse/SUP-4821',
    title: 'Payment gateway credentials expired — prod deploy blocked',
    status: 'In Progress',
    priority: 'High',
    scopeId: 'scope-1',
    scopeName: 'Customer Support',
    cwr: mockCwrBase,
    queueSection: 'needs_action',
    pendingProposalCount: 1,
  },
  {
    id: 'issue-2',
    jiraIssueKey: 'ESC-112',
    jiraIssueUrl: 'https://example.atlassian.net/browse/ESC-112',
    title: 'Enterprise customer SLA breach — C-suite escalation',
    status: 'Open',
    priority: 'Critical',
    scopeId: 'scope-1',
    scopeName: 'Customer Support',
    cwr: {
      currentState: 'SLA breached. Customer escalating to C-suite. Awaiting VP approval to offer credit.',
      ownerDisplayName: 'Maria Santos',
      ownerExternalId: 'U03GHI789',
      blockerSummary: 'VP Customer Success approval needed before offering credit',
      waitingOnType: 'approval',
      waitingOnDescription: 'VP CS approval for $2k credit',
      nextStep: 'Send approval request to VP CS',
      riskScore: 0.91,
      urgencyReason: 'C-suite escalation, SLA breached',
      isStale: false,
      staleSince: null,
      sourceFreshnessAt: new Date(Date.now() - 15 * 60_000).toISOString(),
      lastMeaningfulChangeAt: new Date(Date.now() - 15 * 60_000).toISOString(),
      lastMeaningfulChangeSummary: 'Blocker created: VP approval needed',
      dataSources: ['slack', 'email'],
      confidence: 0.93,
    },
    queueSection: 'needs_action',
    pendingProposalCount: 0,
  },
  {
    id: 'issue-3',
    jiraIssueKey: 'IMP-339',
    jiraIssueUrl: 'https://example.atlassian.net/browse/IMP-339',
    title: 'Enterprise onboarding — data migration failing on large tenants',
    status: 'In Progress',
    priority: 'Medium',
    scopeId: 'scope-2',
    scopeName: 'Implementation',
    cwr: {
      currentState: 'Migration script fails for tenants >50k records. Root cause identified.',
      ownerDisplayName: 'James Liu',
      ownerExternalId: 'U02DEF456',
      blockerSummary: null,
      waitingOnType: 'internal_team',
      waitingOnDescription: 'Platform team — DB limit increase',
      nextStep: 'Submit platform request ticket by EOD',
      riskScore: 0.45,
      urgencyReason: 'Customer go-live Friday',
      isStale: false,
      staleSince: null,
      sourceFreshnessAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      lastMeaningfulChangeAt: new Date(Date.now() - 3600_000).toISOString(),
      lastMeaningfulChangeSummary: 'Root cause confirmed in Slack thread',
      dataSources: ['slack', 'jira'],
      confidence: 0.91,
    },
    queueSection: 'recently_changed',
    pendingProposalCount: 1,
  },
];

const MOCK_ISSUE_DETAIL: IssueDetail = {
  id: 'issue-1',
  jiraIssueKey: 'SUP-4821',
  jiraIssueUrl: 'https://example.atlassian.net/browse/SUP-4821',
  title: 'Payment gateway credentials expired — prod deploy blocked',
  status: 'In Progress',
  statusCategory: 'indeterminate',
  priority: 'High',
  issueType: 'Bug',
  scopeId: 'scope-1',
  scopeName: 'Customer Support',
  cwr: mockCwrDetail,
};

const MOCK_TIMELINE: MeaningfulEventItem[] = [
  {
    id: 'evt-1',
    eventType: 'blocker_created',
    summary: 'Blocker detected: Vendor unresponsive 8 days, security team blocking prod deploy.',
    source: 'slack',
    sourceRef: null,
    sourceUrl: null,
    actorName: 'Sarah Chen',
    occurredAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
    metadata: { blocker: 'Vendor unresponsive' },
  },
  {
    id: 'evt-2',
    eventType: 'owner_changed',
    summary: 'Owner changed from James Liu to Sarah Chen via Slack',
    source: 'slack',
    sourceRef: null,
    sourceUrl: null,
    actorName: null,
    occurredAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
    metadata: { from: 'James Liu', to: 'Sarah Chen' },
  },
  {
    id: 'evt-3',
    eventType: 'status_changed',
    summary: 'Jira status changed from Open to In Progress',
    source: 'jira',
    sourceRef: null,
    sourceUrl: 'https://example.atlassian.net/browse/SUP-4821',
    actorName: null,
    occurredAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
    metadata: { from: 'Open', to: 'In Progress' },
  },
];

const MOCK_EVIDENCE: EvidenceItem[] = [
  {
    id: 'obs-1',
    category: 'blocker',
    content: 'Vendor Acme Payments has not responded to credential rotation request sent 8 days ago.',
    confidence: 0.92,
    sourceApp: 'slack',
    state: 'active',
    extractedAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
    citationUrls: [],
  },
  {
    id: 'obs-2',
    category: 'action_item',
    content: 'Sarah to escalate to vendor account manager and loop in legal by EOD Thursday.',
    confidence: 0.88,
    sourceApp: 'slack',
    state: 'active',
    extractedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    citationUrls: [],
  },
];

const MOCK_PROPOSALS: ProposalItem[] = [
  {
    id: 'prop-1',
    issueId: 'issue-1',
    issueKey: 'SUP-4821',
    issueTitle: 'Payment gateway credentials expired — prod deploy blocked',
    target: 'jira_comment',
    status: 'pending_approval',
    payload: {
      jiraIssueKey: 'SUP-4821',
      commentBody:
        'Update (2026-04-24): Sarah Chen is now the owner. Vendor Acme Payments has been unresponsive for 8 days. Escalation to vendor account manager and legal is the next step. Security team blocking prod deploy pending credential resolution.',
    },
    confidence: 0.87,
    createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  },
  {
    id: 'prop-2',
    issueId: 'issue-3',
    issueKey: 'IMP-339',
    issueTitle: 'Enterprise onboarding — data migration failing on large tenants',
    target: 'jira_comment',
    status: 'pending_approval',
    payload: {
      jiraIssueKey: 'IMP-339',
      commentBody:
        'Update (2026-04-24): Root cause confirmed — migration script OOMs on tenants >50k records. Platform team DB limit increase request submitted. Customer go-live at risk; James Liu leading.',
    },
    confidence: 0.84,
    createdAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
  },
];

const MOCK_SCOPES: ScopeItem[] = [
  { id: 'scope-1', name: 'Customer Support', type: 'team' },
  { id: 'scope-2', name: 'Implementation', type: 'team' },
];

const MOCK_WORKFLOW_CONFIGS: WorkflowConfigItem[] = [
  {
    id: 'wc-1',
    scopeId: 'scope-1',
    workflowKey: 'vendor-escalation',
    name: 'Vendor Escalation',
    includedChannelIds: ['C01SUPPORT', 'C02ESCALATE'],
    includedJiraProjects: ['SUP', 'ESC'],
    includedMailboxes: ['support@example.com'],
    writebackEnabled: true,
    approvalRequired: true,
  },
  {
    id: 'wc-2',
    scopeId: 'scope-2',
    workflowKey: 'customer-onboarding',
    name: 'Customer Onboarding',
    includedChannelIds: ['C03IMPL'],
    includedJiraProjects: ['IMP'],
    includedMailboxes: ['impl@example.com'],
    writebackEnabled: false,
    approvalRequired: true,
  },
];

// ─── API fetch helper ─────────────────────────────────────────────────────────

function headers(userId: string, workspaceId: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Internal-Token': process.env.INTERNAL_TOKEN ?? '',
    'X-User-Id': userId,
    'X-Workspace-Id': workspaceId,
  };
}

async function apiFetch<T>(
  path: string,
  userId: string,
  workspaceId: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${process.env.API_URL}/web${path}`, {
    ...init,
    headers: { ...headers(userId, workspaceId), ...(init?.headers as Record<string, string> ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) throw new ApiError(`API ${path} returned ${res.status}`, res.status);
  return res.json() as Promise<T>;
}

// ─── Issues ──────────────────────────────────────────────────────────────────

export async function getIssueQueue(
  userId: string,
  workspaceId: string,
  opts: { section?: QueueSection | 'all'; scopeId?: string; page?: number; limit?: number } = {},
): Promise<{ items: IssueQueueItem[]; total: number }> {
  if (USE_MOCK) {
    const items =
      opts.section && opts.section !== 'all'
        ? MOCK_ISSUES.filter((i) => i.queueSection === opts.section)
        : MOCK_ISSUES;
    return { items, total: items.length };
  }
  const p = new URLSearchParams();
  if (opts.section) p.set('section', opts.section);
  if (opts.scopeId) p.set('scopeId', opts.scopeId);
  if (opts.page)  p.set('page', String(opts.page));
  if (opts.limit) p.set('limit', String(opts.limit));
  return apiFetch(`/issues?${p}`, userId, workspaceId);
}

export async function getIssueDetail(
  userId: string,
  workspaceId: string,
  id: string,
): Promise<IssueDetail> {
  if (USE_MOCK) return MOCK_ISSUE_DETAIL;
  return apiFetch(`/issues/${id}`, userId, workspaceId);
}

export async function getIssueTimeline(
  userId: string,
  workspaceId: string,
  id: string,
  opts: { limit?: number; before?: string } = {},
): Promise<{ events: MeaningfulEventItem[]; nextCursor: string | null }> {
  if (USE_MOCK) return { events: MOCK_TIMELINE, nextCursor: null };
  const p = new URLSearchParams();
  if (opts.limit)  p.set('limit', String(opts.limit));
  if (opts.before) p.set('before', opts.before);
  return apiFetch(`/issues/${id}/timeline?${p}`, userId, workspaceId);
}

export async function getIssueEvidence(
  userId: string,
  workspaceId: string,
  id: string,
): Promise<{ items: EvidenceItem[] }> {
  if (USE_MOCK) return { items: MOCK_EVIDENCE };
  return apiFetch(`/issues/${id}/evidence`, userId, workspaceId);
}

export async function triggerAction(
  userId: string,
  workspaceId: string,
  issueId: string,
  req: TriggerActionRequest,
): Promise<TriggerActionResponse> {
  if (USE_MOCK) return { proposalId: null, message: `Mock: ${req.type}` };
  return apiFetch(`/issues/${issueId}/actions`, userId, workspaceId, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

// ─── Proposals ───────────────────────────────────────────────────────────────

export async function getProposals(
  userId: string,
  workspaceId: string,
  opts: { status?: string; page?: number } = {},
): Promise<{ items: ProposalItem[]; total: number }> {
  if (USE_MOCK) return { items: MOCK_PROPOSALS, total: MOCK_PROPOSALS.length };
  const p = new URLSearchParams();
  if (opts.status) p.set('status', opts.status);
  if (opts.page)   p.set('page', String(opts.page));
  return apiFetch(`/proposals?${p}`, userId, workspaceId);
}

export async function approveProposal(
  userId: string,
  workspaceId: string,
  id: string,
): Promise<{ ok: true }> {
  if (USE_MOCK) return { ok: true };
  return apiFetch(`/proposals/${id}/approve`, userId, workspaceId, { method: 'POST' });
}

export async function rejectProposal(
  userId: string,
  workspaceId: string,
  id: string,
  reason?: string,
): Promise<{ ok: true }> {
  if (USE_MOCK) return { ok: true };
  return apiFetch(`/proposals/${id}/reject`, userId, workspaceId, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function editProposal(
  userId: string,
  workspaceId: string,
  id: string,
  data: ProposalEditRequest,
): Promise<ProposalItem> {
  if (USE_MOCK) {
    const p = MOCK_PROPOSALS.find((x) => x.id === id) ?? MOCK_PROPOSALS[0];
    return { ...p, payload: { ...p.payload, commentBody: data.commentBody } };
  }
  return apiFetch(`/proposals/${id}`, userId, workspaceId, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ─── Scopes + Workflow configs ────────────────────────────────────────────────

export async function getScopes(
  userId: string,
  workspaceId: string,
): Promise<{ items: ScopeItem[] }> {
  if (USE_MOCK) return { items: MOCK_SCOPES };
  return apiFetch('/scopes', userId, workspaceId);
}

export async function getWorkflowConfigs(
  userId: string,
  workspaceId: string,
  scopeId?: string,
): Promise<{ items: WorkflowConfigItem[] }> {
  if (USE_MOCK) return { items: MOCK_WORKFLOW_CONFIGS };
  const q = scopeId ? `?scopeId=${scopeId}` : '';
  return apiFetch(`/workflow-configs${q}`, userId, workspaceId);
}

export async function createWorkflowConfig(
  userId: string,
  workspaceId: string,
  data: WorkflowConfigCreateRequest,
): Promise<WorkflowConfigItem> {
  if (USE_MOCK) return { id: `wc-${Date.now()}`, ...data };
  return apiFetch('/workflow-configs', userId, workspaceId, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
