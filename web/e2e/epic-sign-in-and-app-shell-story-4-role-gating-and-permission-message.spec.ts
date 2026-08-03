/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/app/(authenticated)/page.tsx
 * - Page Action: modify_existing
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked — this spec never contacts a live backend and
 *   never uses real credentials (testing-policy.md § "Playwright runs against
 *   mocks, never live"), even though project.md records both real services as
 *   running locally. Every response body is taken from the project-wide mock data
 *   under `web/src/mocks/data/` — no response shape is authored in this file.
 *   Two boundaries are mocked, with one shared contract:
 *   1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`,
 *      started by `globalSetup` and wired in by `playwright.config.ts` (which
 *      points the app's auth base URL at it). This is the load-bearing layer here:
 *      every protected screen is gated SERVER-side (`requireSession()` →
 *      `GET /v1/auth/userinfo` from inside the Next.js process, brief BR1/BR3), and
 *      `page.route()` cannot see a fetch the browser never makes. The stub answers
 *      that call from the shared userinfo source, keyed off the `session` cookie
 *      value this spec seeds.
 *   2. Browser boundary → `page.route()` below, for the identity call in case a
 *      client component reads it, plus a defensive login intercept. The globs are
 *      origin-agnostic, so an auth call is mocked whether the browser sends it
 *      same-origin (through the next.config rewrite story 1 adds) or straight to
 *      the auth service's own origin.
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by
 *   driving the sign-in form: story 2's spec owns the form journey, and the cookie
 *   is the app's sole conveyance of session (brief BR2). Cookies ignore port, so the
 *   same seed works for the dev server (:3000) and the epic-end production run
 *   (:3100).
 * - Because the stub maps cookie token → role, the seeded token and the
 *   browser-side userinfo intercept must always name the SAME role — otherwise the
 *   server-rendered screen would show one person and the browser another. The two
 *   helpers below are therefore always called as a pair, per role.
 * - Implementation pattern this assumes:
 *   - `requireSession()` treats the `session` cookie value as opaque (brief BR2) and
 *     forwards it to the auth service's userinfo endpoint; the stub answers with
 *     whichever role's identity the seeded cookie stands for.
 *   - The excluded address is registered in this story's single route access map
 *     (`designChoices.roleDenialRegistration: "register-now"`), so reaching it
 *     renders the in-page denial instead of falling through to not-found. This
 *     spec does not hardcode that path: it reads it from the upload entry point a
 *     permitted user is offered, so it follows whatever path the access map seeds
 *     and cannot drift from it. That entry point must therefore be a real
 *     navigational link with an `href` (the same contract this story's Vitest file
 *     asserts), not a click handler on a button.
 *   - The permission message renders as the Shadcn `alert` primitive
 *     (`role="alert"`, per the story's implementation notes), inside story 3's
 *     normal shell (`<header>` → `role="banner"`), naming the missing permission —
 *     requirements §6.5 labels it "Upload an expense file" — and how to ask for
 *     access ("Request the missing access from the account holder", requirements
 *     §6.4 recovery).
 * - Cookie assumptions: the mock `session` cookie carries production-like
 *   attributes (HttpOnly, SameSite=Strict). `Secure` is omitted because the E2E
 *   server is plain http on localhost; the real cookie's full attribute set is
 *   asserted in the Vitest layer (story 1, AC-3).
 *
 * E2E spec for Epic "Sign in and the signed-in app shell", Story 4:
 * role-aware entry points and the permission message.
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real
 * credentials are needed.
 * These tests WILL FAIL until implemented (TDD red).
 *
 * Scope note: story 3 owns this epic's single real-browser accessibility scan of
 * the shared shell, so no axe scan is repeated here (story 4 § Implementation
 * notes). Hidden-vs-disabled entry points (AC-1, AC-2), the way back to a
 * permitted screen (AC-4) and session-driven entry points (AC-5) are covered in
 * this story's Vitest file.
 */
import { test, expect } from '@playwright/test';

// The mocked auth service's own session values — the stub maps token → role, so the
// cookie seeded below is the one it recognises for that role. Never an invented
// literal: a token the stub does not know 401s the server-side gate.
import { sessionCookieFor, sessionTokenFor } from './support/auth-api-stub';
// The ONE project-wide identity source both test layers share — never inline a
// userinfo body here. Relative import (not `@/`) so Playwright's runtime resolves
// it without alias plumbing.
import { userInfoFor, loginSuccessResponse } from '../src/mocks/data/identity';
import { ROLE_APPROVER, ROLE_FINANCE_UPLOADER } from '../src/mocks/data/role';

import type { BrowserContext, Page } from '@playwright/test';

/** The signed-in landing screen — the one screen both roles may view. */
const LANDING_PATH = '/';

/**
 * Seed the mock `session` cookie the app gates on for the named role, and mock
 * login defensively so a stray login request can never reach a live service.
 * Install before navigating.
 *
 * The value is `sessionTokenFor(roleName)` — the token the Node-side auth stub maps
 * back to this role when the server-side gate asks it who the session belongs to.
 * Re-seeding with another role overwrites the cookie (same name/domain/path), which
 * is how the second half of the test below switches identity.
 */
async function seedMockSession(
  page: Page,
  context: BrowserContext,
  roleName: string,
): Promise<void> {
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

  // Re-registered per role, so the defensive login mock mints the same role's
  // cookie as the seed above.
  await page.unroute('**/v1/auth/login');
  await page.route('**/v1/auth/login', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'set-cookie': sessionCookieFor(roleName) },
      contentType: 'application/json',
      body: JSON.stringify(loginSuccessResponse()),
    }),
  );
}

/**
 * Answer a BROWSER-side identity call with the userinfo body for the named role,
 * replacing any role mocked earlier in the test — the session's roles are what the
 * app gates on (brief BR3), so switching role means switching this response.
 *
 * Always called with the same role as `seedMockSession`: the server-side gate
 * resolves identity from the seeded cookie via the auth stub, and this route serves
 * the browser, so a mismatch would render one person server-side and another in the
 * browser. Both bodies come from the one shared `userInfoFor` source.
 */
async function mockUserInfoFor(page: Page, roleName: string): Promise<void> {
  await page.unroute('**/v1/auth/userinfo');
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(userInfoFor(roleName)),
    }),
  );
}

test.describe('Epic 1, Story 4: Role-aware entry points and the permission message', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-3
  test('an Approver opening the upload address gets the permission message in the app shell, not a not-found page', async ({
    page,
    context,
  }) => {
    // Signed in as a role the access map permits. Cookie token and userinfo body
    // name the SAME role, so the server-side gate and any browser-side identity
    // read cannot disagree about who is signed in.
    await seedMockSession(page, context, ROLE_FINANCE_UPLOADER);
    await mockUserInfoFor(page, ROLE_FINANCE_UPLOADER);

    // The address the app itself offers for uploading, read from the landing
    // screen of a role the access map permits — so this spec targets whatever
    // path the map seeds instead of duplicating a guess at it. `.first()` because
    // the shell may also offer the same destination in its navigation.
    await page.goto(LANDING_PATH);
    const uploadEntryPoint = page
      .getByRole('link', { name: /upload/i })
      .first();
    await expect(uploadEntryPoint).toBeVisible();
    const uploadPath = await uploadEntryPoint.getAttribute('href');
    if (!uploadPath) {
      throw new Error(
        'The upload entry point must be a navigational link with an href — the ' +
          "access map path is read from it (see this spec's Mocking strategy).",
      );
    }

    // Now go straight to that same address as an Approver, whom the access map
    // excludes from it — as if the address had been typed in or bookmarked. Both
    // layers switch role together: re-seeding overwrites the cookie with the token
    // the auth stub resolves to the Approver, and the browser-side userinfo follows.
    await seedMockSession(page, context, ROLE_APPROVER);
    await mockUserInfoFor(page, ROLE_APPROVER);
    const approver = userInfoFor(ROLE_APPROVER);
    const response = await page.goto(uploadPath);

    // A rendered screen, not a not-found (404) or a generic error (5xx) response.
    expect(response?.status()).toBe(200);
    // The denial explains itself in place — the user is not bounced elsewhere.
    await expect(page).toHaveURL(new RegExp(`${uploadPath}$`));

    // The in-page permission message (Shadcn `alert` → role="alert").
    const permissionMessage = page.getByRole('alert');
    await expect(permissionMessage).toBeVisible();
    // It names the missing permission (requirements §6.5: "Upload an expense
    // file") rather than saying only that access was denied.
    await expect(permissionMessage).toContainText(/upload/i);
    // ...and states how to get that access (requirements §6.4 recovery:
    // "Request the missing access from the account holder").
    await expect(permissionMessage).toContainText(
      /(request|ask)[\s\S]{0,60}access/i,
    );

    // Still inside the normal signed-in shell: the app header is present and
    // shows who the user is signed in as (brief R3) — not a bare error screen.
    const appHeader = page.getByRole('banner');
    await expect(appHeader).toBeVisible();
    await expect(appHeader).toContainText(new RegExp(approver.LastName, 'i'));

    // And explicitly not Next.js's not-found page.
    await expect(page.getByText(/this page could not be found/i)).toBeHidden();
  });
});
