/**
 * The file of rejected rows a user takes away, corrects outside this application and
 * re-uploads as a new submission (epic `import-preview` FR6, BR4, BR5).
 *
 * It is built entirely in the browser out of the preview already on screen — there is no
 * correction endpoint in the transactions contract and none is being added — and handed
 * over by `lib/files/deliverFile.ts`, the app's one way to save a file.
 *
 * Six things here are deliberate and easy to break:
 *
 * - **EIGHT COLUMNS, AND THE EIGHTH IS ALWAYS LAST** (BR5). The file carries the SEVEN
 *   upload columns in the upload's own order, then `Reason`. Whether
 *   `POST /v1/files/upload` tolerates that extra column is UNVERIFIED — the contract
 *   documents no upload-side column validation and both services were unreachable when
 *   the column was settled — and the trailing position is the whole mitigation: a
 *   consumer reading the first seven POSITIONALLY is unaffected, and if the service
 *   refuses the file the fix is to drop the last entry of {@link CORRECTION_COLUMNS} and
 *   nothing else. Never insert `Reason` earlier, and never rename one of the seven to
 *   make room for it.
 * - **NOT `EXPORT_COLUMNS`.** `lib/transactions/exportCsv.ts` supplies the RFC 4180
 *   rules and the chunked-yield shape this module follows — one column list driving both
 *   the header row and every record — but its nine columns are the hand-over report the
 *   external payment system reads. Two unrelated artifacts, read by two different
 *   systems; the lists must never be shared or "unified".
 * - **THE SEVEN COLUMNS AND THE TOLERATED EIGHTH ARE THE READER'S OWN.**
 *   {@link CORRECTION_COLUMNS} is generated from `parseSubmittedFileCsv.ts`'s
 *   `UPLOAD_FILE_COLUMNS` and its `TOLERATED_TRAILING_COLUMN`, so the file this module
 *   WRITES and the shape that reader ACCEPTS back (BR5a) are one statement rather than
 *   two that agree today. They are a matched pair: change one and the download →
 *   correct → re-upload loop this epic exists for dead-ends at "could not read this
 *   file".
 * - **ACCOUNT NUMBERS ARE WRITTEN WHOLE** (BR4) — the same documented compliance
 *   exception `lib/transactions/exportCsv.ts` carries (POPIA masking applies everywhere
 *   a row is displayed, and the preview on screen masks these very numbers). The file
 *   has to round-trip through an upload contract that has no masked-value concept, so
 *   `lastFourDigitsOf` and `MaskedAccountNumber` must never appear here. The file and
 *   the screen disagree deliberately.
 * - **NOTHING IS RE-DERIVED HERE.** Which rows are rejected, where each row's values
 *   came from (its own line in the file, or — for a rejection matching no line, BR9 —
 *   the values the service reported for it) and what is wrong with it are all
 *   `lib/files/importPreviewRows.ts`'s answers, already resolved through the shared
 *   `lib/files/defectWording.ts`. This module writes them out; it judges nothing, so the
 *   file and the screen cannot explain the same defect two ways.
 * - **Construction yields**, exactly as `buildRequestExportCsv` does: at this project's
 *   10,000-row ceiling a single pass would hold the main thread, which is the freeze
 *   NFR-1 forbids. That is why {@link buildCorrectionCsv} is async.
 */
import { NO_REASON_GIVEN } from '@/lib/files/defectWording';
import {
  TOLERATED_TRAILING_COLUMN,
  UPLOAD_FILE_COLUMNS,
} from '@/lib/files/parseSubmittedFileCsv';
import { calendarDayOf, twoDigits } from '@/lib/utils/dateTime';

import type {
  ImportPreviewRow,
  ImportPreviewRows,
} from '@/lib/files/importPreviewRows';

/** One column of the correction file: its heading, and the value under it. */
interface CorrectionColumn {
  /** The heading, exactly as the upload's own file writes it. */
  heading: string;
  /** This row's value for the column, as text — never reformatted. */
  valueOf: (row: ImportPreviewRow) => string;
}

/**
 * The eighth column's heading — the reader's own tolerated trailing column, named once
 * (see this file's header). Writing anything else here makes the correction file
 * unreadable on the way back in.
 */
export const CORRECTION_REASON_COLUMN = TOLERATED_TRAILING_COLUMN;

/**
 * THE UPLOAD'S SEVEN COLUMNS, IN THE UPLOAD'S OWN ORDER, THEN `Reason`.
 *
 * The header row is these headings and every record is these values, in this order, so
 * the two cannot drift. The last entry is the only one that may be dropped if the
 * service turns out to refuse the extra column (BR5).
 */
export const CORRECTION_COLUMNS: CorrectionColumn[] = [
  ...UPLOAD_FILE_COLUMNS.map((column) => ({
    heading: column,
    // The row's own text, exactly as its source held it — the file's own line for a
    // matched row, the service's reported values for one that matched no line (BR9).
    // The account number among them is the WHOLE value (BR4).
    valueOf: (row: ImportPreviewRow): string => row.values[column],
  })),
  {
    heading: CORRECTION_REASON_COLUMN,
    // The same wording the screen gives this row, from the shared defect wording. A row
    // the service gave no defect signal for says so, rather than leaving a cell that
    // looks like the reason was lost.
    valueOf: (row: ImportPreviewRow): string => row.reason ?? NO_REASON_GIVEN,
  },
];

/** What the delivered blob says it is, encoding included. */
export const CORRECTION_MEDIA_TYPE = 'text/csv;charset=utf-8';

/** RFC 4180's own separators, and the quote it escapes with. */
const FIELD_SEPARATOR = ',';
const RECORD_SEPARATOR = '\r\n';
const QUOTE = '"';

/** The three characters that force a value to be quoted (RFC 4180). */
const NEEDS_QUOTING = /["\r\n,]/;

/** How many rows are written between yields — the writer's own chunk size. */
const ROWS_BETWEEN_YIELDS = 500;

/** Hands the main thread back, so a long file does not hold the screen still. */
const yieldToBrowser = (): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

/** One value, quoted only if it has to be, with its own quotes doubled. */
const csvValue = (value: string): string =>
  NEEDS_QUOTING.test(value)
    ? `${QUOTE}${value.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}`
    : value;

/** One record: the values in column order, escaped and comma-separated. */
const csvRecord = (values: string[]): string =>
  values.map(csvValue).join(FIELD_SEPARATOR);

/** The file's first line: the seven upload columns, then `Reason`. */
export const correctionHeaderRecord = (): string =>
  csvRecord(CORRECTION_COLUMNS.map((column) => column.heading));

/** One rejected row's line: its eight values, in those same eight positions. */
export const correctionRecordFor = (row: ImportPreviewRow): string =>
  csvRecord(CORRECTION_COLUMNS.map((column) => column.valueOf(row)));

/**
 * WHICH ROWS GO IN THE FILE: the preview's rejected rows, in the order the preview lists
 * them — every rejected line of the file in file order, then any rejection that matched
 * no line at all (BR9), which is listed once and never dropped.
 *
 * Stated here rather than at the control, so "the rows to fix" means one thing.
 */
export const rowsToFixIn = (preview: ImportPreviewRows): ImportPreviewRow[] =>
  preview.rows.filter((row) => row.verdict === 'rejected');

/**
 * The whole correction file, as a blob ready to hand to `lib/files/deliverFile.ts`.
 *
 * `rows` is written in the order it arrives; nothing here reorders, filters or
 * de-duplicates — the file is the rejected rows the preview is showing.
 */
export const buildCorrectionCsv = async (
  rows: readonly ImportPreviewRow[],
): Promise<Blob> => {
  const records: string[] = [correctionHeaderRecord()];

  for (let written = 0; written < rows.length; written += ROWS_BETWEEN_YIELDS) {
    const chunkEnd = Math.min(written + ROWS_BETWEEN_YIELDS, rows.length);
    for (let row = written; row < chunkEnd; row += 1) {
      records.push(correctionRecordFor(rows[row]));
    }
    // BETWEEN chunks: never inside one, and never after the last row — a yield there
    // would hold every ordinary short file back a whole task for no rows.
    if (chunkEnd < rows.length) {
      await yieldToBrowser();
    }
  }

  // A trailing record separator, which RFC 4180 permits and most readers expect — story
  // 1's reader among them, which begins no empty record for it.
  return new Blob([`${records.join(RECORD_SEPARATOR)}${RECORD_SEPARATOR}`], {
    type: CORRECTION_MEDIA_TYPE,
  });
};

/**
 * What the saved file is called: what it holds — the rows to fix — then the day and the
 * time of day it was produced, so two of them on the same day are told apart.
 *
 * Deliberately carries none of the wording the service's own diagnostic download owns on
 * this page (BR6): no "error", and neither the submitted file's own name nor the
 * generated error file's. The time is separated with DASHES, for the same reason the
 * expense export's name is — a colon is illegal in a Windows file name and the browser
 * would silently rewrite it into a name the app never chose.
 */
export const correctionFileName = (producedAt: Date = new Date()): string => {
  const timeOfDay = [
    twoDigits(producedAt.getHours()),
    twoDigits(producedAt.getMinutes()),
    twoDigits(producedAt.getSeconds()),
  ].join('-');

  return `rows-to-fix-${calendarDayOf(producedAt)}-${timeOfDay}.csv`;
};
