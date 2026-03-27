import type { QueueMessage } from '@remi/shared';

export interface IQueueProducer {
  send(queueName: string, message: QueueMessage): Promise<void>;
  sendBatch(queueName: string, messages: QueueMessage[]): Promise<void>;
}

export interface IQueueConsumer {
  poll(
    queueName: string,
    handler: (message: QueueMessage) => Promise<void>,
    opts?: PollOptions,
  ): void;
  stop(): Promise<void>;
}

export interface PollOptions {
  batchSize?: number;
  visibilityTimeoutSeconds?: number;
  waitTimeSeconds?: number;
}

export interface QueueAdapter extends IQueueProducer, IQueueConsumer {}
