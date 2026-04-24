import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import {
  createUserSession,
  findSessionByToken,
  findSlackInstallByTeamId,
  findSlackUserBySlackId,
  findUserById,
  prisma,
  revokeSession,
  touchSession,
} from '@remi/db';

function generateRawToken(): string {
  return randomBytes(32).toString('hex');
}

export async function sessionRoutes(app: FastifyInstance) {
  app.post<{ Body: { slackUserId: string; slackTeamId: string } }>(
    '/resolve',
    async (request, reply) => {
      const { slackUserId, slackTeamId } = request.body;

      const install = await findSlackInstallByTeamId(prisma, slackTeamId);
      if (!install) {
        return reply.code(403).send({
          error: 'Remi is not installed in your Slack workspace. Ask your admin to install it first.',
        });
      }

      const slackUser = await findSlackUserBySlackId(prisma, slackUserId, slackTeamId);
      if (!slackUser) {
        return reply.code(403).send({
          error: 'Your account is not yet set up in Remi. Try using a Slack command first.',
        });
      }

      const user = await findUserById(prisma, slackUser.userId);
      if (!user || user.workspaceId !== install.workspaceId) {
        return reply.code(403).send({ error: 'User not found.' });
      }

      const rawToken = generateRawToken();
      await createUserSession(prisma, {
        userId: user.id,
        workspaceId: user.workspaceId,
        rawToken,
      });

      return { token: rawToken };
    },
  );

  app.post<{ Body: { token: string } }>('/validate', async (request, reply) => {
    const { token } = request.body;
    const session = await findSessionByToken(prisma, token);
    if (!session) {
      return reply.code(401).send({ error: 'Invalid or expired session' });
    }

    void Promise.resolve(touchSession(prisma, token)).catch(() => {});
    return { userId: session.userId, workspaceId: session.workspaceId };
  });

  app.post<{ Body: { token: string } }>('/revoke', async (request) => {
    const { token } = request.body;
    await revokeSession(prisma, token);
    return { ok: true };
  });
}
