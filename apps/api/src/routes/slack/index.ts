import { createHmac, timingSafeEqual } from 'crypto';
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
import { config } from '../../config.js';
import { queue } from '../../queue.js';

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

export async function slackRoutes(app: FastifyInstance) {
  const slackApp = createSlackApp({
    signingSecret: config.SLACK_SIGNING_SECRET,
    botToken: config.SLACK_BOT_TOKEN,
    appToken: config.SLACK_APP_TOKEN,
    socketMode: config.SLACK_SOCKET_MODE,
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
    // Socket Mode: Bolt manages its own WebSocket connection to Slack.
    // No HTTP routes are needed for inbound events — Slack pushes over the socket.
    await slackApp.start();
    app.log.info('Slack app started in Socket Mode');
  } else {
    // Slack signs the exact raw payload body, so for HTTP mode we parse Slack requests
    // as raw strings inside this plugin, verify the signature ourselves, then hand the
    // already-parsed payload to Bolt via processEvent().
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
  }
}
