'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SingleProps {
  mode: 'single';
  itemId: string;
}

interface ClearAllProps {
  mode: 'clear-all';
  queue?: string;
}

type Props = SingleProps | ClearAllProps;

export function DeleteButton(props: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const router = useRouter();

  const handleClick = async () => {
    if (props.mode === 'clear-all') {
      const count = undefined; // unknown at click time
      const confirmed = window.confirm(
        `Delete all${props.queue ? ` "${props.queue}"` : ''} error entries? This cannot be undone.`
      );
      if (!confirmed) return;
    }

    setStatus('loading');
    try {
      let url: string;
      if (props.mode === 'single') {
        url = `/api/admin/dead-letters/${props.itemId}`;
      } else {
        url = `/api/admin/dead-letters${props.queue ? `?queue=${encodeURIComponent(props.queue)}` : ''}`;
      }
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error('Request failed');
      setStatus('done');
      router.refresh();
    } catch {
      setStatus('error');
    }
  };

  if (props.mode === 'clear-all') {
    return (
      <button
        onClick={handleClick}
        disabled={status === 'loading'}
        className="btn-danger"
        style={{ fontSize: '13px', padding: '6px 14px' }}
      >
        {status === 'loading' ? 'Clearing…' : status === 'done' ? 'Cleared' : 'Clear all'}
      </button>
    );
  }

  if (status === 'done') return null;

  return (
    <button
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
      title="Delete this error entry"
    >
      {status === 'loading' ? '…' : status === 'error' ? 'Failed' : 'Delete'}
    </button>
  );
}
