import type { FastifyInstance } from 'fastify';
import {
  buildConnectDescriptor,
  validateJiraWebhookPayload,
  parseJiraWebhook,
  handleInstalled,
  handleUninstalled,
  renderIssuePanel,
  verifyJiraJwt,
} from '@remi/jira';
import { prisma, findCurrentSummary, findIssueByKey, findLinksByIssueId, findWorkspaceByJiraClientKey } from '@remi/db';
import { queue } from '../../queue.js';
import { QueueNames } from '@remi/shared';
import { config } from '../../config.js';
import { v4 as uuidv4 } from 'uuid';

export async function jiraRoutes(app: FastifyInstance) {
  // GET /jira/atlassian-connect.json
  // Jira fetches this descriptor when installing the Connect app.
  // workspaceId must be passed as a query param so the install lifecycle URL carries it.
  app.get('/atlassian-connect.json', async (request) => {
    const workspaceId = (request.query as Record<string, string>).workspaceId ?? 'unknown';
    return buildConnectDescriptor(config.BASE_URL, workspaceId);
  });

  // POST /jira/lifecycle/installed
  // Called by Jira after a tenant installs the Connect app.
  app.post('/lifecycle/installed', async (request, reply) => {
    const payload = request.body as Record<string, unknown>;
    // workspaceId is appended as a query param in the descriptor's lifecycle URL
    // e.g. <BASE_URL>/jira/lifecycle/installed?workspaceId=<id>
    const workspaceId = (request.query as Record<string, string>).workspaceId ?? 'unknown';
    await handleInstalled(payload as unknown as import('@remi/jira').ConnectInstallPayload, workspaceId);
    return reply.code(204).send();
  });

  // POST /jira/lifecycle/uninstalled
  // Called by Jira when a tenant uninstalls the Connect app.
  app.post('/lifecycle/uninstalled', async (request, reply) => {
    const payload = request.body as Record<string, unknown>;
    await handleUninstalled(payload.clientKey as string);
    return reply.code(204).send();
  });

  // POST /jira/webhooks
  // Receives issue events forwarded by Jira (created, updated, deleted, etc.).
  // We validate, parse, then enqueue immediately so Jira gets a fast 200 response.
  app.post('/webhooks', async (request, reply) => {
    const validated = validateJiraWebhookPayload(request.body);
    const parsed = parseJiraWebhook(validated);

    await queue.send(QueueNames.JIRA_EVENTS, {
      id: uuidv4(),
      idempotencyKey: `jira:${validated.issue.id}:${validated.timestamp}`,
      // workspaceId is resolved by the worker using the jiraClientKey / site URL
      workspaceId: 'unknown',
      timestamp: new Date().toISOString(),
      type: 'jira_event',
      payload: {
        kind: parsed.kind,
        // x-jira-client-key is the Connect app clientKey — used by the worker to resolve the workspace
        jiraSiteId: (request.headers['x-jira-client-key'] as string | undefined) ?? '',
        issueId: parsed.jiraIssueId,
        issueKey: parsed.jiraIssueKey,
        webhookEventType: validated.webhookEvent,
        rawEvent: request.body as Record<string, unknown>,
      },
    });

    return reply.code(200).send({ ok: true });
  });

  // GET /jira/panel/:issueKey
  // Renders the Jira issue panel (an iframe loaded inside Jira's issue view).
  // Jira passes a signed JWT as ?jwt=<token>; decode the iss (clientKey) to resolve workspace.
  app.get('/panel/:issueKey', async (request, reply) => {
    const { issueKey } = request.params as { issueKey: string };
    const jwtToken = (request.query as Record<string, string>).jwt;

    // Decode JWT to get clientKey (iss claim), then look up workspace + sharedSecret
    let workspaceId = 'unknown';
    if (jwtToken) {
      try {
        // Decode without verification first to get iss (clientKey)
        const decoded = JSON.parse(Buffer.from(jwtToken.split('.')[1], 'base64').toString()) as { iss?: string };
        const clientKey = decoded.iss;
        if (clientKey) {
          const ws = await findWorkspaceByJiraClientKey(prisma, clientKey);
          if (ws) {
            // Verify signature now that we have the shared secret
            const install = ws.jiraInstalls?.[0];
            if (install?.sharedSecret) {
              verifyJiraJwt(jwtToken, install.sharedSecret);
            }
            workspaceId = ws.id;
          }
        }
      } catch {
        // Invalid JWT — render empty panel rather than 500
        workspaceId = 'unknown';
      }
    }

    const issue = await findIssueByKey(prisma, workspaceId, issueKey).catch(() => null);
    const summary = issue
      ? await findCurrentSummary(prisma, issue.id).catch(() => null)
      : null;
    const links = issue ? await findLinksByIssueId(prisma, issue.id) : [];

    const html = renderIssuePanel({
      issueKey,
      summary: (summary?.content as import('@remi/shared').SummaryOutput | null) ?? null,
      linkedThreadCount: links.filter((l) => !l.unlinkedAt).length,
    });

    return reply.type('text/html').send(html);
  });
}
