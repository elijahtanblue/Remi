import Link from 'next/link';

export default function SummariesIndexPage() {
  return (
    <div>
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px' }}>Summaries</h1>
      <div className="card" style={{ background: '#fff8e1', borderColor: '#ffe082' }}>
        <p style={{ fontSize: '14px', color: '#5d4037', marginBottom: '8px' }}>
          Summaries are scoped to a workspace. Select a workspace to browse its summaries.
        </p>
        <Link href="/workspaces">Browse Workspaces &rarr;</Link>
      </div>
    </div>
  );
}
