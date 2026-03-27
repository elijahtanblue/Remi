import type { FastifyInstance } from 'fastify';
import { prisma } from '@remi/db';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get('/ready', async (request, reply) => {
    // Check DB connectivity by issuing a trivial query
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', db: 'ok' };
    } catch (err) {
      app.log.error({ err }, 'Readiness check failed: DB unreachable');
      reply.code(503);
      return { status: 'not ready', db: 'error' };
    }
  });
}
