import type { PrismaClient } from '@prisma/client';
import { createObservations } from '@remi/db';
import type { MemoryModelClient } from '../clients/interface.js';
import { MODELS, PROMPT_VERSIONS, MIN_OBSERVATION_CONFIDENCE } from '../models.js';

export interface ExtractionObservation {
  category: 'decision' | 'action_item' | 'blocker' | 'open_question' | 'status_update' | 'owner_update' | 'risk';
  content: string;
  confidence: number;
  citationIds: string[];
}

export interface ExtractionResult {
  observations: ExtractionObservation[];
}

const OBSERVATION_CATEGORIES = new Set<ExtractionObservation['category']>([
  'decision',
  'action_item',
  'blocker',
  'open_question',
  'status_update',
  'owner_update',
  'risk',
]);

export function buildExtractionPrompt(): string {
  return `You are the Stage 1 extraction engine for Remi, an issue-scoped workplace memory system.

Your job is to extract only durable operational deltas from ONE source event. Remi is not storing a transcript. It is storing the minimum reliable facts a teammate would need later to understand the current work state of an issue.

The input JSON contains:
- sourceId: the ID of the current source event
- sourceType: the kind of source event
- sourceContext: description of the source application and format — use this to calibrate extraction
- message: the source text to extract from

Apply different extraction standards based on sourceContext:
- Slack messages are conversational — filter social noise aggressively; weight blockers and explicit decisions highly
- Jira events are structured — preserve field semantics and treat values as authoritative
- Email messages: treat the subject line as high-signal even if the snippet is short; external stakeholder commitments and escalations carry high weight

Return a JSON object with an "observations" array.

Each observation has:
- category: one of "decision" | "action_item" | "blocker" | "open_question" | "status_update" | "owner_update" | "risk"
- content: a clear, concise statement in plain English
- confidence: a float from 0.0 to 1.0 representing how certain the observation is
- citationIds: array of source IDs; it must include sourceId

What is important enough to keep:
- facts that change the current issue state
- decisions that affect execution, direction, scope, timing, or priority
- active blockers or waiting dependencies
- current ownership or meaningful ownership changes
- incomplete next steps, commitments, approvals, asks, or follow-ups
- unresolved questions that materially affect delivery
- near-term risks that could affect delivery
- recent changes that explain why the current state is what it is now
- explicit dates, deadlines, issue keys, names, owners, constraints, or dependencies when stated

What should usually be ignored:
- greetings, thanks, jokes, reactions, social chatter, or acknowledgements
- generic coordination with no durable work impact
- repeated restatements of already-known facts
- vague brainstorming with no decision, owner, blocker, or next step
- emotional tone without operational consequence
- speculative guesses presented as fact
- formatting noise, quoted text, or repeated context already captured in the same event

Category rules:
- decision: something was agreed, approved, selected, rejected, or resolved in a way that changes execution
- action_item: a concrete next step remains to be done; assignee may be explicit or strongly implied
- blocker: something is actively preventing or materially delaying progress now
- open_question: an unresolved question is affecting execution, scope, timing, or ownership
- status_update: a material progress update, regression, completion signal, or state change not better captured as another category
- owner_update: ownership was assigned, changed, confirmed, handed off, or made newly clear
- risk: a plausible future problem or dependency that has not fully materialized yet

Extraction rules:
- Output 0 to 5 observations max
- Prefer fewer, higher-value observations over many weak ones
- Each observation must contain exactly one atomic fact
- Preserve important specifics in content: who, what, by when, and any named dependency
- Normalize chatty wording into crisp operational statements
- Resolve pronouns only when the referent is unambiguous within the same event
- Do not invent names, owners, due dates, rationale, or certainty
- Do not convert a suggestion into a decision
- Do not convert a question into an action item unless the event explicitly asks someone to do something
- Prefer the most operationally specific category when multiple categories seem possible
- Prefer blocker over status_update when the message clearly says work cannot proceed
- Prefer owner_update over status_update when the durable change is responsibility
- Prefer decision over status_update when something was explicitly agreed or resolved
- If nothing materially changes the work record, return { "observations": [] }

Confidence guidance:
- 0.90-1.00: explicit and unambiguous
- 0.75-0.89: strongly implied with little ambiguity
- 0.50-0.74: plausible but some ambiguity remains
- 0.30-0.49: weak signal; include only if it still materially changes the work record
- below 0.30: do not include

Return only valid JSON. No markdown. No explanation.`;
}

export function parseExtractionResponse(raw: string): ExtractionResult {
  const parsed = JSON.parse(raw) as { observations?: unknown[] };
  if (!Array.isArray(parsed.observations)) {
    return { observations: [] };
  }

  const observations = parsed.observations.flatMap((value): ExtractionObservation[] => {
    if (!value || typeof value !== 'object') return [];

    const observation = value as Record<string, unknown>;
    const categoryValue = observation.category;
    const content = typeof observation.content === 'string' ? observation.content.trim() : '';
    const confidence = typeof observation.confidence === 'number'
      ? Math.max(0, Math.min(1, observation.confidence))
      : Number.NaN;
    const citationIds = Array.isArray(observation.citationIds)
      ? Array.from(
          new Set(
            observation.citationIds.filter(
              (citationId): citationId is string =>
                typeof citationId === 'string' && citationId.trim().length > 0,
            ),
          ),
        )
      : [];

    if (
      typeof categoryValue !== 'string' ||
      !OBSERVATION_CATEGORIES.has(categoryValue as ExtractionObservation['category']) ||
      !content ||
      !Number.isFinite(confidence) ||
      confidence < MIN_OBSERVATION_CONFIDENCE
    ) {
      return [];
    }

    return [{
      category: categoryValue as ExtractionObservation['category'],
      content,
      confidence,
      citationIds,
    }];
  }).slice(0, 5);

  return { observations };
}

const SOURCE_APP: Record<string, string> = {
  slack_message: 'slack',
  jira_event: 'jira',
  email_message: 'email',
};

const SOURCE_CONTEXT: Record<string, string> = {
  slack_message: 'Slack thread message (conversational; filter social noise aggressively)',
  jira_event: 'Jira issue event (structured field change, comment, or description)',
  email_message: 'Email message (subject + snippet; treat subject line as high-signal)',
};

export async function runStage1(
  prisma: PrismaClient,
  memoryUnitId: string,
  sourceId: string,
  sourceType: 'slack_message' | 'jira_event' | 'email_message',
  messageText: string,
  client: MemoryModelClient,
): Promise<ExtractionResult> {
  const systemPrompt = buildExtractionPrompt();
  const userContent = JSON.stringify({
    sourceId,
    sourceType,
    sourceContext: SOURCE_CONTEXT[sourceType] ?? sourceType,
    message: messageText,
  });

  const raw = await client.complete(systemPrompt, userContent);
  const parsed = parseExtractionResponse(raw);
  const result: ExtractionResult = {
    observations: parsed.observations.map((observation) => ({
      ...observation,
      citationIds: Array.from(new Set([sourceId, ...observation.citationIds])),
    })),
  };

  if (result.observations.length > 0) {
    await createObservations(prisma, memoryUnitId, result.observations.map((o) => ({
      ...o,
      sourceApp: SOURCE_APP[sourceType] ?? sourceType,
      modelId: MODELS.STAGE1_EXTRACT,
      promptVersion: PROMPT_VERSIONS.STAGE1_EXTRACT,
    })));
  }

  return result;
}
