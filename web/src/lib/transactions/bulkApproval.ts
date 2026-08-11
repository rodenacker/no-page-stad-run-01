/**
 * Approving a SELECTION of expense payment requests in one action (brief R1/R5/R8/R9,
 * BR1-BR5, NFR3).
 *
 * The whole of this module exists because of ONE fact about the transactions service,
 * and every piece below is a consequence of it: `POST /v1/transactions/approve` decides
 * exactly one request per call, and it answers the SAME generic envelope whether it just
 * approved the request or found that somebody had already decided it. So:
 *
 * - **There is no bulk call.** Approving a selection of N requests is N independent
 *   calls (BR3) — which is why {@link submitApprovals} exists at all, and why it runs
 *   them a few at a time ({@link BULK_APPROVE_CONCURRENCY}) rather than firing a
 *   selection that can run to thousands at the service in one breath (NFR3).
 * - **Staleness is caught BEFORE a call, never read out of one** (BR1/BR2).
 *   {@link stalenessIn} is that check, taken against a FRESH read of the list: a request
 *   the read no longer shows awaiting a decision is dropped from the batch and no
 *   approve call is made for it at all. This is the same check a single decision makes —
 *   it was inlined in `ExpenseRequestList` when `expense-decisions` needed it for one
 *   request, and it lives here now so the one-request path and the batch cannot come to
 *   disagree about what "already decided" means.
 * - **The outcome is computed by comparing two reads, never from the call bodies**
 *   (BR5). {@link approvedIn} is that comparison, and it is load-bearing: an
 *   implementation that trusts the answers would report an already-decided request as
 *   one of its own approvals, because the answer is identical.
 * - **A call that FAILED is a third thing, and not the second** (R10). "Left
 *   unchanged" is nothing going wrong — a colleague got there first, and no call was
 *   ever made. "Could not be submitted" is the call itself failing, and it is the only
 *   bucket the retry covers ({@link retryRefusedApprovalsLabel}). Retrying re-runs
 *   {@link eligibilityIn} over that subset rather than resubmitting the ids blindly
 *   (BR11): time has passed, so one of them may since have been decided, and it must
 *   then be reported as left unchanged rather than approved a second time.
 *
 * Nothing here sends anything or renders anything: the call is `lib/api/decisions.ts`'s
 * (`recordDecision`, through the app's own decide route, which stamps who acted from the
 * session), the read is `lib/api/transactions.ts`'s, and the screen is
 * `ExpenseRequestList`'s.
 */
import {
  ALREADY_DECIDED_MESSAGE,
  REQUEST_NO_LONGER_LISTED_MESSAGE,
  awaitsDecision,
} from '@/lib/transactions/deciding';

import type { TransactionRead } from '@/types/transactions';

/**
 * The most approve calls a batch may have out at once (NFR3).
 *
 * Five is the feature NFR's own stated default, and it is stated HERE rather than at
 * each caller so a later retry of a failed subset runs at the same bound rather than
 * inventing one. Both ways of getting it wrong are real: everything at once floods the
 * service and stalls the screen at the 10,000-request volume ceiling, and one at a time
 * is a batch nobody can sit through.
 */
export const BULK_APPROVE_CONCURRENCY = 5;

/**
 * Why a request the user asked to decide can no longer be decided — as a FRESH read of
 * the list shows it, which is the only place this can be told from (BR2).
 */
export type DecisionStaleness = 'already-decided' | 'no-longer-listed';

/**
 * Whether the named request is still open to a decision in this read, and if not, why
 * not. `undefined` means it is still awaiting one and may be submitted.
 *
 * This is the re-read-before-submit check itself (BR1/BR2), shared by the single
 * decision and by the batch. It judges the request as the READ shows it, never as the
 * screen last showed it: the whole point is that the two can disagree because a
 * colleague decided the request in between.
 */
export const stalenessIn = (
  requests: readonly TransactionRead[],
  id: number,
): DecisionStaleness | undefined => {
  const listed = requests.find((request) => request.Id === id);

  if (listed === undefined) {
    return 'no-longer-listed';
  }
  return awaitsDecision(listed) ? undefined : 'already-decided';
};

/**
 * What to tell the user about ONE request that can no longer be decided. Both sentences
 * belong to `deciding.ts`, which is the project's decide vocabulary; this only picks
 * between them, so the reason a decision was refused and the words used for it cannot
 * drift apart.
 */
export const staleDecisionMessage = (staleness: DecisionStaleness): string =>
  staleness === 'no-longer-listed'
    ? REQUEST_NO_LONGER_LISTED_MESSAGE
    : ALREADY_DECIDED_MESSAGE;

/** How a selection splits, once a fresh read has been taken against it (BR1/BR2). */
export interface BulkEligibility {
  /** Still awaiting a decision: the only requests an approve call is made for. */
  eligible: number[];
  /**
   * Somebody decided these — or they are not listed at all any more. They are left
   * exactly as they are: no call is made for them, and they are reported as left
   * unchanged rather than as approved (R5).
   */
  leftUnchanged: number[];
}

/**
 * The selection split against a fresh read (BR1/BR2). Order is the selection's own, so
 * the batch below submits requests in the order the user built them up.
 */
export const eligibilityIn = (
  requests: readonly TransactionRead[],
  ids: readonly number[],
): BulkEligibility => {
  const eligible: number[] = [];
  const leftUnchanged: number[] = [];

  for (const id of ids) {
    if (stalenessIn(requests, id) === undefined) {
      eligible.push(id);
    } else {
      leftUnchanged.push(id);
    }
  }
  return { eligible, leftUnchanged };
};

/**
 * Which of the requests a batch actually SUBMITTED came out of it decided — read from
 * the list as it stands AFTER the batch (BR5).
 *
 * Every id passed in was still awaiting a decision in the read taken before the batch
 * (that is what made it eligible), so a request now carrying a decision is one this
 * batch recorded. A request that has vanished from the list is deliberately NOT counted:
 * the app cannot see that anything was recorded on it, and reporting an approval it
 * cannot confirm is exactly what this comparison exists to prevent.
 */
export const approvedIn = (
  requests: readonly TransactionRead[],
  submitted: readonly number[],
): number[] =>
  submitted.filter((id) => stalenessIn(requests, id) === 'already-decided');

/** What became of one request's own approve call. */
export interface ApprovalAttempt {
  id: number;
  /** Whether the service refused this call (a network or server failure, R10). */
  refused: boolean;
  /**
   * The refusal itself, so the caller can tell the user the service's OWN reason rather
   * than the client's placeholder. Absent on a call that was accepted.
   */
  failure?: unknown;
}

/**
 * One approve call per request (BR3), at most {@link BULK_APPROVE_CONCURRENCY} of them
 * out at any moment (NFR3).
 *
 * A fixed number of workers pull from the same queue, so the batch keeps the bound full
 * until the queue runs out instead of proceeding in lock-step rounds. One call being
 * refused never stops the rest: a partial success is a legitimate outcome here, and what
 * happened to each request is reported back — in the order the ids were given — for the
 * caller to reconcile against a fresh read.
 */
export const submitApprovals = (
  ids: readonly number[],
  submit: (id: number) => Promise<unknown>,
  concurrency: number = BULK_APPROVE_CONCURRENCY,
): Promise<ApprovalAttempt[]> => {
  const attempts: ApprovalAttempt[] = ids.map((id) => ({ id, refused: false }));
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < ids.length) {
      const index = next;
      next += 1;

      try {
        await submit(ids[index]);
      } catch (failure: unknown) {
        attempts[index] = { id: ids[index], refused: true, failure };
      }
    }
  };

  // Started synchronously, so the bound is genuinely in flight at once rather than
  // reached a tick later — and never more workers than there is work.
  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), ids.length) },
    () => worker(),
  );

  return Promise.all(workers).then(() => attempts);
};

/* -------------------------------------------------------------------------- */
/* What the screen says about a bulk approval                                  */
/* -------------------------------------------------------------------------- */

/**
 * The bulk action's own wording. It says it acts on the SELECTION, which is what tells
 * it apart from the "Approve request TXN-…" control every listed request carries — one
 * screen offers both, so the two must never read alike.
 */
export const BULK_APPROVE_ACTION_LABEL = 'Approve selected requests';

/**
 * The confirmation names the selection's LITERAL count, however large it is (BR4).
 *
 * R4/UI-20's `99+` truncation is the ambient indicator's alone: a confirmation exists so
 * the user can judge an irreversible action before taking it, and "Approve 99+ requests?"
 * would hide the size of exactly the selections where the number matters most.
 */
export const bulkApproveConfirmationTitle = (selected: number): string =>
  `Approve ${String(selected)} selected expense ${
    selected === 1 ? 'request' : 'requests'
  }?`;

/**
 * What accepting does, in the user's terms — including what it will NOT do, since a
 * selection built a few minutes ago may well hold a request a colleague has since
 * decided (BR1). It prints no account number: the confirmation names a listing, and a
 * listing shows only the last four digits (project.md §Compliance, POPIA).
 */
export const BULK_APPROVE_CONFIRMATION_MESSAGE =
  'This records your approval against your name for every selected request that is ' +
  'still awaiting a decision, and cannot be undone. Any request a colleague has ' +
  'already decided is left exactly as it is.';

/**
 * The confirming choice. Three different phrases for the three controls, as this
 * project's confirmations always have: "Approve selected requests" asks, "Approve the
 * selection" does it, "Cancel" backs out.
 */
export const BULK_APPROVE_CONFIRM_LABEL = 'Approve the selection';

/**
 * Announced while the batch runs, since nothing on screen has changed yet: the requests
 * keep their status until the read that follows the calls.
 */
export const bulkApprovalInFlightMessage = (submitting: number): string =>
  `Approving ${String(submitting)} ${
    submitting === 1 ? 'request' : 'requests'
  }…`;

/** How each part of the outcome (R5) reads. */
const approvedCount = (approved: number): string =>
  `${String(approved)} approved`;

const leftUnchangedCount = (leftUnchanged: number): string =>
  leftUnchanged === 0
    ? '0 left unchanged'
    : `${String(leftUnchanged)} left unchanged because ${
        leftUnchanged === 1 ? 'it had' : 'they had'
      } already been decided`;

const couldNotBeSubmittedCount = (refused: number): string =>
  `${String(refused)} could not be submitted`;

/** What a batch was asked to do, and the buckets it put each request in (R5, R10). */
export interface BulkApprovalTally {
  /** How many requests the Approver had selected — the figure they confirmed (R8). */
  selected: number;
  /** Requests whose status changed, per the read taken after the batch (BR5). */
  approved: number;
  /** Requests never submitted, because a colleague had already decided them. */
  leftUnchanged: number;
  /** Requests whose own call was refused for some other reason (R10). */
  refused: number;
}

/**
 * Heads the outcome. Worded from what actually happened, so a batch that approved
 * nothing does not announce itself as an approval.
 */
export const bulkApprovalOutcomeTitle = ({
  approved,
  refused,
}: BulkApprovalTally): string => {
  if (refused > 0) {
    return 'Some approvals could not be submitted';
  }
  return approved > 0 ? 'Selection approved' : 'Nothing was approved';
};

/**
 * The outcome itself (R5): what the Approver asked for, then how many were approved and
 * how many were left as they were because somebody had already decided them. A bucket
 * with nothing in it is still named — "0 left unchanged" is an answer, and leaving it
 * out would make the Approver infer it from silence.
 *
 * It opens by naming the selection rather than a bare figure for two reasons: the
 * Approver confirmed that number a moment ago and it is what the split has to add up to,
 * and a message beginning with a digit runs straight into the notification's heading
 * when the two are read as one string.
 *
 * It names counts and nothing else: like the confirmation, this is a listing surface and
 * never prints an account number (project.md §Compliance).
 */
export const bulkApprovalOutcomeMessage = (
  { selected, approved, leftUnchanged, refused }: BulkApprovalTally,
  refusalReason?: string,
): string => {
  const buckets = [approvedCount(approved), leftUnchangedCount(leftUnchanged)];

  if (refused > 0) {
    buckets.push(couldNotBeSubmittedCount(refused));
  }
  const outcome =
    `Of the ${String(selected)} ${selected === 1 ? 'request' : 'requests'} ` +
    `selected: ${buckets.join(', ')}.`;

  return refusalReason === undefined ? outcome : `${outcome} ${refusalReason}`;
};

/**
 * The way out the outcome offers when some approvals could not be submitted (R10,
 * project.md NFR-base-5). It NAMES the subset it covers, for two reasons:
 *
 * - it is scoped, and saying so is the difference between "run the whole thing again"
 *   (which would resubmit requests this batch already approved) and what actually
 *   happens — only the calls that failed are made again;
 * - this screen already carries a bare "Try again" on its failed-load state, and the
 *   project's rule is that two recovery controls on one screen must not read alike.
 *
 * Trying again does NOT ask for confirmation a second time: the Approver confirmed
 * this bulk approval when they started it (UI-09), and choosing a named, smaller
 * subset is itself the deliberate act.
 */
export const retryRefusedApprovalsLabel = (refused: number): string =>
  `Try again for the ${String(refused)} that could not be submitted`;

/** Heads a bulk approval that could not be attempted or could not be confirmed. */
export const BULK_APPROVE_REFUSED_TITLE = 'Could not approve the selection';

/**
 * Said when the read that has to come first could not be made (BR2): approvals go out
 * only while the app can see which requests are still awaiting one, so nothing was sent
 * at all.
 */
export const NOTHING_SENT_MESSAGE =
  'No approvals were sent, so every selected request is exactly as it was.';

/**
 * Said when the calls went out but the read that reconciles them did not come back
 * (BR5). The outcome genuinely is not known here, and saying so is the only honest
 * answer — the counts may never be invented from the call answers, which carry no
 * status at all.
 */
export const OUTCOME_UNKNOWN_MESSAGE =
  'The approvals were sent, but the expense requests could not be read back, so how ' +
  'many were recorded cannot be confirmed. Load the list again to see where each ' +
  'request stands.';
