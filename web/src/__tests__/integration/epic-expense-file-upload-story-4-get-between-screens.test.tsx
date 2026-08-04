/**
 * Story Metadata:
 * - Epic: expense-file-upload — Upload an expense file
 * - Story: 4 — Get between screens from anywhere
 * - Route: every signed-in screen (the shared app header)
 * - Target File: web/src/components/layout/AppHeader.tsx
 * - Page Action: modify_existing
 * - Requirements: R11, BR6
 *
 * Coverage split (the story's AC table — one tag, one test, one layer):
 * - AC-1, AC-2, AC-3, AC-4 → this file (`vitest`)
 * - AC-5 (moving from the expense files screen to the landing screen and back
 *   using only the header) and AC-6 (keyboard-only operation and a phone-width
 *   screen) → `web/e2e/epic-expense-file-upload-story-4-get-between-screens.spec.ts`
 *   (`playwright`). Deliberately NOT duplicated here.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. `AppHeader` keeps its current signature — `({ session }: { session:
 *    UserInfoRead })` — and stays a SIBLING of `<main>` inside the
 *    `(authenticated)` layout, i.e. still the `banner` landmark (existing header
 *    contract, project WCAG 2.2 AA bar per requirements §6.6.5). The navigation
 *    goes in a `<nav>` INSIDE that header, so it is a `navigation` landmark of
 *    its own; the tests locate it as `banner` → `navigation`.
 * 2. The destinations are EXACTLY `entryPointsFor(session)` from
 *    `@/lib/auth/access-map` (brief BR6). No route is hand-listed in the header
 *    and no second registry is introduced — that is what makes the menu correct
 *    on its own as later epics widen or add addresses. The header already
 *    receives the whole session, so this needs no new fetch, no context and no
 *    client-side role check.
 * 3. An address the session's roles exclude is ABSENT FROM THE MARKUP — not
 *    rendered disabled, not `aria-disabled`, not hidden by styling (the UI-24
 *    convention epic 1 established, brief BR6). AC-2's absence assertions query
 *    with `hidden: true` and sweep the header's text, so a greyed-out or
 *    visually-hidden entry fails them.
 * 4. Each destination is a real navigational LINK carrying its `href` (never a
 *    button that pushes a route) — the same convention `RoleEntryPoints`
 *    already follows, so a destination can be opened in a new tab and is
 *    announced as a link.
 * 5. The app's own name in the header becomes a link to the signed-in landing
 *    screen (`LANDING_PATH`, i.e. `/`) rather than the plain `<p>` it is today.
 * 6. The screen being viewed carries `aria-current="page"` on its destination
 *    and on NOTHING else in the header (including the app-name link when the
 *    user is elsewhere). How the current address reaches the header is the
 *    developer's call, with one constraint: the `(authenticated)` layout is a
 *    server component and Next.js gives a layout no pathname, so it cannot pass
 *    one down. Read it in a CLIENT child with `usePathname()` (which is what
 *    these tests supply, and what epic 1's shell test already mocks as `/`), and
 *    if the path must instead be a prop on `AppHeader`, make it OPTIONAL and
 *    default it to `usePathname()` — a new REQUIRED prop would break both this
 *    file's `<AppHeader session={…} />` render and the layout that mounts it.
 *    Handle "not known yet" (`usePathname()` returning `null` outside a router
 *    context) by marking nothing current rather than throwing.
 * 7. Responsiveness (AC-6) is CSS-driven: the destinations stay in the markup at
 *    desktop width. jsdom applies no stylesheet, so a CSS collapse is invisible
 *    to these tests — but a hamburger that renders NO destinations until a
 *    button is pressed would fail AC-1 here, and is the wrong shape for the
 *    keyboard walk in the sibling Playwright spec anyway.
 *
 * Mocked here, and why:
 * - `next/link` and `next/navigation` — the client-navigation boundary; both are
 *   libraries, never the code under test (the same stubs epic 1's Story 4 and
 *   this epic's Story 2 use). No HTTP client mock is needed: this header reads
 *   nothing from a service, it is handed the session.
 * - Identity bodies come only from the project-wide factories in
 *   `web/src/mocks/data/` (shared with the Playwright layer) — never written by
 *   hand in a test.
 *
 * jsdom cannot judge the visible treatment that pairs with `aria-current` (the
 * "you are here" styling) or the phone-width layout; those belong to the manual
 * checklist and the epic's real-browser axe scan on `/upload`, which renders
 * this header.
 *
 * These tests WILL FAIL until the story is implemented (TDD red) — today's
 * header carries the app name as plain text, the theme switch and the user menu,
 * and no navigation at all.
 */
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the header exists; its navigation does not yet.
import { AppHeader } from '@/components/layout/AppHeader';

// The ONE source of "which screens may this session open", imported so AC-1 can
// pin that the header offers exactly what it answers (brief BR6) rather than a
// list of its own. The concrete addresses below are stated as literals as well,
// so the assertions are not simply the access map agreeing with itself.
import { entryPointsFor } from '@/lib/auth/access-map';

// Project-wide identity + role sources, shared with the Playwright layer.
import { userInfoFor } from '@/mocks/data/identity';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/mocks/data/role';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

import type { UserInfoRead } from '@/types/auth';

/**
 * The address the app thinks it is showing. Held in a mutable box so one test can
 * move between screens; `usePathname` is a library boundary, not the code under
 * test.
 */
const { currentPathname } = vi.hoisted(() => ({
  currentPathname: { value: '/' },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => currentPathname.value,
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * `next/link` is stubbed with the plain anchor it renders in the browser, so the
 * destinations keep their `link` role, their `href` and any `aria-current`
 * without needing an App Router context in jsdom. A library, never the code
 * under test.
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

/** The signed-in landing screen — the one address both roles may open. */
const LANDING_PATH = '/';

/** The expense files screen this epic shipped; open to both roles. */
const EXPENSE_FILES_PATH = '/upload';

/** The review-and-decide screen, which only the Approver may open. */
const REVIEW_REQUESTS_PATH = '/requests';

/** The app's own name, as the header shows it (project.md — Employee Expenses). */
const APP_NAME = /employee expenses/i;

/** The header itself: the `banner` landmark every signed-in screen renders. */
const header = (): HTMLElement => screen.getByRole('banner');

const hrefsOf = (links: HTMLElement[]): string[] =>
  links
    .map((link) => link.getAttribute('href'))
    .filter((href): href is string => href !== null);

const unique = (values: string[]): string[] => [...new Set(values)];

/**
 * Where the header's navigation offers to take this session. Read from every
 * `navigation` landmark in the header, so a header that renders a wide and a
 * narrow arrangement of the same destinations is read as one set.
 */
const offeredDestinations = (): string[] =>
  unique(
    within(header())
      .getAllByRole('navigation')
      .flatMap((nav) => hrefsOf(within(nav).getAllByRole('link'))),
  );

/**
 * Every address the header links to at all, INCLUDING anything a screen reader
 * would be denied — so an entry that is present but hidden cannot pass as
 * "absent".
 */
const allHeaderDestinationsIncludingHidden = (): string[] =>
  unique(hrefsOf(within(header()).queryAllByRole('link', { hidden: true })));

/**
 * Addresses the header offers that this session is NOT permitted as an entry
 * point — the landing screen aside, since the app's own name links there (AC-3)
 * and the access map gives it no entry-point wording of its own. An empty result
 * is what "the destinations are exactly `entryPointsFor(session)`" looks like
 * from the outside (brief BR6).
 */
const offeredBeyondTheAccessMap = (session: UserInfoRead): string[] => {
  const permitted = entryPointsFor(session).map(
    (entryPoint) => entryPoint.path,
  );
  return offeredDestinations().filter(
    (destination) =>
      destination !== LANDING_PATH && !permitted.includes(destination),
  );
};

/**
 * The addresses the header marks as the screen being viewed. Scoped to the whole
 * header rather than the navigation, so the app-name link is caught too when it
 * claims to be current from somewhere else.
 */
const destinationsMarkedCurrent = (): string[] =>
  unique(
    hrefsOf(
      within(header())
        .queryAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page'),
    ),
  );

describe('Epic expense-file-upload, Story 4: getting between screens from the header', () => {
  beforeEach(() => {
    // Each test says where the user is; the landing screen is the default.
    currentPathname.value = LANDING_PATH;
  });

  // AC-1
  // Data-contract note: that following one of these addresses really lands on the
  // screen is the sibling Playwright spec's (AC-5) and the manual checklist's.
  it('offers the Importer the expense files screen, and the Approver both the expense files and the review-and-decide screens — exactly the set the access map permits', () => {
    const uploader = userInfoFor(ROLE_IMPORTER);

    const uploaderView = render(<AppHeader session={uploader} />);

    // The screen this epic shipped is reachable from anywhere for this role.
    expect(offeredDestinations()).toContain(EXPENSE_FILES_PATH);
    // Every destination is a real link with something to announce.
    within(header())
      .getAllByRole('navigation')
      .flatMap((nav) => within(nav).getAllByRole('link'))
      .forEach((destination) => {
        expect(destination).toHaveAccessibleName();
      });
    // Exactly the access map's answer for this session — nothing permitted left
    // out, and nothing offered that came from a hand-written list (brief BR6).
    // The landing screen is allowed here because the app's own name links to it
    // (AC-3) and it carries no entry-point wording of its own in the map.
    expect(offeredBeyondTheAccessMap(uploader)).toEqual([]);
    entryPointsFor(uploader).forEach((permitted) => {
      expect(offeredDestinations()).toContain(permitted.path);
    });

    uploaderView.unmount();

    const approver = userInfoFor(ROLE_APPROVER);
    render(<AppHeader session={approver} />);

    // The role that may also review and decide is offered both screens — the same
    // header, a different session, a different set.
    expect(offeredDestinations()).toContain(EXPENSE_FILES_PATH);
    expect(offeredDestinations()).toContain(REVIEW_REQUESTS_PATH);
    expect(offeredBeyondTheAccessMap(approver)).toEqual([]);
    entryPointsFor(approver).forEach((permitted) => {
      expect(offeredDestinations()).toContain(permitted.path);
    });
  });

  // AC-2
  it('does not render the review-and-decide destination at all for an Importer, while offering it to an Approver', () => {
    const approverView = render(
      <AppHeader session={userInfoFor(ROLE_APPROVER)} />,
    );

    // The control case: the same queries below DO find it for the role that may
    // open it, so the absence assertions afterwards mean something.
    expect(allHeaderDestinationsIncludingHidden()).toContain(
      REVIEW_REQUESTS_PATH,
    );
    expect(
      within(header()).getByRole('link', { name: /review/i }),
    ).toHaveAttribute('href', REVIEW_REQUESTS_PATH);

    approverView.unmount();

    render(<AppHeader session={userInfoFor(ROLE_IMPORTER)} />);

    // Absent from the markup — not hidden from the accessibility tree, not a
    // disabled button or menu item, and its wording nowhere in the header.
    expect(allHeaderDestinationsIncludingHidden()).not.toContain(
      REVIEW_REQUESTS_PATH,
    );
    expect(
      within(header()).queryByRole('link', { name: /review/i, hidden: true }),
    ).not.toBeInTheDocument();
    expect(
      within(header()).queryByRole('button', { name: /review/i, hidden: true }),
    ).not.toBeInTheDocument();
    expect(
      within(header()).queryByRole('menuitem', {
        name: /review/i,
        hidden: true,
      }),
    ).not.toBeInTheDocument();
    expect(within(header()).queryAllByText(/review/i)).toHaveLength(0);

    // The screen this role MAY open is still offered, so the absence above is
    // about permission rather than an empty header.
    expect(allHeaderDestinationsIncludingHidden()).toContain(
      EXPENSE_FILES_PATH,
    );
  });

  // AC-3
  it('makes the app’s name in the header a link to the signed-in landing screen', () => {
    currentPathname.value = EXPENSE_FILES_PATH;

    render(<AppHeader session={userInfoFor(ROLE_IMPORTER)} />);

    expect(
      within(header()).getByRole('link', { name: APP_NAME }),
    ).toHaveAttribute('href', LANDING_PATH);
  });

  // AC-4
  // Runtime-only: the visible "you are here" treatment that pairs with
  // `aria-current` is judged by eye on the manual checklist — jsdom loads no
  // stylesheet. What is pinned here is the part a screen reader is told.
  it('marks the screen being viewed as the current one, and marks no other destination', () => {
    const approver = userInfoFor(ROLE_APPROVER);

    currentPathname.value = EXPENSE_FILES_PATH;
    const onExpenseFiles = render(<AppHeader session={approver} />);

    // Exactly the screen on display — so neither the other permitted screen nor
    // the app-name link claims to be where the user is.
    expect(destinationsMarkedCurrent()).toEqual([EXPENSE_FILES_PATH]);

    onExpenseFiles.unmount();

    currentPathname.value = REVIEW_REQUESTS_PATH;
    render(<AppHeader session={approver} />);

    // The mark follows the screen rather than being fixed to one destination.
    expect(destinationsMarkedCurrent()).toEqual([REVIEW_REQUESTS_PATH]);
  });
});
