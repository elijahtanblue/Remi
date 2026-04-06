import { prisma, getProposal, updateProposalStatus, getMemoryUnit } from '@remi/db';
import type { MemoryExtractMessage, MemorySnapshotMessage, MemoryWritebackProposeMessage, MemoryWritebackApplyMessage } from '@remi/shared';
import { QueueNames } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import { createGeminiClient, createOpenAiClient, runExtraction, runSnapshot, applyWriteback, runStage3 } from '@remi/memory-engine';
import { config } from '../config.js';
import { v4 as uuidv4 } from 'uuid';

/** Recursively extracts plain text from Atlassian Document Format (ADF) nodes. */
function extractAdfText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  if (typeof n.text === 'string') return n.text;
  const children = Array.isArray(n.content) ? n.content : [];
  return (children as unknown[]).map(extractAdfText).filter(Boolean).join(' ');
}

function getClients() {
  if (!config.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  if (!config.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
  return {
    stage1: createGeminiClient(config.GEMINI_API_KEY),
    stage2: createOpenAiClient(config.OPENAI_API_KEY, 'gpt-5.4-nano'),
    stage3: createOpenAiClient(config.OPENAI_API_KEY, 'gpt-5.4'),
  };
}

export async function handleMemoryExtract(message: MemoryExtractMessage, queue: IQueueProducer): Promise<void> {
  const { memoryUnitId, sourceId, sourceType } = message.payload;

  let messageText = '';
  if (sourceType === 'slack_message') {
    const msg = await prisma.slackMessage.findUnique({ where: { id: sourceId } });
    if (!msg) { console.warn(`[memory-extract] SlackMessage ${sourceId} not found`); return; }
    messageText = msg.text;
  } else {
    const event = await prisma.issueEvent.findUnique({ where: { id: sourceId } });
    if (!event) { console.warn(`[memory-extract] IssueEvent ${sourceId} not found`); return; }

    const rawPayload = event.rawPayload as Record<string, unknown> | null;

    if (event.eventType === 'jira_description_sync' || event.eventType === 'jira_comment_sync') {
      // Synthetic events created by the Jira content backfill — text is stored directly in rawPayload
      messageText = (rawPayload?.text as string | undefined) ?? '';
    } else if (event.eventType === 'comment_created' || event.eventType === 'comment_updated') {
      // Extract comment body — Jira sends ADF (object) or plain string
      const comment = rawPayload?.comment as Record<string, unknown> | undefined;
      const body = comment?.body;
      messageText = typeof body === 'string' ? body : extractAdfText(body);
    } else {
      // issue_created / status_changed / assignee_changed etc.
      const parts: string[] = [];
      const changedStr = JSON.stringify(event.changedFields ?? {});
      if (changedStr !== '{}') parts.push(`Change: ${changedStr}`);

      if (event.eventType === 'issue_created') {
        const fields = ((rawPayload?.issue as Record<string, unknown> | undefined)?.fields) as Record<string, unknown> | undefined;
        const desc = fields?.description;
        const descText = typeof desc === 'string' ? desc : extractAdfText(desc);
        if (descText.trim()) parts.push(`Description: ${descText}`);
      }

      messageText = parts.join('\n');
    }
  }

  if (!messageText.trim()) { console.log(`[memory-extract] Empty message text for ${sourceId}, skipping`); return; }

  const clients = getClients();
  await runExtraction(prisma, { memoryUnitId, sourceId, sourceType, messageText }, clients);

  console.log(`[memory-extract] Extracted observations for unit ${memoryUnitId} from ${sourceType} ${sourceId}`);

  // Enqueue Stage 2 snapshot synthesis
  const snapshotKey = uuidv4();
  await queue.send(QueueNames.MEMORY_SNAPSHOT, {
    id: snapshotKey,
    idempotencyKey: `memory-snapshot-${memoryUnitId}`,
    workspaceId: message.workspaceId,
    timestamp: new Date().toISOString(),
    type: 'memory_snapshot',
    payload: { memoryUnitId },
  });
}

export async function handleMemorySnapshot(
  message: MemorySnapshotMessage,
  _queue: IQueueProducer,
): Promise<void> {
  const { memoryUnitId } = message.payload;

  const unit = await getMemoryUnit(prisma, memoryUnitId);
  const proposeWriteback = !!unit?.issueId;

  const clients = getClients();
  const { snapshot, isNew } = await runSnapshot(prisma, { memoryUnitId, proposeWriteback }, clients);

  if (isNew) {
    console.log(`[memory-snapshot] Snapshot v${snapshot.version} created for unit ${memoryUnitId}`);
  }
}

// NOTE: Stage 3 (proposal generation) is called inline by runSnapshot when proposeWriteback=true.
// This handler is reserved for explicit re-proposal requests (e.g., admin "rerun" action).
// No code currently enqueues MEMORY_WRITEBACK_PROPOSE automatically.
export async function handleMemoryWritebackPropose(
  message: MemoryWritebackProposeMessage,
  _queue: IQueueProducer,
): Promise<void> {
  const { memoryUnitId, snapshotId } = message.payload;
  const clients = getClients();
  const result = await runStage3(prisma, memoryUnitId, snapshotId, clients.stage3);
  if (result.proposed) console.log(`[memory-writeback-propose] Proposal ${result.proposalId} created for unit ${memoryUnitId}`);
}

export async function handleMemoryWritebackApply(message: MemoryWritebackApplyMessage): Promise<void> {
  const { proposalId } = message.payload;
  const proposal = await getProposal(prisma, proposalId);

  if (!proposal) { console.warn(`[memory-writeback-apply] Proposal ${proposalId} not found`); return; }
  if (proposal.status !== 'approved') { console.warn(`[memory-writeback-apply] Proposal ${proposalId} is not approved (status: ${proposal.status})`); return; }

  const payload = proposal.payload as { jiraIssueKey: string; commentBody: string };
  const unit = await getMemoryUnit(prisma, proposal.memoryUnitId);
  if (!unit?.issue?.jiraSiteUrl) {
    await updateProposalStatus(prisma, proposalId, 'failed', { failureReason: 'No jiraSiteUrl on linked issue' });
    return;
  }

  try {
    const { JiraClient } = await import('@remi/jira');
    const jiraInstall = await prisma.jiraWorkspaceInstall.findFirst({ where: { workspaceId: message.workspaceId } });
    if (!jiraInstall) throw new Error('No Jira install found for workspace');

    // JiraClient constructor: (baseUrl, sharedSecret)
    const jiraClient = new JiraClient(jiraInstall.jiraSiteUrl, jiraInstall.sharedSecret);
    await applyWriteback(
      { proposalId, commentBody: payload.commentBody, jiraIssueKey: payload.jiraIssueKey, jiraSiteUrl: unit.issue.jiraSiteUrl },
      (_siteUrl: string, issueKey: string, body: string) => jiraClient.addComment(issueKey, body),
    );

    await updateProposalStatus(prisma, proposalId, 'applied');
    console.log(`[memory-writeback-apply] Proposal ${proposalId} applied to Jira ${payload.jiraIssueKey}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await updateProposalStatus(prisma, proposalId, 'failed', { failureReason: reason });
    console.error(`[memory-writeback-apply] Failed to apply proposal ${proposalId}:`, reason);
  }
}
