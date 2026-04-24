import type { EvidenceItem } from '@remi/shared';

const CATEGORY_LABELS: Record<EvidenceItem['category'], string> = {
  decision:      'Decision',
  action_item:   'Action item',
  blocker:       'Blocker',
  open_question: 'Open question',
  status_update: 'Status update',
  owner_update:  'Owner update',
  risk:          'Risk',
};

const CATEGORY_BADGE: Record<EvidenceItem['category'], string> = {
  decision:      'badge-blue',
  action_item:   'badge-green',
  blocker:       'badge-red',
  open_question: 'badge-orange',
  status_update: 'badge-muted',
  owner_update:  'badge-blue',
  risk:          'badge-red',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

interface Props { items: EvidenceItem[] }

export default function EvidencePanel({ items }: Props) {
  const active = items.filter((i) => i.state === 'active');

  if (active.length === 0) {
    return <p style={styles.empty}>No active observations.</p>;
  }

  return (
    <ul style={styles.list}>
      {active.map((item) => (
        <li key={item.id} className="card" style={styles.item}>
          <div style={styles.header}>
            <span className={`badge ${CATEGORY_BADGE[item.category]}`}>
              {CATEGORY_LABELS[item.category]}
            </span>
            {item.sourceApp && (
              <span style={styles.source}>{item.sourceApp}</span>
            )}
            <span style={styles.conf}>{Math.round(item.confidence * 100)}% confidence</span>
            <span style={styles.ts}>{relativeTime(item.extractedAt)}</span>
          </div>
          <p style={styles.content}>{item.content}</p>
          {item.citationUrls.length > 0 && (
            <div style={styles.citations}>
              {item.citationUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" style={styles.citation}>
                  Source
                </a>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 },
  item: { padding: 14 },
  header: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: 8 },
  source: { fontSize: 11, color: 'var(--remi-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.4px' },
  conf: { fontSize: 11, color: 'var(--remi-muted)' },
  ts: { fontSize: 11, color: 'var(--remi-muted)', marginLeft: 'auto' },
  content: { fontSize: 13, color: 'var(--remi-ink)', lineHeight: 1.6 },
  citations: { marginTop: 8, display: 'flex', gap: 8 },
  citation: { fontSize: 12, color: 'var(--remi-blue)' },
  empty: { fontSize: 13, color: 'var(--remi-muted)', padding: '16px 0' },
};
