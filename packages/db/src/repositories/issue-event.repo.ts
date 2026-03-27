import { PrismaClient, Prisma } from '@prisma/client';

export async function createIssueEvent(
  prisma: PrismaClient,
  data: {
    issueId: string;
    idempotencyKey: string;
    eventType: string;
    source: string;
    actorExternalId?: string;
    changedFields?: Record<string, unknown>;
    rawPayload: Record<string, unknown>;
    s3PayloadKey?: string;
    occurredAt: Date;
  },
) {
  return prisma.issueEvent.create({
    data: {
      issueId: data.issueId,
      idempotencyKey: data.idempotencyKey,
      eventType: data.eventType,
      source: data.source,
      actorExternalId: data.actorExternalId,
      rawPayload: data.rawPayload as NonNullable<Prisma.JsonValue>,
      s3PayloadKey: data.s3PayloadKey,
      occurredAt: data.occurredAt,
      ...(data.changedFields !== undefined
        ? { changedFields: data.changedFields as NonNullable<Prisma.JsonValue> }
        : {}),
    },
  });
}

export async function findIssueEventByIdempotencyKey(prisma: PrismaClient, key: string) {
  return prisma.issueEvent.findUnique({ where: { idempotencyKey: key } });
}

export async function listIssueEvents(
  prisma: PrismaClient,
  issueId: string,
  opts?: { limit?: number; eventTypes?: string[] },
) {
  return prisma.issueEvent.findMany({
    where: {
      issueId,
      ...(opts?.eventTypes && opts.eventTypes.length > 0
        ? { eventType: { in: opts.eventTypes } }
        : {}),
    },
    take: opts?.limit ?? 50,
    orderBy: { occurredAt: 'desc' },
  });
}
