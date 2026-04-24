import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { approveProposal } from '@/lib/api-client';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const userId      = request.headers.get('x-user-id')      ?? '';
  const workspaceId = request.headers.get('x-workspace-id') ?? '';

  try {
    const result = await approveProposal(userId, workspaceId, params.id);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
