'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { readDeadLetterActionResponse } from '@/lib/dead-letter-actions';

type RetryStatus = 'idle' | 'loading' | 'done' | 'error' | 'missing';

export function RetryButton({ itemId }: { itemId: string }) {
  const [status, setStatus] = useState<RetryStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleClick = async () => {
    setStatus('loading');
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/admin/dead-letters/${itemId}/retry`, { method: 'POST' });
      const result = await readDeadLetterActionResponse(response);

      if (result.ok) {
        setStatus('done');
        router.refresh();
        return;
      }

      if (result.status === 404) {
        setStatus('missing');
        setErrorMessage(result.error ?? 'Already cleared');
        router.refresh();
        return;
      }

      setStatus('error');
      setErrorMessage(result.error ?? 'Retry failed');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Retry failed');
    }
  };

  if (status === 'done') {
    return (
      <span className="badge badge-green" style={{ fontWeight: 500 }}>
        Retried
      </span>
    );
  }

  if (status === 'missing') {
    return (
      <span className="badge badge-yellow" title={errorMessage ?? 'Already cleared'}>
        Already cleared
      </span>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '4px' }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'loading'}
        style={status === 'error' ? { borderColor: 'var(--remi-danger-txt)', color: 'var(--remi-danger-txt)' } : undefined}
        title={errorMessage ?? 'Retry this dead letter'}
      >
        {status === 'loading' ? 'Retrying...' : status === 'error' ? 'Retry again' : 'Retry'}
      </button>
      {errorMessage && status === 'error' ? (
        <span
          style={{
            fontSize: '11px',
            color: 'var(--remi-danger-txt)',
            maxWidth: '140px',
            whiteSpace: 'normal',
            lineHeight: 1.3,
          }}
          title={errorMessage}
        >
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
