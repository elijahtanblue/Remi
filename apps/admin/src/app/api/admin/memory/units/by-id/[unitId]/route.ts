import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ unitId: string }> }
) {
  const { unitId } = await params;
  const res = await fetch(`${API_URL}/admin/memory/units/by-id/${unitId}`, {
    headers: { 'x-admin-key': ADMIN_KEY },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
