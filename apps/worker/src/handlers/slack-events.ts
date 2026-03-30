import {
  prisma,
  createSlackMessage,
  findSlackThreadByTs,
  findLinksByThreadId,
  getMemoryConfig,
  findOrCreateMemoryUnit,
} from '@remi/db';
import type { SlackEventMessage } from '@remi/shared';
import { QueueNames, TriggerReason } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import { v4 as uuidv4 } from 'uuid';
import { isSlackMessageProcessed } from '../dedup.js';

export async function handleSlackEvent(
  message: SlackEventMessage,
  queue: IQueueProducer,
): Promise<void> {
  const { payload } = message;

  // 1. Only process threaded messages
  if (payload.kind !== 'message' || !payload.threadTs) {
    return;
  }

  // 2. Idempotency check
  if (await isSlackMessageProcessed(message.idempotencyKey)) {
    console.log(`[slack-events] Already processed: ${message.idempotencyKey}`);
    return;
  }

  // 3. Find SlackThread
  const thread = await findSlackThreadByTs(
    prisma,
    payload.teamId,
    payload.channelId,
    payload.threadTs,
  );
  if (!thread) {
    console.log(`[slack-events] Thread not found for ts=${payload.threadTs}, skipping`);
    return;
  }

  // 4. Check active links
  const links = await findLinksByThreadId(prisma, thread.id);
  const activeLinks = links.filter((l) => !l.unlinkedAt);
  if (activeLinks.length === 0) {
    console.log(`[slack-events] No active links for thread ${thread.id}, skipping`);
    return;
  }

  // 5. Create SlackMessage record
  const slackMessage = await createSlackMessage(prisma, {
    threadId: thread.id,
    idempotencyKey: message.idempotencyKey,
    slackMessageTs: payload.messageTs,
    slackUserId: payload.userId,
    text: payload.text ?? '',
    rawPayload: payload.rawEvent as Record<string, unknown>,
    source: 'slack_event',
    sentAt: new Date(Number(payload.messageTs) * 1000),
  });

  // 6. Enqueue summary_job for each active link (debounce via idempotency key)
  for (const link of activeLinks) {
    const summaryIdempotencyKey = `summary:slack:${link.issueId}:${payload.messageTs}`;
    await queue.send(QueueNames.SUMMARY_JOBS, {
      type: 'summary_job',
      id: uuidv4(),
      workspaceId: message.workspaceId,
      idempotencyKey: summaryIdempotencyKey,
      timestamp: new Date().toISOString(),
      payload: {
        issueId: link.issueId,
        triggerReason: TriggerReason.SLACK_ACTIVITY,
      },
    });
  }

  // ── Memory ingestion trigger ──────────────────────────────────────────────
  const memoryConfig = await getMemoryConfig(prisma, message.workspaceId);
  if (memoryConfig?.enabled) {
    const threadLinks = await prisma.issueThreadLink.findMany({
      where: { threadId: thread.id, unlinkedAt: null },
      include: { issue: true },
    });

    for (const link of threadLinks) {
      const { unit } = await findOrCreateMemoryUnit(
        prisma, message.workspaceId, 'issue_thread', thread.id, link.issueId,
      );
      await queue.send(QueueNames.MEMORY_EXTRACT, {
        id: uuidv4(),
        idempotencyKey: `memory-extract-${slackMessage.id}`,
        workspaceId: message.workspaceId,
        timestamp: new Date().toISOString(),
        type: 'memory_extract',
        payload: { memoryUnitId: unit.id, sourceType: 'slack_message', sourceId: slackMessage.id },
      });
    }
  }

  // 7. Mark SlackMessage as processed
  await prisma.slackMessage.update({
    where: { id: slackMessage.id },
    data: { processedAt: new Date() },
  });
}
