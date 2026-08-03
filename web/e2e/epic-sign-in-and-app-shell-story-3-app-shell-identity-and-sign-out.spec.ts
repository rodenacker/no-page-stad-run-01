/**
 * Story Metadata:
 * - Epic: sign-in-and-app-shell — Story 3: the signed-in app shell
 * - Route: /
 * - Target File: web/src/app/(authenticated)/layout.tsx
 * - Page Action: create_new
 * - Requirements: R2, R3, BR1, BR4, NFR4
 *
 * Covers the `playwright`-tagged criteria only:
 * - AC-3 — signed out, the app's front door lands on sign-in, with no starter
 *   welcome page and no glimpse of the protected screen first
 * - AC-4 — after signing out, the browser Back button does not reveal the page
 *   that was on screen
 * - AC-5 — the signed-in shell is keyboard reachable/operable with a visible focus
 *   indicator, and passes an automated accessibility check
 * AC-1, AC-2 and AC-6 are the Vitest layer's and are deliberately not repeated
 * here (testing-policy.md § "one tag, one layer").
 *
 * This story owns THIS EPIC'S SINGLE real-browser accessibility scan of the shared
 * shell — stories 4, 5 and 6 render inside this shell and do not re-run it. So the
 * scan below covers the shell in both of the states this story introduces: as it
 * lands, and with the header's user menu open.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy
 * ---------------------------------------------------------------------------
 * Backend calls are ALWAYS mocked — this spec never contacts a live backend and
 * never uses a real credential (testing-policy.md § "Playwright runs against
 * mocks, never live"), even though project.md records both real services as
 * running on this machine. Two boundaries, one contract:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with
 *    the app's auth base URL pointed at it by `playwright.config.ts`. This is the
 *    load-bearing layer for this story: every protected screen is gated
 *    SERVER-side (`requireSession()` → `GET /v1/auth/userinfo` from inside the
 *    Next.js process, brief BR1/BR3), and `page.route()` cannot see a fetch the
 *    browser never makes. The stub answers that call from the shared userinfo
 *    source, keyed off the `session` cookie value this spec seeds.
 * 2. Browser boundary → `page.route()` below: the identity call in case a client
 *    component reads it, plus a hard block on the real services' own origins
 *    (project.md records them at :4424 / :4423) so no browser-side call can leak
 *    to a live backend even if the app were wired to the wrong origin.
 *
 * Every response body comes from the project-wide mock data in
 * `web/src/mocks/data/` — no response shape is authored in this file.
 *
 * Implementation patterns this spec assumes (read before implementing):
 * - `/` is inside the `(authenticated)` route group and the starter template's
 *   Welcome page at `web/src/app/page.tsx` is REPLACED, not wrapped (story notes,
 *   CLAUDE.md §6). AC-3 exists to force that replacement.
 * - The gate redirects from the SERVER, so `GET /` for a signed-out visitor is
 *   answered with a redirect rather than with protected HTML: that is what makes
 *   "the content never appears first" true, and it is what AC-3 asserts.
 * - `requireSession()` treats the `session` cookie value as opaque (brief BR2) and
 *   forwards it to the auth service's userinfo endpoint; the stub answers whichever
 *   role's identity the seeded cookie stands for.
 * - Signing out is reached through the header's **user menu**: a `button` in the
 *   `<header>` (`role="banner"`) whose accessible name includes the signed-in
 *   person's name (their identity, brief R3 — the same chrome the Vitest layer
 *   asserts), which opens a menu containing a `Sign out` item. The story's
 *   implementation notes prescribe the Shadcn `dropdown-menu` for this user/theme
 *   menu, and story 5 adds the theme control to the same header.
 * - Sign-out calls the auth service same-origin (through the `next.config`
 *   rewrite, so the response's `Set-Cookie` reaches the browser) and, only on
 *   success, leaves for `/sign-in` (brief BR4). Whether the cookie is cleared by
 *   that forwarded `Set-Cookie` or by the app deleting it server-side, it must be
 *   gone afterwards — AC-4 depends on the session really being over.
 * - Protected pages must not be served from the browser's back/forward cache
 *   (`Cache-Control: no-store` or equivalent). An in-app redirect alone does not
 *   close the AC-4 leak: a cached page is painted without any request.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie
 * (brief BR2). Cookies ignore port, so one seeded cookie works for the dev server
 * (:3000) and the epic-end production run (:3100). `Secure` is omitted because the
 * E2E server is plain http on localhost; the real cookie's attributes are asserted
 * in the Vitest layer (story 1, AC-3).
 *
 * These tests WILL FAIL until implemented (TDD red).
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER } from '../src/mocks/data/role';
import { fullNameOf } from '../src/mocks/data/user';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { UserRead } from '../src/mocks/data/user';

/** The app's front door — the protected landing screen this story creates. */
const SHELL_ROUTE = '/';
/** Where a signed-out visitor belongs (story 2's screen). */
const SIGN_IN_ROUTE = '/sign-in';

/** The starter template's Welcome page heading, which `/` must no longer show. */
const STARTER_WELCOME_HEADING = 'Welcome';

/** Story 2's submit control — proof the sign-in screen itself is on screen. */
const SIGN_IN_SUBMIT = /sign in/i;
const SIGN_OUT_NAME = /sign out/i;

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/** Everything in the header a keyboard user must be able to reach. */
const INTERACTIVE_CONTROLS =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * WCAG 2.2 AA — this project's effective accessibility bar
 * (`documentation/requirements-application.md` §6.6.5, recorded in project.md
 * §Baseline NFRs as superseding the template's 2.1 AA floor). Scoped explicitly
 * because axe's defaults also run best-practice rules, which would fail this spec
 * on issues outside the agreed bar.
 */
const WCAG_22_AA_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
];

/** Blocks the live services outright (see LIVE_BACKEND_ORIGINS). */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Answers a browser-side identity read from the shared userinfo source, so it can
 * never disagree with what the Node-side stub returns for the same session. The
 * server-side gate is answered by the stub, not by this route.
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
 * Puts the browser in a signed-in state without driving the sign-in form (story
 * 2's spec owns that journey) and without any real credential: the mock `session`
 * cookie the stub recognises for this role.
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

/** The header's user menu, named for whoever is signed in (brief R3). */
const userMenuTriggerFor = (page: Page, user: UserRead): Locator =>
  page
    .getByRole('banner')
    .getByRole('button', { name: new RegExp(fullNameOf(user), 'i') });

/**
 * What the browser actually paints on a control, or `'none'`.
 *
 * Read from computed style rather than class names on purpose: a class assertion
 * would pass even if the styling token painted nothing at all, which is exactly
 * what AC-5's "visible focus indicator" cares about. Both shapes count, because
 * Shadcn/Tailwind render `focus-visible` styling as an outline on some primitives
 * and as a `box-shadow` ring on others. Callers compare the focused paint with the
 * unfocused paint, so a control carrying a permanent shadow cannot pass by
 * accident.
 */
const focusPaintOf = (control: Locator): Promise<string> =>
  control.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const outlineWidth = Number.parseFloat(style.outlineWidth);
    if (style.outlineStyle !== 'none' && outlineWidth > 0) {
      return `outline ${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`;
    }
    if (style.boxShadow && style.boxShadow !== 'none') {
      return `box-shadow ${style.boxShadow}`;
    }
    return 'none';
  });

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
 * Presses `key` until the control has keyboard focus. Throws (failing the test
 * with a plain-English reason) when the control cannot be reached — that throw IS
 * the keyboard-reachability assertion.
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
      `"${key}" presses, so it is not operable by keyboard (AC-5).`,
  );
};

/** Real-browser axe scan of whatever state the page is in right now. */
const expectNoAccessibilityViolations = async (
  page: Page,
  state: string,
): Promise<void> => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_22_AA_TAGS)
    .analyze();

  expect(
    violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes.length} node/s)`,
    ),
    `WCAG 2.2 AA violations in the signed-in shell (${state})`,
  ).toEqual([]);
};

test.describe('Epic sign-in-and-app-shell, Story 3: the signed-in app shell — identity and sign-out', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out; the signed-in ones seed their own session.
    await context.clearCookies();
  });

  // AC-3
  // `/` is this epic's only protected address; the same server-side gate covers
  // the screens later epics add (story 4's spec deep-links one of them).
  test('while signed out, the front door lands on the sign-in screen — no welcome page, and the app never shows first', async ({
    page,
    baseURL,
  }) => {
    await blockLiveBackends(page);

    const landing = await page.goto(SHELL_ROUTE);

    await expect(page).toHaveURL(new RegExp(`${SIGN_IN_ROUTE}(\\?|$)`));
    await expect(
      page.getByRole('button', { name: SIGN_IN_SUBMIT }),
    ).toBeVisible();

    // The starter template's Welcome page is gone from `/` — replaced by the
    // signed-in landing screen, not wrapped around it.
    await expect(
      page.getByRole('heading', { name: STARTER_WELCOME_HEADING, exact: true }),
    ).toHaveCount(0);

    // "...and the protected page's content never appears first": the front door
    // was answered with a redirect, so the protected screen's HTML was never
    // delivered to this browser — there is nothing that could flash up. A
    // client-side bounce would have delivered the page first and left no redirect
    // in the navigation chain (brief BR1).
    expect(
      landing?.request().redirectedFrom()?.url(),
      'GET / must be answered by a server-side redirect to the sign-in screen, so protected content is never sent to a signed-out visitor',
    ).toBe(`${baseURL}${SHELL_ROUTE}`);
  });

  // AC-4
  test('after signing out, the browser Back button does not reveal the page that was on screen', async ({
    page,
    context,
  }) => {
    const approver = userInfoFor(ROLE_APPROVER);
    await blockLiveBackends(page);
    await mockBrowserIdentityCall(page, ROLE_APPROVER);

    // Start where a signed-out visitor starts, then sign in and go to the app —
    // so the history the Back button walks is the one a real user would have.
    await page.goto(SIGN_IN_ROUTE);
    await seedSession(context, ROLE_APPROVER);
    await page.goto(SHELL_ROUTE);

    const userMenu = userMenuTriggerFor(page, approver);
    await expect(userMenu).toBeVisible();

    await userMenu.click();
    await page.getByRole('menuitem', { name: SIGN_OUT_NAME }).click();
    await expect(page).toHaveURL(new RegExp(`${SIGN_IN_ROUTE}(\\?|$)`));

    await page.goBack();

    // Back does not paint the signed-in page again: the user is on the sign-in
    // screen and nothing of their identity is on display.
    await expect(page).toHaveURL(new RegExp(`${SIGN_IN_ROUTE}(\\?|$)`));
    await expect(
      page.getByRole('button', { name: SIGN_IN_SUBMIT }),
    ).toBeVisible();
    await expect(page.getByText(fullNameOf(approver))).toHaveCount(0);
  });

  // AC-5
  // This epic's single real-browser accessibility scan of the shared shell, plus
  // the keyboard pass over it. Both shell states this story introduces are scanned
  // (as it lands, and with the user menu open) because violations are usually
  // state-specific.
  test('the signed-in shell is fully keyboard operable and passes an automated WCAG 2.2 AA check', async ({
    page,
    context,
  }) => {
    const approver = userInfoFor(ROLE_APPROVER);
    await blockLiveBackends(page);
    await mockBrowserIdentityCall(page, ROLE_APPROVER);
    await seedSession(context, ROLE_APPROVER);

    await page.goto(SHELL_ROUTE);
    const userMenu = userMenuTriggerFor(page, approver);
    await expect(userMenu).toBeVisible();

    await expectNoAccessibilityViolations(page, 'as it lands');

    // Every control in the shell header is reachable by Tab, and shows something
    // the user can see when it gets there.
    const headerControls = page
      .getByRole('banner')
      .locator(INTERACTIVE_CONTROLS);
    const unfocusedShell: { label: string; paint: string }[] = [];
    const focusedShell: { label: string; paint: string }[] = [];

    for (
      let index = 0, controls = await headerControls.count();
      index < controls;
      index += 1
    ) {
      const control = headerControls.nth(index);
      const label = await labelOf(control);
      unfocusedShell.push({ label, paint: await focusPaintOf(control) });
      await pressUntilFocused(page, 'Tab', control);
      focusedShell.push({ label, paint: await focusPaintOf(control) });
    }

    expect(
      focusedShell
        .filter(
          (control, index) =>
            control.paint === 'none' ||
            control.paint === unfocusedShell[index].paint,
        )
        .map((control) => control.label),
      'shell header controls that paint no visible focus indicator when reached by keyboard',
    ).toEqual([]);

    // The user menu opens from the keyboard...
    await pressUntilFocused(page, 'Tab', userMenu);
    await page.keyboard.press('Enter');
    const signOut = page.getByRole('menuitem', { name: SIGN_OUT_NAME });
    await expect(signOut).toBeVisible();

    await expectNoAccessibilityViolations(page, 'with the user menu open');

    // ...and sign-out is operable from the keyboard alone.
    await pressUntilFocused(page, 'ArrowDown', signOut);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${SIGN_IN_ROUTE}(\\?|$)`));
  });
});
