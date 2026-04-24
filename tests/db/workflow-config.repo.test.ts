import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWorkflowConfig,
  findWorkflowConfigs,
  updateWorkflowConfig,
} from '../../packages/db/src/repositories/workflow-config.repo.js';

const mockPrisma = {
  workflowScopeConfig: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
} as any;

beforeEach(() => vi.clearAllMocks());

describe('findWorkflowConfigs', () => {
  it('filters by workspaceId and optional scopeId', async () => {
    mockPrisma.workflowScopeConfig.findMany.mockResolvedValue([]);

    await findWorkflowConfigs(mockPrisma, 'ws1', 'scope1');

    expect(mockPrisma.workflowScopeConfig.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1', scopeId: 'scope1' },
      orderBy: { name: 'asc' },
    });
  });

  it('omits scopeId filter when not provided', async () => {
    mockPrisma.workflowScopeConfig.findMany.mockResolvedValue([]);

    await findWorkflowConfigs(mockPrisma, 'ws1');

    expect(mockPrisma.workflowScopeConfig.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1' },
      orderBy: { name: 'asc' },
    });
  });
});

describe('createWorkflowConfig', () => {
  it('creates with all provided fields', async () => {
    mockPrisma.workflowScopeConfig.create.mockResolvedValue({ id: 'wc1' });

    await createWorkflowConfig(mockPrisma, {
      workspaceId: 'ws1',
      scopeId: 'scope1',
      workflowKey: 'vendor-escalation',
      name: 'Vendor Escalation',
      includedChannelIds: ['C1'],
      includedJiraProjects: ['PROJ'],
      includedMailboxes: ['support@example.com'],
      writebackEnabled: false,
      approvalRequired: true,
    });

    const call = mockPrisma.workflowScopeConfig.create.mock.calls[0][0];
    expect(call.data.workflowKey).toBe('vendor-escalation');
    expect(call.data.writebackEnabled).toBe(false);
  });
});

describe('updateWorkflowConfig', () => {
  it('updates by id', async () => {
    mockPrisma.workflowScopeConfig.update.mockResolvedValue({ id: 'wc1' });

    await updateWorkflowConfig(mockPrisma, 'wc1', { name: 'Updated' } as any);

    const call = mockPrisma.workflowScopeConfig.update.mock.calls[0][0];
    expect(call.where.id).toBe('wc1');
    expect(call.data.name).toBe('Updated');
  });
});
