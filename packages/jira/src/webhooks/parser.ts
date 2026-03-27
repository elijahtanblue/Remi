import type { JiraWebhookPayload, ParsedJiraEvent } from '../types.js';

const EVENT_KIND_MAP: Record<string, ParsedJiraEvent['kind']> = {
  'jira:issue_created': 'issue_created',
  'jira:issue_updated': 'issue_updated',
  comment_created: 'comment_created',
  comment_updated: 'comment_updated',
};

export function parseJiraWebhook(payload: JiraWebhookPayload): ParsedJiraEvent {
  const kind = EVENT_KIND_MAP[payload.webhookEvent];

  if (!kind) {
    throw new Error(`Unknown Jira webhook event: ${payload.webhookEvent}`);
  }

  const changedFields = (payload.changelog?.items ?? []).map((item) => ({
    field: item.field,
    from: item.fromString,
    to: item.toString,
  }));

  return {
    kind,
    jiraIssueId: payload.issue.id,
    jiraIssueKey: payload.issue.key,
    changedFields,
    actorAccountId: payload.user?.accountId ?? null,
    occurredAt: new Date(payload.timestamp),
  };
}
