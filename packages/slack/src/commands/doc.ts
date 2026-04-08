import type { App } from '@slack/bolt';
import { v4 as uuidv4 } from 'uuid';
import { QueueNames } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import { prisma, findIssueByKey } from '@remi/db';

const ISSUE_KEY_RE = /^[A-Z]+-\d+$/;
const VALID_DOC_TYPES = ['handoff', 'summary', 'escalation'] as const;
type DocType = (typeof VALID_DOC_TYPES)[number];

function parseDocType(raw: string): DocType {
  const lower = raw.toLowerCase() as DocType;
  return VALID_DOC_TYPES.includes(lower) ? lower : 'handoff';
}

export function registerDocCommand(app: App, queue: IQueueProducer): void {
  app.command('/doc', async ({ command, ack, respond, context }) => {
    await ack();

    // Usage: /doc ISSUE-KEY [handoff|summary|escalation]
    const parts = command.text.trim().split(/\s+/);
    const issueKey = (parts[0] ?? '').toUpperCase();
    const docType = parseDocType(parts[1] ?? 'handoff');

    if (!ISSUE_KEY_RE.test(issueKey)) {
      await respond({
        response_type: 'ephemeral',
        text: `Invalid issue key: *${issueKey || '(empty)'}*.\nUsage: \`/doc PROJECT-123 [handoff|summary|escalation]\``,
      });
      return;
    }

    const workspaceId: string = (context as Record<string, unknown>).workspaceId as string;

    // Verify Confluence is configured for this workspace before enqueuing
    const confluenceInstall = await prisma.confluenceWorkspaceInstall.findUnique({
      where: { workspaceId },
    });
    if (!confluenceInstall) {
      await respond({
        response_type: 'ephemeral',
        text: `Confluence is not connected for this workspace. Ask your admin to configure it at the Remi admin panel.`,
      });
      return;
    }

    const issue = await findIssueByKey(prisma, workspaceId, issueKey);
    if (!issue) {
      await respond({
        response_type: 'ephemeral',
        text: `Issue *${issueKey}* is not linked in Remi. Use \`/link-ticket ${issueKey}\` in a thread first.`,
      });
      return;
    }

    // Acknowledge immediately — doc generation is async
    await respond({
      response_type: 'ephemeral',
      text: `:hourglass_flowing_sand: Generating *${docType}* doc for *${issueKey}*… I'll post the Confluence link here when it's ready.`,
    });

    await queue.send(QueueNames.DOC_GENERATE_JOBS, {
      id: uuidv4(),
      idempotencyKey: `doc:${issue.id}:${docType}:${Date.now()}`,
      workspaceId,
      timestamp: new Date().toISOString(),
      type: 'doc_generate_job',
      payload: {
        issueId: issue.id,
        issueKey,
        docType,
        replyChannelId: command.channel_id,
        replyThreadTs: command.thread_ts ?? undefined,
      },
    });
  });
}
