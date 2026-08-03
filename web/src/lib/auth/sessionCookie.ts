/**
 * The one place the `session` cookie's name and attributes are defined.
 *
 * The auth service mints the cookie on `POST /v1/auth/login`; when the Next.js
 * server has to re-set it (forwarding a sign-in response) or clear it (sign-out),
 * it must use the SAME attributes both times — a single mismatched attribute
 * silently fails to clear the cookie (bff-auth-pattern.md Rule 9). Deriving the
 * set and the cleared form from one helper is what makes that impossible.
 *
 * The value itself is opaque and never leaves the server-to-server boundary: no
 * component receives it, and nothing here reads it (brief BR2).
 */

/** The cookie name the auth service and both backends agree on. */
export const SESSION_COOKIE_NAME = 'session';

/**
 * Attributes for the `session` cookie, in the shape `cookies().set()` expects.
 * `maxAge` is the only attribute that differs between setting and clearing.
 */
export interface SessionCookieAttributes {
  httpOnly: true;
  secure: boolean;
  sameSite: 'strict';
  path: '/';
  maxAge?: number;
}

/**
 * `Secure` is on by default. Local development over plain HTTP can opt out with
 * `BFF_INSECURE_COOKIE=1` (bff-auth-pattern.md §Cookie Defaults) — it is never
 * hardcoded off, which would silently break an HTTPS deployment.
 */
const attributes = (): Omit<SessionCookieAttributes, 'maxAge'> => ({
  httpOnly: true,
  secure: process.env.BFF_INSECURE_COOKIE !== '1',
  sameSite: 'strict',
  path: '/',
});

/**
 * Attributes for setting the session cookie. Pass the `Max-Age` the auth service
 * returned so its sliding-window session lifetime is preserved rather than
 * replaced with a guess.
 */
export const sessionCookieOptions = (
  maxAgeSeconds?: number,
): SessionCookieAttributes => ({
  ...attributes(),
  ...(maxAgeSeconds === undefined ? {} : { maxAge: maxAgeSeconds }),
});

/** The same attributes plus `Max-Age=0`, which is what actually clears it. */
export const clearedSessionCookieOptions = (): SessionCookieAttributes => ({
  ...attributes(),
  maxAge: 0,
});

/** The `Cookie:` request-header value that conveys a session server-side. */
export const sessionCookieHeader = (sessionValue: string): string =>
  `${SESSION_COOKIE_NAME}=${sessionValue}`;
