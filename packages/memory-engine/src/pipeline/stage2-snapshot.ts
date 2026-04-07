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
  dataSources: string[];
  confidence: number;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeOpenActions(value: unknown): SnapshotResult['openActions'] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): SnapshotResult['openActions'] => {
    if (!entry || typeof entry !== 'object') return [];

    const action = entry as Record<string, unknown>;
    const description = typeof action.description === 'string' ? action.description.trim() : '';
    if (!description) return [];

    const assignee = typeof action.assignee === 'string' && action.assignee.trim()
      ? action.assignee.trim()
      : undefined;
    const dueDate = typeof action.dueDate === 'string' && action.dueDate.trim()
      ? action.dueDate.trim()
      : undefined;

    return [{
      description,
      ...(assignee ? { assignee } : {}),
      ...(dueDate ? { dueDate } : {}),
    }];
  });
}

export function buildSnapshotPrompt(): string {
  return `You are the Stage 2 snapshot engine for Remi.

You are NOT writing a generic summary. You are maintaining a bounded, issue-scoped current work record. Remi ingests data from multiple workplace tools — Slack, Jira, email, and others. Each observation includes a sourceApp field indicating where it came from.

Input:
- priorSnapshot: the last known state for this issue, or null
- newObservations: new durable observations extracted from recent source events

Each new observation includes an id, content, confidence, sourceApp, and extractedAt timestamp. Use newer observations to resolve conflicts. Use priorSnapshot only as prior state, not as a transcript.

Your job:
Update the current work record using only the prior snapshot plus the new observations.
Preserve what is still true.
Remove what is no longer true.
Add only what materially changes the current issue state.

Return valid JSON with exactly these fields:
{
  "headline": string,
  "currentState": string,
  "keyDecisions": string[],
  "openActions": [{ "description": string, "assignee"?: string, "dueDate"?: string }],
  "blockers": string[],
  "openQuestions": string[],
  "owners": string[],
  "dataSources": string[],
  "confidence": number
}

Source weighting guidance:
- "jira" observations are authoritative for status, priority, and structured field changes
- "slack" observations reflect team discussion — weight blockers and explicit decisions highly, but cross-check with jira observations when they conflict
- "email" observations often contain external stakeholder context, commitments, or escalations — treat as high-signal for blockers, open actions, and deadlines
- When observations from multiple sources agree, increase confidence
- When sources conflict, prefer the more recent observation; note material conflicts in currentState
- dataSources: list the unique sourceApp values that contributed to this snapshot (e.g. ["slack", "jira", "email"])

Core principles:
- This is a state reducer, not a chronological recap
- Keep the output bounded and stable over time
- Prefer durable operational truth over stylistic rewriting
- The snapshot should help someone understand the issue quickly

Update rules:
- Merge duplicates and near-duplicates into one canonical item
- Treat the prior snapshot as true unless new observations supersede, resolve, or contradict it
- If new observations do not materially change state, keep the snapshot substantially unchanged
- Prefer newer information over older information when they conflict
- Preserve still-valid prior decisions unless explicitly reversed or superseded
- Preserve still-open actions unless completed, canceled, or superseded
- Preserve still-active blockers unless resolved or no longer material
- Preserve still-open questions unless answered or no longer relevant
- Update owners only when responsibility is currently active and meaningful
- Do not duplicate the same fact across multiple fields
- Do not preserve stale or superseded facts just because they appeared before
- Do not invent missing details

Field guidance:
- headline: one sentence, max 12 words, describing the present operational reality
- currentState: 2 to 4 sentences describing what is happening now and why it matters
- keyDecisions: only lasting decisions that still matter to execution
- openActions: only incomplete next steps that still need follow-through
- blockers: only active blockers that currently prevent or materially slow work
- openQuestions: only unresolved questions that affect execution, timing, scope, or ownership
- owners: only the people or roles who currently own or drive the work
- dataSources: list of unique sourceApp strings from the newObservations (e.g. ["slack", "jira"])
- confidence: overall confidence in the snapshot as it exists now

Action rules:
- Each open action must be specific enough that someone could execute it
- Use concise verb-led descriptions
- Include assignee only if explicit or strongly supported
- Include dueDate only if explicit

What NOT to do:
- Do not produce a generic prose summary
- Do not keep historical trivia
- Do not include resolved blockers or completed actions
- Do not list everyone mentioned as an owner
- Do not add decisions, owners, or dates that are merely guessed
- Do not rewrite the whole snapshot if only one small fact changed

Confidence guidance:
- High confidence requires coherent, explicit, non-conflicting observations
- Lower confidence when evidence is sparse, ambiguous, or contradictory
- If meaningful state cannot be established, return conservative fields and confidence below 0.5

Return only valid JSON. No markdown. No explanation.`;
}

export function parseSnapshotResponse(raw: string): SnapshotResult {
  const parsed = JSON.parse(raw) as Partial<SnapshotResult>;
  return {
    headline: typeof parsed.headline === 'string' ? parsed.headline.trim() : '',
    currentState: typeof parsed.currentState === 'string' ? parsed.currentState.trim() : '',
    keyDecisions: normalizeStringArray(parsed.keyDecisions),
    openActions: normalizeOpenActions(parsed.openActions),
    blockers: normalizeStringArray(parsed.blockers),
    openQuestions: normalizeStringArray(parsed.openQuestions),
    owners: normalizeStringArray(parsed.owners),
    dataSources: normalizeStringArray(parsed.dataSources),
    confidence:
      typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0,
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
      ? {
          headline: prior.headline,
          currentState: prior.currentState,
          keyDecisions: prior.keyDecisions,
          openActions: prior.openActions,
          blockers: prior.blockers,
          openQuestions: prior.openQuestions,
          owners: prior.owners,
          dataSources: prior.dataSources,
          confidence: prior.confidence,
          freshness: prior.freshness.toISOString(),
        }
      : null,
    newObservations: newObservations.map((o) => ({
      id: o.id,
      category: o.category,
      content: o.content,
      confidence: o.confidence,
      sourceApp: o.sourceApp ?? 'unknown',
      extractedAt: o.extractedAt.toISOString(),
    })),
  });

  const raw = await client.complete(systemPrompt, userContent);
  const result = parseSnapshotResponse(raw);
  const freshestEvidenceAt = newObservations.reduce(
    (latest, observation) => (observation.extractedAt > latest ? observation.extractedAt : latest),
    prior?.freshness ?? newObservations[0]!.extractedAt,
  );
  const sourceObsIds = Array.from(
    new Set([
      ...(prior?.sourceObsIds ?? []),
      ...newObservations.map((observation) => observation.id),
    ]),
  );

  const snapshot = await createSnapshot(prisma, {
    memoryUnitId,
    ...result,
    freshness: freshestEvidenceAt,
    modelId: MODELS.STAGE2_SNAPSHOT,
    promptVersion: PROMPT_VERSIONS.STAGE2_SNAPSHOT,
    sourceObsIds,
  });

  return { snapshot, isNew: true };
}
