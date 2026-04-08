import { PrismaClient } from '@prisma/client';

export async function createIssueThreadLink(
  prisma: PrismaClient,
  data: { issueId: string; threadId: string; linkedByUserId?: string },
) {
  return prisma.issueThreadLink.create({ data });
}

export async function upsertIssueThreadLink(
  prisma: PrismaClient,
  data: { issueId: string; threadId: string },
) {
  return prisma.issueThreadLink.upsert({
    where: { issueId_threadId: { issueId: data.issueId, threadId: data.threadId } },
    create: { issueId: data.issueId, threadId: data.threadId },
    update: { unlinkedAt: null }, // Reactivate if previously unlinked
  });
}

export async function findIssueThreadLink(
  prisma: PrismaClient,
  issueId: string,
  threadId: string,
) {
  return prisma.issueThreadLink.findUnique({
    where: { issueId_threadId: { issueId, threadId } },
  });
}

export async function findLinksByIssueId(prisma: PrismaClient, issueId: string) {
  return prisma.issueThreadLink.findMany({
    where: { issueId },
    orderBy: { linkedAt: 'desc' },
  });
}

export async function findLinksByThreadId(prisma: PrismaClient, threadId: string) {
  return prisma.issueThreadLink.findMany({
    where: { threadId },
    orderBy: { linkedAt: 'desc' },
  });
}

export async function deactivateLink(prisma: PrismaClient, id: string) {
  return prisma.issueThreadLink.update({
    where: { id },
    data: { unlinkedAt: new Date() },
  });
}

export async function listActiveLinksForWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  opts?: { limit?: number; offset?: number },
) {
  return prisma.issueThreadLink.findMany({
    where: {
      unlinkedAt: null,
      issue: { workspaceId },
    },
    take: opts?.limit ?? 50,
    skip: opts?.offset ?? 0,
    orderBy: { linkedAt: 'desc' },
  });
}
