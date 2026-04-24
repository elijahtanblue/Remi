'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

function QuickActions({ issueId, hasCwr, hasOwner }: { issueId: string; hasCwr: boolean; hasOwner: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function trigger(type: string, label: string) {
    setBusy(type);
    setDone(null);
    setError(null);
    try {
      const res = await fetch(`/api/issues/${issueId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = (await res.json()) as { proposalId?: string | null; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Action failed');
      if (data.proposalId) {
        router.push('/approvals');
      } else {
        setDone(label);
        setTimeout(() => { setDone(null); router.refresh(); }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  if (!hasCwr) return null;

  return (
    <div style={qa.row} onClick={(e) => e.preventDefault()}>
      <button
        style={qa.btn}
        disabled={busy !== null}
        onClick={(e) => { e.preventDefault(); void trigger('draft_update', 'Drafted'); }}
      >
        {busy === 'draft_update' ? '...' : done === 'Drafted' ? 'Done Drafted' : 'Draft update'}
      </button>

      {hasOwner && (
        <button
          style={qa.btn}
          disabled={busy !== null}
          onClick={(e) => { e.preventDefault(); void trigger('chase_owner', 'Chased'); }}
        >
          {busy === 'chase_owner' ? '...' : done === 'Chased' ? 'Done Chased' : 'Chase owner'}
        </button>
      )}

      <button
        style={qa.btn}
        disabled={busy !== null}
        onClick={(e) => { e.preventDefault(); void trigger('prepare_escalation', 'Prepared'); }}
      >
        {busy === 'prepare_escalation' ? '...' : done === 'Prepared' ? 'Done Prepared' : 'Escalation pack'}
      </button>
      {error && <span style={qa.error}>{error}</span>}
    </div>
  );
}

interface Props { item: IssueQueueItem }

export default function QueueCard({ item }: Props) {
  const { cwr } = item;

  return (
    <div className="card" style={styles.card}>
      <Link href={`/issues/${item.id}`} style={styles.link}>
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

        <p style={styles.title}>{item.title}</p>

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

            <div style={styles.cardFooter}>
              <span style={styles.sources}>{cwr.dataSources.join(' | ')}</span>
              {cwr.lastMeaningfulChangeAt && (
                <span style={styles.ts}>{relativeTime(cwr.lastMeaningfulChangeAt)}</span>
              )}
            </div>
          </div>
        )}
      </Link>

      <QuickActions
        issueId={item.id}
        hasCwr={!!cwr}
        hasOwner={!!cwr?.ownerDisplayName}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card:        { padding: 0, overflow: 'hidden' },
  link:        { display: 'block', textDecoration: 'none', color: 'inherit', padding: 16, cursor: 'pointer' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  headerRight: { display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 },
  meta:        { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  key:         { fontSize: 11, fontWeight: 600, color: 'var(--remi-muted)', letterSpacing: '0.3px' },
  scope:       { fontSize: 11, color: 'var(--remi-muted)' },
  title:       { fontSize: 14, fontWeight: 600, color: 'var(--remi-ink)', lineHeight: 1.4, marginBottom: 10 },
  cwrBlock:    { borderTop: '1px solid var(--remi-border)', paddingTop: 10 },
  state:       { fontSize: 13, color: 'var(--remi-ink)', lineHeight: 1.5, marginBottom: 8 },
  row:         { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
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
  pillLabel:   { color: 'var(--remi-muted)', marginRight: 4 },
  urgency:     { fontSize: 12, color: 'var(--remi-red)', marginBottom: 8 },
  cardFooter:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  sources:     { fontSize: 11, color: 'var(--remi-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  ts:          { fontSize: 11, color: 'var(--remi-muted)' },
};

const qa: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    gap: 6,
    padding: '8px 16px',
    borderTop: '1px solid var(--remi-border)',
    background: '#FAFAFA',
  },
  btn: {
    fontSize: 12,
    fontWeight: 500,
    padding: '5px 12px',
    borderRadius: 5,
    border: '1px solid var(--remi-border)',
    background: '#fff',
    color: 'var(--remi-ink)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  error: {
    alignSelf: 'center',
    color: 'var(--remi-red)',
    fontSize: 12,
  },
};
