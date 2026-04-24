import type { FastifyInstance } from 'fastify';
import { createProductEvent, prisma } from '@remi/db';
import { QueueNames } from '@remi/shared';
import type { ProposalEditRequest, ProposalItem } from '@remi/shared';
import { v4 as uuidv4 } from 'uuid';
import { queue } from '../../queue.js';
import '../../types/fastify.js';

function mapProposal(proposal: any, issue: any): ProposalItem {
  return {
    id: proposal.id,
    issueId: issue.id,
    issueKey: issue.jiraIssueKey,
    issueTitle: issue.title ?? issue.jiraIssueKey,
    target: 'jira_comment',
    status: proposal.status,
    payload: proposal.payload as { jiraIssueKey: string; commentBody: string },
    confidence: proposal.confidence ?? 0,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
  };
}

async function loadProposalWithWorkspaceCheck(proposalId: string, workspaceId: string) {
  const proposal = await prisma.memoryWritebackProposal.findUnique({
    where: { id: proposalId },
    include: {
      memoryUnit: {
        include: {
          issue: {
            select: {
              id: true,
              workspaceId: true,
              jiraIssueKey: true,
              jiraSiteUrl: true,
              title: true,
            },
          },
        },
      },
    },
  });

  if (!proposal) return null;
  if (proposal.memoryUnit.issue?.workspaceId !== workspaceId) return null;
  return proposal;
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

export async function proposalRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { status?: string; page?: string; limit?: string } }>(
    '/proposals',
    async (request) => {
      const { status = 'pending_approval', page = '1', limit = '50' } = request.query;
      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.min(100, Math.max(1, Number(limit)));

      const where = {
        status,
        memoryUnit: { issue: { workspaceId: request.workspaceId } },
      };

      const [proposals, total] = await Promise.all([
        prisma.memoryWritebackProposal.findMany({
          where,
          include: {
            memoryUnit: {
              include: {
                issue: { select: { id: true, jiraIssueKey: true, title: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limitNum,
          skip: (pageNum - 1) * limitNum,
        }),
        prisma.memoryWritebackProposal.count({ where }),
      ]);

      return {
        items: proposals.map((proposal: any) => mapProposal(proposal, proposal.memoryUnit.issue)),
        total,
      };
    },
  );

  app.put<{ Params: { id: string }; Body: ProposalEditRequest }>(
    '/proposals/:id',
    async (request, reply) => {
      const proposal = await loadProposalWithWorkspaceCheck(request.params.id, request.workspaceId);
      if (!proposal) return reply.code(404).send({ error: 'Proposal not found' });
      if (proposal.status !== 'pending_approval') {
        return reply.code(400).send({ error: 'Only pending_approval proposals can be edited' });
      }

      const existingPayload = proposal.payload as { jiraIssueKey: string; commentBody: string };
      const updated = await prisma.memoryWritebackProposal.update({
        where: { id: request.params.id },
        data: {
          payload: {
            ...existingPayload,
            commentBody: request.body.commentBody,
          },
        },
        include: { memoryUnit: { include: { issue: true } } },
      });

      return mapProposal(updated, (updated as any).memoryUnit.issue);
    },
  );

  app.post<{ Params: { id: string } }>('/proposals/:id/approve', async (request, reply) => {
    const proposal = await loadProposalWithWorkspaceCheck(request.params.id, request.workspaceId);
    if (!proposal) return reply.code(404).send({ error: 'Proposal not found' });
    if (proposal.status !== 'pending_approval') {
      return reply.code(400).send({ error: 'Proposal is not pending approval' });
    }

    await prisma.memoryWritebackProposal.update({
      where: { id: request.params.id },
      data: { status: 'approved' },
    });

    await queue.send(QueueNames.MEMORY_WRITEBACK_APPLY, {
      id: uuidv4(),
      idempotencyKey: `apply:${request.params.id}`,
      workspaceId: request.workspaceId,
      timestamp: new Date().toISOString(),
      type: 'memory_writeback_apply',
      payload: { proposalId: request.params.id },
    });

    logEvent(request.workspaceId, request.userId, 'proposal_approved', {
      proposalId: request.params.id,
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/proposals/:id/reject',
    async (request, reply) => {
      const proposal = await loadProposalWithWorkspaceCheck(request.params.id, request.workspaceId);
      if (!proposal) return reply.code(404).send({ error: 'Proposal not found' });
      if (proposal.status !== 'pending_approval') {
        return reply.code(400).send({ error: 'Proposal is not pending approval' });
      }

      await prisma.memoryWritebackProposal.update({
        where: { id: request.params.id },
        data: { status: 'rejected' },
      });

      logEvent(request.workspaceId, request.userId, 'proposal_rejected', {
        proposalId: request.params.id,
        reason: request.body?.reason,
      });
      return { ok: true };
    },
  );
}
