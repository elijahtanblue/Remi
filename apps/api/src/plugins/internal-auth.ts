import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

export const internalAuthPlugin = fp(async function (
  app: FastifyInstance,
  opts: { token: string },
) {
  app.addHook('onRequest', async (request, reply) => {
    const provided = request.headers['x-internal-token'];
    if (provided !== opts.token) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
});
