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
import { prisma, createWorkspace, findCurrentSummary, findCwrByIssueId, findIssueByKey, findLinksByIssueId, findWorkspaceByJiraClientKey } from '@remi/db';
import { queue } from '../../queue.js';
import { QueueNames } from '@remi/shared';
import { config } from '../../config.js';
import { v4 as uuidv4 } from 'uuid';

export async function jiraRoutes(app: FastifyInstance) {
  // GET /jira/install
  // Human-readable install page. Linked to from the Slack welcome DM.
  // Shows the user their personal descriptor URL and step-by-step instructions.
  // workspaceId query param binds the Jira install to the correct Remi workspace.
  app.get('/install', async (request, reply) => {
    const workspaceId = (request.query as Record<string, string>).workspaceId ?? '';
    const descriptorUrl = workspaceId
      ? `${config.BASE_URL}/jira/atlassian-connect.json?workspaceId=${workspaceId}`
      : `${config.BASE_URL}/jira/atlassian-connect.json`;
    const html = jiraInstallPageHtml(descriptorUrl);
    return reply.type('text/html').send(html);
  });

  // GET /jira/atlassian-connect.json
  // Jira fetches this descriptor when installing the Connect app.
  // workspaceId must be passed as a query param so the install lifecycle URL carries it.
  app.get('/atlassian-connect.json', async (request) => {
    const workspaceId = (request.query as Record<string, string>).workspaceId ?? 'unknown';
    return buildConnectDescriptor(config.BASE_URL, workspaceId);
  });

  // POST /jira/lifecycle/installed
  // Called by Jira after a tenant installs the Connect app.
  // workspaceId is embedded in the descriptor URL when installing via the Slack-first flow.
  // When installing Jira first (or re-installing), we auto-create a workspace from the Jira tenant.
  app.post('/lifecycle/installed', async (request, reply) => {
    const payload = request.body as import('@remi/jira').ConnectInstallPayload;
    let workspaceId = (request.query as Record<string, string>).workspaceId ?? '';

    if (!workspaceId || workspaceId === 'unknown') {
      // Check if this Jira tenant already has a workspace
      const existing = await prisma.jiraWorkspaceInstall.findUnique({
        where: { jiraClientKey: payload.clientKey },
      });
      if (existing) {
        workspaceId = existing.workspaceId;
        app.log.info({ clientKey: payload.clientKey, workspaceId }, 'Re-installing Jira for existing workspace');
      } else {
        // Jira-first install: create a workspace from the Jira site URL
        const siteName = payload.baseUrl
          .replace(/^https?:\/\//, '')
          .replace('.atlassian.net', '')
          .replace(/[^a-z0-9]/gi, '-')
          .toLowerCase();
        const slug = `${siteName}-${Date.now()}`;
        const workspace = await createWorkspace(prisma, { name: siteName, slug });
        workspaceId = workspace.id;
        app.log.info({ clientKey: payload.clientKey, workspaceId, siteName }, 'Created new workspace via Jira Connect install');
      }
    }

    await handleInstalled(payload, workspaceId);
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
    const [summary, cwr, links] = await Promise.all([
      issue ? findCurrentSummary(prisma, issue.id).catch(() => null) : Promise.resolve(null),
      issue ? findCwrByIssueId(prisma, issue.id).catch(() => null) : Promise.resolve(null),
      issue ? findLinksByIssueId(prisma, issue.id) : Promise.resolve([]),
    ]);

    const html = renderIssuePanel({
      issueKey,
      summary: (summary?.content as import('@remi/shared').SummaryOutput | null) ?? null,
      linkedThreadCount: links.filter((l) => !l.unlinkedAt).length,
      cwr: cwr ? {
        currentState: cwr.currentState,
        ownerDisplayName: cwr.ownerDisplayName,
        waitingOnType: cwr.waitingOnType,
        waitingOnDescription: cwr.waitingOnDescription,
        nextStep: cwr.nextStep,
        blockerSummary: cwr.blockerSummary,
        riskScore: cwr.riskScore,
        confidence: cwr.confidence,
        isStale: cwr.isStale,
        updatedAt: cwr.updatedAt.toISOString(),
      } : null,
    });

    return reply.type('text/html').send(html);
  });
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────
function jiraInstallPageHtml(descriptorUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect Jira — Remi</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f8f8; display: flex; justify-content: center; padding: 48px 24px; }
    .card { background: #fff; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); max-width: 560px; width: 100%; padding: 40px; }
    h1 { font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 8px; }
    .subtitle { font-size: 15px; color: #555; margin-bottom: 32px; }
    .step { display: flex; gap: 16px; margin-bottom: 24px; }
    .step-num { width: 28px; height: 28px; border-radius: 50%; background: #1264A3; color: #fff; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
    .step-body { flex: 1; }
    .step-body strong { font-size: 15px; color: #1a1a1a; display: block; margin-bottom: 4px; }
    .step-body p { font-size: 14px; color: #555; line-height: 1.5; }
    .url-box { background: #f3f4f6; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px 16px; font-family: monospace; font-size: 13px; color: #1a1a1a; word-break: break-all; margin: 10px 0; position: relative; }
    .copy-btn { display: inline-block; margin-top: 8px; padding: 6px 14px; background: #1264A3; color: #fff; border: none; border-radius: 4px; font-size: 13px; font-weight: 500; cursor: pointer; }
    .copy-btn:hover { background: #0f4f87; }
    .divider { border: none; border-top: 1px solid #e8e8e8; margin: 28px 0; }
    .jira-link-section { margin-top: 4px; }
    label { font-size: 14px; font-weight: 500; color: #333; display: block; margin-bottom: 6px; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #d0d0d0; border-radius: 6px; font-size: 14px; }
    .open-btn { display: inline-block; margin-top: 10px; padding: 10px 20px; background: #2684FF; color: #fff; border: none; border-radius: 4px; font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; }
    .open-btn:hover { background: #1a6fe0; }
    .note { font-size: 12px; color: #888; margin-top: 24px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Connect Jira to Remi</h1>
    <p class="subtitle">Follow these steps to install the Remi app in your Jira workspace.</p>

    <div class="step">
      <div class="step-num">1</div>
      <div class="step-body">
        <strong>Copy your Remi descriptor URL</strong>
        <p>This URL is unique to your workspace. Jira will use it to install Remi.</p>
        <div class="url-box" id="descriptor-url">${descriptorUrl}</div>
        <button class="copy-btn" onclick="copyUrl()">Copy URL</button>
      </div>
    </div>

    <div class="step">
      <div class="step-num">2</div>
      <div class="step-body">
        <strong>Open your Jira app management page</strong>
        <p>Enter your Jira site name below and click the button to open the right page in Jira.</p>
        <div class="jira-link-section">
          <label for="jira-site">Jira site (e.g. <code>mycompany</code> from mycompany.atlassian.net)</label>
          <input type="text" id="jira-site" placeholder="mycompany" oninput="updateLink()" />
          <br>
          <a id="jira-link" class="open-btn" href="#" target="_blank" onclick="return openJira()">Open Jira app management →</a>
        </div>
      </div>
    </div>

    <div class="step">
      <div class="step-num">3</div>
      <div class="step-body">
        <strong>Install the app in Jira</strong>
        <p>In the Jira app management page:</p>
        <ol style="margin: 8px 0 0 16px; font-size: 14px; color: #555; line-height: 2;">
          <li>Click the <strong>Settings</strong> tab and enable <strong>Development mode</strong></li>
          <li>Click <strong>Upload app</strong> (or <strong>Install a private app</strong>)</li>
          <li>Paste the URL from Step 1 and click <strong>Upload</strong></li>
        </ol>
      </div>
    </div>

    <hr class="divider">

    <div class="step">
      <div class="step-num">✓</div>
      <div class="step-body">
        <strong>Confirm it worked</strong>
        <p>Open any Jira issue — you should see a <strong>Remi Summary</strong> panel in the right sidebar. Then go to Slack and run <code>/link-ticket YOUR-ISSUE-KEY</code> in any thread to create your first link.</p>
      </div>
    </div>

    <p class="note">⚠ Atlassian ended new Connect app installs via descriptor URL on March 31 2026. If you see an error saying private app installs are disabled, contact your Atlassian organisation admin to enable development mode.</p>
  </div>

  <script>
    function copyUrl() {
      const url = document.getElementById('descriptor-url').innerText;
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.querySelector('.copy-btn');
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy URL', 2000);
      });
    }

    function openJira() {
      const site = document.getElementById('jira-site').value.trim().replace(/\\.atlassian\\.net$/, '');
      if (!site) { alert('Enter your Jira site name first.'); return false; }
      window.open('https://' + site + '.atlassian.net/jira/apps/manage', '_blank');
      return false;
    }
  </script>
</body>
</html>`;
}
