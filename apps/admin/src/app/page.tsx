import { api } from '@/lib/api';
import Link from 'next/link';

export default async function DashboardPage() {
  let workspaceCount = 0;
  try {
    const { workspaces } = await api.getWorkspaces();
    workspaceCount = workspaces.length;
  } catch {
    // API may not be reachable in dev
  }

  return (
    <div>
      {/* Hero */}
      <div className="card" style={{ marginBottom: '32px', padding: '36px 40px' }}>
        <h1
          style={{
            fontSize: '28px',
            fontWeight: 700,
            fontFamily: 'var(--remi-serif)',
            color: 'var(--remi-navy)',
            marginBottom: '10px',
            letterSpacing: '-0.01em',
          }}
        >
          Remi Admin
        </h1>
        <p
          style={{
            color: 'var(--remi-muted)',
            fontSize: '14px',
            maxWidth: '480px',
            lineHeight: 1.6,
            marginBottom: '28px',
          }}
        >
          Operational tools for managing Remi workspaces, integrations, and queue health.
        </p>
        <div className="stat-card" style={{ display: 'inline-block', minWidth: '120px' }}>
          <div className="stat-number">{workspaceCount}</div>
          <div className="stat-label">Workspaces</div>
        </div>
      </div>

      {/* Guidance note */}
      <div className="info-card" style={{ marginBottom: '28px' }}>
        Select a workspace to view summaries and audit logs.{' '}
        <Link href="/workspaces">Browse Workspaces &rarr;</Link>
      </div>

      {/* Quick links */}
      <h2 className="section-heading">Quick Links</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: '16px',
        }}
      >
        <QuickLink href="/workspaces" title="Workspaces" desc="Browse and manage all workspaces" />
        <QuickLink href="/errors" title="Errors" desc="Inspect and retry failed queue messages" />
        <QuickLink href="/analytics" title="Analytics" desc="Feature usage and workspace metrics" />
      </div>
    </div>
  );
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        className="card"
        style={{ cursor: 'pointer', height: '100%', transition: 'box-shadow 0.15s, border-color 0.15s' }}
      >
        <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '6px', color: 'var(--remi-ink)' }}>
          {title}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--remi-muted)' }}>{desc}</div>
      </div>
    </Link>
  );
}
