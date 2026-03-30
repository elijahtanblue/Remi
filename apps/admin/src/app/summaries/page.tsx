import Link from 'next/link';

export default function SummariesIndexPage() {
  return (
    <div>
      <div className="page-header">
        <h1>Summaries</h1>
      </div>
      <div className="info-card">
        Summaries are scoped to a workspace. Select a workspace to browse its summaries.{' '}
        <Link href="/workspaces">Browse Workspaces &rarr;</Link>
      </div>
    </div>
  );
}
