import { PrismaClient, Prisma } from '@prisma/client';

export async function createSummary(
  prisma: PrismaClient,
  data: {
    issueId: string;
    version: number;
    content: Record<string, unknown>;
    triggerReason: string;
    inputHash: string;
    summaryRunId?: string;
  },
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.summary.updateMany({
      where: { issueId: data.issueId, status: 'current' },
      data: { status: 'superseded' },
    });

    return tx.summary.create({
      data: {
        issueId: data.issueId,
        version: data.version,
        content: data.content as Prisma.JsonValue,
        triggerReason: data.triggerReason,
        inputHash: data.inputHash,
        summaryRunId: data.summaryRunId,
        status: 'current',
      },
    });
  });
}

export async function findCurrentSummary(prisma: PrismaClient, issueId: string) {
  return prisma.summary.findFirst({
    where: { issueId, status: 'current' },
    orderBy: { version: 'desc' },
  });
}

export async function findSummaryById(prisma: PrismaClient, id: string) {
  return prisma.summary.findUnique({ where: { id } });
}

export async function listSummariesByWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  opts?: { limit?: number; offset?: number },
) {
  return prisma.summary.findMany({
    where: { issue: { workspaceId } },
    take: opts?.limit ?? 50,
    skip: opts?.offset ?? 0,
    orderBy: { generatedAt: 'desc' },
  });
}

export async function createSummaryRun(
  prisma: PrismaClient,
  data: { workspaceId: string; triggeredBy: string; issueCount?: number },
) {
  return prisma.summaryRun.create({
    data: {
      workspaceId: data.workspaceId,
      triggeredBy: data.triggeredBy,
      issueCount: data.issueCount ?? 0,
    },
  });
}

export async function updateSummaryRun(
  prisma: PrismaClient,
  id: string,
  data: {
    status?: string;
    completedCount?: number;
    failedCount?: number;
    completedAt?: Date;
    error?: string;
  },
) {
  return prisma.summaryRun.update({ where: { id }, data });
}
