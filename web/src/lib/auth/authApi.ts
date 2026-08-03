/**
 * Server-side access to the auth service.
 *
 * Browser-side auth calls (sign in, sign out) go to same-origin paths and are
 * forwarded by `app/v1/auth/[...path]/route.ts`, so they never need a base URL.
 * Calls the Next.js SERVER makes — the per-navigation session check — cannot use
 * a relative path, so they address the auth service directly, at the address
 * `lib/api/serviceBaseUrl.ts` resolves from configuration on every call. The
 * automated end-to-end run points that at a stubbed auth service, which only
 * works because the address is configurable.
 *
 * Everything here runs on the server. It is the counterpart of the
 * `bffClient.ts` in bff-auth-pattern.md §"Next.js Integration Pattern", named
 * for the service it talks to (project.md calls it the auth-api / BFF).
 */
import { apiClient } from '@/lib/api/client';
import { statusCodeOf } from '@/lib/api/errors';
import { authApiBaseUrl } from '@/lib/api/serviceBaseUrl';
import { AUTH_ENDPOINTS } from '@/lib/utils/constants';

import { sessionCookieHeader } from './sessionCookie';

import type { UserInfoRead } from '@/types/auth';

/**
 * Who the given session belongs to, or `null` when the auth service says the
 * session is not valid (401/403).
 *
 * Any other failure — the service being down, a 500 — is re-thrown rather than
 * reported as "signed out": a broken auth service is a different situation from
 * an ended session, and pretending otherwise would send a signed-in person to
 * the sign-in screen where nothing would work either (CLAUDE.md §3).
 *
 * The session cookie is forwarded explicitly: a server-side fetch has no browser
 * cookie jar to draw on, and the auth service accepts nothing else — no token,
 * no static credential header (brief BR2).
 */
export const fetchUserInfo = async (
  sessionValue: string,
): Promise<UserInfoRead | null> => {
  try {
    return await apiClient<UserInfoRead>(AUTH_ENDPOINTS.userinfo, {
      method: 'GET',
      baseUrl: authApiBaseUrl(),
      headers: { Cookie: sessionCookieHeader(sessionValue) },
      // Identity and roles are resolved fresh on every navigation, never served
      // from a cached response (brief BR3).
      cache: 'no-store',
    });
  } catch (error) {
    const statusCode = statusCodeOf(error);
    if (statusCode === 401 || statusCode === 403) {
      return null;
    }
    throw error;
  }
};
