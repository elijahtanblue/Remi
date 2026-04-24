import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { internalAuthPlugin } from '../../apps/api/src/plugins/internal-auth.js';

async function buildTestApp(token: string) {
  const app = Fastify();
  await app.register(internalAuthPlugin, { token });
  app.get('/internal/test', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('internalAuthPlugin', () => {
  it('allows requests with the correct X-Internal-Token', async () => {
    const app = await buildTestApp('secret123');
    const res = await app.inject({
      method: 'GET',
      url: '/internal/test',
      headers: { 'x-internal-token': 'secret123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('rejects requests with wrong token', async () => {
    const app = await buildTestApp('secret123');
    const res = await app.inject({
      method: 'GET',
      url: '/internal/test',
      headers: { 'x-internal-token': 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects requests with no token', async () => {
    const app = await buildTestApp('secret123');
    const res = await app.inject({
      method: 'GET',
      url: '/internal/test',
    });
    expect(res.statusCode).toBe(401);
  });
});
