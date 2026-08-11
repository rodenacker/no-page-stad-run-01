/**
 * Recording a decision on one expense payment request.
 *
 * The one place the decide vocabulary lives: what a decision IS (one request, one
 * outcome, and — on a rejection — the note), the app's own address a decision is
 * sent to, and the two service paths that address answers for.
 *
 * The address is the APP's own (`/api/decisions`, `app/api/decisions/route.ts`), not
 * the transactions service's. That is the whole point of the story: both decide
 * operations require a `LastChangedUser` header naming who performed the action, and
 * that name must come from the authenticated session rather than from anything the
 * caller supplied (brief §Notes & Caveats). So there is deliberately no
 * `LastChangedUser` argument here — none to pass, and none to forget — and the two
 * service paths below are refused by the `/transactions-api/*` proxy, which forwards
 * caller headers verbatim and would otherwise be a second, unguarded way in.
 *
 * Everything here goes through the shared API client (CLAUDE.md §2), same-origin, so
 * the browser-managed `session` cookie travels by itself and no service address ever
 * appears in browser code.
 */
import { post } from '@/lib/api/client';
import { serviceDetailOf, serviceMessageOf } from '@/lib/api/errors';

import type { DefaultResponse } from '@/types/api';

/** `POST /api/decisions` — the app's own decide route, and the only way in. */
export const DECISIONS_ENDPOINT = '/api/decisions';

/** The two outcomes a decision can carry. */
export const DECISION_APPROVE = 'Approve';
export const DECISION_REJECT = 'Reject';

/** One of the two outcomes — nothing else is a decision this app records. */
export type DecisionOutcome = typeof DECISION_APPROVE | typeof DECISION_REJECT;

/** Whether an unknown value names one of the two outcomes. */
export const isDecisionOutcome = (value: unknown): value is DecisionOutcome =>
  value === DECISION_APPROVE || value === DECISION_REJECT;

/**
 * The transactions service's own decide paths, keyed by the outcome they record
 * (`documentation/transactions-api.yaml` → `TransactionApprove` /
 * `TransactionReject`). Stated here rather than in the route handler because TWO
 * places need to agree on them: the route that forwards to them, and the
 * `/transactions-api/*` proxy that must refuse to carry them. Split across the two
 * files, one could start carrying what the other stopped answering.
 */
export const DECIDE_SERVICE_PATHS: Record<DecisionOutcome, string> = {
  [DECISION_APPROVE]: '/v1/transactions/approve',
  [DECISION_REJECT]: '/v1/transactions/reject',
};

/**
 * One decision: which request, which outcome, and the note a rejection carries.
 *
 * There is no field for who decided it — the server resolves that from the session
 * (brief R14/BR7), so a caller has nothing to supply and nothing to spoof.
 */
export interface DecisionRequest {
  /** Exactly ONE request per call — there is no bulk decide operation. */
  TransactionId: number;
  Decision: DecisionOutcome;
  /** The rejection note (required on a rejection, brief R7/R9/BR4). */
  UserNote?: string;
}

/**
 * Records one decision and answers the service's own `DefaultResponse` envelope.
 *
 * The envelope says nothing about the request's new status (brief BR1) — a caller
 * learns that by re-reading the list.
 *
 * The body is composed field by field rather than forwarded wholesale, so nothing a
 * caller happens to be holding travels with it.
 */
export const recordDecision = ({
  TransactionId,
  Decision,
  UserNote,
}: DecisionRequest): Promise<DefaultResponse> =>
  post<DefaultResponse>(DECISIONS_ENDPOINT, {
    TransactionId,
    Decision,
    ...(UserNote === undefined ? {} : { UserNote }),
  });

/**
 * Shown when a decision could not be recorded and nobody said anything readable
 * about why. The client's own placeholders ("Internal Server Error: …") are never
 * put in front of a user (project.md NFR-base-5).
 */
export const DECISION_FAILED_MESSAGE =
  'This decision could not be recorded. Please try again.';

/**
 * What to tell the user when a decision was refused.
 *
 * The service's own reason wins wherever it sent one, and it has to be looked for in
 * BOTH places a failure can carry it: the transactions service describes a refusal
 * with a 500 + `DefaultResponse` body, and for a 500 the shared client keeps its own
 * placeholder on `message` and the service's `Messages[]` on `details`.
 */
export const decisionFailureMessage = (error: unknown): string =>
  serviceMessageOf(error) ?? serviceDetailOf(error) ?? DECISION_FAILED_MESSAGE;
