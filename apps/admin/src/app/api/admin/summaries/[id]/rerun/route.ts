import { NextRequest } from 'next/server';
import { proxyAdminResponse } from '../../../proxy-response';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyAdminResponse(`${API_URL}/admin/summaries/${id}/rerun`, {
    method: 'POST',
    headers: { 'x-admin-key': ADMIN_KEY },
  });
}
