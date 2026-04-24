import type { CurrentWorkRecord, Prisma, PrismaClient } from '@prisma/client';
import type { QueueSection } from '@remi/shared';

const RISK_SCORE_THRESHOLD = 0.6;
const RECENT_CHANGE_HOURS = 24;

export type CwrUpsertData = {
  workspaceId: string;
  currentState: string;
  ownerDisplayName?: string | null;
  ownerExternalId?: string | null;
  ownerSource?: string | null;
  blockerSummary?: string | null;
  blockerDetectedAt?: Date | null;
  waitingOnType?: string | null;
  waitingOnDescription?: string | null;
  openQuestions: Prisma.InputJsonValue;
  nextStep?: string | null;
  riskScore: number;
  urgencyReason?: string | null;
  isStale: boolean;
  staleSince?: Date | null;
  ownerConfirmedAt?: Date | null;
  blockerClearedAt?: Date | null;
  lastJiraStatus?: string | null;
  lastJiraAssigneeId?: string | null;
  sourceMemoryUnitIds: string[];
  sourceSnapshotIds: string[];
  snapshotSetHash: string;
  dataSources: string[];
  sourceFreshnessAt: Date;
  lastMeaningfulChangeAt?: Date | null;
  lastMeaningfulChangeSummary?: string | null;
  confidence: number;
  modelId: string;
  promptVersion: string;
};

export async function upsertCwr(prisma: PrismaClient, issueId: string, data: CwrUpsertData) {
  return prisma.currentWorkRecord.upsert({
    where: { issueId },
    create: { issueId, ...data },
    update: data,
  });
}

export async function findCwrByIssueId(prisma: PrismaClient, issueId: string) {
  return prisma.currentWorkRecord.findUnique({ where: { issueId } });
}

export function computeQueueSection(
  cwr: Pick<CurrentWorkRecord, 'isStale' | 'riskScore' | 'lastMeaningfulChangeAt'> | null,
  pendingProposalCount: number,
): QueueSection {
  if (!cwr) return 'recently_changed';
  if (cwr.isStale || cwr.riskScore >= RISK_SCORE_THRESHOLD) return 'needs_action';
  if (pendingProposalCount > 0) return 'awaiting_approval';

  const cutoff = new Date(Date.now() - RECENT_CHANGE_HOURS * 60 * 60 * 1000);
  if (cwr.lastMeaningfulChangeAt && cwr.lastMeaningfulChangeAt >= cutoff) {
    return 'recently_changed';
  }

  return 'recently_changed';
}
