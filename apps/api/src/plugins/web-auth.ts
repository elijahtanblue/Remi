import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import '../types/fastify.js';

export const webAuthPlugin = fp(async function (
  app: FastifyInstance,
  opts: { token: string },
) {
  app.addHook('onRequest', async (request, reply) => {
    const provided = request.headers['x-internal-token'];
    if (provided !== opts.token) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const userId = request.headers['x-user-id'];
    const workspaceId = request.headers['x-workspace-id'];
    if (typeof userId !== 'string' || typeof workspaceId !== 'string') {
      return reply.code(400).send({ error: 'Missing user context headers' });
    }

    request.userId = userId;
    request.workspaceId = workspaceId;
  });
});
