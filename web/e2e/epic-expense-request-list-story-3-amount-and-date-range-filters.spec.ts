/**
 * Story Metadata:
 * - Epic: expense-request-list — The shared expense request list
 * - Story: 3 — Filter by amount range and date range
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R3, R7, R10, R18
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-1 (a lower bound alone narrows to the requests at or above it), AC-2 (an
 *   upper bound alone narrows to those at or below it), AC-3 (both bounds, with a
 *   request sitting exactly ON either bound included — including the last day of a
 *   date range against a stored value that carries a time of day) and AC-5 (the two
 *   ranges narrow alongside the search term and the other filters, show in the
 *   summary of what is applied, and go away with clear-all) → this file.
 * - AC-4 (an upper bound below the lower bound is reported and NOT applied) and
 *   AC-6 (amounts compared as numbers, dates chronologically) → the Vitest layer at
 *   `web/src/__tests__/integration/epic-expense-request-list-story-3-amount-and-date-range-filters.test.tsx`.
 *   Deliberately NOT duplicated here.
 * - No axe scan and no keyboard sweep here: this epic's single real-browser
 *   accessibility check and its keyboard-completability sweep are story 4's AC-6,
 *   which runs on the finished screen — this story's bound inputs are on it by then,
 *   which is exactly why they must be typeable rather than calendar-popover-only.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running locally. Both boundaries were
 * established by epic 1 and by the expense-file-upload epic; this spec reuses their
 * helpers rather than adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`,
 *    started by `globalSetup` and wired in by `playwright.config.ts`. Every
 *    protected screen is gated SERVER-side (`(authenticated)/layout.tsx` →
 *    `requireSession()` → `GET /v1/auth/userinfo` from inside the Next.js process),
 *    and `page.route()` cannot see a fetch the browser never makes. The stub answers
 *    that call from the shared identity source, keyed off the `session` cookie value
 *    seeded below.
 * 2. Browser boundary → `page.route()` (below), for this screen's one read:
 *    `GET /transactions-api/v1/transactions` (story 1's single fetch of the whole
 *    set — the endpoint takes no query parameters). `/transactions-api/...` is the
 *    app's OWN same-origin mount point, so an unmocked read is forwarded to the live
 *    transactions service by the app's route handler from inside the Next.js
 *    process, where `blockLiveBackends` cannot see it — hence it is mocked in every
 *    test here.
 *
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by
 *   driving the sign-in form — epic 1 story 2's spec owns that journey, and the
 *   cookie is the app's sole conveyance of session. Cookies ignore port, so one seed
 *   serves the dev server (:3000) and the epic-end production run (:3100).
 * - Every response body comes from the project-wide factories under
 *   `web/src/mocks/data/` (`userInfoFor(role)`, `transactionsForNarrowing()`,
 *   `transactionListResponse()`); no response shape and no request VALUES are
 *   authored in this file, so this spec and the Vitest layer cannot drift on either
 *   the contract or the data. `transactionsForNarrowing()` was built for exactly
 *   these cases: amounts sitting ON 100 and ON 200, a 9.99 row, a request from an
 *   earlier year, and a request stored as `2026-04-15 15:00:00` — the last-day-of-
 *   the-range casualty AC-3 turns on.
 * - The role is the Importer. Both roles read this list identically (brief R20) and
 *   story 1's specs own the role coverage; narrowing behaves the same for either, so
 *   it is not re-walked per role here.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - The transaction list is read from the BROWSER through the shared API client at
 *   the app's own same-origin `/transactions-api/...` address (story 1
 *   §Infrastructure reuse notes), i.e. from a client component, and all narrowing is
 *   in memory over that one fetched set. `page.route()` cannot intercept a fetch made
 *   by the Next.js server or by a Server Action — if this read moves server-side,
 *   this spec's mock is bypassed and the request leaves for the real service.
 * - The four bound controls are TYPEABLE fields (Shadcn `input`), each with a real
 *   accessible label — they are driven with `fill()` below, never through a calendar
 *   popover. Story 4's keyboard sweep needs the same thing, and a placeholder-only
 *   field would fail its axe scan. The labels this spec finds them by:
 *   minimum amount → matches `/minimum amount|amount from/i`;
 *   maximum amount → matches `/maximum amount|amount to/i`;
 *   earliest date  → matches `/earliest|date from/i`;
 *   latest date    → matches `/latest|date to/i`.
 * - The date bounds are typed, and accepted, as `YYYY-MM-DD` (what `fill()` sends to
 *   both a `type="date"` input and a plain text one). The day bound covers the whole
 *   day: a request stored with a time of day on the latest day is INSIDE the range.
 * - Emptying a bound field (`fill('')`) removes that bound — the range reverts to
 *   open at that end rather than being treated as 0 / the epoch.
 * - The summary of what is currently applied (story 2's R7/R18 surface, which this
 *   story joins rather than duplicating) ECHOES each applied bound as text on the
 *   screen. That is what the AC-5 assertions read: an `<input>`'s value is not text
 *   content, and the values chosen there appear in no surviving row, so only the
 *   summary can supply them.
 * - Clear-all is a button reading "Clear all" (story 2's R10/R18 action). It empties
 *   the search term and every filter, including both ranges, in one activation.
 * - Each request occupies a table row with its `Reference` in its own cell (story 1's
 *   columns). Rows are found by reference — never by position — because story 4 adds
 *   sorting, which changes the order.
 * - No `role="alert"` / `role="status"` query appears in this file, so the Next.js
 *   route announcer (a permanently empty body-level `role="alert"`) is not in play;
 *   were one added it would have to be scoped, e.g.
 *   `getByRole('main').getByRole('alert')`.
 * - Cookie assumptions: the mock `session` cookie carries production-like attributes
 *   (HttpOnly, SameSite=Strict). `Secure` is omitted because the E2E server is plain
 *   http on localhost; the real cookie's full attribute set is asserted in the Vitest
 *   layer (epic 1, story 1).
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — `/requests` is
 * still `notFound()`, and stories 1 and 2 have to land the list and its narrowing
 * layer before the bound fields these tests type into exist at all.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  TRANSACTION_STATUS_IMPORTED,
  transactionListResponse,
  transactionsForNarrowing,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** This story's screen. */
const REQUESTS_PATH = '/requests';

/**
 * The whole set the mocked service returns — the project-wide narrowing spread, used
 * as-is. Every expectation below is expressed in terms of these rows, so no amount
 * and no date is ever retyped in this file.
 */
const LISTED_REQUESTS = transactionsForNarrowing();

/**
 * One row of that set, by its reference. Throws (rather than yielding `undefined`)
 * if the factory ever stops carrying it, so a fixture change fails loudly here
 * instead of quietly turning an expectation below into an empty one.
 */
const requestReferenced = (reference: string): TransactionRead => {
  const found = LISTED_REQUESTS.find(
    (request) => request.Reference === reference,
  );
  if (!found) {
    throw new Error(
      `transactionsForNarrowing() no longer contains "${reference}". This spec's ` +
        `bounds are chosen against that fixture's amounts and dates — update both ` +
        `together (web/src/mocks/data/transaction.ts).`,
    );
  }
  return found;
};

/**
 * The eight requests, named for the part each one plays in these four criteria. The
 * comment on each is the factory's own data, quoted for the reader — the values used
 * in the assertions come from the objects themselves.
 */
/** 2026-04-01 08:12 · 15 750 · Imported — the largest amount, the earliest 2026 day. */
const SALARY_APRIL_1 = requestReferenced('TXN-20260401-0001');
/** 2026-04-15 08:34 · 487.32 · Imported. */
const WOOLWORTHS_APRIL_15 = requestReferenced('TXN-20260415-0002');
/** 2026-04-15 11:03 · 100 · Approved — sits exactly ON the lower amount bound. */
const BANK_CHARGES_ON_100 = requestReferenced('TXN-20260415-0007');
/**
 * 2026-04-15 15:00 · 189 · Imported — the row AC-3 turns on: its stored value carries
 * a TIME OF DAY on what is the latest day of the date range, so an upper bound
 * compared as an instant rather than as a whole day silently drops it.
 */
const UBER_EATS_LAST_DAY_AT_1500 = requestReferenced('TXN-20260430-0011');
/** 2026-04-30 13:49 · 200 · Rejected — sits exactly ON the upper amount bound. */
const NETFLIX_ON_200 = requestReferenced('TXN-20260430-0012');
/** 2026-04-30 15:47 · 8 750 · Approved. */
const EFT_RECEIVED_8750 = requestReferenced('TXN-20260430-0016');
/** 2025-11-20 09:05 · 650 · Imported — the only request from an earlier year. */
const FUEL_LAST_YEAR = requestReferenced('TXN-20251120-0003');
/** 2026-04-30 17:45 · 9.99 · Imported — the row a TEXT comparison would misplace. */
const SPAR_9_99 = requestReferenced('TXN-20260430-0020');

/**
 * The bounds these tests type in, as the user types them. Kept together so the
 * relationship between each bound and the fixture rows above is readable in one
 * place, and reused by the summary assertions in AC-5.
 */
const AMOUNT_BOUND_BELOW_THE_TOP_THREE = '500';
const AMOUNT_LOWER_BOUND_ON_A_REQUEST = '100';
const AMOUNT_UPPER_BOUND_ON_A_REQUEST = '200';
const DATE_ON_THE_EARLIEST_2026_REQUEST = '2026-04-01';
const DATE_AFTER_THE_15TH_BEFORE_THE_30TH = '2026-04-20';
const DATE_OF_THE_TIME_OF_DAY_REQUEST = '2026-04-15';
const DATE_JUST_AFTER_THE_FIRST = '2026-04-02';

/**
 * How each control reads to a user. Two spellings each, because "minimum amount" and
 * "amount from" are both natural for the same field and the wording is the
 * developer's; the story fixes only that the field is typeable and labelled.
 */
const SEARCH_LABEL = /search/i;
const MINIMUM_AMOUNT_LABEL = /minimum amount|amount from/i;
const MAXIMUM_AMOUNT_LABEL = /maximum amount|amount to/i;
const EARLIEST_DATE_LABEL = /earliest|date from/i;
const LATEST_DATE_LABEL = /latest|date to/i;
const STATUS_FILTER_LABEL = /status/i;
const CLEAR_ALL_ACTION = /clear all/i;

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * Blocks the live services (see LIVE_BACKEND_ORIGINS). Registered LAST, because
 * Playwright matches the most recently registered route first: that way a call sent
 * to a service's own origin is aborted and fails visibly, instead of being quietly
 * answered by the origin-agnostic mocks above it.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Puts the browser in a signed-in state as the named role, without a real
 * credential: the mock `session` cookie the Node-side auth stub maps back to this
 * role when the server-side gate asks it who the session belongs to.
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
 * Answers a BROWSER-side identity read from the shared userinfo source, so it can
 * never disagree with what the Node-side stub returns for the same session.
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

/**
 * Answers story 1's single read of the whole transaction set with the shared
 * envelope factory. The glob names no origin, so it matches whichever port the app
 * is served on (:3000 in dev, :3100 in the epic-end production run). Every test
 * gets the SAME body: nothing below re-fetches, because all narrowing is in memory.
 */
const mockTransactionList = async (page: Page): Promise<void> => {
  await page.route('**/transactions-api/v1/transactions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(transactionListResponse(LISTED_REQUESTS)),
    }),
  );
};

/** The screen's own content, inside epic 1's signed-in shell. */
const requestsScreen = (page: Page): Locator => page.getByRole('main');

/**
 * The listed requests: the table's DATA rows only. Filtering on "has a `cell`" is
 * what separates them from the heading row, whose children are `columnheader`s — no
 * index arithmetic and no reliance on the heading being first. The same locator
 * story 2's spec uses, deliberately, so the two specs cannot pin different shapes on
 * the one list they share.
 */
const listedRequestRows = (page: Page): Locator =>
  requestsScreen(page)
    .getByRole('row')
    .filter({ has: page.getByRole('cell') });

/**
 * One request's row, found by its own reference — never by position, because story 4
 * adds sorting and the order is not this story's contract.
 */
const listedRequest = (page: Page, request: TransactionRead): Locator =>
  listedRequestRows(page).filter({ hasText: request.Reference });

const searchField = (page: Page): Locator =>
  requestsScreen(page).getByLabel(SEARCH_LABEL);
const minimumAmountField = (page: Page): Locator =>
  requestsScreen(page).getByLabel(MINIMUM_AMOUNT_LABEL);
const maximumAmountField = (page: Page): Locator =>
  requestsScreen(page).getByLabel(MAXIMUM_AMOUNT_LABEL);
const earliestDateField = (page: Page): Locator =>
  requestsScreen(page).getByLabel(EARLIEST_DATE_LABEL);
const latestDateField = (page: Page): Locator =>
  requestsScreen(page).getByLabel(LATEST_DATE_LABEL);

/**
 * Chooses a value in one of story 2's pick-one filters. A Shadcn `select` (Radix)
 * exposes its trigger as a `combobox` and portals its options out of `main`, which
 * is why the option is looked for on the page rather than inside the list.
 */
const chooseStatus = async (page: Page, status: string): Promise<void> => {
  await requestsScreen(page)
    .getByRole('combobox', { name: STATUS_FILTER_LABEL })
    .click();
  await page.getByRole('option', { name: status }).click();
};

/**
 * Asserts the listed requests are EXACTLY the ones expected: each one on screen,
 * every other row of the fetched set gone, and the total matching — so a narrowing
 * that quietly emptied the list, or one that left an extra row behind, both fail.
 */
const expectExactlyTheseRequests = async (
  page: Page,
  expected: TransactionRead[],
): Promise<void> => {
  const expectedReferences = expected.map((request) => request.Reference);
  const excluded = LISTED_REQUESTS.filter(
    (request) => !expectedReferences.includes(request.Reference),
  );

  for (const request of expected) {
    await expect(
      listedRequest(page, request),
      `${request.Reference} (${String(request.Amount)}, ${request.TransactionDate}) is inside the applied range and must stay listed`,
    ).toBeVisible();
  }
  for (const request of excluded) {
    await expect(
      listedRequest(page, request),
      `${request.Reference} (${String(request.Amount)}, ${request.TransactionDate}) is outside the applied range and must not be listed`,
    ).toHaveCount(0);
  }
  await expect(
    listedRequestRows(page),
    'the list must show exactly the requests inside the applied narrowing, and nothing else',
  ).toHaveCount(expected.length);
};

/**
 * Signs in as an Importer, mocks both boundaries, opens the list and waits for the
 * whole fetched set to be on screen — the state every test below starts narrowing
 * from, and the baseline that proves a later assertion is narrowing rather than
 * looking at a list that never arrived.
 */
const openRequestList = async (
  page: Page,
  context: BrowserContext,
): Promise<void> => {
  await seedSession(context, ROLE_IMPORTER);
  await mockBrowserIdentityCall(page, ROLE_IMPORTER);
  await mockTransactionList(page);
  await blockLiveBackends(page);

  await page.goto(REQUESTS_PATH);
  await expectExactlyTheseRequests(page, LISTED_REQUESTS);
};

test.describe('Epic expense-request-list, Story 3: filter by amount range and date range', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-1
  // A LOWER bound on its own, for both kinds of range, with the other end left open:
  // the amount bound keeps everything above it however large, and the date bound
  // keeps everything after it however late.
  test('a minimum amount alone, and an earliest date alone, each narrow the list to the requests at or above that bound', async ({
    page,
    context,
  }) => {
    await openRequestList(page, context);

    // A minimum amount of 500 — nothing else applied, so the top end stays open and
    // the 15 750 request is as welcome as the 650 one.
    await minimumAmountField(page).fill(AMOUNT_BOUND_BELOW_THE_TOP_THREE);
    await expectExactlyTheseRequests(page, [
      SALARY_APRIL_1,
      EFT_RECEIVED_8750,
      FUEL_LAST_YEAR,
    ]);

    // Emptying the field removes the bound rather than applying a zero, so the whole
    // set comes back — which is also what makes the date half below a clean read.
    await minimumAmountField(page).fill('');
    await expectExactlyTheseRequests(page, LISTED_REQUESTS);

    // An earliest date of 2026-04-01 — again nothing else applied, so the late end
    // stays open and every 2026 request stays, including the ones on the 30th. Only
    // last year's request falls before the bound. The request stored at 08:12 ON that
    // day is at the bound and stays.
    await earliestDateField(page).fill(DATE_ON_THE_EARLIEST_2026_REQUEST);
    await expectExactlyTheseRequests(
      page,
      LISTED_REQUESTS.filter(
        (request) => request.Reference !== FUEL_LAST_YEAR.Reference,
      ),
    );
  });

  // AC-2
  // An UPPER bound on its own, for both kinds of range, with the other end left open.
  test('a maximum amount alone, and a latest date alone, each narrow the list to the requests at or below that bound', async ({
    page,
    context,
  }) => {
    await openRequestList(page, context);

    // A maximum amount of 500 — the bottom end stays open, so the smallest request
    // (9.99) is kept and only the three larger than 500 go.
    await maximumAmountField(page).fill(AMOUNT_BOUND_BELOW_THE_TOP_THREE);
    await expectExactlyTheseRequests(page, [
      WOOLWORTHS_APRIL_15,
      BANK_CHARGES_ON_100,
      UBER_EATS_LAST_DAY_AT_1500,
      NETFLIX_ON_200,
      SPAR_9_99,
    ]);

    await maximumAmountField(page).fill('');
    await expectExactlyTheseRequests(page, LISTED_REQUESTS);

    // A latest date of 2026-04-20 — the early end stays open, so last year's request
    // is kept, and only the three from the 30th fall after the bound.
    await latestDateField(page).fill(DATE_AFTER_THE_15TH_BEFORE_THE_30TH);
    await expectExactlyTheseRequests(page, [
      SALARY_APRIL_1,
      WOOLWORTHS_APRIL_15,
      BANK_CHARGES_ON_100,
      UBER_EATS_LAST_DAY_AT_1500,
      FUEL_LAST_YEAR,
    ]);
  });

  // AC-3
  // BOTH bounds, and inclusivity at each end — the highest-value assertions in this
  // spec. Two of the three amount survivors sit exactly ON a bound, and the date half
  // pins the brief's known exposure: a request the service stored as
  // "2026-04-15 15:00:00" is INSIDE a range whose latest day is 2026-04-15.
  test('both bounds together keep the requests inside the range, including one exactly on a bound and one stored with a time of day on the last day', async ({
    page,
    context,
  }) => {
    await openRequestList(page, context);

    // Amount 100 to 200: the request AT 100 and the request AT 200 are both inside,
    // along with the 189 between them. An exclusive comparison at either end drops a
    // boundary request and fails here.
    await minimumAmountField(page).fill(AMOUNT_LOWER_BOUND_ON_A_REQUEST);
    await maximumAmountField(page).fill(AMOUNT_UPPER_BOUND_ON_A_REQUEST);
    await expectExactlyTheseRequests(page, [
      BANK_CHARGES_ON_100,
      UBER_EATS_LAST_DAY_AT_1500,
      NETFLIX_ON_200,
    ]);

    await minimumAmountField(page).fill('');
    await maximumAmountField(page).fill('');
    await expectExactlyTheseRequests(page, LISTED_REQUESTS);

    // A single-day range: earliest and latest both 2026-04-15. All three requests
    // dated that day are inside it — 08:34, 11:03, and the 15:00 one, which is the
    // last-day casualty the epic carries as an unverified assumption. A latest bound
    // read as the instant midnight-on-the-15th silently drops all three; one read as
    // the start of the day drops the 15:00 request only. Both fail here.
    await earliestDateField(page).fill(DATE_OF_THE_TIME_OF_DAY_REQUEST);
    await latestDateField(page).fill(DATE_OF_THE_TIME_OF_DAY_REQUEST);
    await expectExactlyTheseRequests(page, [
      WOOLWORTHS_APRIL_15,
      BANK_CHARGES_ON_100,
      UBER_EATS_LAST_DAY_AT_1500,
    ]);
  });

  // AC-5
  // The two ranges as part of the one narrowing layer: they narrow cumulatively with
  // the search term and a pick-one filter, they appear in the summary of what is
  // applied, and clear-all takes them away with everything else.
  test('the amount and date ranges narrow alongside the search term and the status filter, show in the summary of what is applied, and are removed by clear-all', async ({
    page,
    context,
  }) => {
    await openRequestList(page, context);

    // 1. The search term alone: the four requests that came from the 30 April file
    // (search covers the originating file name).
    await searchField(page).fill(SPAR_9_99.FileName);
    await expectExactlyTheseRequests(page, [
      UBER_EATS_LAST_DAY_AT_1500,
      NETFLIX_ON_200,
      EFT_RECEIVED_8750,
      SPAR_9_99,
    ]);

    // 2. ...plus an amount range of 100 to 200, which narrows those four further
    // without discarding the search: the 8 750 and the 9.99 requests go.
    await minimumAmountField(page).fill(AMOUNT_LOWER_BOUND_ON_A_REQUEST);
    await maximumAmountField(page).fill(AMOUNT_UPPER_BOUND_ON_A_REQUEST);
    await expectExactlyTheseRequests(page, [
      UBER_EATS_LAST_DAY_AT_1500,
      NETFLIX_ON_200,
    ]);

    // 3. ...plus a status: the rejected one of the two goes, leaving the imported one.
    await chooseStatus(page, TRANSACTION_STATUS_IMPORTED);
    await expectExactlyTheseRequests(page, [UBER_EATS_LAST_DAY_AT_1500]);

    // 4. ...plus a date range that the survivor falls inside. It must still be there:
    // a fourth narrowing applied on top of the other three must neither reset them nor
    // wrongly exclude a request that is within it — and this survivor is the one stored
    // with a time of day, so an over-eager comparison empties the list here.
    await earliestDateField(page).fill(DATE_JUST_AFTER_THE_FIRST);
    await latestDateField(page).fill(DATE_AFTER_THE_15TH_BEFORE_THE_30TH);
    await expectExactlyTheseRequests(page, [UBER_EATS_LAST_DAY_AT_1500]);

    // Both ranges are named in the summary of what is currently applied. These four
    // values can only have come from that summary: an `<input>`'s value is not text
    // content, and none of them appears anywhere in the one surviving row (189 · ZAR ·
    // 2026-04-15 15:00:00 · account ending 7781 · Uber Eats lunch).
    const screen = requestsScreen(page);
    await expect(
      screen,
      'the applied amount range must be visible on the screen, not only in the fields',
    ).toContainText(AMOUNT_LOWER_BOUND_ON_A_REQUEST);
    await expect(screen).toContainText(AMOUNT_UPPER_BOUND_ON_A_REQUEST);
    await expect(
      screen,
      'the applied date range must be visible on the screen, not only in the fields',
    ).toContainText(DATE_JUST_AFTER_THE_FIRST);
    await expect(screen).toContainText(DATE_AFTER_THE_15TH_BEFORE_THE_30TH);

    // Clear-all: one activation empties both ranges along with the search term and the
    // status, and the whole fetched set is back.
    await screen.getByRole('button', { name: CLEAR_ALL_ACTION }).click();

    await expectExactlyTheseRequests(page, LISTED_REQUESTS);
    await expect(searchField(page)).toHaveValue('');
    await expect(minimumAmountField(page)).toHaveValue('');
    await expect(maximumAmountField(page)).toHaveValue('');
    await expect(earliestDateField(page)).toHaveValue('');
    await expect(latestDateField(page)).toHaveValue('');
  });
});
