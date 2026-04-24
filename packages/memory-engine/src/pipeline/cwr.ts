import { createHash } from 'node:crypto';
import type { MeaningfulEventInsert } from '@remi/db';
import { MODELS, PROMPT_VERSIONS } from '../models.js';
import type { MemoryModelClient } from '../clients/interface.js';

export function computeSnapshotSetHash(
  snapshots: Array<{ memoryUnitId: string; version: number }>,
  jira: { status: string | null; assigneeId: string | null; priority: string | null },
): string {
  const parts = [...snapshots]
    .sort((a, b) => a.memoryUnitId.localeCompare(b.memoryUnitId))
    .map((snapshot) => `${snapshot.memoryUnitId}:${snapshot.version}`);
  parts.push(
    `status:${jira.status ?? ''}`,
    `assignee:${jira.assigneeId ?? ''}`,
    `priority:${jira.priority ?? ''}`,
  );
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function fingerprintNextStep(value: string | null): string {
  if (!value) return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:'"]/g, '')
    .replace(/\s+/g, ' ');
}

type PartialCwr = {
  id: string;
  blockerSummary: string | null;
  ownerExternalId: string | null;
  waitingOnType: string | null;
  waitingOnDescription: string | null;
  nextStep: string | null;
  isStale: boolean;
  lastJiraStatus: string | null;
};

export function diffCwr(
  prev: PartialCwr,
  next: PartialCwr,
  primarySource: string,
): Omit<MeaningfulEventInsert, 'issueId' | 'workspaceId' | 'idempotencyKey'>[] {
  const occurredAt = new Date();
  const events: Omit<MeaningfulEventInsert, 'issueId' | 'workspaceId' | 'idempotencyKey'>[] = [];

  if (!prev.blockerSummary && next.blockerSummary) {
    events.push({
      eventType: 'blocker_created',
      summary: `Blocker detected: ${next.blockerSummary}`,
      source: primarySource,
      occurredAt,
      metadata: { blocker: next.blockerSummary },
    });
  }

  if (prev.blockerSummary && !next.blockerSummary) {
    events.push({
      eventType: 'blocker_removed',
      summary: 'Blocker cleared',
      source: primarySource,
      occurredAt,
      metadata: { was: prev.blockerSummary },
    });
  }

  if (next.ownerExternalId && prev.ownerExternalId !== next.ownerExternalId) {
    events.push({
      eventType: 'owner_changed',
      summary: 'Owner changed',
      source: primarySource,
      occurredAt,
      metadata: { from: prev.ownerExternalId, to: next.ownerExternalId },
    });
  }

  if (
    prev.waitingOnType !== next.waitingOnType ||
    prev.waitingOnDescription !== next.waitingOnDescription
  ) {
    if (next.waitingOnType || next.waitingOnDescription) {
      events.push({
        eventType: 'waiting_on_changed',
        summary: `Now waiting on: ${next.waitingOnDescription ?? next.waitingOnType}`,
        source: primarySource,
        occurredAt,
        metadata: {
          from: { type: prev.waitingOnType, description: prev.waitingOnDescription },
          to: { type: next.waitingOnType, description: next.waitingOnDescription },
        },
      });
    }
  }

  if (fingerprintNextStep(prev.nextStep) !== fingerprintNextStep(next.nextStep)) {
    if (next.nextStep) {
      events.push({
        eventType: 'next_step_changed',
        summary: `Next step updated: ${next.nextStep}`,
        source: primarySource,
        occurredAt,
        metadata: { from: prev.nextStep, to: next.nextStep },
      });
    }
  }

  if (!prev.isStale && next.isStale) {
    events.push({
      eventType: 'stale_detected',
      summary: 'Issue has gone stale: no recent updates',
      source: primarySource,
      occurredAt,
    });
  }

  if (prev.isStale && !next.isStale) {
    events.push({
      eventType: 'stale_resolved',
      summary: 'Issue is no longer stale',
      source: primarySource,
      occurredAt,
    });
  }

  if (prev.lastJiraStatus && next.lastJiraStatus && prev.lastJiraStatus !== next.lastJiraStatus) {
    events.push({
      eventType: 'status_changed',
      summary: `Jira status changed from ${prev.lastJiraStatus} to ${next.lastJiraStatus}`,
      source: 'jira',
      occurredAt,
      metadata: { from: prev.lastJiraStatus, to: next.lastJiraStatus },
    });
  }

  return events;
}

export interface CwrSynthesisInput {
  issueId: string;
  jiraIssueKey: string;
  jiraStatus: string | null;
  jiraAssigneeId: string | null;
  jiraAssigneeName: string | null;
  jiraPriority: string | null;
  snapshots: Array<{
    memoryUnitId: string;
    version: number;
    currentSummary: string;
    updatedAt: Date;
  }>;
}

export interface CwrSynthesisOutput {
  currentState: string;
  ownerDisplayName: string | null;
  ownerExternalId: string | null;
  ownerSource: 'jira' | 'slack' | 'email' | null;
  blockerSummary: string | null;
  waitingOnType: string | null;
  waitingOnDescription: string | null;
  openQuestions: unknown[];
  nextStep: string | null;
  riskScore: number;
  urgencyReason: string | null;
  isStale: boolean;
  confidence: number;
  dataSources: string[];
}

const SYSTEM_PROMPT = `You synthesize a Current Work Record for an operational issue.
Return only valid JSON with: currentState, ownerDisplayName, ownerExternalId, ownerSource,
blockerSummary, waitingOnType, waitingOnDescription, openQuestions, nextStep, riskScore,
urgencyReason, isStale, confidence, dataSources.`;

export async function runCwrSynthesis(
  input: CwrSynthesisInput,
  client: MemoryModelClient,
): Promise<CwrSynthesisOutput> {
  const snapshotText = input.snapshots
    .map(
      (snapshot, index) =>
        `Snapshot ${index + 1} (${snapshot.memoryUnitId} v${snapshot.version}, ${snapshot.updatedAt.toISOString()}):\n${snapshot.currentSummary}`,
    )
    .join('\n\n');

  const userContent = `Issue: ${input.jiraIssueKey}
Status: ${input.jiraStatus ?? 'unknown'}
Assignee: ${input.jiraAssigneeName ?? 'unassigned'} (${input.jiraAssigneeId ?? 'none'})
Priority: ${input.jiraPriority ?? 'unknown'}
Model: ${MODELS.STAGE4_CWR}
Prompt: ${PROMPT_VERSIONS.STAGE4_CWR}

Snapshots:
${snapshotText || '(no snapshots yet)'}`;

  const raw = JSON.parse(await client.complete(SYSTEM_PROMPT, userContent));
  return {
    currentState: String(raw.currentState ?? 'Status unknown'),
    ownerDisplayName: raw.ownerDisplayName ?? null,
    ownerExternalId: raw.ownerExternalId ?? null,
    ownerSource: raw.ownerSource ?? null,
    blockerSummary: raw.blockerSummary ?? null,
    waitingOnType: raw.waitingOnType ?? null,
    waitingOnDescription: raw.waitingOnDescription ?? null,
    openQuestions: Array.isArray(raw.openQuestions) ? raw.openQuestions : [],
    nextStep: raw.nextStep ?? null,
    riskScore: Math.max(0, Math.min(1, Number(raw.riskScore ?? 0))),
    urgencyReason: raw.urgencyReason ?? null,
    isStale: Boolean(raw.isStale),
    confidence: Math.max(0, Math.min(1, Number(raw.confidence ?? 0.5))),
    dataSources: Array.isArray(raw.dataSources) ? raw.dataSources : [],
  };
}
