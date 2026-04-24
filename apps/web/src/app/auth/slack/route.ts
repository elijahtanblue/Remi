import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { setStateCookie } from '@/lib/session';

export async function GET(): Promise<NextResponse> {
  const state = randomBytes(16).toString('hex');
  await setStateCookie(state);

  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID ?? '',
    scope: 'identity.basic',
    redirect_uri: `${process.env.WEB_URL}/auth/slack/callback`,
    state,
  });

  return NextResponse.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
}
