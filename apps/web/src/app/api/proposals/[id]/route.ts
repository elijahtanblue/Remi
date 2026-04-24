import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { editProposal } from '@/lib/api-client';
import type { ProposalEditRequest } from '@remi/shared';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const userId      = request.headers.get('x-user-id')      ?? '';
  const workspaceId = request.headers.get('x-workspace-id') ?? '';

  const body = (await request.json()) as ProposalEditRequest;

  try {
    const result = await editProposal(userId, workspaceId, id, body);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
