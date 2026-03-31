import { PrismaClient } from '@prisma/client';

export async function findIssueById(prisma: PrismaClient, id: string) {
  return prisma.issue.findUnique({ where: { id } });
}

export async function findIssueByKey(
  prisma: PrismaClient,
  workspaceId: string,
  jiraIssueKey: string,
) {
  const canonical = await prisma.issue.findFirst({
    where: { workspaceId, jiraIssueKey, NOT: { jiraSiteUrl: 'pending' } },
    orderBy: { updatedAt: 'desc' },
  });
  if (canonical) return canonical;

  return prisma.issue.findFirst({
    where: { workspaceId, jiraIssueKey },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function findIssueByJiraId(
  prisma: PrismaClient,
  jiraIssueId: string,
  jiraSiteUrl: string,
) {
  return prisma.issue.findUnique({
    where: { jiraIssueId_jiraSiteUrl: { jiraIssueId, jiraSiteUrl } },
  });
}

export async function upsertIssue(
  prisma: PrismaClient,
  data: {
    workspaceId: string;
    jiraIssueId: string;
    jiraIssueKey: string;
    jiraSiteUrl: string;
    title: string;
    status?: string;
    statusCategory?: string;
    assigneeJiraAccountId?: string | null;
    assigneeDisplayName?: string | null;
    priority?: string;
    issueType?: string;
    rawPayload?: Record<string, unknown>;
    s3PayloadKey?: string;
  },
) {
  const {
    workspaceId,
    jiraIssueId,
    jiraIssueKey,
    jiraSiteUrl,
    title,
    status,
    statusCategory,
    assigneeJiraAccountId,
    assigneeDisplayName,
    priority,
    issueType,
    rawPayload,
    s3PayloadKey,
  } = data;

  const jsonPayload =
    rawPayload !== undefined ? (rawPayload as any) : undefined;

  const existingByCanonical = await prisma.issue.findUnique({
    where: { jiraIssueId_jiraSiteUrl: { jiraIssueId, jiraSiteUrl } },
  });

  const existingByKey = await prisma.issue.findFirst({
    where: { workspaceId, jiraIssueKey },
    orderBy: { updatedAt: 'desc' },
  });

  let targetIssue = existingByCanonical;
  if (existingByCanonical && existingByKey && existingByCanonical.id !== existingByKey.id) {
    targetIssue = await mergeIssues(prisma, existingByKey.id, existingByCanonical.id);
  } else if (!targetIssue && existingByKey) {
    targetIssue = existingByKey;
  }

  if (targetIssue) {
    return prisma.issue.update({
      where: { id: targetIssue.id },
      data: {
        jiraIssueId,
        jiraIssueKey,
        jiraSiteUrl,
        title,
        status,
        statusCategory,
        assigneeJiraAccountId,
        assigneeDisplayName,
        priority,
        issueType,
        rawPayload: jsonPayload,
        s3PayloadKey,
      },
    });
  }

  return prisma.issue.create({
    data: {
      workspaceId,
      jiraIssueId,
      jiraIssueKey,
      jiraSiteUrl,
      title,
      status,
      statusCategory,
      assigneeJiraAccountId,
      assigneeDisplayName,
      priority,
      issueType,
      rawPayload: jsonPayload,
      s3PayloadKey,
    },
  });
}

export async function mergeIssues(
  prisma: PrismaClient,
  sourceIssueId: string,
  targetIssueId: string,
) {
  if (sourceIssueId === targetIssueId) {
    const issue = await prisma.issue.findUnique({ where: { id: targetIssueId } });
    if (!issue) throw new Error(`Issue ${targetIssueId} not found`);
    return issue;
  }

  return prisma.$transaction(async (tx) => {
    const [sourceIssue, targetIssue] = await Promise.all([
      tx.issue.findUnique({ where: { id: sourceIssueId } }),
      tx.issue.findUnique({ where: { id: targetIssueId } }),
    ]);

    if (!sourceIssue) throw new Error(`Source issue ${sourceIssueId} not found`);
    if (!targetIssue) throw new Error(`Target issue ${targetIssueId} not found`);

    const sourceThreadLinks = await tx.issueThreadLink.findMany({ where: { issueId: sourceIssueId } });
    for (const link of sourceThreadLinks) {
      const existing = await tx.issueThreadLink.findUnique({
        where: { issueId_threadId: { issueId: targetIssueId, threadId: link.threadId } },
      });
      if (existing) {
        await tx.issueThreadLink.delete({ where: { id: link.id } });
      } else {
        await tx.issueThreadLink.update({
          where: { id: link.id },
          data: { issueId: targetIssueId },
        });
      }
    }

    const sourceEmailLinks = await tx.issueEmailLink.findMany({ where: { issueId: sourceIssueId } });
    for (const link of sourceEmailLinks) {
      const existing = await tx.issueEmailLink.findUnique({
        where: { issueId_threadId: { issueId: targetIssueId, threadId: link.threadId } },
      });
      if (existing) {
        await tx.issueEmailLink.delete({ where: { id: link.id } });
      } else {
        await tx.issueEmailLink.update({
          where: { id: link.id },
          data: { issueId: targetIssueId },
        });
      }
    }

    await Promise.all([
      tx.issueEvent.updateMany({ where: { issueId: sourceIssueId }, data: { issueId: targetIssueId } }),
      tx.summary.updateMany({ where: { issueId: sourceIssueId }, data: { issueId: targetIssueId } }),
      tx.memoryUnit.updateMany({ where: { issueId: sourceIssueId }, data: { issueId: targetIssueId } }),
    ]);

    await tx.issue.delete({ where: { id: sourceIssueId } });

    return tx.issue.findUniqueOrThrow({ where: { id: targetIssueId } });
  });
}

export async function listIssuesByWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  opts?: { limit?: number; offset?: number },
) {
  return prisma.issue.findMany({
    where: { workspaceId },
    take: opts?.limit ?? 50,
    skip: opts?.offset ?? 0,
    orderBy: { updatedAt: 'desc' },
  });
}
