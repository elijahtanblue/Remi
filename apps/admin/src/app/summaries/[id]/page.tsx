import { api, type AdminSummary } from '@/lib/api';
import Link from 'next/link';
import { RerunButton } from '@/app/workspaces/[id]/RerunButton';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SummaryDetailPage({ params }: Props) {
  const { id } = await params;

  let summary: AdminSummary | null = null;
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

  const workspaceSummariesHref = summary.issue.workspaceId
    ? `/workspaces/${summary.issue.workspaceId}?tab=summaries`
    : '/workspaces';

  return (
    <div>
      <div className="breadcrumb">
        <Link href={workspaceSummariesHref}>Workspace Summaries</Link> /
      </div>

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
            {summary.issue.jiraIssueKey ?? 'Summary'}
          </h1>
          <code style={{ fontSize: '12px' }}>{id}</code>
        </div>
        <RerunButton summaryId={id} />
      </div>

      <div
        className="card"
        style={{
          marginBottom: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '16px',
        }}
      >
        <MetaField label="Issue Key" value={summary.issue.jiraIssueKey ?? '-'} mono />
        <MetaField label="Issue Type" value={summary.issue.issueType ?? '-'} />
        <MetaField label="Trigger Reason" value={summary.triggerReason ?? '-'} />
        <MetaField label="Version" value={String(summary.version ?? '-')} />
        <MetaField
          label="Generated At"
          value={summary.generatedAt ? new Date(summary.generatedAt).toLocaleString() : '-'}
        />
        <MetaField label="Workspace ID" value={summary.issue.workspaceId ?? '-'} mono />
      </div>

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
