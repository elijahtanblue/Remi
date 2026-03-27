import { PrismaClient, Prisma } from '@prisma/client';

export async function findIssueById(prisma: PrismaClient, id: string) {
  return prisma.issue.findUnique({ where: { id } });
}

export async function findIssueByKey(
  prisma: PrismaClient,
  workspaceId: string,
  jiraIssueKey: string,
) {
  return prisma.issue.findFirst({
    where: { workspaceId, jiraIssueKey },
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
    assigneeJiraAccountId?: string;
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
    priority,
    issueType,
    rawPayload,
    s3PayloadKey,
  } = data;

  const jsonPayload =
    rawPayload !== undefined ? (rawPayload as Prisma.JsonValue) : undefined;

  return prisma.issue.upsert({
    where: { jiraIssueId_jiraSiteUrl: { jiraIssueId, jiraSiteUrl } },
    update: {
      jiraIssueKey,
      title,
      status,
      statusCategory,
      assigneeJiraAccountId,
      priority,
      issueType,
      rawPayload: jsonPayload,
      s3PayloadKey,
    },
    create: {
      workspaceId,
      jiraIssueId,
      jiraIssueKey,
      jiraSiteUrl,
      title,
      status,
      statusCategory,
      assigneeJiraAccountId,
      priority,
      issueType,
      rawPayload: jsonPayload,
      s3PayloadKey,
    },
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
