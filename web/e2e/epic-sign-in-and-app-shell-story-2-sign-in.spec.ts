/**
 * Story Metadata:
 * - Epic: sign-in-and-app-shell — Sign in and the signed-in app shell
 * - Story: 2 — Sign in
 * - Route: /sign-in
 * - Target File: web/src/app/sign-in/page.tsx
 * - Page Action: create_new
 * - Requirements: R1, R4, R5, R6, R7, R8, R9, R12, R18, NFR1, NFR3
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-3 (accepted credentials land on the signed-in screen) and AC-6 (keyboard
 *   completability, visible focus, automated accessibility check) → this file.
 * - AC-1, AC-2, AC-4, AC-5 → `web/src/__tests__/integration/
 *   epic-sign-in-and-app-shell-story-2-sign-in.test.tsx` (`vitest`). Deliberately
 *   NOT duplicated here.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * (testing-policy.md § "Playwright runs against mocks, never live"). This project
 * needs BOTH mock boundaries, because sign-in crosses both:
 *
 * 1. Browser boundary → `page.route()` (below). The sign-in form's
 *    `POST /v1/auth/login` must be a BROWSER-side fetch through the shared API
 *    client to the same-origin path `/v1/auth/login` (forwarded by the app —
 *    epic brief §Notes & Caveats). NOT a Server Action and not a bare `fetch()`:
 *    `page.route()` cannot see Server Action requests. The interceptor answers with
 *    `loginSuccessResponse()` plus the session cookie the auth service would set,
 *    and the app must forward that `Set-Cookie` to the browser.
 * 2. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`,
 *    started by `globalSetup` and wired in via `playwright.config.ts`. Every
 *    protected screen is gated SERVER-side (`requireSession()` →
 *    `GET /v1/auth/userinfo`, epic brief BR1/BR3), and that fetch leaves the Node
 *    process where `page.route()` cannot reach it. `requireSession()` must forward
 *    the incoming `session` cookie on that call — otherwise the gate sees no
 *    session and bounces back to `/sign-in`, and AC-3 fails.
 *
 * Both layers compose the SAME project-wide factories in `web/src/mocks/data/`
 * (`loginSuccessResponse()`, `userInfoFor(role)`, `ROLE_*`) and the same
 * `sessionCookieFor(role)` cookie, so the two mock layers — and the Vitest layer —
 * cannot drift on the identity contract. No response body is hand-written here.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie set
 * on the login response (epic brief BR2); nothing auth-related is kept in
 * localStorage/sessionStorage. `./fixtures/credentials` holds MOCK identities for
 * form-fill only — never real accounts, never real passwords.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { importerUser } from './fixtures/credentials';
import { sessionCookieFor } from './support/auth-api-stub';
import {
  loginErrorResponse,
  loginSuccessResponse,
  userInfoFor,
} from '../src/mocks/data/identity';
import { fullNameOf } from '../src/mocks/data/user';

import type { MockCredential } from './fixtures/credentials';
import type { Locator, Page } from '@playwright/test';

/** The story's route, and the main signed-in screen it leads to (Story 3's shell). */
const SIGN_IN_ROUTE = '/sign-in';
const SIGNED_IN_ROUTE = '/';

/** Labels carry the required-field asterisk (R7), so match on the field name. */
const USERNAME_LABEL = /username/i;
const PASSWORD_LABEL = /password/i;
const SUBMIT_NAME = /sign in/i;

/**
 * The required-field wording (R4/R5) read from the shared auth-contract source
 * rather than retyped, so this spec and the Vitest layer assert one string.
 */
const REQUIRED_MESSAGE = loginErrorResponse().Message;

/**
 * WCAG 2.2 AA — this project's effective accessibility bar
 * (`documentation/requirements-application.md` §6.6.5 / project.md §Baseline NFRs,
 * which supersedes the template's 2.1 AA floor). Scoped explicitly because axe's
 * defaults also run best-practice rules, which would fail the spec on issues
 * outside the agreed bar.
 */
const WCAG_22_AA_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
];

/**
 * Mocks the auth service at the browser boundary for one mock identity: an
 * accepted login that mints the role's session cookie, plus the userinfo body in
 * case a client component reads identity from the browser. The Node-side session
 * check is answered by the stub in `./support/auth-api-stub.ts`, keyed off the
 * same cookie. Install before navigating.
 */
const mockAcceptedAuth = async (
  page: Page,
  credential: MockCredential,
): Promise<void> => {
  await page.route('**/v1/auth/login', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'set-cookie': sessionCookieFor(credential.role) },
      contentType: 'application/json',
      body: JSON.stringify(loginSuccessResponse()),
    }),
  );
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(userInfoFor(credential.role)),
    }),
  );
};

/**
 * What the browser actually paints on a control when it has focus, or `'none'`.
 *
 * Read from computed style rather than class names on purpose: a class assertion
 * would pass even if the styling token painted nothing at all, which is exactly
 * the failure NFR1 ("a visible focus indicator on every interactive element")
 * cares about. Both shapes count, because Shadcn/Tailwind render `focus-visible`
 * styling as an outline on some primitives and as a `box-shadow` ring on others.
 * Callers compare the focused paint against the unfocused paint, so a control that
 * carries a permanent shadow cannot pass by accident.
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

/** Real-browser axe scan of the current state of the page. */
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
    `WCAG 2.2 AA violations on the sign-in screen (${state})`,
  ).toEqual([]);
};

test.describe('Epic sign-in-and-app-shell, Story 2: Sign in', () => {
  test.beforeEach(async ({ context }) => {
    // No leftover session — every test starts signed out.
    await context.clearCookies();
  });

  // AC-3
  test('accepted credentials take the user from the sign-in screen to the main signed-in screen', async ({
    page,
  }) => {
    await mockAcceptedAuth(page, importerUser);

    await page.goto(SIGN_IN_ROUTE);
    await page.getByLabel(USERNAME_LABEL).fill(importerUser.username);
    await page.getByLabel(PASSWORD_LABEL).fill(importerUser.password);
    await page.getByRole('button', { name: SUBMIT_NAME }).click();

    // Landed on the app's main signed-in screen (R1) — not still on sign-in, and
    // not bounced back there by the server-side session gate.
    await expect(page).toHaveURL(SIGNED_IN_ROUTE);
    await expect(page.getByLabel(USERNAME_LABEL)).toHaveCount(0);

    // The shell greets the identity the mocked auth service returned for this
    // role, which is what makes it the *signed-in* screen rather than a public one.
    await expect(page.getByRole('banner')).toContainText(
      fullNameOf(userInfoFor(importerUser.role)),
    );
  });

  // AC-6
  test('the form is completable by keyboard alone, every control shows focus, and the screen passes an automated accessibility check', async ({
    page,
  }) => {
    await mockAcceptedAuth(page, importerUser);
    await page.goto(SIGN_IN_ROUTE);

    const username = page.getByLabel(USERNAME_LABEL);
    const password = page.getByLabel(PASSWORD_LABEL);
    const submit = page.getByRole('button', { name: SUBMIT_NAME });

    // Scan a settled DOM, not a half-rendered one.
    await expect(submit).toBeVisible();
    await expectNoAccessibilityViolations(page, 'as first presented');

    // The required-field state is a distinct state of this screen, and axe
    // violations are usually state-specific — so scan it too. Reached the way a
    // user reaches it: leaving the empty Username field (R6).
    await page.keyboard.press('Tab');
    await expect(page.getByText(REQUIRED_MESSAGE)).toBeVisible();
    await expectNoAccessibilityViolations(
      page,
      'showing the required-field message',
    );

    // Back to a pristine form for the keyboard-only journey.
    await page.reload();

    // Paint of the two controls that do not start focused, for comparison below.
    const passwordUnfocused = await focusPaintOf(password);
    const submitUnfocused = await focusPaintOf(submit);

    // The journey starts in Username, which holds focus when the form opens (R8).
    await expect(username).toBeFocused();
    const usernameFocused = await focusPaintOf(username);

    await page.keyboard.type(importerUser.username);
    await page.keyboard.press('Tab');
    await expect(password).toBeFocused();
    const usernameUnfocused = await focusPaintOf(username);
    const passwordFocused = await focusPaintOf(password);

    await page.keyboard.type(importerUser.password);
    await page.keyboard.press('Tab');
    await expect(submit).toBeFocused();
    const submitFocused = await focusPaintOf(submit);

    // Every control paints something on focus that it does not paint otherwise
    // (NFR1) — a control styled identically either way fails here.
    expect(
      usernameFocused,
      'Username must paint a visible focus indicator',
    ).not.toBe(usernameUnfocused);
    expect(
      passwordFocused,
      'Password must paint a visible focus indicator',
    ).not.toBe(passwordUnfocused);
    expect(
      submitFocused,
      'The Sign in button must paint a visible focus indicator',
    ).not.toBe(submitUnfocused);

    // Submitted with the keyboard alone — no pointer used anywhere above.
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(SIGNED_IN_ROUTE);
  });
});
