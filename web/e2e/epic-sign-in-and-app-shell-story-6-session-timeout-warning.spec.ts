/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/components/session/SessionTimeoutWarning.tsx
 * - Page Action: create_new
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked — this spec never contacts a live backend
 *   (testing-policy.md § "Playwright runs against mocks, never live"). Two
 *   boundaries, one contract, and every response body comes from the project-wide
 *   mock data in `web/src/mocks/data/` (`identity.ts`, `role.ts`) — never
 *   hand-written here:
 *   1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`,
 *      started by `globalSetup` with the app's auth base URL pointed at it by
 *      `playwright.config.ts`. The signed-in landing screen is gated SERVER-side
 *      (Story 1's `requireSession()` → `GET /v1/auth/userinfo` from inside the
 *      Next.js process, brief BR1/BR3), a call `page.route()` cannot see; the stub
 *      answers it from the shared userinfo source, keyed off the `session` cookie
 *      value seeded below.
 *   2. Browser boundary → `page.route()` on the auth paths this journey touches
 *      (see `mockAuthChain`), returning the SAME role as the seeded cookie so the
 *      two layers cannot disagree about who is signed in.
 * - Implementation pattern this assumes:
 *   - The signed-in state is established by seeding the browser's `session` cookie
 *     (the HttpOnly, SameSite=Strict cookie the BFF mints — brief BR2) rather than
 *     by driving Story 2's sign-in form, so this spec does not depend on that
 *     form's labels. The server-side layout gate (Story 1's `requireSession()`,
 *     Story 3's `(authenticated)` layout) must therefore admit a request carrying
 *     that `session` cookie, treating its value as opaque and forwarding it to the
 *     auth service's userinfo endpoint — which in this run is the stub.
 *   - The idle manager must compare timestamps (`Date.now() - lastActivityAt`)
 *     rather than decrementing a counter once per tick. Timestamp comparison is
 *     what makes a clock jump — and a real backgrounded/throttled tab — read
 *     correctly; a decrement-per-tick implementation drifts in production and will
 *     not pass this spec.
 *   - On idle expiry the user is returned to Story 2's `/sign-in` route and that
 *     screen shows a plain "session timed out" explanation (wording matched
 *     loosely on /timed out/i), not a generic error screen.
 * - If the implementation diverges from these assumptions, this spec will not pass.
 *
 * TIMING — how this spec stays practical to run (no 30-minute wait):
 * - The idle period and the warning lead-time are configuration, read from
 *   `NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_SECONDS` (working default 1800 = 30 min) and
 *   `NEXT_PUBLIC_SESSION_IDLE_WARNING_SECONDS` (working default 60). Those two
 *   names are this story's contract and must be documented in `web/.env.example`.
 * - This spec reads the SAME two variables and drives the browser clock across
 *   whatever they are set to via Playwright's `page.clock` — `install()` before
 *   navigating, then `fastForward()` over the long quiet stretch and `runFor()`
 *   across the two short threshold crossings. Elapsed wall-clock is a second or
 *   two even against the real 30-minute default, so no production code needs a
 *   test-only "short duration" prop and nothing here waits real time.
 * - To run against shortened values instead (e.g. for manual testing), set the two
 *   variables in `web/.env.local` before the dev server starts; this spec picks
 *   them up from the same names and adjusts its clock jumps automatically.
 *
 * E2E spec for Epic "Sign in and the signed-in app shell", Story 6: session
 * timeout warning and a graceful return to sign-in (AC-3).
 * Story 3 owns this epic's single real-browser accessibility scan — deliberately
 * not repeated here.
 * These tests WILL FAIL until implemented (TDD red).
 */
import { test, expect } from '@playwright/test';

// The mocked auth service's own session value for a role — the token it maps back
// to that role when the server-side gate asks who the session belongs to. Never an
// invented literal: a token the stub does not know 401s the gate.
import { sessionTokenFor } from './support/auth-api-stub';
// Project-wide mock data — the ONE source for these response shapes, shared with
// the Vitest layer. Relative import (not `@/`) so Playwright's runtime resolves it
// without alias plumbing.
import { logoutSuccessResponse, userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER } from '../src/mocks/data/role';

import type { Page, BrowserContext } from '@playwright/test';

/** Working defaults from requirements §6.6.1 / brief R16 (30 min idle, 60 s lead). */
const DEFAULT_IDLE_TIMEOUT_SECONDS = 1800;
const DEFAULT_IDLE_WARNING_SECONDS = 60;

/**
 * Read one of the story's two timing variables. Falls back to the working default
 * when the variable is absent or not a positive number — this is configuration
 * resolution, not a loosened assertion: the value chosen is then used verbatim to
 * drive the clock, so the test still asserts one exact behaviour.
 */
const secondsFromEnv = (name: string, fallbackSeconds: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallbackSeconds;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `${name} is set to "${raw}", which is not a positive number of seconds. ` +
        `Set it to a positive value (working default ${fallbackSeconds}) or unset it.`,
    );
  }
  return parsed;
};

const IDLE_TIMEOUT_SECONDS = secondsFromEnv(
  'NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_SECONDS',
  DEFAULT_IDLE_TIMEOUT_SECONDS,
);
const IDLE_WARNING_SECONDS = secondsFromEnv(
  'NEXT_PUBLIC_SESSION_IDLE_WARNING_SECONDS',
  DEFAULT_IDLE_WARNING_SECONDS,
);

/** Margin either side of a threshold, so the crossing is unambiguous. */
const MARGIN_SECONDS = 5;

if (IDLE_TIMEOUT_SECONDS <= IDLE_WARNING_SECONDS + 2 * MARGIN_SECONDS) {
  throw new Error(
    `Session timings are too close to test a distinct warning window: idle ` +
      `${IDLE_TIMEOUT_SECONDS}s must exceed the ${IDLE_WARNING_SECONDS}s warning ` +
      `lead-time by more than ${2 * MARGIN_SECONDS}s. Adjust ` +
      `NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_SECONDS / NEXT_PUBLIC_SESSION_IDLE_WARNING_SECONDS.`,
  );
}

/** Idle time that must pass with the warning still absent. */
const QUIET_SECONDS =
  IDLE_TIMEOUT_SECONDS - IDLE_WARNING_SECONDS - MARGIN_SECONDS;

const seconds = (value: number): number => value * 1000;

/**
 * Seed the session the BFF would have minted on a successful login for this role.
 * The frontend never reads the value (BR2) — it exists so the server-side gate sees
 * a session, and `sessionTokenFor` makes it the token the Node-side auth stub maps
 * back to this role when the gate asks it whose session this is. Always seeded with
 * the same role `mockAuthChain` answers with, so the server-rendered screen and the
 * browser show the same person.
 */
const seedSessionCookie = async (
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
 * Intercept the BROWSER-side auth calls this journey makes, with bodies from the
 * shared mock data. The server-side gate's own userinfo call is answered by the
 * Node-side stub keyed off the seeded cookie, not by these routes. Install before
 * navigating.
 * - `GET /v1/auth/userinfo` — the identity the shell renders and the gate admits;
 *   also the natural "touch the session" call behind the stay-signed-in option.
 * - `POST /v1/auth/logout` — whatever the app calls when the idle period expires.
 */
const mockAuthChain = async (page: Page, roleName: string): Promise<void> => {
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(userInfoFor(roleName)),
    }),
  );
  await page.route('**/v1/auth/logout', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'set-cookie': 'session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
      },
      contentType: 'application/json',
      body: JSON.stringify(logoutSuccessResponse()),
    }),
  );
};

test.describe('Epic "Sign in and the signed-in app shell", Story 6: session timeout warning', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-3
  test('ignoring the idle warning returns the user to sign-in with a session-timed-out message', async ({
    page,
    context,
  }) => {
    // Control the browser clock before anything schedules a timer, so the real
    // configured idle period can be crossed instantly.
    await page.clock.install();
    await mockAuthChain(page, ROLE_APPROVER);
    await seedSessionCookie(context, ROLE_APPROVER);

    // The signed-in landing screen inside Story 3's shell — `banner` is the app
    // header's landmark role, asserted structurally rather than by wording.
    await page.goto('/');
    await expect(page.getByRole('banner')).toBeVisible();

    // Sit idle up to just short of the warning threshold: nothing yet.
    await page.clock.fastForward(seconds(QUIET_SECONDS));
    await expect(page.getByRole('alertdialog')).toBeHidden();

    // Cross into the warning window (Shadcn/Radix AlertDialog → `alertdialog`).
    // `runFor` ticks through each interval so a live countdown advances normally.
    await page.clock.runFor(seconds(2 * MARGIN_SECONDS));
    await expect(page.getByRole('alertdialog')).toBeVisible();

    // Then do nothing at all — no click, no keypress, no pointer movement — and
    // let the rest of the idle period elapse.
    await page.clock.runFor(seconds(IDLE_WARNING_SECONDS + MARGIN_SECONDS));

    // Returned to the sign-in screen, told plainly that the session timed out...
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByText(/timed out/i).first()).toBeVisible();

    // ...and it is the sign-in screen itself, not a generic error surface: the
    // user can sign straight back in.
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByRole('alertdialog')).toBeHidden();
  });
});
