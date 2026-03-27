import { ExternalServiceError } from '@remi/shared';
import { createJiraJwt } from './auth.js';
import type { JiraIssueData } from './types.js';

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

export class JiraClient {
  constructor(
    private baseUrl: string,
    private clientKey: string,
    private sharedSecret: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const token = createJiraJwt(this.clientKey, this.sharedSecret, method, url);

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

  async addComment(issueKey: string, body: string): Promise<void> {
    await this.request<void>('POST', `/rest/api/3/issue/${issueKey}/comment`, {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: body }],
          },
        ],
      },
    });
  }
}
