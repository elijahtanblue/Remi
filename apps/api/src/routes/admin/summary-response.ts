export interface AdminSummaryIssueResponse {
  id: string;
  workspaceId: string;
  jiraIssueKey: string;
  issueType: string | null;
}

export interface AdminSummaryResponse {
  id: string;
  issueId: string;
  version: number;
  status: string;
  content: unknown;
  triggerReason: string;
  inputHash: string;
  generatedAt: Date;
  summaryRunId: string | null;
  issue: AdminSummaryIssueResponse;
}

export interface SummaryWithIssueRecord {
  id: string;
  issueId: string;
  version: number;
  status: string;
  content: unknown;
  triggerReason: string;
  inputHash: string;
  generatedAt: Date;
  summaryRunId: string | null;
  issue: {
    id: string;
    workspaceId: string;
    jiraIssueKey: string;
    issueType: string | null;
  };
}

export function serializeAdminSummary(summary: SummaryWithIssueRecord | null): AdminSummaryResponse | null {
  if (!summary) return null;

  return {
    id: summary.id,
    issueId: summary.issueId,
    version: summary.version,
    status: summary.status,
    content: summary.content,
    triggerReason: summary.triggerReason,
    inputHash: summary.inputHash,
    generatedAt: summary.generatedAt,
    summaryRunId: summary.summaryRunId,
    issue: {
      id: summary.issue.id,
      workspaceId: summary.issue.workspaceId,
      jiraIssueKey: summary.issue.jiraIssueKey,
      issueType: summary.issue.issueType,
    },
  };
}

export function serializeAdminSummaries(summaries: SummaryWithIssueRecord[]): AdminSummaryResponse[] {
  return summaries.map((summary) => ({
    id: summary.id,
    issueId: summary.issueId,
    version: summary.version,
    status: summary.status,
    content: summary.content,
    triggerReason: summary.triggerReason,
    inputHash: summary.inputHash,
    generatedAt: summary.generatedAt,
    summaryRunId: summary.summaryRunId,
    issue: {
      id: summary.issue.id,
      workspaceId: summary.issue.workspaceId,
      jiraIssueKey: summary.issue.jiraIssueKey,
      issueType: summary.issue.issueType,
    },
  }));
}
