import Link from 'next/link';

export default function AuditLogIndexPage() {
  return (
    <div>
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px' }}>Audit Log</h1>
      <div className="card" style={{ background: '#fff8e1', borderColor: '#ffe082' }}>
        <p style={{ fontSize: '14px', color: '#5d4037', marginBottom: '8px' }}>
          Audit logs are scoped to a workspace. Select a workspace to view its audit history.
        </p>
        <Link href="/workspaces">Browse Workspaces &rarr;</Link>
      </div>
    </div>
  );
}
