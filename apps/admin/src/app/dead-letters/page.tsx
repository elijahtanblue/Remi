import { api } from '@/lib/api';
import { RetryButton } from './RetryButton';

interface Props {
  searchParams: Promise<{ queue?: string; limit?: string; offset?: string }>;
}

export default async function DeadLettersPage({ searchParams }: Props) {
  const { queue, limit: limitStr, offset: offsetStr } = await searchParams;
  const limit = limitStr ? parseInt(limitStr, 10) : 20;
  const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

  let items: any[] = [];
  let error: string | null = null;

  try {
    const data = await api.getDeadLetters({ queue, limit, offset });
    items = data.items;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load dead letter queue';
  }

  return (
    <div>
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Dead Letters</h1>
      <p style={{ color: '#6c757d', fontSize: '14px', marginBottom: '20px' }}>
        Messages that failed processing and were moved to the dead letter queue.
      </p>

      {/* Queue filter */}
      <form
        method="GET"
        style={{ marginBottom: '20px', display: 'flex', gap: '8px', alignItems: 'center' }}
      >
        <label style={{ fontSize: '13px', color: '#495057', fontWeight: 500 }}>
          Queue:
        </label>
        <input
          name="queue"
          defaultValue={queue ?? ''}
          placeholder="Filter by queue name…"
          style={{
            padding: '6px 10px',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            fontSize: '13px',
            width: '220px',
          }}
        />
        <button type="submit" style={{ background: '#0066cc', color: 'white', borderColor: '#0066cc' }}>
          Filter
        </button>
        {queue && (
          <a href="/dead-letters" style={{ fontSize: '13px' }}>
            Clear
          </a>
        )}
      </form>

      {error && (
        <div
          className="badge-red"
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Queue</th>
              <th>Message ID</th>
              <th>Error</th>
              <th>Retry Count</th>
              <th>Failed At</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !error ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: '#6c757d', padding: '24px' }}>
                  {queue ? `No dead letters found for queue "${queue}"` : 'No dead letters found'}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <code style={{ fontSize: '13px' }}>{item.queue ?? '—'}</code>
                  </td>
                  <td>
                    <code style={{ fontSize: '12px', color: '#6c757d' }}>
                      {item.messageId ?? item.id ?? '—'}
                    </code>
                  </td>
                  <td
                    style={{
                      fontSize: '13px',
                      color: '#721c24',
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
                      <span
                        className={`badge ${item.retryCount >= 3 ? 'badge-red' : 'badge-yellow'}`}
                      >
                        {item.retryCount}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ color: '#6c757d', fontSize: '13px' }}>
                    {item.failedAt
                      ? new Date(item.failedAt).toLocaleString()
                      : item.createdAt
                        ? new Date(item.createdAt).toLocaleString()
                        : '—'}
                  </td>
                  <td>
                    <RetryButton itemId={item.id} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {items.length === limit && (
        <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
          {offset > 0 && (
            <a
              href={`/dead-letters?queue=${queue ?? ''}&limit=${limit}&offset=${Math.max(0, offset - limit)}`}
            >
              &larr; Previous
            </a>
          )}
          <a
            href={`/dead-letters?queue=${queue ?? ''}&limit=${limit}&offset=${offset + limit}`}
          >
            Next &rarr;
          </a>
        </div>
      )}
    </div>
  );
}
