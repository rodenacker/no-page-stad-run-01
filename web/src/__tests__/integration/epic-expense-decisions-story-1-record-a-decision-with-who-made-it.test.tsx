/**
 * Story Metadata:
 * - Route: null (a server route handler plus its browser-side caller — no screen)
 * - Target File: web/src/app/api/decisions/route.ts
 * - Page Action: create_new
 *
 * Epic "Approve or reject a request", Story 1: record a decision as the person who
 * made it (R1, R2, R14, BR7).
 *
 * Nothing here is visible on screen — story 2 puts the Approve/Reject controls in
 * front of a user. What this story delivers is the one safe way to record a
 * decision: a server-side endpoint that decides WHO the decision belongs to from
 * the session, refuses anyone who is not an Approver, and leaves no second way in.
 * These tests are TDD-red: the two modules below do not exist yet.
 *
 * THE CONTRACT, IN ONE PLACE
 *
 *   web/src/lib/api/decisions.ts — the browser-side caller
 *
 *     export const DECISIONS_ENDPOINT = '/api/decisions';   // the app's own address
 *     export const DECISION_APPROVE = 'Approve';
 *     export const DECISION_REJECT  = 'Reject';
 *     export interface DecisionRequest {
 *       TransactionId: number;                  // exactly ONE request per call
 *       Decision: 'Approve' | 'Reject';
 *       UserNote?: string;                      // the note, on a rejection only
 *     }
 *     export const recordDecision: (decision: DecisionRequest) => Promise<DefaultResponse>
 *       — goes through the shared client (`post`, CLAUDE.md §2) at the app's own
 *         address. It sends NO name of its own: there is no `LastChangedUser`
 *         argument to pass and none to forget.
 *     export const DECISION_FAILED_MESSAGE: string       // the app's own plain wording
 *     export const decisionFailureMessage: (error: unknown) => string
 *       — `serviceMessageOf ?? serviceDetailOf ?? DECISION_FAILED_MESSAGE`, the same
 *         rule `lib/api/transactions.ts` and `lib/api/files.ts` already follow, so a
 *         client placeholder ("Internal Server Error: …") never reaches a user
 *         (project.md NFR-base-5).
 *
 *   web/src/app/api/decisions/route.ts — the server route handler
 *
 *     export const POST: (request: NextRequest) => Promise<Response>
 *
 *     1. Reads the session value from the request's own `session` cookie
 *        (`SESSION_COOKIE_NAME`). No cookie → 401, and nothing is sent anywhere.
 *        (`requireSession()` is the SCREEN's gate — it redirects, which is not an
 *        answer a fetch can act on; a route handler resolves identity itself with
 *        `fetchUserInfo`, the same auth-service call behind the same session.)
 *     2. `fetchUserInfo(session)` → `null` (the auth service says the session is
 *        gone) → 401, nothing sent to the transactions service.
 *     3. `hasRole(session, ROLE_APPROVER)` false → 403, nothing sent to the
 *        transactions service (R14/BR7).
 *     4. Otherwise forwards, server-side, to the transactions service at
 *        `transactionsApiBaseUrl()`:
 *          POST /v1/transactions/approve?TransactionId=<id>          (no body)
 *          POST /v1/transactions/reject?TransactionId=<id>   { UserNote }
 *        with `LastChangedUser: displayNameOf(session)` — the REQUIRED header both
 *        operations declare (documentation/transactions-api.yaml), taken from the
 *        session and never from the caller — and the caller's session cookie
 *        forwarded explicitly (a server-side fetch has no browser cookie jar, and
 *        the transactions service accepts nothing else).
 *     5. Answers the service's own `DefaultResponse` and status through, so the
 *        service's wording reaches the screen; a service that cannot be reached at
 *        all is answered with 502 + `{ Error: BACKEND_UNREACHABLE }` and no wording
 *        of ours. Nothing internal travels either way: no service address, no
 *        connection error, no stack trace (bff-auth-pattern.md Rule 4).
 *
 *   web/src/app/transactions-api/[...path]/route.ts — the bypass, closed
 *
 *     The existing proxy forwards whatever headers the caller sent, `LastChangedUser`
 *     included — so while it carries `/v1/transactions/approve` and `/reject`, a
 *     browser can record a decision under any name it likes and the endpoint above
 *     is decoration. It must stop carrying those two paths (answered by the app
 *     itself, nothing forwarded), leaving `/api/decisions` as the only way in. Every
 *     other transactions path is untouched — the file operations still travel
 *     through it exactly as they do today.
 *
 * WHAT IS NOT HERE: re-reading the request's status before submitting (BR1) is
 * story 4's; the confirmation, the controls and the notification are story 2's.
 * This route decides exactly one request per call and reports what came back.
 *
 * Mock data comes from the project-wide factories in web/src/mocks/data/ — the same
 * source the Playwright layer imports. No identity, transaction or decision body is
 * authored here.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';
import { BACKEND_UNREACHABLE_ERROR } from '@/lib/api/serviceProxy';
import { sessionCookieHeader } from '@/lib/auth/sessionCookie';
import {
  userInfoFor,
  userInfoWithNonLatinScriptName,
  userInfoWithUnrecognisedRole,
} from '@/mocks/data/identity';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/mocks/data/role';
import {
  DECIDING_APPROVER,
  DECISION_REFUSED_MESSAGE,
  OTHER_APPROVER,
  REJECTION_NOTE,
  approveSuccessResponse,
  createTransaction,
  decisionFailureResponse,
  rejectSuccessResponse,
  rejectionWriteBody,
} from '@/mocks/data/transaction';

import type { DefaultResponse } from '@/types/api';

/** The app's own address — the only origin browser-side code ever calls. */
const APP_ORIGIN = 'http://localhost:3000';

/**
 * Distinct sentinel origins for the two services, so an assertion can only pass if
 * the call really went to the service it names, and a leaked address is
 * unmistakable in a response body.
 */
const AUTH_ORIGIN = 'https://auth.decisions.test.internal';
const TRANSACTIONS_ORIGIN =
  'https://tx.decisions.test.internal/transactions-api';

/** The opaque session value the browser holds; never read by app code. */
const SESSION_VALUE = 'opaque-session-value-for-this-test-only';

/** The two decide operations, as `documentation/transactions-api.yaml` declares them. */
const APPROVE_PATH = '/v1/transactions/approve';
const REJECT_PATH = '/v1/transactions/reject';

/** Returned instead of a rejection when a call that must fail resolves. */
const RESOLVED_ANYWAY =
  'the call resolved as if the decision had been recorded';

// --- the modules under test ---------------------------------------------------

/**
 * The decision this app records: one request, one outcome, and — on a rejection —
 * the note. There is deliberately no field for who decided it: that is the whole
 * point of the story, and a caller must have no way to supply one.
 */
interface DecisionRequest {
  TransactionId: number;
  Decision: string;
  UserNote?: string;
}

interface DecisionsApi {
  DECISIONS_ENDPOINT: string;
  DECISION_APPROVE: string;
  DECISION_REJECT: string;
  DECISION_FAILED_MESSAGE: string;
  recordDecision: (decision: DecisionRequest) => Promise<DefaultResponse>;
  decisionFailureMessage: (error: unknown) => string;
}

interface DecisionsRoute {
  POST: (request: NextRequest) => Promise<Response>;
}

interface ProxyRoute {
  POST: (
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> },
  ) => Promise<Response>;
}

/**
 * Reached through a VARIABLE specifier, so that while the decision modules do not
 * exist yet this file still COLLECTS and every test fails on its own missing module
 * (the TDD-red signal) rather than the whole suite failing to load. Relative rather
 * than the usual `@/` alias for the same reason — a variable specifier is resolved
 * at run time, where the alias is not applied.
 */
const DECISIONS_ROUTE_MODULE = '../../app/api/decisions/route';
const DECISIONS_API_MODULE = '../../lib/api/decisions';
const TRANSACTIONS_PROXY_MODULE = '../../app/transactions-api/[...path]/route';

const loadDecisionsRoute = async (): Promise<DecisionsRoute> =>
  (await import(DECISIONS_ROUTE_MODULE)) as unknown as DecisionsRoute;

const loadDecisionsApi = async (): Promise<DecisionsApi> =>
  (await import(DECISIONS_API_MODULE)) as unknown as DecisionsApi;

const loadTransactionsProxy = async (): Promise<ProxyRoute> =>
  (await import(TRANSACTIONS_PROXY_MODULE)) as unknown as ProxyRoute;

/** The catch-all segments Next hands the proxy handler for `[...path]`. */
const pathContext = (
  path: string[],
): { params: Promise<{ path: string[] }> } => ({
  params: Promise.resolve({ path }),
});

/**
 * `NextRequest` narrows the standard `RequestInit` (its `signal` may not be
 * `null`), so an init is typed off the constructor rather than the global.
 */
type IncomingInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

/**
 * A call arriving at `/api/decisions`, as the browser makes it.
 *
 * `session: null` is the caller with no session at all; `headers` adds whatever a
 * hostile caller might try to send along with it.
 */
const decideRequest = async (
  decision: unknown,
  {
    session = SESSION_VALUE,
    headers = {},
  }: { session?: string | null; headers?: Record<string, string> } = {},
): Promise<NextRequest> => {
  const { DECISIONS_ENDPOINT } = await loadDecisionsApi();
  const init: IncomingInit = {
    method: 'POST',
    body: JSON.stringify(decision),
    headers: {
      'content-type': 'application/json',
      ...(session === null ? {} : { cookie: sessionCookieHeader(session) }),
      ...headers,
    },
  };

  return new NextRequest(`${APP_ORIGIN}${DECISIONS_ENDPOINT}`, init);
};

// --- the backends (always mocked) ---------------------------------------------

interface ObservedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

/** Every call that left this app for one of the two backend services. */
const forwarded: ObservedRequest[] = [];

/** Every call browser-side code made to the app's own address. */
const browserCalls: ObservedRequest[] = [];

/** What `GET /v1/auth/userinfo` answers; reassigned per test as needed. */
let userInfoResponse: () => Response;

/** What a decide call answers; reassigned per test, and may throw (unreachable). */
let decideResponse: () => Response;

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const urlOf = (input: unknown): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (typeof input === 'object' && input !== null && 'url' in input) {
    return String((input as { url: unknown }).url);
  }
  return String(input);
};

/**
 * Normalises either `fetch(request)` or `fetch(url, init)` into one Request.
 * A browser-side call addresses a PATH (`/api/decisions`), which is resolved
 * against the app's own origin exactly as a browser would resolve it.
 */
const asRequest = (input: unknown, init?: RequestInit): Request => {
  if (input instanceof Request) {
    return init === undefined ? input : new Request(input, init);
  }
  return new Request(new URL(urlOf(input), APP_ORIGIN).href, init);
};

/**
 * The session cookie a browser attaches to a same-origin call by itself. It is
 * added here rather than by the calling code because no browser-side code holds
 * the session — the cookie is HttpOnly and the client sends no credential of its
 * own (project.md §Authentication).
 */
const withBrowserSession = (headers: Headers): Headers => {
  const carried = new Headers(headers);
  carried.set('cookie', sessionCookieHeader(SESSION_VALUE));
  return carried;
};

/**
 * A browser-side call to the app's own address, served by the route handler under
 * test — so `recordDecision` and the endpoint are exercised as one chain rather
 * than as two modules that have never met.
 */
const serveFromApp = async (request: Request): Promise<Response> => {
  const body = await request.text();
  browserCalls.push({
    url: request.url,
    method: request.method,
    headers: new Headers(request.headers),
    body,
  });

  const { POST } = await loadDecisionsRoute();
  return POST(
    new NextRequest(request.url, {
      method: request.method,
      headers: withBrowserSession(request.headers),
      body,
    }),
  );
};

const fetchStub = vi.fn(async (input: unknown, init?: RequestInit) => {
  const request = asRequest(input, init);
  const { origin, pathname } = new URL(request.url);

  if (origin === APP_ORIGIN) {
    return serveFromApp(request);
  }

  forwarded.push({
    url: request.url,
    method: request.method,
    headers: new Headers(request.headers),
    body: await request.text(),
  });

  return pathname.endsWith('/auth/userinfo')
    ? userInfoResponse()
    : decideResponse();
});

/** What Node's fetch throws when nothing is listening on the other end. */
const connectionRefused = (): TypeError =>
  new TypeError('fetch failed', {
    cause: new Error('connect ECONNREFUSED 127.0.0.1:4423'),
  });

/** Every address this app called on a backend service, in order. */
const forwardedUrls = (): string[] => forwarded.map((call) => call.url);

/** Only the calls that reached the transactions service. */
const decideCallUrls = (): string[] =>
  forwardedUrls().filter((url) => url.startsWith(TRANSACTIONS_ORIGIN));

/** The decide call the transactions service saw most recently. */
const lastDecideCall = (): ObservedRequest => {
  const call = forwarded
    .filter(({ url }) => url.startsWith(TRANSACTIONS_ORIGIN))
    .at(-1);
  if (!call) {
    throw new Error(
      'No decide call reached the transactions service at all — nothing was sent.',
    );
  }
  return call;
};

/** The call browser-side code made to the app most recently. */
const lastBrowserCall = (): ObservedRequest => {
  const call = browserCalls.at(-1);
  if (!call) {
    throw new Error(
      'Browser-side code called the app at no address at all — nothing was sent.',
    );
  }
  return call;
};

const headerValuesOf = (headers: Headers): string[] => {
  const values: string[] = [];
  headers.forEach((value) => values.push(value));
  return values;
};

/** The rejection a call that must fail produced, or {@link RESOLVED_ANYWAY}. */
const failureFrom = (call: Promise<unknown>): Promise<unknown> =>
  call.then(
    () => RESOLVED_ANYWAY as unknown,
    (error: unknown) => error,
  );

describe('Epic 5, Story 1: record a decision as the person who made it', () => {
  beforeEach(() => {
    vi.resetModules();
    forwarded.length = 0;
    browserCalls.length = 0;
    userInfoResponse = () => jsonResponse(200, userInfoFor(ROLE_APPROVER));
    decideResponse = () => jsonResponse(200, approveSuccessResponse());
    vi.stubEnv('AUTH_API_BASE_URL', AUTH_ORIGIN);
    vi.stubEnv('TRANSACTIONS_API_BASE_URL', TRANSACTIONS_ORIGIN);
    vi.stubGlobal('fetch', fetchStub);
  });

  afterEach(() => {
    fetchStub.mockClear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // AC-1
  it('approves the named request under the signed-in person’s own name, taken from the session', async () => {
    const request = createTransaction();
    decideResponse = () =>
      jsonResponse(200, approveSuccessResponse(request.Id));
    const { recordDecision, DECISION_APPROVE } = await loadDecisionsApi();

    const outcome = await recordDecision({
      TransactionId: request.Id,
      Decision: DECISION_APPROVE,
    });

    const approveCall = lastDecideCall();
    expect(approveCall.method).toBe('POST');
    // One request per call, named by `TransactionId` in the ADDRESS (a query
    // parameter, not a body) — there is no bulk decide operation.
    expect(approveCall.url).toBe(
      `${TRANSACTIONS_ORIGIN}${APPROVE_PATH}?TransactionId=${String(request.Id)}`,
    );
    // The required header, carrying the name the session resolved to — the same
    // name the audit view then shows for this decision (R16).
    expect(approveCall.headers.get('LastChangedUser')).toBe(DECIDING_APPROVER);
    // Approve declares no request body at all.
    expect(approveCall.body).toBe('');
    // The service authenticates the call by the caller's own session; a server-side
    // fetch has no cookie jar, so it has to be carried explicitly.
    expect(approveCall.headers.get('cookie')).toBe(
      sessionCookieHeader(SESSION_VALUE),
    );
    // Identity was resolved from the auth service, not assumed.
    expect(forwardedUrls()).toContain(`${AUTH_ORIGIN}/v1/auth/userinfo`);
    // What the screen is handed back is the service's own answer, unembellished.
    expect(outcome).toEqual(approveSuccessResponse(request.Id));
  });

  // AC-2
  it('rejects the named request with the supplied note, stamped with the same signed-in name', async () => {
    const request = createTransaction();
    decideResponse = () => jsonResponse(200, rejectSuccessResponse(request.Id));
    const { recordDecision, DECISION_REJECT } = await loadDecisionsApi();

    const outcome = await recordDecision({
      TransactionId: request.Id,
      Decision: DECISION_REJECT,
      UserNote: REJECTION_NOTE,
    });

    const rejectCall = lastDecideCall();
    expect(rejectCall.method).toBe('POST');
    expect(rejectCall.url).toBe(
      `${TRANSACTIONS_ORIGIN}${REJECT_PATH}?TransactionId=${String(request.Id)}`,
    );
    // The note travels in the body and ONLY in the body — `TransactionRejectWrite`
    // is `{ UserNote }` and nothing else, and a reason someone typed has no business
    // in an address that gets logged along every hop.
    expect(JSON.parse(rejectCall.body)).toEqual(
      rejectionWriteBody(REJECTION_NOTE),
    );
    expect(new URL(rejectCall.url).searchParams.get('UserNote')).toBeNull();
    expect(rejectCall.headers.get('LastChangedUser')).toBe(DECIDING_APPROVER);
    expect(outcome).toEqual(rejectSuccessResponse(request.Id));
  });

  // AC-3
  it('refuses a caller who is not an Approver, and sends nothing at all to the transactions service', async () => {
    const request = createTransaction();
    const { POST } = await loadDecisionsRoute();
    const { DECISION_APPROVE } = await loadDecisionsApi();
    const decision = {
      TransactionId: request.Id,
      Decision: DECISION_APPROVE,
    };

    // A Finance Uploader holds a perfectly valid session and may read requests —
    // deciding one is the part they may not do (R14/BR7).
    userInfoResponse = () => jsonResponse(200, userInfoFor(ROLE_IMPORTER));
    const refusedUploader = await POST(await decideRequest(decision));

    expect(refusedUploader.status).toBe(403);
    expect(decideCallUrls()).toEqual([]);

    // And a signed-in account whose only role this project does not recognise gets
    // nothing either — an unrecognised name grants no standing here (`roles.ts`),
    // so it can never fall through to "not an Importer, so presumably an Approver".
    userInfoResponse = () => jsonResponse(200, userInfoWithUnrecognisedRole());
    const refusedStranger = await POST(await decideRequest(decision));

    expect(refusedStranger.status).toBe(403);
    expect(decideCallUrls()).toEqual([]);

    // The refusal says nothing about where the transactions service lives.
    expect(await refusedStranger.text()).not.toContain(
      new URL(TRANSACTIONS_ORIGIN).host,
    );
  });

  // AC-4
  it('refuses a caller with no valid session, and sends nothing at all to the transactions service', async () => {
    const request = createTransaction();
    const { POST } = await loadDecisionsRoute();
    const { DECISION_APPROVE } = await loadDecisionsApi();
    const decision = {
      TransactionId: request.Id,
      Decision: DECISION_APPROVE,
    };

    // No session cookie: there is no identity to stamp the decision with, so the
    // call stops here — nothing is asked of either service.
    const withoutSession = await POST(
      await decideRequest(decision, { session: null }),
    );

    expect(withoutSession.status).toBe(401);
    expect(forwardedUrls()).toEqual([]);

    // A cookie the auth service no longer honours (the session ended on its own, or
    // was never valid) is the same answer — and this one does cost a userinfo call,
    // because only the auth service can say so.
    userInfoResponse = () => new Response(null, { status: 401 });
    const endedSession = await POST(
      await decideRequest(decision, {
        session: 'a-session-the-service-rejects',
      }),
    );

    expect(endedSession.status).toBe(401);
    expect(forwardedUrls()).toEqual([`${AUTH_ORIGIN}/v1/auth/userinfo`]);
    expect(decideCallUrls()).toEqual([]);
  });

  // AC-5
  it('cannot be made to record a decision under a name of the caller’s choosing', async () => {
    const request = createTransaction();

    // 1. Straight at the forwarding address, with a name of its own. The proxy
    //    carries every other transactions path, but it hands the caller's headers
    //    over verbatim — so while it carried these two it was a second, unguarded
    //    way to decide a request as anyone at all. It must no longer carry them:
    //    the app answers, and the transactions service hears nothing.
    const proxy = await loadTransactionsProxy();

    for (const [path, segments] of [
      [APPROVE_PATH, ['v1', 'transactions', 'approve']],
      [REJECT_PATH, ['v1', 'transactions', 'reject']],
    ] as const) {
      const smuggled = await proxy.POST(
        new NextRequest(
          `${APP_ORIGIN}/transactions-api${path}?TransactionId=${String(request.Id)}`,
          {
            method: 'POST',
            headers: {
              cookie: sessionCookieHeader(SESSION_VALUE),
              LastChangedUser: OTHER_APPROVER,
            },
          },
        ),
        pathContext([...segments]),
      );

      expect(smuggled.status).toBe(404);
      expect(forwardedUrls()).toEqual([]);
    }

    // 2. Through the decision endpoint, carrying a chosen name in a header AND in
    //    the body. Both are ignored: the name is resolved from the session, so the
    //    only name that can ever be recorded is the signed-in one.
    const { POST } = await loadDecisionsRoute();
    const { DECISION_APPROVE, recordDecision } = await loadDecisionsApi();

    const answered = await POST(
      await decideRequest(
        {
          TransactionId: request.Id,
          Decision: DECISION_APPROVE,
          LastChangedUser: OTHER_APPROVER,
        },
        { headers: { LastChangedUser: OTHER_APPROVER } },
      ),
    );

    expect(answered.status).toBe(200);
    const decideCall = lastDecideCall();
    expect(decideCall.headers.get('LastChangedUser')).toBe(DECIDING_APPROVER);
    expect(headerValuesOf(decideCall.headers)).not.toContain(OTHER_APPROVER);
    expect(decideCall.body).not.toContain(OTHER_APPROVER);

    // 3. And browser-side code has no name to send in the first place: the call it
    //    makes goes to the app's own address and carries no `LastChangedUser` at
    //    all, which is what leaves the session as the single source of the answer.
    await recordDecision({
      TransactionId: request.Id,
      Decision: DECISION_APPROVE,
    });

    const browserCall = lastBrowserCall();
    expect(browserCall.headers.get('LastChangedUser')).toBeNull();
    expect(browserCall.body).not.toContain('LastChangedUser');
    expect(lastDecideCall().headers.get('LastChangedUser')).toBe(
      DECIDING_APPROVER,
    );
  });

  // AC-6
  it('answers a refused or unreachable service with a plain outcome that carries nothing internal', async () => {
    const request = createTransaction();
    const { POST } = await loadDecisionsRoute();
    const {
      DECISION_APPROVE,
      DECISION_FAILED_MESSAGE,
      decisionFailureMessage,
      recordDecision,
    } = await loadDecisionsApi();
    const decision = {
      TransactionId: request.Id,
      Decision: DECISION_APPROVE,
    };

    // 1. The service refused the decision and said why. Its own wording is the
    //    useful part, so it survives the trip and is what the user is told.
    decideResponse = () => jsonResponse(500, decisionFailureResponse());

    const refused = await POST(await decideRequest(decision));

    expect(refused.status).toBe(500);
    const refusedBody = (await refused.clone().json()) as DefaultResponse;
    expect(refusedBody.Messages).toContain(DECISION_REFUSED_MESSAGE);
    const refusedText = await refused.text();
    expect(refusedText).not.toContain(new URL(TRANSACTIONS_ORIGIN).host);
    expect(refusedText).not.toContain('    at ');

    const refusal = await failureFrom(recordDecision(decision));
    expect(refusal).not.toBe(RESOLVED_ANYWAY);
    expect(decisionFailureMessage(refusal)).toBe(DECISION_REFUSED_MESSAGE);

    // 2. Nobody answered at all. Awaiting this is part of the assertion: a handler
    //    that lets the failure escape renders an error page instead of a response.
    decideResponse = () => {
      throw connectionRefused();
    };

    const unreachable = await POST(await decideRequest(decision));

    expect(unreachable.status).toBe(502);
    const unreachableBody = (await unreachable.clone().json()) as {
      Error?: unknown;
    };
    expect(unreachableBody.Error).toBe(BACKEND_UNREACHABLE_ERROR);
    const unreachableText = await unreachable.text();
    expect(unreachableText).not.toContain(new URL(TRANSACTIONS_ORIGIN).host);
    expect(unreachableText).not.toContain('ECONNREFUSED');
    expect(unreachableText).not.toContain('    at ');

    // With no wording from anyone, the user gets the app's own plain sentence —
    // never one of the client's internal placeholders (project.md NFR-base-5).
    const silence = await failureFrom(recordDecision(decision));
    expect(silence).not.toBe(RESOLVED_ANYWAY);
    expect(decisionFailureMessage(silence)).toBe(DECISION_FAILED_MESSAGE);
    expect(Object.values(CLIENT_FALLBACK_MESSAGES)).not.toContain(
      DECISION_FAILED_MESSAGE,
    );
  });

  // AC-6
  it('reports a failure, and sends nothing to the transactions service, when the signed-in name cannot travel in the required header', async () => {
    const request = createTransaction();
    const { POST } = await loadDecisionsRoute();
    const { DECISION_APPROVE } = await loadDecisionsApi();

    // An Approver whose name is written in a non-Latin script — an ordinary person
    // the auth service can return, whose name an HTTP header value (a byte string)
    // cannot carry. The service requires that name in a header, so the decision
    // genuinely cannot be sent as this app is allowed to send it.
    userInfoResponse = () =>
      jsonResponse(200, userInfoWithNonLatinScriptName());

    // Awaiting this is part of the assertion: an unhandled failure here escapes the
    // handler as a crash instead of an answer the screen can act on.
    const answered = await POST(
      await decideRequest({
        TransactionId: request.Id,
        Decision: DECISION_APPROVE,
      }),
    );

    // Reported, not dismissed and not crashed — and bodyless, so nothing about why
    // travels back: not the name, not the service, not a stack trace.
    expect(answered.status).toBe(500);
    expect(await answered.text()).toBe('');

    // Nothing was recorded: the decision never left this app, so no decision was
    // stamped with a name other than the signed-in one, nor with a mangled one.
    expect(decideCallUrls()).toEqual([]);
  });
});
