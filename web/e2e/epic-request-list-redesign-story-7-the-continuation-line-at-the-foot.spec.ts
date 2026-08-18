/**
 * Story Metadata:
 * - Epic: request-list-redesign — Redesign the request list as a batch listing
 * - Story: 7 — The continuation line at the foot
 * - Route: /requests
 * - Target File: web/src/components/requests/RequestListPagination.tsx
 * - Page Action: modify_existing
 * - Requirements: R14, R2 (UI-16), R10, BR2
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-3 (forward and back walk the same requests in the same order; a page-size
 *   change re-cuts from the first page) and AC-5 (the continuation line and the
 *   listing hold their shape at one request, at a page of 50, and across a
 *   428-request batch spanning 22 pages) → this file.
 * - AC-1 (the foot reads as ONE continuation line rather than a row of controls),
 *   AC-2 (the requests-per-page choice is a field, still 5/10/20/50, still starting
 *   at 20) and AC-4 (a set that fits one page leaves the navigation on screen and
 *   visibly unusable) are the Vitest layer's, at
 *   `web/src/__tests__/integration/epic-request-list-redesign-story-7-the-continuation-line-at-the-foot.test.tsx`.
 *   Deliberately NOT duplicated here.
 * - Accessibility is NOT scanned here: this epic redesigns one screen, so its axe
 *   scan belongs to the shared-surface story that owns the whole redesigned
 *   `/requests` page, not to each story that restyles a band of it. The WCAG 2.2 AA
 *   scan of this screen as a whole already exists at
 *   `epic-expense-request-list-story-4-sort-and-page.spec.ts` and must keep passing.
 *
 * WHAT THIS SPEC ASSERTS, AND WHAT IT DELIBERATELY DOES NOT. R14 changes the foot of
 * the listing from a row of controls into a continuation line —
 * `RECORDS 1–20 OF 428 · PAGE 1 OF 22`. The NUMBERS in that line, and the requests
 * they claim to describe, are user-observable behaviour and are pinned here. The
 * NOTATION around them (uppercase tracking, the en dash, the middle dot, mono
 * numerals, the ruled field) is presentation, is AC-1/AC-2's business in Vitest and
 * the manual checklist's, and is read case- and separator-insensitively below — so a
 * legitimate styling decision cannot fail this spec, and a wrong number cannot pass
 * it.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * This spec never contacts a live backend and never uses a real credential
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both real services as running on this machine. `dataSource` is
 * `existing-api` and there is no MSW runtime layer, so the same two boundaries every
 * spec in this repo uses are reused here rather than rebuilt:
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
 * `manyTransactions(n)`); no response shape and no canonical value is authored in
 * this file, so this spec and the Vitest layer cannot drift on the contract.
 * `GET /v1/transactions` takes no query parameters and answers
 * `{ Transactions: [...] }` — the envelope is the factory's business. The route
 * handler reads a holder the test swaps, so ONE spec can serve 428 requests and then
 * a single request without unrouting anything (see `mockTheBackend`).
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
 *   app's own same-origin `/transactions-api/...` address, i.e. from a client
 *   component. `page.route()` cannot intercept a read issued by the Next.js server
 *   or by a Server Action — a server-side fetch bypasses these mocks and leaves for
 *   the real transactions service.
 * - Paging stays IN MEMORY over that one fetched set (the endpoint accepts no
 *   parameters), applied after the narrowing and ordering from the
 *   `expense-request-list` epic. Nothing here re-reads the service to change page.
 * - THE CONTINUATION LINE states both halves R14 names: which records are shown out
 *   of how many (`RECORDS 1–20 OF 428`) and which page of how many
 *   (`PAGE 1 OF 22`). It is read out of the screen's text below, so the two halves
 *   may be split across as many elements as the notation needs (mono numerals in
 *   their own spans is expected) — but exactly ONE of each must appear on the
 *   screen, because a reader cannot act on two disagreeing statements of where they
 *   are. Both halves must be TEXT in the page, not a `title`/`aria-label` on an
 *   icon.
 * - THE PAGE CONTROLS that move between pages are named /next/ and /previous/, and
 *   are `button`s or `link`s — both are accepted below, exactly as this screen's
 *   existing specs accept them, so the redesign is free to recompose them (R2/AC-4
 *   still require them present-but-unusable rather than removed, which the Vitest
 *   layer asserts).
 * - THE PAGE-SIZE SELECTOR stays the Shadcn `select` (never a native `<select>` —
 *   the keyboard bar cannot be evidenced against an OS-drawn option list), labelled
 *   so it reads "…per page". R14 restyles it as a ruled FIELD; "field" is a styling
 *   decision, not a semantic one, so it is still addressed here as a labelled
 *   `combobox` with `option`s. The 5/10/20/50 choice itself is owned by
 *   `PAGINATION.PAGE_SIZE_OPTIONS` and is not re-declared by this story.
 * - The screen lives inside epic 1's signed-in shell, so its content is within
 *   `main` and every query here is scoped to it — Next.js renders a permanently
 *   empty body-level `role="alert"` route announcer outside `main`.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — today's foot
 * states "45 requests" and "Page 1 of 3" and never states which records are on
 * screen, so no continuation line can be read from it at all.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  manyTransactions,
  transactionListResponse,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** This story's screen. */
const REQUESTS_PATH = '/requests';

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
 * R2/UI-16: the size a page holds until the reader changes it, and the two other
 * sizes this spec re-cuts the batch at. The choice itself lives in
 * `PAGINATION.PAGE_SIZE_OPTIONS` — these are the members of it this spec exercises.
 */
const DEFAULT_PAGE_SIZE = 20;
const SMALLER_PAGE_SIZE = 10;
const LARGEST_PAGE_SIZE = 50;

/**
 * The volumes R10 and the design brief §5 name. 428 is the brief's own figure, and
 * the assertion in the volume test below pins it to the 22 pages the brief states —
 * so the fixture and the design cannot silently drift apart.
 */
const BATCH_SIZE = 428;
const BATCH_PAGES_AT_DEFAULT_SIZE = 22;
const ONE_REQUEST = 1;

/** A middling set: enough for three pages at the default size, small enough to walk. */
const WALKABLE_SIZE = 45;

/** How the foot's controls are addressed (see header). */
const PAGE_SIZE_SELECTOR = /per page|page size/i;
const NEXT_PAGE = /next/i;
const PREVIOUS_PAGE = /previous|back/i;

/** A column head that must still be there at every volume (R13's listing). */
const REFERENCE_COLUMN = /reference/i;

/**
 * The two halves of the continuation line, read out of the screen's own text.
 *
 * Notation is deliberately not pinned: case is free (the line is tracked uppercase,
 * which Chromium's `innerText` reports as rendered), the range separator may be an
 * en dash, an em dash or a hyphen, and the two halves may be joined by whatever
 * divider the design uses. The range's second number is optional so that a single
 * record may legitimately read `RECORDS 1 OF 1` instead of `RECORDS 1–1 OF 1` — both
 * state the same truth, and the assertion made of it is identical either way.
 */
const RECORDS_RANGE = /records\s+(\d+)(?:\s*[–—-]\s*(\d+))?\s+of\s+(\d+)/gi;
const PAGE_COUNTER = /page\s+(\d+)\s+of\s+(\d+)/gi;

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
 * row's position — and the returned order IS what "the same requests in the same
 * order" means to a reader. The heading row carries no reference and is naturally
 * skipped. Addressed exactly as `epic-expense-request-list-story-4-sort-and-page`
 * addresses it, so the two specs state one contract for the listing.
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

/** A page control, whether it is rendered as a button or as a link. */
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
 * The choices an open Shadcn `select` is showing. Scoped to the open list rather
 * than the whole page, because Radix also renders a hidden native `select` for form
 * integration and other filters on this screen have choices of their own.
 */
const openChoices = (page: Page): Locator => page.getByRole('listbox');

/** Opens the page-size field and chooses a size with the pointer. */
const choosePageSize = async (page: Page, size: number): Promise<void> => {
  await pageSizeSelector(page).click();
  // `^<size>\b` so choosing 5 can never land on 50.
  await openChoices(page)
    .getByRole('option', { name: new RegExp(`^${String(size)}\\b`) })
    .click();
};

/** How many pages a set of `total` requests fills at `pageSize`; never below 1. */
const pagesFor = (total: number, pageSize: number): number =>
  Math.max(1, Math.ceil(total / pageSize));

/** Where a page starts and ends within the set, as the reader counts (from 1). */
const recordsOnPage = (
  pageNumber: number,
  pageSize: number,
  total: number,
): { firstRecord: number; lastRecord: number } => ({
  firstRecord: (pageNumber - 1) * pageSize + 1,
  // `Math.min` is the naive-range mistake AC-5 exists to catch: the last page of 428
  // at 20 a page ends at 428, not at 440.
  lastRecord: Math.min(pageNumber * pageSize, total),
});

interface ContinuationFigures {
  firstRecord: number;
  lastRecord: number;
  totalRecords: number;
  pageNumber: number;
  pageCount: number;
}

/**
 * The continuation line's figures as one plain sentence, e.g.
 * `records 1-20 of 428, page 1 of 22`.
 *
 * Both the expectation and the reading of the screen go through this one form, so a
 * failure prints the two lines side by side in a reader's own terms rather than as a
 * diff of five numbers.
 */
const continuationSummary = ({
  firstRecord,
  lastRecord,
  totalRecords,
  pageNumber,
  pageCount,
}: ContinuationFigures): string =>
  `records ${String(firstRecord)}-${String(lastRecord)} of ${String(totalRecords)}, ` +
  `page ${String(pageNumber)} of ${String(pageCount)}`;

/**
 * What the foot of the listing currently says, in {@link continuationSummary}'s
 * form.
 *
 * Read from the screen's text rather than from a single element, because the
 * numerals sit in their own mono spans (R14/§Figures in mono) and a one-element
 * query would pin markup instead of behaviour. When the screen does not carry
 * exactly one statement of each half, the returned sentence SAYS SO instead of
 * throwing — so it can be polled, and so the failure names what was wrong with the
 * foot rather than reporting a timeout.
 */
const continuationLineOf = async (page: Page): Promise<string> => {
  const shown = await listScreen(page).innerText();
  const ranges = [...shown.matchAll(RECORDS_RANGE)];
  const counters = [...shown.matchAll(PAGE_COUNTER)];

  if (ranges.length !== 1 || counters.length !== 1) {
    return (
      `the screen states the records range ${String(ranges.length)} time(s) and the ` +
      `page counter ${String(counters.length)} time(s); the foot of the listing must ` +
      `state exactly one of each (R14)`
    );
  }

  const [, rangeStart, rangeEnd, total] = ranges[0];
  const [, pageNumber, pageCount] = counters[0];
  return continuationSummary({
    firstRecord: Number(rangeStart),
    // A single-record page may legitimately state one number instead of a range.
    lastRecord: Number(rangeEnd ?? rangeStart),
    totalRecords: Number(total),
    pageNumber: Number(pageNumber),
    pageCount: Number(pageCount),
  });
};

/** Waits for the foot to state exactly these figures, and says which state failed. */
const expectContinuationLine = async (
  page: Page,
  figures: ContinuationFigures,
  state: string,
): Promise<void> => {
  await expect
    .poll(() => continuationLineOf(page), {
      message: `the continuation line at the foot of the listing (${state})`,
    })
    .toBe(continuationSummary(figures));
};

/** Waits for exactly this many requests to be on the page. */
const expectRequestsOnPage = async (
  page: Page,
  served: TransactionRead[],
  expected: number,
  state: string,
): Promise<void> => {
  await expect
    .poll(() => requestsOnPage(page, served), {
      message: `how many requests the page holds (${state})`,
    })
    .toBe(expected);
};

/**
 * Mocks both boundaries once and returns the way to open the screen with a given set
 * of requests served.
 *
 * The set lives in a holder the returned function swaps, so one test can open the
 * screen at 428 requests and then at one request without re-routing: the single
 * route handler answers whatever the holder is currently carrying, which is also
 * what the screen's own self-refresh poll then keeps receiving.
 */
const mockTheBackend = async (
  page: Page,
  context: BrowserContext,
): Promise<(requests: TransactionRead[]) => Promise<void>> => {
  const holder: { requests: TransactionRead[] } = { requests: [] };

  // Answered from the shared userinfo source, so a browser-side identity read can
  // never disagree with what the Node-side stub returns for the same session.
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(userInfoFor(ROLE_IMPORTER))),
  );
  // The whole set in one response, as the real endpoint answers it (no query
  // parameters, no server-side paging) — so anything paged on screen was paged by
  // the app itself.
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse(holder.requests))),
  );
  await blockLiveBackends(page);
  await seedSession(context, ROLE_IMPORTER);

  return async (requests: TransactionRead[]): Promise<void> => {
    holder.requests = requests;
    await page.goto(REQUESTS_PATH);
    await expect(requestList(page)).toBeVisible();
  };
};

test.describe('Epic request-list-redesign, Story 7: the continuation line at the foot', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-3
  // Two halves of one criterion, both about the requests themselves rather than the
  // notation: paging forward and then back must land the reader on the very same
  // requests in the very same order (nothing skipped, nothing repeated, nothing
  // re-ordered), and changing how many a page holds must re-cut the set from the
  // FIRST page rather than leaving the reader at a stale offset. The continuation
  // line is asserted at every stop, because a line that keeps saying "page 1" while
  // the rows move is the failure this redesign makes easy.
  test('paging forward and back walks the same requests in the same order, and changing the page size re-cuts the list from the first page', async ({
    page,
    context,
  }) => {
    const requests = manyTransactions(WALKABLE_SIZE);
    const pageCount = pagesFor(WALKABLE_SIZE, DEFAULT_PAGE_SIZE);
    const openWith = await mockTheBackend(page, context);
    await openWith(requests);

    const lineFor = (
      pageNumber: number,
      pageSize: number,
    ): ContinuationFigures => ({
      ...recordsOnPage(pageNumber, pageSize, WALKABLE_SIZE),
      totalRecords: WALKABLE_SIZE,
      pageNumber,
      pageCount: pagesFor(WALKABLE_SIZE, pageSize),
    });

    // ---- Page 1, as it lands: 20 a page (R2), and the foot says exactly that.
    await expectRequestsOnPage(
      page,
      requests,
      DEFAULT_PAGE_SIZE,
      'first page, default size',
    );
    await expectContinuationLine(page, lineFor(1, DEFAULT_PAGE_SIZE), 'page 1');
    const firstPage = await referencesInOrder(page, requests);

    // ---- Forward through every page, capturing what each one holds.
    await pageControl(page, NEXT_PAGE).click();
    await expectContinuationLine(page, lineFor(2, DEFAULT_PAGE_SIZE), 'page 2');
    const secondPage = await referencesInOrder(page, requests);

    await pageControl(page, NEXT_PAGE).click();
    await expectContinuationLine(
      page,
      lineFor(pageCount, DEFAULT_PAGE_SIZE),
      'last page',
    );
    const lastPage = await referencesInOrder(page, requests);
    expect(
      lastPage,
      'the last page must hold the remainder of the set, not a full page padded out',
    ).toHaveLength(WALKABLE_SIZE - DEFAULT_PAGE_SIZE * (pageCount - 1));

    // Walking the pages must walk THE SET: every served request seen exactly once,
    // none invented, none skipped, none repeated on a second page.
    const walked = [...firstPage, ...secondPage, ...lastPage];
    expect(
      [...walked].sort(),
      'paging through every page must show each served request exactly once',
    ).toEqual(requests.map((request) => request.Reference).sort());

    // ---- And back again: the same requests, in the same order, on each page.
    await pageControl(page, PREVIOUS_PAGE).click();
    await expectContinuationLine(
      page,
      lineFor(2, DEFAULT_PAGE_SIZE),
      'back to page 2',
    );
    await expect
      .poll(() => referencesInOrder(page, requests), {
        message:
          'going back a page must return the reader to the same requests in the same order',
      })
      .toEqual(secondPage);

    await pageControl(page, PREVIOUS_PAGE).click();
    await expectContinuationLine(
      page,
      lineFor(1, DEFAULT_PAGE_SIZE),
      'back to page 1',
    );
    await expect
      .poll(() => referencesInOrder(page, requests), {
        message:
          'going back to the first page must return the reader to the same requests in the same order',
      })
      .toEqual(firstPage);

    // ---- A page-size change re-cuts from the first page. Made from the LAST page,
    // because an implementation that merely keeps its page index would leave the
    // reader stranded mid-set — which is exactly what the assertion below catches:
    // the requests shown must be the first ten of the walked order, not the tenth
    // through twentieth of it.
    await pageControl(page, NEXT_PAGE).click();
    await pageControl(page, NEXT_PAGE).click();
    await expectContinuationLine(
      page,
      lineFor(pageCount, DEFAULT_PAGE_SIZE),
      'on the last page before the page size is changed',
    );

    await choosePageSize(page, SMALLER_PAGE_SIZE);
    await expectContinuationLine(
      page,
      lineFor(1, SMALLER_PAGE_SIZE),
      `re-cut at ${String(SMALLER_PAGE_SIZE)} a page`,
    );
    await expect
      .poll(() => referencesInOrder(page, requests), {
        message: `changing the page size must re-cut the list from the first page (R2)`,
      })
      .toEqual(walked.slice(0, SMALLER_PAGE_SIZE));
  });

  // AC-5
  // The volume range R10 and the design brief §5 state, at the three points that
  // matter — and both ends are where implementations actually break:
  //   * ONE REQUEST: the line and the listing must still be a listing (column heads,
  //     one row, a line that reads `RECORDS 1 OF 1 · PAGE 1 OF 1`), not something
  //     that has collapsed into an unfinished empty state.
  //   * THE FINAL PAGE OF A 428-REQUEST BATCH: `RECORDS 421–428 OF 428`, where a
  //     naive range calculation overshoots to 440 and the row count disagrees with
  //     the line.
  // A page of 50 sits between them. Walked page by page rather than jumped, because
  // the range has to be right on every one of the 22 pages, not only at the ends.
  test('the continuation line and the listing hold their shape at one request, at a page of 50 and across a 428-request batch spanning 22 pages', async ({
    page,
    context,
  }) => {
    // 22 page loads' worth of paging over a 428-request set: more than the default
    // per-test budget allows, and nothing here waits on a timer.
    test.slow();

    // The brief's own figures, pinned to each other so the fixture cannot drift from
    // the design it is meant to prove.
    expect(
      pagesFor(BATCH_SIZE, DEFAULT_PAGE_SIZE),
      `design brief §5: ${String(BATCH_SIZE)} requests at ${String(DEFAULT_PAGE_SIZE)} a page is a ${String(BATCH_PAGES_AT_DEFAULT_SIZE)}-page batch`,
    ).toBe(BATCH_PAGES_AT_DEFAULT_SIZE);

    const batch = manyTransactions(BATCH_SIZE);
    const openWith = await mockTheBackend(page, context);
    await openWith(batch);

    // ---- 428 requests, 20 a page: the first page.
    await expect(
      listScreen(page).getByRole('columnheader', { name: REFERENCE_COLUMN }),
      'the listing keeps its column heads at batch volume (R13)',
    ).toBeVisible();
    await expectRequestsOnPage(
      page,
      batch,
      DEFAULT_PAGE_SIZE,
      `first page of ${String(BATCH_SIZE)}`,
    );
    await expectContinuationLine(
      page,
      {
        ...recordsOnPage(1, DEFAULT_PAGE_SIZE, BATCH_SIZE),
        totalRecords: BATCH_SIZE,
        pageNumber: 1,
        pageCount: BATCH_PAGES_AT_DEFAULT_SIZE,
      },
      `page 1 of ${String(BATCH_PAGES_AT_DEFAULT_SIZE)}`,
    );

    // ---- Every remaining page, to the end of the batch. The range must be right on
    // each one; the last one is the overshoot case (RECORDS 421–428 OF 428).
    for (
      let pageNumber = 2;
      pageNumber <= BATCH_PAGES_AT_DEFAULT_SIZE;
      pageNumber += 1
    ) {
      await pageControl(page, NEXT_PAGE).click();
      await expectContinuationLine(
        page,
        {
          ...recordsOnPage(pageNumber, DEFAULT_PAGE_SIZE, BATCH_SIZE),
          totalRecords: BATCH_SIZE,
          pageNumber,
          pageCount: BATCH_PAGES_AT_DEFAULT_SIZE,
        },
        `page ${String(pageNumber)} of ${String(BATCH_PAGES_AT_DEFAULT_SIZE)}`,
      );
    }

    // The final page holds only the remainder, and the listing is still a listing.
    const lastPageRecords = recordsOnPage(
      BATCH_PAGES_AT_DEFAULT_SIZE,
      DEFAULT_PAGE_SIZE,
      BATCH_SIZE,
    );
    await expectRequestsOnPage(
      page,
      batch,
      lastPageRecords.lastRecord - lastPageRecords.firstRecord + 1,
      'the final page of the batch',
    );
    await expect(
      listScreen(page).getByRole('columnheader', { name: REFERENCE_COLUMN }),
      'the listing keeps its column heads on the final, part-full page (R13)',
    ).toBeVisible();

    // ---- A page of 50 over the same batch: the largest page R2 offers.
    await choosePageSize(page, LARGEST_PAGE_SIZE);
    await expectRequestsOnPage(
      page,
      batch,
      LARGEST_PAGE_SIZE,
      `a page of ${String(LARGEST_PAGE_SIZE)}`,
    );
    await expectContinuationLine(
      page,
      {
        ...recordsOnPage(1, LARGEST_PAGE_SIZE, BATCH_SIZE),
        totalRecords: BATCH_SIZE,
        pageNumber: 1,
        pageCount: pagesFor(BATCH_SIZE, LARGEST_PAGE_SIZE),
      },
      `a page of ${String(LARGEST_PAGE_SIZE)}`,
    );

    // ---- One request: the smallest volume the design must hold at. The line still
    // states a range, a total and a page of a page count, the listing still has its
    // column heads and its one row, and the navigation is still on the screen (R2 —
    // its disabled semantics are the Vitest layer's, AC-4).
    const single = manyTransactions(ONE_REQUEST);
    await openWith(single);

    await expectRequestsOnPage(
      page,
      single,
      ONE_REQUEST,
      'a batch of one request',
    );
    await expect(
      listScreen(page).getByRole('columnheader', { name: REFERENCE_COLUMN }),
      'a single request is still a listing, with its column heads (R10)',
    ).toBeVisible();
    await expect(
      requestList(page).getByText(single[0].Reference),
      'the one request must be on the screen, not replaced by an empty state',
    ).toBeVisible();
    await expect(pageControl(page, PREVIOUS_PAGE)).toBeVisible();
    await expect(pageControl(page, NEXT_PAGE)).toBeVisible();
    await expectContinuationLine(
      page,
      {
        ...recordsOnPage(1, DEFAULT_PAGE_SIZE, ONE_REQUEST),
        totalRecords: ONE_REQUEST,
        pageNumber: 1,
        pageCount: 1,
      },
      'a batch of one request',
    );
  });
});
