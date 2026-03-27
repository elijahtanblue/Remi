import type { App } from '@slack/bolt';
import { v4 as uuidv4 } from 'uuid';
import { QueueNames } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import { prisma, findSlackThreadByTs, findLinksByThreadId } from '@remi/db';

export function registerMessageEvents(app: App, queue: IQueueProducer): void {
  app.event('message', async ({ event, context, logger }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = event as any;

    // 1. Only process thread replies (not top-level messages)
    if (!msg.thread_ts) {
      return;
    }

    // Ignore bot messages and message_changed/message_deleted subtypes
    if (msg.subtype && msg.subtype !== 'thread_broadcast') {
      return;
    }

    const teamId: string = (context as Record<string, unknown>).teamId as string;
    const channelId: string = msg.channel;
    const threadTs: string = msg.thread_ts;

    try {
      // 2. Look up SlackThread in DB
      const thread = await findSlackThreadByTs(prisma, teamId, channelId, threadTs);
      if (!thread) {
        return;
      }

      // 3. Check for active IssueThreadLinks
      const links = await findLinksByThreadId(prisma, thread.id);
      const activeLinks = links.filter(
        // unlinkedAt is null when the link is still active
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (l: any) => l.unlinkedAt == null,
      );

      if (activeLinks.length === 0) {
        return;
      }

      // 4. Enqueue to SLACK_EVENTS queue
      const workspaceId = thread.workspaceId;
      const idempotencyKey = `slack:${teamId}:${channelId}:${msg.ts as string}`;

      await queue.send(QueueNames.SLACK_EVENTS, {
        id: uuidv4(),
        idempotencyKey,
        workspaceId,
        timestamp: new Date().toISOString(),
        type: 'slack_event',
        payload: {
          kind: 'message',
          teamId,
          channelId,
          userId: msg.user ?? '',
          threadTs,
          messageTs: msg.ts as string,
          text: msg.text ?? '',
          rawEvent: event as unknown as Record<string, unknown>,
        },
      });
    } catch (err) {
      logger.error(err);
    }
  });
}
