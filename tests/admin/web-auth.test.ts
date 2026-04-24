import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import '../../apps/api/src/types/fastify.js';
import { webAuthPlugin } from '../../apps/api/src/plugins/web-auth.js';

async function buildApp(token: string) {
  const app = Fastify();
  await app.register(webAuthPlugin, { token });
  app.get('/web/test', async (req) => ({
    userId: req.userId,
    workspaceId: req.workspaceId,
  }));
  await app.ready();
  return app;
}

describe('webAuthPlugin', () => {
  it('rejects with wrong internal token', async () => {
    const app = await buildApp('secret');
    const res = await app.inject({
      method: 'GET',
      url: '/web/test',
      headers: {
        'x-internal-token': 'wrong',
        'x-user-id': 'u1',
        'x-workspace-id': 'ws1',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects when user context headers are missing', async () => {
    const app = await buildApp('secret');
    const res = await app.inject({
      method: 'GET',
      url: '/web/test',
      headers: { 'x-internal-token': 'secret' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('attaches userId and workspaceId from headers', async () => {
    const app = await buildApp('secret');
    const res = await app.inject({
      method: 'GET',
      url: '/web/test',
      headers: {
        'x-internal-token': 'secret',
        'x-user-id': 'u1',
        'x-workspace-id': 'ws1',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'u1', workspaceId: 'ws1' });
  });
});
