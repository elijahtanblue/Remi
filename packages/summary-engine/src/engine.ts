import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { SummaryOutput } from '@remi/shared';
import { collectIssueData } from './collectors/issue-collector.js';
import { collectThreadData } from './collectors/thread-collector.js';
import { analyzeStatus } from './analyzers/status-analyzer.js';
import { detectBlockers } from './analyzers/blocker-detector.js';
import { detectOpenQuestions } from './analyzers/question-detector.js';
import { analyzeOwnership } from './analyzers/ownership-analyzer.js';
import { scoreCompleteness } from './analyzers/completeness-scorer.js';
import { formatSummary } from './formatters/summary-formatter.js';
import type { AnalysisResult } from './types.js';

export interface GenerateSummaryResult {
  summary: SummaryOutput;
  inputHash: string;
  version: number;
  skipped: boolean;
}

export async function generateSummary(
  prisma: PrismaClient,
  issueId: string,
  triggerReason: string,
  opts?: { force?: boolean },
): Promise<GenerateSummaryResult> {
  // 1. Collect issue + events
  const { issue, events } = await collectIssueData(prisma, issueId);

  // 2. Collect threads
  const threads = await collectThreadData(prisma, issueId);

  // 3. Compute inputHash
  const totalMessages = threads.reduce((acc, t) => acc + t.messages.length, 0);
  const hashInput = `${issue.updatedAt.toISOString()}:${events.length}:${totalMessages}`;
  const inputHash = createHash('sha256').update(hashInput).digest('hex');

  // 4. Check for existing current summary
  const existingSummary = await prisma.summary.findFirst({
    where: { issueId, status: 'current' },
    orderBy: { version: 'desc' },
  });

  if (existingSummary && existingSummary.inputHash === inputHash && opts?.force !== true) {
    return {
      summary: existingSummary.content as unknown as SummaryOutput,
      inputHash,
      version: existingSummary.version,
      skipped: true,
    };
  }

  // 5. Run analyzers
  const now = new Date();
  const { latestImportantChanges, previousAssignee, statusDriftDetected } = analyzeStatus(
    events,
    threads,
    now,
  );
  const probableBlockers = detectBlockers(threads, now);
  const openQuestions = detectOpenQuestions(threads, now);
  const { missingOwner, missingHandoff } = analyzeOwnership(issue, events, now);

  const isDone =
    issue.statusCategory?.toLowerCase() === 'done' ||
    issue.status?.toLowerCase() === 'done';
  const completionMismatch = isDone && openQuestions.length > 0;

  const totalMsgs = threads.reduce((acc, t) => acc + t.messages.length, 0);
  const participantSet = new Set<string>();
  for (const t of threads) {
    for (const m of t.messages) {
      participantSet.add(m.slackUserId);
    }
  }

  const analysis: AnalysisResult = {
    latestImportantChanges,
    previousAssignee,
    probableBlockers,
    openQuestions,
    statusDriftDetected,
    missingOwner,
    missingHandoff,
    completionMismatch,
    totalMessages: totalMsgs,
    uniqueParticipants: participantSet.size,
  };

  // 6. Score completeness
  const scored = scoreCompleteness({
    issue,
    threads,
    blockers: probableBlockers,
    openQuestions,
    statusDriftDetected,
    missingOwner,
    missingHandoff,
  });

  // 7. Format summary
  const summary = formatSummary({ issue, events, threads }, analysis, scored);

  // 8. Persist atomically
  const version = (existingSummary?.version ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.summary.updateMany({
      where: { issueId, status: 'current' },
      data: { status: 'superseded' },
    });

    await tx.summary.create({
      data: {
        issueId,
        version,
        content: summary as unknown as import('@prisma/client').Prisma.InputJsonValue,
        triggerReason,
        inputHash,
        status: 'current',
      },
    });
  });

  return { summary, inputHash, version, skipped: false };
}
