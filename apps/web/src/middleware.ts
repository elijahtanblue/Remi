import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC = ['/login', '/auth/slack', '/auth/logout'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = request.cookies.get('remi_session')?.value;
  if (!token) return NextResponse.redirect(new URL('/login', request.url));

  try {
    const res = await fetch(`${process.env.API_URL}/internal/sessions/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': process.env.INTERNAL_TOKEN ?? '',
      },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('remi_session');
      return response;
    }

    const { userId, workspaceId } = (await res.json()) as {
      userId: string;
      workspaceId: string;
    };

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', userId);
    requestHeaders.set('x-workspace-id', workspaceId);
    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
