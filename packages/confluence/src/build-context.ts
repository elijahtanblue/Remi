/**
 * Assembles an IssueDocContext from the existing DB data for an issue.
 * This is the adapter between the summary-engine collectors / MemorySnapshot
 * and the stable IssueDocContext type consumed by the page renderer.
 *
 * It intentionally does NOT import summary-engine or memory-engine directly —
 * instead it queries Prisma repos directly so it can survive engine refactors.
 */

import type { PrismaClient } from '@prisma/client';
import type { IssueDocContext } from './types.js';

export async function buildIssueDocContext(
  prisma: PrismaClient,
  issueId: string,
  docType: IssueDocContext['docType'],
): Promise<IssueDocContext> {
  const issue = await prisma.issue.findUniqueOrThrow({
    where: { id: issueId },
    include: { department: true },
  });

  // ── Timeline from IssueEvents ────────────────────────────────────────────
  const events = await prisma.issueEvent.findMany({
    where: { issueId },
    orderBy: { occurredAt: 'asc' },
  });

  const timeline = events
    .filter((e) => ['status_changed', 'assignee_changed', 'priority_changed'].includes(e.eventType))
    .map((e) => {
      const fields = (e.changedFields as Record<string, string> | null) ?? {};
      let description = e.eventType.replace('_', ' ');
      if (fields.from && fields.to) {
        description = `${eventLabel(e.eventType)}: ${fields.from} → ${fields.to}`;
      }
      return { date: e.occurredAt, event: description, actor: e.actorExternalId ?? undefined };
    });

  // ── Slack thread data ─────────────────────────────────────────────────────
  const threadLinks = await prisma.issueThreadLink.findMany({
    where: { issueId, unlinkedAt: null },
    include: {
      thread: {
        include: { messages: { orderBy: { sentAt: 'asc' } } },
      },
    },
  });

  const allMessages = threadLinks.flatMap((l) => l.thread.messages);
  const participants = [...new Set(allMessages.map((m) => m.slackUserId))];

  // ── Key decisions, blockers, open questions ───────────────────────────────
  // Aggregate observations from ALL memory units linked to this issue.
  const memoryUnits = await prisma.memoryUnit.findMany({
    where: { issueId },
    include: {
      observations: { orderBy: { extractedAt: 'desc' } },
    },
  });

  const allObservations = memoryUnits.flatMap((u) => u.observations);

  const toObsItem = (o: (typeof allObservations)[number]) => ({
    content: o.content,
    source: o.sourceApp ?? 'slack',
    citedAt: o.extractedAt,
    superseded: o.state === 'superseded',
    supersededAt: o.supersededAt ?? undefined,
  });

  const keyDecisions = allObservations
    .filter((o) => o.category === 'decision')
    .map(toObsItem);

  const blockers = allObservations
    .filter((o) => o.category === 'blocker')
    .map(toObsItem);

  const openQuestions = allObservations
    .filter((o) => o.category === 'open_question')
    .map(toObsItem);

  // ── Linked threads summary ────────────────────────────────────────────────
  const linkedThreads = threadLinks.map((l) => ({
    channelName: l.thread.channelName ?? undefined,
    permalink: l.thread.permalink ?? undefined,
    messageCount: l.thread.messages.length,
  }));

  // ── Related emails ────────────────────────────────────────────────────────
  const emailLinks = await prisma.issueEmailLink.findMany({
    where: { issueId, unlinkedAt: null },
    include: { thread: true },
  });

  const relatedEmails = emailLinks.map((l) => ({
    subject: l.thread.subject ?? '(no subject)',
    participants: (l.thread.participants as string[]) ?? [],
  }));

  return {
    issue: {
      key: issue.jiraIssueKey,
      title: issue.title,
      status: issue.status ?? 'Unknown',
      assignee: issue.assigneeDisplayName ?? undefined,
      priority: issue.priority ?? undefined,
    },
    timeline,
    keyDecisions,
    blockers,
    openQuestions,
    participants,
    linkedThreads,
    relatedEmails,
    department: issue.department?.name,
    generatedAt: new Date(),
    docType,
  };
}

function eventLabel(eventType: string): string {
  switch (eventType) {
    case 'status_changed': return 'Status changed';
    case 'assignee_changed': return 'Assignee changed';
    case 'priority_changed': return 'Priority changed';
    default: return eventType;
  }
}
