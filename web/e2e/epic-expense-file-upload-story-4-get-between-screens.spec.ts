/**
 * Story Metadata:
 * - Epic: expense-file-upload — Upload an expense file
 * - Story: 4 — Get between screens from anywhere
 * - Route: all signed-in screens (the shared app header)
 * - Target File: web/src/components/layout/AppHeader.tsx
 * - Page Action: modify_existing
 * - Requirements: R11, BR6
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-5 (the header alone gets a user off the expense files screen and back again,
 *   never the browser's Back button), AC-6 (the navigation is
 *   reachable and operable by keyboard alone, and stays usable at phone width) and
 *   AC-7 (an address with no screen still keeps the header, and the user can leave by
 *   it) → this file.
 * - AC-1 (a destination for every screen the roles permit), AC-2 (an excluded screen
 *   is absent, not disabled), AC-3 (the app's name links to the landing screen) and
 *   AC-4 (the screen being viewed is marked as current) → the Vitest layer at
 *   `web/src/__tests__/integration/epic-expense-file-upload-story-4-get-between-screens.test.tsx`.
 *   Deliberately NOT duplicated here.
 * - No axe scan here. This epic's single real-browser accessibility scan is story 3's
 *   AC-6, and it runs on the finished `/upload` screen — which renders this header, so
 *   the epic-end E2E re-run scans the new navigation with it (story §Notes).
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running locally. Both boundaries were
 * established by epic 1 and by stories 1–3 of this epic; this spec reuses their
 * helpers rather than adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. Every protected screen
 *    is gated SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process, epic 1 BR1/BR3), and
 *    `page.route()` cannot see a fetch the browser never makes. The stub answers that
 *    call from the shared identity source, keyed off the `session` cookie value seeded
 *    below.
 * 2. Browser boundary → `page.route()` (below). This story adds no backend call of its
 *    own — the destinations are computed from the session the server already resolved —
 *    but every journey below LANDS on `/upload`, and that screen makes two reads:
 *    `GET /transactions-api/v1/file-logs?IsActive=Yes` (story 1's list, re-read on a
 *    timer by story 3) and `GET /transactions-api/v1/file-settings` (story 2's picker).
 *    BOTH are mocked in every test here, including the ones that assert nothing about
 *    them: `/transactions-api/...` is the app's OWN same-origin mount point, so an
 *    unmocked read is forwarded to the live transactions service by the app's route
 *    handler from inside the Next.js process — where `blockLiveBackends` cannot see it.
 *    The journeys that now move through the expense request list (see the paths below)
 *    mock its single read, `GET /transactions-api/v1/transactions`, for the same
 *    reason.
 *
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by driving
 *   the sign-in form — epic 1 story 2's spec owns that journey, and the cookie is the
 *   app's sole conveyance of session (epic 1 BR2). Cookies ignore port, so one seed
 *   serves the dev server (:3000) and the epic-end production run (:3100).
 * - Every response body comes from the project-wide factories under
 *   `web/src/mocks/data/` (`userInfoFor(role)`, `fileLogListResponse()`,
 *   `fileSettingListResponse()`); no response shape is authored in this file, so this
 *   spec and the Vitest layer cannot drift on the contract.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - The destinations are real navigational LINKS carrying their `href` — the same
 *   contract `RoleEntryPoints` keeps on the landing screen — held in a `<nav>` inside
 *   the `<header>` (story §Reconciled test contracts). Every locator below finds a
 *   destination by WHERE IT GOES, never by its wording, so rewording the copy in
 *   `lib/auth/access-map.ts` cannot break this spec; the `<nav>` is what keeps those
 *   destinations distinguishable from the landing screen's own entry-point cards,
 *   which link to the same address.
 * - The app's name in the header is a link (AC-3). It is located by its accessible
 *   name, which is the app name the header already shows.
 * - The app's address is not in the navigation: `entryPointsFor()` offers no entry
 *   point for `/` (it is where entry points are offered), so the navigation itself
 *   never lists it — the app's name is the only way to it. Since epic
 *   `role-aware-landing` that address sends a person holding one recognised role
 *   straight on to the screen that role uses, so for the Importer here it is not a
 *   screen of its own to move to; the journeys below move between the two screens the
 *   navigation does offer, and the app's name is exercised for reachability and for
 *   where it leaves an Importer.
 * - At phone width the navigation may stay inline OR collapse behind a control. If it
 *   collapses, that control must be a `button` in the header whose accessible name
 *   says what it opens (something like "menu" or "navigation") — that is the one thing
 *   a phone user can operate, and `openHeaderNavigation` below drives it. The
 *   destinations may be portalled out of the header when open (a Shadcn sheet or
 *   dropdown does that), which is why the destination locator is not scoped to the
 *   `banner` landmark.
 * - Navigation may be client-side (Next.js `Link`) or a full document load; both are
 *   asserted the same way — by the address AND by content only the destination screen
 *   renders.
 * - AC-7: an address with no screen must be answered INSIDE the signed-in shell — a
 *   `not-found.tsx` in `app/(authenticated)/`, so that group's layout (and therefore
 *   `AppHeader` and its navigation) still renders, rather than Next's root fallback,
 *   which renders outside every layout and strands the user with only the browser's
 *   Back button — exactly what R11 was added to eliminate (story §Reconciled test
 *   contracts). Since every registered address now has a screen, the case is reached
 *   with a MISTYPED address, which that group answers through its catch-all segment.
 * - AC-7's WORDING CONTRACT, deliberately loose because the developer owns that copy
 *   and it has to serve genuinely mistyped addresses too: the page's own content must
 *   say the address has no screen, in words containing "not found" / "could not be
 *   found" / "does not exist". Nothing else about the copy is asserted — no heading
 *   level, no exact sentence, and no "coming soon" scaffolding is expected or allowed.
 *   The address must also still be answered with HTTP 404, not a 200 page that reads
 *   like a screen.
 * - Cookie assumptions: the mock `session` cookie carries production-like attributes
 *   (HttpOnly, SameSite=Strict). `Secure` is omitted because the E2E server is plain
 *   http on localhost; the real cookie's full attribute set is asserted in the Vitest
 *   layer (epic 1, story 1).
 *
 * KNOWN KNOCK-ON, for the developer to handle in this story's cycle (NOT changed
 * here): story 2's keyboard-only spec reaches the setting picker by pressing Tab from
 * page load within a fixed budget. Focusable destinations in the header insert tab
 * stops BEFORE the form, so that budget may need raising — never remove the header
 * links from the tab order to make it pass, which is exactly the failure AC-6 exists
 * to catch.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — the header shows the
 * app's name as plain text and holds no navigation at all, and the not-found page has
 * no header on it whatsoever.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { createFileLog, fileLogListResponse } from '../src/mocks/data/file-log';
import { fileSettingListResponse } from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER, ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  createTransaction,
  transactionListResponse,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';

/**
 * The two signed-in screens this story moves between (`lib/auth/access-map.ts`).
 *
 * They used to be the expense files screen and the landing screen. Since epic
 * `role-aware-landing` the app's address sends a person holding exactly one
 * recognised role straight on to the screen that role uses, so an Importer has no
 * landing screen of their own to move to — the journeys below move between the two
 * screens both roles may open, which is what the header's navigation offers anyway.
 * The moves are the same moves; only the far end of them changed.
 */
const UPLOAD_PATH = '/upload';
const REQUESTS_PATH = '/requests';

/**
 * An address inside the app that matches no screen — a mistyped or stale one, which is
 * what AC-7 is about now that every registered address has a screen of its own. It used
 * to be the review-and-decide address, whose screen belonged to a later epic; that
 * screen has since shipped (`expense-request-list`), so the "no screen" case is reached
 * the way a real user reaches it: by getting the address wrong. Deliberately not
 * registered in the access map, and never a real route.
 */
const ADDRESS_WITH_NO_SCREEN = '/expense-reqeusts';

/**
 * The app's name as the header shows it — the accessible name of the link to the app's
 * own address (AC-3).
 */
const APP_NAME = /employee expenses/i;

/**
 * How a control that opens a collapsed navigation conventionally reads. Only used at
 * phone width, and only when the destinations are not already on screen.
 */
const NAV_TOGGLE_NAME = /(menu|navigat)/i;

/**
 * How a not-found page tells the user there is no such screen. Deliberately loose: the
 * developer owns that copy, and it has to read sensibly for a genuinely mistyped
 * address as well as for the interim unbuilt screen. Any plain wording along these
 * lines passes; nothing else about the copy is asserted.
 */
const NOT_FOUND_MESSAGE =
  /(not be found|not found|does ?n[o']?t exist|no such)/i;

/**
 * A phone-sized viewport (a current mid-size handset in CSS pixels). Narrow enough
 * that a header laid out for a desktop has to do something about its navigation.
 */
const PHONE_VIEWPORT = { width: 390, height: 844 };

/**
 * The one file the mocked service returns. From the project-wide factory, so the name
 * asserted below is the same canonical value the other layers use — never a retyped
 * literal. Its row is how this spec recognises the expense files screen.
 */
const LISTED_FILE = createFileLog();

/**
 * The one expense request the mocked service returns, from the project-wide factory.
 * Its row is how this spec recognises the expense request list — the other screen the
 * header gets a user to.
 */
const LISTED_REQUEST = createTransaction();

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
 * never disagree with what the Node-side stub returns for the same session — the
 * navigation is built from the roles on that identity, so one person server-side and
 * another in the browser would mean two different sets of destinations.
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

/**
 * Answers story 1's read of the submitted files with the shared envelope factory. The
 * glob names no origin, so it matches whichever port the app is served on (:3000 in
 * dev, :3100 in the epic-end production run), and story 3's repeat reads get the same
 * body.
 */
const mockFileLogList = async (page: Page): Promise<void> => {
  await page.route('**/transactions-api/v1/file-logs**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fileLogListResponse([LISTED_FILE])),
    }),
  );
};

/**
 * Answers story 2's read of the named settings with the shared envelope factory.
 * Mocked in every test here even though this story asserts nothing about the submit
 * form: without it, the app's own route handler forwards that read to the live
 * transactions service, and its failure alert would appear on the screen this spec
 * navigates to.
 */
const mockFileSettingList = async (page: Page): Promise<void> => {
  await page.route('**/transactions-api/v1/file-settings**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fileSettingListResponse()),
    }),
  );
};

/**
 * Answers the expense request list's single read with the shared envelope factory —
 * the other screen the header moves to. Mocked for the same reason as the two reads
 * above: `/transactions-api/...` is the app's own same-origin mount point, so an
 * unmocked read is forwarded to the live transactions service from inside the Next.js
 * process, where `blockLiveBackends` cannot see it.
 */
const mockTransactionList = async (page: Page): Promise<void> => {
  await page.route('**/transactions-api/v1/transactions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(transactionListResponse([LISTED_REQUEST])),
    }),
  );
};

/**
 * The header's link to the app's own address — the app's own name (AC-3). Scoped to
 * the `banner` landmark, which the header must stay (existing header contract), and
 * found by its accessible name rather than by `href`, so it reads the way a user finds
 * it.
 */
const appNameLink = (page: Page): Locator =>
  page.getByRole('banner').getByRole('link', { name: APP_NAME });

/**
 * A destination the header's navigation offers, found by WHERE IT GOES rather than by
 * what it is called — the copy in `lib/auth/access-map.ts` is reworded from time to
 * time, while the address is the contract.
 *
 * Restricted to the `<nav>` the story requires, NOT to the whole page, because the
 * landing screen offers the same addresses in its own entry-point cards (story 1's
 * `RoleEntryPoints`) — without that restriction a test could pass by clicking a card
 * and never exercise the header at all. Not scoped to the `banner` either: a
 * collapsed navigation opened at phone width may be portalled out of the header.
 * `visible: true` because a responsive header may hold a wide-screen list and a
 * collapsed one at the same time, with only one of them on screen.
 */
const headerDestination = (page: Page, path: string): Locator =>
  page.locator(`nav a[href="${path}"]`).filter({ visible: true });

/**
 * The row the expense request list shows for the mocked request — content only that
 * screen renders, so it is how this spec recognises having arrived there. Found by the
 * request's own reference rather than by position, so the listing may be re-ordered or
 * re-columned without touching this spec.
 */
const listedRequestRow = (page: Page): Locator =>
  page
    .getByRole('main')
    .getByRole('row')
    .filter({ hasText: LISTED_REQUEST.Reference });

/**
 * The row the expense files screen shows for the mocked file, so it is how this spec
 * recognises having arrived there — and, just as importantly, how it recognises
 * having LEFT there.
 *
 * The file's NAME alone will not do that second job: every request on the expense
 * request list names the file it was imported from, and the request served here came
 * from this very file (both come from the same project-wide factories), so a row
 * carrying `expenses_2026-04-15.csv` is on either screen. What only the files screen
 * puts on that file's row is how far the file itself has got — its most recent
 * processing activity, which no request row carries. Matching on both is what makes
 * this locator mean "the files screen's row for this file" rather than "somewhere
 * this file is mentioned".
 */
const listedFileRow = (page: Page): Locator =>
  page
    .getByRole('main')
    .getByRole('row')
    .filter({ hasText: LISTED_FILE.CurrentFileName })
    .filter({ hasText: LISTED_FILE.LastExecutedActivityName });

/** How a control reads to a user, for readable failure output. */
const labelOf = (control: Locator): Promise<string> =>
  control.evaluate(
    (element) =>
      (
        element.getAttribute('aria-label') ??
        element.textContent ??
        ''
      ).trim() || element.tagName.toLowerCase(),
  );

/**
 * Presses `key` until the control has keyboard focus. Throws (failing the test with a
 * plain-English reason) when the control cannot be reached — that throw IS the
 * keyboard-reachability assertion. The same helper epic 1 story 3 uses for the shell
 * header and story 2 uses for the submit form, applied here to the header's
 * navigation.
 */
const pressUntilFocused = async (
  page: Page,
  key: string,
  control: Locator,
  maxPresses = 40,
): Promise<void> => {
  for (let press = 0; press <= maxPresses; press += 1) {
    const focused = await control.evaluate(
      (element) => element === document.activeElement,
    );
    if (focused) {
      return;
    }
    await page.keyboard.press(key);
  }
  throw new Error(
    `"${await labelOf(control)}" could not be reached with ${maxPresses} ` +
      `"${key}" presses, so it is not operable by keyboard alone (AC-6).`,
  );
};

/**
 * Brings the header's navigation destinations on screen at the CURRENT viewport, doing
 * what the user in front of that viewport would do — and nothing more:
 *
 * - a header that keeps its destinations on screen at this width needs no action;
 * - a header that collapses them behind a control has exactly one thing a phone user
 *   can operate, so that control is operated.
 *
 * When neither is true the navigation cannot be reached at this width at all, and the
 * throw explains that rather than leaving a click to time out. The caller still
 * asserts the outcome unconditionally: the destination has to be on screen and has to
 * take the user to its screen, whichever of the two designs is in front of it.
 */
const openHeaderNavigation = async (
  page: Page,
  destination: Locator,
): Promise<void> => {
  if ((await destination.count()) > 0) {
    return;
  }

  const toggle = page
    .getByRole('banner')
    .getByRole('button', { name: NAV_TOGGLE_NAME });

  if ((await toggle.count()) !== 1) {
    throw new Error(
      `At ${PHONE_VIEWPORT.width}px wide the header shows no navigation ` +
        `destinations, and offers no single control to open them either — expected ` +
        `one button in the header named for what it opens (something matching ` +
        `${String(NAV_TOGGLE_NAME)}), so a phone user can still get between screens ` +
        `(AC-6).`,
    );
  }

  await toggle.click();
};

test.describe('Epic expense-file-upload, Story 4: get between screens from anywhere', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-5
  // The browser's Back button is never touched here — nothing in this file steps back
  // through history. Both moves are made by operating the header, which is the whole
  // point of the criterion: the user reported having no way out of a screen.
  //
  // The way out used to be the app's own name, back to the landing screen. Since epic
  // `role-aware-landing` the app's address sends an Importer straight back to the
  // expense files screen, so the way out of it is the header's OTHER destination — the
  // expense request list, which both roles may open. Same criterion, same two moves,
  // both still made by the header alone.
  test('the header alone gets a user from the expense files screen to another screen and back again', async ({
    page,
    context,
  }) => {
    await seedSession(context, ROLE_IMPORTER);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await mockFileLogList(page);
    await mockFileSettingList(page);
    await mockTransactionList(page);
    await blockLiveBackends(page);

    // Start where the user was stuck: on the expense files screen.
    await page.goto(UPLOAD_PATH);
    await expect(listedFileRow(page)).toBeVisible();

    // 1. Out to the expense request list, by the header's destination for it.
    const expenseRequests = headerDestination(page, REQUESTS_PATH);
    await expect(expenseRequests).toBeVisible();
    await expenseRequests.click();
    await expect(page).toHaveURL(REQUESTS_PATH);
    await expect(listedRequestRow(page)).toBeVisible();
    // The expense files screen really was left behind, rather than the request list's
    // content appearing beside it. (The file's name on its own proves nothing here —
    // the request that just arrived names the file it came from; see `listedFileRow`.)
    await expect(listedFileRow(page)).toHaveCount(0);

    // 2. ...and back into the expense files screen, by the HEADER's destination for it
    // — not the landing screen's entry-point card, which story 1's spec already
    // covers. This is the leg that was impossible before this story.
    const expenseFiles = headerDestination(page, UPLOAD_PATH);
    await expect(expenseFiles).toBeVisible();
    await expenseFiles.click();
    await expect(page).toHaveURL(UPLOAD_PATH);
    await expect(listedFileRow(page)).toBeVisible();
  });

  // AC-6
  // One journey, both halves of the criterion: first the keyboard alone (no click at
  // all, in both directions), then the same navigation at phone width.
  test('the header navigation is reachable and followable using the keyboard alone, and stays usable at phone width', async ({
    page,
    context,
  }) => {
    await seedSession(context, ROLE_IMPORTER);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await mockFileLogList(page);
    await mockFileSettingList(page);
    await mockTransactionList(page);
    await blockLiveBackends(page);

    // Started from the other screen both roles may open, rather than from the app's
    // address: since epic `role-aware-landing` that address sends an Importer straight
    // on to the expense files screen, which is where this journey is going.
    await page.goto(REQUESTS_PATH);

    // 1. Keyboard only: reach the header's expense files destination by Tab, and follow
    // it with Enter. A destination taken out of the tab order, or one that only
    // responds to a mouse click, fails here.
    const expenseFiles = headerDestination(page, UPLOAD_PATH);
    await expect(expenseFiles).toBeVisible();
    await pressUntilFocused(page, 'Tab', expenseFiles);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(UPLOAD_PATH);
    await expect(listedFileRow(page)).toBeVisible();

    // 2. Keyboard only, the other way: the app's name is still reachable and still
    // gets them somewhere. Reached with Shift+Tab — walking back up the header the way
    // a keyboard user does, rather than relying on Tab wrapping round the end of the
    // document. For this Importer the app's address is their own screen, so following
    // the name leaves them on it instead of on a chooser.
    const appName = appNameLink(page);
    await expect(appName).toBeVisible();
    await pressUntilFocused(page, 'Shift+Tab', appName);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(UPLOAD_PATH);
    await expect(listedFileRow(page)).toBeVisible();

    // 3. The same navigation on a phone-sized screen, freshly rendered at that width
    // so the header lays itself out the way a phone user receives it.
    await page.setViewportSize(PHONE_VIEWPORT);
    await page.goto(REQUESTS_PATH);

    const narrowExpenseFiles = headerDestination(page, UPLOAD_PATH);
    await openHeaderNavigation(page, narrowExpenseFiles);

    // Whether the destinations stayed on screen or had to be opened, the outcome is
    // the same: the destination is there, and following it gets the user to its screen.
    await expect(narrowExpenseFiles).toBeVisible();
    await narrowExpenseFiles.click();
    await expect(page).toHaveURL(UPLOAD_PATH);
    await expect(listedFileRow(page)).toBeVisible();
  });

  // AC-7
  // The defect the epic-end code review found: `notFound()` has no `not-found.tsx` in
  // the `(authenticated)` group to answer it, so it bubbles past that group's layout to
  // Next's root fallback — a page with no `AppHeader` on it, leaving the user with only
  // the browser's Back button on the very screen the menu sent them to.
  //
  // The address is reached DIRECTLY rather than by clicking the menu item, on purpose:
  // it isolates this test's red on the missing shell (the menu offering and following
  // this destination is AC-1's and AC-6's job, and the story's manual checklist walks
  // the Approver's menu click end to end). It is also literally what a mistyped address
  // does, which is the other half of what the not-found page has to serve.
  test('an address with no screen still shows the header, and the user can leave by it rather than the browser Back button', async ({
    page,
    context,
  }) => {
    await seedSession(context, ROLE_APPROVER);
    await mockBrowserIdentityCall(page, ROLE_APPROVER);
    await mockFileLogList(page);
    await mockFileSettingList(page);
    await blockLiveBackends(page);

    const arrival = await page.goto(ADDRESS_WITH_NO_SCREEN);
    await expect(page).toHaveURL(ADDRESS_WITH_NO_SCREEN);

    // The address genuinely has no screen — answered as not found, not with a page that
    // reads like a working one. Asserted on the status rather than on copy, so this part
    // cannot be satisfied by wording alone.
    expect(
      arrival?.status(),
      `an address with no screen must still be answered as not found, so ${ADDRESS_WITH_NO_SCREEN} cannot look like a screen that works`,
    ).toBe(404);

    // THE POINT OF THIS TEST: the signed-in shell is still around the not-found page, so
    // there is a way out of it. This is what fails today — the page is rendered by
    // Next's root fallback, entirely outside the `(authenticated)` layout, so there is
    // no header on it at all.
    await expect(
      page.getByRole('banner'),
      'the not-found page must keep the signed-in header, or the user is stranded there (R11)',
    ).toBeVisible();
    const wayOut = headerDestination(page, UPLOAD_PATH);
    await expect(wayOut).toBeVisible();
    await expect(appNameLink(page)).toBeVisible();

    // ...and the page says plainly that there is no such screen. Wording is the
    // developer's; only the sense of it is fixed here (see the header's wording
    // contract), because this page serves mistyped addresses too.
    await expect(page.getByRole('main')).toContainText(NOT_FOUND_MESSAGE);

    // Leaving is done with the header — nothing here steps back through history — and
    // the arrival is asserted by content only the expense files screen renders.
    await wayOut.click();
    await expect(page).toHaveURL(UPLOAD_PATH);
    await expect(listedFileRow(page)).toBeVisible();
  });
});
