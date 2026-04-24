import { headers } from 'next/headers';
import { getProposals } from '@/lib/api-client';
import ApprovalRow from './approval-row';

export default async function ApprovalsPage() {
  const hdrs = await headers();
  const userId      = hdrs.get('x-user-id')      ?? '';
  const workspaceId = hdrs.get('x-workspace-id') ?? '';

  const { items, total } = await getProposals(userId, workspaceId, { status: 'pending_approval' });

  return (
    <div>
      <div style={styles.pageHeader}>
        <h1 style={styles.heading}>Approval Inbox</h1>
        <span style={styles.count}>{total} pending</span>
      </div>

      {items.length === 0 ? (
        <div style={styles.empty}>
          <p>No pending approvals.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {items.map((proposal) => (
            <ApprovalRow
              key={proposal.id}
              proposal={proposal}
              userId={userId}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageHeader: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 },
  heading: { fontSize: 22, fontWeight: 700, color: 'var(--remi-ink)' },
  count: { fontSize: 13, color: 'var(--remi-muted)' },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  empty: { textAlign: 'center', padding: '60px 0', color: 'var(--remi-muted)', fontSize: 14 },
};
