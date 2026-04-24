import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@remi/db', () => ({
  prisma: {},
  findSlackInstallByTeamId: vi.fn(),
  findSlackUserBySlackId: vi.fn(),
  findUserById: vi.fn(),
  createUserSession: vi.fn(),
  findSessionByToken: vi.fn(),
  revokeSession: vi.fn(),
  touchSession: vi.fn(),
}));

import {
  createUserSession,
  findSessionByToken,
  findSlackInstallByTeamId,
  findSlackUserBySlackId,
  findUserById,
  revokeSession,
} from '@remi/db';
import { sessionRoutes } from '../../apps/api/src/routes/internal/sessions.js';

async function buildApp() {
  const app = Fastify();
  await app.register(sessionRoutes);
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('POST /internal/sessions/resolve', () => {
  it('returns 403 when Slack workspace is not installed', async () => {
    vi.mocked(findSlackInstallByTeamId).mockResolvedValue(null);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/resolve',
      payload: { slackUserId: 'U1', slackTeamId: 'T1' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/not installed/i);
  });

  it('returns 403 when SlackUser row does not exist', async () => {
    vi.mocked(findSlackInstallByTeamId).mockResolvedValue({ workspaceId: 'ws1' } as any);
    vi.mocked(findSlackUserBySlackId).mockResolvedValue(null);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/resolve',
      payload: { slackUserId: 'U1', slackTeamId: 'T1' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns a token when identity resolves', async () => {
    vi.mocked(findSlackInstallByTeamId).mockResolvedValue({ workspaceId: 'ws1' } as any);
    vi.mocked(findSlackUserBySlackId).mockResolvedValue({ userId: 'u1' } as any);
    vi.mocked(findUserById).mockResolvedValue({ id: 'u1', workspaceId: 'ws1' } as any);
    vi.mocked(createUserSession).mockResolvedValue({ id: 'sess1' } as any);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/resolve',
      payload: { slackUserId: 'U1', slackTeamId: 'T1' },
    });

    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe('string');
    expect(res.json().token.length).toBeGreaterThan(20);
  });
});

describe('POST /internal/sessions/validate', () => {
  it('returns 401 when session not found', async () => {
    vi.mocked(findSessionByToken).mockResolvedValue(null);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/validate',
      payload: { token: 'badtoken' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns userId and workspaceId when valid', async () => {
    vi.mocked(findSessionByToken).mockResolvedValue({
      userId: 'u1',
      workspaceId: 'ws1',
    } as any);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/validate',
      payload: { token: 'validtoken' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'u1', workspaceId: 'ws1' });
  });
});

describe('POST /internal/sessions/revoke', () => {
  it('calls revokeSession and returns ok', async () => {
    vi.mocked(revokeSession).mockResolvedValue(undefined as any);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/revoke',
      payload: { token: 'sometoken' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(revokeSession).toHaveBeenCalledWith(expect.anything(), 'sometoken');
  });
});
