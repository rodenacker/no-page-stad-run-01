/**
 * `/transactions-api/*` — the app's own address for the transactions service.
 *
 * The counterpart of `app/v1/auth/[...path]/route.ts`, and identical in shape: the
 * browser calls this path, and the call is forwarded to whatever address the
 * RUNNING server is configured with, resolved on every call. Later epics own the
 * screens that use it (files, transactions, users, roles, file-sources) and
 * inherit this routing without adding any of their own.
 *
 * The `/transactions-api` segment is the mount point only. The configured base URL
 * already ends in `/transactions-api` (project.md §Data Source & Backend
 * Integration), so the prefix is dropped here rather than being sent twice.
 *
 * The same `session` cookie serves both services — the transactions service trusts
 * the session the auth service minted (project.md §Authentication) — and, as
 * there, nothing of the frontend's own is added to the call.
 */
import { transactionsApiBaseUrl } from '@/lib/api/serviceBaseUrl';
import { forwardToService } from '@/lib/api/serviceProxy';

import type { NextRequest } from 'next/server';

/** Never prerendered and never cached — see the auth route for why. */
export const dynamic = 'force-dynamic';

interface TransactionsProxyContext {
  params: Promise<{ path: string[] }>;
}

const forward = async (
  request: NextRequest,
  context: TransactionsProxyContext,
): Promise<Response> => {
  const { path } = await context.params;
  const { search } = new URL(request.url);

  return forwardToService(
    request,
    `${transactionsApiBaseUrl()}/${path.join('/')}${search}`,
  );
};

/**
 * The verbs the transactions service accepts
 * (`documentation/transactions-api.yaml`): `GET` reads, `POST` uploads and
 * decisions, `PUT` settings and role/user edits, `DELETE` file and user removal.
 * It defines no `PATCH`, so none is proxied.
 */
export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const DELETE = forward;
