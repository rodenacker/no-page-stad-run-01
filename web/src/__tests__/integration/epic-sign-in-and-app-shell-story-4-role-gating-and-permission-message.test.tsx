/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/app/(authenticated)/page.tsx
 * - Page Action: modify_existing
 *
 * Epic `sign-in-and-app-shell`, Story 4 — role-aware entry points and the
 * in-page permission message (R10, R11, R13, R14, BR3).
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE PINS (the developer's contract — read before implementing)
 * ---------------------------------------------------------------------------
 * `(authenticated)/page.tsx` is a server component: it resolves the session with
 * `requireSession()` (Story 1) and hands the resulting `UserInfoRead` to a
 * presentational component. jsdom cannot render an async server component, so
 * the two presentational surfaces are the units under test here:
 *
 *   1. `@/components/dashboard/RoleEntryPoints` — `({ user })`, where `user` is
 *      the `GET /v1/auth/userinfo` body for the current session. Renders one
 *      navigational **link** per entry point the session's `Roles[]` allow.
 *      Gating is driven purely by `Roles[]` — this project's userinfo contract
 *      has no `Pages[]` field (brief BR3, `@/mocks/data/identity`).
 *   2. `@/components/auth/PermissionDeniedMessage` — `({ deniedPath })`, the
 *      in-page denial surface rendered inside Story 3's shell when a signed-in
 *      user reaches an address their roles exclude.
 *
 * Both must derive their answers from the **single route/action access map**
 * this story seeds (e.g. `web/src/lib/auth/access-map.ts`), consuming the
 * role-check helpers from Story 1 — not from role checks inlined per component.
 * Later epics attach their screens to the same map entries (story §Cross-epic
 * convention); do not build a second gating mechanism.
 *
 * Access map seeded in this epic, from requirements §6.5 (roles-×-resources):
 *   - upload an expense file            → Importer only
 *   - review and decide / bulk approve  → Approver only
 *
 * SINCE WIDENED, TWICE, and reflected below. Both feature addresses are now open
 * to both roles, because §6.5 grants both of them READ on the resources those
 * screens show: the `expense-file-upload` epic's R9 opened `/upload` (the expense
 * files screen), and the `expense-request-list` epic's R20 opened `/requests` (the
 * shared request list). What only one role may DO is checked inside the screen
 * that offers it — submitting a file is the Finance Uploader's, deciding on a
 * request is the Approver's — never by withholding the address. So both entry
 * points are located below by WHERE THEY GO rather than by their wording, which
 * each of those epics reworded.
 *
 * HIDDEN, NEVER DISABLED (R10) — and what exercises it now. With both real roles
 * permitted everywhere, the account this project excludes is one whose role it does
 * not recognise (`userInfoWithUnrecognisedRole()`, the OpenAPI example's "Viewer"):
 * `hasRole` grants an unknown role name nothing, which is a state the production
 * code answers deliberately. For it, every entry point must be **absent from the
 * DOM** — not a disabled button, not `aria-disabled`, not greyed-out non-semantic
 * markup. The absence assertions below query with `hidden: true` and also sweep the
 * rendered text, so a greyed-out control fails them.
 *
 * WAY BACK (AC-4). The denial message links to the signed-in landing screen
 * `/` — the one screen both roles may view (project.md §Roles & Permissions,
 * "View main dashboard"), and where the user's own permitted entry points are
 * offered. It must never link back to the address that was just denied. The
 * feature screens themselves ship in later epics, so `/` is the only permitted
 * destination that exists during this epic (story §Known interim state).
 *
 * Accessibility and the direct-address denial flow (AC-3) are Playwright's, in
 * this story's spec and Story 3's shell scan — deliberately not re-asserted here.
 *
 * These tests WILL FAIL until implemented (TDD red).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Production components — will not resolve until this story is implemented.
import { PermissionDeniedMessage } from '@/components/auth/PermissionDeniedMessage';
import { RoleEntryPoints } from '@/components/dashboard/RoleEntryPoints';
import { entryPointsFor } from '@/lib/auth/access-map';
// Project-wide identity + role sources, shared with the Playwright layer. The
// userinfo body is never hand-written in a test.
import {
  userInfoFor,
  userInfoForRoles,
  userInfoWithUnrecognisedRole,
} from '@/mocks/data/identity';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/mocks/data/role';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

/**
 * `next/link` is stubbed with the plain anchor it renders in the browser, so the
 * entry points keep their `link` role and `href` without needing an App Router
 * context in jsdom. This mocks a library, never the code under test.
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

/** The signed-in landing screen — viewable by both roles. */
const LANDING_PATH = '/';

/**
 * The expense files screen, which both roles may open. Held as an address rather
 * than a label because the label is the part the `expense-file-upload` epic
 * rewords; where the entry point GOES is the stable handle.
 */
const EXPENSE_FILES_PATH = '/upload';

/**
 * The offered entry point that goes to an address, or `null` when the current
 * roles are not offered it at all. `queryAllByRole` so "offered nothing" reads as
 * an absence rather than throwing.
 */
const entryPointTo = (path: string): HTMLElement | null =>
  screen
    .queryAllByRole('link')
    .find((link) => link.getAttribute('href') === path) ?? null;

/**
 * Every address the component offers, INCLUDING anything a screen reader would be
 * denied — so an entry point that is present but hidden cannot pass as "absent".
 */
const addressesOfferedIncludingHidden = (): string[] =>
  screen
    .queryAllByRole('link', { hidden: true })
    .map((link) => link.getAttribute('href') ?? '');

describe('Epic sign-in-and-app-shell, Story 4: role-aware entry points and the permission message', () => {
  // AC-1
  // Read the "SINCE WIDENED" note above first: the expense files address is open to
  // both roles (`expense-file-upload` R9), so this is now "each role is offered it",
  // and the hidden-never-disabled half of the original criterion lives in AC-2.
  it('offers the expense-files entry point to an Importer and to an Approver, as a real navigational link', () => {
    const uploaderView = render(
      <RoleEntryPoints user={userInfoFor(ROLE_IMPORTER)} />,
    );

    const uploaderEntryPoint = entryPointTo(EXPENSE_FILES_PATH);
    expect(uploaderEntryPoint).toBeInTheDocument();
    expect(uploaderEntryPoint).toHaveAccessibleName();

    uploaderView.unmount();

    render(<RoleEntryPoints user={userInfoFor(ROLE_APPROVER)} />);

    // The same screen, offered to the role that only watches files — and offered as
    // a link, not a button that pushes a route, so it can be opened in a new tab and
    // is announced as a link.
    const approverEntryPoint = entryPointTo(EXPENSE_FILES_PATH);
    expect(approverEntryPoint).toBeInTheDocument();
    expect(approverEntryPoint).toHaveAccessibleName();
  });

  // AC-2
  // Read the "HIDDEN, NEVER DISABLED" note above first: the excluded account is now
  // one whose role this project does not recognise, since both real roles are
  // permitted every address. The access map is the oracle for what a permitted
  // session is offered, so this cannot drift from whichever screens it registers.
  it('offers a recognised role every entry point the access map permits, and renders none of them at all — not even hidden or disabled — for a session whose role it does not recognise', () => {
    const approver = userInfoFor(ROLE_APPROVER);
    const permitted = entryPointsFor(approver);
    // The control case is real: there is something to be excluded FROM.
    expect(permitted.length).toBeGreaterThan(0);

    const approverView = render(<RoleEntryPoints user={approver} />);

    permitted.forEach((entryPoint) => {
      const offered = entryPointTo(entryPoint.path);
      expect(offered).toBeInTheDocument();
      expect(offered).toHaveAccessibleName();
    });

    approverView.unmount();

    render(<RoleEntryPoints user={userInfoWithUnrecognisedRole()} />);

    // Absent from the markup — not hidden from the accessibility tree, not a
    // disabled button, and each entry point's wording nowhere in the output.
    expect(addressesOfferedIncludingHidden()).toEqual([]);
    expect(screen.queryAllByRole('button', { hidden: true })).toHaveLength(0);
    permitted.forEach((entryPoint) => {
      expect(screen.queryByText(entryPoint.label)).not.toBeInTheDocument();
    });
  });

  // AC-4
  // Runtime-only: that following the link lands on a usable screen is confirmed
  // in the browser (this story's Playwright spec) and on the manual checklist.
  it('offers a way back from the permission message to a screen the role does allow, never back to the denied address', () => {
    // The denied address is a registered one taken from the access map itself, so
    // the test cannot drift from whichever paths the map seeds.
    const [firstRegistered] = entryPointsFor(userInfoFor(ROLE_APPROVER));
    const deniedPath = firstRegistered.path;
    expect(deniedPath).toBeTruthy();

    render(<PermissionDeniedMessage deniedPath={deniedPath} />);

    const destinations = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(destinations).toContain(LANDING_PATH);
    expect(destinations).not.toContain(deniedPath);

    const [wayBack] = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === LANDING_PATH);
    expect(wayBack).toHaveAccessibleName();
  });

  // AC-5
  it('offers the entry points for the roles on the current session, so a differently-rolled user is offered a different set', () => {
    const bothRoles = userInfoForRoles([ROLE_IMPORTER, ROLE_APPROVER]);
    const bothRolesView = render(<RoleEntryPoints user={bothRoles} />);

    // Every screen the map permits this session, read from the map rather than from
    // a list held here.
    expect(entryPointTo(EXPENSE_FILES_PATH)).toBeInTheDocument();
    expect(addressesOfferedIncludingHidden()).toEqual(
      entryPointsFor(bothRoles).map((entryPoint) => entryPoint.path),
    );

    bothRolesView.unmount();

    // Same component, a session whose role this project does not recognise — the
    // offered set follows `Roles[]` rather than a value hardcoded per screen or
    // remembered from an earlier check (BR3), so this one is offered nothing and is
    // told where to go instead of being left looking at an empty screen.
    render(<RoleEntryPoints user={userInfoWithUnrecognisedRole()} />);

    expect(entryPointTo(EXPENSE_FILES_PATH)).not.toBeInTheDocument();
    expect(addressesOfferedIncludingHidden()).toEqual([]);
    expect(screen.getByText(/ask the account holder/i)).toBeInTheDocument();
  });
});
