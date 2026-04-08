import type { App } from '@slack/bolt';
import { v4 as uuidv4 } from 'uuid';
import { QueueNames } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import {
  prisma,
  findSlackThreadByTs,
  findLinksByThreadId,
  getMemoryConfig,
  findIssueByKey,
  upsertSlackThread,
  upsertIssueThreadLink,
} from '@remi/db';

// Matches Jira-style ticket keys anywhere in text, e.g. KAN-2, PROJ-123
const TICKET_KEY_RE = /\b([A-Z]+-\d+)\b/g;

// Sentinel threadTs used for the one virtual SlackThread per tracked channel
const CHANNEL_THREAD_SENTINEL = '__channel__';

export function registerMessageEvents(app: App, queue: IQueueProducer): void {
  app.event('message', async ({ event, context, logger }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = event as any;

    // Ignore bot messages and message_changed/message_deleted subtypes
    if (msg.subtype && msg.subtype !== 'thread_broadcast') {
      return;
    }

    const teamId: string = (context as Record<string, unknown>).teamId as string;
    const workspaceId: string = (context as Record<string, unknown>).workspaceId as string;
    const channelId: string = msg.channel;

    try {
      if (!msg.thread_ts) {
        // Top-level message — check channel tracking
        await handleChannelMessage({ msg, event, teamId, channelId, workspaceId, queue });
        return;
      }

      // Thread reply — existing logic
      const threadTs: string = msg.thread_ts;
      const thread = await findSlackThreadByTs(prisma, teamId, channelId, threadTs);
      if (!thread) return;

      const links = await findLinksByThreadId(prisma, thread.id);
      const activeLinks = links.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (l: any) => l.unlinkedAt == null,
      );
      if (activeLinks.length === 0) return;

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

async function handleChannelMessage({
  msg,
  event,
  teamId,
  channelId,
  workspaceId,
  queue,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  msg: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any;
  teamId: string;
  channelId: string;
  workspaceId: string;
  queue: IQueueProducer;
}): Promise<void> {
  // 1. Check that memory is enabled and this channel is tracked
  const memConfig = await getMemoryConfig(prisma, workspaceId);
  if (!memConfig?.enabled || !memConfig.trackedChannelIds.includes(channelId)) return;

  // 2. Extract all ticket keys from the message text
  const text: string = msg.text ?? '';
  const keys = [...new Set(Array.from(text.matchAll(TICKET_KEY_RE), (m) => m[1]))];
  if (keys.length === 0) return;

  // 3. Upsert the one virtual SlackThread for this channel
  const thread = await upsertSlackThread(prisma, {
    workspaceId,
    slackTeamId: teamId,
    channelId,
    threadTs: CHANNEL_THREAD_SENTINEL,
    isChannelLevel: true,
  });

  // 4. Upsert an IssueThreadLink for each found issue
  let linkedCount = 0;
  for (const key of keys) {
    const issue = await findIssueByKey(prisma, workspaceId, key);
    if (!issue) continue;
    await upsertIssueThreadLink(prisma, { issueId: issue.id, threadId: thread.id });
    linkedCount++;
  }

  // 5. Only queue if at least one valid issue was found
  if (linkedCount === 0) return;

  await queue.send(QueueNames.SLACK_EVENTS, {
    id: uuidv4(),
    idempotencyKey: `slack:${teamId}:${channelId}:${msg.ts as string}`,
    workspaceId,
    timestamp: new Date().toISOString(),
    type: 'slack_event',
    payload: {
      kind: 'message',
      teamId,
      channelId,
      userId: msg.user ?? '',
      threadTs: CHANNEL_THREAD_SENTINEL,
      messageTs: msg.ts as string,
      text: msg.text ?? '',
      rawEvent: event as unknown as Record<string, unknown>,
    },
  });
}
