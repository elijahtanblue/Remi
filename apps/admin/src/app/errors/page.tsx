import { api } from '@/lib/api';
import { RetryButton } from './RetryButton';
import { DeleteButton } from './DeleteButton';

interface Props {
  searchParams: Promise<{ queue?: string; limit?: string; offset?: string }>;
}

export default async function ErrorsPage({ searchParams }: Props) {
  const { queue, limit: limitStr, offset: offsetStr } = await searchParams;
  const limit = limitStr ? parseInt(limitStr, 10) : 20;
  const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

  let items: any[] = [];
  let error: string | null = null;

  try {
    const data = await api.getDeadLetters({ queue, limit, offset });
    items = data.items;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load error queue';
  }

  return (
    <div>
      <div className="page-header">
        <h1>Errors</h1>
        <p>Failed queue messages — retry to reprocess or delete to clear from storage.</p>
      </div>

      {/* Filters + clear all */}
      <form method="GET" className="filter-bar">
        <label>Queue:</label>
        <input
          name="queue"
          defaultValue={queue ?? ''}
          placeholder="Filter by queue name…"
          style={{ width: '220px' }}
        />
        <button type="submit" className="btn-primary">Filter</button>
        {queue && (
          <a href="/errors" style={{ fontSize: '13px' }}>Clear filter</a>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <DeleteButton mode="clear-all" queue={queue} />
        </div>
      </form>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Queue</th>
              <th>Message ID</th>
              <th>Error</th>
              <th>Retry Count</th>
              <th>Failed At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !error ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  {queue ? `No errors found for queue "${queue}"` : 'No errors — queue is clean'}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <code style={{ fontSize: '13px' }}>{item.queue ?? '—'}</code>
                  </td>
                  <td>
                    <code style={{ fontSize: '12px' }}>{item.messageId ?? item.id ?? '—'}</code>
                  </td>
                  <td
                    style={{
                      fontSize: '13px',
                      color: 'var(--remi-danger-txt)',
                      maxWidth: '280px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={item.error ?? ''}
                  >
                    {item.error ?? '—'}
                  </td>
                  <td style={{ fontSize: '13px', textAlign: 'center' }}>
                    {item.retryCount != null ? (
                      <span className={`badge ${item.retryCount >= 3 ? 'badge-red' : 'badge-yellow'}`}>
                        {item.retryCount}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ color: 'var(--remi-muted)', fontSize: '13px' }}>
                    {item.failedAt
                      ? new Date(item.failedAt).toLocaleString()
                      : item.createdAt
                        ? new Date(item.createdAt).toLocaleString()
                        : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <RetryButton itemId={item.id} />
                      <DeleteButton mode="single" itemId={item.id} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {items.length === limit && (
        <div className="pagination">
          {offset > 0 && (
            <a href={`/errors?queue=${queue ?? ''}&limit=${limit}&offset=${Math.max(0, offset - limit)}`}>
              &larr; Previous
            </a>
          )}
          <a href={`/errors?queue=${queue ?? ''}&limit=${limit}&offset=${offset + limit}`}>
            Next &rarr;
          </a>
        </div>
      )}
    </div>
  );
}
