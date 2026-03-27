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
      },
    })
  : new MemoryQueueAdapter();
