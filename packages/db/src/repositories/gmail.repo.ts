import type { PrismaClient } from '@prisma/client';
import type { EmailParticipant } from '@remi/shared';

// ─── GmailWorkspaceInstall ────────────────────────────────────────────────────

export async function upsertGmailInstall(
  prisma: PrismaClient,
  data: {
    workspaceId: string;
    serviceAccountJson: string;
    domain: string;
    monitoredEmails: string[];
  },
) {
  return prisma.gmailWorkspaceInstall.upsert({
    where: { workspaceId: data.workspaceId },
    update: {
      serviceAccountJson: data.serviceAccountJson,
      domain: data.domain,
      monitoredEmails: data.monitoredEmails,
      uninstalledAt: null,
    },
    create: data,
  });
}

export async function findGmailInstall(prisma: PrismaClient, workspaceId: string) {
  return prisma.gmailWorkspaceInstall.findUnique({ where: { workspaceId } });
}

// Persists the per-mailbox historyId map after a successful sync run.
// historyIds shape: { "alice@company.com": "12345678" }
export async function updateMailboxHistoryIds(
  prisma: PrismaClient,
  installId: string,
  historyIds: Record<string, string>,
) {
  return prisma.gmailWorkspaceInstall.update({
    where: { id: installId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { mailboxHistoryIds: historyIds as any },
  });
}

// ─── EmailThread ──────────────────────────────────────────────────────────────

export async function upsertEmailThread(
  prisma: PrismaClient,
  data: {
    workspaceId: string;
    gmailInstallId: string;
    gmailThreadId: string;
    subject?: string | null;
    participants: EmailParticipant[];
  },
) {
  return prisma.emailThread.upsert({
    where: {
      gmailInstallId_gmailThreadId: {
        gmailInstallId: data.gmailInstallId,
        gmailThreadId: data.gmailThreadId,
      },
    },
    update: {
      subject: data.subject,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      participants: data.participants as any,
    },
    create: {
      workspaceId: data.workspaceId,
      gmailInstallId: data.gmailInstallId,
      gmailThreadId: data.gmailThreadId,
      subject: data.subject,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      participants: data.participants as any,
    },
  });
}

// ─── EmailMessage ─────────────────────────────────────────────────────────────

export async function createEmailMessageIfNotExists(
  prisma: PrismaClient,
  data: {
    threadId: string;
    gmailMessageId: string;
    fromEmail: string;
    toEmails: string[];
    subject?: string | null;
    bodySnippet: string;
    receivedAt: Date;
    idempotencyKey: string;
  },
) {
  const existing = await prisma.emailMessage.findUnique({
    where: { gmailMessageId: data.gmailMessageId },
  });
  if (existing) return null;

  return prisma.emailMessage.create({ data });
}

export async function listEmailMessagesByThread(
  prisma: PrismaClient,
  threadId: string,
  opts?: { limit?: number },
) {
  return prisma.emailMessage.findMany({
    where: { threadId },
    orderBy: { receivedAt: 'asc' },
    take: opts?.limit ?? 50,
  });
}

// ─── IssueEmailLink ───────────────────────────────────────────────────────────

// Returns { record, created: true } when a new link is made, { record, created: false }
// when the link already existed. Callers use `created` to gate Slack DM notifications
// so a single thread only triggers one DM per issue key, regardless of reply count.
export async function createIssueEmailLink(
  prisma: PrismaClient,
  data: { issueId: string; threadId: string; method: string },
): Promise<{ record: { id: string; issueId: string; threadId: string; method: string; linkedAt: Date; unlinkedAt: Date | null }; created: boolean }> {
  const existing = await prisma.issueEmailLink.findUnique({
    where: { issueId_threadId: { issueId: data.issueId, threadId: data.threadId } },
  });
  if (existing) return { record: existing, created: false };
  const record = await prisma.issueEmailLink.create({ data });
  return { record, created: true };
}

export async function findEmailLinksByIssueId(prisma: PrismaClient, issueId: string) {
  return prisma.issueEmailLink.findMany({ where: { issueId }, orderBy: { linkedAt: 'desc' } });
}
