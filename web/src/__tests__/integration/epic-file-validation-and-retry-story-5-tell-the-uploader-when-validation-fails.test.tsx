/**
 * Story Metadata:
 * - Epic: file-validation-and-retry — Story 5: tell the uploader when validation fails
 * - Route: /upload
 * - Target File: web/src/components/files/SubmittedFilesList.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — a file that finishes validation with rejected rows while the Finance
 *   Uploader has the list open raises an in-app notification naming that file.
 * - AC-2 — that notification does not fade away on its own, unlike the
 *   confirmation shown when a file imports; it goes when the user dismisses it.
 * - AC-4 — a file already in the failed state when the list was opened raises no
 *   notification; only a file that REACHES that state while the list is open does.
 * - AC-5 — an Approver watching the same list is not notified, and still sees the
 *   row's status change.
 *
 * AC-3 (the notification takes the user to that file's rejected rows) is a real
 * navigation and belongs to this story's Playwright spec — deliberately not
 * duplicated here (testing-policy.md § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. This story ADDS to the existing client component
 *    `web/src/components/files/SubmittedFilesList.tsx` (named export
 *    `SubmittedFilesList`) — no new component and no second list. The
 *    notification comes out of the root layout's existing toast composition
 *    (`ToastProvider` + `ToastContainer`, `@/contexts/ToastContext`), which is what
 *    these tests mount around it. Do not add a second notification mechanism.
 * 2. ROLE GATING ARRIVES AS AN OPTIONAL PROP THAT STILL NOTIFIES BY DEFAULT.
 *    Epic `expense-file-upload` story 3 pinned that this list carries no
 *    session/role prop and that its notification is not role-gated; those tests
 *    render `<SubmittedFilesList />` with no props and must stay honest. So the
 *    audience of THIS notification is narrowed by an OPTIONAL prop the `/upload`
 *    page sets from the session — pinned here as:
 *
 *        viewerRoles?: string[]   // the signed-in user's role names
 *
 *    with these two behaviours, both asserted below:
 *      - prop ABSENT  → the notification is raised (epic 2's contract, AC-2's test);
 *      - prop PRESENT → raised only when it includes `ROLE_IMPORTER`, the auth
 *        service's own name for the role the requirements call the "Finance
 *        Uploader" (`@/types/auth`; the string "Finance Uploader" recognises
 *        nobody). An Approver-only viewer is not told (AC-5's test).
 *    The page supplies it from `rolesOf(session)` / `hasRole(...)` — nothing here
 *    reads a session in the browser. Until that prop exists `tsc` reports it as an
 *    unknown property on this component: that is expected TDD-red noise, and the
 *    only such error this file should produce.
 * 3. IT FIRES ON THE TRANSITION, NOT ON THE STATE. The previous-status-per-id ref
 *    the list already keeps for the `Imported` case (`statusesAlreadySeen`) is what
 *    decides this too — EXTEND it, do not parallel it. A file already
 *    `Validation failed` on the first read has not transitioned and must never be
 *    announced (AC-4), and a file that stays failed across every later re-read must
 *    not be announced again (asserted in AC-1's test: still exactly one
 *    notification a minute later).
 * 4. IT DOES NOT AUTO-DISMISS (this epic's NFR-3 / source UI-19: state the user
 *    must act on persists), unlike the `Imported` confirmation, which keeps the
 *    toast default and fades. In toast terms that is a zero/absent duration — with
 *    the dismiss control still offered, because "stays until the user dismisses or
 *    acts on it" (AC-2) requires a way to dismiss it in place.
 * 5. Keeping the rows current stays exactly as story 3 built it: the SAME list call
 *    (`fetchSubmittedFiles`) re-read while any listed file is in progress. No new
 *    endpoint and no per-file call — the mock below fails loudly on any other read.
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy), plus `next/navigation` and `next/link` as
 * the client-navigation boundary, which has no App Router context in jsdom (house
 * convention). The toast infrastructure is the REAL production code, so the
 * notification is asserted as the text and controls a user actually meets rather
 * than as a mock call, and every response body comes from the project-wide
 * `@/mocks/data/file-log` factory the Playwright layer shares, so the two layers
 * cannot drift onto different shapes.
 *
 * Timers: the list's refresh is a component-local interval with no browser-level
 * flow of its own — the testing-policy's last-resort fake-timer case, handled
 * exactly as story 3 handles it. Time only ever moves on the FAKE clock; no test
 * knows or asserts the refresh interval or the toast's own lifetime, only that a
 * change arrives within a sensible window and that one notification is still there
 * a minute later while the other is not. No `axe()` runs under a frozen clock;
 * accessibility is the epic's real-browser scan.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the list story 3 taught to keep itself current, and
// this story teaches to speak up when a file's validation fails.
import { SubmittedFilesList } from '@/components/files/SubmittedFilesList';

// Real production toast composition (not mocked) — the same one the root layout
// wraps every signed-in screen in, and the surface this notification must come from.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';

// Project-wide FileLog factory — the single source both test layers share.
// `fileLogProgression` gives the SAME file (one id, one name) at successive
// statuses, which is how a file transitions INTO the failed state while the list is
// being watched. Never hand-write a response body in a test.
import {
  FILE_STATUS_IMPORTED,
  FILE_STATUS_VALIDATING,
  FILE_STATUS_VALIDATION_FAILED,
  fileLogListResponse,
  fileLogProgression,
  fileLogWithStatus,
} from '@/mocks/data/file-log';
// The auth service's own role names, from production code (matching on the
// requirements' wording "Finance Uploader" recognises nobody).
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/types/auth';

import type { RenderResult } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

import type { FileLogList } from '@/types/files';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

// The client-navigation boundary — a library, never the code under test. jsdom has
// no App Router context, so any navigation hook the list (or the notification it
// raises) reaches for would throw on mount. WHERE the notification takes the user is
// AC-3's business, in the browser.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/upload',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/**
 * `next/link` stubbed with the plain anchor it renders in the browser, so each row
 * keeps its link to the file without an App Router context. A library, never the
 * code under test.
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

const mockGet = get as unknown as ReturnType<typeof vi.fn>;

/**
 * How much FAKE time a test is prepared to let pass while waiting for a
 * self-updating row to catch up. Deliberately NOT the implementation's refresh
 * interval: the criterion is that the list notices a file finishing on its own
 * within a sensible time, not that it refreshes on any particular schedule.
 */
const REFRESH_WINDOW_MS = 60_000;

/**
 * How long a notification is left alone before it is looked at again — the manual
 * check's "leave it for a minute". Anything comfortably longer than the toast
 * default satisfies these tests; the default itself is nobody's contract here.
 */
const LEFT_ALONE_MS = 60_000;

/** A second file, so the list always has something in progress to keep asking about. */
const OTHER_FILE = {
  Id: 5002,
  CurrentFileName: 'expenses_2026-04-16.csv',
} as const;

/** A third file, for the case where the failed one was failed before the screen opened. */
const ALREADY_FAILED_FILE = {
  Id: 5003,
  CurrentFileName: 'expenses_2026-04-10.csv',
} as const;

let fileLogsScript: FileLogList[] = [];

/**
 * Script the file-logs reads: one reply per read, in order, with the LAST reply
 * repeating for every further read — so a screen that keeps refreshing never falls
 * off the end of the script, and no test has to know (or assert) how many reads
 * happened.
 */
const serveFileLogs = (...replies: FileLogList[]): void => {
  fileLogsScript = [...replies];
};

/**
 * Advance the fake clock inside `act`, so timer-driven renders are flushed before
 * anything is asserted. Called with no argument it just flushes what is pending —
 * which is how the first read is settled after mounting.
 */
const settle = async (ms = 0): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/** Clicks that have to work while the clock is frozen. */
const setupUser = () =>
  userEvent.setup({
    advanceTimers: (delay: number) => {
      vi.advanceTimersByTime(delay);
    },
  });

/** What the `/upload` page may tell the list about who is watching it. */
type ViewerProps = { viewerRoles?: string[] };

/**
 * The screen as the root layout always mounts it: inside the toast composition.
 * Passing no props is how epic 2's tests mount it, and it must keep working.
 */
const renderList = async (props: ViewerProps = {}): Promise<RenderResult> => {
  const view = render(
    <ToastProvider>
      <SubmittedFilesList {...props} />
      <ToastContainer />
    </ToastProvider>,
  );
  await settle();
  return view;
};

/**
 * The app's in-app notification surface (the root layout's `ToastContainer`), which
 * renders nothing at all while there is nothing to tell the user — so its absence
 * IS "no notification was raised".
 */
const notificationSurface = (): HTMLElement | null =>
  screen.queryByRole('region', { name: /notifications/i });

/** The same surface where a test has already established it is there. */
const openNotifications = (): HTMLElement =>
  screen.getByRole('region', { name: /notifications/i });

/**
 * The dismiss control of every notification currently on screen — one per
 * notification, so this is how many the user is looking at. Counting the user's own
 * control rather than anything internal, and it also holds the implementation to
 * offering a way to dismiss the one that never fades (contract note 4).
 */
const dismissControls = (): HTMLElement[] =>
  within(openNotifications()).getAllByRole('button', {
    name: /dismiss notification/i,
  });

/**
 * The table row for a named file — scoped by the file's own name rather than by
 * index, so the assertions never depend on the order the service returned, and
 * narrowed to inside the table because a file name also appears in the notification.
 */
const rowFor = (fileName: string): HTMLElement => {
  const row = within(screen.getByRole('table'))
    .getByText(fileName)
    .closest('tr');
  if (row === null) {
    throw new Error(
      `No table row found for "${fileName}" — the submitted files list must ` +
        `render one table row per file (see the implementation contract above).`,
    );
  }
  return row;
};

describe('Epic file-validation-and-retry, Story 5: telling the uploader when validation fails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    fileLogsScript = [];
    mockGet.mockImplementation(async (endpoint: string) => {
      const path = String(endpoint);
      if (!path.includes('file-logs')) {
        throw new Error(
          `Unexpected read of "${path}" — noticing a file's validation failing is a ` +
            're-read of the file-logs list the screen already makes, not a new ' +
            'endpoint and not a per-file call.',
        );
      }
      const reply =
        fileLogsScript.length > 1 ? fileLogsScript.shift() : fileLogsScript[0];
      if (!reply) {
        throw new Error(
          'The screen read the file logs but the test scripted no reply — call ' +
            'serveFileLogs(...) before rendering.',
        );
      }
      return reply;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AC-1
  it('notifies the Finance Uploader, naming the file, when a submitted file finishes validation with rejected rows — once, not on every later read', async () => {
    // The SAME file at two successive statuses — one id, one name, one row.
    const [validating, failed] = fileLogProgression([
      FILE_STATUS_VALIDATING,
      FILE_STATUS_VALIDATION_FAILED,
    ]);
    // A second file that never finishes, so the list keeps re-reading long after the
    // first one failed — which is what makes "announced once" a real assertion.
    const stillWorking = fileLogWithStatus(FILE_STATUS_VALIDATING, OTHER_FILE);
    serveFileLogs(
      fileLogListResponse([validating, stillWorking]),
      fileLogListResponse([failed, stillWorking]),
    );

    await renderList({ viewerRoles: [ROLE_IMPORTER] });

    // The file is still being validated, and the user has been told nothing yet:
    // merely listing a file that is in progress is not news.
    expect(
      within(rowFor(validating.CurrentFileName)).getByText(
        FILE_STATUS_VALIDATING,
      ),
    ).toBeInTheDocument();
    expect(notificationSurface()).not.toBeInTheDocument();

    const notification = await screen.findByRole(
      'region',
      { name: /notifications/i },
      { timeout: REFRESH_WINDOW_MS },
    );

    // The uploader is told WHICH file it was, by the file's own name as the service
    // reported it (brief BR5) — a notification that does not name the file leaves
    // the user hunting for it.
    expect(notification).toHaveTextContent(failed.CurrentFileName);

    // ...and the row the notification is about caught up in place.
    expect(
      within(rowFor(failed.CurrentFileName)).getByText(
        FILE_STATUS_VALIDATION_FAILED,
      ),
    ).toBeInTheDocument();

    // A minute of further re-reads, on all of which that file is still failed: the
    // announcement was about the TRANSITION, so nothing is said a second time.
    await settle(LEFT_ALONE_MS);
    expect(dismissControls()).toHaveLength(1);
    expect(openNotifications()).toHaveTextContent(failed.CurrentFileName);
  });

  // AC-2
  it('leaves the rejected-rows notification on screen until the user dismisses it, while the imported confirmation fades on its own', async () => {
    const [validatingFailure, failed] = fileLogProgression([
      FILE_STATUS_VALIDATING,
      FILE_STATUS_VALIDATION_FAILED,
    ]);
    const [validatingSuccess, imported] = fileLogProgression(
      [FILE_STATUS_VALIDATING, FILE_STATUS_IMPORTED],
      OTHER_FILE,
    );
    serveFileLogs(
      fileLogListResponse([validatingFailure, validatingSuccess]),
      fileLogListResponse([failed, imported]),
    );

    const user = setupUser();
    // No prop at all — exactly how epic 2's tests and the `/upload` page's own
    // default mount this list. The notification must still be raised (contract
    // note 2), which is what keeps that pinned contract honest.
    await renderList();

    await waitFor(
      () => {
        expect(openNotifications()).toHaveTextContent(failed.CurrentFileName);
      },
      { timeout: REFRESH_WINDOW_MS },
    );
    // Both outcomes landed in the same read, so both have been announced.
    expect(openNotifications()).toHaveTextContent(imported.CurrentFileName);

    // A minute goes by with nobody touching either one.
    await settle(LEFT_ALONE_MS);

    // The confirmation that only reported good news has gone by itself...
    expect(openNotifications()).not.toHaveTextContent(imported.CurrentFileName);
    // ...while the one the user has to act on is still there, and still alone.
    expect(openNotifications()).toHaveTextContent(failed.CurrentFileName);
    expect(dismissControls()).toHaveLength(1);

    // It goes when — and only when — the user dismisses it.
    await user.click(dismissControls()[0]);
    expect(notificationSurface()).not.toBeInTheDocument();
  });

  // AC-4
  it('says nothing about a file that was already in the failed state when the list was opened, and names only the one that fails while it is open', async () => {
    const alreadyFailed = fileLogWithStatus(
      FILE_STATUS_VALIDATION_FAILED,
      ALREADY_FAILED_FILE,
    );
    // A second file is still being validated when the screen opens, and fails on the
    // next read — so both a file that was already failed and a file that reaches
    // that state are on screen together, and only one of them is news.
    const [validating, failed] = fileLogProgression([
      FILE_STATUS_VALIDATING,
      FILE_STATUS_VALIDATION_FAILED,
    ]);
    serveFileLogs(
      fileLogListResponse([alreadyFailed, validating]),
      fileLogListResponse([alreadyFailed, failed]),
    );

    await renderList({ viewerRoles: [ROLE_IMPORTER] });

    // The already-failed row states its outcome, as it always has.
    expect(
      within(rowFor(alreadyFailed.CurrentFileName)).getByText(
        FILE_STATUS_VALIDATION_FAILED,
      ),
    ).toBeInTheDocument();
    // ...and nothing has been announced: the user is opening a screen, not being
    // told news about a file that failed before they got here.
    expect(notificationSurface()).not.toBeInTheDocument();

    // Now the other file finishes validating with rejected rows while the list is
    // open. THAT is news.
    const notification = await screen.findByRole(
      'region',
      { name: /notifications/i },
      { timeout: REFRESH_WINDOW_MS },
    );
    expect(notification).toHaveTextContent(failed.CurrentFileName);

    // One notification, about that file only — the file that was already failed when
    // the screen opened is still not mentioned, however many times it is re-read.
    expect(dismissControls()).toHaveLength(1);
    await settle(LEFT_ALONE_MS);
    expect(openNotifications()).not.toHaveTextContent(
      alreadyFailed.CurrentFileName,
    );
    expect(dismissControls()).toHaveLength(1);
  });

  // AC-5
  it('does not notify an Approver about rejected rows, while the same transition does notify the Finance Uploader', async () => {
    const [validating, failed] = fileLogProgression([
      FILE_STATUS_VALIDATING,
      FILE_STATUS_VALIDATION_FAILED,
    ]);
    serveFileLogs(
      fileLogListResponse([validating]),
      fileLogListResponse([failed]),
    );

    const approverView = await renderList({ viewerRoles: [ROLE_APPROVER] });

    // The Approver's row keeps itself current exactly as before — the status changes
    // on its own, with the service's own most recent activity beside it.
    await waitFor(
      () => {
        expect(
          within(rowFor(failed.CurrentFileName)).getByText(
            FILE_STATUS_VALIDATION_FAILED,
          ),
        ).toBeInTheDocument();
      },
      { timeout: REFRESH_WINDOW_MS },
    );
    expect(
      within(rowFor(failed.CurrentFileName)).getByText(
        failed.LastExecutedActivityName,
      ),
    ).toBeInTheDocument();

    // ...but nobody told the Approver about the rejected rows, then or later.
    expect(notificationSurface()).not.toBeInTheDocument();
    await settle(LEFT_ALONE_MS);
    expect(notificationSurface()).not.toBeInTheDocument();

    approverView.unmount();

    // The control for that silence: the very same transition, watched by the Finance
    // Uploader, IS announced. Without this the assertions above would also pass on
    // an implementation that notifies nobody at all.
    serveFileLogs(
      fileLogListResponse([validating]),
      fileLogListResponse([failed]),
    );
    await renderList({ viewerRoles: [ROLE_IMPORTER] });

    const notification = await screen.findByRole(
      'region',
      { name: /notifications/i },
      { timeout: REFRESH_WINDOW_MS },
    );
    expect(notification).toHaveTextContent(failed.CurrentFileName);
  });
});
