/**
 * Story Metadata:
 * - Epic: expense-file-upload — Upload an expense file
 * - Story: 1 — The submitted expense files list
 * - Route: /upload
 * - Target File: web/src/app/(authenticated)/upload/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R3, R9, BR5
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-5 (both roles are offered the entry point and see the list, not a
 *   missing-permission message) and AC-6 (signed out, the address lands on
 *   sign-in) → this file.
 * - AC-1, AC-2, AC-3, AC-4 (columns, status label + intent colour, loading /
 *   empty / error-with-retry states, unrecognised values passed through) →
 *   `web/src/__tests__/integration/epic-expense-file-upload-story-1-submitted-files-list.test.tsx`
 *   (`vitest`). Deliberately NOT duplicated here.
 * - This epic's single real-browser accessibility scan of the finished screen is
 *   story 3's AC-6, so no axe scan is repeated here.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running locally. This screen crosses BOTH
 * mock boundaries, and epic 1 already established each one — this spec reuses
 * them rather than adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`,
 *    started by `globalSetup` and wired in by `playwright.config.ts`. Every
 *    protected screen is gated SERVER-side (`(authenticated)/layout.tsx` →
 *    `requireSession()` → `GET /v1/auth/userinfo` from inside the Next.js
 *    process, epic 1 BR1/BR3), and `page.route()` cannot see a fetch the browser
 *    never makes. The stub answers that call from the shared identity source,
 *    keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` (below), for this story's own read:
 *    `GET /transactions-api/v1/file-logs?IsActive=Yes`.
 *
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by
 *   driving the sign-in form — epic 1 story 2's spec owns that journey, and the
 *   cookie is the app's sole conveyance of session (epic 1 BR2). Cookies ignore
 *   port, so the same seed serves the dev server (:3000) and the epic-end
 *   production run (:3100). Re-seeding the same cookie name/domain/path overwrites
 *   it, which is how the test below switches identity between the two roles.
 * - Every response body comes from the project-wide factories under
 *   `web/src/mocks/data/` (`userInfoFor(role)`, `createFileLog()`,
 *   `fileLogListResponse()`); no response shape is authored in this file, so this
 *   spec and the Vitest layer cannot drift on the contract. The list envelope is
 *   `{ FileLog: [...] }` — the singular property holding the array — and
 *   `RecordCount` is a string on the wire; both are the factory's business.
 * - Implementation pattern this assumes:
 *   - The file list is read from the BROWSER, through the shared API client at the
 *     app's own same-origin `/transactions-api/...` address (story §Infrastructure
 *     reuse notes), i.e. from a client component. `page.route()` cannot intercept a
 *     fetch made by the Next.js server or by a Server Action — if this read moves
 *     server-side, this spec's mock is bypassed and the request would leave for the
 *     real transactions service. The story's loading placeholder and Try again
 *     action already imply the browser-side read.
 *   - The landing screen offers this screen as a real navigational LINK carrying
 *     its `href` (the contract `RoleEntryPoints` already keeps) — the entry point
 *     is located by DESTINATION below, not by label, because this story rewords
 *     that label for an Approver who only watches files.
 *   - Widening who may open the address happens in `lib/auth/access-map.ts` only
 *     (story §Infrastructure reuse notes); the page keeps the single server-side
 *     `requireSession()` / `canAccess()` check it already has.
 * - Cookie assumptions: the mock `session` cookie carries production-like
 *   attributes (HttpOnly, SameSite=Strict). `Secure` is omitted because the E2E
 *   server is plain http on localhost; the real cookie's full attribute set is
 *   asserted in the Vitest layer (epic 1, story 1).
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real
 * credentials are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — `/upload` is
 * still `notFound()` for a permitted user, and the Approver is still excluded from
 * the address altogether.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { createFileLog, fileLogListResponse } from '../src/mocks/data/file-log';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER, ROLE_FINANCE_UPLOADER } from '../src/mocks/data/role';
import { fullNameOf } from '../src/mocks/data/user';

import type { BrowserContext, Locator, Page } from '@playwright/test';

/** This story's screen, and the landing screen that offers it. */
const UPLOAD_PATH = '/upload';
const LANDING_PATH = '/';

/** Where a signed-out caller belongs (epic 1 story 2's screen). */
const SIGN_IN_ROUTE = '/sign-in';

/** Epic 1's sign-in submit control — proof the sign-in screen itself is on screen. */
const SIGN_IN_SUBMIT = /sign in/i;

/**
 * The one file the mocked service returns. Taken from the project-wide factory, so
 * the name and status asserted below are the same canonical values the Vitest layer
 * renders — never retyped literals.
 */
const LISTED_FILE = createFileLog();

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * Blocks the live services (see LIVE_BACKEND_ORIGINS). Registered LAST in each
 * test, because Playwright matches the most recently registered route first: that
 * way a call sent to a service's own origin is aborted and fails visibly, instead
 * of being quietly answered by the origin-agnostic mocks above it.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Answers this story's browser-side read of the submitted files with the shared
 * envelope factory. The glob names no origin, so it matches whichever port the app
 * is served on (:3000 in dev, :3100 in the epic-end production run). A call
 * addressed at the transactions service itself is still aborted, because
 * `blockLiveBackends` is registered after this one.
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
 * Puts the browser in a signed-in state as the named role, without a real
 * credential: the mock `session` cookie the Node-side auth stub maps back to this
 * role when the server-side gate asks it who the session belongs to. Re-seeding
 * with another role overwrites the cookie, which is how the identity is switched
 * mid-test.
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
 * Answers a BROWSER-side identity read from the shared userinfo source, replacing
 * any role mocked earlier in the test. Always switched together with
 * `seedSession`: the server-rendered screen resolves identity from the cookie via
 * the auth stub, so a mismatch would show one person server-side and another in the
 * browser.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.unroute('**/v1/auth/userinfo');
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(userInfoFor(roleName)),
    }),
  );
};

/**
 * The landing screen's entry point for this screen, found by WHERE IT GOES rather
 * than by what it is called: this story rewords the entry-point copy so it reads
 * for an Approver who only watches files, so the label is not a stable handle while
 * the destination is. Requiring an `a[href]` also pins the contract that the entry
 * point stays a real navigational link (openable in a new tab, announced as a link)
 * rather than a button that pushes a route. `.first()` because the shell may later
 * offer the same destination in navigation chrome as well.
 */
const expenseFilesEntryPoint = (page: Page): Locator =>
  page.getByRole('main').locator(`a[href="${UPLOAD_PATH}"]`).first();

test.describe('Epic expense-file-upload, Story 1: the submitted expense files list', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out; the signed-in one seeds its own session.
    await context.clearCookies();
  });

  // AC-5
  // One test, both roles: the criterion is that the SAME screen is reachable and
  // readable by each of them (brief R9), so the roles are walked in one journey
  // with the identity switched in between — the header assertion proves the switch
  // really happened rather than the same person being checked twice.
  test('a Finance Uploader and an Approver are each offered the expense files entry point and see the list, not a permission message', async ({
    page,
    context,
  }) => {
    await mockFileLogList(page);

    for (const roleName of [ROLE_FINANCE_UPLOADER, ROLE_APPROVER]) {
      await seedSession(context, roleName);
      await mockBrowserIdentityCall(page, roleName);
      await blockLiveBackends(page);

      const signedInUser = userInfoFor(roleName);

      // The landing screen offers the screen to this role at all (R9/R10) — an
      // excluded entry point is not rendered, so its presence is the assertion.
      await page.goto(LANDING_PATH);
      await expect(page.getByRole('banner')).toContainText(
        fullNameOf(signedInUser),
      );
      const entryPoint = expenseFilesEntryPoint(page);
      await expect(entryPoint).toBeVisible();

      // Opened the way a user opens it — by following the entry point, not by
      // typing the address.
      await entryPoint.click();
      await expect(page).toHaveURL(UPLOAD_PATH);

      // The list itself is on screen: the file the mocked service returned, with
      // the status it returned for it (BR5 — displayed as given).
      const screen = page.getByRole('main');
      await expect(screen.getByText(LISTED_FILE.CurrentFileName)).toBeVisible();
      await expect(
        screen.getByText(LISTED_FILE.CurrentStatus, { exact: true }),
      ).toBeVisible();

      // ...and NOT a missing-permission message. The denial renders as the Shadcn
      // `alert` primitive inside the screen's own content, so an empty `alert`
      // count is the check. Scoped to `main` because Next.js renders its route
      // announcer as a second, permanently empty `role="alert"` at body level.
      // Nothing else can be occupying it here: the list request was answered 200,
      // so the screen's error state is not showing either.
      await expect(screen.getByRole('alert')).toHaveCount(0);

      // ...and explicitly not the interim not-found page the address used to
      // answer a permitted user with.
      await expect(page.getByText(/this page could not be found/i)).toHaveCount(
        0,
      );
    }
  });

  // AC-6
  // This epic's one deep-link guard: epic 1 introduced the protected surface and
  // owns the sign-out / Back-button trio, but its specs could not cover an address
  // that did not exist yet.
  test('while signed out, the expense files address lands on the sign-in screen and never shows the list', async ({
    page,
    baseURL,
  }) => {
    // The list read is mocked even though it must never happen — so that "the list
    // is not shown" means the screen was never rendered, rather than merely that
    // there was no data to render.
    await mockFileLogList(page);
    await blockLiveBackends(page);

    const arrival = await page.goto(UPLOAD_PATH);

    await expect(page).toHaveURL(new RegExp(`${SIGN_IN_ROUTE}(\\?|$)`));
    await expect(
      page.getByRole('button', { name: SIGN_IN_SUBMIT }),
    ).toBeVisible();

    // None of the protected screen's content reached this browser.
    await expect(page.getByText(LISTED_FILE.CurrentFileName)).toHaveCount(0);

    // The address was answered by a SERVER-side redirect, so the file list's HTML
    // was never delivered — there is nothing that could flash up first. A
    // client-side bounce would have delivered the screen first and left no redirect
    // in the navigation chain (epic 1 BR1).
    expect(
      arrival?.request().redirectedFrom()?.url(),
      `GET ${UPLOAD_PATH} must be answered by a server-side redirect to the sign-in screen, so the file list is never sent to a signed-out visitor`,
    ).toBe(`${baseURL}${UPLOAD_PATH}`);
  });
});
