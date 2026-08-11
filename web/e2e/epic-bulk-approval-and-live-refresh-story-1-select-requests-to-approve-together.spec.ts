/**
 * Story Metadata:
 * - Epic: bulk-approval-and-live-refresh — Bulk approval and a self-updating list
 * - Story: 1 — Select requests to approve together
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R2, R4, R7, BR1, BR10, NFR1 (+ project.md NFR-base-1, the WCAG 2.2
 *   AA bar)
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-5 (selecting requests, selecting everything currently listed, and clearing the
 *   selection are all completable by keyboard alone) → this file. It belongs here and
 *   nowhere else: what it pins is that a real browser moves focus onto each control in
 *   turn and that the control answers the Space key — neither of which jsdom's
 *   synthetic focus and key events prove.
 * - AC-1 (a selection control on every request still Imported and none on a decided
 *   one), AC-2 (a Finance Uploader is offered no selection control and no bulk-approve
 *   action at all — absent, not disabled), AC-3 (the count is visible while anything is
 *   selected and hidden at zero), AC-4 (exact to 99, "99+" from 100) and AC-6 (a
 *   selection survives searching, filtering, sorting and paging) are the Vitest layer's,
 *   at
 *   `web/src/__tests__/integration/epic-bulk-approval-and-live-refresh-story-1-select-requests-to-approve-together.test.tsx`.
 *   Deliberately NOT repeated here.
 * - In particular, THE AMBIENT COUNT'S WORDING AND ITS 99+ THRESHOLD ARE NOT ASSERTED IN
 *   THIS FILE (AC-3/AC-4 own them). The evidence for AC-5 is the controls' own checked
 *   state, which is unambiguous and cannot drift from the Vitest layer's reading of the
 *   indicator's copy.
 * - Accessibility: the `/requests` page-level scan belongs to `expense-request-list`
 *   story 4 (its AC-6) and the open decision confirmation to `expense-decisions` story 2,
 *   but neither can reach the state THIS story introduces — a request list carrying
 *   selection controls, and a list with a live selection on it. testing-policy.md
 *   § Accessibility requires each distinct state a story introduces to be scanned, so
 *   both are scanned once, here. The bulk-approve confirmation is story 2's state, and is
 *   scanned in story 2's spec.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * This spec never contacts a live backend and never uses a real credential
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running on this machine. Two boundaries, one
 * contract — the arrangement epics 1-5 established, reused rather than re-invented:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. `/requests` is gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()` cannot
 *    see a fetch the browser never makes. The stub answers that call from the shared
 *    identity source, keyed off the `session` cookie value seeded below — which is also
 *    what decides that the person selecting here is an Approver.
 * 2. Browser boundary → `page.route()` below, for this screen's transactions read
 *    (`GET /transactions-api/v1/transactions`, answered with the same body however many
 *    times it is read, so story 4's refresh poll changes nothing here) and the identity
 *    call in case a client component reads it. A catch-all aborts anything else under
 *    `/transactions-api/**` — those are the app's OWN same-origin addresses, so an
 *    unmocked call would be forwarded to the live transactions service by a route
 *    handler INSIDE the Next.js process, where the live-origin block cannot see it. The
 *    real services' own origins (:4424 / :4423) are blocked outright, registered LAST so
 *    they win over the origin-agnostic globs above them.
 *
 * Nothing in this spec approves anything, so no decide call is issued and none is
 * mocked: the catch-all above is what guarantees that stays true rather than silently
 * reaching a live service.
 *
 * Every response body comes from the project-wide factories under `web/src/mocks/data/`
 * (`transaction.ts`, `identity.ts`, `role.ts`) — no response shape and no canonical
 * value is authored in this file, so this spec and the Vitest layer cannot drift on the
 * contract. `GET /v1/transactions` takes no query parameters and answers
 * `{ Transactions: [...] }`; the envelope is the factory's business.
 *
 * ---------------------------------------------------------------------------
 * Implementation patterns this spec assumes — READ BEFORE IMPLEMENTING
 * ---------------------------------------------------------------------------
 * - The request list is read FROM THE BROWSER through the shared API client at the app's
 *   own same-origin `/transactions-api/...` address, as `ExpenseRequestList` already does.
 *   `page.route()` cannot intercept a read issued by the Next.js server or by a Server
 *   Action — moving it into one bypasses these mocks and leaves for the live service.
 * - THE PER-REQUEST SELECTION CONTROL is a real `checkbox` (the Shadcn `checkbox`, which
 *   Radix renders as `role="checkbox"` and toggles with the Space key), on the request's
 *   own row, NAMED FOR THE REQUEST IT SELECTS — "Select request <reference>", exactly as
 *   the row's Approve is named "Approve request <reference>" (`RequestActions.tsx`,
 *   `expense-decisions` story 2). That naming is what lets one row's control be addressed
 *   while every listed request carries one of its own. It is offered ONLY on a request
 *   still `Imported` (BR1) and ONLY to an Approver (BR10 — hidden, never disabled), so
 *   this spec signs in as an Approver; the Finance Uploader's empty-handed view is AC-2's,
 *   in Vitest.
 * - THE SELECT-EVERYTHING-CURRENTLY-LISTED CONTROL is also a `checkbox`, named so it reads
 *   "Select all …" / "Select every …", and it sits AHEAD OF THE REQUEST ROWS in reading
 *   order — the table's heading row, or the list toolbar above it — so a keyboard user
 *   meets it before the individual requests. Checking it selects every still-`Imported`
 *   request the active search and filters left; unchecking it clears the selection, which
 *   is the clearing step this spec drives. A separate icon-only "Clear selection" control
 *   MAY be added beside it (with a Shadcn tooltip and a matching `aria-label` from the
 *   same string), never instead of it.
 * - The selection is held as a set of transaction ids, so a tick follows the REQUEST
 *   rather than a row position (story §Confirmed design decisions). Nothing in this spec
 *   depends on a row index for that reason.
 * - The screen lives inside epic 1's signed-in shell, so its content is within `main` and
 *   every query about the list is scoped to it — Next renders a permanently empty
 *   body-level `role="alert"` route announcer outside `main`.
 *
 * NO CLOCK IS INSTALLED and nothing here waits real time: every assertion below is
 * auto-waiting, and story 4's 15s refresh (not built yet) would only re-serve the same
 * body. Axe is likewise never run under a faked clock.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend response
 * below is mocked, so no live backend is contacted and no real credentials are needed.
 * These tests WILL FAIL until the story is implemented (TDD red): `/requests` offers no
 * way to select a request today.
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER } from '../src/mocks/data/role';
import {
  TRANSACTION_STATUS_IMPORTED,
  transactionListResponse,
  transactionsForBulkSelection,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** This story's screen (story metadata Route). */
const REQUESTS_PATH = '/requests';

/**
 * The calls this screen makes, as the BROWSER addresses them: the app's own mount
 * points, never a service origin. Trailing `**` so query strings are covered.
 */
const TRANSACTIONS_API_GLOB = '**/transactions-api/**';
const TRANSACTIONS_URL_GLOB = '**/transactions-api/v1/transactions**';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * WCAG 2.2 AA — this project's effective accessibility bar (project.md §Baseline NFRs,
 * superseding the template's 2.1 AA floor), and the identical tag set every earlier
 * epic's scan used. Scoped explicitly because axe's defaults also run best-practice
 * rules, which would fail this spec on issues outside the agreed bar.
 */
const WCAG_22_AA_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
];

/**
 * How many still-`Imported` requests the served list holds. Small enough that all of
 * them, plus the fixture's already-decided pair, sit on one default page (20) — so
 * "everything currently listed" is everything on screen and no paging is in play. The
 * `99+` threshold is AC-4's, in Vitest.
 */
const IMPORTED_COUNT = 6;

/**
 * The row's own selection control, named for the request it selects — which is what
 * makes one row's control addressable while every listed request carries one (see the
 * header's implementation assumptions).
 */
const selectRequestName = (reference: string): RegExp =>
  new RegExp(`select request ${reference}`, 'i');

/**
 * Every per-request selection control, as a group. Deliberately narrower than /select/:
 * it cannot match the select-everything control below, whose name begins "Select all" /
 * "Select every".
 */
const ANY_SELECT_REQUEST = /select request /i;

/** The one control that selects every still-Imported request the narrowing left. */
const SELECT_EVERYTHING_LISTED = /select (all|every)/i;

/** A mocked JSON response, built from a project-wide factory body. */
const jsonResponse = (
  body: unknown,
): { status: number; contentType: string; body: string } => ({
  status: 200,
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

/**
 * Serves the whole request set in one response, as the real endpoint does (no query
 * parameters, no server-side paging), and answers every later read with the same body —
 * so nothing this spec observes can have come from the service changing under it.
 *
 * The `/transactions-api/**` catch-all is registered FIRST so it loses to the specific
 * read (Playwright matches the most recently registered route first): any other call
 * under the app's transactions mount is aborted rather than forwarded to the live
 * service by the app's own proxy.
 */
const serveRequests = async (
  page: Page,
  requests: TransactionRead[],
): Promise<void> => {
  await page.route(TRANSACTIONS_API_GLOB, (route) => route.abort());
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse(requests))),
  );
};

/**
 * Puts the browser in a signed-in state as the named role, without a real credential:
 * the mock `session` cookie the Node-side auth stub maps back to this role when the
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

/** The screen's own content — everything about the list is scoped to it. */
const screenOf = (page: Page): Locator => page.getByRole('main');

/** The request list itself. */
const requestList = (page: Page): Locator => screenOf(page).getByRole('table');

/** One request's own selection control, found by the request it names. */
const selectionControl = (page: Page, reference: string): Locator =>
  screenOf(page).getByRole('checkbox', { name: selectRequestName(reference) });

/** Every per-request selection control currently on the screen. */
const everySelectionControl = (page: Page): Locator =>
  screenOf(page).getByRole('checkbox', { name: ANY_SELECT_REQUEST });

/** The select-everything-currently-listed control. */
const selectEverythingListed = (page: Page): Locator =>
  screenOf(page).getByRole('checkbox', { name: SELECT_EVERYTHING_LISTED });

/**
 * The requests currently on screen, in the order their rows appear, matched back to the
 * request each row came from by that request's own reference — so nothing here depends
 * on which column the reference sits in, or on any row's position. The heading row
 * carries no reference and is naturally skipped.
 */
const requestsInRowOrder = async (
  page: Page,
  served: TransactionRead[],
): Promise<TransactionRead[]> => {
  const rowTexts = await requestList(page).getByRole('row').allInnerTexts();
  return rowTexts.reduce<TransactionRead[]>((rows, text) => {
    const request = served.find((candidate) =>
      text.includes(candidate.Reference),
    );
    if (request) {
      rows.push(request);
    }
    return rows;
  }, []);
};

/**
 * The still-`Imported` requests on screen, in row order — the ones a selection may cover
 * (BR1). Reading them from the screen rather than from the fixture is what lets the
 * keyboard walk below move FORWARDS from one to the next whatever order the list is in.
 */
const selectableRequestsInRowOrder = async (
  page: Page,
  served: TransactionRead[],
): Promise<TransactionRead[]> =>
  (await requestsInRowOrder(page, served)).filter(
    (request) => request.Status === TRANSACTION_STATUS_IMPORTED,
  );

/** How a control reads to a user, for readable failure output. */
const labelOf = (control: Locator): Promise<string> =>
  control.evaluate(
    (element) =>
      (
        element.getAttribute('aria-label') ??
        element.textContent ??
        ''
      ).trim() || element.tagName.toLowerCase(),
  );

/**
 * Presses `key` until the control has keyboard focus. Throws (failing the test with a
 * plain-English reason) when the control cannot be reached — that throw IS the
 * keyboard-reachability assertion. The same helper epic 1 story 3 and the request-list
 * epic's story 4 use.
 */
const pressUntilFocused = async (
  page: Page,
  key: string,
  control: Locator,
  maxPresses = 120,
): Promise<void> => {
  for (let press = 0; press <= maxPresses; press += 1) {
    const focused = await control.evaluate(
      (element) => element === document.activeElement,
    );
    if (focused) {
      return;
    }
    await page.keyboard.press(key);
  }
  throw new Error(
    `"${await labelOf(control)}" could not be reached with ${String(maxPresses)} ` +
      `"${key}" presses, so it cannot be operated by keyboard alone (AC-5).`,
  );
};

/** Real-browser axe scan of whatever state the page is in right now. */
const expectNoAccessibilityViolations = async (
  page: Page,
  state: string,
): Promise<void> => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_22_AA_TAGS)
    .analyze();

  expect(
    violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes.length} node/s)`,
    ),
    `WCAG 2.2 AA violations on the expense request list (${state})`,
  ).toEqual([]);
};

/**
 * Opens the request list as a signed-in Approver — the only role offered any of this
 * story's controls (BR10) — with the whole served set in the browser and every backend
 * boundary mocked.
 */
const openRequestListAsApprover = async (
  page: Page,
  context: BrowserContext,
  requests: TransactionRead[],
): Promise<void> => {
  await serveRequests(page, requests);
  await mockBrowserIdentityCall(page, ROLE_APPROVER);
  await blockLiveBackends(page);
  await seedSession(context, ROLE_APPROVER);

  await page.goto(REQUESTS_PATH);
  await expect(requestList(page)).toBeVisible();
};

test.describe('Epic bulk-approval-and-live-refresh, Story 1: select requests to approve together', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the identity it needs.
    await context.clearCookies();
  });

  // AC-5
  // One journey with no mouse at all: two requests ticked one at a time, then everything
  // currently listed taken in one go, then the whole selection cleared — each step
  // reached by Tab (or Shift+Tab, towards a control that sits above the rows) and taken
  // with Space. A control that cannot be reached fails inside `pressUntilFocused` with
  // the reason, rather than as a puzzling assertion further down.
  test('requests can be ticked, everything currently listed selected in one go, and the whole selection cleared, with the keyboard alone', async ({
    page,
    context,
  }) => {
    const requests = transactionsForBulkSelection(IMPORTED_COUNT);
    await openRequestListAsApprover(page, context, requests);

    // Everything the selection may cover is on this one page, so "everything currently
    // listed" below is everything on screen and no paging is in play.
    const selectable = await selectableRequestsInRowOrder(page, requests);
    expect(
      selectable.map((request) => request.Reference),
      `the served list must put all ${String(IMPORTED_COUNT)} still-Imported requests on the first page, or this journey proves nothing about selecting them`,
    ).toHaveLength(IMPORTED_COUNT);
    const [firstRequest, secondRequest] = selectable;

    const firstControl = selectionControl(page, firstRequest.Reference);
    const secondControl = selectionControl(page, secondRequest.Reference);
    const everythingListed = selectEverythingListed(page);

    // Nothing is selected to begin with, so every tick below is one this journey made.
    await expect(firstControl).not.toBeChecked();
    await expect(secondControl).not.toBeChecked();
    await expect(everythingListed).not.toBeChecked();

    /* ---- 1. Two requests, ticked one at a time, keyboard only ---- */

    await pressUntilFocused(page, 'Tab', firstControl);
    await page.keyboard.press('Space');
    await expect(
      firstControl,
      `${firstRequest.Reference} must be selectable with the Space key — a control that only answers a click cannot be operated by keyboard (AC-5)`,
    ).toBeChecked();

    // Onwards to the next still-Imported request, which lies further down the page.
    await pressUntilFocused(page, 'Tab', secondControl);
    await page.keyboard.press('Space');
    await expect(secondControl).toBeChecked();
    await expect(
      firstControl,
      'ticking a second request must add to the selection, not replace it',
    ).toBeChecked();

    /* ---- 2. Everything currently listed, in one go ---- */

    // Backwards, because the control that takes the whole listing sits above the rows
    // (see the header's implementation assumptions).
    await pressUntilFocused(page, 'Shift+Tab', everythingListed);
    await page.keyboard.press('Space');

    for (const request of selectable) {
      await expect(
        selectionControl(page, request.Reference),
        `${request.Reference} is still Imported and currently listed, so selecting everything listed must select it too`,
      ).toBeChecked();
    }
    await expect(
      everySelectionControl(page),
      'every listed request that is still Imported carries a selection control, and no other request does — so selecting everything listed covers exactly these',
    ).toHaveCount(IMPORTED_COUNT);

    /* ---- 3. Cleared again, from the same control, still with no mouse ---- */

    // Focus has not moved: activating a control with the keyboard leaves it focused.
    await page.keyboard.press('Space');

    for (const request of selectable) {
      await expect(
        selectionControl(page, request.Reference),
        `clearing the selection must leave ${request.Reference} unselected`,
      ).not.toBeChecked();
    }
    await expect(everythingListed).not.toBeChecked();
  });

  // Accessibility — the two states this story introduces on the request list, which the
  // epic's earlier page-level scan cannot reach: the list once it carries selection
  // controls, and the list with a selection live on it (the ambient count and the bulk
  // controls beside it are on screen only in that second state). A real browser, so the
  // new column's contrast, the controls' accessible names and the focus handling around
  // them are all seen. No clock is installed — axe is never run under faked timers.
  test('the request list has no accessibility violations, with and without a selection', async ({
    page,
    context,
  }) => {
    const requests = transactionsForBulkSelection(IMPORTED_COUNT);
    await openRequestListAsApprover(page, context, requests);

    const selectable = await selectableRequestsInRowOrder(page, requests);
    expect(selectable).toHaveLength(IMPORTED_COUNT);
    const [firstRequest] = selectable;
    const firstControl = selectionControl(page, firstRequest.Reference);

    // Settle the list first, so neither scan is racing a placeholder.
    await expect(firstControl).toBeVisible();
    await expect(selectEverythingListed(page)).toBeVisible();

    await expectNoAccessibilityViolations(
      page,
      'carrying selection controls, with nothing selected',
    );

    await firstControl.check();
    await expect(firstControl).toBeChecked();

    await expectNoAccessibilityViolations(page, 'with a request selected');
  });
});
