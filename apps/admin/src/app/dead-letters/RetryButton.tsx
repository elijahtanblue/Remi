'use client';

import { useState } from 'react';

export function RetryButton({ itemId }: { itemId: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const handleClick = async () => {
    setStatus('loading');
    try {
      const res = await fetch(`/api/admin/dead-letters/${itemId}/retry`, { method: 'POST' });
      if (!res.ok) throw new Error('Request failed');
      setStatus('done');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'done') {
    return (
      <span className="badge badge-green" style={{ fontWeight: 500 }}>
        Retried
      </span>
    );
  }

  if (status === 'error') {
    return (
      <button
        onClick={handleClick}
        style={{ borderColor: '#dc3545', color: '#dc3545' }}
        title="Failed — click to retry again"
      >
        Failed — retry
      </button>
    );
  }

  return (
    <button onClick={handleClick} disabled={status === 'loading'}>
      {status === 'loading' ? 'Retrying…' : 'Retry'}
    </button>
  );
}
