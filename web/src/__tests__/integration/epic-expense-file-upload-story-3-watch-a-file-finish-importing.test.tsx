/**
 * Story Metadata:
 * - Epic: expense-file-upload — Story 3: watch a file finish importing
 * - Route: /upload
 * - Target File: web/src/app/(authenticated)/upload/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-2 — a file reaching the imported status notifies the Finance Uploader,
 *   naming the file and the number of records imported.
 * - AC-3 — a file ending in the validation-failed status shows that status, and
 *   nothing claims it imported.
 * - AC-5 — a background refresh that fails leaves the list showing its last
 *   known values.
 *
 * AC-1 (a row updating without a reload), AC-4 (the screen stops re-requesting
 * once nothing is in progress) and AC-6 (the real-browser accessibility scan)
 * belong to this story's Playwright spec, driven with `page.clock` — deliberately
 * not duplicated here (testing-policy.md § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. This story ADDS to the client component Story 1 introduced —
 *    `web/src/components/files/SubmittedFilesList.tsx`, named export
 *    `SubmittedFilesList`, no required props — rendered inside the root layout's
 *    existing `ToastProvider` + `ToastContainer` composition, exactly as Story 1's
 *    tests and the epic-1 shell tests mount it. No new component, no second list.
 * 2. While ANY listed file is in an in-progress status (`isFileInProgress` from
 *    `@/types/files` — `Uploaded` / `Validating`) the component re-reads the SAME
 *    list call it already makes, `${TRANSACTIONS_API_BASE_PATH}/v1/file-logs` with
 *    `IsActive: 'Yes'`, and updates the affected rows in place. No new endpoint and
 *    no per-file call: the mock below fails loudly on any other read. The loop must
 *    clear itself on unmount and must not stack across re-renders.
 * 3. On a file's transition INTO `Imported`, the screen raises ONE in-app
 *    notification through the existing `useToast()` (`@/contexts/ToastContext`),
 *    naming the file (`CurrentFileName`) and the record count (`RecordCount`)
 *    exactly as the service returned them — the frontend counts and derives nothing
 *    (brief BR5). A file that is ALREADY imported on the first read has not
 *    transitioned and must not notify anybody.
 *    Role note: the list carries no role prop (Story 1's contract), and both roles
 *    watch the same live rows, so nothing here asserts role gating. If the
 *    implementation does want to limit the notification to the Finance Uploader,
 *    that must arrive as an OPTIONAL prop whose default still notifies — these
 *    tests render the list exactly as Story 1 does.
 * 4. A file resolving to `Validation failed` must not be reported as an import.
 *    Telling the uploader anything ABOUT the invalid rows was the next epic's R91,
 *    which this epic did not pre-empt; that notification now exists
 *    (`file-validation-and-retry` story 5) and its own tests own it, so what is
 *    pinned below is this story's own criterion: nothing on this screen says a file
 *    that failed validation imported.
 * 5. A failed background re-read must not blank the list, must not replace the
 *    screen with Story 1's failed-load state (its `role="alert"` + "Try again"),
 *    and must not throw: every row keeps the values from the last successful read.
 *    Story 1's failure state stays what it is — the state of a FIRST read that
 *    never succeeded.
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy) — the same one-line mock Story 1 uses. The
 * toast infrastructure is the real production code, so the notification is asserted
 * as rendered text the way the user meets it, and every response body comes from
 * the project-wide `@/mocks/data/file-log` factory that the Playwright layer shares,
 * so the two layers cannot drift onto different shapes.
 *
 * Timers: the refresh is a component-local interval with no browser-level flow of
 * its own — the testing-policy's last-resort fake-timer case. Time only ever moves
 * on the FAKE clock; there is no real-time sleep anywhere, and no test knows or
 * asserts the polling interval (that mechanic is the implementation's business).
 * Each test waits for a user-observable CHANGE within `REFRESH_WINDOW_MS` of fake
 * time — RTL advances the fake clock while it waits, via the `jest` shim in
 * `vitest.setup.ts` — so any sensible interval satisfies them. No `axe()` runs
 * under a frozen clock; accessibility is AC-6's real-browser scan.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — Story 1's list, which this story teaches to keep
// itself current. The import fails until that component exists (TDD red).
import { SubmittedFilesList } from '@/components/files/SubmittedFilesList';

// Real production toast composition (not mocked) — the same one the root layout
// wraps every signed-in screen in, and the surface this story's notification must
// come out of.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';

// Project-wide FileLog factory — the single source both test layers share.
// `fileLogProgression` gives the SAME file (one id, one name) at successive
// statuses, which is exactly what a self-updating row needs. Never hand-write a
// response body in a test.
import {
  FILE_STATUS_IMPORTED,
  FILE_STATUS_UPLOADED,
  FILE_STATUS_VALIDATING,
  FILE_STATUS_VALIDATION_FAILED,
  fileLogListResponse,
  fileLogProgression,
} from '@/mocks/data/file-log';

import type { APIError } from '@/types/api';
import type { FileLogList } from '@/types/files';

vi.mock('@/lib/api/client', () => ({ get: vi.fn(), post: vi.fn() }));

const mockGet = get as unknown as ReturnType<typeof vi.fn>;

/**
 * How much FAKE time a test is prepared to let pass while waiting for a
 * self-updating row to catch up. Deliberately NOT the implementation's refresh
 * interval: the criterion is that the row keeps itself current on its own within a
 * sensible time, not that it refreshes on any particular schedule.
 */
const REFRESH_WINDOW_MS = 60_000;

/** What the API client throws when a list read comes back a server error. */
const REFRESH_FAILED: APIError = {
  message: 'The file log service is not responding.',
  statusCode: 503,
  endpoint: '/transactions-api/v1/file-logs',
};

/** One scripted answer to a file-logs read: a list body, or a thrown failure. */
type FileLogsReply = FileLogList | APIError;

let fileLogsScript: FileLogsReply[] = [];

const isListBody = (reply: FileLogsReply): reply is FileLogList =>
  'FileLog' in reply;

/**
 * Script the file-logs reads: one reply per read, in order, with the LAST reply
 * repeating for every further read — so a screen that keeps refreshing never falls
 * off the end of the script, and no test has to know (or assert) how many reads
 * happened.
 */
const serveFileLogs = (...replies: FileLogsReply[]): void => {
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

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderList = async (): Promise<void> => {
  render(
    <ToastProvider>
      <SubmittedFilesList />
      <ToastContainer />
    </ToastProvider>,
  );
  await settle();
};

/**
 * The app's in-app notification surface (the root layout's `ToastContainer`), which
 * renders nothing at all while there is nothing to tell the user — so its absence
 * IS "no notification was raised".
 */
const notificationSurface = (): HTMLElement | null =>
  screen.queryByRole('region', { name: /notifications/i });

/**
 * The table row for a named file — scoped by the file's own name rather than by
 * index, so the assertions never depend on the order the service returned. Story
 * 1's helper, narrowed to inside the table because on this story's screen the file
 * name also appears in the notification.
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

describe('Epic expense-file-upload, Story 3: watching a file finish importing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    fileLogsScript = [];
    mockGet.mockImplementation(async (endpoint: string) => {
      const path = String(endpoint);
      if (!path.includes('file-logs')) {
        throw new Error(
          `Unexpected read of "${path}" — keeping the rows current is a re-read of ` +
            'the file-logs list, not a new endpoint and not a per-file call.',
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
      if (!isListBody(reply)) {
        throw reply;
      }
      return reply;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AC-2
  it('notifies with the file name and the record count when a submitted file reaches the imported status', async () => {
    // The SAME file at two successive statuses — one id, one name, one row.
    const [validating, imported] = fileLogProgression([
      FILE_STATUS_VALIDATING,
      FILE_STATUS_IMPORTED,
    ]);
    serveFileLogs(
      fileLogListResponse([validating]),
      fileLogListResponse([imported]),
    );

    await renderList();

    // The file is still working, and the user has been told nothing yet: merely
    // listing a file that is in progress is not something to notify anybody about.
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

    // Both values are the service's own (brief BR5): the imported snapshot's file
    // name and its RecordCount — not a tally of anything the screen can see.
    expect(notification).toHaveTextContent(imported.CurrentFileName);
    expect(notification).toHaveTextContent(imported.RecordCount);

    // ...and the row the notification is about caught up in place.
    const row = rowFor(imported.CurrentFileName);
    expect(within(row).getByText(FILE_STATUS_IMPORTED)).toBeInTheDocument();
    expect(row).toHaveTextContent(imported.RecordCount);
  });

  // AC-3
  it('shows the validation-failed status on the row and raises no notification about the file', async () => {
    const [validating, failed] = fileLogProgression([
      FILE_STATUS_VALIDATING,
      FILE_STATUS_VALIDATION_FAILED,
    ]);
    serveFileLogs(
      fileLogListResponse([validating]),
      fileLogListResponse([failed]),
    );

    await renderList();
    expect(
      within(rowFor(validating.CurrentFileName)).getByText(
        FILE_STATUS_VALIDATING,
      ),
    ).toBeInTheDocument();

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

    // Nothing reports an import: this file did not import, so neither the row nor
    // any notification may say it did.
    //
    // What the user IS told about the rejected rows arrived with
    // `file-validation-and-retry` story 5 (R91), which this epic deliberately left
    // unbuilt — that story's own tests own everything about that notification
    // (that it names the file, that it does not fade, that it leads to the rejected
    // rows, and who is told). This assertion was originally "the notification
    // surface is not rendered at all", which was only ever true for as long as R91
    // was unimplemented; scoped to this story's own criterion, what it pins is that
    // nothing here claims an import.
    expect(notificationSurface()).not.toHaveTextContent(/import/i);
    // The row itself does not describe the file as imported either.
    expect(rowFor(failed.CurrentFileName)).not.toHaveTextContent(
      FILE_STATUS_IMPORTED,
    );
  });

  // AC-5
  it('leaves the last known values on screen when a background refresh fails', async () => {
    const [uploaded, validating] = fileLogProgression([
      FILE_STATUS_UPLOADED,
      FILE_STATUS_VALIDATING,
    ]);
    // The third read and every later one fails, so the failure is unmistakably a
    // BACKGROUND refresh: two reads have already succeeded by then, and the screen
    // is showing real values it must not lose.
    serveFileLogs(
      fileLogListResponse([uploaded]),
      fileLogListResponse([validating]),
      REFRESH_FAILED,
    );

    await renderList();
    expect(
      within(rowFor(uploaded.CurrentFileName)).getByText(FILE_STATUS_UPLOADED),
    ).toBeInTheDocument();

    // The row refreshes itself once — which is what makes the NEXT read, the
    // failing one, certain to happen.
    await waitFor(
      () => {
        expect(
          within(rowFor(validating.CurrentFileName)).getByText(
            FILE_STATUS_VALIDATING,
          ),
        ).toBeInTheDocument();
      },
      { timeout: REFRESH_WINDOW_MS },
    );

    // A whole refresh window now passes with every read failing.
    await settle(REFRESH_WINDOW_MS);

    // The row still shows what the last successful read said — status, most recent
    // processing activity and record count all intact.
    const row = rowFor(validating.CurrentFileName);
    expect(within(row).getByText(FILE_STATUS_VALIDATING)).toBeInTheDocument();
    expect(
      within(row).getByText(validating.LastExecutedActivityName),
    ).toBeInTheDocument();
    expect(row).toHaveTextContent(validating.RecordCount);

    // The screen was not replaced by Story 1's failed-load state — that state
    // belongs to a FIRST read that never succeeded, not to a background refresh.
    expect(
      screen.queryByRole('button', { name: /try again/i }),
    ).not.toBeInTheDocument();
    // ...and the file is still listed rather than blanked out.
    expect(
      within(screen.getByRole('table')).getByText(validating.CurrentFileName),
    ).toBeInTheDocument();
  });
});
