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
    <div style={{ maxWidth: '900px', margin: '40px auto', padding: '0 28px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#e6edf3', margin: 0 }}>
          Product Analytics
        </h1>
        <p style={{ color: '#8b949e', fontSize: '13px', marginTop: '6px' }}>
          Feature usage across all workspaces — Postgres-backed, no third-party tracking.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', flexWrap: 'wrap' }}>
        {SINCE_OPTIONS.map((opt) => (
          <a
            key={opt.value}
            href={`/analytics?since=${opt.value}${workspaceId ? `&workspaceId=${workspaceId}` : ''}`}
            style={{
              padding: '5px 14px',
              fontSize: '12px',
              fontWeight: opt.value === sinceDays ? 600 : 400,
              color: opt.value === sinceDays ? '#ffffff' : '#8b949e',
              background: opt.value === sinceDays ? 'rgba(255,255,255,0.10)' : 'transparent',
              border: '1px solid',
              borderColor: opt.value === sinceDays ? 'rgba(255,255,255,0.15)' : '#30363d',
              borderRadius: '6px',
              textDecoration: 'none',
            }}
          >
            {opt.label}
          </a>
        ))}

        <span style={{ marginLeft: 'auto', color: '#6e7681', fontSize: '12px', alignSelf: 'center' }}>
          {total.toLocaleString()} total events
        </span>
      </div>

      {/* Event count table */}
      {data.counts.length === 0 ? (
        <div
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '8px',
            padding: '48px',
            textAlign: 'center',
            color: '#6e7681',
            fontSize: '13px',
          }}
        >
          No events recorded in this period. Events will appear here once users start using Remi.
        </div>
      ) : (
        <div
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #30363d' }}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '12px 20px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#6e7681',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Event
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '12px 20px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#6e7681',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    width: '90px',
                  }}
                >
                  Count
                </th>
                <th style={{ padding: '12px 20px', width: '40%' }} />
              </tr>
            </thead>
            <tbody>
              {data.counts.map((row, i) => {
                const pct = Math.round((row.count / maxCount) * 100);
                return (
                  <tr
                    key={row.event}
                    style={{
                      borderTop: i > 0 ? '1px solid #21262d' : undefined,
                    }}
                  >
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ fontSize: '13px', color: '#e6edf3', fontWeight: 500 }}>
                        {EVENT_LABELS[row.event] ?? row.event}
                      </span>
                      <br />
                      <span style={{ fontSize: '11px', color: '#6e7681', fontFamily: 'monospace' }}>
                        {row.event}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '14px 20px',
                        textAlign: 'right',
                        fontSize: '15px',
                        fontWeight: 600,
                        color: '#e6edf3',
                      }}
                    >
                      {row.count.toLocaleString()}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <div
                        style={{
                          height: '6px',
                          background: '#21262d',
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: '#4caf87',
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

      <p style={{ color: '#6e7681', fontSize: '11px', marginTop: '16px' }}>
        Since {new Date(data.since).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}.
        {workspaceId ? ` Filtered to workspace ${workspaceId}.` : ' All workspaces.'}
      </p>
    </div>
  );
}
