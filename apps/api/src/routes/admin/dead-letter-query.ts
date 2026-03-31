interface DeadLetterListQuery {
  queue?: string;
  limit?: number | string;
  offset?: number | string;
  includeRetried?: boolean | string;
}

interface DeadLetterDeleteQuery {
  queue?: string;
  includeRetried?: boolean | string;
}

function parseQueryBoolean(value: boolean | string | undefined) {
  return value === true || value === 'true' || value === '1';
}

function normalizeQueue(queue?: string) {
  return queue && queue.length > 0 ? queue : undefined;
}

export function parseDeadLetterListQuery(query: DeadLetterListQuery) {
  return {
    queue: normalizeQueue(query.queue),
    limit: Number(query.limit ?? 20),
    offset: Number(query.offset ?? 0),
    includeRetried: parseQueryBoolean(query.includeRetried),
  };
}

export function parseDeadLetterDeleteQuery(query: DeadLetterDeleteQuery) {
  return {
    queue: normalizeQueue(query.queue),
    includeRetried: parseQueryBoolean(query.includeRetried),
  };
}
