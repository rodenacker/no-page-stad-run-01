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
 *
 * TWO PATHS ARE NOT CARRIED. This proxy hands the caller's headers over verbatim,
 * `LastChangedUser` included — which is fine for every operation whose audit name the
 * SERVER already decided (a file cancel sends one the page never sees), and not fine
 * for the two decide operations, where carrying it would let a browser record a
 * decision under any name it liked. Those two are answered by the app itself at
 * `/api/decisions`, which resolves the name from the session, so this mount refuses
 * them outright: nothing is forwarded, and the caller learns only that this is not an
 * address the app carries anywhere. The refusal is on the PATH, not on the header —
 * stripping `LastChangedUser` from everything would break the file cancel, which
 * legitimately relies on it travelling through here.
 */
import { DECIDE_SERVICE_PATHS } from '@/lib/api/decisions';
import { transactionsApiBaseUrl } from '@/lib/api/serviceBaseUrl';
import { forwardPathToService } from '@/lib/api/serviceProxy';

import type { NextRequest } from 'next/server';

/** Never prerendered and never cached — see the auth route for why. */
export const dynamic = 'force-dynamic';

interface TransactionsProxyContext {
  params: Promise<{ path: string[] }>;
}

/** The service paths this app answers itself, and therefore never forwards. */
const NOT_FORWARDED = new Set<string>(
  Object.values(DECIDE_SERVICE_PATHS).map((path) => path.toLowerCase()),
);

/**
 * The service path a forwarded call would ACTUALLY arrive at, so the refusal below is
 * measured against that rather than against the spelling the caller happened to use.
 *
 * This is the whole of the check, and comparing the raw `segments.join('/')` is a hole
 * straight through it. The segments come from a catch-all route, which hands them over
 * URL-DECODED, and the address is then assembled and normalised by `fetch` before the
 * service does its own decoding — so every one of these reaches the decide operation
 * while reading as something else on the way in:
 *
 * - `v1/transactions/x/../approve` — resolved away by the URL parser.
 * - `v1/transactions/%61pprove` — a second layer of encoding, undone by the service.
 * - `v1/transactions/Approve` — the service matches its routes case-insensitively.
 * - `v1//transactions/approve/` — empty segments, which the URL parser keeps and a
 *   server routing the call may not.
 *
 * So the path is resolved by the same parser `forwardPathToService` uses, against the
 * same configured base URL, then decoded once more, stripped of empty segments and
 * compared without case. Every one of those steps only ever widens what is REFUSED —
 * what is forwarded is still the caller's own path, untouched. A path that escapes the
 * mount point is `null`: nothing here refuses it, because `forwardPathToService`
 * refuses it already, and it is not one of these two.
 */
const decidePathAskedFor = (segments: readonly string[]): string | null => {
  try {
    const base = transactionsApiBaseUrl();
    // The trailing slash makes the mount a directory the target has to sit inside.
    const mount = new URL(`${base}/`);
    const target = new URL(`${base}/${segments.join('/')}`);

    if (
      target.origin !== mount.origin ||
      !target.pathname.startsWith(mount.pathname)
    ) {
      return null;
    }

    const servicePath = `/${target.pathname.slice(mount.pathname.length)}`;
    return `/${decodeURIComponent(servicePath)
      .split('/')
      .filter((segment) => segment !== '')
      .join('/')}`.toLowerCase();
  } catch {
    // A base URL that is not a URL, or a path that will not decode. Neither is one of
    // the two operations, and both are answered further down the same way they were
    // before this check existed.
    return null;
  }
};

/**
 * As on the auth route, the path the caller asked for is carried by
 * `forwardPathToService`, which keeps it inside the configured base URL — the
 * segments arrive decoded, so no address is assembled from them by concatenation.
 */
const forward = async (
  request: NextRequest,
  context: TransactionsProxyContext,
): Promise<Response> => {
  const { path } = await context.params;

  const asked = decidePathAskedFor(path);
  if (asked !== null && NOT_FORWARDED.has(asked)) {
    return new Response(null, { status: 404 });
  }

  return forwardPathToService(request, transactionsApiBaseUrl(), path);
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
