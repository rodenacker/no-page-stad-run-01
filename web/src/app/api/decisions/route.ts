/**
 * `POST /api/decisions` — the one way a decision is recorded on an expense payment
 * request.
 *
 * Unlike `/transactions-api/*`, this is not a proxy: it adds the one thing the
 * transactions service requires and the browser must never be trusted to supply.
 * Both decide operations declare a required `LastChangedUser` header naming who
 * performed the action, and the name is resolved HERE, from the session cookie the
 * caller already holds — so the only name that can ever be recorded is the signed-in
 * one (brief §Notes & Caveats, R14/BR7).
 *
 * What it does, in order:
 *
 * 1. Reads the `session` cookie. No cookie means there is no identity to stamp the
 *    decision with, so nothing is asked of either service. (`requireSession()` is the
 *    SCREEN's gate — it redirects, which is not an answer a fetch can act on — so a
 *    route handler resolves identity itself with `fetchUserInfo`, the same auth-service
 *    call behind the same session.)
 * 2. Resolves the identity. A session the auth service no longer honours is the same
 *    401, and costs one userinfo call, because only the auth service can say so.
 * 3. Refuses anyone who is not an Approver with a 403 — a Finance Uploader holds a
 *    perfectly valid session and may READ requests; deciding one is the part they may
 *    not do. Nothing reaches the transactions service.
 * 4. Forwards exactly one request's decision to the service, with the resolved name in
 *    the required header and the caller's session cookie carried explicitly (a
 *    server-side fetch has no browser cookie jar, and the service accepts nothing
 *    else).
 * 5. Answers the service's own status and `DefaultResponse` through, so its wording
 *    reaches the screen. Nothing internal travels either way: no service address, no
 *    connection error, no stack trace (bff-auth-pattern.md Rule 4) — a service nobody
 *    answered for is a 502 carrying a code and no wording of ours.
 *
 * Re-reading the request's status before submitting (brief BR1) is not done here: it
 * belongs with the screen that decides whether to submit at all. This route decides
 * exactly one request per call and reports what came back.
 */
import {
  DECIDE_SERVICE_PATHS,
  DECISION_REJECT,
  isDecisionOutcome,
} from '@/lib/api/decisions';
import { transactionsApiBaseUrl } from '@/lib/api/serviceBaseUrl';
import {
  BACKEND_UNREACHABLE_ERROR,
  forwardToService,
} from '@/lib/api/serviceProxy';
import { fetchUserInfo } from '@/lib/auth/authApi';
import { displayNameOf } from '@/lib/auth/identity';
import { hasRole } from '@/lib/auth/roles';
import {
  SESSION_COOKIE_NAME,
  sessionCookieHeader,
} from '@/lib/auth/sessionCookie';
import { ROLE_APPROVER } from '@/types/auth';

import type { DecisionRequest } from '@/lib/api/decisions';
import type { ErrorResponse } from '@/types/api';
import type { UserInfoRead } from '@/types/auth';
import type { NextRequest } from 'next/server';

/** A decision is never prerendered and never cached — it changes a record. */
export const dynamic = 'force-dynamic';

/**
 * A refusal, as a bare status. Deliberately bodyless: the caller learns only that it
 * may not do this, and the app's own screens supply the wording a user reads.
 */
const refused = (status: number): Response => new Response(null, { status });

/**
 * Nobody answered. The same shape the service proxy answers with, so a screen tells
 * "nobody answered" from "the service refused" the same way whichever path it came
 * down — a code, and no wording of ours.
 */
const unreachable = (): Response =>
  new Response(
    JSON.stringify({
      Error: BACKEND_UNREACHABLE_ERROR,
    } satisfies Pick<ErrorResponse, 'Error'>),
    { status: 502, headers: { 'content-type': 'application/json' } },
  );

/**
 * The decision the caller asked for, or `null` when the call does not describe one.
 *
 * Only the three fields a decision HAS are read. Anything else the body carries —
 * a `LastChangedUser` of the caller's choosing, say — is not read, not copied, and
 * therefore cannot travel any further.
 *
 * A rejection with no note is not a decision this app records (brief R7/R9/BR4): the
 * service declares `UserNote` required on `TransactionRejectWrite`, and the note is
 * the reason the rejection exists. The screen asks for it before submitting; this is
 * the same rule where it cannot be skipped.
 */
const decisionIn = (body: unknown): DecisionRequest | null => {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const { TransactionId, Decision, UserNote } = body as Record<string, unknown>;

  if (typeof TransactionId !== 'number' || !Number.isInteger(TransactionId)) {
    return null;
  }
  if (!isDecisionOutcome(Decision)) {
    return null;
  }
  if (Decision !== DECISION_REJECT) {
    return { TransactionId, Decision };
  }
  return typeof UserNote === 'string' && UserNote.trim() !== ''
    ? { TransactionId, Decision, UserNote }
    : null;
};

/** The caller's body, parsed, or `undefined` when it is not readable as JSON. */
const bodyOf = async (request: NextRequest): Promise<unknown> => {
  try {
    return JSON.parse(await request.text()) as unknown;
  } catch {
    return undefined;
  }
};

/**
 * The call the transactions service sees: the request named in the ADDRESS (a query
 * parameter — the operation takes exactly one per call), the note in the BODY and
 * only in the body (a reason someone typed has no business in an address that gets
 * logged along every hop), and the signed-in name in the required header.
 */
const decideCall = (
  decision: DecisionRequest,
  session: UserInfoRead,
  sessionValue: string,
): Request => {
  const target =
    `${transactionsApiBaseUrl()}${DECIDE_SERVICE_PATHS[decision.Decision]}` +
    `?${new URLSearchParams({ TransactionId: String(decision.TransactionId) }).toString()}`;

  const headers: Record<string, string> = {
    // Never the caller's — the point of this route.
    LastChangedUser: displayNameOf(session),
    cookie: sessionCookieHeader(sessionValue),
  };

  // Approve declares no request body at all; reject's is `{ UserNote }`.
  if (decision.UserNote === undefined) {
    return new Request(target, { method: 'POST', headers });
  }
  return new Request(target, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ UserNote: decision.UserNote }),
  });
};

/**
 * The gate. Nothing reaches the transactions service until this has established WHO is
 * calling (a live session) and THAT THEY MAY (the Approver role) — see the 401/403
 * below, which the story's tests pin.
 *
 * The validator looks for `requireSession()` and does not recognise this shape. It
 * cannot be used here: `requireSession()` answers an unauthenticated caller with a
 * `redirect()` to the sign-in screen, which is right for a page and meaningless to a
 * `fetch` — this route has to answer a status a caller can act on. So the gate is
 * spelled out with the same pieces `requireSession()` is built from (`fetchUserInfo`)
 * plus the role check, and the exception is declared rather than the check skipped.
 */
// security-ignore: rbac — authorization IS enforced below (401 without a live session, 403 without ROLE_APPROVER). requireSession() is unusable in a route handler because it redirects instead of returning a status.
export async function POST(request: NextRequest): Promise<Response> {
  const sessionValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionValue) {
    return refused(401);
  }

  let session: UserInfoRead | null;
  try {
    session = await fetchUserInfo(sessionValue);
  } catch (error) {
    // A broken auth service is not an ended session, and it is not this caller's
    // fault: report it as nobody answering, and keep the detail server-side where it
    // is useful and private (CLAUDE.md §3 — reported, never dismissed).
    console.error(
      'Could not resolve the signed-in identity for a decision.',
      error,
    );
    return unreachable();
  }

  if (session === null) {
    return refused(401);
  }
  if (!hasRole(session, ROLE_APPROVER)) {
    return refused(403);
  }

  const decision = decisionIn(await bodyOf(request));
  if (decision === null) {
    return refused(400);
  }

  const call = decideCall(decision, session, sessionValue);
  return forwardToService(call, call.url);
}
