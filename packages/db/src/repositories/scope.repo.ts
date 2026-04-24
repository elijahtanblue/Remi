import type { PrismaClient } from '@prisma/client';

export async function findScopesByWorkspace(prisma: PrismaClient, workspaceId: string) {
  return prisma.scope.findMany({
    where: { workspaceId },
    orderBy: { name: 'asc' },
  });
}

export async function findScopeById(prisma: PrismaClient, id: string) {
  return prisma.scope.findUnique({ where: { id } });
}
