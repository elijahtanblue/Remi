import type { MeaningfulEventItem, MeaningfulEventType } from '@remi/shared';

const EVENT_LABELS: Record<MeaningfulEventType, string> = {
  blocker_created:     'Blocker created',
  blocker_removed:     'Blocker cleared',
  owner_changed:       'Owner changed',
  waiting_on_changed:  'Waiting on changed',
  next_step_changed:   'Next step changed',
  external_reply_received: 'External reply',
  status_changed:      'Status changed',
  stale_detected:      'Went stale',
  stale_resolved:      'Stale resolved',
};

const EVENT_BADGE: Record<MeaningfulEventType, string> = {
  blocker_created:     'badge-red',
  blocker_removed:     'badge-green',
  owner_changed:       'badge-blue',
  waiting_on_changed:  'badge-orange',
  next_step_changed:   'badge-blue',
  external_reply_received: 'badge-green',
  status_changed:      'badge-muted',
  stale_detected:      'badge-orange',
  stale_resolved:      'badge-green',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

interface Props { events: MeaningfulEventItem[] }

export default function Timeline({ events }: Props) {
  if (events.length === 0) {
    return <p style={styles.empty}>No events yet.</p>;
  }

  return (
    <ol style={styles.list}>
      {events.map((evt) => (
        <li key={evt.id} style={styles.item}>
          <div style={styles.dot} />
          <div style={styles.body}>
            <div style={styles.header}>
              <span className={`badge ${EVENT_BADGE[evt.eventType]}`}>
                {EVENT_LABELS[evt.eventType]}
              </span>
              {evt.actorName && <span style={styles.actor}>{evt.actorName}</span>}
              <span style={styles.ts}>{relativeTime(evt.occurredAt)}</span>
              <span style={styles.source}>{evt.source}</span>
            </div>
            <p style={styles.summary}>{evt.summary}</p>
            {evt.sourceUrl && (
              <a href={evt.sourceUrl} target="_blank" rel="noreferrer" style={styles.srcLink}>
                View source →
              </a>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: { listStyle: 'none', position: 'relative', paddingLeft: 20 },
  item: { display: 'flex', gap: 12, paddingBottom: 20, position: 'relative' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--remi-border)',
    border: '2px solid var(--remi-navy)',
    flexShrink: 0,
    marginTop: 5,
    position: 'relative',
    zIndex: 1,
  },
  body: { flex: 1, minWidth: 0 },
  header: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: 4 },
  actor: { fontSize: 12, color: 'var(--remi-ink)', fontWeight: 500 },
  ts: { fontSize: 11, color: 'var(--remi-muted)' },
  source: { fontSize: 11, color: 'var(--remi-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.4px' },
  summary: { fontSize: 13, color: 'var(--remi-ink)', lineHeight: 1.5 },
  srcLink: { fontSize: 12, color: 'var(--remi-blue)', display: 'inline-block', marginTop: 4 },
  empty: { fontSize: 13, color: 'var(--remi-muted)', padding: '16px 0' },
};
