/**
 * Story Metadata:
 * - Epic: files-view-redesign — Story 5: the rejected rows, and everything you can do
 *   to a file
 * - Route: /upload/file
 * - Target File: web/src/components/files/RejectedRows.tsx (plus
 *   FileDownloadActions.tsx, SubmittedFileActions.tsx, CorrectionRowsDownload.tsx,
 *   DeleteFileConfirmation.tsx)
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-2 — a rejected row still reveals its OWN full account number by a deliberate
 *   action and no other row's, and the correction file keeps the masking convention it
 *   already applied (whole numbers — `correctionCsv.ts` BR4's documented exception).
 * - AC-4 — every control is still offered exactly when and to whom it was: retry only
 *   while validation has failed and only to an Importer, delete only to an Importer,
 *   both downloads to either role, the error-file download only when the service
 *   reported one (`HasBulkErrorFile`) — and a control that is not offered is ABSENT
 *   from the page, never greyed out.
 * - AC-5 — each control still shows its own wait and reports its own refusal in its
 *   existing wording, deleting still asks in its three existing shapes, and a
 *   confirmed delete still leaves the reader where it did before (the Expense files
 *   list).
 *
 * AC-1 (the ruled-listing treatment: thin row lines, small capitalised headings,
 * right-aligned tabular figures, mono account numbers, no card) and AC-3 (every
 * control as small capitalised text on a line, no boxed buttons left) are tagged
 * `none`. Both are judged by eye on a real screen: jsdom computes no layout, reports
 * every element at 0×0 and knows nothing of a typeface, so the only Vitest assertion
 * available for either would be a re-statement of a Tailwind class string — the exact
 * anti-pattern this file must not contain. They are on the story's manual checklist.
 * AC-6 (every control reachable and completable by keyboard, showing where the focus
 * is) is this story's Playwright spec — a real browser's focus ring and tab order,
 * deliberately not duplicated here (testing-policy.md § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS — the safety net for a restyle of five components
 * ---------------------------------------------------------------------------
 * This story changes how the rejected rows and the file's five controls are
 * PRESENTED, and nothing about what they do (epic brief BR1/BR2: no new capability,
 * no permission change, no new endpoint). Every criterion below is therefore a
 * PRESERVATION criterion, and this file is the net under the restyle: the behaviour
 * layer in `lib/files/{correctionCsv,deleteConfirmation,deliverFile,defectWording}.ts`
 * and `lib/auth/identity.ts` must be reused untouched, not reimplemented behind a new
 * face. A reimplementation is how a gating rule or a piece of wording changes silently
 * while the screen still looks right.
 *
 * So the assertions reach for the SHARED behaviour layer's own exports where the
 * wording is shared across two surfaces and the story says to reuse it verbatim
 * (`deleteConfirmation.ts`'s three sentence-runs and its three control labels), and
 * for the requirement's own literal where the wording belongs to the one surface under
 * restyle (each download's wait and refusal title, retry's and delete's waits and
 * refusal titles). A restyle that keeps that layer passes; one that invents its own
 * wording fails, which is the point.
 *
 * The ONE deliberate re-implementation is the account-number mask (`maskedTailOf`):
 * its expected value is computed here from the raw fixture rather than imported from
 * `lib/transactions/display`, because importing the production helper would make a
 * POPIA assertion agree with whatever that helper happens to do.
 *
 * ⚠ NO RED PHASE, AND THAT IS THE HONEST OUTCOME. Every criterion this file covers is
 * a "still", not a "now": AC-2, AC-4 and AC-5 all require behaviour that is ALREADY
 * shipped to survive the restyle unchanged. So these eight tests pass against the
 * pre-restyle code by design — a red run here does not mean the story is unimplemented,
 * it means the restyle broke something. The two criteria this story genuinely changes
 * (AC-1 and AC-3) are the typographic ones, and they are judged by eye on the manual
 * checklist, because the only Vitest assertion available for them would be a class
 * string. Run this file BEFORE touching the components and AFTER: the pair of runs is
 * the whole value.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE UNITS ARE THE EXISTING COMPONENTS, under their existing names and prop
 *    shapes: `RejectedRows({ file, refreshSignal })`,
 *    `FileDownloadActions({ file })`, `SubmittedFileActions({ file, actingUploader,
 *    onRetried })`, `CorrectionRowsDownload({ rejectedRows })` and
 *    `SubmittedFileDetail({ logId, actingUploader })`. No second "redesigned"
 *    component beside any of them, and no new route.
 * 2. TABLE SEMANTICS STAY in the rejected-rows listing. A ruled listing is the Shadcn
 *    `table` primitive restyled (CLAUDE.md §1) — one `row` per rejected row, its own
 *    `columnheader` per column. The reveal assertions below find a row by its MASKED
 *    account number and then work inside that row, so losing row semantics is a
 *    failure here, not a restyle.
 * 3. MASKING HAS EXACTLY ONE HOME: `components/requests/MaskedAccountNumber.tsx`.
 *    Reuse it in whatever the restyled cell becomes — never inline a mask, never put
 *    the full value in a `title`, a `data-` attribute or any other corner of the DOM,
 *    and never add a reveal-all (POPIA, project.md §Compliance). The reveal stays
 *    per-row, keyed to the loaded answer, so a fresh read is fully masked again.
 * 4. THE CORRECTION FILE AND THE SCREEN DISAGREE ON PURPOSE. The screen masks; the
 *    file writes account numbers WHOLE, because it round-trips through an upload
 *    contract with no masked-value concept (`correctionCsv.ts` BR4). That convention
 *    is unchanged by this story: `lastFourDigitsOf` and `MaskedAccountNumber` must
 *    never appear in the file-building path.
 * 5. GATING IS UNCHANGED, AND HIDDEN-NEVER-DISABLED APPLIES TO ALL FIVE CONTROLS.
 *    Retry: only while `CurrentStatus` is `Validation failed`, and only for a session
 *    `actingUploaderIn` named. Delete: only for that same session, in EVERY status.
 *    Both downloads and the rows-to-fix download: no role check at all — they take no
 *    session and no role prop, and the `hasRole(...) && …` shape must not be copied
 *    into them. The error-file download: only when `HasBulkErrorFile === 'Yes'` (the
 *    STRING — a truthiness check offers it for `'No'` too). A control a session or a
 *    file does not get is LEFT OUT of the markup; the queries below find hidden and
 *    disabled controls too, so a greyed-out stand-in fails exactly as a visible one
 *    would.
 * 6. EACH CONTROL KEEPS ITS OWN WAIT AND ITS OWN REFUSAL. The two downloads have
 *    per-download state by design: both files can be on their way at once, and one
 *    shared flag would let whichever answered first clear the other's announced wait
 *    or overwrite its refusal. Neither is disabled while its file is on its way.
 *    Retry and delete report their own titles, in the SERVICE's own words, on the
 *    screen behind a closed confirmation, with the file left exactly as it was.
 * 7. THE DELETE CONFIRMATION IS THE SHARED `ConfirmAction` PRIMITIVE and the shared
 *    wording in `lib/files/deleteConfirmation.ts` — three shapes (never-imported
 *    short warning; an imported file's real counted numbers; the count-could-not-be-
 *    read state carrying the service's reason) and the three-phrase convention
 *    (`Delete file` asks, `Delete the file` does it, `Keep the file` backs out).
 *    Restyle nothing inside it. The count comes from the service's TRANSACTION ROWS,
 *    never from `FileLog.RecordCount` — the fixture below deliberately disagrees with
 *    itself to prove that. A confirmed delete still sends the reader to the Expense
 *    files list, by `replace`.
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy), plus `next/navigation` and `next/link` —
 * libraries at the client-navigation boundary with no App Router context in jsdom, and
 * `URL.createObjectURL`, which jsdom does not implement at all. `lib/api/files.ts`,
 * `lib/files/*`, `lib/auth/identity.ts`, the Shadcn/Radix dialog and the real
 * `MaskedAccountNumber` are all the REAL production code, so what the user meets is
 * asserted as rendered text. Every response body comes from the project-wide
 * `@/mocks/data/*` factories the Playwright layer shares, and the two roles come from
 * the project-wide identity source, so the layers cannot drift onto different data or
 * different people.
 *
 * Render scope is per criterion (testing-policy.md § Render scope): the ONE claim that
 * is genuinely about the page — "a control this role does not get is absent from the
 * page" — renders the whole `/upload/file` surface; every other claim renders the one
 * component that owns it. No fake timers: a file whose validation has failed is not in
 * progress, so nothing on these surfaces runs a clock.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, {
  PointerEventsCheckLevel,
} from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the five shipped surfaces this story restyles, plus
// the page that composes them.
import { CorrectionRowsDownload } from '@/components/files/CorrectionRowsDownload';
import { FileDownloadActions } from '@/components/files/FileDownloadActions';
import { RejectedRows } from '@/components/files/RejectedRows';
import { SubmittedFileActions } from '@/components/files/SubmittedFileActions';
import { SubmittedFileDetail } from '@/components/files/SubmittedFileDetail';
import { apiClient, get } from '@/lib/api/client';
import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';
import {
  FILE_BULK_ERRORS_DOWNLOAD_ENDPOINT,
  FILE_DELETE_ENDPOINT,
  FILE_DOWNLOAD_ENDPOINT,
  FILE_LOGS_ENDPOINT,
  FILE_PROCESS_LOGS_ENDPOINT,
  FILE_RETRY_VALIDATION_ENDPOINT,
  FILE_VALIDATION_ERRORS_ENDPOINT,
} from '@/lib/api/files';
import { TRANSACTIONS_ENDPOINT } from '@/lib/api/transactions';
import { UPLOAD_PATH } from '@/lib/auth/access-map';
// The ONE server-side expression that decides who may act on a file. Driving the
// gating through it (rather than hand-writing `undefined`) is what makes AC-4 a claim
// about the ROLES and not about a prop this test chose.
import { actingUploaderIn, displayNameOf } from '@/lib/auth/identity';
// The reused behaviour layer: the preview's rejected rows are composed exactly as
// `ImportPreview` composes them, so the correction control under test receives the
// same rows in production and here.
import { rowsToFixIn } from '@/lib/files/correctionCsv';
// The SHARED confirmation wording, reached from both surfaces the delete is offered on
// — imported rather than retyped precisely because this story must reuse it untouched
// (see the note above about where each expected string comes from).
import {
  CONFIRM_DELETE_LABEL,
  COUNTING_REQUESTS_MESSAGE,
  COUNT_UNAVAILABLE_MESSAGE,
  KEEP_FILE_LABEL,
  NEVER_IMPORTED_MESSAGE,
  importedConfirmationMessage,
} from '@/lib/files/deleteConfirmation';
import { importPreviewRows } from '@/lib/files/importPreviewRows';
// Project-wide factories — the single source both test layers share. Never a
// hand-written response body.
import {
  DELETE_REFUSED_MESSAGE,
  FILE_STATUS_VALIDATION_FAILED,
  RETRY_REFUSED_MESSAGE,
  deleteSuccessResponse,
  fileLogListResponse,
  fileLogWithStatus,
  fileLogsInEveryStatus,
  retrySuccessResponse,
  uploadFailureResponse,
} from '@/mocks/data/file-log';
import { fileProcessLogListResponse } from '@/mocks/data/file-process-log';
import { userInfoFor } from '@/mocks/data/identity';
import { previewWithRejectedRows } from '@/mocks/data/submitted-file';
import {
  TRANSACTION_LIST_FAILURE_MESSAGE,
  importedFileWithRequests,
  transactionListFailureResponse,
  transactionListResponse,
} from '@/mocks/data/transaction';
import {
  invalidRowsForEveryDefect,
  validationErrorsResponse,
} from '@/mocks/data/validation-error';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/types/auth';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

import type { APIError, APIRequestConfig } from '@/types/api';
import type { ValidationErrorRow } from '@/types/files';

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
  useSearchParams: () => new URLSearchParams({ LogId: '5001' }),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/**
 * `next/link` stubbed with the plain anchor it renders in the browser, so the file's
 * page keeps its "back to Expense files" link without an App Router context. A
 * library, never the code under test.
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

/**
 * Blob addresses, which jsdom does not implement at all.
 *
 * Handing a file over means turning bytes into something the browser can save, and
 * `URL.createObjectURL` is how `deliverFile` does it. These are honest stand-ins for a
 * browser API this environment lacks (the same treatment `vitest.setup.ts` gives
 * `matchMedia` and pointer capture); the Blob handed over IS the file the user
 * receives, which is what AC-2's second half reads back.
 */
const deliveredFiles: Blob[] = [];

URL.createObjectURL = ((contents: Blob): string => {
  deliveredFiles.push(contents);
  return `blob:file-${String(deliveredFiles.length)}`;
}) as typeof URL.createObjectURL;

URL.revokeObjectURL = ((): void => {}) as typeof URL.revokeObjectURL;

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;
const mockGet = get as unknown as ReturnType<typeof vi.fn>;

/* -------------------------------------------------------------------------- */
/* The controls' own wording — the requirement's literals, anchored            */
/* -------------------------------------------------------------------------- */

/**
 * The five controls this story restyles, matched on their WHOLE accessible name so a
 * differently-worded second control cannot satisfy a query by accident, and so the
 * asking `Delete file` can never be mistaken for the confirming `Delete the file`.
 */
const RETRY = /^retry validation$/i;
const DELETE_FILE = /^delete file$/i;
const ORIGINAL_DOWNLOAD = /^download original file$/i;
const ERROR_FILE_DOWNLOAD = /^download error file$/i;
const CORRECTION_DOWNLOAD = /^download rows to fix and re-upload$/i;

/** The per-row reveal's two states, which name what they act on as well as what they
 * do (the trailing `for <row>` is screen-reader-only, hence the unanchored end). */
const REVEAL_ACCOUNT_NUMBER = /^reveal account number/i;
const HIDE_ACCOUNT_NUMBER = /^hide account number/i;

/** Each download's own announced wait, and its own refusal title — worded per file, so
 * one download's wait can never be read as the other's (`FileDownloadActions`). */
const ORIGINAL_PREPARING = 'Preparing the original file for download…';
const ERROR_FILE_PREPARING = 'Preparing the error file for download…';
const ORIGINAL_REFUSED_TITLE = 'Could not download the original file';
const ERROR_FILE_REFUSED_TITLE = 'Could not download the error file';
const DOWNLOAD_ASK_AGAIN =
  'Choose the download again to ask for the file again.';

/** Retry's and delete's own waits and refusal titles (`SubmittedFileActions`). */
const RETRY_PREPARING = 'Asking for this file to be validated again…';
const DELETE_PREPARING = 'Deleting this file…';
const RETRY_REFUSED_TITLE = 'Could not start validation again';
const DELETE_REFUSED_TITLE = 'Could not delete this file';
const ACTION_ASK_AGAIN =
  'The file is exactly as it was. Choose the action again to ask once more.';

/** The heading `SubmittedFileActions` renders — absent, with everything under it, for
 * a session that may not act on the file. */
const ACTIONS_HEADING = /^actions$/i;

/**
 * A masked account number's four digits, computed from the raw fixture value.
 *
 * Deliberately NOT `lastFourDigitsOf` from `lib/transactions/display`: importing the
 * production helper would make this POPIA assertion agree with whatever that helper
 * does. The rule is stated here, independently — the last four DIGITS, ignoring the
 * grouping punctuation.
 */
const maskedTailOf = (accountNumber: string): string =>
  accountNumber.replace(/\D/g, '').slice(-4);

/* -------------------------------------------------------------------------- */
/* The transactions service, as these components address it                    */
/* -------------------------------------------------------------------------- */

/** Every endpoint any surface in this story reaches. */
type Endpoint =
  | 'fileLogs'
  | 'processLogs'
  | 'validationErrors'
  | 'originalDownload'
  | 'errorFileDownload'
  | 'transactions'
  | 'retry'
  | 'delete';

/** What one endpoint answers with. Replaced per test; a promise that never settles is
 * how a call is held in flight. */
type Answer = () => Promise<unknown>;

const answers = new Map<Endpoint, Answer>();

/**
 * Which endpoint a call is for, decided from the path and the verb the way the service
 * itself distinguishes them — the delete and the retry share `/v1/files` as a prefix,
 * so the more specific paths are matched first and the bare delete last.
 */
const endpointOf = (path: string, verb: string): Endpoint | undefined => {
  if (path.startsWith(FILE_RETRY_VALIDATION_ENDPOINT)) {
    return 'retry';
  }
  if (path.startsWith(FILE_BULK_ERRORS_DOWNLOAD_ENDPOINT)) {
    return 'errorFileDownload';
  }
  if (path.startsWith(FILE_DOWNLOAD_ENDPOINT)) {
    return 'originalDownload';
  }
  if (path.startsWith(FILE_VALIDATION_ERRORS_ENDPOINT)) {
    return 'validationErrors';
  }
  if (path.startsWith(FILE_PROCESS_LOGS_ENDPOINT)) {
    return 'processLogs';
  }
  if (path.startsWith(FILE_LOGS_ENDPOINT)) {
    return 'fileLogs';
  }
  if (path.startsWith(TRANSACTIONS_ENDPOINT)) {
    return 'transactions';
  }
  if (verb === 'DELETE' && path.startsWith(FILE_DELETE_ENDPOINT)) {
    return 'delete';
  }
  return undefined;
};

/**
 * Answers whichever endpoint was addressed, and fails loudly on anything else — a
 * SECOND wrapper or a newly invented address is exactly the drift a restyle must not
 * introduce (epic brief BR2: no new API call).
 */
const respond = (endpoint: unknown, verb: string): Promise<unknown> => {
  const path = String(endpoint);
  const which = endpointOf(path, verb.toUpperCase());
  const answer = which === undefined ? undefined : answers.get(which);
  if (answer === undefined) {
    return Promise.reject(
      new Error(
        `Unexpected ${verb.toUpperCase()} ${path}. This story adds no endpoint — see ` +
          'the implementation contract above.',
      ),
    );
  }
  return answer();
};

/** A call the service has not answered yet, and the two ways to answer it — so a test
 * can hold one control's request in flight while another's settles, which is the only
 * way to see whether the two interfere. */
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

const deferred = <T,>(): Deferred<T> => {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason: unknown) => void) | undefined;
  const promise = new Promise<T>((resolveIt, rejectIt) => {
    resolve = resolveIt;
    reject = rejectIt;
  });
  if (resolve === undefined || reject === undefined) {
    throw new Error(
      'A Promise executor runs synchronously, so this cannot happen — but the ' +
        'compiler cannot know that.',
    );
  }
  return { promise, resolve, reject };
};

/**
 * The `APIError` the shared client rejects with when the transactions service REFUSES
 * a call: its OWN placeholder on `message`, and the service's `Messages[]` on
 * `details` (`lib/api/client.ts` → 500 branch). That split is what makes every refusal
 * assertion below a real claim — the service's reason is only reachable through
 * `serviceDetailOf`, and the client's plumbing must never reach the user.
 */
const refusalCarrying = (messages: string[], endpoint: string): APIError => ({
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  details: messages,
  endpoint,
});

/** The service's own reason for refusing a download, from the shared refusal envelope
 * every file endpoint answers with. */
const DOWNLOAD_REFUSED_MESSAGE = uploadFailureResponse(
  'The stored file could not be read from the import share.',
).Messages[0];

const setupUser = () =>
  userEvent.setup({
    // Radix puts `pointer-events: none` on the body while a modal is open; jsdom then
    // reports the dialog's own controls as un-clickable even though a real browser
    // lets them through.
    pointerEventsCheck: PointerEventsCheckLevel.Never,
  });

/**
 * Whether a control is offered AT ALL — queried including hidden elements and without
 * regard to whether it is enabled, so a greyed-out or `aria-hidden` stand-in fails
 * exactly as a visible one would (hidden-never-disabled, contract note 5), and so
 * controls behind an open Radix modal are still seen.
 */
const controlsNamed = (name: RegExp): HTMLElement[] =>
  screen.queryAllByRole('button', { name, hidden: true });

/** The one control with this name. Fails loudly if the page carries two. */
const controlNamed = (name: RegExp): HTMLElement => {
  const found = controlsNamed(name);
  expect(found).toHaveLength(1);
  return found[0];
};

/** Where the reader was sent, if anywhere — read from both router methods, since
 * either would take them off the file's page. */
const navigationTargets = (): string[] =>
  [...mockReplace.mock.calls, ...mockPush.mock.calls]
    .map((args) => args[0])
    .filter((target): target is string => typeof target === 'string');

/** The bytes of a delivered file, as text. jsdom's `Blob` has no `text()`. */
const textOf = (contents: Blob): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(String(reader.result));
    });
    reader.addEventListener('error', () => {
      reject(new Error('The saved file could not be read back as text.'));
    });
    reader.readAsText(contents);
  });

/** The one file the app has handed the browser, read back as text. */
const savedFileText = async (): Promise<string> => {
  await waitFor(() => {
    expect(deliveredFiles).toHaveLength(1);
  });
  return textOf(deliveredFiles[0]);
};

/** The rejected-rows section, by the name its heading gives it. */
const rejectedRowsSection = (): Promise<HTMLElement> =>
  screen.findByRole('region', { name: /rejected rows/i });

/**
 * The rejected-rows listing once it has FINISHED READING — its announced wait is gone,
 * which is the honest signal: it goes when the rows arrive AND when they could not be
 * read, so a failed read produces "these rows are not here, here is the alert that is"
 * rather than a bare "could not find a row".
 */
const rejectedRowsSettled = async (): Promise<HTMLElement> => {
  const section = await rejectedRowsSection();
  await waitFor(() => {
    expect(within(section).queryByRole('status')).not.toBeInTheDocument();
  });
  return section;
};

/**
 * ONE rejected row, found by a value the reader can actually see in it — never by its
 * position in the listing. Every row in the fixture carries distinct last-four digits
 * precisely so that its own account number, masked or revealed, identifies it.
 */
const rowShowing = (section: HTMLElement, value: string): HTMLElement => {
  const matches = within(section)
    .getAllByRole('row')
    .filter((candidate) => candidate.textContent?.includes(value));
  expect(
    matches,
    `exactly one rejected row should show "${value}"`,
  ).toHaveLength(1);
  return matches[0];
};

/** How one row's account number reads while it is masked. */
const maskOf = (row: ValidationErrorRow): string =>
  `ending in ${maskedTailOf(String(row.AccountNumber))}`;

/** The preview section of the file's page, once it has finished reading the file. */
const previewSettled = async (): Promise<HTMLElement> => {
  const preview = await screen.findByRole('region', { name: /preview/i });
  await waitFor(() => {
    expect(within(preview).queryByRole('status')).not.toBeInTheDocument();
  });
  return preview;
};

describe('Epic files-view-redesign, Story 5: the rejected rows, and everything you can do to a file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deliveredFiles.length = 0;

    // Every endpoint answers something coherent by default, so a test only has to say
    // what is DIFFERENT about the case it is making.
    answers.clear();
    answers.set('fileLogs', () => Promise.resolve(fileLogListResponse()));
    answers.set('processLogs', () =>
      Promise.resolve(fileProcessLogListResponse()),
    );
    answers.set('validationErrors', () =>
      Promise.resolve(previewWithRejectedRows().validationErrors),
    );
    answers.set('originalDownload', () =>
      Promise.resolve(previewWithRejectedRows().blob()),
    );
    answers.set('errorFileDownload', () =>
      Promise.resolve(
        new Blob(['Row,Error\n3,Currency\n'], {
          type: 'application/octet-stream',
        }),
      ),
    );
    answers.set('transactions', () =>
      Promise.resolve(transactionListResponse()),
    );
    answers.set('retry', () => Promise.resolve(retrySuccessResponse()));
    answers.set('delete', () => Promise.resolve(deleteSuccessResponse()));

    mockGet.mockImplementation((endpoint: unknown) => respond(endpoint, 'GET'));
    mockApiClient.mockImplementation(
      (endpoint: unknown, config?: APIRequestConfig) =>
        respond(endpoint, config?.method ?? 'GET'),
    );
  });

  // AC-2
  it('reveals the full account number of the one rejected row the reader asked about, leaves every other row masked, and puts it back behind its mask', async () => {
    // Five rejected rows with five distinct last-four digits, so a row is identified by
    // its masked number rather than by where it sits in the listing.
    const rows = invalidRowsForEveryDefect();
    const [asked, ...others] = rows;
    const askedNumber = String(asked.AccountNumber);
    const user = setupUser();

    // The wire body from the shared factory, which serialises the rows into the
    // `JsonArray` STRING the service really sends — never a hand-written body.
    answers.set('validationErrors', () =>
      Promise.resolve(validationErrorsResponse(rows)),
    );

    render(
      <RejectedRows file={fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED)} />,
    );
    const section = await rejectedRowsSettled();

    // Every row starts masked — the whole value is nowhere in the markup, not in a
    // cell and not in an attribute a query could read it out of.
    for (const row of rows) {
      const listed = rowShowing(section, maskOf(row));
      expect(listed).not.toHaveTextContent(String(row.AccountNumber));
    }
    expect(section.innerHTML).not.toContain(askedNumber);

    // ONE deliberate action, on the row showing THIS mask.
    await user.click(
      within(rowShowing(section, maskOf(asked))).getByRole('button', {
        name: REVEAL_ACCOUNT_NUMBER,
      }),
    );

    // That row, and only that row, now shows its whole number — and it is the row that
    // was asked about, identified by the very number it has just revealed.
    await waitFor(() => {
      expect(within(section).getByText(askedNumber)).toBeVisible();
    });
    expect(rowShowing(section, askedNumber)).toHaveTextContent(
      String(asked.Description),
    );
    for (const other of others) {
      const otherNumber = String(other.AccountNumber);
      expect(within(section).queryByText(otherNumber)).not.toBeInTheDocument();
      expect(rowShowing(section, maskOf(other))).not.toHaveTextContent(
        otherNumber,
      );
    }

    // And the same deliberate action puts it back: the row that was revealed is the
    // row that can be re-masked, by the control that now says so.
    await user.click(
      within(rowShowing(section, askedNumber)).getByRole('button', {
        name: HIDE_ACCOUNT_NUMBER,
      }),
    );
    await waitFor(() => {
      expect(within(section).queryByText(askedNumber)).not.toBeInTheDocument();
    });
    expect(rowShowing(section, maskOf(asked))).toHaveTextContent(
      String(asked.Description),
    );
  });

  // AC-2
  it('writes account numbers WHOLE into the correction file, keeping the convention that file already had', async () => {
    // The rejected rows exactly as the preview composes them for this control, through
    // the production behaviour layer (contract note 1) — so the file built here is the
    // file the page builds.
    const preview = previewWithRejectedRows();
    const rowsToFix = rowsToFixIn(
      importPreviewRows(preview.rows, preview.rejections),
    );
    expect(rowsToFix).toHaveLength(preview.counts.rejected);
    const user = setupUser();

    render(<CorrectionRowsDownload rejectedRows={rowsToFix} />);
    await user.click(screen.getByRole('button', { name: CORRECTION_DOWNLOAD }));

    const file = await savedFileText();

    // The screen masks these very numbers (the criterion above); the FILE writes them
    // whole, because it has to round-trip through an upload contract that has no
    // masked-value concept (contract note 4). The two disagree deliberately, and this
    // story does not change that.
    for (const row of preview.rejectedRows) {
      expect(file).toContain(row.AccountNumber);
    }
    // No trace of the screen's mask, in either the decorative or the spoken form —
    // masking the file would dead-end the download → correct → re-upload loop.
    expect(file).not.toContain('•');
    expect(file).not.toContain('ending in');
  });

  // AC-4
  it('offers an Approver neither retry nor delete anywhere on the file’s page — absent, not greyed out — while all three downloads stay on offer to both roles', async () => {
    // ONE file, read twice: the only thing that differs between the two renders is who
    // is signed in, so an absence below is the role's doing and not an empty page.
    const preview = previewWithRejectedRows();
    answers.set('fileLogs', () =>
      Promise.resolve(fileLogListResponse([preview.file])),
    );
    answers.set('validationErrors', () =>
      Promise.resolve(preview.validationErrors),
    );
    answers.set('originalDownload', () => Promise.resolve(preview.blob()));

    const approver = actingUploaderIn(userInfoFor(ROLE_APPROVER));
    const importer = actingUploaderIn(userInfoFor(ROLE_IMPORTER));
    // The gate itself, stated once: the Approver is nobody this file may be acted on
    // by, and the Importer is somebody — decided by the production expression, not by
    // this test.
    expect(approver).toBeUndefined();
    expect(importer).toBe(displayNameOf(userInfoFor(ROLE_IMPORTER)));

    const asApprover = render(
      <SubmittedFileDetail
        logId={String(preview.file.Id)}
        actingUploader={approver}
      />,
    );
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: preview.file.CurrentFileName,
      }),
    ).toBeVisible();
    await previewSettled();

    // Nothing an Importer-only capability would render is in the markup at all: not
    // the controls, not the section that holds them.
    expect(controlsNamed(RETRY)).toEqual([]);
    expect(controlsNamed(DELETE_FILE)).toEqual([]);
    expect(
      screen.queryByRole('heading', { name: ACTIONS_HEADING }),
    ).not.toBeInTheDocument();

    // And everything granted to both roles IS there, and usable — the downloads take
    // no session at all, so a role check copied into them would show up right here.
    expect(controlNamed(ORIGINAL_DOWNLOAD)).toBeEnabled();
    expect(controlNamed(ERROR_FILE_DOWNLOAD)).toBeEnabled();
    expect(controlNamed(CORRECTION_DOWNLOAD)).toBeEnabled();
    asApprover.unmount();

    // The same file, to the Importer: both withheld controls appear, and the three
    // downloads are unchanged.
    render(
      <SubmittedFileDetail
        logId={String(preview.file.Id)}
        actingUploader={importer}
      />,
    );
    await previewSettled();
    expect(controlNamed(RETRY)).toBeEnabled();
    expect(controlNamed(DELETE_FILE)).toBeEnabled();
    expect(controlNamed(ORIGINAL_DOWNLOAD)).toBeEnabled();
    expect(controlNamed(ERROR_FILE_DOWNLOAD)).toBeEnabled();
    expect(controlNamed(CORRECTION_DOWNLOAD)).toBeEnabled();
  });

  // AC-4
  it('offers retry only while a file’s validation has failed, and the delete whatever its status', () => {
    const importer = actingUploaderIn(userInfoFor(ROLE_IMPORTER));

    // Every status the app knows, taken from the factory so a status added to the app
    // cannot silently escape this criterion. Each file is identified by its own status
    // in the failure message, never by its position in the list.
    for (const file of fileLogsInEveryStatus()) {
      const status = file.CurrentStatus;
      const { unmount } = render(
        <SubmittedFileActions
          file={file}
          actingUploader={importer}
          onRetried={vi.fn()}
        />,
      );

      const retryApplies = status === FILE_STATUS_VALIDATION_FAILED;
      expect(
        controlsNamed(RETRY).length,
        `retry must ${retryApplies ? '' : 'NOT '}be offered on a file whose status ` +
          `is "${status}" — and when it is not, it must be absent rather than greyed out`,
      ).toBe(retryApplies ? 1 : 0);

      // The delete has no status rule at all, and never had one restored to it.
      expect(
        controlsNamed(DELETE_FILE).length,
        `the delete must be offered on a file whose status is "${status}"`,
      ).toBe(1);

      unmount();
    }
  });

  // AC-4
  it('offers the error-file download only when the service reported an error file, and leaves it out of the markup entirely when it did not', () => {
    // The SAME status either way, so the only thing deciding the control is
    // `HasBulkErrorFile` — and the file that reported none keeps a `BulkErrorFile`
    // NAME, so a gate that looked at the name instead of the flag fails here.
    const reported = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED);
    expect(reported.HasBulkErrorFile).toBe('Yes');

    const withErrorFile = render(<FileDownloadActions file={reported} />);
    expect(controlNamed(ORIGINAL_DOWNLOAD)).toBeEnabled();
    expect(controlNamed(ERROR_FILE_DOWNLOAD)).toBeEnabled();
    withErrorFile.unmount();

    const notReported = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED, {
      HasBulkErrorFile: 'No',
    });
    expect(notReported.BulkErrorFile).toBeDefined();

    render(<FileDownloadActions file={notReported} />);
    expect(controlsNamed(ERROR_FILE_DOWNLOAD)).toEqual([]);
    // The file's own download is untouched by the other's absence.
    expect(controlNamed(ORIGINAL_DOWNLOAD)).toBeEnabled();
  });

  // AC-5
  it('gives each download its own wait and its own refusal, in its own wording, with neither able to clear or overwrite the other’s', async () => {
    const file = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED);
    const user = setupUser();

    // The original file is held in flight; the error file will be refused while it is
    // still on its way. Both controls stay usable throughout, which is the only reason
    // the two can be in different states at the same moment at all.
    const originalFile = deferred<Blob>();
    answers.set('originalDownload', () => originalFile.promise);
    answers.set('errorFileDownload', () =>
      Promise.reject(
        refusalCarrying(
          [DOWNLOAD_REFUSED_MESSAGE],
          FILE_BULK_ERRORS_DOWNLOAD_ENDPOINT,
        ),
      ),
    );

    render(<FileDownloadActions file={file} />);

    await user.click(controlNamed(ORIGINAL_DOWNLOAD));
    // Its own wait, naming its own file — and the control is NOT disabled while its
    // file is on its way (that would take the focus out from under a keyboard user).
    expect(await screen.findByText(ORIGINAL_PREPARING)).toBeVisible();
    expect(controlNamed(ORIGINAL_DOWNLOAD)).toBeEnabled();
    expect(screen.queryByText(ERROR_FILE_PREPARING)).not.toBeInTheDocument();

    await user.click(controlNamed(ERROR_FILE_DOWNLOAD));

    // The error file's refusal, under its OWN title and in the SERVICE's own words —
    // which travel on `details` for a 500, where `serviceMessageOf` alone finds
    // nothing.
    expect(await screen.findByText(ERROR_FILE_REFUSED_TITLE)).toBeVisible();
    expect(screen.getByText(DOWNLOAD_REFUSED_MESSAGE)).toBeVisible();
    expect(screen.getByText(DOWNLOAD_ASK_AGAIN)).toBeVisible();
    // The client's internal plumbing is never what a reader is shown.
    expect(
      screen.queryByText(CLIENT_FALLBACK_MESSAGES.serverError),
    ).not.toBeInTheDocument();

    // The other download is untouched by all of it: its wait is still announced, and
    // nothing says its file was refused.
    expect(screen.getByText(ORIGINAL_PREPARING)).toBeVisible();
    expect(screen.queryByText(ORIGINAL_REFUSED_TITLE)).not.toBeInTheDocument();

    // And when the held file finally arrives, ITS wait ends and the other's refusal
    // stays exactly where it was.
    originalFile.resolve(
      new Blob(['Reference,Amount\nTXN-1,10.00\n'], {
        type: 'application/octet-stream',
      }),
    );
    await waitFor(() => {
      expect(screen.queryByText(ORIGINAL_PREPARING)).not.toBeInTheDocument();
    });
    expect(screen.getByText(ERROR_FILE_REFUSED_TITLE)).toBeVisible();
    expect(await savedFileText()).toContain('TXN-1');
  });

  // AC-5
  it('announces retry’s and delete’s waits separately and reports each refusal under its own existing title, leaving the file and the reader exactly where they were', async () => {
    const file = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED);
    const importer = actingUploaderIn(userInfoFor(ROLE_IMPORTER));
    const user = setupUser();

    const retryCall = deferred<unknown>();
    answers.set('retry', () => retryCall.promise);

    render(
      <SubmittedFileActions
        file={file}
        actingUploader={importer}
        onRetried={vi.fn()}
      />,
    );

    // Retry: its own wait, in its own words — and NOT the delete's.
    await user.click(controlNamed(RETRY));
    expect(await screen.findByText(RETRY_PREPARING)).toBeVisible();
    expect(screen.queryByText(DELETE_PREPARING)).not.toBeInTheDocument();

    retryCall.reject(
      refusalCarrying([RETRY_REFUSED_MESSAGE], FILE_RETRY_VALIDATION_ENDPOINT),
    );

    // Its own refusal title, the service's own reason, and the sentence that says the
    // file is untouched — the wait and the refusal arriving as one moment, so a reader
    // never meets one without the other.
    expect(await screen.findByText(RETRY_REFUSED_TITLE)).toBeVisible();
    expect(screen.getByText(RETRY_REFUSED_MESSAGE)).toBeVisible();
    expect(screen.getByText(ACTION_ASK_AGAIN)).toBeVisible();
    expect(screen.queryByText(RETRY_PREPARING)).not.toBeInTheDocument();
    expect(
      screen.queryByText(CLIENT_FALLBACK_MESSAGES.serverError),
    ).not.toBeInTheDocument();
    // Both controls are still right there — asking again is choosing them again.
    expect(controlNamed(RETRY)).toBeEnabled();
    expect(controlNamed(DELETE_FILE)).toBeEnabled();

    // Delete: its own wait, its own title, its own reason — and the reader is not
    // held in a dialog to read why nothing happened.
    const deleteCall = deferred<unknown>();
    answers.set('delete', () => deleteCall.promise);

    await user.click(controlNamed(DELETE_FILE));
    const confirmation = await screen.findByRole('alertdialog');
    await user.click(
      within(confirmation).getByRole('button', {
        name: new RegExp(`^${CONFIRM_DELETE_LABEL}$`, 'i'),
      }),
    );

    expect(await screen.findByText(DELETE_PREPARING)).toBeVisible();
    expect(screen.queryByText(RETRY_PREPARING)).not.toBeInTheDocument();

    deleteCall.reject(
      refusalCarrying([DELETE_REFUSED_MESSAGE], FILE_DELETE_ENDPOINT),
    );

    expect(await screen.findByText(DELETE_REFUSED_TITLE)).toBeVisible();
    expect(screen.getByText(DELETE_REFUSED_MESSAGE)).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    // Nothing claims the file was deleted, and the reader stayed on its page.
    expect(
      screen.queryByText(deleteSuccessResponse().Messages[0]),
    ).not.toBeInTheDocument();
    expect(navigationTargets()).toEqual([]);
  });

  // AC-5
  it('still asks about a delete in its three existing shapes, counting the service’s own request rows, and still returns the reader to the Expense files list once one is accepted', async () => {
    const importer = actingUploaderIn(userInfoFor(ROLE_IMPORTER));
    const user = setupUser();

    /** Asks about the delete on whichever file is rendered, and hands back the
     * confirmation it opened. */
    const askAboutTheDelete = async (): Promise<HTMLElement> => {
      await user.click(controlNamed(DELETE_FILE));
      return screen.findByRole('alertdialog');
    };

    /* Shape one: a file that never imported. The short warning, and nothing about
       counting — its requests are never read at all, because it produced none. */
    const neverImported = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED);
    const first = render(
      <SubmittedFileActions
        file={neverImported}
        actingUploader={importer}
        onRetried={vi.fn()}
      />,
    );
    const shortWarning = await askAboutTheDelete();
    // It names the file it is about — nothing vague like "this file".
    expect(shortWarning).toHaveTextContent(neverImported.CurrentFileName);
    expect(shortWarning).toHaveTextContent(NEVER_IMPORTED_MESSAGE);
    expect(shortWarning).not.toHaveTextContent(COUNTING_REQUESTS_MESSAGE);
    expect(shortWarning).not.toHaveTextContent(COUNT_UNAVAILABLE_MESSAGE);
    // The three-phrase convention: the one that asks, the one that does it, and the
    // way out — all different, and no button anywhere reading "Cancel", which beside a
    // destructive choice called Delete would read as a second name for the action.
    expect(
      within(shortWarning).getByRole('button', {
        name: new RegExp(`^${CONFIRM_DELETE_LABEL}$`, 'i'),
      }),
    ).toBeVisible();
    expect(
      within(shortWarning).getByRole('button', {
        name: new RegExp(`^${KEEP_FILE_LABEL}$`, 'i'),
      }),
    ).toBeVisible();
    expect(controlsNamed(/cancel/i)).toEqual([]);
    first.unmount();

    /* Shape two: an imported file, described by the requests it really produced. Its
       own `RecordCount` deliberately disagrees, so a confirmation that read the file's
       self-reported figure instead of the service's rows says 999 and fails here. */
    const scenario = importedFileWithRequests({
      total: 40,
      approved: 12,
      rejected: 3,
      file: { RecordCount: '999' },
    });
    // The count is held in flight, so the wording the reader meets FIRST is observable
    // rather than a race with the read — the dialog paints its counting sentence from
    // the moment it opens, before any answer can have landed.
    const countCall = deferred<unknown>();
    answers.set('transactions', () => countCall.promise);
    const second = render(
      <SubmittedFileActions
        file={scenario.file}
        actingUploader={importer}
        onRetried={vi.fn()}
      />,
    );
    const counted = await askAboutTheDelete();
    // It says it is counting before it can say what it counted…
    expect(counted).toHaveTextContent(COUNTING_REQUESTS_MESSAGE);
    countCall.resolve(transactionListResponse(scenario.transactions));
    // …and then states the numbers the service's own rows add up to.
    await waitFor(() => {
      expect(counted).toHaveTextContent(
        importedConfirmationMessage(scenario.expected),
      );
    });
    // The file's own self-reported figure is NOT what it counted (contract note 7).
    expect(counted).not.toHaveTextContent(scenario.file.RecordCount);
    expect(counted).not.toHaveTextContent(COUNT_UNAVAILABLE_MESSAGE);
    second.unmount();

    /* Shape three: the same imported file, whose requests could NOT be counted. Its
       own state, carrying the service's reason — never a zero, and never the short
       warning, either of which would describe a file holding decided requests as
       harmless to delete. */
    answers.set('transactions', () =>
      Promise.reject(
        refusalCarrying(
          transactionListFailureResponse().Messages,
          TRANSACTIONS_ENDPOINT,
        ),
      ),
    );
    const third = render(
      <SubmittedFileActions
        file={scenario.file}
        actingUploader={importer}
        onRetried={vi.fn()}
      />,
    );
    const uncounted = await askAboutTheDelete();
    await waitFor(() => {
      expect(uncounted).toHaveTextContent(COUNT_UNAVAILABLE_MESSAGE);
    });
    expect(uncounted).toHaveTextContent(TRANSACTION_LIST_FAILURE_MESSAGE);
    expect(uncounted).not.toHaveTextContent(NEVER_IMPORTED_MESSAGE);
    expect(uncounted).not.toHaveTextContent(COUNTING_REQUESTS_MESSAGE);
    third.unmount();

    /* And a delete the service accepts still leaves the reader where it did before:
       back on the Expense files list, by a replace — so Back does not return them to a
       file that has gone. */
    answers.set('delete', () => Promise.resolve(deleteSuccessResponse()));
    render(
      <SubmittedFileActions
        file={neverImported}
        actingUploader={importer}
        onRetried={vi.fn()}
      />,
    );
    const accepted = await askAboutTheDelete();
    await user.click(
      within(accepted).getByRole('button', {
        name: new RegExp(`^${CONFIRM_DELETE_LABEL}$`, 'i'),
      }),
    );
    await waitFor(() => {
      expect(navigationTargets()).toEqual([UPLOAD_PATH]);
    });
  });
});
