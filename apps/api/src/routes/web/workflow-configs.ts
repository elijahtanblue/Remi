import type { FastifyInstance } from 'fastify';
import {
  createWorkflowConfig,
  findWorkflowConfigs,
  prisma,
  updateWorkflowConfig,
} from '@remi/db';
import type { WorkflowConfigCreateRequest, WorkflowConfigItem } from '@remi/shared';
import '../../types/fastify.js';

function mapConfig(config: any): WorkflowConfigItem {
  return {
    id: config.id,
    scopeId: config.scopeId,
    workflowKey: config.workflowKey,
    name: config.name,
    includedChannelIds: config.includedChannelIds,
    includedJiraProjects: config.includedJiraProjects,
    includedMailboxes: config.includedMailboxes,
    writebackEnabled: config.writebackEnabled,
    approvalRequired: config.approvalRequired,
  };
}

export async function workflowConfigRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { scopeId?: string } }>('/workflow-configs', async (request) => {
    const configs = await findWorkflowConfigs(
      prisma,
      request.workspaceId,
      request.query.scopeId,
    );
    return { items: configs.map(mapConfig) };
  });

  app.post<{ Body: WorkflowConfigCreateRequest }>(
    '/workflow-configs',
    async (request, reply) => {
      const config = await createWorkflowConfig(prisma, {
        ...request.body,
        workspaceId: request.workspaceId,
      });
      return reply.code(201).send(mapConfig(config));
    },
  );

  app.put<{ Params: { id: string }; Body: WorkflowConfigCreateRequest }>(
    '/workflow-configs/:id',
    async (request, reply) => {
      const existing = await prisma.workflowScopeConfig.findUnique({
        where: { id: request.params.id },
      });
      if (!existing || existing.workspaceId !== request.workspaceId) {
        return reply.code(404).send({ error: 'Config not found' });
      }

      const updated = await updateWorkflowConfig(prisma, request.params.id, request.body);
      return mapConfig(updated);
    },
  );
}
