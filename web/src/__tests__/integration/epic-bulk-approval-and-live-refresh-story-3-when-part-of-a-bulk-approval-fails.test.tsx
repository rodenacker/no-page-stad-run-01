/**
 * Story Metadata:
 * - Epic: bulk-approval-and-live-refresh — Story 3: when part of a bulk approval fails
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — the result names all three groups separately (approved / left unchanged
 *   because already decided / could not be submitted) and says why the last group
 *   failed;
 * - AC-2 — the way to try again covers exactly the could-not-be-submitted subset,
 *   and never touches a request this batch already approved;
 * - AC-3 — trying again re-checks first, so a request a colleague decided in the
 *   meantime comes back as left unchanged rather than approved (BR11);
 * - AC-4 — when every approval fails nothing is reported as approved, the selection
 *   survives, and the way to try again is still offered.
 *
 * AC-5 is the Playwright spec's: it is the same three buckets in a real browser,
 * where the retry can be driven end to end against a live render.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE SURFACE IS STORY 1 AND 2's, EXTENDED — never a second batch path. The
 *    component under test is the existing client component
 *    `web/src/components/requests/ExpenseRequestList.tsx`: story 1 puts a
 *    selection control on every request still `Imported`, story 2 adds the bulk
 *    action, its confirmation, the pre-submit re-check (BR2), the bounded
 *    concurrency runner (NFR3) and the reconciliation read (BR5). This story adds
 *    ONLY the third bucket and the scoped retry on top of that machinery.
 * 2. THE CONTROLS THESE TESTS DRIVE, and the little they assume about them:
 *      - a request's selection control is the one `checkbox` in its row (queried
 *        by ROLE only — its accessible name is story 1's business);
 *      - the bulk action is a button whose name begins "Approve" and goes on to
 *        name the selection ("Approve selected requests", "Approve 4 selected
 *        requests" — anything matching /^approve\b.*\bselect/i). The per-request
 *        controls are named "Approve request TXN-…", so the two cannot collide;
 *      - the confirmation is the shared `ConfirmAction` (Radix renders it
 *        `role="alertdialog"`) with a confirming control named "Approve …" beside
 *        the "Cancel" way out — story 2's composition, unchanged here;
 *      - the way to try again is a real BUTTON named "Try again", the wording this
 *        project already uses for a retry affordance (`ExpenseRequestList`'s
 *        failed-load alert).
 * 3. THE RETRY IS A REAL CONTROL, NOT A CLICKABLE NOTIFICATION. The report must
 *    not fade (`duration: 0` — see the story's implementation notes), but the
 *    toast surface as it stands offers only `link` (an anchor to an ADDRESS —
 *    there is no address that re-runs a batch) and `onClick` on the notification's
 *    body, which `web/src/types/toast.ts` explicitly rules out as unreachable by
 *    keyboard under this project's WCAG 2.2 AA bar. So the report needs a
 *    keyboard-operable button: either the toast surface gains an action control,
 *    or the report lives in the list itself. These tests are placement-agnostic —
 *    they ask the SCREEN for the wording and for the button — so either satisfies
 *    them. What must not appear is a clickable non-control.
 * 4. TRYING AGAIN DOES NOT ASK A SECOND TIME. The Approver already confirmed this
 *    bulk approval once (UI-09 was satisfied then), and choosing "Try again" for a
 *    named, smaller subset is itself the deliberate act. So the retry re-runs the
 *    batch immediately — pre-submit re-check first (BR11), then the calls — and
 *    these tests drive it with a single activation.
 * 5. THE THREE BUCKETS ARE KEPT STRICTLY APART, and their wording follows the
 *    shape the epic brief states for itself (Workflows §2/§3, and story 2's manual
 *    checklist: "47 approved, 3 left unchanged because they had already been
 *    decided", "3 approved, 0 left unchanged"):
 *      - "<n> approved" — requests whose status CHANGED, per the reconciliation
 *        read (BR5);
 *      - "<n> left unchanged" plus, in words, that they had already been decided —
 *        never submitted at all (BR1/BR2);
 *      - "<n> could not be submitted" plus the reason — the call's own failure.
 *    The regexes below accept an optional "request(s)" between the number and the
 *    phrase ("3 requests approved" reads as well as "3 approved"); what they do not
 *    accept is a number that has drifted away from the bucket it belongs to. A
 *    bucket with nothing in it is still named — that is where story 2's "0 left
 *    unchanged" comes from, and it is what lets AC-4 state that NOTHING was
 *    approved rather than leave the Approver to infer it from silence.
 * 6. THE FAILURE REASON IS THE SERVICE'S OWN, never the client's placeholder
 *    (project.md NFR-base-5) — `serviceMessageOf(error) ?? serviceDetailOf(error)
 *    ?? <the app's own plain sentence>`, the rule `lib/api/errors.ts` exists for
 *    and `transactionListFailureMessage` / `decisionFailureMessage` already apply.
 *    The transactions service describes a refusal with a 500 + `DefaultResponse`,
 *    so the reason arrives on the failure's `details` and only `serviceDetailOf`
 *    finds it.
 * 7. NEVER REPORT AN APPROVAL THAT DID NOT HAPPEN. The approved count comes from
 *    the reconciliation read, and "before" means the PRE-SUBMIT RE-CHECK's
 *    snapshot, not the state that was on screen when the selection was built. AC-1
 *    below is built to fail an implementation that gets this wrong: one selected
 *    request is decided by a colleague between selection and confirmation, so a
 *    naive diff against the selection-time snapshot would report it as newly
 *    approved and leave the left-unchanged bucket empty.
 * 8. THE RETRY IS SCOPED AND IT RE-CHECKS (BR11). It covers exactly the
 *    could-not-be-submitted subset — a request this batch already approved is
 *    never resubmitted — and it re-runs the BR1/BR2 eligibility check first, so a
 *    request decided in the interim is reported as left unchanged instead of being
 *    approved a second time. Resubmitting one is invisible in the list (the
 *    service answers the same envelope and the status does not move again), so
 *    these tests read the requests a decision was actually SENT for — the only
 *    place the absence of a call is observable.
 * 9. THE APPROVE CALL IS `recordDecision` from `web/src/lib/api/decisions.ts` —
 *    confirmed against merged `main`. One request per call (BR3), through the
 *    shared API client at the app's own `/api/decisions` address, which is what
 *    stamps the acting identity server-side. No second approve path, and no direct
 *    `/transactions-api/*` call.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy), so `lib/api/decisions.ts`,
 * `lib/api/transactions.ts` and `lib/api/errors.ts` are all exercised for real.
 * Every body comes from the project-wide factory in `@/mocks/data/transaction`,
 * shared with the Playwright layer, so the two layers cannot drift onto different
 * shapes. The mock behaves like the SERVICE rather than like a fixed script: it
 * holds a set of requests, an accepted approval changes what it holds, and a
 * refused one changes nothing — which is the only arrangement under which the
 * reconciliation read can be load-bearing.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): there is no
 * selection control on a row yet, so they cannot even reach the bulk action.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the list stories 1 and 2 add the selection and the
// batch to, which this story adds the third bucket and the scoped retry to.
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// The real production notification composition (not mocked): the same one the root
// layout wraps every signed-in screen in.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get, post } from '@/lib/api/client';
import { DECISIONS_ENDPOINT } from '@/lib/api/decisions';
import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';

// Project-wide Transaction factory: the single source of truth for the wire shape
// and its canonical values, shared with the Playwright layer. Never hand-write a
// response body in a test.
import {
  DECISION_REFUSED_MESSAGE,
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  approveSuccessResponse,
  decisionFailureResponse,
  transactionListResponse,
  transactionsAfterApproving,
  transactionsAfterColleagueDecided,
  transactionsForBulkSelection,
} from '@/mocks/data/transaction';
import { ROLE_APPROVER } from '@/types/auth';

import type { DecisionRequest } from '@/lib/api/decisions';
import type { TransactionRead } from '@/mocks/data/transaction';
import type { APIError } from '@/types/api';

vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockGet = get as unknown as ReturnType<typeof vi.fn>;
const mockPost = post as unknown as ReturnType<typeof vi.fn>;

type User = ReturnType<typeof userEvent.setup>;

/* -------------------------------------------------------------------------- */
/* The service, as these tests model it                                        */
/* -------------------------------------------------------------------------- */

/**
 * What the transactions service currently holds. Every `GET /v1/transactions` is
 * answered from this one value — the first read, the pre-submit re-check (BR2), the
 * reconciliation read (BR5) and the retry's own re-check (BR11) alike — because the
 * service has no delta channel and no single-request GET: each of those is the same
 * full-list read taken at a different moment.
 */
let served: TransactionRead[] = [];

/**
 * The requests the service currently refuses to record an approval for — a network
 * or server error, NOT "already decided" (R10). Refusing changes nothing about the
 * request, which is what puts it in the third bucket rather than either of the
 * first two.
 */
let refusing = new Set<number>();

/**
 * Every request an approve call was actually sent for, in the order they went out.
 *
 * This is the one thing the list cannot show: resubmitting a request that was
 * already approved looks IDENTICAL on screen (the service answers the same envelope
 * and the status does not move again), so the absence of a call is observable
 * nowhere else. It is what AC-2's "the ones already approved are not touched by it"
 * and AC-3's "checks each request's current state first" are read from.
 */
const approvalsSentFor: number[] = [];

/** Puts a set of requests behind `GET /v1/transactions`. */
const serve = (requests: TransactionRead[]): void => {
  served = requests;
};

/** From here on the service refuses to record an approval for these requests. */
const refuseApprovalsFor = (requests: TransactionRead[]): void => {
  refusing = new Set(requests.map((request) => request.Id));
};

/** The service recovers: it records approvals again. */
const stopRefusing = (): void => {
  refusing = new Set();
};

/**
 * What the shared client throws when an approve call is REFUSED: the client's own
 * placeholder on `message`, and the service's `Messages[]` on `details`
 * (`lib/api/client.ts` → 500 branch). That split is the point of AC-1's "says
 * plainly why" — the reason the Approver must be shown is reachable only through
 * `serviceDetailOf`.
 */
const APPROVE_REFUSED: APIError = {
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  details: decisionFailureResponse().Messages,
  endpoint: DECISIONS_ENDPOINT,
};

/**
 * The decision one call carries, checked on the way through.
 *
 * The address is asserted here rather than in a test: a decision that went anywhere
 * other than the app's own decide route bypassed the identity stamping the service
 * requires (`lib/api/decisions.ts`), and this file would otherwise record it as a
 * perfectly ordinary approval.
 */
const decisionIn = (args: unknown[]): DecisionRequest => {
  const [endpoint, body] = args;
  if (endpoint !== DECISIONS_ENDPOINT) {
    throw new Error(
      `A decision was sent to "${String(endpoint)}" rather than to the app's own ` +
        `decide route ("${DECISIONS_ENDPOINT}"), which is where the acting ` +
        'identity is stamped from the session — see lib/api/decisions.ts.',
    );
  }
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as { TransactionId?: unknown }).TransactionId !== 'number'
  ) {
    throw new Error(
      'A decision was sent without a TransactionId — every approve call names ' +
        'exactly one request (brief BR3).',
    );
  }
  return body as DecisionRequest;
};

/* -------------------------------------------------------------------------- */
/* What the outcome report has to say                                          */
/* -------------------------------------------------------------------------- */

/**
 * The three buckets, in the wording shape the epic brief states for itself (see
 * contract item 5). Tolerant of the noun — "3 approved" and "3 requests approved"
 * both read correctly — and deliberately intolerant of a number that has drifted
 * away from the bucket it belongs to, which is the one bug this story exists to
 * prevent.
 */
const bucketPhrase = (count: number, phrase: string): RegExp =>
  new RegExp(`\\b${String(count)}(\\s+requests?)?\\s+${phrase}\\b`, 'i');

/** Requests whose status actually changed, per the reconciliation read (BR5). */
const approved = (count: number): RegExp => bucketPhrase(count, 'approved');

/** Requests never submitted at all, because a colleague got there first (BR1/BR2). */
const leftUnchanged = (count: number): RegExp =>
  bucketPhrase(count, 'left unchanged');

/** Requests the call itself failed for — the only bucket the retry covers (R10). */
const couldNotBeSubmitted = (count: number): RegExp =>
  bucketPhrase(count, 'could not be submitted');

/**
 * Why the left-unchanged bucket is not a failure: nothing went wrong, somebody else
 * decided the request first. Stating that is half of AC-1 — a bare "left unchanged"
 * leaves the Approver to guess whether something broke.
 */
const ALREADY_DECIDED_REASON = /already been decided/i;

/** The way to try again — the wording this project already uses for a retry. */
const RETRY_ACTION = /try again/i;

/**
 * The bulk action, which names the SELECTION. The per-request controls are named
 * "Approve request TXN-…" (`lib/transactions/deciding.ts`), so the two cannot be
 * confused for one another.
 */
const BULK_APPROVE_ACTION = /^approve\b.*\bselect/i;

/** The confirming choice inside the confirmation, beside the "Cancel" way out. */
const CONFIRM_BULK_APPROVE = /^approve\b/i;

/* -------------------------------------------------------------------------- */
/* Driving the screen                                                          */
/* -------------------------------------------------------------------------- */

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderList = () =>
  render(
    <ToastProvider>
      <ExpenseRequestList roles={[ROLE_APPROVER]} />
      <ToastContainer />
    </ToastProvider>,
  );

/**
 * The table row for a named request, found by the reference the row carries rather
 * than by position — and required to be unique, so a widened match can never quietly
 * select the wrong request.
 */
const rowFor = (reference: string): HTMLElement => {
  const rows = within(screen.getByRole('table'))
    .getAllByRole('row')
    .filter((row) => row.textContent?.includes(reference));

  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one table row carrying "${reference}", found ` +
        `${String(rows.length)} — the list renders one row per request, each ` +
        'identified by its Reference.',
    );
  }
  return rows[0];
};

/** One request's selection control: the tick in its own row (story 1). */
const selectionControlFor = (reference: string): HTMLElement =>
  within(rowFor(reference)).getByRole('checkbox');

/** Ticks a request, and waits for the tick to hold before moving on. */
const selectRequest = async (
  user: User,
  request: TransactionRead,
): Promise<void> => {
  await user.click(await waitFor(() => selectionControlFor(request.Reference)));
  await waitFor(() => {
    expect(selectionControlFor(request.Reference)).toBeChecked();
  });
};

/** Ticks several requests, in the order given. */
const selectRequests = async (
  user: User,
  requests: TransactionRead[],
): Promise<void> => {
  for (const request of requests) {
    await selectRequest(user, request);
  }
};

/**
 * Approves the whole selection: the bulk action, then the confirmation it opens.
 * Nothing is sent until the confirmation is accepted (story 2 AC-1).
 */
const approveTheSelection = async (user: User): Promise<void> => {
  await user.click(
    await screen.findByRole('button', { name: BULK_APPROVE_ACTION }),
  );
  const confirmation = await screen.findByRole('alertdialog');
  await user.click(
    within(confirmation).getByRole('button', { name: CONFIRM_BULK_APPROVE }),
  );
};

/** Takes the way to try again that the outcome report offers. */
const tryAgain = async (user: User): Promise<void> => {
  await user.click(await screen.findByRole('button', { name: RETRY_ACTION }));
};

/** The requests a decision was sent for since the last time this was called. */
const takeApprovalsSent = (): number[] => {
  const sent = [...approvalsSentFor].sort((first, second) => first - second);
  approvalsSentFor.length = 0;
  return sent;
};

/** The ids of some requests, in the order these tests compare them. */
const idsOf = (requests: TransactionRead[]): number[] =>
  requests.map((request) => request.Id).sort((first, second) => first - second);

/** Every request in a fixture set that is still awaiting a decision. */
const awaitingDecisionIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status === TRANSACTION_STATUS_IMPORTED);

describe('Epic bulk-approval-and-live-refresh, Story 3: when part of a bulk approval fails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    served = [];
    refusing = new Set();
    approvalsSentFor.length = 0;

    mockGet.mockImplementation(() =>
      Promise.resolve(transactionListResponse(served)),
    );

    mockPost.mockImplementation((...args: unknown[]) => {
      const { TransactionId } = decisionIn(args);
      approvalsSentFor.push(TransactionId);

      if (refusing.has(TransactionId)) {
        // The call itself failed. Nothing about the request changes — which is
        // exactly why it belongs in a bucket of its own rather than in the
        // already-decided one (R10).
        return Promise.reject(APPROVE_REFUSED);
      }

      // An accepted approval changes what the service holds, so the reconciliation
      // read can find it. The answer itself says nothing about the new status
      // (brief BR5) — a screen that trusts this body learns nothing.
      served = transactionsAfterApproving(served, [TransactionId]);
      return Promise.resolve(approveSuccessResponse(TransactionId));
    });
  });

  // AC-1
  it('names all three groups separately when some approvals could not be sent, and says why the last group failed', async () => {
    const user = userEvent.setup();

    // Four requests still awaiting a decision, plus the already-decided pair the
    // fixture carries (which must never become selectable at all).
    const requests = transactionsForBulkSelection(4);
    const [first, second, racedAway, refused] = awaitingDecisionIn(requests);
    serve(requests);

    renderList();

    await selectRequests(user, [first, second, racedAway, refused]);

    // Between building the selection and confirming it, a colleague decides one of
    // the selected requests. Only the pre-submit re-check (BR2) can see this — it
    // is the state the batch has to notice BEFORE it sends anything.
    serve(transactionsAfterColleagueDecided(served, [racedAway.Id]));
    // ...and the service refuses one of the remaining three outright.
    refuseApprovalsFor([refused]);

    await approveTheSelection(user);

    // All three groups, named apart from one another. The middle one is what a
    // naive before/after diff against the SELECTION-time snapshot gets wrong: it
    // would call the raced-away request newly approved and report three approved
    // and nothing left unchanged (contract item 7).
    expect(await screen.findByText(approved(2))).toBeVisible();
    expect(await screen.findByText(leftUnchanged(1))).toBeVisible();
    expect(await screen.findByText(couldNotBeSubmitted(1))).toBeVisible();

    // ...and each group says what it MEANS, so "left unchanged" does not read as a
    // second kind of failure and "could not be submitted" is not left unexplained.
    expect(await screen.findByText(ALREADY_DECIDED_REASON)).toBeVisible();
    expect(
      await screen.findByText(DECISION_REFUSED_MESSAGE, { exact: false }),
    ).toBeVisible();
    // The client's own placeholder never reaches the Approver (NFR-base-5).
    expect(
      screen.queryByText(CLIENT_FALLBACK_MESSAGES.serverError, {
        exact: false,
      }),
    ).not.toBeInTheDocument();

    // The list agrees with the report: the two it says were approved read
    // Approved, and the one it could not submit is untouched — still awaiting a
    // decision, because a refused call changes nothing.
    await waitFor(() => {
      expect(rowFor(first.Reference)).toHaveTextContent(
        TRANSACTION_STATUS_APPROVED,
      );
    });
    expect(rowFor(second.Reference)).toHaveTextContent(
      TRANSACTION_STATUS_APPROVED,
    );
    expect(rowFor(refused.Reference)).toHaveTextContent(
      TRANSACTION_STATUS_IMPORTED,
    );
  });

  // AC-2
  it('offers a way to try again that covers only the requests it could not submit, leaving the ones it already approved alone', async () => {
    const user = userEvent.setup();

    const requests = transactionsForBulkSelection(5);
    const awaiting = awaitingDecisionIn(requests);
    const wentThrough = awaiting.slice(0, 3);
    const failed = awaiting.slice(3);
    serve(requests);

    renderList();

    await selectRequests(user, awaiting);
    refuseApprovalsFor(failed);

    await approveTheSelection(user);

    expect(await screen.findByText(approved(3))).toBeVisible();
    expect(await screen.findByText(couldNotBeSubmitted(2))).toBeVisible();

    // The three that went through are decided and done with — these are the
    // requests the retry must leave alone.
    for (const request of wentThrough) {
      await waitFor(() => {
        expect(rowFor(request.Reference)).toHaveTextContent(
          TRANSACTION_STATUS_APPROVED,
        );
      });
    }

    // The service recovers, and the Approver takes the way out the report offered.
    takeApprovalsSent();
    stopRefusing();
    await tryAgain(user);

    // Exactly the two that failed were submitted again. The three this batch
    // already approved were not touched — resubmitting one would be invisible on
    // screen (the service answers the same envelope either way), which is why this
    // is read from the calls themselves (contract item 8).
    await waitFor(() => {
      expect(takeApprovalsSent()).toEqual(idsOf(failed));
    });

    // ...and the report the Approver acted on gives way to the retry's own result,
    // rather than leaving two answers about the same batch on the screen.
    await waitFor(() => {
      expect(
        screen.queryByText(couldNotBeSubmitted(2)),
      ).not.toBeInTheDocument();
    });
    expect(await screen.findByText(approved(2))).toBeVisible();

    for (const request of failed) {
      await waitFor(() => {
        expect(rowFor(request.Reference)).toHaveTextContent(
          TRANSACTION_STATUS_APPROVED,
        );
      });
    }
  });

  // AC-3
  it('checks each request again before trying again, so one a colleague decided in the meantime is reported as left unchanged rather than approved', async () => {
    const user = userEvent.setup();

    const requests = transactionsForBulkSelection(2);
    const awaiting = awaitingDecisionIn(requests);
    const [racedAway, stillWaiting] = awaiting;
    serve(requests);

    renderList();

    await selectRequests(user, awaiting);
    refuseApprovalsFor(awaiting);

    await approveTheSelection(user);

    expect(await screen.findByText(couldNotBeSubmitted(2))).toBeVisible();

    // Time passes between the failure and the retry — which is the whole reason
    // BR11 re-runs the eligibility check rather than resubmitting the original ids
    // blindly. A colleague decides one of the two failed requests.
    serve(transactionsAfterColleagueDecided(served, [racedAway.Id]));
    takeApprovalsSent();
    stopRefusing();

    await tryAgain(user);

    // Only the one still awaiting a decision was submitted. The raced-away request
    // was never sent at all (BR1) — sending it would record a second decision on a
    // request somebody else had already decided, and its answer would be
    // indistinguishable from a first one.
    await waitFor(() => {
      expect(takeApprovalsSent()).toEqual([stillWaiting.Id]);
    });

    // ...and it is reported as left unchanged BECAUSE it had already been decided,
    // never as approved — which is what stops the Approver being told they
    // approved something they did not.
    expect(await screen.findByText(approved(1))).toBeVisible();
    expect(await screen.findByText(leftUnchanged(1))).toBeVisible();
    expect(await screen.findByText(ALREADY_DECIDED_REASON)).toBeVisible();
  });

  // AC-4
  it('reports nothing as approved when every approval fails, keeps the selection, and still offers the way to try again', async () => {
    const user = userEvent.setup();

    const requests = transactionsForBulkSelection(3);
    const awaiting = awaitingDecisionIn(requests);
    serve(requests);

    renderList();

    await selectRequests(user, awaiting);
    // The connection is gone before the batch starts: every call fails.
    refuseApprovalsFor(awaiting);

    await approveTheSelection(user);

    // Nothing is claimed. The empty bucket is still named, rather than left for the
    // Approver to infer from an absence (contract item 5).
    expect(await screen.findByText(couldNotBeSubmitted(3))).toBeVisible();
    expect(await screen.findByText(approved(0))).toBeVisible();
    expect(
      await screen.findByText(DECISION_REFUSED_MESSAGE, { exact: false }),
    ).toBeVisible();

    // Every request is exactly where it was, and — the part that matters for
    // recovery — still selected, so the Approver has not lost the work of building
    // the selection along with the batch.
    for (const request of awaiting) {
      expect(rowFor(request.Reference)).toHaveTextContent(
        TRANSACTION_STATUS_IMPORTED,
      );
      expect(selectionControlFor(request.Reference)).toBeChecked();
    }

    // ...and the way out is still on offer (NFR-base-5).
    expect(
      await screen.findByRole('button', { name: RETRY_ACTION }),
    ).toBeVisible();
  });
});
