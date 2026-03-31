import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const queue = searchParams.get('queue') ?? '';
  const url = `${API_URL}/admin/dead-letters${queue ? `?queue=${encodeURIComponent(queue)}` : ''}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
