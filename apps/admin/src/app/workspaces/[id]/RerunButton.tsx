'use client';

import { useState } from 'react';

export function RerunButton({ summaryId }: { summaryId: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const handleClick = async () => {
    setStatus('loading');
    try {
      const res = await fetch(`/api/admin/summaries/${summaryId}/rerun`, { method: 'POST' });
      if (!res.ok) throw new Error('Request failed');
      setStatus('done');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'done') {
    return (
      <span className="badge badge-green" style={{ fontWeight: 500 }}>
        Done
      </span>
    );
  }

  if (status === 'error') {
    return (
      <button
        onClick={handleClick}
        style={{ borderColor: 'var(--remi-danger-txt)', color: 'var(--remi-danger-txt)' }}
        title="Failed — click to retry"
      >
        Failed — retry
      </button>
    );
  }

  return (
    <button onClick={handleClick} disabled={status === 'loading'}>
      {status === 'loading' ? 'Running…' : 'Re-run'}
    </button>
  );
}
