/**
 * Story Metadata:
 * - Epic: request-list-redesign — Redesign the request list as a batch listing
 * - Story: 5 — The listing itself, as a ruled batch listing
 * - Route: /requests
 * - Target File: web/src/components/requests/ExpenseRequestList.tsx
 * - Page Action: modify_existing
 * - Requirements: R13, R1, BR1, BR2 (this file), with R6/R8 carried by the story's
 *   other layers
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-3 (every column heading still orders the list by its own column, both
 *   directions, and the order still holds when you move between pages) → this file,
 *   as ONE test. It is the only `playwright`-tagged criterion in the story.
 * - AC-4 (masking in the listing, deliberate reveal in the detail), AC-5 (every row
 *   control still works, and an Importer still sees no decision controls) and AC-6
 *   (loading / empty batch / failed load with retry / narrowed-to-nothing) are the
 *   Vitest layer's, at
 *   `web/src/__tests__/integration/epic-request-list-redesign-story-5-the-listing-itself-as-a-ruled-batch-listing.test.tsx`.
 *   Deliberately NOT duplicated here.
 * - AC-1 (full-bleed, hairline rules, no card or stripes) and AC-2 (right-aligned,
 *   column-perfect figures; mono reference and account) are `none` — they are judged
 *   by eye down a column, on the story's manual checklist. Nothing here asserts a
 *   class name, a border or an alignment: that would be a styling assertion dressed
 *   up as a test, and it would pass while the listing still read as unstyled HTML.
 * - This screen's accessibility scan is not repeated here. The
 *   `expense-request-list` epic scans `/requests` in a real browser at WCAG 2.2 AA
 *   (its story 4, AC-6), and this epic's own restyled surfaces are scanned by the
 *   stories that introduce them (the control block, the field strip, the gutter).
 *
 * WHY THIS SPEC EXISTS AT ALL, given the story changes no behaviour. R1/BR2 say every
 * user-observable behaviour on this screen must still hold after the redesign, and
 * BR1 says a spec may be re-pointed at new markup but never weakened. Ordering is the
 * behaviour a restyle breaks most quietly: the listing is being taken out of its card,
 * its heading row is being rebuilt as 11px tracked mono heads, and a two-character
 * gutter is being pushed in front of the first column. Rebuild a heading row as
 * `div`s, or lose `aria-sort` while keeping an arrow glyph, and the screen still LOOKS
 * ordered while the announced state, the keyboard path and — where paging is
 * involved — the order itself are gone. So this spec asserts the CONTRACT the story's
 * own notes require to survive (real `<table>` semantics, `aria-sort` on the sortable
 * heads, ordering applied across pages), and asserts it in a real browser where the
 * rebuilt markup actually renders.
 *
 * TDD status, stated honestly: AC-3 is a PRESERVATION criterion, so this spec is
 * written against behaviour that already ships and it is expected to pass before the
 * restyle lands — that is what a regression guard is for, and it is the only shape a
 * "still works identically" criterion can take. It turns red the moment the restyle
 * drops table semantics, drops `aria-sort`, orders by a value other than the column's
 * own, or re-slices pages without re-applying the order. Under BR1 it may be
 * re-pointed at new markup; it may not be weakened.
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
 *    shared identity source, keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` below, for this screen's single transactions
 *    read (`GET /transactions-api/v1/transactions`) and for the identity call in case
 *    a client component reads it — plus a hard block on the real services' own
 *    origins (:4424 / :4423) registered LAST, so a call addressed at a live service is
 *    aborted and fails visibly instead of being quietly answered by the
 *    origin-agnostic mocks above it.
 *
 * Every response body comes from the project-wide factories under
 * `web/src/mocks/data/` (`userInfoFor(role)`, `transactionListResponse()`,
 * `transactionsForNarrowing()`); no response shape and no canonical value is authored
 * in this file, so this spec and the Vitest layer cannot drift on the contract.
 * `GET /v1/transactions` takes no query parameters and answers
 * `{ Transactions: [...] }` — the envelope is the factory's business.
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
 * - The listing KEEPS REAL TABLE SEMANTICS through the restyle (story §Implementation
 *   notes): a `table` inside `main`, a heading row of `columnheader`s, one `row` per
 *   request. Full-bleed and hairline rules are a styling change; a grid of `div`s is
 *   not, and would fail every assertion below.
 * - A SORTABLE COLUMN is unchanged from the `expense-request-list` epic's contract
 *   (its stories 2–4, and the `csv-export` epic's specs): a `button` named for the
 *   column, inside its `columnheader`, and `aria-sort="ascending" | "descending"` on
 *   that `columnheader` — absent or `none` on every other column, because ordering is
 *   single-field. The 11px tracked mono restyle may uppercase the heading through CSS
 *   or in the markup; every heading below is matched case-insensitively on the one
 *   distinctive word of its name, so either is fine.
 * - ORDERING IS IN MEMORY over the one fetched set, and the pipeline stays
 *   narrow → order → slice (`web/src/lib/transactions/ordering.ts`, reused untouched
 *   per the story's notes). A page is a slice of an array that was ordered once — not
 *   an ordering applied per page, which is exactly what the paging half below catches.
 * - A COLUMN ORDERS BY WHAT THE ROW SHOWS, never by a value it hides: the account
 *   column orders by its visible last four digits (POPIA — ordering by the full number
 *   would arrange the rows by a value the reader may not see), and the type column by
 *   its plain-language label. Both transforms are imported from the production display
 *   module below rather than restated, so this spec cannot disagree with the screen
 *   about what a row shows.
 * - THE PAGE CONTROLS are named /next/ and /previous/ and may be `button`s or `link`s;
 *   THE PAGE-SIZE SELECTOR is the Shadcn `select` reading "…per page", offering
 *   5/10/20/50 with 20 in force until changed (R2/UI-16). Addressed exactly as the
 *   sibling specs of this screen address them, so one contract covers all of them.
 * - The screen lives inside epic 1's signed-in shell, so its content is within `main`
 *   and every query here is scoped to it — Next.js renders a permanently empty
 *   body-level `role="alert"` route announcer outside `main`.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import {
  lastFourDigitsOf,
  transactionTypeLabel,
} from '../src/lib/transactions/display';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  transactionListResponse,
  transactionsForNarrowing,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** This story's screen — the shared expense request list. */
const REQUESTS_PATH = '/requests';

/**
 * The one transactions read this screen makes, as the BROWSER addresses it: the app's
 * own `/transactions-api/*` mount point (`TRANSACTIONS_API_BASE_PATH` in
 * `web/src/lib/utils/constants.ts`), never the service's origin. No origin in the
 * glob, so it matches whichever port the app is served on (:3000 in dev, :3100 in the
 * epic-end production run).
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

/** How the sibling specs of this screen address its paging controls. */
const PAGE_SIZE_SELECTOR = /per page|page size/i;
const NEXT_PAGE = /next/i;
const PREVIOUS_PAGE = /previous|back/i;

/**
 * The page size the paging half of the test works at, so the fixture spans more than
 * one page. One of the four sizes R2/UI-16 requires to be on offer.
 */
const SMALL_PAGE_SIZE = 5;

/** Which way round a column is ordering — the two `aria-sort` values, so nothing maps. */
type SortDirection = 'ascending' | 'descending';

/** What a column orders by: a figure compared as a number, anything else as text. */
type OrderValue = string | number;

/**
 * EVERY COLUMN THE LISTING SHOWS, and what each one orders by as a reader sees it.
 *
 * AC-3 is about all of them, not a representative one, because the restyle rebuilds
 * the whole heading row at once: a rebuild that keeps `aria-sort` on the amount column
 * and loses it on the other seven is exactly the half-finished state this table
 * catches.
 *
 * `heading` is the one distinctive word of the column's name, matched
 * case-insensitively, so the 11px tracked mono restyle may shorten or uppercase a
 * heading ("ACCOUNT", "DATE") without this spec needing a change — while still naming
 * exactly one of the eight columns.
 *
 * `orderValueOf` is what the ROW SHOWS for that column, never a value it hides. The
 * account number's visible last four digits and the transaction type's plain-language
 * label come from the production display module (`lib/transactions/display.ts`) rather
 * than being restated here, because those two transforms decide what the reader is
 * ordering by — restating them would let this spec and the screen disagree about it.
 */
const ORDERABLE_COLUMNS: {
  describe: string;
  heading: RegExp;
  orderValueOf: (request: TransactionRead) => OrderValue;
}[] = [
  {
    describe: 'File',
    heading: /file/i,
    orderValueOf: (request) => request.FileName,
  },
  {
    describe: 'Reference',
    heading: /reference/i,
    orderValueOf: (request) => request.Reference,
  },
  {
    describe: 'Transaction date',
    heading: /date/i,
    // As the service wrote it: nothing about `TransactionDate` is normalised anywhere
    // in this app, and its values are fixed-width, so text order IS date order.
    orderValueOf: (request) => request.TransactionDate,
  },
  {
    describe: 'Account number (by the VISIBLE last four digits — POPIA)',
    heading: /account/i,
    orderValueOf: (request) => lastFourDigitsOf(request.AccountNumber),
  },
  {
    describe: 'Description',
    heading: /description/i,
    orderValueOf: (request) => request.Description,
  },
  {
    describe: 'Amount',
    heading: /amount/i,
    // Compared as a NUMBER. The fixture's amounts straddle the text-comparison
    // mistake deliberately (9.99, 100 and 15750), so an implementation that orders
    // figures as text fails here rather than looking plausible.
    orderValueOf: (request) => request.Amount,
  },
  {
    describe: 'Type (by the plain-language label the row shows)',
    heading: /type/i,
    orderValueOf: (request) => transactionTypeLabel(request.TransactionType),
  },
  {
    describe: 'Status',
    heading: /status/i,
    orderValueOf: (request) => request.Status,
  },
];

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
 * parameters, no server-side ordering or paging) — so anything ordered or paged on
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
 * Puts the browser in a signed-in state without driving the sign-in form and without
 * any real credential: the mock `session` cookie the Node-side auth stub maps back to
 * this role when the server-side gate asks who the session belongs to.
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

/**
 * The listing itself, addressed as a TABLE. That is the assertion, not an
 * implementation detail: the story's notes require table semantics to survive the
 * restyle, and a hand-rolled grid of `div`s would fail here first.
 */
const requestList = (page: Page): Locator =>
  listScreen(page).getByRole('table');

/**
 * A sortable column: the `columnheader` that carries the sort state, and the control
 * inside it that a user activates. Both are named for the column, so neither is
 * addressed by position — which matters more after this story than before it, because
 * the gutter (story 6) pushes a new column in front of the first one.
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
 * `.or()` is Playwright's own locator combinator (not a query fallback): UI-16 asks
 * for controls that stay on screen and become unusable, which a `button` expresses
 * natively and Shadcn's `pagination` primitive renders as an anchor — both satisfy the
 * criterion, and only one of them will exist. Addressed exactly as the sibling specs
 * of this screen address it.
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

/**
 * The choices an open Shadcn `select` is showing. Scoped to the open list rather than
 * the whole page, because Radix also renders a hidden native `select` for form
 * integration and every other field on this screen has choices of its own.
 */
const openChoices = (page: Page): Locator => page.getByRole('listbox');

/** Opens the page-size select and chooses a size. */
const choosePageSize = async (page: Page, size: number): Promise<void> => {
  await pageSizeSelector(page).click();
  // `^<size>\b` so choosing 5 can never land on 50.
  await openChoices(page)
    .getByRole('option', { name: new RegExp(`^${String(size)}\\b`) })
    .click();
};

/**
 * The references of the requests currently on screen, in the order the rows appear.
 *
 * Each row is matched back to the request it came from by that request's own
 * reference, so nothing here depends on which column the reference sits in, on any
 * row's position, or on how the restyled cells are laid out — and the returned order
 * IS what "ordered by this column" means to a reader. The heading row carries no
 * reference and is naturally skipped.
 */
const referencesOnScreen = async (
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

/** How many requests are on the page being read right now. */
const requestsOnPage = async (
  page: Page,
  served: TransactionRead[],
): Promise<number> => (await referencesOnScreen(page, served)).length;

/**
 * Numbers by value, everything else as text. The fixture's text values order the same
 * way under a plain comparison and under locale collation, so nothing here pins the
 * app to one or the other — only to ordering by the column's own value.
 */
const compareValues = (first: OrderValue, second: OrderValue): number => {
  if (typeof first === 'number' && typeof second === 'number') {
    return first - second;
  }
  const firstText = String(first);
  const secondText = String(second);
  if (firstText < secondText) {
    return -1;
  }
  return firstText > secondText ? 1 : 0;
};

/**
 * The same values, put in order — the sequence the rows on screen must already be in.
 *
 * Sorting the OBSERVED values (rather than deriving an expected sequence from the
 * fixture) is deliberate: `Array.prototype.sort` is stable, so requests whose value in
 * this column is equal — two rows from the same file, two rows with the same status —
 * keep the order they were read in. The assertion therefore states "these values are
 * in order" without also dictating how the app breaks a tie, which is not something
 * AC-3 asks for and not something a reader can see.
 *
 * Descending NEGATES the comparison rather than reversing the result, for the same
 * reason: reversing would move tied rows and turn a stability difference into a
 * failure.
 */
const inOrder = (
  values: OrderValue[],
  direction: SortDirection,
): OrderValue[] =>
  [...values].sort(
    (first, second) =>
      (direction === 'ascending' ? 1 : -1) * compareValues(first, second),
  );

/**
 * What is on screen right now, read once: which requests, and what each of them shows
 * in the column under test.
 */
const orderingOnScreen = async (
  page: Page,
  served: TransactionRead[],
  orderValueOf: (request: TransactionRead) => OrderValue,
): Promise<{ references: string[]; values: OrderValue[] }> => {
  const references = await referencesOnScreen(page, served);
  const byReference = new Map(
    served.map((request) => [request.Reference, request] as const),
  );
  const values = references.flatMap((reference) => {
    const request = byReference.get(reference);
    return request === undefined ? [] : [orderValueOf(request)];
  });
  return { references, values };
};

/**
 * The references of `requests` in amount order — the order the listing must be in
 * after the amount column is ordered, and therefore the order its pages must read in.
 * Derived from the fixture's own values, so the expectation cannot drift from the data
 * the mocked service served. The fixture's amounts are all distinct, so this sequence
 * is exact rather than tie-dependent.
 */
const byAmount = (
  requests: TransactionRead[],
  direction: SortDirection,
): string[] =>
  [...requests]
    .sort((first, second) =>
      direction === 'ascending'
        ? first.Amount - second.Amount
        : second.Amount - first.Amount,
    )
    .map((request) => request.Reference);

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

test.describe('Epic request-list-redesign, Story 5: the listing itself, as a ruled batch listing', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-3
  // Two halves of one criterion, in one journey, because they are one behaviour seen
  // twice: the listing orders by whichever heading the reader activates, both ways
  // round, and that order is a property of the WHOLE narrowed set rather than of the
  // rows that happen to be on screen — so it still reads correctly when the reader
  // moves between pages.
  //
  // Half one walks all eight column headings. Half two takes the one column whose
  // values are all distinct (amount), orders it largest-first, cuts the listing into
  // pages of five, and walks forwards and back again.
  test('every column heading orders the listing by its own column in both directions, and the order still holds when moving between pages', async ({
    page,
    context,
  }) => {
    // A spread with variation in every one of the eight columns — three originating
    // files, all three statuses, both single-letter type codes plus one type the app
    // has no wording for, distinct last-four account digits, and amounts that sit
    // either side of the text-versus-number mistake. Without variation in a column,
    // "ordered by that column" is not something any test could observe.
    const served = transactionsForNarrowing();
    const servedReferences = served.map((request) => request.Reference);

    await openRequestList(page, context, served);

    // Every served request is on the one page (20 a page until changed, UI-16), so
    // the first half of this test is about ordering and nothing else.
    await expect
      .poll(() => requestsOnPage(page, served), {
        message:
          'every served request must be on the one page before ordering is asserted',
      })
      .toBe(served.length);

    // ---- Half one: every column heading, both directions.
    let previouslyOrdered: { describe: string; heading: Locator } | null = null;

    for (const column of ORDERABLE_COLUMNS) {
      const { heading, control } = sortableColumn(page, column.heading);

      await expect(
        control,
        `the ${column.describe} column must still offer a control that orders the listing by it (R13/AC-3) — the restyled heading row keeps a real button inside its columnheader`,
      ).toBeVisible();

      // First activation: ascending. `aria-sort` is the assertion AND the settle
      // signal — the heading row and the rows are re-rendered in one commit, so once
      // the column announces its direction the order below is the settled one.
      await control.click();
      await expect(
        heading,
        `activating the ${column.describe} heading must put that column into ascending order and SAY SO through aria-sort — an arrow glyph alone leaves a keyboard or screen-reader user with no idea how the listing is ordered`,
      ).toHaveAttribute('aria-sort', 'ascending');

      const ascending = await orderingOnScreen(
        page,
        served,
        column.orderValueOf,
      );
      expect(
        [...ascending.references].sort(compareValues),
        `ordering by ${column.describe} must reorder the listing, never drop or duplicate a request`,
      ).toEqual([...servedReferences].sort(compareValues));
      expect(
        ascending.values,
        `the rows must read in ascending ${column.describe} order (R13/AC-3)`,
      ).toEqual(inOrder(ascending.values, 'ascending'));

      // Single-field ordering: the column that was ordering a moment ago gives its
      // state up, so no reader is ever shown two competing sort indicators.
      if (previouslyOrdered !== null) {
        await expect(
          previouslyOrdered.heading,
          `ordering is single-field, so ${previouslyOrdered.describe} must give up its sort state once ${column.describe} takes it`,
        ).not.toHaveAttribute('aria-sort', /ascending|descending/);
      }

      // Second activation of the SAME heading: the other direction.
      await control.click();
      await expect(
        heading,
        `activating the ${column.describe} heading a second time must reverse it and announce the new direction`,
      ).toHaveAttribute('aria-sort', 'descending');

      const descending = await orderingOnScreen(
        page,
        served,
        column.orderValueOf,
      );
      expect(
        [...descending.references].sort(compareValues),
        `reversing ${column.describe} must reorder the listing, never drop or duplicate a request`,
      ).toEqual([...servedReferences].sort(compareValues));
      expect(
        descending.values,
        `the rows must read in descending ${column.describe} order (R13/AC-3)`,
      ).toEqual(inOrder(descending.values, 'descending'));

      // ...and the two directions genuinely differ, which is what proves the second
      // activation did something and that this column's values are not all alike.
      expect(
        descending.values,
        `both directions of ${column.describe} must be reachable — the descending order must not read the same as the ascending one`,
      ).not.toEqual(ascending.values);

      previouslyOrdered = { describe: column.describe, heading };
    }

    // ---- Half two: the order survives being cut into pages.
    // Amount, largest first — an order the mocked service did not return the requests
    // in, over the one column whose values are all distinct, so each page below has
    // exactly one correct answer.
    const amount = sortableColumn(page, /amount/i);
    await amount.control.click();
    await amount.control.click();
    await expect(amount.heading).toHaveAttribute('aria-sort', 'descending');

    const largestFirst = byAmount(served, 'descending');

    // Cut the listing into pages AFTER ordering it: the reader's order must survive
    // the page size changing under it.
    await choosePageSize(page, SMALL_PAGE_SIZE);
    await expect
      .poll(() => referencesOnScreen(page, served), {
        message: `the first page must hold the ${String(SMALL_PAGE_SIZE)} largest amounts in the listing, in order — changing the page size must not discard the order the reader chose`,
      })
      .toEqual(largestFirst.slice(0, SMALL_PAGE_SIZE));

    // The next page CONTINUES the same order — it does not re-order its own five
    // rows, and it does not fall back to the order the service sent.
    await pageControl(page, NEXT_PAGE).click();
    await expect
      .poll(() => referencesOnScreen(page, served), {
        message:
          'the second page must continue the same ordering — a page is a slice of a listing that was ordered once, not an ordering applied per page',
      })
      .toEqual(largestFirst.slice(SMALL_PAGE_SIZE));
    await expect(
      amount.heading,
      'the ordering column must still announce its direction on a later page — a reader who has moved off page one still has to know how the listing is ordered',
    ).toHaveAttribute('aria-sort', 'descending');

    // ...and going back gives the first page as it was, still in that order.
    await pageControl(page, PREVIOUS_PAGE).click();
    await expect
      .poll(() => referencesOnScreen(page, served), {
        message:
          'going back a page must return the first page of the same ordering, unchanged',
      })
      .toEqual(largestFirst.slice(0, SMALL_PAGE_SIZE));
    await expect(amount.heading).toHaveAttribute('aria-sort', 'descending');
  });
});
