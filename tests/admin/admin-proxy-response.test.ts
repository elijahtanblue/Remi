import { describe, expect, it, vi } from 'vitest';
import { proxyAdminResponse } from '../../apps/admin/src/app/api/admin/proxy-response';

describe('proxyAdminResponse', () => {
  it('passes through plain-text upstream errors without throwing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Upstream exploded', {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }),
    );

    const response = await proxyAdminResponse('http://api/admin/dead-letters/test', {
      method: 'POST',
    });

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Upstream exploded');

    fetchMock.mockRestore();
  });

  it('returns a JSON fallback when the upstream error body is empty', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 500,
      }),
    );

    const response = await proxyAdminResponse('http://api/admin/dead-letters/test', {
      method: 'DELETE',
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Request failed with status 500',
    });

    fetchMock.mockRestore();
  });

  it('surfaces network failures as JSON errors', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('socket hang up'));

    const response = await proxyAdminResponse('http://api/admin/dead-letters/test', {
      method: 'POST',
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'socket hang up',
    });

    fetchMock.mockRestore();
  });
});
