import { PrismaClient, Prisma } from '@prisma/client';

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
      payload: data.payload as Prisma.InputJsonValue,
      error: data.error,
      ...(data.workspaceId !== undefined ? { workspaceId: data.workspaceId } : {}),
    },
  });
}

export async function listDeadLetters(
  prisma: PrismaClient,
  opts?: { queue?: string; limit?: number; offset?: number },
) {
  return prisma.queueDeadLetter.findMany({
    where: {
      ...(opts?.queue ? { queue: opts.queue } : {}),
    },
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
