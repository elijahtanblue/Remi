import { NextRequest } from 'next/server';
import { ADMIN_API_URL, ADMIN_KEY } from '../../../../config';
import { proxyAdminResponse } from '../../../../proxy-response';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.text();
  return proxyAdminResponse(`${ADMIN_API_URL}/admin/memory/proposals/${id}/approve`, {
    method: 'POST',
    headers: { 'x-admin-key': ADMIN_KEY, 'content-type': 'application/json' },
    body,
  });
}
