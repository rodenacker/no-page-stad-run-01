/**
 * Story Metadata:
 * - Epic: expense-file-upload — Story 1: the submitted expense files list
 * - Route: /upload
 * - Target File: web/src/app/(authenticated)/upload/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`: AC-1 (every submitted file listed with the
 * columns the brief's data model names), AC-2 (each status carried by a readable
 * text label, never colour alone), AC-3 (loading placeholder / empty message /
 * failure with a working Try again) and AC-4 (a value the app does not recognise
 * is shown exactly as the service sent it).
 *
 * AC-5 (both roles are offered the entry point and see the list) and AC-6 (a
 * signed-out visit lands on sign-in) are the Playwright spec's — deliberately not
 * duplicated here (testing-policy.md § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. `web/src/app/(authenticated)/upload/page.tsx` keeps its existing
 *    `requireSession()` / `canAccess()` server-side check exactly as it is (its
 *    own header comment says so) and replaces the `notFound()` with the real
 *    screen. Do NOT add a second gate.
 * 2. The list itself is a **client** component,
 *    `web/src/components/files/SubmittedFilesList.tsx`, named export
 *    `SubmittedFilesList`, with no required props. It must be a client component
 *    that reads the list from the BROWSER, because that is the boundary this
 *    story's Playwright spec intercepts (`page.route()` cannot see a server-side
 *    fetch), and because the loading / empty / failure states are its own state.
 * 3. It reads the list through `get` from `@/lib/api/client` (never `fetch()` —
 *    CLAUDE.md §2) at `${TRANSACTIONS_API_BASE_PATH}/v1/file-logs` with
 *    `IsActive: 'Yes'` as a query parameter — the app's own address, forwarded by
 *    the existing `app/transactions-api/[...path]` proxy. Never a direct service
 *    URL. The response body is `FileLogList` — `{ FileLog: FileLog[] }`, the
 *    singular property holding the array (`@/types/files`).
 * 4. It renders a table with one row per `FileLog` carrying `CurrentFileName`,
 *    `SettingName`, `ProcessDate`, `CurrentStatus`, `LastExecutedActivityName`
 *    and `RecordCount`, each **exactly as the service returned it** (brief BR5) —
 *    `RecordCount` and `ProcessDate` are strings on the wire and are displayed,
 *    not reformatted, recomputed or blanked.
 * 5. The three non-data states, as the assertions below query them:
 *    - loading  → an element with `role="status"` whose text says it is loading
 *      (a Shadcn `skeleton` is fine, but the busy state must be announceable —
 *      this project's bar is WCAG 2.2 AA), and no file rows yet;
 *    - empty    → the wording "No files have been submitted yet." and no alert;
 *    - failure  → a `role="alert"` carrying the SERVICE's own message
 *      (`serviceMessageOf` from `@/lib/api/errors.ts`, falling back to the
 *      screen's own plain wording when only a client placeholder came back) plus
 *      a "Try again" button that re-requests the list.
 * 6. Status is a labelled chip: the status TEXT plus an intent colour from the
 *    `--info` / `--warning` / `--success` / muted tokens in `globals.css` — no hex
 *    literal, colour keyword or Tailwind palette utility. jsdom cannot judge
 *    colour, so these tests pin only the readable label; the colour pairing is
 *    the manual checklist's and the Playwright axe scan's.
 * 7. The screen renders inside the root layout's existing `ToastProvider` +
 *    `ToastContainer` composition (the same arrangement the `(authenticated)`
 *    layout tests use), which Story 3's import notification relies on.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy). The toast infrastructure is the real
 * production code, and the file bodies come from the project-wide factory in
 * `@/mocks/data/file-log`, shared with the Playwright layer, so the two layers
 * cannot drift onto different response shapes.
 *
 * These tests WILL FAIL until the story is implemented (TDD red) — `/upload` is
 * still a `notFound()` placeholder and the component below does not exist yet.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — these imports fail until implemented (TDD red).
import { SubmittedFilesList } from '@/components/files/SubmittedFilesList';

// Real production toast composition (not mocked) — the same one the root layout
// wraps every signed-in screen in.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';

// Project-wide FileLog factory: the single source of truth for the wire shape and
// its canonical values, shared with the Playwright layer. Never hand-write a
// response body in a test.
import {
  FILE_STATUS_UPLOADED,
  createFileLog,
  fileLogListResponse,
  fileLogWithStatus,
  fileLogWithUnrecognisedStatus,
  fileLogsInEveryStatus,
  isKnownFileStatus,
} from '@/mocks/data/file-log';

import type { APIError } from '@/types/api';
import type { FileLog, FileLogList } from '@/types/files';

vi.mock('@/lib/api/client', () => ({ get: vi.fn(), post: vi.fn() }));

const mockGet = get as unknown as ReturnType<typeof vi.fn>;

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderList = () =>
  render(
    <ToastProvider>
      <SubmittedFilesList />
      <ToastContainer />
    </ToastProvider>,
  );

/**
 * The table row for a named file. Scoped by the file's own name rather than by
 * index, so the assertions never depend on the order the service returned.
 */
const rowFor = (fileName: string): HTMLElement => {
  const row = screen.getByText(fileName).closest('tr');
  if (row === null) {
    throw new Error(
      `No table row found for "${fileName}" — the submitted files list must ` +
        `render one table row per file (see the implementation contract above).`,
    );
  }
  return row;
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

/** A promise the test resolves itself, so the in-flight state is observable. */
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** A failure carrying the service's OWN wording, which the user must be shown. */
const SERVICE_UNAVAILABLE: APIError = {
  message: 'The file log service is not responding.',
  statusCode: 503,
  endpoint: '/transactions-api/v1/file-logs',
};

describe('Epic expense-file-upload, Story 1: the submitted expense files list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-1
  // Data-contract: that the request really carries `IsActive=Yes` through the
  // app's own proxy to the transactions service is verified in the browser (this
  // story's Playwright spec) and on the manual checklist.
  it('lists every submitted file the service returned, with each file’s own name, setting, process date, most recent activity and record count', async () => {
    const logs: FileLog[] = fileLogsInEveryStatus();
    mockGet.mockResolvedValue(fileLogListResponse(logs));

    renderList();

    // One row per file, plus the header row — pinned to the fixture size so an
    // empty or truncated render cannot pass.
    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(logs.length + 1);
    });

    logs.forEach((log) => {
      const row = rowFor(log.CurrentFileName);
      // Every value scoped to its own row, exactly as the service sent it (BR5).
      // The status label itself is AC-2's, below.
      expect(within(row).getByText(log.SettingName)).toBeInTheDocument();
      expect(within(row).getByText(log.ProcessDate)).toBeInTheDocument();
      expect(
        within(row).getByText(log.LastExecutedActivityName),
      ).toBeInTheDocument();
      expect(within(row).getByText(log.RecordCount)).toBeInTheDocument();
    });
  });

  // AC-2
  // Runtime-only: the intent colour paired with each label (and its legibility in
  // dark mode) is judged by eye on the manual checklist — jsdom cannot see colour.
  // What is pinned here is that the status is readable as TEXT, so it is never
  // conveyed by colour alone, for all five values the brief lists.
  it('shows each file’s status as a readable text label, for every status value the brief lists', async () => {
    const logs: FileLog[] = fileLogsInEveryStatus();
    // Fixture precondition: these are the recognised statuses, so the assertion
    // below really does cover the brief's full set rather than one value.
    expect(logs.every((log) => isKnownFileStatus(log.CurrentStatus))).toBe(
      true,
    );
    mockGet.mockResolvedValue(fileLogListResponse(logs));

    renderList();

    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(logs.length + 1);
    });

    logs.forEach((log) => {
      const row = rowFor(log.CurrentFileName);
      expect(within(row).getByText(log.CurrentStatus)).toBeInTheDocument();
    });
  });

  // AC-3
  it('shows a loading placeholder, says no files have been submitted yet when the list is empty, and re-requests the list from Try again after a failure', async () => {
    const user = userEvent.setup();
    const imported = createFileLog();

    // --- while the list is in flight -------------------------------------
    const inFlight = createDeferred<FileLogList>();
    mockGet.mockReturnValue(inFlight.promise);

    const loadingView = renderList();

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    expect(
      screen.queryByText(imported.CurrentFileName),
    ).not.toBeInTheDocument();

    inFlight.resolve(fileLogListResponse([imported]));

    expect(
      await screen.findByText(imported.CurrentFileName),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    loadingView.unmount();

    // --- nothing submitted yet -------------------------------------------
    mockGet.mockReset();
    mockGet.mockResolvedValue(fileLogListResponse([]));

    const emptyView = renderList();

    expect(
      await screen.findByText(/no files have been submitted yet/i),
    ).toBeInTheDocument();
    // An empty list is not a failure, so nothing is reported as one.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    emptyView.unmount();

    // --- the list could not be loaded, then Try again ---------------------
    mockGet.mockReset();
    mockGet
      .mockRejectedValueOnce(SERVICE_UNAVAILABLE)
      .mockResolvedValueOnce(fileLogListResponse([imported]));

    renderList();

    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent(SERVICE_UNAVAILABLE.message);

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(
      await screen.findByText(imported.CurrentFileName),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // AC-4
  it('shows a status, activity and record count it does not recognise exactly as the service sent them, alongside the files it does recognise', async () => {
    const unrecognised = fileLogWithUnrecognisedStatus();
    const recognised = fileLogWithStatus(FILE_STATUS_UPLOADED, {
      Id: 5002,
      CurrentFileName: 'expenses_2026-04-16.csv',
    });
    // Fixture precondition: the app genuinely has no name for this status, so the
    // assertions below prove pass-through rather than a lucky match (BR5).
    expect(isKnownFileStatus(unrecognised.CurrentStatus)).toBe(false);
    mockGet.mockResolvedValue(fileLogListResponse([recognised, unrecognised]));

    renderList();

    const unrecognisedRow = await waitFor(() =>
      rowFor(unrecognised.CurrentFileName),
    );

    // Verbatim: not blanked, not translated to a known status, not defaulted.
    expect(
      within(unrecognisedRow).getByText(unrecognised.CurrentStatus),
    ).toBeInTheDocument();
    expect(
      within(unrecognisedRow).getByText(unrecognised.LastExecutedActivityName),
    ).toBeInTheDocument();
    expect(
      within(unrecognisedRow).getByText(unrecognised.RecordCount),
    ).toBeInTheDocument();

    // Nor treated as an error, and the recognised file is unaffected.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      within(rowFor(recognised.CurrentFileName)).getByText(
        recognised.CurrentStatus,
      ),
    ).toBeInTheDocument();
  });
});
