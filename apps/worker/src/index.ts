import { config } from './config.js';
import { MemoryQueueAdapter, SqsQueueAdapter } from '@remi/queue';
import { QueueNames } from '@remi/shared';
import { startConsumer } from './consumer.js';
import { handleJiraEvent } from './handlers/jira-events.js';
import { handleSlackEvent } from './handlers/slack-events.js';
import { handleSummaryJob } from './handlers/summary-jobs.js';
import { handleBackfillJob } from './handlers/backfill-jobs.js';
import type { JiraEventMessage, SlackEventMessage, SummaryJobMessage, BackfillJobMessage } from '@remi/shared';

const queue =
  config.QUEUE_ADAPTER === 'sqs'
    ? new SqsQueueAdapter({
        region: config.SQS_REGION,
        queueUrls: {
          [QueueNames.SLACK_EVENTS]: config.SQS_SLACK_EVENTS_URL ?? '',
          [QueueNames.JIRA_EVENTS]: config.SQS_JIRA_EVENTS_URL ?? '',
          [QueueNames.SUMMARY_JOBS]: config.SQS_SUMMARY_JOBS_URL ?? '',
          [QueueNames.BACKFILL_JOBS]: config.SQS_BACKFILL_JOBS_URL ?? '',
        },
      })
    : new MemoryQueueAdapter();

startConsumer(queue, QueueNames.JIRA_EVENTS, (msg) =>
  handleJiraEvent(msg as JiraEventMessage, queue),
);

startConsumer(queue, QueueNames.SLACK_EVENTS, (msg) =>
  handleSlackEvent(msg as SlackEventMessage, queue),
);

startConsumer(queue, QueueNames.SUMMARY_JOBS, (msg) =>
  handleSummaryJob(msg as SummaryJobMessage),
);

startConsumer(queue, QueueNames.BACKFILL_JOBS, (msg) =>
  handleBackfillJob(msg as BackfillJobMessage, queue),
);

console.log(`[worker] Started consuming queues: ${Object.values(QueueNames).join(', ')}`);

process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received, stopping...');
  await queue.stop();
  process.exit(0);
});
