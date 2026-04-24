import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { webAuthPlugin } from '../../plugins/web-auth.js';
import { issueRoutes } from './issues.js';
import { proposalRoutes } from './proposals.js';
import { scopeRoutes } from './scopes.js';
import { workflowConfigRoutes } from './workflow-configs.js';

export async function webRoutes(app: FastifyInstance) {
  await app.register(webAuthPlugin, { token: config.INTERNAL_TOKEN });
  await app.register(issueRoutes);
  await app.register(proposalRoutes);
  await app.register(scopeRoutes);
  await app.register(workflowConfigRoutes);
}
