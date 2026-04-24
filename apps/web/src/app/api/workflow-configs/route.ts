import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ApiError, createWorkflowConfig } from '@/lib/api-client';
import type { WorkflowConfigCreateRequest } from '@remi/shared';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId      = request.headers.get('x-user-id')      ?? '';
  const workspaceId = request.headers.get('x-workspace-id') ?? '';

  const body = (await request.json()) as WorkflowConfigCreateRequest;

  try {
    const result = await createWorkflowConfig(userId, workspaceId, body);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
