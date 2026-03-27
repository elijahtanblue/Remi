import { PrismaClient } from '@prisma/client';

export async function findWorkspaceById(prisma: PrismaClient, id: string) {
  return prisma.workspace.findUnique({ where: { id } });
}

export async function findWorkspaceBySlackTeamId(prisma: PrismaClient, slackTeamId: string) {
  return prisma.workspace.findFirst({
    where: {
      slackInstalls: {
        some: { slackTeamId },
      },
    },
    include: {
      slackInstalls: {
        where: { slackTeamId },
        take: 1,
      },
    },
  });
}

export async function findWorkspaceByJiraClientKey(prisma: PrismaClient, clientKey: string) {
  return prisma.workspace.findFirst({
    where: {
      jiraInstalls: {
        some: { jiraClientKey: clientKey },
      },
    },
    include: {
      jiraInstalls: {
        where: { jiraClientKey: clientKey },
        take: 1,
      },
    },
  });
}

export async function createWorkspace(
  prisma: PrismaClient,
  data: { name: string; slug: string },
) {
  return prisma.workspace.create({ data });
}

export async function listWorkspaces(
  prisma: PrismaClient,
  opts?: { limit?: number; offset?: number },
) {
  return prisma.workspace.findMany({
    take: opts?.limit ?? 50,
    skip: opts?.offset ?? 0,
    orderBy: { createdAt: 'desc' },
  });
}

export async function upsertSlackInstall(
  prisma: PrismaClient,
  data: {
    workspaceId: string;
    slackTeamId: string;
    slackTeamName: string;
    botToken: string;
    botUserId: string;
    scopes: string[];
  },
) {
  return prisma.slackWorkspaceInstall.upsert({
    where: { slackTeamId: data.slackTeamId },
    update: {
      slackTeamName: data.slackTeamName,
      botToken: data.botToken,
      botUserId: data.botUserId,
      scopes: data.scopes,
      uninstalledAt: null,
    },
    create: {
      workspaceId: data.workspaceId,
      slackTeamId: data.slackTeamId,
      slackTeamName: data.slackTeamName,
      botToken: data.botToken,
      botUserId: data.botUserId,
      scopes: data.scopes,
    },
  });
}

export async function upsertJiraInstall(
  prisma: PrismaClient,
  data: {
    workspaceId: string;
    jiraClientKey: string;
    jiraSiteUrl: string;
    sharedSecret: string;
  },
) {
  return prisma.jiraWorkspaceInstall.upsert({
    where: { jiraClientKey: data.jiraClientKey },
    update: {
      jiraSiteUrl: data.jiraSiteUrl,
      sharedSecret: data.sharedSecret,
      uninstalledAt: null,
    },
    create: {
      workspaceId: data.workspaceId,
      jiraClientKey: data.jiraClientKey,
      jiraSiteUrl: data.jiraSiteUrl,
      sharedSecret: data.sharedSecret,
    },
  });
}
