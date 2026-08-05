/**
 * Story Metadata:
 * - Epic: expense-request-list — The shared expense request list
 * - Story: 6 — Possible duplicates marked, and the Approver told
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R4, R8, R21, BR2, BR3
 *
 * Covers this story's single `playwright`-tagged criterion:
 * - AC-5 — a possible-duplicate mark stays on the SAME requests after searching,
 *   filtering, sorting and paging, because the comparison covers every fetched
 *   request rather than the visible page.
 *
 * AC-1 (both matching requests marked), AC-2 (rejected requests excluded from the
 * comparison), AC-3 (the mark is wording paired with an intent colour) and AC-4 (an
 * Approver is notified, an Importer is not) are the Vitest layer's — see
 * `web/src/__tests__/integration/epic-expense-request-list-story-6-possible-duplicates.test.tsx`.
 * They are deliberately NOT repeated here (testing-policy.md § "one tag, one
 * layer"). This epic's single real-browser accessibility scan belongs to story 4's
 * AC-6, so no axe scan is repeated here either.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both real services as running on this machine. This screen
 * crosses BOTH mock boundaries that epic 1 established; this spec reuses them rather
 * than adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`,
 *    started by `globalSetup` and wired in by `playwright.config.ts`. `/requests`
 *    is gated SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` below, for this screen's one read —
 *    `GET /transactions-api/v1/transactions` (story 1: the app's own same-origin
 *    mount point, never the service's origin) — plus the identity call in case a
 *    client component reads it, plus a hard block on the real services' own origins
 *    (:4424 / :4423) so no browser-side call can leak to a live backend even if the
 *    app were pointed at the wrong address.
 *
 * Every response body comes from the project-wide factories in `web/src/mocks/data/`
 * (`duplicatePair()`, `manyTransactions()`, `transactionListResponse()`,
 * `userInfoFor()`), so this spec and the Vitest layer cannot drift on the contract or
 * on which rows collide. No response shape or body is authored in this file. The
 * endpoint takes NO query parameters and returns the whole set in one response
 * (brief §Data Model), so ONE unchanging body is served for the whole test — which is
 * what makes "the mark survived" mean the mark survived, rather than the data having
 * changed underneath it.
 *
 * Signed in as the IMPORTER, deliberately: an Importer sees the marks and receives
 * no duplicate notification (AC-4), so the toast this story raises for an Approver
 * cannot overlap the assertions below. Nothing here queries a live region; where a
 * region query is unavoidable elsewhere in this epic it must be scoped (e.g.
 * `getByRole('main').getByRole('alert')`) because Next renders a permanently empty
 * body-level `role="alert"` route announcer.
 *
 * ---------------------------------------------------------------------------
 * Implementation patterns this spec assumes (read before implementing)
 * ---------------------------------------------------------------------------
 * - The list is read FROM THE BROWSER through the shared API client at the app's own
 *   `/transactions-api/...` address (story 1 §Infrastructure reuse notes).
 *   `page.route()` cannot intercept a read issued by the Next.js server, so a
 *   server-only fetch would bypass this mock and leave for the real service.
 * - The duplicate flag is computed ONCE on load over the FULL fetched set and carried
 *   on the row model (story 6 §Infrastructure reuse notes). Recomputing over the rows
 *   currently on screen is the exact defect this spec exists to catch: it passes a
 *   single-page test and fails the paging phase below.
 * - The mark is WORDING (paired with an intent colour — the colour pairing is AC-3's,
 *   asserted in Vitest) matching /possible duplicate/i, rendered inside the marked
 *   request's own row so it is readable without opening the request (R8).
 * - The list renders as a table (Shadcn `table`, story 1), so each request is a `row`
 *   and rows are addressed by the request's own `Reference` — never by position.
 * - Accessible names the queries below rely on. Every one of them is the same handle
 *   the sibling specs for stories 2–4 (the criteria that OWN these controls) use, so
 *   nothing here is an extra demand — and each is required by the epic's WCAG 2.2 AA
 *   / full-keyboard-completability bar anyway (story 4 AC-6):
 *   - the search field has an accessible name containing "search" (a real `<label>`,
 *     `aria-label` or `aria-labelledby` — a placeholder alone is not an accessible
 *     name and would fail the axe scan);
 *   - the originating-file filter is a Shadcn `select` (role `combobox`, never a
 *     native `<select>` — story 2 §Infrastructure reuse notes) whose accessible name
 *     contains "file", offering each file name present in the fetched set as an
 *     `option`;
 *   - the page-size selector is a Shadcn `select` named "per page" / "page size",
 *     offering 5 / 10 / 20 / 50 as `option`s (story 4 AC-3);
 *   - each sortable column heading is a `columnheader` containing a focusable control
 *     named for its column — the standard accessible sort pattern story 4's spec
 *     requires;
 *   - the pagination forward control is a `button` or a link named "next";
 *   - clear-all is a control named "Clear all" (story 2 AC-5).
 * - Sorting by Reference ascending on first activation (story 4 AC-1) orders these
 *   fixed-width, zero-padded references lexicographically — that is what makes the
 *   page each request lands on computable below.
 * - Cookie/storage assumptions: the session travels only in the `session` cookie
 *   (epic 1 BR2), seeded directly rather than by driving the sign-in form (epic 1
 *   story 2's spec owns that journey). Cookies ignore port, so one seed serves the
 *   dev server (:3000) and the epic-end production run (:3100). `Secure` is omitted
 *   because the E2E server is plain http on localhost.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credential is
 * needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — `/requests` still
 * answers a permitted user with `notFound()`.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  duplicatePair,
  manyTransactions,
  transactionListResponse,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** The list screen this epic builds (story metadata Route). */
const REQUESTS_ROUTE = '/requests';

/**
 * This screen's one read, as the BROWSER addresses it: the app's own
 * `/transactions-api/*` mount point (`web/src/lib/utils/constants.ts`), never the
 * transactions service's origin. Trailing `**` so any query string is covered — the
 * endpoint accepts none, but a stray one must still be answered by the mock rather
 * than escaping to a live service.
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
 * The mark itself: WORDING, not colour (R8/AC-3 — colour alone is never the mark).
 * Asserted inside a row, so it is the row's own mark that is being read.
 */
const POSSIBLE_DUPLICATE_MARK = /possible duplicate/i;

/* -------------------------------------------------------------------------- */
/* The fetched set                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The two imported requests sharing the duplicate key (`AccountNumber` + `Amount` +
 * `TransactionDate`, BR3) that BR2 requires BOTH of to be marked. The factory builds
 * the only key collision in this file; the two rows come from different files and
 * carry distinct references and descriptions, which is what lets narrowing separate
 * them.
 */
const [FIRST_OF_PAIR, SECOND_OF_PAIR] = duplicatePair();

/**
 * Filler requests: distinct ids, references, account numbers, amounts and dates, so
 * no two of them share the duplicate key and none collides with the pair's key. Their
 * job is to push the two matching requests onto different pages, and to give the
 * negative control below a row that must NOT be marked.
 *
 * `manyTransactions` numbers its references from the same day as the pair's first
 * member, so its one colliding reference is dropped — two rows answering to the same
 * reference would make row-by-reference selection ambiguous.
 */
const OTHER_REQUEST_COUNT = 12;
const OTHER_REQUESTS = manyTransactions(OTHER_REQUEST_COUNT).filter(
  (request) => request.Reference !== FIRST_OF_PAIR.Reference,
);

/** Everything `GET /v1/transactions` returns for this test, in one response. */
const FETCHED_REQUESTS: TransactionRead[] = [
  ...OTHER_REQUESTS,
  FIRST_OF_PAIR,
  SECOND_OF_PAIR,
];

/** A request that is NOT part of the pair — the negative control for the mark. */
const UNMATCHED_REQUEST = OTHER_REQUESTS[0];

/**
 * Search term that leaves ONLY the second of the pair visible: a word from its own
 * description. Its partner then has to be marked from the fetched set rather than
 * from anything on screen.
 */
const SEARCH_TERM = 'resubmitted';

/**
 * Page size used for the paging phase — the smallest the page-size selector offers
 * (story 4 AC-3), so the pair can be driven onto different pages.
 */
const PAGE_SIZE = 5;

/**
 * That page size as an option name. ANCHORED at the start and on a word boundary,
 * exactly as story 4's spec addresses the same option: an accessible name is matched
 * as a substring by default, so a bare "5" would also match the "50" choice the same
 * selector offers, while an exact "5" would miss a choice that reads "5 per page".
 */
const PAGE_SIZE_OPTION_NAME = new RegExp(`^${PAGE_SIZE}\\b`);

/**
 * How the page-size selector is named — the same expression story 4's spec (the
 * criterion that owns this control) uses for it.
 */
const PAGE_SIZE_SELECTOR = /per page|page size/i;

/** The duplicate key (BR3) as one comparable value. */
const duplicateKeyOf = (request: TransactionRead): string =>
  `${request.AccountNumber}|${request.Amount}|${request.TransactionDate}`;

/**
 * The searchable text of a request, as story 2 decided the search field's scope:
 * `Reference`, `Description`, `FileName`, `Amount` and the VISIBLE last four digits
 * of the account number (never the unmasked value — that would be a way around the
 * masking POPIA requires). Used only to prove the fixture below separates the pair.
 */
const searchableText = (request: TransactionRead): string =>
  [
    request.Reference,
    request.Description,
    request.FileName,
    String(request.Amount),
    request.AccountNumber.slice(-4),
  ]
    .join(' ')
    .toLowerCase();

/**
 * References in the order an ascending sort by Reference puts them (fixed-width,
 * zero-padded values, so a lexicographic sort is the numeric one), which is what
 * makes each request's page computable.
 */
const REFERENCES_IN_ASCENDING_ORDER = FETCHED_REQUESTS.map(
  (request) => request.Reference,
).sort();

/** The 1-based page a request lands on once sorted ascending by Reference. */
const pageHolding = (reference: string): number =>
  Math.floor(REFERENCES_IN_ASCENDING_ORDER.indexOf(reference) / PAGE_SIZE) + 1;

const PAGE_WITH_FIRST_OF_PAIR = pageHolding(FIRST_OF_PAIR.Reference);
const PAGE_WITH_SECOND_OF_PAIR = pageHolding(SECOND_OF_PAIR.Reference);

/* -------------------------------------------------------------------------- */
/* Fixture integrity — the criterion is only tested if these hold             */
/* -------------------------------------------------------------------------- */

const REFERENCES = FETCHED_REQUESTS.map((request) => request.Reference);
if (new Set(REFERENCES).size !== REFERENCES.length) {
  throw new Error(
    'Two fetched requests share a Reference, so a row could not be identified by ' +
      'reference. Adjust OTHER_REQUEST_COUNT or the filter above.',
  );
}

const KEY_SHARING_REQUESTS = FETCHED_REQUESTS.filter((request) =>
  FETCHED_REQUESTS.some(
    (other) =>
      other.Id !== request.Id &&
      duplicateKeyOf(other) === duplicateKeyOf(request),
  ),
);
if (
  KEY_SHARING_REQUESTS.length !== 2 ||
  !KEY_SHARING_REQUESTS.every((request) =>
    [FIRST_OF_PAIR.Id, SECOND_OF_PAIR.Id].includes(request.Id),
  )
) {
  throw new Error(
    'Exactly two fetched requests — the duplicate pair — may share the duplicate ' +
      'key (BR3). An accidental third collision would make the negative control ' +
      'below meaningless.',
  );
}

const REQUESTS_MATCHING_SEARCH = FETCHED_REQUESTS.filter((request) =>
  searchableText(request).includes(SEARCH_TERM),
);
if (
  REQUESTS_MATCHING_SEARCH.length !== 1 ||
  REQUESTS_MATCHING_SEARCH[0].Reference !== SECOND_OF_PAIR.Reference
) {
  throw new Error(
    `The search term "${SEARCH_TERM}" must match exactly one fetched request — the ` +
      'second of the duplicate pair — so that searching separates the pair.',
  );
}

if (FIRST_OF_PAIR.FileName === SECOND_OF_PAIR.FileName) {
  throw new Error(
    'The duplicate pair must come from two different originating files, so that ' +
      'filtering by one file separates them.',
  );
}
if (
  OTHER_REQUESTS.some((request) => request.FileName === SECOND_OF_PAIR.FileName)
) {
  throw new Error(
    `Filtering by "${FIRST_OF_PAIR.FileName}" must leave the first of the pair ` +
      'visible and the second hidden; no filler request may belong to the second ' +
      "member's file.",
  );
}

if (PAGE_WITH_FIRST_OF_PAIR === PAGE_WITH_SECOND_OF_PAIR) {
  throw new Error(
    `At ${PAGE_SIZE} requests per page the duplicate pair lands on the same page ` +
      `(${PAGE_WITH_FIRST_OF_PAIR}), so paging would not separate it — which is the ` +
      'regression AC-5 exists to catch. Raise OTHER_REQUEST_COUNT.',
  );
}
if (
  PAGE_WITH_FIRST_OF_PAIR < 2 ||
  PAGE_WITH_SECOND_OF_PAIR <= PAGE_WITH_FIRST_OF_PAIR
) {
  throw new Error(
    'The paging phase reads forward from page 1: the first of the pair must sit ' +
      'beyond page 1 and the second beyond the first.',
  );
}

/* -------------------------------------------------------------------------- */
/* Mocks and locators                                                         */
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
 * never disagree with what the Node-side stub returns for the same session (the
 * server-side gate is answered by the stub, not by this route).
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
 * Serves the whole request set in one response, from the shared envelope factory.
 * The body never changes during a test, so every assertion below is about the same
 * fetched set.
 */
const mockTransactionList = async (page: Page): Promise<void> => {
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse(FETCHED_REQUESTS))),
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

/** One request's row, found by the request's own reference — never by position. */
const requestRow = (page: Page, request: TransactionRead): Locator =>
  page
    .getByRole('main')
    .getByRole('row')
    .filter({ hasText: request.Reference });

/** The free-text search field (story 2). */
const searchField = (page: Page): Locator =>
  page.getByRole('main').getByLabel(/search/i);

/** The originating-file filter (story 2) — a Shadcn `select`, so role `combobox`. */
const originatingFileFilter = (page: Page): Locator =>
  page.getByRole('main').getByRole('combobox', { name: /file/i });

/** The page-size selector (story 4) — also a Shadcn `select`. */
const pageSizeSelector = (page: Page): Locator =>
  page.getByRole('main').getByRole('combobox', { name: PAGE_SIZE_SELECTOR });

/**
 * A Shadcn `select` option. Deliberately NOT scoped to `main`: Radix renders the
 * open option list in a portal at body level.
 */
const selectOption = (page: Page, name: string | RegExp): Locator =>
  page.getByRole('option', { name });

/**
 * The Reference column's sort control (story 4 AC-1): the control inside that
 * column's own heading, named for the column — addressed exactly as story 4's spec
 * (the criterion that owns sorting) addresses it, never by column position.
 */
const sortByReferenceControl = (page: Page): Locator =>
  page
    .getByRole('main')
    .getByRole('columnheader', { name: /reference/i })
    .getByRole('button', { name: /reference/i });

/**
 * The pagination control that moves forward one page (story 4 AC-3).
 *
 * `.or()` is Playwright's own locator combinator, not a query fallback: Shadcn's
 * `pagination` primitive renders its forward control as an anchor while a `button`
 * expresses R12's "visible but unusable" natively — both satisfy the criterion, only
 * one of them exists, and story 4's spec addresses it the same way.
 */
const nextPageControl = (page: Page): Locator => {
  const screen = page.getByRole('main');
  return screen
    .getByRole('button', { name: /next/i })
    .or(screen.getByRole('link', { name: /next/i }));
};

/** Removes the search term and every filter at once (story 2 AC-5). */
const clearAllControl = (page: Page): Locator =>
  page.getByRole('main').getByRole('button', { name: /clear all/i });

/**
 * Reads a request's row and requires the possible-duplicate mark on it, saying which
 * narrowing the mark had to survive.
 */
const expectMarked = async (
  page: Page,
  request: TransactionRead,
  situation: string,
): Promise<void> => {
  await expect(
    requestRow(page, request),
    `${request.Reference} shares its account number, amount and transaction date ` +
      `with ${request.Id === FIRST_OF_PAIR.Id ? SECOND_OF_PAIR.Reference : FIRST_OF_PAIR.Reference}` +
      `, so it must still be marked as a possible duplicate ${situation} — the ` +
      'comparison covers every fetched request, not the requests on screen (BR3)',
  ).toContainText(POSSIBLE_DUPLICATE_MARK);
};

/** Requires that a request is not on screen at all. */
const expectNotListed = async (
  page: Page,
  request: TransactionRead,
  situation: string,
): Promise<void> => {
  await expect(
    requestRow(page, request),
    `${request.Reference} must not be listed ${situation} — the point of this step ` +
      'is that its matching request has to be marked without its partner in sight',
  ).toHaveCount(0);
};

test.describe('Epic expense-request-list, Story 6: possible duplicates stay marked', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-5
  // One journey, because the criterion IS the composition: the same two requests have
  // to stay marked while the visible page is changed underneath them four different
  // ways. Each step deliberately leaves ONE member of the pair on screen and its
  // partner off it — an implementation that compares only what is on the page marks
  // nothing at that moment, which is precisely the regression this protects.
  test('the same requests stay marked as possible duplicates through searching, filtering, sorting and paging', async ({
    page,
    context,
  }) => {
    await blockLiveBackends(page);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await mockTransactionList(page);
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(REQUESTS_ROUTE);

    // As it lands: both members of the pair carry the mark, and a request that
    // matches nothing does not — so the mark means something.
    await expectMarked(page, FIRST_OF_PAIR, 'on the freshly loaded list');
    await expectMarked(page, SECOND_OF_PAIR, 'on the freshly loaded list');

    // The negative control is read from a row that is DEMONSTRABLY on screen first —
    // otherwise "it carries no mark" would also be satisfied by a row that never
    // rendered at all.
    const unmatchedRow = requestRow(page, UNMATCHED_REQUEST);
    await expect(
      unmatchedRow,
      `${UNMATCHED_REQUEST.Reference} must be listed on the freshly loaded page for ` +
        'the unmarked-row check below to mean anything',
    ).toHaveCount(1);
    await expect(
      unmatchedRow,
      `${UNMATCHED_REQUEST.Reference} shares its duplicate key with no other fetched ` +
        'request, so it must never be marked as a possible duplicate',
    ).not.toContainText(POSSIBLE_DUPLICATE_MARK);

    // 1 — SEARCHING. The term matches only the second of the pair; its partner
    // leaves the screen entirely, and the mark stays.
    await searchField(page).fill(SEARCH_TERM);
    await expectNotListed(
      page,
      FIRST_OF_PAIR,
      `while searching for "${SEARCH_TERM}"`,
    );
    await expectMarked(
      page,
      SECOND_OF_PAIR,
      `while searching for "${SEARCH_TERM}"`,
    );

    // Clearing the term brings the whole set back (story 2 AC-1), ready for the next
    // way of narrowing.
    await searchField(page).fill('');
    await expect(requestRow(page, FIRST_OF_PAIR)).toHaveCount(1);

    // 2 — FILTERING. The pair came from two different files, so filtering to the
    // first member's file hides the second. This time it is the FIRST member left
    // alone on screen, still marked.
    await originatingFileFilter(page).click();
    await selectOption(page, FIRST_OF_PAIR.FileName).click();
    await expectNotListed(
      page,
      SECOND_OF_PAIR,
      `while filtered to the file ${FIRST_OF_PAIR.FileName}`,
    );
    await expectMarked(
      page,
      FIRST_OF_PAIR,
      `while filtered to the file ${FIRST_OF_PAIR.FileName}`,
    );

    // Clear-all restores every request (story 2 AC-5).
    await clearAllControl(page).click();
    await expect(requestRow(page, SECOND_OF_PAIR)).toHaveCount(1);

    // 3 — SORTING. Re-ordering the list moves both members, and neither loses its
    // mark. This ascending Reference sort is also what fixes the page each of them
    // lands on in step 4.
    await sortByReferenceControl(page).click();
    await expectMarked(page, FIRST_OF_PAIR, 'after sorting by reference');
    await expectMarked(page, SECOND_OF_PAIR, 'after sorting by reference');

    // 4 — PAGING, the case a visible-page comparison cannot survive. At the smallest
    // page size the two matching requests sit on different pages, so on each of those
    // pages the only evidence that a request is a possible duplicate lives in the
    // fetched set.
    await pageSizeSelector(page).click();
    await selectOption(page, PAGE_SIZE_OPTION_NAME).click();

    // Page 1 holds neither of them...
    await expectNotListed(
      page,
      FIRST_OF_PAIR,
      `on page 1 of ${PAGE_SIZE} per page`,
    );
    await expectNotListed(
      page,
      SECOND_OF_PAIR,
      `on page 1 of ${PAGE_SIZE} per page`,
    );

    // ...page 2 holds the first, with its partner nowhere on the page...
    for (let step = 1; step < PAGE_WITH_FIRST_OF_PAIR; step += 1) {
      await nextPageControl(page).click();
    }
    await expectNotListed(
      page,
      SECOND_OF_PAIR,
      `on page ${PAGE_WITH_FIRST_OF_PAIR}`,
    );
    await expectMarked(
      page,
      FIRST_OF_PAIR,
      `on page ${PAGE_WITH_FIRST_OF_PAIR} of ${PAGE_SIZE} per page, with its ` +
        'matching request on another page',
    );

    // ...and a later page holds the second, equally alone, equally marked.
    for (
      let step = PAGE_WITH_FIRST_OF_PAIR;
      step < PAGE_WITH_SECOND_OF_PAIR;
      step += 1
    ) {
      await nextPageControl(page).click();
    }
    await expectNotListed(
      page,
      FIRST_OF_PAIR,
      `on page ${PAGE_WITH_SECOND_OF_PAIR}`,
    );
    await expectMarked(
      page,
      SECOND_OF_PAIR,
      `on page ${PAGE_WITH_SECOND_OF_PAIR} of ${PAGE_SIZE} per page, with its ` +
        'matching request on another page',
    );
  });
});
