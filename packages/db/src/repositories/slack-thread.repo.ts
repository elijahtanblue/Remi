import { PrismaClient } from '@prisma/client';

export async function upsertSlackThread(
  prisma: PrismaClient,
  data: {
    workspaceId: string;
    slackTeamId: string;
    channelId: string;
    threadTs: string;
    isChannelLevel?: boolean;
    channelName?: string;
    permalink?: string;
  },
) {
  const { workspaceId, slackTeamId, channelId, threadTs, isChannelLevel = false, channelName, permalink } = data;
  return prisma.slackThread.upsert({
    where: {
      slackTeamId_channelId_threadTs: { slackTeamId, channelId, threadTs },
    },
    update: {
      channelName,
      permalink,
    },
    create: {
      workspaceId,
      slackTeamId,
      channelId,
      threadTs,
      isChannelLevel,
      channelName,
      permalink,
    },
  });
}

export async function findSlackThreadById(prisma: PrismaClient, id: string) {
  return prisma.slackThread.findUnique({ where: { id } });
}

export async function findSlackThreadByTs(
  prisma: PrismaClient,
  slackTeamId: string,
  channelId: string,
  threadTs: string,
) {
  return prisma.slackThread.findUnique({
    where: {
      slackTeamId_channelId_threadTs: { slackTeamId, channelId, threadTs },
    },
  });
}
