import type { NextConfig } from 'next';

/**
 * Where the two backend services actually live. Both come from configuration —
 * `AUTH_API_BASE_URL` / `TRANSACTIONS_API_BASE_URL` (server-only, preferred) or
 * the `NEXT_PUBLIC_*` names project.md defines — with this project's documented
 * localhost addresses as the development fallback. The automated end-to-end run
 * overrides the auth address to point at a stubbed auth service, which only works
 * because it is configurable.
 *
 * Read inside `rewrites()` rather than at module load so a value supplied by the
 * process environment is always the one that takes effect.
 */
const serviceBaseUrl = (
  serverOnlyName: string,
  publicName: string,
  fallback: string,
): string => {
  const configured = process.env[serverOnlyName] ?? process.env[publicName];
  return (configured?.trim() || fallback).replace(/\/+$/, '');
};

const nextConfig: NextConfig = {
  // Emit a minimal, self-contained server bundle in `.next/standalone`
  // so the Docker runtime image only needs Node + the traced dependencies.
  output: 'standalone',

  /**
   * Same-origin API routing (bff-auth-pattern.md §"Existing or multiple
   * backends"). The browser only ever calls the app's own address; Next forwards
   * each call to the backend that owns it. That keeps the two service addresses
   * out of the browser bundle, keeps the `session` cookie same-origin, and means
   * no cross-origin CORS negotiation is involved at all.
   *
   * The paths must stay in step with `AUTH_API_BASE_PATH` /
   * `TRANSACTIONS_API_BASE_PATH` in `src/lib/utils/constants.ts`, which is what
   * application code calls. They are repeated here because `next.config` is loaded
   * outside the app's module graph and its `@/` path alias.
   */
  async rewrites() {
    const authApi = serviceBaseUrl(
      'AUTH_API_BASE_URL',
      'NEXT_PUBLIC_AUTH_API_BASE_URL',
      'http://localhost:4424',
    );
    const transactionsApi = serviceBaseUrl(
      'TRANSACTIONS_API_BASE_URL',
      'NEXT_PUBLIC_TRANSACTIONS_API_BASE_URL',
      'http://localhost:4423/transactions-api',
    );

    return [
      { source: '/v1/auth/:path*', destination: `${authApi}/v1/auth/:path*` },
      {
        source: '/transactions-api/:path*',
        destination: `${transactionsApi}/:path*`,
      },
    ];
  },
};

export default nextConfig;
