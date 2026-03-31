import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

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
  const url = `${API_URL}/admin/dead-letters${apiSearchParams.size > 0 ? `?${apiSearchParams.toString()}` : ''}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
