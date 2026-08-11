/**
 * Story Metadata:
 * - Epic: file-validation-and-retry — Story 4: retry validation or cancel the file
 * - Route: /upload/file
 * - Target File: web/src/app/(authenticated)/upload/file/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-2 — which action is offered follows the file's STATUS: retry only while
 *   validation has failed, cancel while the file is awaiting processing or has
 *   failed, neither once it has imported (the page states the file's state instead).
 * - AC-3 — retrying puts the file back into an in-progress status, records a new
 *   processing activity, and the page shows the outcome once it resolves.
 * - AC-4 — the cancel confirmation names the file, says it cannot be undone, opens
 *   with the keep-the-file choice holding focus, and cancels nothing until confirmed.
 * - AC-6 — a refused retry or cancel is reported in the SERVICE's own words and
 *   leaves the file exactly as it was.
 *
 * AC-1 (the server deciding from the session role that an Approver is offered
 * neither action) and AC-5 (a confirmed cancel deactivating the file so its row
 * leaves the Expense files list) are this story's Playwright spec's — deliberately
 * not duplicated here (testing-policy.md § "One tag, one layer"). What IS pinned
 * below is the component half of that gating: told the session may not act on the
 * file, the page renders no retry or cancel control at all — absent, not disabled.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE SURFACE. This story adds the two mutating actions to the submitted-file
 *    page story 1 created. The unit under test is that page's own CLIENT view —
 *    `web/src/components/files/SubmittedFileDetail.tsx`, named export
 *    `SubmittedFileDetail`. Story 1 pins its `logId` prop as the identifier EXACTLY
 *    AS IT ARRIVED IN THE ADDRESS (`string | undefined`, deliberately not narrowed to
 *    a number); this story ADDS ONE PROP to it, so the full shape becomes
 *    `{ logId: string | undefined; actingUploader?: string }`. jsdom cannot render
 *    `page.tsx` itself (an async server component that resolves the session), which is
 *    the same split epic 1 settled on: the server component gates, a presentational
 *    client component is the unit under test. The actions themselves may live in their
 *    own `SubmittedFileActions` component rendered inside it — taking the RESOLVED
 *    file, the way story 3's `FileDownloadActions` takes `file={file}` — but nothing
 *    here asserts that split, only what reaches the user.
 * 2. WHO MAY ACT is decided on the SERVER and travels as one prop.
 *    `page.tsx` passes `actingUploader={hasRole(session, ROLE_IMPORTER) ?
 *    displayNameOf(session) : undefined}` — matching on `ROLE_IMPORTER` from
 *    `@/types/auth` (the auth service's own wire name; "Finance Uploader" recognises
 *    nobody, project.md §Roles). With the prop ABSENT no retry/cancel control is
 *    rendered at all — not disabled, not `aria-disabled`, not greyed-out markup
 *    (source UI-24, the shape `app/(authenticated)/upload/page.tsx` already shows).
 *    That one value doubles as the audit identity the cancel call must send, so the
 *    name the service records can never be anything the user typed.
 * 3. WHICH ACTION APPLIES is decided from the file's own `CurrentStatus`:
 *    retry while `Validation failed`; cancel while `Uploaded` OR `Validation failed`;
 *    neither once `Imported`. (A `Cancelled` file is inactive, so it is absent from
 *    `GET /v1/file-logs?IsActive=Yes` and never resolves at all — that is story 1's
 *    AC-5 "no longer available" page, not an action-gating case, which is why the
 *    imported file is the representative "neither is offered" state below.)
 * 4. THE TWO CALLS, and their documented header asymmetry (epic brief §Notes):
 *    - retry  → `POST   {TRANSACTIONS_API_BASE_PATH}/v1/files/retry-validation?LogId=<id>`
 *               with NO `LastChangedUser` header; the spec declares none, so none is
 *               sent speculatively.
 *    - cancel → `DELETE {TRANSACTIONS_API_BASE_PATH}/v1/files?LogId=<id>` WITH
 *               `LastChangedUser` (the shared client's `lastChangedUser` config /
 *               `del` argument), carrying `actingUploader`.
 *    Both belong in `lib/api/files.ts` alongside `fetchSubmittedFiles`, through the
 *    shared client at the app's own same-origin address. The mock below fails loudly
 *    on any other endpoint, method or parameter name.
 * 5. THE OUTCOME ARRIVES BY RE-READING, on the pattern this project already has
 *    (`SubmittedFilesList`, epic `expense-file-upload` story 3) — do not invent a
 *    second mechanism. Neither call's answer says anything about the file's new state
 *    (both are the generic `DefaultResponse` envelope), so:
 *    - a successful retry is followed by a re-read of the page's OWN calls (the
 *      file-logs list it resolves the file from, `GET /v1/file-process-logs/<id>`, and
 *      the file's validation errors);
 *    - while the file is in an in-progress status (`isFileInProgress`) those same
 *      calls are re-read on ONE interval, and the page catches up in place with
 *      nobody touching it;
 *    - AN ACCEPTED RETRY IS ITSELF A REASON TO KEEP ASKING, whatever the file's status
 *      says at that moment. The list the file is resolved from may not have caught up
 *      when the page looks, and a retry that FAILS AGAIN puts the file back into the
 *      status it already had — so the file need never look in-progress to this page at
 *      all, and a watch that only starts on catching an in-progress status in one
 *      sample would never start. The new attempt's rejected rows and error file still
 *      have to reach the screen (brief FR4, Key Workflow step 5);
 *    - a re-read that FAILS changes nothing on screen: the last known values stay,
 *      the page is not replaced by a failed-load or file-not-available state, and
 *      watching continues (a failed re-read is not a reason to stop);
 *    - once there is nothing left to find out the interval stops.
 *    No test here knows or asserts the interval, or how long an accepted retry is
 *    watched for — any sensible values satisfy them. What IS pinned is that ONE timer
 *    drives every section of the page: each section that has to catch up takes a signal
 *    from whoever owns that timer rather than growing one of its own.
 * 6. THE CANCEL CONFIRMATION is the Shadcn `alert-dialog` (already installed;
 *    do NOT regenerate it from the CLI, which reinstates a raw colour keyword over
 *    its `bg-overlay/60` token). Radix renders it with `role="alertdialog"`. Per the
 *    `UI-09` convention it names the file, says the file and its rows are removed and
 *    cannot be undone, and opens with the way OUT holding focus — which is what
 *    `AlertDialogCancel` gives for free. Labels these tests query by:
 *      trigger  "Cancel file"  ·  confirm  "Cancel the file"  ·  way out  "Keep the file"
 *    Nothing is sent until the confirm choice is taken.
 * 7. A REFUSAL IS THE SERVICE'S OWN WORDING, reported ON THE PAGE:
 *    `serviceMessageOf(e) ?? serviceDetailOf(e) ?? <own wording>`
 *    (`lib/api/errors.ts`, the `uploadFailureMessage` pattern). The transactions
 *    service reports a refusal as a 500 carrying `Messages[]`, which the shared client
 *    keeps on `details` while putting its OWN placeholder on `message` — so
 *    `serviceMessageOf` alone finds nothing and "Internal Server Error: …" would reach
 *    the user (project.md NFR-base-5). A refused cancel CLOSES the confirmation and
 *    reports the refusal on the page beside the actions, rather than trapping the user
 *    in a dialog, and leaves the file with both actions still offered.
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy), plus `next/navigation`, the framework
 * boundary. `lib/api/files.ts`, the toast composition and the Shadcn/Radix dialog are
 * the REAL production code, so what the user meets is asserted as rendered text. Every
 * response body comes from the project-wide `@/mocks/data/*` factories the Playwright
 * layer shares, so the two layers cannot drift onto different shapes.
 *
 * Timers: the re-read is a component-local interval with no browser-level flow of its
 * own — the testing-policy's last-resort fake-timer case, driven exactly as epic
 * `expense-file-upload` story 3 drives it (fake clock only; no real-time sleep; RTL
 * advances the clock while it waits, via the `jest` shim in `vitest.setup.ts`).
 * `userEvent` is given the same clock. No `axe()` runs here — accessibility is the
 * Playwright scan's (AC-6 of story 1).
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, {
  PointerEventsCheckLevel,
} from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the submitted-file page's own client view, which this
// story teaches to retry and cancel. The import fails until it exists (TDD red).
import { SubmittedFileDetail } from '@/components/files/SubmittedFileDetail';
// Real production toast composition (not mocked) — the surface the root layout wraps
// every signed-in screen in, so a refusal reported through it reads as text either way.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { apiClient, del, get, post } from '@/lib/api/client';
import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';
import { displayNameOf } from '@/lib/auth/identity';
// Project-wide factories — the single source both test layers share. `fileLogProgression`
// gives the SAME file (one id, one name) at successive statuses, which is exactly what a
// retry needs. Never hand-write a response body in a test.
import {
  CANCEL_REFUSED_MESSAGE,
  FILE_STATUS_IMPORTED,
  FILE_STATUS_UPLOADED,
  FILE_STATUS_VALIDATING,
  FILE_STATUS_VALIDATION_FAILED,
  RETRY_REFUSED_MESSAGE,
  cancelFailureResponse,
  cancelSuccessResponse,
  fileLogListResponse,
  fileLogProgression,
  fileLogWithStatus,
  retryFailureResponse,
  retrySuccessResponse,
} from '@/mocks/data/file-log';
import {
  FILE_PROCESS_LOG_FAILURE_MESSAGE,
  OUTCOME_VALIDATION_FAILED,
  fileProcessHistory,
  fileProcessHistoryAfterRetry,
  fileProcessHistoryWithRetryRunning,
  fileProcessLogListResponse,
  runningFileProcessLog,
} from '@/mocks/data/file-process-log';
import { userInfoFor } from '@/mocks/data/identity';
// A sibling section of this page (the rejected rows) reads the validation errors on
// mount, and again whenever the page asks its calls again — answered from the shared
// factories, whose per-defect rows are what tell one attempt's rows from another's.
import {
  invalidRowWithNonNumericAmount,
  invalidRowWithUnsupportedCurrency,
  validationErrorsResponse,
} from '@/mocks/data/validation-error';
import { ROLE_IMPORTER } from '@/types/auth';

import type { APIError, APIRequestConfig, DefaultResponse } from '@/types/api';
import type {
  FileLog,
  FileLogList,
  FileProcessLog,
  FileProcessLogList,
  ValidationErrorRow,
  ValidationErrors,
} from '@/types/files';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

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
  usePathname: () => '/upload/file',
  // The address the file page is reached at. The identifier reaches the component as a
  // PROP (contract note 1) — the server page reads it off its own `searchParams` — so
  // this is here only so a client-navigation hook cannot throw, never as the source of
  // the file under test.
  useSearchParams: () => new URLSearchParams({ LogId: '5001' }),
}));

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;
const mockGet = get as unknown as ReturnType<typeof vi.fn>;
const mockPost = post as unknown as ReturnType<typeof vi.fn>;
const mockDel = del as unknown as ReturnType<typeof vi.fn>;

/** The signed-in Finance Uploader, and the audit name the cancel call must carry. */
const IMPORTER = userInfoFor(ROLE_IMPORTER);
const ACTING_UPLOADER = displayNameOf(IMPORTER);

/**
 * The file every test opens — the canonical file's own id, from the factory. Handed to
 * the page as TEXT, because that is how it arrives in the address and how story 1 pins
 * the prop; the calls this story makes must still name the file itself.
 */
const LOG_ID = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED).Id;
const LOG_ID_IN_ADDRESS = String(LOG_ID);

/**
 * How much FAKE time a test is prepared to let pass while waiting for the page to
 * catch up on its own. Deliberately NOT the implementation's interval: the criterion
 * is that the page keeps itself current within a sensible time, not that it re-reads
 * on any particular schedule.
 */
const REFRESH_WINDOW_MS = 60_000;

/**
 * The accessible names of the four controls this story adds. Anchored, so the
 * "Cancel file" trigger and the confirmation's "Cancel the file" choice can never be
 * mistaken for one another.
 */
const RETRY = /^retry validation$/i;
const CANCEL = /^cancel file$/i;
const CONFIRM_CANCEL = /^cancel the file$/i;
const KEEP_FILE = /^keep the file$/i;

/**
 * What the shared client throws when the transactions service REFUSES a call: its own
 * placeholder on `message`, and the service's `Messages[]` — from the shared failure
 * factories — on `details` (`lib/api/client.ts` → 500 branch). That split is the whole
 * point of AC-6: the reason is only reachable through `serviceDetailOf`.
 */
const refusal = (messages: string[], endpoint: string): APIError => ({
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  details: messages,
  endpoint,
});

const REFUSED_RETRY = refusal(
  retryFailureResponse().Messages,
  '/transactions-api/v1/files/retry-validation',
);

const REFUSED_CANCEL = refusal(
  cancelFailureResponse().Messages,
  '/transactions-api/v1/files',
);

/**
 * What the client throws when one of the page's READS comes back a server error.
 * Neither string on it may reach the screen when it happens to a background re-read.
 */
const READ_FAILED = refusal(
  [FILE_PROCESS_LOG_FAILURE_MESSAGE],
  '/transactions-api/v1/file-logs',
);

/** One scripted answer to a call: the body the service sends, or the failure it throws. */
type Scripted<T> = { readonly body: T } | { readonly failure: APIError };

/** The three reads this page makes, as the scripting below names them. */
type PageRead = 'files' | 'history' | 'rejectedRows';

/**
 * How many more times each read must FAIL before it answers as scripted again.
 *
 * This is how a test refuses one read without depending on WHEN that read happens: a
 * re-read the page makes as soon as a retry is accepted lands on a failure whether it
 * arrives immediately or a moment later, so what the test pins is the page's behaviour
 * rather than the order two microtasks happened to run in.
 */
let readFailuresOwed: Record<PageRead, number>;

let fileLogsScript: Scripted<FileLogList> = { body: fileLogListResponse([]) };
let historyScript: Scripted<FileProcessLogList> = {
  body: fileProcessLogListResponse([]),
};
let rejectedRowsScript: Scripted<ValidationErrors> = {
  body: validationErrorsResponse([]),
};
let retryScript: Scripted<DefaultResponse> = { body: retrySuccessResponse() };
let cancelScript: Scripted<DefaultResponse> = { body: cancelSuccessResponse() };

/**
 * Answers whatever is currently scripted — so a test changes what the SERVICE says
 * and then watches the page catch up, without anyone having to know how many reads
 * happened in between.
 */
const deliver = async <T,>(scripted: Scripted<T>): Promise<T> => {
  if ('failure' in scripted) {
    throw scripted.failure;
  }
  return scripted.body;
};

/** One of the page's reads: refused while it still owes a failure, else as scripted. */
const deliverRead = async <T,>(
  read: PageRead,
  scripted: Scripted<T>,
): Promise<T> => {
  if (readFailuresOwed[read] > 0) {
    readFailuresOwed = {
      ...readFailuresOwed,
      [read]: readFailuresOwed[read] - 1,
    };
    throw READ_FAILED;
  }
  return deliver(scripted);
};

/** What the file-logs read (the page's way of resolving the file) answers from now on. */
const serveFile = (file: FileLog): void => {
  fileLogsScript = { body: fileLogListResponse([file]) };
};

/** What the processing-history read answers from now on. */
const serveHistory = (activities: FileProcessLog[]): void => {
  historyScript = { body: fileProcessLogListResponse(activities) };
};

/** Which rejected rows the file's validation-errors read answers with from now on. */
const serveRejectedRows = (rows: ValidationErrorRow[]): void => {
  rejectedRowsScript = { body: validationErrorsResponse(rows) };
};

/** Every read the page makes now fails — the background-refresh-failed case. */
const refuseReads = (): void => {
  fileLogsScript = { failure: READ_FAILED };
  historyScript = { failure: READ_FAILED };
  rejectedRowsScript = { failure: READ_FAILED };
};

/**
 * The NEXT read of each of the page's calls fails, and every read after that answers
 * whatever is scripted by then.
 *
 * That is what pins a page that does not decide on ONE sample: its immediate re-read
 * after a retry lands on a failure, so only a LATER read can bring the new attempt's
 * rows to the screen.
 */
const refuseTheNextReadOfEverything = (): void => {
  readFailuresOwed = { files: 1, history: 1, rejectedRows: 1 };
};

/** One recorded mutating call: which file it named, and who it was attributed to. */
interface RecordedCall {
  logId: string | null;
  lastChangedUser?: string;
}

let retryRequests: RecordedCall[] = [];
let cancelRequests: RecordedCall[] = [];

/** A query-parameter value the request actually carried, as text. */
const scalarOf = (value: unknown): string | null =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : null;

/**
 * The `LogId` a call named, whether it travelled as a client `params` entry or
 * already spelled into the endpoint's query string.
 */
const logIdIn = (
  endpoint: string,
  config?: APIRequestConfig,
): string | null => {
  const fromParams = scalarOf(config?.params?.LogId);
  if (fromParams !== null) {
    return fromParams;
  }
  const [, query = ''] = endpoint.split('?');
  return new URLSearchParams(query).get('LogId');
};

/** Where the user was sent, if anywhere — read from both router methods. */
const navigationTargets = (): string[] =>
  [...mockReplace.mock.calls, ...mockPush.mock.calls]
    .map((args) => args[0])
    .filter((target): target is string => typeof target === 'string');

/**
 * The transactions service, as this page addresses it. Every endpoint this story is
 * allowed to touch is answered from a shared factory; anything else fails loudly,
 * because a new endpoint or a renamed parameter is exactly the drift these tests exist
 * to catch.
 */
const route = async (
  endpoint: string,
  method: string,
  config?: APIRequestConfig,
): Promise<unknown> => {
  const path = String(endpoint);
  const verb = method.toUpperCase();

  if (verb === 'DELETE' && /\/v1\/files(\?|$)/.test(path)) {
    cancelRequests.push({
      logId: logIdIn(path, config),
      lastChangedUser: config?.lastChangedUser,
    });
    return deliver(cancelScript);
  }
  if (path.includes('/v1/files/retry-validation')) {
    retryRequests.push({
      logId: logIdIn(path, config),
      lastChangedUser: config?.lastChangedUser,
    });
    return deliver(retryScript);
  }
  if (path.includes('/v1/files/validation-errors')) {
    // The rejected-rows section of this page reads this on mount, and again whenever
    // the page asks its calls again. It is another story's surface — answered with no
    // rows by default so it renders its own empty state harmlessly — but WHICH
    // attempt's rows are on screen after a retry is this story's business (AC-3).
    return deliverRead('rejectedRows', rejectedRowsScript);
  }
  if (path.includes('/v1/file-process-logs')) {
    return deliverRead('history', historyScript);
  }
  if (path.includes('/v1/file-logs')) {
    return deliverRead('files', fileLogsScript);
  }

  throw new Error(
    `Unexpected ${verb} ${path}. This page reads the file-logs list, the file's ` +
      'process logs and its validation errors, and mutates through ' +
      'POST /v1/files/retry-validation?LogId= and DELETE /v1/files?LogId= only ' +
      '(see the implementation contract above).',
  );
};

/** Advance the fake clock inside `act`, so timer-driven renders are flushed first. */
const settle = async (ms = 0): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const setupUser = () =>
  userEvent.setup({
    advanceTimers: (delay: number) => {
      vi.advanceTimersByTime(delay);
    },
    // Radix puts `pointer-events: none` on the body while a modal is open; jsdom then
    // reports the dialog's own controls as un-clickable even though a real browser
    // lets them through.
    pointerEventsCheck: PointerEventsCheckLevel.Never,
  });

/** The page as `page.tsx` mounts it: inside the root layout's toast composition. */
const renderFilePage = async (actingUploader?: string): Promise<() => void> => {
  const { unmount } = render(
    <ToastProvider>
      <SubmittedFileDetail
        logId={LOG_ID_IN_ADDRESS}
        actingUploader={actingUploader}
      />
      <ToastContainer />
    </ToastProvider>,
  );
  await settle();
  return unmount;
};

/**
 * Opens the page on a file in a given state and waits until that file has actually
 * resolved — anchored on the setting it was submitted against, a value only the file's
 * own summary carries. Without that anchor an "action not offered" assertion would
 * pass on a page that is merely still loading.
 */
const openFile = async (
  file: FileLog,
  actingUploader?: string,
): Promise<() => void> => {
  serveFile(file);
  const unmount = await renderFilePage(actingUploader);
  await screen.findByText(file.SettingName, {}, { timeout: REFRESH_WINDOW_MS });
  return unmount;
};

/**
 * Whether a control is offered at all — queried including hidden elements and paired
 * with a sweep of the rendered wording below, so a greyed-out or `aria-hidden`
 * stand-in fails just as a visible one would (source UI-24).
 */
const offeredControl = (name: RegExp): HTMLElement | null =>
  screen.queryByRole('button', { name, hidden: true });

/**
 * The value a rejected row was rejected FOR, as it appears in its cell — read off the
 * fixture rather than restated, so this file states no expense value of its own.
 *
 * Refused loudly if the factory stops carrying it: an absent value would make an
 * "these rows are the new attempt's" assertion pass against an empty screen.
 */
const rejectedValue = (
  value: string | number | undefined,
  what: string,
): string => {
  if (value === undefined || value === '') {
    throw new Error(
      `The rejected-row fixture carries no ${what}, which this test identifies the ` +
        'row by — see invalidRowWithDefectOn in @/mocks/data/validation-error.',
    );
  }
  return String(value);
};

describe('Epic file-validation-and-retry, Story 4: retrying validation or cancelling the file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    fileLogsScript = { body: fileLogListResponse([]) };
    historyScript = { body: fileProcessLogListResponse(fileProcessHistory()) };
    rejectedRowsScript = { body: validationErrorsResponse([]) };
    readFailuresOwed = { files: 0, history: 0, rejectedRows: 0 };
    retryScript = { body: retrySuccessResponse() };
    cancelScript = { body: cancelSuccessResponse() };
    retryRequests = [];
    cancelRequests = [];

    mockGet.mockImplementation(
      (endpoint: string, params?: APIRequestConfig['params']) =>
        route(endpoint, 'GET', { params }),
    );
    mockApiClient.mockImplementation(
      (endpoint: string, config?: APIRequestConfig) =>
        route(endpoint, config?.method ?? 'GET', config),
    );
    mockPost.mockImplementation(
      (endpoint: string, body: unknown, lastChangedUser?: string) =>
        route(endpoint, 'POST', {
          body: JSON.stringify(body),
          lastChangedUser,
        }),
    );
    mockDel.mockImplementation((endpoint: string, lastChangedUser?: string) =>
      route(endpoint, 'DELETE', { lastChangedUser }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AC-2
  it('offers retry only while validation has failed, cancel while the file is still unimported, and neither once it has imported', async () => {
    // A file whose validation failed: both actions apply.
    const closeFailed = await openFile(
      fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED),
      ACTING_UPLOADER,
    );
    expect(screen.getByRole('button', { name: RETRY })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CANCEL })).toBeInTheDocument();
    closeFailed();

    // A file still awaiting processing: there is no failed validation to retry, but it
    // has not imported either, so it can still be cancelled.
    const closeUploaded = await openFile(
      fileLogWithStatus(FILE_STATUS_UPLOADED),
      ACTING_UPLOADER,
    );
    expect(screen.getByRole('button', { name: CANCEL })).toBeInTheDocument();
    expect(offeredControl(RETRY)).not.toBeInTheDocument();
    expect(screen.queryAllByText(/retry validation/i)).toEqual([]);
    closeUploaded();

    // A file that has imported: neither action applies any more, and the page says
    // where the file stands instead of offering something that cannot be done.
    const closeImported = await openFile(
      fileLogWithStatus(FILE_STATUS_IMPORTED),
      ACTING_UPLOADER,
    );
    expect(screen.getByText(FILE_STATUS_IMPORTED)).toBeInTheDocument();
    expect(offeredControl(RETRY)).not.toBeInTheDocument();
    expect(offeredControl(CANCEL)).not.toBeInTheDocument();
    expect(screen.queryAllByText(/retry validation/i)).toEqual([]);
    expect(screen.queryAllByText(/cancel file/i)).toEqual([]);
    closeImported();

    // And a session that may not act on the file — no acting uploader was decided for
    // it on the server — is offered neither action on a file that otherwise qualifies.
    // The markup carries nothing at all: not a disabled control, not a greyed-out one
    // (source UI-24). That the ROLE is what decides this is AC-1's, in Playwright.
    const closeReadOnly = await openFile(
      fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED),
    );
    expect(offeredControl(RETRY)).not.toBeInTheDocument();
    expect(offeredControl(CANCEL)).not.toBeInTheDocument();
    expect(screen.queryAllByText(/retry validation/i)).toEqual([]);
    expect(screen.queryAllByText(/cancel file/i)).toEqual([]);
    closeReadOnly();
  });

  // AC-3
  it('puts the file back into an in-progress status with a new processing activity when validation is retried, and shows the outcome once it resolves', async () => {
    // The SAME file at three successive statuses — one id, one name, one page.
    const [failed, validating, imported] = fileLogProgression([
      FILE_STATUS_VALIDATION_FAILED,
      FILE_STATUS_VALIDATING,
      FILE_STATUS_IMPORTED,
    ]);
    // The new attempt: an activity with a start time but — while it is still in
    // flight — no outcome and no end time at all (both keys absent, which is what the
    // contract expresses and what the page has to survive).
    const newAttempt = runningFileProcessLog();
    const resolvedHistory = fileProcessHistoryAfterRetry();
    const [, , resolvedAttempt] = resolvedHistory;
    const resolvedAt = resolvedAttempt.EndDate;
    if (resolvedAt === undefined) {
      throw new Error(
        'The fixture for a RESOLVED retry must carry an end time — check ' +
          'fileProcessHistoryAfterRetry in @/mocks/data/file-process-log.',
      );
    }

    const user = setupUser();
    serveHistory(fileProcessHistory());
    const close = await openFile(failed, ACTING_UPLOADER);

    // Nothing has been attempted again yet: the file's history holds only the two
    // activities it already had.
    expect(screen.queryByText(newAttempt.StartDate)).not.toBeInTheDocument();

    // From here the service reports the file as working again, with a third activity
    // that has not resolved.
    serveFile(validating);
    serveHistory(fileProcessHistoryWithRetryRunning());

    await user.click(screen.getByRole('button', { name: RETRY }));

    // The retry named this file, and carried NO audit header — the spec declares none
    // for this call, and none is invented (epic brief §Notes & Caveats).
    await waitFor(() => {
      expect(retryRequests).toEqual([
        { logId: String(LOG_ID), lastChangedUser: undefined },
      ]);
    });

    // The file is back in an in-progress status...
    expect(
      await screen.findByText(
        FILE_STATUS_VALIDATING,
        {},
        { timeout: REFRESH_WINDOW_MS },
      ),
    ).toBeInTheDocument();
    // ...and the new attempt is recorded, still running: it has a start time, and the
    // outcome it will eventually carry is not on the page yet.
    expect(
      await screen.findByText(
        newAttempt.StartDate,
        {},
        { timeout: REFRESH_WINDOW_MS },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(resolvedAt)).not.toBeInTheDocument();

    // A re-read that FAILS while the page is watching changes nothing: the last known
    // values stay put, and neither the service's failure nor the client's own
    // placeholder is put in their place.
    refuseReads();
    await settle(REFRESH_WINDOW_MS);
    expect(screen.getByText(FILE_STATUS_VALIDATING)).toBeInTheDocument();
    expect(screen.getByText(newAttempt.StartDate)).toBeInTheDocument();
    expect(
      screen.queryByText(FILE_PROCESS_LOG_FAILURE_MESSAGE),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(CLIENT_FALLBACK_MESSAGES.serverError),
    ).not.toBeInTheDocument();

    // The service now reports the retry resolved and the file imported. The page says
    // so on its own — nobody has touched it since the retry.
    serveFile(imported);
    serveHistory(resolvedHistory);
    expect(
      await screen.findByText(
        FILE_STATUS_IMPORTED,
        {},
        { timeout: REFRESH_WINDOW_MS },
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(resolvedAt, {}, { timeout: REFRESH_WINDOW_MS }),
    ).toBeInTheDocument();

    close();
  });

  // AC-3 — the criterion's OTHER outcome: the retry fails again. The service reports the
  // file with the status it already had, so nothing about the file changes on screen and
  // this page never sees it look busy; the new attempt's rejected rows and error file
  // must reach the screen anyway (brief FR4, and Key Workflows step 5 — "if it fails
  // again, the invalid-row list and error file are refreshed for the new attempt").
  it("shows the new attempt's rejected rows when a retried validation fails again, even though the file's status never changes", async () => {
    // One file, one status, throughout: `Validation failed` before the retry and
    // `Validation failed` after it.
    const failed = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED);

    // Two attempts' worth of rejected rows, told apart by the very value each row was
    // rejected for — the amount that is not a number on the first attempt, the currency
    // the service does not accept on the second. Both come from the shared factory, so
    // nothing here restates a value or a sentence the screen writes for itself.
    const firstAttemptRow = invalidRowWithNonNumericAmount();
    const newAttemptRow = invalidRowWithUnsupportedCurrency();
    const firstAttemptValue = rejectedValue(firstAttemptRow.Amount, 'amount');
    const newAttemptValue = rejectedValue(newAttemptRow.Currency, 'currency');

    // The new attempt as the history records it once it has resolved — failed again.
    // Its end time belongs to that attempt alone, so it is how "the history caught up"
    // is told from "the history it already had".
    const historyAfterFailingAgain = fileProcessHistoryAfterRetry(
      OUTCOME_VALIDATION_FAILED,
    );
    const [, , newAttempt] = historyAfterFailingAgain;
    const newAttemptResolvedAt = newAttempt.EndDate;
    if (newAttemptResolvedAt === undefined) {
      throw new Error(
        'The fixture for a RESOLVED retry must carry an end time — check ' +
          'fileProcessHistoryAfterRetry in @/mocks/data/file-process-log.',
      );
    }

    const user = setupUser();
    serveHistory(fileProcessHistory());
    serveRejectedRows([firstAttemptRow]);
    const close = await openFile(failed, ACTING_UPLOADER);

    // What the user is looking at when they retry: the first attempt's rejected rows.
    expect(
      await screen.findByText(
        firstAttemptValue,
        {},
        { timeout: REFRESH_WINDOW_MS },
      ),
    ).toBeInTheDocument();

    // From here the service has the new attempt: recorded, resolved, and failed a second
    // time — with the file in the SAME status it was in before, which is the only thing
    // about the file that a page watching its status would have to go on.
    serveFile(failed);
    serveHistory(historyAfterFailingAgain);
    serveRejectedRows([newAttemptRow]);
    // But the page's own immediate re-read after the retry is REFUSED, whenever it
    // lands. So one re-read cannot be what brings the new attempt to the screen: the
    // page has to ask again after a read that told it nothing.
    refuseTheNextReadOfEverything();

    await user.click(screen.getByRole('button', { name: RETRY }));

    await waitFor(() => {
      expect(retryRequests).toEqual([
        { logId: String(LOG_ID), lastChangedUser: undefined },
      ]);
    });
    // That failed re-read changed nothing: the rows stayed, and neither the service's
    // failure nor the client's own placeholder was put in their place.
    expect(screen.getByText(firstAttemptValue)).toBeInTheDocument();
    expect(
      screen.queryByText(FILE_PROCESS_LOG_FAILURE_MESSAGE),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(CLIENT_FALLBACK_MESSAGES.serverError),
    ).not.toBeInTheDocument();

    // Nobody touches the page. It catches up on its own, and what it shows is the NEW
    // attempt's rejected rows...
    expect(
      await screen.findByText(
        newAttemptValue,
        {},
        { timeout: REFRESH_WINDOW_MS },
      ),
    ).toBeInTheDocument();
    // ...instead of the previous attempt's, which are gone rather than sitting there
    // describing a file the user has already corrected and resubmitted.
    expect(screen.queryByText(firstAttemptValue)).not.toBeInTheDocument();
    // The history caught up on the same signal: the new attempt is recorded, with the
    // time it finished.
    expect(
      await screen.findByText(
        newAttemptResolvedAt,
        {},
        { timeout: REFRESH_WINDOW_MS },
      ),
    ).toBeInTheDocument();
    // And the file is still a failed one, so the uploader can correct it and retry
    // again, or cancel it (Key Workflows step 5).
    expect(screen.getByRole('button', { name: RETRY })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CANCEL })).toBeInTheDocument();
    // Every refusal was actually handed out, so the reads above really were a second
    // round of asking rather than one lucky sample.
    expect(readFailuresOwed).toEqual({
      files: 0,
      history: 0,
      rejectedRows: 0,
    });

    close();
  });

  // AC-4
  it('asks for confirmation before cancelling, naming the file and warning it cannot be undone, and cancels nothing unless it is confirmed', async () => {
    const failed = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED);
    const user = setupUser();
    serveHistory(fileProcessHistory());
    const close = await openFile(failed, ACTING_UPLOADER);

    await user.click(screen.getByRole('button', { name: CANCEL }));

    const confirmation = await screen.findByRole('alertdialog');
    // It names the file being acted on, says what happens to it and its rows, and says
    // it cannot be undone (the `UI-09` convention).
    expect(confirmation).toHaveTextContent(failed.CurrentFileName);
    expect(confirmation).toHaveTextContent(/rows/i);
    expect(confirmation).toHaveTextContent(
      /cannot be undone|cannot be recovered/i,
    );
    // The way out holds focus, so confirming is never what a stray Enter does.
    const keepTheFile = within(confirmation).getByRole('button', {
      name: KEEP_FILE,
    });
    await waitFor(() => {
      expect(keepTheFile).toHaveFocus();
    });

    // Backing out cancels nothing at all...
    await user.click(keepTheFile);
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(cancelRequests).toEqual([]);
    // ...and leaves the file exactly where it was, both actions still on offer.
    expect(screen.getByRole('button', { name: RETRY })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CANCEL })).toBeInTheDocument();

    // Only confirming cancels it — and the call names this file and is attributed to
    // the signed-in uploader, which the service requires on this call alone.
    await user.click(screen.getByRole('button', { name: CANCEL }));
    const reopened = await screen.findByRole('alertdialog');
    await user.click(
      within(reopened).getByRole('button', { name: CONFIRM_CANCEL }),
    );

    await waitFor(() => {
      expect(cancelRequests).toEqual([
        { logId: String(LOG_ID), lastChangedUser: ACTING_UPLOADER },
      ]);
    });

    close();
  });

  // AC-6
  it("reports a refused retry or cancel in the service's own words and leaves the file exactly as it was", async () => {
    const failed = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED);
    const newAttempt = runningFileProcessLog();
    const user = setupUser();
    serveHistory(fileProcessHistory());
    retryScript = { failure: REFUSED_RETRY };
    cancelScript = { failure: REFUSED_CANCEL };
    const close = await openFile(failed, ACTING_UPLOADER);

    await user.click(screen.getByRole('button', { name: RETRY }));

    // The retry was genuinely attempted, and the service's own reason reached the
    // user — it travels on `details` for a 500, where `serviceMessageOf` alone finds
    // nothing (`lib/api/errors.ts`).
    await waitFor(() => {
      expect(retryRequests).toEqual([
        { logId: String(LOG_ID), lastChangedUser: undefined },
      ]);
    });
    expect(await screen.findByText(RETRY_REFUSED_MESSAGE)).toBeInTheDocument();
    // The client's internal placeholder is never what the user reads.
    expect(
      screen.queryByText(CLIENT_FALLBACK_MESSAGES.serverError),
    ).not.toBeInTheDocument();
    // The file is untouched: no new attempt was recorded, and both actions are still
    // offered. (Its status is asserted through the offer rather than by its own words,
    // because a failed file's history records the same words as its outcome — the page
    // legitimately says "Validation failed" in two places.)
    expect(screen.queryByText(newAttempt.StartDate)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: RETRY })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CANCEL })).toBeInTheDocument();

    // A refused cancel reads the same way, and does not strand the user in the
    // confirmation either.
    await user.click(screen.getByRole('button', { name: CANCEL }));
    const confirmation = await screen.findByRole('alertdialog');
    await user.click(
      within(confirmation).getByRole('button', { name: CONFIRM_CANCEL }),
    );

    await waitFor(() => {
      expect(cancelRequests).toEqual([
        { logId: String(LOG_ID), lastChangedUser: ACTING_UPLOADER },
      ]);
    });
    expect(await screen.findByText(CANCEL_REFUSED_MESSAGE)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    // The file was not deactivated, so it is still here with both actions — and the
    // user was not returned to the Expense files list as a successful cancel returns
    // them.
    expect(screen.getByRole('button', { name: RETRY })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CANCEL })).toBeInTheDocument();
    expect(navigationTargets()).toEqual([]);

    close();
  });
});
