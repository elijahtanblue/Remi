import type { IssueEventRecord, ThreadData } from '../types.js';

const IMPORTANT_EVENT_TYPES = new Set([
  'status_changed',
  'assignee_changed',
  'priority_changed',
]);

const FIELD_LABEL: Record<string, string> = {
  status_changed: 'Status',
  assignee_changed: 'Assignee',
  priority_changed: 'Priority',
};

const MS_PER_DAY = 86_400_000;

export function analyzeStatus(
  events: IssueEventRecord[],
  threads: ThreadData[],
  now: Date = new Date(),
): {
  latestImportantChanges: Array<{
    field: string;
    from: string | null;
    to: string | null;
    at: Date;
    actor: string | null;
  }>;
  previousAssignee: string | null;
  statusDriftDetected: boolean;
} {
  const importantEvents = events.filter((e) => IMPORTANT_EVENT_TYPES.has(e.eventType));

  // Show the most recent event per field type (not a flat top-5) so that
  // repeated flip-flops on the same field collapse to a single entry.
  const latestByType = new Map<string, IssueEventRecord>();
  for (const eventType of IMPORTANT_EVENT_TYPES) {
    const latest = importantEvents
      .filter((e) => e.eventType === eventType)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
    if (latest) latestByType.set(eventType, latest);
  }
  const deduped = [...latestByType.values()].sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  );

  const latestImportantChanges = deduped.map((e) => {
    const fields = e.changedFields ?? {};
    const from =
      typeof fields['from'] === 'string' || fields['from'] === null
        ? (fields['from'] as string | null)
        : fields['from'] != null
          ? String(fields['from'])
          : null;
    const to =
      typeof fields['to'] === 'string' || fields['to'] === null
        ? (fields['to'] as string | null)
        : fields['to'] != null
          ? String(fields['to'])
          : null;

    return {
      field: FIELD_LABEL[e.eventType] ?? e.eventType,
      from,
      to,
      at: e.occurredAt,
      actor: e.actorExternalId,
    };
  });

  // Previous assignee: from value of most recent assignee_changed event
  const assigneeEvents = events
    .filter((e) => e.eventType === 'assignee_changed')
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  let previousAssignee: string | null = null;
  if (assigneeEvents.length > 0) {
    const fields = assigneeEvents[0].changedFields ?? {};
    const from = fields['from'];
    previousAssignee = typeof from === 'string' ? from : from != null ? String(from) : null;
  }

  // Status drift: no status_changed event in last 5 days, but Slack activity in last 5 days
  const fiveDaysAgo = new Date(now.getTime() - 5 * MS_PER_DAY);

  const recentStatusChange = events.some(
    (e) => e.eventType === 'status_changed' && e.occurredAt >= fiveDaysAgo,
  );

  const recentSlackActivity = threads.some((t) =>
    t.messages.some((m) => m.sentAt >= fiveDaysAgo),
  );

  const statusDriftDetected = !recentStatusChange && recentSlackActivity;

  return { latestImportantChanges, previousAssignee, statusDriftDetected };
}
