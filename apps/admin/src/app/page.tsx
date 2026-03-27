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
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>
        Remi Admin Dashboard
      </h1>
      <p style={{ color: '#6c757d', marginBottom: '28px', fontSize: '14px' }}>
        Operational tools for managing Remi workspaces, summaries, and queue health.
      </p>

      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '36px', fontWeight: 700, color: '#0066cc' }}>
            {workspaceCount}
          </div>
          <div style={{ fontSize: '13px', color: '#6c757d', marginTop: '4px' }}>Workspaces</div>
        </div>
      </div>

      {/* Activity note */}
      <div
        className="card"
        style={{ marginBottom: '24px', background: '#fff8e1', borderColor: '#ffe082' }}
      >
        <p style={{ fontSize: '14px', color: '#5d4037' }}>
          Select a workspace to view summaries and audit logs.
        </p>
      </div>

      {/* Quick links */}
      <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Quick Links</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '16px',
        }}
      >
        <QuickLink href="/workspaces" title="Workspaces" desc="Browse and manage all workspaces" />
        <QuickLink href="/summaries" title="Summaries" desc="View and re-run issue summaries" />
        <QuickLink href="/dead-letters" title="Dead Letters" desc="Inspect and retry failed queue messages" />
        <QuickLink href="/audit-log" title="Audit Log" desc="Review system-wide audit events" />
      </div>
    </div>
  );
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        className="card"
        style={{ cursor: 'pointer', transition: 'box-shadow 0.15s', height: '100%' }}
      >
        <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '6px', color: '#212529' }}>
          {title}
        </div>
        <div style={{ fontSize: '13px', color: '#6c757d' }}>{desc}</div>
      </div>
    </Link>
  );
}
