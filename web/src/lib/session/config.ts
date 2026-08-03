/**
 * How long a session may sit idle, how much warning the user gets first, and the one
 * sentence they are given when it ends.
 *
 * Three things about this file are deliberate (epic `sign-in-and-app-shell` R16/R17,
 * requirements §6.6.1):
 *
 * - **The two timings are configuration, in SECONDS, converted here once.** They are
 *   read from `NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_SECONDS` and
 *   `NEXT_PUBLIC_SESSION_IDLE_WARNING_SECONDS` (documented in `web/.env.example`), so a
 *   tester can shorten them to seconds instead of waiting half an hour — and the whole
 *   app, both test layers included, derives everything from the two millisecond values
 *   exported below. Seconds in the environment, milliseconds in the code, one
 *   conversion point: nothing else in the app multiplies or divides these again.
 * - **The app asserts NO session lifetime of its own.** There is deliberately no
 *   absolute-session-cap timer here. The auth service owns any absolute cap (R17); all
 *   this app does is warn an idle user, and translate "the service says the session is
 *   gone" into the plain sentence below instead of a raw error.
 * - **One sentence, both ways out.** `SESSION_TIMED_OUT_MESSAGE` is what the user reads
 *   whether the idle period ran out or the auth service had already ended the session.
 *   Wording it once is what makes those two look the same to the person using the app,
 *   which is the whole point of R17.
 */

/** Working defaults from requirements §6.6.1: 30 minutes idle, 60 seconds of warning. */
const DEFAULT_IDLE_TIMEOUT_SECONDS = 1800;
const DEFAULT_WARNING_LEAD_SECONDS = 60;

/**
 * A positive number of seconds from a configured value, or the working default.
 *
 * An unset, empty, unparseable or non-positive value falls back rather than throwing:
 * a mistyped timing is not a reason to take the app down, and the fallback is the
 * documented default the user would have got anyway.
 */
const secondsOr = (
  configured: string | undefined,
  fallback: number,
): number => {
  const seconds = Number(configured?.trim());
  return Number.isFinite(seconds) && seconds > 0 ? seconds : fallback;
};

/**
 * Read as a direct property access on `process.env`, not through a variable name:
 * that is what lets Next.js inline the value into the browser bundle at build time.
 */
const idleTimeoutSeconds = secondsOr(
  process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_SECONDS,
  DEFAULT_IDLE_TIMEOUT_SECONDS,
);

/**
 * The warning is a lead-in to the end of the idle period, so it can never occupy more
 * than half of it — that keeps "warning appears" strictly after "session started
 * sitting idle" no matter how the two variables are set.
 */
const warningLeadSeconds = Math.min(
  secondsOr(
    process.env.NEXT_PUBLIC_SESSION_IDLE_WARNING_SECONDS,
    DEFAULT_WARNING_LEAD_SECONDS,
  ),
  idleTimeoutSeconds / 2,
);

/** How long a session may sit with no user activity before it ends, in milliseconds. */
export const SESSION_IDLE_TIMEOUT_MS = idleTimeoutSeconds * 1000;

/** How long before that end the warning appears, in milliseconds. */
export const SESSION_WARNING_LEAD_MS = warningLeadSeconds * 1000;

/** Heading for the timed-out notice, on the sign-in screen and in the notification. */
export const SESSION_TIMED_OUT_TITLE = 'Session timed out';

/**
 * The one plain-English explanation the user is given when their session ends —
 * whether it ran out of idle time here, or the auth service had already ended it.
 */
export const SESSION_TIMED_OUT_MESSAGE =
  'Your session timed out and you have been signed out, so please sign in again to carry on.';
