/**
 * Story Metadata:
 * - Epic: sign-in-and-app-shell — Story 3: the signed-in app shell
 * - Route: /
 * - Target File: web/src/app/(authenticated)/layout.tsx
 * - Page Action: create_new
 *
 * Covers the criteria tagged `vitest`: AC-1 (identity + role in the header),
 * AC-2 (sign-out awaits the auth service and only then leaves — a failed logout
 * surfaces an error instead), AC-6 (identity re-resolved on each navigation).
 * AC-3 (server gate / no flash of protected content), AC-4 (Back button after
 * sign-out) and AC-5 (keyboard + axe) are the Playwright spec's — not duplicated
 * here (testing-policy.md § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. `web/src/app/(authenticated)/layout.tsx` default-exports an **async server
 *    component** that `await`s `requireSession()` (Story 1's helper) and renders
 *    the shell chrome plus `children`. Its returned tree contains only client-
 *    renderable components, so a test can `render(await Layout({ children }))`.
 * 2. The identity chrome (signed-in person's name + their role) lives inside a
 *    `<header>` landmark (`role="banner"`) that is NOT nested inside the
 *    layout's own `<main>` — that landmark is also part of the WCAG 2.2 AA bar
 *    for this project (requirements §6.6.5).
 * 3. Sign-out lives in its own **client** component,
 *    `web/src/components/layout/SignOutButton.tsx`, named export `SignOutButton`,
 *    rendering a single button named "Sign out". It must be a client component
 *    because it has to branch on the logout result and surface a failure in the
 *    UI (BFF Rule 8). Production may place it inside the header's user/theme
 *    dropdown; these tests render it directly, so the menu wrapper is free.
 * 4. It calls the logout endpoint through `@/lib/api/client` (`post`) —
 *    never `fetch()` from a component (CLAUDE.md §2) — **awaits** the response,
 *    and only on success ends the session and navigates to `/sign-in`
 *    (`router.replace` or `router.push`). On failure it shows an error naming
 *    the failed sign-out and stays put (bff-auth-pattern.md Rule 8, brief BR4).
 * 5. The failure error is surfaced through the EXISTING toast infrastructure
 *    (`@/contexts/ToastContext` + `@/components/toast/ToastContainer`), which
 *    renders an error toast with `role="alert"` — no new notification system.
 *
 * Mocked here, and why:
 * - `@/lib/api/client` — the fixed convention for HTTP (testing-policy.md
 *   § Mocking strategy).
 * - `@/lib/auth/requireSession` — a server-only helper built by Story 1; it
 *   reads `next/headers` cookies, which cannot run in jsdom. Mocking the
 *   *dependency* keeps the layout itself (the code under test) real.
 * - `next/navigation` — the client-navigation boundary jsdom can observe.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — these imports fail until implemented (TDD red).
import AuthenticatedLayout from '@/app/(authenticated)/layout';
import { SignOutButton } from '@/components/layout/SignOutButton';
import { requireSession } from '@/lib/auth/requireSession';

// Real production toast infrastructure (not mocked) — the same composition the
// root layout uses, so the failure branch's error is asserted as the user sees it.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { post } from '@/lib/api/client';

// Project-wide mock data — the single source of truth for the userinfo contract
// and this project's role names, shared with the Playwright layer. Never inline
// a userinfo body in a test.
import { logoutSuccessResponse, userInfoFor } from '@/mocks/data/identity';
import { ROLE_APPROVER, ROLE_FINANCE_UPLOADER } from '@/mocks/data/role';
import { fullNameOf } from '@/mocks/data/user';

import type { ReactNode } from 'react';

import type { APIError, DefaultResponse } from '@/types/api';

const { mockPush, mockReplace, mockRefresh } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api/client', () => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/auth/requireSession', () => ({ requireSession: vi.fn() }));

const mockPost = post as unknown as ReturnType<typeof vi.fn>;
const mockRequireSession = requireSession as unknown as ReturnType<
  typeof vi.fn
>;

/** Where the app asked the browser to go, by either client-navigation API. */
const navigationTargets = (): string[] =>
  [...mockReplace.mock.calls, ...mockPush.mock.calls].map((call) =>
    String(call[0]),
  );

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/** A promise resolved by the test, so "did it await?" is observable. */
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Renders the `(authenticated)` layout the way a navigation does: invoke the
 * async server component once and render what it returned.
 */
const renderShell = async (children: ReactNode) =>
  render(await AuthenticatedLayout({ children }));

/** Sign-out rendered inside the root layout's real toast composition. */
const renderSignOut = () =>
  render(
    <ToastProvider>
      <SignOutButton />
      <ToastContainer />
    </ToastProvider>,
  );

const LOGOUT_FAILED: APIError = {
  message: 'Internal Server Error: Something went wrong on the server',
  statusCode: 500,
  details: ['Please try again later or contact support.'],
  endpoint: '/v1/auth/logout',
};

describe('Epic sign-in-and-app-shell, Story 3: signed-in app shell — identity and sign-out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-1
  it('shows the signed-in person and their role in the shell header, around the page content', async () => {
    const uploader = userInfoFor(ROLE_FINANCE_UPLOADER);
    mockRequireSession.mockResolvedValue(uploader);

    await renderShell(<p>Import expenses</p>);

    const header = screen.getByRole('banner');
    expect(header).toHaveTextContent(fullNameOf(uploader));
    expect(header).toHaveTextContent(ROLE_FINANCE_UPLOADER);
    expect(screen.getByText('Import expenses')).toBeInTheDocument();
  });

  // AC-2
  // Data-contract: the real round-trip (auth service ends the session and clears
  // the cookie with matching attributes) is verified in the manual checklist.
  it('waits for the auth service to confirm sign-out before returning the user to sign-in', async () => {
    const user = userEvent.setup();
    const logout = createDeferred<DefaultResponse>();
    mockPost.mockReturnValue(logout.promise);

    renderSignOut();
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    // Still in the app while the logout call is in flight — nowhere sent yet.
    expect(navigationTargets()).toEqual([]);

    logout.resolve(logoutSuccessResponse());

    await waitFor(() => {
      expect(navigationTargets()).toContain('/sign-in');
    });
  });

  // AC-2
  it('shows an error and keeps the user in the app when the sign-out call fails', async () => {
    const user = userEvent.setup();
    mockPost.mockRejectedValue(LOGOUT_FAILED);

    renderSignOut();
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/sign(?:ing)?[\s-]?out/i);
    expect(navigationTargets()).not.toContain('/sign-in');
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled();
  });

  // AC-6
  // Runtime-only: that the gate blocks *before* protected content renders is the
  // Playwright spec's AC-3; this pins the per-navigation re-resolution (BR3).
  it('re-resolves the identity on each navigation, so a changed role set shows on the next screen', async () => {
    const uploader = userInfoFor(ROLE_FINANCE_UPLOADER);
    const approver = userInfoFor(ROLE_APPROVER);
    mockRequireSession
      .mockResolvedValueOnce(uploader)
      .mockResolvedValueOnce(approver);

    const firstNavigation = await renderShell(<p>First screen</p>);
    expect(screen.getByRole('banner')).toHaveTextContent(fullNameOf(uploader));
    firstNavigation.unmount();

    await renderShell(<p>Second screen</p>);

    const header = screen.getByRole('banner');
    expect(header).toHaveTextContent(fullNameOf(approver));
    expect(header).toHaveTextContent(ROLE_APPROVER);
    expect(header).not.toHaveTextContent(fullNameOf(uploader));
  });
});
