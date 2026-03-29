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

export const api = {
  getWorkspaces: () => apiFetch<{ workspaces: any[] }>('/admin/workspaces'),
  getSummaries: (workspaceId: string, params?: { limit?: number; offset?: number }) =>
    apiFetch<{ summaries: any[] }>(
      `/admin/workspaces/${workspaceId}/summaries?limit=${params?.limit ?? 20}&offset=${params?.offset ?? 0}`
    ),
  getSummary: (id: string) => apiFetch<{ summary: any }>(`/admin/summaries/${id}`),
  rerunSummary: (id: string) =>
    apiFetch<{ ok: boolean }>(`/admin/summaries/${id}/rerun`, { method: 'POST' }),
  getDeadLetters: (params?: { queue?: string; limit?: number; offset?: number }) =>
    apiFetch<{ items: any[] }>(
      `/admin/dead-letters?queue=${params?.queue ?? ''}&limit=${params?.limit ?? 20}&offset=${params?.offset ?? 0}`
    ),
  retryDeadLetter: (id: string) =>
    apiFetch<{ ok: boolean }>(`/admin/dead-letters/${id}/retry`, { method: 'POST' }),
  getAuditLog: (workspaceId: string, params?: { limit?: number; offset?: number; action?: string }) =>
    apiFetch<{ logs: any[] }>(
      `/admin/workspaces/${workspaceId}/audit-log?limit=${params?.limit ?? 50}&offset=${params?.offset ?? 0}&action=${params?.action ?? ''}`
    ),
};
