import type { PrismaClient } from '@prisma/client';
import type { WorkflowConfigCreateRequest } from '@remi/shared';

export async function findWorkflowConfigs(
  prisma: PrismaClient,
  workspaceId: string,
  scopeId?: string,
) {
  return prisma.workflowScopeConfig.findMany({
    where: { workspaceId, ...(scopeId ? { scopeId } : {}) },
    orderBy: { name: 'asc' },
  });
}

export async function createWorkflowConfig(
  prisma: PrismaClient,
  data: WorkflowConfigCreateRequest & { workspaceId: string },
) {
  return prisma.workflowScopeConfig.create({ data });
}

export async function updateWorkflowConfig(
  prisma: PrismaClient,
  id: string,
  data: Partial<WorkflowConfigCreateRequest>,
) {
  return prisma.workflowScopeConfig.update({ where: { id }, data });
}
