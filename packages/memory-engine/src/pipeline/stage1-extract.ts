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

export function buildExtractionPrompt(): string {
  return `You are an information extraction engine for a workplace operations tool called Remi.

Given a Slack message, extract structured observations. Return a JSON object with an "observations" array.

Each observation has:
- category: one of "decision" | "action_item" | "blocker" | "open_question" | "status_update" | "owner_update" | "risk"
- content: a clear, concise statement (1-2 sentences, no filler words)
- confidence: a float from 0.0 to 1.0 representing how certain the observation is
- citationIds: array of source message IDs provided in the input

Rules:
- Only extract what is clearly stated. Do not infer or speculate.
- If the message contains no extractable observations, return { "observations": [] }
- action_item: implies an assignee or explicit next step
- decision: something agreed or resolved
- blocker: something preventing progress right now
- open_question: an unresolved question that affects the work
- status_update: progress reporting with no clear decision or action
- owner_update: a change in who is responsible for the work
- risk: a potential future problem not yet materialised

Return only valid JSON. No markdown, no explanation outside the JSON object.`;
}

export function parseExtractionResponse(raw: string): ExtractionResult {
  const parsed = JSON.parse(raw) as { observations?: unknown[] };
  if (!Array.isArray(parsed.observations)) {
    return { observations: [] };
  }
  const observations = (parsed.observations as ExtractionObservation[]).filter(
    (o) => typeof o.confidence === 'number' && o.confidence >= MIN_OBSERVATION_CONFIDENCE,
  );
  return { observations };
}

export async function runStage1(
  prisma: PrismaClient,
  memoryUnitId: string,
  sourceId: string,
  sourceType: 'slack_message' | 'jira_event',
  messageText: string,
  client: MemoryModelClient,
): Promise<ExtractionResult> {
  const systemPrompt = buildExtractionPrompt();
  const userContent = JSON.stringify({ sourceId, sourceType, message: messageText });

  const raw = await client.complete(systemPrompt, userContent);
  const result = parseExtractionResponse(raw);

  if (result.observations.length > 0) {
    await createObservations(prisma, memoryUnitId, result.observations.map((o) => ({
      ...o,
      modelId: MODELS.STAGE1_EXTRACT,
      promptVersion: PROMPT_VERSIONS.STAGE1_EXTRACT,
    })));
  }

  return result;
}
