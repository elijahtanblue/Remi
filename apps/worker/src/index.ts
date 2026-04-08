import { config } from './config.js';
import { MemoryQueueAdapter, SqsQueueAdapter } from '@remi/queue';
import { QueueNames } from '@remi/shared';
import { startConsumer } from './consumer.js';
import { handleJiraEvent } from './handlers/jira-events.js';
import { handleSlackEvent } from './handlers/slack-events.js';
import { handleSummaryJob } from './handlers/summary-jobs.js';
import { handleBackfillJob } from './handlers/backfill-jobs.js';
import type { JiraEventMessage, SlackEventMessage, SummaryJobMessage, BackfillJobMessage, DocGenerateJobMessage } from '@remi/shared';
import type { MemoryExtractMessage, MemorySnapshotMessage, MemoryWritebackProposeMessage, MemoryWritebackApplyMessage } from '@remi/shared';
import { handleMemoryExtract, handleMemorySnapshot, handleMemoryWritebackPropose, handleMemoryWritebackApply } from './handlers/memory-jobs.js';
import { handleDocGenerateJob } from './handlers/doc-generate-jobs.js';
import { syncAllGmailWorkspaces } from '@remi/gmail';

const queue =
  config.QUEUE_ADAPTER === 'sqs'
    ? new SqsQueueAdapter({
        region: config.SQS_REGION,
        queueUrls: {
          [QueueNames.SLACK_EVENTS]: config.SQS_SLACK_EVENTS_URL ?? '',
          [QueueNames.JIRA_EVENTS]: config.SQS_JIRA_EVENTS_URL ?? '',
          [QueueNames.SUMMARY_JOBS]: config.SQS_SUMMARY_JOBS_URL ?? '',
          [QueueNames.BACKFILL_JOBS]: config.SQS_BACKFILL_JOBS_URL ?? '',
          [QueueNames.MEMORY_EXTRACT]: config.SQS_MEMORY_EXTRACT_URL ?? '',
          [QueueNames.MEMORY_SNAPSHOT]: config.SQS_MEMORY_SNAPSHOT_URL ?? '',
          [QueueNames.MEMORY_WRITEBACK_PROPOSE]: config.SQS_MEMORY_WRITEBACK_PROPOSE_URL ?? '',
          [QueueNames.MEMORY_WRITEBACK_APPLY]: config.SQS_MEMORY_WRITEBACK_APPLY_URL ?? '',
        [QueueNames.DOC_GENERATE_JOBS]: config.SQS_DOC_GENERATE_JOBS_URL ?? '',
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

startConsumer(queue, QueueNames.MEMORY_EXTRACT, (msg) =>
  handleMemoryExtract(msg as MemoryExtractMessage, queue),
);
startConsumer(queue, QueueNames.MEMORY_SNAPSHOT, (msg) =>
  handleMemorySnapshot(msg as MemorySnapshotMessage, queue),
);
startConsumer(queue, QueueNames.MEMORY_WRITEBACK_PROPOSE, (msg) =>
  // Re-proposal requests from admin API only — not triggered automatically
  handleMemoryWritebackPropose(msg as MemoryWritebackProposeMessage, queue),
);
startConsumer(queue, QueueNames.MEMORY_WRITEBACK_APPLY, (msg) =>
  handleMemoryWritebackApply(msg as MemoryWritebackApplyMessage),
);

startConsumer(queue, QueueNames.DOC_GENERATE_JOBS, (msg) =>
  handleDocGenerateJob(msg as DocGenerateJobMessage),
);

console.log(`[worker] Started consuming queues: ${Object.values(QueueNames).join(', ')}`);

// ─── Gmail batch sync ─────────────────────────────────────────────────────────
// Runs immediately on startup then every 2 minutes.
// Set GMAIL_SYNC_ENABLED=false on replica workers to prevent concurrent polling.
// Deduplication is handled by gmailMessageId — re-runs are safe.
const GMAIL_SYNC_INTERVAL_MS = 2 * 60 * 1000;

let gmailSyncTimer: ReturnType<typeof setInterval> | undefined;

if (config.GMAIL_SYNC_ENABLED) {
  syncAllGmailWorkspaces(queue).catch((err: unknown) =>
    console.error('[gmail-sync] Initial sync error:', err),
  );
  gmailSyncTimer = setInterval(() => {
    syncAllGmailWorkspaces(queue).catch((err: unknown) =>
      console.error('[gmail-sync] Sync error:', err),
    );
  }, GMAIL_SYNC_INTERVAL_MS);
}

process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received, stopping...');
  if (gmailSyncTimer) clearInterval(gmailSyncTimer);
  await queue.stop();
  process.exit(0);
});
