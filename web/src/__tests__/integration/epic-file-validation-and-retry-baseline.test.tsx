/**
 * Epic baseline: file-validation-and-retry — Rejected rows, retry and cancel.
 *
 * The epic's CROSS-STORY invariants, in one place (testing-policy.md § Per-epic
 * baseline). Story 1 creates the submitted-file page at `/upload/file`, and stories
 * 2–4 render their sections (invalid rows, downloads, retry, cancel) inside that
 * same page — so how that one address is gated and how a user is meant to arrive at
 * it are facts the whole epic depends on, asserted here ONCE rather than re-stated
 * in every story's test file.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE PINS (the developer's contract — read before implementing)
 * ---------------------------------------------------------------------------
 * 1. The submitted-file address is `/upload/file`, and it is registered in the ONE
 *    place this project answers "may this person open this screen?" —
 *    `web/src/lib/auth/access-map.ts` (its own header states that cross-epic
 *    convention). Every story in this epic lives at that address and adds NO second
 *    gating mechanism: the page checks `canAccess()` and returns
 *    `<PermissionDeniedMessage deniedPath={…} />` before rendering anything.
 * 2. Both of this project's roles may open it — `Importer` (the requirements'
 *    "Finance Uploader") and `Approver`, since BR4 gives the processing history to
 *    both — while a signed-in account whose role this project does not recognise is
 *    granted nothing, by the same rule every other address follows.
 * 3. `addressOf()` already strips a query string, so `/upload/file?LogId=5001`
 *    resolves against the registered `/upload/file` with no new gating machinery.
 *    That is a fact stories 1–4 all rely on (the file is always identified by
 *    `?LogId=`), so it is pinned here rather than in one story.
 * 4. The entry carries NO `entryPoint` copy: this page is reached from a file's row
 *    in the Expense files list, never from the signed-in landing screen or the
 *    header navigation. Both of those surfaces render exactly what the access map
 *    offers, so giving the entry copy would silently advertise a screen that means
 *    nothing without a file — which is why the absence is asserted on the real
 *    surfaces below, not just on the map.
 *
 * DELIBERATELY NOT HERE. Who may RETRY or CANCEL a file (BR3 — the Finance Uploader
 * alone) is decided on the SERVER and the action is left out of the markup for
 * anybody else (source UI-24), exactly as `upload/page.tsx` already does with its
 * submit form. jsdom cannot render an async server component, so that invariant is
 * asserted in this epic's Playwright specs and on the manual checklist — not in a
 * Vitest file that would have to fake a session to say anything about it.
 *
 * These assertions WILL FAIL until Story 1 registers the address (TDD red).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppHeader } from '@/components/layout/AppHeader';
import { RoleEntryPoints } from '@/components/dashboard/RoleEntryPoints';
import {
  ACCESS_MAP,
  UPLOAD_PATH,
  accessEntryFor,
  canAccess,
  entryPointsFor,
} from '@/lib/auth/access-map';
// Project-wide sources, shared with the Playwright layer: the identity bodies the
// app gates on, and the canonical file whose id appears in the address.
import { createFileLog } from '@/mocks/data/file-log';
import {
  userInfoFor,
  userInfoWithUnrecognisedRole,
} from '@/mocks/data/identity';
// The auth service's OWN role names — matching on "Finance Uploader" recognises
// nobody (project.md §Roles & Permissions).
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
  usePathname: () => '/',
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

/** The page this epic builds, and the one stories 2–4 render their sections in. */
const SUBMITTED_FILE_PATH = '/upload/file';

/** How a file is always identified in that address. */
const addressOfFile = (logId: number): string =>
  `${SUBMITTED_FILE_PATH}?LogId=${String(logId)}`;

/** This project's two real roles, as the sign-in service names them. */
const BOTH_ROLES = [ROLE_IMPORTER, ROLE_APPROVER] as const;

/** Every address a rendered surface links to, hidden ones included — so an entry
 * that is present but hidden cannot pass as "not offered". */
const addressesOfferedIncludingHidden = (): string[] => [
  ...new Set(
    screen
      .queryAllByRole('link', { hidden: true })
      .map((link) => link.getAttribute('href') ?? ''),
  ),
];

describe('Epic file-validation-and-retry baseline: the submitted-file page both roles open', () => {
  // Cross-story invariant (contract notes 1–3)
  it('registers the submitted-file address once, open to the Finance Uploader and the Approver and to nobody else, with a LogId in the address changing nothing', () => {
    const entry = accessEntryFor(SUBMITTED_FILE_PATH);

    // Registered — and registered ONCE: a second entry for the same address is two
    // answers to the same question.
    expect(entry).toBeDefined();
    expect(
      ACCESS_MAP.filter(
        (registered) => registered.path === SUBMITTED_FILE_PATH,
      ),
    ).toHaveLength(1);

    const logId = createFileLog().Id;

    BOTH_ROLES.forEach((role) => {
      const session: UserInfoRead = userInfoFor(role);

      // BR4: the processing history is for both roles, so both may open the page.
      expect(canAccess(session, SUBMITTED_FILE_PATH)).toBe(true);
      // ...and the file's identifier in the address does not turn it into an
      // address nobody has registered.
      expect(canAccess(session, addressOfFile(logId))).toBe(true);
    });

    // The same rule every other address follows: a role this project does not
    // recognise is granted nothing, with or without a LogId.
    const unrecognised = userInfoWithUnrecognisedRole();
    expect(canAccess(unrecognised, SUBMITTED_FILE_PATH)).toBe(false);
    expect(canAccess(unrecognised, addressOfFile(logId))).toBe(false);
  });

  // Cross-story invariant (contract note 4)
  it('never advertises the submitted-file page as a screen of its own — neither the landing screen nor the app header offers it, for either role', () => {
    // The control case is real: the address IS registered and openable (above), so
    // the absences below are about how it is REACHED, not about a missing entry.
    expect(accessEntryFor(SUBMITTED_FILE_PATH)).toBeDefined();
    expect(accessEntryFor(SUBMITTED_FILE_PATH)?.entryPoint).toBeUndefined();

    BOTH_ROLES.forEach((role) => {
      const session: UserInfoRead = userInfoFor(role);

      // Nothing the landing screen offers this session goes there...
      const landing = render(<RoleEntryPoints user={session} />);

      expect(addressesOfferedIncludingHidden()).not.toContain(
        SUBMITTED_FILE_PATH,
      );
      // ...while the Expense files list it IS reached from is still offered, so
      // this is an absence rather than a screen that failed to render.
      expect(addressesOfferedIncludingHidden()).toContain(UPLOAD_PATH);
      expect(
        entryPointsFor(session).map((entryPoint) => entryPoint.path),
      ).not.toContain(SUBMITTED_FILE_PATH);

      landing.unmount();

      // ...and neither does anything in the header, which offers exactly what the
      // access map permits (`expense-file-upload` BR6).
      const header = render(<AppHeader session={session} />);

      expect(addressesOfferedIncludingHidden()).not.toContain(
        SUBMITTED_FILE_PATH,
      );
      expect(addressesOfferedIncludingHidden()).toContain(UPLOAD_PATH);

      header.unmount();
    });
  });
});
