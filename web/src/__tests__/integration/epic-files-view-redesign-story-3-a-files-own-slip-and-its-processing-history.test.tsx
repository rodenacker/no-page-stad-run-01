/**
 * Story Metadata:
 * - Epic: files-view-redesign — Story 3: a file's own slip, and its processing history
 * - Route: /upload/file
 * - Target File: web/src/components/files/SubmittedFileDetail.tsx (with
 *   web/src/components/files/FileProcessingHistory.tsx)
 * - Page Action: modify_existing
 * - Requirements: R17, R18, R1, R2, R7, R8, R9, BR1, BR2, BR6, BR9, BR10
 *
 * Covers the criteria tagged `vitest`:
 * - AC-2 — the file's header still states the SAME FIVE THINGS with the SAME VALUES
 *   as the register row it was opened from (file setting, processed time, status,
 *   record count, most recent activity), each value still paired with the label that
 *   names it, and the status still reaching the reader in WORDS rather than by colour
 *   alone.
 * - AC-4 — an activity that is still running still shows no outcome and no finish
 *   time, and NOTHING IS INVENTED for either: no borrowed outcome, no timestamp the
 *   service never sent — while the completed activity beside it still carries its own
 *   outcome and its own finish time.
 * - AC-5 — a file that cannot be found, and a processing history that fails to load,
 *   still read clearly with their EXISTING wording and their EXISTING way on: the
 *   plain "not available" explanation with the way back to the list (and no
 *   service-failure wording, no action to ask again, and no history at all), and the
 *   service's own reason with the one "Try again" that asks for the history again.
 *
 * AC-1 (the header reading as a compact slip — small capitalised labels over their
 * values, figures and times in the typewriter face) and AC-3 (the ruled history table)
 * are tagged `none`: they are typographic judgements a human makes by eye, and they
 * are already on this story's manual checklist. Nothing here asserts a Tailwind class,
 * a computed style or a font family to fake covering them — that would pin the
 * implementation without checking anything a reader can see.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR (read this before implementing)
 * ---------------------------------------------------------------------------
 * This epic is a PRESENTATION-ONLY redesign, and all three criteria above are
 * PRESERVATION criteria: they describe what the two shipped components already say,
 * and they exist so the restyle cannot quietly change it. So this file is a regression
 * harness for the restyle rather than a specification of new behaviour — it is
 * expected to hold both before and after it, and each test is written to BREAK on the
 * ways a restyle plausibly goes wrong:
 *
 * 1. THE LABEL→VALUE PAIRING (AC-2). Each value is looked up THROUGH its own label —
 *    the element that names it, then the element beside it — never by scanning the
 *    whole screen for a loose string. A slip that lays its five labels out in one row
 *    and their five values in another, or that drops a label, or that pairs the record
 *    count with the wrong figure, fails here even though every value is still
 *    somewhere on screen.
 * 2. THE FIVE LABELS ARE THE REGISTER'S OWN COLUMN WORDING. `File setting`,
 *    `Processed`, `Status`, `Most recent activity` and `Records` are exactly the column
 *    headings `SubmittedFilesList` puts on the row this page is opened from, and the
 *    values come from the SAME `FileLog` fields (`SettingName`, `ProcessDate`,
 *    `CurrentStatus`, `LastExecutedActivityName`, `RecordCount`) of the SAME
 *    project-wide fixture both surfaces are served from. That is what makes "the same
 *    five things with the same values as the row" a real comparison rather than a
 *    restatement: rename a label or re-point a field here and the two surfaces
 *    disagree.
 * 3. THE STATUS STAYS WORDS (AC-2). `FileStatusBadge` already delegates to the shared
 *    `StatusBadge`, so this file asserts only that ONE element inside the Status field
 *    carries the status WORDING the service sent. It does NOT re-assert the shape, the
 *    intent, the ink or the absence of a pill — that vocabulary belongs to the shared
 *    mark and to `request-list-redesign` story 4, and re-pinning it here is how two
 *    files end up disagreeing about it.
 * 4. THE HISTORY'S CELLS ARE FOUND BY THEIR COLUMN HEADING, not by a hard-coded column
 *    number, and a row is found by its own `StartDate` — never by position, because
 *    the wire order of this list is undocumented and a retry re-runs the same activity
 *    name. Reorder or restyle the columns and these tests still hold; invent a value in
 *    one and they fail.
 * 5. NOTHING INVENTED (AC-4) is asserted as an ABSENCE OF FABRICATION, not as a
 *    literal placeholder glyph: the running activity's outcome cell must not carry any
 *    outcome the service recorded for another activity, its finish cell must carry no
 *    timestamp at all, and its whole row must state exactly ONE time (its own start) —
 *    which is what catches an end time quietly defaulted to the start. Both cells must
 *    still SAY something readable about nothing having been recorded yet (the shipped
 *    component says "Not recorded yet"); the regex accepts any honest phrasing of that
 *    so the restyle may re-word it, but a blank cell — which reads as an oversight —
 *    fails. No em-dash or other placeholder glyph is asserted, because the shipped
 *    component renders none.
 * 6. THE READ PATH IS UNCHANGED (BR10). There is NO get-one-file endpoint: the file is
 *    resolved out of the ACTIVE file list (`GET /v1/file-logs?IsActive=Yes`) and the
 *    history is read from `GET /v1/file-process-logs/{LogId}` with the id as a PATH
 *    SEGMENT. The stub below fails loudly on any other read, so a redesign that
 *    reaches for a per-file fetch shows up here as a test failure rather than as a new
 *    call in production.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy) — plus the `next/link` and `next/navigation`
 * client-navigation stubs every screen test in this project uses. Libraries, never the
 * code under test: `lib/api/files.ts`, the toast composition, `FileStatusBadge`, the
 * Shadcn table and both components themselves are the real production code, so what is
 * asserted is what a reader meets. Every response body comes from the project-wide
 * `@/mocks/data/*` factories the Playwright layer shares, so the two layers cannot
 * drift onto different shapes.
 *
 * Render scope: `SubmittedFileDetail` whole for the slip (the header is part of that
 * one component's composition), and `FileProcessingHistory` on its own for the two
 * criteria that are entirely its business — testing-policy.md § Render scope. No fake
 * timers: the file these tests resolve is not in progress, so the page's own interval
 * never starts. No `axe()` — accessibility is this story's Playwright scan.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the two shipped components this story restyles.
import { FileProcessingHistory } from '@/components/files/FileProcessingHistory';
import { SubmittedFileDetail } from '@/components/files/SubmittedFileDetail';

// Real production toast composition (not mocked) — the same one the root layout wraps
// every signed-in screen in, and the surface this page's actions notify through.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { apiClient, get } from '@/lib/api/client';
// The client's own placeholder wording, imported so a failed read can be shown NOT to
// have leaked it to the user (project.md NFR-base-5).
import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';
// The ONE registry of addresses — the way back is asserted against it rather than
// against a path written out here, so the two cannot drift.
import { UPLOAD_PATH } from '@/lib/auth/access-map';
// Project-wide factories: the single source of truth for these wire shapes and their
// canonical values, shared with the Playwright layer. Never hand-write a response body.
import { createFileLog, fileLogListResponse } from '@/mocks/data/file-log';
import {
  OUTCOME_SUCCESS,
  OUTCOME_VALIDATION_FAILED,
  fileProcessHistoryWithRetryRunning,
  fileProcessLogFailureResponse,
  fileProcessLogListResponse,
} from '@/mocks/data/file-process-log';
// The file-and-its-rows scenario, so the preview and rejected-rows sections of this
// page are answered with real bodies instead of reporting failures of their own.
import { previewWithRejectedRows } from '@/mocks/data/submitted-file';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

import type { FileProcessLog } from '@/mocks/data/file-process-log';
import type { APIError, APIRequestConfig } from '@/types/api';
import type {
  FileLogList,
  FileProcessLogList,
  ValidationErrors,
} from '@/types/files';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

/**
 * The client-navigation boundary — a library, never the code under test. Nothing in
 * this story asserts navigation; the way back is a real link, asserted by its `href`.
 */
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
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * `next/link` is stubbed with the plain anchor it renders in the browser, so the way
 * back keeps its `link` role and its `href` without an App Router context in jsdom.
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
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

/**
 * The file this page is opened for: the canonical five-row file whose lines 3 and 5 the
 * service rejected. Its status (`Validation failed`), record count and most recent
 * activity all differ from the factory's own defaults, so the slip can be shown to be
 * printing THIS file's values rather than a set of plausible-looking constants — and it
 * is not in progress, so the page's refresh interval never starts.
 */
const PREVIEW = previewWithRejectedRows();
const FILE = PREVIEW.file;

/**
 * The five things the header states, each with the value the service reported for it.
 *
 * The LABELS are the register's own column wording and the VALUES are the same
 * `FileLog` fields that register row renders (contract item 2) — which is what makes
 * this "the same five things with the same values as the row it was opened from".
 */
const SLIP_FIELDS: { label: string; value: string }[] = [
  { label: 'File setting', value: FILE.SettingName },
  { label: 'Processed', value: FILE.ProcessDate },
  { label: 'Status', value: FILE.CurrentStatus },
  { label: 'Records', value: FILE.RecordCount },
  { label: 'Most recent activity', value: FILE.LastExecutedActivityName },
];

/**
 * The history these tests read: two completed activities plus a third that is still
 * running — the state a retry leaves behind, and the one AC-4 is about.
 */
const HISTORY = fileProcessHistoryWithRetryRunning();

/**
 * How the page says the file cannot be shown. Generous about the phrasing — "not
 * available", "no longer available", "could not be found" all say the same thing to a
 * reader — but it must not read as a system failure (AC-5).
 */
const FILE_NOT_AVAILABLE =
  /((not|no longer) available)|((cannot|could not|couldn.t) be found)|(no longer in the (active )?list)/i;

/**
 * How a cell says the service has recorded nothing there yet. Any honest phrasing of
 * that satisfies AC-4 — the shipped component says "Not recorded yet" and the restyle
 * may re-word it — but a BLANK cell does not: an empty cell reads as an oversight
 * rather than as an answer.
 */
const NOTHING_RECORDED_YET =
  /not recorded|nothing recorded|not yet|no outcome|still running|in progress|pending/i;

/** Every date-and-time the service sent, as it appears in a piece of rendered text. */
const timesIn = (text: string): string[] =>
  text.match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/g) ?? [];

/** The service's own reason for a refused history read, as the user must read it. */
const [SERVICE_REASON] = fileProcessLogFailureResponse().Messages;

/**
 * The `APIError` the shared client rejects with when the transactions service refuses a
 * read: a 500 whose `DefaultResponse` body carries the reason. The service's wording
 * lands on `details` while `message` holds the client's OWN placeholder — that is what
 * `apiClient`'s 500 branch does, and it is the whole point of AC-5's second half.
 */
const READ_REFUSED: APIError = {
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  details: fileProcessLogFailureResponse().Messages,
  endpoint: '/v1/file-process-logs',
};

/** How the transactions service answers the reads this screen makes. */
interface ServiceStub {
  /** `GET /v1/file-logs?IsActive=Yes` — every file that is still active. */
  activeFiles?: () => Promise<FileLogList>;
  /** `GET /v1/file-process-logs/{LogId}` — one file's history, by the id asked for. */
  historyFor?: (requestedLogId: string) => Promise<FileProcessLogList>;
  /** `GET /v1/files/validation-errors?FileLogId={id}` — another story's surface. */
  validationErrors?: () => Promise<ValidationErrors>;
  /** `GET /v1/files/download?FileLogId={id}` — the file as it was submitted. */
  submittedFile?: () => Promise<Blob>;
}

/** The identifier a history read asked about, wherever the caller put it. */
const requestedLogId = (endpoint: string, params: unknown): string => {
  if (typeof params === 'object' && params !== null && 'LogId' in params) {
    return String((params as { LogId: unknown }).LogId);
  }
  return endpoint.split('/').pop() ?? '';
};

/**
 * Scripts the service. A read this file did not script is a loud failure rather than a
 * silent `undefined`: the restyle must not add a read, and above all must not reach for
 * a get-one-file endpoint that does not exist (contract item 6).
 */
const serve = (stub: ServiceStub): void => {
  const route = async (
    endpoint: unknown,
    verb: string,
    config?: APIRequestConfig,
  ): Promise<unknown> => {
    const path = String(endpoint);

    // Checked first: "file-process-logs" is its own endpoint, not a file-logs one.
    if (path.includes('file-process-logs')) {
      if (stub.historyFor === undefined) {
        throw new Error(
          `Unexpected ${verb} ${path} — this test scripted no processing history, ` +
            'so nothing should have asked for one.',
        );
      }
      return await stub.historyFor(requestedLogId(path, config?.params));
    }

    if (path.includes('/v1/files/validation-errors')) {
      if (stub.validationErrors === undefined) {
        throw new Error(
          `Unexpected ${verb} ${path} — no rejected rows were scripted.`,
        );
      }
      return await stub.validationErrors();
    }

    if (path.includes('/v1/files/download')) {
      if (stub.submittedFile === undefined) {
        throw new Error(
          `Unexpected ${verb} ${path} — no submitted file was scripted.`,
        );
      }
      return await stub.submittedFile();
    }

    if (path.includes('file-logs')) {
      if (stub.activeFiles === undefined) {
        throw new Error(
          `Unexpected ${verb} ${path} — this test scripted no file list.`,
        );
      }
      return await stub.activeFiles();
    }

    throw new Error(
      `Unexpected ${verb} ${path} — a file's own page resolves the file from the ` +
        'ACTIVE file list (there is no get-one-file endpoint, BR10) and reads its ' +
        'processing history, its rejected rows and the submitted file itself. ' +
        'Nothing else.',
    );
  };

  mockGet.mockImplementation((endpoint: unknown, params?: unknown) =>
    route(endpoint, 'GET', { params } as APIRequestConfig),
  );
  mockApiClient.mockImplementation(
    (endpoint: unknown, config?: APIRequestConfig) =>
      route(endpoint, config?.method ?? 'GET', config),
  );
};

/**
 * Answers a history read for exactly one file, so a page that asked about the wrong one
 * is a failure rather than a silently-served wrong history.
 */
const historyOf =
  (logId: number, reply: () => Promise<FileProcessLogList>) =>
  async (requested: string): Promise<FileProcessLogList> => {
    if (requested !== String(logId)) {
      throw new Error(
        `The processing history was read for file "${requested}", but this test's ` +
          `file is ${String(logId)} — GET /v1/file-process-logs/{LogId} must be ` +
          'asked about the file the page resolved.',
      );
    }
    return await reply();
  };

/**
 * Refuses the first read and answers every later one with the history — which is what
 * makes "one action that asks for it again" observable without any test knowing how
 * many reads happened.
 */
const refusedThenServed = (
  activities: FileProcessLog[],
): (() => Promise<FileProcessLogList>) => {
  let refusedAlready = false;
  return async () => {
    if (refusedAlready) {
      return await Promise.resolve(fileProcessLogListResponse(activities));
    }
    refusedAlready = true;
    throw READ_REFUSED;
  };
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
 * A file's own page for an identifier as it arrived in the address, read by an account
 * that may not act on the file (an Approver) — so the actions section renders nothing
 * and the slip is what is under test.
 */
const renderFile = (logId: string | undefined) =>
  mount(<SubmittedFileDetail logId={logId} />);

/** The processing history on its own, for the criteria that are its own business. */
const renderHistory = (logId: number) =>
  mount(<FileProcessingHistory logId={logId} />);

/**
 * The value the slip pairs with one of its labels: the element BESIDE the label that
 * names it (contract item 1).
 *
 * It looks beside the label itself first and then beside each block the label sits in,
 * so the pairing is found wherever the restyle chooses to sit it — a `dt`/`dd` pair, a
 * label wrapped in its own tracked span, or a two-element field block. It deliberately
 * never widens to a container holding ALL the values: an assertion that cannot tell the
 * record count from the processed time would pass on a slip that had scrambled them.
 */
const valuePairedWith = (label: string): HTMLElement => {
  let node: HTMLElement | null = screen.getByText(label);
  for (let step = 0; step < 3 && node !== null; step += 1) {
    const beside = node.nextElementSibling;
    if (
      beside instanceof HTMLElement &&
      (beside.textContent ?? '').trim() !== ''
    ) {
      return beside;
    }
    node = node.parentElement;
  }
  throw new Error(
    `The header states "${label}" but pairs no value with it — each of the five ` +
      'things the slip states must sit with the label that names it (AC-2).',
  );
};

/** The rows of the processing history that carry an activity (its own recorded time). */
const activityRows = (): HTMLElement[] =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .filter((row) => timesIn(row.textContent ?? '').length > 0);

/**
 * The one row for the activity that started at `startDate` — identified by its own
 * content, never by position (contract item 4).
 */
const rowStartingAt = (startDate: string): HTMLElement => {
  const matches = activityRows().filter((row) =>
    (row.textContent ?? '').includes(startDate),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one activity row starting at "${startDate}", found ` +
        `${String(matches.length)} — the history must render one row per recorded ` +
        'activity, each carrying its own start time verbatim.',
    );
  }
  return matches[0];
};

/** Which column a heading names, so a cell is never reached by a hard-coded number. */
const columnHeaded = (heading: RegExp): number => {
  const headings = within(screen.getByRole('table')).getAllByRole(
    'columnheader',
  );
  const position = headings.findIndex((cell) =>
    heading.test(cell.textContent ?? ''),
  );
  if (position < 0) {
    throw new Error(
      `The processing history has no column headed ${String(heading)} — it names an ` +
        'activity, its outcome and the times it started and finished.',
    );
  }
  return position;
};

/** One row's cell under the column that heading names. */
const cellUnder = (row: HTMLElement, heading: RegExp): HTMLElement => {
  const cell = within(row).getAllByRole('cell')[columnHeaded(heading)];
  if (cell === undefined) {
    throw new Error(
      `This activity row has no cell under the ${String(heading)} column — every ` +
        'recorded activity fills every column of the history.',
    );
  }
  return cell;
};

/** The end time a completed activity must still show, guarded so the fixture speaks. */
const endTimeOf = (activity: FileProcessLog): string => {
  const { EndDate } = activity;
  if (EndDate === undefined) {
    throw new Error(
      `The fixture activity "${activity.ActivityName}" has no EndDate — this ` +
        'assertion is about a COMPLETED activity.',
    );
  }
  return EndDate;
};

/** The one activity of the history that is still running: no outcome, no end time. */
const runningActivity = (): FileProcessLog => {
  const running = HISTORY.filter(
    (activity) =>
      activity.EndDate === undefined && activity.DecisionResult === undefined,
  );
  if (running.length !== 1) {
    throw new Error(
      'This test needs exactly one still-running activity in the fixture history.',
    );
  }
  return running[0];
};

/** The completed activity whose outcome and finish time must survive beside it. */
const completedActivity = (): FileProcessLog => {
  const completed = HISTORY.filter(
    (activity) => activity.DecisionResult === OUTCOME_VALIDATION_FAILED,
  );
  if (completed.length !== 1) {
    throw new Error(
      'This test needs exactly one activity recorded as ' +
        `"${OUTCOME_VALIDATION_FAILED}" in the fixture history.`,
    );
  }
  return completed[0];
};

describe('Epic files-view-redesign, Story 3: a file own slip and its processing history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-2
  it('states the same five things, with the same values, as the register row it was opened from — its status in words', async () => {
    serve({
      activeFiles: async () =>
        await Promise.resolve(
          fileLogListResponse([FILE, createFileLog({ Id: 5099 })]),
        ),
      historyFor: historyOf(
        FILE.Id,
        async () => await Promise.resolve(fileProcessLogListResponse()),
      ),
      validationErrors: async () =>
        await Promise.resolve(PREVIEW.validationErrors),
      submittedFile: async () => await Promise.resolve(PREVIEW.blob()),
    });

    renderFile(String(FILE.Id));

    // The slip is on screen once the label naming the file's setting is.
    await waitFor(() => {
      expect(screen.getByText('File setting')).toBeInTheDocument();
    });

    // Every one of the five, still paired with the label that names it, still
    // carrying the value the service reported for THIS file.
    for (const { label, value } of SLIP_FIELDS) {
      expect(valuePairedWith(label)).toHaveTextContent(value);
    }

    // The status is READ, not merely coloured: one element inside the Status field
    // carries the service's own wording. What that element's mark looks like belongs
    // to the shared status vocabulary, not here (contract item 3).
    expect(
      within(valuePairedWith('Status')).getByText(FILE.CurrentStatus),
    ).toBeInTheDocument();

    // The file names the screen it is about, exactly as the register row does.
    expect(screen.getByText(FILE.CurrentFileName)).toBeInTheDocument();
  });

  // AC-4
  it('shows no outcome and no finish time for an activity still running, and invents neither', async () => {
    serve({
      historyFor: historyOf(
        FILE.Id,
        async () => await Promise.resolve(fileProcessLogListResponse(HISTORY)),
      ),
    });

    renderHistory(FILE.Id);

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    // Every recorded activity is still listed — the running one is not withheld for
    // want of an outcome.
    expect(activityRows()).toHaveLength(HISTORY.length);

    const running = runningActivity();
    const runningRow = rowStartingAt(running.StartDate);
    const outcome = cellUnder(runningRow, /outcome/i);
    const finished = cellUnder(runningRow, /finish/i);

    // Nothing invented for the outcome: not an outcome borrowed from another activity,
    // and not a blank cell either — it says plainly that nothing has been recorded yet.
    expect(outcome).not.toHaveTextContent(OUTCOME_SUCCESS);
    expect(outcome).not.toHaveTextContent(OUTCOME_VALIDATION_FAILED);
    expect(outcome).toHaveTextContent(NOTHING_RECORDED_YET);

    // Nothing invented for the finish time: no time at all in that cell, and no second
    // time anywhere on the row — which is what catches an end time quietly defaulted
    // to the start.
    expect(timesIn(finished.textContent ?? '')).toHaveLength(0);
    expect(finished).toHaveTextContent(NOTHING_RECORDED_YET);
    expect(timesIn(runningRow.textContent ?? '')).toEqual([running.StartDate]);

    // The only time it has is still stated.
    expect(cellUnder(runningRow, /start/i)).toHaveTextContent(
      running.StartDate,
    );

    // And the completed activity beside it still carries its own outcome and its own
    // finish time — the running case is not a blanket blanking of both columns.
    const completed = completedActivity();
    const completedRow = rowStartingAt(completed.StartDate);
    expect(cellUnder(completedRow, /outcome/i)).toHaveTextContent(
      OUTCOME_VALIDATION_FAILED,
    );
    expect(cellUnder(completedRow, /finish/i)).toHaveTextContent(
      endTimeOf(completed),
    );
  });

  // AC-5
  it('still reads clearly when the file cannot be found, and when the processing history fails to load', async () => {
    // A file that is not in the active list — deleted, cancelled, or an address that
    // never named a file this app can show. Not a failure, so: its own plain wording,
    // the way back to the list, no service-error wording, no action to ask again, and
    // no processing history at all (BR10).
    serve({
      activeFiles: async () =>
        await Promise.resolve(
          fileLogListResponse([createFileLog({ Id: 5001 })]),
        ),
    });

    const { unmount } = renderFile('9999');

    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent(FILE_NOT_AVAILABLE);
    expect(
      screen.getByRole('link', { name: /expense files/i }),
    ).toHaveAttribute('href', UPLOAD_PATH);
    expect(
      screen.queryByRole('button', { name: /again|retry|reload/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /processing history/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    unmount();

    // A history read the service refused is a DIFFERENT answer: the SERVICE's own
    // reason, never the client's internal placeholder, plus the one existing action
    // that asks for it again — which is enough to get the history on screen.
    serve({ historyFor: historyOf(FILE.Id, refusedThenServed(HISTORY)) });

    renderHistory(FILE.Id);

    expect(await screen.findByText(SERVICE_REASON)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      CLIENT_FALLBACK_MESSAGES.serverError,
    );

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    expect(activityRows()).toHaveLength(HISTORY.length);
    expect(screen.queryByText(SERVICE_REASON)).not.toBeInTheDocument();
  });
});
