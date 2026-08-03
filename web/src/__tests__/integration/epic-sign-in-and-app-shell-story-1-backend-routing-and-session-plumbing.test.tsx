/**
 * Story Metadata:
 * - Route: null (infrastructure-only story — no page of its own)
 * - Target File: web/src/lib/auth/requireSession.ts
 * - Page Action: create_new
 *
 * Epic "Sign in and the signed-in app shell", Story 1: backend routing, session
 * plumbing and role types (R14, BR1, BR2, BR3, NFR4).
 *
 * This story ships no UI, so its observable surface is the *module contract* the
 * later stories consume. These tests are TDD-red: they fail until the modules
 * below exist. The contract, in one place, is:
 *
 *   web/next.config.ts
 *     export default { async rewrites(): Promise<Array<{source, destination}>> }
 *       { source: '/v1/auth/:path*',        destination: `${AUTH_BASE}/v1/auth/:path*` }
 *       { source: '/transactions-api/:path*', destination: `${TX_BASE}/:path*` }
 *     …where AUTH_BASE / TX_BASE come from NEXT_PUBLIC_AUTH_API_BASE_URL and
 *     NEXT_PUBLIC_TRANSACTIONS_API_BASE_URL (project.md §"Required env var shape").
 *     No `http://localhost:8042` default anywhere.
 *
 *   web/src/lib/utils/constants.ts   (REWIRE — drop API_BASE_URL's 8042 default)
 *     AUTH_API_BASE_PATH         = '/v1/auth'          (same-origin, relative)
 *     TRANSACTIONS_API_BASE_PATH = '/transactions-api' (same-origin, relative)
 *     AUTH_ENDPOINTS = { login, logout, userinfo }     (relative paths)
 *
 *   web/src/lib/auth/sessionCookie.ts
 *     SESSION_COOKIE_NAME = 'session'
 *     sessionCookieOptions(maxAgeSeconds?: number)  → cookie attributes for the
 *       forwarded sign-in cookie (httpOnly, sameSite 'strict', path '/', secure, maxAge)
 *     clearedSessionCookieOptions()                 → the SAME attributes + maxAge 0
 *
 *   web/src/lib/auth/requireSession.ts
 *     requireSession(): Promise<UserInfoRead>  — reads the `session` cookie,
 *       resolves GET /v1/auth/userinfo server-side (Cookie forwarded on the fetch
 *       init), returns the real UserInfoRead shape (Id, Email, FirstName,
 *       LastName, RolesString, Roles[]), and redirect()s to '/sign-in' when there
 *       is no cookie or the auth service rejects it.
 *
 *   web/src/lib/auth/roles.ts
 *     isProjectRole(name: string): boolean
 *     rolesOf(session): ProjectRole[]   — only the recognised project roles
 *     hasRole(session, role): boolean
 *
 * Mock data comes from the project-wide factories in web/src/mocks/data/ — the
 * same source the Playwright layer imports. No response body is authored here.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  ROLE_APPROVER,
  ROLE_FINANCE_UPLOADER,
  createRole,
} from '@/mocks/data/role';
import { userInfoFor, userInfoForRoles } from '@/mocks/data/identity';
import { createUser } from '@/mocks/data/user';

/** Distinct sentinels so a destination can only match if it came from config. */
const AUTH_BASE = 'https://auth.test.internal';
const TX_BASE = 'https://tx.test.internal/transactions-api';

/** The opaque session value the browser holds — must never reach app code. */
const SESSION_VALUE = 'opaque-session-value-for-this-test-only';

// --- framework boundaries (not the code under test) ----------------------------

/** Set per test; `undefined` means "no session cookie on the request". */
let sessionCookieValue: string | undefined;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'session' && sessionCookieValue !== undefined
        ? { name: 'session', value: sessionCookieValue }
        : undefined,
    has: (name: string) =>
      name === 'session' && sessionCookieValue !== undefined,
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

// Real `redirect()` throws NEXT_REDIRECT and never returns; mirroring that is
// what lets us assert "the caller is sent to sign-in before anything renders".
vi.mock('next/navigation', () => ({
  redirect: (target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
}));

// --- fetch recorder -----------------------------------------------------------

interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
}

interface MockResponse {
  ok: boolean;
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

const requests: RecordedRequest[] = [];
let userinfoResponse: MockResponse;

const jsonResponse = (status: number, body: unknown): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body,
  text: async () => JSON.stringify(body ?? null),
});

const urlOf = (input: unknown): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (typeof input === 'object' && input !== null && 'url' in input) {
    return String((input as { url: unknown }).url);
  }
  return String(input);
};

/** Headers from either a Request-like first argument or the fetch init. */
const headersOf = (input: unknown, init?: RequestInit): Headers => {
  const merged = new Headers();
  if (typeof input === 'object' && input !== null && 'headers' in input) {
    const inputHeaders = (input as { headers?: unknown }).headers;
    if (inputHeaders instanceof Headers) {
      inputHeaders.forEach((value, key) => merged.set(key, value));
    }
  }
  new Headers(init?.headers ?? {}).forEach((value, key) =>
    merged.set(key, value),
  );
  return merged;
};

const recordingFetch = vi.fn((input: unknown, init?: RequestInit) => {
  requests.push({
    url: urlOf(input),
    method: String(init?.method ?? 'GET').toUpperCase(),
    headers: headersOf(input, init),
  });
  return Promise.resolve(userinfoResponse as unknown as Response);
});

const requestTo = (pathFragment: string): RecordedRequest => {
  const match = requests.find((request) => request.url.includes(pathFragment));
  if (!match) {
    throw new Error(
      `No outgoing request to "${pathFragment}". Requests made: ` +
        `${requests.map((request) => request.url).join(', ') || '(none)'}.`,
    );
  }
  return match;
};

// --- next.config helpers ------------------------------------------------------

interface RewriteRule {
  source: string;
  destination: string;
}

const loadRewriteRules = async (): Promise<RewriteRule[]> => {
  const configModule = await import('../../../next.config');
  const config = configModule.default;
  if (typeof config.rewrites !== 'function') {
    throw new Error(
      'web/next.config.ts must export an async rewrites() so the browser only ever ' +
        'calls same-origin paths (bff-auth-pattern.md § "Existing or multiple backends").',
    );
  }
  const result = await config.rewrites();
  if (!Array.isArray(result)) {
    throw new Error(
      'rewrites() must return a flat array of { source, destination } rules.',
    );
  }
  return result;
};

const destinationFor = (rules: RewriteRule[], source: string): string => {
  const rule = rules.find((candidate) => candidate.source === source);
  if (!rule) {
    throw new Error(
      `No rewrite declared for source "${source}". Declared sources: ` +
        `${rules.map((candidate) => candidate.source).join(', ') || '(none)'}.`,
    );
  }
  return rule.destination;
};

/** Asserts the promise redirected, and returns where to. */
const redirectTargetOf = async (call: Promise<unknown>): Promise<string> => {
  try {
    await call;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = /^NEXT_REDIRECT:(.*)$/.exec(message);
    if (match) return match[1];
    throw error;
  }
  throw new Error(
    'Expected the caller to be redirected to the sign-in screen, but the call resolved.',
  );
};

describe('Epic 1, Story 1: backend routing, session plumbing and role types', () => {
  beforeEach(() => {
    vi.resetModules();
    requests.length = 0;
    sessionCookieValue = SESSION_VALUE;
    userinfoResponse = jsonResponse(200, userInfoFor(ROLE_APPROVER));
    vi.stubEnv('NEXT_PUBLIC_AUTH_API_BASE_URL', AUTH_BASE);
    vi.stubEnv('NEXT_PUBLIC_TRANSACTIONS_API_BASE_URL', TX_BASE);
    // The template's single stale variable must play no part any more.
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', undefined);
    vi.stubGlobal('fetch', recordingFetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // AC-1
  // Runtime-only: that the dev/production server actually proxies these rewrites
  // is exercised by Story 2's browser sign-in journey and the manual checklist.
  it('sends the browser to same-origin paths for sign-in, sign-out and identity, and forwards them to the auth service', async () => {
    const { AUTH_ENDPOINTS, AUTH_API_BASE_PATH, TRANSACTIONS_API_BASE_PATH } =
      await import('@/lib/utils/constants');

    // What the browser is pointed at: relative paths only — no other origin is
    // reachable from client code (BR2, epic brief §Notes: same-origin rewrites).
    expect(AUTH_ENDPOINTS.login).toBe('/v1/auth/login');
    expect(AUTH_ENDPOINTS.logout).toBe('/v1/auth/logout');
    expect(AUTH_ENDPOINTS.userinfo).toBe('/v1/auth/userinfo');
    for (const path of Object.values(AUTH_ENDPOINTS)) {
      expect(path).not.toContain('://');
    }
    expect(AUTH_API_BASE_PATH).toBe('/v1/auth');
    expect(TRANSACTIONS_API_BASE_PATH).toBe('/transactions-api');

    // What the app's own address forwards them to.
    const rules = await loadRewriteRules();
    expect(destinationFor(rules, '/v1/auth/:path*')).toBe(
      `${AUTH_BASE}/v1/auth/:path*`,
    );
    expect(destinationFor(rules, '/transactions-api/:path*')).toBe(
      `${TX_BASE}/:path*`,
    );
    // Every rewrite is entered from the app's own address.
    for (const rule of rules) {
      expect(rule.source.startsWith('/')).toBe(true);
    }
  });

  // AC-2
  // Runtime-only: that the layout gate blocks rendering before protected content
  // appears is asserted in Story 3's Playwright spec; this pins the helper's own
  // resolution and redirect contract.
  it('resolves the signed-in name, email and role set from the real identity response, and sends a caller with no valid session to sign-in', async () => {
    const { requireSession } = await import('@/lib/auth/requireSession');
    const expected = userInfoFor(ROLE_APPROVER);

    const session = await requireSession();
    expect(session.FirstName).toBe(expected.FirstName);
    expect(session.LastName).toBe(expected.LastName);
    expect(session.Email).toBe(expected.Email);
    expect(session.RolesString).toBe(expected.RolesString);
    expect(session.Roles.map((role: { Name: string }) => role.Name)).toEqual([
      ROLE_APPROVER,
    ]);
    // Resolved from the auth service on this call — not from a cached value (BR3).
    expect(requestTo('/v1/auth/userinfo').method).toBe('GET');

    // No session cookie at all → sign-in screen.
    sessionCookieValue = undefined;
    expect(await redirectTargetOf(requireSession())).toMatch(
      /^\/sign-in(\?|$)/,
    );

    // A cookie the auth service rejects → sign-in screen.
    sessionCookieValue = 'stale-session-value';
    userinfoResponse = jsonResponse(401, undefined);
    expect(await redirectTargetOf(requireSession())).toMatch(
      /^\/sign-in(\?|$)/,
    );
  });

  // AC-3
  it('keeps the session out of browser-reachable code, conveying it only in the cookie, set and cleared with matching attributes', async () => {
    const { requireSession } = await import('@/lib/auth/requireSession');
    const {
      SESSION_COOKIE_NAME,
      sessionCookieOptions,
      clearedSessionCookieOptions,
    } = await import('@/lib/auth/sessionCookie');

    // 1. What the server hands to components carries no credential — the opaque
    //    session value is nowhere in it (BR2).
    const session = await requireSession();
    expect(JSON.stringify(session)).not.toContain(SESSION_VALUE);
    expect(
      Object.keys(session).filter((key) =>
        /token|password|secret|session|cookie|credential/i.test(key),
      ),
    ).toEqual([]);

    // 2. The cookie is the sole conveyance: it is forwarded on the identity call,
    //    and no static credential header goes with it (no NEXT_PUBLIC token).
    const userinfoRequest = requestTo('/v1/auth/userinfo');
    expect(userinfoRequest.headers.get('cookie')).toContain(
      `session=${SESSION_VALUE}`,
    );
    expect(userinfoRequest.headers.get('authorization')).toBeNull();

    // 3. Sign-out clears exactly what sign-in set (bff-auth-pattern.md Rule 9 —
    //    a mismatched attribute silently fails to clear the cookie).
    expect(SESSION_COOKIE_NAME).toBe('session');
    const { maxAge: setMaxAge, ...setAttributes } = sessionCookieOptions(1800);
    const { maxAge: clearedMaxAge, ...clearedAttributes } =
      clearedSessionCookieOptions();
    expect(setAttributes).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
    });
    expect(clearedAttributes).toEqual(setAttributes);
    expect(setMaxAge).toBe(1800);
    expect(clearedMaxAge).toBe(0);
  });

  // AC-4
  it('recognises exactly the two project roles and grants nothing for any other role name', async () => {
    const { hasRole, rolesOf, isProjectRole } =
      await import('@/lib/auth/roles');

    const uploader = userInfoFor(ROLE_FINANCE_UPLOADER);
    const approver = userInfoFor(ROLE_APPROVER);
    const both = userInfoForRoles([ROLE_FINANCE_UPLOADER, ROLE_APPROVER]);

    expect(hasRole(uploader, ROLE_FINANCE_UPLOADER)).toBe(true);
    expect(hasRole(uploader, ROLE_APPROVER)).toBe(false);
    expect(hasRole(approver, ROLE_APPROVER)).toBe(true);
    expect(hasRole(approver, ROLE_FINANCE_UPLOADER)).toBe(false);
    expect(rolesOf(both)).toEqual([ROLE_FINANCE_UPLOADER, ROLE_APPROVER]);

    // The auth spec's own "Viewer" example is NOT a role of this project
    // (epic brief §Notes & Caveats) — it must grant nothing at all.
    const outsider = createUser({
      Roles: [createRole({ Id: 9, Name: 'Viewer' })],
      RolesString: 'Viewer',
    });
    expect(isProjectRole('Viewer')).toBe(false);
    expect(rolesOf(outsider)).toEqual([]);
    expect(hasRole(outsider, ROLE_FINANCE_UPLOADER)).toBe(false);
    expect(hasRole(outsider, ROLE_APPROVER)).toBe(false);
    expect(isProjectRole(ROLE_FINANCE_UPLOADER)).toBe(true);
    expect(isProjectRole(ROLE_APPROVER)).toBe(true);
  });

  // AC-5
  it('takes both backend addresses from configuration rather than the template hardcoded address', async () => {
    // Re-point both services; the rewrites must follow the configuration.
    const reconfiguredAuth = 'https://auth-from-config.example';
    const reconfiguredTransactions =
      'https://tx-from-config.example/transactions-api';
    vi.stubEnv('NEXT_PUBLIC_AUTH_API_BASE_URL', reconfiguredAuth);
    vi.stubEnv(
      'NEXT_PUBLIC_TRANSACTIONS_API_BASE_URL',
      reconfiguredTransactions,
    );
    vi.resetModules();

    const rules = await loadRewriteRules();
    expect(destinationFor(rules, '/v1/auth/:path*')).toBe(
      `${reconfiguredAuth}/v1/auth/:path*`,
    );
    expect(destinationFor(rules, '/transactions-api/:path*')).toBe(
      `${reconfiguredTransactions}/:path*`,
    );

    // The template's single stale address is gone — from the rewrites and from
    // every string the constants module exports (story implementation notes).
    expect(rules.filter((rule) => rule.destination.includes('8042'))).toEqual(
      [],
    );
    const constants = await import('@/lib/utils/constants');
    expect(
      Object.entries(constants).filter(
        ([, value]) => typeof value === 'string' && value.includes('8042'),
      ),
    ).toEqual([]);
  });
});
