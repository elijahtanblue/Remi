'use client';

import { useState, useEffect, useCallback } from 'react';

interface MemoryConfig {
  enabled: boolean;
}

interface Proposal {
  id: string;
  status: string;
  confidence: number;
  createdAt: string;
  payload: { jiraIssueKey: string; commentBody: string };
  memoryUnit: { scopeRef: string; issueId: string | null };
}

export function MemoryPanel({ workspaceId }: { workspaceId: string }) {
  const [config, setConfig] = useState<MemoryConfig | null>(null);
  const [toggleStatus, setToggleStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [backfillStatus, setBackfillStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [backfillResult, setBackfillResult] = useState<{ enqueuedJobs: number; linksProcessed: number } | null>(null);
  const [jiraBackfillStatus, setJiraBackfillStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [jiraBackfillResult, setJiraBackfillResult] = useState<{ enqueuedJobs: number; issuesProcessed: string[] } | null>(null);

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalActionStatus, setProposalActionStatus] = useState<Record<string, 'loading' | 'error'>>({});

  const fetchProposals = useCallback(() => {
    fetch(`/api/admin/memory/proposals/${workspaceId}`)
      .then((r) => r.json())
      .then((data) => setProposals(Array.isArray(data) ? data : []))
      .catch(() => setProposals([]));
  }, [workspaceId]);

  useEffect(() => {
    fetch(`/api/admin/memory/config/${workspaceId}`)
      .then((r) => r.json())
      .then((data) => setConfig({ enabled: data.enabled ?? false }))
      .catch(() => setConfig({ enabled: false }));
    fetchProposals();
  }, [workspaceId, fetchProposals]);

  const handleToggle = async () => {
    if (!config) return;
    setToggleStatus('loading');
    try {
      const res = await fetch(`/api/admin/memory/config/${workspaceId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !config.enabled }),
      });
      if (!res.ok) throw new Error('Request failed');
      const updated = await res.json();
      setConfig({ enabled: updated.enabled });
      setToggleStatus('idle');
    } catch {
      setToggleStatus('error');
    }
  };

  const handleBackfill = async () => {
    setBackfillStatus('loading');
    setBackfillResult(null);
    try {
      const res = await fetch(`/api/admin/memory/backfill/${workspaceId}`, { method: 'POST' });
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setBackfillResult({ enqueuedJobs: data.enqueuedJobs, linksProcessed: data.linksProcessed });
      setBackfillStatus('done');
    } catch {
      setBackfillStatus('error');
    }
  };

  const handleJiraBackfill = async () => {
    setJiraBackfillStatus('loading');
    setJiraBackfillResult(null);
    try {
      const res = await fetch(`/api/admin/memory/backfill-jira/${workspaceId}`, { method: 'POST' });
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setJiraBackfillResult({ enqueuedJobs: data.enqueuedJobs, issuesProcessed: data.issuesProcessed ?? [] });
      setJiraBackfillStatus('done');
    } catch {
      setJiraBackfillStatus('error');
    }
  };

  const handleProposalAction = async (proposalId: string, action: 'approve' | 'reject') => {
    setProposalActionStatus((s) => ({ ...s, [proposalId]: 'loading' }));
    try {
      const res = await fetch(`/api/admin/memory/proposals/${proposalId}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: action === 'approve' ? JSON.stringify({ approvedBy: 'admin' }) : undefined,
      });
      if (!res.ok) throw new Error('Request failed');
      setProposalActionStatus((s) => { const n = { ...s }; delete n[proposalId]; return n; });
      fetchProposals();
    } catch {
      setProposalActionStatus((s) => ({ ...s, [proposalId]: 'error' }));
    }
  };

  return (
    <div style={{ marginBottom: '24px', padding: '16px', border: '1px solid var(--remi-border)', borderRadius: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <span style={{ fontWeight: 600, fontSize: '14px' }}>Autonomous Memory</span>
        {config === null ? (
          <span style={{ fontSize: '12px', color: 'var(--remi-muted)' }}>Loading…</span>
        ) : (
          <span className={`badge ${config.enabled ? 'badge-green' : 'badge-yellow'}`}>
            {config.enabled ? 'Enabled' : 'Disabled'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          onClick={handleToggle}
          disabled={config === null || toggleStatus === 'loading'}
        >
          {toggleStatus === 'loading'
            ? 'Saving…'
            : config?.enabled
            ? 'Disable'
            : 'Enable'}
        </button>
        {toggleStatus === 'error' && (
          <span style={{ fontSize: '12px', color: 'var(--remi-danger-txt)' }}>Failed to update</span>
        )}

        <button
          onClick={handleBackfill}
          disabled={backfillStatus === 'loading'}
          style={{ marginLeft: '8px' }}
        >
          {backfillStatus === 'loading' ? 'Running…' : 'Run Memory Backfill'}
        </button>
        {backfillStatus === 'done' && backfillResult && (
          <span className="badge badge-green" style={{ fontSize: '12px' }}>
            {backfillResult.enqueuedJobs} jobs enqueued across {backfillResult.linksProcessed} threads
          </span>
        )}
        {backfillStatus === 'error' && (
          <span style={{ fontSize: '12px', color: 'var(--remi-danger-txt)' }}>Backfill failed</span>
        )}

        <button
          onClick={handleJiraBackfill}
          disabled={jiraBackfillStatus === 'loading'}
          style={{ marginLeft: '8px' }}
        >
          {jiraBackfillStatus === 'loading' ? 'Syncing…' : 'Sync Jira Content'}
        </button>
        {jiraBackfillStatus === 'done' && jiraBackfillResult && (
          <span className="badge badge-green" style={{ fontSize: '12px' }}>
            {jiraBackfillResult.enqueuedJobs} jobs for {jiraBackfillResult.issuesProcessed.join(', ')}
          </span>
        )}
        {jiraBackfillStatus === 'error' && (
          <span style={{ fontSize: '12px', color: 'var(--remi-danger-txt)' }}>Jira sync failed</span>
        )}
      </div>

      {config?.enabled && (
        <p style={{ fontSize: '12px', color: 'var(--remi-muted)', marginTop: '8px', marginBottom: 0 }}>
          Memory is active. New Slack messages and Jira events will be processed automatically.
          Use backfill to process existing messages.
        </p>
      )}

      {/* Pending proposals */}
      {proposals.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontWeight: 600, fontSize: '13px' }}>Pending Jira Write-backs</span>
            <span className="badge badge-yellow">{proposals.length}</span>
            <button onClick={fetchProposals} style={{ fontSize: '11px', padding: '2px 8px' }}>Refresh</button>
          </div>
          {proposals.map((p) => (
            <div key={p.id} style={{ padding: '12px', border: '1px solid var(--remi-border)', borderRadius: '6px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 500, fontSize: '13px' }}>{p.payload.jiraIssueKey}</span>
                <span style={{ fontSize: '11px', color: 'var(--remi-muted)' }}>
                  confidence {Math.round(p.confidence * 100)}% · {new Date(p.createdAt).toLocaleString()}
                </span>
              </div>
              <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--remi-surface)', padding: '8px', borderRadius: '4px', marginBottom: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                {p.payload.commentBody}
              </pre>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => handleProposalAction(p.id, 'approve')}
                  disabled={proposalActionStatus[p.id] === 'loading'}
                  className="badge-green"
                  style={{ padding: '4px 12px', cursor: 'pointer' }}
                >
                  {proposalActionStatus[p.id] === 'loading' ? 'Approving…' : 'Approve & Post to Jira'}
                </button>
                <button
                  onClick={() => handleProposalAction(p.id, 'reject')}
                  disabled={proposalActionStatus[p.id] === 'loading'}
                  style={{ padding: '4px 12px', cursor: 'pointer' }}
                >
                  Reject
                </button>
                {proposalActionStatus[p.id] === 'error' && (
                  <span style={{ fontSize: '12px', color: 'var(--remi-danger-txt)' }}>Action failed</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {proposals.length === 0 && config?.enabled && (
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--remi-muted)' }}>No pending write-backs.</span>
          <button onClick={fetchProposals} style={{ fontSize: '11px', padding: '2px 8px' }}>Refresh</button>
        </div>
      )}
    </div>
  );
}
