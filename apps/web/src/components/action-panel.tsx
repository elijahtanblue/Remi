'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TriggerActionRequest } from '@remi/shared';

type ActionType = TriggerActionRequest['type'];

interface ActionDef {
  type: ActionType;
  label: string;
  primary?: boolean;
  needsBlocker?: boolean;
  needsOwner?: boolean;
}

const ACTIONS: ActionDef[] = [
  { type: 'draft_update',          label: 'Draft Jira update',   primary: true },
  { type: 'chase_owner',           label: 'Chase owner',         needsOwner: true },
  { type: 'prepare_escalation',    label: 'Escalation pack' },
  { type: 'mark_owner_confirmed',  label: 'Confirm owner',       needsOwner: true },
  { type: 'mark_blocker_cleared',  label: 'Clear blocker',       needsBlocker: true },
];

interface Props {
  issueId: string;
  hasCwr: boolean;
  hasOwner: boolean;
  hasBlocker: boolean;
}

interface ActionResult {
  proposalId: string | null;
  message: string;
}

export default function ActionPanel({ issueId, hasCwr, hasOwner, hasBlocker }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<ActionType | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function trigger(type: ActionType) {
    setLoading(type);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`/api/issues/${issueId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type } satisfies TriggerActionRequest),
      });
      const data = (await res.json()) as { proposalId?: string | null; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Action failed');
      const actionResult: ActionResult = {
        proposalId: data.proposalId ?? null,
        message: data.message ?? 'Done.',
      };
      setResult(actionResult);
      if (actionResult.proposalId) {
        setTimeout(() => router.push('/approvals'), 1200);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(null);
    }
  }

  const visible = ACTIONS.filter((a) => {
    if (!hasCwr) return false;
    if (a.needsOwner && !hasOwner) return false;
    if (a.needsBlocker && !hasBlocker) return false;
    return true;
  });

  return (
    <div className="card" style={styles.card}>
      <h2 style={styles.title}>Actions</h2>

      {!hasCwr ? (
        <p style={styles.empty}>No current state yet — ingest a Slack thread first.</p>
      ) : (
        <div style={styles.list}>
          {visible.map(({ type, label, primary }) => (
            <button
              key={type}
              onClick={() => trigger(type)}
              disabled={loading !== null}
              style={{
                ...styles.btn,
                ...(primary ? styles.btnPrimary : styles.btnDefault),
                ...(loading === type ? styles.btnBusy : {}),
              }}
            >
              {loading === type ? '…' : label}
            </button>
          ))}
        </div>
      )}

      {result && (
        <div style={result.proposalId ? styles.successProposal : styles.success}>
          <span style={styles.resultMsg}>{result.message}</span>
          {result.proposalId && (
            <a href="/approvals" style={styles.proposalLink}>View in Approvals →</a>
          )}
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card:         { padding: 16 },
  title:        { fontSize: 13, fontWeight: 600, color: 'var(--remi-ink)', marginBottom: 12 },
  empty:        { fontSize: 13, color: 'var(--remi-muted)', lineHeight: 1.5 },
  list:         { display: 'flex', flexDirection: 'column', gap: 7 },
  btn: {
    fontSize: 13,
    fontWeight: 500,
    padding: '8px 14px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'opacity 0.1s',
    width: '100%',
  },
  btnPrimary:   { background: 'var(--remi-navy)', color: '#fff' },
  btnDefault:   { background: '#F3F4F6', color: 'var(--remi-ink)', border: '1px solid var(--remi-border)' },
  btnBusy:      { opacity: 0.6, cursor: 'not-allowed' },
  success:      { marginTop: 12, padding: '8px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, fontSize: 13, color: '#15803D' },
  successProposal: { marginTop: 12, padding: '8px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 13, display: 'flex', flexDirection: 'column' as const, gap: 4 },
  resultMsg:    { color: 'var(--remi-ink)' },
  proposalLink: { color: 'var(--remi-blue)', fontWeight: 500, fontSize: 12 },
  error:        { marginTop: 10, padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, fontSize: 13, color: 'var(--remi-red)' },
};
