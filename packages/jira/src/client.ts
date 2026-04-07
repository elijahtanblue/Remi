import { ExternalServiceError } from '@remi/shared';
import { createJiraJwt } from './auth.js';
import { JIRA_CONNECT_APP_KEY } from './constants.js';
import type { JiraIssueData } from './types.js';

/** Recursively extracts plain text from Atlassian Document Format (ADF) nodes. */
function extractAdfText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  if (typeof n.text === 'string') return n.text;
  const children = Array.isArray(n.content) ? n.content : [];
  return (children as unknown[]).map(extractAdfText).filter(Boolean).join(' ');
}

interface ChangelogEntry {
  created: string;
  items: Array<{
    field: string;
    from: string | null;
    fromString: string | null;
    to: string | null;
    toString: string | null;
  }>;
}

function buildAdfParagraphsFromPlainText(body: string) {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  return lines.map((line) => ({
    type: 'paragraph',
    content: line ? [{ type: 'text', text: line }] : [],
  }));
}

export class JiraClient {
  constructor(
    private baseUrl: string,
    private sharedSecret: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const token = createJiraJwt(JIRA_CONNECT_APP_KEY, this.sharedSecret, method, url);

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `JWT ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new ExternalServiceError('Jira', `${method} ${path} failed with ${res.status}: ${text}`);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return res.json() as Promise<T>;
  }

  async getIssue(issueKey: string): Promise<JiraIssueData> {
    const fields = 'summary,status,assignee,priority,issuetype,reporter,created,updated';
    const data = await this.request<{
      id: string;
      key: string;
      fields: {
        summary: string;
        status: { name: string; statusCategory: { key: string; name: string } };
        assignee: { accountId: string; displayName: string } | null;
        priority: { name: string } | null;
        issuetype: { name: string };
        reporter: { accountId: string; displayName: string } | null;
        created: string;
        updated: string;
      };
    }>('GET', `/rest/api/3/issue/${issueKey}?fields=${fields}`);

    return {
      id: data.id,
      key: data.key,
      summary: data.fields.summary,
      status: data.fields.status,
      assignee: data.fields.assignee,
      priority: data.fields.priority,
      issuetype: data.fields.issuetype,
      reporter: data.fields.reporter,
      created: data.fields.created,
      updated: data.fields.updated,
    };
  }

  async getIssueChangelog(issueKey: string): Promise<ChangelogEntry[]> {
    const data = await this.request<{
      values: Array<{
        created: string;
        items: Array<{
          field: string;
          from: string | null;
          fromString: string | null;
          to: string | null;
          toString: string | null;
        }>;
      }>;
    }>('GET', `/rest/api/3/issue/${issueKey}/changelog`);

    return data.values;
  }

  async searchUsersByQuery(query: string): Promise<Array<{ accountId: string; displayName: string; emailAddress?: string }>> {
    return this.request<Array<{ accountId: string; displayName: string; emailAddress?: string }>>(
      'GET',
      `/rest/api/3/user/search?query=${encodeURIComponent(query)}&maxResults=5`,
    );
  }

  async updateAssignee(issueKey: string, accountId: string | null): Promise<void> {
    await this.request<void>('PUT', `/rest/api/3/issue/${issueKey}/assignee`, { accountId });
  }

  async addComment(issueKey: string, body: string): Promise<void> {
    await this.request<void>('POST', `/rest/api/3/issue/${issueKey}/comment`, {
      body: {
        type: 'doc',
        version: 1,
        content: buildAdfParagraphsFromPlainText(body),
      },
    });
  }

  /** Fetches the issue description and all comments as plain text strings. */
  async getIssueContent(issueKey: string): Promise<{ description: string | null; comments: Array<{ id: string; body: string; authorName: string; created: string }> }> {
    // Fetch description field
    const issueData = await this.request<{
      fields: {
        description: unknown | null;
      };
    }>('GET', `/rest/api/3/issue/${issueKey}?fields=description`);

    const rawDesc = issueData.fields.description;
    const description = rawDesc == null ? null : typeof rawDesc === 'string' ? rawDesc : extractAdfText(rawDesc);

    const comments: Array<{ id: string; body: string; authorName: string; created: string }> = [];
    let startAt = 0;

    while (true) {
      const commentData = await this.request<{
        comments: Array<{
          id: string;
          body: unknown;
          author?: { displayName?: string };
          created: string;
        }>;
        maxResults: number;
        startAt: number;
        total: number;
      }>('GET', `/rest/api/3/issue/${issueKey}/comment?maxResults=100&orderBy=created&startAt=${startAt}`);

      comments.push(
        ...commentData.comments.map((c) => ({
          id: c.id,
          body: typeof c.body === 'string' ? c.body : extractAdfText(c.body),
          authorName: c.author?.displayName ?? 'Unknown',
          created: c.created,
        })),
      );

      const nextStartAt = commentData.startAt + commentData.comments.length;
      if (nextStartAt >= commentData.total || commentData.comments.length === 0) {
        break;
      }

      startAt = nextStartAt;
    }

    return { description, comments };
  }
}
