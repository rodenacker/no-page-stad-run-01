/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/components/layout/ThemeToggle.tsx
 * - Page Action: create_new
 *
 * Epic `sign-in-and-app-shell`, Story 5 — the brand theme in a light and a dark
 * version, plus the switch in the signed-in header (R15, BR5, NFR2).
 *
 * Coverage split (straight from the story's AC table — one tag, one layer, no
 * cross-layer siblings):
 * - **AC-3 (this file, `vitest`)** — using the switch in the header changes the app
 *   to the other version immediately.
 * - AC-2 / AC-4 / AC-5 (`playwright`) — the OS `prefers-color-scheme` default on a
 *   first visit, a remembered override still winning on a later visit, and the right
 *   version being in place from the first paint. All three need a real browser (OS
 *   colour-scheme emulation, a real reload, first-paint timing), so they are
 *   deliberately NOT duplicated here.
 * - AC-1 / AC-6 (`none`) — token centralisation and human-eye contrast, verified by
 *   the styling gate and by hand. This file therefore asserts **nothing** about hex
 *   values, Tailwind colour utilities or token names: every colour lives only in
 *   `web/src/app/globals.css` (`:root` + `.dark`), and a component test that pinned a
 *   colour value would contradict styling-centralisation.md rules 1–5.
 *
 * Implementation contract this test assumes — read before implementing:
 * - `ThemeToggle` is a **self-contained** client component: it resolves the active
 *   theme itself (remembered override first, else `prefers-color-scheme`), applies the
 *   switch app-wide, and needs no new React provider wrapped around it. The
 *   before-first-paint resolution is extended into the existing root layout rather
 *   than nested inside a new provider stack (CLAUDE.md §6, story implementation
 *   notes).
 * - It renders **one always-visible control** — AC-3's "the switch in the header" —
 *   as a `<button>` (a Shadcn `<Button>`), not an item tucked inside the identity
 *   dropdown and not a `role="switch"` input.
 * - The control's accessible name states the version it will switch **to**, so it
 *   changes with the active theme: "Switch to dark theme" while light is on screen,
 *   "Switch to light theme" while dark is. A name that never changes leaves a
 *   screen-reader user unable to tell which version is showing, and this project's
 *   bar is WCAG 2.2 AA (requirements §6.6.5).
 * - The switch takes effect on the click itself — no reload, no confirmation step.
 *
 * jsdom loads no stylesheet, so the repainted colours themselves are not assertable
 * here; that half of the story belongs to Playwright and the manual checklist.
 *
 * TDD red: `@/components/layout/ThemeToggle` does not exist yet.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Real production component — fails to resolve until Story 5 is implemented.
import { ThemeToggle } from '@/components/layout/ThemeToggle';

type ColourScheme = 'light' | 'dark';

/**
 * jsdom implements no `window.matchMedia`, so a component that reads the OS
 * colour-scheme preference needs it supplied. Browser-API infrastructure only — the
 * component under test is never mocked (testing-policy.md § Mocking strategy).
 */
const stubPrefersColorScheme = (scheme: ColourScheme): void => {
  vi.stubGlobal('matchMedia', (query: string) => {
    const asksAboutDark = query.includes('prefers-color-scheme: dark');
    return {
      matches: asksAboutDark ? scheme === 'dark' : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  });
};

describe('ThemeToggle — the theme switch in the signed-in header', () => {
  beforeEach(() => {
    // No remembered override and an OS preference of light: the starting version is
    // light, so the switch's job is to move the app to dark.
    window.localStorage.clear();
    stubPrefersColorScheme('light');

    // Setup hygiene, not an assertion: the before-paint resolution marks the resolved
    // version on the document root, and jsdom keeps one document for the whole file.
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // AC-3
  // Runtime-only: the app actually repainting in the other version's colours is
  // verified in a real browser (the story's Playwright spec) and by eye on the manual
  // checklist — jsdom applies no CSS. What is asserted here is the contract that
  // makes that repaint happen: the one switch flips the live theme on click, in both
  // directions, with no reload.
  it('switches the app to the other version as soon as the user uses it, and back again', async () => {
    const user = userEvent.setup();

    render(<ThemeToggle />);

    // Light is on screen, so the switch offers dark.
    expect(screen.getByRole('button', { name: /theme/i })).toHaveAccessibleName(
      /switch to dark theme/i,
    );

    await user.click(screen.getByRole('button', { name: /theme/i }));

    // Asserted immediately after the click — no `waitFor`, no reload. A control that
    // only takes effect on the next page load, or that needs a confirmation step,
    // fails right here.
    expect(screen.getByRole('button', { name: /theme/i })).toHaveAccessibleName(
      /switch to light theme/i,
    );

    await user.click(screen.getByRole('button', { name: /theme/i }));

    // And back: the same switch returns the app to the version it started on.
    expect(screen.getByRole('button', { name: /theme/i })).toHaveAccessibleName(
      /switch to dark theme/i,
    );
  });
});
