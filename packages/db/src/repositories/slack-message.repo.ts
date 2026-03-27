import { PrismaClient, Prisma } from '@prisma/client';

export async function createSlackMessage(
  prisma: PrismaClient,
  data: {
    threadId: string;
    idempotencyKey: string;
    slackMessageTs: string;
    slackUserId: string;
    text: string;
    rawPayload: Record<string, unknown>;
    s3PayloadKey?: string;
    source: string;
    sentAt: Date;
  },
) {
  return prisma.slackMessage.create({
    data: {
      threadId: data.threadId,
      idempotencyKey: data.idempotencyKey,
      slackMessageTs: data.slackMessageTs,
      slackUserId: data.slackUserId,
      text: data.text,
      rawPayload: data.rawPayload as Prisma.JsonValue,
      s3PayloadKey: data.s3PayloadKey,
      source: data.source,
      sentAt: data.sentAt,
    },
  });
}

export async function findSlackMessageByIdempotencyKey(prisma: PrismaClient, key: string) {
  return prisma.slackMessage.findUnique({ where: { idempotencyKey: key } });
}

export async function listSlackMessages(
  prisma: PrismaClient,
  threadId: string,
  opts?: { limit?: number; before?: Date; after?: Date },
) {
  return prisma.slackMessage.findMany({
    where: {
      threadId,
      ...(opts?.before || opts?.after
        ? {
            sentAt: {
              ...(opts.before ? { lt: opts.before } : {}),
              ...(opts.after ? { gt: opts.after } : {}),
            },
          }
        : {}),
    },
    take: opts?.limit ?? 50,
    orderBy: { sentAt: 'asc' },
  });
}
