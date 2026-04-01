import { NextRequest } from 'next/server';
import { ADMIN_API_URL, ADMIN_KEY } from '../../../config';
import { proxyAdminResponse } from '../../../proxy-response';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return proxyAdminResponse(`${ADMIN_API_URL}/admin/memory/backfill/${workspaceId}`, {
    method: 'POST',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
}
