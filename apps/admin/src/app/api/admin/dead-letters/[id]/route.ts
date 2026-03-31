import { NextRequest } from 'next/server';
import { proxyAdminResponse } from '../../proxy-response';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

// POST → retry, DELETE → delete single entry
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyAdminResponse(`${API_URL}/admin/dead-letters/${id}/retry`, {
    method: 'POST',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyAdminResponse(`${API_URL}/admin/dead-letters/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
}
