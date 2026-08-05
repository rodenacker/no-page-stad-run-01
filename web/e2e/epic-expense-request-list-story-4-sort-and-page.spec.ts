/**
 * Story Metadata:
 * - Epic: expense-request-list — The shared expense request list
 * - Story: 4 — Sort and page through the request list
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R12, R13 (+ the epic's Feature NFRs: WCAG 2.2 AA and full
 *   keyboard completability for search, filtering, sorting and paging)
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-1 (first activation orders ascending, second reverses it), AC-2 (the active
 *   column and direction are indicated and survive leaving and returning), AC-3
 *   (page controls and the 5/10/20/50 page-size choice are always on screen, 20 per
 *   page until changed), AC-5 (sorting and paging act on the narrowed set) and AC-6
 *   (the epic's accessibility baseline: a real-browser axe scan plus the
 *   keyboard-only sweep) → this file.
 * - AC-4 (a set that fits one page leaves the controls on screen but unusable) is
 *   the Vitest layer's, at
 *   `web/src/__tests__/integration/epic-expense-request-list-story-4-sort-and-page.test.tsx`.
 *   Deliberately NOT duplicated here.
 *
 * AC-6 IS THIS EPIC'S ACCESSIBILITY BASELINE. Every story in the epic modifies the
 * same `/requests` screen, so the epic is scanned once here — complete, with the
 * search, all five filters, the sort indicator and the pagination controls on
 * screen — in three distinct states, and swept with the keyboard alone. It uses the
 * same mechanism and the same WCAG tag set as epic 1's scan
 * (`epic-sign-in-and-app-shell-story-3-app-shell-identity-and-sign-out.spec.ts`) and
 * the `expense-file-upload` epic's (story 3).
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * This spec never contacts a live backend and never uses a real credential
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both real services as running on this machine. Two boundaries,
 * one contract — both established by epic 1 and reused here rather than rebuilt:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started by `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. `/requests` is
 *    gated SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared userinfo source, keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` below, for this screen's single transactions
 *    read (`GET /transactions-api/v1/transactions`) and the identity call in case a
 *    client component reads it — plus a hard block on the real services' own origins
 *    (:4424 / :4423) registered LAST, so a call addressed at a live service is
 *    aborted and fails visibly instead of being quietly answered by the
 *    origin-agnostic mocks above it.
 *
 * Every response body comes from the project-wide factories under
 * `web/src/mocks/data/` (`userInfoFor(role)`, `transactionListResponse()`,
 * `transactionsForNarrowing()`, `manyTransactions(n)`); no response shape and no
 * canonical value is authored in this file, so this spec and the Vitest layer cannot
 * drift on the contract. `GET /v1/transactions` takes no query parameters and
 * answers `{ Transactions: [...] }` — the envelope is the factory's business.
 *
 * Sign-in is faked with the mock `session` cookie the stub recognises for a role,
 * seeded via `context.addCookies()` rather than by driving the sign-in form (epic 1
 * story 2's spec owns that journey; the cookie is the app's sole conveyance of
 * session). Cookies ignore port, so one seed serves the dev server (:3000) and the
 * epic-end production run (:3100). `Secure` is omitted because the E2E server is
 * plain http on localhost.
 *
 * ---------------------------------------------------------------------------
 * Implementation patterns this spec assumes — READ BEFORE IMPLEMENTING
 * ---------------------------------------------------------------------------
 * - The request list is read FROM THE BROWSER through the shared API client at the
 *   app's own same-origin `/transactions-api/...` address (story 1 §Infrastructure
 *   reuse notes), i.e. from a client component. `page.route()` cannot intercept a
 *   read issued by the Next.js server or by a Server Action — a server-side fetch
 *   bypasses these mocks and leaves for the real transactions service.
 * - Sorting and paging are IN MEMORY over that one fetched set (the endpoint accepts
 *   no parameters), applied AFTER the narrowing from stories 2–3.
 * - The template's `PAGINATION` constant in `web/src/lib/utils/constants.ts` still
 *   carries the starter defaults (page size 25, choices 10/25/50/100). R12 requires
 *   5/10/20/50 with 20 as the default — replace those values rather than working
 *   around them (CLAUDE.md §6: the brief overrides template code).
 * - SORTABLE COLUMN HEADINGS are the standard accessible pattern: a `button` named
 *   for the column, inside its `columnheader`, and `aria-sort="ascending" |
 *   "descending"` on that `columnheader` (absent or `none` on every other column,
 *   because sorting is single-field). The direction is also carried in the sort
 *   control's ACCESSIBLE NAME (e.g. "Amount, sorted ascending") — the arrow is an
 *   icon-only affordance, and R15 requires such a control to carry a matching
 *   accessible label, so the announced state must say which way the list is ordered.
 *   The arrow glyph itself is the manual checklist's business, not this spec's.
 * - THE PAGE CONTROLS that move between pages are named /next/ and /previous/, and
 *   are `button`s or `link`s — both are accepted below — because R12/AC-4 require
 *   them to stay on screen and become unusable rather than disappear. Addressed here
 *   exactly as this epic's sibling specs address them (stories 5 and 6), so the epic
 *   states one contract.
 * - THE PAGE-SIZE SELECTOR is the Shadcn `select` (never a native `<select>` — the
 *   keyboard bar cannot be evidenced against an OS-drawn option list), labelled so
 *   it reads "…per page" (e.g. "Requests per page"), offering exactly 5, 10, 20 and
 *   50 in that order.
 * - THE NARROWING CONTROLS from stories 2–3, addressed with the SAME label patterns
 *   their own specs use: the free-text search is a `searchbox` named /search/; the
 *   three pick-one filters are Shadcn `select`s whose accessible names contain
 *   "status", "file" and "type"; and story 3's four range bounds are individually
 *   labelled, TYPEABLE fields — "Minimum amount"/"Amount from",
 *   "Maximum amount"/"Amount to", "Earliest…"/"Date from", "Latest…"/"Date to". A
 *   date bound must accept a plain `YYYY-MM-DD` value (a calendar popover MAY be
 *   added beside it, never instead of it — story 3 §Infrastructure reuse notes).
 * - Tab order follows visual order: search and filters above the table, the column
 *   headings inside it, the page-size selector and page controls below it.
 * - The screen lives inside epic 1's signed-in shell, so its content is within
 *   `main` and every query here is scoped to it — Next.js renders a permanently
 *   empty body-level `role="alert"` route announcer outside `main`.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — `/requests` still
 * answers `notFound()` and has no list, no sorting and no page controls.
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_TYPE_CREDIT_CODE,
  manyTransactions,
  transactionListResponse,
  transactionsForNarrowing,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** This story's screen, and the landing screen the header's app name leads back to. */
const REQUESTS_PATH = '/requests';
const LANDING_PATH = '/';

/**
 * The one transactions read this screen makes, as the BROWSER addresses it: the
 * app's own `/transactions-api/*` mount point (`TRANSACTIONS_API_BASE_PATH` in
 * `web/src/lib/utils/constants.ts`), never the service's origin. No origin in the
 * glob, so it matches whichever port the app is served on (:3000 in dev, :3100 in
 * the epic-end production run).
 */
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
 * WCAG 2.2 AA — this project's effective accessibility bar
 * (`documentation/requirements-application.md` §6.6.5, recorded in project.md
 * §Baseline NFRs as superseding the template's 2.1 AA floor). The identical tag set
 * epic 1's and the file-upload epic's scans used. Scoped explicitly because axe's
 * defaults also run best-practice rules, which would fail this spec on issues
 * outside the agreed bar.
 */
const WCAG_22_AA_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
];

/** R12: the page-size choice, and the size in force until the user changes it. */
const PAGE_SIZE_CHOICES = [5, 10, 20, 50];
const DEFAULT_PAGE_SIZE = 20;

/** The columns this spec sorts by, named as the brief's Data Model names them. */
const AMOUNT_COLUMN = /amount/i;
const REFERENCE_COLUMN = /reference/i;

/** How the narrowing controls of stories 2–3 are addressed (see header). */
const STATUS_FILTER = /status/i;
const ORIGINATING_FILE_FILTER = /file/i;
const TRANSACTION_TYPE_FILTER = /type/i;
const PAGE_SIZE_SELECTOR = /per page|page size/i;
const SEARCH_FIELD = /search/i;

/**
 * Story 3's four range bounds — the identical label patterns story 3's own spec
 * uses, so the epic states ONE contract for those fields rather than two.
 */
const MINIMUM_AMOUNT = /minimum amount|amount from/i;
const MAXIMUM_AMOUNT = /maximum amount|amount to/i;
const EARLIEST_DATE = /earliest|date from/i;
const LATEST_DATE = /latest|date to/i;

/** The controls that move between pages. */
const NEXT_PAGE = /next/i;
const PREVIOUS_PAGE = /previous|back/i;

/** The plain-language label the app gives the sample data's credit code (`C`). */
const CREDIT_TYPE_CHOICE = /credit/i;

/**
 * The narrowing the keyboard-only sweep (AC-6) applies, in the order it applies it.
 * Chosen against `manyTransactions(45)` so every step visibly changes the list and
 * the end state is a single request — see the expectations derived from the fixture
 * in that test rather than any count restated by hand.
 */
const SWEEP = {
  /** Matches exactly one request's reference and its description. */
  searchTerm: '0007',
  minimumAmount: '145',
  maximumAmount: '152',
  earliestDate: '2026-04-11',
  latestDate: '2026-04-13',
} as const;

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
 * Answers a browser-side identity read from the shared userinfo source, so it can
 * never disagree with what the Node-side stub returns for the same session. The
 * server-side gate is answered by the stub, not by this route.
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
 * parameters, no server-side paging or sorting) — so anything ordered or paged on
 * screen was ordered and paged by the app itself.
 */
const serveTransactions = async (
  page: Page,
  requests: TransactionRead[],
): Promise<void> => {
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse(requests))),
  );
};

/**
 * Puts the browser in a signed-in state without driving the sign-in form and
 * without any real credential: the mock `session` cookie the Node-side auth stub
 * maps back to this role when the server-side gate asks who the session belongs to.
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

/** The screen's own content — never the shell around it. */
const listScreen = (page: Page): Locator => page.getByRole('main');

/** The request list itself. */
const requestList = (page: Page): Locator =>
  listScreen(page).getByRole('table');

/**
 * The references of the requests currently on screen, in the order the rows appear.
 *
 * Each row is matched back to the request it came from by that request's own
 * reference, so nothing here depends on which column the reference sits in or on any
 * row's position — and the returned order IS what "ordered by amount" means to a
 * reader. The heading row carries no reference and is naturally skipped.
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

/** How many requests are on the page right now. */
const requestsOnPage = async (
  page: Page,
  served: TransactionRead[],
): Promise<number> => (await referencesInOrder(page, served)).length;

/**
 * The references of `requests` in amount order — the order the list must be in
 * after the amount column is sorted. Derived from the fixture's own values, so the
 * expectation cannot drift from the data the mocked service served, and it fails an
 * implementation that compares amounts as text (the fixtures put 9.99 and 100 either
 * side of that mistake).
 */
const byAmount = (
  requests: TransactionRead[],
  direction: 'ascending' | 'descending',
): string[] =>
  [...requests]
    .sort((first, second) =>
      direction === 'ascending'
        ? first.Amount - second.Amount
        : second.Amount - first.Amount,
    )
    .map((request) => request.Reference);

/**
 * A sortable column: the `columnheader` that carries the sort state, and the control
 * inside it that a user activates. Both are named for the column, so neither is
 * addressed by position.
 */
const sortableColumn = (
  page: Page,
  columnName: RegExp,
): { heading: Locator; control: Locator } => {
  const heading = listScreen(page).getByRole('columnheader', {
    name: columnName,
  });
  return {
    heading,
    control: heading.getByRole('button', { name: columnName }),
  };
};

/**
 * A page control, whether the implementation renders it as a button or as a link.
 * `.or()` is Playwright's own locator combinator (not a query fallback): R12 asks
 * for controls that stay on screen and become unusable, which a `button` expresses
 * natively and Shadcn's `pagination` primitive renders as an anchor — both satisfy
 * the criterion, and only one of them will exist. Addressed exactly as the sibling
 * specs of this epic address it (story 6), so one contract covers the epic.
 */
const pageControl = (page: Page, name: RegExp): Locator => {
  const screen = listScreen(page);
  return screen
    .getByRole('button', { name })
    .or(screen.getByRole('link', { name }));
};

/** The Shadcn `select` that chooses how many requests a page holds. */
const pageSizeSelector = (page: Page): Locator =>
  listScreen(page).getByRole('combobox', { name: PAGE_SIZE_SELECTOR });

/** One of the three pick-one filters from story 2. */
const filterSelector = (page: Page, name: RegExp): Locator =>
  listScreen(page).getByRole('combobox', { name });

/**
 * Story 2's free-text search field — a real `searchbox`, named for what it does, the
 * way story 5's spec addresses it too.
 */
const searchField = (page: Page): Locator =>
  listScreen(page).getByRole('searchbox', { name: SEARCH_FIELD });

/**
 * One end of one of story 3's two-bound filters, found by its own label — the same
 * label patterns story 3's spec uses, so both specs pin the same field.
 */
const boundField = (page: Page, label: RegExp): Locator =>
  listScreen(page).getByLabel(label);

/** The digits in a control's text — e.g. `20` from "20 per page". */
const digitsOf = (text: string): number => Number(text.replace(/\D/g, ''));

/**
 * The choices an open Shadcn `select` is showing. Scoped to the open list rather
 * than the whole page, because Radix also renders a hidden native `select` for form
 * integration and every other filter on this screen has choices of its own.
 */
const openChoices = (page: Page): Locator => page.getByRole('listbox');

/** One choice in the open list, by the way it reads. */
const choice = (page: Page, name: RegExp): Locator =>
  openChoices(page).getByRole('option', { name });

/** Opens the page-size select and chooses a size with the pointer. */
const choosePageSize = async (page: Page, size: number): Promise<void> => {
  await pageSizeSelector(page).click();
  // `^<size>\b` so choosing 5 can never land on 50.
  await choice(page, new RegExp(`^${size}\\b`)).click();
};

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
 * Read from computed style rather than class names on purpose: a class assertion
 * would pass even if the styling token painted nothing at all, which is exactly
 * what AC-6's "visible focus indicator" cares about. Both shapes count, because
 * Shadcn/Tailwind render `focus-visible` styling as an outline on some primitives
 * and as a `box-shadow` ring on others. Callers compare the focused paint with the
 * unfocused paint, so a control carrying a permanent shadow cannot pass by accident.
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
 * Presses `key` until the control has keyboard focus. Throws (failing the test with
 * a plain-English reason) when the control cannot be reached — that throw IS the
 * keyboard-reachability assertion. The same helper epic 1 story 3 and the
 * file-upload epic's story 2 use.
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
    `"${await labelOf(control)}" could not be reached with ${maxPresses} ` +
      `"${key}" presses, so it cannot be operated by keyboard alone (AC-6).`,
  );
};

/**
 * Chooses a value from a Shadcn `select` using the keyboard alone: Tab to the
 * trigger, Enter to open, the arrow keys to reach the value, Enter to take it. A
 * native `<select>` cannot satisfy this — its option list is drawn by the operating
 * system and no option ever takes focus in the page.
 */
const chooseByKeyboard = async (
  page: Page,
  trigger: Locator,
  optionName: RegExp,
): Promise<void> => {
  await pressUntilFocused(page, 'Tab', trigger);
  await page.keyboard.press('Enter');

  const option = choice(page, optionName);
  await expect(option).toBeVisible();
  await pressUntilFocused(page, 'ArrowDown', option);
  await page.keyboard.press('Enter');
};

/**
 * Types a value into a field the keyboard has just been walked to. The value is
 * `fill`ed rather than typed keystroke by keystroke because a native
 * `<input type="date">` accepts typed digits only in the browser's own locale
 * segments — reaching the field by Tab is the part AC-6 is about, and the field must
 * accept the plain `YYYY-MM-DD` / numeric value a keyboard user would enter.
 */
const enterByKeyboard = async (
  page: Page,
  field: Locator,
  value: string,
): Promise<void> => {
  await pressUntilFocused(page, 'Tab', field);
  await field.fill(value);
  await expect(
    field,
    `"${await labelOf(field)}" must accept the typed value ${value} — a bound that ` +
      `can only be set from a calendar popover cannot be completed by keyboard (AC-6)`,
  ).toHaveValue(value);
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

/** Signs in as an Importer with the whole request set served to the browser. */
const openRequestList = async (
  page: Page,
  context: BrowserContext,
  requests: TransactionRead[],
): Promise<void> => {
  await mockBrowserIdentityCall(page, ROLE_IMPORTER);
  await serveTransactions(page, requests);
  await blockLiveBackends(page);
  await seedSession(context, ROLE_IMPORTER);

  await page.goto(REQUESTS_PATH);
  await expect(requestList(page)).toBeVisible();
};

test.describe('Epic expense-request-list, Story 4: sort and page through the request list', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-1
  // One column, both directions (testing-policy.md § "Representative vs
  // exhaustive"). Amount is the column chosen because the fixture's amounts sit
  // either side of the text-versus-number mistake (9.99 against 100), and because
  // the mocked service returns the requests in an order that is neither ascending
  // nor descending — so the order on screen can only have come from the app.
  test('activating a column heading orders the list by that column, and activating the same heading again reverses it', async ({
    page,
    context,
  }) => {
    const requests = transactionsForNarrowing();
    await openRequestList(page, context, requests);

    // All of them fit the default page, so ordering is the only thing at work here.
    await expect
      .poll(() => requestsOnPage(page, requests), {
        message:
          'every served request must be on the one page before ordering is asserted',
      })
      .toBe(requests.length);

    const amount = sortableColumn(page, AMOUNT_COLUMN);
    await expect(amount.control).toBeVisible();

    await amount.control.click();
    await expect
      .poll(() => referencesInOrder(page, requests), {
        message:
          'the first activation of the amount heading must order the requests by amount, smallest first (R13)',
      })
      .toEqual(byAmount(requests, 'ascending'));

    await amount.control.click();
    await expect
      .poll(() => referencesInOrder(page, requests), {
        message:
          'activating the same heading again must reverse the order, largest first (R13)',
      })
      .toEqual(byAmount(requests, 'descending'));
  });

  // AC-2
  // Two halves of one criterion: which column and direction the list is ordered by
  // is on show, and that ordering is still in force after the user goes to another
  // screen and comes back — walked as a user walks it, through the header's own
  // links, not by re-typing the address.
  test('the ordering column and direction are indicated, and the same ordering still applies after leaving the screen and coming back', async ({
    page,
    context,
  }) => {
    const requests = transactionsForNarrowing();
    await openRequestList(page, context, requests);

    const amount = sortableColumn(page, AMOUNT_COLUMN);
    await amount.control.click();

    // Indicated: the column carries the sort state, and the control a user reaches
    // says which way the list is ordered (R15 — an icon-only arrow must carry a
    // matching accessible label).
    await expect(amount.heading).toHaveAttribute('aria-sort', 'ascending');
    await expect(amount.control).toBeVisible();
    await expect(amount.control).toHaveAccessibleName(/ascending/i);

    // Single-field ordering: no other column claims a direction of its own.
    await expect(
      sortableColumn(page, REFERENCE_COLUMN).heading,
    ).not.toHaveAttribute('aria-sort', /ascending|descending/);

    const ascending = byAmount(requests, 'ascending');
    await expect
      .poll(() => referencesInOrder(page, requests))
      .toEqual(ascending);

    // Leave the screen: the app's name in the header goes back to the landing
    // screen (epic 1's shell).
    const header = page.getByRole('banner');
    await header.locator(`a[href="${LANDING_PATH}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${LANDING_PATH}$`));
    await expect(requestList(page)).toHaveCount(0);

    // ...and come back to it from the header navigation, the way a user would.
    await header.locator(`a[href="${REQUESTS_PATH}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${REQUESTS_PATH}$`));
    await expect(requestList(page)).toBeVisible();

    // The ordering the user chose is still the ordering they get, and the screen
    // still says so.
    await expect
      .poll(() => referencesInOrder(page, requests), {
        message:
          'the ordering chosen before leaving must still apply on returning within the same session (R13)',
      })
      .toEqual(ascending);
    await expect(sortableColumn(page, AMOUNT_COLUMN).heading).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  // AC-3
  test('the page controls and the 5/10/20/50 page-size choice are on screen, holding 20 requests a page until that is changed', async ({
    page,
    context,
  }) => {
    // More requests than a default page holds, so paging is genuinely in use.
    const requests = manyTransactions(45);
    await openRequestList(page, context, requests);

    // Always on screen (R12) — both page controls and the size choice, together.
    await expect(pageControl(page, NEXT_PAGE)).toBeVisible();
    await expect(pageControl(page, PREVIOUS_PAGE)).toBeVisible();

    const pageSize = pageSizeSelector(page);
    await expect(pageSize).toBeVisible();

    // 20 a page until changed.
    await expect
      .poll(() => requestsOnPage(page, requests), {
        message: `R12: a page must hold ${DEFAULT_PAGE_SIZE} requests until the reader chooses otherwise`,
      })
      .toBe(DEFAULT_PAGE_SIZE);
    await expect(pageSize).toContainText(String(DEFAULT_PAGE_SIZE));

    // The four choices R12 names, and only those.
    await pageSize.click();
    const offered = await openChoices(page).getByRole('option').allInnerTexts();
    expect(
      offered.map(digitsOf),
      'R12: the page-size choice offered is 5, 10, 20 and 50',
    ).toEqual(PAGE_SIZE_CHOICES);

    // Choosing a different size changes how many appear on one page — smaller...
    await choice(page, /^5\b/).click();
    await expect
      .poll(() => requestsOnPage(page, requests), {
        message: 'choosing 5 per page must leave 5 requests on the page',
      })
      .toBe(5);

    // ...and larger, up to the whole set when it fits.
    await choosePageSize(page, 50);
    await expect
      .poll(() => requestsOnPage(page, requests), {
        message:
          'choosing 50 per page must bring all 45 served requests onto one page',
      })
      .toBe(requests.length);
  });

  // AC-5
  // The point of this test is what sorting and paging are applied TO. A narrowing
  // is applied first, then the list is ordered and paged; every assertion is about
  // the narrowed set, and a request the narrowing removed must never appear on any
  // page — which is exactly what fails if the app orders or slices the whole
  // fetched set and narrows afterwards.
  test('sorting and paging act on the requests left by the current filters, never on the whole fetched set', async ({
    page,
    context,
  }) => {
    const requests = manyTransactions(45);
    const credits = requests.filter(
      (request) => request.TransactionType === TRANSACTION_TYPE_CREDIT_CODE,
    );
    const debits = requests.filter(
      (request) => request.TransactionType !== TRANSACTION_TYPE_CREDIT_CODE,
    );
    // The largest amount in the whole set belongs to a request the narrowing
    // removes — so it is the single most telling thing that must not be on screen.
    const [largestExcluded] = byAmount(debits, 'descending');

    await openRequestList(page, context, requests);

    // Narrow first: only the credits remain (story 2's transaction-type filter).
    await filterSelector(page, TRANSACTION_TYPE_FILTER).click();
    await choice(page, CREDIT_TYPE_CHOICE).click();

    // A small page, so several pages of the narrowed set exist.
    await choosePageSize(page, 5);

    // Then order it, largest first.
    const amount = sortableColumn(page, AMOUNT_COLUMN);
    await amount.control.click();
    await amount.control.click();
    await expect(amount.heading).toHaveAttribute('aria-sort', 'descending');

    // Page one is the five largest CREDITS — not the five largest requests.
    const narrowedOrder = byAmount(credits, 'descending');
    await expect
      .poll(() => referencesInOrder(page, requests), {
        message:
          'the first page must be the largest amounts among the narrowed requests, ordered by the app',
      })
      .toEqual(narrowedOrder.slice(0, 5));

    // The next page continues through the narrowed set, in the same order.
    await pageControl(page, NEXT_PAGE).click();
    await expect
      .poll(() => referencesInOrder(page, requests), {
        message:
          'paging must continue through the narrowed set, not fall back to the whole fetched set',
      })
      .toEqual(narrowedOrder.slice(5, 10));

    // And the request the narrowing removed is on neither page, even though its
    // amount would have put it first had the whole set been ordered and paged.
    await expect(
      listScreen(page).getByText(largestExcluded),
      `${largestExcluded} was filtered out, so no page of the ordered list may show it`,
    ).toHaveCount(0);
  });

  // AC-6 — THIS EPIC'S ACCESSIBILITY BASELINE.
  // Two halves, both in a real browser: an automated WCAG 2.2 AA scan in each of
  // the three distinct states this screen offers a reader (violations are usually
  // state-specific), and a keyboard-only sweep proving that search, all five
  // filters, sorting and changing pages can each be completed with no mouse at all,
  // with something visible marking where the focus is at every step. No fake clock
  // anywhere here — axe is never run under faked timers.
  test('the request list passes an automated WCAG 2.2 AA check and its search, filters, sorting and paging are completable with the keyboard alone', async ({
    page,
    context,
  }) => {
    const requests = manyTransactions(45);
    await openRequestList(page, context, requests);

    const search = searchField(page);
    const minimumAmount = boundField(page, MINIMUM_AMOUNT);
    const maximumAmount = boundField(page, MAXIMUM_AMOUNT);
    const earliestDate = boundField(page, EARLIEST_DATE);
    const latestDate = boundField(page, LATEST_DATE);
    const amount = sortableColumn(page, AMOUNT_COLUMN);
    const pageSize = pageSizeSelector(page);
    const nextPage = pageControl(page, NEXT_PAGE);
    const previousPage = pageControl(page, PREVIOUS_PAGE);

    // Everything this story and stories 2–3 put on the screen is present before
    // anything is scanned or swept — so a scan is never racing a skeleton, and a
    // missing control fails as "not on the screen" rather than as "not reachable".
    const everyControl = [
      { what: 'the search field', control: search },
      {
        what: 'the status filter',
        control: filterSelector(page, STATUS_FILTER),
      },
      {
        what: 'the originating-file filter',
        control: filterSelector(page, ORIGINATING_FILE_FILTER),
      },
      {
        what: 'the transaction-type filter',
        control: filterSelector(page, TRANSACTION_TYPE_FILTER),
      },
      { what: 'the minimum-amount bound', control: minimumAmount },
      { what: 'the maximum-amount bound', control: maximumAmount },
      { what: 'the earliest-date bound', control: earliestDate },
      { what: 'the latest-date bound', control: latestDate },
      { what: 'the amount column heading', control: amount.control },
      { what: 'the page-size selector', control: pageSize },
      { what: 'the previous-page control', control: previousPage },
      { what: 'the next-page control', control: nextPage },
    ];
    for (const { what, control } of everyControl) {
      await expect(control, `${what} must be on the screen`).toBeVisible();
    }

    // ---- Scan 1: as it lands, with a full page of requests and paging available.
    await expectNoAccessibilityViolations(page, 'as it lands');

    // ---- A visible focus indicator throughout: each control is reached by Tab, in
    // the order it appears, and must paint something different once it has focus.
    //
    // The walk skips the previous-page control on purpose. This is the first page, so
    // R12 has that control on screen and UNUSABLE — a disabled control takes no
    // focus and paints none, by design. It is reached and operated further down this
    // test, from page two, where it is usable.
    const keyboardWalk = everyControl.filter(
      ({ control }) => control !== previousPage,
    );
    const unfocused: string[] = [];
    const focused: string[] = [];
    for (const { control } of keyboardWalk) {
      unfocused.push(await focusPaintOf(control));
      await pressUntilFocused(page, 'Tab', control);
      focused.push(await focusPaintOf(control));
    }
    expect(
      keyboardWalk
        .filter(
          (_, index) =>
            focused[index] === 'none' || focused[index] === unfocused[index],
        )
        .map(({ what }) => what),
      'controls that paint no visible focus indicator when reached by keyboard (AC-6)',
    ).toEqual([]);

    // ---- Sorting from the keyboard: to the heading, then Enter twice for largest
    // first. Ordering by amount descending is the opposite of the order the mocked
    // service returned, so the list visibly re-orders.
    //
    // The walk moves BACKWARDS here (`Shift+Tab`) because the focus loop above left
    // the focus on the last control on the screen, and the column headings sit above
    // it. Every step below likewise walks in the direction the control lies, so the
    // sweep never depends on focus wrapping round the end of the document.
    const descending = byAmount(requests, 'descending');
    await pressUntilFocused(page, 'Shift+Tab', amount.control);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect
      .poll(() => referencesInOrder(page, requests), {
        message: 'sorting must be completable with the keyboard alone (AC-6)',
      })
      .toEqual(descending.slice(0, DEFAULT_PAGE_SIZE));

    // ---- Changing pages from the keyboard, forwards and back again.
    await pressUntilFocused(page, 'Tab', nextPage);
    await page.keyboard.press('Enter');
    await expect
      .poll(() => referencesInOrder(page, requests), {
        message:
          'moving to the next page must be completable by keyboard (AC-6)',
      })
      .toEqual(descending.slice(DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE * 2));

    // ---- Scan 2: ordered by a column, part-way through the pages — the sort
    // indicator and an active pagination state are both on screen.
    await expectNoAccessibilityViolations(
      page,
      'ordered by amount, on a later page',
    );

    await pressUntilFocused(page, 'Shift+Tab', previousPage);
    await page.keyboard.press('Enter');
    await expect
      .poll(() => referencesInOrder(page, requests), {
        message:
          'going back a page must be completable by keyboard as well (AC-6)',
      })
      .toEqual(descending.slice(0, DEFAULT_PAGE_SIZE));

    // ---- Searching from the keyboard: back up to the field and type. The term
    // matches exactly one request — on its reference and on its description; no
    // other served request matches it on ANY of the fields story 2's search covers
    // (file name, amount and the visible last four account digits included), so the
    // expectation below holds however wide that search is.
    const searched = requests.filter(
      (request) =>
        request.Reference.includes(SWEEP.searchTerm) ||
        request.Description.includes(SWEEP.searchTerm),
    );
    expect(
      searched,
      `the sweep's search term ${SWEEP.searchTerm} must match exactly one served request`,
    ).toHaveLength(1);

    await pressUntilFocused(page, 'Shift+Tab', search);
    await page.keyboard.type(SWEEP.searchTerm);
    await expect
      .poll(() => referencesInOrder(page, requests), {
        message: 'searching must be completable with the keyboard alone (AC-6)',
      })
      .toEqual(searched.map((request) => request.Reference));

    // Cleared again from the keyboard, so the filters below act on the whole set.
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await expect
      .poll(() => requestsOnPage(page, requests), {
        message:
          'clearing the search term from the keyboard must restore the list',
      })
      .toBe(DEFAULT_PAGE_SIZE);

    // ---- Each of the five filters, chosen with the keyboard alone. The three
    // pick-one filters are taken from their own option lists; both ends of both
    // ranges are reached by Tab and given a value.
    const [aRequest] = requests;
    await chooseByKeyboard(
      page,
      filterSelector(page, STATUS_FILTER),
      new RegExp(TRANSACTION_STATUS_IMPORTED, 'i'),
    );
    await expect(filterSelector(page, STATUS_FILTER)).toContainText(
      TRANSACTION_STATUS_IMPORTED,
    );

    await chooseByKeyboard(
      page,
      filterSelector(page, ORIGINATING_FILE_FILTER),
      new RegExp(aRequest.FileName.replace(/\./g, '\\.'), 'i'),
    );
    await expect(filterSelector(page, ORIGINATING_FILE_FILTER)).toContainText(
      aRequest.FileName,
    );

    await chooseByKeyboard(
      page,
      filterSelector(page, TRANSACTION_TYPE_FILTER),
      CREDIT_TYPE_CHOICE,
    );
    await expect(filterSelector(page, TRANSACTION_TYPE_FILTER)).toContainText(
      CREDIT_TYPE_CHOICE,
    );

    await enterByKeyboard(page, minimumAmount, SWEEP.minimumAmount);
    await enterByKeyboard(page, maximumAmount, SWEEP.maximumAmount);
    await enterByKeyboard(page, earliestDate, SWEEP.earliestDate);
    await enterByKeyboard(page, latestDate, SWEEP.latestDate);

    // What all five filters together leave, derived from the served data rather
    // than restated by hand: a credit, inside both bounds of both ranges.
    const dayOf = (transactionDate: string): string =>
      transactionDate.slice(0, SWEEP.earliestDate.length);
    const swept = requests.filter(
      (request) =>
        request.TransactionType === TRANSACTION_TYPE_CREDIT_CODE &&
        request.Amount >= Number(SWEEP.minimumAmount) &&
        request.Amount <= Number(SWEEP.maximumAmount) &&
        dayOf(request.TransactionDate) >= SWEEP.earliestDate &&
        dayOf(request.TransactionDate) <= SWEEP.latestDate,
    );
    expect(
      swept,
      "the sweep's five filters must leave exactly one served request, or the keyboard journey below proves nothing",
    ).toHaveLength(1);

    await expect
      .poll(() => referencesInOrder(page, requests), {
        message:
          'every one of the five filters must be completable with the keyboard alone (AC-6)',
      })
      .toEqual(byAmount(swept, 'descending'));

    // ---- Scan 3: narrowed until everything fits one page, so the page controls
    // are on screen and unusable (R12) — a state whose contrast and focus handling
    // jsdom cannot see at all.
    await expect(nextPage).toBeVisible();
    await expect(previousPage).toBeVisible();
    await expectNoAccessibilityViolations(
      page,
      'narrowed by search-and-filters until one page holds everything',
    );
  });
});
