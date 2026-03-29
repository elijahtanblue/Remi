import { WebClient } from '@slack/web-api';
import { prisma } from '@remi/db';

export async function sendIssueSuggestionDm(params: {
  workspaceId: string;
  participantEmails: string[];
  issueKeys: string[];
  emailSubject: string;
  fromEmail: string;
}): Promise<void> {
  const { workspaceId, participantEmails, issueKeys, emailSubject, fromEmail } = params;

  const slackInstall = await prisma.slackWorkspaceInstall.findFirst({
    where: { workspaceId, uninstalledAt: null },
    orderBy: { installedAt: 'desc' },
  });
  if (!slackInstall) return;

  const slack = new WebClient(slackInstall.botToken);
  const issueList = issueKeys.join(', ');
  const dmText = `Remi noticed *${issueList}* mentioned in an email.\n*From:* ${fromEmail}\n*Subject:* ${emailSubject}`;

  for (const email of participantEmails) {
    try {
      const userRes = await slack.users.lookupByEmail({ email });
      if (!userRes.ok || !userRes.user?.id) continue;

      const dmRes = await slack.conversations.open({ users: userRes.user.id });
      const channel = (dmRes as { channel?: { id?: string } }).channel?.id;
      if (!channel) continue;

      await slack.chat.postMessage({
        channel,
        text: dmText,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: dmText },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'Use `/link-ticket ISSUE-KEY` in a Slack thread to connect this context to the issue.',
              },
            ],
          },
        ],
      });
    } catch (err) {
      console.warn('[gmail-dm] Failed to DM', email, err);
    }
  }
}
