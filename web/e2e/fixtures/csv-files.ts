/**
 * CSV file fixtures for the file specs — the bytes that travel INTO an upload, and
 * the bytes the mocked transactions service streams BACK for a download.
 *
 * The submit journey needs a real file to hand to a real `<input type="file">`, so
 * these are in-memory payloads in Playwright's own file shape
 * (`{ name, mimeType, buffer }`, accepted by `locator.setInputFiles()`). Held in
 * memory rather than on disk on purpose: the browser receives a genuine `File` with
 * exactly this name and type, and no spec has to resolve a path relative to
 * whichever directory the run started in.
 *
 * The rows mirror `documentation/transactions_2026-04-15.csv` — the project's real
 * sample — so the bytes travelling through the upload are the shape the service
 * actually receives. None of those columns is an input to the upload call itself
 * (which needs only the file, its name and the chosen setting); they matter to the
 * next epic's row validation.
 *
 * Import discipline, as in `./credentials.ts`: relative paths into
 * `src/mocks/data/` (never the `@/` alias), so Playwright resolves them with no
 * alias plumbing.
 */
import {
  FILE_STATUS_VALIDATION_FAILED,
  createFileLog,
  fileLogWithStatus,
} from '../../src/mocks/data/file-log';
import { invalidRowsForEveryDefect } from '../../src/mocks/data/validation-error';

import type { FileLog } from '../../src/mocks/data/file-log';

/** A file as `locator.setInputFiles()` accepts it. */
export interface MockUploadFile {
  /** The file's own name — what the app must send as `FileName` (brief BR1). */
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** The sample's header row, verbatim (brief §Notes & Caveats — "Sample file shape"). */
const CSV_HEADER =
  'Reference,TransactionDate,AccountNumber,Description,Amount,TransactionType,Currency';

/** Three rows from the real sample — enough to be a genuine CSV, small enough to read. */
const CSV_ROWS = [
  'TXN-20260415-0001,2026/04/15 08:12,1001-2034-5567,Salary deposit - April,15750,C,ZAR',
  'TXN-20260415-0002,2026/04/15 08:34,1001-2034-5567,Woolworths Sandton,487.32,D,ZAR',
  'TXN-20260415-0003,2026/04/15 09:05,1001-2034-5567,Engen Garage fuel,650,D,ZAR',
];

/**
 * The uploaded file's name comes from the project-wide FileLog factory's canonical
 * `CurrentFileName` rather than being retyped here, so the file a spec submits and
 * the file name the mock data calls canonical are always the same string — the same
 * anti-drift arrangement `./credentials.ts` has with the identity source.
 */
export const EXPENSE_CSV_NAME = createFileLog().CurrentFileName;

/** The submitted file's bytes as text — shared by the upload fixture and by the
 *  "download the file exactly as it was submitted" payload below, so the two can
 *  never disagree about what "the original file" contains. */
const EXPENSE_CSV_TEXT = [CSV_HEADER, ...CSV_ROWS, ''].join('\r\n');

/** A valid expense CSV, ready to hand to the file chooser. */
export const expenseCsvFile = (): MockUploadFile => ({
  name: EXPENSE_CSV_NAME,
  mimeType: 'text/csv',
  buffer: Buffer.from(EXPENSE_CSV_TEXT, 'utf8'),
});

/* -------------------------------------------------------------------------- *
 * Downloads — what the service streams back
 *
 * Two DIFFERENT endpoints deliver two DIFFERENT files for the same file log
 * (epic brief §Notes — "Two distinct, already-identified download endpoints"):
 *   original file → GET /v1/files/download?FileLogId={id}          (FilesDownload)
 *   error file    → GET /v1/files/bulk-errors/download?FileLogId={id}
 *                                                       (FilesBulkErrorsDownload)
 * The source contract flags this pair — plus a third, similarly-shaped operation —
 * as a real ambiguity, so the two payloads below are deliberately DISTINGUISHABLE
 * by content as well as by name: that is what lets a spec prove each action
 * delivered its own file and that the two were not transposed.
 * -------------------------------------------------------------------------- */

/** A file as the mocked service streams it back on a download endpoint. */
export interface MockDownloadPayload {
  /** The name the service knows the file by — what the download should arrive under. */
  name: string;
  /** Both download endpoints stream `application/octet-stream` (epic brief §Notes). */
  mimeType: string;
  /** The bytes the service sends, as text. */
  body: string;
}

/** The file both downloads belong to: a file that failed validation, so the
 *  service has generated an error file for it (`HasBulkErrorFile: 'Yes'`). */
const FAILED_FILE = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED);

/**
 * The generated error file's name, as the service reported it on the file log.
 * Guarded rather than defaulted: a failed file with no `BulkErrorFile` name means
 * the shared factory changed, and a silent fallback would hide that from every
 * spec that asserts the downloaded file's name.
 */
const generatedErrorFileNameOf = (log: FileLog): string => {
  if (!log.BulkErrorFile) {
    throw new Error(
      `The ${FILE_STATUS_VALIDATION_FAILED} file from src/mocks/data/file-log.ts ` +
        'must carry a BulkErrorFile name — the error-file download is named after it.',
    );
  }
  return log.BulkErrorFile;
};

/** One CSV cell, quoted when its own text contains a delimiter or a quote. */
const csvCell = (value: string | number | undefined): string => {
  const text = value === undefined ? '' : String(value);
  return /["\r\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * The error file the service generates for a failed file: the rejected rows with
 * the column each was rejected on and the service's own reason for it. Built from
 * the shared invalid-row factory (`src/mocks/data/validation-error.ts`) rather than
 * typed out here, so the error file and the invalid-row list a spec sees on screen
 * describe the same rejected rows.
 */
const ERROR_CSV_TEXT = [
  `${CSV_HEADER},ErrorColumn,ErrorMessage`,
  ...invalidRowsForEveryDefect().map((row) =>
    [
      row.Reference,
      row.TransactionDate,
      row.AccountNumber,
      row.Description,
      row.Amount,
      row.TransactionType,
      row.Currency,
      row.ErrorColumn,
      row.ErrorMessage,
    ]
      .map(csvCell)
      .join(','),
  ),
  '',
].join('\r\n');

/**
 * `GET /v1/files/download?FileLogId={id}` — the file exactly as it was submitted
 * (FR6). Same bytes the upload fixture hands to the file chooser.
 */
export const submittedFileDownload = (): MockDownloadPayload => ({
  name: FAILED_FILE.CurrentFileName,
  mimeType: 'application/octet-stream',
  body: EXPENSE_CSV_TEXT,
});

/**
 * `GET /v1/files/bulk-errors/download?FileLogId={id}` — the error file the service
 * generated for a file that failed validation (FR7). A different name AND different
 * content from {@link submittedFileDownload}, on purpose.
 */
export const errorFileDownload = (): MockDownloadPayload => ({
  name: generatedErrorFileNameOf(FAILED_FILE),
  mimeType: 'application/octet-stream',
  body: ERROR_CSV_TEXT,
});

/**
 * `GET /v1/file-logs/data?LogId={id}` (`FileLogDataDownload`) — the THIRD,
 * similarly-shaped operation the source contract confuses with the two above, and
 * which no §6.10 pointer maps to either of this epic's downloads.
 *
 * It exists here as a decoy: a spec answers it with these bytes, so an
 * implementation that reaches for it instead delivers a file whose content matches
 * neither expected payload and fails on what the user actually received — rather
 * than passing because some file happened to download.
 */
export const forbiddenFileLogDataDownload = (): MockDownloadPayload => ({
  name: 'file-log-data-not-the-endpoint-for-either-download.csv',
  mimeType: 'application/octet-stream',
  body: 'This is GET /v1/file-logs/data, which neither download may use.\r\n',
});
