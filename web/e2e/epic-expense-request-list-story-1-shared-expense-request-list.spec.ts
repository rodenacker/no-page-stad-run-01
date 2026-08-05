/**
 * Story Metadata:
 * - Epic: expense-request-list — The shared expense request list
 * - Story: 1 — The shared expense request list
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R1, R9, R11, R14, R17, R19, R20
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-5 (a failed reading shows the reason the SERVICE gave, or the screen's own
 *   plain wording when it gave none, with a Try again that re-reads the list) and
 *   AC-6 (an Importer following the request-list destination in the app header lands
 *   on the list, not a not-found page and not a permission message) → this file.
 * - AC-1 (a row per request with the service's values, status text + intent colour,
 *   plain-language transaction type with verbatim fallback), AC-2 (account numbers
 *   masked to their last four digits), AC-3 (the tiered loading placeholder) and
 *   AC-4 (nothing ever imported) → the Vitest layer at
 *   `web/src/__tests__/integration/epic-expense-request-list-story-1-shared-expense-request-list.test.tsx`.
 *   Deliberately NOT duplicated here.
 * - No axe scan here: this epic's real-browser accessibility scans belong to the
 *   stories that add the interactive controls (search/filter/sort/paging and the
 *   request detail), and they render this list with them.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running locally. This screen crosses BOTH mock
 * boundaries, and earlier epics established each one — this spec reuses them rather
 * than adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. Every protected screen
 *    is gated SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process, epic 1 BR1/BR3), and
 *    `page.route()` cannot see a fetch the browser never makes. The stub answers that
 *    call from the shared identity source, keyed off the `session` cookie value seeded
 *    below.
 * 2. Browser boundary → `page.route()` (below), for this story's own read:
 *    `GET /transactions-api/v1/transactions` (no query parameters — the endpoint
 *    returns the whole set in one response). Mocking it is not optional even for the
 *    tests that assert nothing about it: `/transactions-api/...` is the app's OWN
 *    same-origin mount point, so an unmocked read is forwarded to the live
 *    transactions service by the app's route handler from inside the Next.js process,
 *    where `blockLiveBackends` cannot see it.
 *
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by
 *   driving the sign-in form — epic 1 story 2's spec owns that journey, and the cookie
 *   is the app's sole conveyance of session (epic 1 BR2). Cookies ignore port, so one
 *   seed serves the dev server (:3000) and the epic-end production run (:3100).
 * - Every response body comes from the project-wide factories under
 *   `web/src/mocks/data/` (`userInfoFor(role)`, `createTransaction()`,
 *   `transactionListResponse()`, `transactionListFailureResponse()`); no response
 *   shape or failure wording is authored in this file, so this spec and the Vitest
 *   layer cannot drift on the contract. The list envelope is `{ Transactions: [...] }`
 *   — the factory's business, not this spec's.
 * - The client's own placeholders (`CLIENT_FALLBACK_MESSAGES` /
 *   `CLIENT_FALLBACK_DETAILS`) are imported from the production module that defines
 *   them, so AC-5's "the user never reads plumbing" check cannot go stale if that
 *   wording is reworded.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - The request list is read from the BROWSER, through the shared API client at the
 *   app's own same-origin `/transactions-api/v1/transactions` address (story
 *   §Infrastructure reuse notes), i.e. from a client component. `page.route()` cannot
 *   intercept a fetch made by the Next.js server or by a Server Action — if this read
 *   moves server-side, this spec's mock is bypassed and the request leaves for the
 *   real transactions service. AC-5's Try again (a browser-side re-read with no
 *   navigation) already implies the client-side read.
 * - The failed-load state renders as an `alert` INSIDE the screen's own content, with
 *   a control named "Try again" that re-runs the read in place (the pattern
 *   `SubmittedFilesList` established). Every alert/status query below is scoped to the
 *   `main` landmark: Next.js renders its route announcer as a second, permanently
 *   empty `role="alert"` at body level, which would make an unscoped assertion
 *   meaningless.
 * - The failure wording follows `serviceMessageOf(e) ?? serviceDetailOf(e) ?? <own
 *   wording>` from `lib/api/errors.ts` (story §Infrastructure reuse notes): the
 *   service's own sentence when it sent one, the screen's own plain sentence when it
 *   did not, and NEVER a client placeholder such as "Internal Server Error: …".
 *   The screen's own wording is asserted loosely (see `OWN_FAILURE_WORDING`) because
 *   the developer owns that copy.
 * - `/requests` is widened to BOTH roles in `lib/auth/access-map.ts` alone (the
 *   recorded cross-epic debt). That single edit is also what puts the destination in
 *   the app header, since `HeaderNav` renders `entryPointsFor(session)` — no
 *   navigation work of its own. The destination is a real navigational LINK carrying
 *   its `href`, inside the header's `<nav>`, and is located below by WHERE IT GOES
 *   rather than by its label, because this story also rewords that label.
 * - Rows are located by the request's `Reference` (the brief's primary identifier),
 *   never by position, and never by account number — the masked value is the Vitest
 *   layer's assertion (AC-2), and this spec must not depend on how it is formatted.
 * - Cookie assumptions: the mock `session` cookie carries production-like attributes
 *   (HttpOnly, SameSite=Strict). `Secure` is omitted because the E2E server is plain
 *   http on localhost; the real cookie's full attribute set is asserted in the Vitest
 *   layer (epic 1, story 1).
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — `/requests` still
 * answers a permitted Approver with `notFound()`, and an Importer is still excluded
 * from the address altogether, so the header offers them no destination for it.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import {
  CLIENT_FALLBACK_DETAILS,
  CLIENT_FALLBACK_MESSAGES,
} from '../src/lib/api/errors';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  TRANSACTION_LIST_FAILURE_MESSAGE,
  createTransaction,
  transactionListFailureResponse,
  transactionListResponse,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';

/** This story's screen, and the signed-in screen whose header leads to it. */
const REQUESTS_PATH = '/requests';
const LANDING_PATH = '/';

/**
 * The one request the mocked service returns. From the project-wide factory, so the
 * reference asserted below is the same canonical value the Vitest layer renders —
 * never a retyped literal.
 */
const LISTED_REQUEST = createTransaction();

/**
 * How the screen's OWN failure wording reads when the service gave no reason of its
 * own. Deliberately loose — the developer owns that copy, and it has to read plainly
 * for a user (the sibling `SubmittedFilesList` says "The submitted files could not be
 * loaded. Please try again."). What is fixed is only that the screen says the requests
 * could not be read, in its own words rather than the client's plumbing.
 */
const OWN_FAILURE_WORDING =
  /(could ?n[o']?t|can ?n[o']?t) be (load|read|retriev)/i;

/**
 * Everything `apiClient` invents when a failed response carries no readable message —
 * imported from the production module that defines it, so this check cannot go stale.
 * None of it may ever reach a user (project.md NFR-base-5).
 */
const CLIENT_PLACEHOLDERS = [
  ...Object.values(CLIENT_FALLBACK_MESSAGES),
  ...Object.values(CLIENT_FALLBACK_DETAILS),
];

/**
 * How a not-found page tells the user there is no such screen (the wording contract
 * epic `expense-file-upload` story 4 settled for `app/(authenticated)/not-found.tsx`).
 * AC-6 requires this NOT to be what an Importer gets.
 */
const NOT_FOUND_WORDING =
  /(not be found|not found|does ?n[o']?t exist|no such)/i;

/**
 * The heading the permission message shows (`PermissionDeniedMessage`). AC-6 requires
 * this NOT to be what an Importer gets either — the address is theirs now.
 */
const PERMISSION_MESSAGE_HEADING = /access needed/i;

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * Blocks the live services (see LIVE_BACKEND_ORIGINS). Registered LAST in each test,
 * because Playwright matches the most recently registered route first: that way a call
 * sent to a service's own origin is aborted and fails visibly, instead of being
 * quietly answered by the origin-agnostic mocks above it.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Puts the browser in a signed-in state as the named role, without a real credential:
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
 * Answers a BROWSER-side identity read from the shared userinfo source, so it can
 * never disagree with what the Node-side stub returns for the same session. The header
 * navigation is built from the roles on the identity the server resolved, so one person
 * server-side and another in the browser would mean two different sets of destinations.
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

/** The three ways the mocked transactions service can answer this screen's read. */
type TransactionsAnswer =
  /** The whole set, one request (the canonical factory row). */
  | 'the requests'
  /** A failure the service explained in its own words (`DefaultResponse` envelope). */
  | 'a failure it explains'
  /**
   * A failure with no readable message at all — a bodyless 500, which leaves
   * `apiClient` holding only its own placeholder. This is the case the screen must
   * answer with its OWN plain wording.
   */
  | 'a failure it does not explain';

const FULFILMENT: Record<
  TransactionsAnswer,
  { status: number; contentType?: string; body?: string }
> = {
  'the requests': {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(transactionListResponse([LISTED_REQUEST])),
  },
  'a failure it explains': {
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify(transactionListFailureResponse()),
  },
  'a failure it does not explain': { status: 500 },
};

/**
 * Answers this story's browser-side read of the expense requests, giving `answers` in
 * order and repeating the last one for any further read.
 *
 * A SEQUENCE rather than one fixed body, because that is what makes AC-5's "Try again
 * re-reads the list" observable from the outside: each retry is answered differently,
 * so the screen's contents can only change if it really asked again. Nothing here
 * counts calls — the change on screen is the evidence.
 *
 * The glob names no origin, so it matches whichever port the app is served on (:3000
 * in dev, :3100 in the epic-end production run) and, being registered before
 * `blockLiveBackends`, never answers for the transactions service's own origin.
 */
const mockTransactionListSequence = async (
  page: Page,
  answers: readonly TransactionsAnswer[],
): Promise<void> => {
  let reads = 0;
  await page.route('**/transactions-api/v1/transactions**', (route) => {
    const answer = answers[Math.min(reads, answers.length - 1)];
    reads += 1;
    return route.fulfill(FULFILMENT[answer]);
  });
};

/** The screen's own content — everything below is scoped to it, never to the body. */
const screenOf = (page: Page): Locator => page.getByRole('main');

/**
 * The screen's failed-load alert. Scoped to `main` because Next.js renders a second,
 * permanently empty `role="alert"` (its route announcer) at body level, which an
 * unscoped query would match and make every assertion here meaningless.
 */
const failureAlert = (page: Page): Locator => screenOf(page).getByRole('alert');

/** The control that re-reads the list, named as the user reads it. */
const tryAgain = (page: Page): Locator =>
  screenOf(page).getByRole('button', { name: /try again/i });

/**
 * The row for the mocked request, found by its `Reference` — the brief's primary
 * identifier — rather than by position. Content only the list screen renders, so it is
 * also how this spec recognises having arrived there.
 */
const listedRequestRow = (page: Page): Locator =>
  screenOf(page).getByRole('row').filter({ hasText: LISTED_REQUEST.Reference });

/**
 * The header's destination for this screen, found by WHERE IT GOES rather than by what
 * it is called: this story rewords the entry-point copy in `lib/auth/access-map.ts`
 * (it no longer promises deciding to an Importer), while the address is the contract.
 *
 * Restricted to the `<nav>` the header holds, NOT to the whole page, because the
 * landing screen offers the same address in its own entry-point card
 * (`RoleEntryPoints`) — without that restriction the test could pass by clicking the
 * card and never exercise the header at all.
 */
const headerDestination = (page: Page, path: string): Locator =>
  page.locator(`nav a[href="${path}"]`).filter({ visible: true });

test.describe('Epic expense-request-list, Story 1: the shared expense request list', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-5
  // One journey through both halves of the criterion, and through the retry twice:
  // the service explains the failure → its own words are shown; Try again, and this
  // time it explains nothing → the screen's own plain wording stands in; Try again,
  // and it succeeds → the list arrives. Each step's content is only reachable by a
  // fresh read, so the journey proves the re-read without counting anything.
  test('a failed reading of the expense requests says why, and Try again re-reads the list until it succeeds', async ({
    page,
    context,
  }) => {
    await seedSession(context, ROLE_IMPORTER);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await mockTransactionListSequence(page, [
      'a failure it explains',
      'a failure it does not explain',
      'the requests',
    ]);
    await blockLiveBackends(page);

    await page.goto(REQUESTS_PATH);

    // 1. The service gave a reason, so the user reads the SERVICE's own sentence —
    // not a status line, and not the client's "Internal Server Error: …" plumbing.
    const alert = failureAlert(page);
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(TRANSACTION_LIST_FAILURE_MESSAGE);
    for (const placeholder of CLIENT_PLACEHOLDERS) {
      await expect(
        screenOf(page),
        `"${placeholder}" is wording apiClient invented for itself and must never reach a user (project.md NFR-base-5)`,
      ).not.toContainText(placeholder);
    }
    // Nothing of the list is pretended to be there while it could not be read.
    await expect(listedRequestRow(page)).toHaveCount(0);

    // 2. Try again — the read really happens again, and this time the service says
    // nothing readable, so the screen falls back to its OWN plain wording. The
    // service's earlier sentence is gone, which is what makes this a second read
    // rather than a re-render of the first failure.
    await tryAgain(page).click();
    await expect(alert).toContainText(OWN_FAILURE_WORDING);
    await expect(alert).not.toContainText(TRANSACTION_LIST_FAILURE_MESSAGE);
    for (const placeholder of CLIENT_PLACEHOLDERS) {
      await expect(
        screenOf(page),
        `a failure the service did not explain must be described in the screen's own words, never with apiClient's "${placeholder}"`,
      ).not.toContainText(placeholder);
    }

    // 3. Try again once more, and the read succeeds: the request the service returned
    // is on screen and the failure is gone. Only a genuine re-read can produce this.
    await tryAgain(page).click();
    await expect(listedRequestRow(page)).toBeVisible();
    await expect(failureAlert(page)).toHaveCount(0);
  });

  // AC-6
  // The cross-epic debt this story settles: `/requests` was seeded Approver-only, so
  // an Importer was offered no destination for it and reaching the address answered
  // them with the permission message — while a permitted Approver reached a not-found
  // page, because the screen did not exist. Both are gone here.
  //
  // Opened the way a user opens it — by following the destination in the header, which
  // is what the widened access map is supposed to produce — rather than by typing the
  // address.
  test('an Importer following the expense requests destination in the header lands on the list, not a not-found page and not a permission message', async ({
    page,
    context,
  }) => {
    await seedSession(context, ROLE_IMPORTER);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await mockTransactionListSequence(page, ['the requests']);
    await blockLiveBackends(page);

    await page.goto(LANDING_PATH);

    const destination = headerDestination(page, REQUESTS_PATH);
    await expect(
      destination,
      `the header must offer an Importer the expense request list once ${REQUESTS_PATH} allows both roles — HeaderNav renders entryPointsFor(session), so this comes from lib/auth/access-map.ts alone`,
    ).toBeVisible();
    await destination.click();

    await expect(page).toHaveURL(REQUESTS_PATH);

    // The list screen itself: the request the mocked service returned is on screen.
    await expect(listedRequestRow(page)).toBeVisible();

    // ...and NOT the interim not-found page the address answered a permitted user
    // with until this story shipped.
    await expect(screenOf(page)).not.toContainText(NOT_FOUND_WORDING);

    // ...and NOT the permission message. Both halves are asserted: its heading, and
    // the `alert` it renders inside the screen. Nothing else can be occupying that
    // alert here — the list read was answered 200, so the failed-load state is not
    // showing either.
    await expect(
      page.getByRole('heading', { name: PERMISSION_MESSAGE_HEADING }),
    ).toHaveCount(0);
    await expect(failureAlert(page)).toHaveCount(0);
  });
});
