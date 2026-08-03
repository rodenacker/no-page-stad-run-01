/**
 * `/v1/auth/*` — the app's own address for the auth service.
 *
 * The browser calls this path; this handler forwards the call to whatever address
 * the RUNNING server is configured with (bff-auth-pattern.md §"Existing or
 * multiple backends"). That keeps the service's address out of the browser
 * bundle, keeps the `session` cookie same-origin so the browser attaches and
 * stores it by itself, and means no cross-origin CORS negotiation is involved
 * (project.md NFR-base-6).
 *
 * This replaced a `next.config.ts` rewrite, which looked equivalent but was not:
 * Next resolves `rewrites()` during `next build` and writes the literal
 * destination into `.next/routes-manifest.json`, so the running server's
 * configuration was ignored. One built artifact could not be promoted between
 * environments, and the automated end-to-end run could not point browser-side
 * calls at its stubbed auth service. Resolving the address here, on every call,
 * is what fixes both.
 */
import { authApiBaseUrl } from '@/lib/api/serviceBaseUrl';
import { forwardPathToService } from '@/lib/api/serviceProxy';
import { AUTH_API_BASE_PATH } from '@/lib/utils/constants';

import type { NextRequest } from 'next/server';

/**
 * Never prerendered and never cached: the whole point of this route is to read
 * configuration late, and an identity or sign-in call must reach the service every
 * time (epic brief BR3).
 */
export const dynamic = 'force-dynamic';

interface AuthProxyContext {
  params: Promise<{ path: string[] }>;
}

/**
 * The service's own path for these endpoints is the same `/v1/auth` prefix the
 * browser uses, so the constant application code calls with is reused here rather
 * than the prefix being retyped (`AUTH_API_BASE_PATH`, and this folder, are the
 * same address).
 *
 * The path the caller asked for is carried by `forwardPathToService`, which keeps it
 * inside that prefix — the segments arrive decoded, so an address is never assembled
 * from them by concatenation here.
 */
const forward = async (
  request: NextRequest,
  context: AuthProxyContext,
): Promise<Response> => {
  const { path } = await context.params;

  return forwardPathToService(
    request,
    `${authApiBaseUrl()}${AUTH_API_BASE_PATH}`,
    path,
  );
};

/**
 * The verbs the auth service accepts (`documentation/auth-api.yaml`): `POST` for
 * login and logout, `GET` for userinfo. Any other verb is not proxied, so it is
 * refused here rather than being carried to a service that would refuse it.
 */
export const GET = forward;
export const POST = forward;
