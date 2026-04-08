import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDepartment,
  findDepartmentsByWorkspace,
  findDepartmentByJiraProjectPrefix,
  findDepartmentBySlackChannel,
  updateDepartment,
  deleteDepartment,
} from '../../packages/db/src/repositories/department.repo.js';

const mockPrisma = {
  department: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
} as any;

beforeEach(() => vi.clearAllMocks());

// ─── createDepartment ─────────────────────────────────────────────────────────

describe('createDepartment', () => {
  it('persists name, workspaceId, jiraProjectPrefixes, and slackChannelPatterns', async () => {
    const dept = {
      id: 'dept_1',
      workspaceId: 'ws_1',
      name: 'Product',
      jiraProjectPrefixes: ['ENG', 'PROD'],
      slackChannelPatterns: ['eng-*', 'product-*'],
    };
    mockPrisma.department.create.mockResolvedValue(dept);

    const result = await createDepartment(mockPrisma, 'ws_1', 'Product', ['ENG', 'PROD'], ['eng-*', 'product-*']);

    expect(mockPrisma.department.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws_1',
        name: 'Product',
        jiraProjectPrefixes: ['ENG', 'PROD'],
        slackChannelPatterns: ['eng-*', 'product-*'],
      },
    });
    expect(result).toEqual(dept);
  });

  it('accepts empty prefix and pattern arrays', async () => {
    mockPrisma.department.create.mockResolvedValue({ id: 'dept_2', name: 'Sales' });

    await createDepartment(mockPrisma, 'ws_1', 'Sales', [], []);

    expect(mockPrisma.department.create).toHaveBeenCalledWith({
      data: { workspaceId: 'ws_1', name: 'Sales', jiraProjectPrefixes: [], slackChannelPatterns: [] },
    });
  });
});

// ─── findDepartmentsByWorkspace ───────────────────────────────────────────────

describe('findDepartmentsByWorkspace', () => {
  it('queries by workspaceId and orders alphabetically by name', async () => {
    mockPrisma.department.findMany.mockResolvedValue([]);

    await findDepartmentsByWorkspace(mockPrisma, 'ws_1');

    expect(mockPrisma.department.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws_1' },
      orderBy: { name: 'asc' },
    });
  });

  it('returns all departments for the workspace', async () => {
    const depts = [
      { id: 'dept_1', name: 'Marketing' },
      { id: 'dept_2', name: 'Product' },
    ];
    mockPrisma.department.findMany.mockResolvedValue(depts);

    const result = await findDepartmentsByWorkspace(mockPrisma, 'ws_1');

    expect(result).toEqual(depts);
  });
});

// ─── findDepartmentByJiraProjectPrefix ───────────────────────────────────────

describe('findDepartmentByJiraProjectPrefix', () => {
  it('queries using Prisma array contains to match the exact prefix', async () => {
    const dept = { id: 'dept_1', name: 'Product', jiraProjectPrefixes: ['ENG', 'PROD'] };
    mockPrisma.department.findFirst.mockResolvedValue(dept);

    const result = await findDepartmentByJiraProjectPrefix(mockPrisma, 'ws_1', 'ENG');

    expect(mockPrisma.department.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws_1',
        jiraProjectPrefixes: { has: 'ENG' },
      },
    });
    expect(result).toEqual(dept);
  });

  it('returns null when no department owns the prefix', async () => {
    mockPrisma.department.findFirst.mockResolvedValue(null);

    const result = await findDepartmentByJiraProjectPrefix(mockPrisma, 'ws_1', 'UNKNOWN');

    expect(result).toBeNull();
  });
});

// ─── findDepartmentBySlackChannel ────────────────────────────────────────────

describe('findDepartmentBySlackChannel', () => {
  it('matches a wildcard pattern — channel starting with prefix', async () => {
    mockPrisma.department.findMany.mockResolvedValue([
      { id: 'dept_1', name: 'Product', slackChannelPatterns: ['eng-*', 'product-*'] },
      { id: 'dept_2', name: 'Marketing', slackChannelPatterns: ['marketing-*', 'gtm-*'] },
    ]);

    const result = await findDepartmentBySlackChannel(mockPrisma, 'ws_1', 'eng-standup');

    expect(result?.id).toBe('dept_1');
  });

  it('matches an exact pattern with no wildcard', async () => {
    mockPrisma.department.findMany.mockResolvedValue([
      { id: 'dept_1', name: 'Product', slackChannelPatterns: ['general', 'eng-standup'] },
    ]);

    const result = await findDepartmentBySlackChannel(mockPrisma, 'ws_1', 'general');

    expect(result?.id).toBe('dept_1');
  });

  it('returns null when no pattern matches the channel', async () => {
    mockPrisma.department.findMany.mockResolvedValue([
      { id: 'dept_1', name: 'Product', slackChannelPatterns: ['eng-*'] },
    ]);

    const result = await findDepartmentBySlackChannel(mockPrisma, 'ws_1', 'sales-general');

    expect(result).toBeNull();
  });

  it('does not match a channel that merely contains the wildcard prefix', async () => {
    mockPrisma.department.findMany.mockResolvedValue([
      { id: 'dept_1', name: 'Product', slackChannelPatterns: ['eng-*'] },
    ]);

    // "not-eng-team" starts with "not-", not "eng-"
    const result = await findDepartmentBySlackChannel(mockPrisma, 'ws_1', 'not-eng-team');

    expect(result).toBeNull();
  });

  it('fetches departments filtered to the correct workspace', async () => {
    mockPrisma.department.findMany.mockResolvedValue([]);

    await findDepartmentBySlackChannel(mockPrisma, 'ws_42', 'eng-standup');

    expect(mockPrisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws_42' }) }),
    );
  });
});

// ─── updateDepartment ────────────────────────────────────────────────────────

describe('updateDepartment', () => {
  it('updates specified fields by id', async () => {
    const updated = { id: 'dept_1', name: 'Engineering', jiraProjectPrefixes: ['ENG', 'MOB'] };
    mockPrisma.department.update.mockResolvedValue(updated);

    const result = await updateDepartment(mockPrisma, 'dept_1', {
      name: 'Engineering',
      jiraProjectPrefixes: ['ENG', 'MOB'],
    });

    expect(mockPrisma.department.update).toHaveBeenCalledWith({
      where: { id: 'dept_1' },
      data: { name: 'Engineering', jiraProjectPrefixes: ['ENG', 'MOB'] },
    });
    expect(result).toEqual(updated);
  });

  it('allows partial updates — only slackChannelPatterns', async () => {
    mockPrisma.department.update.mockResolvedValue({ id: 'dept_1' });

    await updateDepartment(mockPrisma, 'dept_1', { slackChannelPatterns: ['gtm-*'] });

    expect(mockPrisma.department.update).toHaveBeenCalledWith({
      where: { id: 'dept_1' },
      data: { slackChannelPatterns: ['gtm-*'] },
    });
  });
});

// ─── deleteDepartment ────────────────────────────────────────────────────────

describe('deleteDepartment', () => {
  it('deletes the department by id', async () => {
    mockPrisma.department.delete.mockResolvedValue({ id: 'dept_1' });

    await deleteDepartment(mockPrisma, 'dept_1');

    expect(mockPrisma.department.delete).toHaveBeenCalledWith({
      where: { id: 'dept_1' },
    });
  });
});
