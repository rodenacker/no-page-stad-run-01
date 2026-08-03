import type { NextConfig } from 'next';

/**
 * No backend address appears here, and none may be added.
 *
 * Same-origin API routing (bff-auth-pattern.md §"Existing or multiple backends")
 * lives in route handlers instead — `src/app/v1/auth/[...path]/route.ts` and
 * `src/app/transactions-api/[...path]/route.ts`. The browser still only ever calls
 * the app's own address; the difference is WHEN the service address is resolved.
 *
 * A `rewrites()` entry looks like the natural home for this, and was, until the
 * build output was examined: Next evaluates `rewrites()` during `next build` and
 * writes the literal destination into `.next/routes-manifest.json`. The running
 * server's `AUTH_API_BASE_URL` / `TRANSACTIONS_API_BASE_URL` then moved nothing —
 * one built artifact could not be promoted dev → staging → production, and the
 * automated end-to-end run could not point browser-side calls at its stubbed auth
 * service. The route handlers read the configuration per request, so both work.
 */
const nextConfig: NextConfig = {
  // Emit a minimal, self-contained server bundle in `.next/standalone`
  // so the Docker runtime image only needs Node + the traced dependencies.
  output: 'standalone',
};

export default nextConfig;
