import { describe, expect, it, vi } from 'vitest';
import { readDeadLetterActionResponse } from '../../apps/admin/src/lib/dead-letter-actions.js';

describe('dead letter action responses', () => {
  it('maps 404 responses to Already cleared', async () => {
    const response = {
      ok: false,
      status: 404,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: 'Dead letter not found' })),
    } as any;

    await expect(readDeadLetterActionResponse(response)).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'Already cleared',
    });
  });

  it('surfaces JSON error payloads for non-404 failures', async () => {
    const response = {
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: 'Queue send failed' })),
    } as any;

    await expect(readDeadLetterActionResponse(response)).resolves.toEqual({
      ok: false,
      status: 500,
      error: 'Queue send failed',
    });
  });

  it('prefers a JSON message field when present', async () => {
    const response = {
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue(JSON.stringify({ message: 'Dead letter queue write failed' })),
    } as any;

    await expect(readDeadLetterActionResponse(response)).resolves.toEqual({
      ok: false,
      status: 500,
      error: 'Dead letter queue write failed',
    });
  });

  it('falls back to a status-based message when the error body is empty', async () => {
    const response = {
      ok: false,
      status: 502,
      text: vi.fn().mockResolvedValue(''),
    } as any;

    await expect(readDeadLetterActionResponse(response)).resolves.toEqual({
      ok: false,
      status: 502,
      error: 'Request failed with status 502',
    });
  });
});
