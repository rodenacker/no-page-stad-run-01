/**
 * Story Metadata:
 * - Epic: request-list-redesign — Story 9: watching the batch balance
 * - Route: /requests
 * - Target File: web/src/components/requests/ExpenseRequestList.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — before a single decision is confirmed, the affected row is visibly marked
 *   and the outstanding count visibly does not balance (R17/BR7);
 * - AC-2 — before a bulk approval is accepted, that same unbalanced state is visible
 *   for every selected request, beside a confirmation naming the exact count;
 * - AC-3 — backing out of either confirmation puts the rows and the figures back
 *   exactly as they were, and decides nothing;
 * - AC-6 — everything the decision flow already did still happens: the
 *   re-read-before-submit staleness check, the already-decided refusal, the bulk
 *   three-bucket outcome report, and the list keeping itself current on its own.
 *
 * AC-4 (the count rolling down in place with nothing on the screen jumping) and AC-5
 * (the same end state instantly under `prefers-reduced-motion`) are the Playwright
 * spec's: both are motion and layout-shift in a real browser, which jsdom has no
 * layout engine to see and no animation frames to run (testing-policy.md § "One tag,
 * one layer" and § Time-dependent behaviour). Asserting them here under fake timers
 * would prove nothing about the shipped transition.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE IS THE DANGEROUS ONE (read before implementing)
 * ---------------------------------------------------------------------------
 * This story rewires the area around two flows that SHIPPED and that R1/BR2 freeze:
 * the single decide flow (`epic-expense-decisions-story-*`) and bulk approval with
 * self-refresh (`epic-bulk-approval-and-live-refresh-story-*`). AC-6 below is the
 * safety net for the whole story — it re-asserts those behaviours through the new
 * presentation layer, at the strength those suites already assert them. Brief BR1
 * forbids weakening any behavioural assertion in either of them: this file is an
 * ADDITION to that cover, never a softer restatement of it.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin
 * ---------------------------------------------------------------------------
 * 1. THE SURFACE IS THE EXISTING LIST. The component under test is the client
 *    component `web/src/components/requests/ExpenseRequestList.tsx`, fed `roles` by
 *    the server page exactly as it is today. This story adds a PRESENTATION LAYER
 *    OVER `lib/transactions/{deciding,bulkApproval,refreshing}.ts` — never inside
 *    them. No second list, no second decide path, no second batch runner.
 * 2. THE CONTROL BLOCK IS ON SCREEN IN THESE TESTS. Story 2's figures are derived
 *    client-side from the `TransactionRead[]` this component holds, so they render
 *    within it (or within a child of it) and are reachable from this render. Nothing
 *    here lifts the fetch into the server page.
 * 3. HOW A CONTROL-BLOCK FIGURE IS READ. Each figure carries its own label as its
 *    ACCESSIBLE NAME — `aria-labelledby` pointing at the visible 11px tracked label
 *    is the natural markup and avoids a second copy of the wording (the rule
 *    `PossibleDuplicateMark` states: exactly one element carries the words); a plain
 *    `aria-label` satisfies it too. So `AWAITING DECISION` is not a bare numeral
 *    floating beside some text: a screen-reader user hears "Awaiting decision, 5".
 *    The element so labelled carries THE FIGURE AND NOTHING ELSE, which is what lets
 *    a test say the figure is 5 rather than that the block mentions a 5 somewhere.
 * 4. THE COUNT IS STORY 2's, AND IT IS NOT `countRequests()`. `AWAITING DECISION` is
 *    `Status === Imported`; `DECIDED` is `Status !== Imported`; `RECORDS` is the
 *    whole fetched set — so the two always sum to `RECORDS`. The existing
 *    `countRequests()` helper defines `decided = approved + rejected` (built for the
 *    file-deletion confirmation) and is WRONG for this screen: a status outside the
 *    three recognised values counts as neither there and must count as `DECIDED`
 *    here. If this story recomputes the figure a different way from story 2, the roll
 *    lands on a number that disagrees with the band it lives in.
 * 5. WHAT "DOES NOT BALANCE" IS, CONCRETELY (R17/BR7). While a decision is awaiting
 *    confirmation — single or bulk — `AWAITING DECISION` states the figure the batch
 *    WILL have once it is committed, while `RECORDS` and `DECIDED` still state what
 *    the batch IS. The three therefore visibly do not add up, which is the whole
 *    point: the reader sees the after-picture and can see it has not happened yet.
 *    `DECIDED` must NOT move with it — moving both would make the block balance again
 *    and there would be nothing to see.
 * 6. AND THE GAP IS NAMED, NOT LEFT AS A MYSTERY. The block states how many
 *    decisions are awaiting confirmation, as one more label-over-figure pair in the
 *    same grammar: label "NOT YET CONFIRMED", figure the count. It is ABSENT while
 *    nothing is pending — this project's convention (an indicator reading "0" is a
 *    permanent fixture rather than an answer, `ExpenseRequestList`'s selected-count
 *    line). Without it a projected figure would be indistinguishable, to a
 *    screen-reader user, from a decision that had already been recorded.
 * 7. AND EVERY AFFECTED ROW IS MARKED, IN WORDS. Each row the pending decision
 *    covers carries the mark "Not yet confirmed" — the `StatusBadge` grammar this
 *    screen already uses for a row mark: wording paired with a glyph and an intent
 *    colour, never colour or shape alone (R3/UI-21, BR3), and exactly one element
 *    carrying the wording. The two-character gutter (story 6) may be where the eye
 *    finds it; the WORDS must be on the row, because BR3 says a mark with no
 *    accompanying text anywhere on the row does not satisfy R3 on its own. This is
 *    the half of BR7 that dialog copy cannot satisfy: a confirmation that merely
 *    DESCRIBES the outcome does not meet R17.
 * 8. BACKING OUT REVERTS EXACTLY (AC-3). Closing either confirmation — the way out,
 *    or Escape — puts every figure back, takes every mark off, and decides nothing:
 *    no call leaves the browser and nothing is announced. A bulk selection SURVIVES
 *    backing out (it always has: `bulk-approval-and-live-refresh` story 2 AC-1), so
 *    the reader loses the confirmation and nothing else.
 * 9. ⚠ THE NON-OBVIOUS COUPLING THIS STORY MUST NOT BREAK. The bulk-approve
 *    confirmation is gated on `bulkApprovalAsked` ALONE — deliberately not also on
 *    the selection being non-empty. `ExpenseRequestList` carries an inline comment
 *    explaining why: a selection can empty underneath the dialog, and a dialog that
 *    unmounts itself never reports itself closed, so the flag would stay true for
 *    good — which is also what pauses the self-refresh, leaving the list silently
 *    stale for the rest of the session. Nothing below forces that gate to change,
 *    and no test may be written that does.
 * 10. THE MACHINERY UNDERNEATH IS UNCHANGED (AC-6). The re-read before submitting
 *    (`expense-decisions` BR1), the already-decided refusal in its required wording,
 *    the bulk pre-submit re-check, the reconciliation read the three buckets are
 *    computed from (never the call answers — the mock below returns the success body
 *    for an already-decided request, field for field), the scoped retry, and the
 *    self-refresh cadence and its pausing rules all stay exactly as they are. The
 *    control totals are a VIEW over that machinery.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy), so `lib/api/decisions.ts`,
 * `lib/api/transactions.ts`, `lib/api/errors.ts` and every module in
 * `lib/transactions/` are exercised for real. Every response body comes from the
 * project-wide factory in `@/mocks/data/transaction`, shared with the Playwright
 * layer, and the mocks behave like a SERVICE rather than a script: each read answers
 * with what the service currently holds, an accepted approval changes what it holds,
 * and a refused one changes nothing. That is what makes the successive snapshots this
 * file turns on — the pre-submit re-read and the refresh poll — real reads of a state
 * moving underneath the screen.
 *
 * Timers: FAKE, because AC-6's last clause is the component-local 15s refresh
 * interval — the testing-policy's last-resort fake-timer case, and the reason the
 * real round trip is Playwright's. No test here knows the cadence: each either waits
 * for an observable change inside a window far longer than it, or lets such a window
 * pass and asserts nothing changed. Do NOT add a shortened, test-only interval. No
 * `axe()` runs here — accessibility is scanned in a real browser.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): there is no control
 * block and no pre-commit mark on this screen yet.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, {
  PointerEventsCheckLevel,
} from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the list every epic so far has extended, and the one
// this story lays the batch's control totals and its pre-commit state over.
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// The real production notification composition (not mocked): the arrangement the root
// layout wraps every signed-in screen in, and the only surface a decision, a refusal
// or a batch outcome may speak through.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get, post } from '@/lib/api/client';
import { DECISIONS_ENDPOINT } from '@/lib/api/decisions';
import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';
import { TRANSACTIONS_ENDPOINT } from '@/lib/api/transactions';

// Project-wide Transaction factory: the single source of truth for the wire shape and
// its canonical values, shared with the Playwright layer. Never hand-write a response
// body in a test.
import {
  DECISION_REFUSED_MESSAGE,
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_REJECTED,
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
import type { APIError, DefaultResponse } from '@/types/api';

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
 * What the transactions service currently holds. EVERY `GET /v1/transactions` is
 * answered from this one value — the first read, the staleness re-read before a
 * single decision, the bulk pre-submit re-check, the reconciliation read and the
 * refresh poll alike — because the service has no delta channel and no
 * single-request GET: each of those is the same full-list read at a different
 * moment.
 */
let served: TransactionRead[] = [];

/** Puts a set of requests behind `GET /v1/transactions`. */
const serve = (requests: TransactionRead[]): void => {
  served = requests;
};

/**
 * The requests the service currently refuses to record an approval for — a server
 * failure, NOT "already decided". A refusal changes nothing about the request, which
 * is what puts it in the outcome's third bucket rather than either of the first two.
 */
let refusing = new Set<number>();

/** From here on the service refuses to record an approval for these requests. */
const refuseApprovalsFor = (requests: TransactionRead[]): void => {
  refusing = new Set(requests.map((request) => request.Id));
};

/**
 * Every request a decision was actually SENT for, in the order the calls went out.
 *
 * This is the one thing the screen cannot show. A decision that was never sent looks
 * exactly like one that was sent and answered — the service returns the same envelope
 * whatever happened — so "nothing was sent at all" (the staleness guard) and "the
 * raced request was never submitted" (the bulk pre-submit re-check) are observable
 * nowhere else. Read as identities, never as a call count.
 */
const decisionsSentFor: number[] = [];

/**
 * What the shared client throws when an approve call is REFUSED: the client's own
 * placeholder on `message`, and the service's `Messages[]` on `details`
 * (`lib/api/client.ts` → 500 branch). That split is why the reason the Approver must
 * be shown is reachable only through `serviceDetailOf`.
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
 * The address is asserted here rather than in a test: a decision sent anywhere other
 * than the app's own decide route bypassed the identity stamping the service requires
 * (`lib/api/decisions.ts`), and this file would otherwise record it as a perfectly
 * ordinary decision.
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
      'A decision was sent without a TransactionId — every decide call names ' +
        'exactly one request (there is no bulk endpoint).',
    );
  }
  return body as DecisionRequest;
};

/** The requests a decision was sent for, in a fixed order so a comparison is stable. */
const decisionsSent = (): number[] =>
  [...decisionsSentFor].sort((first, second) => first - second);

/** The ids of some requests, in the same fixed order. */
const idsOf = (requests: TransactionRead[]): number[] =>
  requests.map((request) => request.Id).sort((first, second) => first - second);

/* -------------------------------------------------------------------------- */
/* Time, and the screen                                                        */
/* -------------------------------------------------------------------------- */

/**
 * How much FAKE time a test is prepared to let pass while waiting for the list to
 * catch up on its own. Deliberately NOT the implementation's interval and several
 * times longer than it: the criterion is that the list keeps itself current without
 * anyone touching it, not that it does so on any particular schedule.
 */
const REFRESH_WINDOW_MS = 60_000;

/** Advance the fake clock inside `act`, so timer-driven renders are flushed first. */
const settle = async (ms = 0): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const setupUser = (): User =>
  userEvent.setup({
    advanceTimers: (delay: number) => {
      vi.advanceTimersByTime(delay);
    },
    // Radix puts `pointer-events: none` on the body while a modal is open; jsdom then
    // reports the dialog's own controls as un-clickable even though a real browser
    // lets them through.
    pointerEventsCheck: PointerEventsCheckLevel.Never,
  });

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderList = async (): Promise<void> => {
  render(
    <ToastProvider>
      <ExpenseRequestList roles={[ROLE_APPROVER]} />
      <ToastContainer />
    </ToastProvider>,
  );
  await settle();
  await waitFor(
    () => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    },
    { interval: 250 },
  );
};

/* -------------------------------------------------------------------------- */
/* Reading the rows                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Every table row carrying a request's reference.
 *
 * Found by TEXT rather than through `getByRole('table')`, for one reason: while a
 * modal confirmation is open Radix marks everything behind it `aria-hidden`, so every
 * ROLE query against the list underneath comes back empty. AC-1, AC-2 and AC-3 all
 * read the rows and the control block from behind an open confirmation — which is the
 * whole subject of this story — so the helper has to work there.
 */
const rowsCarrying = (reference: string): HTMLElement[] => {
  const rows = screen
    .queryAllByText(reference)
    .map((cell) => cell.closest('tr'))
    .filter((row): row is HTMLTableRowElement => row !== null);
  return [...new Set<HTMLElement>(rows)];
};

/**
 * The one row for a named request, required to be unique so a widened match can never
 * quietly assert about the wrong request.
 */
const rowFor = (reference: string): HTMLElement => {
  const rows = rowsCarrying(reference);
  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one table row carrying "${reference}", found ` +
        `${String(rows.length)} — the list renders one row per request, each ` +
        'identified by its Reference.',
    );
  }
  return rows[0];
};

/** Where a request stands, as its own row states it — in words, never colour alone. */
const expectStatusOn = (reference: string, status: string): void => {
  expect(within(rowFor(reference)).getByText(status)).toBeInTheDocument();
};

/** Waits for a row to catch up with a decision recorded somewhere else. */
const waitForStatusOn = async (
  reference: string,
  status: string,
): Promise<void> => {
  await waitFor(
    () => {
      expectStatusOn(reference, status);
    },
    { timeout: REFRESH_WINDOW_MS, interval: 250 },
  );
};

/** How a request's reference reads, so a marked row can name itself in a failure. */
const REFERENCE_PATTERN = /TXN-\d{8}-\d{4}/;

const referenceOn = (row: HTMLElement): string =>
  REFERENCE_PATTERN.exec(row.textContent ?? '')?.[0] ??
  '(row with no reference)';

/* -------------------------------------------------------------------------- */
/* Reading the control block, and the pre-commit state                         */
/* -------------------------------------------------------------------------- */

/** The control block's labels (contract item 3), as the design brief words them. */
const RECORDS = /^records$/i;
const AWAITING_DECISION = /^awaiting decision$/i;
const DECIDED = /^decided$/i;

/**
 * The pre-commit wording (contract items 6 and 7) — one phrase, used as the control
 * block's label for the gap and as the mark on every affected row, so the block and
 * the rows cannot come to say two different things about one pending decision.
 */
const NOT_YET_CONFIRMED = /^not yet confirmed$/i;

/**
 * The figure the control block currently states under a label, as a screen-reader user
 * reaches it: the element the label NAMES (contract item 3). Whitespace-normalised,
 * and compared whole — so "5" is never satisfied by a block that happens to contain a
 * 5 somewhere else.
 */
const figureUnder = (label: RegExp): string =>
  (screen.getByLabelText(label).textContent ?? '').replace(/\s+/g, ' ').trim();

interface BatchFigures {
  records: number;
  awaitingDecision: number;
  decided: number;
}

/**
 * What the control block says the batch is — the three counts read TOGETHER, because
 * whether they balance is the thing under test. `awaitingDecision + decided` equal to
 * `records` is a batch stating what it IS; unequal is a batch stating what it WILL BE
 * once the reader commits (R17/BR7).
 */
const expectControlBlock = ({
  records,
  awaitingDecision,
  decided,
}: BatchFigures): void => {
  expect(figureUnder(RECORDS)).toBe(String(records));
  expect(figureUnder(AWAITING_DECISION)).toBe(String(awaitingDecision));
  expect(figureUnder(DECIDED)).toBe(String(decided));
};

/** How many decisions the control block says are awaiting confirmation. */
const expectAwaitingConfirmation = (count: number): void => {
  expect(figureUnder(NOT_YET_CONFIRMED)).toBe(String(count));
};

/**
 * The references of the rows currently carrying the pre-commit mark.
 *
 * The control block's own label for the gap carries the same words, and is not in a
 * row — so it is filtered out here rather than left to widen the result.
 */
const rowsMarkedNotYetConfirmed = (): string[] =>
  [
    ...new Set<HTMLElement>(
      screen
        .queryAllByText(NOT_YET_CONFIRMED)
        .map((mark) => mark.closest('tr'))
        .filter((row): row is HTMLTableRowElement => row !== null),
    ),
  ]
    .map(referenceOn)
    .sort((first, second) => first.localeCompare(second));

/** The references given, in the same order, so a comparison does not depend on one. */
const referencesOf = (requests: TransactionRead[]): string[] =>
  requests
    .map((request) => request.Reference)
    .sort((first, second) => first.localeCompare(second));

/**
 * Nothing is pending: no row is marked, and the block states no gap at all rather
 * than a permanent "0 not yet confirmed" (contract item 6).
 */
const expectNothingAwaitingConfirmation = (): void => {
  expect(rowsMarkedNotYetConfirmed()).toEqual([]);
  expect(screen.queryByLabelText(NOT_YET_CONFIRMED)).not.toBeInTheDocument();
};

/* -------------------------------------------------------------------------- */
/* Driving the screen                                                         */
/* -------------------------------------------------------------------------- */

/** One request's own Approve control, on its own row (`expense-decisions`). */
const approveControlOn = async (reference: string): Promise<HTMLElement> =>
  await waitFor(() =>
    within(rowFor(reference)).getByRole('button', {
      name: new RegExp(`^approve\\b.*${reference}`, 'i'),
    }),
  );

/** One request's own Reject control, on its own row. */
const rejectControlOn = (reference: string): HTMLElement =>
  within(rowFor(reference)).getByRole('button', {
    name: new RegExp(`^reject\\b.*${reference}`, 'i'),
  });

/** One request's selection control, in its own row (story 6 moves it into the gutter). */
const selectionControlOn = async (reference: string): Promise<HTMLElement> =>
  await waitFor(() =>
    within(rowFor(reference)).getByRole('checkbox', {
      name: new RegExp(`^select\\b.*${reference}`, 'i'),
    }),
  );

/** Ticks each named request in turn, as a reader building a selection does. */
const selectRequests = async (
  user: User,
  requests: TransactionRead[],
): Promise<void> => {
  for (const request of requests) {
    await user.click(await selectionControlOn(request.Reference));
    // Waited for, so a selection is never half-built when the next tick lands.
    await waitFor(() => {
      expect(
        within(rowFor(request.Reference)).getByRole('checkbox'),
      ).toBeChecked();
    });
  }
};

/**
 * The bulk action, named for the SELECTION it acts on — never confusable with the
 * "Approve request TXN-…" control every listed request carries.
 */
const BULK_APPROVE_ACTION = /^approve\b.*\bselect/i;

/** The way out of the shared confirmation, which holds focus when it opens. */
const WAY_OUT_OF_CONFIRMATION = /^cancel\b/i;

/** The confirming choice inside either confirmation. */
const CONFIRMING_CHOICE = /^approve\b/i;

/** Asks to decide one request, and hands back the confirmation it opens. */
const chooseApproveOn = async (
  user: User,
  reference: string,
): Promise<HTMLElement> => {
  await user.click(await approveControlOn(reference));
  return await screen.findByRole('alertdialog');
};

/** Asks to approve the whole selection, and hands back the confirmation it opens. */
const chooseBulkApprove = async (user: User): Promise<HTMLElement> => {
  await user.click(
    await screen.findByRole('button', { name: BULK_APPROVE_ACTION }),
  );
  return await screen.findByRole('alertdialog');
};

/** Takes the confirming choice inside an open confirmation. */
const accept = async (user: User, confirmation: HTMLElement): Promise<void> => {
  await user.click(
    within(confirmation).getByRole('button', { name: CONFIRMING_CHOICE }),
  );
};

/** Waits for an open confirmation to be gone. */
const expectConfirmationClosed = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
};

/**
 * The app's in-app notification surface (the root layout's `ToastContainer`), which
 * renders nothing at all while there is nothing to tell the reader — so its absence
 * IS "nothing was announced".
 */
const notificationSurface = (): HTMLElement | null =>
  screen.queryByRole('region', { name: /notifications/i });

/** The same surface where a test has already established it is there. */
const openNotifications = async (): Promise<HTMLElement> =>
  await screen.findByRole('region', { name: /notifications/i });

/** Dismisses every message currently on screen, as the reader acting on one does. */
const dismissEveryMessage = async (user: User): Promise<void> => {
  const surface = await openNotifications();
  for (const dismiss of within(surface).getAllByRole('button', {
    name: /dismiss notification/i,
  })) {
    await user.click(dismiss);
  }
  await waitFor(() => {
    expect(notificationSurface()).not.toBeInTheDocument();
  });
};

/* -------------------------------------------------------------------------- */
/* What the machinery underneath still has to say (AC-6)                       */
/* -------------------------------------------------------------------------- */

/** The refusal wording `expense-decisions` R4/R13 fix, word for word. */
const ALREADY_DECIDED = /this request has already been decided\./i;

/** Why the left-unchanged bucket is not a failure: somebody else got there first. */
const ALREADY_DECIDED_REASON = /already been decided/i;

/**
 * The outcome's three buckets, in the wording shape `bulk-approval-and-live-refresh`
 * states for itself. Tolerant of the noun — "1 approved" and "1 request approved"
 * both read correctly — and deliberately intolerant of a number that has drifted away
 * from the bucket it belongs to.
 */
const bucketPhrase = (count: number, phrase: string): RegExp =>
  new RegExp(`\\b${String(count)}(\\s+requests?)?\\s+${phrase}\\b`, 'i');

const approvedBucket = (count: number): RegExp =>
  bucketPhrase(count, 'approved');
const leftUnchangedBucket = (count: number): RegExp =>
  bucketPhrase(count, 'left unchanged');
const couldNotBeSubmittedBucket = (count: number): RegExp =>
  bucketPhrase(count, 'could not be submitted');

/** Every request in a fixture set that is still awaiting a decision. */
const awaitingDecisionIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status === TRANSACTION_STATUS_IMPORTED);

describe('Epic request-list-redesign, Story 9: watching the batch balance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    served = [];
    refusing = new Set();
    decisionsSentFor.length = 0;

    mockGet.mockImplementation((endpoint: unknown) => {
      const path = String(endpoint);
      if (path !== TRANSACTIONS_ENDPOINT) {
        throw new Error(
          `Unexpected read of "${path}" — every read this screen makes is the list ` +
            `call itself (${TRANSACTIONS_ENDPOINT}, no parameters): the first load, ` +
            'the re-read before submitting, the reconciliation read and the refresh ' +
            'poll alike. There is no per-request read and no second endpoint.',
        );
      }
      return Promise.resolve(transactionListResponse(served));
    });

    mockPost.mockImplementation(
      (...args: unknown[]): Promise<DefaultResponse> => {
        const { TransactionId } = decisionIn(args);
        decisionsSentFor.push(TransactionId);

        if (refusing.has(TransactionId)) {
          // The call itself failed. Nothing about the request changes — which is why
          // it belongs in a bucket of its own rather than in the already-decided one.
          return Promise.reject(APPROVE_REFUSED);
        }

        // An accepted decision changes what the service holds, so the read that
        // follows can find it. The answer itself says nothing about the new status: a
        // screen that trusts this body learns nothing at all from it.
        served = transactionsAfterApproving(served, [TransactionId]);
        return Promise.resolve(approveSuccessResponse(TransactionId));
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AC-1
  it('marks the affected row and leaves the outstanding count visibly not balancing before a single decision is confirmed', async () => {
    const user = setupUser();

    // Eight records: six still awaiting a decision, and the fixture's already-decided
    // pair. The pair is the point, not padding — it is what makes DECIDED a figure
    // that can be watched for movement rather than a permanent zero.
    const requests = transactionsForBulkSelection(6);
    const [deciding, untouched] = awaitingDecisionIn(requests);
    serve(requests);

    await renderList();

    // The batch as it stands: the two counts add up to the record count, which is
    // what "balanced" means on this screen (contract item 4).
    expectControlBlock({ records: 8, awaitingDecision: 6, decided: 2 });
    expectNothingAwaitingConfirmation();

    await chooseApproveOn(user, deciding.Reference);

    // The reader is being asked — and while they are, the screen ITSELF shows what
    // the batch will look like afterwards. The outstanding count states the figure
    // the batch WILL have, while RECORDS and DECIDED still state what it IS: five
    // and two do not make eight, so the block visibly does not balance (R17).
    expectControlBlock({ records: 8, awaitingDecision: 5, decided: 2 });
    // ...and the gap is named rather than left to be inferred from a figure that
    // would otherwise be indistinguishable from a recorded decision.
    expectAwaitingConfirmation(1);

    // The affected row is marked, in words, on the row itself — this is the half of
    // BR7 that dialog copy cannot satisfy, so it is asserted on the row and not on
    // the confirmation. Exactly one row carries it: the one being decided.
    expect(
      within(rowFor(deciding.Reference)).getByText(NOT_YET_CONFIRMED),
    ).toBeInTheDocument();
    expect(rowsMarkedNotYetConfirmed()).toEqual([deciding.Reference]);

    // Nothing about any request has actually changed yet: the one being decided is
    // still awaiting a decision, its neighbour is untouched...
    expectStatusOn(deciding.Reference, TRANSACTION_STATUS_IMPORTED);
    expectStatusOn(untouched.Reference, TRANSACTION_STATUS_IMPORTED);
    // ...and nothing at all has left the browser (R10 — the decision does not take
    // effect until the confirmation is accepted).
    expect(decisionsSent()).toEqual([]);
    expect(notificationSurface()).not.toBeInTheDocument();
  });

  // AC-2
  it('shows the same unbalanced state for every selected request before a bulk approval is accepted, beside a confirmation naming the exact count', async () => {
    const user = setupUser();

    const requests = transactionsForBulkSelection(6);
    const awaiting = awaitingDecisionIn(requests);
    const chosen = awaiting.slice(0, 3);
    const notChosen = awaiting.slice(3);
    serve(requests);

    await renderList();

    await selectRequests(user, chosen);

    // Selecting decides nothing, so nothing is unbalanced yet: the pre-commit state
    // belongs to the confirmation being open, not to a selection existing.
    expectControlBlock({ records: 8, awaitingDecision: 6, decided: 2 });
    expectNothingAwaitingConfirmation();

    const confirmation = await chooseBulkApprove(user);

    // The confirmation names the exact number it is about to commit — the count the
    // Approver judges the action by (`bulk-approval-and-live-refresh` BR4).
    expect(confirmation).toHaveTextContent(
      new RegExp(`\\b${String(chosen.length)}\\b`),
    );
    expect(confirmation).not.toHaveTextContent('99+');

    // ...and beside it, the same unbalanced state as a single decision: three and
    // two do not make eight, and the block says how much of it is not yet confirmed.
    expectControlBlock({ records: 8, awaitingDecision: 3, decided: 2 });
    expectAwaitingConfirmation(3);

    // Every selected request is marked — all three of them, not just the first...
    expect(rowsMarkedNotYetConfirmed()).toEqual(referencesOf(chosen));
    for (const request of chosen) {
      expect(
        within(rowFor(request.Reference)).getByText(NOT_YET_CONFIRMED),
      ).toBeInTheDocument();
      expectStatusOn(request.Reference, TRANSACTION_STATUS_IMPORTED);
    }
    // ...and the requests nobody selected are left entirely alone, so the mark reads
    // as "this one is about to change" rather than as page-wide decoration.
    for (const request of notChosen) {
      expectStatusOn(request.Reference, TRANSACTION_STATUS_IMPORTED);
    }

    // Nothing has been sent: the batch starts when the confirmation is accepted.
    expect(decisionsSent()).toEqual([]);
    expect(notificationSurface()).not.toBeInTheDocument();
  });

  // AC-3
  it('puts the rows and the figures back exactly as they were when either confirmation is backed out of, and decides nothing', async () => {
    const user = setupUser();

    const requests = transactionsForBulkSelection(6);
    const awaiting = awaitingDecisionIn(requests);
    const [deciding] = awaiting;
    const chosen = awaiting.slice(1, 3);
    serve(requests);

    await renderList();

    // --- backing out of a single decision ------------------------------------
    const confirmation = await chooseApproveOn(user, deciding.Reference);
    // The state there is to revert (AC-1's, in one line): the count no longer
    // balances and the row is marked.
    expectControlBlock({ records: 8, awaitingDecision: 5, decided: 2 });
    expect(rowsMarkedNotYetConfirmed()).toEqual([deciding.Reference]);

    await user.click(
      within(confirmation).getByRole('button', {
        name: WAY_OUT_OF_CONFIRMATION,
      }),
    );
    await expectConfirmationClosed();

    // Exactly as they were: the batch balances again, no row carries a mark, and the
    // block has stopped stating a gap.
    expectControlBlock({ records: 8, awaitingDecision: 6, decided: 2 });
    expectNothingAwaitingConfirmation();
    // ...the request is untouched and can still be decided...
    expectStatusOn(deciding.Reference, TRANSACTION_STATUS_IMPORTED);
    expect(await approveControlOn(deciding.Reference)).toBeInTheDocument();
    expect(rejectControlOn(deciding.Reference)).toBeInTheDocument();
    // ...and nothing was decided or announced about an action that did not happen.
    expect(decisionsSent()).toEqual([]);
    expect(notificationSurface()).not.toBeInTheDocument();

    // --- and backing out of a bulk approval, the way a keyboard user does -----
    await selectRequests(user, chosen);
    await chooseBulkApprove(user);
    expectControlBlock({ records: 8, awaitingDecision: 4, decided: 2 });
    expect(rowsMarkedNotYetConfirmed()).toEqual(referencesOf(chosen));

    await user.keyboard('{Escape}');
    await expectConfirmationClosed();

    expectControlBlock({ records: 8, awaitingDecision: 6, decided: 2 });
    expectNothingAwaitingConfirmation();
    for (const request of chosen) {
      expectStatusOn(request.Reference, TRANSACTION_STATUS_IMPORTED);
      // The SELECTION survives: backing out costs the Approver the confirmation and
      // nothing else (`bulk-approval-and-live-refresh` story 2 AC-1).
      expect(await selectionControlOn(request.Reference)).toBeChecked();
    }
    expect(decisionsSent()).toEqual([]);
    expect(notificationSurface()).not.toBeInTheDocument();
  });

  // AC-6
  it('still runs the whole decision flow underneath: the re-read before submitting, the already-decided refusal, the three-bucket bulk outcome, and a list that keeps itself current', async () => {
    const user = setupUser();

    const requests = transactionsForBulkSelection(6);
    const [raced, approvedByUs, decidedByColleague, refused, decidedElsewhere] =
      awaitingDecisionIn(requests);
    serve(requests);

    await renderList();
    expectControlBlock({ records: 8, awaitingDecision: 6, decided: 2 });

    /* --- 1. the re-read before submitting, and the already-decided refusal ---
       `expense-decisions` BR1/R4/R13: the decide answer carries the same envelope
       whatever happened, so the only way to know is a FRESH read taken after the
       confirmation is accepted and before anything is sent. */
    const decideConfirmation = await chooseApproveOn(user, raced.Reference);

    // While the confirmation is open, another Approver REJECTS the same request.
    // Deliberately a rejection: it is not the status this decision would have set,
    // so "the list caught up" cannot be satisfied by the outcome this user wanted.
    serve(
      transactionsAfterColleagueDecided(
        served,
        [raced.Id],
        TRANSACTION_STATUS_REJECTED,
      ),
    );

    await accept(user, decideConfirmation);

    // The refusal reaches the Approver in the wording the requirement fixes...
    expect(
      await screen.findByText(
        ALREADY_DECIDED,
        {},
        { timeout: REFRESH_WINDOW_MS },
      ),
    ).toBeInTheDocument();
    // ...and NOTHING was sent: a decide call here would have recorded a second
    // decision on a request somebody else had already decided, and its answer would
    // have been indistinguishable from a first one.
    expect(decisionsSent()).toEqual([]);

    // The list caught up with what was actually recorded, and the control totals
    // corrected themselves with it — the pre-commit state is gone, and the batch
    // balances again around the decision that really happened.
    await waitForStatusOn(raced.Reference, TRANSACTION_STATUS_REJECTED);
    expectControlBlock({ records: 8, awaitingDecision: 5, decided: 3 });
    expectNothingAwaitingConfirmation();

    // The refusal is something the Approver has to act on, so they act on it — which
    // also leaves the notification surface unambiguous for the outcome report below.
    await dismissEveryMessage(user);

    /* --- 2. the bulk outcome, still in three separate buckets ---------------- */
    await selectRequests(user, [approvedByUs, decidedByColleague, refused]);

    const bulkConfirmation = await chooseBulkApprove(user);
    expect(bulkConfirmation).toHaveTextContent(/\b3\b/);

    // With the confirmation open, a colleague decides one of the three, and the
    // service starts refusing another outright.
    //
    // The confirmation being open is ALSO what pauses the self-refresh
    // (`bulk-approval-and-live-refresh` BR7), which is why the colleague's decision
    // below cannot land under the reader before their own batch's pre-submit read
    // finds it. That pause is gated on `bulkApprovalAsked` ALONE — see the note in
    // `ExpenseRequestList` about a dialog that unmounts itself never reporting
    // itself closed, and do not narrow the gate to also require a selection.
    serve(transactionsAfterColleagueDecided(served, [decidedByColleague.Id]));
    refuseApprovalsFor([refused]);

    await accept(user, bulkConfirmation);

    // All three buckets, named apart from one another, with the reason each is in
    // its own bucket. The middle one is what a naive diff against the state at
    // SELECTION time gets wrong — it would report the raced request as newly
    // approved and leave the left-unchanged bucket empty.
    const report = await openNotifications();
    await waitFor(() => {
      expect(report).toHaveTextContent(approvedBucket(1));
    });
    expect(report).toHaveTextContent(leftUnchangedBucket(1));
    expect(report).toHaveTextContent(ALREADY_DECIDED_REASON);
    expect(report).toHaveTextContent(couldNotBeSubmittedBucket(1));
    // The service's own reason for the refusal reaches the Approver, and the
    // client's placeholder never does (project.md NFR-base-5).
    expect(report).toHaveTextContent(DECISION_REFUSED_MESSAGE);
    expect(report).not.toHaveTextContent(CLIENT_FALLBACK_MESSAGES.serverError);

    // Exactly two decisions were sent: the one that went through and the one the
    // service refused. The request a colleague had already decided was never
    // submitted at all (the pre-submit re-check), which nothing on screen can show.
    expect(decisionsSent()).toEqual(idsOf([approvedByUs, refused]));

    // The list agrees with the report...
    await waitForStatusOn(approvedByUs.Reference, TRANSACTION_STATUS_APPROVED);
    expectStatusOn(refused.Reference, TRANSACTION_STATUS_IMPORTED);
    // ...and so do the control totals: they moved for the two decisions that
    // actually resolved (this user's approval and the colleague's) and for neither
    // the refused call nor anything else. Three awaiting, five decided, balanced.
    expectControlBlock({ records: 8, awaitingDecision: 3, decided: 5 });
    expectNothingAwaitingConfirmation();

    /* --- 3. and the list keeps itself current on its own -------------------- */
    // Nobody touches the screen from here: a colleague decides another request, and
    // the row and the figures have to correct themselves.
    serve(transactionsAfterColleagueDecided(served, [decidedElsewhere.Id]));

    await waitForStatusOn(
      decidedElsewhere.Reference,
      TRANSACTION_STATUS_APPROVED,
    );
    await waitFor(() => {
      expectControlBlock({ records: 8, awaitingDecision: 2, decided: 6 });
    });
    // ...without interrupting the reader: a decision arriving from elsewhere raises
    // no dialog over the list (BR8 of the refresh epic — the correction speaks for
    // itself).
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
