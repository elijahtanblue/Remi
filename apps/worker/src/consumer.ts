import type { QueueMessage } from '@remi/shared';
import type { QueueAdapter } from '@remi/queue';
import { createDeadLetter, prisma } from '@remi/db';
import { config } from './config.js';

export function startConsumer(
  queue: QueueAdapter,
  queueName: string,
  handler: (message: QueueMessage) => Promise<void>,
): void {
  queue.poll(
    queueName,
    async (message) => {
      try {
        await handler(message);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[${queueName}] Failed to process message ${message.id}:`, error);

        await createDeadLetter(prisma, {
          workspaceId: message.workspaceId,
          queue: queueName,
          messageId: message.id,
          payload: message as unknown as Record<string, unknown>,
          error,
        });
      }
    },
    { batchSize: 10, visibilityTimeoutSeconds: 60 },
  );
}

// Suppress unused import warning — config is used indirectly for future retry logic
void config;
