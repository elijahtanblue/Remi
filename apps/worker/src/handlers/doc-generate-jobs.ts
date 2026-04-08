import type { DocGenerateJobMessage } from '@remi/shared';
import { prisma } from '@remi/db';
import { buildIssueDocContext, renderConfluencePage, createConfluencePage } from '@remi/confluence';
import { WebClient } from '@slack/web-api';

export async function handleDocGenerateJob(message: DocGenerateJobMessage): Promise<void> {
  const { workspaceId, payload } = message;
  const { issueId, issueKey, docType, replyChannelId, replyThreadTs } = payload;

  // Fetch Confluence install for this workspace
  const confluenceInstall = await prisma.confluenceWorkspaceInstall.findUnique({
    where: { workspaceId },
  });
  if (!confluenceInstall) {
    console.warn(`[doc-generate] No Confluence install for workspace ${workspaceId}, skipping`);
    return;
  }

  // Fetch Slack install so we can post the result back
  const slackInstall = await prisma.slackWorkspaceInstall.findFirst({
    where: { workspaceId },
  });
  if (!slackInstall?.botToken) {
    console.warn(`[doc-generate] No Slack bot token for workspace ${workspaceId}, skipping`);
    return;
  }

  // Build the stable IssueDocContext from DB data
  const ctx = await buildIssueDocContext(prisma, issueId, docType);

  // Render to Confluence storage format
  const { title, body } = renderConfluencePage(ctx);

  // Derive space key — default to project prefix if not configured
  // Future: allow workspace-level default space key configuration
  const spaceKey = issueKey.split('-')[0] ?? 'REMI';

  // Create the draft page in Confluence
  const page = await createConfluencePage({
    cloudId: confluenceInstall.cloudId,
    accessToken: confluenceInstall.accessToken,
    spaceKey,
    title,
    body,
  });

  const pageUrl = `${confluenceInstall.siteUrl}/wiki${page._links.webui}`;

  // Persist the record
  await prisma.confluencePage.create({
    data: {
      workspaceId,
      installId: confluenceInstall.id,
      issueId,
      departmentId: (await prisma.issue.findUnique({ where: { id: issueId } }))?.departmentId ?? null,
      confluencePageId: page.id,
      spaceKey,
      title,
      pageUrl,
      docType,
    },
  });

  // Post the URL back to the Slack channel
  const slackClient = new WebClient(slackInstall.botToken);
  await slackClient.chat.postMessage({
    channel: replyChannelId,
    ...(replyThreadTs ? { thread_ts: replyThreadTs } : {}),
    text: `:white_check_mark: *${docType.charAt(0).toUpperCase() + docType.slice(1)} doc* for *${issueKey}* is ready: ${pageUrl}`,
  });

  console.log(`[doc-generate] Created Confluence page for ${issueKey}: ${pageUrl}`);
}
