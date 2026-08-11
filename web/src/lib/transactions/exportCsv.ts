/**
 * The hand-over file the external payment system reads: the listed expense payment
 * requests written as CSV (brief R1/R2, RPT-01).
 *
 * It lives here, beside `narrowing.ts` / `ordering.ts` / `display.ts`, for the same
 * reason those do — the nine columns and their order have to be stated ONCE. The header
 * row and the row writer are both generated from {@link EXPORT_COLUMNS} below, so a
 * column cannot be renamed, reordered or dropped in one of them without the other
 * following. A receiving system, not a person, reads this file next: a transposed pair
 * of columns is a silent corruption, not a cosmetic slip.
 *
 * Five things here are deliberate and easy to break:
 *
 * - **The account number is written WHOLE and UNMASKED, and the transaction type is the
 *   service's own value.** This is the one place in the application where either is
 *   true. Everywhere a request is listed the account number is masked to its last four
 *   digits (POPIA — project.md §Compliance) and the type is shown in plain language, and
 *   both rules live in `lib/transactions/display.ts`. Neither `lastFourDigitsOf` nor
 *   `transactionTypeLabel` may be used here (brief §Compliance Exception, BR4/BR5): the
 *   payment system consumes the whole number and the raw code, and a masked account
 *   number or a translated label would pass an eyeball check while breaking the
 *   hand-over. That exception is documented and mandatory — it must never be "fixed".
 * - **Every value is written exactly as the service sent it.** The amount is the raw
 *   number (no thousands separator, no currency symbol — the receiving system reads a
 *   number), the date is the string the service wrote (its format is an unverified
 *   assumption for this project, so normalising it here would hide a real difference),
 *   and a request with no decision note gets an EMPTY cell rather than the word
 *   "undefined" or a missing field, which would shorten its record to eight columns.
 * - **Escaping is RFC 4180 (BR3).** A value carrying a comma, a double quote or a line
 *   break is quoted and its own quotes are doubled — and nothing else about it is
 *   touched. In particular a `\r\n` inside a description survives as `\r\n`: those are
 *   words a person typed, and normalising them would quietly rewrite them. Only values
 *   that need quoting are quoted; the standard permits more, but the minimum is what a
 *   spreadsheet and a parser both read most predictably.
 * - **Construction yields (BR6).** At the app's stated ceiling of 10,000 requests the
 *   whole file is one long string, and building it in a single pass would hold the main
 *   thread for the duration — which is exactly the freeze the feature NFR forbids. Rows
 *   are written a chunk at a time with a yield in between, so keystrokes, scrolling and
 *   paint all still get a turn. That is also why {@link buildRequestExportCsv} is async:
 *   a caller awaits the file rather than receiving it inline.
 * - **No byte-order mark.** A BOM would make a spreadsheet open the file as UTF-8
 *   without being told, but the file's declared consumer is the payment system (brief
 *   §Goal) and a leading mark is data some parsers hand back as part of the first
 *   column. The encoding is declared on the blob's media type instead.
 */
import { calendarDayOf, twoDigits } from '@/lib/utils/dateTime';

import type { TransactionRead } from '@/types/transactions';

/** One exported column: the heading a receiving system reads, and the value under it. */
interface ExportColumn {
  /** RPT-01's own column name (brief §Data Model) — never an internal field name. */
  heading: string;
  /** The request's value for this column, as text, exactly as the service sent it. */
  valueOf: (request: TransactionRead) => string;
}

/**
 * THE NINE RPT-01 COLUMNS, IN THE ONE ORDER THE PAYMENT SYSTEM ACCEPTS (brief R2).
 *
 * This list is the whole contract: the header row is its headings and every record is
 * its values, in this order. Adding, removing or moving an entry changes the file for
 * the receiving system, so it is a contract change rather than a refactor.
 */
export const EXPORT_COLUMNS: ExportColumn[] = [
  { heading: 'Reference', valueOf: (request) => request.Reference },
  {
    heading: 'Transaction date',
    valueOf: (request) => request.TransactionDate,
  },
  {
    heading: 'Account number',
    // FULL and UNMASKED — the documented compliance exception (see this file's header).
    valueOf: (request) => request.AccountNumber,
  },
  { heading: 'Description', valueOf: (request) => request.Description },
  {
    heading: 'Amount',
    // The raw number the service sent: a formatted amount is not a number to whatever
    // reads this next.
    valueOf: (request) => String(request.Amount),
  },
  {
    heading: 'Transaction type',
    // The service's own value, never `transactionTypeLabel`'s wording (BR5).
    valueOf: (request) => request.TransactionType,
  },
  { heading: 'Currency', valueOf: (request) => request.Currency },
  { heading: 'Status', valueOf: (request) => request.Status },
  {
    heading: 'Decision note',
    // Absent on anything but a rejected request: an empty cell, not a missing one.
    valueOf: (request) => request.UserNote ?? '',
  },
];

/** What the delivered blob says it is, encoding included. */
export const EXPORT_MEDIA_TYPE = 'text/csv;charset=utf-8';

/** RFC 4180's own separators, and the quote it escapes with. */
const FIELD_SEPARATOR = ',';
const RECORD_SEPARATOR = '\r\n';
const QUOTE = '"';

/** The three characters that force a value to be quoted (RFC 4180, brief BR3). */
const NEEDS_QUOTING = /["\r\n,]/;

/**
 * How many rows are written between yields. Large enough that the yields themselves
 * cost nothing at ordinary volumes, small enough that no single pass is long at the
 * 10,000-row ceiling (see this file's header).
 */
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

/** The file's first line: the nine column names, in RPT-01's order. */
export const exportHeaderRecord = (): string =>
  csvRecord(EXPORT_COLUMNS.map((column) => column.heading));

/** One request's line: its nine values, in those same nine positions. */
export const exportRecordFor = (request: TransactionRead): string =>
  csvRecord(EXPORT_COLUMNS.map((column) => column.valueOf(request)));

/**
 * The whole file, as a blob ready to hand to `lib/files/deliverFile.ts`.
 *
 * `requests` is written in the order it arrives — the caller has already narrowed and
 * ordered it, and nothing here reorders, filters or de-duplicates: the file is what the
 * list was showing (brief BR1).
 */
export const buildRequestExportCsv = async (
  requests: TransactionRead[],
): Promise<Blob> => {
  const records: string[] = [exportHeaderRecord()];

  for (
    let written = 0;
    written < requests.length;
    written += ROWS_BETWEEN_YIELDS
  ) {
    const chunkEnd = Math.min(written + ROWS_BETWEEN_YIELDS, requests.length);
    for (let row = written; row < chunkEnd; row += 1) {
      records.push(exportRecordFor(requests[row]));
    }
    // BETWEEN chunks: never inside one (so the yield count is bounded by the volume and
    // not by the row count), and never after the last row either. A yield there would
    // hold every export — including the ordinary short one — back a whole task for no
    // rows, and the file is finished by then.
    if (chunkEnd < requests.length) {
      await yieldToBrowser();
    }
  }

  // A trailing record separator, which RFC 4180 permits and most readers expect.
  return new Blob([`${records.join(RECORD_SEPARATOR)}${RECORD_SEPARATOR}`], {
    type: EXPORT_MEDIA_TYPE,
  });
};

/**
 * What the saved file is called (brief BR7): what it holds, then the day and the time of
 * day it was produced, so two exports on the same day are told apart rather than
 * colliding.
 *
 * The time is separated with DASHES, not colons: a colon is illegal in a Windows file
 * name and the browser rewrites it silently, so the user would be handed a name the app
 * never chose. Everything here is the reader's OWN clock — the file is named for when
 * they produced it, not for a server's timezone, which is why the day comes from
 * `lib/utils/dateTime.ts`, the one place the app writes a day of its own.
 *
 * Seconds are the part that is only here: they are what tells two exports in the same
 * minute apart, and a moment shown to a PERSON (the export's confirmation) is accurate
 * to the minute instead.
 */
export const expenseRequestExportFileName = (
  producedAt: Date = new Date(),
): string => {
  const timeOfDay = [
    twoDigits(producedAt.getHours()),
    twoDigits(producedAt.getMinutes()),
    twoDigits(producedAt.getSeconds()),
  ].join('-');

  return `expense-requests-export-${calendarDayOf(producedAt)}-${timeOfDay}.csv`;
};
