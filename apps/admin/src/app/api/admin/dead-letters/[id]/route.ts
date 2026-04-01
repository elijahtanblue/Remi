import { NextRequest } from 'next/server';
import { ADMIN_API_URL, ADMIN_KEY } from '../../config';
import { proxyAdminResponse } from '../../proxy-response';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyAdminResponse(`${ADMIN_API_URL}/admin/dead-letters/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
}
