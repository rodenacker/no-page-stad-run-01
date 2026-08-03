/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/components/session/SessionTimeoutWarning.tsx
 * - Page Action: create_new
 *
 * Epic "Sign in and the signed-in app shell", Story 6 — session timeout warning
 * and a graceful return to sign-in.
 *
 * Covers the acceptance criteria tagged `vitest`: AC-1, AC-2, AC-4, AC-5.
 * AC-3 (no action after the warning → back on the sign-in screen with a
 * timed-out message) belongs to the Playwright spec, driven with `page.clock`.
 *
 * These tests WILL FAIL until implemented (TDD red).
 *
 * ---------------------------------------------------------------------------
 * Implementation contract this file pins — read before implementing
 * ---------------------------------------------------------------------------
 * 1. `web/src/lib/session/config.ts` owns the CONFIGURABLE session timings plus
 *    the one shared timed-out explanation:
 *      - `SESSION_IDLE_TIMEOUT_MS`   — idle period (working default 30 minutes)
 *      - `SESSION_WARNING_LEAD_MS`   — warning lead-time (working default 60 s)
 *      - `SESSION_TIMED_OUT_MESSAGE` — the plain-English sentence the user is
 *        given when the session ends, used on BOTH the idle path and the
 *        session-already-gone path (that sameness is AC-4's whole point)
 *    Both timings come from env vars (document them in `web/.env.example`) so a
 *    tester can shorten them. Every assertion below is DERIVED from those two
 *    values — there is deliberately not a single 30-minute literal in this file,
 *    so shortening the thresholds for manual testing cannot break the suite.
 *
 * 2. `SessionTimeoutWarning` is a client component taking no props, mounted once
 *    in the signed-in shell (Story 3). `SESSION_WARNING_LEAD_MS` before the idle
 *    period elapses it opens the Shadcn `alert-dialog` (Radix renders it with
 *    `role="alertdialog"`) carrying a "Stay signed in" button. Any user activity
 *    (pointer or keyboard) restarts the idle countdown.
 *
 * 3. Staying signed in touches the session through the API client's `get`
 *    (`GET /v1/auth/userinfo`) — never a bare `fetch` from a component
 *    (CLAUDE.md §2). On success the warning closes and the countdown restarts.
 *
 * 4. When that touch comes back 401 — the auth service reporting the session is
 *    already gone — the component surfaces `SESSION_TIMED_OUT_MESSAGE` through
 *    the existing toast infrastructure and navigates to `/sign-in`, instead of
 *    letting the API client's raw "Unauthorized: …" error reach the user.
 *
 *    THE ABSOLUTE SESSION CAP IS THE AUTH SERVICE'S TO ENFORCE, NOT THE APP'S.
 *    That is why no test here expects a 12-hour client-side timer: the app
 *    asserts no session lifetime of its own, it only reacts to the service.
 *
 * ---------------------------------------------------------------------------
 * Timers and mocks
 * ---------------------------------------------------------------------------
 * The idle countdown is a component-local timer with no browser-level flow of
 * its own, which is the testing-policy's "last resort" fake-timer case
 * (§Time-dependent behaviour) — the observable FLOW (warning → no action →
 * redirect, and the live countdown) is AC-3's `page.clock` spec and is not
 * duplicated here. No `axe()` call runs in this file (it would hang under a
 * frozen clock); accessibility is asserted by the shell's Playwright scan.
 *
 * Mocked: `@/lib/api/client` (the HTTP boundary) and `next/navigation` (the
 * framework boundary). The toast infrastructure is the REAL provider plus the
 * REAL container, mirroring `web/src/app/layout.tsx`, so the explanation the
 * user is given is asserted as rendered text rather than as a mock call.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, {
  PointerEventsCheckLevel,
} from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastContainer } from '@/components/toast/ToastContainer';
// Production component under test — import fails until implemented (TDD red).
import { SessionTimeoutWarning } from '@/components/session/SessionTimeoutWarning';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
import {
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_TIMED_OUT_MESSAGE,
  SESSION_WARNING_LEAD_MS,
} from '@/lib/session/config';
// Project-wide mock data — the single source both test layers share.
import { userInfoFor } from '@/mocks/data/identity';
import { ROLE_APPROVER } from '@/mocks/data/role';

import type { APIError } from '@/types/api';

vi.mock('@/lib/api/client', () => ({ get: vi.fn(), post: vi.fn() }));

const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const mockGet = get as ReturnType<typeof vi.fn>;

/** How long the user must sit idle before the warning is due (AC-1). */
const MS_UNTIL_WARNING = SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_LEAD_MS;

/**
 * What the API client throws for `GET /v1/auth/userinfo` when the auth service
 * says the session is gone (`web/src/lib/api/client.ts` → 401 branch). The
 * `message` here is exactly the raw wording the user must NOT be shown.
 */
const SESSION_GONE_ERROR: APIError = {
  message: 'Unauthorized: Please log in to continue',
  statusCode: 401,
  details: ['Your session may have expired. Please log in again.'],
  endpoint: '/v1/auth/userinfo',
};

/** Mirrors the root layout: provider + container, so toasts render as text. */
const renderShell = (): void => {
  render(
    <ToastProvider>
      <SessionTimeoutWarning />
      <ToastContainer />
    </ToastProvider>,
  );
};

const setupUser = () =>
  userEvent.setup({
    advanceTimers: (delay: number) => {
      vi.advanceTimersByTime(delay);
    },
    // Radix puts `pointer-events: none` on the body while a modal is open;
    // jsdom then reports the dialog's own controls as un-clickable even though
    // a real browser lets them through.
    pointerEventsCheck: PointerEventsCheckLevel.Never,
  });

/** Advance the fake clock inside `act` so timer-driven renders are flushed. */
const advanceTime = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/**
 * Every route the component asked the router to go to, in call order.
 * Reading both `push` and `replace` keeps the assertion about WHERE the user
 * ends up rather than which router method the implementation picked.
 */
const navigationTargets = (): string[] =>
  [...mockReplace.mock.calls, ...mockPush.mock.calls]
    .map((args) => args[0])
    .filter((target): target is string => typeof target === 'string');

describe('SessionTimeoutWarning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AC-1
  it('warns the user one warning-lead-time before the idle period runs out, offering to stay signed in', async () => {
    renderShell();

    // One second short of the warning point: nothing has interrupted the user.
    await advanceTime(MS_UNTIL_WARNING - 1_000);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await advanceTime(1_000);

    const warning = await screen.findByRole('alertdialog');
    expect(
      within(warning).getByRole('button', { name: /stay signed in/i }),
    ).toBeInTheDocument();
    // The warning is an offer, not an eviction — nobody has been sent anywhere.
    expect(navigationTargets()).toEqual([]);
  });

  // AC-2
  it('dismisses the warning and keeps the user signed in when they choose to stay', async () => {
    const user = setupUser();
    mockGet.mockResolvedValue(userInfoFor(ROLE_APPROVER));
    renderShell();

    await advanceTime(MS_UNTIL_WARNING);
    const warning = await screen.findByRole('alertdialog');

    await user.click(
      within(warning).getByRole('button', { name: /stay signed in/i }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    // Carrying on means never being sent back to sign in for credentials.
    expect(navigationTargets()).toEqual([]);

    // Staying signed in restarted the idle window rather than merely hiding the
    // dialog: almost the whole window passes again without a second warning.
    await advanceTime(MS_UNTIL_WARNING - 1_000);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  // AC-4
  // Data-contract: the real client → auth-service 401 chain is verified during
  // the manual checklist; here the client is mocked at the 401 it throws.
  it('returns the user to sign-in with the plain timed-out explanation when the service reports the session already gone', async () => {
    const user = setupUser();
    mockGet.mockRejectedValue(SESSION_GONE_ERROR);
    renderShell();

    await advanceTime(MS_UNTIL_WARNING);
    const warning = await screen.findByRole('alertdialog');

    // The user's next action — asking to stay signed in — is what discovers the
    // session is already gone service-side.
    await user.click(
      within(warning).getByRole('button', { name: /stay signed in/i }),
    );

    expect(await screen.findByText(SESSION_TIMED_OUT_MESSAGE)).toBeVisible();
    await waitFor(() => {
      expect(
        navigationTargets().some((target) => target.startsWith('/sign-in')),
      ).toBe(true);
    });

    // The plain explanation REPLACES the raw error — the user never meets the
    // API client's "Unauthorized: …" wording, and isn't left holding a dialog.
    expect(screen.queryByText(/unauthorized/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  // AC-5
  it('never warns a user who keeps interacting, and warns only once activity stops', async () => {
    const user = setupUser();
    renderShell();

    // Three bursts of activity, each after three-quarters of the idle window —
    // well over a full idle period in total, so a countdown that did not reset
    // on activity would already have warned.
    for (let burst = 0; burst < 3; burst += 1) {
      await advanceTime(Math.floor(MS_UNTIL_WARNING * 0.75));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      await user.click(document.body);
      await user.keyboard('a');
    }

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(navigationTargets()).toEqual([]);

    // Activity stops: the countdown reset by that last burst now runs out, so
    // the user IS warned — which is what proves the assertions above are real.
    await advanceTime(MS_UNTIL_WARNING);
    expect(await screen.findByRole('alertdialog')).toBeVisible();
  });
});
