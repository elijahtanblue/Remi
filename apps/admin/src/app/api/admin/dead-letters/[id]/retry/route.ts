import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await fetch(`${API_URL}/admin/dead-letters/${id}/retry`, {
    method: 'POST',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await fetch(`${API_URL}/admin/dead-letters/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
