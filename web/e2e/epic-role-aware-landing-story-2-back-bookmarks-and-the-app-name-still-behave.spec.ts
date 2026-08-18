/**
 * Story Metadata:
 * - Epic: role-aware-landing — Land on the screen your role uses
 * - Story: 2 — Back, bookmarks and the app's name still behave
 * - Route: /
 * - Target File: web/src/app/(authenticated)/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R8, R9, BR2, BR4
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-1 (Back after the landing redirect takes the person OFF their screen rather
 *   than pushing them straight forward onto it again), AC-2 (the header's app name
 *   round-trips a single-role person back to their own screen, and Back still works
 *   afterwards) and AC-3 (a typed or pasted address for either destination opens it
 *   for either role) → this file.
 * - AC-4 (who may open `/requests` and `/upload` is unchanged — `allowedRoles` in
 *   `lib/auth/access-map.ts` still lists both roles) → the Vitest layer at
 *   `web/src/__tests__/integration/epic-role-aware-landing-story-2-back-bookmarks-and-the-app-name-still-behave.test.tsx`.
 *   Deliberately NOT duplicated here: it is a fact about a seeded map, not a journey.
 * - No axe scan here. This story renders no new markup at all — it is entirely about
 *   where a navigation ends up — and both screens it lands on are already scanned by
 *   their own epics' specs.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running locally. Both boundaries were
 * established by epic `sign-in-and-app-shell`; this spec reuses their helpers rather
 * than adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. Every screen this spec
 *    touches is gated SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()` cannot
 *    see a fetch the browser never makes. The stub answers that call from the shared
 *    identity source, keyed off the `session` cookie value seeded below. THAT SAME CALL
 *    IS WHAT THIS STORY'S REDIRECT DECIDES FROM — the destination is resolved from the
 *    roles on its response, so the stub is what makes the journeys below meaningful.
 * 2. Browser boundary → `page.route()` (below). This story adds no backend call of its
 *    own, but every journey here LANDS on `/requests` or `/upload`, and those screens
 *    read `GET /transactions-api/v1/transactions`, `GET /transactions-api/v1/file-logs`
 *    and `GET /transactions-api/v1/file-settings` from the browser. ALL THREE are mocked
 *    in every test, including where nothing is asserted about them:
 *    `/transactions-api/...` is the app's OWN same-origin mount point, so an unmocked
 *    read is forwarded to the live transactions service by the app's route handler from
 *    inside the Next.js process — where `blockLiveBackends` cannot see it. A catch-all
 *    abort under that mount point is registered FIRST (Playwright matches the most
 *    recently registered route first), so any OTHER call there fails visibly instead of
 *    reaching a real service.
 *
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by driving
 *   the sign-in form — epic 1 story 2's spec owns that journey, and the cookie is the
 *   app's sole conveyance of session. The role each session belongs to is taken from
 *   `./fixtures/credentials` (`importerUser.role`, `approverUser.role`), so the accounts
 *   these journeys run as are the very identities the stubbed auth service accepts.
 *   Cookies ignore port, so one seed serves the dev server (:3000) and the epic-end
 *   production run (:3100).
 * - Every response body comes from the project-wide factories under
 *   `web/src/mocks/data/` (`userInfoFor(role)`, `transactionListResponse()`,
 *   `fileLogListResponse()`, `fileSettingListResponse()`); no response shape is authored
 *   in this file, so this spec and the Vitest layer cannot drift on the contract.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - HISTORY IS THE WHOLE SUBJECT, so every assertion below is made through REAL browser
 *   navigation — `page.goto()` for a typed or pasted address, a real click for the
 *   header link, `page.goBack()` for the Back button. Nothing here inspects the router,
 *   the history length, or any other implementation detail; the only evidence taken is
 *   WHICH SCREEN the browser ends up on.
 * - The landing redirect must carry REPLACE semantics: once it has fired, `/` must not
 *   occupy a history entry of its own (story §Summary, R9/BR4). That is exactly what
 *   makes the assertions below discriminating, and it is worth spelling out why they
 *   cannot pass against a pushing implementation:
 *     · AC-1 — with push semantics, Back from the destination lands on `/`, whose
 *       redirect fires again and sends the browser FORWARD onto the destination. The
 *       screen visited before `/` becomes unreachable, so its content never appears and
 *       the assertion fails. A correct implementation reaches it in one step.
 *     · AC-2 — the same trap, entered by the header's app-name link instead of the
 *       address bar. With push semantics Back returns to `/` and bounces forward again.
 *   Neither test can be satisfied by weakening the destination assertion, because a
 *   trapped browser never reaches the earlier screen at all.
 * - A server-issued redirect on a document load (Next's `redirect()` from the server
 *   component) already replaces rather than stacks, so AC-1's half may well pass on
 *   cycle 1. The CLIENT-SIDE half (AC-2, a Next `<Link>` click that meets the same
 *   redirect) is the one that has to be got right deliberately.
 * - `web/src/components/layout/AppHeader.tsx` links the app's name to `LANDING_PATH`
 *   from every screen. That link is NOT to be changed by this story — only proven safe
 *   (story §Reuse notes). It is located below by its accessible name inside the `banner`
 *   landmark, the same way epic `expense-file-upload` story 4 locates it.
 * - Nothing on `/requests` or `/upload` may redirect toward `/` (BR4). AC-3 guards that
 *   as well as `allowedRoles` being left alone (BR2): if either screen grew a "you
 *   shouldn't be here, go home" check, or if `allowedRoles` were narrowed, the direct
 *   addresses below would stop opening.
 * - Cookie assumptions: the mock `session` cookie carries production-like attributes
 *   (HttpOnly, SameSite=Strict). `Secure` is omitted because the E2E server is plain
 *   http on localhost; the real cookie's full attribute set is asserted in the Vitest
 *   layer (epic 1, story 1).
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend response
 * below is mocked, so no live backend is contacted and no real credentials are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — today `/` renders the
 * chooser for everybody, so a single-role person is never sent onward and AC-1/AC-2
 * never reach the destination they assert.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { approverUser, importerUser } from './fixtures/credentials';
import { sessionTokenFor } from './support/auth-api-stub';
import { createFileLog, fileLogListResponse } from '../src/mocks/data/file-log';
import { fileSettingListResponse } from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import {
  createTransaction,
  transactionListResponse,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';

/**
 * The three addresses this story moves between (`lib/auth/access-map.ts`). The landing
 * address is the one whose behaviour changed; the other two are the destinations, and
 * are untouched by this epic.
 */
const LANDING_PATH = '/';
const UPLOAD_PATH = '/upload';
const REQUESTS_PATH = '/requests';

/**
 * Where this epic sends a person holding exactly one role (story 1, R1/R2). Stated
 * literally rather than recomputed from the access map, so a test asserting "the
 * Approver ended up on the request list" cannot be satisfied by whatever the code under
 * test happens to believe the Approver's screen is.
 */
const APPROVER_DESTINATION = REQUESTS_PATH;
const IMPORTER_DESTINATION = UPLOAD_PATH;

/**
 * The calls the two destinations make, as the BROWSER addresses them: the app's own
 * mount point, never a service origin. Trailing `**` so query strings are covered.
 */
const TRANSACTIONS_API_GLOB = '**/transactions-api/**';
const TRANSACTIONS_URL_GLOB = '**/transactions-api/v1/transactions**';
const FILE_LOGS_URL_GLOB = '**/transactions-api/v1/file-logs**';
const FILE_SETTINGS_URL_GLOB = '**/transactions-api/v1/file-settings**';

/** The identity read, wherever the browser addresses it. */
const USERINFO_URL_GLOB = '**/v1/auth/userinfo';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * The app's name as the header shows it — the accessible name of the link pointing at
 * `LANDING_PATH` from every screen, and therefore the round trip AC-2 exercises.
 */
const APP_NAME = /employee expenses/i;

/**
 * The chooser's own heading (`RoleEntryPoints`) — the screen a single-role person must
 * no longer be left on.
 */
const CHOOSER_HEADING_NAME = /what you can do/i;

/** The expense files screen's own heading — content only that screen renders. */
const EXPENSE_FILES_HEADING_NAME = /^expense files$/i;

/**
 * The in-page permission denial's heading (`PermissionDeniedMessage`) — it must never
 * appear for either of this project's real roles, on either destination.
 */
const ACCESS_NEEDED_HEADING_NAME = /^access needed$/i;

/**
 * The one request and the one file the mocked service returns, from the project-wide
 * factories, so the values asserted below are the canonical ones every layer uses rather
 * than retyped literals. Each is how this spec recognises having arrived at its screen.
 */
const LISTED_REQUEST = createTransaction();
const LISTED_FILE = createFileLog();

/** Every direct-address journey AC-3 covers: both destinations, for both real roles. */
const DIRECT_ADDRESS_JOURNEYS = [
  { roleName: importerUser.role, path: REQUESTS_PATH },
  { roleName: importerUser.role, path: UPLOAD_PATH },
  { roleName: approverUser.role, path: REQUESTS_PATH },
  { roleName: approverUser.role, path: UPLOAD_PATH },
] as const;

/** A mocked 200 JSON response, built from a project-wide factory body. */
const jsonResponse = (
  body: unknown,
): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/**
 * Blocks the live services (see LIVE_BACKEND_ORIGINS). Registered LAST, because
 * Playwright matches the most recently registered route first: that way a call sent to a
 * service's own origin is aborted and fails visibly, instead of being quietly answered
 * by the origin-agnostic mocks above it.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Puts the browser in a signed-in state as the named role, without a real credential:
 * the mock `session` cookie the Node-side auth stub maps back to this role when the
 * server-side gate — and this story's destination decision — ask who the session belongs
 * to. Any earlier session is cleared first, so a journey that changes role cannot carry
 * the previous one forward.
 */
const seedSession = async (
  context: BrowserContext,
  roleName: string,
): Promise<void> => {
  await context.clearCookies();
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
 * disagree with what the Node-side stub returns for the same session — this story's
 * whole decision is made from those roles, and one person server-side with another in
 * the browser would mean two different destinations.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.route(USERINFO_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(userInfoFor(roleName))),
  );
};

/**
 * The mocked transactions service, serving both destinations' reads from the shared
 * envelope factories. The catch-all abort is registered FIRST so it loses to the
 * specific reads below it: any other call under the app's transactions mount point is
 * aborted rather than forwarded to the live service by the app's own proxy.
 *
 * `/upload`'s two reads are mocked even in tests that assert nothing about them —
 * without them the app forwards those reads to the live transactions service and the
 * screen fills with failure alerts instead of the content this spec recognises it by.
 */
const serveTransactionsService = async (page: Page): Promise<void> => {
  await page.route(TRANSACTIONS_API_GLOB, (route) => route.abort());
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse([LISTED_REQUEST]))),
  );
  await page.route(FILE_LOGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileLogListResponse([LISTED_FILE]))),
  );
  await page.route(FILE_SETTINGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileSettingListResponse())),
  );
};

/**
 * Everything a journey needs before its first navigation: a session for the role, an
 * identity read that agrees with it, the destinations' own reads, and the live services
 * shut out. Safe to call again to change role mid-test — later registrations win.
 */
const enterAppAs = async (
  context: BrowserContext,
  page: Page,
  roleName: string,
): Promise<void> => {
  await seedSession(context, roleName);
  await mockBrowserIdentityCall(page, roleName);
  await serveTransactionsService(page);
  await blockLiveBackends(page);
};

/** The screen's own region — every recogniser below is scoped to it, never to the shell. */
const screenOf = (page: Page): Locator => page.getByRole('main');

/** The expense files screen, recognised by its own heading. */
const expenseFilesScreen = (page: Page): Locator =>
  screenOf(page).getByRole('heading', { name: EXPENSE_FILES_HEADING_NAME });

/**
 * The expense request list, recognised by the mocked request's row — found by its
 * `Reference` (the brief's identifier for a request), never by position.
 */
const expenseRequestScreen = (page: Page): Locator =>
  screenOf(page).getByRole('row').filter({ hasText: LISTED_REQUEST.Reference });

/** The chooser, recognised by its own heading. */
const chooserScreen = (page: Page): Locator =>
  screenOf(page).getByRole('heading', { name: CHOOSER_HEADING_NAME });

/** The in-page permission denial, recognised by its own heading. */
const permissionDenial = (page: Page): Locator =>
  screenOf(page).getByRole('heading', { name: ACCESS_NEEDED_HEADING_NAME });

/**
 * The header's link back to the landing address — the app's own name. Scoped to the
 * `banner` landmark the header must remain, and found by its accessible name rather than
 * by `href`, so it is reached the way a user reaches it.
 */
const appNameLink = (page: Page): Locator =>
  page.getByRole('banner').getByRole('link', { name: APP_NAME });

/**
 * Content only the screen at `path` renders — how this spec knows which screen the
 * browser actually ended up on, independently of what the address bar says. Throws on an
 * address it has no recogniser for, rather than silently falling back to one of the two.
 */
const contentOnlyRenderedAt = (page: Page, path: string): Locator => {
  if (path === REQUESTS_PATH) {
    return expenseRequestScreen(page);
  }
  if (path === UPLOAD_PATH) {
    return expenseFilesScreen(page);
  }
  throw new Error(
    `This spec has no way to recognise the screen at "${path}". Add one beside ` +
      `expenseRequestScreen / expenseFilesScreen if a journey needs it.`,
  );
};

test.describe("Epic role-aware-landing, Story 2: Back, bookmarks and the app's name still behave", () => {
  // AC-1
  test('pressing Back after being sent from the app address to your own screen takes you off that screen', async ({
    context,
    page,
  }) => {
    await enterAppAs(context, page, approverUser.role);

    // A screen visited BEFORE the app's own address, so Back has somewhere real to
    // return to. The Approver may open the expense files screen directly — this epic
    // changes where people are SENT, never what they may open.
    await page.goto(UPLOAD_PATH);
    await expect(expenseFilesScreen(page)).toBeVisible();

    // The app's own address, typed or opened from a bookmark: the redirect takes over
    // and the Approver arrives at the expense request list.
    await page.goto(LANDING_PATH);
    await expect(expenseRequestScreen(page)).toBeVisible();
    await expect(page).toHaveURL(APPROVER_DESTINATION);

    await page.goBack();

    // They are OFF the destination and back where they came from. With a landing entry
    // left in history this is unreachable: Back would land on `/`, the redirect would
    // fire again, and the browser would be pushed straight forward onto the request list
    // — so the expense files screen would never appear at all.
    await expect(expenseFilesScreen(page)).toBeVisible();
    await expect(expenseRequestScreen(page)).toBeHidden();
    await expect(page).toHaveURL(UPLOAD_PATH);
  });

  // AC-2
  test("clicking the app's name brings you back to your own screen, and Back still works afterwards", async ({
    context,
    page,
  }) => {
    await enterAppAs(context, page, importerUser.role);

    // Somewhere else in the app first: a screen the Importer may open directly, and the
    // entry Back must be able to return to at the end.
    await page.goto(REQUESTS_PATH);
    await expect(expenseRequestScreen(page)).toBeVisible();

    // The header's app name points at the landing address from every screen. For a
    // single-role person that address now carries them on — to their own screen, not to
    // the chooser.
    await appNameLink(page).click();

    await expect(expenseFilesScreen(page)).toBeVisible();
    await expect(page).toHaveURL(IMPORTER_DESTINATION);
    await expect(chooserScreen(page)).toBeHidden();

    await page.goBack();

    // Back still walks the pages actually visited. Had the app-name click left a landing
    // entry in history, Back would return to `/` and be bounced forward onto the expense
    // files screen again, and the request list would never come back.
    await expect(expenseRequestScreen(page)).toBeVisible();
    await expect(page).toHaveURL(REQUESTS_PATH);
  });

  // AC-3
  test('a typed or pasted address for either screen still opens it for either role', async ({
    context,
    page,
  }) => {
    for (const journey of DIRECT_ADDRESS_JOURNEYS) {
      await test.step(`${journey.roleName} opens ${journey.path} directly`, async () => {
        await enterAppAs(context, page, journey.roleName);

        await page.goto(journey.path);

        // The screen itself opened — not the chooser, not a denial, and nothing carried
        // the person on somewhere else.
        await expect(contentOnlyRenderedAt(page, journey.path)).toBeVisible();
        await expect(page).toHaveURL(journey.path);
        await expect(permissionDenial(page)).toBeHidden();
        await expect(chooserScreen(page)).toBeHidden();
      });
    }
  });
});
