import { PrismaClient } from '@prisma/client';

export interface DeadLetterQueryOptions {
  queue?: string;
  limit?: number;
  offset?: number;
  includeRetried?: boolean;
}

function buildDeadLetterWhere(opts?: Pick<DeadLetterQueryOptions, 'queue' | 'includeRetried'>) {
  return {
    ...(opts?.queue ? { queue: opts.queue } : {}),
    ...(opts?.includeRetried ? {} : { retriedAt: null }),
  };
}

export async function createDeadLetter(
  prisma: PrismaClient,
  data: {
    workspaceId?: string;
    queue: string;
    messageId?: string;
    payload: Record<string, unknown>;
    error: string;
  },
) {
  return prisma.queueDeadLetter.create({
    data: {
      queue: data.queue,
      messageId: data.messageId,
      payload: data.payload as any,
      error: data.error,
      ...(data.workspaceId !== undefined ? { workspaceId: data.workspaceId } : {}),
    },
  });
}

export async function listDeadLetters(
  prisma: PrismaClient,
  opts?: DeadLetterQueryOptions,
) {
  return prisma.queueDeadLetter.findMany({
    where: buildDeadLetterWhere(opts),
    take: opts?.limit ?? 50,
    skip: opts?.offset ?? 0,
    orderBy: { failedAt: 'desc' },
  });
}

export async function findDeadLetterById(prisma: PrismaClient, id: string) {
  return prisma.queueDeadLetter.findUnique({ where: { id } });
}

export async function retryDeadLetter(prisma: PrismaClient, id: string) {
  return prisma.queueDeadLetter.update({
    where: { id },
    data: {
      retriedAt: new Date(),
      retryCount: { increment: 1 },
    },
  });
}

export async function deleteDeadLetter(prisma: PrismaClient, id: string) {
  return prisma.queueDeadLetter.delete({ where: { id } });
}

export async function deleteDeadLettersByQueue(
  prisma: PrismaClient,
  opts?: Pick<DeadLetterQueryOptions, 'queue' | 'includeRetried'>,
) {
  return prisma.queueDeadLetter.deleteMany({
    where: buildDeadLetterWhere(opts),
  });
}
