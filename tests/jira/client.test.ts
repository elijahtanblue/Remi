import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JiraClient } from '../../packages/jira/src/client.js';
import { verifyJiraJwt } from '../../packages/jira/src/auth.js';
import { JIRA_CONNECT_APP_KEY } from '../../packages/jira/src/constants.js';

const SHARED_SECRET = 'super-secret-shared-key-for-tests-only';
const ISSUE_FIELDS = 'summary,status,assignee,priority,issuetype,reporter,created,updated';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('JiraClient', () => {
  it('signs outbound Jira requests with the app key issuer and expected qsh', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'issue-1',
        key: 'KAN-1',
        fields: {
          summary: 'Investigate auth failure',
          status: { name: 'In Progress', statusCategory: { key: 'indeterminate', name: 'In Progress' } },
          assignee: null,
          priority: { name: 'High' },
          issuetype: { name: 'Task' },
          reporter: { accountId: 'reporter-1', displayName: 'Remi Test' },
          created: '2026-03-31T00:00:00.000Z',
          updated: '2026-03-31T00:00:00.000Z',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new JiraClient('https://example.atlassian.net', SHARED_SECRET);
    await client.getIssue('KAN-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toBe(
      `https://example.atlassian.net/rest/api/3/issue/KAN-1?fields=${ISSUE_FIELDS}`,
    );

    const headers = init.headers as Record<string, string>;
    const token = headers.Authorization.replace('JWT ', '');
    const payload = verifyJiraJwt(token, SHARED_SECRET);

    expect(payload.iss).toBe(JIRA_CONNECT_APP_KEY);

    const canonicalRequest =
      `GET&/rest/api/3/issue/KAN-1&fields=${encodeURIComponent(ISSUE_FIELDS)}`;
    const expectedQsh = createHash('sha256').update(canonicalRequest).digest('hex');
    expect(payload.qsh).toBe(expectedQsh);
  });
});
