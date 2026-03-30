import type { PrismaClient } from '@prisma/client';
import type { MemoryModelClient } from '../clients/interface.js';
import { runStage1 } from './stage1-extract.js';
import { runStage2 } from './stage2-snapshot.js';
import { runStage3 } from './stage3-propose.js';

export interface PipelineClients {
  stage1: MemoryModelClient; // Gemini Flash-Lite
  stage2: MemoryModelClient; // GPT-5.4 nano
  stage3: MemoryModelClient; // GPT-5.4
}

/**
 * Run Stage 1 extraction for a single new source event.
 * Enqueue memory.snapshot separately after this completes.
 */
export async function runExtraction(
  prisma: PrismaClient,
  opts: {
    memoryUnitId: string;
    sourceId: string;
    sourceType: 'slack_message' | 'jira_event';
    messageText: string;
  },
  clients: PipelineClients,
) {
  return runStage1(prisma, opts.memoryUnitId, opts.sourceId, opts.sourceType, opts.messageText, clients.stage1);
}

/**
 * Run Stage 2 snapshot synthesis. Reads all observations since last snapshot.
 * Optionally run Stage 3 if the unit is linked to a Jira issue.
 */
export async function runSnapshot(
  prisma: PrismaClient,
  opts: { memoryUnitId: string; proposeWriteback: boolean },
  clients: PipelineClients,
) {
  const { snapshot, isNew } = await runStage2(prisma, opts.memoryUnitId, clients.stage2);

  if (isNew && opts.proposeWriteback) {
    await runStage3(prisma, opts.memoryUnitId, snapshot.id, clients.stage3);
  }

  return { snapshot, isNew };
}

/**
 * Apply an approved writeback proposal to Jira.
 * Called by the memory.writeback.apply job handler — Jira client injected by caller.
 */
export async function applyWriteback(
  opts: {
    proposalId: string;
    commentBody: string;
    jiraIssueKey: string;
    jiraSiteUrl: string;
  },
  postComment: (siteUrl: string, issueKey: string, body: string) => Promise<void>,
) {
  await postComment(opts.jiraSiteUrl, opts.jiraIssueKey, opts.commentBody);
}
