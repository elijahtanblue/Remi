import { cookies } from 'next/headers';

const SESSION_COOKIE = 'remi_session';
const STATE_COOKIE   = 'remi_oauth_state';

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function setStateCookie(state: string): Promise<void> {
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
}

export async function getAndClearStateCookie(): Promise<string | undefined> {
  const jar = await cookies();
  const value = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  return value;
}
