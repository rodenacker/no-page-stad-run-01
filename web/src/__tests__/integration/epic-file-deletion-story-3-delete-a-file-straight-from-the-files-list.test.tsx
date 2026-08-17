/**
 * Story Metadata:
 * - Epic: file-deletion — Story 3: delete a file straight from the files list
 * - Route: /upload
 * - Target File: web/src/components/files/SubmittedFilesList.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — every row offers the delete action whatever the file's status, worded
 *   exactly as it is on the file's own page.
 * - AC-2 — an Approver's list carries no delete control, and a list rendered with no
 *   acting Importer at all carries none either; everything the list already did is
 *   unchanged.
 * - AC-3 — the confirmation a row opens is the SAME one the file's own page shows,
 *   in all three of its shapes.
 * - AC-5 — a refused delete leaves the row exactly where it was, in the service's own
 *   words, with the action offered again.
 *
 * AC-4 (a confirmed delete removing the row because the list RE-READ itself, and the
 * list still refreshing afterwards) and AC-6 (keyboard completion + the real-browser
 * accessibility scan with the confirmation open) belong to this story's Playwright
 * spec — deliberately not duplicated here (testing-policy.md § "One tag, one layer").
 * Nothing below ever puts a SUCCESSFUL delete on screen, precisely so that no
 * assertion in this file can be satisfied by an implementation that splices the row
 * out of a local array instead of asking the service again (R12). That distinction is
 * made with `fileLogsAfterDeleting` / `transactionsAfterDeletingFile` in the
 * Playwright spec, which is where a real re-read is observable.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE SURFACE is the SHIPPED client component
 *    `web/src/components/files/SubmittedFilesList.tsx`, named export
 *    `SubmittedFilesList` — modified, not replaced, and not wrapped in a second list.
 * 2. ONE NEW OPTIONAL PROP, `actingUploader?: string`, alongside the existing
 *    `viewerRoles?: string[]`. It is the value `app/(authenticated)/upload/page.tsx`
 *    already knows how to compute on the SERVER —
 *    `hasRole(session, ROLE_IMPORTER) ? displayNameOf(session) : undefined`, the same
 *    expression `upload/file/page.tsx` passes to `SubmittedFileActions` — and it does
 *    the same two jobs: it gates the control, and it is the `LastChangedUser` audit
 *    identity the delete call carries (BR2/BR7). The list reads no session in the
 *    browser.
 *
 *    THE POLARITY IS THE OPPOSITE OF `viewerRoles`, AND THAT IS THE POINT. An absent
 *    `viewerRoles` means "still notify" (`expense-file-upload` story 3 pinned the
 *    list's original no-props contract, so withholding a notification from a caller
 *    that never said who is watching would silently change shipped behaviour). An
 *    absent `actingUploader` must mean NO DELETE CONTROL AT ALL — the safe default,
 *    so every existing caller is unaffected. A developer who copies the `viewerRoles`
 *    default into the new prop makes the list offer deletion to a session the server
 *    never authorised; AC-2 below is written to fail loudly on exactly that.
 *    Absent, never disabled: no `aria-disabled`, no greyed-out stand-in (UI-24).
 *
 *    Until that prop exists the tests below fail on a missing control, and
 *    `tsc` may object to the prop in the JSX — both are the expected TDD red, not
 *    something to work around.
 * 3. ONE CONFIRMATION, SHARED. The dialog a row opens must be story 2's shared
 *    piece (`web/src/lib/files/deleteConfirmation.ts` + its small `ConfirmAction`
 *    wrapper), NOT a second dialog built for this surface. AC-3 does not restate any
 *    wording: it opens the confirmation from a row AND from the file's own page
 *    (`SubmittedFileActions`, this epic's other surface) for the same file, and
 *    requires the two to read identically — in all three shapes (request counts for
 *    an imported file, the short warning otherwise, and the "count could not be read"
 *    state). A second implementation on this surface cannot pass that, however
 *    plausible its wording.
 * 4. THE ONE DELETE CALL, unchanged: `DELETE {TRANSACTIONS_API_BASE_PATH}/v1/files`
 *    with `LogId` and the `LastChangedUser` header (`deleteSubmittedFile` in
 *    `lib/api/files.ts` — story 1 renamed it from `cancelSubmittedFile`, and it is NOT
 *    duplicated — R9). The count read is the existing `fetchTransactions`
 *    (`GET /v1/transactions`, no parameters, narrowed client-side on `FileLogId` —
 *    BR4). The mock below fails loudly on any other endpoint.
 * 5. A REFUSAL IS THE SERVICE'S OWN WORDING, on the list, with the confirmation
 *    closed (`serviceMessageOf ?? serviceDetailOf ?? own wording`, `lib/api/errors.ts`
 *    — the transactions service sends its reason in `Messages[]`, which the shared
 *    client keeps on `details`, so the client's own "Internal Server Error: …"
 *    placeholder must never reach the user). The row stays exactly where it was,
 *    among the same neighbours, and the action can be taken again. The list never
 *    navigates anywhere — sending the user back to the list is the DETAIL page's
 *    behaviour on success and has no meaning here.
 * 6. NO SECOND TIMER. The list owns one refresh interval already
 *    (`expense-file-upload` story 3); the delete must not grow another. Nothing here
 *    asserts the interval, and no test needs the clock: the re-reads below are driven
 *    by the real submission event (`announceFileSubmitted`), which is a user action,
 *    so this file runs on real timers with no fake clock anywhere.
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy), plus `next/navigation`, the framework
 * boundary (the file's own page component navigates on a successful delete).
 * `lib/api/files.ts`, `lib/api/transactions.ts`, the toast composition and the
 * Shadcn/Radix dialog are the REAL production code, so what the user meets is
 * asserted as rendered text. Every response body comes from the project-wide
 * `@/mocks/data/*` factories the Playwright layer shares — nothing is authored here.
 * No `axe()` runs in jsdom; accessibility is AC-6's real-browser scan.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, {
  PointerEventsCheckLevel,
} from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The OTHER surface this epic's delete lives on — the file's own page. It is here as
// the reference the list is compared against (contract note 3), never as the unit
// under test: story 1 and story 2 own its behaviour.
import { SubmittedFileActions } from '@/components/files/SubmittedFileActions';
// Production code under test — the shipped submitted-files list.
import { SubmittedFilesList } from '@/components/files/SubmittedFilesList';
// Real production toast composition (not mocked) — the root layout's one notification
// surface, which is where the list's existing announcements come out.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { apiClient, del, get } from '@/lib/api/client';
import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';
import { displayNameOf } from '@/lib/auth/identity';
import { submittedFileAddress } from '@/lib/files/fileAddress';
// The real "a file was just submitted" announcement the submit form makes. It is what
// drives a re-read here WITHOUT a clock: a user action, not a timer.
import { announceFileSubmitted } from '@/lib/files/fileSubmissions';
// Project-wide factories — the single source both test layers share.
import {
  DELETE_REFUSED_MESSAGE,
  FILE_STATUS_IMPORTED,
  FILE_STATUS_VALIDATING,
  FILE_STATUS_VALIDATION_FAILED,
  deleteFailureResponse,
  deleteSuccessResponse,
  fileLogListResponse,
  fileLogProgression,
  fileLogsInEveryStatus,
} from '@/mocks/data/file-log';
import { userInfoFor } from '@/mocks/data/identity';
// The paired file-and-its-requests scenarios this epic's confirmation is built on.
import {
  filesNeverImportedToDelete,
  importedFileToDelete,
  otherFilesInTransactionsList,
  transactionListFailureResponse,
  transactionListResponse,
} from '@/mocks/data/transaction';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/types/auth';

import type { APIError, APIRequestConfig, DefaultResponse } from '@/types/api';
import type { FileLog, FileLogList } from '@/types/files';
import type {
  TransactionRead,
  TransactionReadList,
} from '@/types/transactions';

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
  usePathname: () => '/upload',
  useSearchParams: () => new URLSearchParams(),
}));

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;
const mockGet = get as unknown as ReturnType<typeof vi.fn>;
const mockDel = del as unknown as ReturnType<typeof vi.fn>;

/**
 * The signed-in Finance Uploader, and the audit identity the delete call must carry —
 * the same value the server computes for the file's own page (contract note 2).
 */
const ACTING_UPLOADER = displayNameOf(userInfoFor(ROLE_IMPORTER));

/**
 * The delete control's accessible name, anchored at the start so it can never be
 * satisfied by the confirmation's own "Delete the file" choice, and open at the end so
 * a row may legitimately add the file's name for a screen reader (the way the shipped
 * "Open" link already does). This ONE pattern is used for the list row and for the
 * file's own page, which is what "worded exactly as on the file's own page" means.
 */
const DELETE = /^delete file\b/i;

/** The confirmation's own two choices (R4 — the way out deliberately says "Keep"). */
const CONFIRM_DELETE = /^delete the file$/i;

/** One scripted answer to a call: the body the service sends, or the failure it throws. */
type Scripted<T> = { readonly body: T } | { readonly failure: APIError };

/**
 * What the shared client throws when the transactions service REFUSES a call: its own
 * placeholder on `message`, and the service's `Messages[]` — from the shared failure
 * factories — on `details` (`lib/api/client.ts` → 500 branch). That split is why the
 * refusal wording below is only reachable through `serviceDetailOf`.
 */
const refusal = (messages: string[], endpoint: string): APIError => ({
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  details: messages,
  endpoint,
});

const REFUSED_DELETE = refusal(
  deleteFailureResponse().Messages,
  '/transactions-api/v1/files',
);

const REFUSED_COUNT_READ = refusal(
  transactionListFailureResponse().Messages,
  '/transactions-api/v1/transactions',
);

let fileLogsScript: Scripted<FileLogList>;
let transactionsScript: Scripted<TransactionReadList>;
let deleteScript: Scripted<DefaultResponse>;

/** What the file-logs list read answers from now on. */
const serveFiles = (files: FileLog[]): void => {
  fileLogsScript = { body: fileLogListResponse(files) };
};

/** What `GET /v1/transactions` answers from now on — the WHOLE set, as the service
 * sends it (no query parameters exist), for the app to narrow client-side (BR4). */
const serveTransactions = (transactions: TransactionRead[]): void => {
  transactionsScript = { body: transactionListResponse(transactions) };
};

/** The request-count read fails — story 2's third confirmation state. */
const refuseCountRead = (): void => {
  transactionsScript = { failure: REFUSED_COUNT_READ };
};

/** One recorded delete: which file it named, and who it was attributed to. */
interface RecordedDelete {
  logId: string | null;
  lastChangedUser?: string;
}

let deleteRequests: RecordedDelete[] = [];

/** A query-parameter value the request actually carried, as text. */
const scalarOf = (value: unknown): string | null =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : null;

/**
 * The `LogId` a call named, whether it travelled as a client `params` entry or was
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

const deliver = async <T,>(scripted: Scripted<T>): Promise<T> => {
  if ('failure' in scripted) {
    throw scripted.failure;
  }
  return scripted.body;
};

/**
 * The transactions service, as this screen addresses it. Every endpoint this story is
 * allowed to touch is answered from a shared factory; anything else fails loudly,
 * because a second delete call or a new "one file's requests" endpoint is exactly the
 * drift these tests exist to catch (R9/BR4).
 */
const route = async (
  endpoint: string,
  method: string,
  config?: APIRequestConfig,
): Promise<unknown> => {
  const path = String(endpoint);
  const verb = method.toUpperCase();

  if (verb === 'DELETE' && /\/v1\/files(\?|$)/.test(path)) {
    deleteRequests.push({
      logId: logIdIn(path, config),
      lastChangedUser: config?.lastChangedUser,
    });
    return deliver(deleteScript);
  }
  if (path.includes('/v1/file-logs')) {
    return deliver(fileLogsScript);
  }
  if (path.includes('/v1/transactions')) {
    return deliver(transactionsScript);
  }

  throw new Error(
    `Unexpected ${verb} ${path}. This screen reads the file-logs list and — only for ` +
      'a file that has imported — the whole expense-request list, and mutates ' +
      'through DELETE /v1/files?LogId= alone (see the implementation contract above).',
  );
};

const setupUser = () =>
  userEvent.setup({
    // Radix puts `pointer-events: none` on the body while a modal is open; jsdom then
    // reports the dialog's own controls as un-clickable even though a real browser
    // lets them through.
    pointerEventsCheck: PointerEventsCheckLevel.Never,
  });

/** Nothing to do — this surface never retries a validation. */
const ignoreRetry = (): void => undefined;

/**
 * The Expense files list as `/upload` mounts it: inside the root layout's toast
 * composition, with whatever the SERVER decided about the person watching.
 */
const renderList = async (
  props: { viewerRoles?: string[]; actingUploader?: string } = {},
): Promise<() => void> => {
  const { unmount } = render(
    <ToastProvider>
      <SubmittedFilesList {...props} />
      <ToastContainer />
    </ToastProvider>,
  );
  // The rows are what every assertion below is about, so nothing is asserted while the
  // list is still loading — an "action not offered" check would pass on a busy screen.
  await screen.findByRole('table');
  return unmount;
};

/** The file's OWN page's actions, as `upload/file/page.tsx` mounts them. */
const renderFilePageActions = async (file: FileLog): Promise<() => void> => {
  const { unmount } = render(
    <ToastProvider>
      <SubmittedFileActions
        file={file}
        actingUploader={ACTING_UPLOADER}
        onRetried={ignoreRetry}
      />
      <ToastContainer />
    </ToastProvider>,
  );
  await screen.findByRole('button', { name: DELETE });
  return unmount;
};

/**
 * The table row for a named file — scoped by the file's own name rather than by
 * index, so no assertion depends on the order the service returned. Narrowed to inside
 * the table, because on this screen the file's name also appears in the confirmation.
 */
const rowFor = (fileName: string): HTMLElement => {
  const row = within(screen.getByRole('table'))
    .getByText(fileName)
    .closest('tr');
  if (row === null) {
    throw new Error(
      `No table row found for "${fileName}" — the submitted files list must render ` +
        'one table row per file (see the implementation contract above).',
    );
  }
  return row;
};

/**
 * Where a file's name sits in the table's own text. Two files' positions compared is
 * how "the row stayed exactly where it was" is stated without selecting a row by
 * index — the thing that would make the assertion depend on the very order it is
 * supposed to be checking.
 */
const positionOf = (fileName: string): number => {
  const listed = screen.getByRole('table').textContent ?? '';
  const at = listed.indexOf(fileName);
  if (at < 0) {
    throw new Error(
      `"${fileName}" is not listed at all, so it cannot have stayed where it was.`,
    );
  }
  return at;
};

/**
 * The app's in-app notification surface (the root layout's `ToastContainer`), which
 * renders nothing at all while there is nothing to tell the user — so its absence IS
 * "no notification was raised".
 */
const notificationSurface = (): HTMLElement | null =>
  screen.queryByRole('region', { name: /notifications/i });

/** Whether a control is offered AT ALL — hidden elements included, so a greyed-out or
 * `aria-hidden` stand-in fails exactly as a visible one would (UI-24). */
const offeredControls = (name: RegExp): HTMLElement[] =>
  screen.queryAllByRole('button', { name, hidden: true });

/**
 * An element's text once it has stopped changing — two identical readings in a row.
 *
 * The imported-file confirmation is briefly busy while the request count is read, so
 * capturing its text immediately would compare two "counting…" states and prove
 * nothing. Waiting for stability rather than for a particular sentence is what keeps
 * this file from restating wording story 2 owns.
 */
const settledTextOf = async (element: HTMLElement): Promise<string> => {
  let previous: string | undefined;
  let settled = '';
  await waitFor(() => {
    const current = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (current === '' || current !== previous) {
      previous = current;
      throw new Error('The confirmation is still settling…');
    }
    settled = current;
  });
  return settled;
};

/** Opens the confirmation from a row of the list, and reads it once it has settled. */
const confirmationTextFromRow = async (
  file: FileLog,
  files: FileLog[],
): Promise<string> => {
  serveFiles(files);
  const user = setupUser();
  const close = await renderList({
    viewerRoles: [ROLE_IMPORTER],
    actingUploader: ACTING_UPLOADER,
  });

  await user.click(
    within(rowFor(file.CurrentFileName)).getByRole('button', { name: DELETE }),
  );
  const text = await settledTextOf(await screen.findByRole('alertdialog'));

  close();
  return text;
};

/** Opens the confirmation on the file's OWN page, and reads it once it has settled. */
const confirmationTextFromFilePage = async (file: FileLog): Promise<string> => {
  const user = setupUser();
  const close = await renderFilePageActions(file);

  await user.click(screen.getByRole('button', { name: DELETE }));
  const text = await settledTextOf(await screen.findByRole('alertdialog'));

  close();
  return text;
};

describe('Epic file-deletion, Story 3: deleting a file straight from the files list', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    fileLogsScript = { body: fileLogListResponse([]) };
    transactionsScript = { body: transactionListResponse([]) };
    deleteScript = { body: deleteSuccessResponse() };
    deleteRequests = [];

    mockGet.mockImplementation(
      (endpoint: string, params?: APIRequestConfig['params']) =>
        route(endpoint, 'GET', { params }),
    );
    mockApiClient.mockImplementation(
      (endpoint: string, config?: APIRequestConfig) =>
        route(endpoint, config?.method ?? 'GET', config),
    );
    mockDel.mockImplementation((endpoint: string, lastChangedUser?: string) =>
      route(endpoint, 'DELETE', { lastChangedUser }),
    );
  });

  // AC-1
  it("offers the Importer a delete action on every row whatever its status, worded exactly as on the file's own page", async () => {
    // One file per status the app knows — including `Imported`, which is the whole
    // point of BR1: the shipped action was hidden once a file had imported, and this
    // epic deliberately reverses that.
    const files = fileLogsInEveryStatus();
    serveFiles(files);

    const close = await renderList({
      viewerRoles: [ROLE_IMPORTER],
      actingUploader: ACTING_UPLOADER,
    });

    files.forEach((file) => {
      const row = rowFor(file.CurrentFileName);
      // The row still says what it always said...
      expect(within(row).getByText(file.CurrentStatus)).toBeInTheDocument();
      // ...and now also offers the delete, whatever that status is.
      expect(
        within(row).getByRole('button', { name: DELETE }),
      ).toBeInTheDocument();
    });

    // The renamed vocabulary reaches this surface too (R4): nothing here reads
    // "Cancel file", the wording story 1 retires on the file's own page.
    expect(screen.queryAllByText(/cancel file/i)).toEqual([]);
    close();

    // "Worded exactly as on the file's own page" is asserted by asking the file's own
    // page for the same control with the SAME pattern — so a rename on either surface
    // fails here rather than letting the two drift into different vocabulary.
    const closeFilePage = await renderFilePageActions(
      importedFileToDelete().file,
    );
    expect(screen.getByRole('button', { name: DELETE })).toBeInTheDocument();
    closeFilePage();
  });

  // AC-2 — the polarity trap. `viewerRoles` absent means "still notify"; the acting
  // Importer absent must mean "no delete at all". Both halves are checked here,
  // because a developer who copies the first default into the second hands the delete
  // to a session the server never authorised.
  it('carries no delete control for an Approver, and none at all when no acting Importer was supplied — while everything the list already did is unchanged', async () => {
    const files = fileLogsInEveryStatus();
    serveFiles(files);

    // THE CONTROL CASE, and it is not optional: the same list, same rows, WITH an
    // acting Importer, does offer the delete. Without it the two absences below would
    // be satisfied by a list that offers deletion to nobody at all — which is every
    // list this project has ever shipped, and would make this criterion vacuous.
    const closeImporter = await renderList({
      viewerRoles: [ROLE_IMPORTER],
      actingUploader: ACTING_UPLOADER,
    });
    files.forEach((file) => {
      expect(
        within(rowFor(file.CurrentFileName)).getByRole('button', {
          name: DELETE,
        }),
      ).toBeInTheDocument();
    });
    closeImporter();

    // An Approver's list, exactly as `/upload` renders it for them: their roles are
    // known, and the server decided they may not delete, so no acting Importer came
    // with it.
    const closeApprover = await renderList({ viewerRoles: [ROLE_APPROVER] });

    files.forEach((file) => {
      const row = rowFor(file.CurrentFileName);
      // Everything the list already did for them still happens: the row, the
      // service's own status, and the way into the file's own page as a real link.
      expect(within(row).getByText(file.CurrentStatus)).toBeInTheDocument();
      expect(row).toHaveTextContent(file.RecordCount);
      expect(within(row).getByRole('link', { name: /open/i })).toHaveAttribute(
        'href',
        submittedFileAddress(file),
      );
      // And no row offers the delete — absent, not disabled.
      expect(within(row).queryAllByRole('button', { name: DELETE })).toEqual(
        [],
      );
    });
    expect(offeredControls(DELETE)).toEqual([]);
    expect(screen.queryAllByText(/delete file/i)).toEqual([]);
    closeApprover();

    // The same list, told nothing at all about who is watching — the caller shape
    // `expense-file-upload` story 3 pinned. The new prop's ABSENCE must mean no
    // delete...
    const [validating, failed] = fileLogProgression([
      FILE_STATUS_VALIDATING,
      FILE_STATUS_VALIDATION_FAILED,
    ]);
    serveFiles([validating]);
    const closeUnspecified = await renderList();

    expect(offeredControls(DELETE)).toEqual([]);
    expect(screen.queryAllByText(/delete file/i)).toEqual([]);

    // ...while `viewerRoles`' absence keeps meaning exactly what it always meant. A
    // file is submitted elsewhere on the screen, the list asks the service again, and
    // this file has meanwhile failed validation: the uploader is still told, by name,
    // with nothing about the new prop changing that.
    serveFiles([failed]);
    await act(async () => {
      announceFileSubmitted();
    });

    await waitFor(() => {
      expect(
        within(rowFor(failed.CurrentFileName)).getByText(
          FILE_STATUS_VALIDATION_FAILED,
        ),
      ).toBeInTheDocument();
    });
    const notification = await screen.findByRole('region', {
      name: /notifications/i,
    });
    expect(notification).toHaveTextContent(failed.CurrentFileName);
    expect(notification).toHaveTextContent(/rejected/i);

    // And the re-read did not quietly grow a delete control either.
    expect(offeredControls(DELETE)).toEqual([]);
    closeUnspecified();

    // An Approver, on the other hand, is still not told about another person's
    // rejected rows — the gating `viewerRoles` already expressed, untouched.
    serveFiles([validating]);
    const closeApproverWatching = await renderList({
      viewerRoles: [ROLE_APPROVER],
    });
    serveFiles([failed]);
    await act(async () => {
      announceFileSubmitted();
    });
    await waitFor(() => {
      expect(
        within(rowFor(failed.CurrentFileName)).getByText(
          FILE_STATUS_VALIDATION_FAILED,
        ),
      ).toBeInTheDocument();
    });
    expect(notificationSurface()).not.toBeInTheDocument();
    expect(offeredControls(DELETE)).toEqual([]);
    closeApproverWatching();
  });

  // AC-3 — the same confirmation, not a second one. Nothing here restates story 2's
  // wording: each shape is opened from BOTH surfaces for the same file and the two
  // readings must be identical, so a dialog built for this surface fails however
  // convincing its sentences are.
  it("opens the same confirmation a row's file would show on its own page — counts, short warning and unreadable count alike", async () => {
    // 1. The imported file: the request-count confirmation (R6).
    const imported = importedFileToDelete();
    serveTransactions(imported.transactions);

    const countsFromRow = await confirmationTextFromRow(
      imported.file,
      imported.fileLogs,
    );
    const countsFromFilePage = await confirmationTextFromFilePage(
      imported.file,
    );
    expect(countsFromRow).toBe(countsFromFilePage);

    // It genuinely counted this file's own requests — the response it read is full of
    // other files' rows, several already decided, because the narrowing is
    // client-side on `FileLogId` (BR4).
    expect(countsFromRow).toContain(imported.file.CurrentFileName);
    expect(countsFromRow).toMatch(
      new RegExp(`\\b${String(imported.expected.total)}\\b`),
    );
    expect(countsFromRow).toMatch(
      new RegExp(`\\b${String(imported.expected.approved)}\\b`),
    );
    expect(countsFromRow).toMatch(
      new RegExp(`\\b${String(imported.expected.rejected)}\\b`),
    );
    // ...and it did not report the whole system's requests as this file's.
    expect(countsFromRow).not.toMatch(
      new RegExp(`\\b${String(imported.expectedIfUnfiltered.total)}\\b`),
    );
    expect(countsFromRow).not.toMatch(
      new RegExp(`\\b${String(imported.expectedIfUnfiltered.approved)}\\b`),
    );

    // 2. A file that never imported, in every status that means: the short warning
    // (R7). The requests read is scripted to FAIL throughout, which is how "no count
    // is involved here" shows up as an observable difference rather than as a count
    // of calls — a surface that read anyway would land in the unreadable-count state
    // below instead.
    refuseCountRead();
    const shortWarnings: string[] = [];
    for (const scenario of filesNeverImportedToDelete()) {
      const fromRow = await confirmationTextFromRow(
        scenario.file,
        scenario.fileLogs,
      );
      const fromFilePage = await confirmationTextFromFilePage(scenario.file);

      expect(fromRow).toBe(fromFilePage);
      expect(fromRow).toContain(scenario.file.CurrentFileName);
      shortWarnings.push(fromRow);
    }

    // 3. The imported file whose count cannot be read: the third, distinct state
    // (R8/BR5) — still the same on both surfaces...
    const unreadableFromRow = await confirmationTextFromRow(
      imported.file,
      imported.fileLogs,
    );
    const unreadableFromFilePage = await confirmationTextFromFilePage(
      imported.file,
    );
    expect(unreadableFromRow).toBe(unreadableFromFilePage);

    // ...and never the harmless-sounding short warning, nor the counted one. A row's
    // delete may not describe an imported file as having nothing to lose just because
    // the count read failed.
    shortWarnings.forEach((shortWarning) => {
      expect(unreadableFromRow).not.toBe(shortWarning);
    });
    expect(unreadableFromRow).not.toBe(countsFromRow);
    expect(unreadableFromRow).toContain(imported.file.CurrentFileName);
  });

  // AC-5
  it('leaves the row exactly where it was and says what the service said when a delete asked for from the list is refused', async () => {
    const scenario = importedFileToDelete();
    // The file under test sits BETWEEN two others, so "it stayed where it was" is a
    // statement about its neighbours rather than about a row merely existing.
    const [before, after] = otherFilesInTransactionsList();
    serveFiles([before, scenario.file, after]);
    serveTransactions(scenario.transactions);
    // The genuinely untested case (BR6): the service refuses to delete a file whose
    // rows have already left staging, and says so in its own words.
    deleteScript = { failure: REFUSED_DELETE };

    const user = setupUser();
    const close = await renderList({
      viewerRoles: [ROLE_IMPORTER],
      actingUploader: ACTING_UPLOADER,
    });

    await user.click(
      within(rowFor(scenario.file.CurrentFileName)).getByRole('button', {
        name: DELETE,
      }),
    );
    const confirmation = await screen.findByRole('alertdialog');
    await user.click(
      within(confirmation).getByRole('button', { name: CONFIRM_DELETE }),
    );

    // The delete was genuinely attempted, naming this file and attributed to the
    // signed-in Importer — the audit identity the service requires (BR7).
    const attempt = {
      logId: String(scenario.file.Id),
      lastChangedUser: ACTING_UPLOADER,
    };
    await waitFor(() => {
      expect(deleteRequests).toEqual([attempt]);
    });

    // The service's own sentence reached the user, and the client's internal
    // placeholder did not.
    expect(await screen.findByText(DELETE_REFUSED_MESSAGE)).toBeInTheDocument();
    expect(
      screen.queryByText(CLIENT_FALLBACK_MESSAGES.serverError),
    ).not.toBeInTheDocument();
    // Nobody is held inside a dialog to read why nothing happened.
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    // The row is still there, unchanged, and still between the same two neighbours —
    // nothing about the screen suggests the file went anywhere.
    const row = rowFor(scenario.file.CurrentFileName);
    expect(within(row).getByText(FILE_STATUS_IMPORTED)).toBeInTheDocument();
    expect(row).toHaveTextContent(scenario.file.RecordCount);
    expect(within(row).getByRole('link', { name: /open/i })).toHaveAttribute(
      'href',
      submittedFileAddress(scenario.file),
    );
    expect(positionOf(before.CurrentFileName)).toBeLessThan(
      positionOf(scenario.file.CurrentFileName),
    );
    expect(positionOf(scenario.file.CurrentFileName)).toBeLessThan(
      positionOf(after.CurrentFileName),
    );
    // A refusal on the list is not a reason to send the user anywhere — returning to
    // the list is the DETAIL page's behaviour, and only on success.
    expect(navigationTargets()).toEqual([]);

    // And the delete can be asked for again: the control is still on the row, the
    // confirmation still opens, and confirming it really does reach the service a
    // second time for the same file, with the same audit identity.
    // Re-queried rather than reused, so this is the row as it stands NOW — not a node
    // captured before the refusal was reported.
    await user.click(
      within(rowFor(scenario.file.CurrentFileName)).getByRole('button', {
        name: DELETE,
      }),
    );
    const reopened = await screen.findByRole('alertdialog');
    await user.click(
      within(reopened).getByRole('button', { name: CONFIRM_DELETE }),
    );

    await waitFor(() => {
      expect(deleteRequests).toEqual([attempt, attempt]);
    });
    expect(
      within(screen.getByRole('table')).getByText(
        scenario.file.CurrentFileName,
      ),
    ).toBeInTheDocument();

    close();
  });
});
