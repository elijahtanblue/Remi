'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { readDeadLetterActionResponse } from '@/lib/dead-letter-actions';

interface SingleProps {
  mode: 'single';
  itemId: string;
}

interface ClearAllProps {
  mode: 'clear-all';
  queue?: string;
  includeRetried?: boolean;
}

type Props = SingleProps | ClearAllProps;
type DeleteStatus = 'idle' | 'loading' | 'done' | 'error' | 'missing';

export function DeleteButton(props: Props) {
  const [status, setStatus] = useState<DeleteStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleClick = async () => {
    if (props.mode === 'clear-all') {
      const confirmed = window.confirm(
        `Delete all${props.queue ? ` "${props.queue}"` : ''} visible error entries? This cannot be undone.`,
      );
      if (!confirmed) return;
    }

    setStatus('loading');
    setErrorMessage(null);

    try {
      const url =
        props.mode === 'single'
          ? `/api/admin/dead-letters/${props.itemId}`
          : `/api/admin/dead-letters${buildDeleteQuery(props.queue, props.includeRetried)}`;

      const response = await fetch(url, { method: 'DELETE' });
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
      setErrorMessage(result.error ?? 'Delete failed');
    } catch (error) {
      console.error('[DeleteButton] Failed to delete dead letter', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Delete failed');
    }
  };

  if (props.mode === 'clear-all') {
    return (
      <div style={{ display: 'grid', gap: '4px', justifyItems: 'end' }}>
        <button
          type="button"
          onClick={handleClick}
          disabled={status === 'loading'}
          className="btn-danger"
          style={{ fontSize: '13px', padding: '6px 14px' }}
          title={errorMessage ?? 'Delete the currently visible dead letters'}
        >
          {status === 'loading'
            ? 'Clearing...'
            : status === 'done'
              ? 'Cleared'
              : status === 'missing'
                ? 'Already cleared'
                : 'Clear all'}
        </button>
        {errorMessage && status === 'error' ? (
          <span
            style={{
              fontSize: '11px',
              color: 'var(--remi-danger-txt)',
              maxWidth: '180px',
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

  if (status === 'done') {
    return null;
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
        style={{
          fontSize: '12px',
          padding: '3px 10px',
          borderRadius: '4px',
          border: '1px solid var(--remi-danger-txt)',
          background: 'transparent',
          color: 'var(--remi-danger-txt)',
          cursor: 'pointer',
        }}
        title={errorMessage ?? 'Delete this error entry'}
      >
        {status === 'loading' ? 'Deleting...' : status === 'error' ? 'Delete again' : 'Delete'}
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

function buildDeleteQuery(queue?: string, includeRetried?: boolean) {
  const searchParams = new URLSearchParams();

  if (queue) {
    searchParams.set('queue', queue);
  }

  if (includeRetried) {
    searchParams.set('includeRetried', 'true');
  }

  return searchParams.size > 0 ? `?${searchParams.toString()}` : '';
}
