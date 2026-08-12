/**
 * Story Metadata:
 * - Epic: bulk-approval-and-live-refresh — Bulk approval and a self-updating list
 * - Story: 4 — The list keeps itself current
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R3, BR6, BR7, BR8, NFR2, NFR4, NFR5
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-1 (with the list open, a decision recorded elsewhere appears on the list on its
 *   own within about 15 seconds, with no reload and no action from the reader) → this
 *   file. It belongs here and nowhere else: it is a real browser round-trip — a genuine
 *   second read of the service, over a real timer, with the document that was first
 *   painted still on screen at the end. jsdom cannot prove "the page was never
 *   reloaded".
 * - AC-2 (an open confirmation, keyboard focus and the reader's narrowing/ordering/page
 *   are all left alone), AC-3 (nothing refreshes while the tab is in the background, and
 *   a refresh happens straight away on returning), AC-4 (no refresh while a
 *   bulk-approve confirmation is open or approvals are being recorded), AC-5 (a request
 *   decided elsewhere drops out of the selection and the count corrects itself) and
 *   AC-6 (the refresh is announced politely and never steals focus) are the Vitest
 *   layer's, at
 *   `web/src/__tests__/integration/epic-bulk-approval-and-live-refresh-story-4-the-list-keeps-itself-current.test.tsx`.
 *   Deliberately NOT repeated here (testing-policy.md § "one tag, one layer").
 *
 * NO ACCESSIBILITY SCAN HERE, on purpose: this story introduces no new visible state.
 * The `/requests` page-level WCAG 2.2 AA scan belongs to `expense-request-list` story 4
 * (its AC-6) and the confirmation's to `expense-decisions` story 2; the only surface
 * this story adds is a polite live region, whose politeness is asserted in the Vitest
 * layer (AC-6/NFR2) since no axe rule covers it. Story 5's "cannot refresh itself"
 * notice is the epic's one genuinely new state, and is scanned there.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * This spec never contacts a live backend and never uses a real credential
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running on this machine. Two boundaries, one
 * contract — the arrangement epics 1-5 established, reused rather than re-invented:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. `/requests` is gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()` cannot
 *    see a fetch the browser never makes. The stub answers that call from the shared
 *    identity source, keyed off the `session` cookie value seeded below — which is also
 *    what decides that the reader here is an Approver.
 * 2. Browser boundary → `page.route()` below, for the ONE call this story makes:
 *      GET /transactions-api/v1/transactions   (the list, and every refresh of it)
 *    That is the app's OWN same-origin address, so an unmocked call would be forwarded
 *    to the live transactions service by a route handler INSIDE the Next.js process,
 *    where the live-origin block cannot see it — hence the `/transactions-api/**`
 *    catch-all abort. The real services' own origins are blocked outright too,
 *    registered LAST so they win over the origin-agnostic globs above them.
 *
 * Every response body comes from the project-wide factories under `web/src/mocks/data/`
 * (`transaction.ts`, `identity.ts`, `role.ts`) — no response shape and no canonical
 * value is authored in this file, so this spec and the Vitest layer cannot drift on the
 * contract. The successive snapshots come from `transactionsAfterColleagueDecided()`,
 * which changes ONLY the named request's decision fields and preserves order, so a
 * changed row here is unmistakably a changed row and not a re-ordered list.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - The refresh is a re-read of `GET /transactions-api/v1/transactions` issued FROM THE
 *   BROWSER through `fetchTransactions()` on the shared API client — the same call the
 *   first load makes (brief §Data Model: no delta channel, no websocket, no
 *   single-request GET, and no query parameters). `page.route()` cannot intercept a read
 *   issued by the Next.js server or a Server Action, so moving the list read into one
 *   would both bypass these mocks and make a self-refresh impossible.
 * - The interval runs the WHOLE time the list is open (this epic's deliberate extension
 *   of `architecture.md`'s stop-when-idle convention), so a second refresh must arrive
 *   after the first with nothing having been clicked.
 * - BR6 fixes the cadence at 15 seconds; this spec buys each refresh by jumping the
 *   browser clock `POLL_TICK_MS` (below), so any interval up to that length passes and a
 *   list that refreshes far more slowly than the criterion's "about 15 seconds" fails.
 * - BR8 — the refresh updates the rows in place: the same requests, in the same order,
 *   in the same document. It does not re-fetch by navigating, and it does not rebuild
 *   the list from scratch.
 * - The list renders as a table (`expense-request-list` story 1), so each request is a
 *   `row` addressed by its own `Reference`, never by position, and each row carries its
 *   own Approve/Reject named for the request it decides (`expense-decisions` story 2) —
 *   which is how "this request is no longer yours to decide" is visible on screen.
 * - Everything about the list is scoped to `main`: Next renders a permanently empty
 *   body-level `role="alert"` route announcer, so an unscoped status/alert query always
 *   matches two elements.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie (epic 1
 * BR2), seeded directly rather than by driving the sign-in form — epic 1's story 2 spec
 * owns that journey. Cookies ignore port, so one seed serves the dev server (:3000) and
 * the epic-end production run (:3100). `Secure` is omitted because the E2E server is
 * plain http on localhost.
 *
 * TIMING — why nothing here waits real time:
 * The refresh is timer-driven, so the browser clock is driven with Playwright's
 * `page.clock`: `install()` before navigating (so no timer escapes the fake clock), then
 * `fastForward()` at the app's REAL configured cadence. `fastForward` fires each due
 * timer at most once, so one jump = one refresh whatever interval the implementation
 * chose. No test-only "short interval" prop in production code, no arbitrary
 * `waitForTimeout`, and no test sitting out 15 seconds — this spec's whole wall-clock
 * cost is two page loads.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): `/requests` reads the
 * list once on mount today and never re-reads it.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import {
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_WARNING_LEAD_MS,
} from '../src/lib/session/config';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER } from '../src/mocks/data/role';
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_REJECTED,
  transactionListResponse,
  transactionsAfterColleagueDecided,
  transactionsForBulkSelection,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** This story's screen (story metadata Route). */
const REQUESTS_PATH = '/requests';

/**
 * The list read, as the BROWSER addresses it: the app's own mount point, never the
 * service's origin (`web/src/lib/utils/constants.ts`). Trailing `**` so any query string
 * is covered — the endpoint itself takes none.
 */
const TRANSACTIONS_API_GLOB = '**/transactions-api/**';
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
 * Browser time bought per refresh. BR6 puts the cadence at 15 seconds and AC-1 asks for
 * the change to arrive "within about 15 seconds"; this jump clears that with margin, so
 * a slower tunable still passes while a list that only refreshes minutes later — or not
 * at all — fails. `fastForward` fires each due timer at most once, so one jump buys
 * exactly one refresh.
 */
const POLL_TICK_MS = 20_000;

/** How many refreshes this spec buys — one per decision a colleague records. */
const REFRESHES = 2;

/**
 * Every jump above is idle time as far as epic 1's idle-session manager is concerned
 * (nothing here clicks or types), so the total has to stay well inside the idle window
 * or the session would end mid-test. Checked against the app's own configured values.
 *
 * Note: this process reads the same env names the app does but does not load
 * `web/.env.local` — so if you shorten the idle timings there for manual testing, this
 * guard will tell you before the spec fails for the wrong reason.
 */
const CLOCK_BUDGET_MS = REFRESHES * POLL_TICK_MS;

if (CLOCK_BUDGET_MS >= SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_LEAD_MS) {
  throw new Error(
    `This spec advances the browser clock by ${String(CLOCK_BUDGET_MS)}ms of idle ` +
      `time, which reaches the configured session idle window ` +
      `(${String(SESSION_IDLE_TIMEOUT_MS)}ms idle, ` +
      `${String(SESSION_WARNING_LEAD_MS)}ms warning lead) — the session would end ` +
      `mid-test. Raise NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_SECONDS or lower the jumps ` +
      `above.`,
  );
}

/**
 * Attribute stamped on the document element once the first render is on screen. A
 * client-side update leaves it alone; a document reload wipes it — so finding it at the
 * end is the proof that the rows moved on WITHOUT the page being reloaded (AC-1).
 */
const NO_RELOAD_MARKER = 'data-e2e-no-reload';

/** The row's own decide control, named for the request it decides (`expense-decisions`). */
const decideRequestName = (verb: string, reference: string): RegExp =>
  new RegExp(`${verb} request ${reference}`, 'i');

/**
 * The requests in `served` that are still awaiting a decision, in the order they are
 * served. Found by STATUS rather than by position, so a fixture that stopped carrying
 * enough of them fails loudly here rather than silently testing nothing.
 */
const awaitingDecisionIn = (served: TransactionRead[]): TransactionRead[] => {
  const awaiting = served.filter(
    (request) => request.Status === TRANSACTION_STATUS_IMPORTED,
  );
  if (awaiting.length < 3) {
    throw new Error(
      `This spec needs at least three requests awaiting a decision (two for a ` +
        `colleague to decide, one to be left alone), and the fixture served ` +
        `${String(awaiting.length)}. See transactionsForBulkSelection() in ` +
        `web/src/mocks/data/transaction.ts.`,
    );
  }
  return awaiting;
};

/**
 * The list as the reader first sees it: several requests awaiting a decision, plus one
 * already approved and one already rejected. No two rows share the duplicate key, so a
 * refresh test is never disturbed by the list's own duplicate notification (epic 3 R21).
 */
const FIRST_READ = transactionsForBulkSelection();

const [DECIDED_BY_COLLEAGUE, REJECTED_BY_COLLEAGUE, LEFT_ALONE] =
  awaitingDecisionIn(FIRST_READ);

if (!DECIDED_BY_COLLEAGUE || !REJECTED_BY_COLLEAGUE || !LEFT_ALONE) {
  throw new Error(
    'The fixture did not yield three requests awaiting a decision — see ' +
      'awaitingDecisionIn() above.',
  );
}

/** What the service holds once a colleague has approved the first request. */
const SECOND_READ = transactionsAfterColleagueDecided(FIRST_READ, [
  DECIDED_BY_COLLEAGUE.Id,
]);

/** ...and once a colleague has rejected another one, a moment later. */
const THIRD_READ = transactionsAfterColleagueDecided(
  SECOND_READ,
  [REJECTED_BY_COLLEAGUE.Id],
  TRANSACTION_STATUS_REJECTED,
);

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
 * Puts the browser in a signed-in state as the named role, without a real credential:
 * the mock `session` cookie the Node-side auth stub maps back to this role when the
 * server-side gate asks who the session belongs to.
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
 * disagree with what the Node-side stub returns for the same session — one person
 * server-side and another in the browser would mean two different sets of actions.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(userInfoFor(roleName))),
  );
};

/** What the mocked transactions service is currently holding. */
interface RequestFeed {
  /** Change what the NEXT read of the list returns — a colleague deciding elsewhere. */
  show: (requests: TransactionRead[]) => void;
}

/**
 * Serves the whole request set in one response, as the real endpoint does (no query
 * parameters, no server-side paging), returning whatever the test last called `show`
 * with.
 *
 * Deliberately NOT one snapshot per request: the browser may legitimately read the list
 * more than once for a single on-screen state, and a queue would then silently skip a
 * state. Keeping the served body under the TEST's control means each assertion below is
 * about one exact transition.
 *
 * The `/transactions-api/**` catch-all is registered FIRST so it loses to the specific
 * read (Playwright matches the most recently registered route first): any other call
 * under the app's transactions mount is aborted rather than forwarded to the live
 * service by the app's own proxy.
 */
const serveRequests = async (
  page: Page,
  initialRequests: TransactionRead[],
): Promise<RequestFeed> => {
  await page.route(TRANSACTIONS_API_GLOB, (route) => route.abort());

  let requests = initialRequests;
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse(requests))),
  );

  return {
    show: (next: TransactionRead[]) => {
      requests = next;
    },
  };
};

/** The screen's own content — never the shell around it. */
const listScreen = (page: Page): Locator => page.getByRole('main');

/** One request's row, found by its `Reference`, never by position. */
const requestRow = (page: Page, reference: string): Locator =>
  listScreen(page).getByRole('row').filter({ hasText: reference });

/**
 * The references of the requests currently on screen, in the order their rows appear.
 *
 * Each row is matched back to the request it came from by that request's own reference,
 * so nothing here depends on which column the reference sits in or on any row's
 * position. The heading row carries no reference and is naturally skipped.
 */
const referencesInOrder = async (
  page: Page,
  served: TransactionRead[],
): Promise<string[]> => {
  const rowTexts = await listScreen(page).getByRole('row').allInnerTexts();
  return rowTexts.reduce<string[]>((references, text) => {
    const request = served.find((candidate) =>
      text.includes(candidate.Reference),
    );
    return request ? [...references, request.Reference] : references;
  }, []);
};

/** Stamps the reload marker on the document currently on screen. */
const markCurrentDocument = async (page: Page): Promise<void> => {
  await page.evaluate((attribute) => {
    document.documentElement.setAttribute(attribute, 'kept');
  }, NO_RELOAD_MARKER);
};

test.describe('Epic bulk-approval-and-live-refresh, Story 4: the list keeps itself current', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the identity it needs.
    await context.clearCookies();
  });

  // AC-1
  test('a decision a colleague records appears on the open list on its own — no reload, nothing clicked', async ({
    page,
    context,
  }) => {
    // Take the browser clock before anything schedules a timer, so the app's real
    // refresh cadence can be crossed instantly (see the header's TIMING note).
    await page.clock.install();

    const feed = await serveRequests(page, FIRST_READ);
    await mockBrowserIdentityCall(page, ROLE_APPROVER);
    await blockLiveBackends(page);
    await seedSession(context, ROLE_APPROVER);

    await page.goto(REQUESTS_PATH);

    // As the reader finds it: three requests still awaiting a decision, each one still
    // theirs to make.
    const colleaguesRow = requestRow(page, DECIDED_BY_COLLEAGUE.Reference);
    const colleaguesSecondRow = requestRow(
      page,
      REJECTED_BY_COLLEAGUE.Reference,
    );
    const untouchedRow = requestRow(page, LEFT_ALONE.Reference);
    await expect(colleaguesRow).toContainText(TRANSACTION_STATUS_IMPORTED);
    await expect(colleaguesSecondRow).toContainText(
      TRANSACTION_STATUS_IMPORTED,
    );
    await expect(untouchedRow).toContainText(TRANSACTION_STATUS_IMPORTED);
    await expect(
      colleaguesRow.getByRole('button', {
        name: decideRequestName('approve', DECIDED_BY_COLLEAGUE.Reference),
      }),
    ).toBeVisible();

    const orderAsOpened = await referencesInOrder(page, FIRST_READ);

    // Marked AFTER the first paint, so only a reload from here on could remove it.
    await markCurrentDocument(page);

    /* ---- A colleague approves one of them, elsewhere ---- */

    feed.show(SECOND_READ);
    await page.clock.fastForward(POLL_TICK_MS);

    // It arrives on this reader's screen on its own: nobody reloaded, nobody clicked,
    // nobody was asked to do anything — only time passed.
    await expect(colleaguesRow).toContainText(TRANSACTION_STATUS_APPROVED);
    await expect(colleaguesRow).not.toContainText(TRANSACTION_STATUS_IMPORTED);

    // And with it, the thing that matters: the request is no longer theirs to decide,
    // so they cannot act on what a colleague has already settled.
    await expect(
      colleaguesRow.getByRole('button', {
        name: decideRequestName('approve', DECIDED_BY_COLLEAGUE.Reference),
      }),
      'a request a colleague has already decided must stop offering this reader a ' +
        'decision the moment the refresh brings its new status in',
    ).toHaveCount(0);

    // Nothing else moved: the requests still awaiting a decision are untouched, and
    // each is still one this reader may decide.
    await expect(untouchedRow).toContainText(TRANSACTION_STATUS_IMPORTED);
    await expect(
      untouchedRow.getByRole('button', {
        name: decideRequestName('approve', LEFT_ALONE.Reference),
      }),
    ).toBeVisible();

    /* ---- A second decision, to show the list keeps ITSELF current ---- */

    feed.show(THIRD_READ);
    await page.clock.fastForward(POLL_TICK_MS);

    await expect(colleaguesSecondRow).toContainText(
      TRANSACTION_STATUS_REJECTED,
    );
    await expect(colleaguesSecondRow).not.toContainText(
      TRANSACTION_STATUS_IMPORTED,
    );
    // The first decision is still shown as it was — a refresh brings the list forward,
    // it does not start it over.
    await expect(colleaguesRow).toContainText(TRANSACTION_STATUS_APPROVED);
    await expect(untouchedRow).toContainText(TRANSACTION_STATUS_IMPORTED);

    /* ---- Brought up to date IN PLACE (BR8) ---- */

    // The same requests, in the same order, still one row each: the rows were brought
    // up to date, not rebuilt, re-ordered or appended to.
    expect(
      await referencesInOrder(page, THIRD_READ),
      'a refresh must update the rows in place — same requests, same order',
    ).toEqual(orderAsOpened);
    await expect(colleaguesRow).toHaveCount(1);

    // ...in the very document the reader opened: no reload happened between the first
    // status on screen and the last.
    await expect(page.locator('html')).toHaveAttribute(
      NO_RELOAD_MARKER,
      'kept',
      { timeout: 1_000 },
    );
    await expect(page).toHaveURL(new RegExp(`${REQUESTS_PATH}$`));
  });
});
