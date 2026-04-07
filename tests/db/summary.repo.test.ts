import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findSummaryById, listSummariesByWorkspace } from '../../packages/db/src/repositories/summary.repo.js';

const mockPrisma = {
  summary: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('summary repo issue references', () => {
  it('includes Jira issue metadata when listing summaries by workspace', async () => {
    mockPrisma.summary.findMany.mockResolvedValue([]);

    await listSummariesByWorkspace(mockPrisma, 'ws_1', { limit: 10, offset: 5 });

    expect(mockPrisma.summary.findMany).toHaveBeenCalledWith({
      where: { issue: { workspaceId: 'ws_1' } },
      take: 10,
      skip: 5,
      orderBy: { generatedAt: 'desc' },
      include: {
        issue: {
          select: {
            id: true,
            workspaceId: true,
            jiraIssueKey: true,
            issueType: true,
          },
        },
      },
    });
  });

  it('includes Jira issue metadata when loading a summary by id', async () => {
    mockPrisma.summary.findUnique.mockResolvedValue(null);

    await findSummaryById(mockPrisma, 'sum_1');

    expect(mockPrisma.summary.findUnique).toHaveBeenCalledWith({
      where: { id: 'sum_1' },
      include: {
        issue: {
          select: {
            id: true,
            workspaceId: true,
            jiraIssueKey: true,
            issueType: true,
          },
        },
      },
    });
  });
});
