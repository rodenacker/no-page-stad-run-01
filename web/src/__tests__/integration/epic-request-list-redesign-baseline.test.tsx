/**
 * Epic baseline: request-list-redesign — the shared surface all of this epic's
 * stories ride.
 *
 * The epic's CROSS-STORY invariants, in one place (testing-policy.md § Per-epic
 * baseline). Story 1 changes the root layout and the token layer — the one shared
 * layer EVERY screen in this app renders inside — and stories 2 onward rebuild the
 * expense request list at `/requests` on top of it. This epic is a redesign of
 * PRESENTATION ONLY (brief R1): no story in it may change what anyone can reach or
 * do. That is one fact, asserted here ONCE, rather than restated in nine story files.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE PINS (the developer's contract — read before implementing)
 * ---------------------------------------------------------------------------
 * 1. The request list's address stays `/requests`, registered in the ONE place this
 *    project answers "may this person open this screen?" — `lib/auth/access-map.ts`.
 *    The redesign adds no second gating mechanism, moves the screen to no new
 *    address, and registers it no second time (R27, R1).
 * 2. Both of this project's roles still open it — `Importer` (the requirements'
 *    "Finance Uploader") and `Approver`, since §6.5 grants both READ on `Transaction`
 *    — while a signed-in account whose role this project does not recognise is
 *    granted nothing. What only an Approver may DO (decide, bulk-approve, see the
 *    possible-duplicate notification) stays a role check INSIDE the screen, never a
 *    withheld address: taking the address away would take the whole screen from a
 *    role entitled to read it (R27, R7).
 * 3. A narrowing carried in the address changes none of that. The redesign puts the
 *    narrowing controls in a ruled field strip (R12); if any of that state ever
 *    reaches the URL, `/requests?...` must still resolve against the registered
 *    `/requests` rather than becoming an address nobody has registered.
 * 4. The shared shell keeps offering the screen from ONE source. The header
 *    navigation and the signed-in landing screen are both built from
 *    `entryPointsFor(session)`, so they cannot disagree about what exists — and both
 *    still offer the request list and the expense files list to both roles, and
 *    nothing at all to an unrecognised account (hidden, never disabled). This is R28's
 *    substance at this layer: the screens this epic does NOT redesign are all reached
 *    through this same shell, so a shell that lost an entry would strand them.
 *
 * DELIBERATELY NOT HERE:
 * - The new faces and the palette (R9/R24/R25) — asserted in Story 1's own test file,
 *   which is where that delta lives.
 * - Anything a browser has to decide: the direction contract surviving the build
 *   (R23/BR10), the six unredesigned screens still reading correctly on the new face
 *   (R28), first-paint theme resolution (AC-4), and this epic's accessibility scan.
 *   Those are the epic's Playwright specs and the manual checklist.
 *
 * These are "must not change" invariants on a shipped app, so they pass today by
 * design — their job is to fail the moment a story in this epic changes reach or
 * gating while claiming to change only presentation.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RoleEntryPoints } from '@/components/dashboard/RoleEntryPoints';
import { AppHeader } from '@/components/layout/AppHeader';
import {
  ACCESS_MAP,
  LANDING_PATH,
  REQUESTS_PATH,
  UPLOAD_PATH,
  accessEntryFor,
  canAccess,
  entryPointsFor,
} from '@/lib/auth/access-map';
// Project-wide identity source, shared with the Playwright layer: the userinfo
// bodies the app gates on (never re-declared in a test).
import {
  UNRECOGNISED_ROLE,
  userInfoFor,
  userInfoWithUnrecognisedRole,
} from '@/mocks/data/identity';
// The auth service's OWN role names (project.md §Roles & Permissions).
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/types/auth';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

import type { UserInfoRead } from '@/types/auth';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => REQUESTS_PATH,
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * `next/link` is stubbed with the plain anchor it renders in the browser, so every
 * offered destination keeps its `link` role and its `href` without needing an App
 * Router context in jsdom. A library, never the code under test.
 */
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/** This project's two real roles, as the sign-in service names them. */
const BOTH_ROLES = [ROLE_IMPORTER, ROLE_APPROVER] as const;

/**
 * Every address a rendered surface links to, hidden ones included — so an entry that
 * is present but hidden cannot pass as "not offered".
 */
const addressesOfferedIncludingHidden = (): string[] =>
  [
    ...new Set(
      screen
        .queryAllByRole('link', { hidden: true })
        .map((link) => link.getAttribute('href') ?? ''),
    ),
  ].sort();

describe('Epic request-list-redesign baseline: the request list keeps its address, its roles and its place in the shell', () => {
  // R27, R1 — contract notes 1-3
  it('keeps the request list at one registered address, open to both roles and to nobody else, with a narrowing in the address changing nothing', () => {
    // Registered — and registered ONCE: a second entry for the same address would be
    // two answers to the same question.
    expect(accessEntryFor(REQUESTS_PATH)).toBeDefined();
    expect(
      ACCESS_MAP.filter((registered) => registered.path === REQUESTS_PATH),
    ).toHaveLength(1);

    // A narrowing the redesign's field strip might one day carry in the URL.
    const narrowedAddress = `${REQUESTS_PATH}?Status=Imported&page=2`;

    BOTH_ROLES.forEach((role) => {
      const session: UserInfoRead = userInfoFor(role);

      // §6.5 grants both roles READ on `Transaction`, so both open the screen — and
      // the Approver-only capabilities stay checks inside it, not a withheld address.
      expect(canAccess(session, REQUESTS_PATH)).toBe(true);
      expect(canAccess(session, narrowedAddress)).toBe(true);
    });

    // The same rule every other address follows: a role this project does not
    // recognise is granted nothing, narrowing or no narrowing.
    const unrecognised: UserInfoRead = userInfoWithUnrecognisedRole();
    expect(canAccess(unrecognised, REQUESTS_PATH)).toBe(false);
    expect(canAccess(unrecognised, narrowedAddress)).toBe(false);
  });

  // R28, R1, R7 — contract note 4
  it('offers the request list from the shared shell to both roles, identically in the header and on the landing screen, and offers an unrecognised account nothing', () => {
    BOTH_ROLES.forEach((role) => {
      const session: UserInfoRead = userInfoFor(role);

      // The landing screen offers exactly the screens the access map allows: the
      // request list this epic redesigns, and the expense files list it is not
      // redesigning but which every unredesigned screen is reached through.
      const landing = render(<RoleEntryPoints user={session} />);

      expect(addressesOfferedIncludingHidden()).toEqual(
        [REQUESTS_PATH, UPLOAD_PATH].sort(),
      );

      landing.unmount();

      // The header offers the same set — one source, so the two can never disagree —
      // plus the app's own name as the way back to the landing screen.
      const header = render(<AppHeader session={session} />);

      expect(addressesOfferedIncludingHidden()).toEqual(
        [LANDING_PATH, REQUESTS_PATH, UPLOAD_PATH].sort(),
      );
      // The destination being viewed is marked as the current one, so the redesigned
      // screen still tells a screen-reader user where they are.
      expect(screen.getByRole('link', { current: 'page' })).toHaveAttribute(
        'href',
        REQUESTS_PATH,
      );

      header.unmount();

      // Both surfaces are built from the same answer, which is why they agree.
      expect(
        entryPointsFor(session)
          .map((entryPoint) => entryPoint.path)
          .sort(),
      ).toEqual([REQUESTS_PATH, UPLOAD_PATH].sort());
    });

    // Hidden, never disabled: an account whose role this project does not recognise is
    // offered no screen at all and is told what to do about it, rather than being shown
    // a dead entry.
    const unrecognised: UserInfoRead = userInfoFor(UNRECOGNISED_ROLE);
    const landing = render(<RoleEntryPoints user={unrecognised} />);

    expect(addressesOfferedIncludingHidden()).toEqual([]);
    expect(
      screen.getByText(/nothing has been made available to your account yet/i),
    ).toBeInTheDocument();

    landing.unmount();

    const header = render(<AppHeader session={unrecognised} />);

    expect(addressesOfferedIncludingHidden()).toEqual([LANDING_PATH]);

    header.unmount();
  });
});
