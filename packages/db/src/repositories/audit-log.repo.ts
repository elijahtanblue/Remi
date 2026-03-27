import { PrismaClient } from '@prisma/client';

export async function createAuditLog(
  prisma: PrismaClient,
  data: {
    workspaceId: string;
    action: string;
    actorType: string;
    actorId?: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  return prisma.auditLog.create({
    data: {
      workspaceId: data.workspaceId,
      action: data.action,
      actorType: data.actorType,
      actorId: data.actorId,
      targetType: data.targetType,
      targetId: data.targetId,
      ...(data.metadata !== undefined
        ? { metadata: data.metadata as any }
        : {}),
    },
  });
}

export async function listAuditLogs(
  prisma: PrismaClient,
  workspaceId: string,
  opts?: { limit?: number; offset?: number; action?: string },
) {
  return prisma.auditLog.findMany({
    where: {
      workspaceId,
      ...(opts?.action ? { action: opts.action } : {}),
    },
    take: opts?.limit ?? 50,
    skip: opts?.offset ?? 0,
    orderBy: { createdAt: 'desc' },
  });
}
