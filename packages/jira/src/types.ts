export interface JiraIssueData {
  id: string;
  key: string;
  summary: string;
  status: { name: string; statusCategory: { key: string; name: string } };
  assignee: { accountId: string; displayName: string } | null;
  priority: { name: string } | null;
  issuetype: { name: string };
  reporter: { accountId: string; displayName: string } | null;
  created: string;
  updated: string;
}

export interface JiraWebhookPayload {
  webhookEvent: string;
  timestamp: number;
  issue: {
    id: string;
    key: string;
    fields: Record<string, unknown>;
  };
  user?: { accountId: string; displayName: string };
  changelog?: {
    id: string;
    items: Array<{
      field: string;
      fieldtype: string;
      from: string | null;
      fromString: string | null;
      to: string | null;
      toString: string | null;
    }>;
  };
  comment?: {
    id: string;
    author: { accountId: string; displayName: string };
    body: string;
    created: string;
    updated: string;
  };
}

export interface ParsedJiraEvent {
  kind: 'issue_updated' | 'issue_created' | 'comment_created' | 'comment_updated';
  jiraIssueId: string;
  jiraIssueKey: string;
  changedFields: Array<{ field: string; from: string | null; to: string | null }>;
  actorAccountId: string | null;
  occurredAt: Date;
}

export interface ConnectInstallPayload {
  key: string;
  clientKey: string;
  sharedSecret: string;
  baseUrl: string;
  productType: string;
  description: string;
  serviceEntitlementNumber?: string;
}
