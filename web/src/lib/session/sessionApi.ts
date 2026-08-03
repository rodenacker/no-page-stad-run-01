/**
 * Asking the auth service whether the session is still good.
 *
 * `GET /v1/auth/userinfo` is the natural way to do that: it is the endpoint the app
 * already uses to resolve who is signed in, so a successful answer IS confirmation the
 * session is alive, and a 401 IS the service reporting it gone (epic
 * `sign-in-and-app-shell` R17). Made from the browser, through the shared API client,
 * at the app's own address — the `next.config` rewrite forwards it and the browser
 * attaches the session cookie itself (CLAUDE.md §2, brief BR2).
 */
import { get } from '@/lib/api/client';
import { AUTH_ENDPOINTS } from '@/lib/utils/constants';

import type { UserInfoRead } from '@/types/auth';

/**
 * Confirms the session with the auth service, returning the identity it answers with.
 * Rejects with the shared client's `APIError` when the service refuses — a 401/403
 * there means the session is already over.
 */
export const touchSession = async (): Promise<UserInfoRead> =>
  get<UserInfoRead>(AUTH_ENDPOINTS.userinfo);
