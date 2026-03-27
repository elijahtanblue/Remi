import { api } from '@/lib/api';
import Link from 'next/link';
import { RerunButton } from './RerunButton';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function WorkspaceDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab = 'summaries' } = await searchParams;

  let summaries: any[] = [];
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

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '8px 18px',
    border: 'none',
    borderBottom: t === tab ? '2px solid #0066cc' : '2px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontWeight: t === tab ? 600 : 400,
    color: t === tab ? '#0066cc' : '#495057',
    fontSize: '14px',
  });

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '6px' }}>
          <Link href="/workspaces">Workspaces</Link> /
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: 700 }}>{workspaceName}</h1>
        <code style={{ fontSize: '12px', color: '#6c757d' }}>{id}</code>
      </div>

      {error && (
        <div
          className="badge-red"
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div
        style={{
          borderBottom: '1px solid #dee2e6',
          marginBottom: '20px',
          display: 'flex',
          gap: '4px',
        }}
      >
        <Link href={`/workspaces/${id}?tab=summaries`} style={{ textDecoration: 'none' }}>
          <button style={tabStyle('summaries')}>
            Summaries{' '}
            <span
              style={{
                fontSize: '12px',
                background: '#e9ecef',
                borderRadius: '10px',
                padding: '1px 7px',
                marginLeft: '4px',
              }}
            >
              {summaries.length}
            </span>
          </button>
        </Link>
        <Link href={`/workspaces/${id}?tab=audit`} style={{ textDecoration: 'none' }}>
          <button style={tabStyle('audit')}>
            Audit Log{' '}
            <span
              style={{
                fontSize: '12px',
                background: '#e9ecef',
                borderRadius: '10px',
                padding: '1px 7px',
                marginLeft: '4px',
              }}
            >
              {logs.length}
            </span>
          </button>
        </Link>
      </div>

      {/* Summaries tab */}
      {tab === 'summaries' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Issue ID</th>
                <th>Trigger Reason</th>
                <th>Version</th>
                <th>Generated At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {summaries.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{ textAlign: 'center', color: '#6c757d', padding: '24px' }}
                  >
                    No summaries found
                  </td>
                </tr>
              ) : (
                summaries.map((s) => {
                  return (
                    <tr key={s.id}>
                      <td>
                        <code style={{ fontSize: '13px' }}>{s.issueId ?? '—'}</code>
                      </td>
                      <td>
                        <span className="badge badge-yellow">
                          {s.triggerReason ?? '—'}
                        </span>
                      </td>
                      <td style={{ fontSize: '13px', color: '#6c757d' }}>{s.version ?? '—'}</td>
                      <td style={{ color: '#6c757d', fontSize: '13px' }}>
                        {s.generatedAt ? new Date(s.generatedAt).toLocaleString() : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <RerunButton summaryId={s.id} />
                          <Link href={`/summaries/${s.id}`} style={{ fontSize: '13px' }}>
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Audit Log tab */}
      {tab === 'audit' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Actor Type</th>
                <th>Actor ID</th>
                <th>Target</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: 'center', color: '#6c757d', padding: '24px' }}
                  >
                    No audit log entries found
                  </td>
                </tr>
              ) : (
                logs.map((log, i) => (
                  <tr key={log.id ?? i}>
                    <td>
                      <code style={{ fontSize: '13px' }}>{log.action ?? '—'}</code>
                    </td>
                    <td style={{ fontSize: '13px' }}>{log.actorType ?? '—'}</td>
                    <td>
                      <code style={{ fontSize: '12px', color: '#6c757d' }}>
                        {log.actorId ?? '—'}
                      </code>
                    </td>
                    <td style={{ fontSize: '13px' }}>{log.target ?? log.targetId ?? '—'}</td>
                    <td style={{ color: '#6c757d', fontSize: '13px' }}>
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}
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
