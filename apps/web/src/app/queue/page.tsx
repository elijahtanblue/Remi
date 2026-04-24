import { headers } from 'next/headers';
import Link from 'next/link';
import { getIssueQueue } from '@/lib/api-client';
import QueueCard from '@/components/queue-card';
import type { QueueSection } from '@remi/shared';

interface Props {
  searchParams: Promise<{ section?: string; scopeId?: string }>;
}

const SECTIONS: { key: QueueSection | 'all'; label: string }[] = [
  { key: 'all',              label: 'All' },
  { key: 'needs_action',     label: 'Needs action' },
  { key: 'awaiting_approval', label: 'Awaiting approval' },
  { key: 'recently_changed', label: 'Recently changed' },
];

export default async function QueuePage({ searchParams }: Props) {
  const { section: requestedSection, scopeId } = await searchParams;
  const hdrs = await headers();
  const userId      = hdrs.get('x-user-id')      ?? '';
  const workspaceId = hdrs.get('x-workspace-id') ?? '';

  const rawSection = requestedSection ?? 'all';
  const section    = SECTIONS.find((s) => s.key === rawSection)?.key ?? 'all';

  const { items, total } = await getIssueQueue(userId, workspaceId, { section, scopeId });

  return (
    <div>
      {/* Page header */}
      <div style={styles.pageHeader}>
        <h1 style={styles.heading}>Work Queue</h1>
        <span style={styles.count}>{total} issue{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Section tabs */}
      <div style={styles.tabs}>
        {SECTIONS.map(({ key, label }) => (
          <Link
            key={key}
            href={`/queue?section=${key}${scopeId ? `&scopeId=${scopeId}` : ''}`}
            style={{
              ...styles.tab,
              ...(section === key ? styles.tabActive : {}),
            }}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Issue list */}
      {items.length === 0 ? (
        <div style={styles.empty}>
          <p>No issues in this section.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {items.map((item) => (
            <QueueCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageHeader: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 },
  heading: { fontSize: 22, fontWeight: 700, color: 'var(--remi-ink)' },
  count: { fontSize: 13, color: 'var(--remi-muted)' },
  tabs: {
    display: 'flex',
    gap: 4,
    marginBottom: 20,
    borderBottom: '1px solid var(--remi-border)',
    paddingBottom: 1,
  },
  tab: {
    fontSize: 13,
    fontWeight: 500,
    padding: '6px 14px',
    borderRadius: '6px 6px 0 0',
    color: 'var(--remi-muted)',
    textDecoration: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
    display: 'inline-block',
  },
  tabActive: {
    color: 'var(--remi-navy)',
    borderBottomColor: 'var(--remi-navy)',
    background: 'var(--remi-blue-faint)',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  empty: {
    textAlign: 'center',
    padding: '60px 0',
    color: 'var(--remi-muted)',
    fontSize: 14,
  },
};
