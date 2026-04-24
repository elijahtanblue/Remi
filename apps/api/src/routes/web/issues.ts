import type { FastifyInstance } from 'fastify';
import {
  computeQueueSection,
  createProductEvent,
  findMeaningfulEventsByIssue,
  prisma,
} from '@remi/db';
import type {
  CWRDetail,
  CWRSummary,
  EvidenceItem,
  IssueDetail,
  IssueQueueItem,
  MeaningfulEventItem,
  TriggerActionRequest,
} from '@remi/shared';
import '../../types/fastify.js';

function mapCwrSummary(cwr: any): CWRSummary {
  return {
    currentState: cwr.currentState,
    ownerDisplayName: cwr.ownerDisplayName,
    ownerExternalId: cwr.ownerExternalId,
    blockerSummary: cwr.blockerSummary,
    waitingOnType: cwr.waitingOnType,
    waitingOnDescription: cwr.waitingOnDescription,
    nextStep: cwr.nextStep,
    riskScore: cwr.riskScore,
    urgencyReason: cwr.urgencyReason,
    isStale: cwr.isStale,
    staleSince: cwr.staleSince?.toISOString() ?? null,
    sourceFreshnessAt: cwr.sourceFreshnessAt.toISOString(),
    lastMeaningfulChangeAt: cwr.lastMeaningfulChangeAt?.toISOString() ?? null,
    lastMeaningfulChangeSummary: cwr.lastMeaningfulChangeSummary,
    dataSources: cwr.dataSources,
    confidence: cwr.confidence,
  };
}

function mapCwrDetail(cwr: any): CWRDetail {
  return {
    ...mapCwrSummary(cwr),
    ownerSource: cwr.ownerSource,
    blockerDetectedAt: cwr.blockerDetectedAt?.toISOString() ?? null,
    openQuestions: Array.isArray(cwr.openQuestions) ? cwr.openQuestions : [],
    generatedAt: cwr.generatedAt.toISOString(),
    updatedAt: cwr.updatedAt.toISOString(),
  };
}

function jiraUrl(issue: { jiraSiteUrl: string; jiraIssueKey: string }) {
  return `${issue.jiraSiteUrl.replace(/\/$/, '')}/browse/${issue.jiraIssueKey}`;
}

function logEvent(workspaceId: string, userId: string, event: string, properties?: object) {
  void Promise.resolve(
    createProductEvent(prisma, {
      workspaceId,
      actorId: userId,
      event,
      properties: properties as Record<string, unknown> | undefined,
    }),
  ).catch(() => {});
}

export async function issueRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { section?: string; scopeId?: string; page?: string; limit?: string };
  }>('/issues', async (request) => {
    const { section = 'all', scopeId, page = '1', limit = '50' } = request.query;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));

    const issues = await prisma.issue.findMany({
      where: {
        workspaceId: request.workspaceId,
        ...(scopeId ? { scopeId } : {}),
      },
      include: {
        currentWorkRecord: true,
        scope: { select: { id: true, name: true } },
        memoryUnits: {
          select: {
            _count: {
              select: { proposals: { where: { status: 'pending_approval' } } },
            },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    const mapped: IssueQueueItem[] = issues.flatMap((issue: any) => {
      const pendingProposalCount = issue.memoryUnits.reduce(
        (sum: number, unit: any) => sum + unit._count.proposals,
        0,
      );
      const queueSection = computeQueueSection(issue.currentWorkRecord, pendingProposalCount);
      if (section !== 'all' && queueSection !== section) return [];

      return [{
        id: issue.id,
        jiraIssueKey: issue.jiraIssueKey,
        jiraIssueUrl: jiraUrl(issue),
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        scopeId: issue.scopeId,
        scopeName: issue.scope?.name ?? null,
        cwr: issue.currentWorkRecord ? mapCwrSummary(issue.currentWorkRecord) : null,
        queueSection,
        pendingProposalCount,
      }];
    });

    const offset = (pageNum - 1) * limitNum;
    const items = mapped.slice(offset, offset + limitNum);
    logEvent(request.workspaceId, request.userId, 'issue_queue_viewed', {
      section,
      count: items.length,
    });
    return { items, total: mapped.length };
  });

  app.get<{ Params: { id: string } }>('/issues/:id', async (request, reply) => {
    const issue = await prisma.issue.findUnique({
      where: { id: request.params.id },
      include: {
        currentWorkRecord: true,
        scope: { select: { id: true, name: true } },
      },
    });

    if (!issue || issue.workspaceId !== request.workspaceId) {
      return reply.code(404).send({ error: 'Issue not found' });
    }

    const detail: IssueDetail = {
      id: issue.id,
      jiraIssueKey: issue.jiraIssueKey,
      jiraIssueUrl: jiraUrl(issue),
      title: issue.title,
      status: issue.status,
      statusCategory: issue.statusCategory,
      priority: issue.priority,
      issueType: issue.issueType,
      scopeId: issue.scopeId,
      scopeName: issue.scope?.name ?? null,
      cwr: issue.currentWorkRecord ? mapCwrDetail(issue.currentWorkRecord) : null,
    };

    logEvent(request.workspaceId, request.userId, 'issue_detail_viewed', {
      issueId: issue.id,
    });
    return detail;
  });

  app.get<{
    Params: { id: string };
    Querystring: { limit?: string; before?: string };
  }>('/issues/:id/timeline', async (request, reply) => {
    const issue = await prisma.issue.findUnique({
      where: { id: request.params.id },
      select: { workspaceId: true },
    });
    if (!issue || issue.workspaceId !== request.workspaceId) {
      return reply.code(404).send({ error: 'Issue not found' });
    }

    const limit = Math.min(100, Math.max(1, Number(request.query.limit ?? '20')));
    const { events, nextCursor } = await findMeaningfulEventsByIssue(prisma, request.params.id, {
      limit,
      before: request.query.before,
    });

    return {
      events: events.map((event: any): MeaningfulEventItem => ({
        id: event.id,
        eventType: event.eventType,
        summary: event.summary,
        source: event.source,
        sourceRef: event.sourceRef ?? null,
        sourceUrl: event.sourceUrl ?? null,
        actorName: event.actorName ?? null,
        occurredAt: event.occurredAt.toISOString(),
        metadata: event.metadata ?? null,
      })),
      nextCursor,
    };
  });

  app.get<{ Params: { id: string } }>('/issues/:id/evidence', async (request, reply) => {
    const issue = await prisma.issue.findUnique({
      where: { id: request.params.id },
      select: { workspaceId: true },
    });
    if (!issue || issue.workspaceId !== request.workspaceId) {
      return reply.code(404).send({ error: 'Issue not found' });
    }

    const observations = await prisma.memoryObservation.findMany({
      where: { memoryUnit: { issueId: request.params.id } },
      orderBy: { extractedAt: 'desc' },
    });

    const items: EvidenceItem[] = observations.map((obs: any) => ({
      id: obs.id,
      category: obs.category,
      content: obs.content,
      confidence: obs.confidence,
      sourceApp: obs.sourceApp ?? null,
      state: obs.state,
      extractedAt: obs.extractedAt.toISOString(),
      citationUrls: obs.citationIds ?? [],
    }));

    return { items };
  });

  app.post<{
    Params: { id: string };
    Body: TriggerActionRequest;
  }>('/issues/:id/actions', async (request, reply) => {
    const issue = await prisma.issue.findUnique({
      where: { id: request.params.id },
      include: { currentWorkRecord: true },
    });
    if (!issue || issue.workspaceId !== request.workspaceId) {
      return reply.code(404).send({ error: 'Issue not found' });
    }

    logEvent(request.workspaceId, request.userId, 'action_triggered', {
      issueId: issue.id,
      actionType: request.body.type,
    });

    if (request.body.type === 'mark_owner_confirmed') {
      if (!issue.currentWorkRecord) {
        return reply.code(400).send({ error: 'No CWR to confirm' });
      }
      await prisma.currentWorkRecord.update({
        where: { issueId: issue.id },
        data: { ownerConfirmedAt: new Date() },
      });
      return { proposalId: null, message: 'Owner confirmed.' };
    }

    if (request.body.type === 'mark_blocker_cleared') {
      if (!issue.currentWorkRecord) {
        return reply.code(400).send({ error: 'No CWR to update' });
      }
      await prisma.currentWorkRecord.update({
        where: { issueId: issue.id },
        data: { blockerClearedAt: new Date(), blockerSummary: null },
      });
      return { proposalId: null, message: 'Blocker marked as cleared.' };
    }

    return {
      proposalId: null,
      message: `Action '${request.body.type}' received. Full generation coming in a follow-on release.`,
    };
  });
}
