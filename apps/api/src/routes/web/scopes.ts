import type { FastifyInstance } from 'fastify';
import { findScopesByWorkspace, prisma } from '@remi/db';
import type { ScopeItem } from '@remi/shared';
import '../../types/fastify.js';

export async function scopeRoutes(app: FastifyInstance) {
  app.get('/scopes', async (request) => {
    const scopes = await findScopesByWorkspace(prisma, request.workspaceId);
    const items: ScopeItem[] = scopes.map((scope) => ({
      id: scope.id,
      name: scope.name,
      type: scope.type,
    }));
    return { items };
  });
}
