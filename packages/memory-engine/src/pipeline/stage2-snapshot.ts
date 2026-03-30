import type { PrismaClient } from '@prisma/client';
import { getLatestSnapshot, listObservationsSince, createSnapshot } from '@remi/db';
import type { MemoryModelClient } from '../clients/interface.js';
import { MODELS, PROMPT_VERSIONS } from '../models.js';

export interface SnapshotResult {
  headline: string;
  currentState: string;
  keyDecisions: string[];
  openActions: Array<{ description: string; assignee?: string; dueDate?: string }>;
  blockers: string[];
  openQuestions: string[];
  owners: string[];
  confidence: number;
}

export function buildSnapshotPrompt(): string {
  return `You are a memory synthesis engine for a workplace operations tool called Remi.

Given a prior memory snapshot (may be null for first run) and a list of new observations, produce an updated structured memory snapshot.

Return JSON with exactly these fields:
- headline: one sentence capturing the current state (max 15 words)
- currentState: 2-3 sentences describing what is happening right now
- keyDecisions: string array of decided items (include prior decisions unless superseded)
- openActions: array of { description: string, assignee?: string, dueDate?: string }
- blockers: string array of current blockers
- openQuestions: string array of unresolved questions
- owners: string array of responsible people (names or Slack user IDs)
- confidence: float 0.0–1.0, your overall confidence in this snapshot

Rules:
- Do not duplicate items already in the prior snapshot unless updated
- If a prior blocker is resolved by new observations, remove it
- If a prior open action appears complete, remove it from openActions
- If new observations contradict the prior snapshot, prefer the newer information
- If no meaningful state exists, set confidence below 0.5
- Return only valid JSON. No markdown, no explanation.`;
}

export function parseSnapshotResponse(raw: string): SnapshotResult {
  const parsed = JSON.parse(raw) as Partial<SnapshotResult>;
  return {
    headline: parsed.headline ?? '',
    currentState: parsed.currentState ?? '',
    keyDecisions: Array.isArray(parsed.keyDecisions) ? parsed.keyDecisions : [],
    openActions: Array.isArray(parsed.openActions) ? parsed.openActions : [],
    blockers: Array.isArray(parsed.blockers) ? parsed.blockers : [],
    openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions : [],
    owners: Array.isArray(parsed.owners) ? parsed.owners : [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
  };
}

export async function runStage2(
  prisma: PrismaClient,
  memoryUnitId: string,
  client: MemoryModelClient,
): Promise<{ snapshot: Awaited<ReturnType<typeof createSnapshot>>; isNew: boolean }> {
  const prior = await getLatestSnapshot(prisma, memoryUnitId);
  const since = prior ? prior.createdAt : new Date(0);
  const newObservations = await listObservationsSince(prisma, memoryUnitId, since);

  if (newObservations.length === 0) {
    if (!prior) throw new Error(`[stage2] No observations and no prior snapshot for unit ${memoryUnitId}`);
    return { snapshot: prior as any, isNew: false };
  }

  const systemPrompt = buildSnapshotPrompt();
  const userContent = JSON.stringify({
    priorSnapshot: prior
      ? { headline: prior.headline, currentState: prior.currentState, keyDecisions: prior.keyDecisions, openActions: prior.openActions, blockers: prior.blockers, openQuestions: prior.openQuestions, owners: prior.owners }
      : null,
    newObservations: newObservations.map((o) => ({ category: o.category, content: o.content, confidence: o.confidence })),
  });

  const raw = await client.complete(systemPrompt, userContent);
  const result = parseSnapshotResponse(raw);

  const snapshot = await createSnapshot(prisma, {
    memoryUnitId,
    ...result,
    freshness: new Date(),
    modelId: MODELS.STAGE2_SNAPSHOT,
    promptVersion: PROMPT_VERSIONS.STAGE2_SNAPSHOT,
    sourceObsIds: newObservations.map((o) => o.id),
  });

  return { snapshot, isNew: true };
}
