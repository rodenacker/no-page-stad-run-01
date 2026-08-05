/**
 * Story Metadata:
 * - Epic: expense-request-list — The shared expense request list
 * - Story: 5 — Open one request, with its account number protected
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R5, R15, R16, BR1
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-4 (account numbers stay masked after searching, filtering, sorting and paging,
 *   and a reveal never escapes the one request it was made on), AC-5 (every icon-only
 *   control names itself on hover AND on keyboard focus, with a matching accessible
 *   label) and AC-6 (at phone width each request is a card with its reference plus key
 *   values and an action overflow, and the page never scrolls sideways) → this file.
 * - AC-1 (an opened request shows every value the service holds, read-only), AC-2 (no
 *   control anywhere changes an imported value — BR1) and AC-3 (masked until the named
 *   reveal control is used) → the Vitest layer at
 *   `web/src/__tests__/integration/epic-expense-request-list-story-5-request-detail-and-account-number.test.tsx`.
 *   Deliberately NOT duplicated here.
 * - No axe scan here. This epic's single real-browser accessibility scan is story 4's
 *   AC-6 on the finished `/requests` screen (story 4 §Notes), and it covers the same
 *   surface this story extends.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running locally. Both boundaries were
 * established by epic 1 and reused by every spec in the expense-file-upload epic;
 * this spec reuses them rather than adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. Every protected screen is
 *    gated SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process, epic 1 BR1/BR3), and
 *    `page.route()` cannot see a fetch the browser never makes. The stub answers that
 *    call from the shared identity source, keyed off the `session` cookie value seeded
 *    below.
 * 2. Browser boundary → `page.route()` (below), for this screen's one read:
 *    `GET /transactions-api/v1/transactions` (no query parameters — the endpoint returns
 *    the whole set and all narrowing is in memory, brief §Notes & Caveats).
 *    `/transactions-api/...` is the app's OWN same-origin mount point, so an unmocked
 *    read is forwarded to the live transactions service by the app's route handler from
 *    inside the Next.js process, where `blockLiveBackends` cannot see it — hence the
 *    read is mocked in every test here.
 *
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by driving
 *   the sign-in form — epic 1 story 2's spec owns that journey, and the cookie is the
 *   app's sole conveyance of session (epic 1 BR2). Cookies ignore port, so one seed
 *   serves the dev server (:3000) and the epic-end production run (:3100).
 * - Every response body comes from the project-wide factories under
 *   `web/src/mocks/data/` (`userInfoFor(role)`, `transactionWithStatus()`,
 *   `manyTransactions()`, `transactionListResponse()`); no response shape and no
 *   account number is authored in this file, so this spec and the Vitest layer cannot
 *   drift on the contract. The factory deliberately holds FULL account numbers —
 *   masking is the application's job (POPIA, project.md §Compliance), and a test can
 *   only prove masking happens if the mock hands the screen something to mask.
 * - Either role may read the list and open a request (brief R20), so these tests sign
 *   in as the Importer only; that both roles reach the screen is story 1's AC-6.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - The transaction list is read from the BROWSER through the shared API client at the
 *   app's own same-origin `/transactions-api/...` address (story 1 §Infrastructure
 *   reuse notes). `page.route()` cannot intercept a fetch made by the Next.js server or
 *   by a Server Action — if this read moves server-side, this spec's mock is bypassed
 *   and the request leaves for the real transactions service.
 * - A request is opened the SAME way at every width: each request offers an action
 *   overflow (the Shadcn `dropdown-menu`, `role="button"` trigger named for what it
 *   opens — matching `REQUEST_ACTIONS_NAME`) holding an item that opens the request
 *   (matching `OPEN_REQUEST_NAME`). AC-6 requires that overflow at phone width, and one
 *   mechanism at both widths is the simplest implementation (it is also Shadcn's own
 *   data-table pattern). The detail then opens as a `role="dialog"` panel over the list,
 *   one at a time, closable with Escape (the design decision resolved at the stories
 *   approval), with the reveal control INSIDE it, named with a reveal verb and "account"
 *   (matching `REVEAL_ACCOUNT_NUMBER_NAME`).
 * - Masking format is the developer's (`••••3390`, `****3390`, `…3390` — any of them
 *   pass). What is pinned is the compliance contract only: the last four digits are on
 *   screen, and the FULL value appears nowhere in the list — not in its text and not in
 *   its markup either (a full number parked in a `title` attribute is still a leak).
 * - Icon-only controls (R15 names reveal-account-number among them) carry BOTH a
 *   matching `aria-label` AND the Shadcn `tooltip`, which is what reveals the name on
 *   hover *and* on keyboard focus. A native `title` attribute does not satisfy this —
 *   browsers never show it on focus. Radix renders its tooltip content only while the
 *   tooltip is open and puts `role="tooltip"` inside it, so that role appearing IS the
 *   name being revealed.
 * - The narrowing, ordering and paging controls this spec drives belong to stories 2–4
 *   and are located by accessible name: the search field is a labelled text/search input
 *   named for searching; the status filter is a Shadcn `select` (`role="combobox"`) named
 *   for the status; each sortable column heading holds a real `button` carrying the
 *   column's name (a plain clickable `<th>` would fail story 4's keyboard bar anyway);
 *   and the pagination controls are real `button`s named "previous"/"next" (R12 requires
 *   them disabled — not hidden — when everything fits one page, and an `<a>` cannot be
 *   disabled).
 * - At phone width each request is a `listitem` in a list (a Shadcn `card` inside a
 *   `<ul>`/`<li>`), showing its `Reference`, its `Status` and its `Amount`. A table kept
 *   inside a horizontally scrolling wrapper does not satisfy R16 — the criterion is a
 *   per-request card, not a page that merely avoids scrolling.
 * - Cookie assumptions: the mock `session` cookie carries production-like attributes
 *   (HttpOnly, SameSite=Strict). `Secure` is omitted because the E2E server is plain
 *   http on localhost; the real cookie's full attribute set is asserted in the Vitest
 *   layer (epic 1, story 1).
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials are
 * needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — `/requests` still
 * answers `notFound()`, so there is no list, no detail panel and no reveal control at
 * all.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  TRANSACTION_STATUS_APPROVED,
  manyTransactions,
  transactionListResponse,
  transactionWithStatus,
} from '../src/mocks/data/transaction';

import type { TransactionRead } from '../src/mocks/data/transaction';
import type { BrowserContext, Locator, Page } from '@playwright/test';

/** This story's screen. */
const REQUESTS_ROUTE = '/requests';

/**
 * A phone-sized viewport at the project's mobile floor (NFR-base-3: ≥360px). Deliberately
 * the narrowest supported width — sideways scrolling shows up here first.
 */
const PHONE_VIEWPORT = { width: 360, height: 740 };

/** How the controls stories 2–4 own read to a user (see the header's assumptions). */
const SEARCH_FIELD_NAME = /search/i;
const STATUS_FILTER_NAME = /status/i;
const ACCOUNT_NUMBER_COLUMN = /account/i;
const NEXT_PAGE_NAME = /next/i;
const PREVIOUS_PAGE_NAME = /prev/i;

/**
 * This story's own controls. Wording is the developer's; only the sense of it is fixed
 * here — the reveal control must name what it reveals (AC-3 "clearly-named"), and the
 * action overflow must name what it opens.
 */
const REQUEST_ACTIONS_NAME = /(action|more|option|menu)/i;
const OPEN_REQUEST_NAME = /(open|view|detail)/i;
const REVEAL_ACCOUNT_NUMBER_NAME = /(reveal|show|unmask).*account/i;

/**
 * The two decided requests this spec opens, composed from the project-wide factory so
 * their account numbers are never retyped here. Two of them, with DIFFERENT account
 * numbers, because AC-4's sharpest check is that a number revealed on one request is not
 * revealed on the other. Their references carry a date segment `manyTransactions` never
 * generates (it produces `TXN-20260415-####`), so every reference below is unique across
 * the whole served set — which is what lets a row be found by its reference rather than
 * by its position.
 */
const REVEALED_REQUEST = transactionWithStatus(TRANSACTION_STATUS_APPROVED, {
  Id: 7501,
  Reference: 'TXN-20260430-0501',
  AccountNumber: '2044-8871-3390',
});
const OTHER_REQUEST = transactionWithStatus(TRANSACTION_STATUS_APPROVED, {
  Id: 7502,
  Reference: 'TXN-20260430-0502',
  AccountNumber: '5589-3374-9902',
});

/**
 * The set AC-4 needs: the two decided requests plus enough imported ones to fill more
 * than one page at the default size of 20 (story 4, R12), so paging is a real page
 * change rather than a disabled control. 25 requests → 20 on the first page, 5 on the
 * second. The two decided ones are also the only non-`Imported` requests in the set,
 * which makes the status filter narrow to exactly them.
 */
const PAGED_REQUESTS: TransactionRead[] = [
  REVEALED_REQUEST,
  OTHER_REQUEST,
  ...manyTransactions(23),
];

/** The set AC-5 and AC-6 need: two requests, so every one of them is on screen at once. */
const TWO_REQUESTS: TransactionRead[] = [REVEALED_REQUEST, OTHER_REQUEST];

/**
 * The amount AC-6 expects on a phone card, tolerant of how it is grouped: the digits of
 * the factory's own `Amount` with an optional separator wherever a thousands separator
 * would fall, so "15750", "15,750.00", "15 750,00" and "R 15 750.00" all satisfy it.
 * Derived from the factory rather than retyped, and no currency symbol is assumed.
 */
const KEY_AMOUNT_ON_SCREEN = new RegExp(
  String(REVEALED_REQUEST.Amount).replace(/\B(?=(\d{3})+$)/g, '[\\s,. ]?'),
);

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * Candidate controls for the icon-only sweep (AC-5). Disabled controls are left out:
 * a disabled `button` receives no pointer events and takes no focus, so the platform
 * itself makes hover/focus wording unreachable — asserting it there would fail the
 * developer for something no implementation can satisfy.
 */
const CONTROL_SELECTOR = [
  'button:not([disabled]):not([aria-disabled="true"])',
  'a[href]:not([aria-disabled="true"])',
  '[role="button"]:not([disabled]):not([aria-disabled="true"])',
].join(', ');

/**
 * Blocks the live services (see LIVE_BACKEND_ORIGINS). Registered LAST in each test,
 * because Playwright matches the most recently registered route first: that way a call
 * sent to a service's own origin is aborted and fails visibly, instead of being quietly
 * answered by the origin-agnostic mocks above it.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Answers this screen's browser-side read of the expense requests with the shared
 * envelope factory. The glob names no origin, so it matches whichever port the app is
 * served on (:3000 in dev, :3100 in the epic-end production run). A call addressed at
 * the transactions service itself is still aborted, because `blockLiveBackends` is
 * registered after this one.
 */
const mockTransactionList = async (
  page: Page,
  transactions: TransactionRead[],
): Promise<void> => {
  await page.route('**/transactions-api/v1/transactions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(transactionListResponse(transactions)),
    }),
  );
};

/**
 * Puts the browser in a signed-in state as the named role, without a real credential:
 * the mock `session` cookie the Node-side auth stub maps back to this role when the
 * server-side gate asks it who the session belongs to.
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
 * disagree with what the Node-side stub returns for the same session.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(userInfoFor(roleName)),
    }),
  );
};

/** Signs in and lands on the request list with the given requests served. */
const openRequestList = async (
  page: Page,
  context: BrowserContext,
  transactions: TransactionRead[],
): Promise<void> => {
  await mockTransactionList(page, transactions);
  await mockBrowserIdentityCall(page, ROLE_IMPORTER);
  await seedSession(context, ROLE_IMPORTER);
  await blockLiveBackends(page);

  await page.goto(REQUESTS_ROUTE);
};

/** The last four digits of an account number — what the screen may show (POPIA). */
const lastFourOf = (request: TransactionRead): string =>
  request.AccountNumber.replace(/\D/g, '').slice(-4);

/** A request's reference, for readable failure output. */
const referenceOf = (request: TransactionRead): string => request.Reference;

/** One request's row, found by its own reference — never by position. */
const requestRow = (page: Page, reference: string): Locator =>
  page.getByRole('main').getByRole('row').filter({ hasText: reference });

/**
 * The free-text search field (story 2). Located by its accessible name and accepted as
 * either an `input[type=search]` (`searchbox`) or a plain text input — R2/R6 never
 * specified which, and both are a labelled text field named for searching, so pinning
 * one role would fail the story for a choice it was free to make.
 */
const searchField = (page: Page): Locator => {
  const list = page.getByRole('main');
  return list
    .getByRole('searchbox', { name: SEARCH_FIELD_NAME })
    .or(list.getByRole('textbox', { name: SEARCH_FIELD_NAME }));
};

/**
 * A column heading's sort control (story 4, R13). Scoped to the table so it can never
 * resolve to the reveal control in an opened request, which is also named for the
 * account number.
 */
const sortByColumn = (page: Page, columnName: RegExp): Locator =>
  page.getByRole('table').getByRole('button', { name: columnName });

const nextPage = (page: Page): Locator =>
  page.getByRole('main').getByRole('button', { name: NEXT_PAGE_NAME });

const previousPage = (page: Page): Locator =>
  page.getByRole('main').getByRole('button', { name: PREVIOUS_PAGE_NAME });

/** The reveal-account-number control inside an opened request (AC-3's named control). */
const revealControlIn = (detail: Locator): Locator =>
  detail.getByRole('button', { name: REVEAL_ACCOUNT_NUMBER_NAME });

/** Narrows the list to one status with the Shadcn `select` filter (story 2). */
const chooseStatusFilter = async (
  page: Page,
  status: string,
): Promise<void> => {
  await page
    .getByRole('main')
    .getByRole('combobox', { name: STATUS_FILTER_NAME })
    .click();
  // Radix portals its option list out of the trigger, so it is not scoped to `main`.
  await page.getByRole('option', { name: status, exact: true }).click();
};

/**
 * Opens one request from its row (desktop) or its card (phone width) through the action
 * overflow, and hands back the detail panel over the list.
 */
const openRequest = async (page: Page, request: Locator): Promise<Locator> => {
  await request.getByRole('button', { name: REQUEST_ACTIONS_NAME }).click();
  await page
    .getByRole('menu')
    .getByRole('menuitem', { name: OPEN_REQUEST_NAME })
    .click();

  const detail = page.getByRole('dialog');
  await expect(detail).toBeVisible();
  return detail;
};

/** Closes the opened request the way a keyboard user does, and proves it went away. */
const closeRequest = async (page: Page, detail: Locator): Promise<void> => {
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();
};

/**
 * THE COMPLIANCE CHECK, applied to whatever state the list is in right now, and
 * deliberately format-agnostic (the mask's own wording is the developer's):
 *
 * - every request currently on screen shows its own last four digits, so masking is
 *   never "achieved" by rendering nothing at all;
 * - no request's FULL account number is anywhere in the list — not in its text, and not
 *   in its markup either, since a full value parked in a `title` or `data-` attribute is
 *   just as much a POPIA leak as one printed in a cell.
 *
 * Returns the requests it found on screen, so a caller can also pin exactly WHICH ones a
 * narrowing left behind. Rows are matched by reference rather than by position, so the
 * result is independent of the order the screen happens to be in.
 *
 * Only ever called with no request open: an opened, deliberately revealed request is the
 * one place a full number is allowed, and that state is asserted directly instead.
 */
const expectAccountNumbersMasked = async (
  page: Page,
  requests: TransactionRead[],
  state: string,
): Promise<TransactionRead[]> => {
  await expect(
    page.getByRole('dialog'),
    `${state}: no request may be open while the list is checked for masking`,
  ).toHaveCount(0);

  const list = page.getByRole('main');
  const rowTexts = await list.getByRole('row').allInnerTexts();
  const markup = await list.innerHTML();

  const shown = requests.filter((request) =>
    rowTexts.some((text) => text.includes(request.Reference)),
  );
  expect(
    shown.length,
    `${state}: no expense request is on screen at all, so masking cannot be evidenced`,
  ).toBeGreaterThan(0);

  const printed = requests.filter((request) =>
    rowTexts.some((text) => text.includes(request.AccountNumber)),
  );
  expect(
    printed.map(referenceOf),
    `${state}: these requests show their FULL account number in the list — it must stay masked to its last four digits on every render path (POPIA, project.md §Compliance)`,
  ).toEqual([]);

  const inMarkup = requests.filter((request) =>
    markup.includes(request.AccountNumber),
  );
  expect(
    inMarkup.map(referenceOf),
    `${state}: these requests' FULL account numbers are in the list's markup (a tooltip, title or data attribute) even though they are not printed — the value must not be delivered to the browser's DOM unmasked`,
  ).toEqual([]);

  const missingLastFour = shown.filter(
    (request) =>
      !rowTexts.some(
        (text) =>
          text.includes(request.Reference) &&
          text.includes(lastFourOf(request)),
      ),
  );
  expect(
    missingLastFour.map(referenceOf),
    `${state}: these requests show no account number at all — the last four digits stay visible, only the rest is hidden`,
  ).toEqual([]);

  return shown;
};

/**
 * The icon-only controls inside `root`: the ones a sighted user is given no wording for.
 *
 * "Visible text" is computed by walking the control's own nodes and skipping any
 * descendant that collapses to a 1×1 box — which is exactly what a visually-hidden
 * wrapper (Tailwind's `sr-only`, Radix's `VisuallyHidden`) does. That text names the
 * control for a screen reader but is never SEEN, so a control carrying only that is
 * still icon-only, and AC-5 still applies to it.
 *
 * The controls come back as index-bound locators (Playwright's own idiom for iterating a
 * discovered set); that is safe here because the sweep restores the page between
 * candidates, so the set never shifts underneath it.
 */
const iconOnlyControlsIn = async (root: Locator): Promise<Locator[]> => {
  const controls = root.locator(CONTROL_SELECTOR);

  const iconOnly = await controls.evaluateAll((elements) => {
    const visibleTextOf = (node: Element): string => {
      let text = '';
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          text += child.textContent ?? '';
          return;
        }
        if (child instanceof Element) {
          const { width, height } = child.getBoundingClientRect();
          if (width > 1 && height > 1) {
            text += visibleTextOf(child);
          }
        }
      });
      return text.trim();
    };

    return elements
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => {
        const { width, height } = element.getBoundingClientRect();
        return width > 1 && height > 1 && visibleTextOf(element) === '';
      })
      .map(({ index }) => index);
  });

  return iconOnly.map((index) => controls.nth(index));
};

/**
 * AC-5, applied to one icon-only control: hovering it reveals its name, moving away
 * takes the name away again, keyboard focus alone reveals the same name, and the name a
 * screen reader is given matches the one a sighted user was shown.
 *
 * Radix mounts its tooltip content only while the tooltip is open and puts
 * `role="tooltip"` inside it, so that role being present IS the name being revealed —
 * and its text is the wording shown.
 *
 * The mouse is parked at the viewport's top-left corner between steps: that is the
 * header's own gutter, with no control under it, so nothing else is hovered while the
 * "no name is showing" baseline is taken.
 */
const expectNamesItselfOnHoverAndFocus = async (
  page: Page,
  control: Locator,
): Promise<void> => {
  const tooltip = page.getByRole('tooltip');

  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);

  await control.hover();
  await expect(
    tooltip,
    'an icon-only control revealed no wording on hover, so a sighted user is never told what it does (R15)',
  ).toBeVisible();

  const hoveredName = (await tooltip.innerText()).trim();
  expect(
    hoveredName,
    'the wording revealed on hover is empty, so the control still names nothing',
  ).not.toBe('');
  await expect(
    control,
    'the accessible label does not match the wording shown on hover, so a screen-reader user and a sighted user are told different things (R15)',
  ).toHaveAccessibleName(hoveredName);

  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);

  await control.focus();
  await expect(
    tooltip,
    `"${hoveredName}" is revealed on hover but not on keyboard focus, so a keyboard user never learns what the control does (R15) — a native "title" attribute does exactly this`,
  ).toBeVisible();
  expect(
    (await tooltip.innerText()).trim(),
    'the wording revealed on keyboard focus differs from the wording revealed on hover',
  ).toBe(hoveredName);

  await control.blur();
  await expect(tooltip).toHaveCount(0);
};

/** R16: the page itself must never scroll sideways at the width it is being read at. */
const expectNoSidewaysScrolling = async (
  page: Page,
  state: string,
): Promise<void> => {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
    clientWidth: document.documentElement.clientWidth,
  }));

  // One pixel of tolerance for sub-pixel layout rounding; anything more is real overflow.
  expect(
    scrollWidth,
    `${state}: the page is ${String(scrollWidth)}px wide inside a ${String(clientWidth)}px viewport, so it scrolls sideways (R16)`,
  ).toBeLessThanOrEqual(clientWidth + 1);
};

test.describe('Epic expense-request-list, Story 5: open one request, with its account number protected', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-4
  // The epic's cross-cutting compliance regression check (story §Notes): masking is not
  // a formatting nicety, it is POPIA, so it is exercised against every narrowing and
  // ordering path stories 2–4 introduce — searching, filtering, sorting and paging — and
  // against the one thing that could legitimately undo it, the per-request reveal. One
  // journey rather than four, because the point is that no SEQUENCE of these leaves a
  // number exposed.
  test('account numbers stay masked through searching, filtering, sorting and paging, and a reveal never escapes the one request it was made on', async ({
    page,
    context,
  }) => {
    await openRequestList(page, context, PAGED_REQUESTS);

    // 1. As the screen lands: a full first page, every account number masked.
    const firstPage = await expectAccountNumbersMasked(
      page,
      PAGED_REQUESTS,
      'as the screen lands',
    );
    expect(
      firstPage,
      'the first page should hold the default 20 requests per page (R12)',
    ).toHaveLength(20);

    // 2. SEARCHING. Narrowed to one request by its own reference — then that request is
    // opened and its number deliberately revealed, so the checks that follow are
    // measuring a reveal that really happened rather than one that never worked.
    const search = searchField(page);
    await search.fill(REVEALED_REQUEST.Reference);
    const searched = await expectAccountNumbersMasked(
      page,
      PAGED_REQUESTS,
      `searching for ${REVEALED_REQUEST.Reference}`,
    );
    expect(searched.map(referenceOf)).toEqual([REVEALED_REQUEST.Reference]);

    const detail = await openRequest(
      page,
      requestRow(page, REVEALED_REQUEST.Reference),
    );
    await expect(detail).toContainText(REVEALED_REQUEST.Reference);
    await expect(detail).not.toContainText(REVEALED_REQUEST.AccountNumber);
    await expect(detail).toContainText(lastFourOf(REVEALED_REQUEST));
    await revealControlIn(detail).click();
    await expect(
      detail,
      'the named reveal control did not produce the full account number, so nothing that follows would prove a reveal is contained',
    ).toContainText(REVEALED_REQUEST.AccountNumber);
    await closeRequest(page, detail);

    // 3. ...and it is contained: a DIFFERENT request opens masked, and carries no trace
    // of the number revealed a moment ago on the other one.
    await search.fill(OTHER_REQUEST.Reference);
    const otherDetail = await openRequest(
      page,
      requestRow(page, OTHER_REQUEST.Reference),
    );
    await expect(otherDetail).toContainText(OTHER_REQUEST.Reference);
    await expect(
      otherDetail,
      'this request shows its full account number without being asked — a reveal is per request, never a reveal-all',
    ).not.toContainText(OTHER_REQUEST.AccountNumber);
    await expect(otherDetail).toContainText(lastFourOf(OTHER_REQUEST));
    await expect(
      otherDetail,
      `the account number revealed on ${REVEALED_REQUEST.Reference} has followed the reader onto ${OTHER_REQUEST.Reference}`,
    ).not.toContainText(REVEALED_REQUEST.AccountNumber);
    await expect(revealControlIn(otherDetail)).toBeVisible();
    await closeRequest(page, otherDetail);

    // 4. PAGING. Back to the whole set — the earlier reveal has not leaked into the list
    // — then over to the second page and back.
    await search.fill('');
    await expectAccountNumbersMasked(
      page,
      PAGED_REQUESTS,
      'with the search cleared again',
    );

    await nextPage(page).click();
    const secondPage = await expectAccountNumbersMasked(
      page,
      PAGED_REQUESTS,
      'on the second page',
    );
    expect(
      secondPage,
      'the second page should hold the remaining 5 of the 25 served requests',
    ).toHaveLength(5);

    await previousPage(page).click();
    await expectAccountNumbersMasked(
      page,
      PAGED_REQUESTS,
      'back on the first page',
    );

    // ...and the reveal did not survive the page change either: the same request opens
    // masked again. This is the check that fails if the reveal is kept in a store that
    // outlives the open panel.
    await search.fill(REVEALED_REQUEST.Reference);
    const reopened = await openRequest(
      page,
      requestRow(page, REVEALED_REQUEST.Reference),
    );
    await expect(
      reopened,
      `${REVEALED_REQUEST.Reference} is still revealed after moving to another page and back — the reveal must not outlive the panel it was made in`,
    ).not.toContainText(REVEALED_REQUEST.AccountNumber);
    await expect(reopened).toContainText(lastFourOf(REVEALED_REQUEST));
    await closeRequest(page, reopened);
    await search.fill('');

    // 5. SORTING — including by the very column being masked, in both directions.
    await sortByColumn(page, ACCOUNT_NUMBER_COLUMN).click();
    await expectAccountNumbersMasked(
      page,
      PAGED_REQUESTS,
      'ordered by account number',
    );
    await sortByColumn(page, ACCOUNT_NUMBER_COLUMN).click();
    await expectAccountNumbersMasked(
      page,
      PAGED_REQUESTS,
      'ordered by account number, reversed',
    );

    // 6. FILTERING. The two decided requests are the only ones that are not `Imported`,
    // so the status filter narrows to exactly them — pinned here as well, so this leg
    // cannot pass by narrowing to nothing.
    await chooseStatusFilter(page, TRANSACTION_STATUS_APPROVED);
    const filtered = await expectAccountNumbersMasked(
      page,
      PAGED_REQUESTS,
      `filtered to ${TRANSACTION_STATUS_APPROVED} requests`,
    );
    expect(filtered.map(referenceOf).sort()).toEqual(
      [REVEALED_REQUEST.Reference, OTHER_REQUEST.Reference].sort(),
    );
  });

  // AC-5
  // Swept rather than spot-checked, so a control added later is covered too. The list and
  // the opened request are swept separately on purpose: Radix's modal dialog takes
  // pointer events away from the rest of the page while it is open, so the list's own
  // controls cannot be hovered at the same time as the panel's.
  test('every icon-only control reveals its name on hover and on keyboard focus, and carries a matching accessible label', async ({
    page,
    context,
  }) => {
    await openRequestList(page, context, TWO_REQUESTS);
    await expect(requestRow(page, REVEALED_REQUEST.Reference)).toBeVisible();

    const listControls = await iconOnlyControlsIn(page.getByRole('main'));
    for (const control of listControls) {
      await expectNamesItselfOnHoverAndFocus(page, control);
    }

    const detail = await openRequest(
      page,
      requestRow(page, REVEALED_REQUEST.Reference),
    );
    const detailControls = await iconOnlyControlsIn(detail);
    for (const control of detailControls) {
      await expectNamesItselfOnHoverAndFocus(page, control);
    }

    // A sweep that examined nothing proves nothing. This screen is expected to have at
    // least one icon-only control — R15 names reveal-account-number as its own example,
    // and AC-6 requires an action overflow per request. If every control here genuinely
    // grew visible wording instead, that is a change to take back to the planner, not a
    // green test.
    expect(
      listControls.length + detailControls.length,
      'no icon-only control was found in the list or in an opened request, so this criterion checked nothing',
    ).toBeGreaterThan(0);
  });

  // AC-6
  // Rendered AT phone width from the first paint, the way a phone user receives it —
  // not resized after a desktop render, which can leave a layout that a real phone would
  // never have produced.
  test('at phone width each request is a card with its reference and key values plus an action overflow that opens it, and the page never scrolls sideways', async ({
    page,
    context,
  }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await openRequestList(page, context, TWO_REQUESTS);

    // Every request is presented, one card each — not a subset, and not one wide table.
    const cards = page.getByRole('main').getByRole('listitem');
    await expect(cards).toHaveCount(TWO_REQUESTS.length);

    const card = cards.filter({ hasText: REVEALED_REQUEST.Reference });
    await expect(card).toBeVisible();

    // Its primary identifier (R16), plus the key values a reader needs to recognise the
    // request without opening it...
    await expect(card).toContainText(REVEALED_REQUEST.Reference);
    await expect(card).toContainText(REVEALED_REQUEST.Status);
    await expect(card).toContainText(KEY_AMOUNT_ON_SCREEN);
    // ...and the account number is no less protected here than in the table.
    await expect(
      card,
      'the phone card shows a full account number — the masking holds wherever requests are listed (POPIA, project.md §Compliance)',
    ).not.toContainText(REVEALED_REQUEST.AccountNumber);

    await expectNoSidewaysScrolling(page, 'the request list at phone width');

    // The action overflow is how a request is opened at this width.
    const detail = await openRequest(page, card);
    await expect(detail).toContainText(REVEALED_REQUEST.Reference);
    await expectNoSidewaysScrolling(page, 'an opened request at phone width');
  });
});
