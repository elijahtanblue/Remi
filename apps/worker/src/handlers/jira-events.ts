import {
  prisma,
  createIssueEvent,
  upsertIssue,
  findWorkspaceByJiraClientKey,
  findLinksByIssueId,
  getMemoryConfig,
} from '@remi/db';
import type { JiraEventMessage } from '@remi/shared';
import { QueueNames, TriggerReason } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import { shouldTriggerSummary } from '@remi/summary-engine';
import { isIssueEventProcessed } from '../dedup.js';
import { v4 as uuidv4 } from 'uuid';

export async function handleJiraEvent(
  message: JiraEventMessage,
  queue: IQueueProducer,
): Promise<void> {
  // 1. Idempotency check
  if (await isIssueEventProcessed(message.idempotencyKey)) {
    console.log(`[jira-events] Already processed: ${message.idempotencyKey}`);
    return;
  }

  const { payload } = message;

  // 2. Look up workspace by jira client key (jiraSiteId carries the clientKey from the webhook route)
  const workspace = await findWorkspaceByJiraClientKey(prisma, payload.jiraSiteId);
  if (!workspace) {
    console.warn(`[jira-events] No workspace for jiraSiteId: ${payload.jiraSiteId}, skipping`);
    return;
  }

  const jiraSiteUrl = workspace.jiraInstalls[0]?.jiraSiteUrl ?? payload.jiraSiteId;

  // 3. Extract fields from raw webhook payload
  const rawIssue = (payload.rawEvent as Record<string, unknown>).issue as
    | Record<string, unknown>
    | undefined;
  const fields = rawIssue?.fields as Record<string, unknown> | undefined;

  const statusField = fields?.status as Record<string, unknown> | undefined;
  const assigneeField = fields?.assignee as Record<string, unknown> | null | undefined;
  const priorityField = fields?.priority as Record<string, unknown> | undefined;
  const issueTypeField = fields?.issuetype as Record<string, unknown> | undefined;
  const statusCategoryField = statusField?.statusCategory as
    | Record<string, unknown>
    | undefined;
  const assigneeJiraAccountId =
    assigneeField === undefined ? undefined : (assigneeField?.accountId as string | undefined) ?? null;
  const assigneeDisplayName =
    assigneeField === undefined ? undefined : (assigneeField?.displayName as string | undefined) ?? null;

  // 4. Upsert Issue with correct field names
  const issue = await upsertIssue(prisma, {
    workspaceId: workspace.id,
    jiraIssueId: payload.issueId,
    jiraIssueKey: payload.issueKey,
    jiraSiteUrl,
    title: (fields?.summary as string | undefined) ?? payload.issueKey,
    status: statusField?.name as string | undefined,
    statusCategory: statusCategoryField?.key as string | undefined,
    assigneeJiraAccountId,
    assigneeDisplayName,
    priority: priorityField?.name as string | undefined,
    issueType: issueTypeField?.name as string | undefined,
    rawPayload: rawIssue ?? {},
  });

  // 5. Extract changelog items for changed fields
  const changelog = (payload.rawEvent as Record<string, unknown>).changelog as
    | Record<string, unknown>
    | undefined;
  const changelogItems = changelog?.items as Array<Record<string, unknown>> | undefined;
  const changedFields: Record<string, unknown> = {};

  if (changelogItems && changelogItems.length > 0) {
    for (const item of changelogItems) {
      const field = item.field as string | undefined;
      if (field) changedFields[field] = { from: item.fromString, to: item.toString };
    }
  }

  // 6. Derive granular event type and extract flat {from, to} for the primary changed field.
  // The status-analyzer reads changedFields.from / changedFields.to (flat), so we store
  // only the primary field's values rather than a map of all changed fields.
  let derivedEventType: string = payload.kind; // fallback: 'issue_created' or 'issue_updated'
  let flatChangedFields: Record<string, unknown> = changedFields;

  if (payload.kind === 'issue_updated' && changelogItems && changelogItems.length > 0) {
    const fieldNames = changelogItems.map((item) => (item.field as string | undefined)?.toLowerCase());

    let primaryField: string | null = null;
    if (fieldNames.some((f) => f === 'status')) {
      derivedEventType = 'status_changed';
      primaryField = 'status';
    } else if (fieldNames.some((f) => f === 'assignee')) {
      derivedEventType = 'assignee_changed';
      primaryField = 'assignee';
    } else if (fieldNames.some((f) => f === 'priority')) {
      derivedEventType = 'priority_changed';
      primaryField = 'priority';
    }

    if (primaryField) {
      const item = changelogItems.find(
        (i) => (i.field as string | undefined)?.toLowerCase() === primaryField,
      );
      flatChangedFields = {
        from: (item?.fromString as string | undefined) ?? null,
        to: (item?.toString as string | undefined) ?? null,
      };
    }
  }

  const issueEvent = await createIssueEvent(prisma, {
    issueId: issue.id,
    idempotencyKey: message.idempotencyKey,
    eventType: derivedEventType,
    source: 'jira_webhook',
    changedFields: flatChangedFields,
    rawPayload: payload.rawEvent as Record<string, unknown>,
    occurredAt: new Date(message.timestamp),
  });

  // 7. Check for active links and enqueue summary job if this event is meaningful
  const links = await findLinksByIssueId(prisma, issue.id);
  const activeLinks = links.filter((l) => !l.unlinkedAt);

  if (activeLinks.length > 0) {
    const trigger = shouldTriggerSummary({
      eventType: derivedEventType,
      hasLinkedThreads: true,
    });

    if (trigger.should && trigger.reason) {
      await queue.send(QueueNames.SUMMARY_JOBS, {
        id: uuidv4(),
        idempotencyKey: `summary:jira:${issue.id}:${message.idempotencyKey}`,
        workspaceId: workspace.id,
        timestamp: new Date().toISOString(),
        type: 'summary_job',
        payload: {
          issueId: issue.id,
          triggerReason: trigger.reason,
        },
      });
      console.log(`[jira-events] Enqueued summary job for issue ${issue.id} (${trigger.reason})`);
    }
  }

  // ── Memory ingestion trigger ──────────────────────────────────────────────
  const memoryConfig = await getMemoryConfig(prisma, workspace.id);
  if (memoryConfig?.enabled) {
    const units = await prisma.memoryUnit.findMany({
      where: { issueId: issue.id, workspaceId: workspace.id },
    });
    for (const unit of units) {
      await queue.send(QueueNames.MEMORY_EXTRACT, {
        id: uuidv4(),
        idempotencyKey: `memory-extract-${issueEvent.id}`,
        workspaceId: workspace.id,
        timestamp: new Date().toISOString(),
        type: 'memory_extract',
        payload: { memoryUnitId: unit.id, sourceType: 'jira_event', sourceId: issueEvent.id },
      });
    }
  }

  // 8. Mark IssueEvent as processed
  await prisma.issueEvent.update({
    where: { id: issueEvent.id },
    data: { processedAt: new Date() },
  });
}
