/**
 * Story Metadata:
 * - Epic: file-validation-and-retry — Story 1: open a submitted file and see its
 *   processing history
 * - Route: /upload/file (reached as `/upload/file?LogId=<id>` from a file's row)
 * - Target File: web/src/app/(authenticated)/upload/file/page.tsx
 * - Page Action: create_new
 * - Requirements: FR8, BR4
 *
 * Covers the criteria tagged `vitest`:
 * - AC-3 — the processing history lists every recorded activity for the file with
 *   the outcome recorded for it and the times it started and finished;
 * - AC-4 — the wait is ANNOUNCED rather than merely drawn, a file with no
 *   recorded activity says so plainly, and a failed read shows the SERVICE's own
 *   wording with one action that asks for it again;
 * - AC-5 — an identifier that is no longer in the active list (a cancelled file)
 *   or that matches nothing at all explains that the file is not available and
 *   offers the way back to the Expense files list, rather than a blank page or an
 *   error screen.
 *
 * AC-1 (opening a file from its row and reading every value the service reported),
 * AC-2 (both roles may open the page, any other account is refused in place) and
 * AC-6 (the real-browser accessibility scan and the keyboard walk) belong to this
 * story's Playwright spec — deliberately not duplicated here (testing-policy.md
 * § "One tag, one layer"). The epic's cross-story gating invariants live in
 * `epic-file-validation-and-retry-baseline.test.tsx`, not here.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. `app/(authenticated)/upload/file/page.tsx` is a SERVER component: it resolves
 *    the session with `requireSession()`, checks `canAccess()` for its own address
 *    and returns `<PermissionDeniedMessage deniedPath={…} />` before rendering
 *    anything else — the one gating mechanism, registered in
 *    `lib/auth/access-map.ts` and nowhere else (the baseline file pins that
 *    registration). It reads `LogId` off its `searchParams` and hands it down.
 *    jsdom cannot render an async server component, so the two CLIENT components
 *    it composes are the units under test here:
 *
 *      a. `@/components/files/SubmittedFileDetail` — named export, props
 *         `{ logId: string | undefined }`: the identifier EXACTLY AS IT ARRIVED IN
 *         THE ADDRESS. It is not narrowed to a number on the way in because "this
 *         file was cancelled", "no such file" and "that is not a usable
 *         identifier" are one and the same answer to the user (AC-5), and one
 *         branch is easier to keep right than three.
 *      b. `@/components/files/FileProcessingHistory` — named export, props
 *         `{ logId: number }`: the RESOLVED file's own `Id`.
 *
 *    Both read from the BROWSER through the shared API client (CLAUDE.md §2) at the
 *    app's own same-origin address, so the session cookie travels by itself and the
 *    Playwright layer can intercept the same boundary. Never a bare `fetch()`.
 * 2. THERE IS NO GET-ONE-FILE ENDPOINT. `SubmittedFileDetail` resolves its file by
 *    reading the ACTIVE file list — the existing `fetchSubmittedFiles()` in
 *    `@/lib/api/files` (`GET /v1/file-logs?IsActive=Yes`) — and finding the entry
 *    whose `Id` matches `logId`. No new list call, no per-file call: the stub below
 *    fails loudly on any other read. This is also what makes BR4 fall out for
 *    free — a cancelled file is INACTIVE, so it is simply absent from that body.
 * 3. When the file is not in that list, the component says so in one plain
 *    sentence and offers a real navigational LINK back to the Expense files list
 *    (`UPLOAD_PATH`, i.e. `/upload`) — and renders NO processing history at all
 *    (BR4: once a file is no longer active its history is not surfaced). It is not
 *    a failure: there is no "Try again" and no service-error wording, because
 *    nothing went wrong.
 * 4. `FileProcessingHistory` reads `GET /v1/file-process-logs/{LogId}` through a
 *    new `fetchFileProcessingHistory(logId)` in `@/lib/api/files` (the module's own
 *    header says new file endpoints belong there). `LogId` is a PATH SEGMENT, not a
 *    query parameter (`documentation/transactions-api.yaml` →
 *    `FileProcessLogGetList`), and the body's array property is `FileLog`, NOT
 *    `FileProcessLog` — the wire quirk `@/mocks/data/file-process-log` exists to
 *    keep both layers honest about.
 * 5. The history renders under a heading named "Processing history" as a `table`
 *    with ONE ROW PER RECORDED ACTIVITY, each carrying that activity's name, the
 *    outcome recorded for it and the times it started and finished — every value
 *    printed exactly as the service sent it (nothing reformats a date or re-cases
 *    an outcome; `DecisionResult` is free-form text the app never judges). AN
 *    ACTIVITY STILL RUNNING HAS NEITHER `DecisionResult` NOR `EndDate`: it is still
 *    listed, and nothing invents a completed outcome or an end time for it.
 * 6. All three non-data states of the history are answered (project.md NFR-base-5),
 *    following the shape `SubmittedFilesList` already established on this screen's
 *    sibling:
 *      - busy: a `role="status"` region carrying a READABLE SENTENCE about the
 *        wait (skeleton shapes alone say nothing to a screen reader);
 *      - empty: one plain sentence that no processing activity has been recorded
 *        yet — an answer, not a failure, so no alert and no retry;
 *      - failed: a `role="alert"` showing the SERVICE's own wording via
 *        `serviceMessageOf(e) ?? serviceDetailOf(e) ?? <own wording>` from
 *        `@/lib/api/errors`, plus EXACTLY ONE action — "Try again", the wording this
 *        project already uses — that asks for the history again. Mind the trap: the
 *        transactions service reports a refusal as a 500 with a `DefaultResponse`
 *        (`Messages[]`) body, and `apiClient`'s 500 branch puts its OWN placeholder
 *        on `message` and the service's messages on `details` — so
 *        `serviceMessageOf` alone finds nothing and "Internal Server Error: …"
 *        would reach the user. `uploadFailureMessage` in `lib/api/files.ts` is the
 *        pattern to copy.
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy), plus the `next/link` and
 * `next/navigation` client-navigation stubs every screen test in this project uses
 * — libraries, never the code under test. Every response body comes from the
 * project-wide factories in `web/src/mocks/data/` that the Playwright layer shares,
 * so the two layers cannot drift onto different shapes.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): neither the page
 * nor either component exists yet.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — these imports fail until implemented (TDD red).
import { FileProcessingHistory } from '@/components/files/FileProcessingHistory';
import { SubmittedFileDetail } from '@/components/files/SubmittedFileDetail';

// Real production toast composition (not mocked) — the same one the root layout
// wraps every signed-in screen in, and the surface later stories in this epic
// notify through. Rendering inside it here keeps this file valid once they land.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
// The client's own placeholder wording, imported so the failed-read assertion can
// prove that plumbing did NOT reach the user (project.md NFR-base-5).
import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';
// The ONE registry of addresses — the way back is asserted against it rather than
// against a path written out here, so the two cannot drift.
import { UPLOAD_PATH } from '@/lib/auth/access-map';
import { TRANSACTIONS_API_BASE_PATH } from '@/lib/utils/constants';
// Project-wide factories: the single source of truth for these wire shapes and
// their canonical values, shared with the Playwright layer. Never hand-write a
// response body in a test.
import {
  FILE_STATUS_CANCELLED,
  createFileLog,
  fileLogListResponse,
  fileLogWithStatus,
} from '@/mocks/data/file-log';
import {
  fileProcessHistory,
  fileProcessHistoryWithRetryRunning,
  fileProcessLogFailureResponse,
  fileProcessLogListResponse,
} from '@/mocks/data/file-process-log';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

import type {
  FileProcessLog,
  FileProcessLogList,
} from '@/mocks/data/file-process-log';
import type { APIError } from '@/types/api';
import type { FileLogList } from '@/types/files';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

/**
 * The address the app thinks it is showing, held in a mutable box. The identifier
 * reaches `SubmittedFileDetail` as a PROP (contract note 1) and this box is kept in
 * step with it, so a component that would rather read the address itself is not
 * penalised for it. A library boundary, never the code under test.
 */
const { currentAddress } = vi.hoisted(() => ({
  currentAddress: { search: '' },
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
  usePathname: () => '/upload/file',
  useSearchParams: () => new URLSearchParams(currentAddress.search),
}));

/**
 * `next/link` is stubbed with the plain anchor it renders in the browser, so the
 * way back keeps its `link` role and its `href` without needing an App Router
 * context in jsdom.
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

/** The file these tests open: the canonical submitted file, still active. */
const FILE = createFileLog();

/** The heading the processing history renders under (contract note 5). */
const HISTORY_HEADING = /processing history/i;

/**
 * How the page says the file cannot be shown. Generous about the phrasing —
 * "no longer available", "not available", "could not be found" all say the same
 * thing to a user — but it must be a sentence in a single element, and it must not
 * read as a system failure (AC-5).
 */
const FILE_NOT_AVAILABLE =
  /((not|no longer) available)|((cannot|could not|couldn.t) be found)|(no longer in the (active )?list)/i;

/**
 * What the busy state says while the history is being read. The point of the
 * criterion is that the wait is ANNOUNCED — words in a live region — rather than
 * only drawn as placeholder shapes, so any readable phrasing of "we are getting it"
 * satisfies it.
 */
const ANNOUNCED_WAIT = /(loading|reading|getting|fetching)/i;

/**
 * The `APIError` the shared client rejects with when the transactions service
 * refuses a history read: a 500 whose `DefaultResponse` body carries the reason.
 * Note the service's wording lands on `details` while `message` holds the client's
 * own placeholder — that is what `apiClient`'s 500 branch does, and it is the whole
 * point of contract note 6.
 */
const HISTORY_REFUSED: APIError = {
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  details: fileProcessLogFailureResponse().Messages,
  endpoint: `${TRANSACTIONS_API_BASE_PATH}/v1/file-process-logs/${String(FILE.Id)}`,
};

/** The service's own reason, as the user must read it verbatim. */
const [SERVICE_REASON] = fileProcessLogFailureResponse().Messages;

/** How the transactions service answers the only two reads this screen makes. */
interface ServiceStub {
  /** `GET /v1/file-logs?IsActive=Yes` — every file that is still active. */
  activeFiles?: () => Promise<FileLogList>;
  /** `GET /v1/file-process-logs/{LogId}` — one file's history, by the id asked for. */
  historyFor?: (requestedLogId: string) => Promise<FileProcessLogList>;
}

/** The identifier a history read asked about, wherever the caller put it. */
const requestedLogId = (endpoint: string, params: unknown): string => {
  if (typeof params === 'object' && params !== null && 'LogId' in params) {
    return String((params as { LogId: unknown }).LogId);
  }
  return endpoint.split('/').pop() ?? '';
};

/**
 * Scripts the service. A read the test did not script is a loud failure rather
 * than a silent `undefined`: this screen reads the active file list and one file's
 * processing history, and nothing else at all.
 */
const serve = ({ activeFiles, historyFor }: ServiceStub): void => {
  mockGet.mockImplementation(async (endpoint: unknown, params?: unknown) => {
    const path = String(endpoint);

    // Checked first: "file-process-logs" is its own endpoint, not a file-logs one.
    if (path.includes('file-process-logs')) {
      if (!historyFor) {
        throw new Error(
          `Unexpected read of "${path}" — this test scripted no processing ` +
            'history, so nothing should have asked for one.',
        );
      }
      return await historyFor(requestedLogId(path, params));
    }

    if (path.includes('file-logs')) {
      if (!activeFiles) {
        throw new Error(
          `Unexpected read of "${path}" — this test scripted no file list.`,
        );
      }
      return await activeFiles();
    }

    throw new Error(
      `Unexpected read of "${path}" — the submitted-file page reads the ACTIVE ` +
        "file list (there is no get-one-file endpoint) and one file's processing " +
        'history. Nothing else.',
    );
  });
};

/**
 * Answers a history read for exactly one file. Asked about any other file, it
 * explains itself instead of quietly serving the wrong history — the history must
 * be read for the file the page resolved.
 */
const historyOf =
  (logId: number, reply: () => Promise<FileProcessLogList>) =>
  async (requested: string): Promise<FileProcessLogList> => {
    if (requested !== String(logId)) {
      throw new Error(
        `The processing history was read for file "${requested}", but this ` +
          `test's file is ${String(logId)} — GET /v1/file-process-logs/{LogId} ` +
          'must be asked about the file the page resolved.',
      );
    }
    return await reply();
  };

/**
 * Refuses the first read and answers every later one with the history — which is
 * what makes "one action that asks for it again" observable without any test
 * knowing how many reads happened.
 */
const refusedThenServed = (
  activities: FileProcessLog[],
): (() => Promise<FileProcessLogList>) => {
  let refusedAlready = false;
  return async () => {
    if (refusedAlready) {
      return fileProcessLogListResponse(activities);
    }
    refusedAlready = true;
    throw HISTORY_REFUSED;
  };
};

/** A read the test holds open, so the busy state can be looked at. */
const heldOpen = <T,>(): {
  promise: Promise<T>;
  answer: (value: T) => void;
} => {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, answer: (value: T) => settle(value) };
};

/** The screen as the root layout always mounts it: inside the toast composition. */
const mount = (children: ReactNode) =>
  render(
    <ToastProvider>
      {children}
      <ToastContainer />
    </ToastProvider>,
  );

/**
 * The history on its own, for the criteria that are entirely its business.
 */
const renderHistory = (logId: number) =>
  mount(<FileProcessingHistory logId={logId} />);

/**
 * The submitted-file screen for an identifier as it arrived in the address. The
 * address is kept in step with the prop (see `currentAddress`).
 */
const renderFile = (logId: string | undefined) => {
  currentAddress.search = logId === undefined ? '' : `LogId=${logId}`;
  return mount(<SubmittedFileDetail logId={logId} />);
};

/**
 * The rows of the processing history — the ones carrying an activity, found by the
 * date every recorded activity has, so a header row is excluded without counting
 * from the top of the table.
 */
const activityRows = (): HTMLElement[] =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .filter((row) => /\d{4}-\d{2}-\d{2}/.test(row.textContent ?? ''));

/**
 * The one row for the activity that started at `startDate` — identified by its own
 * content rather than by position, because the wire order of this list is not
 * documented and two activities can share a name (a retry re-runs the same one).
 */
const rowStartingAt = (startDate: string): HTMLElement => {
  const matches = activityRows().filter((row) =>
    (row.textContent ?? '').includes(startDate),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one activity row starting at "${startDate}", found ` +
        `${String(matches.length)} — the history must render one row per ` +
        'recorded activity, each carrying its own start time verbatim.',
    );
  }
  return matches[0];
};

/**
 * The outcome and end time of an activity that has finished, with the fixture
 * precondition checked — so a test asserting on them cannot pass vacuously.
 */
const outcomeAndEndOf = (
  activity: FileProcessLog,
): { outcome: string; endDate: string } => {
  const { DecisionResult, EndDate } = activity;
  if (DecisionResult === undefined || EndDate === undefined) {
    throw new Error(
      'Fixture precondition failed: a completed activity must carry both an ' +
        'outcome and an end time (see @/mocks/data/file-process-log).',
    );
  }
  return { outcome: DecisionResult, endDate: EndDate };
};

describe('Epic file-validation-and-retry, Story 1: opening a submitted file and reading its processing history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAddress.search = '';
  });

  // AC-3
  it('lists every recorded activity for the file with the outcome recorded for it and the times it started and finished, including one still running', async () => {
    // Three activities: the file's receipt, the validation that failed it, and a
    // fresh validation that has not resolved yet — the last with NO outcome and NO
    // end time, which is the state a retry produces and the one a screen that
    // assumed those fields are always there would break on.
    const activities = fileProcessHistoryWithRetryRunning({
      FileName: FILE.CurrentFileName,
    });
    const [received, failed, running] = activities;
    serve({
      historyFor: historyOf(FILE.Id, async () =>
        fileProcessLogListResponse(activities),
      ),
    });

    renderHistory(FILE.Id);

    // Every recorded activity is listed — one row each, none dropped and none
    // duplicated, even though two of them share an activity name.
    await waitFor(() => {
      expect(activityRows()).toHaveLength(activities.length);
    });

    // The two that finished: their own name, the outcome recorded for them and
    // both times, each value exactly as the service sent it.
    [received, failed].forEach((activity) => {
      const { outcome, endDate } = outcomeAndEndOf(activity);
      const row = rowStartingAt(activity.StartDate);

      expect(within(row).getByText(activity.ActivityName)).toBeInTheDocument();
      expect(within(row).getByText(outcome)).toBeInTheDocument();
      expect(row).toHaveTextContent(activity.StartDate);
      expect(row).toHaveTextContent(endDate);
    });

    // The two outcomes are genuinely different values, so the assertions above
    // cannot be satisfied by one label repeated down the column.
    expect(outcomeAndEndOf(received).outcome).not.toEqual(
      outcomeAndEndOf(failed).outcome,
    );

    // The one still running is listed too, with the only times it has — and
    // nothing has invented an outcome or an end time for it.
    const runningRow = rowStartingAt(running.StartDate);
    expect(
      within(runningRow).getByText(running.ActivityName),
    ).toBeInTheDocument();
    expect(runningRow).toHaveTextContent(running.StartDate);
    expect(runningRow).not.toHaveTextContent(outcomeAndEndOf(received).outcome);
    expect(runningRow).not.toHaveTextContent(outcomeAndEndOf(failed).outcome);
    expect(runningRow).not.toHaveTextContent(outcomeAndEndOf(received).endDate);
    expect(runningRow).not.toHaveTextContent(outcomeAndEndOf(failed).endDate);
  });

  // AC-4
  it('announces the wait in words, says plainly when nothing has been recorded yet, and shows the service’s own reason with one action that asks again when the read fails', async () => {
    const user = userEvent.setup();

    // --- the wait is announced, not merely drawn -----------------------------
    const held = heldOpen<FileProcessLogList>();
    serve({ historyFor: historyOf(FILE.Id, () => held.promise) });

    const waiting = renderHistory(FILE.Id);

    // A live region a screen reader is actually given something to read — a
    // skeleton shape announces nothing at all.
    const busy = screen.getByRole('status');
    expect(busy).toHaveTextContent(ANNOUNCED_WAIT);
    // Nothing pretends to have an answer yet.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // --- a file with no recorded activity says so ----------------------------
    held.answer(fileProcessLogListResponse([]));

    const nothingRecorded = await screen.findByText(
      /no (recorded )?(processing )?activit/i,
    );
    expect(nothingRecorded).toBeInTheDocument();
    // The wait has ended, and an empty history is an ANSWER: not an alarm, and
    // nothing to ask again for.
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toEqual([]);

    waiting.unmount();

    // --- a failed read: the service's own wording, and one way to ask again ---
    const activities = fileProcessHistory({ FileName: FILE.CurrentFileName });
    serve({
      historyFor: historyOf(FILE.Id, refusedThenServed(activities)),
    });

    renderHistory(FILE.Id);

    const failure = await screen.findByRole('alert');
    // The reason the SERVICE gave, verbatim...
    expect(failure).toHaveTextContent(SERVICE_REASON);
    // ...and never the client's own placeholder, which is internal plumbing.
    expect(document.body).not.toHaveTextContent(
      CLIENT_FALLBACK_MESSAGES.serverError,
    );

    // Exactly ONE action, and it asks for the history again.
    const actions = screen.getAllByRole('button');
    expect(actions).toHaveLength(1);
    const askAgain = screen.getByRole('button', { name: /try again/i });

    await user.click(askAgain);

    // The history the second read answered with is now on screen, and the failure
    // is gone rather than sitting above it.
    await waitFor(() => {
      expect(activityRows()).toHaveLength(activities.length);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(SERVICE_REASON);
  });

  // AC-5
  it('explains that a cancelled file, or an identifier matching nothing, is not available and offers the way back to the Expense files list — while a file that IS active resolves and shows its history', async () => {
    // A cancelled file is INACTIVE, so `GET /v1/file-logs?IsActive=Yes` simply
    // does not carry it — which is the whole of BR4.
    const cancelled = fileLogWithStatus(FILE_STATUS_CANCELLED, {
      Id: 5042,
      CurrentFileName: 'expenses_2026-04-02.csv',
    });
    const activities = fileProcessHistory({ FileName: FILE.CurrentFileName });

    // The history is scripted to answer ANY file with real activities, so a screen
    // that asked for it anyway would show rows here and fail the assertions below.
    serve({
      activeFiles: async () => fileLogListResponse([FILE]),
      historyFor: async () => fileProcessLogListResponse(activities),
    });

    const forCancelled = renderFile(String(cancelled.Id));

    await waitFor(() => {
      expect(screen.getByText(FILE_NOT_AVAILABLE)).toBeInTheDocument();
    });

    // A real way back to the list the user came from, read off the one registry of
    // addresses rather than a path written out here.
    const wayBack = screen.getByRole('link', { name: /expense files/i });
    expect(wayBack).toHaveAttribute('href', UPLOAD_PATH);

    // No history is surfaced for a file that is no longer active (BR4)...
    expect(
      screen.queryByRole('heading', { name: HISTORY_HEADING }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(activities[0].ActivityName);
    // ...and nothing about the file that IS in the list has leaked onto the page.
    expect(document.body).not.toHaveTextContent(FILE.CurrentFileName);
    // Nor is this dressed up as a system failure: nothing went wrong, so there is
    // nothing to ask again for and no service-error wording.
    expect(
      screen.queryByRole('button', { name: /try again/i }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      CLIENT_FALLBACK_MESSAGES.serverError,
    );

    forCancelled.unmount();

    // --- an identifier that matches nothing gets the same answer -------------
    const forUnknown = renderFile('9999');

    await waitFor(() => {
      expect(screen.getByText(FILE_NOT_AVAILABLE)).toBeInTheDocument();
    });
    expect(
      screen.getByRole('link', { name: /expense files/i }),
    ).toHaveAttribute('href', UPLOAD_PATH);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    forUnknown.unmount();

    // --- the control case: a file that IS in the active list resolves ---------
    // Same component, same list read — so "not available" above is about the file
    // being absent, not about the page being unable to resolve anything at all.
    const forActive = renderFile(String(FILE.Id));

    await waitFor(() => {
      expect(screen.getByText(FILE.CurrentFileName)).toBeInTheDocument();
    });
    expect(screen.queryByText(FILE_NOT_AVAILABLE)).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: HISTORY_HEADING }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(activityRows()).toHaveLength(activities.length);
    });

    forActive.unmount();
  });
});
