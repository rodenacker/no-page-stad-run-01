/**
 * Story Metadata:
 * - Route: null (non-routable — a library module with no screen of its own)
 * - Target File: web/src/lib/files/parseSubmittedFileCsv.ts
 * - Page Action: create_new
 *
 * Epic `import-preview`, story 1 — READ A SUBMITTED FILE'S ROWS.
 *
 * The preview downloads the originally submitted file and parses it in the browser
 * (brief §Data Model, "Parsing the original file"). Reading a CSV is a genuinely new
 * capability for this project: `web/src/lib/transactions/exportCsv.ts` only WRITES one.
 * This story builds the reader — the writer's symmetric counterpart — and nothing on
 * screen changes yet. Stories 2–4 are its callers.
 *
 * ---------------------------------------------------------------------------
 * THE CONTRACT THESE TESTS PIN (the module does not exist yet — TDD red)
 * ---------------------------------------------------------------------------
 * 1. ONE FUNCTION, at `web/src/lib/files/parseSubmittedFileCsv.ts`:
 *
 *      parseSubmittedFileCsv(body: string): Promise<
 *        | { status: 'read';       rows: Record<SubmittedFileColumn, string>[] }
 *        | { status: 'cannot-read'; problem: 'unreadable-body' | 'unexpected-columns' }
 *      >
 *
 * 2. TEXT IN, NOT A BLOB. `downloadSubmittedFile` (`lib/api/files.ts`) already hands
 *    story 3 a `Blob`; turning it into text is one read at the call site. Keeping the
 *    reader a pure text-to-records function is what lets these tests state its whole
 *    behaviour without a network, a DOM or a mock.
 * 3. ONE RECORD PER DATA LINE, KEYED BY COLUMN NAME, IN FILE ORDER. The header row is
 *    the file's own column names and is never a record. Every value is TEXT: a CSV has
 *    no types, and the rows this epic exists to display include ones whose `Amount` is
 *    not a number and whose `TransactionDate` is not a date — that is why they were
 *    rejected.
 * 4. "CANNOT BE READ" IS A RETURNED VALUE, NOT AN EXCEPTION, AND NEVER PARTIAL ROWS
 *    (BR8). Story 3 renders a plainly-stated problem instead of a table, so it needs an
 *    answer it can branch on rather than a `try`/`catch` — and it must be able to tell
 *    an UNREADABLE BODY apart from a body that reads fine but is not this file's
 *    columns, because those are two different things to say to a person. A reader that
 *    collapsed both into one generic failure, or that handed back the lines it managed
 *    to get through before giving up, would pass a looser test and mislead the user.
 * 5. EXACTLY ONE EXTRA COLUMN IS TOLERATED: a trailing `Reason`, in LAST position, which
 *    is DISCARDED (BR5a, user-confirmed 2026-08-17). Story 4's correction CSV carries
 *    that eighth column, and the whole point of this epic is that an employee corrects
 *    that file offline and re-uploads it unmodified — a reader that refuses it
 *    dead-ends the loop at "could not read this file". The tolerance is DELIBERATELY
 *    NARROW and AC-6 below pins its boundary, not just its happy case: an unknown extra
 *    column is still a refusal, and so is a ninth column ALONGSIDE `Reason` — the case
 *    that fails a reader which merely asks "is `Reason` in the header?" or "are there
 *    more than seven columns?". This is a round-trip affordance, not a lax parser.
 * 6. CONSTRUCTION YIELDS (NFR-1), in the same manner `buildRequestExportCsv` already
 *    writes: a chunk of rows, then the main thread back (`setTimeout(0)`), so a
 *    10,000-row file — this project's endorsed ceiling — does not hold the screen still
 *    while it is read. That is also why the function is async. A microtask "yield"
 *    (`await Promise.resolve()`) is NOT this: the browser cannot paint between
 *    microtasks, and AC-5's test below fails such an implementation on purpose.
 * 7. RFC 4180, SYMMETRICALLY WITH THE WRITER. `exportCsv.ts` quotes a value holding a
 *    comma, a double quote or a line break and doubles its own quotes; the reader must
 *    give that value back unchanged, `\r\n` included — those are words a person typed.
 *    Anything the writer produces, the reader reads.
 * 8. NOT `EXPORT_COLUMNS`. That is the nine-column hand-over report; this is the SEVEN
 *    upload columns (`documentation/transactions_2026-04-15.csv`). The two shapes are
 *    unrelated and must not be shared (story §Reuse notes).
 * ---------------------------------------------------------------------------
 *
 * Mocked here, and why: NOTHING. The module under test is pure — text in, records out —
 * so there is no HTTP client to stand in for and no component to render. Mocking
 * anything here would only mock the code under test.
 *
 * EVERY BYTE OF EVERY FILE BELOW COMES FROM THE PROJECT-WIDE FIXTURES
 * (`web/src/mocks/data/submitted-file.ts`), shared with the Playwright layer and with
 * stories 2–4. No CSV text is written by hand in this file: the whole point of the
 * preview is that the parsed file and the rejected-row overlay describe the same rows,
 * and a test that authors its own bytes is exactly how that agreement rots.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): the module does not
 * exist.
 */
import { describe, expect, it } from 'vitest';

import { parseSubmittedFileCsv } from '@/lib/files/parseSubmittedFileCsv';
import {
  BINARY_FILE_BODY,
  LARGE_FILE_ROW_COUNT,
  SUBMITTED_FILE_COLUMNS,
  UNTERMINATED_QUOTE_FILE_BODY,
  correctionCsvReupload,
  largeSubmittedFileCsv,
  previewWithHostileRejectedRow,
  reasonPlusUnknownColumnFileBody,
  submittedFileCsv,
  submittedFileRow,
  submittedFileRows,
  tooFewColumnsFileBody,
  trailingNewlinePair,
  unknownExtraColumnFileBody,
  wrongColumnNamesFileBody,
} from '@/mocks/data/submitted-file';
import { DESCRIPTION_WITH_EVERY_HOSTILE_CHARACTER } from '@/mocks/data/transaction';

import type { SubmittedFileRow } from '@/mocks/data/submitted-file';

/**
 * The two reasons a file cannot be read, which story 3 branches on (contract note 4).
 * Named here so a test states which of the two it means rather than repeating a
 * string, and so the pair can be asserted to be genuinely different answers.
 */
const UNREADABLE_BODY = 'unreadable-body';
const UNEXPECTED_COLUMNS = 'unexpected-columns';

/** Which data line of `previewWithHostileRejectedRow()` carries the free text holding
 * every character RFC 4180 makes dangerous (the fixture rejects line 2). */
const HOSTILE_LINE_NUMBER = 2;

/** The seven upload columns as a lookup, for asking of a parsed record "is this key one
 * of the seven?" — which is how AC-6 proves the eighth column left no trace. */
const SEVEN_UPLOAD_COLUMNS = new Set<string>(SUBMITTED_FILE_COLUMNS);

/** Whatever the reader answers with — inferred, so these tests describe the contract
 * once (in the header) rather than restating its type here. */
type ReadResult = Awaited<ReturnType<typeof parseSubmittedFileCsv>>;

/** A short, readable rendering of an unexpected answer, for a failure message — sliced
 * because one of these files holds 10,000 rows. */
const summarise = (result: ReadResult): string =>
  JSON.stringify(result).slice(0, 200);

/**
 * The records a body read to. Throws — loudly, with what the reader actually said — if
 * the reader refused a file these tests require it to read.
 */
const recordsIn = (result: ReadResult) => {
  if (result.status !== 'read') {
    throw new Error(
      `Expected this file to be read; the reader answered ${summarise(result)}`,
    );
  }
  return result.rows;
};

/**
 * The reason the reader refused a body — proving as it goes that the refusal ARRIVED
 * (awaiting a rejected promise would fail the test here, which is the "never a thrown
 * error" half of AC-4) and that it carries NO ROWS AT ALL, not even the lines the
 * reader managed to get through before giving up.
 */
const refusalFor = async (body: string) => {
  const result = await parseSubmittedFileCsv(body);
  if (result.status !== 'cannot-read') {
    throw new Error(
      `Expected the reader to refuse this body; it answered ${summarise(result)}`,
    );
  }
  expect(Object.keys(result)).not.toContain('rows');
  return result.problem;
};

describe("Reading a submitted file's rows", () => {
  // AC-1
  it('reads a seven-column file with a header row into one record per data line, in file order, each value under its own column', async () => {
    const rows = submittedFileRows(5);

    const records = recordsIn(
      await parseSubmittedFileCsv(submittedFileCsv(rows)),
    );

    // One record per DATA line: five, not six — the header row is the file's column
    // names, never a record of its own.
    expect(records).toHaveLength(rows.length);
    // Deep equality is the whole of the AC in one assertion: the same five lines, in
    // the file's own order, every value under the column whose heading it was written
    // beneath. A reader that transposed two columns, dropped a line or shifted the
    // order fails here.
    expect(records).toEqual(rows);
  });

  // AC-2
  it('keeps commas, doubled quotes and line breaks inside a quoted value intact, exactly as the writer produced them', async () => {
    // Line 2 of this file carries every character RFC 4180 makes dangerous, in one
    // quoted value: a comma, a doubled quotation mark and a CRLF (the project-wide
    // constant, so the writer's tests and the reader's tests fight the same string).
    const preview = previewWithHostileRejectedRow();

    const records = recordsIn(await parseSubmittedFileCsv(preview.csv));

    // The line break INSIDE the quoted description is not a record separator: a reader
    // that split the file on newlines would find six records here, and would misalign
    // every column of the two halves it tore that line into.
    expect(records).toHaveLength(preview.rows.length);
    expect(records).toEqual(preview.rows);

    // And the value itself arrives whole, ON THE LINE THAT HELD IT — one field, its
    // comma, its `"` and its `\r\n` all present, and its neighbouring columns
    // unshifted.
    const hostileLine = records[HOSTILE_LINE_NUMBER - 1];
    expect(hostileLine.Description).toBe(
      DESCRIPTION_WITH_EVERY_HOSTILE_CHARACTER,
    );
    expect(hostileLine).toEqual(preview.rows[HOSTILE_LINE_NUMBER - 1]);
  });

  // AC-3
  it('reads a file with a trailing newline and the same file without one to the same records, with no empty final record', async () => {
    // Both bodies are built from ONE array of lines, so "they read to the same
    // records" is a claim about the reader rather than about two look-alike fixtures.
    const { rows, withTrailingNewline, withoutTrailingNewline } =
      trailingNewlinePair();

    const fromTerminated = recordsIn(
      await parseSubmittedFileCsv(withTrailingNewline),
    );
    const fromUnterminated = recordsIn(
      await parseSubmittedFileCsv(withoutTrailingNewline),
    );

    expect(fromTerminated).toEqual(rows);
    expect(fromUnterminated).toEqual(rows);

    // The trailing newline ends the last line; it does not begin an empty one. A
    // reader that split on the separator and kept the tail would report a fourth,
    // blank record here — and the preview would show a phantom row.
    expect(fromTerminated).toHaveLength(rows.length);
    expect(fromTerminated[rows.length - 1]).toEqual(rows[rows.length - 1]);
  });

  // AC-4
  it('answers with an explicit cannot-be-read outcome — never a thrown error, never partial records — and tells an unreadable body apart from a wrong column shape', async () => {
    // A body that is not CSV under RFC 4180: a quoted field opened on line 2 and never
    // closed, so the rest of the file is one unterminated value. Three lines were
    // readable before it; none of them may come back (contract note 4, asserted inside
    // `refusalFor`).
    const unreadable = await refusalFor(UNTERMINATED_QUOTE_FILE_BODY);
    expect(unreadable).toBe(UNREADABLE_BODY);

    // Bodies that read PERFECTLY WELL as CSV but are not this file. Each would
    // otherwise populate the preview with values under the wrong headings — the
    // failure a reader that only counted columns, or only checked they parsed, would
    // ship silently.
    // Seven columns, a bank's own names for them.
    const wrongNames = await refusalFor(wrongColumnNamesFileBody());
    expect(wrongNames).toBe(UNEXPECTED_COLUMNS);
    // Six columns — `Currency` dropped.
    expect(await refusalFor(tooFewColumnsFileBody())).toBe(UNEXPECTED_COLUMNS);

    // THE PART STORY 3 DEPENDS ON: the two are DISTINGUISHABLE answers, not one
    // generic failure. "We could not read this file" and "this file is not in the
    // shape we accept" are different things to tell a person, and only the reader
    // knows which happened.
    expect(unreadable).not.toBe(wrongNames);

    // A PDF someone uploaded by mistake, NUL bytes included. Which of the two reasons
    // fits it is the reader's own call — the fixture deliberately does not dictate one
    // — but it must be one of them, and it must be a refusal rather than a crash.
    expect([UNREADABLE_BODY, UNEXPECTED_COLUMNS]).toContain(
      await refusalFor(BINARY_FILE_BODY),
    );
  });

  // AC-5
  // The 30-second ceiling on this one is a runaway guard for building and reading
  // 10,000 rows on a loaded machine — NOT a timing assertion. AC-5's claim is the
  // ordering asserted below, which no wall clock takes part in.
  it('hands the main thread back between chunks while reading a 10,000-row file, rather than reading it in one blocking pass', async () => {
    const csv = largeSubmittedFileCsv();
    const order: string[] = [];

    const reading = parseSubmittedFileCsv(csv).then((result: ReadResult) => {
      order.push('the file finished reading');
      return result;
    });

    // A task queued on the main thread AFTER the read has started. It can only run
    // BEFORE the read finishes if the read hands the thread back between chunks the
    // way `buildRequestExportCsv` does. Two implementations fail this, both of which
    // freeze the screen at the ceiling: one that reads the whole file in a single
    // pass, and one that "yields" only to microtasks (`await Promise.resolve()`),
    // between which a browser cannot paint. Nothing here measures elapsed time.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    order.push('other work on the main thread ran');

    const records = recordsIn(await reading);

    expect(order).toEqual([
      'other work on the main thread ran',
      'the file finished reading',
    ]);

    // Yielding is only worth anything if the file still arrives whole: a chunked read
    // fails by dropping or repeating a line at a chunk boundary, and the last line is
    // where that shows.
    expect(records).toHaveLength(LARGE_FILE_ROW_COUNT);
    expect(records[0]).toEqual(submittedFileRow(1));
    expect(records[LARGE_FILE_ROW_COUNT - 1]).toEqual(
      submittedFileRow(LARGE_FILE_ROW_COUNT),
    );
  }, 30_000);

  // AC-6
  it('reads a correction CSV re-uploaded with its trailing Reason column, discarding that column and keeping the seven intact — while still refusing any other extra column', async () => {
    // Story 4's correction CSV, fed straight back into the upload with nobody stripping
    // anything: the seven upload columns in order, then `Reason` (BR5a). This is the
    // round trip the epic exists to enable — download, correct offline, re-upload — so
    // refusing this file would dead-end the whole loop at "could not read this file".
    //
    // The fixture plants a comma inside a quoted `Amount`, a comma inside a quoted
    // `Reason` and doubled quotes inside another `Reason`, on purpose: a reader that
    // finds the eighth column by counting commas instead of parsing breaks on every one
    // of them.
    const { csv, rows, reasons } = correctionCsvReupload();

    const records = recordsIn(await parseSubmittedFileCsv(csv));

    // HALF ONE — the seven survive byte-intact. `rows` is exactly what a correct reader
    // must produce, so this fails a reader that shifted a column, truncated a quoted
    // value at its inner comma, or folded `Reason` in as an eighth key.
    expect(records).toEqual(rows);

    // HALF TWO — the eighth column is genuinely DISCARDED, not quietly appended to the
    // last column or kept under a key nobody asked for. Asserted two ways, because a
    // reader can lose the column from the keys and still smuggle its text into a value.
    // No key beyond the seven survives — `Reason` least of all.
    const strayKeys = records.flatMap((record: SubmittedFileRow) =>
      Object.keys(record).filter((key) => !SEVEN_UPLOAD_COLUMNS.has(key)),
    );
    expect(strayKeys).toEqual([]);

    const valuesCarryingAReason = records
      .flatMap((record: SubmittedFileRow) => Object.values(record))
      .filter((value: string) =>
        reasons.some((reason) => value.includes(reason)),
      );
    expect(valuesCarryingAReason).toEqual([]);

    // THE BOUNDARY, which is the point of the criterion rather than the happy case
    // above. The tolerance is exactly "the seven, then one column named `Reason`" —
    // anything else with more than seven columns is still a file the app does not
    // understand (BR8), and story 3 needs that to stay a true failure.
    //
    // Seven plus an unknown `Notes` column — no `Reason` anywhere.
    expect(await refusalFor(unknownExtraColumnFileBody())).toBe(
      UNEXPECTED_COLUMNS,
    );
    // Seven plus `Reason` PLUS `Notes`. `Reason` IS present here, so this is the case
    // that fails a reader which asks "is `Reason` in the header?" or "are there more
    // than seven columns?" instead of matching the one tolerated shape exactly.
    expect(await refusalFor(reasonPlusUnknownColumnFileBody())).toBe(
      UNEXPECTED_COLUMNS,
    );
  });
});
