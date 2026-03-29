import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  createSlackApp,
  registerLinkTicketCommand,
  registerBriefCommand,
  registerAttachThreadShortcut,
  registerMessageEvents,
  registerAppHome,
  workspaceResolverMiddleware,
} from '@remi/slack';
import { prisma, createWorkspace, upsertSlackInstall } from '@remi/db';
import { config } from '../../config.js';
import { queue } from '../../queue.js';

// ─── CSRF state store ─────────────────────────────────────────────────────────
// Simple in-memory store for OAuth state tokens (15-minute TTL).
const oauthStates = new Map<string, number>();

function generateState(): string {
  const state = randomBytes(16).toString('hex');
  oauthStates.set(state, Date.now());
  // Prune expired states to prevent unbounded growth
  if (oauthStates.size > 200) {
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [k, v] of oauthStates.entries()) {
      if (v < cutoff) oauthStates.delete(k);
    }
  }
  return state;
}

function consumeState(state: string): boolean {
  const created = oauthStates.get(state);
  if (!created) return false;
  oauthStates.delete(state);
  return Date.now() - created < 15 * 60 * 1000;
}

// ─── Slack scopes ─────────────────────────────────────────────────────────────
const SLACK_BOT_SCOPES = [
  'channels:history',
  'channels:read',
  'chat:write',
  'commands',
  'im:write',
  'users:read',
  'app_mentions:read',
];

// ─── Bolt authorize (multi-tenant token resolution) ───────────────────────────
async function authorize({ teamId }: { teamId?: string; enterpriseId?: string }) {
  if (!teamId) throw new Error('No team ID in Slack context');
  const install = await prisma.slackWorkspaceInstall.findUnique({
    where: { slackTeamId: teamId },
  });
  if (!install || install.uninstalledAt) {
    throw new Error(`Workspace not found for Slack team: ${teamId}`);
  }
  return { botToken: install.botToken, botUserId: install.botUserId };
}

// ─── Signature verification ───────────────────────────────────────────────────
function verifySlackSignature(rawBody: string, headers: Record<string, unknown>) {
  const signature = headers['x-slack-signature'];
  const timestamp = headers['x-slack-request-timestamp'];

  if (typeof signature !== 'string' || typeof timestamp !== 'string') {
    throw new Error('Missing Slack signature headers');
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    throw new Error('Invalid Slack request timestamp');
  }

  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (timestampSeconds < fiveMinutesAgo) {
    throw new Error('Slack request timestamp is too old');
  }

  const [version, hash] = signature.split('=');
  if (version !== 'v0' || !hash) {
    throw new Error('Unsupported Slack signature version');
  }

  const hmac = createHmac('sha256', config.SLACK_SIGNING_SECRET);
  hmac.update(`${version}:${timestamp}:${rawBody}`);
  const expectedHash = hmac.digest('hex');

  if (!timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash))) {
    throw new Error('Slack signature mismatch');
  }
}

function parseSlackBody(rawBody: string, contentTypeHeader: string | undefined) {
  const contentType = (contentTypeHeader ?? '').split(';')[0].trim().toLowerCase();

  if (contentType === 'application/x-www-form-urlencoded') {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }

  if (!rawBody) {
    return {};
  }

  return JSON.parse(rawBody) as Record<string, unknown>;
}

// ─── Welcome DM ───────────────────────────────────────────────────────────────
async function sendWelcomeDm(botToken: string, userId: string, workspaceId: string) {
  const jiraInstallUrl = `${config.BASE_URL}/jira/install?workspaceId=${workspaceId}`;

  const openRes = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: userId }),
  });
  const openData = (await openRes.json()) as { ok: boolean; channel?: { id: string } };
  if (!openData.ok || !openData.channel) return;

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: openData.channel.id,
      text: 'Welcome to Remi! One more step to complete setup.',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Welcome to Remi!', emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Remi is connected to your Slack workspace. To enable Jira summaries, connect your Jira site — it only takes a minute.',
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Connect Jira →', emoji: true },
              url: jiraInstallUrl,
              style: 'primary',
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Once Jira is connected, use `/link-ticket PROJ-123` inside any Slack thread to link it to a Jira issue.',
          },
        },
      ],
    }),
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────
export async function slackRoutes(app: FastifyInstance) {
  const slackApp = createSlackApp({
    signingSecret: config.SLACK_SIGNING_SECRET,
    botToken: config.SLACK_BOT_TOKEN,
    appToken: config.SLACK_APP_TOKEN,
    socketMode: config.SLACK_SOCKET_MODE,
    // In HTTP mode, use per-workspace token resolution instead of a static token
    authorize: config.SLACK_SOCKET_MODE ? undefined : authorize,
  });

  // Resolve workspaceId from Slack team ID before any handler runs
  slackApp.use(workspaceResolverMiddleware);

  // Register all Bolt handlers
  registerLinkTicketCommand(slackApp, queue);
  registerBriefCommand(slackApp, queue);
  registerAttachThreadShortcut(slackApp, queue);
  registerMessageEvents(slackApp, queue);
  registerAppHome(slackApp);

  if (config.SLACK_SOCKET_MODE) {
    await slackApp.start();
    app.log.info('Slack app started in Socket Mode');
  } else {
    app.removeContentTypeParser(['application/json', 'application/x-www-form-urlencoded']);
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
      done(null, body);
    });
    app.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_request, body, done) => {
        done(null, body);
      }
    );

    const handleSlackRequest = async (request: FastifyRequest, reply: FastifyReply) => {
      const rawBody = typeof request.body === 'string' ? request.body : '';

      verifySlackSignature(rawBody, request.headers as Record<string, unknown>);
      const body = parseSlackBody(rawBody, request.headers['content-type']);

      if (body.type === 'url_verification' && typeof body.challenge === 'string') {
        return reply.type('text/plain').send(body.challenge);
      }

      await slackApp.processEvent({
        body,
        retryNum:
          typeof request.headers['x-slack-retry-num'] === 'string'
            ? Number.parseInt(request.headers['x-slack-retry-num'], 10)
            : undefined,
        retryReason:
          typeof request.headers['x-slack-retry-reason'] === 'string'
            ? request.headers['x-slack-retry-reason']
            : undefined,
        ack: async (response) => {
          if (reply.sent) return;
          if (response === undefined) {
            reply.code(200).send();
            return;
          }
          reply.send(response);
        },
      });

      if (!reply.sent) {
        reply.code(200).send();
      }
    };

    // POST /slack/events — Slack Event API callbacks
    app.post('/events', handleSlackRequest);

    // POST /slack/commands — slash command payloads (application/x-www-form-urlencoded)
    app.post('/commands', handleSlackRequest);

    // POST /slack/interactions — shortcuts, modals, block actions
    app.post('/interactions', handleSlackRequest);

    // GET /slack/install — redirects the user to Slack's OAuth authorization page
    app.get('/install', async (request, reply) => {
      if (!config.SLACK_CLIENT_ID) {
        return reply.code(500).send({ error: 'SLACK_CLIENT_ID is not configured' });
      }
      const state = generateState();
      const params = new URLSearchParams({
        client_id: config.SLACK_CLIENT_ID,
        scope: SLACK_BOT_SCOPES.join(','),
        redirect_uri: `${config.BASE_URL}/slack/oauth_redirect`,
        state,
      });
      return reply.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
    });

    // GET /slack/oauth_redirect — Slack sends the user back here after they approve the install
    app.get('/oauth_redirect', async (request, reply) => {
      const { code, state, error } = request.query as Record<string, string>;

      if (error) {
        app.log.warn({ error }, 'Slack OAuth denied by user');
        return reply
          .type('text/html')
          .send(installResultHtml('Installation cancelled', 'You cancelled the Remi installation. You can try again any time.', false));
      }

      if (!state || !consumeState(state)) {
        return reply.code(400).send({ error: 'Invalid or expired OAuth state' });
      }

      if (!config.SLACK_CLIENT_ID || !config.SLACK_CLIENT_SECRET) {
        return reply.code(500).send({ error: 'OAuth credentials are not configured' });
      }

      // Exchange authorization code for access token
      const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.SLACK_CLIENT_ID,
          client_secret: config.SLACK_CLIENT_SECRET,
          code,
          redirect_uri: `${config.BASE_URL}/slack/oauth_redirect`,
        }),
      });

      const tokenData = (await tokenRes.json()) as {
        ok: boolean;
        error?: string;
        access_token: string;
        bot_user_id: string;
        scope: string;
        team: { id: string; name: string };
        authed_user: { id: string };
      };

      if (!tokenData.ok) {
        app.log.error({ slackError: tokenData.error }, 'Slack OAuth token exchange failed');
        return reply
          .type('text/html')
          .send(installResultHtml('Installation failed', `Slack returned an error: ${tokenData.error}. Please try again.`, false));
      }

      // Create workspace if this is a new Slack team, otherwise update the token
      const existingInstall = await prisma.slackWorkspaceInstall.findUnique({
        where: { slackTeamId: tokenData.team.id },
      });

      let workspaceId: string;
      if (existingInstall) {
        workspaceId = existingInstall.workspaceId;
        app.log.info({ teamId: tokenData.team.id, workspaceId }, 'Re-installing Slack for existing workspace');
      } else {
        const slug = tokenData.team.id.toLowerCase();
        const workspace = await createWorkspace(prisma, {
          name: tokenData.team.name,
          slug,
        });
        workspaceId = workspace.id;
        app.log.info({ teamId: tokenData.team.id, workspaceId }, 'Created new workspace via Slack OAuth');
      }

      await upsertSlackInstall(prisma, {
        workspaceId,
        slackTeamId: tokenData.team.id,
        slackTeamName: tokenData.team.name,
        botToken: tokenData.access_token,
        botUserId: tokenData.bot_user_id,
        scopes: tokenData.scope.split(','),
      });

      // Send a welcome DM to the person who installed the app
      try {
        await sendWelcomeDm(tokenData.access_token, tokenData.authed_user.id, workspaceId);
      } catch (err) {
        // Non-fatal — workspace is already created
        app.log.warn({ err }, 'Failed to send Slack welcome DM');
      }

      return reply
        .type('text/html')
        .send(installResultHtml('Remi is installed!', "Check your Slack DMs — we've sent you instructions to connect Jira and get started.", true));
    });

    // GET /slack/installed — standalone success page (for direct links)
    app.get('/installed', async (_request, reply) => {
      return reply
        .type('text/html')
        .send(installResultHtml('Remi is installed!', "Check your Slack DMs for setup instructions.", true));
    });
  }
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────
function installResultHtml(title: string, body: string, success: boolean): string {
  const color = success ? '#2eb886' : '#e01e5a';
  const icon = success ? '✓' : '✕';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Remi</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f8f8; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { background: #fff; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); max-width: 480px; width: 100%; padding: 48px 40px; text-align: center; }
    .icon { width: 56px; height: 56px; border-radius: 50%; background: ${color}; color: #fff; font-size: 28px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
    h1 { font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 12px; }
    p { font-size: 15px; color: #555; line-height: 1.6; }
    a { color: ${color}; text-decoration: none; font-weight: 500; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`;
}
