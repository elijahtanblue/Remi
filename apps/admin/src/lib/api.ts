async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
  const adminKey = process.env.ADMIN_API_KEY ?? 'dev-admin-key';
  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { 'x-admin-key': adminKey, 'Content-Type': 'application/json', ...options?.headers },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

export interface SummaryIssueRef {
  id: string;
  workspaceId: string;
  jiraIssueKey: string;
  issueType: string | null;
}

export interface AdminSummary {
  id: string;
  issueId: string;
  version: number;
  status: string;
  content: unknown;
  triggerReason: string;
  inputHash: string;
  generatedAt: string;
  summaryRunId: string | null;
  issue: SummaryIssueRef;
}

export interface DeadLetterItem {
  id: string;
  messageId: string | null;
  queue: string;
  error: string;
  retryCount: number;
  failedAt: string;
  retriedAt: string | null;
}

export interface DeadLetterListParams {
  queue?: string;
  limit?: number;
  offset?: number;
  includeRetried?: boolean;
}

export function buildDeadLetterListPath(params?: DeadLetterListParams) {
  const searchParams = new URLSearchParams();

  if (params?.queue) {
    searchParams.set('queue', params.queue);
  }

  searchParams.set('limit', String(params?.limit ?? 20));
  searchParams.set('offset', String(params?.offset ?? 0));

  if (params?.includeRetried) {
    searchParams.set('includeRetried', 'true');
  }

  return `/admin/dead-letters?${searchParams.toString()}`;
}

export const api = {
  getWorkspaces: () => apiFetch<{ workspaces: any[] }>('/admin/workspaces'),
  getSummaries: (workspaceId: string, params?: { limit?: number; offset?: number }) =>
    apiFetch<{ summaries: AdminSummary[] }>(
      `/admin/workspaces/${workspaceId}/summaries?limit=${params?.limit ?? 20}&offset=${params?.offset ?? 0}`
    ),
  getSummary: (id: string) => apiFetch<{ summary: AdminSummary | null }>(`/admin/summaries/${id}`),
  rerunSummary: (id: string) =>
    apiFetch<{ ok: boolean }>(`/admin/summaries/${id}/rerun`, { method: 'POST' }),
  getDeadLetters: (params?: DeadLetterListParams) =>
    apiFetch<{ items: DeadLetterItem[] }>(buildDeadLetterListPath(params)),
  retryDeadLetter: (id: string) =>
    apiFetch<{ ok: boolean }>(`/admin/dead-letters/${id}/retry`, { method: 'POST' }),
  getAuditLog: (workspaceId: string, params?: { limit?: number; offset?: number; action?: string }) =>
    apiFetch<{ logs: any[] }>(
      `/admin/workspaces/${workspaceId}/audit-log?limit=${params?.limit ?? 50}&offset=${params?.offset ?? 0}&action=${params?.action ?? ''}`
    ),
  getAnalytics: (params?: { since?: number; workspaceId?: string }) =>
    apiFetch<{ since: string; sinceDays: number; workspaceId: string | null; counts: Array<{ event: string; count: number }> }>(
      `/admin/analytics?since=${params?.since ?? 30}&workspaceId=${params?.workspaceId ?? ''}`
    ),
};
