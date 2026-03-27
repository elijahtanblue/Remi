import { describe, it, expect } from 'vitest';
import { parseJiraWebhook } from '../../packages/jira/src/webhooks/parser.js';
import type { JiraWebhookPayload } from '../../packages/jira/src/types.js';

function makePayload(overrides: Partial<JiraWebhookPayload> = {}): JiraWebhookPayload {
  return {
    webhookEvent: 'jira:issue_updated',
    timestamp: 1711234567000,
    issue: { id: 'issue-101', key: 'PROJ-42', fields: {} },
    ...overrides,
  };
}

describe('parseJiraWebhook', () => {
  it('parses jira:issue_created', () => {
    const result = parseJiraWebhook(makePayload({ webhookEvent: 'jira:issue_created' }));
    expect(result.kind).toBe('issue_created');
  });

  it('parses jira:issue_updated', () => {
    const result = parseJiraWebhook(makePayload({ webhookEvent: 'jira:issue_updated' }));
    expect(result.kind).toBe('issue_updated');
  });

  it('parses comment_created', () => {
    const result = parseJiraWebhook(makePayload({ webhookEvent: 'comment_created' }));
    expect(result.kind).toBe('comment_created');
  });

  it('parses comment_updated', () => {
    const result = parseJiraWebhook(makePayload({ webhookEvent: 'comment_updated' }));
    expect(result.kind).toBe('comment_updated');
  });

  it('throws for an unknown webhookEvent', () => {
    expect(() => parseJiraWebhook(makePayload({ webhookEvent: 'jira:sprint_started' }))).toThrow(
      /Unknown Jira webhook event/,
    );
  });

  it('maps issue.id and issue.key', () => {
    const result = parseJiraWebhook(makePayload());
    expect(result.jiraIssueId).toBe('issue-101');
    expect(result.jiraIssueKey).toBe('PROJ-42');
  });

  it('parses changelog items into changedFields', () => {
    const payload = makePayload({
      changelog: {
        id: 'cl-1',
        items: [
          { field: 'status', fieldtype: 'jira', from: '10000', fromString: 'To Do', to: '10001', toString: 'In Progress' },
          { field: 'assignee', fieldtype: 'jira', from: null, fromString: null, to: 'user-abc', toString: 'Alice' },
        ],
      },
    });
    const result = parseJiraWebhook(payload);
    expect(result.changedFields).toHaveLength(2);
    expect(result.changedFields[0]).toEqual({ field: 'status', from: 'To Do', to: 'In Progress' });
    expect(result.changedFields[1]).toEqual({ field: 'assignee', from: null, to: 'Alice' });
  });

  it('returns empty changedFields when changelog is absent', () => {
    const result = parseJiraWebhook(makePayload({ changelog: undefined }));
    expect(result.changedFields).toEqual([]);
  });

  it('returns empty changedFields when changelog.items is empty', () => {
    const result = parseJiraWebhook(makePayload({ changelog: { id: 'cl-1', items: [] } }));
    expect(result.changedFields).toEqual([]);
  });

  it('includes actorAccountId from user field', () => {
    const payload = makePayload({
      user: { accountId: 'user-xyz', displayName: 'Bob' },
    });
    const result = parseJiraWebhook(payload);
    expect(result.actorAccountId).toBe('user-xyz');
  });

  it('returns null actorAccountId when user is absent', () => {
    const result = parseJiraWebhook(makePayload({ user: undefined }));
    expect(result.actorAccountId).toBeNull();
  });

  it('parses timestamp into a Date', () => {
    const result = parseJiraWebhook(makePayload({ timestamp: 1711234567000 }));
    expect(result.occurredAt).toBeInstanceOf(Date);
    expect(result.occurredAt.getTime()).toBe(1711234567000);
  });
});
