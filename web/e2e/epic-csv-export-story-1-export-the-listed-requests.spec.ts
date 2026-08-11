/**
 * Story Metadata:
 * - Epic: csv-export — Export requests for the payment system
 * - Story: 1 — Export the requests you are looking at
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R1, R2, R3, BR1, BR3, BR4, BR5, BR6, BR7
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-1 (both roles are offered the export action, and activating it SAVES A CSV
 *   FILE to the device), AC-2 (the file holds every request the search and filters
 *   left — all of them, not just the page on screen — in the order the list is
 *   sorted), AC-3 (the nine RPT-01 columns in fixed order, the FULL unmasked account
 *   number, the RAW transaction type, an empty cell for an absent decision note) and
 *   AC-5 (the file's NAME identifies it and carries the date and time) → this file.
 *   A real browser is the only place a file download can be observed at all: the
 *   download event, the name it arrives under, and the bytes that land on disk —
 *   none of which jsdom can produce.
 * - AC-4 (RFC 4180 escaping of a comma, a quotation mark or a line break) and AC-6
 *   (10,000 rows complete without freezing the screen) are the Vitest layer's, at
 *   `web/src/__tests__/integration/epic-csv-export-story-1-export-the-listed-requests.test.tsx`.
 *   Deliberately NOT duplicated here.
 * - The export CONFIRMATION and the nothing-to-export case belong to story 2, so
 *   nothing here asserts anything about a notification — including its absence.
 * - This epic's `/requests` accessibility scan is not repeated here: the
 *   `expense-request-list` epic already scans this screen in a real browser (its
 *   story 4, AC-6), and story 2 owns this epic's own confirmation surface.
 *
 * WHY EVERY TEST BELOW READS THE DELIVERED BYTES rather than settling for "a
 * download happened": this file is a hand-over to an external payment system that a
 * MACHINE reads next (brief §Goal). "Something downloaded" would pass for a
 * one-page export (AC-2's regression), for a masked account column (BR4), for a
 * UI-translated transaction type (BR5), and for columns in the wrong order (R2) —
 * every one of which breaks the receiving system silently. The same precedent the
 * `file-validation-and-retry` epic set for downloads (its story 3: read the bytes
 * and pin `suggestedFilename()`) is followed here.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * This spec never contacts a live backend and never uses a real credential
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both real services as running on this machine. Two boundaries,
 * one contract — both established by earlier epics and reused here rather than
 * rebuilt:
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
 *    origins (:4424 / :4423) registered LAST, so a call addressed at a live service
 *    is aborted and fails visibly instead of being quietly answered by the
 *    origin-agnostic mocks above it.
 *
 * Every response body comes from the project-wide factories under
 * `web/src/mocks/data/` (`userInfoFor(role)`, `transactionListResponse()`,
 * `transactionsForNarrowing()`, `transactionsInEveryStatus()`, `manyTransactions(n)`);
 * no response shape and no canonical value is authored in this file, so this spec and
 * the Vitest layer cannot drift on the contract. `GET /v1/transactions` takes no query
 * parameters and answers `{ Transactions: [...] }` — the envelope is the factory's
 * business, and the ACCOUNT NUMBERS it carries are deliberately full and unmasked,
 * which is what makes BR4 provable here at all.
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
 *   app's own same-origin `/transactions-api/...` address, and the CSV is built in
 *   the browser from that already-fetched set (brief §Data Model: there is no export
 *   endpoint and none is being added). `page.route()` cannot intercept a read issued
 *   by the Next.js server or by a Server Action — a server-side fetch bypasses these
 *   mocks and leaves for the real transactions service.
 * - THE EXPORT IS DELIVERED THROUGH `deliverFile` (`web/src/lib/files/deliverFile.ts`)
 *   — a Blob handed to a hidden anchor carrying a `download` name. That is what makes
 *   `page.waitForEvent('download')` observe it and what makes
 *   `download.suggestedFilename()` the name the app chose (AC-5). A navigation to a
 *   URL, or an `<a href>` pointing at an endpoint, would not satisfy these tests and
 *   is ruled out by the story's reuse notes.
 * - THE EXPORT CONTROL is a `button` with VISIBLE wording containing "export", inside
 *   `main`, and is offered to BOTH roles with no role check of any kind (R3, story
 *   §Implementation notes). It is matched on that word below, not on exact copy.
 * - WHAT IT EXPORTS is the ORDERED, NARROWED set — `orderRequests(narrowRequests(
 *   fetched, applied), sort)` — never `requestsOnPage` (a one-page file, AC-2) and
 *   never the raw fetched set (BR1). Derived on ACTIVATION, not memoised per render.
 * - THE NARROWING, SORTING AND PAGING CONTROLS are the `expense-request-list` epic's,
 *   addressed here with the SAME label patterns its own specs use (its stories 2–4),
 *   so the two epics state one contract: the free-text search is a `searchbox` named
 *   /search/; the pick-one filters are Shadcn `select`s whose accessible names contain
 *   "status", "file" and "type"; a sortable column is a `button` named for the column
 *   inside its `columnheader`, which carries `aria-sort`; the page controls are named
 *   /next/ and /previous/; the page-size selector reads "…per page".
 * - The screen lives inside epic 1's signed-in shell, so its content is within `main`
 *   and every query here is scoped to it — Next.js renders a permanently empty
 *   body-level `role="alert"` route announcer outside `main`.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — `/requests` has no
 * export control and no CSV builder yet.
 * ---------------------------------------------------------------------------
 */
import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import {
  lastFourDigitsOf,
  transactionTypeLabel,
} from '../src/lib/transactions/display';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER, ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  TRANSACTION_TYPE_CREDIT_CODE,
  manyTransactions,
  transactionListResponse,
  transactionsForNarrowing,
  transactionsInEveryStatus,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Download, Locator, Page } from '@playwright/test';
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

/**
 * The export control, matched on the WORD that names what it does rather than on exact
 * copy. A `button`: the file is built in the browser and handed over by `deliverFile`,
 * so there is no address to link to (story §Implementation notes).
 */
const EXPORT_ACTION = /export/i;

/** How the `expense-request-list` epic's own specs address its controls (see header). */
const TRANSACTION_TYPE_FILTER = /type/i;
const PAGE_SIZE_SELECTOR = /per page|page size/i;
const AMOUNT_COLUMN = /amount/i;
const NEXT_PAGE = /next/i;

/** The plain-language label the app gives the sample data's credit code (`C`). */
const CREDIT_TYPE_CHOICE = /credit/i;

/**
 * A byte-order mark, built from its code point rather than written as a literal so it
 * is visible in this source. Some writers put one at the head of a CSV for
 * spreadsheet compatibility; see {@link deliveredText} for why it is stripped.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);

/**
 * THE NINE RPT-01 COLUMNS, IN THE ONE ORDER THE PAYMENT SYSTEM ACCEPTS (R2, brief
 * §Data Model). Stated ONCE here — heading and value together — so the header-row
 * assertion and the row assertions cannot drift from each other, exactly as the
 * production builder is required to state them once in
 * `web/src/lib/transactions/exportCsv.ts`.
 *
 * `header` is a pattern, not exact text: the brief allows "an equally plain
 * equivalent" for the wording. What is pinned is the COUNT and the ORDER — each
 * pattern is distinctive enough that any transposition of two columns fails.
 *
 * `valueOf` is the RAW `Transaction` field in every case. Three of them are the point
 * of the story:
 * - `AccountNumber` whole and unmasked (BR4 — the one deliberate exception to the
 *   masking rule this app applies everywhere else);
 * - `TransactionType` exactly as the service sent it, never its on-screen label
 *   (BR5);
 * - `UserNote` as an EMPTY cell when the request has no decision note.
 */
const EXPORT_COLUMNS: {
  /** The RPT-01 column name, for readable failure output. */
  describe: string;
  header: RegExp;
  valueOf: (request: TransactionRead) => string;
  /** Compared as a number, because that is what the receiving system reads. */
  numeric?: true;
}[] = [
  {
    describe: 'Reference',
    header: /reference/i,
    valueOf: (request) => request.Reference,
  },
  {
    describe: 'Transaction date',
    header: /date/i,
    // As the service wrote it: nothing about `TransactionDate` is normalised anywhere
    // in this app (its format is an unverified assumption — brief §Notes & Caveats).
    valueOf: (request) => request.TransactionDate,
  },
  {
    describe: 'Account number (FULL, unmasked — BR4)',
    header: /account/i,
    valueOf: (request) => request.AccountNumber,
  },
  {
    describe: 'Description',
    header: /description/i,
    valueOf: (request) => request.Description,
  },
  {
    describe: 'Amount',
    header: /amount/i,
    valueOf: (request) => String(request.Amount),
    numeric: true,
  },
  {
    describe: 'Transaction type (RAW service value — BR5)',
    header: /type/i,
    valueOf: (request) => request.TransactionType,
  },
  {
    describe: 'Currency',
    header: /currency/i,
    valueOf: (request) => request.Currency,
  },
  {
    describe: 'Status',
    header: /status/i,
    valueOf: (request) => request.Status,
  },
  {
    describe: 'Decision note (empty where there is none)',
    header: /note/i,
    valueOf: (request) => request.UserNote ?? '',
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
 * never disagree with what the Node-side stub returns for the same session.
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
 * ordered or paged, on screen OR in the exported file, was done by the app itself.
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

/** The request list itself. */
const requestList = (page: Page): Locator =>
  listScreen(page).getByRole('table');

/** The control that produces the file. */
const exportAction = (page: Page): Locator =>
  listScreen(page).getByRole('button', { name: EXPORT_ACTION });

/**
 * The references of the requests currently ON SCREEN, in the order the rows appear.
 *
 * Each row is matched back to the request it came from by that request's own
 * reference, so nothing depends on which column the reference sits in or on any row's
 * position. The identical rule is used to read the exported FILE below
 * ({@link referencesIn}), which is what makes "the file holds what the screen was
 * showing, and more of it" a comparison of like with like.
 */
const referencesOnScreen = async (
  page: Page,
  served: TransactionRead[],
): Promise<string[]> => {
  const rowTexts = await requestList(page).getByRole('row').allInnerTexts();
  return referencesIn(rowTexts, served);
};

/** How many requests are on the page being read right now. */
const requestsOnPage = async (
  page: Page,
  served: TransactionRead[],
): Promise<number> => (await referencesOnScreen(page, served)).length;

/** One of the pick-one filters from the request-list epic's story 2. */
const filterSelector = (page: Page, name: RegExp): Locator =>
  listScreen(page).getByRole('combobox', { name });

/** The Shadcn `select` that chooses how many requests a page holds. */
const pageSizeSelector = (page: Page): Locator =>
  listScreen(page).getByRole('combobox', { name: PAGE_SIZE_SELECTOR });

/**
 * The choices an open Shadcn `select` is showing. Scoped to the open list rather than
 * the whole page, because Radix also renders a hidden native `select` for form
 * integration and every other filter on this screen has choices of its own.
 */
const openChoices = (page: Page): Locator => page.getByRole('listbox');

/** One choice in the open list, by the way it reads. */
const choice = (page: Page, name: RegExp): Locator =>
  openChoices(page).getByRole('option', { name });

/** Opens the page-size select and chooses a size. */
const choosePageSize = async (page: Page, size: number): Promise<void> => {
  await pageSizeSelector(page).click();
  // `^<size>\b` so choosing 5 can never land on 50.
  await choice(page, new RegExp(`^${String(size)}\\b`)).click();
};

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
 * `.or()` is Playwright's own locator combinator (not a query fallback): the
 * request-list epic's R12 asks for controls that stay on screen and become unusable,
 * which a `button` expresses natively and Shadcn's `pagination` primitive renders as
 * an anchor. Addressed exactly as that epic's own specs address it.
 */
const pageControl = (page: Page, name: RegExp): Locator => {
  const screen = listScreen(page);
  return screen
    .getByRole('button', { name })
    .or(screen.getByRole('link', { name }));
};

/** Signs in as the named role with the whole request set served to the browser. */
const openRequestList = async (
  page: Page,
  context: BrowserContext,
  requests: TransactionRead[],
  roleName: string,
): Promise<void> => {
  await mockBrowserIdentityCall(page, roleName);
  await serveTransactions(page, requests);
  await blockLiveBackends(page);
  await seedSession(context, roleName);

  await page.goto(REQUESTS_PATH);
  await expect(requestList(page)).toBeVisible();
};

/** Activates the export and waits for the file the browser actually receives. */
const exportNow = async (page: Page): Promise<Download> => {
  const action = exportAction(page);
  await expect(action).toBeVisible();

  const downloadStarted = page.waitForEvent('download');
  await action.click();
  return downloadStarted;
};

/**
 * The text that actually landed on the user's disk.
 *
 * A leading byte-order mark is stripped: writing one is a legitimate
 * spreadsheet-compatibility choice that says nothing about the columns, and leaving it
 * attached would fail the header assertion for a reason nobody cares about.
 */
const deliveredText = async (download: Download): Promise<string> => {
  const contents = await readFile(await download.path(), 'utf8');
  if (contents.startsWith(BYTE_ORDER_MARK)) {
    return contents.slice(BYTE_ORDER_MARK.length);
  }
  return contents;
};

/**
 * The file's lines. Either line ending is accepted (RFC 4180 says CRLF; a lone `\n`
 * is what most writers produce), and a trailing newline at the end of the file is
 * allowed rather than counted as an empty row.
 */
const csvLinesOf = (contents: string): string[] =>
  contents.replace(/\r?\n$/, '').split(/\r?\n/);

/**
 * One line's cells, tolerating RFC 4180 quoting.
 *
 * Quoting a value that did not strictly need it is legal CSV, so a writer that quotes
 * everything must not fail these tests — hence a reader rather than a naive `split`.
 * The escaping RULES themselves (a comma, a quotation mark or a line break inside a
 * value) are AC-4's, in the Vitest layer; the fixtures used here carry no such
 * characters, which is why a per-LINE reader is enough and no multi-line record ever
 * arises.
 */
const cellsOf = (line: string): string[] => {
  const characters = [...line];
  const cells: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] ?? '';
    if (quoted) {
      if (character !== '"') {
        cell += character;
      } else if ((characters[index + 1] ?? '') === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = false;
      }
      continue;
    }
    if (character === '"' && cell === '') {
      quoted = true;
    } else if (character === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
};

/**
 * The references of the served requests that appear in `texts`, in the order they
 * appear — used for both the rows on screen and the lines in the file, so the two are
 * read by one rule. A text carrying no reference (the heading row, the header line) is
 * naturally skipped.
 */
const referencesIn = (texts: string[], served: TransactionRead[]): string[] =>
  texts.reduce<string[]>((references, text) => {
    const request = served.find((candidate) =>
      text.includes(candidate.Reference),
    );
    if (request) {
      references.push(request.Reference);
    }
    return references;
  }, []);

/** The line of the file that carries a given request, or `''` when none does. */
const lineFor = (lines: string[], request: TransactionRead): string =>
  lines.find((line) => line.includes(request.Reference)) ?? '';

/**
 * The references of `requests` in amount order — the order the list, and therefore the
 * file, must be in after the amount column is sorted. Derived from the fixture's own
 * values, so the expectation cannot drift from the data the mocked service served.
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
 * How a file name may spell a calendar day. All three separators a file name can
 * legally use are accepted — the story fixes that the day is IN the name (BR7), not
 * how it is punctuated.
 */
const daySpellings = (when: Date): string[] => {
  const year = String(when.getFullYear());
  const month = String(when.getMonth() + 1).padStart(2, '0');
  const day = String(when.getDate()).padStart(2, '0');
  return [
    `${year}-${month}-${day}`,
    `${year}${month}${day}`,
    `${year}_${month}_${day}`,
  ];
};

test.describe('Epic csv-export, Story 1: export the requests you are looking at', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-1
  // Both roles, in one test because both are one criterion (R3: the export is granted
  // to the Finance Uploader — the auth service's `Importer` — AND the Approver, with
  // no role check on the control at all, unlike upload or decide). Each role gets its
  // own browser context so neither can inherit the other's session, and each must
  // receive a real CSV FILE, not merely be shown a control.
  test('both the Finance Uploader and the Approver are offered the export, and activating it saves a CSV file', async ({
    browser,
  }) => {
    const served = transactionsInEveryStatus();

    for (const roleName of [ROLE_IMPORTER, ROLE_APPROVER]) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await openRequestList(page, context, served, roleName);

        await expect(
          exportAction(page),
          `${roleName} must be offered the export action on the request list (R3)`,
        ).toBeVisible();

        const download = await exportNow(page);

        // A file really reached this user — not a cancelled or failed transfer.
        expect(
          await download.failure(),
          `the export must deliver a file to ${roleName}`,
        ).toBeNull();

        // ...as a CSV.
        expect(
          download.suggestedFilename(),
          `${roleName}'s export must arrive as a .csv file (R1)`,
        ).toMatch(/\.csv$/i);

        // ...and it holds the requests that were listed, one line each under a header
        // row — so this is the export, not an empty or junk file. WHICH requests, in
        // WHAT order, is AC-2's business; the nine columns are AC-3's.
        const lines = csvLinesOf(await deliveredText(download));
        expect(
          lines,
          `${roleName}'s file must hold a header row plus one line per listed request`,
        ).toHaveLength(served.length + 1);
        expect(
          referencesIn(lines.slice(1), served),
          `every request listed for ${roleName} must be in their file`,
        ).toEqual(served.map((request) => request.Reference));
      } finally {
        await context.close();
      }
    }
  });

  // AC-2
  // THE HIGHEST-VALUE ASSERTION IN THIS SPEC. The list's pipeline is narrow → order →
  // slice, so the array the ROWS render from is one page of the ordered, narrowed set.
  // An implementation that exports that array ships a five-row file that looks
  // perfectly fine on screen. So: narrow the list, order it, move to a LATER page, and
  // then export — the file must hold every matching request in that order, and none of
  // the requests the narrowing removed.
  test('the file holds every request the filters left, in the current sort order — not just the page on screen', async ({
    page,
    context,
  }) => {
    const served = manyTransactions(45);
    const credits = served.filter(
      (request) => request.TransactionType === TRANSACTION_TYPE_CREDIT_CODE,
    );
    const debits = served.filter(
      (request) => request.TransactionType !== TRANSACTION_TYPE_CREDIT_CODE,
    );
    // The largest amount in the whole set belongs to a request the narrowing removes,
    // so it is the single most telling thing that must not be in the file: it would
    // head the list had the WHOLE fetched set been exported (BR1).
    const [largestExcluded = ''] = byAmount(debits, 'descending');
    const pageSize = 5;

    await openRequestList(page, context, served, ROLE_IMPORTER);

    // Narrow first: only the credits are still listed.
    await filterSelector(page, TRANSACTION_TYPE_FILTER).click();
    await choice(page, CREDIT_TYPE_CHOICE).click();

    // A small page, so the narrowed set spans several pages.
    await choosePageSize(page, pageSize);

    // Then order it, largest first — an order the mocked service did not return the
    // requests in, so any ordering in the file was applied by the app.
    const amount = sortableColumn(page, AMOUNT_COLUMN);
    await amount.control.click();
    await amount.control.click();
    await expect(amount.heading).toHaveAttribute('aria-sort', 'descending');

    // Move off the first page. Asserting what is on screen here is the PRECONDITION
    // the whole test rests on: the rows now show five of the narrowed requests, from
    // the middle of the order — so a file that matches the screen is a bug, and a file
    // that matches the whole narrowed set is the behaviour asked for.
    const narrowedOrder = byAmount(credits, 'descending');
    await pageControl(page, NEXT_PAGE).click();
    await expect
      .poll(() => referencesOnScreen(page, served), {
        message:
          'the second page of the narrowed, ordered list must be on screen before the export is asked for',
      })
      .toEqual(narrowedOrder.slice(pageSize, pageSize * 2));
    expect(
      await requestsOnPage(page, served),
      `the page on screen holds only its own ${String(pageSize)} requests — the file below must hold all ${String(credits.length)} the narrowing left`,
    ).toBe(pageSize);

    const contents = await deliveredText(await exportNow(page));
    const lines = csvLinesOf(contents);

    // EVERY narrowed request, in the order the list is sorted — not the five on
    // screen, and not the 45 that were fetched.
    expect(
      referencesIn(lines.slice(1), served),
      'the file must hold every request the filters left, in the order the list is sorted (BR1) — not the page on screen, and not the whole fetched set',
    ).toEqual(narrowedOrder);

    // One line per request, plus the header — so nothing was written twice.
    expect(
      lines,
      'the file must hold a header row plus exactly one line per matching request',
    ).toHaveLength(credits.length + 1);

    // And the request the narrowing removed is nowhere in the file, even though its
    // amount would have put it on the first line had the fetched set been exported.
    expect(
      contents,
      `${largestExcluded} was filtered out of the list, so it must not be in the file (BR1)`,
    ).not.toContain(largestExcluded);
  });

  // AC-3
  // What a MACHINE reads next. Every served request is checked, cell by cell, against
  // the one column table above — so a missing column, a transposed pair, a masked
  // account number, a translated transaction type or an invented note all fail here,
  // each naming its own rule.
  test('the file names the nine RPT-01 columns in order and carries the full account number, the raw transaction type and an empty cell for an absent note', async ({
    page,
    context,
  }) => {
    // A spread with all three statuses, both single-letter type codes and one type the
    // app has no wording for — and, deliberately, no comma, quotation mark or line
    // break in any free text, since correct escaping of those is AC-4's (Vitest).
    const served = transactionsForNarrowing();
    const noteless = served.filter((request) => request.UserNote === undefined);
    const noted = served.filter((request) => request.UserNote !== undefined);
    // Preconditions, not app assertions: this test can only state anything about a
    // present and an absent decision note if the shared factory supplies both.
    expect(
      noteless,
      'the narrowing fixture in src/mocks/data/transaction.ts must include a request with no UserNote',
    ).not.toHaveLength(0);
    expect(
      noted,
      'the narrowing fixture in src/mocks/data/transaction.ts must include a request that carries a UserNote',
    ).not.toHaveLength(0);

    await openRequestList(page, context, served, ROLE_IMPORTER);

    const contents = await deliveredText(await exportNow(page));
    const lines = csvLinesOf(contents);
    const headerCells = cellsOf(lines[0] ?? '');

    // The first line names the nine columns, in the one order the payment system
    // accepts (R2).
    expect(
      headerCells,
      `the first line must name the nine RPT-01 columns: ${EXPORT_COLUMNS.map(
        (column) => column.describe,
      ).join(' · ')}`,
    ).toHaveLength(EXPORT_COLUMNS.length);
    EXPORT_COLUMNS.forEach((column, position) => {
      expect(
        headerCells[position] ?? '',
        `column ${String(position + 1)} of the header row must name ${column.describe}`,
      ).toMatch(column.header);
    });

    // Then every request's own nine values, in those same nine positions.
    for (const request of served) {
      const cells = cellsOf(lineFor(lines, request));
      expect(
        cells,
        `${request.Reference} must be written as nine values`,
      ).toHaveLength(EXPORT_COLUMNS.length);

      EXPORT_COLUMNS.forEach((column, position) => {
        const cell = cells[position] ?? '';
        const where = `${request.Reference}, ${column.describe}`;
        if (column.numeric === true) {
          // Read back as the NUMBER the service sent, which is what the receiving
          // system consumes — a currency-formatted or thousands-separated value is not.
          expect(Number(cell), where).toBe(request.Amount);
        } else {
          expect(cell, where).toBe(column.valueOf(request));
        }
      });
    }

    // BR4, stated in its own right: the account column holds the WHOLE number, never
    // the four digits the list is allowed to show. `lastFourDigitsOf` is imported from
    // the display module precisely to prove its output is NOT what was written.
    const accountPosition = EXPORT_COLUMNS.findIndex((column) =>
      /account/i.test(column.describe),
    );
    for (const request of served) {
      const accountCell =
        cellsOf(lineFor(lines, request))[accountPosition] ?? '';
      expect(
        accountCell,
        `${request.Reference}: the export carries the full account number, not the masked value the screen shows (BR4)`,
      ).not.toBe(lastFourDigitsOf(request.AccountNumber));
    }

    // BR5, likewise: the transaction type is the service's own value, so none of the
    // plain-language labels the SCREEN shows for those values may appear anywhere in
    // the file. Only labels that actually differ from the raw value are checked — a
    // value the app has no wording for is passed through unchanged, and its "label"
    // legitimately IS the raw value.
    const shownLabels = [
      ...new Set(served.map((request) => request.TransactionType)),
    ]
      .filter((type) => transactionTypeLabel(type) !== type)
      .map((type) => transactionTypeLabel(type));
    expect(
      shownLabels,
      'the fixture must include a transaction type the app has wording for, or BR5 cannot be proven',
    ).not.toHaveLength(0);
    for (const label of shownLabels) {
      expect(
        contents,
        `the file must carry the raw transaction type, never the on-screen label "${label}" (BR5)`,
      ).not.toContain(label);
    }

    // An absent decision note is an EMPTY cell — not the word "undefined", not "None",
    // and not a missing column that would shift everything after it.
    const notePosition = EXPORT_COLUMNS.length - 1;
    for (const request of noteless) {
      expect(
        cellsOf(lineFor(lines, request))[notePosition] ?? 'missing',
        `${request.Reference} has no decision note, so its last cell must be empty`,
      ).toBe('');
    }
  });

  // AC-5
  // The name is all the user has to tell one hand-over file from another once it is on
  // their disk (BR7), and `deliverFile` takes it from the app rather than deriving it —
  // so the app is what has to get it right.
  test('the saved file is named as an expense request export and carries the date and time it was produced', async ({
    page,
    context,
  }) => {
    const served = transactionsForNarrowing();
    await openRequestList(page, context, served, ROLE_IMPORTER);

    // The day is read either side of the export, so a run that crosses midnight is not
    // a failure. Both are the BROWSER's own machine's day, which is the day the app
    // names the file for.
    const before = new Date();
    const download = await exportNow(page);
    const after = new Date();

    const name = download.suggestedFilename();

    expect(name, 'the export is saved as a .csv file').toMatch(/\.csv$/i);

    // It says what it holds: an expense request export, not "download" or a bare
    // timestamp.
    expect(
      name,
      'the file name must identify what it holds — an expense request export (BR7)',
    ).toMatch(/expense/i);
    expect(
      name,
      'the file name must identify what it holds — an expense request export (BR7)',
    ).toMatch(/requests?/i);

    // It carries the day it was produced.
    const days = [
      ...new Set([...daySpellings(before), ...daySpellings(after)]),
    ];
    const dayPattern = new RegExp(`(${days.join('|')})`);
    expect(
      name,
      `the file name must carry the date it was produced, one of: ${days.join(', ')} (BR7)`,
    ).toMatch(dayPattern);

    // ...and a time of day as well as the day, which is what keeps two exports on the
    // same day apart. Checked in what is LEFT once the day itself is removed, so the
    // day's own digits cannot be mistaken for a time, and without assuming the time
    // comes after the date.
    //
    // Deliberately NOT asserted by exporting twice and comparing the two names: two
    // exports a fraction of a second apart can legitimately land in the same second,
    // which would make that assertion flaky rather than meaningful. The story's manual
    // checklist carries the human comparison.
    expect(
      name.replace(dayPattern, ' '),
      'the file name must carry the time of day as well as the date, so two exports on the same day do not collide (BR7)',
    ).toMatch(/\d{2}\D?\d{2}/);
  });
});
