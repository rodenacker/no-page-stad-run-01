/**
 * Application Constants
 *
 * Application-wide constants: API paths, UI settings, business rules.
 */

/**
 * API paths — same-origin by design.
 *
 * This project talks to two backend services (auth-api and transactions-api),
 * and the browser addresses neither of them directly: it calls the app's own
 * address, and the rewrites in `next.config.ts` forward the call to the right
 * service. So there is no base URL to prepend to a browser-side call — the path
 * already carries the service prefix. That is why this is deliberately an empty
 * string rather than absent: `apiClient` has one documented place to look, and a
 * server-side caller (which cannot use a relative path) overrides it explicitly
 * with the service address from configuration.
 *
 * Same-origin also means the browser attaches the `session` cookie by itself and
 * no cross-origin CORS negotiation is involved (project.md NFR-base-6).
 */
export const API_BASE_PATH = '';

/** Same-origin prefix for auth-api calls; rewritten to the auth service. */
export const AUTH_API_BASE_PATH = '/v1/auth';

/**
 * Same-origin prefix for transactions-api calls; rewritten to the transactions
 * service (whose configured base URL already ends in `/transactions-api`).
 */
export const TRANSACTIONS_API_BASE_PATH = '/transactions-api';

/** The auth service's endpoints, as the browser addresses them. */
export const AUTH_ENDPOINTS = {
  login: `${AUTH_API_BASE_PATH}/login`,
  logout: `${AUTH_API_BASE_PATH}/logout`,
  userinfo: `${AUTH_API_BASE_PATH}/userinfo`,
} as const;

/**
 * Where a signed-in user belongs: the app's main signed-in screen. Sign-in sends
 * the user here, and it is the counterpart of `SIGN_IN_ROUTE`
 * (`src/lib/auth/requireSession.ts`), which is where a caller without a session is
 * sent. Kept here rather than beside it because that module is server-only.
 */
export const SIGNED_IN_HOME_ROUTE = '/';

/**
 * Default pagination settings
 * Customize based on your application's needs
 */
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 25,
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
} as const;

/**
 * Toast notification settings
 */
export const TOAST_SETTINGS = {
  DEFAULT_DURATION: 5000, // 5 seconds
  SUCCESS_DURATION: 3000, // 3 seconds
  ERROR_DURATION: 7000, // 7 seconds
  MAX_TOASTS: 3,
} as const;

/**
 * Modal settings
 */
export const MODAL_SETTINGS = {
  ANIMATION_DURATION: 150, // 150ms for enter/exit animations
} as const;

// Add your application-specific constants below
// Example:
// export const DATE_FORMATS = {
//   DISPLAY: 'dd MMM yyyy',
//   API: 'yyyy-MM-dd',
// } as const;
