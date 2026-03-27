import { prisma } from '@remi/db';

/**
 * Middleware that looks up the Remi workspace from the Slack team ID
 * and attaches workspaceId to context.
 */
export async function workspaceResolverMiddleware({
  context,
  next,
  logger,
}: // eslint-disable-next-line @typescript-eslint/no-explicit-any
any): Promise<void> {
  const teamId: string | undefined = context.teamId;

  if (!teamId) {
    logger?.error('[workspaceResolverMiddleware] No teamId in context');
    throw new Error('No Slack team ID found in context');
  }

  const install = await prisma.slackWorkspaceInstall.findUnique({
    where: { slackTeamId: teamId },
  });

  if (!install) {
    logger?.error(
      `[workspaceResolverMiddleware] No SlackWorkspaceInstall found for teamId=${teamId}`,
    );
    throw new Error(`Workspace not found for Slack team: ${teamId}`);
  }

  context.workspaceId = install.workspaceId;
  context.slackInstall = install;

  await next();
}
