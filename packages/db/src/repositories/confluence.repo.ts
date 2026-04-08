import { PrismaClient } from '@prisma/client';

export async function upsertConfluenceInstall(
  prisma: PrismaClient,
  data: {
    workspaceId: string;
    cloudId: string;
    siteUrl: string;
    accessToken: string;
    refreshToken: string;
    scopes: string[];
  },
) {
  return prisma.confluenceWorkspaceInstall.upsert({
    where: { workspaceId: data.workspaceId },
    update: {
      cloudId: data.cloudId,
      siteUrl: data.siteUrl,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      scopes: data.scopes,
      uninstalledAt: null,
    },
    create: {
      workspaceId: data.workspaceId,
      cloudId: data.cloudId,
      siteUrl: data.siteUrl,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      scopes: data.scopes,
    },
  });
}

export async function findConfluenceInstall(prisma: PrismaClient, workspaceId: string) {
  return prisma.confluenceWorkspaceInstall.findUnique({ where: { workspaceId } });
}
