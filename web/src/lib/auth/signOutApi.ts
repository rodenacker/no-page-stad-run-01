/**
 * Signing out, from the browser.
 *
 * Like signing in, this call has to be made BY THE BROWSER: the auth service ends
 * the session and answers with a `Set-Cookie` that clears it, and only a
 * browser-made request lets the browser act on that. It goes to the app's own
 * address (`/v1/auth/logout`), which `app/v1/auth/[...path]/route.ts` forwards to
 * the auth service (project.md §Authentication, epic brief BR2).
 *
 * It rejects when the auth service did not confirm the sign-out, which is what lets
 * the caller keep the user where they are instead of pretending it worked
 * (bff-auth-pattern.md Rule 8, epic brief BR4).
 */
import { post } from '@/lib/api/client';
import { serviceMessageOf } from '@/lib/api/errors';
import { AUTH_ENDPOINTS } from '@/lib/utils/constants';

import type { DefaultResponse } from '@/types/api';

/** Heading for the failed-sign-out error, naming what did not happen. */
export const SIGN_OUT_FAILED_TITLE = 'Sign-out failed';

/**
 * Shown when the failure carries no message from the service worth reading. It
 * says what is still true — the user is still signed in — and what to do about it
 * (project.md NFR-base-5).
 */
export const SIGN_OUT_UNAVAILABLE_MESSAGE =
  'You are still signed in. Please try signing out again.';

/**
 * Ends the session. Resolves only once the auth service has confirmed it; rejects
 * with the `APIError` from the shared client otherwise.
 */
export const signOut = async (): Promise<void> => {
  await post<DefaultResponse>(AUTH_ENDPOINTS.logout);
};

/** What to tell the user when signing out failed: the service's reason, or ours. */
export const signOutFailureMessage = (error: unknown): string =>
  serviceMessageOf(error) ?? SIGN_OUT_UNAVAILABLE_MESSAGE;
