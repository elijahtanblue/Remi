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

/**
 * Find the canonical Confluence page for an issue + doc type combination.
 * Returns null if no page has been created yet.
 */
export async function findConfluencePage(
  prisma: PrismaClient,
  issueId: string,
  docType: string,
) {
  return prisma.confluencePage.findFirst({
    where: { issueId, docType },
    orderBy: { createdAt: 'asc' }, // oldest = canonical
  });
}

/**
 * Update the stored access token and its expiry after a refresh.
 */
export async function updateConfluenceInstallToken(
  prisma: PrismaClient,
  workspaceId: string,
  accessToken: string,
  tokenExpiresAt: Date,
) {
  return prisma.confluenceWorkspaceInstall.update({
    where: { workspaceId },
    data: { accessToken, tokenExpiresAt },
  });
}
