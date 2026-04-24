import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

const SESSION_TTL_DAYS = 30;

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export async function createUserSession(
  prisma: PrismaClient,
  params: { userId: string; workspaceId: string; rawToken: string },
) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  return prisma.userSession.create({
    data: {
      userId: params.userId,
      workspaceId: params.workspaceId,
      tokenHash: hashToken(params.rawToken),
      expiresAt,
    },
  });
}

export async function findSessionByToken(prisma: PrismaClient, rawToken: string) {
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;
  return session;
}

export async function revokeSession(prisma: PrismaClient, rawToken: string) {
  await prisma.userSession.update({
    where: { tokenHash: hashToken(rawToken) },
    data: { revokedAt: new Date() },
  });
}

export async function touchSession(prisma: PrismaClient, rawToken: string) {
  await prisma.userSession.update({
    where: { tokenHash: hashToken(rawToken) },
    data: { lastSeenAt: new Date() },
  });
}
