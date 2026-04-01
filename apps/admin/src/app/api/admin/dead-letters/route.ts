import { NextRequest } from 'next/server';
import { ADMIN_API_URL, ADMIN_KEY } from '../config';
import { proxyAdminResponse } from '../proxy-response';

// DELETE → clear all (or by queue filter)
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const queue = searchParams.get('queue') ?? '';
  const includeRetried = searchParams.get('includeRetried') === 'true';
  const apiSearchParams = new URLSearchParams();
  if (queue) {
    apiSearchParams.set('queue', queue);
  }
  if (includeRetried) {
    apiSearchParams.set('includeRetried', 'true');
  }
  const url = `${ADMIN_API_URL}/admin/dead-letters${apiSearchParams.size > 0 ? `?${apiSearchParams.toString()}` : ''}`;
  return proxyAdminResponse(url, {
    method: 'DELETE',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
}
