import type { PrismaClient } from '@prisma/client';
import type { IssueSnapshot, IssueEventRecord } from '../types.js';

export async function collectIssueData(
  prisma: PrismaClient,
  issueId: string,
): Promise<{ issue: IssueSnapshot; events: IssueEventRecord[] }> {
  const raw = await prisma.issue.findUniqueOrThrow({ where: { id: issueId } });

  const issue: IssueSnapshot = {
    id: raw.id,
    jiraIssueKey: raw.jiraIssueKey,
    title: raw.title,
    status: raw.status ?? null,
    statusCategory: raw.statusCategory ?? null,
    assigneeJiraAccountId: raw.assigneeJiraAccountId ?? null,
    priority: raw.priority ?? null,
    updatedAt: raw.updatedAt,
  };

  const rawEvents = await prisma.issueEvent.findMany({
    where: { issueId },
    orderBy: { occurredAt: 'asc' },
  });

  const events: IssueEventRecord[] = rawEvents.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    changedFields: (e.changedFields as Record<string, unknown> | null) ?? null,
    actorExternalId: e.actorExternalId ?? null,
    occurredAt: e.occurredAt,
  }));

  return { issue, events };
}
