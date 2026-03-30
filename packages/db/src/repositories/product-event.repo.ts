import { PrismaClient, Prisma } from '@prisma/client';

export async function createProductEvent(
  prisma: PrismaClient,
  data: {
    workspaceId: string;
    event: string;
    actorId?: string | null;
    properties?: Record<string, unknown>;
    occurredAt?: Date;
  },
) {
  return prisma.productEvent.create({
    data: {
      workspaceId: data.workspaceId,
      event: data.event,
      actorId: data.actorId ?? null,
      properties: data.properties as Prisma.InputJsonValue | undefined,
      occurredAt: data.occurredAt ?? new Date(),
    },
  });
}

export async function getProductEventCounts(
  prisma: PrismaClient,
  opts: {
    workspaceId?: string | null;
    since: Date;
  },
): Promise<Array<{ event: string; count: number }>> {
  const rows = await prisma.productEvent.groupBy({
    by: ['event'],
    where: {
      ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
      occurredAt: { gte: opts.since },
    },
    _count: { event: true },
    orderBy: { _count: { event: 'desc' } },
  });

  return rows.map((r) => ({ event: r.event, count: r._count.event }));
}
