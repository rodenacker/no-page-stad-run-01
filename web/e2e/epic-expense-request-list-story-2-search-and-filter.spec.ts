/**
 * Story Metadata:
 * - Epic: expense-request-list — The shared expense request list
 * - Story: 2 — Search and filter the request list
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R2, R3, R6, R7, R10, R18
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-1 (a term narrows the list; clearing it restores every request), AC-2 (status,
 *   originating file and transaction type each narrow, and combine cumulatively) and
 *   AC-5 (clear-all drops the term AND every filter at once) → this file.
 * - AC-3 (the applied narrowing stays visibly indicated), AC-4 (the narrowed-empty
 *   state names what is applied, offers clear-all, and withholds the upload action)
 *   and AC-6 (the choices offered are the values present in the fetched set, typed
 *   values translated where known and verbatim where not) → the Vitest layer,
 *   `web/src/__tests__/integration/epic-expense-request-list-story-2-search-and-filter.test.tsx`.
 *   Deliberately NOT duplicated here (testing-policy.md § "one tag, one layer").
 * - This epic's single real-browser accessibility scan and its keyboard sweep belong
 *   to story 4 (AC-6), so nothing here re-scans.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * (testing-policy.md § "Playwright runs against mocks, never live") — even though
 * project.md records both real services as running on this machine. This screen
 * crosses BOTH mock boundaries, and epic 1 already established each one; this spec
 * reuses them rather than adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. `/requests` is gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` below, for this screen's one read
 *    (`GET /transactions-api/v1/transactions`) plus the identity call in case a client
 *    component reads it, and a hard block on the real services' own origins
 *    (:4424 / :4423) so no browser-side call can leak to a live backend even if the
 *    app were pointed at the wrong address.
 *
 * Every response body comes from the project-wide factories in `web/src/mocks/data/`
 * (`transactionsForNarrowing()`, `transactionListResponse()`, `userInfoFor(role)`) —
 * no response shape and no request row is authored in this file, so this spec and the
 * Vitest layer cannot drift on the contract. `transactionsForNarrowing()` exists for
 * exactly this story: eight distinct requests spread across all three statuses, three
 * originating files and three transaction-type values (both known codes plus one the
 * app has no translation for), with no two rows sharing the duplicate key.
 *
 * Implementation patterns this spec assumes (read before implementing):
 * - The request list is read FROM THE BROWSER — the shared API client against the
 *   app's own same-origin `/transactions-api/...` mount point (story 1
 *   §Infrastructure reuse notes). `page.route()` cannot intercept a read issued by
 *   the Next.js server or a Server Action, so a server-side fetch would bypass these
 *   mocks and leave for the real transactions service.
 * - ALL narrowing happens in the browser over that ONE fetched set:
 *   `GET /v1/transactions` accepts no query parameters (brief §Notes & Caveats). The
 *   filter test below asserts that no read carries a query string at all, so a
 *   server-side search/filter attempt fails visibly rather than silently.
 * - The list renders as a table (Shadcn `table` — story 1), so each request is a
 *   `row` and rows are addressed by the request's own `Reference`, never by position.
 * - The three filters are Shadcn `select` (Radix), never a native `<select>` (story
 *   §Infrastructure reuse notes) — so they are driven here by clicking the trigger
 *   and picking an `option`, not by `selectOption`.
 * - **Each filter trigger must carry an accessible name that says WHICH field it
 *   filters** — an `aria-label` / `aria-labelledby` such as "Status", "Originating
 *   file", "Transaction type". A Radix `SelectTrigger` is a button, so without one
 *   its accessible name is whatever it currently displays (the placeholder, then the
 *   selected value), leaving the control unnamed for assistive tech and unaddressable
 *   here. The search field likewise needs a label naming it (a visible `<label>` or
 *   an `aria-label` containing "search").
 * - Clear-all is offered whenever narrowing is active, not only from the
 *   narrowed-empty state: R18 requires that clearing an active narrowing restores the
 *   whole set, and AC-5 is exercised below from a narrowed but NON-empty list. One
 *   clear-all beside the applied-narrowing summary satisfies both this and AC-4.
 * - The screen lives inside epic 1's signed-in shell, so its content is within `main`
 *   and every query here is scoped to it — Next.js also renders a permanently empty
 *   body-level `role="alert"` route announcer outside `main`.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie (epic 1
 * BR2), seeded directly rather than by driving the sign-in form — epic 1's story 2
 * spec owns that journey. Cookies ignore port, so one seed serves the dev server
 * (:3000) and the epic-end production run (:3100). `Secure` is omitted because the
 * E2E server is plain http on localhost; the real cookie's full attribute set is
 * asserted in the Vitest layer (epic 1, story 1).
 *
 * TIMING — nothing here waits real time. The search is debounced by design (story
 * §Notes: the interval is the implementation's choice), so every assertion below is
 * web-first (`toHaveCount` / `toBeVisible`) and waits for the narrowed result on its
 * own. No `waitForTimeout`, and no test-only debounce override in production code.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — `/requests` has no
 * search field or filters yet, and until story 1 ships it has no list at all.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_TYPE_CREDIT_CODE,
  transactionListResponse,
  transactionsForNarrowing,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** The shared request list screen this epic builds (story metadata Route). */
const REQUESTS_ROUTE = '/requests';

/**
 * This screen's one read, as the BROWSER addresses it: the app's own
 * `/transactions-api/*` mount point (`web/src/lib/utils/constants.ts`), never the
 * transactions service's origin. The glob names no origin, so it matches whichever
 * port the app is served on (:3000 in dev, :3100 in the epic-end production run), and
 * the trailing `**` means a read that wrongly carried a query string is still
 * intercepted — so the "no query parameters" check below can catch it instead of the
 * call escaping to a live service.
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
 * The whole fetched set for every test here — the shared narrowing fixture, built for
 * this story (see the Mocking strategy above). Every expectation below is DERIVED from
 * it, so the spec cannot disagree with the Vitest layer about what the service sent.
 */
const ALL_REQUESTS = transactionsForNarrowing();

/**
 * One request from the shared fixture, or a loud failure. Used instead of hard-coded
 * references so that a change to the factory breaks this spec with an explanation
 * rather than silently changing what is being asserted.
 */
const requireRequest = (
  matches: (request: TransactionRead) => boolean,
  described: string,
): TransactionRead => {
  const found = ALL_REQUESTS.find(matches);
  if (!found) {
    throw new Error(
      `transactionsForNarrowing() no longer contains ${described}. This spec derives ` +
        'every expectation from that shared factory ' +
        '(web/src/mocks/data/transaction.ts) — adjust the journey below rather than ' +
        'authoring request rows in this file.',
    );
  }
  return found;
};

/* -------------------------------------------------------------------------- */
/* AC-1 — what the search test types, and what it must and must not match.    */
/* -------------------------------------------------------------------------- */

/**
 * A word from one request's description. Verified against the fixture: it occurs in
 * exactly one row's description and in none of the other searchable fields
 * (`Reference`, `FileName`, `Amount`, the visible last four account digits), so a
 * search for it must leave exactly one request on screen.
 */
const SEARCH_TERM = 'Woolworths';

const SEARCHED_REQUEST = requireRequest(
  (request) => request.Description.includes(SEARCH_TERM),
  `a request whose description contains "${SEARCH_TERM}"`,
);

/** A request the term does not match, so its disappearance is provable. */
const REQUEST_OUTSIDE_SEARCH = requireRequest(
  (request) => !request.Description.includes(SEARCH_TERM),
  'a request whose description does not contain the search term',
);

if (
  ALL_REQUESTS.filter((request) => request.Description.includes(SEARCH_TERM))
    .length !== 1
) {
  throw new Error(
    `"${SEARCH_TERM}" no longer matches exactly one request in ` +
      'transactionsForNarrowing(), so the single-row expectation in the search test ' +
      'below is no longer right. Pick a term unique to one row.',
  );
}

/**
 * The part of that request's account number the screen DOES show (the last four
 * digits) and the part the masking hides. Searching the visible digits must find the
 * request; searching the hidden part must find nothing — matching against the unmasked
 * value would be a way around the masking POPIA requires, since a searcher could
 * confirm a guessed number without ever revealing it (story §Technical summary,
 * project.md §Compliance).
 */
const SEARCHED_LAST_FOUR = SEARCHED_REQUEST.AccountNumber.slice(-4);
const SEARCHED_ACCOUNT_HIDDEN_PART = SEARCHED_REQUEST.AccountNumber.slice(
  0,
  -4,
).replace(/\D+$/, '');

/* -------------------------------------------------------------------------- */
/* AC-2 — the three-step filter journey, derived from the shared fixture.     */
/* -------------------------------------------------------------------------- */

/**
 * The one request left standing once all three filters are applied: an imported
 * request of the credit type. Its own status, file name and type ARE the three values
 * chosen below, so the journey needs no hand-written filter values.
 */
const TARGET_REQUEST = requireRequest(
  (request) =>
    request.Status === TRANSACTION_STATUS_IMPORTED &&
    request.TransactionType === TRANSACTION_TYPE_CREDIT_CODE,
  'an imported request of the credit transaction type',
);

/** What must remain visible after each successive filter is added. */
const BY_STATUS = ALL_REQUESTS.filter(
  (request) => request.Status === TARGET_REQUEST.Status,
);
const BY_STATUS_AND_FILE = BY_STATUS.filter(
  (request) => request.FileName === TARGET_REQUEST.FileName,
);
const BY_STATUS_FILE_AND_TYPE = BY_STATUS_AND_FILE.filter(
  (request) => request.TransactionType === TARGET_REQUEST.TransactionType,
);

/** One excluded request per step, so "cumulatively" is proved, not assumed. */
const REQUEST_IN_ANOTHER_STATUS = requireRequest(
  (request) => request.Status !== TARGET_REQUEST.Status,
  'a request in a status other than the filtered one',
);
const REQUEST_FROM_ANOTHER_FILE = requireRequest(
  (request) =>
    request.Status === TARGET_REQUEST.Status &&
    request.FileName !== TARGET_REQUEST.FileName,
  'a request in the filtered status from a different originating file',
);
const REQUEST_OF_ANOTHER_TYPE = requireRequest(
  (request) =>
    request.Status === TARGET_REQUEST.Status &&
    request.FileName === TARGET_REQUEST.FileName &&
    request.TransactionType !== TARGET_REQUEST.TransactionType,
  'a request in the filtered status and file but of a different transaction type',
);

if (
  !(
    BY_STATUS_FILE_AND_TYPE.length > 0 &&
    BY_STATUS_FILE_AND_TYPE.length < BY_STATUS_AND_FILE.length &&
    BY_STATUS_AND_FILE.length < BY_STATUS.length &&
    BY_STATUS.length < ALL_REQUESTS.length
  )
) {
  throw new Error(
    'The filter journey in this spec relies on each of the three filters strictly ' +
      'narrowing the set (currently ' +
      `${String(ALL_REQUESTS.length)} → ${String(BY_STATUS.length)} → ` +
      `${String(BY_STATUS_AND_FILE.length)} → ${String(BY_STATUS_FILE_AND_TYPE.length)}) ` +
      'and ending on at least one request. transactionsForNarrowing() no longer ' +
      'gives that, so a step would prove nothing — choose different filter values.',
  );
}

/**
 * How the credit type is picked from the type filter's options. Matched by regex
 * rather than by the exact label because the plain-language wording is story 1's
 * decision (AC-6 / brief R1 own it, e.g. "Credit — money in"); the app renders the
 * `C` code under a credit label, and every other type value in this fixture is a
 * debit one, so this matches exactly one option whatever the final wording is.
 */
const CREDIT_TYPE_OPTION = /credit/i;

/* -------------------------------------------------------------------------- */
/* Mock plumbing (the two boundaries described in the header).                 */
/* -------------------------------------------------------------------------- */

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

/** What the mocked transactions endpoint has been asked for, in order. */
interface TransactionListFeed {
  /** Every transaction-list URL the browser has requested. */
  urls: string[];
}

/**
 * Serves the whole fetched set on every read, and records the URLs asked for.
 *
 * The body never changes: this story narrows in memory, so a second read returning
 * something different would hide the very thing under test. The recorded URLs are how
 * the filter test proves the narrowing stayed client-side.
 */
const serveTransactions = async (
  page: Page,
  served: TransactionRead[] = ALL_REQUESTS,
): Promise<TransactionListFeed> => {
  const urls: string[] = [];

  await page.route(TRANSACTIONS_URL_GLOB, (route) => {
    urls.push(route.request().url());
    return route.fulfill(jsonResponse(transactionListResponse(served)));
  });

  return { urls };
};

/**
 * Puts the browser in a signed-in state without driving the sign-in form and without
 * any real credential: the mock `session` cookie the Node-side stub recognises for
 * this role.
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
 * Signs in as an Importer, mocks both boundaries and opens the list screen. Both
 * roles read the same list (brief R20) and narrowing is not role-specific, so one
 * role is enough here — the role-reachability criteria are story 1's.
 */
const openRequestList = async (
  page: Page,
  context: BrowserContext,
): Promise<TransactionListFeed> => {
  await blockLiveBackends(page);
  await mockBrowserIdentityCall(page, ROLE_IMPORTER);
  const feed = await serveTransactions(page);
  await seedSession(context, ROLE_IMPORTER);

  await page.goto(REQUESTS_ROUTE);

  return feed;
};

/* -------------------------------------------------------------------------- */
/* Locators.                                                                  */
/* -------------------------------------------------------------------------- */

/** The screen's own content, inside epic 1's signed-in shell. */
const requestsScreen = (page: Page): Locator => page.getByRole('main');

/**
 * The listed requests: the table's DATA rows only. Filtering on "has a `cell`" is what
 * separates them from the heading row, whose children are `columnheader`s — no index
 * arithmetic and no reliance on the header being first.
 */
const requestRows = (page: Page): Locator =>
  requestsScreen(page)
    .getByRole('row')
    .filter({ has: page.getByRole('cell') });

/** One request's row, found by its own reference — never by position. */
const rowFor = (page: Page, request: TransactionRead): Locator =>
  requestRows(page).filter({ hasText: request.Reference });

/** The free-text search field (labelled, per the header's implementation notes). */
const searchField = (page: Page): Locator =>
  requestsScreen(page).getByLabel(/search/i);

/**
 * A pick-one filter, addressed by the accessible name that says which field it
 * filters. Shadcn `select` renders a Radix trigger with role `combobox`.
 */
const filterControl = (page: Page, name: RegExp): Locator =>
  requestsScreen(page).getByRole('combobox', { name });

/**
 * Chooses a value in one of the pick-one filters the way a user does: open the
 * trigger, pick the option. Options are portalled outside `main`, so they are queried
 * at page level.
 */
const chooseFilterValue = async (
  page: Page,
  filterName: RegExp,
  optionName: string | RegExp,
): Promise<void> => {
  await filterControl(page, filterName).click();
  await page.getByRole('option', { name: optionName }).click();
};

/**
 * Asserts the list shows exactly the given requests — the count AND each one's own
 * row. The exact count is what stops an empty render (or an over-wide filter) passing.
 */
const expectExactlyTheseRequests = async (
  page: Page,
  expected: TransactionRead[],
): Promise<void> => {
  await expect(requestRows(page)).toHaveCount(expected.length);
  for (const request of expected) {
    await expect(rowFor(page, request)).toBeVisible();
  }
};

test.describe('Epic expense-request-list, Story 2: search and filter the request list', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-1
  test('typing a term narrows the list to the requests matching it, and clearing the term brings every request back', async ({
    page,
    context,
  }) => {
    await openRequestList(page, context);

    // The whole fetched set, before any narrowing.
    await expectExactlyTheseRequests(page, ALL_REQUESTS);

    // A term carried by exactly one request's description. The search is debounced,
    // so this assertion waits for the narrowed result rather than guessing the
    // interval.
    await searchField(page).fill(SEARCH_TERM);
    await expectExactlyTheseRequests(page, [SEARCHED_REQUEST]);
    await expect(rowFor(page, REQUEST_OUTSIDE_SEARCH)).toHaveCount(0);

    // Clearing the term restores every request — the criterion's second half.
    await searchField(page).fill('');
    await expectExactlyTheseRequests(page, ALL_REQUESTS);

    // The search covers what is ON SCREEN: the visible last four digits of an account
    // number find their request...
    await searchField(page).fill(SEARCHED_LAST_FOUR);
    await expectExactlyTheseRequests(page, [SEARCHED_REQUEST]);

    // ...while the digits the masking hides find nothing. Searching the unmasked value
    // would be a way around the masking POPIA requires (story §Technical summary).
    await searchField(page).fill(SEARCHED_ACCOUNT_HIDDEN_PART);
    await expect(requestRows(page)).toHaveCount(0);

    // Cleared again, everything is back — from the empty result as much as from a
    // partial one.
    await searchField(page).fill('');
    await expectExactlyTheseRequests(page, ALL_REQUESTS);
  });

  // AC-2
  test('status, originating file and transaction type each narrow the list, and applied together they narrow cumulatively', async ({
    page,
    context,
  }) => {
    const feed = await openRequestList(page, context);

    await expectExactlyTheseRequests(page, ALL_REQUESTS);

    // 1. Status on its own.
    await chooseFilterValue(page, /status/i, TARGET_REQUEST.Status);
    await expectExactlyTheseRequests(page, BY_STATUS);
    await expect(rowFor(page, REQUEST_IN_ANOTHER_STATUS)).toHaveCount(0);

    // 2. Originating file added to it — the status filter is not replaced, the two
    //    narrow together.
    await chooseFilterValue(page, /file/i, TARGET_REQUEST.FileName);
    await expectExactlyTheseRequests(page, BY_STATUS_AND_FILE);
    await expect(rowFor(page, REQUEST_FROM_ANOTHER_FILE)).toHaveCount(0);

    // 3. Transaction type added on top — all three applied at once, each one
    //    narrowing what the previous ones left.
    await chooseFilterValue(page, /type/i, CREDIT_TYPE_OPTION);
    await expectExactlyTheseRequests(page, BY_STATUS_FILE_AND_TYPE);
    await expect(rowFor(page, REQUEST_OF_ANOTHER_TYPE)).toHaveCount(0);

    // All of that narrowing happened in the browser, over the one set fetched on load:
    // `GET /v1/transactions` accepts no query parameters at all (brief §Notes &
    // Caveats), so no read may carry one.
    expect(
      feed.urls.filter((url) => url.includes('?')),
      'no read of the transaction list may carry a query string — GET /v1/transactions accepts no parameters, and all search/filter narrowing is in memory over the one fetched set',
    ).toEqual([]);
  });

  // AC-5
  test('clear-all removes the search term and every filter at once and restores the whole set', async ({
    page,
    context,
  }) => {
    await openRequestList(page, context);

    await expectExactlyTheseRequests(page, ALL_REQUESTS);

    // A search term and two filters applied together, chosen so the list is narrowed
    // but NOT empty — clearing has to work from an ordinary narrowed list, not only
    // from the narrowed-empty state (R18; AC-4 owns the empty one).
    await searchField(page).fill(SEARCH_TERM);
    await chooseFilterValue(page, /status/i, SEARCHED_REQUEST.Status);
    await chooseFilterValue(page, /file/i, SEARCHED_REQUEST.FileName);
    await expectExactlyTheseRequests(page, [SEARCHED_REQUEST]);

    const clearAll = requestsScreen(page).getByRole('button', {
      name: /clear all/i,
    });
    await expect(clearAll).toBeVisible();
    await clearAll.click();

    // Every request is back...
    await expectExactlyTheseRequests(page, ALL_REQUESTS);

    // ...and nothing is left applied: the term is gone from the search field, and
    // neither filter still displays the value it was set to.
    await expect(searchField(page)).toHaveValue('');
    await expect(filterControl(page, /status/i)).not.toContainText(
      SEARCHED_REQUEST.Status,
    );
    await expect(filterControl(page, /file/i)).not.toContainText(
      SEARCHED_REQUEST.FileName,
    );
  });
});
