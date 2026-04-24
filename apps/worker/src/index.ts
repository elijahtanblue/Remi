import { config } from './config.js';
import { prisma } from '@remi/db';
import { MemoryQueueAdapter, SqsQueueAdapter } from '@remi/queue';
import { QueueNames } from '@remi/shared';
import { startConsumer } from './consumer.js';
import { handleJiraEvent } from './handlers/jira-events.js';
import { handleSlackEvent } from './handlers/slack-events.js';
import { handleSummaryJob } from './handlers/summary-jobs.js';
import { handleBackfillJob } from './handlers/backfill-jobs.js';
import type { JiraEventMessage, SlackEventMessage, SummaryJobMessage, BackfillJobMessage, DocGenerateJobMessage, CWRGenerateMessage, RiskDigestMessage } from '@remi/shared';
import type { MemoryExtractMessage, MemorySnapshotMessage, MemoryWritebackProposeMessage, MemoryWritebackApplyMessage } from '@remi/shared';
import { handleMemoryExtract, handleMemorySnapshot, handleMemoryWritebackPropose, handleMemoryWritebackApply } from './handlers/memory-jobs.js';
import { handleDocGenerateJob } from './handlers/doc-generate-jobs.js';
import { handleCwrGenerate } from './handlers/cwr-generate.js';
import { handleRiskDigestJob } from './handlers/risk-digest.js';
import { syncAllGmailWorkspaces } from '@remi/gmail';
import { v4 as uuidv4 } from 'uuid';

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
          [QueueNames.CWR_GENERATE]: config.SQS_CWR_GENERATE_URL ?? '',
          [QueueNames.RISK_DIGEST]: config.SQS_RISK_DIGEST_URL ?? '',
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

startConsumer(queue, QueueNames.CWR_GENERATE, (msg) =>
  handleCwrGenerate(msg as CWRGenerateMessage),
);

startConsumer(queue, QueueNames.RISK_DIGEST, (msg) =>
  handleRiskDigestJob(msg as RiskDigestMessage),
);

console.log(`[worker] Started consuming queues: ${Object.values(QueueNames).join(', ')}`);

// ─── Gmail batch sync ─────────────────────────────────────────────────────────
// Runs immediately on startup then every 2 minutes.
// Set GMAIL_SYNC_ENABLED=false on replica workers to prevent concurrent polling.
// Deduplication is handled by gmailMessageId — re-runs are safe.
const GMAIL_SYNC_INTERVAL_MS = 2 * 60 * 1000;

let gmailSyncTimer: ReturnType<typeof setInterval> | undefined;
let cwrStaleSweepTimer: ReturnType<typeof setInterval> | undefined;
let riskDigestTimer: ReturnType<typeof setInterval> | undefined;

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

async function runCwrStaleSweep(): Promise<void> {
  const cwrs = await prisma.currentWorkRecord.findMany({
    select: { issueId: true, workspaceId: true },
  });

  for (const cwr of cwrs) {
    await queue.send(QueueNames.CWR_GENERATE, {
      id: uuidv4(),
      idempotencyKey: `cwr-stale-sweep:${cwr.issueId}:${Math.floor(Date.now() / 3_600_000)}`,
      workspaceId: cwr.workspaceId,
      timestamp: new Date().toISOString(),
      type: 'cwr_generate',
      payload: { issueId: cwr.issueId, triggerSource: 'stale_sweep' },
    });
  }

  console.log(`[cwr-stale-sweep] Enqueued ${cwrs.length} CWR sweep jobs`);
}

async function enqueueRiskDigest(): Promise<void> {
  const periodKey = `weekly:${Math.floor(Date.now() / config.RISK_DIGEST_INTERVAL_MS)}`;
  await queue.send(QueueNames.RISK_DIGEST, {
    id: uuidv4(),
    idempotencyKey: `risk-digest:${periodKey}`,
    workspaceId: 'system',
    timestamp: new Date().toISOString(),
    type: 'risk_digest',
    payload: { cadence: 'weekly', periodKey },
  });

  console.log('[risk-digest] Enqueued weekly digest job');
}

if (config.CWR_STALE_SWEEP_INTERVAL_MS > 0) {
  runCwrStaleSweep().catch((err: unknown) =>
    console.error('[cwr-stale-sweep] Initial sweep error:', err),
  );
  cwrStaleSweepTimer = setInterval(() => {
    runCwrStaleSweep().catch((err: unknown) =>
      console.error('[cwr-stale-sweep] Sweep error:', err),
    );
  }, config.CWR_STALE_SWEEP_INTERVAL_MS);
}

if (config.RISK_DIGEST_SCHEDULER_ENABLED && config.RISK_DIGEST_INTERVAL_MS > 0) {
  riskDigestTimer = setInterval(() => {
    enqueueRiskDigest().catch((err: unknown) =>
      console.error('[risk-digest] Enqueue error:', err),
    );
  }, config.RISK_DIGEST_INTERVAL_MS);
}

process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received, stopping...');
  if (gmailSyncTimer) clearInterval(gmailSyncTimer);
  if (cwrStaleSweepTimer) clearInterval(cwrStaleSweepTimer);
  if (riskDigestTimer) clearInterval(riskDigestTimer);
  await queue.stop();
  process.exit(0);
});
