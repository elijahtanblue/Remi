import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../apps/api/src/types/fastify.js';

const mockPrisma = vi.hoisted(() => ({
  workflowScopeConfig: {
    findUnique: vi.fn(),
  },
}));

vi.mock('@remi/db', () => ({
  prisma: mockPrisma,
  findScopesByWorkspace: vi.fn(),
  findWorkflowConfigs: vi.fn(),
  createWorkflowConfig: vi.fn(),
  updateWorkflowConfig: vi.fn(),
}));

import {
  createWorkflowConfig,
  findScopesByWorkspace,
  findWorkflowConfigs,
} from '@remi/db';
import { scopeRoutes } from '../../apps/api/src/routes/web/scopes.js';
import { workflowConfigRoutes } from '../../apps/api/src/routes/web/workflow-configs.js';

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async (req) => {
    req.userId = 'u1';
    req.workspaceId = 'ws1';
  });
  await app.register(scopeRoutes);
  await app.register(workflowConfigRoutes);
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /scopes', () => {
  it('returns scopes for the request workspace', async () => {
    vi.mocked(findScopesByWorkspace).mockResolvedValue([
      { id: 's1', name: 'Escalations', type: 'team' },
    ] as any);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/scopes' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [{ id: 's1', name: 'Escalations', type: 'team' }] });
    expect(findScopesByWorkspace).toHaveBeenCalledWith(expect.anything(), 'ws1');
  });
});

describe('POST /workflow-configs', () => {
  it('creates config in the request workspace', async () => {
    vi.mocked(createWorkflowConfig).mockResolvedValue({
      id: 'wc1',
      scopeId: 's1',
      workflowKey: 'vendor-escalation',
      name: 'Vendor Escalation',
      includedChannelIds: [],
      includedJiraProjects: [],
      includedMailboxes: [],
      writebackEnabled: false,
      approvalRequired: true,
    } as any);
    vi.mocked(findWorkflowConfigs).mockResolvedValue([]);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/workflow-configs',
      payload: {
        scopeId: 's1',
        workflowKey: 'vendor-escalation',
        name: 'Vendor Escalation',
        includedChannelIds: [],
        includedJiraProjects: [],
        includedMailboxes: [],
        writebackEnabled: false,
        approvalRequired: true,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(createWorkflowConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workspaceId: 'ws1' }),
    );
  });
});
