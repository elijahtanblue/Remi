export type { QueueAdapter, IQueueProducer, IQueueConsumer, PollOptions } from './interface.js';
export { MemoryQueueAdapter } from './memory-adapter.js';
export { SqsQueueAdapter } from './sqs-adapter.js';
export type { SqsAdapterConfig } from './sqs-adapter.js';

import type { QueueAdapter } from './interface.js';
import { MemoryQueueAdapter } from './memory-adapter.js';
import { SqsQueueAdapter, type SqsAdapterConfig } from './sqs-adapter.js';

export function createQueueAdapter(
  type: 'memory' | 'sqs',
  config?: SqsAdapterConfig,
): QueueAdapter {
  switch (type) {
    case 'memory':
      return new MemoryQueueAdapter();
    case 'sqs': {
      if (!config) throw new Error('SQS config required for sqs adapter');
      return new SqsQueueAdapter(config);
    }
  }
}
