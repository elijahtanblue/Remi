import { api, type AdminSummary } from '@/lib/api';
import Link from 'next/link';
import { RerunButton } from './RerunButton';
import { MemoryPanel } from './MemoryPanel';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function WorkspaceDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab = 'summaries' } = await searchParams;

  let summaries: AdminSummary[] = [];
  let logs: any[] = [];
  let workspaceName = id;
  let error: string | null = null;

  try {
    const [summariesData, auditData, workspacesData] = await Promise.allSettled([
      api.getSummaries(id),
      api.getAuditLog(id),
      api.getWorkspaces(),
    ]);

    if (summariesData.status === 'fulfilled') summaries = summariesData.value.summaries;
    if (auditData.status === 'fulfilled') logs = auditData.value.logs;
    if (workspacesData.status === 'fulfilled') {
      const ws = workspacesData.value.workspaces.find((w: any) => w.id === id);
      if (ws) workspaceName = ws.name ?? id;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load workspace data';
  }

  return (
    <div>
      <div className="breadcrumb">
        <Link href="/workspaces">Workspaces</Link> /
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700 }}>{workspaceName}</h1>
        <code style={{ fontSize: '12px' }}>{id}</code>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <MemoryPanel workspaceId={id} />

      <div className="tab-strip">
        <Link href={`/workspaces/${id}?tab=summaries`} className={`tab-btn${tab === 'summaries' ? ' active' : ''}`}>
          Summaries <span className="tab-count">{summaries.length}</span>
        </Link>
        <Link href={`/workspaces/${id}?tab=audit`} className={`tab-btn${tab === 'audit' ? ' active' : ''}`}>
          Audit Log <span className="tab-count">{logs.length}</span>
        </Link>
      </div>

      {tab === 'summaries' && (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Issue</th>
                <th>Type</th>
                <th>Trigger Reason</th>
                <th>Version</th>
                <th>Generated At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {summaries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-cell">No summaries found</td>
                </tr>
              ) : (
                summaries.map((summary) => (
                  <tr key={summary.id}>
                    <td>
                      <code style={{ fontSize: '13px' }}>{summary.issue.jiraIssueKey ?? '-'}</code>
                    </td>
                    <td>
                      {summary.issue.issueType ? (
                        <span className="badge badge-yellow">{summary.issue.issueType}</span>
                      ) : (
                        <span style={{ color: 'var(--remi-muted)', fontSize: '13px' }}>-</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-yellow">{summary.triggerReason ?? '-'}</span>
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--remi-muted)' }}>{summary.version ?? '-'}</td>
                    <td style={{ color: 'var(--remi-muted)', fontSize: '13px' }}>
                      {summary.generatedAt ? new Date(summary.generatedAt).toLocaleString() : '-'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <RerunButton summaryId={summary.id} />
                        <Link href={`/summaries/${summary.id}`} style={{ fontSize: '13px' }}>View</Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'audit' && (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Actor Type</th>
                <th>Actor</th>
                <th>Target</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-cell">No audit log entries found</td>
                </tr>
              ) : (
                logs.map((log, i) => (
                  <tr key={log.id ?? i}>
                    <td>
                      <code style={{ fontSize: '13px' }}>{log.action ?? '-'}</code>
                    </td>
                    <td style={{ fontSize: '13px' }}>{log.actorType ?? '-'}</td>
                    <td style={{ fontSize: '13px' }}>
                      {log.actorDisplay ?? (
                        <code style={{ fontSize: '12px', color: 'var(--remi-muted)' }}>{log.actorId ?? '-'}</code>
                      )}
                    </td>
                    <td style={{ fontSize: '13px' }}>{log.target ?? log.targetId ?? '-'}</td>
                    <td style={{ color: 'var(--remi-muted)', fontSize: '13px' }}>
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
