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
  createDepartment,
  findDepartmentsByWorkspace,
  updateDepartment,
  deleteDepartment,
  upsertConfluenceInstall,
  findConfluenceInstall,
} from '@remi/db';
import { exchangeConfluenceCode } from '@remi/confluence';
import { queue } from '../../queue.js';
import { config } from '../../config.js';
import { QueueNames } from '@remi/shared';
import { v4 as uuidv4 } from 'uuid';
import { validateGmailConfigBody } from './gmail-config.js';
import { memoryRoutes } from './memory.js';
import { parseDeadLetterDeleteQuery, parseDeadLetterListQuery } from './dead-letter-query.js';
import { serializeAdminSummary, serializeAdminSummaries, type SummaryWithIssueRecord } from './summary-response.js';

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
    return { summaries: serializeAdminSummaries(summaries as SummaryWithIssueRecord[]) };
  });

  // GET /admin/summaries/:id
  app.get('/summaries/:id', async (request) => {
    const { id } = request.params as { id: string };
    const summary = await findSummaryById(prisma, id);
    return { summary: serializeAdminSummary(summary as SummaryWithIssueRecord | null) };
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
    const opts = parseDeadLetterListQuery(request.query as {
      queue?: string;
      limit?: number | string;
      offset?: number | string;
      includeRetried?: boolean | string;
    });
    const items = await listDeadLetters(prisma, opts);
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
    const opts = parseDeadLetterDeleteQuery(request.query as {
      queue?: string;
      includeRetried?: boolean | string;
    });
    const result = await deleteDeadLettersByQueue(prisma, opts);
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

  // ─── Confluence ───────────────────────────────────────────────────────────

  // GET /admin/confluence/oauth-url
  // Returns the Atlassian OAuth 2.0 authorisation URL for a workspace to connect Confluence.
  app.get('/confluence/oauth-url', async (request, reply) => {
    if (!config.CONFLUENCE_CLIENT_ID) {
      return reply.code(503).send({ error: 'Confluence OAuth not configured (CONFLUENCE_CLIENT_ID missing)' });
    }
    const { workspaceId } = request.query as { workspaceId: string };
    if (!workspaceId) return reply.code(400).send({ error: 'workspaceId is required' });

    const redirectUri = `${config.BASE_URL}/admin/confluence/callback`;
    const scopes = [
      'read:confluence-space.summary',
      'write:confluence-content',
      'offline_access',
    ].join(' ');

    const url = new URL('https://auth.atlassian.com/authorize');
    url.searchParams.set('audience', 'api.atlassian.com');
    url.searchParams.set('client_id', config.CONFLUENCE_CLIENT_ID);
    url.searchParams.set('scope', scopes);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', workspaceId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('prompt', 'consent');

    return { url: url.toString() };
  });

  // GET /admin/confluence/callback
  // OAuth callback — exchanges the code for tokens and saves the install.
  app.get('/confluence/callback', async (request, reply) => {
    const { code, state: workspaceId, error } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    if (error || !code || !workspaceId) {
      return reply.code(400).send({ error: error ?? 'Missing code or state' });
    }
    if (!config.CONFLUENCE_CLIENT_ID || !config.CONFLUENCE_CLIENT_SECRET) {
      return reply.code(503).send({ error: 'Confluence OAuth not configured' });
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return reply.code(404).send({ error: `Workspace ${workspaceId} not found` });

    const tokens = await exchangeConfluenceCode({
      code,
      clientId: config.CONFLUENCE_CLIENT_ID,
      clientSecret: config.CONFLUENCE_CLIENT_SECRET,
      redirectUri: `${config.BASE_URL}/admin/confluence/callback`,
    });

    const install = await upsertConfluenceInstall(prisma, {
      workspaceId,
      cloudId: tokens.cloudId,
      siteUrl: tokens.siteUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scopes,
    });

    // Strip tokens from response for safety
    const { accessToken: _at, refreshToken: _rt, ...safeInstall } = install;
    return reply.code(200).send({ ok: true, install: safeInstall });
  });

  // GET /admin/confluence/:workspaceId
  app.get('/confluence/:workspaceId', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const install = await findConfluenceInstall(prisma, workspaceId);
    if (!install) return reply.code(404).send({ error: 'Confluence not configured for this workspace' });
    const { accessToken: _at, refreshToken: _rt, ...safeInstall } = install;
    return { install: safeInstall };
  });

  // ─── Departments ──────────────────────────────────────────────────────────

  // GET /admin/workspaces/:workspaceId/departments
  app.get('/workspaces/:workspaceId/departments', async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const departments = await findDepartmentsByWorkspace(prisma, workspaceId);
    return { departments };
  });

  // POST /admin/workspaces/:workspaceId/departments
  // Body: { name, jiraProjectPrefixes, slackChannelPatterns }
  app.post('/workspaces/:workspaceId/departments', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const body = request.body as {
      name: string;
      jiraProjectPrefixes?: string[];
      slackChannelPatterns?: string[];
    };

    if (!body.name?.trim()) {
      return reply.code(400).send({ error: 'name is required' });
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return reply.code(404).send({ error: `Workspace ${workspaceId} not found` });

    const department = await createDepartment(
      prisma,
      workspaceId,
      body.name.trim(),
      body.jiraProjectPrefixes ?? [],
      body.slackChannelPatterns ?? [],
    );
    return reply.code(201).send({ department });
  });

  // PUT /admin/departments/:id
  // Body: { name?, jiraProjectPrefixes?, slackChannelPatterns? }
  app.put('/departments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      jiraProjectPrefixes?: string[];
      slackChannelPatterns?: string[];
    };

    const department = await updateDepartment(prisma, id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.jiraProjectPrefixes !== undefined ? { jiraProjectPrefixes: body.jiraProjectPrefixes } : {}),
      ...(body.slackChannelPatterns !== undefined ? { slackChannelPatterns: body.slackChannelPatterns } : {}),
    });
    return { department };
  });

  // DELETE /admin/departments/:id
  app.delete('/departments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await deleteDepartment(prisma, id);
    return reply.code(204).send();
  });
}
