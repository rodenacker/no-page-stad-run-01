/**
 * Node-side stub of the auth service — the E2E layer's mock for every auth call
 * the *Next.js server process* makes. Playwright specs never contact a live
 * backend (testing-policy.md § "Playwright runs against mocks, never live"), and
 * `page.route()` alone cannot deliver that here:
 *
 * - `page.route()` intercepts calls the BROWSER makes (the sign-in form's
 *   `POST /v1/auth/login`) — it cannot see a fetch made by the Next.js server.
 * - Every protected screen in this project is gated SERVER-side: the
 *   `(authenticated)` layout calls `requireSession()`, which calls
 *   `GET /v1/auth/userinfo` from Node (epic brief BR1/BR3). Without this stub that
 *   call would reach the real auth service (or nothing at all), 401, and bounce
 *   the browser straight back to the sign-in screen — so no spec could ever
 *   observe a signed-in screen.
 *
 * So the two boundaries are mocked with one contract:
 *   browser boundary → `page.route()` in the spec
 *   Node boundary    → this stub
 * Both compose the SAME project-wide factories in `web/src/mocks/data/`
 * (`loginSuccessResponse()`, `logoutSuccessResponse()`, `userInfoFor(role)`), and
 * both key off the same session-cookie value (`sessionCookieFor(role)`), so they
 * cannot drift from each other or from the Vitest layer.
 *
 * Wiring (see `playwright.config.ts`): `globalSetup` starts this stub, and the
 * app server is launched with `NEXT_PUBLIC_AUTH_API_BASE_URL` /
 * `AUTH_API_BASE_URL` pointing at it — so the app's forwarding of `/v1/auth/*`
 * and any server-side auth call resolve here instead of `http://localhost:4424`.
 * The real service is left untouched. That works in the production-build mode
 * (`E2E_PROD=1`) as well as in dev, because the address is resolved per request
 * rather than compiled into the build (story 7).
 *
 * Contract mirrored from `documentation/auth-api.yaml` exactly: PascalCase
 * `LoginRequest` body, `DefaultResponse` envelopes, `UserInfoRead` on userinfo,
 * session conveyed only by the `session` cookie.
 */
import { createServer } from 'node:http';

import { credentialFor } from '../fixtures/credentials';
import {
  loginErrorResponse,
  loginSuccessResponse,
  logoutSuccessResponse,
  userInfoFor,
} from '../../src/mocks/data/identity';
import {
  ROLE_APPROVER,
  ROLE_FINANCE_UPLOADER,
} from '../../src/mocks/data/role';

import type { IncomingMessage, Server, ServerResponse } from 'node:http';

/**
 * Deliberately NOT the real auth service's port (4424) — the real service may be
 * running on this machine, and the E2E run must neither talk to it nor fight it
 * for a port.
 */
export const AUTH_API_STUB_PORT = 4599;
export const AUTH_API_STUB_URL = `http://127.0.0.1:${AUTH_API_STUB_PORT}`;

/**
 * Opaque session values, one per role. The value is what lets the Node boundary
 * answer `GET /v1/auth/userinfo` for whichever role a spec signed in as, without
 * the spec having to hand-write a userinfo body.
 */
const SESSION_TOKENS: Record<string, string> = {
  [ROLE_FINANCE_UPLOADER]: 'mock-session-finance-uploader',
  [ROLE_APPROVER]: 'mock-session-approver',
};

const COOKIE_NAME = 'session';

/** The opaque session value for a role. Throws on an unknown role name. */
export const sessionTokenFor = (roleName: string): string => {
  const token = SESSION_TOKENS[roleName];
  if (!token) {
    throw new Error(
      `No mock session for role "${roleName}". This project has two roles: ` +
        `${ROLE_FINANCE_UPLOADER}, ${ROLE_APPROVER} ` +
        `(generated-docs/project.md §Roles & Permissions).`,
    );
  }
  return token;
};

/**
 * The `Set-Cookie` value a successful login returns — used by this stub AND by
 * the `page.route()` login interceptor in the specs, so both mock layers mint the
 * identical cookie.
 *
 * `Secure` is intentionally omitted: the E2E app is served over plain HTTP. The
 * real service's full attribute set (`HttpOnly; Secure; SameSite=Strict`) is
 * asserted in the Vitest layer (Story 1, AC-3), not here.
 */
export const sessionCookieFor = (roleName: string): string =>
  `${COOKIE_NAME}=${sessionTokenFor(roleName)}; Path=/; HttpOnly; SameSite=Strict`;

/** The cookie value a logout returns, clearing the session. */
const clearedSessionCookie = `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

const roleForSessionToken = (token: string | undefined): string | undefined =>
  token === undefined
    ? undefined
    : Object.keys(SESSION_TOKENS).find(
        (roleName) => SESSION_TOKENS[roleName] === token,
      );

const sessionTokenFromCookieHeader = (
  cookieHeader: string | undefined,
): string | undefined => {
  const prefix = `${COOKIE_NAME}=`;
  return cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
};

const readRequestBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const respondJson = (
  res: ServerResponse,
  status: number,
  body: unknown,
  setCookie?: string,
): void => {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (setCookie) {
    headers['set-cookie'] = setCookie;
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
};

/** The authenticated caller's role, from the `session` cookie. */
const roleFromRequest = (req: IncomingMessage): string | undefined =>
  roleForSessionToken(sessionTokenFromCookieHeader(req.headers.cookie));

const handleRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> => {
  const { pathname } = new URL(req.url ?? '/', AUTH_API_STUB_URL);
  const method = req.method ?? 'GET';

  // GET /v1/health — 200 unconditionally.
  if (method === 'GET' && pathname === '/v1/health') {
    respondJson(res, 200, { Messages: ['Healthy'] });
    return;
  }

  // POST /v1/auth/login — accepted credentials get a session cookie.
  if (method === 'POST' && pathname === '/v1/auth/login') {
    let payload: { Username?: unknown; Password?: unknown } = {};
    try {
      payload = JSON.parse(
        (await readRequestBody(req)) || '{}',
      ) as typeof payload;
    } catch {
      // Body from the shared auth-contract source, never hand-written here.
      respondJson(res, 400, loginErrorResponse());
      return;
    }

    // PascalCase is the contract (auth-api.yaml `LoginRequest`); a camelCase body
    // is a real contract break and is answered as a malformed request, not
    // quietly accepted.
    const { Username, Password } = payload;
    if (typeof Username !== 'string' || typeof Password !== 'string') {
      respondJson(res, 400, loginErrorResponse());
      return;
    }

    const credential = credentialFor(Username, Password);
    if (!credential) {
      // The real service's 401 carries no body (auth-api.yaml).
      res.writeHead(401);
      res.end();
      return;
    }

    respondJson(
      res,
      200,
      loginSuccessResponse(),
      sessionCookieFor(credential.role),
    );
    return;
  }

  // GET /v1/auth/userinfo — the identity/role set the app gates on.
  if (method === 'GET' && pathname === '/v1/auth/userinfo') {
    const role = roleFromRequest(req);
    if (!role) {
      res.writeHead(401);
      res.end();
      return;
    }
    respondJson(res, 200, userInfoFor(role));
    return;
  }

  // POST /v1/auth/logout — ends the session and clears the cookie.
  if (method === 'POST' && pathname === '/v1/auth/logout') {
    if (!roleFromRequest(req)) {
      res.writeHead(401);
      res.end();
      return;
    }
    respondJson(res, 200, logoutSuccessResponse(), clearedSessionCookie);
    return;
  }

  respondJson(res, 404, {
    Error: 'NOT_FOUND',
    Message: `The auth stub does not implement ${method} ${pathname}. Add it here if a story needs it.`,
  });
};

/**
 * Module-level singleton so `global-setup.ts` and `global-teardown.ts` (which run
 * in the same Playwright process) share one server instance.
 */
let stub: Server | null = null;

export const startAuthApiStub = async (): Promise<void> => {
  if (stub) return;
  const server = createServer((req, res) => {
    void handleRequest(req, res).catch(() => {
      respondJson(res, 500, {
        Messages: ['The auth stub failed to handle the request.'],
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(AUTH_API_STUB_PORT, '127.0.0.1', () => resolve());
  });
  stub = server;
};

export const stopAuthApiStub = async (): Promise<void> => {
  const server = stub;
  if (!server) return;
  stub = null;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
};
