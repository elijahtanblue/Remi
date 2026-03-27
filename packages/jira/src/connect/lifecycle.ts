import { prisma, upsertJiraInstall } from '@remi/db';
import type { ConnectInstallPayload } from '../types.js';

export async function handleInstalled(
  payload: ConnectInstallPayload,
  workspaceId: string,
): Promise<void> {
  await upsertJiraInstall(prisma, {
    workspaceId,
    jiraClientKey: payload.clientKey,
    jiraSiteUrl: payload.baseUrl,
    sharedSecret: payload.sharedSecret,
  });
}

export async function handleUninstalled(clientKey: string): Promise<void> {
  await prisma.jiraWorkspaceInstall.updateMany({
    where: { jiraClientKey: clientKey },
    data: { uninstalledAt: new Date() },
  });
}
