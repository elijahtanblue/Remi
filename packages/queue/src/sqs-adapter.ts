import {
  SQSClient,
  SendMessageCommand,
  SendMessageBatchCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import type { QueueMessage } from '@remi/shared';
import type { QueueAdapter, PollOptions } from './interface.js';

export interface SqsAdapterConfig {
  region: string;
  queueUrls: Record<string, string>;
}

export class SqsQueueAdapter implements QueueAdapter {
  private client: SQSClient;
  private queueUrls: Record<string, string>;
  private pollers = new Map<string, boolean>();

  constructor(config: SqsAdapterConfig) {
    this.client = new SQSClient({ region: config.region });
    this.queueUrls = config.queueUrls;
  }

  private getQueueUrl(queueName: string): string {
    const url = this.queueUrls[queueName];
    if (!url) throw new Error(`No SQS URL configured for queue: ${queueName}`);
    return url;
  }

  async send(queueName: string, message: QueueMessage): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.getQueueUrl(queueName),
        MessageBody: JSON.stringify(message),
        MessageGroupId: message.workspaceId,
        MessageDeduplicationId: message.idempotencyKey,
      }),
    );
  }

  async sendBatch(queueName: string, messages: QueueMessage[]): Promise<void> {
    const chunks: QueueMessage[][] = [];
    for (let i = 0; i < messages.length; i += 10) {
      chunks.push(messages.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      await this.client.send(
        new SendMessageBatchCommand({
          QueueUrl: this.getQueueUrl(queueName),
          Entries: chunk.map((msg, idx) => ({
            Id: `${idx}`,
            MessageBody: JSON.stringify(msg),
            MessageGroupId: msg.workspaceId,
            MessageDeduplicationId: msg.idempotencyKey,
          })),
        }),
      );
    }
  }

  poll(
    queueName: string,
    handler: (message: QueueMessage) => Promise<void>,
    opts?: PollOptions,
  ): void {
    const batchSize = opts?.batchSize ?? 10;
    const visibilityTimeout = opts?.visibilityTimeoutSeconds ?? 30;
    const waitTime = opts?.waitTimeSeconds ?? 20;
    const queueUrl = this.getQueueUrl(queueName);

    this.pollers.set(queueName, true);

    const pollLoop = async () => {
      while (this.pollers.get(queueName)) {
        try {
          const response = await this.client.send(
            new ReceiveMessageCommand({
              QueueUrl: queueUrl,
              MaxNumberOfMessages: batchSize,
              VisibilityTimeout: visibilityTimeout,
              WaitTimeSeconds: waitTime,
            }),
          );

          for (const sqsMessage of response.Messages ?? []) {
            if (!sqsMessage.Body || !sqsMessage.ReceiptHandle) continue;

            try {
              const message: QueueMessage = JSON.parse(sqsMessage.Body);
              await handler(message);

              await this.client.send(
                new DeleteMessageCommand({
                  QueueUrl: queueUrl,
                  ReceiptHandle: sqsMessage.ReceiptHandle,
                }),
              );
            } catch {
              // Message will become visible again after visibility timeout
            }
          }
        } catch {
          // Wait before retrying on receive error
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    };

    pollLoop();
  }

  async stop(): Promise<void> {
    for (const key of this.pollers.keys()) {
      this.pollers.set(key, false);
    }
  }
}
