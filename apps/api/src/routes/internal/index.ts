import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { internalAuthPlugin } from '../../plugins/internal-auth.js';
import { sessionRoutes } from './sessions.js';

export async function internalRoutes(app: FastifyInstance) {
  await app.register(internalAuthPlugin, { token: config.INTERNAL_TOKEN });
  await app.register(sessionRoutes, { prefix: '/sessions' });
}
