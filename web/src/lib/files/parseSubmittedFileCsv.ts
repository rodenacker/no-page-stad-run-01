/**
 * Reading a submitted file's rows: the CSV a user uploaded, turned into one record per
 * data line so the import preview can list every row back to them (epic
 * `import-preview` story 1, FR1/BR8/NFR-1).
 *
 * This is the SYMMETRIC COUNTERPART of `lib/transactions/exportCsv.ts`. That module
 * WRITES a CSV under RFC 4180's quoting rules; this one reads one back under the same
 * rules, so anything the app writes it can read — a value carrying a comma, a doubled
 * quotation mark or a line break comes back exactly as the person typed it, `\r\n`
 * included. The two must be changed together.
 *
 * Six things here are deliberate and easy to break:
 *
 * - **NOT `EXPORT_COLUMNS`.** That is the NINE-column hand-over report the payment
 *   system reads. This is the SEVEN upload columns of
 *   `documentation/transactions_2026-04-15.csv` — the shape `POST /v1/files/upload`
 *   accepts. The two lists are unrelated artifacts read by different systems and must
 *   never be shared or "unified".
 * - **"Cannot be read" is a RETURNED VALUE, never a thrown error, and never partial
 *   rows** (BR8). The caller renders a plainly-stated problem instead of a table, so it
 *   needs an answer it can branch on rather than a `try`/`catch` — and it must be able to
 *   tell an UNREADABLE BODY apart from a body that reads fine but is not this file's
 *   columns, because those are two different things to say to a person. A refusal
 *   carries no rows at all: not even the lines read before the file went wrong, which
 *   would put a silently truncated preview on screen.
 * - **Exactly one extra column is tolerated: a trailing `Reason`, in last position,
 *   which is discarded** (BR5a, user-confirmed 2026-08-17). This is a DELIBERATE
 *   ROUND-TRIP AFFORDANCE, not a lax parser, and it is the reason the epic works at all:
 *   the correction CSV the preview hands out carries that eighth column, an employee
 *   fixes the rows offline, and the file is re-uploaded UNMODIFIED. A reader that
 *   refused it would dead-end the download → correct → re-upload loop at "could not read
 *   this file". The tolerance is exactly the seven followed by exactly one `Reason` —
 *   an unknown extra column, or a ninth alongside `Reason`, is still a file the app does
 *   not understand. Do not "tidy" this into "ignore any extra columns" or "drop anything
 *   past the seventh": that would silently accept genuinely malformed files and let a
 *   bank's own export populate the preview under the wrong headings.
 * - **Reading yields** (NFR-1), the same way `buildRequestExportCsv` writes: a chunk of
 *   lines, then the main thread back through a `setTimeout(0)` MACROTASK, so a
 *   10,000-row file — this project's endorsed ceiling, downloaded and parsed in the
 *   browser — does not hold the screen still. A microtask "yield"
 *   (`await Promise.resolve()`) is not this: a browser cannot paint between microtasks.
 *   That is also why this function is async.
 * - **Every value is TEXT.** A CSV has no types, and the rows this preview exists to
 *   display include ones whose `Amount` is not a number and whose `TransactionDate` is
 *   not a date — that is precisely why they were rejected. Nothing here parses, trims,
 *   coerces or normalises a value; the file's own bytes are what the user must be shown
 *   and what the correction CSV writes back.
 * - **Text in, not a `Blob`.** The caller reads the downloaded bytes (with `FileReader`
 *   — jsdom implements neither `Blob.text()` nor `Blob.arrayBuffer()`, so a `.text()`
 *   call works in a browser and throws in every test). Keeping this a pure
 *   text-to-records function is what makes it testable without a network or a DOM.
 */

/**
 * THE SEVEN UPLOAD COLUMNS, IN THE FILE'S OWN ORDER
 * (`documentation/transactions_2026-04-15.csv`, line 1).
 *
 * Both the shape check and the position each value is read from come from this one
 * list, so a column cannot be renamed, reordered or dropped in one of them without the
 * other following.
 */
export const UPLOAD_FILE_COLUMNS = [
  'Reference',
  'TransactionDate',
  'AccountNumber',
  'Description',
  'Amount',
  'TransactionType',
  'Currency',
] as const;

export type SubmittedFileColumn = (typeof UPLOAD_FILE_COLUMNS)[number];

/** One data line of a submitted file, keyed by the column each value sat under. */
export type SubmittedFileRow = Record<SubmittedFileColumn, string>;

/**
 * The ONE extra column this reader tolerates, in LAST position only — the rejection
 * reason the correction CSV writes for whoever fixes the file offline (BR5). It is
 * discarded on the way back in; nothing about it reaches a record.
 */
export const TOLERATED_TRAILING_COLUMN = 'Reason';

/** The body is not CSV: a quoted value is never closed, or a line's fields do not line
 * up with the header's columns. Nothing about it can be trusted. */
export const UNREADABLE_BODY = 'unreadable-body';

/** The body reads perfectly well as CSV but is not THIS file: its columns are not the
 * seven the upload accepts (optionally plus the tolerated `Reason`). */
export const UNEXPECTED_COLUMNS = 'unexpected-columns';

/**
 * Why a file could not be read. The two are kept apart on purpose: "we could not read
 * this file" and "this file is not in the shape we accept" are different things to tell
 * a person, and only this reader knows which happened.
 */
export type SubmittedFileReadProblem =
  | typeof UNREADABLE_BODY
  | typeof UNEXPECTED_COLUMNS;

/** What reading a submitted file answers with: its rows, or why it has none. */
export type SubmittedFileReadResult =
  | { status: 'read'; rows: SubmittedFileRow[] }
  | { status: 'cannot-read'; problem: SubmittedFileReadProblem };

/** RFC 4180's field separator and quote — the same two `exportCsv.ts` writes with. */
const FIELD_SEPARATOR = ',';
const QUOTE = '"';
const CARRIAGE_RETURN = '\r';
const LINE_FEED = '\n';

/**
 * How many lines are read between yields. Matches the writer's own chunk size: large
 * enough that the yields cost nothing at ordinary volumes, small enough that no single
 * pass is long at the 10,000-row ceiling.
 */
const LINES_BETWEEN_YIELDS = 500;

/** Hands the main thread back, so a long file does not hold the screen still. */
const yieldToBrowser = (): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

/** A record whose every column is an empty cell — the base each parsed line fills in,
 * so the row's keys come from {@link UPLOAD_FILE_COLUMNS} and from nowhere else. */
const EMPTY_ROW: SubmittedFileRow = {
  Reference: '',
  TransactionDate: '',
  AccountNumber: '',
  Description: '',
  Amount: '',
  TransactionType: '',
  Currency: '',
};

/** One line of the file, read as fields — or nothing at all, when the line is not CSV. */
interface ParsedLine {
  values: string[];
  /** Where the next line begins: past the line ending, or at the end of the body. */
  next: number;
}

/**
 * Read one line of fields starting at `start`.
 *
 * Answers `undefined` for a line that is not CSV under RFC 4180: a quoted value that is
 * never closed (the rest of the file is then one unterminated value), or text sitting
 * outside a closing quote. A double quote INSIDE an unquoted value is read as the
 * character it is — some writers emit that, and refusing a whole file over it would be
 * stricter than the standard is useful.
 */
const parseLineAt = (body: string, start: number): ParsedLine | undefined => {
  const values: string[] = [];
  let index = start;

  for (;;) {
    let value = '';

    if (body[index] === QUOTE) {
      index += 1;
      for (;;) {
        const closing = body.indexOf(QUOTE, index);
        if (closing === -1) {
          // Opened and never closed: everything after it is one value with no end.
          return undefined;
        }
        value += body.slice(index, closing);
        index = closing + 1;
        // A doubled quote is the value's own quotation mark, not the end of it.
        if (body[index] === QUOTE) {
          value += QUOTE;
          index += 1;
          continue;
        }
        break;
      }
      const afterClosingQuote = body[index];
      if (
        afterClosingQuote !== undefined &&
        afterClosingQuote !== FIELD_SEPARATOR &&
        afterClosingQuote !== CARRIAGE_RETURN &&
        afterClosingQuote !== LINE_FEED
      ) {
        return undefined;
      }
    } else {
      const fieldStart = index;
      while (index < body.length) {
        const character = body[index];
        if (
          character === FIELD_SEPARATOR ||
          character === CARRIAGE_RETURN ||
          character === LINE_FEED
        ) {
          break;
        }
        index += 1;
      }
      value = body.slice(fieldStart, index);
    }

    values.push(value);

    const character = body[index];
    if (character === FIELD_SEPARATOR) {
      index += 1;
      continue;
    }
    if (character === undefined) {
      return { values, next: index };
    }
    // A line ending: CRLF, or a bare LF or CR. The file's own ending is not the app's
    // business — a file produced on Windows arrives with CRLF and reads the same.
    if (character === CARRIAGE_RETURN && body[index + 1] === LINE_FEED) {
      return { values, next: index + 2 };
    }
    return { values, next: index + 1 };
  }
};

/** A line with nothing on it at all — the trailing newline RFC 4180 permits, and any
 * blank line between records. It ends the previous line; it does not begin a record. */
const isBlankLine = (values: readonly string[]): boolean =>
  values.length === 1 && values[0] === '';

/**
 * Whether a header row is a shape this reader accepts, and how many of its columns are
 * a record's (the tolerated `Reason` is beyond them, and is dropped).
 *
 * The tolerance is matched EXACTLY — the seven, in order, then at most one column named
 * `Reason` — rather than by asking whether `Reason` appears anywhere or whether there
 * are more than seven columns. Both of those shortcuts wave through a file carrying the
 * seven plus `Reason` PLUS something unknown, which is not a file this app understands.
 */
const acceptsHeader = (header: readonly string[]): boolean => {
  const uploadColumnsIntact = UPLOAD_FILE_COLUMNS.every(
    (column, position) => header[position] === column,
  );
  if (!uploadColumnsIntact) {
    return false;
  }
  if (header.length === UPLOAD_FILE_COLUMNS.length) {
    return true;
  }
  return (
    header.length === UPLOAD_FILE_COLUMNS.length + 1 &&
    header[UPLOAD_FILE_COLUMNS.length] === TOLERATED_TRAILING_COLUMN
  );
};

/** One line's fields as a record, reading each value from the position its column sits
 * in. Anything past the seven — the tolerated `Reason` — is left behind here. */
const rowFrom = (values: readonly string[]): SubmittedFileRow => {
  const row: SubmittedFileRow = { ...EMPTY_ROW };
  UPLOAD_FILE_COLUMNS.forEach((column, position) => {
    row[column] = values[position];
  });
  return row;
};

const cannotRead = (
  problem: SubmittedFileReadProblem,
): SubmittedFileReadResult => ({ status: 'cannot-read', problem });

/**
 * Read a submitted file's CSV text into one record per data line, in file order.
 *
 * The header row is the file's own column names and is never a record. A file this
 * reader cannot read comes back as a stated problem with no rows at all — see this
 * file's header for why that is a value rather than a thrown error.
 */
export const parseSubmittedFileCsv = async (
  body: string,
): Promise<SubmittedFileReadResult> => {
  const rows: SubmittedFileRow[] = [];
  let index = 0;
  let header: string[] | undefined;
  let linesRead = 0;

  while (index < body.length) {
    const line = parseLineAt(body, index);
    if (line === undefined) {
      return cannotRead(UNREADABLE_BODY);
    }
    index = line.next;

    if (isBlankLine(line.values)) {
      continue;
    }

    if (header === undefined) {
      if (!acceptsHeader(line.values)) {
        return cannotRead(UNEXPECTED_COLUMNS);
      }
      header = line.values;
      continue;
    }

    // A line that does not line up with the header's columns is a file gone wrong, not
    // a row to show: reading it would put values under the wrong headings.
    if (line.values.length !== header.length) {
      return cannotRead(UNREADABLE_BODY);
    }

    rows.push(rowFrom(line.values));

    linesRead += 1;
    // BETWEEN chunks: never inside one, and never after the last line either — a yield
    // there would hold every read, including the ordinary short one, back a whole task
    // for no rows.
    if (linesRead % LINES_BETWEEN_YIELDS === 0 && index < body.length) {
      await yieldToBrowser();
    }
  }

  if (header === undefined) {
    // Nothing readable at all: no header row, so there is no file shape to speak of.
    return cannotRead(UNREADABLE_BODY);
  }

  return { status: 'read', rows };
};
