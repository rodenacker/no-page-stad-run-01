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
 *   - upload an expense file            → Finance Uploader only
 *   - review and decide / bulk approve  → Approver only
 *
 * HIDDEN, NEVER DISABLED (R10). For a role that is excluded, the entry point
 * must be **absent from the DOM** — not a disabled button, not `aria-disabled`,
 * not greyed-out non-semantic markup. The absence assertions below query with
 * `hidden: true` and also sweep the rendered text, so a greyed-out control
 * fails them. Each excluded entry point's wording must not appear at all in the
 * component's output for that role.
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
// Project-wide identity + role sources, shared with the Playwright layer. The
// userinfo body is never hand-written in a test.
import { userInfoFor, userInfoForRoles } from '@/mocks/data/identity';
import { ROLE_APPROVER, ROLE_FINANCE_UPLOADER } from '@/mocks/data/role';

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

describe('Epic sign-in-and-app-shell, Story 4: role-aware entry points and the permission message', () => {
  // AC-1
  it('offers the file-upload entry point to a Finance Uploader and does not render it at all for an Approver', () => {
    const uploaderView = render(
      <RoleEntryPoints user={userInfoFor(ROLE_FINANCE_UPLOADER)} />,
    );

    const uploadEntryPoint = screen.getByRole('link', { name: /upload/i });
    expect(uploadEntryPoint).toBeInTheDocument();
    expect(uploadEntryPoint).toHaveAttribute('href');

    uploaderView.unmount();

    render(<RoleEntryPoints user={userInfoFor(ROLE_APPROVER)} />);

    // Hidden, never disabled (R10): `hidden: true` still matches aria-hidden and
    // disabled controls, so a greyed-out entry point would fail these.
    expect(
      screen.queryByRole('link', { name: /upload/i, hidden: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /upload/i, hidden: true }),
    ).not.toBeInTheDocument();
    // Nor as non-semantic greyed-out markup: the wording is not rendered at all.
    expect(screen.queryAllByText(/upload/i)).toHaveLength(0);
  });

  // AC-2
  it('offers the review-and-decide entry point to an Approver and does not render it at all for a Finance Uploader', () => {
    const approverView = render(
      <RoleEntryPoints user={userInfoFor(ROLE_APPROVER)} />,
    );

    const reviewEntryPoint = screen.getByRole('link', { name: /review/i });
    expect(reviewEntryPoint).toBeInTheDocument();
    expect(reviewEntryPoint).toHaveAttribute('href');

    approverView.unmount();

    render(<RoleEntryPoints user={userInfoFor(ROLE_FINANCE_UPLOADER)} />);

    expect(
      screen.queryByRole('link', { name: /review/i, hidden: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /review/i, hidden: true }),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByText(/review/i)).toHaveLength(0);
  });

  // AC-4
  // Runtime-only: that following the link lands on a usable screen is confirmed
  // in the browser (this story's Playwright spec) and on the manual checklist.
  it('offers a way back from the permission message to a screen the role does allow, never back to the denied address', () => {
    // The denied address is the very entry point a Finance Uploader is offered —
    // the same access-map entry seen from the other side, so the test cannot
    // drift from whichever path the map seeds.
    const uploaderView = render(
      <RoleEntryPoints user={userInfoFor(ROLE_FINANCE_UPLOADER)} />,
    );
    const deniedPath = screen
      .getByRole('link', { name: /upload/i })
      .getAttribute('href');
    expect(deniedPath).toBeTruthy();
    uploaderView.unmount();

    render(<PermissionDeniedMessage deniedPath={deniedPath as string} />);

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
    const bothRolesView = render(
      <RoleEntryPoints
        user={userInfoForRoles([ROLE_FINANCE_UPLOADER, ROLE_APPROVER])}
      />,
    );

    expect(screen.getByRole('link', { name: /upload/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review/i })).toBeInTheDocument();

    bothRolesView.unmount();

    // Same component, a session carrying one of those roles — the offered set
    // follows `Roles[]` rather than a value hardcoded per screen or remembered
    // from an earlier check (BR3).
    render(<RoleEntryPoints user={userInfoForRoles([ROLE_APPROVER])} />);

    expect(screen.getByRole('link', { name: /review/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /upload/i, hidden: true }),
    ).not.toBeInTheDocument();
  });
});
