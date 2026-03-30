import Link from 'next/link';

export default function AuditLogIndexPage() {
  return (
    <div>
      <div className="page-header">
        <h1>Audit Log</h1>
      </div>
      <div className="info-card">
        Audit logs are scoped to a workspace. Select a workspace to view its audit history.{' '}
        <Link href="/workspaces">Browse Workspaces &rarr;</Link>
      </div>
    </div>
  );
}
