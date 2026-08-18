/**
 * Story Metadata:
 * - Epic: request-list-redesign — Redesign the request list as a batch listing
 * - Story: 2 — The batch's outstanding count, at a glance
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R11, R16, R19, R21, R25, BR4
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-4 (a search or filter re-states the control-block figures for what is left and
 *   keeps the whole-batch record count beside them struck through; clearing the
 *   narrowing restores the whole-batch figures and the struck-through figure
 *   disappears) → this file, one test.
 * - AC-1 (the band exists, carries all six label/figure pairs, and no page title sits
 *   above the list), AC-3 (the figures state the truth about the batch) and AC-5 (the
 *   live selected count and selected total value) → the Vitest layer,
 *   `web/src/__tests__/integration/epic-request-list-redesign-story-2-the-batchs-outstanding-count-at-a-glance.test.tsx`.
 *   Deliberately NOT duplicated here (testing-policy.md § "one tag, one layer").
 * - AC-2 (`AWAITING DECISION` is the biggest thing on screen) and AC-6 (the saturated
 *   full-width blue field in both themes) are judged by eye at MANUAL-TEST — tagged
 *   `none`, so nothing here attempts to assert them.
 * - This epic's real-browser accessibility scan belongs to the shared-surface story
 *   (story 1), so nothing here re-scans.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * (testing-policy.md § "Playwright runs against mocks, never live") — even though
 * project.md records both real services as running on this machine. This screen crosses
 * BOTH mock boundaries; epic `sign-in-and-app-shell` established each one and
 * `expense-request-list` story 2 established this exact harness for this exact screen.
 * This spec REUSES it rather than inventing a second one:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. `/requests` is gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()` cannot
 *    see a fetch the browser never makes. The stub answers that call from the shared
 *    identity source, keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` below, for this screen's one read
 *    (`GET /transactions-api/v1/transactions`) plus the identity call in case a client
 *    component reads it, and a hard block on the real services' own origins
 *    (:4424 / :4423) so no browser-side call can leak to a live backend even if the app
 *    were pointed at the wrong address.
 *
 * Every response body comes from the project-wide factories in `web/src/mocks/data/`
 * (`transactionsForNarrowing()`, `transactionListResponse()`, `userInfoFor(role)`) — no
 * response shape and no request row is authored in this file, so this spec and the
 * Vitest layer cannot drift on the contract.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - The request list is read FROM THE BROWSER — the shared API client against the app's
 *   own same-origin `/transactions-api/...` mount point. A read issued by the Next.js
 *   server or a Server Action would bypass these mocks and leave for the real service.
 * - The control block's figures are DERIVED CLIENT-SIDE from that one fetched set: no
 *   new call, no query parameter, no new field (brief §Data Model). The check at the end
 *   of the test asserts no read carried a query string at all, so an attempt to make the
 *   service aggregate or narrow fails visibly rather than silently.
 * - **The control block is addressed exactly as this story's VITEST layer addresses it**
 *   — the same contract, deliberately, so the two layers cannot be implemented onto two
 *   different DOMs:
 *     1. the block is ONE region whose accessible name contains "batch" (e.g.
 *        `<section aria-label="Batch control totals">`);
 *     2. each figure inside it is a `role="group"` whose ACCESSIBLE NAME is its label —
 *        `Batch`, `Run date`, `Records`, `Awaiting decision`, `Decided`, `Total value` —
 *        via `aria-label`, or `aria-labelledby` pointing at the visible tracked label. A
 *        `group` takes no name from its contents, so a visible 11px label alone leaves
 *        the figure unnamed for assistive technology and unfindable here. Matching is
 *        case-insensitive and anchored, so the upper-casing may be markup or CSS;
 *     3. figures print exactly as the rows print them (`lib/transactions/display.ts` —
 *        "a formatter would be the bug"): `TOTAL VALUE` reads `26136.31`, not
 *        `26 136.31` and not `R26,136.31`; `RUN DATE` reads the `TransactionDate`
 *        verbatim. Every assertion below matches the value as a WHOLE figure, so a
 *        grouped, padded or currency-prefixed rendering fails.
 * - **The struck-through whole-batch record count** (this layer's own addition to that
 *   contract, since the strike is a browser fact) carries its own accessible name saying
 *   what it is — `aria-label="Whole batch records"`, matched by `/whole batch/i` — because
 *   a line through a number says nothing to a screen reader on its own. Compose it as
 *   another labelled figure beside `RECORDS` or as an `<s aria-label>` inside that group;
 *   either is found here. Two requirements on it:
 *     1. the accessible NAME and the LINE-THROUGH must be on the SAME element — a struck
 *        number inside an unnamed wrapper, or a named wrapper around an unstruck number,
 *        fails, because computed `text-decoration-line` is read off the named element;
 *     2. it must be ABSENT from the DOM (not merely hidden) whenever no narrowing is
 *        active — R21 keeps it beside the narrowed figures, not permanently on screen.
 * - The strike must be real text decoration (`<s>` / `<del>` or a `line-through`
 *   utility), asserted here as computed `text-decoration-line` — a class name is not a
 *   user-observable fact, and jsdom cannot see this at all, which is why this half of
 *   AC-4 is here rather than in Vitest.
 * - The narrowing controls keep their existing shape (story 3 re-styles the strip but
 *   preserves every field, its label and its behaviour — brief R12/BR6): the search
 *   field is labelled with the word "search", the three pick-one filters are Shadcn
 *   `select` (Radix) triggers with role `combobox` named for the FIELD they narrow
 *   ("Status", "Originating file", "Transaction type"), their options are portalled
 *   outside `main`, and one "Clear all" action drops everything applied.
 * - The screen lives inside the signed-in shell, so its content is within `main` and
 *   every query here is scoped to it — Next.js also renders a permanently empty
 *   body-level `role="alert"` route announcer outside `main`.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie
 * (`sign-in-and-app-shell` BR2), seeded directly rather than by driving the sign-in form
 * — that journey belongs to that epic's story 2. Cookies ignore port, so one seed serves
 * the dev server (:3000) and the epic-end production run (:3100). `Secure` is omitted
 * because the E2E server is plain http on localhost.
 *
 * TIMING — nothing here waits real time. The search is debounced by design and the list
 * re-reads itself on a timer (`bulk-approval-and-live-refresh` R3), so every assertion
 * below is web-first (`toHaveText` / `toHaveCount` / `toHaveCSS` / `expect.poll`) and
 * waits for the re-stated figure on its own. No `waitForTimeout`, and no test-only
 * debounce override in production code. The mocked read answers with the same body every
 * time, so a refresh landing mid-test cannot change any figure asserted here.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend response
 * below is mocked, so no live backend is contacted and no real credentials are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — `/requests` has no
 * control block yet, so none of the six figures resolves.
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

/** The shared request list screen this epic redesigns (story metadata Route). */
const REQUESTS_ROUTE = '/requests';

/**
 * This screen's one read, as the BROWSER addresses it: the app's own
 * `/transactions-api/*` mount point (`web/src/lib/utils/constants.ts`), never the
 * transactions service's origin. The glob names no origin, so it matches whichever port
 * the app is served on (:3000 in dev, :3100 in the epic-end production run), and the
 * trailing `**` means a read that wrongly carried a query string is still intercepted —
 * so the "no query parameters" check below catches it instead of the call escaping.
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
 * The whole fetched set for this test — the shared narrowing fixture, which is also the
 * story's named known-good fixture for these aggregates (three originating files, all
 * three statuses, no two rows sharing the duplicate key).
 */
const ALL_REQUESTS = transactionsForNarrowing();

/* -------------------------------------------------------------------------- */
/* What the control block must state — STATED LITERALLY, then guarded.         */
/* -------------------------------------------------------------------------- */

/**
 * One reading of the control block. Every value here is written out as a LITERAL,
 * verified by execution and carried over from the story's Implementation notes — never
 * computed by the derivation under test, which would assert nothing.
 */
interface ControlTotals {
  /** `RECORDS` — how many requests the set holds. */
  records: string;
  /** `AWAITING DECISION` — `Status === Imported`. */
  awaiting: string;
  /** `DECIDED` — `Status !== Imported` (NOT `approved + rejected`; see below). */
  decided: string;
  /** `TOTAL VALUE` — the summed `Amount`, compared by its digits. */
  totalValue: string;
  /** The newest `TransactionDate` in the set, which is what `RUN DATE` shows. */
  newestTransactionDate: string;
}

/** The whole batch: what the band states with nothing applied. */
const WHOLE_BATCH: ControlTotals = {
  records: '8',
  awaiting: '5',
  decided: '3',
  totalValue: '26136.31',
  newestTransactionDate: '2026-04-30 17:45:00',
};

/**
 * A free-text search that leaves exactly one request (its description is the only place
 * this word appears in the fixture — the same term `expense-request-list` story 2 proved
 * unique). Chosen because all four figures then differ from the whole batch's, INCLUDING
 * `DECIDED` (3 → 0): a term that happened to leave the decided count untouched could not
 * tell a re-derived figure from a stale one.
 */
const SEARCH_TERM = 'Woolworths';

/** What the band must state while that term is applied. */
const NARROWED_BY_SEARCH: ControlTotals = {
  records: '1',
  awaiting: '1',
  decided: '0',
  totalValue: '487.32',
  newestTransactionDate: '2026-04-15 08:34:00',
};

/**
 * The originating file the filter half narrows to.
 *
 * NOT `expenses_2026-04-30.csv` (file 5002), deliberately: its newest `TransactionDate`
 * is identical to the whole set's (`2026-04-30 17:45:00`), so a `RUN DATE` that was never
 * re-derived would pass against it. This file's newest date genuinely differs, and its
 * rows also split 2 awaiting / 1 decided, so no two of its four figures coincide.
 */
const NARROWED_FILE_NAME = 'expenses_2026-04-15.csv';

/** What the band must state while that file is the only one showing. */
const NARROWED_TO_FILE: ControlTotals = {
  records: '3',
  awaiting: '2',
  decided: '1',
  totalValue: '16337.32',
  newestTransactionDate: '2026-04-15 11:03:00',
};

/** What `BATCH` reads with no originating-file narrowing active (brief §Resolved spec gap). */
const WHOLE_BATCH_NAME = /all files/i;

/**
 * The day part of a `TransactionDate`, for the one NEGATIVE `RUN DATE` assertion below.
 *
 * The positive assertions use the whole value verbatim; this is the day the narrowed
 * `RUN DATE` must NOT still be showing, and comparing on the day makes that check
 * indifferent to the time beside it. It stays decisive for the trap this story names,
 * because the whole set's newest date falls on a different DAY (2026-04-30) from the
 * narrowed file's (2026-04-15).
 */
const runDayOf = (transactionDate: string): string =>
  transactionDate.slice(0, 'YYYY-MM-DD'.length);

/* -------------------------------------------------------------------------- */
/* How the control block is addressed — the SAME contract the Vitest layer     */
/* for this story pins, so the two layers cannot drift onto two DOMs.          */
/* -------------------------------------------------------------------------- */

/** The block itself: one region whose name says which batch it is describing. */
const CONTROL_BLOCK_NAME = /batch/i;

/** The figures R11 names, by the accessible name each group must carry. */
const BATCH_FIGURE = /^batch$/i;
const RUN_DATE_FIGURE = /^run date$/i;
const RECORDS_FIGURE = /^records$/i;
const AWAITING_DECISION_FIGURE = /^awaiting decision$/i;
const DECIDED_FIGURE = /^decided$/i;
const TOTAL_VALUE_FIGURE = /^total value$/i;

/**
 * The struck-through whole-batch record count (R21) — this layer's own addition to that
 * contract, because the strike is a browser fact. Named for what it is, since a line
 * through a number says nothing to a screen reader on its own.
 */
const WHOLE_BATCH_RECORDS_FIGURE = /whole batch/i;

/* -------------------------------------------------------------------------- */
/* Fixture guard — the literals above must still describe the shared factory.  */
/* -------------------------------------------------------------------------- */

/**
 * Reads the four aggregates and the newest date straight off the fixture rows, with
 * plain expressions written here rather than by calling the app's derivation. This is a
 * DRIFT GUARD, not the assertion: if someone edits `transactionsForNarrowing()`, this
 * throws with an explanation instead of the test quietly asserting the wrong numbers.
 *
 * `decided` is `Status !== Imported`, matching the brief — NOT `countRequests()`'s
 * `approved + rejected`, which would miscount a row carrying an unrecognised status and
 * ship a wrong outstanding count (story §Implementation notes).
 */
const readTotalsOf = (requests: TransactionRead[]): ControlTotals => ({
  records: String(requests.length),
  awaiting: String(
    requests.filter((request) => request.Status === TRANSACTION_STATUS_IMPORTED)
      .length,
  ),
  decided: String(
    requests.filter((request) => request.Status !== TRANSACTION_STATUS_IMPORTED)
      .length,
  ),
  totalValue: String(
    requests.reduce((total, request) => total + request.Amount, 0),
  ),
  newestTransactionDate: requests.reduce(
    (newest, request) =>
      request.TransactionDate > newest ? request.TransactionDate : newest,
    '',
  ),
});

const guardTotals = (
  described: string,
  requests: TransactionRead[],
  expected: ControlTotals,
): void => {
  const actual = readTotalsOf(requests);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `transactionsForNarrowing() no longer produces the figures this spec states ` +
        `literally for ${described}. Expected ${JSON.stringify(expected)}, the ` +
        `fixture now gives ${JSON.stringify(actual)}. Update the literals above from ` +
        `the new fixture — never derive them with the aggregation under test.`,
    );
  }
};

guardTotals('the whole batch', ALL_REQUESTS, WHOLE_BATCH);
guardTotals(
  `the search for "${SEARCH_TERM}"`,
  ALL_REQUESTS.filter((request) => request.Description.includes(SEARCH_TERM)),
  NARROWED_BY_SEARCH,
);
guardTotals(
  `the file "${NARROWED_FILE_NAME}"`,
  ALL_REQUESTS.filter((request) => request.FileName === NARROWED_FILE_NAME),
  NARROWED_TO_FILE,
);

/**
 * The search term has to be unique to ONE request across every value the search looks at
 * (`narrowRequests`: reference, description, file name, amount, the visible last four
 * account digits), not just unique in the descriptions — otherwise the `records: '1'`
 * literal above would quietly stop describing what the screen does.
 */
const REQUESTS_MATCHING_SEARCH_TERM = ALL_REQUESTS.filter((request) =>
  [
    request.Reference,
    request.Description,
    request.FileName,
    String(request.Amount),
    request.AccountNumber,
  ].some((value) => value.toLowerCase().includes(SEARCH_TERM.toLowerCase())),
).length;

if (REQUESTS_MATCHING_SEARCH_TERM !== 1) {
  throw new Error(
    `"${SEARCH_TERM}" now matches ${String(REQUESTS_MATCHING_SEARCH_TERM)} requests in ` +
      `transactionsForNarrowing() across the fields the search covers, so the ` +
      `single-request figures this spec states for it are no longer right. Pick a term ` +
      `unique to one row.`,
  );
}

if (
  NARROWED_TO_FILE.newestTransactionDate === WHOLE_BATCH.newestTransactionDate
) {
  throw new Error(
    `The file this spec narrows to ("${NARROWED_FILE_NAME}") now shares the whole ` +
      `set's newest TransactionDate, so the RUN DATE half of this test would pass ` +
      `against an implementation that never re-derives it. Narrow to a file whose ` +
      `newest date genuinely differs.`,
  );
}

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
 * Answers a browser-side identity read from the shared userinfo source, so it can never
 * disagree with what the Node-side stub returns for the same session. The server-side
 * gate is answered by the stub, not by this route.
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
 * The body never changes: these figures are derived in the browser over one fetched set,
 * so a second read returning something different would hide the very thing under test —
 * and it means the 15s self-refresh cannot disturb a single assertion here.
 */
const serveTransactions = async (page: Page): Promise<TransactionListFeed> => {
  const urls: string[] = [];

  await page.route(TRANSACTIONS_URL_GLOB, (route) => {
    urls.push(route.request().url());
    return route.fulfill(jsonResponse(transactionListResponse(ALL_REQUESTS)));
  });

  return { urls };
};

/**
 * Puts the browser in a signed-in state without driving the sign-in form and without any
 * real credential: the mock `session` cookie the Node-side stub recognises for this role.
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
 * Signs in as an Importer, mocks both boundaries and opens the list screen.
 *
 * Both roles open this screen and read the same band (brief R27), and nothing in AC-4
 * is role-specific — the figures are derived from the same fetched set either way. The
 * one part of the band that IS role-shaped is the selection subtotal (AC-5), which is
 * the Vitest layer's.
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

/** The screen's own content, inside the signed-in shell. */
const requestsScreen = (page: Page): Locator => page.getByRole('main');

/** The control block: one region whose name says which batch it describes. */
const controlBlock = (page: Page): Locator =>
  requestsScreen(page).getByRole('region', { name: CONTROL_BLOCK_NAME });

/**
 * One of the control block's figures, addressed by the label its group is named for.
 * Anchored and case-insensitive, so the tracked upper-case rendering is free to be CSS
 * and `DECIDED` can never resolve `AWAITING DECISION`.
 */
const controlFigure = (page: Page, label: RegExp): Locator =>
  controlBlock(page).getByRole('group', { name: label });

/**
 * The whole-batch record count kept beside the narrowed figures while a narrowing is
 * active — the one element that must carry a line through it (R21).
 *
 * Addressed by `getByLabel`, which resolves any element carrying `aria-label` /
 * `aria-labelledby` (verified in a real browser), so it finds this figure whether it is
 * composed as another labelled `group` beside `RECORDS` or as a plain `<s aria-label>`
 * inside it. The name and the line-through must sit on the SAME element — see the header.
 */
const wholeBatchRecordsFigure = (page: Page): Locator =>
  controlBlock(page).getByLabel(WHOLE_BATCH_RECORDS_FIGURE);

/** The free-text search field. */
const searchField = (page: Page): Locator =>
  requestsScreen(page).getByLabel(/search/i);

/**
 * A pick-one filter, addressed by the accessible name that says which field it filters.
 * Shadcn `select` renders a Radix trigger with role `combobox`.
 */
const filterControl = (page: Page, name: RegExp): Locator =>
  requestsScreen(page).getByRole('combobox', { name });

/**
 * Chooses a value in one of the pick-one filters the way a user does: open the trigger,
 * pick the option. Options are portalled outside `main`, so they are queried at page
 * level.
 */
const chooseFilterValue = async (
  page: Page,
  filterName: RegExp,
  optionName: string,
): Promise<void> => {
  await filterControl(page, filterName).click();
  await page.getByRole('option', { name: optionName }).click();
};

/** The one action that drops the term and every filter at once. */
const clearAllAction = (page: Page): Locator =>
  requestsScreen(page).getByRole('button', { name: /clear all/i });

/* -------------------------------------------------------------------------- */
/* Assertions on the band.                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A value as a WHOLE figure — never as part of a longer one. The same construction the
 * Vitest layer for this story uses, so neither layer can be satisfied by a figure the
 * other would reject: without the lookarounds "3" is satisfied by "13", and `26136.31`
 * by `126136.310`. It also refuses a grouped or padded rendering of the same number,
 * which is the point — these figures print exactly as the rows print them
 * (`web/src/lib/transactions/display.ts`).
 */
const wholeFigure = (value: string): RegExp =>
  new RegExp(`(^|[^\\d.,])${value.replace(/\./g, '\\.')}(?![\\d.,])`);

/**
 * Asserts the four control totals read as given. Web-first, so each one waits for the
 * band to re-state itself and no assertion has to guess the search debounce.
 */
const expectControlTotals = async (
  page: Page,
  expected: ControlTotals,
): Promise<void> => {
  await expect(controlFigure(page, RECORDS_FIGURE)).toContainText(
    wholeFigure(expected.records),
  );
  await expect(controlFigure(page, AWAITING_DECISION_FIGURE)).toContainText(
    wholeFigure(expected.awaiting),
  );
  await expect(controlFigure(page, DECIDED_FIGURE)).toContainText(
    wholeFigure(expected.decided),
  );
  await expect(controlFigure(page, TOTAL_VALUE_FIGURE)).toContainText(
    wholeFigure(expected.totalValue),
  );
};

/**
 * Asserts the whole-batch record count is beside the narrowed figures with a real line
 * through it — the half of AC-4 that only a browser can answer, since jsdom computes no
 * text decoration. The name and the decoration are asserted on the SAME element, so a
 * struck number wrapped in an unnamed parent (or a named parent wrapping an unstruck
 * number) fails.
 */
const expectStruckThroughWholeBatchRecords = async (
  page: Page,
): Promise<void> => {
  await expect(wholeBatchRecordsFigure(page)).toContainText(
    wholeFigure(WHOLE_BATCH.records),
  );
  await expect(wholeBatchRecordsFigure(page)).toHaveCSS(
    'text-decoration-line',
    'line-through',
  );
};

test.describe("Epic request-list-redesign, Story 2: the batch's outstanding count, at a glance", () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-4
  test('a search or a filter re-states the control figures for what is left and keeps the whole-batch record count struck through beside them, and clearing the narrowing puts the whole-batch figures back', async ({
    page,
    context,
  }) => {
    const feed = await openRequestList(page, context);

    // The whole batch, before any narrowing: the band describes all eight requests, and
    // there is no struck-through figure to explain, because nothing is applied.
    await expectControlTotals(page, WHOLE_BATCH);
    await expect(wholeBatchRecordsFigure(page)).toHaveCount(0);

    /* ---------------------------------------------------------------- */
    /* A SEARCH narrows it.                                             */
    /* ---------------------------------------------------------------- */

    await searchField(page).fill(SEARCH_TERM);

    // All four figures now describe what is left — including DECIDED falling to 0, which
    // is what separates a re-derived figure from a stale one.
    await expectControlTotals(page, NARROWED_BY_SEARCH);

    // ...and the whole-batch record count stays beside them, with a real line through
    // it, so the reader can never forget they are inside a narrowing.
    await expectStruckThroughWholeBatchRecords(page);

    // BATCH and RUN DATE are deliberately not asserted for a search: per the brief's
    // resolved spec gap they follow the ORIGINATING-FILE narrowing, which is the next
    // step of this journey.

    /* ---------------------------------------------------------------- */
    /* Clearing the term restores the whole batch.                      */
    /* ---------------------------------------------------------------- */

    await searchField(page).fill('');

    await expectControlTotals(page, WHOLE_BATCH);
    await expect(wholeBatchRecordsFigure(page)).toHaveCount(0);

    /* ---------------------------------------------------------------- */
    /* A FILTER narrows it — and sharpens BATCH and RUN DATE with it.   */
    /* ---------------------------------------------------------------- */

    await chooseFilterValue(page, /file/i, NARROWED_FILE_NAME);

    await expectControlTotals(page, NARROWED_TO_FILE);
    await expectStruckThroughWholeBatchRecords(page);

    // Narrowed to one originating file, the band names that file instead of the whole
    // queue, and RUN DATE re-derives to that file's own newest transaction date, printed
    // as the service sent it. The whole set's newest date belongs to a DIFFERENT file on
    // a different day, so a RUN DATE that was never re-derived is caught here rather than
    // passing by coincidence — which is why this journey narrows to this file and not to
    // `expenses_2026-04-30.csv`.
    await expect(controlFigure(page, BATCH_FIGURE)).toContainText(
      NARROWED_FILE_NAME,
    );
    await expect(controlFigure(page, RUN_DATE_FIGURE)).toContainText(
      NARROWED_TO_FILE.newestTransactionDate,
    );
    await expect(controlFigure(page, RUN_DATE_FIGURE)).not.toContainText(
      runDayOf(WHOLE_BATCH.newestTransactionDate),
    );

    /* ---------------------------------------------------------------- */
    /* Clearing the narrowing puts the whole batch back.                */
    /* ---------------------------------------------------------------- */

    await clearAllAction(page).click();

    await expectControlTotals(page, WHOLE_BATCH);
    // The struck-through figure is gone, not merely re-valued: with nothing applied
    // there is no narrowing for it to explain.
    await expect(wholeBatchRecordsFigure(page)).toHaveCount(0);

    // BATCH is back to naming the whole queue rather than one file, and RUN DATE to the
    // newest transaction date in the whole fetched set.
    await expect(controlFigure(page, BATCH_FIGURE)).toContainText(
      WHOLE_BATCH_NAME,
    );
    await expect(controlFigure(page, BATCH_FIGURE)).not.toContainText(
      NARROWED_FILE_NAME,
    );
    await expect(controlFigure(page, RUN_DATE_FIGURE)).toContainText(
      WHOLE_BATCH.newestTransactionDate,
    );

    // Every figure above was derived in the browser from the one set fetched on load:
    // `GET /v1/transactions` accepts no query parameters (brief §Notes & Caveats), and
    // this story adds no call and no field (brief §Data Model), so no read may carry one.
    expect(
      feed.urls.filter((url) => url.includes('?')),
      'no read of the transaction list may carry a query string — the control totals are derived client-side over the one fetched set, and this story adds no fetch and no field',
    ).toEqual([]);
  });
});
