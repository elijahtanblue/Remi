import { describe, expect, it, vi } from 'vitest';
import { findIssueByKey, upsertIssue } from '../../packages/db/src/repositories/issue.repo.js';

describe('issue identity handling', () => {
  it('prefers a canonical issue over a pending placeholder when looking up by key', async () => {
    const canonical = { id: 'issue-real', jiraSiteUrl: 'https://example.atlassian.net' };
    const pending = { id: 'issue-pending', jiraSiteUrl: 'pending' };

    const prisma = {
      issue: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(canonical)
          .mockResolvedValueOnce(pending),
      },
    } as any;

    const result = await findIssueByKey(prisma, 'ws_1', 'KAN-1');

    expect(result).toBe(canonical);
    expect(prisma.issue.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.issue.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 'ws_1', jiraIssueKey: 'KAN-1', NOT: { jiraSiteUrl: 'pending' } },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('upgrades an existing placeholder issue instead of creating a duplicate canonical row', async () => {
    const updated = {
      id: 'issue-pending',
      jiraIssueId: '10001',
      jiraIssueKey: 'KAN-1',
      jiraSiteUrl: 'https://example.atlassian.net',
    };

    const prisma = {
      issue: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue({
          id: 'issue-pending',
          workspaceId: 'ws_1',
          jiraIssueId: 'KAN-1',
          jiraIssueKey: 'KAN-1',
          jiraSiteUrl: 'pending',
          title: 'KAN-1',
        }),
        update: vi.fn().mockResolvedValue(updated),
        create: vi.fn(),
      },
    } as any;

    const result = await upsertIssue(prisma, {
      workspaceId: 'ws_1',
      jiraIssueId: '10001',
      jiraIssueKey: 'KAN-1',
      jiraSiteUrl: 'https://example.atlassian.net',
      title: 'Real Jira title',
      status: 'In Progress',
    });

    expect(result).toBe(updated);
    expect(prisma.issue.update).toHaveBeenCalledWith({
      where: { id: 'issue-pending' },
      data: expect.objectContaining({
        jiraIssueId: '10001',
        jiraIssueKey: 'KAN-1',
        jiraSiteUrl: 'https://example.atlassian.net',
        title: 'Real Jira title',
        status: 'In Progress',
      }),
    });
    expect(prisma.issue.create).not.toHaveBeenCalled();
  });
});
