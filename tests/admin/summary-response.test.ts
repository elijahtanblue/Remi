import { describe, expect, it } from 'vitest';
import { serializeAdminSummary, serializeAdminSummaries } from '../../apps/api/src/routes/admin/summary-response.js';

describe('admin summary response serialization', () => {
  it('returns null for a missing summary', () => {
    expect(serializeAdminSummary(null)).toBeNull();
  });

  it('preserves top-level fields and exposes nested Jira issue metadata', () => {
    const generatedAt = new Date('2026-04-07T00:00:00.000Z');
    const summary = serializeAdminSummary({
      id: 'sum_1',
      issueId: 'issue_internal_1',
      version: 3,
      status: 'current',
      content: { headline: 'Summary headline' },
      triggerReason: 'manual',
      inputHash: 'hash_1',
      generatedAt,
      summaryRunId: 'run_1',
      issue: {
        id: 'issue_internal_1',
        workspaceId: 'ws_1',
        jiraIssueKey: 'KAN-1',
        issueType: 'Bug',
      },
    });

    expect(summary).toEqual({
      id: 'sum_1',
      issueId: 'issue_internal_1',
      version: 3,
      status: 'current',
      content: { headline: 'Summary headline' },
      triggerReason: 'manual',
      inputHash: 'hash_1',
      generatedAt,
      summaryRunId: 'run_1',
      issue: {
        id: 'issue_internal_1',
        workspaceId: 'ws_1',
        jiraIssueKey: 'KAN-1',
        issueType: 'Bug',
      },
    });
  });

  it('serializes summary lists with the same nested issue contract', () => {
    const generatedAt = new Date('2026-04-07T00:00:00.000Z');

    expect(
      serializeAdminSummaries([
        {
          id: 'sum_1',
          issueId: 'issue_internal_1',
          version: 1,
          status: 'current',
          content: {},
          triggerReason: 'status_changed',
          inputHash: 'hash_1',
          generatedAt,
          summaryRunId: null,
          issue: {
            id: 'issue_internal_1',
            workspaceId: 'ws_1',
            jiraIssueKey: 'KAN-1',
            issueType: null,
          },
        },
      ]),
    ).toEqual([
      {
        id: 'sum_1',
        issueId: 'issue_internal_1',
        version: 1,
        status: 'current',
        content: {},
        triggerReason: 'status_changed',
        inputHash: 'hash_1',
        generatedAt,
        summaryRunId: null,
        issue: {
          id: 'issue_internal_1',
          workspaceId: 'ws_1',
          jiraIssueKey: 'KAN-1',
          issueType: null,
        },
      },
    ]);
  });
});
