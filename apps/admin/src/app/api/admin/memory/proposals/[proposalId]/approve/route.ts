import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> }
) {
  const { proposalId } = await params;
  const body = await req.json();
  const res = await fetch(`${API_URL}/admin/memory/proposals/${proposalId}/approve`, {
    method: 'POST',
    headers: { 'x-admin-key': ADMIN_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
