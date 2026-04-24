import Fastify from 'fastify';
import { config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { slackRoutes } from './routes/slack/index.js';
import { jiraRoutes } from './routes/jira/index.js';
import { adminRoutes } from './routes/admin/index.js';
import { internalRoutes } from './routes/internal/index.js';
import { AppError, ValidationError, NotFoundError } from '@remi/shared';

export async function buildServer() {
  const isProd = config.NODE_ENV === 'production';

  const app = Fastify({
    logger: isProd
      ? { level: 'info' }
      : {
          level: 'debug',
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        },
  });

  // Routes
  await app.register(healthRoutes);
  await app.register(slackRoutes, { prefix: '/slack' });
  await app.register(jiraRoutes, { prefix: '/jira' });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(internalRoutes, { prefix: '/internal' });

  // Global error handler — maps AppError subclasses to HTTP status codes
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof NotFoundError) {
      app.log.info({ err: error, url: request.url }, 'Not found');
      return reply.code(404).send({ error: error.message });
    }

    if (error instanceof ValidationError) {
      app.log.info({ err: error, url: request.url }, 'Validation error');
      return reply.code(400).send({ error: error.message });
    }

    if (error instanceof AppError) {
      app.log.warn({ err: error, url: request.url }, 'Application error');
      return reply.code(500).send({ error: error.message });
    }

    // Fastify validation errors (schema validation)
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) {
      app.log.info({ err: error, url: request.url }, 'Client error');
      return reply.code(statusCode).send({ error: (error as Error).message });
    }

    // Unexpected errors — log at error level, don't leak internals
    app.log.error({ err: error, url: request.url }, 'Unhandled error');
    return reply.code(500).send({ error: 'Internal server error' });
  });

  return app;
}
