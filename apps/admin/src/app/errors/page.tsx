import { api, type DeadLetterItem } from '@/lib/api';
import { RetryButton } from './RetryButton';
import { DeleteButton } from './DeleteButton';

interface Props {
  searchParams: Promise<{
    queue?: string;
    limit?: string;
    offset?: string;
    includeRetried?: string;
  }>;
}

export default async function ErrorsPage({ searchParams }: Props) {
  const {
    queue,
    limit: limitStr,
    offset: offsetStr,
    includeRetried: includeRetriedStr,
  } = await searchParams;

  const limit = limitStr ? parseInt(limitStr, 10) : 20;
  const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
  const includeRetried = includeRetriedStr === 'true';

  let items: DeadLetterItem[] = [];
  let error: string | null = null;

  try {
    const data = await api.getDeadLetters({ queue, limit, offset, includeRetried });
    items = data.items;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load error queue';
  }

  return (
    <div>
      <div className="page-header">
        <h1>Errors</h1>
        <p>
          {includeRetried
            ? 'Active and retried queue failures. Retry to reprocess or delete to clear from storage.'
            : 'Active unresolved queue failures. Retry to reprocess or delete to clear from storage.'}
        </p>
      </div>

      <form method="GET" className="filter-bar">
        <label>Queue:</label>
        <input
          name="queue"
          defaultValue={queue ?? ''}
          placeholder="Filter by queue name..."
          style={{ width: '220px' }}
        />
        {includeRetried ? <input type="hidden" name="includeRetried" value="true" /> : null}
        <button type="submit" className="btn-primary">Filter</button>
        {queue ? (
          <a href={buildErrorsHref({ includeRetried })} style={{ fontSize: '13px' }}>
            Clear filter
          </a>
        ) : null}
        <a
          href={buildErrorsHref({ queue, includeRetried: !includeRetried })}
          style={{ fontSize: '13px' }}
        >
          {includeRetried ? 'Hide history' : 'Show history'}
        </a>
        <div style={{ marginLeft: 'auto' }}>
          <DeleteButton mode="clear-all" queue={queue} includeRetried={includeRetried} />
        </div>
      </form>

      {error ? <div className="error-banner">{error}</div> : null}

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
                  {includeRetried
                    ? queue
                      ? `No dead-letter history found for queue "${queue}"`
                      : 'No dead-letter history found'
                    : queue
                      ? `No active errors found for queue "${queue}"`
                      : 'No active errors - queue is clean'}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <code style={{ fontSize: '13px' }}>{item.queue ?? '-'}</code>
                  </td>
                  <td>
                    <div style={{ display: 'grid', gap: '4px' }}>
                      <code style={{ fontSize: '12px' }}>{item.messageId ?? item.id ?? '-'}</code>
                      <span
                        style={{ fontSize: '11px', color: 'var(--remi-muted)' }}
                        title={item.id}
                      >
                        Row ID: <code style={{ fontSize: '11px' }}>{item.id}</code>
                      </span>
                    </div>
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
                    {item.error ?? '-'}
                  </td>
                  <td style={{ fontSize: '13px', textAlign: 'center' }}>
                    {item.retryCount != null ? (
                      <span className={`badge ${item.retryCount >= 3 ? 'badge-red' : 'badge-yellow'}`}>
                        {item.retryCount}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td style={{ color: 'var(--remi-muted)', fontSize: '13px' }}>
                    {item.failedAt
                      ? new Date(item.failedAt).toLocaleString()
                      : '-'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
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

      {items.length === limit ? (
        <div className="pagination">
          {offset > 0 ? (
            <a
              href={buildErrorsHref({
                queue,
                limit,
                offset: Math.max(0, offset - limit),
                includeRetried,
              })}
            >
              &larr; Previous
            </a>
          ) : null}
          <a
            href={buildErrorsHref({
              queue,
              limit,
              offset: offset + limit,
              includeRetried,
            })}
          >
            Next &rarr;
          </a>
        </div>
      ) : null}
    </div>
  );
}

function buildErrorsHref(params: {
  queue?: string;
  limit?: number;
  offset?: number;
  includeRetried?: boolean;
}) {
  const searchParams = new URLSearchParams();

  if (params.queue) {
    searchParams.set('queue', params.queue);
  }
  if (params.limit != null) {
    searchParams.set('limit', String(params.limit));
  }
  if (params.offset != null && params.offset > 0) {
    searchParams.set('offset', String(params.offset));
  }
  if (params.includeRetried) {
    searchParams.set('includeRetried', 'true');
  }

  const query = searchParams.toString();
  return query.length > 0 ? `/errors?${query}` : '/errors';
}
