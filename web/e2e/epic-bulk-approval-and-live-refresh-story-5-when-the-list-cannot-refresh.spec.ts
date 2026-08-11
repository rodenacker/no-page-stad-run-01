/**
 * Story Metadata:
 * - Epic: bulk-approval-and-live-refresh — Bulk approval and a self-updating list
 * - Story: 5 — When the list cannot refresh itself
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R6, BR9
 *
 * Covers the single `playwright`-tagged criterion:
 * - AC-4 — in the browser, once a refresh succeeds again the notice clears by itself
 *   and the list carries on refreshing, with no action from the reader.
 *
 * AC-1 (two failures in a row raise the notice, carrying the time the list was last
 * up to date), AC-2 (one failure raises nothing), AC-3 (the rows stay visible the
 * whole time) and AC-5 (the time shown is the last SUCCESS, not the failure) are the
 * Vitest layer's, at
 * `web/src/__tests__/integration/epic-bulk-approval-and-live-refresh-story-5-when-the-list-cannot-refresh.test.tsx`,
 * and are deliberately not repeated here (testing-policy.md § "one tag, one layer").
 * What this spec adds that jsdom cannot: a real browser recovering on its own — the
 * notice going away and the list picking up a colleague's decision again — with
 * nothing clicked, nothing reloaded and nothing typed, driven through the app's REAL
 * 15-second interval (brief BR6).
 *
 * This epic's real-browser accessibility scan belongs to the story that owns the
 * selection surface, so there is no axe scan here.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * (testing-policy.md § "Playwright runs against mocks, never live" — even though
 * project.md records both real services as running on this machine.) Two boundaries,
 * one contract, exactly as epics 1–5 established; this spec reuses them rather than
 * adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. `/requests` is gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` below, for this screen's one read
 *    (`GET /transactions-api/v1/transactions`, which takes no query parameters and is
 *    also what the refresh poll re-reads), plus a catch-all that aborts any OTHER
 *    `/transactions-api/**` call — that mount point is the app's OWN same-origin
 *    forwarder, so an unmocked read would travel on to the live transactions service
 *    from inside the Next.js process where nothing here could see it — plus a hard
 *    block on the real services' own origins (project.md records them at :4424 /
 *    :4423).
 *
 * Every response body comes from the project-wide factories in `web/src/mocks/data/`
 * (`userInfoFor`, `transactionsForBulkSelection`, `transactionsAfterColleagueDecided`,
 * `transactionListResponse`, `transactionListFailureResponse`) — no response shape and
 * no person's name is authored in this file, so this spec and the Vitest layer cannot
 * drift on the contract. A FAILED POLL is the same `GET /v1/transactions` answered
 * with `transactionListFailureResponse()` on a 500: there is no separate poll endpoint
 * and so no separate failure fixture (see that factory's own note).
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - The list is read FROM THE BROWSER through `fetchTransactions()`
 *   (`lib/api/transactions.ts`) at the app's own same-origin `/transactions-api/...`
 *   address — which is also the only way a polling refresh can exist at all.
 *   `page.route()` cannot intercept a read issued by the Next.js server or by a Server
 *   Action, so a server-side list fetch would both bypass these mocks and make the
 *   refresh impossible.
 * - The refresh re-reads that same call on the app's real interval (brief BR6: 15s)
 *   while the list is open and the tab is visible. This spec never injects a shortened
 *   test-only interval; it advances the BROWSER clock instead (see TIMING below).
 * - Two consecutive failed polls (BR9) raise the "cannot refresh itself" notice, and
 *   the NEXT successful poll clears it — with no retry button, no reload prompt and no
 *   user action of any kind. Nothing in this test clicks, types or reloads after the
 *   screen has loaded, so an implementation that needs a nudge to recover fails here.
 * - The rows already on screen are never blanked by a failed re-read (the convention
 *   `SubmittedFilesList.tsx` already ships): the failed-load state is only for a read
 *   that left the reader with nothing. This spec keeps reading the same rows
 *   throughout, so a screen that swaps the list for an error state fails at the first
 *   assertion after the failures.
 * - The list renders as a table (story `expense-request-list`), so each request is a
 *   `row`, addressed by its own reference and never by position. The default
 *   Playwright viewport is wide, so it is the table and not the narrow-viewport cards.
 * - Cookie assumptions: the session travels only in the `session` cookie (epic 1 BR2),
 *   seeded directly rather than by driving the sign-in form — epic 1's story 2 spec
 *   owns that journey. Cookies ignore port, so one seed serves the dev server (:3000)
 *   and the epic-end production run (:3100). `Secure` is omitted because the E2E
 *   server is plain http on localhost.
 *
 * WORDING — what is pinned and what is not: the brief fixes the SENSE of the notice
 * ("it can no longer refresh itself", plainly worded, no technical cause), not a
 * sentence. {@link CANNOT_REFRESH_NOTICE} therefore matches the sense across the
 * reasonable phrasings rather than one exact string, in the same spirit as
 * `CONFIRM_DECISION_NAME` in the `expense-decisions` story 4 spec. It is matched
 * inside `main` — Next renders a permanently empty body-level `role="alert"` route
 * announcer, so an unscoped role query would match two elements.
 *
 * TIMING — why nothing here waits real time:
 * The refresh is timer-driven, so the browser clock is driven with Playwright's
 * `page.clock`: `install()` before navigating, then `fastForward()` to buy refreshes at
 * the REAL configured interval, changing what the mocked endpoint serves between jumps.
 * `fastForward` fires each due timer at most once, so one jump buys one refresh for any
 * interval up to {@link POLL_TICK_MS}. No test-only "short interval" in production
 * code, no `waitForTimeout`, and no test sitting through four 15-second waits — the
 * whole spec runs in the time four mocked responses take. Each jump is paired with the
 * response it produces, so the next jump is never made while a poll is still in flight.
 *
 * These tests WILL FAIL until implemented (TDD red) — `/requests` does not refresh
 * itself at all today, so there is nothing to fail twice and nothing to recover from.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER } from '../src/mocks/data/role';
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_REJECTED,
  transactionListFailureResponse,
  transactionListResponse,
  transactionsAfterColleagueDecided,
  transactionsForBulkSelection,
} from '../src/mocks/data/transaction';
import {
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_WARNING_LEAD_MS,
} from '../src/lib/session/config';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** This story's screen. */
const REQUESTS_ROUTE = '/requests';

/**
 * The address the browser uses for the transactions service: the app's OWN
 * same-origin `/transactions-api/*` mount point, never the service's origin
 * (`web/src/lib/utils/constants.ts`). Trailing `**` so any query string is covered.
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
 * Browser time bought per refresh. `fastForward` fires each due timer at most once,
 * so one jump buys one refresh for any interval up to this length — comfortably above
 * the brief's 15s (BR6) so this spec does not have to know the exact number.
 */
const POLL_TICK_MS = 60_000;

/** How many refreshes this spec advances the clock through, in total. */
const REFRESHES_ADVANCED = 4;

/**
 * Those jumps are idle time as far as epic 1's idle-session manager is concerned
 * (nothing here clicks or types after the screen loads), so they have to stay
 * comfortably inside the idle window or the session would end mid-test. Checked
 * against the app's own configured values.
 *
 * Note: this process reads the same env names the app does, but does not load
 * `web/.env.local` — so if you shorten the idle timings there for manual testing,
 * this guard is what will tell you why this spec started failing.
 */
const CLOCK_BUDGET_MS = REFRESHES_ADVANCED * POLL_TICK_MS;

if (CLOCK_BUDGET_MS >= SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_LEAD_MS) {
  throw new Error(
    `This spec advances the browser clock by ${String(CLOCK_BUDGET_MS)}ms of idle ` +
      `time, which reaches the configured session idle window ` +
      `(${String(SESSION_IDLE_TIMEOUT_MS)}ms idle, ` +
      `${String(SESSION_WARNING_LEAD_MS)}ms warning lead) — the session would end ` +
      `mid-test. Lower POLL_TICK_MS or raise ` +
      `NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_SECONDS.`,
  );
}

/**
 * The notice the list raises once it can no longer refresh itself (R6/BR9).
 *
 * The brief pins the SENSE — plainly worded, stating the situation and not a technical
 * cause — rather than a sentence, so this matches the phrasings that satisfy it
 * ("cannot refresh itself", "can no longer refresh", "is not updating", "has stopped
 * refreshing"…) instead of one exact string the developer would have to guess. What it
 * will NOT match is a raw service error, an HTTP status or a stack trace, which is the
 * failure this criterion cares about. The exact wording, once chosen, is pinned in the
 * Vitest layer alongside the last-up-to-date timestamp (AC-1/AC-5).
 */
const CANNOT_REFRESH_NOTICE =
  /(?:cannot|can['’]?t|can no longer|unable to|is not|no longer|stopped)[^.!?]{0,40}(?:refresh|updat|current)/i;

/**
 * Attribute stamped on the document element once the first render is on screen. A
 * client-side update leaves it alone; a document reload wipes it — so finding it at the
 * end is the proof that the list recovered WITHOUT the page being reloaded (AC-4: "with
 * no action from the reader").
 */
const NO_RELOAD_MARKER = 'data-e2e-no-reload';

/**
 * The requests on screen throughout: three still awaiting a decision, plus one already
 * approved and one already rejected (so "Approved" and "Rejected" already appear
 * elsewhere in the table, and a row-scoped assertion below is genuinely about THAT
 * row). One list, reused for every snapshot, so the only thing that ever changes
 * between two polls is the thing under test.
 */
const LISTED_REQUESTS = transactionsForBulkSelection(3);
const [WATCHED_REQUEST, SECOND_REQUEST] = LISTED_REQUESTS;

/**
 * What the service has to say once it answers again: a colleague approved the watched
 * request while the list was unable to refresh. Derived from the list above — same
 * order, same rows, one status moved — so a changed row is unmistakably a changed row
 * rather than a second list arriving.
 */
const AFTER_RECOVERY = transactionsAfterColleagueDecided(LISTED_REQUESTS, [
  WATCHED_REQUEST.Id,
]);

/**
 * And one refresh later again: a second colleague decision, this time a rejection. This
 * is what tells "the notice happened to clear" apart from "refreshing carries on by
 * itself" — the half of AC-4 that a single recovered poll cannot prove.
 */
const AFTER_NEXT_REFRESH = transactionsAfterColleagueDecided(
  AFTER_RECOVERY,
  [SECOND_REQUEST.Id],
  TRANSACTION_STATUS_REJECTED,
);

/** A mocked JSON response, built from a project-wide factory body. */
const jsonResponse = (
  body: unknown,
  status = 200,
): { status: number; contentType: string; body: string } => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/** What the mocked transactions endpoint is currently serving. */
interface TransactionFeed {
  /** Change what the NEXT read returns — the service moving on underneath the screen. */
  show: (transactions: TransactionRead[]) => void;
  /** Make every read from now on fail, as an unreachable service does. */
  fail: () => void;
}

/**
 * Every backend mock this spec needs, registered in the ONE order that works:
 * Playwright matches the most recently registered route first, so the
 * `/transactions-api/**` catch-all goes on FIRST (it must lose to the specific read
 * below it) and `LIVE_BACKEND_ORIGINS` goes on LAST (a call addressed at a service's
 * own origin must be aborted, not quietly answered by the origin-agnostic mocks above
 * it).
 *
 * The list is served from a single mutable snapshot rather than a per-request queue:
 * the browser may legitimately read it more than once for one on-screen state, and a
 * queue would then silently skip a state. Keeping the served body under the TEST's
 * control (`feed.show()` / `feed.fail()`) means each change asserted below happens at
 * exactly the moment this spec chose.
 */
const installBackendMocks = async (
  page: Page,
  roleName: string,
  initialTransactions: TransactionRead[],
): Promise<TransactionFeed> => {
  // 1. Catch-all: anything under the app's transactions-api mount that this spec has
  //    not mocked is aborted, so it cannot travel on through the same-origin forwarder
  //    to the live service.
  await page.route(TRANSACTIONS_API_GLOB, (route) => route.abort());

  // 2. The one read this screen makes — first as the initial load, then as every
  //    refresh poll.
  let currentTransactions = initialTransactions;
  let failing = false;
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    failing
      ? route.fulfill(jsonResponse(transactionListFailureResponse(), 500))
      : route.fulfill(
          jsonResponse(transactionListResponse(currentTransactions)),
        ),
  );

  // 3. A browser-side identity read, answered from the SAME shared userinfo source the
  //    Node-side stub uses, so the two mock layers cannot disagree about who is signed
  //    in.
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(userInfoFor(roleName))),
  );

  // 4. The live services' own origins.
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }

  return {
    show: (transactions: TransactionRead[]) => {
      currentTransactions = transactions;
      failing = false;
    },
    fail: () => {
      failing = true;
    },
  };
};

/**
 * Puts the browser in a signed-in state as the named role, without any real credential:
 * the mock `session` cookie the Node-side auth stub maps back to this role when the
 * server-side gate asks it who the session belongs to.
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
 * Buys exactly one refresh and waits for the answer to land, so the next jump is never
 * made while a poll is still in flight. The wait is on the response the mock itself
 * produces — a failed poll answers 500 and so resolves this too.
 */
const advanceOneRefresh = async (page: Page): Promise<void> => {
  const refreshed = page.waitForResponse(TRANSACTIONS_URL_GLOB);
  await page.clock.fastForward(POLL_TICK_MS);
  await refreshed;
};

/** One request's row, found by its own reference — never by position. */
const requestRow = (page: Page, reference: string): Locator =>
  page.getByRole('main').getByRole('row').filter({ hasText: reference });

/** The "cannot refresh itself" notice, wherever on the screen the list places it. */
const cannotRefreshNotice = (page: Page): Locator =>
  page.getByRole('main').getByText(CANNOT_REFRESH_NOTICE);

/** Stamps the reload marker on the document currently on screen. */
const markCurrentDocument = async (page: Page): Promise<void> => {
  await page.evaluate((attribute) => {
    document.documentElement.setAttribute(attribute, 'kept');
  }, NO_RELOAD_MARKER);
};

test.describe('Epic bulk-approval-and-live-refresh, Story 5: when the list cannot refresh', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-4
  test('once a refresh succeeds again the cannot-refresh notice clears on its own and the list carries on refreshing — nothing clicked, nothing reloaded', async ({
    page,
    context,
  }) => {
    // Control the browser clock before anything schedules a timer, so the app's real
    // refresh interval can be crossed instantly.
    await page.clock.install();
    const feed = await installBackendMocks(
      page,
      ROLE_APPROVER,
      LISTED_REQUESTS,
    );
    await seedSession(context, ROLE_APPROVER);

    await page.goto(REQUESTS_ROUTE);

    // The Approver has the list in front of them, up to date and refreshing itself.
    const watchedRow = requestRow(page, WATCHED_REQUEST.Reference);
    await expect(watchedRow).toContainText(TRANSACTION_STATUS_IMPORTED);

    // Marked AFTER the first paint, so only a reload from here on could remove it.
    await markCurrentDocument(page);

    // The connection drops. Two polls in a row come back with nothing (BR9) — and
    // nobody touches the browser: no click, no keypress, no reload, only time passing.
    feed.fail();
    await advanceOneRefresh(page);
    await advanceOneRefresh(page);

    // The list says so, rather than quietly pretending to still be current.
    await expect(
      cannotRefreshNotice(page).first(),
      'after two refreshes in a row failed, the list said nothing — it must state plainly that it can no longer refresh itself (R6/BR9) instead of going on looking current',
    ).toBeVisible();

    // The connection returns, and a colleague has approved one of these requests in
    // the meantime.
    feed.show(AFTER_RECOVERY);
    await advanceOneRefresh(page);

    // The notice goes away by itself — nothing was pressed, and nothing was offered to
    // press: recovery is silent and automatic.
    await expect(
      cannotRefreshNotice(page),
      'the cannot-refresh notice was still on screen after a refresh had succeeded again — it must clear itself on the next successful refresh (R6), with no action from the reader',
    ).toHaveCount(0);

    // ...and the refresh that cleared it brought the colleague's decision with it.
    await expect(
      watchedRow,
      'the list did not pick up the decision a colleague recorded while it was unable to refresh — recovering means the rows are brought up to date, not just that the notice disappeared',
    ).toContainText(TRANSACTION_STATUS_APPROVED);
    await expect(watchedRow).not.toContainText(TRANSACTION_STATUS_IMPORTED);

    // And refreshing genuinely carries on from there — a second colleague decision,
    // one interval later, arrives the same way. This is what tells "the notice
    // happened to clear" apart from "the list is refreshing itself again".
    feed.show(AFTER_NEXT_REFRESH);
    await advanceOneRefresh(page);

    await expect(
      requestRow(page, SECOND_REQUEST.Reference),
      'the list stopped refreshing after it recovered — once a refresh succeeds again, refreshing must carry on by itself (R6)',
    ).toContainText(TRANSACTION_STATUS_REJECTED);
    await expect(cannotRefreshNotice(page)).toHaveCount(0);

    // The reader never had to do anything: this is still the page they opened, with
    // one row for each request throughout rather than a reloaded or re-rendered list.
    await expect(watchedRow).toHaveCount(1);
    await expect(page).toHaveURL(new RegExp(`${REQUESTS_ROUTE}$`));
    await expect(
      page.locator('html'),
      'the page was reloaded somewhere between the failed refreshes and the recovery — the list must recover in place, without the reader reloading anything',
    ).toHaveAttribute(NO_RELOAD_MARKER, 'kept', { timeout: 1_000 });
  });
});
