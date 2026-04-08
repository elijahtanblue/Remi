import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import {
  prisma,
  listMemoryUnits,
  getMemoryUnit,
  listSnapshots,
  listPendingProposals,
  getProposal,
  updateProposalStatus,
  upsertMemoryConfig,
  getMemoryConfig,
  findOrCreateMemoryUnit,
  createIssueEvent,
} from '@remi/db';
import { JiraClient } from '@remi/jira';
import { QueueNames } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import { v4 as uuidv4 } from 'uuid';

function hashBackfillText(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export async function memoryRoutes(app: FastifyInstance, { queue }: { queue: IQueueProducer }) {

  // GET /admin/memory/config/:workspaceId
  app.get<{ Params: { workspaceId: string } }>('/config/:workspaceId', async (req, reply) => {
    const config = await getMemoryConfig(prisma, req.params.workspaceId);
    return reply.send(config ?? { enabled: false, excludedChannelIds: [], excludedUserIds: [], trackedChannelIds: [] });
  });

  // PUT /admin/memory/config/:workspaceId
  app.put<{
    Params: { workspaceId: string };
    Body: {
      enabled?: boolean;
      excludedChannelIds?: string[];
      excludedUserIds?: string[];
      trackedChannelIds?: string[];
    };
  }>(
    '/config/:workspaceId', async (req, reply) => {
      const config = await upsertMemoryConfig(prisma, req.params.workspaceId, req.body);
      return reply.send(config);
    }
  );

  // GET /admin/memory/units/by-id/:unitId  (registered before /:workspaceId to avoid route conflict)
  app.get<{ Params: { unitId: string } }>(
    '/units/by-id/:unitId', async (req, reply) => {
      const unit = await getMemoryUnit(prisma, req.params.unitId);
      if (!unit) return reply.status(404).send({ error: 'Not found' });
      const snapshots = await listSnapshots(prisma, req.params.unitId);
      return reply.send({ unit, snapshots });
    }
  );

  // GET /admin/memory/units/:workspaceId
  app.get<{ Params: { workspaceId: string }; Querystring: { limit?: number; offset?: number } }>(
    '/units/:workspaceId', async (req, reply) => {
      const units = await listMemoryUnits(prisma, req.params.workspaceId, {
        limit: req.query.limit ?? 50,
        offset: req.query.offset ?? 0,
      });
      return reply.send(units);
    }
  );

  // GET /admin/memory/units/:workspaceId/:unitId
  app.get<{ Params: { workspaceId: string; unitId: string } }>(
    '/units/:workspaceId/:unitId', async (req, reply) => {
      const unit = await getMemoryUnit(prisma, req.params.unitId);
      if (!unit || unit.workspaceId !== req.params.workspaceId) return reply.status(404).send({ error: 'Not found' });
      const snapshots = await listSnapshots(prisma, req.params.unitId);
      return reply.send({ unit, snapshots });
    }
  );

  // GET /admin/memory/proposals/:workspaceId
  app.get<{ Params: { workspaceId: string } }>(
    '/proposals/:workspaceId', async (req, reply) => {
      const proposals = await listPendingProposals(prisma, req.params.workspaceId);
      return reply.send(proposals);
    }
  );

  // POST /admin/memory/proposals/:proposalId/approve
  app.post<{ Params: { proposalId: string }; Body: { approvedBy: string } }>(
    '/proposals/:proposalId/approve', async (req, reply) => {
      const proposal = await getProposal(prisma, req.params.proposalId);
      if (!proposal) return reply.status(404).send({ error: 'Not found' });
      if (proposal.status !== 'pending_approval') return reply.status(400).send({ error: `Cannot approve proposal with status: ${proposal.status}` });

      await updateProposalStatus(prisma, proposal.id, 'approved', { approvedBy: req.body.approvedBy });

      const unit = await getMemoryUnit(prisma, proposal.memoryUnitId);
      const workspaceId = unit?.workspaceId ?? '';

      const applyKey = uuidv4();
      await queue.send(QueueNames.MEMORY_WRITEBACK_APPLY, {
        id: applyKey,
        idempotencyKey: applyKey,
        workspaceId,
        timestamp: new Date().toISOString(),
        type: 'memory_writeback_apply',
        payload: { proposalId: proposal.id },
      });

      return reply.send({ ok: true });
    }
  );

  // POST /admin/memory/proposals/:proposalId/reject
  app.post<{ Params: { proposalId: string } }>(
    '/proposals/:proposalId/reject', async (req, reply) => {
      const proposal = await getProposal(prisma, req.params.proposalId);
      if (!proposal) return reply.status(404).send({ error: 'Not found' });
      await updateProposalStatus(prisma, proposal.id, 'rejected');
      return reply.send({ ok: true });
    }
  );

  // POST /admin/memory/backfill/:workspaceId
  // Processes all existing Slack messages for linked threads through the memory pipeline.
  app.post<{ Params: { workspaceId: string } }>('/backfill/:workspaceId', async (req, reply) => {
    const { workspaceId } = req.params;

    const links = await prisma.issueThreadLink.findMany({
      where: { unlinkedAt: null, thread: { workspaceId } },
      include: {
        thread: {
          include: {
            messages: { orderBy: { sentAt: 'desc' }, take: 50 },
          },
        },
      },
    });

    let enqueuedJobs = 0;
    for (const link of links) {
      const { unit } = await findOrCreateMemoryUnit(prisma, workspaceId, 'issue_thread', link.thread.id, link.issueId);
      for (const message of link.thread.messages) {
        const jobKey = uuidv4();
        await queue.send(QueueNames.MEMORY_EXTRACT, {
          id: jobKey,
          idempotencyKey: `memory-backfill-${message.id}`,
          workspaceId,
          timestamp: new Date().toISOString(),
          type: 'memory_extract',
          payload: { memoryUnitId: unit.id, sourceType: 'slack_message', sourceId: message.id },
        });
        enqueuedJobs++;
      }
    }

    return reply.send({ ok: true, enqueuedJobs, linksProcessed: links.length });
  });

  // POST /admin/memory/units/:workspaceId/:unitId/rerun
  app.post<{ Params: { workspaceId: string; unitId: string } }>(
    '/units/:workspaceId/:unitId/rerun', async (req, reply) => {
      const unit = await getMemoryUnit(prisma, req.params.unitId);
      if (!unit || unit.workspaceId !== req.params.workspaceId) return reply.status(404).send({ error: 'Not found' });
      const key = uuidv4();
      await queue.send(QueueNames.MEMORY_SNAPSHOT, {
        id: key, idempotencyKey: key, workspaceId: req.params.workspaceId,
        timestamp: new Date().toISOString(), type: 'memory_snapshot',
        payload: { memoryUnitId: req.params.unitId },
      });
      return reply.send({ ok: true });
    }
  );

  // POST /admin/memory/backfill-jira/:workspaceId
  // Fetches description and comments for all linked Jira issues via the Jira API
  // and enqueues MEMORY_EXTRACT jobs so they feed into Stage 1 extraction.
  app.post<{ Params: { workspaceId: string } }>('/backfill-jira/:workspaceId', async (req, reply) => {
    const { workspaceId } = req.params;

    try {
    const jiraInstall = await prisma.jiraWorkspaceInstall.findFirst({ where: { workspaceId } });
    if (!jiraInstall) return reply.status(400).send({ error: 'No Jira install found for workspace' });

    const jiraClient = new JiraClient(jiraInstall.jiraSiteUrl, jiraInstall.sharedSecret);

    // Get distinct issueIds separately to avoid Prisma distinct+include limitations
    const uniqueLinkRows = await prisma.issueThreadLink.findMany({
      where: { unlinkedAt: null, issue: { workspaceId } },
      distinct: ['issueId'],
      select: { issueId: true },
    });
    const issues = await prisma.issue.findMany({
      where: { id: { in: uniqueLinkRows.map((r) => r.issueId) } },
    });

    let enqueuedJobs = 0;
    const issuesProcessed: string[] = [];

    for (const issue of issues) {
      let content: { description: string | null; comments: Array<{ id: string; body: string; authorName: string; created: string }> };
      try {
        content = await jiraClient.getIssueContent(issue.jiraIssueKey);
      } catch (err) {
        app.log.warn({ err, issueKey: issue.jiraIssueKey }, '[backfill-jira] Failed to fetch Jira content');
        continue;
      }

      // Find memory units linked to this issue
      const units = await prisma.memoryUnit.findMany({
        where: { workspaceId, issueId: issue.id },
      });
      if (units.length === 0) continue;

      const now = new Date();

      // Create IssueEvent + enqueue MEMORY_EXTRACT for description
      if (content.description?.trim()) {
        const descText = content.description.trim();
        const descKey = `jira-desc-backfill-${issue.id}-${hashBackfillText(descText)}`;
        let descEvent = await prisma.issueEvent.findUnique({ where: { idempotencyKey: descKey } });
        if (!descEvent) {
          descEvent = await createIssueEvent(prisma, {
            issueId: issue.id,
            idempotencyKey: descKey,
            eventType: 'jira_description_sync',
            source: 'admin_backfill',
            rawPayload: { text: descText },
            occurredAt: now,
          });
        }
        for (const unit of units) {
          const jobKey = uuidv4();
          await queue.send(QueueNames.MEMORY_EXTRACT, {
            id: jobKey,
            idempotencyKey: `memory-extract-${descEvent.id}-${unit.id}`,
            workspaceId,
            timestamp: now.toISOString(),
            type: 'memory_extract',
            payload: { memoryUnitId: unit.id, sourceType: 'jira_event', sourceId: descEvent.id },
          });
          enqueuedJobs++;
        }
      }

      // Create IssueEvent + enqueue MEMORY_EXTRACT for each comment
      for (const comment of content.comments) {
        const commentText = comment.body.trim();
        if (!commentText) continue;

        const commentPayloadText = `${comment.authorName}: ${commentText}`;
        const commentKey = `jira-comment-backfill-${issue.id}-${comment.id}-${hashBackfillText(commentPayloadText)}`;
        let commentEvent = await prisma.issueEvent.findUnique({ where: { idempotencyKey: commentKey } });
        if (!commentEvent) {
          commentEvent = await createIssueEvent(prisma, {
            issueId: issue.id,
            idempotencyKey: commentKey,
            eventType: 'jira_comment_sync',
            source: 'admin_backfill',
            rawPayload: { text: commentPayloadText, commentId: comment.id, created: comment.created },
            occurredAt: new Date(comment.created),
          });
        }
        for (const unit of units) {
          const jobKey = uuidv4();
          await queue.send(QueueNames.MEMORY_EXTRACT, {
            id: jobKey,
            idempotencyKey: `memory-extract-${commentEvent.id}-${unit.id}`,
            workspaceId,
            timestamp: now.toISOString(),
            type: 'memory_extract',
            payload: { memoryUnitId: unit.id, sourceType: 'jira_event', sourceId: commentEvent.id },
          });
          enqueuedJobs++;
        }
      }

      issuesProcessed.push(issue.jiraIssueKey);
    }

    return reply.send({ ok: true, enqueuedJobs, issuesProcessed });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err, workspaceId }, '[backfill-jira] Unexpected error');
      return reply.status(500).send({ error: message });
    }
  });
}
