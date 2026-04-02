import { NextRequest } from 'next/server';
import { ADMIN_API_URL, ADMIN_KEY } from '../../../config';
import { proxyAdminResponse } from '../../../proxy-response';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyAdminResponse(`${ADMIN_API_URL}/admin/memory/proposals/${id}`, {
    method: 'GET',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
}
