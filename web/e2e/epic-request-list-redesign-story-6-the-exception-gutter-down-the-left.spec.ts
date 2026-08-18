/**
 * Story Metadata:
 * - Epic: request-list-redesign — Redesign the request list as a batch listing
 * - Story: 6 — The exception gutter down the left
 * - Route: /requests
 * - Target File: web/src/components/requests/ExpenseRequestList.tsx
 * - Page Action: modify_existing
 * - Requirements: R15, BR5, R18, R20, R5, R7, BR2 (+ project.md NFR-base-1, the WCAG 2.2
 *   AA bar)
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-4 (a selection can be made and undone with the keyboard alone, and it survives
 *   narrowing, re-ordering and moving between pages) → this file, and nowhere else. It
 *   belongs here for two reasons jsdom cannot answer: a real browser has to move focus
 *   onto the gutter's control in turn and the control has to answer the Space key, and
 *   the focus indicator has to actually be PAINTED — a restyled two-character gutter is
 *   exactly where a focus ring gets clipped or styled away without any test noticing.
 * - AC-1 (the two-character gutter is present and empty on an ordinary row, never
 *   collapsed), AC-3 (the tick lives in that gutter with no separate tick-box column
 *   beside it) and AC-6 (only an Approver is offered selection, only on requests
 *   awaiting a decision, absent rather than disabled for anyone else) are the Vitest
 *   layer's, at
 *   `web/src/__tests__/integration/epic-request-list-redesign-story-6-the-exception-gutter-down-the-left.test.tsx`.
 *   Deliberately NOT repeated here.
 * - AC-2 (the marks are distinguishable while ignoring colour entirely) and AC-5 (a
 *   decided row goes visibly quiet while awaiting-decision rows keep full contrast) are
 *   manual-checklist items — both are judgements about the drawn artifact that no
 *   automated assertion can make honestly.
 * - This story CHANGES NO BEHAVIOUR (brief R1/BR2). The selection semantics asserted
 *   below are `bulk-approval-and-live-refresh`'s, re-exercised here because this story
 *   moves the control that carries them into the gutter and deletes the column it used
 *   to live in. Selection survival is driven exactly the way that epic already drives
 *   it — narrow so the ticked pair leaves the screen, re-order so it lands on another
 *   page, page to it — reusing its fixture (`transactionsForBulkSelection`) and its
 *   accessible names (`web/src/lib/transactions/selecting.ts`) rather than inventing a
 *   second approach.
 * - THE AMBIENT SELECTION COUNT'S WORDING IS NOT ASSERTED HERE. Its copy and its `99+`
 *   threshold belong to `bulk-approval-and-live-refresh` story 1's Vitest layer, and
 *   the control block's live selection subtotal (this epic's R19) belongs to story 2.
 *   The evidence for survival below is the controls' own checked state, which cannot
 *   drift from either.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * This spec never contacts a live backend and never uses a real credential
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running on this machine. Two boundaries, one
 * contract — the arrangement every earlier epic established, reused rather than
 * re-invented:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. `/requests` is gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()` cannot
 *    see a fetch the browser never makes. The stub answers that call from the shared
 *    identity source, keyed off the `session` cookie value seeded below — which is also
 *    what decides that the person selecting here is an Approver (R7/brief R27:
 *    selection is offered to nobody else).
 * 2. Browser boundary → `page.route()` below, for this screen's transactions read
 *    (`GET /transactions-api/v1/transactions`, answered with the same body however many
 *    times it is read, so the 15s self-refresh poll changes nothing here) and the
 *    identity call in case a client component reads it. A catch-all aborts anything else
 *    under `/transactions-api/**` — those are the app's OWN same-origin addresses, so an
 *    unmocked call would be forwarded to the live transactions service by a route handler
 *    INSIDE the Next.js process, where the live-origin block cannot see it. The real
 *    services' own origins (:4424 / :4423) are blocked outright, registered LAST so they
 *    win over the origin-agnostic globs above them.
 *
 * Nothing in this spec decides anything, so no approve/reject call is issued and none is
 * mocked: the catch-all above is what guarantees that stays true rather than silently
 * reaching a live service.
 *
 * Every response body comes from the project-wide factories under `web/src/mocks/data/`
 * (`transaction.ts`, `identity.ts`, `role.ts`) — no response shape and no canonical value
 * is authored in this file, so this spec and the Vitest layer cannot drift on the
 * contract. `GET /v1/transactions` takes no query parameters and answers
 * `{ Transactions: [...] }`; the envelope is the factory's business.
 *
 * ---------------------------------------------------------------------------
 * Implementation patterns this spec assumes — READ BEFORE IMPLEMENTING
 * ---------------------------------------------------------------------------
 * - The request list is read FROM THE BROWSER through the shared API client at the app's
 *   own same-origin `/transactions-api/...` address, as `ExpenseRequestList` already
 *   does. `page.route()` cannot intercept a read issued by the Next.js server or by a
 *   Server Action — moving it into one bypasses these mocks and leaves for the live
 *   service.
 * - THE SELECTION CONTROL MOVES INTO THE GUTTER AND STAYS A REAL CHECKBOX. It is still
 *   the Shadcn `checkbox` (which Radix renders as `role="checkbox"` and toggles with the
 *   Space key), still named for the request it selects via `selectRequestLabel()` in
 *   `web/src/lib/transactions/selecting.ts` — restyled as one of the gutter's marks, NOT
 *   replaced by a `div` with a click handler. Every assertion below depends on that: a
 *   `div` takes no focus, answers no Space key, and reports no checked state.
 * - THE GUTTER MUST NOT CLIP OR SUPPRESS THE FOCUS RING. A two-character column with
 *   `overflow: hidden`, or a mark that swaps the primitive's `focus-visible` styling for
 *   a colour change alone, fails the focus-indicator assertion below — which is the
 *   point of asserting it in a real browser rather than reading class names.
 * - Selection stays a set of transaction IDS (`selecting.ts`, reused untouched per the
 *   story's implementation notes), which is what makes a tick follow the REQUEST through
 *   the existing narrow → order → slice pipeline. Nothing here depends on a row position
 *   for that reason.
 * - The narrowing, ordering and paging controls are addressed with the SAME label
 *   patterns `expense-request-list` story 4's spec uses, so the two specs pin one
 *   contract even though this epic restyles them (brief R12/R13/R14 change presentation,
 *   never the accessible names): the free-text search is a `searchbox` named /search/;
 *   a sortable column is a `button` named for the column inside its `columnheader`; and
 *   the page controls are named /next/ and /previous/, as a `button` or a `link`.
 * - The screen lives inside epic 1's signed-in shell, so its content is within `main` and
 *   every query about the list is scoped to it — Next renders a permanently empty
 *   body-level `role="alert"` route announcer outside `main`.
 *
 * NO CLOCK IS INSTALLED and nothing here waits real time: every assertion below is
 * auto-waiting, and the list's 15s refresh only re-serves the same body. Axe is likewise
 * never run under a faked clock.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend response
 * below is mocked, so no live backend is contacted and no real credentials are needed.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SPEC IS GREEN BEFORE THE STORY IS BUILT — and why that is correct
 * ---------------------------------------------------------------------------
 * These two tests PASS against the pre-redesign screen, and that is the point: AC-4 is a
 * PRESERVATION criterion, not a new capability. Keyboard-completable selection and
 * selection survival across narrowing / ordering / paging are behaviours
 * `bulk-approval-and-live-refresh` already shipped, and brief R1/BR2 forbid this epic
 * from changing them. A test that failed today would have to be asserting something OTHER
 * than what AC-4 says.
 *
 * What it is FOR is the rewire: this story deletes the column the selection control lives
 * in and rebuilds it as a mark inside a two-character gutter. The moment that rewire
 * replaces the real checkbox with a styled `div`, clips or drops its focus ring, or
 * rebuilds selection around row positions instead of the existing id set, these tests go
 * red — which is the only warning anyone gets, because a gutter that LOOKS right while
 * being keyboard-dead looks identical to a gutter that is right.
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER } from '../src/mocks/data/role';
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_REJECTED,
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

/** How many requests a page holds until the reader chooses otherwise (brief R2/R14). */
const DEFAULT_PAGE_SIZE = 20;

/**
 * How many still-`Imported` requests the served list holds for the survival journey.
 * Deliberately more than one default page (20) once the fixture's already-decided pair
 * is counted, so re-ordering genuinely moves the ticked requests onto another page
 * rather than merely shuffling them within the page being read.
 */
const SELECTABLE_COUNT = 25;

/**
 * How many for the accessibility scans: few enough that the whole set — imported rows
 * with an empty gutter, and the fixture's approved and rejected rows carrying decision
 * marks in theirs — sits on one page, so both states are on screen together.
 */
const SCANNED_COUNT = 6;

/**
 * A term carried by ONE served request, and that one already decided — so narrowing by
 * it takes every ticked request off the screen entirely. The fixture guard in the test
 * proves that, rather than this comment doing so.
 */
const NARROWING_TERM = 'absa';

/**
 * The row's own selection control, named for the request it selects
 * (`selectRequestLabel()` in `web/src/lib/transactions/selecting.ts`) — which is what
 * makes one row's control addressable while every listed request carries one.
 */
const selectRequestName = (reference: string): RegExp =>
  new RegExp(`select request ${reference}`, 'i');

/** The column the survival journey re-orders by. */
const REFERENCE_COLUMN = /^reference/i;

/** How the narrowing and paging controls are addressed (see header). */
const SEARCH_FIELD = /search/i;
const NEXT_PAGE = /next/i;

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
 * parameters, no server-side narrowing, ordering or paging) — so anything narrowed,
 * ordered or paged on screen was done by the app itself, and every later read answers
 * with the same body.
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

/** The listing itself. */
const requestList = (page: Page): Locator => screenOf(page).getByRole('table');

/** One request's own selection control, found by the request it names. */
const selectionControl = (page: Page, reference: string): Locator =>
  screenOf(page).getByRole('checkbox', { name: selectRequestName(reference) });

/** The free-text search field of the ruled narrowing strip. */
const searchField = (page: Page): Locator =>
  screenOf(page).getByRole('searchbox', { name: SEARCH_FIELD });

/**
 * A sortable column's own control: a `button` named for the column, inside the
 * `columnheader` that carries the sort state — so nothing here addresses a column by
 * position.
 */
const sortControlFor = (page: Page, columnName: RegExp): Locator =>
  screenOf(page)
    .getByRole('columnheader', { name: columnName })
    .getByRole('button', { name: columnName });

/**
 * A page control, whether the implementation renders it as a button or as a link.
 * `.or()` is Playwright's own locator combinator (not a query fallback): brief R2/R14
 * asks for controls that stay on screen and become unusable, which a `button` expresses
 * natively and Shadcn's `pagination` primitive renders as an anchor — both satisfy the
 * criterion, and only one of them will exist. Addressed exactly as
 * `expense-request-list` story 4's spec addresses it.
 */
const pageControl = (page: Page, name: RegExp): Locator => {
  const screen = screenOf(page);
  return screen
    .getByRole('button', { name })
    .or(screen.getByRole('link', { name }));
};

/**
 * The references of the requests currently on screen, in the order the rows appear.
 *
 * Each row is matched back to the request it came from by that request's own reference,
 * so nothing here depends on which column the reference sits in or on any row's
 * position. The heading row carries no reference and is naturally skipped.
 */
const referencesInOrder = async (
  page: Page,
  served: TransactionRead[],
): Promise<string[]> => {
  const rowTexts = await requestList(page).getByRole('row').allInnerTexts();
  return rowTexts.reduce<string[]>((references, text) => {
    const request = served.find((candidate) =>
      text.includes(candidate.Reference),
    );
    if (request) {
      references.push(request.Reference);
    }
    return references;
  }, []);
};

/** Whether a given request is on the page being read right now. */
const isListed = async (
  page: Page,
  served: TransactionRead[],
  reference: string,
): Promise<boolean> =>
  (await referencesInOrder(page, served)).includes(reference);

/**
 * Everything about a request a free-text search could conceivably match, as one string —
 * used only to PROVE the narrowing term is unique to a single served request, so the
 * journey below cannot quietly stop narrowing anything.
 */
const searchableTextOf = (request: TransactionRead): string =>
  [
    request.Reference,
    request.Description,
    request.FileName,
    request.AccountNumber,
    String(request.Amount),
    request.Status,
    request.TransactionType,
    request.TransactionDate,
    request.LastChangedUser,
    request.UserNote ?? '',
  ]
    .join(' ')
    .toLowerCase();

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
 * What the browser actually paints on a control, or `'none'`.
 *
 * Read from computed style rather than from class names on purpose: a class assertion
 * would pass even if the gutter's styling painted nothing at all, or clipped what it
 * painted — which is exactly what R5's "you can always see where the keyboard is" cares
 * about. Both shapes count, because Shadcn/Tailwind render `focus-visible` styling as an
 * outline on some primitives and as a `box-shadow` ring on others; the caller compares
 * the focused paint with the UNFOCUSED paint, so a control carrying a permanent shadow
 * cannot pass by accident.
 */
const focusPaintOf = (control: Locator): Promise<string> =>
  control.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const outlineWidth = Number.parseFloat(style.outlineWidth);
    if (style.outlineStyle !== 'none' && outlineWidth > 0) {
      return `outline ${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`;
    }
    if (style.boxShadow && style.boxShadow !== 'none') {
      return `box-shadow ${style.boxShadow}`;
    }
    return 'none';
  });

/**
 * Presses `key` until the control has keyboard focus. Throws (failing the test with a
 * plain-English reason) when the control cannot be reached — that throw IS the
 * keyboard-reachability assertion. The same helper epic 1 story 3,
 * `expense-request-list` story 4 and `bulk-approval-and-live-refresh` story 1 use.
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
      `"${key}" presses, so it cannot be operated by keyboard alone (AC-4).`,
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
    `WCAG 2.2 AA violations on the redesigned request list (${state})`,
  ).toEqual([]);
};

/**
 * Opens the request list as a signed-in Approver — the only role offered selection at all
 * (R7, brief R27) — with the whole served set in the browser and every backend boundary
 * mocked.
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

/** The still-`Imported` requests in a served set — the ones a selection may cover. */
const awaitingDecisionIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status === TRANSACTION_STATUS_IMPORTED);

/** The already-decided requests in a served set. */
const decidedIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status !== TRANSACTION_STATUS_IMPORTED);

test.describe('Epic request-list-redesign, Story 6: the exception gutter down the left', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the identity it needs.
    await context.clearCookies();
  });

  // AC-4
  // One journey in two halves, both of which the move into the gutter can break.
  //
  // First, with no mouse at all: Tab to a request's mark in the gutter, Space to tick it,
  // Space to untick it again, Space to tick it once more, then Tab on to a second request
  // and tick that — with something visibly painted wherever the keyboard is (R5, WCAG 2.2
  // AA). A control that cannot be reached fails inside `pressUntilFocused` with the
  // reason, rather than as a puzzling assertion further down.
  //
  // Then, with that pair ticked: narrow the list until both leave the screen, re-order it
  // so they land on a page nobody is reading, and page to them — and they are still
  // ticked, because the tick follows the REQUEST rather than the row (brief BR2, carried
  // from `bulk-approval-and-live-refresh` R1). The narrowing, ordering and paging steps
  // are driven with the pointer on purpose: their own keyboard completability is
  // `expense-request-list` story 4's, and what this test is about is the SELECTION.
  test('a request can be ticked and unticked in the gutter with the keyboard alone, and the selection survives narrowing, re-ordering and paging', async ({
    page,
    context,
  }) => {
    const requests = transactionsForBulkSelection(SELECTABLE_COUNT);
    const awaiting = awaitingDecisionIn(requests);
    const [decided] = decidedIn(requests);
    const [first, second] = awaiting;

    // --- Fixture guards: without these the journey below could pass while proving
    // --- nothing about narrowing or paging.
    expect(
      awaiting,
      'the served set must hold more requests awaiting a decision than one page shows, or re-ordering cannot move the ticked pair off the page being read',
    ).toHaveLength(SELECTABLE_COUNT);
    const matchesTerm = requests.filter((request) =>
      searchableTextOf(request).includes(NARROWING_TERM),
    );
    expect(
      matchesTerm.map((request) => request.Reference),
      `the narrowing term "${NARROWING_TERM}" must match exactly one served request, and that one already decided, so narrowing by it takes every ticked request off the screen`,
    ).toEqual([decided.Reference]);
    const highestReferencesFirst = [...requests]
      .map((request) => request.Reference)
      .sort()
      .reverse()
      .slice(0, DEFAULT_PAGE_SIZE);
    for (const reference of [first.Reference, second.Reference]) {
      expect(
        highestReferencesFirst,
        `${reference} must fall beyond the first page once the list is ordered by reference, largest first — otherwise the paging half of this journey never leaves page one`,
      ).not.toContain(reference);
    }

    await openRequestListAsApprover(page, context, requests);

    const firstMark = selectionControl(page, first.Reference);
    const secondMark = selectionControl(page, second.Reference);

    // Nothing is ticked to begin with, so every tick below is one this journey made.
    await expect(firstMark).toBeVisible();
    await expect(firstMark).not.toBeChecked();
    await expect(secondMark).not.toBeChecked();

    /* ---- 1. Made, undone and made again — keyboard only ---- */

    const unfocusedPaint = await focusPaintOf(firstMark);
    await pressUntilFocused(page, 'Tab', firstMark);
    const focusedPaint = await focusPaintOf(firstMark);
    const focusIndicatorReason =
      'the selection mark in the gutter must paint something visibly different once the ' +
      'keyboard reaches it — a two-character column that clips or drops the focus ring ' +
      'leaves a keyboard user unable to see where they are (R5, WCAG 2.2 AA)';
    expect(focusedPaint, focusIndicatorReason).not.toBe('none');
    expect(focusedPaint, focusIndicatorReason).not.toBe(unfocusedPaint);

    await page.keyboard.press('Space');
    await expect(
      firstMark,
      `${first.Reference} must be selectable with the Space key — a gutter mark that only answers a click is not a real checkbox and cannot be operated by keyboard (AC-4)`,
    ).toBeChecked();

    // Undone, from the same key, with the focus where activating it left it.
    await page.keyboard.press('Space');
    await expect(
      firstMark,
      `${first.Reference} must be de-selectable with the Space key too — making a selection is only half of AC-4`,
    ).not.toBeChecked();

    // ...and made again, so there is a selection to carry through the rest of the journey.
    await page.keyboard.press('Space');
    await expect(firstMark).toBeChecked();

    // Onwards to a second request, which lies further down the page.
    await pressUntilFocused(page, 'Tab', secondMark);
    await page.keyboard.press('Space');
    await expect(secondMark).toBeChecked();
    await expect(
      firstMark,
      'ticking a second request must add to the selection, not replace it',
    ).toBeChecked();

    /* ---- 2. Narrowing: what is LISTED changes, what is SELECTED does not ---- */

    await searchField(page).fill(NARROWING_TERM);
    await expect
      .poll(() => referencesInOrder(page, requests), {
        message: `narrowing by "${NARROWING_TERM}" must leave only the one request that carries it`,
      })
      .toEqual([decided.Reference]);

    // Both ticked requests have genuinely left the screen — so what is asserted after the
    // narrowing is cleared cannot be a tick that simply never went anywhere.
    await expect(firstMark).toHaveCount(0);
    await expect(secondMark).toHaveCount(0);

    await searchField(page).fill('');
    await expect
      .poll(() => isListed(page, requests, first.Reference), {
        message: 'clearing the search term must bring the whole listing back',
      })
      .toBe(true);
    await expect(
      firstMark,
      `${first.Reference} must still be ticked after being narrowed out of view and back — the tick follows the request, never the row (brief BR2)`,
    ).toBeChecked();
    await expect(secondMark).toBeChecked();

    /* ---- 3. Re-ordering, then paging: the ticked pair moves to another page ---- */

    // Largest reference first puts the two lowest references last, so both leave the
    // page being read without anything being unticked.
    const referenceSort = sortControlFor(page, REFERENCE_COLUMN);
    await referenceSort.click();
    await referenceSort.click();

    await expect
      .poll(() => isListed(page, requests, first.Reference), {
        message:
          're-ordering by reference, largest first, must move the lowest references off the first page',
      })
      .toBe(false);
    await expect(secondMark).toHaveCount(0);

    await pageControl(page, NEXT_PAGE).click();
    await expect
      .poll(() => isListed(page, requests, first.Reference), {
        message:
          'the next page must hold the requests the re-ordering moved there',
      })
      .toBe(true);

    await expect(
      firstMark,
      `${first.Reference} must still be ticked on the page the re-ordering moved it to — a selection survives re-ordering and paging (brief BR2)`,
    ).toBeChecked();
    await expect(secondMark).toBeChecked();
  });

  // Accessibility — the state this story introduces and no other story in this epic can
  // reach: a listing whose left-hand gutter carries the selection control itself, beside
  // rows that are already decided and so desaturated to ink-on-ground (R20), scanned with
  // nothing ticked and then with a request ticked in the gutter. A real browser, so the
  // gutter's contrast at two-character width, the desaturated rows' contrast, the marks'
  // accessible names and the focus handling around them are all actually seen — none of
  // which jsdom can see at all. R20 is explicit that desaturated must stay readable and
  // must not fall below the contrast bar, which is exactly what this scan holds it to.
  // No clock is installed — axe is never run under faked timers.
  test('the listing with a selection in the gutter and decided rows beside it has no accessibility violations', async ({
    page,
    context,
  }) => {
    const requests = transactionsForBulkSelection(SCANNED_COUNT);
    const awaiting = awaitingDecisionIn(requests);
    const decided = decidedIn(requests);
    const [first] = awaiting;
    const firstMark = selectionControl(page, first.Reference);

    // Both kinds of row must be in every scan below: the awaiting rows the gutter offers a
    // tick on, and BOTH decided states R18 gives a distinct mark and R20 desaturates. That
    // the whole set shares one page is proved by the poll further down.
    expect(
      decided.map((request) => request.Status),
      'the served set must carry an approved and a rejected request, or the desaturated rows and their decision marks are never scanned (R18/R20)',
    ).toEqual([TRANSACTION_STATUS_APPROVED, TRANSACTION_STATUS_REJECTED]);

    await openRequestListAsApprover(page, context, requests);

    // Settle the listing first, so neither scan is racing a placeholder: the awaiting
    // rows carry their gutter marks, and every decided row is on screen with it.
    await expect(firstMark).toBeVisible();
    await expect
      .poll(() => referencesInOrder(page, requests), {
        message:
          'every served request must be on the one page before the gutter is scanned',
      })
      .toHaveLength(requests.length);

    await expectNoAccessibilityViolations(
      page,
      'gutter marks on show, nothing selected, decided rows desaturated beside awaiting ones',
    );

    await firstMark.check();
    await expect(firstMark).toBeChecked();

    await expectNoAccessibilityViolations(
      page,
      'with a request ticked in the gutter',
    );
  });
});
