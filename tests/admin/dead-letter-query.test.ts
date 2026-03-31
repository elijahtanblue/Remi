import { describe, expect, it } from 'vitest';
import { buildDeadLetterListPath } from '../../apps/admin/src/lib/api.js';
import {
  parseDeadLetterDeleteQuery,
  parseDeadLetterListQuery,
} from '../../apps/api/src/routes/admin/dead-letter-query.js';

describe('dead letter query parsing', () => {
  it('defaults list queries to unresolved entries', () => {
    expect(parseDeadLetterListQuery({})).toEqual({
      queue: undefined,
      limit: 20,
      offset: 0,
      includeRetried: false,
    });
  });

  it('parses includeRetried=true for list queries', () => {
    expect(
      parseDeadLetterListQuery({
        queue: 'backfill-jobs',
        limit: '5',
        offset: '10',
        includeRetried: 'true',
      }),
    ).toEqual({
      queue: 'backfill-jobs',
      limit: 5,
      offset: 10,
      includeRetried: true,
    });
  });

  it('defaults clear-all queries to unresolved entries', () => {
    expect(parseDeadLetterDeleteQuery({ queue: 'backfill-jobs' })).toEqual({
      queue: 'backfill-jobs',
      includeRetried: false,
    });
  });
});

describe('dead letter admin list path', () => {
  it('does not include the history flag by default', () => {
    expect(buildDeadLetterListPath({ queue: 'backfill-jobs', limit: 10, offset: 0 })).toBe(
      '/admin/dead-letters?queue=backfill-jobs&limit=10&offset=0',
    );
  });

  it('includes the history flag when requested', () => {
    expect(
      buildDeadLetterListPath({
        queue: 'backfill-jobs',
        limit: 10,
        offset: 0,
        includeRetried: true,
      }),
    ).toBe('/admin/dead-letters?queue=backfill-jobs&limit=10&offset=0&includeRetried=true');
  });
});
