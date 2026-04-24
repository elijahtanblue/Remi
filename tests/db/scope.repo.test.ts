import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findScopeById,
  findScopesByWorkspace,
} from '../../packages/db/src/repositories/scope.repo.js';

const mockPrisma = {
  scope: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
} as any;

beforeEach(() => vi.clearAllMocks());

describe('findScopesByWorkspace', () => {
  it('queries by workspaceId ordered by name', async () => {
    mockPrisma.scope.findMany.mockResolvedValue([]);

    await findScopesByWorkspace(mockPrisma, 'ws1');

    expect(mockPrisma.scope.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1' },
      orderBy: { name: 'asc' },
    });
  });
});

describe('findScopeById', () => {
  it('queries by id', async () => {
    mockPrisma.scope.findUnique.mockResolvedValue(null);

    await findScopeById(mockPrisma, 'scope1');

    expect(mockPrisma.scope.findUnique).toHaveBeenCalledWith({
      where: { id: 'scope1' },
    });
  });
});
