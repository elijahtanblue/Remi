import { api } from '../../lib/api';

const EVENT_LABELS: Record<string, string> = {
  link_ticket_used: 'Ticket Linked',
  brief_requested: 'Brief Requested',
  brief_refreshed: 'Brief Refreshed',
  brief_viewed: 'Brief Viewed',
  app_home_opened: 'App Home Opened',
  summary_generated: 'Summary Generated',
};

const SINCE_OPTIONS = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ since?: string; workspaceId?: string }>;
}) {
  const resolved = await searchParams;
  const sinceDays = Number(resolved?.since) || 30;
  const workspaceId = resolved?.workspaceId;

  const data = await api.getAnalytics({ since: sinceDays, workspaceId });
  const total = data.counts.reduce((s, r) => s + r.count, 0);
  const maxCount = data.counts[0]?.count ?? 1;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1>Product Analytics</h1>
        <p>Feature usage across all workspaces — Postgres-backed, no third-party tracking.</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', flexWrap: 'wrap', alignItems: 'center' }}>
        {SINCE_OPTIONS.map((opt) => (
          <a
            key={opt.value}
            href={`/analytics?since=${opt.value}${workspaceId ? `&workspaceId=${workspaceId}` : ''}`}
            style={{
              padding: '5px 14px',
              fontSize: '12px',
              fontWeight: opt.value === sinceDays ? 600 : 400,
              color: opt.value === sinceDays ? '#fff' : 'var(--remi-muted)',
              background: opt.value === sinceDays ? 'var(--remi-navy)' : 'transparent',
              border: '1px solid',
              borderColor: opt.value === sinceDays ? 'var(--remi-navy)' : 'var(--remi-border)',
              borderRadius: '6px',
              textDecoration: 'none',
            }}
          >
            {opt.label}
          </a>
        ))}
        <span style={{ marginLeft: 'auto', color: 'var(--remi-muted)', fontSize: '12px', alignSelf: 'center' }}>
          {total.toLocaleString()} total events
        </span>
      </div>

      {/* Event count table */}
      {data.counts.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: 'center', color: 'var(--remi-muted)', padding: '48px', fontSize: '14px' }}
        >
          No events recorded in this period. Events will appear here once users start using Remi.
        </div>
      ) : (
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th style={{ textAlign: 'right', width: '90px' }}>Count</th>
                <th style={{ width: '40%' }} />
              </tr>
            </thead>
            <tbody>
              {data.counts.map((row) => {
                const pct = Math.round((row.count / maxCount) * 100);
                return (
                  <tr key={row.event}>
                    <td>
                      <span style={{ fontSize: '13px', color: 'var(--remi-ink)', fontWeight: 500 }}>
                        {EVENT_LABELS[row.event] ?? row.event}
                      </span>
                      <br />
                      <span style={{ fontSize: '11px', color: 'var(--remi-muted)', fontFamily: 'monospace' }}>
                        {row.event}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '15px', fontWeight: 600, color: 'var(--remi-ink)' }}>
                      {row.count.toLocaleString()}
                    </td>
                    <td>
                      <div
                        style={{
                          height: '6px',
                          background: 'var(--remi-border)',
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: 'var(--remi-navy)',
                            borderRadius: '3px',
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ color: 'var(--remi-muted)', fontSize: '11px', marginTop: '16px' }}>
        Since {new Date(data.since).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}.
        {workspaceId ? ` Filtered to workspace ${workspaceId}.` : ' All workspaces.'}
      </p>
    </div>
  );
}
