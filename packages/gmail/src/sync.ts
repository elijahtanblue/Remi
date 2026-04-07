import { prisma, upsertEmailThread, createEmailMessageIfNotExists, createIssueEmailLink, updateMailboxHistoryIds, getMemoryConfig, findOrCreateMemoryUnit } from '@remi/db';
import { createGmailClient } from './client.js';
import { detectIssueKeys } from './detect-issues.js';
import { parseParticipants } from './parse-email.js';
import { sendIssueSuggestionDm } from './slack-dm.js';
import type { gmail_v1 } from 'googleapis';
import { QueueNames } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import { v4 as uuidv4 } from 'uuid';

export async function syncAllGmailWorkspaces(queue?: IQueueProducer): Promise<void> {
  const installs = await prisma.gmailWorkspaceInstall.findMany({
    where: { uninstalledAt: null },
  });

  for (const install of installs) {
    const storedHistoryIds: Record<string, string> =
      (install.mailboxHistoryIds as Record<string, string> | null) ?? {};
    const updatedHistoryIds: Record<string, string> = { ...storedHistoryIds };

    for (const email of install.monitoredEmails) {
      try {
        const newHistoryId = await syncMailbox(
          install.id,
          install.workspaceId,
          install.serviceAccountJson,
          install.domain,
          email,
          storedHistoryIds[email] ?? null,
          queue,
        );
        if (newHistoryId) {
          updatedHistoryIds[email] = newHistoryId;
        }
      } catch (err) {
        console.error(
          `[gmail-sync] Failed to sync ${email} for workspace ${install.workspaceId}:`,
          err,
        );
      }
    }

    // Persist updated historyIds so next run is incremental
    await updateMailboxHistoryIds(prisma, install.id, updatedHistoryIds);
  }
}

/**
 * Syncs a single mailbox. Returns the new historyId to store for the next run.
 * - If storedHistoryId is set, uses history.list for incremental sync.
 * - If storedHistoryId is absent (or expired), falls back to messages.list with
 *   a 7-day window, then captures the current historyId via getProfile.
 */
async function syncMailbox(
  gmailInstallId: string,
  workspaceId: string,
  serviceAccountJson: string,
  domain: string,
  emailAddress: string,
  storedHistoryId: string | null,
  queue?: IQueueProducer,
): Promise<string | null> {
  const gmail = createGmailClient(serviceAccountJson, emailAddress);

  if (storedHistoryId) {
    try {
      return await syncMailboxIncremental(
        gmailInstallId,
        workspaceId,
        domain,
        gmail,
        storedHistoryId,
        queue,
      );
    } catch (err: unknown) {
      // historyId expired (404) or invalid (410) — fall through to full scan
      const status = (err as { status?: number; code?: number }).status ??
        (err as { status?: number; code?: number }).code;
      if (status === 404 || status === 410) {
        console.warn(
          `[gmail-sync] historyId expired for ${emailAddress}, falling back to full scan`,
        );
      } else {
        throw err;
      }
    }
  }

  return syncMailboxFull(gmailInstallId, workspaceId, domain, gmail, queue);
}

/** Incremental sync via users.history.list. Returns new historyId. */
async function syncMailboxIncremental(
  gmailInstallId: string,
  workspaceId: string,
  domain: string,
  gmail: ReturnType<typeof createGmailClient>,
  startHistoryId: string,
  queue?: IQueueProducer,
): Promise<string | null> {
  let pageToken: string | undefined;
  let latestHistoryId: string | null = null;
  const messageIds = new Set<string>();

  do {
    const res = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      historyTypes: ['messageAdded'],
      pageToken,
    });

    if (res.data.historyId) {
      latestHistoryId = res.data.historyId;
    }

    for (const record of res.data.history ?? []) {
      for (const added of record.messagesAdded ?? []) {
        if (added.message?.id) {
          messageIds.add(added.message.id);
        }
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  for (const msgId of messageIds) {
    try {
      await processMessage(gmailInstallId, workspaceId, domain, gmail, msgId, queue);
    } catch (err) {
      console.error(`[gmail-sync] Failed to process message ${msgId}:`, err);
    }
  }

  return latestHistoryId;
}

/** Full scan using messages.list with 7-day window. Returns current historyId. */
async function syncMailboxFull(
  gmailInstallId: string,
  workspaceId: string,
  domain: string,
  gmail: ReturnType<typeof createGmailClient>,
  queue?: IQueueProducer,
): Promise<string | null> {
  const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  let pageToken: string | undefined;

  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: `after:${sevenDaysAgo}`,
      maxResults: 500,
      pageToken,
    });

    for (const msgRef of res.data.messages ?? []) {
      if (!msgRef.id) continue;
      try {
        await processMessage(gmailInstallId, workspaceId, domain, gmail, msgRef.id, queue);
      } catch (err) {
        console.error(`[gmail-sync] Failed to process message ${msgRef.id}:`, err);
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  // Capture current historyId so next run is incremental
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data.historyId ?? null;
}

async function processMessage(
  gmailInstallId: string,
  workspaceId: string,
  domain: string,
  gmail: ReturnType<typeof createGmailClient>,
  messageId: string,
  queue?: IQueueProducer,
): Promise<void> {
  const msgRes = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'metadata',
    metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'],
  });

  const msg = msgRes.data;
  const headers: gmail_v1.Schema$MessagePartHeader[] = msg.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

  const from = getHeader('From');
  const to = getHeader('To');
  const cc = getHeader('Cc');
  const subject = getHeader('Subject');
  const dateHeader = getHeader('Date');
  const snippet = msg.snippet ?? '';
  const gmailThreadId = msg.threadId ?? messageId;

  const participants = parseParticipants(from, to, cc);
  const fromEmail = participants.find((p) => p.role === 'from')?.emailAddress ?? '';
  const toEmails = participants
    .filter((p) => p.role === 'to' || p.role === 'cc')
    .map((p) => p.emailAddress);

  const thread = await upsertEmailThread(prisma, {
    workspaceId,
    gmailInstallId,
    gmailThreadId,
    subject: subject || null,
    participants,
  });

  const emailMsg = await createEmailMessageIfNotExists(prisma, {
    threadId: thread.id,
    gmailMessageId: messageId,
    fromEmail,
    toEmails,
    subject: subject || null,
    bodySnippet: snippet,
    receivedAt: dateHeader ? new Date(dateHeader) : new Date(),
    idempotencyKey: `gmail:${messageId}`,
  });

  if (!emailMsg) return; // already processed

  const issueKeys = detectIssueKeys(`${subject} ${snippet}`);
  if (issueKeys.length === 0) {
    await prisma.emailMessage.update({
      where: { id: emailMsg.id },
      data: { processedAt: new Date() },
    });
    return;
  }

  // Only send DM for issue+thread pairs that are newly linked (first time seen)
  const confirmedIssueKeys: string[] = [];
  const confirmedIssues: Array<{ id: string; jiraIssueKey: string }> = [];
  for (const issueKey of issueKeys) {
    const issue = await prisma.issue.findFirst({
      where: { workspaceId, jiraIssueKey: issueKey },
    });
    if (!issue) continue;

    const { created } = await createIssueEmailLink(prisma, {
      issueId: issue.id,
      threadId: thread.id,
      method: 'auto_detected',
    });
    if (created) {
      confirmedIssueKeys.push(issueKey);
      confirmedIssues.push(issue);
    }
  }

  if (confirmedIssueKeys.length > 0) {
    const internalEmails = participants
      .filter((p) => p.emailAddress.toLowerCase().endsWith(`@${domain.toLowerCase()}`))
      .map((p) => p.emailAddress);

    if (internalEmails.length > 0) {
      await sendIssueSuggestionDm({
        workspaceId,
        participantEmails: internalEmails,
        issueKeys: confirmedIssueKeys,
        emailSubject: subject || '(no subject)',
        fromEmail,
      });
    }

    // Enqueue memory extraction for each newly linked issue if memory is enabled
    if (queue) {
      const memoryConfig = await getMemoryConfig(prisma, workspaceId);
      if (memoryConfig?.enabled) {
        for (const issue of confirmedIssues) {
          const { unit } = await findOrCreateMemoryUnit(
            prisma,
            workspaceId,
            'email_thread',
            thread.id,
            issue.id,
          );
          await queue.send(QueueNames.MEMORY_EXTRACT, {
            id: uuidv4(),
            idempotencyKey: `memory-extract-email-${emailMsg.id}-${unit.id}`,
            workspaceId,
            timestamp: new Date().toISOString(),
            type: 'memory_extract',
            payload: { memoryUnitId: unit.id, sourceType: 'email_message', sourceId: emailMsg.id },
          });
          console.log(`[gmail-sync] Enqueued memory extraction for email ${emailMsg.id} → unit ${unit.id}`);
        }
      }
    }
  }

  await prisma.emailMessage.update({
    where: { id: emailMsg.id },
    data: { processedAt: new Date() },
  });
}
