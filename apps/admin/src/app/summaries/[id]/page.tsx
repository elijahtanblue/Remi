import { api } from '@/lib/api';
import Link from 'next/link';
import { RerunButton } from '@/app/workspaces/[id]/RerunButton';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SummaryDetailPage({ params }: Props) {
  const { id } = await params;

  let summary: any = null;
  let error: string | null = null;

  try {
    const data = await api.getSummary(id);
    summary = data.summary;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load summary';
  }

  if (error) {
    return (
      <div>
        <div className="page-header"><h1>Summary</h1></div>
        <div className="error-banner">{error}</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div>
        <div className="page-header"><h1>Summary</h1></div>
        <p style={{ color: 'var(--remi-muted)' }}>Summary not found.</p>
      </div>
    );
  }

  const workspaceSummariesHref = summary.workspaceId
    ? `/workspaces/${summary.workspaceId}?tab=summaries`
    : '/workspaces';

  return (
    <div>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link href={workspaceSummariesHref}>Workspace Summaries</Link> /
      </div>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>
            {summary.issueId ?? 'Summary'}
          </h1>
          <code style={{ fontSize: '12px' }}>{id}</code>
        </div>
        <RerunButton summaryId={id} />
      </div>

      {/* Meta card */}
      <div
        className="card"
        style={{
          marginBottom: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '16px',
        }}
      >
        <MetaField label="Issue Key" value={summary.issueId ?? '—'} mono />
        <MetaField label="Trigger Reason" value={summary.triggerReason ?? '—'} />
        <MetaField label="Version" value={summary.version ?? '—'} />
        <MetaField
          label="Generated At"
          value={summary.generatedAt ? new Date(summary.generatedAt).toLocaleString() : '—'}
        />
        <MetaField label="Workspace ID" value={summary.workspaceId ?? '—'} mono />
      </div>

      {/* Raw content */}
      <div className="table-shell">
        <div className="card-section-header">Raw Content</div>
        <pre style={{ margin: 0, borderRadius: 0, border: 'none' }}>
          {JSON.stringify(summary.content, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function MetaField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="meta-label">{label}</div>
      {mono ? (
        <code style={{ fontSize: '13px' }}>{value}</code>
      ) : (
        <div style={{ fontSize: '14px' }}>{value}</div>
      )}
    </div>
  );
}
