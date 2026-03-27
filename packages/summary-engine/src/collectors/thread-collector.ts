import type { PrismaClient } from '@prisma/client';
import type { ThreadData } from '../types.js';

export async function collectThreadData(
  prisma: PrismaClient,
  issueId: string,
): Promise<ThreadData[]> {
  const links = await prisma.issueThreadLink.findMany({
    where: { issueId, unlinkedAt: null },
  });

  const threads: ThreadData[] = await Promise.all(
    links.map(async (link) => {
      const thread = await prisma.slackThread.findUniqueOrThrow({
        where: { id: link.threadId },
      });

      const rawMessages = await prisma.slackMessage.findMany({
        where: { threadId: link.threadId },
        orderBy: { sentAt: 'asc' },
      });

      return {
        id: thread.id,
        channelId: thread.channelId,
        messages: rawMessages.map((m) => ({
          id: m.id,
          slackUserId: m.slackUserId,
          text: m.text,
          sentAt: m.sentAt,
        })),
      };
    }),
  );

  return threads;
}
