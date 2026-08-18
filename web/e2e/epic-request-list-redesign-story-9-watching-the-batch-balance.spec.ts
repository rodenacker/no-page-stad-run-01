/**
 * Story Metadata:
 * - Epic: request-list-redesign — Redesign the request list as a batch listing
 * - Story: 9 — Watching the batch balance
 * - Route: /requests
 * - Target File: web/src/components/requests/ExpenseRequestList.tsx
 * - Page Action: modify_existing
 * - Requirements: R22, BR8 (+ R17/BR7 and R1/BR2 as the ground this stands on, and
 *   project.md's Feature NFR "Reduced-motion parity")
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-4 (when a decision resolves — one request or a whole selection — the outstanding
 *   count rolls down in place with nothing on the screen jumping or shifting, while the
 *   row goes quiet and takes its mark) → this file. It belongs here and nowhere else:
 *   the substantive half of it is GEOMETRY over TIME — a figure whose box does not move
 *   while its digits change — and jsdom has no layout engine, so `getBoundingClientRect`
 *   there returns zeroes and a "nothing shifted" assertion would pass against any
 *   implementation at all.
 * - AC-5 (with reduced motion asked for, the same end state is reached instantly with no
 *   animation — the same decremented count, the same quiet row, the same mark) → this
 *   file, as the second test. Also browser-only: it needs the real
 *   `prefers-reduced-motion` media query driving the real `@media` block that
 *   `globals.css` already ships, and the real end state that block leaves behind.
 * - AC-1 (the pre-commit inked-but-unbalanced state for a single decision), AC-2 (the
 *   same before a bulk approval), AC-3 (backing out restores the rows and the figures)
 *   and AC-6 (every existing decision behaviour still happens) are the Vitest layer's, at
 *   `web/src/__tests__/integration/epic-request-list-redesign-story-9-watching-the-batch-balance.test.tsx`.
 *   Deliberately NOT repeated here — where this spec passes through a confirmation to
 *   reach a resolution, it does so as a step, not as an assertion.
 * - No accessibility scan is added here, and that is deliberate. This story introduces no
 *   state an earlier scan cannot reach: the `/requests` page-level scan belongs to
 *   `expense-request-list` story 4, the open per-request confirmation to
 *   `expense-decisions` story 2, and the open bulk confirmation over a live selection to
 *   `bulk-approval-and-live-refresh` story 2 — and a decided, desaturated row is present
 *   in the fixtures those scans already run against, since this epic's fixtures carry
 *   decided rows from the start. A scan mid-roll is not a state a user can be left in.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * This spec never contacts a live backend and never uses a real credential
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running on this machine and this epic's
 * `dataSource` is `existing-api`. Two boundaries, one contract — the arrangement every
 * earlier epic established, reused rather than re-invented:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. `/requests` is gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()` cannot
 *    see a fetch the browser never makes. The stub answers that call from the shared
 *    identity source, keyed off the `session` cookie value seeded below — which is also
 *    what makes the person here an Approver, the only role offered a decision at all.
 * 2. Browser boundary → `page.route()` below:
 *      GET  /transactions-api/v1/transactions   (the first read, the re-read-before-submit
 *                                                guard, the reconciliation read and the
 *                                                self-refresh poll)
 *      POST /api/decisions                      (`expense-decisions` story 1's own decide
 *                                                endpoint — one call per request, for the
 *                                                single decision and for each of a batch)
 *    Both are the app's OWN same-origin addresses, so an unmocked call is forwarded to the
 *    live transactions service by a route handler INSIDE the Next.js process, where the
 *    live-origin block cannot see it. A catch-all aborts anything else under
 *    `/transactions-api/**`, and the real services' own origins are blocked outright,
 *    registered LAST so they win over the origin-agnostic globs above them.
 *
 * THE MOCKED SERVICE KEEPS STATE. It does not hand out an "after" snapshot: it answers
 * the list as it stands given the approvals this browser has actually sent it, built by
 * feeding those ids through `transactionsAfterApproving()`. So the count below rolls down
 * only because requests really were decided — an implementation that decrements the
 * figure optimistically off a click, or off a decide response body (which cannot carry
 * that distinction — `alreadyDecidedResponse()`), cannot make these assertions pass.
 * Nothing here counts calls; what the service ends up holding is the evidence.
 *
 * Every response body comes from the project-wide factories under `web/src/mocks/data/`
 * (`transaction.ts`, `identity.ts`, `role.ts`) — no response shape and no canonical value
 * is authored in this file, so this spec and the Vitest layer cannot drift.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - THE OUTSTANDING FIGURE IS ADDRESSABLE AND ITS TEXT IS THE COUNT. The control block's
 *   `AWAITING DECISION` figure (story 2, R11) is a `role="status"` element whose
 *   accessible name is its own visible mono label — `aria-labelledby` pointing at the
 *   "AWAITING DECISION" label, never an `aria-label`, which would override the content and
 *   leave the live region announcing a name that never changes — and whose text is the
 *   count and nothing else. That is not a test convenience: the figure changes with no
 *   user action at all when a colleague decides a request and the list refreshes itself
 *   (AC-6), which is exactly what a polite live region is for, and it is the pattern this
 *   app already uses for a figure that moves under the reader (`SELECTION_COUNT_LABEL` in
 *   `web/src/lib/transactions/selecting.ts`). Whatever the roll's internals, the element
 *   must SETTLE to the current count as its only text — a digit strip left in the DOM
 *   would be read out as "0 1 2 3 4 5 6 7 8 9" by a screen reader, so the roll must not
 *   leave one behind.
 * - THE FIGURES ARE TABULAR AND THE ROLL CHANGES DIGITS IN PLACE (R22). This spec measures
 *   the figure's box, in document coordinates, before and after a decision resolves, and
 *   samples it every animation frame WHILE it rolls. A roll that grows, reflows or
 *   re-lays-out the figure fails, and so does one that moves the listing underneath it.
 * - Each decision is sent FROM THE BROWSER to the app's own `/api/decisions` route
 *   (`web/src/lib/api/decisions.ts` on the shared API client). `page.route()` cannot
 *   intercept a fetch made by the Next.js server or by a Server Action — moving the call
 *   into one bypasses these mocks and sends real decisions to the live service.
 * - The per-request Approve is a direct control on the request's own row, named for the
 *   request it decides ("Approve request TXN-…"), and the bulk action is the list's own
 *   toolbar control naming the SELECTION ("Approve selected requests"). Selection is a
 *   real checkbox naming its request, wherever story 6 has moved it to in the gutter. Both
 *   confirmations are the project's `alert-dialog`, which Radix renders as
 *   `role="alertdialog"` PORTALLED to the body — so dialog queries are scoped to the
 *   dialog, never to `main`.
 * - The existing machinery is REUSED, not rewritten: `web/src/lib/transactions/`
 *   `{deciding,bulkApproval,refreshing}.ts` stay untouched and this story adds a
 *   presentation layer over them. Everything below drives them exactly as the shipped
 *   `expense-decisions` and `bulk-approval-and-live-refresh` specs drive them.
 *
 * WHAT THIS SPEC DELIBERATELY DOES NOT ASSERT, and where it lives instead:
 * - The DESATURATION itself (R20). "Goes quiet" is judged by eye — story 6's AC-5 is
 *   tagged `none` for exactly that reason, and asserting a colour or a class here would be
 *   an implementation assertion, not a behavioural one. What IS asserted is the observable
 *   half: the row takes its decided mark in words and stops offering a decision.
 * - The roll's CADENCE — one roll for the batch rather than one per request — beyond the
 *   destination it lands on. A mechanical digit roll legitimately renders intermediate
 *   digits, so "one roll" is not separable from "three rolls" in the DOM; the story's
 *   manual checklist judges it by eye. What IS asserted, and what a per-request
 *   implementation gets wrong, is that the figure settles on exactly the value the RESOLVED
 *   batch implies — not one decrement, not one per selected request regardless of outcome.
 * - Zero layout shift ACROSS the bulk transition. A selection legitimately puts a live
 *   count and total value INTO the control block and takes them out again when it clears
 *   (R19, story 2 AC-5), so the block's own geometry is not stable across that moment by
 *   design. The geometry battery therefore runs on the single decision, where nothing else
 *   on the screen is moving, and the bulk case asserts the count and the marks.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie (epic 1
 * BR2), seeded directly rather than by driving the sign-in form — epic 1's story 2 spec
 * owns that journey. Cookies ignore port, so one seed serves the dev server (:3000) and
 * the epic-end production run (:3100). `Secure` is omitted because the E2E server is plain
 * http on localhost.
 *
 * TIMING: no clock is installed and nothing waits real time — `page.waitForTimeout` is
 * never used. The one bounded window in here is a `requestAnimationFrame` sampler running
 * INSIDE the page (see `figureBoxesWhileItRolls`), which is a measurement of the animation
 * under test rather than a wait for it, and every other assertion is a web-first `expect`
 * that auto-waits.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): today `/requests` has no
 * control block at all, so there is no outstanding figure to roll — the page still opens
 * with an "Expense requests" heading above a card-wrapped table.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER } from '../src/mocks/data/role';
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  approveSuccessResponse,
  transactionListResponse,
  transactionsAfterApproving,
  transactionsForBulkSelection,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** This story's screen (story metadata Route). */
const REQUESTS_PATH = '/requests';

/**
 * The calls this screen makes, as the BROWSER addresses them: the app's own mount points,
 * never a service origin. Trailing `**` so query strings are covered.
 */
const TRANSACTIONS_API_GLOB = '**/transactions-api/**';
const TRANSACTIONS_URL_GLOB = '**/transactions-api/v1/transactions**';

/**
 * The decide endpoint on the app's own origin — the only address a decision is ever sent
 * to from the browser (`expense-decisions` story 1), for a single decision and for each
 * request in a batch alike. Unmocked, the Next.js route handler behind it forwards the
 * decision to the live transactions service.
 */
const DECISIONS_URL_GLOB = '**/api/decisions**';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration). Blocked
 * outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * The control block's outstanding figure, by its own label (R11's `AWAITING DECISION`).
 * Loose on the casing, because the label is set in tracked mono and may well be
 * upper-cased in CSS rather than in the DOM; strict on the words, because `DECIDED` and
 * `RECORDS` sit beside it and must never be picked up instead.
 */
const AWAITING_DECISION_NAME = /awaiting decision/i;

/**
 * The listing's own column head for the reference column — the anchor for "nothing else on
 * the screen moved". It sits BELOW the control block and ABOVE every row, so it moves if
 * and only if the block above it re-laid out: a decided row losing its decide controls
 * cannot disturb it, and neither can the rows re-rendering.
 */
const REFERENCE_COLUMN_NAME = /reference/i;

/** The row's own Approve, named for the request it decides (`decideActionName`). */
const approveRequestName = (reference: string): RegExp =>
  new RegExp(`approve request ${reference}`, 'i');

/**
 * The bulk action in the list's own toolbar (`BULK_APPROVE_ACTION_LABEL`). It says it acts
 * on the SELECTION, which is what tells it apart from a row's own "Approve request TXN-…".
 */
const BULK_APPROVE_ACTION_NAME = /^approve\b[\s\S]*\bselected\b/i;

/**
 * The confirming choice inside either confirmation — "Approve request" for a single
 * decision, "Approve the selection" for a batch. The way out of both is "Cancel", which
 * cannot match this.
 */
const CONFIRM_APPROVE_NAME = /^approve\b/i;

/**
 * How long the in-page sampler watches the figure's box while the count rolls. Comfortably
 * longer than any roll R22 could reasonably use (the whole point of the interaction is that
 * it reads as one mechanical settle, not a slow animation), so the samples span the roll
 * from before it starts to after it has finished. It is a measurement window, not a wait:
 * nothing is asserted about how long the roll takes.
 */
const SHIFT_WATCH_MS = 1_200;

/**
 * The budget the reduced-motion path gets to be showing its FINAL figure once the decided
 * row has already re-rendered. The two are one React commit, so the honest answer is "the
 * same instant"; this leaves room for a `0.01ms` transition to end and its bookkeeping to
 * unwind, and no animated roll of the kind R22 describes could complete inside it.
 */
const SNAP_BUDGET_MS = 400;

/**
 * The batch this spec works down: 15 requests awaiting a decision, plus one already
 * Approved and one already Rejected (the fixture's point — a set of nothing but selectable
 * rows could not tell a correct implementation from one that offers a tick on everything).
 * 17 records in total, so the whole batch sits on one page at the default page size of 20
 * and no assertion below depends on paging.
 */
const BATCH = transactionsForBulkSelection(15);

/** The requests that can be decided at all — found by status, never by position. */
const awaitingDecisionIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status === TRANSACTION_STATUS_IMPORTED);

const AWAITING_DECISION = awaitingDecisionIn(BATCH);

/**
 * The figures this spec asserts, stated LITERALLY rather than recomputed from the fixture
 * with the same arithmetic the screen is being tested on (story 2's implementation note: a
 * figure derived by the logic under test asserts nothing).
 *
 * `AWAITING DECISION` is `Status === Imported` (brief §Data Model) — 15 to begin with, 14
 * once one request is approved, 11 once a selection of three resolves. Every value is two
 * digits on purpose: a tabular roll changes digits IN PLACE, and a transition from 10 to 9
 * would legitimately narrow the figure by a character, which is a shift the design permits
 * and this spec must not accidentally forbid.
 */
const OUTSTANDING_AT_START = 15;
const OUTSTANDING_AFTER_ONE = 14;
const OUTSTANDING_AFTER_THE_BATCH = 11;

/** How many requests are approved together in the bulk half of AC-4. */
const BULK_SIZE = 3;

if (AWAITING_DECISION.length !== OUTSTANDING_AT_START) {
  throw new Error(
    `This spec states its control totals literally and needs exactly ` +
      `${String(OUTSTANDING_AT_START)} requests awaiting a decision, but ` +
      `transactionsForBulkSelection(${String(OUTSTANDING_AT_START)}) returned ` +
      `${String(AWAITING_DECISION.length)}. See web/src/mocks/data/transaction.ts.`,
  );
}

/** The one request approved on its own, in both tests. */
const APPROVED_ALONE = AWAITING_DECISION[0];

/** The three approved together, after that — a different three, so the two halves cannot mask each other. */
const APPROVED_TOGETHER = AWAITING_DECISION.slice(1, 1 + BULK_SIZE);

/**
 * A request awaiting a decision that is deliberately never selected and never decided. It
 * is what makes the count's destination mean "what resolved" rather than "whatever could be
 * reached": a batch that approved everything it could would take the figure past 11.
 */
const NEVER_TOUCHED = AWAITING_DECISION[1 + BULK_SIZE];

/** A mocked JSON response, built from a project-wide factory body. */
const jsonResponse = (
  body: unknown,
  status = 200,
): { status: number; contentType: string; body: string } => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/** Blocks the live services outright (see LIVE_BACKEND_ORIGINS). */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Puts the browser in a signed-in state as the named role, without a real credential: the
 * mock `session` cookie the Node-side auth stub maps back to this role when the
 * server-side gate asks who the session belongs to.
 */
const seedSession = async (
  context: BrowserContext,
  roleName: string,
): Promise<void> => {
  await context.addCookies([
    {
      name: 'session',
      value: sessionTokenFor(roleName),
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
};

/**
 * Answers a BROWSER-side identity read from the shared userinfo source, so it can never
 * disagree with what the Node-side stub returns for the same session — one person
 * server-side and another in the browser would mean two different sets of controls.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(userInfoFor(roleName))),
  );
};

/** The `TransactionId` a decision was sent for, or `undefined` if it carried none. */
const transactionIdIn = (body: unknown): number | undefined => {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const sent = (body as Record<string, unknown>).TransactionId;
  return typeof sent === 'number' ? sent : undefined;
};

/**
 * The mocked transactions service: it serves the request list, and it records the
 * approvals this browser sends it.
 *
 * The list it answers with is always `BATCH` plus whatever has actually been approved so
 * far, so the re-read-before-submit guard, the reconciliation read and the self-refresh
 * poll are all one honest view of a service that moved on because of what the app did.
 * That is what makes the outstanding count below evidence: it can only roll down if the
 * requests behind it really were decided.
 *
 * The `/transactions-api/**` catch-all is registered FIRST so it loses to the specific read
 * (Playwright matches the most recently registered route first): any other call under the
 * app's transactions mount is aborted rather than forwarded to the live service by the
 * app's own proxy.
 */
const serveTransactionsService = async (
  page: Page,
  requests: TransactionRead[],
): Promise<void> => {
  const approved: number[] = [];

  await page.route(TRANSACTIONS_API_GLOB, (route) => route.abort());
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(
      jsonResponse(
        transactionListResponse(transactionsAfterApproving(requests, approved)),
      ),
    ),
  );

  await page.route(DECISIONS_URL_GLOB, (route) => {
    const sent: unknown = route.request().postDataJSON();
    const transactionId = transactionIdIn(sent);
    const known =
      transactionId !== undefined &&
      requests.some((request) => request.Id === transactionId);

    // Recorded only for a request this service actually holds, and only once — a second
    // call for the same request is the no-op the real service performs, answered with the
    // very same envelope (`alreadyDecidedResponse`).
    if (
      known &&
      transactionId !== undefined &&
      !approved.includes(transactionId)
    ) {
      approved.push(transactionId);
    }

    return route.fulfill(
      jsonResponse(approveSuccessResponse(transactionId ?? 0)),
    );
  });
};

/** The screen's own content — everything about the list and the control block is scoped to it. */
const screenOf = (page: Page): Locator => page.getByRole('main');

/** The control block's outstanding figure (see the header's implementation assumptions). */
const outstandingFigure = (page: Page): Locator =>
  screenOf(page).getByRole('status', { name: AWAITING_DECISION_NAME });

/** The listing's reference column head — the "did anything else move?" anchor. */
const referenceColumnHead = (page: Page): Locator =>
  screenOf(page).getByRole('columnheader', { name: REFERENCE_COLUMN_NAME });

/** One request's row, found by its `Reference` (the brief's identifier), never by position. */
const requestRow = (page: Page, reference: string): Locator =>
  screenOf(page).getByRole('row').filter({ hasText: reference });

/** Either confirmation, portalled to the body by Radix — addressed on its own, not via `main`. */
const confirmation = (page: Page): Locator => page.getByRole('alertdialog');

/** A box in DOCUMENT coordinates, whole pixels — so a scroll between two measurements cannot read as a shift. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where an element sits on the page, independent of how far the page happens to be
 * scrolled: clicking a control auto-scrolls it into view, so viewport coordinates would
 * report a shift that never happened. Rounded to whole pixels, which is as fine as "did it
 * move?" can honestly be asked in a real browser.
 */
const documentBoxOf = (locator: Locator): Promise<Box> =>
  locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.left + window.scrollX),
      y: Math.round(rect.top + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  });

/**
 * Every DISTINCT box the figure occupies over the next `windowMs`, sampled once per
 * animation frame from inside the page — the roll watched as it happens, not inspected
 * before and after.
 *
 * Viewport coordinates are correct here precisely because nothing is clicked or scrolled
 * during the window: one entry back means the figure never moved, changed width or changed
 * height while its digits rolled, which is R22's "zero layout shift" as a user experiences
 * it. More than one entry is the failure, and the entries themselves say what moved.
 *
 * Start it BEFORE the roll (the returned promise is awaited later) so the window covers the
 * whole transition.
 */
const figureBoxesWhileItRolls = (
  locator: Locator,
  windowMs: number,
): Promise<string[]> =>
  locator.evaluate(
    (element, duration) =>
      new Promise<string[]>((resolve) => {
        const seen = new Set<string>();
        const startedAt = performance.now();
        const sample = (): void => {
          const rect = element.getBoundingClientRect();
          seen.add(
            [rect.left, rect.top, rect.width, rect.height]
              .map((value) => String(Math.round(value)))
              .join(','),
          );
          if (performance.now() - startedAt >= duration) {
            resolve(Array.from(seen));
            return;
          }
          requestAnimationFrame(sample);
        };
        sample();
      }),
    windowMs,
  );

/**
 * Waits until the screen is back to the geometry it had before the confirmation opened.
 *
 * Radix takes a scroll lock while a dialog is open (`overflow: hidden` on the body, with
 * padding compensating for the scrollbar it removes) and gives it back on close. That is
 * the app's existing behaviour and has nothing to do with this story — but it moves for a
 * frame or two around the close, so the roll must be watched from AFTER it has settled or
 * the sampler would report the dialog's own housekeeping as a layout shift. The decision's
 * re-read is still in flight at this point, so nothing about the roll is waited out here.
 */
const expectBackAtRestAfterTheDialog = async (
  page: Page,
  figureBoxBefore: Box,
): Promise<void> => {
  await expect
    .poll(() => documentBoxOf(outstandingFigure(page)), {
      message:
        'the figure must be back where it was once the confirmation has closed, before ' +
        'the count has anything to roll to',
    })
    .toEqual(figureBoxBefore);
};

/** Ticks one request's own selection control — wherever the gutter now carries it — and waits for it to register. */
const selectRequest = async (page: Page, reference: string): Promise<void> => {
  const control = requestRow(page, reference).getByRole('checkbox', {
    name: new RegExp(reference, 'i'),
  });
  await control.check();
  await expect(control).toBeChecked();
};

/**
 * Answers whichever confirmation is open and waits for it to close, which is also what
 * releases Radix's scroll lock — so no geometry is measured while the dialog is holding the
 * page still. A step, not an assertion: the pre-commit unbalanced state and the exact
 * wording are AC-1/AC-2's, in the Vitest layer.
 */
const acceptTheConfirmation = async (page: Page): Promise<void> => {
  const dialog = confirmation(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: CONFIRM_APPROVE_NAME }).click();
  await expect(dialog).toBeHidden();
};

/** Opens one request's Approve confirmation from the control on its own row. */
const askToApprove = async (page: Page, reference: string): Promise<void> => {
  await requestRow(page, reference)
    .getByRole('button', { name: approveRequestName(reference) })
    .click();
  await expect(confirmation(page)).toBeVisible();
};

/** Opens the bulk confirmation from the list's own toolbar. */
const askToApproveTheSelection = async (page: Page): Promise<void> => {
  await screenOf(page)
    .getByRole('button', { name: BULK_APPROVE_ACTION_NAME })
    .click();
  await expect(confirmation(page)).toBeVisible();
};

/** The screen as it must read once a resolution has settled. */
interface SettledState {
  /** What `AWAITING DECISION` must read — the whole of the figure's text. */
  outstanding: number;
  /** References that must now carry the approved mark and offer no decision. */
  decided: readonly string[];
  /** References that must be exactly as they were. */
  untouched: readonly string[];
}

/**
 * THE END STATE, asserted identically by both tests — which is what makes AC-5's
 * functional equivalence structural rather than a promise in a comment: the animated path
 * and the reduced-motion path are held to the same three things by the same code.
 */
const expectSettledState = async (
  page: Page,
  { outstanding, decided, untouched }: SettledState,
): Promise<void> => {
  // The figure itself: the count, and only the count. Auto-waits, so a roll is allowed to
  // take as long as it likes to get here — but it must arrive, and it must arrive here.
  await expect(
    outstandingFigure(page),
    'AWAITING DECISION must settle on the number of requests still awaiting a ' +
      'decision (Status === Imported), as its only text',
  ).toHaveText(String(outstanding));

  for (const reference of decided) {
    const row = requestRow(page, reference);
    // The row takes its mark, in words — the mark is a shape PLUS a word (R26/BR3), and the
    // word is the half a screen reader gets.
    await expect(row).toContainText(TRANSACTION_STATUS_APPROVED);
    await expect(
      row,
      'a decided row must no longer read as awaiting a decision',
    ).not.toContainText(TRANSACTION_STATUS_IMPORTED);
    // And it goes quiet: a request carries one decision, so its own Approve is gone
    // (`expense-decisions` R12) — absent, not disabled.
    await expect(
      row.getByRole('button', { name: approveRequestName(reference) }),
    ).toHaveCount(0);
  }

  for (const reference of untouched) {
    await expect(
      requestRow(page, reference),
      'a request that was never decided must be left exactly as it was',
    ).toContainText(TRANSACTION_STATUS_IMPORTED);
  }
};

/** Signs in as an Approver on a batch served by the stateful mocked service. */
const openRequestsAsApprover = async (
  page: Page,
  context: BrowserContext,
): Promise<void> => {
  await serveTransactionsService(page, BATCH);
  await mockBrowserIdentityCall(page, ROLE_APPROVER);
  await blockLiveBackends(page);
  await seedSession(context, ROLE_APPROVER);

  await page.goto(REQUESTS_PATH);
};

test.describe('Epic request-list-redesign, Story 9: watching the batch balance', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the identity it needs.
    await context.clearCookies();
  });

  // AC-4
  // One journey through both halves of the criterion, on the same screen and the same
  // figure: a single decision resolves and the count rolls 15 → 14 with the figure's box
  // unmoved every frame it rolls and the listing beneath it exactly where it was; then a
  // selection of three resolves and the count rolls once more, to the value the RESOLVED
  // batch implies, while a request that was never selected stays awaiting a decision.
  test('the outstanding count rolls down in place when a decision resolves — a single one, then a whole selection — with nothing on the screen shifting', async ({
    page,
    context,
  }) => {
    await openRequestsAsApprover(page, context);

    // The batch as it stands, before anything is decided — so every roll below is one this
    // test's own action produced.
    await expectSettledState(page, {
      outstanding: OUTSTANDING_AT_START,
      decided: [],
      untouched: [
        APPROVED_ALONE.Reference,
        ...APPROVED_TOGETHER.map((request) => request.Reference),
        NEVER_TOUCHED.Reference,
      ],
    });

    /* ---- One request, decided on its own ---- */

    // Where the figure and the listing sit, in document coordinates, with no dialog open
    // and nothing selected: the state the screen must come back to.
    const figureBoxBefore = await documentBoxOf(outstandingFigure(page));
    const columnHeadBoxBefore = await documentBoxOf(referenceColumnHead(page));

    await askToApprove(page, APPROVED_ALONE.Reference);
    await acceptTheConfirmation(page);
    await expectBackAtRestAfterTheDialog(page, figureBoxBefore);

    // Watch the figure's box every frame from here through the roll. Started before it is
    // awaited, so the window is already open while the decision lands and the roll begins.
    const boxesWhileRolling = figureBoxesWhileItRolls(
      outstandingFigure(page),
      SHIFT_WATCH_MS,
    );

    await expectSettledState(page, {
      outstanding: OUTSTANDING_AFTER_ONE,
      decided: [APPROVED_ALONE.Reference],
      untouched: [
        ...APPROVED_TOGETHER.map((request) => request.Reference),
        NEVER_TOUCHED.Reference,
      ],
    });

    expect(
      await boxesWhileRolling,
      'the count must roll IN PLACE (R22): the figure occupied more than one box while ' +
        'it changed, so it grew, reflowed or moved — set the figures tabular and animate ' +
        'inside a box whose size does not depend on which digits are showing',
    ).toHaveLength(1);

    // And nothing else on the screen went anywhere: the figure is where it was, and so is
    // the listing beneath the control block.
    expect(
      await documentBoxOf(outstandingFigure(page)),
      'the figure must be exactly where it was before the decision resolved',
    ).toEqual(figureBoxBefore);
    expect(
      await documentBoxOf(referenceColumnHead(page)),
      'nothing below the control block may move when the count rolls — the listing is ' +
        'in a different place than it was before the decision resolved',
    ).toEqual(columnHeadBoxBefore);

    /* ---- Three requests, decided together: one roll, for what resolved ---- */

    for (const request of APPROVED_TOGETHER) {
      await selectRequest(page, request.Reference);
    }

    await askToApproveTheSelection(page);
    await acceptTheConfirmation(page);

    // 14 → 11: the value the three requests that actually resolved imply. A roll of one
    // lands on 13; a roll that counts the selection rather than the outcome, or that takes
    // in the request nobody selected, lands somewhere else again.
    await expectSettledState(page, {
      outstanding: OUTSTANDING_AFTER_THE_BATCH,
      decided: APPROVED_TOGETHER.map((request) => request.Reference),
      untouched: [NEVER_TOUCHED.Reference],
    });
  });

  // AC-5
  // The same decision, on the same batch, by the same Approver — but with reduced motion
  // asked for. It must reach the IDENTICAL end state (the same shared assertion), with the
  // figure already reading its new value the moment the decided row does: one commit, no
  // frames in between. `globals.css` already forces every duration to 0.01ms under this
  // preference, so the roll has to reach its end state WITH that rule rather than fight it
  // with a competing declaration.
  test('with reduced motion asked for, the same decision reaches the same end state with no animation to wait for', async ({
    page,
    context,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openRequestsAsApprover(page, context);

    // Guard, not an assertion about the app: if the preference had not reached the page,
    // everything below would quietly re-test the animated path.
    expect(
      await page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
      'this test is meaningless unless the page really sees the reduced-motion preference',
    ).toBe(true);

    await expectSettledState(page, {
      outstanding: OUTSTANDING_AT_START,
      decided: [],
      untouched: [APPROVED_ALONE.Reference, NEVER_TOUCHED.Reference],
    });

    const figureBoxBefore = await documentBoxOf(outstandingFigure(page));
    const columnHeadBoxBefore = await documentBoxOf(referenceColumnHead(page));

    await askToApprove(page, APPROVED_ALONE.Reference);
    await acceptTheConfirmation(page);

    // Wait for the ROW to take its mark — that is the moment the decision's re-read has
    // landed and the screen has re-rendered.
    await expect(requestRow(page, APPROVED_ALONE.Reference)).toContainText(
      TRANSACTION_STATUS_APPROVED,
    );

    // At that same moment the figure must ALREADY read its new value: the two are one
    // render, and with no animation there is nothing in between for the reader to catch.
    // A figure still sitting on 15, or mid-roll, is the failure this asserts.
    await expect(
      outstandingFigure(page),
      'under prefers-reduced-motion the count must snap to its end state with the row, ' +
        'not roll — the same information at the same moment (R22/BR8, and the epic ' +
        "brief's reduced-motion parity NFR)",
    ).toHaveText(String(OUTSTANDING_AFTER_ONE), { timeout: SNAP_BUDGET_MS });

    // The same end state as the animated path, asserted by the same code.
    await expectSettledState(page, {
      outstanding: OUTSTANDING_AFTER_ONE,
      decided: [APPROVED_ALONE.Reference],
      untouched: [NEVER_TOUCHED.Reference],
    });

    // And snapping is still zero layout shift: nothing jumped on the way to the end state.
    expect(
      await documentBoxOf(outstandingFigure(page)),
      'the figure must be exactly where it was before the decision resolved',
    ).toEqual(figureBoxBefore);
    expect(
      await documentBoxOf(referenceColumnHead(page)),
      'nothing below the control block may move when the count snaps',
    ).toEqual(columnHeadBoxBefore);
  });
});
