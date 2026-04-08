import type { PrismaClient } from '@prisma/client';

// ─── WorkspaceMemoryConfig ────────────────────────────────────────────────────

export async function getMemoryConfig(prisma: PrismaClient, workspaceId: string) {
  return prisma.workspaceMemoryConfig.findUnique({ where: { workspaceId } });
}

export async function upsertMemoryConfig(
  prisma: PrismaClient,
  workspaceId: string,
  data: {
    enabled?: boolean;
    excludedChannelIds?: string[];
    excludedUserIds?: string[];
    trackedChannelIds?: string[];
  },
) {
  return prisma.workspaceMemoryConfig.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      enabled: data.enabled ?? false,
      excludedChannelIds: data.excludedChannelIds ?? [],
      excludedUserIds: data.excludedUserIds ?? [],
      trackedChannelIds: data.trackedChannelIds ?? [],
    },
    update: data,
  });
}

// ─── MemoryUnit ───────────────────────────────────────────────────────────────

export async function findOrCreateMemoryUnit(
  prisma: PrismaClient,
  workspaceId: string,
  scopeType: 'issue_thread' | 'app_dm' | 'email_thread',
  scopeRef: string,
  issueId?: string,
): Promise<{ unit: NonNullable<Awaited<ReturnType<PrismaClient['memoryUnit']['findUnique']>>>; created: boolean }> {
  const existing = await prisma.memoryUnit.findUnique({
    where: { workspaceId_scopeType_scopeRef: { workspaceId, scopeType, scopeRef } },
  });
  if (existing) return { unit: existing, created: false };
  const unit = await prisma.memoryUnit.create({
    data: { workspaceId, scopeType, scopeRef, issueId },
  });
  return { unit, created: true };
}

export async function getMemoryUnit(prisma: PrismaClient, id: string) {
  return prisma.memoryUnit.findUnique({
    where: { id },
    include: { issue: { select: { jiraIssueKey: true, jiraSiteUrl: true } } },
  });
}

export async function listMemoryUnits(
  prisma: PrismaClient,
  workspaceId: string,
  opts?: { limit?: number; offset?: number },
) {
  return prisma.memoryUnit.findMany({
    where: { workspaceId },
    take: opts?.limit ?? 50,
    skip: opts?.offset ?? 0,
    orderBy: { updatedAt: 'desc' },
    include: { issue: { select: { jiraIssueKey: true } } },
  });
}

// ─── MemoryObservation ────────────────────────────────────────────────────────

export async function createObservations(
  prisma: PrismaClient,
  memoryUnitId: string,
  observations: Array<{
    category: string;
    content: string;
    confidence: number;
    citationIds: string[];
    sourceApp?: string;
    modelId: string;
    promptVersion: string;
  }>,
) {
  return prisma.memoryObservation.createMany({
    data: observations.map(o => ({ ...o, memoryUnitId })),
  });
}

export async function listObservationsSince(
  prisma: PrismaClient,
  memoryUnitId: string,
  since: Date,
) {
  return prisma.memoryObservation.findMany({
    where: { memoryUnitId, extractedAt: { gt: since } },
    orderBy: { extractedAt: 'asc' },
  });
}

// ─── MemorySnapshot ───────────────────────────────────────────────────────────

export async function getLatestSnapshot(prisma: PrismaClient, memoryUnitId: string) {
  return prisma.memorySnapshot.findFirst({
    where: { memoryUnitId },
    orderBy: { version: 'desc' },
  });
}

export async function listSnapshots(prisma: PrismaClient, memoryUnitId: string) {
  return prisma.memorySnapshot.findMany({
    where: { memoryUnitId },
    orderBy: { version: 'desc' },
    take: 20,
  });
}

export async function createSnapshot(
  prisma: PrismaClient,
  data: {
    memoryUnitId: string;
    headline: string;
    currentState: string;
    keyDecisions: string[];
    openActions: Array<{ description: string; assignee?: string; dueDate?: string }>;
    blockers: string[];
    openQuestions: string[];
    owners: string[];
    dataSources: string[];
    confidence: number;
    freshness: Date;
    modelId: string;
    promptVersion: string;
    sourceObsIds: string[];
  },
) {
  // NOTE: count+1 for version has a TOCTOU race if concurrent snapshot jobs run for the
  // same memoryUnitId. Mitigation: ensure MEMORY_SNAPSHOT messages use the memoryUnitId
  // as the idempotency key so only one job runs per unit at a time. A unique constraint
  // on (memoryUnitId, version) would surface conflicts as retriable errors if this is later
  // needed.
  const count = await prisma.memorySnapshot.count({ where: { memoryUnitId: data.memoryUnitId } });
  return prisma.memorySnapshot.create({
    data: {
      ...data,
      version: count + 1,
      keyDecisions: data.keyDecisions,
      openActions: data.openActions,
      blockers: data.blockers,
      openQuestions: data.openQuestions,
    },
  });
}

// ─── MemoryWritebackProposal ──────────────────────────────────────────────────

export async function createProposal(
  prisma: PrismaClient,
  data: {
    memoryUnitId: string;
    snapshotId: string;
    payload: { jiraIssueKey: string; commentBody: string };
    citationIds: string[];
    confidence: number;
    modelId: string;
    promptVersion: string;
  },
) {
  return prisma.memoryWritebackProposal.create({
    data: { ...data, target: 'jira_comment', status: 'pending_approval' },
  });
}

export async function getProposal(prisma: PrismaClient, id: string) {
  return prisma.memoryWritebackProposal.findUnique({ where: { id } });
}

export async function listPendingProposals(prisma: PrismaClient, workspaceId: string) {
  return prisma.memoryWritebackProposal.findMany({
    where: { status: 'pending_approval', memoryUnit: { workspaceId } },
    orderBy: { createdAt: 'desc' },
    include: { memoryUnit: { select: { scopeRef: true, issueId: true } } },
  });
}

export async function updateProposalStatus(
  prisma: PrismaClient,
  id: string,
  status: 'approved' | 'applied' | 'rejected' | 'failed',
  meta?: { approvedBy?: string; failureReason?: string },
) {
  const now = new Date();
  return prisma.memoryWritebackProposal.update({
    where: { id },
    data: {
      status,
      ...(status === 'approved' && { approvedAt: now, approvedBy: meta?.approvedBy }),
      ...(status === 'applied' && { appliedAt: now }),
      ...(status === 'rejected' && { rejectedAt: now }),
      ...(status === 'failed' && { failureReason: meta?.failureReason }),
    },
  });
}
