/**
 * Story Metadata:
 * - Epic: role-aware-landing — Land on the screen your role uses
 * - Story: 1 — Land on the screen your role uses
 * - Route: /
 * - Target File: web/src/app/(authenticated)/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R1, R2, R3, R4, R5, R6, R7, R10, BR1, BR3, NFR1, NFR2
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-1 (Approver-only lands on the expense request list, never seeing the chooser),
 *   AC-2 (Importer-only lands on the expense files screen, never seeing the chooser)
 *   and AC-6 (a signed-out visitor is still sent to sign-in) → this file. All three
 *   are about where a real browser is SENT, which only a real navigation can show.
 * - AC-3 (both roles still get the chooser), AC-4 (no recognised role still gets
 *   today's message) and AC-5 (the destination is worked out afresh from the current
 *   visit's roles) → the Vitest layer at `web/src/__tests__/integration/
 *   epic-role-aware-landing-story-1-land-on-the-screen-your-role-uses.test.tsx`.
 *   Deliberately NOT duplicated here: the E2E auth stub mints SINGLE-role sessions
 *   only (`./support/auth-api-stub.ts`), so a browser journey for the both-roles and
 *   the unrecognised-role cases would mean extending that stub for no gain (story
 *   §Reuse notes).
 * - No axe scan here. This story adds no markup of its own — it only decides where a
 *   navigation ends — and both destinations already carry their epic's real-browser
 *   accessibility scan (`epic-expense-file-upload` story 3, `epic-request-list-
 *   redesign` story 1). Scanning them again from this file would assert another
 *   story's contract.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running locally. Both boundaries were
 * established by epic `sign-in-and-app-shell`; this spec reuses their helpers rather
 * than adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. The landing address is
 *    gated SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and the destination
 *    decision this story adds reads the roles on THAT same resolution (BR1/NFR2).
 *    `page.route()` cannot see a fetch the browser never makes, so the stub is what
 *    makes the person here an Approver, an Importer, or nobody at all — keyed off the
 *    `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` (below), for the reads the DESTINATIONS make
 *    once this story has sent the user to them: `GET /transactions-api/v1/transactions`
 *    (the expense request list), and `GET /transactions-api/v1/file-logs` plus
 *    `GET /transactions-api/v1/file-settings` (the expense files screen). Mocking them
 *    is not optional even though this story asserts nothing about their content:
 *    `/transactions-api/...` is the app's OWN same-origin mount point, so an unmocked
 *    read is forwarded to the live transactions service by the app's route handler
 *    from inside the Next.js process, where `blockLiveBackends` cannot see it. The
 *    whole mount point is aborted first, so a read this file did not anticipate fails
 *    visibly instead of leaving quietly.
 *
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by driving
 *   the sign-in form — `epic-sign-in-and-app-shell` story 2 owns that journey, and the
 *   cookie is the app's sole conveyance of session. The roles are taken from the mock
 *   identities in `./fixtures/credentials` (`approverUser`, `importerUser`), each of
 *   which holds exactly ONE role — which is precisely the population AC-1 and AC-2 are
 *   about. They are NOT real accounts and hold no real credential. Cookies ignore port,
 *   so one seed serves the dev server (:3000) and the epic-end production run (:3100).
 * - Every response body comes from the project-wide factories under
 *   `web/src/mocks/data/` (`userInfoFor(role)`, `transactionListResponse()`,
 *   `fileLogListResponse()`, `fileSettingListResponse()`); no response shape is
 *   authored in this file, so this spec and the Vitest layer cannot drift.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - The redirect is a REAL server-side HTTP redirect issued from the landing address
 *   before any markup is produced (BR3/NFR1) — Next's `redirect()` in
 *   `app/(authenticated)/page.tsx`, not a `useEffect` that renders the chooser and then
 *   pushes a route. `arrivalStepsOf()` below reads the browser's own redirect chain, so
 *   a client-side render swap fails here: the `/` document would come back as content
 *   rather than as a redirect.
 * - The decision sits BEHIND the existing session gate, not in front of it (R7). A
 *   signed-out visitor must still be answered with one redirect, straight from `/` to
 *   the sign-in screen — an extra hop through `/requests` or `/upload` on the way is
 *   exactly what AC-6's chain assertion catches, and it would leak which screens exist
 *   to someone with no session at all.
 * - Nothing on either destination sends the user back toward `/` (BR4). A reverse
 *   redirect would show up here as extra steps in the arrival chain rather than as a
 *   hung test.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 *
 * TDD red: AC-1 and AC-2 FAIL until the story is implemented — today the landing
 * address renders the chooser for every signed-in person, so the arrival chain has no
 * redirect in it at all. AC-6 is a deliberate REGRESSION GUARD over behaviour that
 * already works (R7 — the gate is not to be changed), and passes from the start; its
 * job is to fail if the destination decision is ever placed ahead of the gate.
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

import type {
  BrowserContext,
  Locator,
  Page,
  Request,
  Response,
} from '@playwright/test';

/**
 * The app's address — the one every test here navigates to — and the three screens a
 * navigation to it can end on (`lib/auth/access-map.ts`, `lib/utils/constants.ts`).
 */
const LANDING_PATH = '/';
const REQUESTS_PATH = '/requests';
const UPLOAD_PATH = '/upload';
const SIGN_IN_PATH = '/sign-in';

/**
 * The chooser's own heading, as `RoleEntryPoints` writes it — the "What you can do"
 * screen AC-1 and AC-2 say must never be shown to a single-role person. Matched
 * case-insensitively so the copy may be re-cased without touching this spec; the
 * wording itself is the criterion's own words, and the two cases where it IS still the
 * right answer are asserted in the Vitest layer.
 */
const CHOOSER_HEADING = /what you can do/i;

/** How the sign-in screen's own form reads (`epic-sign-in-and-app-shell` story 2). */
const USERNAME_LABEL = /username/i;
const SIGN_IN_BUTTON = /sign in/i;

/**
 * The calls the destinations make, as the BROWSER addresses them: the app's own mount
 * point, never a service origin. No origin in the glob, so each matches whichever port
 * the app is served on (:3000 in dev, :3100 in the epic-end production run); trailing
 * `**` so query strings are covered.
 */
const TRANSACTIONS_API_GLOB = '**/transactions-api/**';
const TRANSACTIONS_URL_GLOB = '**/transactions-api/v1/transactions**';
const FILE_LOGS_URL_GLOB = '**/transactions-api/v1/file-logs**';
const FILE_SETTINGS_URL_GLOB = '**/transactions-api/v1/file-settings**';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * The one request and the one file the mocked services return. From the project-wide
 * factories, so the values recognised below are the same canonical ones the other
 * layers use — never retyped literals. Each is how this spec recognises the screen its
 * destination belongs to.
 */
const LISTED_REQUEST = createTransaction();
const LISTED_FILE = createFileLog();

/** A mocked JSON response, built from a project-wide factory body. */
const jsonResponse = (
  body: unknown,
): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

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

/**
 * Answers a browser-side identity read from the shared userinfo source, so it can never
 * disagree with what the Node-side stub returns for the same session — the destination
 * is decided from the roles on that identity, and one person server-side with another
 * in the browser would mean two different answers to the same question.
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
 * Answers the reads BOTH destinations make, so either one can be landed on and settle.
 * The whole `/transactions-api/**` mount point is aborted first (lowest priority, being
 * registered first), so a read this file did not anticipate fails visibly instead of
 * being forwarded to the live transactions service by the app's own route handler.
 */
const mockDestinationReads = async (page: Page): Promise<void> => {
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
 * WHAT THE BROWSER WAS ACTUALLY ANSWERED WITH ON THE WAY IN, oldest step first — the
 * whole redirect chain of the navigation, read from the browser rather than inferred
 * from the address bar.
 *
 * This is what makes "the chooser is never shown on the way" a real assertion rather
 * than a hopeful one. A server-side redirect (BR3/NFR1) reads as
 * `redirected away from /` — the `/` document carried no markup at all, so there was
 * nothing that could have flashed up. An implementation that rendered the chooser and
 * then moved the user on from the browser would read as `answered at /` instead, and
 * fail here, even though the address bar would end up looking identical.
 *
 * The 3xx code itself is deliberately not pinned: Next issues 307 for `redirect()`
 * today, and whether a future version uses 302 or 303 is not something any criterion
 * here is about. Any status that is neither a redirect nor a plain 200 is spelled out
 * in full, so a 404 or a 500 anywhere in the chain fails loudly rather than passing as
 * "an answer".
 */
const arrivalStepsOf = async (arrival: Response | null): Promise<string[]> => {
  if (arrival === null) {
    throw new Error(
      'The navigation produced no response at all, so there is no arrival chain to ' +
        'read. Expected the app to answer the landing address.',
    );
  }

  const steps: string[] = [];
  let request: Request | null = arrival.request();

  while (request !== null) {
    const answer = await request.response();
    const status = answer?.status() ?? 0;
    const { pathname } = new URL(request.url());
    // A step the browser was sent onward from — read from the chain the browser itself
    // built (`redirectedTo`), with the status as the second witness, so the reading
    // does not depend on an intermediate response body still being readable.
    const wasRedirected =
      request.redirectedTo() !== null || (status >= 300 && status < 400);

    if (wasRedirected) {
      steps.unshift(`redirected away from ${pathname}`);
    } else if (status === 200) {
      steps.unshift(`answered at ${pathname}`);
    } else {
      steps.unshift(`answered with ${String(status)} at ${pathname}`);
    }

    request = request.redirectedFrom();
  }

  return steps;
};

/** The screen's own content — never the shell around it. */
const screenOf = (page: Page): Locator => page.getByRole('main');

/**
 * The chooser's heading. Scoped to the screen's own content, so the header's navigation
 * — which offers the same two destinations by name on every signed-in screen — can
 * never be mistaken for the chooser having been rendered.
 */
const chooserHeading = (page: Page): Locator =>
  screenOf(page).getByRole('heading', { name: CHOOSER_HEADING });

/**
 * The row the expense request list shows for the mocked request — content only that
 * screen renders, so it is how this spec recognises having arrived there. Found by the
 * request's own reference rather than by position, so the listing may be re-ordered or
 * re-columned without touching this spec.
 */
const listedRequestRow = (page: Page): Locator =>
  screenOf(page).getByRole('row').filter({ hasText: LISTED_REQUEST.Reference });

/**
 * The row the expense files screen shows for the mocked file — content only that screen
 * renders, so it is how this spec recognises having arrived there.
 */
const listedFileRow = (page: Page): Locator =>
  screenOf(page)
    .getByRole('row')
    .filter({ hasText: LISTED_FILE.CurrentFileName });

test.describe('Epic role-aware-landing, Story 1: land on the screen your role uses', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds only the session it needs.
    await context.clearCookies();
  });

  // AC-1
  // The Approver's whole complaint in one journey: they open the app and want the
  // requests waiting for a decision, not a menu offering them one.
  test('a person holding only the Approver role opens the app address and arrives at the expense request list, with the chooser never shown on the way', async ({
    page,
    context,
  }) => {
    // `approverUser` holds exactly one role — which is what AC-1 is about.
    await seedSession(context, approverUser.role);
    await mockBrowserIdentityCall(page, approverUser.role);
    await mockDestinationReads(page);
    await blockLiveBackends(page);

    const arrival = await page.goto(LANDING_PATH);

    // The chooser was never sent to the browser: the landing address answered with a
    // redirect, and the very next thing the browser received was the request list. An
    // implementation that renders the chooser first and moves the user on afterwards
    // fails here (BR3/NFR1), and so does one that hops through a third screen.
    expect(
      await arrivalStepsOf(arrival),
      'an Approver-only person must be redirected from the app address straight to the expense request list, server-side',
    ).toEqual([
      `redirected away from ${LANDING_PATH}`,
      `answered at ${REQUESTS_PATH}`,
    ]);

    // ...and they really are on the request list, recognised by content only that
    // screen renders — not merely at an address that looks right.
    await expect(page).toHaveURL(REQUESTS_PATH);
    await expect(listedRequestRow(page)).toBeVisible();
    await expect(chooserHeading(page)).toHaveCount(0);
  });

  // AC-2
  // The mirror image, and the reason the decision cannot simply be "everyone goes to
  // the request list": an Importer's work starts at the files they send in.
  test('a person holding only the Importer role opens the app address and arrives at the expense files screen, with the chooser never shown on the way', async ({
    page,
    context,
  }) => {
    // `importerUser` holds exactly one role — which is what AC-2 is about.
    await seedSession(context, importerUser.role);
    await mockBrowserIdentityCall(page, importerUser.role);
    await mockDestinationReads(page);
    await blockLiveBackends(page);

    const arrival = await page.goto(LANDING_PATH);

    expect(
      await arrivalStepsOf(arrival),
      'an Importer-only person must be redirected from the app address straight to the expense files screen, server-side',
    ).toEqual([
      `redirected away from ${LANDING_PATH}`,
      `answered at ${UPLOAD_PATH}`,
    ]);

    await expect(page).toHaveURL(UPLOAD_PATH);
    await expect(listedFileRow(page)).toBeVisible();
    await expect(chooserHeading(page)).toHaveCount(0);
  });

  // AC-6
  // The regression guard on R7: this story adds a decision BEHIND the session gate and
  // changes nothing in front of it. A signed-out visitor is still answered with exactly
  // one redirect — to sign-in. An extra step through /requests or /upload would mean the
  // destination decision ran before anyone knew who was asking, and would tell a visitor
  // with no session which screens the app has.
  test('a signed-out visitor opening the app address is still sent to sign-in, with no destination decision ahead of the gate', async ({
    page,
  }) => {
    // No session is seeded: `beforeEach` cleared the cookies, and nothing here signs in.
    await mockDestinationReads(page);
    await blockLiveBackends(page);

    const arrival = await page.goto(LANDING_PATH);

    expect(
      await arrivalStepsOf(arrival),
      'a signed-out visitor must go from the app address to sign-in in one step — no destination decision may run ahead of the session gate',
    ).toEqual([
      `redirected away from ${LANDING_PATH}`,
      `answered at ${SIGN_IN_PATH}`,
    ]);

    // They are on the sign-in screen itself, recognised by the form they have to
    // complete — not by the address alone.
    await expect(page).toHaveURL(new RegExp(`${SIGN_IN_PATH}(\\?|$)`));
    await expect(page.getByLabel(USERNAME_LABEL)).toBeVisible();
    await expect(
      page.getByRole('button', { name: SIGN_IN_BUTTON }),
    ).toBeVisible();

    // Nothing of the signed-in app reached them on the way.
    await expect(chooserHeading(page)).toHaveCount(0);
    await expect(listedRequestRow(page)).toHaveCount(0);
    await expect(listedFileRow(page)).toHaveCount(0);
  });
});
