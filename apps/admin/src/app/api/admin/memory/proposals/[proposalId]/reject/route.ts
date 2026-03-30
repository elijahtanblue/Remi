import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> }
) {
  const { proposalId } = await params;
  const res = await fetch(`${API_URL}/admin/memory/proposals/${proposalId}/reject`, {
    method: 'POST',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
