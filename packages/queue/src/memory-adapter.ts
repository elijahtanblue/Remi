import type { QueueMessage } from '@remi/shared';
import type { QueueAdapter, PollOptions } from './interface.js';

interface InFlightMessage {
  message: QueueMessage;
  visibleAt: number;
  receiptId: string;
}

export class MemoryQueueAdapter implements QueueAdapter {
  private queues = new Map<string, QueueMessage[]>();
  private inFlight = new Map<string, InFlightMessage[]>();
  private pollers = new Map<string, NodeJS.Timeout>();
  private reEnqueueTimers = new Set<NodeJS.Timeout>();
  private running = true;

  async send(queueName: string, message: QueueMessage): Promise<void> {
    const queue = this.queues.get(queueName) ?? [];
    queue.push(message);
    this.queues.set(queueName, queue);
  }

  async sendBatch(queueName: string, messages: QueueMessage[]): Promise<void> {
    for (const message of messages) {
      await this.send(queueName, message);
    }
  }

  poll(
    queueName: string,
    handler: (message: QueueMessage) => Promise<void>,
    opts?: PollOptions,
  ): void {
    const batchSize = opts?.batchSize ?? 10;
    const visibilityTimeout = (opts?.visibilityTimeoutSeconds ?? 30) * 1000;

    const interval = setInterval(async () => {
      if (!this.running) return;

      const queue = this.queues.get(queueName) ?? [];
      const batch = queue.splice(0, batchSize);

      for (const message of batch) {
        const receiptId = `${queueName}:${message.id}:${Date.now()}`;
        const inFlightEntry: InFlightMessage = {
          message,
          visibleAt: Date.now() + visibilityTimeout,
          receiptId,
        };

        const inFlight = this.inFlight.get(queueName) ?? [];
        inFlight.push(inFlightEntry);
        this.inFlight.set(queueName, inFlight);

        try {
          await handler(message);
          // Success: remove from in-flight
          const current = this.inFlight.get(queueName) ?? [];
          this.inFlight.set(
            queueName,
            current.filter((m) => m.receiptId !== receiptId),
          );
        } catch {
          // Failure: message will become visible again after timeout
          // Re-enqueue after visibility timeout expires
          const timer = setTimeout(() => {
            this.reEnqueueTimers.delete(timer);
            const current = this.inFlight.get(queueName) ?? [];
            const entry = current.find((m) => m.receiptId === receiptId);
            if (entry) {
              this.inFlight.set(
                queueName,
                current.filter((m) => m.receiptId !== receiptId),
              );
              const q = this.queues.get(queueName) ?? [];
              q.push(entry.message);
              this.queues.set(queueName, q);
            }
          }, visibilityTimeout);
          this.reEnqueueTimers.add(timer);
        }
      }
    }, 500);

    this.pollers.set(queueName, interval);
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const interval of this.pollers.values()) {
      clearInterval(interval);
    }
    this.pollers.clear();
    for (const timer of this.reEnqueueTimers) {
      clearTimeout(timer);
    }
    this.reEnqueueTimers.clear();
  }

  // Test helpers
  getQueueLength(queueName: string): number {
    return (this.queues.get(queueName) ?? []).length;
  }

  getInFlightCount(queueName: string): number {
    return (this.inFlight.get(queueName) ?? []).length;
  }

  clear(): void {
    this.queues.clear();
    this.inFlight.clear();
  }
}
