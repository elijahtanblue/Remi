import type { PrismaClient } from '@prisma/client';

export type MeaningfulEventInsert = {
  issueId: string;
  workspaceId: string;
  idempotencyKey: string;
  eventType: string;
  summary: string;
  source: string;
  sourceRef?: string | null;
  sourceUrl?: string | null;
  actorName?: string | null;
  metadata?: unknown;
  occurredAt: Date;
};

export async function upsertMeaningfulEvents(
  prisma: PrismaClient,
  events: MeaningfulEventInsert[],
) {
  if (events.length === 0) return;
  await prisma.meaningfulEvent.createMany({ data: events as any, skipDuplicates: true });
}

export async function findMeaningfulEventsByIssue(
  prisma: PrismaClient,
  issueId: string,
  opts: { limit: number; before?: string },
) {
  const { limit, before } = opts;

  const rows = await prisma.meaningfulEvent.findMany({
    where: { issueId },
    orderBy: { occurredAt: 'desc' },
    take: limit + 1,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? events[events.length - 1]?.id ?? null : null;

  return { events, nextCursor };
}
