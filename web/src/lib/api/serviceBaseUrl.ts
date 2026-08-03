/**
 * Where the two backend services live — resolved ON EVERY CALL.
 *
 * Server-side only. Both addresses come from configuration, never from a literal
 * in application code, and the ORDER the names are read in is load-bearing:
 *
 * - `AUTH_API_BASE_URL` / `TRANSACTIONS_API_BASE_URL` (server-only) are read
 *   first. Nothing inlines them, so the value a RUNNING server was started with
 *   is the value that takes effect — which is what lets one built artifact be
 *   promoted dev → staging → production unchanged.
 * - `NEXT_PUBLIC_AUTH_API_BASE_URL` / `NEXT_PUBLIC_TRANSACTIONS_API_BASE_URL`
 *   (the names project.md defines) are the fallback. They are a fallback rather
 *   than the preferred source because `next build` replaces every
 *   `process.env.NEXT_PUBLIC_*` read with a literal — in the server bundle too —
 *   so preferring them would freeze the address into the build output.
 *
 * Each function is called per request rather than assigned to a module constant,
 * for the same reason: a constant is captured once, when the server starts.
 */

/**
 * Development fallbacks only — the localhost addresses project.md records for the
 * two services. Deployed environments set the env vars.
 */
const DEFAULT_AUTH_API_BASE_URL = 'http://localhost:4424';
const DEFAULT_TRANSACTIONS_API_BASE_URL =
  'http://localhost:4423/transactions-api';

/** The first configured address that carries a value, without a trailing slash. */
const configuredBaseUrl = (
  serverOnly: string | undefined,
  publicName: string | undefined,
  fallback: string,
): string =>
  (serverOnly?.trim() || publicName?.trim() || fallback).replace(/\/+$/, '');

/** The auth service's base URL, as configured for this request. */
export const authApiBaseUrl = (): string =>
  configuredBaseUrl(
    process.env.AUTH_API_BASE_URL,
    process.env.NEXT_PUBLIC_AUTH_API_BASE_URL,
    DEFAULT_AUTH_API_BASE_URL,
  );

/**
 * The transactions service's base URL, as configured for this request. The
 * configured value already ends in `/transactions-api` (project.md §Data Source),
 * so callers append the endpoint path to it directly.
 */
export const transactionsApiBaseUrl = (): string =>
  configuredBaseUrl(
    process.env.TRANSACTIONS_API_BASE_URL,
    process.env.NEXT_PUBLIC_TRANSACTIONS_API_BASE_URL,
    DEFAULT_TRANSACTIONS_API_BASE_URL,
  );
