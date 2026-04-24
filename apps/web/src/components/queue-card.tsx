import Link from 'next/link';
import type { IssueQueueItem } from '@remi/shared';

function riskBadge(score: number) {
  if (score >= 0.8) return <span className="badge badge-red">High risk</span>;
  if (score >= 0.5) return <span className="badge badge-orange">Med risk</span>;
  return <span className="badge badge-muted">Low risk</span>;
}

function priorityBadge(p: string | null) {
  if (!p) return null;
  const cl =
    p === 'Critical' ? 'badge-red'
    : p === 'High'   ? 'badge-orange'
    : p === 'Medium' ? 'badge-blue'
    : 'badge-muted';
  return <span className={`badge ${cl}`}>{p}</span>;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

interface Props { item: IssueQueueItem }

export default function QueueCard({ item }: Props) {
  const { cwr } = item;

  return (
    <Link href={`/issues/${item.id}`} style={styles.link}>
      <div className="card" style={styles.card}>
        {/* Header row */}
        <div style={styles.header}>
          <div style={styles.meta}>
            <span style={styles.key}>{item.jiraIssueKey}</span>
            {item.scopeName && <span style={styles.scope}>{item.scopeName}</span>}
            {priorityBadge(item.priority)}
            {item.status && <span className="badge badge-muted">{item.status}</span>}
          </div>
          <div style={styles.headerRight}>
            {item.pendingProposalCount > 0 && (
              <span className="badge badge-blue">{item.pendingProposalCount} pending</span>
            )}
            {cwr && riskBadge(cwr.riskScore)}
          </div>
        </div>

        {/* Title */}
        <p style={styles.title}>{item.title}</p>

        {/* CWR summary */}
        {cwr && (
          <div style={styles.cwrBlock}>
            <p style={styles.state}>{cwr.currentState}</p>

            <div style={styles.row}>
              {cwr.ownerDisplayName && (
                <span style={styles.pill}>
                  <span style={styles.pillLabel}>Owner</span> {cwr.ownerDisplayName}
                </span>
              )}
              {cwr.waitingOnDescription && (
                <span style={styles.pill}>
                  <span style={styles.pillLabel}>Waiting on</span> {cwr.waitingOnDescription}
                </span>
              )}
              {cwr.nextStep && (
                <span style={styles.pill}>
                  <span style={styles.pillLabel}>Next</span> {cwr.nextStep}
                </span>
              )}
            </div>

            {cwr.urgencyReason && (
              <p style={styles.urgency}>{cwr.urgencyReason}</p>
            )}

            <div style={styles.footer}>
              <span style={styles.sources}>{cwr.dataSources.join(' · ')}</span>
              {cwr.lastMeaningfulChangeAt && (
                <span style={styles.ts}>{relativeTime(cwr.lastMeaningfulChangeAt)}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

const styles: Record<string, React.CSSProperties> = {
  link: { display: 'block', textDecoration: 'none', color: 'inherit' },
  card: { cursor: 'pointer', transition: 'box-shadow 0.15s' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerRight: { display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 },
  meta: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  key: { fontSize: 11, fontWeight: 600, color: 'var(--remi-muted)', letterSpacing: '0.3px' },
  scope: { fontSize: 11, color: 'var(--remi-muted)' },
  title: { fontSize: 14, fontWeight: 600, color: 'var(--remi-ink)', lineHeight: 1.4, marginBottom: 10 },
  cwrBlock: { borderTop: '1px solid var(--remi-border)', paddingTop: 10 },
  state: { fontSize: 13, color: 'var(--remi-ink)', lineHeight: 1.5, marginBottom: 8 },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  pill: {
    fontSize: 12,
    background: '#F3F4F6',
    borderRadius: 6,
    padding: '3px 8px',
    color: 'var(--remi-ink)',
    maxWidth: 260,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  pillLabel: { color: 'var(--remi-muted)', marginRight: 4 },
  urgency: { fontSize: 12, color: 'var(--remi-red)', marginBottom: 8 },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  sources: { fontSize: 11, color: 'var(--remi-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  ts: { fontSize: 11, color: 'var(--remi-muted)' },
};
