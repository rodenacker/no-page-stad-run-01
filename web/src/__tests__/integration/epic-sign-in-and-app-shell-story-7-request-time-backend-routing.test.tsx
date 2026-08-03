/**
 * Story Metadata:
 * - Route: null (route handlers, not a page)
 * - Target File: web/src/app/v1/auth/[...path]/route.ts
 * - Page Action: create_new
 *
 * Epic "Sign in and the signed-in app shell", Story 7: backend addresses resolved
 * at REQUEST time, not build time (R14, BR1, BR2).
 *
 * Why this story has tests at all, given nothing changes on screen: `next build`
 * resolves `next.config.ts`'s `rewrites()` and writes the literal destination into
 * `.next/routes-manifest.json`. The running server's `AUTH_API_BASE_URL` then moves
 * nothing, so one artifact cannot be promoted between environments and the
 * production E2E run (`E2E_PROD=1`) cannot point browser-side calls at the stub.
 * The fix replaces those rewrites with route handlers that resolve the origin on
 * every call. These tests are TDD-red: the modules below do not exist yet.
 *
 * The contract, in one place:
 *
 *   web/src/app/v1/auth/[...path]/route.ts            (browser path /v1/auth/*)
 *   web/src/app/transactions-api/[...path]/route.ts   (browser path /transactions-api/*)
 *
 *     export const GET, POST (and every other verb its service accepts):
 *       (request: NextRequest, context: { params: Promise<{ path: string[] }> })
 *         => Promise<Response>
 *
 *     Auth forwards to         `${AUTH_ORIGIN}/v1/auth/${path.join('/')}${search}`
 *     Transactions forwards to `${TRANSACTIONS_ORIGIN}/${path.join('/')}${search}`
 *       — the `/transactions-api` prefix is the mount point, and the configured
 *       transactions base URL already ends in it (project.md §Data Source).
 *
 *     …where each ORIGIN is resolved ON EVERY CALL (story 1's `authApiBaseUrl()`
 *     and a transactions equivalent), from `AUTH_API_BASE_URL` /
 *     `TRANSACTIONS_API_BASE_URL` in preference to the `NEXT_PUBLIC_*` names —
 *     because `next build` inlines every `NEXT_PUBLIC_*` read as a literal, which
 *     is the very baking this story removes.
 *
 *     Forwarded on: the caller's method, body, and headers EXCEPT the hop-by-hop
 *     set (`connection`, `keep-alive`, `transfer-encoding`, `upgrade`) and a stale
 *     `host` / `content-length`. Added by the proxy: nothing — no `Authorization`,
 *     no credential read from the environment (cookie-session only, BR2).
 *
 *     Returned: the upstream status, body and `Set-Cookie` headers, passed through
 *     with `response.headers.getSetCookie()` so more than one survives intact.
 *
 *     Unreachable backend: HTTP 502 with an `ErrorResponse`-shaped body carrying a
 *     machine-readable `Error` code and NO `Message` — the proxy is not the auth
 *     service and must not put words in its mouth; each screen supplies its own
 *     plain wording (architecture.md §Conventions, bff-auth-pattern.md Rule 4).
 *
 * Mock data comes from the project-wide factories in web/src/mocks/data/ — the same
 * source the Playwright layer imports. No identity, login or logout body is
 * authored here.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { statusCodeOf } from '@/lib/api/errors';
import {
  SIGN_IN_UNAVAILABLE_MESSAGE,
  signIn,
  signInFailureMessage,
} from '@/lib/auth/signInApi';
import {
  SESSION_COOKIE_NAME,
  clearedSessionCookieOptions,
  sessionCookieHeader,
  sessionCookieOptions,
} from '@/lib/auth/sessionCookie';
import {
  loginSuccessResponse,
  logoutSuccessResponse,
  userInfoFor,
} from '@/mocks/data/identity';
import { ROLE_APPROVER } from '@/mocks/data/role';

import type { SessionCookieAttributes } from '@/lib/auth/sessionCookie';

/** The app's own address — the only origin the browser ever calls. */
const APP_ORIGIN = 'http://localhost:3000';

/**
 * Distinct sentinel origins, so an assertion can only pass if the address came
 * from the configuration the request was served under. The "promotion" pair is
 * what a promoted artifact / a restarted server with a new environment supplies.
 */
const AUTH_ORIGIN = 'https://auth.first.test.internal';
const AUTH_ORIGIN_AFTER_PROMOTION = 'https://auth.second.test.internal';
const TRANSACTIONS_ORIGIN = 'https://tx.first.test.internal/transactions-api';
const TRANSACTIONS_ORIGIN_AFTER_PROMOTION =
  'https://tx.second.test.internal/transactions-api';

/** The opaque session value the browser holds; never read by app code (BR2). */
const SESSION_VALUE = 'opaque-session-value-for-this-test-only';

/**
 * Placed in credential-shaped variables that the proxy must never read. If this
 * value turns up in a forwarded header, something started sending a credential.
 */
const CREDENTIAL_SENTINEL = 'sentinel-credential-no-proxy-may-forward';

/**
 * What the sign-in form submits. The username comes from the project-wide identity
 * source so it cannot drift from the account the mocked auth service knows; the
 * password is a self-describing mock value, never a real credential.
 */
const CREDENTIALS = {
  username: userInfoFor(ROLE_APPROVER).Email,
  password: 'mock-password-not-a-credential',
};

/** `LoginRequest` is PascalCase (documentation/auth-api.yaml). */
const LOGIN_BODY = JSON.stringify({
  Username: CREDENTIALS.username,
  Password: CREDENTIALS.password,
});

/** Headers a proxy must terminate rather than forward. */
const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
] as const;

// --- the route handlers under test -------------------------------------------

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

type RouteHandler = (
  request: NextRequest,
  context: RouteContext,
) => Promise<Response>;

interface ProxyRoute {
  GET: RouteHandler;
  POST: RouteHandler;
}

/**
 * `web/src/app/v1/auth/[...path]/route.ts` and its transactions counterpart.
 * Relative rather than the usual `@/` alias, because these are reached through a
 * variable specifier (see `loadProxy`), which Vite resolves at RUN time — where the
 * alias is not applied.
 */
const AUTH_ROUTE_MODULE = '../../app/v1/auth/[...path]/route';
const TRANSACTIONS_ROUTE_MODULE = '../../app/transactions-api/[...path]/route';

/**
 * Each route module is reached through a variable specifier, so that while it does
 * not exist yet this file still COLLECTS and every test fails on its own missing
 * module (the TDD-red signal) instead of the whole suite failing to load.
 */
const loadProxy = async (specifier: string): Promise<ProxyRoute> =>
  (await import(specifier)) as unknown as ProxyRoute;

const loadAuthProxy = (): Promise<ProxyRoute> => loadProxy(AUTH_ROUTE_MODULE);

const loadTransactionsProxy = (): Promise<ProxyRoute> =>
  loadProxy(TRANSACTIONS_ROUTE_MODULE);

/** The catch-all segments Next hands the handler for `[...path]`. */
const pathContext = (path: string[]): RouteContext => ({
  params: Promise.resolve({ path }),
});

/**
 * `NextRequest` narrows the standard `RequestInit` (its `signal` may not be
 * `null`), so the init is typed off the constructor rather than the global.
 */
type IncomingInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

/** A browser-side call arriving at the app's own address. */
const incoming = (path: string, init: IncomingInit = {}): NextRequest =>
  new NextRequest(`${APP_ORIGIN}${path}`, init);

/** A fresh sign-in request (a request body can only be read once). */
const loginRequest = (): NextRequest =>
  incoming('/v1/auth/login', {
    method: 'POST',
    body: LOGIN_BODY,
    headers: { 'content-type': 'application/json' },
  });

/** A fresh sign-out request, carrying the session the browser holds. */
const logoutRequest = (): NextRequest =>
  incoming('/v1/auth/logout', {
    method: 'POST',
    headers: { cookie: sessionCookieHeader(SESSION_VALUE) },
  });

// --- the upstream service (always mocked) ------------------------------------

interface ForwardedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

const forwarded: ForwardedRequest[] = [];

/** What the mocked service answers with; reassigned per test as needed. */
let upstreamResponse: () => Response;

const jsonResponse = (
  status: number,
  body: unknown,
  setCookies: readonly string[] = [],
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: [
      ['content-type', 'application/json'],
      ...setCookies.map((cookie): [string, string] => ['set-cookie', cookie]),
    ],
  });

const urlOf = (input: unknown): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (typeof input === 'object' && input !== null && 'url' in input) {
    return String((input as { url: unknown }).url);
  }
  return String(input);
};

/** Normalises either `fetch(request)` or `fetch(url, init)` into one Request. */
const asRequest = (input: unknown, init?: RequestInit): Request => {
  if (input instanceof Request) {
    return init === undefined ? input : new Request(input, init);
  }
  return new Request(urlOf(input), init);
};

const fetchStub = vi.fn(async (input: unknown, init?: RequestInit) => {
  const request = asRequest(input, init);
  forwarded.push({
    url: request.url,
    method: request.method,
    headers: new Headers(request.headers),
    body: await request.text(),
  });
  return upstreamResponse();
});

/** The request the backend saw most recently. */
const lastForwarded = (): ForwardedRequest => {
  const request = forwarded.at(-1);
  if (!request) {
    throw new Error(
      'The proxy made no request to the backend at all — nothing was forwarded.',
    );
  }
  return request;
};

const headerValuesOf = (headers: Headers): string[] => {
  const values: string[] = [];
  headers.forEach((value) => values.push(value));
  return values;
};

/** What Node's fetch throws when nothing is listening on the other end. */
const connectionRefused = (): TypeError =>
  new TypeError('fetch failed', {
    cause: new Error('connect ECONNREFUSED 127.0.0.1:4424'),
  });

/**
 * A `Set-Cookie` header as the auth service sends it, with the attributes taken
 * from the production helper — so "the attributes arrive intact" is measured
 * against the app's single source of truth rather than a literal retyped here.
 */
const upstreamSetCookie = (
  value: string,
  options: SessionCookieAttributes,
): string =>
  [
    `${SESSION_COOKIE_NAME}=${value}`,
    `Path=${options.path}`,
    options.maxAge === undefined ? undefined : `Max-Age=${options.maxAge}`,
    options.httpOnly ? 'HttpOnly' : undefined,
    options.secure ? 'Secure' : undefined,
    `SameSite=${options.sameSite === 'strict' ? 'Strict' : options.sameSite}`,
  ]
    .filter((part): part is string => part !== undefined)
    .join('; ');

// --- next.config: what `next build` could still bake in ----------------------

interface DeclaredRewrite {
  source: string;
  destination: string;
}

const declaredRewrites = async (): Promise<DeclaredRewrite[]> => {
  const { default: config } = await import('../../../next.config');
  if (typeof config.rewrites !== 'function') {
    return [];
  }
  const declared = await config.rewrites();
  return Array.isArray(declared)
    ? declared
    : [
        ...(declared.beforeFiles ?? []),
        ...(declared.afterFiles ?? []),
        ...(declared.fallback ?? []),
      ];
};

describe('Epic 1, Story 7: backend addresses resolved at request time', () => {
  beforeEach(() => {
    vi.resetModules();
    forwarded.length = 0;
    upstreamResponse = () => jsonResponse(200, loginSuccessResponse());
    // The server-only names are the ones a running server can still change.
    vi.stubEnv('AUTH_API_BASE_URL', AUTH_ORIGIN);
    vi.stubEnv('TRANSACTIONS_API_BASE_URL', TRANSACTIONS_ORIGIN);
    vi.stubEnv('NEXT_PUBLIC_AUTH_API_BASE_URL', undefined);
    vi.stubEnv('NEXT_PUBLIC_TRANSACTIONS_API_BASE_URL', undefined);
    // Cookies keep their `Secure` attribute (the opt-out is dev-only).
    vi.stubEnv('BFF_INSECURE_COOKIE', undefined);
    // Credential-shaped variables that must stay unread (BR2).
    vi.stubEnv('AUTH_API_TOKEN', CREDENTIAL_SENTINEL);
    vi.stubEnv('AUTH_API_KEY', CREDENTIAL_SENTINEL);
    vi.stubEnv('BACKEND_API_KEY', CREDENTIAL_SENTINEL);
    vi.stubGlobal('fetch', fetchStub);
  });

  afterEach(() => {
    fetchStub.mockClear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // AC-1
  it('addresses the auth service the running server is configured with, on every request', async () => {
    const { POST } = await loadAuthProxy();

    const first = await POST(loginRequest(), pathContext(['login']));
    expect(first.status).toBe(200);
    expect(lastForwarded().url).toBe(`${AUTH_ORIGIN}/v1/auth/login`);

    // The SAME already-loaded module now serves a request under a different
    // configuration — which is what promoting one artifact to another environment,
    // or restarting the server with a new address, gives it. An implementation that
    // read the address once (at module load, or at build time via `next.config`)
    // keeps addressing the first origin here: that is the bug this story fixes, so
    // this assertion must fail for it.
    vi.stubEnv('AUTH_API_BASE_URL', AUTH_ORIGIN_AFTER_PROMOTION);

    const second = await POST(loginRequest(), pathContext(['login']));
    expect(second.status).toBe(200);
    expect(lastForwarded().url).toBe(
      `${AUTH_ORIGIN_AFTER_PROMOTION}/v1/auth/login`,
    );
  });

  // AC-2
  it("forwards the caller's method, body and relevant headers — including the session cookie — and adds nothing of its own", async () => {
    const { GET, POST } = await loadAuthProxy();

    await POST(
      incoming('/v1/auth/login', {
        method: 'POST',
        body: LOGIN_BODY,
        headers: {
          'content-type': 'application/json',
          'accept-language': 'en-ZA',
          // Junk a real hop between browser and Next leaves behind: hop-by-hop
          // headers belong to that hop only, and both of these describe the
          // connection to the APP, not the one the proxy is about to open.
          connection: 'keep-alive',
          'keep-alive': 'timeout=5',
          'transfer-encoding': 'chunked',
          upgrade: 'websocket',
          host: 'localhost:3000',
          'content-length': '9999',
        },
      }),
      pathContext(['login']),
    );

    const signInCall = lastForwarded();
    expect(signInCall.method).toBe('POST');
    expect(signInCall.body).toBe(LOGIN_BODY);
    expect(signInCall.headers.get('content-type')).toBe('application/json');
    expect(signInCall.headers.get('accept-language')).toBe('en-ZA');

    for (const header of HOP_BY_HOP_HEADERS) {
      expect(signInCall.headers.get(header)).toBeNull();
    }
    // The caller's `host` and `content-length` describe the request to the app, not
    // the one being made to the backend; the runtime sets both for the new hop.
    expect(signInCall.headers.get('host')).toBeNull();
    expect(signInCall.headers.get('content-length')).toBeNull();

    // Cookie-session only: no auth header, and no credential picked up from the
    // environment (BR2, project.md §Authentication — there is nothing to hold).
    expect(signInCall.headers.get('authorization')).toBeNull();
    for (const value of headerValuesOf(signInCall.headers)) {
      expect(value).not.toContain(CREDENTIAL_SENTINEL);
    }

    // The session the browser holds is what authenticates every later call, so it
    // has to survive the hop untouched.
    upstreamResponse = () => jsonResponse(200, userInfoFor(ROLE_APPROVER));
    await GET(
      incoming('/v1/auth/userinfo', {
        headers: { cookie: sessionCookieHeader(SESSION_VALUE) },
      }),
      pathContext(['userinfo']),
    );

    const identityCall = lastForwarded();
    expect(identityCall.method).toBe('GET');
    expect(identityCall.url).toBe(`${AUTH_ORIGIN}/v1/auth/userinfo`);
    expect(identityCall.headers.get('cookie')).toBe(
      sessionCookieHeader(SESSION_VALUE),
    );
  });

  // AC-3
  it("passes the auth service's Set-Cookie headers back to the browser unchanged, including when there is more than one", async () => {
    const { POST } = await loadAuthProxy();
    const mintedSession = upstreamSetCookie(
      SESSION_VALUE,
      sessionCookieOptions(1800),
    );
    // A second cookie from the same response — a service behind a load balancer
    // sends one routinely. `get('set-cookie')` collapses the pair into one
    // comma-joined header, which the browser then stores as a single malformed
    // cookie and the session is lost; `getSetCookie()` is what keeps them apart.
    const affinityCookie = 'auth-lb=node-2; Path=/; HttpOnly; SameSite=Strict';
    upstreamResponse = () =>
      jsonResponse(200, loginSuccessResponse(), [
        mintedSession,
        affinityCookie,
      ]);

    const signedIn = await POST(loginRequest(), pathContext(['login']));

    expect(signedIn.status).toBe(200);
    await expect(signedIn.clone().json()).resolves.toEqual(
      loginSuccessResponse(),
    );
    expect(signedIn.headers.getSetCookie()).toEqual([
      mintedSession,
      affinityCookie,
    ]);

    // The security-relevant part, stated explicitly: the attributes the auth
    // service set are the attributes the browser is told to store (BR2).
    const [browserSessionCookie] = signedIn.headers.getSetCookie();
    expect(browserSessionCookie).toContain(
      `${SESSION_COOKIE_NAME}=${SESSION_VALUE}`,
    );
    expect(browserSessionCookie).toContain('HttpOnly');
    expect(browserSessionCookie).toContain('Secure');
    expect(browserSessionCookie).toContain('SameSite=Strict');
    expect(browserSessionCookie).toContain('Path=/');
    expect(browserSessionCookie).toContain('Max-Age=1800');

    // And signing out still clears it: the same attributes plus Max-Age=0, which is
    // the only form the browser acts on (bff-auth-pattern.md Rule 9).
    const clearedSession = upstreamSetCookie('', clearedSessionCookieOptions());
    upstreamResponse = () =>
      jsonResponse(200, logoutSuccessResponse(), [clearedSession]);

    const signedOut = await POST(logoutRequest(), pathContext(['logout']));

    expect(signedOut.status).toBe(200);
    expect(signedOut.headers.getSetCookie()).toEqual([clearedSession]);
    expect(signedOut.headers.getSetCookie()[0]).toContain('Max-Age=0');
  });

  // AC-4
  it('forwards the transactions paths from the same request-time configuration, so later epics inherit the fix', async () => {
    const { GET, POST } = await loadTransactionsProxy();
    // The body is immaterial here — this test pins the routing. The transactions
    // entity factories arrive with the epic that owns them.
    upstreamResponse = () => jsonResponse(200, []);

    const listed = await GET(
      incoming(
        '/transactions-api/v1/transactions?status=imported&status=approved',
        {
          headers: { cookie: sessionCookieHeader(SESSION_VALUE) },
        },
      ),
      pathContext(['v1', 'transactions']),
    );

    expect(listed.status).toBe(200);
    expect(lastForwarded().url).toBe(
      `${TRANSACTIONS_ORIGIN}/v1/transactions?status=imported&status=approved`,
    );
    // One session serves both services (project.md §Data Source), and still no
    // credential of the frontend's own.
    expect(lastForwarded().headers.get('cookie')).toBe(
      sessionCookieHeader(SESSION_VALUE),
    );
    expect(lastForwarded().headers.get('authorization')).toBeNull();

    // Same already-loaded module, new configuration — and a method a later epic
    // needs (uploading a file), so the fix is inherited rather than re-derived.
    vi.stubEnv(
      'TRANSACTIONS_API_BASE_URL',
      TRANSACTIONS_ORIGIN_AFTER_PROMOTION,
    );
    const uploadBody = JSON.stringify({ FileSourceId: 1 });

    const uploaded = await POST(
      incoming('/transactions-api/v1/files', {
        method: 'POST',
        body: uploadBody,
        headers: {
          'content-type': 'application/json',
          cookie: sessionCookieHeader(SESSION_VALUE),
        },
      }),
      pathContext(['v1', 'files']),
    );

    expect(uploaded.status).toBe(200);
    expect(lastForwarded().url).toBe(
      `${TRANSACTIONS_ORIGIN_AFTER_PROMOTION}/v1/files`,
    );
    expect(lastForwarded().method).toBe('POST');
    expect(lastForwarded().body).toBe(uploadBody);
  });

  // AC-5
  it('leaves no backend address anywhere the build can bake one in', async () => {
    // 1. Nothing for `next build` to resolve and freeze. It evaluates `rewrites()`
    //    at build time and writes the literal destination into
    //    `.next/routes-manifest.json`; asserting on the config rather than on
    //    `.next` catches that at its source, and needs no build to have run.
    const rules = await declaredRewrites();
    expect(rules.filter((rule) => rule.destination.includes('://'))).toEqual(
      [],
    );
    expect(
      rules.filter((rule) =>
        /^\/(v1\/auth|transactions-api)(\/|$)/.test(rule.source),
      ),
    ).toEqual([]);

    // 2. The origin comes from the variable a running server owns, in preference to
    //    the `NEXT_PUBLIC_` one — Next inlines every `NEXT_PUBLIC_*` read as a
    //    literal during `next build`, in the server bundle too, so preferring it
    //    would bake the address in just as surely as the old rewrite did.
    vi.stubEnv('AUTH_API_BASE_URL', AUTH_ORIGIN_AFTER_PROMOTION);
    vi.stubEnv('NEXT_PUBLIC_AUTH_API_BASE_URL', AUTH_ORIGIN);
    vi.stubEnv(
      'TRANSACTIONS_API_BASE_URL',
      TRANSACTIONS_ORIGIN_AFTER_PROMOTION,
    );
    vi.stubEnv('NEXT_PUBLIC_TRANSACTIONS_API_BASE_URL', TRANSACTIONS_ORIGIN);

    const auth = await loadAuthProxy();
    await auth.POST(loginRequest(), pathContext(['login']));
    expect(lastForwarded().url).toBe(
      `${AUTH_ORIGIN_AFTER_PROMOTION}/v1/auth/login`,
    );

    const transactions = await loadTransactionsProxy();
    upstreamResponse = () => jsonResponse(200, []);
    await transactions.GET(
      incoming('/transactions-api/v1/transactions'),
      pathContext(['v1', 'transactions']),
    );
    expect(lastForwarded().url).toBe(
      `${TRANSACTIONS_ORIGIN_AFTER_PROMOTION}/v1/transactions`,
    );
  });

  // AC-6
  it('answers a backend it cannot reach with an error the caller can act on, rather than crashing or hanging', async () => {
    const { POST } = await loadAuthProxy();
    fetchStub.mockRejectedValueOnce(connectionRefused());

    // Awaiting this at all is part of the assertion: a handler that lets the failure
    // escape renders Next's error page instead of a response, and one that waits on
    // a connection that never settles returns nothing at all.
    const response = await POST(loginRequest(), pathContext(['login']));

    expect(response.status).toBe(502);
    expect(response.headers.get('content-type')).toContain('application/json');

    const body = (await response.clone().json()) as { Error?: unknown };
    expect(typeof body.Error).toBe('string');
    expect(body.Error).not.toBe('');

    // Nothing internal leaks out with it (bff-auth-pattern.md Rule 4): not the
    // backend's address, not the underlying connection error, not a stack trace.
    const bodyText = await response.clone().text();
    expect(bodyText).not.toContain(new URL(AUTH_ORIGIN).host);
    expect(bodyText).not.toContain('ECONNREFUSED');
    expect(bodyText).not.toContain('    at ');

    // What the user is left with: the sign-in screen's own plain "try again"
    // wording (project.md NFR-base-5) — not a sentence this proxy invented and
    // passed off as the auth service's own (architecture.md §Conventions).
    fetchStub.mockResolvedValueOnce(response);
    const failure = await signIn(CREDENTIALS).then(
      () => 'the call resolved as if sign-in had succeeded' as const,
      (error: unknown) => error,
    );
    expect(failure).not.toBe('the call resolved as if sign-in had succeeded');
    expect(statusCodeOf(failure)).toBe(502);
    expect(signInFailureMessage(failure)).toBe(SIGN_IN_UNAVAILABLE_MESSAGE);
  });
});
