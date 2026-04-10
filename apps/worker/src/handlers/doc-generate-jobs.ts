import type { DocGenerateJobMessage } from '@remi/shared';
import { prisma, findConfluencePage, updateConfluenceInstallToken } from '@remi/db';
import {
  buildIssueDocContext,
  renderConfluencePage,
  createConfluencePage,
  updateConfluencePage,
  refreshConfluenceToken,
} from '@remi/confluence';
import { WebClient } from '@slack/web-api';
import { config } from '../config.js';

export async function handleDocGenerateJob(message: DocGenerateJobMessage): Promise<void> {
  const { workspaceId, payload } = message;
  const { issueId, issueKey, docType, replyChannelId, replyThreadTs, triggerChannelId, autoTriggered } = payload;

  // 1. Fetch Confluence install
  const confluenceInstall = await prisma.confluenceWorkspaceInstall.findUnique({
    where: { workspaceId },
  });
  if (!confluenceInstall) {
    console.warn(`[doc-generate] No Confluence install for workspace ${workspaceId}, skipping`);
    return;
  }

  // 2. Refresh token if expired (or if expiry is unknown, refresh proactively)
  let accessToken = confluenceInstall.accessToken;
  const isExpired =
    !confluenceInstall.tokenExpiresAt ||
    confluenceInstall.tokenExpiresAt.getTime() < Date.now() + 60_000; // refresh 60s early

  if (isExpired && config.CONFLUENCE_CLIENT_ID && config.CONFLUENCE_CLIENT_SECRET) {
    const refreshed = await refreshConfluenceToken({
      refreshToken: confluenceInstall.refreshToken,
      clientId: config.CONFLUENCE_CLIENT_ID,
      clientSecret: config.CONFLUENCE_CLIENT_SECRET,
    });
    accessToken = refreshed.accessToken;
    await updateConfluenceInstallToken(prisma, workspaceId, accessToken, refreshed.expiresAt);
    console.log(`[doc-generate] Refreshed Confluence token for workspace ${workspaceId}`);
  }

  // 3. Fetch Slack install for posting result
  const slackInstall = await prisma.slackWorkspaceInstall.findFirst({
    where: { workspaceId },
  });
  if (!slackInstall?.botToken) {
    console.warn(`[doc-generate] No Slack bot token for workspace ${workspaceId}, skipping`);
    return;
  }

  // 4. Build context and render
  const ctx = await buildIssueDocContext(prisma, issueId, docType);
  const { title, body } = renderConfluencePage(ctx);

  // 5. Determine space key
  const spaceKey = confluenceInstall.defaultSpaceKey ?? issueKey.split('-')[0] ?? 'REMI';

  // 6. Create or update the canonical Confluence page for this issue+docType
  let pageUrl: string;
  const existing = await findConfluencePage(prisma, issueId, docType);

  if (existing) {
    const updatedPage = await updateConfluencePage({
      cloudId: confluenceInstall.cloudId,
      accessToken,
      pageId: existing.confluencePageId,
      title,
      body,
      currentVersion: existing.confluenceVersion,
    });
    pageUrl = `${confluenceInstall.siteUrl}/wiki${updatedPage._links.webui}`;
    await prisma.confluencePage.update({
      where: { id: existing.id },
      data: {
        title,
        pageUrl,
        confluenceVersion: existing.confluenceVersion + 1,
      },
    });
    console.log(`[doc-generate] Updated Confluence page for ${issueKey}: ${pageUrl}`);
  } else {
    const newPage = await createConfluencePage({
      cloudId: confluenceInstall.cloudId,
      accessToken,
      spaceKey,
      title,
      body,
    });
    pageUrl = `${confluenceInstall.siteUrl}/wiki${newPage._links.webui}`;
    await prisma.confluencePage.create({
      data: {
        workspaceId,
        installId: confluenceInstall.id,
        issueId,
        departmentId: (await prisma.issue.findUnique({ where: { id: issueId } }))?.departmentId ?? null,
        confluencePageId: newPage.id,
        spaceKey,
        title,
        pageUrl,
        docType,
        confluenceVersion: 1,
      },
    });
    console.log(`[doc-generate] Created Confluence page for ${issueKey}: ${pageUrl}`);
  }

  // 7. Post result to Slack
  const slackClient = new WebClient(slackInstall.botToken);
  const docLabel = docType.charAt(0).toUpperCase() + docType.slice(1);

  if (autoTriggered && triggerChannelId) {
    // Auto-triggered: post to the most recently active linked channel
    await slackClient.chat.postMessage({
      channel: triggerChannelId,
      text: `:white_check_mark: *${issueKey}* moved to Done — ${docLabel.toLowerCase()} doc updated: ${pageUrl}`,
    });
  } else if (replyChannelId) {
    // Manual /doc command: reply in the originating channel/thread
    await slackClient.chat.postMessage({
      channel: replyChannelId,
      ...(replyThreadTs ? { thread_ts: replyThreadTs } : {}),
      text: `:white_check_mark: *${docLabel} doc* for *${issueKey}* is ready: ${pageUrl}`,
    });
  }
}
