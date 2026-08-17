/**
 * Story Metadata:
 * - Epic: import-preview — Preview the rows of an import
 * - Story: 4 — Download the rejected rows to fix and re-upload
 * - Route: /upload/file
 * - Target File: web/src/components/files/CorrectionRowsDownload.tsx
 * - Page Action: modify_existing
 * - Requirements: FR6, FR7, FR8, BR4, BR5, BR6, NFR-3
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-2, AC-3, AC-4, AC-5, AC-6, AC-7 → this file (`vitest`).
 * - AC-1 (an Approver choosing the control actually SAVES a file to disk) →
 *   `web/e2e/epic-import-preview-story-4-download-rows-to-fix-and-re-upload.spec.ts`
 *   (`playwright`). A real saved file and a real per-role sign-in need a real
 *   browser, so neither is duplicated here.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 *  1. TWO NEW MODULES, and NOTHING below imports either of them:
 *       - `web/src/lib/files/correctionCsv.ts` — builds the file;
 *       - `web/src/components/files/CorrectionRowsDownload.tsx` — the control.
 *     These tests drive the file's own surface (`SubmittedFileDetail`, the client
 *     boundary the `/upload/file` server page hands down to), so both modules are
 *     free to take whatever shape suits them as long as the file the user receives
 *     is right. That is also the wiring assertion: building the control and
 *     forgetting to place it on the file's surface fails every test here.
 *  2. EIGHT COLUMNS, AND THE EIGHTH IS ALWAYS LAST (BR5). The seven upload columns
 *     in the upload's own order — `Reference,TransactionDate,AccountNumber,
 *     Description,Amount,TransactionType,Currency`, the shape
 *     `documentation/transactions_2026-04-15.csv` holds and `POST /v1/files/upload`
 *     accepts — then `Reason`. This ordering is the WHOLE mitigation for BR5's
 *     unconfirmed round-trip risk: the service's tolerance of an unknown eighth
 *     column is unverified (both backends were unreachable when it was settled), so
 *     a consumer that reads the first seven POSITIONALLY must be unaffected, and if
 *     the service refuses the file the fix is to drop the last column and nothing
 *     else. Never insert `Reason` anywhere but the end, and never rename one of the
 *     seven to make room for it.
 *  3. THE ROWS ARE THE PREVIEW'S REJECTED ROWS, and where each one's values come
 *     from depends on whether it was matched (FR6, BR9):
 *       - MATCHED to a line in the downloaded original file → written from THAT
 *         line, byte-faithful by construction, defective values and all;
 *       - UNMATCHED (BR9) → written from the values the validation-errors payload
 *         itself reported, which is the only data that row has.
 *     Take that distinction from story 2's `web/src/lib/files/importPreviewRows.ts`,
 *     which already computes it — do not recompute the match here, and never drop or
 *     duplicate an unmatched row.
 *  4. ACCOUNT NUMBERS ARE FULL AND UNMASKED (BR4), on every row, whatever the screen
 *     shows for that row. This is `csv-export`'s documented compliance exception
 *     applied again: the file must round-trip through upload and the upload contract
 *     has no masked-value concept. Never `lastFourDigitsOf` / `MaskedAccountNumber`
 *     in this file's writer — and note the preview MASKS those same numbers on
 *     screen (BR3), so the file and the screen deliberately disagree here.
 *  5. THE REASON COMES FROM THE ONE SHARED SOURCE — `web/src/lib/files/
 *     defectWording.ts`, which story 2 extracts out of `RejectedRows` so the screen
 *     and the file cannot drift. `correctionCsv.ts` must not restate the four
 *     app-owned sentences, and must not translate a `TransactionType` defect: the
 *     service's own `ErrorMessage` travels into the cell word for word (FR3).
 *  6. RFC 4180 ESCAPING AND THE CHUNKED YIELD come from
 *     `web/src/lib/transactions/exportCsv.ts` — follow its structure (ONE column
 *     list driving both the header row and every record). Do NOT reuse its
 *     `EXPORT_COLUMNS`: that is the nine-column RPT-01 report shape, not the upload
 *     shape.
 *  7. THE FILE REACHES THE USER THROUGH `web/src/lib/files/deliverFile.ts` — the one
 *     existing delivery path, exactly as the two service downloads use it. No second
 *     anchor path, and never an `<a href>` at an endpoint (there is no correction
 *     endpoint; the whole file is built in the browser from the preview already on
 *     screen). That is also how these tests get the bytes: `deliverFile` turns them
 *     into a blob address, so the stand-in on `URL.createObjectURL` below hands the
 *     test the very Blob the browser was asked to save. Nothing about the delivery
 *     mechanism itself is asserted — only the contents of the file the user gets.
 *  8. THE CONTROL IS A BUTTON NAMED EXACTLY `Download rows to fix and re-upload`
 *     (BR6), and its name must NEVER contain the word "error" — the service's own
 *     diagnostic download owns that word on this page. Reserved labels already in
 *     use on this screen, none of which this control may collide with:
 *     `Download original file`, `Download error file`, `Try again`, `Try again to
 *     load the rejected rows`, `Load this file again`, `Retry validation`,
 *     `Cancel file`, `Reveal account number` / `Hide account number`.
 *  9. NO REJECTED ROWS, NO CONTROL. It is LEFT OUT of the markup, never rendered
 *     disabled (source UI-24, the rule every other conditional action on this page
 *     follows).
 * 10. EACH OF THE TWO DOWNLOADS CARRIES ITS OWN EXPLANATORY TEXT, tied to its
 *     control with `aria-describedby` (FR7, BR6). A paragraph floating near two
 *     buttons explains neither of them to anyone reading with a screen reader, and
 *     the whole requirement is that it is unambiguous WHICH file is which: the
 *     correction control's description says the file is the one you correct and
 *     upload again, the error-file control's description says it is the file the
 *     transactions service generated. This is why `FileDownloadActions` is on this
 *     story's touched list.
 * 11. NO ROLE GATE ANYWHERE ON THIS PATH. The epic's access-control table grants the
 *     preview and both downloads to the Importer and the Approver alike, so nothing
 *     here takes a session or a role prop. Do not copy the `hasRole(session, …)`
 *     shape retry and cancel need.
 * 12. A CORRECTION FILE THAT CANNOT BE PRODUCED OR HANDED OVER IS A HANDLED STATE
 *     (NFR-3, project.md NFR-base-5): building and delivering happen inside one
 *     `catch`, the failure is reported in plain words in an `alert`, the browser's
 *     own error text never reaches the user, and the SAME control stays there to ask
 *     again. Asking again after a failure must actually work.
 * 13. jsdom HAS NO `Blob.text()` AND NO `Blob.arrayBuffer()` (confirmed on this
 *     project's jsdom 27). The preview reads the downloaded original file's bytes,
 *     so read them with `FileReader`, which exists in both jsdom and every browser.
 *     A `.text()` call would pass in the browser and throw in every test here.
 * ---------------------------------------------------------------------------
 *
 * Mocked here, and why:
 * - `@/lib/api/client` — the fixed HTTP convention (testing-policy.md § Mocking
 *   strategy). Both `apiClient` and `get` are stubbed from ONE responder keyed on
 *   the endpoint path, so the real `lib/api/files.ts` wrappers run for real
 *   whichever client entry point they choose.
 * - `next/navigation` and `next/link` — the client-navigation boundary; libraries,
 *   never the code under test.
 * - `URL.createObjectURL` / `revokeObjectURL` are SUPPLIED, not mocked: jsdom
 *   implements neither, so a browser API that simply does not exist in this
 *   environment stands in (the same treatment `vitest.setup.ts` gives `matchMedia`
 *   and pointer capture). AC-7 makes the stand-in throw, which is the honest way to
 *   simulate a file the browser refuses to hand over.
 * Nothing else is mocked: the real CSV reader, the real matching, the real preview,
 * the real `deliverFile` and the real defect wording all run.
 *
 * Every response body — the file's own bytes AND the validation-errors overlay that
 * describes the same rows — comes from `web/src/mocks/data/submitted-file.ts`, the
 * one module both test layers import. A rejected line's CSV text is written there
 * FROM its validation-errors row, so "the correction file holds exactly what the
 * original file held" is a claim about the app's own read-match-write path rather
 * than a test agreeing with itself.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): there is no
 * correction download on the submitted-file surface yet.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — story 1's reader, story 2's preview and this story's
// control all run for real behind this one client boundary (contract note 1).
import { SubmittedFileDetail } from '@/components/files/SubmittedFileDetail';

// Real production infrastructure (not mocked): the root layout's toast composition,
// which every `(authenticated)` screen sits inside.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';

import { apiClient, get } from '@/lib/api/client';
import { TRANSACTIONS_API_BASE_PATH } from '@/lib/utils/constants';

// Project-wide mock data — never a hand-written response body, and never a
// hand-written CSV line.
import { fileLogListResponse } from '@/mocks/data/file-log';
import { fileProcessLogListResponse } from '@/mocks/data/file-process-log';
import {
  CORRECTION_REASON_COLUMN,
  MULTI_DEFECT_LINE,
  SUBMITTED_FILE_COLUMNS,
  UNMATCHABLE_REFERENCE,
  previewWithHostileRejectedRow,
  previewWithMultiDefectRow,
  previewWithNoRejectedRows,
  previewWithRejectedRows,
  previewWithUnmatchableRejection,
} from '@/mocks/data/submitted-file';
import { DESCRIPTION_WITH_EVERY_HOSTILE_CHARACTER } from '@/mocks/data/transaction';
import {
  SERVICE_DEFECT_REASONS,
  TRANSACTION_TYPE_DEFECT_REASON,
} from '@/mocks/data/validation-error';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

import type {
  SubmittedFileColumn,
  SubmittedFilePreview,
} from '@/mocks/data/submitted-file';
import type { ValidationErrorRow } from '@/types/files';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
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
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/**
 * `next/link` stubbed with the plain anchor it renders in the browser, so the screen
 * keeps its links without an App Router context in jsdom. A library, never the code
 * under test.
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

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;
const mockGet = get as unknown as ReturnType<typeof vi.fn>;

/**
 * The transactions endpoints, as the browser addresses them — the app's own
 * same-origin mount point, never a service URL (CLAUDE.md §2).
 */
const FILE_LOGS_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/file-logs`;
const FILE_PROCESS_LOGS_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/file-process-logs`;
const VALIDATION_ERRORS_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/files/validation-errors`;
const ORIGINAL_DOWNLOAD_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/files/download`;
const ERROR_FILE_DOWNLOAD_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/files/bulk-errors/download`;

/**
 * This story's control (contract note 8) — the requirement's own wording, and
 * matched on the WHOLE accessible name so a differently-worded second control
 * cannot satisfy it by accident.
 */
const CORRECTION_LABEL = 'Download rows to fix and re-upload';
const CORRECTION_CONTROL_NAME = /^download rows to fix and re-upload$/i;

/** The service's own diagnostic download, which already lives on this page (BR6). */
const ERROR_FILE_CONTROL_NAME = /^download error file$/i;

/** The submitted file's own download, used only as proof the surface rendered. */
const ORIGINAL_FILE_CONTROL_NAME = /^download original file$/i;

/**
 * The APP's own fixed sentence for a `Currency` defect — one of the four rules the
 * app owns (FR2 of `file-validation-and-retry`, source `R42`), already shipped on
 * this page by `RejectedRows`.
 *
 * Stated here as the requirement's own literal rather than imported from
 * `lib/files/defectWording.ts`: importing the implementation's value would make the
 * assertion agree with whatever wording the code happened to hold. What the
 * implementation must NOT do is restate it a second time in `correctionCsv.ts` —
 * see contract note 5.
 */
const APP_OWNED_CURRENCY_REASON = 'Currency must be a supported currency code.';

/** The APP's own fixed sentence for an `Amount` defect (source `R39`), stated as the
 * requirement's literal for the same reason as the one above. */
const APP_OWNED_AMOUNT_REASON = 'Amount must be a number, for example 1245.67.';

/** How the test identifies one line of a file — the upload's first column. */
const REFERENCE_COLUMN: SubmittedFileColumn = 'Reference';
const REFERENCE_AT = SUBMITTED_FILE_COLUMNS.indexOf(REFERENCE_COLUMN);
const DESCRIPTION_AT = SUBMITTED_FILE_COLUMNS.indexOf('Description');
const ACCOUNT_NUMBER_AT = SUBMITTED_FILE_COLUMNS.indexOf('AccountNumber');

/**
 * The error text the browser gives when it refuses to hand a file over (AC-7).
 * Deliberately phrased as only a browser would phrase it, so a test can tell it
 * apart from wording the screen wrote for itself — it must never reach the user.
 */
const BROWSER_DELIVERY_FAILURE =
  'DOMException: a blob URL could not be created for this document.';

/**
 * Every file the app has asked the browser to save, in the order it asked.
 *
 * `deliverFile` turns the bytes into a blob address and activates a download link
 * (contract note 7), so the Blob handed to `URL.createObjectURL` IS the file the
 * user receives. jsdom implements neither `createObjectURL` nor `revokeObjectURL`,
 * so these are stands-in for browser APIs this environment lacks rather than stubs
 * of anything the story owns.
 */
const deliveredFiles: Blob[] = [];

/** Set by AC-7 only: the browser refuses to make an address for the file. */
let deliveryFails = false;

URL.createObjectURL = ((contents: Blob): string => {
  if (deliveryFails) {
    throw new Error(BROWSER_DELIVERY_FAILURE);
  }
  deliveredFiles.push(contents);
  return `blob:correction-file-${String(deliveredFiles.length)}`;
}) as typeof URL.createObjectURL;

URL.revokeObjectURL = ((): void => {}) as typeof URL.revokeObjectURL;

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

/**
 * A CSV file read back the way the upload endpoint reads it (RFC 4180): fields
 * separated by commas, records by a line break, and a quoted field carrying commas,
 * line breaks and doubled quotes of its own as ONE value.
 *
 * Deliberately a reader rather than a comparison against expected escaped text: the
 * standard lets a conforming writer quote more fields than the minimum, and what the
 * criteria are about is what the file READS BACK AS, not which characters it spends
 * doing it. A leading byte-order mark is dropped — it is a mark about the encoding
 * rather than data in the first column.
 */
const parseCsv = (file: string): string[][] => {
  const text = file.startsWith('﻿') ? file.slice(1) : file;
  const records: string[][] = [];
  let fields: string[] = [];
  let value = '';
  let inQuotes = false;
  let index = 0;

  const endField = (): void => {
    fields.push(value);
    value = '';
  };
  const endRecord = (): void => {
    endField();
    records.push(fields);
    fields = [];
  };

  while (index < text.length) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 2;
        continue;
      }
      if (character === '"') {
        inQuotes = false;
        index += 1;
        continue;
      }
      value += character;
      index += 1;
      continue;
    }

    if (character === '"' && value === '') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (character === ',') {
      endField();
      index += 1;
      continue;
    }
    if (character === '\r' && text[index + 1] === '\n') {
      endRecord();
      index += 2;
      continue;
    }
    if (character === '\n' || character === '\r') {
      endRecord();
      index += 1;
      continue;
    }
    value += character;
    index += 1;
  }

  // A file ending in a record separator has no trailing empty record; one that does
  // not end in a separator still has its last record.
  if (value !== '' || fields.length > 0) {
    endRecord();
  }
  return records;
};

interface SavedFile {
  /** The first line: the column names, in the order they were written. */
  header: string[];
  /** How many fields each data record holds — one entry per distinct count. */
  fieldCounts: number[];
  /**
   * The data records as written, in file order, values BY POSITION — because
   * position is exactly what BR5's mitigation is about (contract note 2).
   */
  rows: string[][];
}

const fileFrom = (text: string): SavedFile => {
  const [header, ...rows] = parseCsv(text);
  return {
    header,
    fieldCounts: [...new Set(rows.map((fields) => fields.length))],
    rows,
  };
};

/**
 * The originally submitted file's own data lines, by reference — read from the very
 * bytes the mocked download answers with, using this test's own reader.
 *
 * This is what makes AC-4 a real claim: the app downloads those bytes, parses them
 * with ITS reader, matches them against the validation-errors overlay and writes the
 * result; the test reads the same bytes independently and requires the two to agree
 * value for value.
 */
const originalFileLines = (csv: string): Map<string, string[]> => {
  const [header, ...rows] = parseCsv(csv);
  // The fixture really is an upload-shaped file — the precondition for reading any
  // line below by position.
  expect(header).toEqual([...SUBMITTED_FILE_COLUMNS]);
  return new Map(rows.map((values) => [values[REFERENCE_AT], values]));
};

/**
 * The seven values a validation-errors row REPORTS for itself, in the upload's own
 * order — the only data an unmatched row (BR9) has. A value the service omitted is
 * an EMPTY cell, which is what "missing" looks like in a file, never the word
 * "undefined".
 */
const reportedValuesOf = (row: ValidationErrorRow): string[] => {
  const asText: Record<SubmittedFileColumn, string> = {
    Reference: row.Reference ?? '',
    TransactionDate: row.TransactionDate ?? '',
    AccountNumber: row.AccountNumber ?? '',
    Description: row.Description ?? '',
    Amount: row.Amount === undefined ? '' : String(row.Amount),
    TransactionType: row.TransactionType ?? '',
    Currency: row.Currency ?? '',
  };
  return SUBMITTED_FILE_COLUMNS.map((column) => asText[column]);
};

/** The first seven positions of a written record — the upload's own shape. */
const uploadColumnsOf = (record: string[]): string[] =>
  record.slice(0, SUBMITTED_FILE_COLUMNS.length);

/** The one record written for a given reference. Never two; never none. */
const recordFor = (saved: SavedFile, reference: string): string[] => {
  const matches = saved.rows.filter(
    (fields) => fields[REFERENCE_AT] === reference,
  );
  expect(matches).toHaveLength(1);
  return matches[0];
};

/** What the file says is wrong with the row written for `reference`. */
const reasonWrittenFor = (saved: SavedFile, reference: string): string =>
  recordFor(saved, reference)[saved.header.indexOf(CORRECTION_REASON_COLUMN)];

/**
 * The reference of the one line a fixture rejected on `column` — so a test names the
 * DEFECT it is about rather than picking a rejection out of the list by position.
 */
const referenceRejectedOn = (
  preview: SubmittedFilePreview,
  column: string,
): string => {
  const matches = preview.rejections.filter(
    (rejection) => rejection.ErrorColumn === column,
  );
  expect(matches).toHaveLength(1);
  const { Reference } = matches[0];
  expect(typeof Reference).toBe('string');
  return String(Reference);
};

/**
 * Answers the transactions service for ONE coherent submitted file: its own bytes on
 * the download endpoint, and the validation-errors body describing the same rows.
 * Both halves come out of one fixture call, so they cannot describe different files.
 *
 * Routed on the endpoint path and wired to BOTH client entry points, so these tests
 * are indifferent to whether `lib/api/files.ts` reaches for `apiClient` or `get`.
 */
const stubTransactionsService = (preview: SubmittedFilePreview): void => {
  const respond = (endpoint: unknown): Promise<unknown> => {
    const path = String(endpoint);
    if (path.startsWith(ERROR_FILE_DOWNLOAD_ENDPOINT)) {
      // The service's own diagnostic file. Never asked for by this story — it is
      // answered only so the control beside ours is a working one.
      return Promise.resolve(
        new Blob(['Row,Error\n3,Currency\n'], {
          type: 'application/octet-stream',
        }),
      );
    }
    if (path.startsWith(ORIGINAL_DOWNLOAD_ENDPOINT)) {
      return Promise.resolve(preview.blob());
    }
    if (path.startsWith(VALIDATION_ERRORS_ENDPOINT)) {
      return Promise.resolve(preview.validationErrors);
    }
    if (path.startsWith(FILE_PROCESS_LOGS_ENDPOINT)) {
      return Promise.resolve(fileProcessLogListResponse());
    }
    if (path.startsWith(FILE_LOGS_ENDPOINT)) {
      return Promise.resolve(fileLogListResponse([preview.file]));
    }
    return Promise.reject(
      new Error(`This test stubs no transactions endpoint at "${path}".`),
    );
  };

  mockApiClient.mockImplementation((endpoint: unknown) => respond(endpoint));
  mockGet.mockImplementation((endpoint: unknown) => respond(endpoint));
};

/**
 * The whole submitted-file surface for one file — the client boundary the
 * `/upload/file` server page hands down to (contract note 1), inside the root
 * layout's real toast composition.
 */
const renderFileSurface = (preview: SubmittedFilePreview) =>
  render(
    <ToastProvider>
      <SubmittedFileDetail logId={String(preview.file.Id)} />
      <ToastContainer />
    </ToastProvider>,
  );

/** Takes this story's download, waiting for the preview to offer it first. */
const takeTheCorrectionDownload = async (
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> => {
  await user.click(
    await screen.findByRole('button', { name: CORRECTION_CONTROL_NAME }),
  );
};

/** The one file the correction download handed the browser, read back. */
const savedCorrectionFile = async (): Promise<SavedFile> => {
  await waitFor(() => {
    expect(deliveredFiles).toHaveLength(1);
  });
  return fileFrom(await textOf(deliveredFiles[0]));
};

/** Forgets the files saved so far, so a second render starts from nothing. */
const forgetSavedFiles = (): void => {
  deliveredFiles.length = 0;
};

describe('Epic import-preview, Story 4: Download the rejected rows to fix and re-upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forgetSavedFiles();
    deliveryFails = false;
  });

  // AC-2
  // The trailing position is asserted explicitly, and twice over: the first seven
  // HEADINGS are the upload's own seven in the upload's own order, and the first
  // seven POSITIONS of a real record hold that row's seven values. Together those
  // are the entire mitigation for BR5's unconfirmed round-trip risk (contract note
  // 2) — a consumer reading positionally never sees the eighth column at all.
  //
  // The second half of the test is the same claim under RFC 4180 pressure: a value
  // carrying a comma, a doubled quotation mark and a line break is exactly what
  // turns a naive writer's eight columns into nine columns and two records, which
  // would break the upload shape without breaking anything visible.
  it('writes the seven upload columns in the upload’s own order with a header row, and the reason column last — including on a row whose free text carries a comma, a quotation mark and a line break', async () => {
    const user = userEvent.setup();
    const preview = previewWithRejectedRows();
    stubTransactionsService(preview);

    const ordinary = renderFileSurface(preview);
    await takeTheCorrectionDownload(user);

    const saved = await savedCorrectionFile();

    // A header row, eight wide: the upload's seven, then the reason column.
    expect(saved.header).toHaveLength(SUBMITTED_FILE_COLUMNS.length + 1);
    expect(uploadColumnsOf(saved.header)).toEqual([...SUBMITTED_FILE_COLUMNS]);
    expect(saved.header[saved.header.length - 1]).toBe(
      CORRECTION_REASON_COLUMN,
    );
    // And the reason column is nowhere BUT the end — an eighth column inserted
    // anywhere earlier shifts every positional consumer by one.
    expect(saved.header.indexOf(CORRECTION_REASON_COLUMN)).toBe(
      saved.header.length - 1,
    );

    // One record per rejected row of the preview, every one exactly eight fields.
    expect(saved.rows).toHaveLength(preview.rejectedRows.length);
    expect(saved.fieldCounts).toEqual([SUBMITTED_FILE_COLUMNS.length + 1]);

    // Positionally, the first seven fields of each record are that line's seven
    // upload values — read out of the original file's own bytes, not restated here.
    const lines = originalFileLines(preview.csv);
    for (const rejected of preview.rejectedRows) {
      const line = lines.get(rejected.Reference);
      expect(line).toBeDefined();
      expect(uploadColumnsOf(recordFor(saved, rejected.Reference))).toEqual(
        line,
      );
    }

    ordinary.unmount();
    forgetSavedFiles();

    // The same column contract, on a rejected line whose description holds every
    // character RFC 4180 makes dangerous.
    const hostile = previewWithHostileRejectedRow();
    stubTransactionsService(hostile);

    renderFileSurface(hostile);
    await takeTheCorrectionDownload(user);

    const hostileFile = await savedCorrectionFile();

    expect(hostileFile.header).toHaveLength(SUBMITTED_FILE_COLUMNS.length + 1);
    // Nothing split: a comma did not become a ninth column and the line break did
    // not become a second record.
    expect(hostileFile.rows).toHaveLength(hostile.rejectedRows.length);
    expect(hostileFile.fieldCounts).toEqual([
      SUBMITTED_FILE_COLUMNS.length + 1,
    ]);
    // And the free text reads back as the one value the user typed, line break and
    // all — normalising it would quietly rewrite their words. The line is found by
    // the defect it was rejected for, not by its position in the file.
    expect(
      recordFor(hostileFile, referenceRejectedOn(hostile, 'Currency'))[
        DESCRIPTION_AT
      ],
    ).toBe(DESCRIPTION_WITH_EVERY_HOSTILE_CHARACTER);
  });

  // AC-3
  // The two wording rules on this page are the whole of "the same reason shown on
  // screen": the app's own fixed sentence for the four rules it owns, and the
  // SERVICE's sentence word for word for a transaction-type defect, which the app
  // never judges for itself. The canonical fixture rejects one line each way, so one
  // file exercises both — and the service's machine-phrased text for the app-owned
  // defect must appear nowhere in it.
  it('holds the same rejection wording in each row’s reason column that the screen gives that row — the app’s own sentence where the app owns the rule, the service’s own words for a transaction-type defect', async () => {
    const user = userEvent.setup();
    const preview = previewWithRejectedRows();
    stubTransactionsService(preview);

    renderFileSurface(preview);
    await takeTheCorrectionDownload(user);

    const saved = await savedCorrectionFile();

    // One line was rejected on `Currency` — a rule the APP owns, so the app's fixed
    // sentence is what the reader gets, on screen and in the file alike.
    expect(
      reasonWrittenFor(saved, referenceRejectedOn(preview, 'Currency')),
    ).toBe(APP_OWNED_CURRENCY_REASON);

    // The other was rejected on `TransactionType` — the one defect the SERVICE
    // explains. Its reason travels into the cell verbatim, untouched.
    expect(
      reasonWrittenFor(saved, referenceRejectedOn(preview, 'TransactionType')),
    ).toBe(TRANSACTION_TYPE_DEFECT_REASON);

    // The service's own machine-phrased text for the app-owned defect reaches
    // neither the screen nor the file — if it appears anywhere in here, the writer
    // read the payload directly instead of the shared wording (contract note 5).
    const everyReason = saved.rows
      .map((record) => record[saved.header.indexOf(CORRECTION_REASON_COLUMN)])
      .join('\n');
    expect(everyReason).not.toContain(SERVICE_DEFECT_REASONS.Currency);
    expect(
      screen.queryByText(SERVICE_DEFECT_REASONS.Currency),
    ).not.toBeInTheDocument();
  });

  // AC-4
  // The two halves of FR6/BR9, in one criterion. A MATCHED rejected row is written
  // from the original file's own line — the fixture writes that line from the
  // validation-errors row, so the file genuinely holds the value the service
  // objected to, and requiring the correction file to carry it back unchanged is a
  // claim about the app's read-match-write path rather than about the fixture. An
  // UNMATCHED row (BR9) has no line to draw from at all: its reference appears
  // nowhere in the file, so the only place its values can come from is the payload,
  // and it must be listed exactly once — never dropped, never duplicated, never
  // attached to somebody else's line.
  it('writes a matched rejected row exactly as the original file held it, and an unmatched one from the values the service reported', async () => {
    const user = userEvent.setup();
    const matched = previewWithRejectedRows();
    stubTransactionsService(matched);

    const withMatches = renderFileSurface(matched);
    await takeTheCorrectionDownload(user);

    const savedMatched = await savedCorrectionFile();
    const lines = originalFileLines(matched.csv);

    // Value for value, against the bytes the download answered with — defective
    // values (the unsupported currency code, the transaction type the service
    // refused) included, because those are the values the person has to correct.
    for (const rejected of matched.rejectedRows) {
      expect(
        uploadColumnsOf(recordFor(savedMatched, rejected.Reference)),
      ).toEqual(lines.get(rejected.Reference));
    }

    withMatches.unmount();
    forgetSavedFiles();

    // A file with one matched rejection AND one rejection that ties to no line.
    const unmatchable = previewWithUnmatchableRejection();
    stubTransactionsService(unmatchable);

    renderFileSurface(unmatchable);
    await takeTheCorrectionDownload(user);

    const savedUnmatchable = await savedCorrectionFile();

    // Its reference is in no line of the submitted file, so nothing it carries can
    // have come from there.
    expect(originalFileLines(unmatchable.csv).has(UNMATCHABLE_REFERENCE)).toBe(
      false,
    );

    // Both rejections are in the file — the matched one and the unmatched one —
    // and the unmatched one exactly once.
    expect(savedUnmatchable.rows).toHaveLength(
      unmatchable.rejectedRows.length +
        unmatchable.unmatchableRejections.length,
    );

    const [reported] = unmatchable.unmatchableRejections;
    expect(reported.Reference).toBe(UNMATCHABLE_REFERENCE);
    expect(
      uploadColumnsOf(recordFor(savedUnmatchable, UNMATCHABLE_REFERENCE)),
    ).toEqual(reportedValuesOf(reported));
  });

  // AC-3 and AC-4 for the row the service reported TWICE — one line of the file whose
  // amount is not a number AND whose currency is not supported.
  //
  // The correction file is where duplicating that row costs the most: a line written
  // twice is a line the person corrects twice and re-uploads twice, and the second copy
  // would be built from the payload's reported values rather than the file's own bytes.
  // It is written ONCE, from the file's own line, and its single reason cell has to
  // carry BOTH defects — naming only the first sends the person back round the
  // download → correct → re-upload loop for a problem the app already knew about.
  it('writes a line the service reported two defects for exactly once, with both reasons in its one reason cell', async () => {
    const user = userEvent.setup();
    const preview = previewWithMultiDefectRow();
    stubTransactionsService(preview);

    // Fixture precondition: the two entries really do describe ONE line of the file.
    const twiceReported = referenceRejectedOn(preview, 'Amount');
    expect(referenceRejectedOn(preview, 'Currency')).toBe(twiceReported);
    expect(preview.rows[MULTI_DEFECT_LINE - 1].Reference).toBe(twiceReported);

    renderFileSurface(preview);
    await takeTheCorrectionDownload(user);

    const saved = await savedCorrectionFile();

    // One record per rejected LINE, plus the one rejection that belongs to no line at
    // all — and `recordFor` insists on exactly one record for the twice-reported line.
    expect(saved.rows).toHaveLength(
      preview.rejectedRows.length + preview.unmatchableRejections.length,
    );
    // Written from the original file's own bytes, so both defective values come back
    // for the person to correct.
    expect(uploadColumnsOf(recordFor(saved, twiceReported))).toEqual(
      originalFileLines(preview.csv).get(twiceReported),
    );

    // BOTH defects, in the app's own sentences, in the one cell the file has for them.
    const written = reasonWrittenFor(saved, twiceReported);
    expect(written).toContain(APP_OWNED_AMOUNT_REASON);
    expect(written).toContain(APP_OWNED_CURRENCY_REASON);
    // The app owns both of those rules, so neither of the service's machine-phrased
    // sentences reaches the file (contract note 5).
    expect(written).not.toContain(SERVICE_DEFECT_REASONS.Amount);
    expect(written).not.toContain(SERVICE_DEFECT_REASONS.Currency);

    // The genuinely orphaned rejection is unaffected: still its own record, once, from
    // the only values it has.
    expect(uploadColumnsOf(recordFor(saved, UNMATCHABLE_REFERENCE))).toEqual(
      reportedValuesOf(preview.unmatchableRejections[0]),
    );
  });

  // AC-5
  // BR4's compliance exception, and the one place in this epic where the file and
  // the screen deliberately disagree. The preview MASKS every account number to its
  // last four digits (BR3, POPIA) and no reveal was used here — yet the file must
  // carry the whole number, because it has to round-trip through an upload contract
  // that has no masked-value concept. Asserting both halves at once is the point:
  // "unmasked in the file" is only meaningful alongside "not shown on screen".
  it('writes every account number in full, while the same numbers stay masked on screen', async () => {
    const user = userEvent.setup();
    const preview = previewWithRejectedRows();
    stubTransactionsService(preview);

    renderFileSurface(preview);
    await takeTheCorrectionDownload(user);

    const saved = await savedCorrectionFile();
    const lines = originalFileLines(preview.csv);

    for (const rejected of preview.rejectedRows) {
      // The whole number, as the downloaded file's own bytes hold it.
      const fullAccountNumber = rejected.AccountNumber;
      expect(lines.get(rejected.Reference)?.[ACCOUNT_NUMBER_AT]).toBe(
        fullAccountNumber,
      );

      // Written whole — never the last four, and never a masked form.
      expect(recordFor(saved, rejected.Reference)[ACCOUNT_NUMBER_AT]).toBe(
        fullAccountNumber,
      );

      // And that same whole value is nowhere in the markup: the preview shows the
      // last four digits and this row's reveal was never used, so a full number on
      // screen would be a POPIA regression rather than a stronger file.
      expect(
        screen.queryByText(fullAccountNumber, { exact: false }),
      ).not.toBeInTheDocument();
    }
  });

  // AC-6
  // Two downloads, on one page, that must be impossible to confuse (FR7, BR6): the
  // service's own generated diagnostic and this epic's re-uploadable correction
  // file. The label carries half of that and the per-control explanatory text
  // carries the other half — tied to its control, not floating near it (contract
  // note 10), so it explains the same thing to a screen-reader user that it explains
  // to a sighted one. And a file the service rejected nothing in is offered no
  // correction download at all: absent from the markup, not greyed out.
  it('offers the correction download beside the service’s error file, each saying which file it is — and offers it at all only when the preview has rejected rows', async () => {
    const withRejections = previewWithRejectedRows();
    stubTransactionsService(withRejections);

    const rejectedRowsPage = renderFileSurface(withRejections);

    const correction = await screen.findByRole('button', {
      name: CORRECTION_CONTROL_NAME,
    });
    const errorFile = screen.getByRole('button', {
      name: ERROR_FILE_CONTROL_NAME,
    });
    expect(correction).toBeEnabled();
    expect(errorFile).toBeEnabled();

    // The requirement's own wording, exactly (BR6).
    expect(correction).toHaveAccessibleName(CORRECTION_LABEL);

    // The word "error" belongs to the service's diagnostic download on this page,
    // and no other control may borrow it — which is what makes the two tellable
    // apart at a glance.
    const namedForError = screen.getAllByRole('button', { name: /error/i });
    expect(namedForError).toHaveLength(1);
    expect(namedForError[0]).toBe(errorFile);

    // Each control says, in its own description, which file it hands over: the one
    // you correct and send back in, versus the one the service generated.
    expect(correction).toHaveAccessibleDescription(
      /re-?upload|upload it again|send it back/i,
    );
    expect(errorFile).toHaveAccessibleDescription(
      /transactions service|the service/i,
    );

    rejectedRowsPage.unmount();

    // A file the service rejected nothing in. Its own rows are on screen first, so
    // the absence below is a decision about the file and not a preview that has yet
    // to load.
    const clean = previewWithNoRejectedRows();
    stubTransactionsService(clean);

    renderFileSurface(clean);
    expect(
      await screen.findByText(clean.willImportRows[0].Reference),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: ORIGINAL_FILE_CONTROL_NAME }),
    ).toBeEnabled();

    // Left out of the markup entirely. `hidden: true` still matches an aria-hidden
    // or disabled control, so a greyed-out button would fail this too — as would a
    // link standing in for the control.
    expect(
      screen.queryByRole('button', {
        name: CORRECTION_CONTROL_NAME,
        hidden: true,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', {
        name: CORRECTION_CONTROL_NAME,
        hidden: true,
      }),
    ).not.toBeInTheDocument();
  });

  // AC-7
  // NFR-3's error UX for the one operation this story adds. The file is built and
  // handed over in the browser, so the way it fails is the browser refusing to make
  // an address for it — which this test causes for real rather than mocking the
  // story's own code. What must follow is the pattern every other failure on this
  // page uses: a plain statement of what did not happen, none of the browser's own
  // words, and the SAME control still sitting there. Asking again is then proven to
  // work, because a retry affordance that does not retry is not one.
  it('reports a correction file it could not produce in plain words, and leaves the same control there to ask again', async () => {
    const user = userEvent.setup();
    const preview = previewWithRejectedRows();
    stubTransactionsService(preview);
    deliveryFails = true;

    renderFileSurface(preview);
    await takeTheCorrectionDownload(user);

    const failure = await screen.findByRole('alert');

    // Named for what did not happen, in the app's own plain words.
    expect(failure).toHaveTextContent(/could not|cannot|unable/i);
    // The browser's own error text is not something to put in front of a user.
    expect(failure).not.toHaveTextContent(BROWSER_DELIVERY_FAILURE);
    // And nothing was handed over, so the alert is not describing a file the user
    // actually got.
    expect(deliveredFiles).toHaveLength(0);

    // The same control, still there and still usable — nothing to hunt for.
    expect(
      screen.getByRole('button', { name: CORRECTION_CONTROL_NAME }),
    ).toBeEnabled();

    // Asking again works: the file arrives, and the failure stops being reported.
    deliveryFails = false;
    await takeTheCorrectionDownload(user);

    const saved = await savedCorrectionFile();
    expect(uploadColumnsOf(saved.header)).toEqual([...SUBMITTED_FILE_COLUMNS]);
    expect(saved.rows).toHaveLength(preview.rejectedRows.length);

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
