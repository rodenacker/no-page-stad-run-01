/**
 * The server-side gate every screen other than the sign-in screen sits behind.
 *
 * A protected layout `await`s this before rendering anything, so a request with
 * no valid session is redirected to the sign-in screen BEFORE any protected
 * content reaches the browser — there is no client-side-only gate and no flash of
 * protected content (brief BR1). Identity and roles are re-resolved from the auth
 * service on each server-rendered navigation rather than cached (brief BR3).
 *
 * What it returns is the auth service's own identity body: name, email and the
 * role set. It contains no session value, so nothing a component receives — and
 * therefore nothing that reaches browser-side code — carries a credential
 * (brief BR2).
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { fetchUserInfo } from './authApi';
import { SESSION_COOKIE_NAME } from './sessionCookie';

import type { UserInfoRead } from '@/types/auth';

/** Where a caller without a valid session is sent. */
export const SIGN_IN_ROUTE = '/sign-in';

/**
 * The signed-in identity for the current request, or a redirect to the sign-in
 * screen. Never returns for an unauthenticated caller.
 */
export async function requireSession(): Promise<UserInfoRead> {
  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionValue) {
    redirect(SIGN_IN_ROUTE);
  }

  const session = await fetchUserInfo(sessionValue);
  if (!session) {
    redirect(SIGN_IN_ROUTE);
  }

  return session;
}
