/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/components/layout/ThemeToggle.tsx
 * - Page Action: create_new
 *
 * Mocking strategy:
 * - Backend calls are ALWAYS mocked — this spec never contacts a live backend
 *   and uses no real credentials (testing-policy.md § "Playwright runs against
 *   mocks, never live"). Two boundaries, one contract:
 *   1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`,
 *      started by `globalSetup` with the app's auth base URL pointed at it by
 *      `playwright.config.ts`. Reaching `/` is gated SERVER-side
 *      (`requireSession()` → `GET /v1/auth/userinfo` from inside the Next.js
 *      process, brief BR1/BR3), which `page.route()` cannot see; the stub answers
 *      that call from the shared userinfo source, keyed off the `session` cookie
 *      value seeded below.
 *   2. Browser boundary → `page.route()` on the identity path, in case a client
 *      component reads identity too. It returns the same role's body as the seeded
 *      cookie, so the two layers cannot disagree.
 * - Response bodies come from the project-wide shared mock data
 *   (`web/src/mocks/data/identity.ts`, `web/src/mocks/data/role.ts`), imported
 *   relatively so Playwright resolves them without `@/` alias plumbing. No
 *   userinfo body is hand-written here.
 * - Implementation patterns this spec assumes:
 *   - **The theme is resolved by an INLINE, head-embedded script in the served
 *     document** (Story 5 summary / NFR2 / project.md "[IMPLEMENTATION TRAP]").
 *     The AC-5 test aborts every `.js` request, so an inline `<script>` in the
 *     document still runs while a hydrated `useEffect` never does — a
 *     post-hydration resolution fails that test outright. An *external* script
 *     (`<script src=...>`) would also fail it, because that is a `.js` request
 *     and therefore not part of the document either.
 *   - **The resolved theme is expressed as the `dark` class on `<html>`** —
 *     the dark-mode contract this codebase already declares in
 *     `web/src/app/globals.css` (`@custom-variant dark (&:is(.dark *))`).
 *   - **Something in the app paints the themed background** (e.g.
 *     `bg-background` on `<body>`). AC-2/AC-4 read the colour the user actually
 *     sees, so a `.dark` class that never changes what is on screen fails them.
 *   - **The theme control is a button whose accessible name contains "theme",
 *     and one activation switches straight to the other version** (Story 5
 *     AC-3: "changes the whole app to the other version immediately") — not a
 *     menu needing a second click. Its placement in the header is Story 3's
 *     shell concern plus the manual checklist, so it is not re-asserted here.
 *   - **Reaching `/` is satisfied by the seeded mock `session` cookie**: the
 *     protected layout's gate treats that cookie value as opaque (brief BR2) and
 *     forwards it to the auth service's userinfo endpoint, which in this run is the
 *     Node-side stub — so the gate admits the request and resolves the role the
 *     seeded token stands for.
 * - If the implementation diverges from these assumptions, this spec will not pass.
 *
 * E2E spec for Epic "Sign in and the signed-in app shell", Story 5: brand theme
 * with light and dark, and a switch in the header.
 *
 * Covers the `playwright`-tagged criteria only:
 * - AC-2 — a first visit with no stored choice follows the OS light/dark setting
 * - AC-4 — an explicit choice survives a later visit and beats the opposite OS setting
 * - AC-5 — the right version is in place from the first paint (no flash)
 * AC-1 (styling gate + manual), AC-3 (Vitest) and AC-6 (manual) are covered
 * elsewhere. Story 3 owns this epic's single real-browser accessibility scan, so
 * no axe scan runs here.
 *
 * These tests WILL FAIL until implemented (TDD red).
 */
import { test, expect } from '@playwright/test';

// The mocked auth service's own session value for a role — the token it maps back
// to that role when the server-side gate asks who the session belongs to. Never an
// invented literal: a token the stub does not know 401s the gate.
import { sessionTokenFor } from './support/auth-api-stub';
// Shared, project-wide mock data — the single source both test layers use.
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER } from '../src/mocks/data/role';

import type { Page } from '@playwright/test';

/** Matches the `dark` class as a whole word in the `<html>` class list. */
const DARK_CLASS = /(^|\s)dark(\s|$)/;

/**
 * Puts the browser in a signed-in state without a live backend and without any
 * real credential: the mock `session` cookie the Node-side auth stub recognises for
 * this role (the sole conveyance per BR2), plus a route intercept that answers a
 * browser-side identity call with the SAME role's shared userinfo body — so the
 * server-rendered screen and the browser cannot show different people.
 */
async function mockSignedInSession(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: 'session',
      value: sessionTokenFor(ROLE_APPROVER),
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(userInfoFor(ROLE_APPROVER)),
    }),
  );
}

/**
 * The light/dark version the user can actually see, derived from the relative
 * luminance of the page's painted background — not from a token name or a class,
 * so it stays true whatever the brand hex values are.
 */
async function visibleScheme(page: Page): Promise<'dark' | 'light'> {
  const luminance = await page.evaluate(() => {
    const readFillStyle = (ctx: CanvasRenderingContext2D): string => {
      const value = ctx.fillStyle;
      if (typeof value !== 'string') {
        throw new Error('Canvas fillStyle did not normalise to a string.');
      }
      return value;
    };

    // Let the browser parse any CSS colour form (hex, rgb(), oklch(), keyword).
    // Two different sentinels guard the read: a value the browser rejects leaves
    // the sentinel in place, so the two reads disagree and we fail loudly rather
    // than silently reporting the sentinel's own colour.
    const toRgba = (
      value: string,
    ): { r: number; g: number; b: number; a: number } => {
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) throw new Error('2d canvas context unavailable.');
      ctx.fillStyle = '#ff00ff';
      ctx.fillStyle = value;
      const first = readFillStyle(ctx);
      ctx.fillStyle = '#00ff00';
      ctx.fillStyle = value;
      const second = readFillStyle(ctx);
      if (first !== second) {
        throw new Error(`The browser could not parse the colour "${value}".`);
      }
      if (/^#[0-9a-f]{6}$/i.test(first)) {
        return {
          r: parseInt(first.slice(1, 3), 16),
          g: parseInt(first.slice(3, 5), 16),
          b: parseInt(first.slice(5, 7), 16),
          a: 1,
        };
      }
      const parts = first.match(/[\d.]+/g);
      if (!parts || parts.length < 4) {
        throw new Error(`Unexpected normalised colour "${first}".`);
      }
      return {
        r: Number(parts[0]),
        g: Number(parts[1]),
        b: Number(parts[2]),
        a: Number(parts[3]),
      };
    };

    const channel = (value: number): number => {
      const srgb = value / 255;
      return srgb <= 0.03928
        ? srgb / 12.92
        : Math.pow((srgb + 0.055) / 1.055, 2.4);
    };

    // The colour behind the page: the first opaque background walking outward
    // from <body>, else the browser's own white canvas.
    for (const element of [document.body, document.documentElement]) {
      const colour = toRgba(getComputedStyle(element).backgroundColor);
      if (colour.a > 0) {
        return (
          0.2126 * channel(colour.r) +
          0.7152 * channel(colour.g) +
          0.0722 * channel(colour.b)
        );
      }
    }
    return 1;
  });

  return luminance < 0.5 ? 'dark' : 'light';
}

test.describe('Epic: Sign in and the signed-in app shell — Story 5: brand theme, light and dark, with a switch in the header', () => {
  test.beforeEach(async ({ context }) => {
    // A first visit: no session, and no remembered theme choice.
    await context.clearCookies();
  });

  // AC-2
  test('a first visit with no choice of their own follows the computer light/dark setting', async ({
    page,
  }) => {
    // The theme resolves in the root layout, so the unauthenticated sign-in
    // screen is a genuine "first visit" surface — and needs no session mock.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/sign-in');
    await expect.poll(() => visibleScheme(page)).toBe('dark');

    // Same browser, still no stored choice, opposite computer setting.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/sign-in');
    await expect.poll(() => visibleScheme(page)).toBe('light');
  });

  // AC-4
  test('a version the user chose with the header switch is still in effect after a reload, even though the computer setting says the opposite', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await mockSignedInSession(page);
    await page.goto('/');

    // No choice yet, so the computer setting governs.
    await expect.poll(() => visibleScheme(page)).toBe('dark');

    // The user chooses the other version for themselves.
    const themeSwitch = page.getByRole('button', { name: /theme/i });
    await themeSwitch.click();
    await expect.poll(() => visibleScheme(page)).toBe('light');

    // A later visit in the same browser: the computer still says dark, and the
    // user's own choice must win.
    await page.reload();
    await expect(page.getByRole('button', { name: /theme/i })).toBeVisible();
    await expect.poll(() => visibleScheme(page)).toBe('light');
  });

  // AC-5
  test('the right version is already in the served document before any client JavaScript runs, so the page never flashes the other one', async ({
    page,
  }) => {
    // Abort every JavaScript request. An inline, head-embedded resolution is
    // part of the document and still runs; a post-hydration effect (or an
    // external script) never runs at all — so a flashing implementation fails
    // here instead of quietly settling on the right answer a frame later.
    await page.route(
      (url) => url.pathname.endsWith('.js'),
      (route) => route.abort(),
    );

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(DARK_CLASS);

    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).not.toHaveClass(DARK_CLASS);
  });
});
