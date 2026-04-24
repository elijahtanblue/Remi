import type { FastifyInstance } from 'fastify';
import {
  computeQueueSection,
  createProductEvent,
  findMeaningfulEventsByIssue,
  prisma,
} from '@remi/db';
import type { Prisma } from '@remi/db';
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

async function findProposalAnchor(issueId: string) {
  const unit = await prisma.memoryUnit.findFirst({
    where: {
      issueId,
      snapshots: { some: {} },
    },
    include: {
      snapshots: { orderBy: { version: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!unit || unit.snapshots.length === 0) return null;
  return { unit, snapshot: unit.snapshots[0]! };
}

async function createJiraCommentProposal(params: {
  issueKey: string;
  commentBody: string;
  memoryUnitId: string;
  snapshotId: string;
  confidence: number;
}) {
  const { issueKey, commentBody, memoryUnitId, snapshotId, confidence } = params;
  return prisma.memoryWritebackProposal.create({
    data: {
      memoryUnitId,
      snapshotId,
      target: 'jira_comment',
      status: 'pending_approval',
      payload: { jiraIssueKey: issueKey, commentBody },
      citationIds: [],
      confidence,
      modelId: 'cwr-draft',
      promptVersion: '1.0',
    },
  });
}

function queueWhere(
  workspaceId: string,
  scopeId: string | undefined,
  section: string,
): Prisma.IssueWhereInput {
  const baseWhere: Prisma.IssueWhereInput = {
    workspaceId,
    ...(scopeId ? { scopeId } : {}),
  };
  const needsActionWhere: Prisma.IssueWhereInput = {
    currentWorkRecord: {
      is: {
        OR: [{ isStale: true }, { riskScore: { gte: 0.6 } }],
      },
    },
  };
  const awaitingApprovalWhere: Prisma.IssueWhereInput = {
    currentWorkRecord: {
      is: {
        isStale: false,
        riskScore: { lt: 0.6 },
      },
    },
    memoryUnits: {
      some: {
        proposals: { some: { status: 'pending_approval' } },
      },
    },
  };

  if (section === 'needs_action') return { AND: [baseWhere, needsActionWhere] };
  if (section === 'awaiting_approval') return { AND: [baseWhere, awaitingApprovalWhere] };
  if (section === 'recently_changed') {
    return { AND: [baseWhere, { NOT: [needsActionWhere, awaitingApprovalWhere] }] };
  }
  return baseWhere;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

export async function issueRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { section?: string; scopeId?: string; page?: string; limit?: string };
  }>('/issues', async (request) => {
    const { section = 'all', scopeId, page = '1', limit = '50' } = request.query;
    const pageNum = positiveInt(page, 1);
    const limitNum = Math.min(100, positiveInt(limit, 50));
    const offset = (pageNum - 1) * limitNum;
    const where = queueWhere(request.workspaceId, scopeId, section);

    const [issues, total] = await Promise.all([
      prisma.issue.findMany({
        where,
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
        skip: offset,
        take: limitNum,
      }),
      prisma.issue.count({ where }),
    ]);

    const items: IssueQueueItem[] = issues.map((issue: any) => {
      const pendingProposalCount = issue.memoryUnits.reduce(
        (sum: number, unit: any) => sum + unit._count.proposals,
        0,
      );
      const queueSection = computeQueueSection(issue.currentWorkRecord, pendingProposalCount);

      return {
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
      };
    });

    logEvent(request.workspaceId, request.userId, 'issue_queue_viewed', {
      section,
      count: items.length,
    });
    return { items, total };
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

    if (request.body.type === 'draft_update') {
      const cwr = issue.currentWorkRecord;
      if (!cwr) {
        return reply.code(400).send({ error: 'No current state available to draft an update from.' });
      }

      const anchor = await findProposalAnchor(issue.id);
      if (!anchor) {
        return { proposalId: null, message: 'No memory snapshot to attach the proposal to. Ingest a Slack thread first.' };
      }

      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const lines: string[] = [`*Status update — ${today}*`, '', cwr.currentState];
      if (cwr.ownerDisplayName) lines.push('', `Owner: ${cwr.ownerDisplayName}`);
      if (cwr.waitingOnDescription) lines.push(`Waiting on: ${cwr.waitingOnDescription}`);
      if (cwr.nextStep) lines.push(`Next step: ${cwr.nextStep}`);
      if (cwr.blockerSummary) lines.push('', `⚠ Blocker: ${cwr.blockerSummary}`);
      const commentBody = lines.join('\n');

      const proposal = await createJiraCommentProposal({
        issueKey: issue.jiraIssueKey,
        commentBody,
        memoryUnitId: anchor.unit.id,
        snapshotId: anchor.snapshot.id,
        confidence: cwr.confidence,
      });

      logEvent(request.workspaceId, request.userId, 'draft_update_created', {
        issueId: issue.id,
        proposalId: proposal.id,
      });
      return { proposalId: proposal.id, message: 'Draft update created — check Approvals to review and post.' };
    }

    if (request.body.type === 'chase_owner') {
      const cwr = issue.currentWorkRecord;
      if (!cwr?.ownerDisplayName) {
        return reply.code(400).send({ error: 'No owner available to chase.' });
      }

      const anchor = await findProposalAnchor(issue.id);
      if (!anchor) {
        return { proposalId: null, message: 'No linked thread to attach the proposal to.' };
      }

      const commentBody = [
        `Hi ${cwr.ownerDisplayName}, following up on ${issue.jiraIssueKey} — ${cwr.currentState}.`,
        `Next step: ${cwr.nextStep ?? 'Please confirm current status'}.`,
        'Can you provide an update?',
      ].join('\n');

      const proposal = await createJiraCommentProposal({
        issueKey: issue.jiraIssueKey,
        commentBody,
        memoryUnitId: anchor.unit.id,
        snapshotId: anchor.snapshot.id,
        confidence: cwr.confidence,
      });

      return { proposalId: proposal.id, message: 'Chase drafted — review in Approvals.' };
    }

    if (request.body.type === 'prepare_escalation') {
      const cwr = issue.currentWorkRecord;
      if (!cwr) {
        return reply.code(400).send({ error: 'No current state available to prepare escalation from.' });
      }

      const anchor = await findProposalAnchor(issue.id);
      if (!anchor) {
        return { proposalId: null, message: 'No linked thread to attach the proposal to.' };
      }

      const lines = [
        `*Escalation Summary — ${issue.jiraIssueKey}*`,
        `*Issue:* ${issue.title}`,
        `*Current state:* ${cwr.currentState}`,
      ];
      if (cwr.ownerDisplayName) lines.push(`*Owner:* ${cwr.ownerDisplayName}`);
      if (cwr.waitingOnDescription) lines.push(`*Waiting on:* ${cwr.waitingOnDescription}`);
      if (cwr.blockerSummary) lines.push(`*Blocker:* ${cwr.blockerSummary}`);
      if (cwr.nextStep) lines.push(`*Recommended next step:* ${cwr.nextStep}`);
      lines.push(`*Risk:* ${Math.round(cwr.riskScore * 100)}% · Confidence: ${Math.round(cwr.confidence * 100)}%`);
      lines.push(`*Sources:* ${cwr.dataSources.join(', ')}`);
      if (cwr.isStale) lines.push('⚠ This issue has gone stale.');

      const proposal = await createJiraCommentProposal({
        issueKey: issue.jiraIssueKey,
        commentBody: lines.join('\n'),
        memoryUnitId: anchor.unit.id,
        snapshotId: anchor.snapshot.id,
        confidence: cwr.confidence,
      });

      return { proposalId: proposal.id, message: 'Escalation pack ready — review in Approvals.' };
    }

    return {
      proposalId: null,
      message: `Action '${request.body.type}' queued.`,
    };
  });
}
