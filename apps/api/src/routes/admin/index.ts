import type { FastifyInstance } from 'fastify';
import {
  prisma,
  listWorkspaces,
  listAuditLogs,
  listDeadLetters,
  retryDeadLetter,
  findDeadLetterById,
  listSummariesByWorkspace,
  findSummaryById,
  findIssueById,
} from '@remi/db';
import { queue } from '../../queue.js';
import { config } from '../../config.js';
import { QueueNames } from '@remi/shared';
import { v4 as uuidv4 } from 'uuid';

export async function adminRoutes(app: FastifyInstance) {
  // Auth hook — all /admin/* routes require the X-Admin-Key header
  app.addHook('onRequest', async (request, reply) => {
    const key = request.headers['x-admin-key'];
    if (key !== config.ADMIN_API_KEY) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // GET /admin/workspaces
  app.get('/workspaces', async () => {
    const workspaces = await listWorkspaces(prisma);
    return { workspaces };
  });

  // GET /admin/workspaces/:workspaceId/summaries
  app.get('/workspaces/:workspaceId/summaries', async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { limit = 20, offset = 0 } = request.query as {
      limit?: number;
      offset?: number;
    };
    const summaries = await listSummariesByWorkspace(prisma, workspaceId, {
      limit: Number(limit),
      offset: Number(offset),
    });
    return { summaries };
  });

  // GET /admin/summaries/:id
  app.get('/summaries/:id', async (request) => {
    const { id } = request.params as { id: string };
    const summary = await findSummaryById(prisma, id);
    return { summary };
  });

  // POST /admin/summaries/:id/rerun
  // Enqueues a forced summary job for manual re-processing.
  app.post('/summaries/:id/rerun', async (request) => {
    const { id } = request.params as { id: string };
    const summary = await findSummaryById(prisma, id);
    if (!summary) {
      throw new Error('Summary not found');
    }

    const issue = await findIssueById(prisma, summary.issueId);
    if (!issue) {
      throw new Error('Issue not found for summary');
    }

    await queue.send(QueueNames.SUMMARY_JOBS, {
      id: uuidv4(),
      idempotencyKey: `manual:${summary.issueId}:${Date.now()}`,
      workspaceId: issue.workspaceId,
      timestamp: new Date().toISOString(),
      type: 'summary_job',
      payload: {
        issueId: summary.issueId,
        triggerReason: 'manual',
        force: true,
      },
    });

    return { ok: true };
  });

  // GET /admin/dead-letters
  app.get('/dead-letters', async (request) => {
    const {
      queue: queueName,
      limit = 20,
      offset = 0,
    } = request.query as {
      queue?: string;
      limit?: number;
      offset?: number;
    };
    const items = await listDeadLetters(prisma, {
      queue: queueName,
      limit: Number(limit),
      offset: Number(offset),
    });
    return { items };
  });

  // POST /admin/dead-letters/:id/retry
  // Fetches the original payload, re-enqueues to the correct queue, then marks retried.
  app.post('/dead-letters/:id/retry', async (request, reply) => {
    const { id } = request.params as { id: string };
    const dl = await findDeadLetterById(prisma, id);
    if (!dl) {
      return reply.code(404).send({ error: 'Dead letter not found' });
    }

    await queue.send(dl.queue, dl.payload as unknown as import('@remi/shared').QueueMessage);
    await retryDeadLetter(prisma, id);
    return { ok: true };
  });

  // GET /admin/workspaces/:workspaceId/audit-log
  app.get('/workspaces/:workspaceId/audit-log', async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const {
      limit = 50,
      offset = 0,
      action,
    } = request.query as {
      limit?: number;
      offset?: number;
      action?: string;
    };
    const logs = await listAuditLogs(prisma, workspaceId, {
      limit: Number(limit),
      offset: Number(offset),
      action,
    });
    return { logs };
  });
}
