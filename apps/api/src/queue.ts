import { config } from './config.js';
import { MemoryQueueAdapter, SqsQueueAdapter } from '@remi/queue';
import type { QueueAdapter } from '@remi/queue';
import { QueueNames } from '@remi/shared';

export const queue: QueueAdapter = config.QUEUE_ADAPTER === 'sqs'
  ? new SqsQueueAdapter({
      region: config.SQS_REGION,
      queueUrls: {
        [QueueNames.SLACK_EVENTS]: config.SQS_SLACK_EVENTS_URL!,
        [QueueNames.JIRA_EVENTS]: config.SQS_JIRA_EVENTS_URL!,
        [QueueNames.SUMMARY_JOBS]: config.SQS_SUMMARY_JOBS_URL!,
        [QueueNames.BACKFILL_JOBS]: config.SQS_BACKFILL_JOBS_URL!,
        [QueueNames.MEMORY_EXTRACT]: config.SQS_MEMORY_EXTRACT_URL ?? '',
        [QueueNames.MEMORY_SNAPSHOT]: config.SQS_MEMORY_SNAPSHOT_URL ?? '',
        [QueueNames.MEMORY_WRITEBACK_PROPOSE]: config.SQS_MEMORY_WRITEBACK_PROPOSE_URL ?? '',
        [QueueNames.MEMORY_WRITEBACK_APPLY]: config.SQS_MEMORY_WRITEBACK_APPLY_URL ?? '',
      },
    })
  : new MemoryQueueAdapter();
