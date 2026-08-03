/**
 * Forwarding a browser-side call to the backend service that owns it.
 *
 * Server-side transport, not application code: the browser only ever calls the
 * app's own address (`/v1/auth/*`, `/transactions-api/*`), a route handler decides
 * which service that address belongs to, and this module carries the request
 * across. Application code never calls this — it calls `lib/api/client.ts`.
 *
 * What it guarantees, and why each part matters:
 *
 * - **Nothing is added.** No `Authorization` header, no credential read from the
 *   environment. This project is cookie-session only: the session travels in the
 *   `session` cookie the caller already sent, and the frontend holds no token at
 *   all (project.md §Authentication, epic brief BR2).
 * - **Hop-by-hop headers are terminated, not forwarded.** They describe the
 *   connection the caller made to THIS app, not the new one being opened to the
 *   service (RFC 9110 §7.6.1). `host` and `content-length` go the same way: both
 *   describe the old hop, and the runtime sets them for the new one.
 * - **The forwarded address cannot leave the mount point.** The caller supplies the
 *   path, so the assembled address is normalised and checked against the prefix it
 *   must stay under before anything is sent — see `forwardPathToService`.
 * - **`Set-Cookie` is passed back with `getSetCookie()`.** A plain
 *   `headers.get('set-cookie')` collapses several cookies into one comma-joined
 *   header, which a browser stores as a single malformed cookie — losing the
 *   session. `getSetCookie()` keeps them apart, so each arrives with the
 *   attributes the service set (`HttpOnly`, `Secure`, `SameSite=Strict`); those
 *   attributes stay the service's to set, with `lib/auth/sessionCookie.ts` as the
 *   app's own single source of truth for them.
 * - **An unreachable service is an answer, not a crash.** The caller gets a 502
 *   carrying a machine-readable code and no wording: the proxy is not the service
 *   and must not put words in its mouth, so each screen supplies its own plain
 *   sentence. Nothing internal travels with it — not the service's address, not
 *   the underlying connection error, not a stack trace (bff-auth-pattern.md
 *   Rule 4). The detail is logged server-side instead, where it is useful and
 *   private (CLAUDE.md §3 — the error is reported, never dismissed).
 */
import type { ErrorResponse } from '@/types/api';

/**
 * The code a caller gets when the service could not be reached at all. Distinct
 * from anything a service itself returns, so a screen can tell "nobody answered"
 * apart from "the service refused".
 */
export const BACKEND_UNREACHABLE_ERROR = 'BACKEND_UNREACHABLE';

/** Headers belonging to a single connection, never to the message (RFC 9110 §7.6.1). */
const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
] as const;

/**
 * Dropped on the way out: the hop-by-hop set, plus the two headers that describe
 * the request the CALLER made to this app rather than the one being made now.
 */
const DROPPED_REQUEST_HEADERS = new Set<string>([
  ...HOP_BY_HOP_HEADERS,
  'host',
  'content-length',
]);

/**
 * Dropped on the way back: the hop-by-hop set, plus the two headers that describe
 * the body as it arrived over the wire. `fetch` has already decoded and buffered
 * it, so a forwarded `content-encoding` would tell the browser to decode a body
 * that is already plain, and a forwarded `content-length` would be the compressed
 * length. `set-cookie` is excluded here only because it is re-added individually
 * below — collapsing it is the one thing this proxy must not do.
 */
const DROPPED_RESPONSE_HEADERS = new Set<string>([
  ...HOP_BY_HOP_HEADERS,
  'content-length',
  'content-encoding',
  'set-cookie',
]);

/** Statuses whose response must carry no body at all. */
const STATUSES_WITHOUT_BODY = new Set([101, 103, 204, 205, 304]);

/** Methods whose request carries no body. */
const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD']);

const forwardedHeaders = (incoming: Headers): Headers => {
  const headers = new Headers();
  incoming.forEach((value, name) => {
    if (!DROPPED_REQUEST_HEADERS.has(name.toLowerCase())) {
      headers.set(name, value);
    }
  });
  return headers;
};

/**
 * The caller's body, buffered.
 *
 * Buffered rather than streamed because streaming a request body requires the
 * `duplex` negotiation, and an expense CSV is measured in megabytes. An empty
 * body is reported as absent so no zero-length body is invented for a POST that
 * never had one (sign-out sends none).
 */
const forwardedBody = async (
  request: Request,
): Promise<ArrayBuffer | undefined> => {
  if (METHODS_WITHOUT_BODY.has(request.method.toUpperCase())) {
    return undefined;
  }
  const body = await request.arrayBuffer();
  return body.byteLength > 0 ? body : undefined;
};

/** The service's own answer, headers and cookies intact. */
const answeredWith = (upstream: Response): Response => {
  const headers = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!DROPPED_RESPONSE_HEADERS.has(name.toLowerCase())) {
      headers.set(name, value);
    }
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append('set-cookie', cookie);
  }

  return new Response(
    STATUSES_WITHOUT_BODY.has(upstream.status) ? null : upstream.body,
    {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    },
  );
};

/** A 502 the caller can act on, carrying a code and no wording of ours. */
const unreachable = (): Response =>
  new Response(
    JSON.stringify({
      Error: BACKEND_UNREACHABLE_ERROR,
    } satisfies Pick<ErrorResponse, 'Error'>),
    { status: 502, headers: { 'content-type': 'application/json' } },
  );

/**
 * Carries `request` to `targetUrl` and returns what came back.
 *
 * `redirect: 'manual'` so a redirect the service issues is handed to the browser
 * to follow, rather than followed here against a caller who cannot see it.
 */
export const forwardToService = async (
  request: Request,
  targetUrl: string,
): Promise<Response> => {
  const forwarded: RequestInit = {
    method: request.method,
    headers: forwardedHeaders(request.headers),
    body: await forwardedBody(request),
    redirect: 'manual',
    cache: 'no-store',
  };

  try {
    return answeredWith(await fetch(targetUrl, forwarded));
  } catch (error) {
    console.error(
      `Could not reach the backend service at ${targetUrl} for ` +
        `${request.method} ${new URL(request.url).pathname}.`,
      error,
    );
    return unreachable();
  }
};

/**
 * The caller asked for a path this app does not forward. Answered by the app itself,
 * as a plain 404: nothing is sent to any service, and the caller learns only that
 * this is not an address the app carries anywhere.
 */
const notProxied = (): Response => new Response(null, { status: 404 });

/**
 * The service address for the path segments the caller asked for, or `null` when
 * those segments do not stay inside `prefix`.
 *
 * This check is the reason the address is not simply concatenated. The segments come
 * from a catch-all route, which hands them over URL-DECODED, so a caller can put
 * anything in them that percent-encoding survives — `..`, a backslash, an extra
 * slash. `fetch` normalises the address it is given, so a concatenated
 * `…/v1/auth/` + `../../internal` would be sent as `/internal`: a path the browser
 * can reach through this app that the mount point was never meant to expose, on a
 * host that may serve more than the one service. So the address is normalised HERE,
 * by the same URL parser, and then measured against the mount point it must sit
 * under — origin and path both. Anything that escapes is refused rather than sent.
 */
const resolvedTarget = (
  prefix: string,
  segments: readonly string[],
  search: string,
): string | null => {
  try {
    // The trailing slash makes the prefix a directory to stay inside, so
    // `/v1/authorise` cannot pass as a path under `/v1/auth`.
    const mountPoint = new URL(`${prefix}/`);
    const target = new URL(`${prefix}/${segments.join('/')}${search}`);

    return target.origin === mountPoint.origin &&
      target.pathname.startsWith(mountPoint.pathname)
      ? target.href
      : null;
  } catch {
    // A prefix that is not a URL at all is a misconfigured service address, not a
    // request to forward.
    return null;
  }
};

/**
 * Carries `request` to the service mounted at `prefix`, under the path the caller
 * asked for — the one entry point a route handler uses, so every mount gets the same
 * boundary check and none of them assembles an address of its own.
 */
export const forwardPathToService = async (
  request: Request,
  prefix: string,
  segments: readonly string[],
): Promise<Response> => {
  const target = resolvedTarget(prefix, segments, new URL(request.url).search);

  return target === null ? notProxied() : forwardToService(request, target);
};
