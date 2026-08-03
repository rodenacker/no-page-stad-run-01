/**
 * Signing in, from the browser.
 *
 * This is the one auth call that has to be made BY THE BROWSER rather than by the
 * Next.js server: the auth service answers it with a `Set-Cookie`, and only a
 * browser-made request lets the browser keep that cookie. It goes to the app's own
 * address (`/v1/auth/login`), which `app/v1/auth/[...path]/route.ts` forwards to
 * the auth service —
 * so no origin is crossed, no CORS negotiation is involved, and the frontend never
 * holds a credential of its own (project.md §Authentication, epic brief BR2).
 *
 * Its counterpart `authApi.ts` holds the calls the SERVER makes.
 */
import { post } from '@/lib/api/client';
import { serviceMessageOf, statusCodeOf } from '@/lib/api/errors';
import { AUTH_ENDPOINTS } from '@/lib/utils/constants';

import type { DefaultResponse } from '@/types/api';
import type { SignInValues } from '@/lib/validation/schemas';

/**
 * Shown when the auth service refuses a sign-in without saying why.
 *
 * `POST /v1/auth/login` documents a 401 with no response body at all
 * (`documentation/auth-api.yaml`), so there is nothing to quote in that case. This
 * stands in — and, like the service's own refusal wording, it does not reveal which
 * of the two fields was wrong (epic brief R12).
 */
export const SIGN_IN_REFUSED_MESSAGE =
  'Sign-in failed. Check your details and try again.';

/**
 * Shown when the sign-in call did not fail on the credentials at all — the service
 * is unreachable or broke. Distinct from a refusal, because re-typing a correct
 * password would not help (project.md NFR-base-5).
 */
export const SIGN_IN_UNAVAILABLE_MESSAGE =
  'Sign-in is unavailable right now. Please try again in a moment.';

/** The statuses that mean "these credentials were not accepted". */
const REFUSAL_STATUS_CODES = [400, 401] as const;

/**
 * Submits credentials. Resolves when the session cookie has been set; rejects with
 * the `APIError` from the shared client otherwise.
 *
 * The body is PascalCase because the contract is (`LoginRequest`: `Username`,
 * `Password`) — a camelCase body is rejected as malformed.
 */
export const signIn = async (credentials: SignInValues): Promise<void> => {
  await post<DefaultResponse>(AUTH_ENDPOINTS.login, {
    Username: credentials.username,
    Password: credentials.password,
  });
};

/**
 * What to show the user for a failed sign-in.
 *
 * The auth service's own reason wins whenever it sent one — including a temporary
 * lockout and when it can be retried, which the service owns entirely (epic brief
 * R18). Nothing is added to it and nothing is counted here: the app keeps no tally
 * of failed attempts of its own.
 */
export const signInFailureMessage = (error: unknown): string => {
  const serviceMessage = serviceMessageOf(error);
  if (serviceMessage) {
    return serviceMessage;
  }

  const statusCode = statusCodeOf(error);
  return statusCode !== undefined &&
    (REFUSAL_STATUS_CODES as readonly number[]).includes(statusCode)
    ? SIGN_IN_REFUSED_MESSAGE
    : SIGN_IN_UNAVAILABLE_MESSAGE;
};
