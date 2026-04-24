import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionToken, clearSessionCookie } from '@/lib/session';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = await getSessionToken();

  if (token) {
    fetch(`${process.env.API_URL}/internal/sessions/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': process.env.INTERNAL_TOKEN ?? '',
      },
      body: JSON.stringify({ token }),
    }).catch(() => {});
  }

  await clearSessionCookie();
  return NextResponse.redirect(new URL('/login', request.url));
}
