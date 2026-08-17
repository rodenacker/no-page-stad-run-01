/**
 * Story Metadata:
 * - Epic: import-preview — Story 2: see every row of the file, and what will happen to it
 * - Route: /upload/file
 * - Target File: web/src/components/files/ImportPreview.tsx
 * - Page Action: modify_existing (the route and page already exist; this adds a section)
 *
 * Covers the five criteria this story tags `vitest`:
 * - AC-2 — a file whose validation has NOT run yet shows no preview section at all:
 *   no heading, no table, and NO READS.
 * - AC-3 — a will-import row: account number masked to its last four digits with NO
 *   reveal control, and the transaction type in the app's plain-language wording.
 * - AC-4 — a rejected row: the file's own values UNTRANSLATED, its account number
 *   masked with the same per-row reveal `RejectedRows` already offers, and the same
 *   defect wording that section applies (app-owned wording for `Reference`, `Amount`,
 *   `TransactionDate`, `Currency`; the SERVICE's own words, verbatim, for a
 *   `TransactionType` defect).
 * - AC-5 (BR9) — a rejected row that cannot be tied to a line in the file is listed
 *   exactly ONCE, as a rejected row in its own right: never dropped, never duplicated,
 *   never attributed to another line.
 * - AC-6 (FR5) — the preview states, in plain language, how many of the file's rows
 *   will import and how many were rejected.
 *
 * AC-1 (every row listed, in file order, each carrying a text verdict) is tagged
 * `playwright` and lives in this story's browser spec — deliberately not repeated here.
 * Stories 1 (the CSV reader), 3 (the unreadable-file states) and 4 (the correction CSV)
 * are their own files.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 *  1. The preview is a SECTION of the submitted-file page, implemented as a client
 *     component at `web/src/components/files/ImportPreview.tsx`, named export
 *     `ImportPreview`, taking exactly the shape its siblings on that page take:
 *     `{ file: FileLog; refreshSignal?: number }`. It takes NO session and NO role
 *     prop — both the Importer and the Approver see everything here (brief FR8,
 *     §Access control) — and it does NOT re-read the file itself.
 *  2. IT GROWS NO TIMER OF ITS OWN. `SubmittedFileDetail` owns the page's single
 *     interval and hands `refreshSignal` down; a new value means "ask again", exactly
 *     as `RejectedRows` and `FileProcessingHistory` already work.
 *  3. The section is a `<section aria-labelledby>` whose heading NAMES it with the word
 *     "preview", so it is addressable as a region. Every state it produces lives inside
 *     it.
 *  4. TWO READS, both through the endpoint functions ALREADY in
 *     `web/src/lib/api/files.ts` (CLAUDE.md §2 — never a bare `fetch()`, never a second
 *     download path):
 *       - `downloadSubmittedFile(file.Id)` → `GET /v1/files/download?FileLogId=<id>`,
 *         the originally submitted file's bytes (a `Blob`, binary response);
 *       - `fetchFileValidationErrors(file.Id)` + `rejectedRowsIn` →
 *         `GET /v1/files/validation-errors?FileLogId=<id>`, the rejected-row overlay.
 *     The mock below answers ONLY those two addresses, only for the file it was asked
 *     about, and fails loudly on anything else — so the generated error file
 *     (`/v1/files/bulk-errors/download`) or `/v1/file-logs/data`, both of which are
 *     forbidden here, cannot pass as a working implementation.
 *  5. NOTHING AT ALL is rendered — no heading, no table, and NO READ — unless the
 *     file's validation has run: `CurrentStatus` is `Imported` or `Validation failed`
 *     (FR1). A file that is `Uploaded` or `Validating` has nothing to preview yet, and
 *     asking the service about it would be a read the user never sees the answer to.
 *  6. Parsing the downloaded bytes is story 1's reader
 *     (`web/src/lib/files/parseSubmittedFileCsv.ts`); matching a validation-errors
 *     entry to a parsed line, and assembling each row's verdict, is
 *     `web/src/lib/files/importPreviewRows.ts`. The component composes both — it
 *     re-implements neither, and it does not re-parse the `JsonArray` wire quirk
 *     (`rejectedRowsIn` owns that).
 *  7. ONE TABLE ROW PER PARSED LINE of the file, in file order, plus ONE MORE for each
 *     validation-errors entry that could not be matched to a line (BR9, item 11).
 *  8. THE VERDICT IS A TEXT LABEL, and there are exactly two of them:
 *     `Will import` and `Rejected`. **Never "Imported"** — the backend has not imported
 *     anything, and the app must not claim it has (BR2, the epic's honesty rule). This
 *     applies to the row label and to the count summary alike.
 *  9. A WILL-IMPORT ROW renders like a listed expense payment request (BR3):
 *     `AccountNumber` masked to its last four digits through the one masking component
 *     (`@/components/requests/MaskedAccountNumber` / `lastFourDigitsOf`), with NO reveal
 *     control at all, and `TransactionType` through the app's plain-language label
 *     (`transactionTypeLabel`, `@/lib/transactions/display`).
 * 10. A REJECTED ROW renders like `RejectedRows` already renders one:
 *       - the file's own values printed EXACTLY as the file held them —
 *         `transactionTypeLabel` deliberately NOT applied, because the point is to show
 *         the user what their file actually contains so they can correct it;
 *       - `AccountNumber` masked to its last four digits with a PER-ROW reveal control
 *         whose accessible name contains "Reveal account number" (it may carry a
 *         row-identifying suffix, as `RejectedRows`' own control does). Revealing one
 *         row reveals no other, and a masked row must not carry the full value anywhere
 *         in its markup — a value parked in a `title` or `data-` attribute leaks exactly
 *         as surely as one printed in a cell. There is no reveal-all control (POPIA,
 *         project.md §Compliance; the brief's earlier claim that rejected rows show
 *         account numbers in full was factually wrong about shipped code — see its
 *         FACTUAL CORRECTION);
 *       - the defect wording resolved by the SHARED module (item 12).
 * 11. AN UNMATCHABLE REJECTED ROW (BR9) is listed ONCE, as a rejected row in its own
 *     right, carrying the values and reason the validation-errors payload itself
 *     carries — never dropped, never duplicated, never merged onto a parsed line. Its
 *     account number is masked with the same per-row reveal (it is a rejected row like
 *     any other).
 * 11a. UNMATCHABLE MEANS "MATCHES NO LINE AT ALL" — never "that line is already
 *     spoken for". A SECOND validation-errors entry for a line that IS in the file (a
 *     row whose amount is not a number AND whose currency is not supported) is another
 *     defect on a row that is already listed: the line appears ONCE, saying BOTH
 *     things that are wrong with it, and the counts still reconcile. Listing it a
 *     second time as an "unmatched" row would show the user's single line twice and
 *     push `will import + rejected` past the number of rows the file holds. Whether
 *     the live service reports one entry per row or one per defect is unverified, and
 *     this rule is what holds under either.
 * 12. `APP_OWNED_DEFECT_WORDING` and `defectWordingFor` are currently module-private in
 *     `web/src/components/files/RejectedRows.tsx`. **Extract them to
 *     `web/src/lib/files/defectWording.ts`** and have BOTH components import them —
 *     compose, do not copy, so the four app-owned messages and the verbatim
 *     `TransactionType` rule stay stated once. This file imports that module by path;
 *     until the extraction exists, these tests do not even collect (TDD red).
 * 13. THE COUNTS (FR5) are stated in plain language, one sentence per verdict, as their
 *     own statements in the section (not only as a row count):
 *       - `"<n> rows will import"`   — never "<n> rows imported"
 *       - `"<n> rows were rejected"` — `0` may read as "No rows were rejected"
 *     A trailing full stop is optional. They are expected to reconcile against the
 *     file's own `RecordCount`.
 * 14. RESERVED CONTROL LABELS on this page — do not collide: `Try again`, `Try again to
 *     load the rejected rows`, `Load this file again`, `Retry validation`, `Delete
 *     file` / `Delete the file` / `Keep the file`, `Download original file`, `Download
 *     error file`.
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy). The CSV reader, the matching module, the
 * masking component, the display rules and the toast composition are all the REAL
 * production code. Every byte of the file, and every rejected-row body, comes from the
 * project-wide `@/mocks/data/submitted-file` fixture the Playwright layer shares — no
 * CSV text and no validation-errors payload is authored in this file, so the two layers
 * cannot drift onto files that describe different rows.
 *
 * Runtime-only: that the preview sits beside `RejectedRows` and `FileDownloadActions`
 * without either section disturbing the other, and that a 10,000-row file stays
 * responsive (NFR-1), are page-composition and browser facts — verified by this story's
 * browser spec and the manual checklist.
 *
 * Data-contract: that a live `GET /v1/files/validation-errors` really carries the key
 * that ties a rejected row back to its line (the epic's central risk — see the brief's
 * §Data Model and `REJECTION_MATCH_KEY` in the fixture) is confirmed at BUILD's
 * API-integration step and at the manual-test approval. What is pinned here is the
 * behaviour that must hold whatever that key turns out to be: a row that cannot be
 * matched is still listed, once (AC-5).
 *
 * These tests WILL FAIL until the story is implemented (TDD red): neither
 * `ImportPreview`, nor `importPreviewRows`, nor the extracted `defectWording` module
 * exists yet.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — these imports fail until the story exists (TDD red).
import { ImportPreview } from '@/components/files/ImportPreview';

// Real production toast composition (not mocked) — the same one the root layout wraps
// every signed-in screen in, so the section is rendered as the app mounts it.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get, apiClient } from '@/lib/api/client';
// The SHARED defect wording, extracted out of `RejectedRows` for both to import
// (contract 12). Imported here so the extraction is proved to exist at that path, and
// so this file states the four app-owned sentences and then insists the shared module
// agrees with them.
import {
  APP_OWNED_DEFECT_WORDING,
  defectWordingFor,
} from '@/lib/files/defectWording';
// The app's own display rules for a LISTED request. `lastFourDigitsOf` is the one
// masking helper (reused here); `transactionTypeLabel` is used both ways — to prove a
// will-import row DOES read in plain language, and that a rejected row does NOT.
import {
  lastFourDigitsOf,
  transactionTypeLabel,
} from '@/lib/transactions/display';

// Project-wide fixtures: one module owns the file's bytes AND the validation-errors
// body that describes the same file, so the two halves of this preview can never be
// mocked into disagreeing. Shared with the Playwright layer.
import {
  FILE_STATUS_UPLOADED,
  FILE_STATUS_VALIDATING,
  fileLogWithStatus,
} from '@/mocks/data/file-log';
import {
  TRANSACTION_TYPE_CREDIT_CODE,
  TRANSACTION_TYPE_DEBIT_CODE,
} from '@/mocks/data/transaction';
import {
  MULTI_DEFECT_LINE,
  UNMATCHABLE_REFERENCE,
  previewWithMultiDefectRow,
  previewWithNoRejectedRows,
  previewWithRejectedRows,
  previewWithUnmatchableRejection,
} from '@/mocks/data/submitted-file';
import { TRANSACTION_TYPE_DEFECT_REASON } from '@/mocks/data/validation-error';

import type {
  SubmittedFilePreview,
  SubmittedFileRow,
} from '@/mocks/data/submitted-file';
import type { FileLog } from '@/mocks/data/file-log';
import type { ValidationErrorRow } from '@/mocks/data/validation-error';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;
const mockGet = get as unknown as ReturnType<typeof vi.fn>;

/**
 * The only two addresses this section may read (contract 4). Used to ROUTE the mock —
 * and, by their absence from it, to fail a read of anything else.
 *
 * `/v1/files/bulk-errors/download` does NOT contain the download path below, so a
 * preview that reached for the service's generated error file instead of the submitted
 * file falls through to the "unexpected read" branch rather than quietly succeeding.
 */
const DOWNLOAD_PATH = '/v1/files/download';
const VALIDATION_ERRORS_PATH = '/v1/files/validation-errors';

/** The two verdicts, and the word that must never be one of them (contract 8, BR2). */
const WILL_IMPORT_LABEL = 'Will import';
const REJECTED_LABEL = 'Rejected';

/**
 * The FOUR rules THIS APP owns, and its fixed wording for each — quoted from the
 * brief (FR2 / R38, R39, R40, R42) and shipped today in `RejectedRows`. They are stated
 * here as literals because they are the APP's contract with the user; the shared module
 * is then required to agree with them (contract 12).
 */
const APP_OWNED_WORDING: Record<string, string> = {
  Reference: 'This request has no reference and cannot be imported.',
  Amount: 'Amount must be a number, for example 1245.67.',
  TransactionDate: 'Transaction date must be a valid date and time.',
  Currency: 'Currency must be a supported currency code.',
};

/**
 * What the preview must say about its counts (contract 13), and the claim it must never
 * make. Anchored to the WHOLE of an element's text, so a wrapper that also holds the
 * table cannot satisfy them by accident.
 */
const willImportStatement = (count: number): RegExp =>
  new RegExp(`^\\s*${String(count)} rows? will import\\.?\\s*$`, 'i');

const rejectedStatement = (count: number): RegExp =>
  new RegExp(
    `^\\s*${count === 0 ? '(0|no)' : String(count)} rows? (were )?rejected\\.?\\s*$`,
    'i',
  );

/** The dishonest version of the same sentence: an import the backend has not performed. */
const importedClaim = (count: number): RegExp =>
  new RegExp(
    `^\\s*${String(count)} rows? (were |have been )?imported\\.?\\s*$`,
    'i',
  );

/** The file the fixture describes, keyed by the id a read must identify it by. */
const servedByFileId = new Map<number, SubmittedFilePreview>();

/** Registers the bytes and the rejected-row body the service answers with for a file. */
const serve = (preview: SubmittedFilePreview): SubmittedFilePreview => {
  servedByFileId.set(preview.file.Id, preview);
  return preview;
};

/**
 * The `FileLogId` a read carried, whether it travelled in `apiClient`'s config (the
 * binary download) or as `get`'s query parameters (the validation-errors read).
 */
const fileLogIdIn = (carrier: unknown): unknown => {
  if (typeof carrier !== 'object' || carrier === null) {
    return undefined;
  }
  const record = carrier as Record<string, unknown>;
  const params =
    typeof record.params === 'object' && record.params !== null
      ? (record.params as Record<string, unknown>)
      : record;
  return params.FileLogId;
};

/** The service, as far as this section is concerned. */
const respondTo = (endpoint: unknown, carrier: unknown): unknown => {
  const path = String(endpoint);
  if (!path.includes(DOWNLOAD_PATH) && !path.includes(VALIDATION_ERRORS_PATH)) {
    throw new Error(
      `Unexpected read of "${path}" — the preview reads the submitted file ` +
        `(GET ${DOWNLOAD_PATH}) and the rejected-row overlay ` +
        `(GET ${VALIDATION_ERRORS_PATH}), and nothing else. The generated error file ` +
        `and /v1/file-logs/data are both forbidden here (see the implementation ` +
        `contract).`,
    );
  }

  const requested = fileLogIdIn(carrier);
  const preview = servedByFileId.get(Number(requested));
  if (preview === undefined) {
    throw new Error(
      `Read of "${path}" asked for FileLogId="${String(requested)}", which no test ` +
        `fixture serves — every call must carry the file's own Id (served here: ` +
        `${JSON.stringify([...servedByFileId.keys()])}).`,
    );
  }

  return path.includes(DOWNLOAD_PATH)
    ? preview.blob()
    : preview.validationErrors;
};

/** The section as the root layout always mounts it: inside the toast composition. */
const previewTree = (file: FileLog, refreshSignal: number) => (
  <ToastProvider>
    <ImportPreview file={file} refreshSignal={refreshSignal} />
    <ToastContainer />
  </ToastProvider>
);

const renderImportPreview = (file: FileLog, refreshSignal = 0) =>
  render(previewTree(file, refreshSignal));

/** The preview section itself — every state this story owns lives inside it. */
const section = (): HTMLElement =>
  screen.getByRole('region', { name: /preview/i });

/** The same, for asserting the section is not there at all (AC-2). */
const querySection = (): HTMLElement | null =>
  screen.queryByRole('region', { name: /preview/i });

/**
 * The one table row carrying `reference` — required to be unique, so a widened match
 * can never quietly select a different row, and so "listed once" is a real claim
 * (testing-policy.md § anti-pattern 7: no index-based row selection).
 */
const rowFor = (reference: string): HTMLElement => {
  const rows = within(screen.getByRole('table'))
    .getAllByRole('row')
    .filter((row) => row.textContent?.includes(reference));

  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one preview row carrying "${reference}", found ` +
        `${String(rows.length)} — every line of the file, and every rejected row ` +
        `that matches no line, is listed exactly once (see the implementation ` +
        `contract, items 7 and 11).`,
    );
  }
  return rows[0];
};

/** How many rows carry `reference` — 0, 1 or more. Used to prove "never duplicated". */
const rowsCarrying = (reference: string): number =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .filter((row) => row.textContent?.includes(reference)).length;

/**
 * The one element that states `pattern` and nothing else. An identical wrapper around
 * the sentence matches too, so the innermost match is the statement itself.
 */
const statedOnce = (pattern: RegExp): HTMLElement => {
  const saying = within(section()).getAllByText(pattern);
  const innermost = saying.filter(
    (element) =>
      !saying.some((other) => other !== element && element.contains(other)),
  );
  if (innermost.length !== 1) {
    throw new Error(
      `Expected the preview to state ${String(pattern)} exactly once, found ` +
        `${String(innermost.length)} statements of it (see the implementation ` +
        `contract, item 13).`,
    );
  }
  return innermost[0];
};

/** The file's line `lineNumber`, 1-based as the fixture numbers them. */
const lineOf = (
  preview: SubmittedFilePreview,
  lineNumber: number,
): SubmittedFileRow => preview.rows[lineNumber - 1];

/** The one rejection the fixture placed on `column`, insisted on rather than assumed. */
const rejectionOn = (
  preview: SubmittedFilePreview,
  column: string,
): ValidationErrorRow => {
  const matches = preview.rejections.filter(
    (rejection) => rejection.ErrorColumn === column,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Fixture precondition failed: expected exactly one rejection on "${column}", ` +
        `found ${String(matches.length)} (see @/mocks/data/submitted-file).`,
    );
  }
  return matches[0];
};

/** The full account number a fixture row carries — the value the app must mask. */
const accountNumberOf = (row: { AccountNumber?: string }): string => {
  const { AccountNumber } = row;
  if (typeof AccountNumber !== 'string' || AccountNumber === '') {
    throw new Error(
      'Fixture precondition failed: every row used here carries a full, unmasked ' +
        'AccountNumber — masking can only be proved if the mock hands the component ' +
        'something to mask (see @/mocks/data/submitted-file).',
    );
  }
  return AccountNumber;
};

describe('Epic import-preview, Story 2: see every row of the file, and what will happen to it', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    servedByFileId.clear();

    // Async, so a read of the wrong address arrives as a rejected promise rather than
    // a synchronous throw out of an effect — the component must survive either.
    mockApiClient.mockImplementation(
      async (endpoint: unknown, config: unknown) => respondTo(endpoint, config),
    );
    mockGet.mockImplementation(async (endpoint: unknown, params: unknown) =>
      respondTo(endpoint, params),
    );
  });

  // AC-2
  it('shows no preview at all — and reads nothing — for a file whose validation has not run yet', async () => {
    // Nothing is served for either file: any read at all would be rejected loudly, and
    // a section of any kind would be found by the assertions below.
    const stillUploaded = fileLogWithStatus(FILE_STATUS_UPLOADED, { Id: 5101 });
    const stillValidating = fileLogWithStatus(FILE_STATUS_VALIDATING, {
      Id: 5102,
    });

    const uploadedView = renderImportPreview(stillUploaded);

    // No heading, no table — and no half-rendered stand-in for one either.
    expect(querySection()).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // AND NO READS. Rendering has run the component's effects, so a download or an
    // overlay read would already have reached the client. The file's bytes are the
    // expensive one: asking for a whole file the user is shown nothing of is a cost
    // paid for no answer.
    expect(mockApiClient).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();

    // A refresh signal from the page's own interval is not a reason to start either:
    // the file still has nothing to preview.
    uploadedView.rerender(previewTree(stillUploaded, 1));

    expect(querySection()).not.toBeInTheDocument();
    expect(mockApiClient).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();

    uploadedView.unmount();

    // The other status validation has not finished in — same answer.
    renderImportPreview(stillValidating);

    await waitFor(() => {
      expect(querySection()).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(mockApiClient).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  // AC-3
  it('shows a will-import row with its account number masked to the last four digits, no reveal control, and its transaction type in plain language', async () => {
    const preview = serve(previewWithRejectedRows());
    const credit = lineOf(preview, 1);
    const debit = lineOf(preview, 2);

    // Fixture preconditions, so each assertion below means what it says: these two
    // lines are will-import ones...
    expect(preview.rejectedLineNumbers).toEqual([3, 5]);
    // ...they carry the two type codes the app has wording for...
    expect(credit.TransactionType).toBe(TRANSACTION_TYPE_CREDIT_CODE);
    expect(debit.TransactionType).toBe(TRANSACTION_TYPE_DEBIT_CODE);
    // ...that wording really is a translation (so the plain-language assertions are
    // not satisfied by the raw value)...
    expect(transactionTypeLabel(TRANSACTION_TYPE_CREDIT_CODE)).not.toBe(
      TRANSACTION_TYPE_CREDIT_CODE,
    );
    // ...and their last four digits tell them apart.
    expect(lastFourDigitsOf(accountNumberOf(credit))).not.toBe(
      lastFourDigitsOf(accountNumberOf(debit)),
    );

    renderImportPreview(preview.file);

    await screen.findByRole('table');

    const creditRow = rowFor(credit.Reference);
    const debitRow = rowFor(debit.Reference);

    // The verdict is the honest one, as a text label — never "Imported" (BR2).
    expect(within(creditRow).getByText(WILL_IMPORT_LABEL)).toBeInTheDocument();
    expect(within(debitRow).getByText(WILL_IMPORT_LABEL)).toBeInTheDocument();

    [credit, debit].forEach((line) => {
      const row = rowFor(line.Reference);
      const accountNumber = accountNumberOf(line);

      // Last four digits only (POPIA, BR3) — and the full value is nowhere in the
      // row's markup, not even parked in a title or data- attribute.
      expect(row).toHaveTextContent(lastFourDigitsOf(accountNumber));
      expect(row).not.toHaveTextContent(accountNumber);
      expect(row.outerHTML).not.toContain(accountNumber);

      // NO reveal control on this half: a will-import row is a listed expense payment
      // request, and the list convention offers no way to unmask one.
      expect(
        within(row).queryByRole('button', {
          name: /(reveal|show|unmask|full)/i,
        }),
      ).not.toBeInTheDocument();
    });

    // The type reads in the user's terms, not the file's single letters.
    expect(
      within(creditRow).getByText(
        transactionTypeLabel(TRANSACTION_TYPE_CREDIT_CODE),
      ),
    ).toBeInTheDocument();
    expect(
      within(debitRow).getByText(
        transactionTypeLabel(TRANSACTION_TYPE_DEBIT_CODE),
      ),
    ).toBeInTheDocument();
  });

  // AC-4
  it('shows a rejected row with the file’s own values untranslated, a per-row reveal for its masked account number, and the same defect wording the Rejected rows section applies', async () => {
    const user = userEvent.setup();
    const preview = serve(previewWithRejectedRows());
    const appOwned = rejectionOn(preview, 'Currency');
    const serviceOwned = rejectionOn(preview, 'TransactionType');
    const appOwnedLine = lineOf(preview, 3);
    const serviceOwnedLine = lineOf(preview, 5);

    // Fixture preconditions. The app-owned-wording row keeps a type code the app HAS
    // wording for, so "not translated" is a real claim rather than a vacuous one...
    expect(appOwnedLine.TransactionType).toBe(TRANSACTION_TYPE_DEBIT_CODE);
    expect(transactionTypeLabel(TRANSACTION_TYPE_DEBIT_CODE)).not.toBe(
      TRANSACTION_TYPE_DEBIT_CODE,
    );
    // ...the service's own text for the app-owned rule exists and differs from the
    // app's, so "never reaches the user" is testable...
    expect(appOwned.ErrorMessage).toBeDefined();
    expect(appOwned.ErrorMessage).not.toBe(APP_OWNED_WORDING.Currency);
    // ...and the SHARED wording module (contract 12) states exactly the four sentences
    // this app owns, and hands a TransactionType defect the service's words untouched.
    Object.entries(APP_OWNED_WORDING).forEach(([column, sentence]) => {
      expect(APP_OWNED_DEFECT_WORDING.get(column)).toBe(sentence);
    });
    expect(APP_OWNED_DEFECT_WORDING.get('TransactionType')).toBeUndefined();
    expect(defectWordingFor(serviceOwned)).toBe(TRANSACTION_TYPE_DEFECT_REASON);

    renderImportPreview(preview.file);

    await screen.findByRole('table');

    const appOwnedRow = rowFor(appOwnedLine.Reference);
    const serviceOwnedRow = rowFor(serviceOwnedLine.Reference);

    expect(within(appOwnedRow).getByText(REJECTED_LABEL)).toBeInTheDocument();
    expect(
      within(serviceOwnedRow).getByText(REJECTED_LABEL),
    ).toBeInTheDocument();

    // The file's own values, printed as the file holds them — including the value the
    // service objected to.
    expect(appOwnedRow).toHaveTextContent(appOwnedLine.Currency);
    expect(appOwnedRow).toHaveTextContent(appOwnedLine.Description);
    expect(serviceOwnedRow).toHaveTextContent(serviceOwnedLine.TransactionType);

    // UNTRANSLATED: the "Debit — money out" wording the will-import half uses is
    // deliberately not applied to a row the user has to go and fix in their own file.
    expect(
      within(appOwnedRow).getByText(TRANSACTION_TYPE_DEBIT_CODE),
    ).toBeInTheDocument();
    expect(appOwnedRow).not.toHaveTextContent(
      transactionTypeLabel(TRANSACTION_TYPE_DEBIT_CODE),
    );

    // The defect wording: the app's own fixed sentence where the app owns the rule,
    // and the service's machine-phrased text for that rule never reaching the user.
    expect(
      within(appOwnedRow).getByText(APP_OWNED_WORDING.Currency),
    ).toBeInTheDocument();
    expect(appOwnedRow).not.toHaveTextContent(String(appOwned.ErrorMessage));

    // ...and the SERVICE's own reason, word for word, for a transaction-type defect.
    expect(
      within(serviceOwnedRow).getByText(TRANSACTION_TYPE_DEFECT_REASON),
    ).toBeInTheDocument();

    // Masked to the last four digits, with the full value nowhere in the markup...
    const appOwnedAccount = accountNumberOf(appOwnedLine);
    const serviceOwnedAccount = accountNumberOf(serviceOwnedLine);
    expect(appOwnedRow).toHaveTextContent(lastFourDigitsOf(appOwnedAccount));
    expect(appOwnedRow.outerHTML).not.toContain(appOwnedAccount);

    // ...until the reveal control on THAT ONE ROW is used.
    await user.click(
      within(appOwnedRow).getByRole('button', {
        name: /reveal account number/i,
      }),
    );

    await waitFor(() => {
      expect(rowFor(appOwnedLine.Reference)).toHaveTextContent(appOwnedAccount);
    });

    // The other rejected row stays masked — the reveal belongs to the row it was made
    // on, and there is no reveal-all control anywhere.
    const stillMasked = rowFor(serviceOwnedLine.Reference);
    expect(stillMasked).toHaveTextContent(
      lastFourDigitsOf(serviceOwnedAccount),
    );
    expect(stillMasked.outerHTML).not.toContain(serviceOwnedAccount);
    expect(
      screen.queryAllByRole('button', {
        name: /(reveal|show|unmask) (all|every)/i,
      }),
    ).toHaveLength(0);
  });

  // AC-5 (BR9) — the epic's central risk, stated as plainly as it can be.
  it('lists a rejected row that matches no line in the file exactly once, as a rejected row in its own right', async () => {
    const preview = serve(previewWithUnmatchableRejection());
    const [unmatchable] = preview.unmatchableRejections;
    const matchedLine = lineOf(preview, 3);

    // Fixture preconditions: one rejection that DOES match a line, one that cannot —
    // so this test proves the two are handled side by side, not one mode at a time...
    expect(preview.unmatchableRejections).toHaveLength(1);
    expect(preview.rejectedLineNumbers).toEqual([3]);
    expect(unmatchable.Reference).toBe(UNMATCHABLE_REFERENCE);
    // ...and its reference really appears in no line of the file.
    expect(
      preview.rows.filter((row) => row.Reference === UNMATCHABLE_REFERENCE),
    ).toHaveLength(0);

    renderImportPreview(preview.file);

    const table = await screen.findByRole('table');

    // NEVER DROPPED, NEVER DUPLICATED: one row for every line of the file, plus one
    // more for the rejection that belongs to no line, plus the header row.
    await waitFor(() => {
      expect(within(table).getAllByRole('row')).toHaveLength(
        preview.rows.length + preview.unmatchableRejections.length + 1,
      );
    });
    expect(rowsCarrying(UNMATCHABLE_REFERENCE)).toBe(1);

    // NEVER ATTRIBUTED TO ANOTHER LINE: every line of the file is still listed once,
    // under its own reference...
    preview.rows.forEach((row) => {
      expect(rowsCarrying(row.Reference)).toBe(1);
    });
    // ...and the line that WAS matched keeps its own values and its own reason rather
    // than the unmatchable row's.
    const matchedRow = rowFor(matchedLine.Reference);
    expect(matchedRow).not.toHaveTextContent(UNMATCHABLE_REFERENCE);
    expect(matchedRow).toHaveTextContent(matchedLine.Description);
    expect(
      within(matchedRow).getByText(APP_OWNED_WORDING.Currency),
    ).toBeInTheDocument();

    // A REJECTED ROW IN ITS OWN RIGHT: the service's verdict, the service's recorded
    // values, and the reason resolved exactly as every other rejected row's is.
    const orphanRow = rowFor(UNMATCHABLE_REFERENCE);
    expect(within(orphanRow).getByText(REJECTED_LABEL)).toBeInTheDocument();
    expect(orphanRow).toHaveTextContent(String(unmatchable.Description));
    expect(orphanRow).toHaveTextContent(String(unmatchable.TransactionDate));
    expect(orphanRow).toHaveTextContent(String(unmatchable.Amount));
    expect(
      within(orphanRow).getByText(String(defectWordingFor(unmatchable))),
    ).toBeInTheDocument();

    // It is a rejected row, so its account number is masked like any other (BR3).
    const orphanAccount = accountNumberOf(unmatchable);
    expect(orphanRow).toHaveTextContent(lastFourDigitsOf(orphanAccount));
    expect(orphanRow.outerHTML).not.toContain(orphanAccount);

    // Both halves are still counted honestly: four lines the service did not reject,
    // two rejected rows — the matched one and the one with no line of its own.
    expect(within(table).getAllByText(WILL_IMPORT_LABEL)).toHaveLength(
      preview.counts.willImport,
    );
    expect(within(table).getAllByText(REJECTED_LABEL)).toHaveLength(
      preview.counts.rejected,
    );
  });

  // AC-5 (BR9), the other side of it — the distinction the fallback turns on.
  // A second entry for a line that IS in the file is another DEFECT on a row already
  // listed, not a row of its own; only an entry matching no line at all is the
  // unmatched case. Getting this wrong shows the user's single line twice, puts the
  // counts past the number of rows their file holds, and (story 4) writes the row into
  // the correction file twice.
  it('lists a line the service reported two defects for exactly once, saying both of them, while a genuinely orphaned rejection still gets a row of its own', async () => {
    const preview = serve(previewWithMultiDefectRow());
    const multiDefectLine = lineOf(preview, MULTI_DEFECT_LINE);
    const badAmount = rejectionOn(preview, 'Amount');
    const badCurrency = rejectionOn(preview, 'Currency');
    const [orphan] = preview.unmatchableRejections;

    // Fixture preconditions. TWO entries, ONE line: both carry the same reference as
    // the file's line, and that line really does hold both defective values...
    expect(badAmount.Reference).toBe(multiDefectLine.Reference);
    expect(badCurrency.Reference).toBe(multiDefectLine.Reference);
    expect(multiDefectLine.Amount).toBe(String(badAmount.Amount));
    expect(multiDefectLine.Currency).toBe(String(badCurrency.Currency));
    // ...the app owns the wording for both of those rules, and the service's own text
    // for them is different, so "the app's sentence, not the service's" is testable...
    expect(badAmount.ErrorMessage).not.toBe(APP_OWNED_WORDING.Amount);
    expect(badCurrency.ErrorMessage).not.toBe(APP_OWNED_WORDING.Currency);
    // ...and one entry in the same payload matches NO line of the file at all.
    expect(preview.unmatchableRejections).toHaveLength(1);
    expect(orphan.Reference).toBe(UNMATCHABLE_REFERENCE);
    expect(
      preview.rows.filter((row) => row.Reference === UNMATCHABLE_REFERENCE),
    ).toHaveLength(0);

    renderImportPreview(preview.file);

    const table = await screen.findByRole('table');

    // ONE row per line of the file, plus ONE for the orphaned entry, plus the header —
    // the twice-reported line has NOT produced a phantom second row.
    await waitFor(() => {
      expect(within(table).getAllByRole('row')).toHaveLength(
        preview.rows.length + preview.unmatchableRejections.length + 1,
      );
    });
    preview.rows.forEach((row) => {
      expect(rowsCarrying(row.Reference)).toBe(1);
    });

    // BOTH defects reach the screen on that one row, in the app's own words — the
    // person correcting the file has to fix both, and the service's machine-phrased
    // text for either rule still never reaches them.
    const multiDefectRow = rowFor(multiDefectLine.Reference);
    expect(
      within(multiDefectRow).getByText(REJECTED_LABEL),
    ).toBeInTheDocument();
    expect(
      within(multiDefectRow).getByText(APP_OWNED_WORDING.Amount),
    ).toBeInTheDocument();
    expect(
      within(multiDefectRow).getByText(APP_OWNED_WORDING.Currency),
    ).toBeInTheDocument();
    expect(multiDefectRow).not.toHaveTextContent(
      String(badAmount.ErrorMessage),
    );
    expect(multiDefectRow).not.toHaveTextContent(
      String(badCurrency.ErrorMessage),
    );

    // ...and it still shows the file's own values, both bad ones included, so the
    // reader can see exactly what to correct.
    expect(multiDefectRow).toHaveTextContent(multiDefectLine.Amount);
    expect(multiDefectRow).toHaveTextContent(multiDefectLine.Currency);

    // The genuinely orphaned entry is unaffected: still its own rejected row, once.
    expect(rowsCarrying(UNMATCHABLE_REFERENCE)).toBe(1);
    expect(
      within(rowFor(UNMATCHABLE_REFERENCE)).getByText(REJECTED_LABEL),
    ).toBeInTheDocument();

    // THE COUNTS RECONCILE: every line of the file is counted exactly once, whichever
    // half it fell in, plus the one rejection that belongs to no line.
    const { willImport, rejected } = preview.counts;
    expect(willImport + rejected).toBe(
      preview.rows.length + preview.unmatchableRejections.length,
    );
    expect(String(preview.rows.length)).toBe(preview.file.RecordCount);
    expect(within(table).getAllByText(WILL_IMPORT_LABEL)).toHaveLength(
      willImport,
    );
    expect(within(table).getAllByText(REJECTED_LABEL)).toHaveLength(rejected);
    await waitFor(() => {
      expect(statedOnce(willImportStatement(willImport))).toBeInTheDocument();
    });
    expect(statedOnce(rejectedStatement(rejected))).toBeInTheDocument();
  });

  // AC-6 (FR5, BR2)
  it('states in plain language how many rows will import and how many were rejected, and never says any of them were imported', async () => {
    const preview = serve(previewWithRejectedRows());
    const { willImport, rejected } = preview.counts;

    // Fixture precondition: the two counts reconcile against the record count already
    // on the file's page, so the sentences below cannot quietly contradict it.
    expect(String(willImport + rejected)).toBe(preview.file.RecordCount);

    const view = renderImportPreview(preview.file);

    await screen.findByRole('table');

    await waitFor(() => {
      expect(statedOnce(willImportStatement(willImport))).toBeInTheDocument();
    });
    expect(statedOnce(rejectedStatement(rejected))).toBeInTheDocument();

    // BR2: the backend has not imported anything, so nothing here may say it has —
    // not as a count, and not as a row verdict.
    expect(
      within(section()).queryAllByText(importedClaim(willImport)),
    ).toHaveLength(0);
    expect(
      within(screen.getByRole('table')).queryAllByText(/^imported$/i),
    ).toHaveLength(0);

    view.unmount();

    // A file the service rejected nothing in says so just as plainly.
    const clean = serve(previewWithNoRejectedRows());

    renderImportPreview(clean.file);

    await screen.findByRole('table');

    await waitFor(() => {
      expect(
        statedOnce(willImportStatement(clean.counts.willImport)),
      ).toBeInTheDocument();
    });
    expect(statedOnce(rejectedStatement(0))).toBeInTheDocument();
    expect(
      within(screen.getByRole('table')).queryAllByText(REJECTED_LABEL),
    ).toHaveLength(0);
  });
});
