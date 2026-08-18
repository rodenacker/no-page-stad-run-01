/**
 * Story Metadata:
 * - Epic: request-list-redesign — Redesign the request list as a batch listing
 * - Story: 3 — One ruled strip of fields to narrow by
 * - Route: /requests
 * - Target File: web/src/components/requests/RequestNarrowingControls.tsx
 * - Page Action: modify_existing
 * - Requirements: R12, BR6, R6, R7, R27, BR2
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-2 (searching and each filter still cut the list down the same way, and several
 *   at once still combine the same way) → this file, one test.
 * - AC-1 (the strip reads as one ruled strip of underlined fields with small
 *   capitalised labels and no boxes, every field still present), AC-3 (clear-all),
 *   AC-4 (a reversed range is reported in place and never applied), AC-5 (export hands
 *   over exactly what the narrowing leaves) and AC-6 (an Importer sees no decision
 *   controls, bulk approval or duplicate notification; an Approver sees all of them)
 *   → the Vitest layer at
 *   `web/src/__tests__/integration/epic-request-list-redesign-story-3-one-ruled-strip-of-fields-to-narrow-by.test.tsx`.
 *   Deliberately NOT duplicated here (testing-policy.md § "one tag, one layer").
 * - No `@axe-core/playwright` scan here. This screen's real-browser accessibility scan
 *   already exists and is not this story's to duplicate: `epic-expense-request-list-
 *   story-4-sort-and-page.spec.ts` (AC-6) scans `/requests` and runs unchanged in the
 *   epic-end batch, so it scans the REDESIGNED screen. Note for review: axe has no
 *   reliable WCAG 1.4.11 non-text-contrast rule, so the underline-only fields' 3:1
 *   outline contrast (story §Implementation notes — the underline must use `--input`
 *   or darker, never `--border`) is a MANUAL-TEST and code-review check, not something
 *   any scan can prove.
 *
 * ---------------------------------------------------------------------------
 * What this spec is for
 * ---------------------------------------------------------------------------
 * This story is a RESTYLE of shipped behaviour: the six narrowing fields, their
 * combination semantics and the clear-all action are unchanged (epic R1/R12/BR2/BR6 —
 * `web/src/lib/transactions/narrowing.ts` is explicitly not touched). So this spec is
 * a behavioural regression guard written against the NEW strip: it exercises each of
 * the six fields and then all six together, through whatever notation the redesigned
 * strip ends up using, and it must hold identically before and after the restyle.
 *
 * Because of that it is deliberately written to survive the markup change (epic BR1):
 * rows are addressed by their own reference, fields by their accessible NAME (with the
 * micro-label wordings admitted alongside the current ones), and every expected result
 * set is DERIVED from the shared fixture rather than typed out. What it must never do
 * is loosen an assertion of user-observable behaviour to accommodate the redesign
 * (BR1's explicit limit) — hence the exact-set assertions below, which fail both on a
 * row that should have gone and on a row that should have stayed.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * (testing-policy.md § "Playwright runs against mocks, never live") — even though
 * project.md records both real services as running on this machine. This screen
 * crosses BOTH mock boundaries; the pattern is the one the `expense-request-list`
 * specs established and is reused verbatim rather than reinvented:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. `/requests` is gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` below, for this screen's one read
 *    (`GET /transactions-api/v1/transactions`), plus the identity call in case a
 *    client component reads it, plus a hard block on the real services' own origins
 *    (:4424 / :4423) so no browser-side call can leak to a live backend.
 *
 * Every response body comes from the project-wide factories in `web/src/mocks/data/`
 * (`transactionsForNarrowing()`, `transactionListResponse()`, `userInfoFor(role)`) —
 * no response shape and no request row is authored in this file, so this spec, the
 * Vitest layer and the pre-redesign specs cannot drift on the contract or the data.
 *
 * Implementation patterns this spec assumes (read before implementing):
 * - The request list is still read FROM THE BROWSER, through the shared API client
 *   against the app's own same-origin `/transactions-api/...` mount point, and ALL
 *   narrowing still happens in memory over that one fetched set (`GET /v1/transactions`
 *   accepts no query parameters). `page.route()` cannot intercept a read issued by the
 *   Next.js server or a Server Action, so moving this read server-side would bypass
 *   these mocks and leave for the real transactions service.
 * - The strip's fields keep REAL accessible names, each naming the field it narrows by
 *   — a tracked micro-label is still a `<label>` wired to its control (or an
 *   `aria-labelledby` pointing at it). An underline-only field with only a placeholder
 *   would be unnamed for assistive technology and unaddressable here.
 * - The three pick-one filters stay Shadcn `select` (Radix), so each trigger is a
 *   `combobox` named for its FIELD (not for the value it displays), and its options are
 *   portalled outside `main` — they are driven by clicking the trigger and picking an
 *   `option`, never by `selectOption`.
 * - The four range bounds stay TYPEABLE fields (driven with `fill()` below, never a
 *   calendar popover), dates typed and accepted as `YYYY-MM-DD`, and emptying a bound
 *   removes it rather than applying 0 / the epoch.
 * - Clear-all stays a button reading "Clear all", offered whenever a narrowing is
 *   active. It is used below as the way back to the whole batch between the
 *   one-field-at-a-time steps; AC-3 owns asserting what it does.
 * - The listing stays a table whose data rows carry `cell`s, and each request's own
 *   `Reference` is in one of them. Rows are found by reference, never by position —
 *   sorting and the redesign's two-character gutter (R15) both change what position
 *   means.
 * - The screen's content stays inside `main`, so every query here is scoped to it
 *   (Next.js renders a permanently empty body-level `role="alert"` route announcer
 *   outside `main`).
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie, seeded
 * directly rather than by driving the sign-in form. Cookies ignore port, so one seed
 * serves the dev server (:3000) and the epic-end production run (:3100). `Secure` is
 * omitted because the E2E server is plain http on localhost.
 *
 * TIMING — nothing here waits real time. The search is debounced by design, so every
 * assertion is web-first (`toHaveCount` / `toBeVisible`) and waits for the narrowed
 * result on its own. No `waitForTimeout`, and no test-only debounce override.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  TRANSACTION_TYPE_CREDIT_CODE,
  transactionListResponse,
  transactionsForNarrowing,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** The screen this epic redesigns (story metadata Route). */
const REQUESTS_ROUTE = '/requests';

/**
 * This screen's one read, as the BROWSER addresses it: the app's own
 * `/transactions-api/*` mount point, never the transactions service's origin. The glob
 * names no origin, so it matches whichever port the app is served on (:3000 in dev,
 * :3100 in the epic-end production run).
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
 * The whole fetched set — the project-wide narrowing spread, used as-is. Every
 * expectation below is DERIVED from it, so this spec cannot disagree with the Vitest
 * layer, or with the pre-redesign specs, about what the service sent.
 */
const LISTED_REQUESTS = transactionsForNarrowing();

/**
 * One row of that set, by its reference. Throws rather than yielding `undefined`, so a
 * fixture change fails loudly here instead of quietly turning an expectation below
 * into an empty one.
 */
const requestReferenced = (reference: string): TransactionRead => {
  const found = LISTED_REQUESTS.find(
    (request) => request.Reference === reference,
  );
  if (!found) {
    throw new Error(
      `transactionsForNarrowing() no longer contains "${reference}". This spec derives ` +
        'every narrowing value and every expected result from that shared factory ' +
        '(web/src/mocks/data/transaction.ts) — adjust the journey below rather than ' +
        'authoring request rows in this file.',
    );
  }
  return found;
};

/**
 * The rows this journey narrows by and towards. The comment on each is the factory's
 * own data, quoted for the reader — the values used below come from the objects.
 */
/** 2026-04-01 08:12 · 15 750 · Imported · credit · expenses_2026-04-15.csv. */
const SALARY = requestReferenced('TXN-20260401-0001');
/** 2026-04-15 08:34 · 487.32 · Imported · debit · same file as SALARY. */
const WOOLWORTHS = requestReferenced('TXN-20260415-0002');
/** 2026-04-15 15:00 · 189 · Imported · debit · expenses_2026-04-30.csv. */
const UBER_EATS = requestReferenced('TXN-20260430-0011');
/** 2026-04-30 13:49 · 200 · Rejected — the only rejected row. */
const NETFLIX = requestReferenced('TXN-20260430-0012');

/** The day part of a stored `TransactionDate` ("2026-04-15 15:00:00" → "2026-04-15"). */
const dayOf = (request: TransactionRead): string =>
  request.TransactionDate.slice(0, 10);

/**
 * A subset of the fetched set, guarded to be neither empty nor the whole thing. A step
 * that narrowed to nothing, or to everything, would prove nothing about the field
 * under test — and after a restyle that is exactly the failure mode worth catching
 * loudly rather than asserting past.
 */
const narrowedSubset = (
  predicate: (request: TransactionRead) => boolean,
  described: string,
  of: TransactionRead[] = LISTED_REQUESTS,
): TransactionRead[] => {
  const subset = of.filter(predicate);
  if (subset.length === 0 || subset.length >= of.length) {
    throw new Error(
      `${described} no longer selects some-but-not-all of the ${String(of.length)} ` +
        `requests it is applied to (it selects ${String(subset.length)}). This spec's ` +
        'steps rely on each narrowing strictly cutting the list down — pick different ' +
        'values, or update transactionsForNarrowing().',
    );
  }
  return subset;
};

/* -------------------------------------------------------------------------- */
/* Step 1 — each of the six fields on its own.                                */
/* -------------------------------------------------------------------------- */

/**
 * A word from one request's description. Guarded below to occur in exactly one row's
 * searchable text, so a search for it must leave exactly that request on screen.
 */
const SEARCH_TERM = 'Woolworths';

if (
  LISTED_REQUESTS.filter((request) => request.Description.includes(SEARCH_TERM))
    .length !== 1
) {
  throw new Error(
    `"${SEARCH_TERM}" no longer matches exactly one request in ` +
      'transactionsForNarrowing(), so the single-row expectation in the free-text ' +
      'step below is no longer right. Pick a term unique to one row.',
  );
}

const BY_SEARCH_TERM = [WOOLWORTHS];

const BY_STATUS_ALONE = narrowedSubset(
  (request) => request.Status === NETFLIX.Status,
  `the status filter set to "${NETFLIX.Status}"`,
);
const BY_FILE_ALONE = narrowedSubset(
  (request) => request.FileName === UBER_EATS.FileName,
  `the originating-file filter set to "${UBER_EATS.FileName}"`,
);
const BY_TYPE_ALONE = narrowedSubset(
  (request) => request.TransactionType === TRANSACTION_TYPE_CREDIT_CODE,
  'the transaction-type filter set to the credit type',
);

/** An amount range that spans three rows, two of them sitting exactly on a bound. */
const AMOUNT_FROM = '100';
const AMOUNT_TO = '200';
const BY_AMOUNT_RANGE_ALONE = narrowedSubset(
  (request) =>
    request.Amount >= Number(AMOUNT_FROM) &&
    request.Amount <= Number(AMOUNT_TO),
  `an amount range of ${AMOUNT_FROM} to ${AMOUNT_TO}`,
);

/** A date range open at the late end, starting on the busiest day in the set. */
const DATE_FROM_ALONE = dayOf(NETFLIX);
const BY_DATE_RANGE_ALONE = narrowedSubset(
  (request) => dayOf(request) >= DATE_FROM_ALONE,
  `a transaction-date range from ${DATE_FROM_ALONE} onwards`,
);

/* -------------------------------------------------------------------------- */
/* Step 2 — all six together, added one at a time.                            */
/* -------------------------------------------------------------------------- */

/** 1. Status. */
const COMBINED_BY_STATUS = narrowedSubset(
  (request) => request.Status === SALARY.Status,
  `the status filter set to "${SALARY.Status}"`,
);
/** 2. ...and originating file, which must narrow what the status left. */
const COMBINED_WITH_FILE = narrowedSubset(
  (request) => request.FileName === SALARY.FileName,
  `the originating-file filter set to "${SALARY.FileName}"`,
  COMBINED_BY_STATUS,
);
/** 3. ...and transaction type, which must narrow that further still. */
const COMBINED_WITH_TYPE = narrowedSubset(
  (request) => request.TransactionType === TRANSACTION_TYPE_CREDIT_CODE,
  'the transaction-type filter set to the credit type',
  COMBINED_WITH_FILE,
);

/**
 * The amount and date bounds added on top. Both are chosen to CONTAIN the survivor —
 * a fourth and fifth narrowing applied over the first three must neither reset them
 * nor wrongly exclude a request that is inside it. `narrowedSubset` proves each is
 * still a real bound (it cuts the full set), while the assertions in the test prove it
 * keeps the survivor.
 */
const COMBINED_AMOUNT_FROM = '1000';
const COMBINED_AMOUNT_TO = '20000';
const COMBINED_DATE_FROM = dayOf(SALARY);
const COMBINED_DATE_TO = '2026-04-20';

const withinCombinedAmountRange = (request: TransactionRead): boolean =>
  request.Amount >= Number(COMBINED_AMOUNT_FROM) &&
  request.Amount <= Number(COMBINED_AMOUNT_TO);
const withinCombinedDateRange = (request: TransactionRead): boolean =>
  dayOf(request) >= COMBINED_DATE_FROM && dayOf(request) <= COMBINED_DATE_TO;

narrowedSubset(
  withinCombinedAmountRange,
  `an amount range of ${COMBINED_AMOUNT_FROM} to ${COMBINED_AMOUNT_TO}`,
);
narrowedSubset(
  withinCombinedDateRange,
  `a transaction-date range of ${COMBINED_DATE_FROM} to ${COMBINED_DATE_TO}`,
);

/** 4. and 5. — what must survive with all five filters applied. */
const COMBINED_WITH_BOTH_RANGES = COMBINED_WITH_TYPE.filter(
  (request) =>
    withinCombinedAmountRange(request) && withinCombinedDateRange(request),
);

/**
 * 6. The free-text term, added last. `COMBINED_TERM` is carried by the survivor, so
 * the six together still leave it; `TERM_FOR_AN_EXCLUDED_REQUEST` is carried by a row
 * the five filters have already removed, so the six together leave NOTHING — which is
 * what proves the term is combined with the filters rather than replacing them.
 */
const COMBINED_TERM = 'Salary';
const TERM_FOR_AN_EXCLUDED_REQUEST = 'Netflix';

if (
  COMBINED_WITH_BOTH_RANGES.length !== 1 ||
  COMBINED_WITH_BOTH_RANGES[0]?.Reference !== SALARY.Reference ||
  !SALARY.Description.includes(COMBINED_TERM) ||
  !NETFLIX.Description.includes(TERM_FOR_AN_EXCLUDED_REQUEST) ||
  COMBINED_WITH_BOTH_RANGES.some((request) =>
    request.Description.includes(TERM_FOR_AN_EXCLUDED_REQUEST),
  )
) {
  throw new Error(
    'The combination journey in this spec relies on the five filters leaving exactly ' +
      `${SALARY.Reference}, on "${COMBINED_TERM}" being carried by it, and on ` +
      `"${TERM_FOR_AN_EXCLUDED_REQUEST}" being carried only by a request those ` +
      'filters have already excluded. transactionsForNarrowing() no longer gives ' +
      'that, so the final steps would prove nothing — choose different values.',
  );
}

/**
 * How the credit type is picked from the type filter's options. Matched by regex
 * rather than by an exact label because the plain-language wording belongs to
 * `lib/transactions/display.ts`, not to this spec; exactly one option in this fixture
 * is a credit one, so this matches one option whatever that wording is.
 */
const CREDIT_TYPE_OPTION = /credit/i;

/* -------------------------------------------------------------------------- */
/* How each field in the strip is addressed.                                  */
/* -------------------------------------------------------------------------- */

/**
 * Each control's accessible NAME, as a matcher. Two spellings each, because this story
 * replaces the current labels with tracked micro-labels and the exact wording is the
 * developer's: the alternatives admit both the shipped wording ("Minimum amount",
 * "Earliest transaction date") and a shortened micro-label ("MIN", "FROM") without
 * either matcher ever matching the OTHER end of the same range. What the story does
 * fix is that every field keeps a real accessible name — a field addressable by
 * neither spelling has lost its label, which is a genuine regression, not a wording
 * choice.
 */
const SEARCH_FIELD = /search/i;
const MINIMUM_AMOUNT_FIELD = /\bmin(imum)?\b/i;
const MAXIMUM_AMOUNT_FIELD = /\bmax(imum)?\b/i;
const EARLIEST_DATE_FIELD = /earliest|date from|^from$/i;
const LATEST_DATE_FIELD = /latest|date to|^to$/i;
const STATUS_FILTER = /status/i;
const FILE_FILTER = /file/i;
const TYPE_FILTER = /type/i;
const CLEAR_ALL_ACTION = /clear all/i;

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

/**
 * Blocks the live services (see LIVE_BACKEND_ORIGINS). Registered LAST, because
 * Playwright matches the most recently registered route first: a call sent to a
 * service's own origin is then aborted and fails visibly, instead of being quietly
 * answered by the origin-agnostic mocks above it.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Answers a BROWSER-side identity read from the shared userinfo source, so it can
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
 * Serves the whole fetched set on every read. The body never changes: this screen
 * narrows in memory, so a second read returning something different would hide the
 * very thing under test.
 */
const mockTransactionList = async (page: Page): Promise<void> => {
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse(LISTED_REQUESTS))),
  );
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

/* -------------------------------------------------------------------------- */
/* Locators and the small user actions this journey is made of.               */
/* -------------------------------------------------------------------------- */

/** The screen's own content, inside the signed-in shell. */
const requestsScreen = (page: Page): Locator => page.getByRole('main');

/**
 * The listed requests: the listing's DATA rows only. Filtering on "has a `cell`" is
 * what separates them from the heading row, whose children are `columnheader`s — no
 * index arithmetic and no reliance on the heading being first. The same locator the
 * pre-redesign narrowing specs use, deliberately, so the specs cannot pin two
 * different shapes on the one list they share.
 */
const listedRequestRows = (page: Page): Locator =>
  requestsScreen(page)
    .getByRole('row')
    .filter({ has: page.getByRole('cell') });

/** One request's row, found by its own reference — never by position. */
const listedRequest = (page: Page, request: TransactionRead): Locator =>
  listedRequestRows(page).filter({ hasText: request.Reference });

const fieldNamed = (page: Page, name: RegExp): Locator =>
  requestsScreen(page).getByLabel(name);

/**
 * A pick-one filter, addressed by the accessible name that says WHICH field it filters.
 * A Shadcn `select` exposes its Radix trigger as a `combobox`.
 */
const filterNamed = (page: Page, name: RegExp): Locator =>
  requestsScreen(page).getByRole('combobox', { name });

/**
 * Chooses a value in one of the pick-one filters the way a user does: open the trigger,
 * pick the option. Options are portalled outside `main`, so they are queried at page
 * level.
 */
const chooseFilterValue = async (
  page: Page,
  filterName: RegExp,
  optionName: string | RegExp,
): Promise<void> => {
  await filterNamed(page, filterName).click();
  await page.getByRole('option', { name: optionName }).click();
};

/**
 * Back to the whole batch between the one-field-at-a-time steps. Clear-all is used
 * here as the MEANS of getting there — not as the thing under test; AC-3 owns asserting
 * what it does, and the assertion that follows each use is that the full set is listed
 * again.
 */
const clearAllNarrowing = async (page: Page): Promise<void> => {
  await requestsScreen(page)
    .getByRole('button', { name: CLEAR_ALL_ACTION })
    .click();
};

/**
 * Asserts the listed requests are EXACTLY the ones expected: each one on screen, every
 * other row of the fetched set gone, and the total matching — so a narrowing that
 * quietly emptied the list and one that left an extra row behind both fail.
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
      `${request.Reference} is inside the applied narrowing and must stay listed`,
    ).toBeVisible();
  }
  for (const request of excluded) {
    await expect(
      listedRequest(page, request),
      `${request.Reference} is outside the applied narrowing and must not be listed`,
    ).toHaveCount(0);
  }
  await expect(
    listedRequestRows(page),
    'the list must show exactly the requests inside the applied narrowing, and nothing else',
  ).toHaveCount(expected.length);
};

/**
 * Signs in as an Importer, mocks both boundaries, opens the screen and waits for the
 * whole fetched set to be listed — the state each step below narrows from, and the
 * baseline that proves a later assertion is narrowing rather than looking at a list
 * that never arrived.
 *
 * The Importer is enough: both roles read the same list and narrowing is not
 * role-specific (R27). AC-6 owns what each role may DO with what is listed.
 */
const openRequestList = async (
  page: Page,
  context: BrowserContext,
): Promise<void> => {
  await seedSession(context, ROLE_IMPORTER);
  await mockBrowserIdentityCall(page, ROLE_IMPORTER);
  await mockTransactionList(page);
  await blockLiveBackends(page);

  await page.goto(REQUESTS_ROUTE);
  await expectExactlyTheseRequests(page, LISTED_REQUESTS);
};

test.describe('Epic request-list-redesign, Story 3: one ruled strip of fields to narrow by', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-2
  // The whole point of the story, stated as behaviour: after the strip is restyled,
  // each of the six fields still cuts the list down to the same requests it did, and
  // several at once still combine the same way (an AND across every applied field —
  // never a replace, never a reset).
  test('each of the six fields in the strip still narrows the list to the same requests, and all six applied together still narrow cumulatively', async ({
    page,
    context,
  }) => {
    await openRequestList(page, context);

    /* ---- Each field on its own, from the whole batch each time. ---------- */

    // 1. Free-text search — a term carried by exactly one request. The search is
    //    debounced, so this waits for the narrowed result rather than guessing the
    //    interval.
    await fieldNamed(page, SEARCH_FIELD).fill(SEARCH_TERM);
    await expectExactlyTheseRequests(page, BY_SEARCH_TERM);
    await fieldNamed(page, SEARCH_FIELD).fill('');
    await expectExactlyTheseRequests(page, LISTED_REQUESTS);

    // 2. Status.
    await chooseFilterValue(page, STATUS_FILTER, NETFLIX.Status);
    await expectExactlyTheseRequests(page, BY_STATUS_ALONE);
    await clearAllNarrowing(page);
    await expectExactlyTheseRequests(page, LISTED_REQUESTS);

    // 3. Originating file.
    await chooseFilterValue(page, FILE_FILTER, UBER_EATS.FileName);
    await expectExactlyTheseRequests(page, BY_FILE_ALONE);
    await clearAllNarrowing(page);
    await expectExactlyTheseRequests(page, LISTED_REQUESTS);

    // 4. Transaction type.
    await chooseFilterValue(page, TYPE_FILTER, CREDIT_TYPE_OPTION);
    await expectExactlyTheseRequests(page, BY_TYPE_ALONE);
    await clearAllNarrowing(page);
    await expectExactlyTheseRequests(page, LISTED_REQUESTS);

    // 5. Amount range — both bounds, with a request sitting exactly on each of them.
    await fieldNamed(page, MINIMUM_AMOUNT_FIELD).fill(AMOUNT_FROM);
    await fieldNamed(page, MAXIMUM_AMOUNT_FIELD).fill(AMOUNT_TO);
    await expectExactlyTheseRequests(page, BY_AMOUNT_RANGE_ALONE);
    await clearAllNarrowing(page);
    await expectExactlyTheseRequests(page, LISTED_REQUESTS);

    // 6. Transaction date range — one bound given, the other left open.
    await fieldNamed(page, EARLIEST_DATE_FIELD).fill(DATE_FROM_ALONE);
    await expectExactlyTheseRequests(page, BY_DATE_RANGE_ALONE);
    await clearAllNarrowing(page);
    await expectExactlyTheseRequests(page, LISTED_REQUESTS);

    /* ---- All six together, added one at a time. -------------------------- */

    // Status.
    await chooseFilterValue(page, STATUS_FILTER, SALARY.Status);
    await expectExactlyTheseRequests(page, COMBINED_BY_STATUS);

    // ...plus originating file: the status filter is not replaced, the two narrow
    // together.
    await chooseFilterValue(page, FILE_FILTER, SALARY.FileName);
    await expectExactlyTheseRequests(page, COMBINED_WITH_FILE);

    // ...plus transaction type, narrowing what the first two left.
    await chooseFilterValue(page, TYPE_FILTER, CREDIT_TYPE_OPTION);
    await expectExactlyTheseRequests(page, COMBINED_WITH_TYPE);

    // ...plus both ranges, each of which CONTAINS the survivor: a fourth and fifth
    // narrowing applied over the first three must neither reset them nor wrongly
    // exclude a request that is inside it.
    await fieldNamed(page, MINIMUM_AMOUNT_FIELD).fill(COMBINED_AMOUNT_FROM);
    await fieldNamed(page, MAXIMUM_AMOUNT_FIELD).fill(COMBINED_AMOUNT_TO);
    await fieldNamed(page, EARLIEST_DATE_FIELD).fill(COMBINED_DATE_FROM);
    await fieldNamed(page, LATEST_DATE_FIELD).fill(COMBINED_DATE_TO);
    await expectExactlyTheseRequests(page, COMBINED_WITH_BOTH_RANGES);

    // ...plus the free-text term, carried by that same survivor: six fields applied at
    // once, and the request that satisfies all six is still listed.
    await fieldNamed(page, SEARCH_FIELD).fill(COMBINED_TERM);
    await expectExactlyTheseRequests(page, COMBINED_WITH_BOTH_RANGES);

    // The term swapped for one carried ONLY by a request the five filters have already
    // excluded: nothing satisfies all six, so nothing is listed. This is what separates
    // "the term is combined with the filters" from "the term replaced them" — a strip
    // that dropped the filters when the search changed would list the Netflix request
    // here instead of nothing.
    await fieldNamed(page, SEARCH_FIELD).fill(TERM_FOR_AN_EXCLUDED_REQUEST);
    await expectExactlyTheseRequests(page, []);

    // Every one of those narrowings must still be an AND, not an OR: the five filters
    // are unchanged and still applied, so putting the term back brings back exactly the
    // one request that satisfies all six — and only it.
    await fieldNamed(page, SEARCH_FIELD).fill(COMBINED_TERM);
    await expectExactlyTheseRequests(page, COMBINED_WITH_BOTH_RANGES);
  });
});
