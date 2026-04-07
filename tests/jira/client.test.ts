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

  it('fetches all Jira comments and flattens ADF content to plain text', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          fields: {
            description: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Hello' },
                    { type: 'text', text: 'world' },
                  ],
                },
              ],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          comments: [
            {
              id: 'comment-1',
              body: {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'First comment' }],
                  },
                ],
              },
              author: { displayName: 'Alice' },
              created: '2026-04-01T00:00:00.000Z',
            },
          ],
          maxResults: 100,
          startAt: 0,
          total: 2,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          comments: [
            {
              id: 'comment-2',
              body: 'Second comment',
              created: '2026-04-02T00:00:00.000Z',
            },
          ],
          maxResults: 100,
          startAt: 1,
          total: 2,
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const client = new JiraClient('https://example.atlassian.net', SHARED_SECRET);
    const content = await client.getIssueContent('KAN-1');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://example.atlassian.net/rest/api/3/issue/KAN-1/comment?maxResults=100&orderBy=created&startAt=0',
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'https://example.atlassian.net/rest/api/3/issue/KAN-1/comment?maxResults=100&orderBy=created&startAt=1',
    );
    expect(content).toEqual({
      description: 'Hello world',
      comments: [
        {
          id: 'comment-1',
          body: 'First comment',
          authorName: 'Alice',
          created: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'comment-2',
          body: 'Second comment',
          authorName: 'Unknown',
          created: '2026-04-02T00:00:00.000Z',
        },
      ],
    });
  });

  it('sends multiline Jira comments as separate ADF paragraphs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new JiraClient('https://example.atlassian.net', SHARED_SECRET);
    await client.addComment('KAN-1', 'Remi Memory Update\nCurrent state: Waiting on vendor\n- Follow up');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      body: {
        type: string;
        version: number;
        content: Array<{ type: string; content: Array<{ type: string; text: string }> }>;
      };
    };

    expect(body.body.type).toBe('doc');
    expect(body.body.content).toHaveLength(3);
    expect(body.body.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Remi Memory Update' }],
    });
    expect(body.body.content[1]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Current state: Waiting on vendor' }],
    });
    expect(body.body.content[2]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: '- Follow up' }],
    });
  });
});
