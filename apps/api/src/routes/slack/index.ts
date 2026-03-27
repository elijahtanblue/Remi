import type { FastifyInstance } from 'fastify';
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
    // HTTP Mode: Bolt's built-in ExpressReceiver exposes a standard Node.js
    // request handler that we delegate to from Fastify routes.
    //
    // NOTE (production): Bolt's ExpressReceiver uses express middleware internally.
    // When running behind a load balancer or proxy, ensure `trust proxy` is set and
    // that the raw request body is accessible for signature verification. In Fastify v5
    // the raw req/res objects are still available via request.raw / reply.raw.
    // If signature verification fails, consider using Bolt's HTTPReceiver instead
    // and wiring it directly to the Fastify server's underlying http.Server.

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (slackApp as any).receiver.app;

    // POST /slack/events — Slack Event API callbacks
    app.post('/events', async (request, reply) => {
      await new Promise<void>((resolve, reject) => {
        handler(request.raw, reply.raw, (err?: unknown) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });

    // POST /slack/commands — slash command payloads (application/x-www-form-urlencoded)
    app.post('/commands', async (request, reply) => {
      await new Promise<void>((resolve, reject) => {
        handler(request.raw, reply.raw, (err?: unknown) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });

    // POST /slack/interactions — shortcuts, modals, block actions
    app.post('/interactions', async (request, reply) => {
      await new Promise<void>((resolve, reject) => {
        handler(request.raw, reply.raw, (err?: unknown) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });

    // GET /slack/oauth — OAuth 2.0 install flow redirect
    app.get('/oauth', async (request, reply) => {
      await new Promise<void>((resolve, reject) => {
        handler(request.raw, reply.raw, (err?: unknown) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }
}
