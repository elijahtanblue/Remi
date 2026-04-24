'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ProposalItem } from '@remi/shared';

interface Props {
  proposal: ProposalItem;
  userId: string;
  workspaceId: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function ApprovalRow({ proposal, userId, workspaceId }: Props) {
  const [status, setStatus]   = useState<ProposalItem['status']>(proposal.status);
  const [editing, setEditing] = useState(false);
  const [body, setBody]       = useState(proposal.payload.commentBody);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function post(path: string, bodyData?: unknown) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyData ? JSON.stringify(bodyData) : undefined,
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return res.json();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    try {
      await post(`/api/proposals/${proposal.id}/approve`);
      setStatus('approved');
    } catch { /* error set in post() */ }
  }

  async function handleReject() {
    try {
      await post(`/api/proposals/${proposal.id}/reject`);
      setStatus('rejected');
    } catch { /* error set in post() */ }
  }

  async function handleSaveEdit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentBody: body }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const resolved = status === 'approved' || status === 'applied' || status === 'rejected' || status === 'failed';

  return (
    <div className="card" style={{ ...styles.row, ...(resolved ? styles.resolved : {}) }}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <Link href={`/issues/${proposal.issueId}`} style={styles.issueKey}>
            {proposal.issueKey}
          </Link>
          <span style={styles.issueTitle}>{proposal.issueTitle}</span>
        </div>
        <div style={styles.headerRight}>
          <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
          <span style={styles.ts}>{relativeTime(proposal.createdAt)}</span>
          <span style={styles.conf}>{Math.round(proposal.confidence * 100)}% conf</span>
        </div>
      </div>

      {/* Draft comment body */}
      <div style={styles.draftBlock}>
        <p style={styles.draftLabel}>Draft Jira comment</p>
        {editing ? (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={styles.textarea}
            rows={5}
            disabled={loading}
          />
        ) : (
          <p style={styles.draftBody}>{body}</p>
        )}
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {/* Actions */}
      {!resolved && (
        <div style={styles.actions}>
          {editing ? (
            <>
              <button
                className="btn btn-primary"
                onClick={handleSaveEdit}
                disabled={loading}
              >
                Save
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => { setEditing(false); setBody(proposal.payload.commentBody); }}
                disabled={loading}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-approve" onClick={handleApprove} disabled={loading}>
                Approve
              </button>
              <button className="btn btn-ghost" onClick={() => setEditing(true)} disabled={loading}>
                Edit
              </button>
              <button className="btn btn-danger" onClick={handleReject} disabled={loading}>
                Reject
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<ProposalItem['status'], string> = {
  pending_approval: 'Pending',
  approved:         'Approved',
  applied:          'Applied',
  rejected:         'Rejected',
  failed:           'Failed',
};

const STATUS_BADGE: Record<ProposalItem['status'], string> = {
  pending_approval: 'badge-orange',
  approved:         'badge-green',
  applied:          'badge-green',
  rejected:         'badge-muted',
  failed:           'badge-red',
};

const styles: Record<string, React.CSSProperties> = {
  row: { padding: 16 },
  resolved: { opacity: 0.6 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
  headerLeft: { display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' as const, flex: 1, minWidth: 0 },
  headerRight: { display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 },
  issueKey: { fontSize: 12, fontWeight: 700, color: 'var(--remi-muted)', letterSpacing: '0.3px', textDecoration: 'none' },
  issueTitle: { fontSize: 13, fontWeight: 500, color: 'var(--remi-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  ts: { fontSize: 11, color: 'var(--remi-muted)' },
  conf: { fontSize: 11, color: 'var(--remi-muted)' },
  draftBlock: { background: '#F9FAFB', borderRadius: 6, padding: '12px 14px', marginBottom: 12 },
  draftLabel: { fontSize: 11, fontWeight: 600, color: 'var(--remi-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.4px', marginBottom: 8 },
  draftBody: { fontSize: 13, color: 'var(--remi-ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const },
  textarea: {
    width: '100%',
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--remi-ink)',
    border: '1px solid var(--remi-border)',
    borderRadius: 6,
    padding: '8px 10px',
    fontFamily: 'inherit',
    resize: 'vertical' as const,
  },
  actions: { display: 'flex', gap: 8 },
  error: { fontSize: 12, color: 'var(--remi-red)', marginBottom: 8 },
};
