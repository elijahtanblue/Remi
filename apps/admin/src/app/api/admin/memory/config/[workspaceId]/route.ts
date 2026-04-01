import { NextRequest } from 'next/server';
import { ADMIN_API_URL, ADMIN_KEY } from '../../../config';
import { proxyAdminResponse } from '../../../proxy-response';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return proxyAdminResponse(`${ADMIN_API_URL}/admin/memory/config/${workspaceId}`, {
    method: 'GET',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = await req.text();
  return proxyAdminResponse(`${ADMIN_API_URL}/admin/memory/config/${workspaceId}`, {
    method: 'PUT',
    headers: { 'x-admin-key': ADMIN_KEY, 'content-type': 'application/json' },
    body,
  });
}
