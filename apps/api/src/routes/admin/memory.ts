import type { FastifyInstance } from 'fastify';
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
} from '@remi/db';
import { QueueNames } from '@remi/shared';
import type { IQueueProducer } from '@remi/queue';
import { v4 as uuidv4 } from 'uuid';

export async function memoryRoutes(app: FastifyInstance, { queue }: { queue: IQueueProducer }) {

  // GET /admin/memory/config/:workspaceId
  app.get<{ Params: { workspaceId: string } }>('/config/:workspaceId', async (req, reply) => {
    const config = await getMemoryConfig(prisma, req.params.workspaceId);
    return reply.send(config ?? { enabled: false, excludedChannelIds: [], excludedUserIds: [] });
  });

  // PUT /admin/memory/config/:workspaceId
  app.put<{ Params: { workspaceId: string }; Body: { enabled?: boolean; excludedChannelIds?: string[]; excludedUserIds?: string[] } }>(
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
}
