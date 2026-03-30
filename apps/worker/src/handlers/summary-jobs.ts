import { prisma, createAuditLog, createProductEvent } from '@remi/db';
import type { SummaryJobMessage } from '@remi/shared';
import { generateSummary } from '@remi/summary-engine';

export async function handleSummaryJob(message: SummaryJobMessage): Promise<void> {
  const { payload } = message;

  const result = await generateSummary(prisma, payload.issueId, payload.triggerReason, {
    force: payload.force,
  });

  if (result.skipped) {
    console.log(`[summary-jobs] Summary skipped for issue ${payload.issueId} (input unchanged)`);
    return;
  }

  if (payload.summaryRunId) {
    await prisma.summaryRun.update({
      where: { id: payload.summaryRunId },
      data: { completedCount: { increment: 1 } },
    });
  }

  await createAuditLog(prisma, {
    workspaceId: message.workspaceId,
    action: 'summary.generated',
    actorType: 'system',
    targetType: 'issue',
    targetId: payload.issueId,
    metadata: {
      triggerReason: payload.triggerReason,
      summaryRunId: payload.summaryRunId ?? null,
      force: payload.force ?? false,
    },
  });

  void createProductEvent(prisma, {
    workspaceId: message.workspaceId,
    event: 'summary_generated',
    properties: {
      issueId: payload.issueId,
      triggerReason: payload.triggerReason,
      version: result.version,
    },
  }).catch((err) => {
    console.warn(`[summary-jobs] Failed to record product event for issue ${payload.issueId}`, err);
  });

  console.log(`[summary-jobs] Summary v${result.version} generated for issue ${payload.issueId}`);
}
