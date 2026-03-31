import type { FastifyInstance } from 'fastify';
import {
  prisma,
  listWorkspaces,
  createWorkspace,
  upsertSlackInstall,
  listAuditLogs,
  listDeadLetters,
  retryDeadLetter,
  deleteDeadLetter,
  deleteDeadLettersByQueue,
  findDeadLetterById,
  listSummariesByWorkspace,
  findSummaryById,
  findIssueById,
  upsertGmailInstall,
  findGmailInstall,
  getProductEventCounts,
} from '@remi/db';
import { queue } from '../../queue.js';
import { config } from '../../config.js';
import { QueueNames } from '@remi/shared';
import { v4 as uuidv4 } from 'uuid';
import { validateGmailConfigBody } from './gmail-config.js';
import { memoryRoutes } from './memory.js';

export async function adminRoutes(app: FastifyInstance) {
  await app.register(memoryRoutes, { prefix: '/memory', queue });

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

  // POST /admin/workspaces — create a workspace and its Slack install in one step
  // Body: { name, slug, slackTeamId, slackTeamName, botToken, botUserId, scopes? }
  app.post('/workspaces', async (request, reply) => {
    const body = request.body as {
      name: string;
      slug: string;
      slackTeamId: string;
      slackTeamName: string;
      botToken: string;
      botUserId: string;
      scopes?: string[];
    };
    const workspace = await createWorkspace(prisma, { name: body.name, slug: body.slug });
    const slackInstall = await upsertSlackInstall(prisma, {
      workspaceId: workspace.id,
      slackTeamId: body.slackTeamId,
      slackTeamName: body.slackTeamName,
      botToken: body.botToken,
      botUserId: body.botUserId,
      scopes: body.scopes ?? ['channels:history', 'channels:read', 'chat:write', 'commands', 'im:write', 'users:read', 'users:read.email'],
    });
    return reply.code(201).send({ workspace, slackInstall });
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

  // DELETE /admin/dead-letters/:id — remove a single entry from storage
  app.delete('/dead-letters/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const dl = await findDeadLetterById(prisma, id);
    if (!dl) return reply.code(404).send({ error: 'Dead letter not found' });
    await deleteDeadLetter(prisma, id);
    return { ok: true };
  });

  // DELETE /admin/dead-letters — clears all (or by queue filter)
  app.delete('/dead-letters', async (request) => {
    const { queue: queueName } = request.query as { queue?: string };
    const result = await deleteDeadLettersByQueue(prisma, queueName);
    return { ok: true, deleted: result.count };
  });

  // POST /admin/gmail/configure
  // Saves or updates the Google service account for a workspace's Gmail integration.
  // Body: { workspaceId, serviceAccountJson, domain, monitoredEmails }
  app.post('/gmail/configure', async (request, reply) => {
    const body = request.body as {
      workspaceId: string;
      serviceAccountJson: string;
      domain: string;
      monitoredEmails: string[];
    };

    const validationError = validateGmailConfigBody(body);
    if (validationError) {
      return reply.code(400).send(validationError);
    }

    // Verify the workspace exists before writing — avoids a FK 500
    const workspace = await prisma.workspace.findUnique({ where: { id: body.workspaceId } });
    if (!workspace) {
      return reply.code(404).send({ error: `Workspace ${body.workspaceId} not found` });
    }

    const install = await upsertGmailInstall(prisma, {
      workspaceId: body.workspaceId,
      serviceAccountJson: body.serviceAccountJson,
      domain: body.domain,
      monitoredEmails: body.monitoredEmails ?? [],
    });

    // Return install without the service account JSON for safety
    const { serviceAccountJson: _sa, ...safeInstall } = install;
    return reply.code(200).send({ ok: true, install: safeInstall });
  });

  // GET /admin/gmail/:workspaceId
  // Returns the Gmail install config for a workspace (omits service account JSON).
  app.get('/gmail/:workspaceId', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const install = await findGmailInstall(prisma, workspaceId);
    if (!install) return reply.code(404).send({ error: 'Gmail not configured for this workspace' });
    const { serviceAccountJson: _sa, ...safeInstall } = install;
    return { install: safeInstall };
  });

  // GET /admin/analytics
  // Query params: since (days, default 30), workspaceId (optional)
  app.get('/analytics', async (request) => {
    const { since = '30', workspaceId } = request.query as {
      since?: string;
      workspaceId?: string;
    };
    const sinceDays = Math.max(1, Math.min(365, Number(since) || 30));
    const sinceDate = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

    const counts = await getProductEventCounts(prisma, {
      workspaceId: workspaceId ?? null,
      since: sinceDate,
    });

    return { since: sinceDate.toISOString(), sinceDays, workspaceId: workspaceId ?? null, counts };
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

    // Enrich logs with actor email (Slack user ID → SlackUser → User.email)
    const slackActorIds = [...new Set(
      logs.filter((l) => l.actorId?.startsWith('U')).map((l) => l.actorId!)
    )];
    const slackUsers = slackActorIds.length > 0
      ? await prisma.slackUser.findMany({
          where: { slackUserId: { in: slackActorIds } },
          include: { user: { select: { email: true, displayName: true } } },
        })
      : [];
    const slackMap = new Map(slackUsers.map((su) => [su.slackUserId, su.user]));

    const enriched = logs.map((log) => ({
      ...log,
      actorDisplay: log.actorId
        ? (slackMap.get(log.actorId)?.email ?? slackMap.get(log.actorId)?.displayName ?? null)
        : null,
    }));

    return { logs: enriched };
  });
}
