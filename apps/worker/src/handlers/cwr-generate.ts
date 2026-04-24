import { createHash } from 'node:crypto';
import { prisma } from '@remi/db';
import type { CWRGenerateMessage } from '@remi/shared';
import {
  computeSnapshotSetHash,
  createOpenAiClient,
  diffCwr,
  MODELS,
  PROMPT_VERSIONS,
  runCwrSynthesis,
} from '@remi/memory-engine';
import { v4 as uuidv4 } from 'uuid';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function idempotencyKey(cwrId: string, eventType: string, payload: unknown): string {
  const hash = createHash('sha256')
    .update(JSON.stringify(payload ?? {}))
    .digest('hex')
    .slice(0, 12);
  return `cwr:${cwrId}:${eventType}:${hash}`;
}

function isOlderThan(date: Date | null | undefined, thresholdMs: number, now: Date) {
  if (!date) return false;
  return now.getTime() - date.getTime() > thresholdMs;
}

function applyHeuristics(params: {
  baseRiskScore: number;
  waitingOnType: string | null;
  blockerSummary: string | null;
  blockerDetectedAt: Date | null;
  sourceFreshnessAt: Date;
  lastMeaningfulChangeAt: Date | null;
  now: Date;
}) {
  const {
    baseRiskScore,
    waitingOnType,
    blockerSummary,
    blockerDetectedAt,
    sourceFreshnessAt,
    lastMeaningfulChangeAt,
    now,
  } = params;

  let riskScore = baseRiskScore;

  if (isOlderThan(lastMeaningfulChangeAt, 5 * DAY_MS, now)) {
    riskScore += 0.15;
  }

  if (waitingOnType === 'external_vendor' || waitingOnType === 'external_customer') {
    riskScore += 0.10;
  }

  if (blockerSummary && isOlderThan(blockerDetectedAt, 3 * DAY_MS, now)) {
    riskScore += 0.10;
  }

  const isStale =
    isOlderThan(sourceFreshnessAt, 48 * HOUR_MS, now) &&
    (!lastMeaningfulChangeAt || isOlderThan(lastMeaningfulChangeAt, 72 * HOUR_MS, now));

  return {
    riskScore: Math.min(1, riskScore),
    isStale,
  };
}

export type CwrGenerateDependencies = {
  computeSnapshotSetHash?: typeof computeSnapshotSetHash;
  createOpenAiClient?: typeof createOpenAiClient;
  diffCwr?: typeof diffCwr;
  runCwrSynthesis?: typeof runCwrSynthesis;
};

export async function handleCwrGenerate(
  message: CWRGenerateMessage,
  dependencies: CwrGenerateDependencies = {},
): Promise<void> {
  const computeHash = dependencies.computeSnapshotSetHash ?? computeSnapshotSetHash;
  const createClient = dependencies.createOpenAiClient ?? createOpenAiClient;
  const diffRecord = dependencies.diffCwr ?? diffCwr;
  const synthesize = dependencies.runCwrSynthesis ?? runCwrSynthesis;
  const { issueId, triggerSource } = message.payload;

  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      workspaceId: true,
      jiraIssueKey: true,
      status: true,
      statusCategory: true,
      priority: true,
      assigneeJiraAccountId: true,
      assigneeDisplayName: true,
    },
  });

  if (!issue) {
    console.warn(`[cwr-generate] Issue ${issueId} not found, skipping`);
    return;
  }

  const units = await prisma.memoryUnit.findMany({
    where: { issueId },
    select: { id: true },
  });

  const snapshots = (
    await Promise.all(
      units.map((unit) =>
        prisma.memorySnapshot.findFirst({
          where: { memoryUnitId: unit.id },
          orderBy: { version: 'desc' },
          select: {
            id: true,
            memoryUnitId: true,
            version: true,
            headline: true,
            currentState: true,
            freshness: true,
            createdAt: true,
          },
        }),
      ),
    )
  ).filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot !== null);

  const jiraFields = {
    status: issue.status,
    assigneeId: issue.assigneeJiraAccountId,
    priority: issue.priority,
  };
  const snapshotSetHash = computeHash(
    snapshots.map((snapshot) => ({
      memoryUnitId: snapshot.memoryUnitId,
      version: snapshot.version,
    })),
    jiraFields,
  );

  const existingCwr = await prisma.currentWorkRecord.findUnique({ where: { issueId } });

  if (
    (triggerSource === 'stage2_complete' || triggerSource === 'jira_change') &&
    existingCwr?.snapshotSetHash === snapshotSetHash
  ) {
    console.log(`[cwr-generate] Hash unchanged for ${issueId}, skipping`);
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const openAiClient = createClient(apiKey, MODELS.STAGE4_CWR);

  const synthesis = await synthesize(
    {
      issueId: issue.id,
      jiraIssueKey: issue.jiraIssueKey,
      jiraStatus: issue.status,
      jiraAssigneeId: issue.assigneeJiraAccountId,
      jiraAssigneeName: issue.assigneeDisplayName,
      jiraPriority: issue.priority,
      snapshots: snapshots.map((snapshot) => ({
        memoryUnitId: snapshot.memoryUnitId,
        version: snapshot.version,
        currentSummary: `${snapshot.headline}\n${snapshot.currentState}`,
        updatedAt: snapshot.freshness ?? snapshot.createdAt,
      })),
    },
    openAiClient,
  );

  const sourceFreshnessAt =
    snapshots.length > 0
      ? snapshots.reduce(
          (latest, snapshot) =>
            (snapshot.freshness ?? snapshot.createdAt) > latest
              ? (snapshot.freshness ?? snapshot.createdAt)
              : latest,
          snapshots[0]!.freshness ?? snapshots[0]!.createdAt,
        )
      : new Date();
  const now = new Date();
  const blockerDetectedAt =
    synthesis.blockerSummary && !existingCwr?.blockerSummary
      ? now
      : existingCwr?.blockerDetectedAt ?? null;

  const prevForDiff = existingCwr ?? {
    id: 'new',
    blockerSummary: null,
    ownerExternalId: null,
    waitingOnType: null,
    waitingOnDescription: null,
    nextStep: null,
    isStale: false,
    lastJiraStatus: null,
  };
  const nextForDiffBase = {
    id: existingCwr?.id ?? 'new',
    blockerSummary: synthesis.blockerSummary,
    ownerExternalId: synthesis.ownerExternalId,
    waitingOnType: synthesis.waitingOnType,
    waitingOnDescription: synthesis.waitingOnDescription,
    nextStep: synthesis.nextStep,
    lastJiraStatus: issue.status,
  };
  const primarySource = triggerSource === 'jira_change' ? 'jira' : 'slack';
  const materialEventDrafts = diffRecord(
    prevForDiff,
    { ...nextForDiffBase, isStale: prevForDiff.isStale },
    primarySource,
  ).filter((event) => event.eventType !== 'stale_detected' && event.eventType !== 'stale_resolved');
  const lastMeaningfulChangeAt =
    materialEventDrafts.length > 0 ? now : existingCwr?.lastMeaningfulChangeAt ?? null;
  const lastMeaningfulChangeSummary =
    materialEventDrafts.length > 0
      ? materialEventDrafts[0]!.summary
      : existingCwr?.lastMeaningfulChangeSummary;
  const heuristics = applyHeuristics({
    baseRiskScore: synthesis.riskScore,
    waitingOnType: synthesis.waitingOnType,
    blockerSummary: synthesis.blockerSummary,
    blockerDetectedAt,
    sourceFreshnessAt,
    lastMeaningfulChangeAt,
    now,
  });
  const nextForDiff = {
    ...nextForDiffBase,
    isStale: heuristics.isStale,
  };
  const eventDrafts = diffRecord(prevForDiff, nextForDiff, primarySource);

  if (triggerSource === 'stale_sweep' && existingCwr?.isStale === heuristics.isStale) {
    console.log(`[cwr-generate] Stale sweep unchanged for ${issueId}, skipping`);
    return;
  }

  const newCwrData = {
    workspaceId: issue.workspaceId,
    currentState: synthesis.currentState,
    ownerDisplayName: synthesis.ownerDisplayName,
    ownerExternalId: synthesis.ownerExternalId,
    ownerSource: synthesis.ownerSource,
    blockerSummary: synthesis.blockerSummary,
    blockerDetectedAt,
    waitingOnType: synthesis.waitingOnType,
    waitingOnDescription: synthesis.waitingOnDescription,
    openQuestions: synthesis.openQuestions,
    nextStep: synthesis.nextStep,
    riskScore: heuristics.riskScore,
    urgencyReason: synthesis.urgencyReason,
    isStale: heuristics.isStale,
    staleSince:
      heuristics.isStale && !existingCwr?.isStale
        ? now
        : heuristics.isStale
          ? existingCwr?.staleSince ?? null
          : null,
    lastJiraStatus: issue.status,
    lastJiraAssigneeId: issue.assigneeJiraAccountId,
    sourceMemoryUnitIds: units.map((unit) => unit.id),
    sourceSnapshotIds: snapshots.map((snapshot) => snapshot.id),
    snapshotSetHash,
    dataSources: synthesis.dataSources,
    sourceFreshnessAt,
    confidence: synthesis.confidence,
    modelId: MODELS.STAGE4_CWR,
    promptVersion: PROMPT_VERSIONS.STAGE4_CWR,
  };

  await prisma.$transaction(async (tx) => {
    const upserted = await tx.currentWorkRecord.upsert({
      where: { issueId },
      create: {
        issueId,
        ...newCwrData,
        lastMeaningfulChangeAt,
        lastMeaningfulChangeSummary,
      } as any,
      update: {
        ...newCwrData,
        lastMeaningfulChangeAt,
        lastMeaningfulChangeSummary,
      } as any,
    });

    if (eventDrafts.length > 0) {
      await tx.meaningfulEvent.createMany({
        data: eventDrafts.map((event) => ({
          id: uuidv4(),
          issueId,
          workspaceId: issue.workspaceId,
          idempotencyKey: idempotencyKey(upserted.id, event.eventType, event.metadata),
          ...event,
          metadata: event.metadata ?? undefined,
        })) as any,
        skipDuplicates: true,
      });
    }

    await tx.productEvent.create({
      data: {
        workspaceId: issue.workspaceId,
        event: 'cwr_generated',
        properties: { issueId, triggerSource, eventsEmitted: eventDrafts.length },
      },
    });
  });

  console.log(
    `[cwr-generate] CWR updated for ${issue.jiraIssueKey}: ${eventDrafts.length} events emitted`,
  );
}
