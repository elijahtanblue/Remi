import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getIssueDetail, getIssueTimeline, getIssueEvidence, isApiStatus } from '@/lib/api-client';
import Timeline from '@/components/timeline';
import EvidencePanel from '@/components/evidence-panel';
import ActionPanel from '@/components/action-panel';
import type { CWRDetail, WaitingOnType } from '@remi/shared';

interface Props { params: Promise<{ id: string }> }

const WAITING_ON_LABELS: Record<WaitingOnType, string> = {
  internal_person:   'Internal person',
  internal_team:     'Internal team',
  external_vendor:   'External vendor',
  external_customer: 'External customer',
  approval:          'Approval',
};

function riskStyle(score: number): React.CSSProperties {
  if (score >= 0.8) return { color: 'var(--remi-red)', fontWeight: 600 };
  if (score >= 0.5) return { color: 'var(--remi-orange)', fontWeight: 600 };
  return { color: 'var(--remi-green)', fontWeight: 600 };
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function CWRCard({ cwr }: { cwr: CWRDetail }) {
  return (
    <div className="card" style={styles.cwrCard}>
      <h2 style={styles.sectionTitle}>Current state</h2>
      <p style={styles.currentState}>{cwr.currentState}</p>

      <div style={styles.fieldGrid}>
        {cwr.ownerDisplayName && (
          <Field label="Owner">{cwr.ownerDisplayName}</Field>
        )}
        {cwr.waitingOnType && (
          <Field label="Waiting on">
            {WAITING_ON_LABELS[cwr.waitingOnType]}
            {cwr.waitingOnDescription && ` — ${cwr.waitingOnDescription}`}
          </Field>
        )}
        {cwr.nextStep && (
          <Field label="Next step">{cwr.nextStep}</Field>
        )}
        {cwr.blockerSummary && (
          <Field label="Blocker">
            <span style={{ color: 'var(--remi-red)' }}>{cwr.blockerSummary}</span>
          </Field>
        )}
        <Field label="Risk score">
          <span style={riskStyle(cwr.riskScore)}>{Math.round(cwr.riskScore * 100)}%</span>
          {cwr.urgencyReason && (
            <span style={{ color: 'var(--remi-muted)', marginLeft: 8, fontSize: 12 }}>
              {cwr.urgencyReason}
            </span>
          )}
        </Field>
        <Field label="Confidence">{Math.round(cwr.confidence * 100)}%</Field>
        {cwr.isStale && cwr.staleSince && (
          <Field label="Stale since">
            <span style={{ color: 'var(--remi-orange)' }}>
              {relativeTime(cwr.staleSince)}
            </span>
          </Field>
        )}
        <Field label="Sources">{cwr.dataSources.join(', ')}</Field>
        <Field label="Last updated">{relativeTime(cwr.updatedAt)}</Field>
      </div>

      {cwr.openQuestions.length > 0 && (
        <div style={styles.openQs}>
          <h3 style={styles.subTitle}>Open questions</h3>
          <ul style={styles.qList}>
            {cwr.openQuestions.map((q, i) => (
              <li key={q.id ?? i} style={styles.qItem}>
                <p style={styles.qContent}>{q.content}</p>
                {q.ownerName && (
                  <span style={styles.qMeta}>Asked by {q.ownerName}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <dt style={styles.fieldLabel}>{label}</dt>
      <dd style={styles.fieldValue}>{children}</dd>
    </div>
  );
}

export default async function IssueDetailPage({ params }: Props) {
  const { id } = await params;
  const hdrs = await headers();
  const userId      = hdrs.get('x-user-id')      ?? '';
  const workspaceId = hdrs.get('x-workspace-id') ?? '';

  const issue = await getIssueDetail(userId, workspaceId, id).catch((err) => {
    if (isApiStatus(err, 404)) return null;
    throw err;
  });
  if (!issue) notFound();

  const [{ events }, { items: evidence }] = await Promise.all([
    getIssueTimeline(userId, workspaceId, id).catch((err) => {
      if (isApiStatus(err, 404)) return { events: [], nextCursor: null };
      throw err;
    }),
    getIssueEvidence(userId, workspaceId, id).catch((err) => {
      if (isApiStatus(err, 404)) return { items: [] };
      throw err;
    }),
  ]);

  return (
    <div>
      {/* Breadcrumb */}
      <div style={styles.breadcrumb}>
        <Link href="/queue" style={styles.back}>← Queue</Link>
        <span style={styles.breadSep}>/</span>
        <a
          href={issue.jiraIssueUrl}
          target="_blank"
          rel="noreferrer"
          style={styles.jiraLink}
        >
          {issue.jiraIssueKey}
        </a>
      </div>

      {/* Title + meta */}
      <div style={styles.issueHeader}>
        <h1 style={styles.issueTitle}>{issue.title}</h1>
        <div style={styles.issueMeta}>
          {issue.status && <span className="badge badge-muted">{issue.status}</span>}
          {issue.priority && <span className="badge badge-orange">{issue.priority}</span>}
          {issue.issueType && <span className="badge badge-muted">{issue.issueType}</span>}
          {issue.scopeName && <span className="badge badge-blue">{issue.scopeName}</span>}
        </div>
      </div>

      {/* Two-column layout */}
      <div style={styles.cols}>
        {/* Left: CWR + evidence */}
        <div style={styles.leftCol}>
          {issue.cwr ? (
            <CWRCard cwr={issue.cwr} />
          ) : (
            <div className="card" style={{ padding: 20, color: 'var(--remi-muted)' }}>
              No analysis available yet.
            </div>
          )}

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Observations</h2>
            <EvidencePanel items={evidence} />
          </div>
        </div>

        {/* Right: actions + timeline */}
        <div style={styles.rightCol}>
          <ActionPanel
            issueId={issue.id}
            hasCwr={!!issue.cwr}
            hasOwner={!!issue.cwr?.ownerDisplayName}
            hasBlocker={!!issue.cwr?.blockerSummary}
          />
          <div className="card" style={styles.timelineCard}>
            <h2 style={styles.sectionTitle}>Timeline</h2>
            <Timeline events={events} />
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  breadcrumb: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 },
  back: { fontSize: 13, color: 'var(--remi-blue)' },
  breadSep: { color: 'var(--remi-border)' },
  jiraLink: { fontSize: 13, color: 'var(--remi-muted)', fontWeight: 600 },
  issueHeader: { marginBottom: 24 },
  issueTitle: { fontSize: 20, fontWeight: 700, color: 'var(--remi-ink)', lineHeight: 1.35, marginBottom: 10 },
  issueMeta: { display: 'flex', gap: 6, flexWrap: 'wrap' as const },
  cols: { display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' },
  leftCol: { display: 'flex', flexDirection: 'column', gap: 16 },
  rightCol: { display: 'flex', flexDirection: 'column', gap: 16 },
  cwrCard: { padding: 20 },
  currentState: { fontSize: 14, color: 'var(--remi-ink)', lineHeight: 1.6, marginBottom: 16 },
  fieldGrid: { display: 'flex', flexDirection: 'column', gap: 0, borderTop: '1px solid var(--remi-border)' },
  field: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: 12,
    padding: '8px 0',
    borderBottom: '1px solid var(--remi-border)',
    alignItems: 'start',
  },
  fieldLabel: { fontSize: 12, color: 'var(--remi-muted)', fontWeight: 600, paddingTop: 1 },
  fieldValue: { fontSize: 13, color: 'var(--remi-ink)', lineHeight: 1.5 },
  openQs: { marginTop: 16 },
  subTitle: { fontSize: 12, fontWeight: 600, color: 'var(--remi-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 10 },
  qList: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 },
  qItem: { background: '#FFFBEB', borderRadius: 6, padding: '8px 12px', border: '1px solid #FDE68A' },
  qContent: { fontSize: 13, color: 'var(--remi-ink)', lineHeight: 1.5 },
  qMeta: { fontSize: 11, color: 'var(--remi-muted)', marginTop: 4, display: 'block' },
  section: {},
  sectionTitle: { fontSize: 13, fontWeight: 600, color: 'var(--remi-ink)', marginBottom: 14 },
  timelineCard: { padding: 20 },
};
