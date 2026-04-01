'use client';

import { useState, useEffect } from 'react';

interface MemoryConfig {
  enabled: boolean;
}

export function MemoryPanel({ workspaceId }: { workspaceId: string }) {
  const [config, setConfig] = useState<MemoryConfig | null>(null);
  const [toggleStatus, setToggleStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [backfillStatus, setBackfillStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [backfillResult, setBackfillResult] = useState<{ enqueuedJobs: number; linksProcessed: number } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/memory/config/${workspaceId}`)
      .then((r) => r.json())
      .then((data) => setConfig({ enabled: data.enabled ?? false }))
      .catch(() => setConfig({ enabled: false }));
  }, [workspaceId]);

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
      </div>

      {config?.enabled && (
        <p style={{ fontSize: '12px', color: 'var(--remi-muted)', marginTop: '8px', marginBottom: 0 }}>
          Memory is active. New Slack messages and Jira events will be processed automatically.
          Use backfill to process existing messages.
        </p>
      )}
    </div>
  );
}
