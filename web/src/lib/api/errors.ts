/**
 * Reading a failed API call.
 *
 * `apiClient` rejects with an `APIError` object (not an `Error` instance). Two
 * different kinds of message can end up on it:
 *
 * 1. the message the SERVICE sent — this project's services describe a failure in
 *    an `ErrorResponse` (`{ Error, Message }`) or a `DefaultResponse`
 *    (`{ Messages: [...] }`) body; and
 * 2. a placeholder the CLIENT invented, because the response carried no readable
 *    message at all (a bodyless 401, a network failure).
 *
 * Screens need to tell those apart: the service's own wording is what the user
 * should see (epic `sign-in-and-app-shell` AC-5), while a client placeholder is
 * internal plumbing the user should never read. `serviceMessageOf` draws that line
 * in one place, so every screen answers it the same way.
 */
import type { APIError } from '@/types/api';

/**
 * The messages `apiClient` supplies itself when a failed response carries no
 * readable message of its own. Defined here, next to the code that has to
 * recognise them, and imported by the client so the two can never drift.
 */
export const CLIENT_FALLBACK_MESSAGES = {
  unauthorized: 'Unauthorized: Please log in to continue',
  forbidden: 'Forbidden: You do not have permission to perform this action',
  notFound: 'Not Found: The requested resource does not exist',
  serverError: 'Internal Server Error: Something went wrong on the server',
  network: 'Network error: Unable to connect to the API server',
} as const;

const clientFallbackMessages: readonly string[] = Object.values(
  CLIENT_FALLBACK_MESSAGES,
);

/**
 * The detail lines `apiClient` supplies itself when a failed response carried no
 * readable message of its own — the `details` counterpart of
 * {@link CLIENT_FALLBACK_MESSAGES}, and the same "never put this in front of a
 * user" set. Kept here, next to the code that has to recognise them.
 */
const CLIENT_FALLBACK_DETAILS: readonly string[] = [
  'Your session may have expired. Please log in again.',
  'Access denied.',
  'Resource not found.',
  'Please try again later or contact support if the problem persists.',
  'Please check your internet connection and try again.',
];

/** The client's own "Request failed with status 503" style detail line. */
const CLIENT_STATUS_DETAIL = /^Request failed with status \d{3}$/;

/** Whether a caught value is shaped like the object `apiClient` rejects with. */
export const isAPIError = (error: unknown): error is APIError =>
  typeof error === 'object' &&
  error !== null &&
  'message' in error &&
  typeof (error as { message: unknown }).message === 'string';

/** The HTTP status of a failed call, when it carries one. */
export const statusCodeOf = (error: unknown): number | undefined => {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const { statusCode } = error as { statusCode?: unknown };
    return typeof statusCode === 'number' ? statusCode : undefined;
  }
  return undefined;
};

/**
 * The message the service itself sent, or `undefined` when the failure carries
 * only a client-side placeholder.
 *
 * A placeholder is either one of `CLIENT_FALLBACK_MESSAGES` or a status line the
 * client derived from the response (`HTTP 401: Unauthorized`) — never something a
 * user should be shown.
 */
export const serviceMessageOf = (error: unknown): string | undefined => {
  if (!isAPIError(error)) {
    return undefined;
  }
  const message = error.message.trim();
  if (!message) {
    return undefined;
  }
  if (clientFallbackMessages.includes(message)) {
    return undefined;
  }
  if (/HTTP \d{3}/.test(message)) {
    return undefined;
  }
  return message;
};

/**
 * The message the service sent in the failure's `details`, or `undefined` when the
 * details hold only a client-side placeholder.
 *
 * Why a second place has to be read: `apiClient` keeps the response's own
 * `Messages[]` on `details` for EVERY failure, but only some status branches also
 * promote the first of them onto `message`. A 500 does not — it puts its own
 * `CLIENT_FALLBACK_MESSAGES.serverError` placeholder on `message` — so for a
 * service that describes a refusal with a 500 + `DefaultResponse` body (which is
 * what `documentation/transactions-api.yaml` documents for the file endpoints),
 * `serviceMessageOf` alone finds nothing and the user would be shown
 * "Internal Server Error: …" (project.md NFR-base-5).
 *
 * Pair the two: `serviceMessageOf(error) ?? serviceDetailOf(error) ?? <own wording>`.
 */
export const serviceDetailOf = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('details' in error)) {
    return undefined;
  }
  const { details } = error as { details?: unknown };
  if (!Array.isArray(details)) {
    return undefined;
  }
  return details
    .filter((detail): detail is string => typeof detail === 'string')
    .map((detail) => detail.trim())
    .find(
      (detail) =>
        detail !== '' &&
        !CLIENT_FALLBACK_DETAILS.includes(detail) &&
        !CLIENT_STATUS_DETAIL.test(detail),
    );
};
