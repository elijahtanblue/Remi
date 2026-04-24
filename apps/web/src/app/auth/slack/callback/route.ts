import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAndClearStateCookie, setSessionCookie } from '@/lib/session';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error || !code || !state) {
    return NextResponse.redirect(new URL('/login?error=oauth_failed', request.url));
  }

  const storedState = await getAndClearStateCookie();
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(new URL('/login?error=state_mismatch', request.url));
  }

  // Exchange code → Slack user identity
  const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.SLACK_CLIENT_ID ?? '',
      client_secret: process.env.SLACK_CLIENT_SECRET ?? '',
      code,
      redirect_uri: `${process.env.WEB_URL}/auth/slack/callback`,
    }),
  });

  const tokenData = (await tokenRes.json()) as {
    ok: boolean;
    authed_user?: { id: string };
    team?: { id: string };
    error?: string;
  };

  if (!tokenData.ok || !tokenData.authed_user?.id || !tokenData.team?.id) {
    console.error('[auth/slack/callback] Slack token exchange failed:', tokenData.error);
    return NextResponse.redirect(new URL('/login?error=slack_auth_failed', request.url));
  }

  // Resolve Slack identity → Remi session token
  const resolveRes = await fetch(`${process.env.API_URL}/internal/sessions/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': process.env.INTERNAL_TOKEN ?? '',
    },
    body: JSON.stringify({
      slackUserId: tokenData.authed_user.id,
      slackTeamId: tokenData.team.id,
    }),
  });

  if (!resolveRes.ok) {
    const body = (await resolveRes.json()) as { error?: string };
    const msg = encodeURIComponent(body.error ?? 'Access denied');
    return NextResponse.redirect(new URL(`/login?error=${msg}`, request.url));
  }

  const { token } = (await resolveRes.json()) as { token: string };
  await setSessionCookie(token);
  return NextResponse.redirect(new URL('/queue', request.url));
}
