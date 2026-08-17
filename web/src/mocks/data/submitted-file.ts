/**
 * Project-wide fixture: the CONTENTS of a submitted file — the bytes
 * `GET /v1/files/download?FileLogId={id}` answers with — paired with the
 * `GET /v1/files/validation-errors?FileLogId={id}` body that describes the SAME file.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS SEPARATE FROM `file-log.ts`.
 * `file-log.ts` is the FileLog entity: the file's metadata row (`Id`, `RecordCount`,
 * `CurrentStatus`). This module is the file's CONTENT, which is a different artifact
 * with a different shape — CSV text in the seven upload columns, not a JSON entity —
 * and it composes THREE existing factories (`./file-log`, `./validation-error`,
 * `./transaction`) rather than describing one entity of its own. Folding it into
 * `file-log.ts` would make the FileLog factory depend on the validation-error factory
 * and would mix "what the service says about the file" with "what is inside the file".
 * The `import-preview` epic reads both and must not let them disagree — which is what
 * this module guarantees.
 *
 * BOTH TEST LAYERS IMPORT THIS ONE MODULE — Vitest via
 * `@/mocks/data/submitted-file`, Playwright via a relative
 * `../src/mocks/data/submitted-file`. Neither layer may hand-write a CSV body or a
 * validation-errors body of its own: the whole point of the preview is that the
 * parsed file and the rejected-row overlay describe the same rows, and two layers
 * authoring their own bytes is exactly how that agreement silently rots.
 *
 * THE FILE'S SHAPE IS ANCHORED TO `documentation/transactions_2026-04-15.csv` — the
 * real sample of what `POST /v1/files/upload` accepts. Column order, the slash date
 * format with no seconds (`2026/04/15 08:12`), plain unformatted amounts, the
 * single-letter `C` / `D` transaction types and `ZAR` all come from that file, not
 * from `TransactionRead` (whose date format and numeric `Amount` are the SERVICE's
 * shape after import, not the file's).
 *
 * ONE COLUMN BEYOND THE SEVEN IS TOLERATED, AND ONLY ONE: a trailing `Reason`, in
 * last position. That is not laxity — it is a deliberate round-trip affordance. Story
 * 4's correction CSV carries exactly that eighth column (BR5, user-confirmed
 * 2026-08-17), so a user who downloads the rejected rows, fixes them offline and
 * re-uploads the file unmodified must get a file the app can read; refusing it would
 * dead-end the download → correct → re-upload loop this epic exists to enable.
 * Everything else with more than seven columns is still a file the app does not
 * understand. The three fixtures that draw that line are, deliberately, adjacent
 * below: {@link correctionCsvReupload} (readable), {@link unknownExtraColumnFileBody}
 * and {@link reasonPlusUnknownColumnFileBody} (both unreadable).
 *
 * ⚠ **THE REJECTED-ROW WIRE SHAPE IS INFERRED** (see `./validation-error`'s header:
 * the spec's only example is from an unrelated zoo/animal schema), **and so is the key
 * that ties a rejected row back to its line in the file.** Both are open questions
 * this epic must confirm against a live response. They are answered in exactly TWO
 * places in this file — {@link REJECTION_MATCH_KEY} and {@link rejectionForLine} —
 * and nowhere else: every fixture below builds its rejections through
 * `rejectionForLine`, so if the live shape or the live join key turns out different,
 * this stays a one-place fix. Do not spread the assumption into a test.
 *
 * Import discipline (so the Playwright layer can import this without alias plumbing):
 * type-only imports for types, sibling factories by relative path.
 */
import {
  FILE_STATUS_IMPORTED,
  FILE_STATUS_VALIDATION_FAILED,
  fileLogWithStatus,
} from './file-log';
import {
  DESCRIPTION_WITH_EVERY_HOSTILE_CHARACTER,
  TRANSACTION_TYPE_CREDIT_CODE,
  TRANSACTION_TYPE_DEBIT_CODE,
  createTransaction,
} from './transaction';
import {
  invalidRowWithDefectOn,
  validationErrorsResponse,
} from './validation-error';

import type { FileLog } from '../../types/files';
import type { ValidationErrorRow, ValidationErrors } from '../../types/files';

/**
 * THE SEVEN UPLOAD COLUMNS, IN THE FILE'S OWN ORDER
 * (`documentation/transactions_2026-04-15.csv`, line 1).
 *
 * This is the EXTERNAL artifact's shape — what a person's uploaded file actually
 * holds — which is why it is stated here rather than imported from production code.
 * The reader (`lib/files/parseSubmittedFileCsv.ts`) declares its own expectation of
 * these seven; a test proving the reader agrees with this list is proving the reader
 * agrees with the real sample file, which is the point.
 */
export const SUBMITTED_FILE_COLUMNS = [
  'Reference',
  'TransactionDate',
  'AccountNumber',
  'Description',
  'Amount',
  'TransactionType',
  'Currency',
] as const;

export type SubmittedFileColumn = (typeof SUBMITTED_FILE_COLUMNS)[number];

/**
 * One data line of a submitted file. EVERY VALUE IS TEXT — a CSV file has no types,
 * and a row that failed validation holds whatever the person typed (an `Amount` that
 * is not a number, a `TransactionDate` that is not a date). Anything narrower here
 * would be wrong about precisely the rows this epic exists to display.
 */
export type SubmittedFileRow = Record<SubmittedFileColumn, string>;

/**
 * What the service LABELS the download (`transactions-api.yaml` → `FilesDownload`
 * answers `application/octet-stream`), even though the bytes are CSV text. Use it
 * when fulfilling the download in Playwright, so the spec exercises the same
 * content-type the client's binary-response handling really meets.
 */
export const SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE = 'application/octet-stream';

/**
 * The sample file's own record separator is a bare LF, and the app must not care:
 * a file produced on Windows arrives with CRLF. Both are offered so a test names
 * which one it is exercising.
 */
export const LF = '\n';
export const CRLF = '\r\n';

/** RFC 4180's field separator and quote — the same rules `lib/transactions/exportCsv.ts`
 * writes with, restated here because a fixture may not depend on production code
 * (and `exportCsv.ts` imports through the `@/` alias the Playwright layer cannot
 * resolve). Reading and writing must agree on these; that agreement is what
 * {@link previewWithHostileRejectedRow} tests. */
const FIELD_SEPARATOR = ',';
const QUOTE = '"';
const NEEDS_QUOTING = /["\r\n,]/;

/** One value, quoted only when it has to be, with its own quotes doubled. */
const csvValue = (value: string): string =>
  NEEDS_QUOTING.test(value)
    ? `${QUOTE}${value.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}`
    : value;

/** How a body is assembled: which line ending, and whether the last line has one. */
export interface SubmittedFileBodyOptions {
  /** Default `'\n'` — the sample file's own ending. Pass {@link CRLF} for a
   * Windows-produced file. */
  lineEnding?: string;
  /** Default `true` — RFC 4180 permits it and most writers emit it. `false` is the
   * other half of story 1 AC-3. */
  trailingNewline?: boolean;
}

/**
 * A CSV body from an ARBITRARY header and records — the low-level builder the
 * wrong-column-shape bodies use. For a well-formed submitted file use
 * {@link submittedFileCsv}, which supplies the seven columns for you.
 */
export const submittedFileBodyFrom = (
  header: readonly string[],
  records: readonly (readonly string[])[],
  { lineEnding = LF, trailingNewline = true }: SubmittedFileBodyOptions = {},
): string => {
  const lines = [header, ...records].map((values) =>
    values.map(csvValue).join(FIELD_SEPARATOR),
  );
  return lines.join(lineEnding) + (trailingNewline ? lineEnding : '');
};

/**
 * A WELL-FORMED submitted file: the seven-column header row followed by one line per
 * row, RFC 4180 quoting handled here so no test ever hand-writes CSV text.
 *
 * @example submittedFileCsv(submittedFileRows(5), { trailingNewline: false })
 */
export const submittedFileCsv = (
  rows: readonly SubmittedFileRow[],
  options: SubmittedFileBodyOptions = {},
): string =>
  submittedFileBodyFrom(
    SUBMITTED_FILE_COLUMNS,
    rows.map((row) => SUBMITTED_FILE_COLUMNS.map((column) => row[column])),
    options,
  );

/**
 * The downloaded file as the `Blob` `downloadSubmittedFile` resolves to
 * (`lib/api/files.ts` reads this endpoint as a binary response).
 *
 * A function, not a constant, so every mocked download hands out its own blob.
 */
export const submittedFileBlob = (csv: string): Blob =>
  new Blob([csv], { type: SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE });

/**
 * The sample file's own lines, cycled to generate a file of any length: real ZA
 * expense wording, the file's `hh:mm` times, plain amounts and single-letter types
 * (`documentation/transactions_2026-04-15.csv`, data lines 1–10).
 */
const SAMPLE_LINES: {
  time: string;
  description: string;
  amount: string;
  type: string;
}[] = [
  {
    time: '08:12',
    description: 'Salary deposit - April',
    amount: '15750',
    type: TRANSACTION_TYPE_CREDIT_CODE,
  },
  {
    time: '08:34',
    description: 'Woolworths Sandton',
    amount: '487.32',
    type: TRANSACTION_TYPE_DEBIT_CODE,
  },
  {
    time: '09:05',
    description: 'Engen Garage fuel',
    amount: '650',
    type: TRANSACTION_TYPE_DEBIT_CODE,
  },
  {
    time: '09:42',
    description: 'Vodacom prepaid airtime',
    amount: '200',
    type: TRANSACTION_TYPE_DEBIT_CODE,
  },
  {
    time: '10:15',
    description: 'Refund - Takealot order',
    amount: '1299.99',
    type: TRANSACTION_TYPE_CREDIT_CODE,
  },
  {
    time: '10:48',
    description: 'EFT to J. Smith',
    amount: '2500',
    type: TRANSACTION_TYPE_DEBIT_CODE,
  },
  {
    time: '11:03',
    description: 'Bank charges',
    amount: '45.5',
    type: TRANSACTION_TYPE_DEBIT_CODE,
  },
  {
    time: '11:27',
    description: 'Pick n Pay groceries',
    amount: '1245.67',
    type: TRANSACTION_TYPE_DEBIT_CODE,
  },
  {
    time: '12:01',
    description: 'Dischem Pharmacy',
    amount: '389.2',
    type: TRANSACTION_TYPE_DEBIT_CODE,
  },
  {
    time: '12:35',
    description: 'Interest received',
    amount: '127.83',
    type: TRANSACTION_TYPE_CREDIT_CODE,
  },
];

/** The day every generated line falls on — the sample file's own day. */
const SAMPLE_FILE_DAY = '2026/04/15';

/** The account the canonical imported request carries, taken from the Transaction
 * factory so the file's rows and the service's rows cannot disagree about whose
 * account this is. Line 1 of a generated file carries it exactly; later lines count
 * up from its last group (see {@link submittedFileRow}). */
const BASE_ACCOUNT_NUMBER = createTransaction().AccountNumber;
const ACCOUNT_GROUP_AT = BASE_ACCOUNT_NUMBER.lastIndexOf('-') + 1;
const ACCOUNT_PREFIX = BASE_ACCOUNT_NUMBER.slice(0, ACCOUNT_GROUP_AT);
const FIRST_ACCOUNT_GROUP = Number(BASE_ACCOUNT_NUMBER.slice(ACCOUNT_GROUP_AT));

/** The canonical currency, likewise taken from the Transaction factory. */
const BASE_CURRENCY = createTransaction().Currency;

/** `'0001'`-style sequence — the sample file's own reference numbering. */
const sequenceOf = (lineNumber: number): string =>
  String(lineNumber).padStart(4, '0');

/**
 * ONE DATA LINE of a submitted file, by its 1-based position in the file.
 *
 * Line 1 reproduces the sample file's first data line exactly
 * (`TXN-20260415-0001,2026/04/15 08:12,…,15750,C,ZAR`), and later lines cycle the
 * sample's own wording with an hour added per cycle, so a generated file of any
 * length still looks like the real thing.
 *
 * ACCOUNT NUMBERS DIFFER PER LINE (the sample file happens to repeat one account).
 * Distinct last four digits are what let a test identify a row by its MASKED account
 * number — the same reasoning `./validation-error` applies to its own rows — and
 * masking is what the will-import half must do (BR3).
 */
export const submittedFileRow = (
  lineNumber: number,
  overrides: Partial<SubmittedFileRow> = {},
): SubmittedFileRow => {
  const sample = SAMPLE_LINES[(lineNumber - 1) % SAMPLE_LINES.length];
  const cycle = Math.floor((lineNumber - 1) / SAMPLE_LINES.length);
  const hour = (Number(sample.time.slice(0, 2)) + cycle) % 24;
  return {
    Reference: `TXN-20260415-${sequenceOf(lineNumber)}`,
    TransactionDate: `${SAMPLE_FILE_DAY} ${String(hour).padStart(2, '0')}${sample.time.slice(2)}`,
    AccountNumber: `${ACCOUNT_PREFIX}${FIRST_ACCOUNT_GROUP + lineNumber - 1}`,
    Description: sample.description,
    Amount: sample.amount,
    TransactionType: sample.type,
    Currency: BASE_CURRENCY,
    ...overrides,
  };
};

/** `count` data lines, in file order. Apply `overrides` to every one of them. */
export const submittedFileRows = (
  count: number,
  overrides: Partial<SubmittedFileRow> = {},
): SubmittedFileRow[] =>
  Array.from({ length: count }, (_, index) =>
    submittedFileRow(index + 1, overrides),
  );

/**
 * ⚠ **THE OPEN QUESTION: what ties a rejected row back to its line in the file.**
 *
 * `Reference` is the epic's WORKING ASSUMPTION (brief §Data Model, story 2) — not a
 * settled fact. It is stated here, once, so that:
 *   - a test asserting the match names this constant rather than the word
 *     `'Reference'`, and
 *   - if a live `GET /v1/files/validation-errors` turns out to carry a positional or
 *     identity key instead, this line and {@link rejectionForLine} are the only two
 *     places in the fixtures that change.
 *
 * The assumption cannot hold for every row: "Reference missing" is itself one of the
 * four rejection reasons, so a row with no reference can never be found this way.
 * That is not a gap to paper over — it is the case BR9's fallback exists for, and
 * {@link previewWithMissingReferenceRejection} is the fixture for it.
 *
 * NOT A KEY, however tempting: the row number inside the service's own `ErrorMessage`
 * (`'Row 14: column [Currency] failed…'`). It is opaque text the service composed, it
 * does not agree with the line's position in these fixtures on purpose, and reading a
 * line number out of a human sentence would be a guess dressed up as a match.
 */
export const REJECTION_MATCH_KEY: SubmittedFileColumn = 'Reference';

/**
 * THE PAIRING PRIMITIVE: the validation-errors row for the file's line `lineNumber`,
 * rejected on `column`.
 *
 * It composes `./validation-error`'s `invalidRowWithDefectOn` — which owns the defect
 * shape (`ErrorColumn` / `ErrorMessage`) AND the defective VALUE that goes with each
 * defect — and then carries the file line's own identity onto it, EXCEPT for the
 * defective column, whose value must stay the defective one. That direction matters:
 * the service's row is authoritative for what is wrong, the file is authoritative for
 * who the row is, and {@link submittedFilePreview} then writes the file's line FROM
 * this row, so the two can never describe different data.
 *
 * @example rejectionForLine(3, 'Currency')
 * @example rejectionForLine(5, 'TransactionType', { Description: 'EFT to J. Smith' })
 */
export const rejectionForLine = (
  lineNumber: number,
  column: string,
  values: Partial<ValidationErrorRow> = {},
): ValidationErrorRow => {
  const line = submittedFileRow(lineNumber);
  const identity: Partial<ValidationErrorRow> = {};
  for (const field of SUBMITTED_FILE_COLUMNS) {
    // Every column but the defective one carries the FILE's own value, so the rejected
    // line differs from its neighbours in exactly one place. The defective column keeps
    // the value `invalidRowWithDefectOn` gave it — the file holds that bad value too,
    // which is why the row was rejected at all.
    if (field !== column) {
      identity[field] = line[field];
    }
  }
  return invalidRowWithDefectOn(column, {
    ...identity,
    Id: lineNumber,
    PrimaryKeyValue: lineNumber,
    ...values,
  });
};

/** The file line a rejected row describes — the row's recorded values as CSV text.
 * A value the service omitted becomes an EMPTY cell (which is what "missing" looks
 * like in a file), never the word `undefined`. */
const lineFromRejection = (
  rejection: ValidationErrorRow,
): SubmittedFileRow => ({
  Reference: rejection.Reference ?? '',
  TransactionDate: rejection.TransactionDate ?? '',
  AccountNumber: rejection.AccountNumber ?? '',
  Description: rejection.Description ?? '',
  Amount: rejection.Amount === undefined ? '' : String(rejection.Amount),
  TransactionType: rejection.TransactionType ?? '',
  Currency: rejection.Currency ?? '',
});

/** One rejection to place on a line of the file. */
export interface RejectedLine {
  /** 1-based position of the line in the file's DATA rows (the header is not a line). */
  line: number;
  /** The column the service rejected it on — `'Currency'`, `'Amount'`,
   * `'TransactionDate'`, `'Reference'` (app-owned wording, FR2) or
   * `'TransactionType'` (the service's own wording, verbatim, FR3). */
  column: string;
  /** Anything else this row should carry, on both halves of the pair at once. */
  values?: Partial<ValidationErrorRow>;
}

/**
 * ONE FILE, DESCRIBED ONCE — the fixture the whole epic hangs on.
 *
 * A test cannot accidentally pair a five-row file with a validation-errors response
 * describing a different one, because both halves and the `FileLog` come out of the
 * same call.
 */
export interface SubmittedFilePreview {
  /** The `FileLog` the page is showing. Its `RecordCount` agrees with `rows.length`
   * unless a fixture deliberately breaks that (see {@link previewWithCountMismatch}). */
  file: FileLog;
  /** Every data line of the file, in file order — `rows[0]` is line 1. */
  rows: SubmittedFileRow[];
  /** The exact bytes `GET /v1/files/download?FileLogId={id}` answers with. */
  csv: string;
  /** Those same bytes as the `Blob` `downloadSubmittedFile` resolves to. */
  blob: () => Blob;
  /** The `GET /v1/files/validation-errors?FileLogId={id}` body, `JsonArray` already
   * serialised the way the service sends it. */
  validationErrors: ValidationErrors;
  /** The rejected rows inside that body, before serialisation — matched ones first,
   * in file order, then the unmatchable ones. */
  rejections: ValidationErrorRow[];
  /** 1-based line numbers of the rejected lines, in file order. */
  rejectedLineNumbers: number[];
  /** Rejections with NO line in the file (BR9) — a subset of {@link rejections}. */
  unmatchableRejections: ValidationErrorRow[];
  /** The lines the preview must label "Will import", in file order. */
  willImportRows: SubmittedFileRow[];
  /** The lines the preview must label "Rejected", in file order. Excludes the
   * unmatchable ones, which have no line to show. */
  rejectedRows: SubmittedFileRow[];
  /** What the preview's plain-language summary must say (FR5). `rejected` counts the
   * unmatchable rows too — they are rejected rows in their own right. */
  counts: { willImport: number; rejected: number };
}

/** How to assemble a preview. Every named fixture below is one call to
 * {@link submittedFilePreview}. */
export interface SubmittedFilePreviewOptions {
  /** How many data lines the file holds. Ignored when `rows` is given. */
  lineCount?: number;
  /** Use these lines instead of generated ones. */
  rows?: SubmittedFileRow[];
  /** Which lines the service rejected, and why. */
  reject?: RejectedLine[];
  /** Rejections that match NO line in the file (BR9). */
  unmatchable?: ValidationErrorRow[];
  /** Overrides the `RecordCount` that would otherwise agree with `rows.length` —
   * the one knob that deliberately makes the file and the service disagree. */
  recordCount?: string;
  /** Anything else about the `FileLog`. */
  file?: Partial<FileLog>;
  /** Passed through to the body builder (line ending, trailing newline). */
  body?: SubmittedFileBodyOptions;
}

/**
 * Build a coherent file: its lines, its bytes, its `FileLog` and its
 * validation-errors body, all describing the same rows.
 *
 * A rejected line's CSV text is written FROM its validation-errors row, so the file
 * really does hold the value the service objected to — which is what makes story 4's
 * "written exactly as the file held it" assertion meaningful rather than circular.
 */
export const submittedFilePreview = ({
  lineCount = 5,
  rows: givenRows,
  reject = [],
  unmatchable = [],
  recordCount,
  file: fileOverrides = {},
  body,
}: SubmittedFilePreviewOptions = {}): SubmittedFilePreview => {
  const rows = [...(givenRows ?? submittedFileRows(lineCount))];
  const rejectedLineNumbers = reject.map(({ line }) => line);

  const matched = reject.map(({ line, column, values }) => {
    const rejection = rejectionForLine(line, column, values);
    rows[line - 1] = lineFromRejection(rejection);
    return rejection;
  });

  const rejections = [...matched, ...unmatchable];
  const csv = submittedFileCsv(rows, body);

  return {
    file: fileLogWithStatus(
      rejections.length > 0
        ? FILE_STATUS_VALIDATION_FAILED
        : FILE_STATUS_IMPORTED,
      {
        RecordCount: recordCount ?? String(rows.length),
        ...fileOverrides,
      },
    ),
    rows,
    csv,
    blob: () => submittedFileBlob(csv),
    validationErrors: validationErrorsResponse(rejections),
    rejections,
    rejectedLineNumbers,
    unmatchableRejections: unmatchable,
    willImportRows: rows.filter(
      (_, index) => !rejectedLineNumbers.includes(index + 1),
    ),
    rejectedRows: rejectedLineNumbers
      .slice()
      .sort((a, b) => a - b)
      .map((line) => rows[line - 1]),
    counts: {
      willImport: rows.length - rejectedLineNumbers.length,
      rejected: rejectedLineNumbers.length + unmatchable.length,
    },
  };
};

/**
 * THE CANONICAL PREVIEW: a five-row file whose lines 3 and 5 are the ones the service
 * rejected — three will import, two did not.
 *
 * The two rejections are deliberately of the two DIFFERENT wording kinds, so one
 * fixture exercises both rules at once:
 *   - line 3, `Currency` — one of the four rules the APP owns, so the app's own fixed
 *     sentence is shown and the service's text must never reach the user (FR2);
 *   - line 5, `TransactionType` — the one the SERVICE owns, whose reason is shown
 *     word for word and which the app never judges for itself (FR3).
 */
export const previewWithRejectedRows = (): SubmittedFilePreview =>
  submittedFilePreview({
    lineCount: 5,
    reject: [
      { line: 3, column: 'Currency' },
      { line: 5, column: 'TransactionType' },
    ],
  });

/**
 * A file the service rejected NOTHING in: five rows, all will-import, and a
 * validation-errors body reporting an empty list (which is not a failure — it is the
 * service saying there is nothing wrong).
 *
 * Story 4 AC-6: no correction download is offered for this file.
 */
export const previewWithNoRejectedRows = (): SubmittedFilePreview =>
  submittedFilePreview({ lineCount: 5, file: { Id: 5002 } });

/**
 * BR9 / story 2 AC-5 — a rejected row that CANNOT be tied to any line in the file:
 * its reference (`TXN-99999999-9999`) appears nowhere in the five lines, and neither
 * do its other values.
 *
 * It must still be listed, once, as a rejected row in its own right — never dropped,
 * never duplicated onto a line, never attributed to the wrong one. The file also
 * carries one ordinary matched rejection (line 3), so a test can prove the two are
 * handled side by side rather than one mode at a time.
 */
export const UNMATCHABLE_REFERENCE = 'TXN-99999999-9999';

export const previewWithUnmatchableRejection = (): SubmittedFilePreview =>
  submittedFilePreview({
    lineCount: 5,
    file: { Id: 5003 },
    reject: [{ line: 3, column: 'Currency' }],
    unmatchable: [
      invalidRowWithDefectOn('Amount', {
        Id: 99,
        PrimaryKeyValue: 99,
        Reference: UNMATCHABLE_REFERENCE,
        TransactionDate: '2026/04/15 19:02',
        AccountNumber: '4400-9917-2288',
        Description: 'Conference travel - Durban',
      }),
    ],
  });

/**
 * THE HARD CASE the working match key cannot solve: a row rejected FOR having no
 * reference (FR2). Line 2 of the file holds an empty `Reference` cell and the
 * service's row carries no reference either, so a `Reference`-keyed match finds
 * nothing — the row is real, present in the file, and unmatchable by the assumed key.
 *
 * This is the fixture that proves BR9's fallback is not theoretical. Whatever the
 * live join key turns out to be, this file's behaviour must stay honest: the row is
 * listed once, with the values and reason the service gave.
 */
export const previewWithMissingReferenceRejection = (): SubmittedFilePreview =>
  submittedFilePreview({
    lineCount: 5,
    file: { Id: 5004 },
    reject: [{ line: 2, column: 'Reference' }],
  });

/**
 * A rejected line whose free text carries EVERY character RFC 4180 makes dangerous —
 * a comma, a doubled quotation mark and a line break, all inside one quoted value
 * (the project-wide constant from `./transaction`, so the writer's tests and the
 * reader's tests fight the same string).
 *
 * Two things ride on this: the reader must give the value back intact (story 1 AC-2),
 * and the correction CSV must write that same rejected line back out byte-faithfully
 * (story 4 AC-4). A file that survives a round trip through both is the only proof
 * the two agree.
 */
export const ROW_WITH_HOSTILE_TEXT: SubmittedFileRow = submittedFileRow(2, {
  Description: DESCRIPTION_WITH_EVERY_HOSTILE_CHARACTER,
});

export const previewWithHostileRejectedRow = (): SubmittedFilePreview =>
  submittedFilePreview({
    lineCount: 5,
    file: { Id: 5005 },
    reject: [
      {
        line: 2,
        column: 'Currency',
        values: { Description: DESCRIPTION_WITH_EVERY_HOSTILE_CHARACTER },
      },
    ],
  });

/**
 * The same file WITH and WITHOUT a trailing newline (story 1 AC-3). Both bodies are
 * built from one `rows` array, so "they read to the same records" is a claim about
 * the reader and not about two fixtures that happen to look alike — and the
 * with-newline body must NOT produce an empty final record.
 */
export const trailingNewlinePair = (): {
  rows: SubmittedFileRow[];
  withTrailingNewline: string;
  withoutTrailingNewline: string;
} => {
  const rows = submittedFileRows(3);
  return {
    rows,
    withTrailingNewline: submittedFileCsv(rows, { trailingNewline: true }),
    withoutTrailingNewline: submittedFileCsv(rows, { trailingNewline: false }),
  };
};

/**
 * A body that CANNOT be read as CSV under RFC 4180: a quoted field is opened on the
 * second line and never closed, so the rest of the file is one unterminated value.
 * This is the honest unparseable case — the reader must return its cannot-be-read
 * outcome rather than throwing or handing back the lines it managed to get through
 * (story 1 AC-4, story 3 AC-1).
 */
export const UNTERMINATED_QUOTE_FILE_BODY = `${SUBMITTED_FILE_COLUMNS.join(',')}
TXN-20260415-0001,2026/04/15 08:12,1001-2034-5567,Salary deposit - April,15750,C,ZAR
TXN-20260415-0002,2026/04/15 08:34,1001-2034-5567,"Venue hire, deposit portion,487.32,D,ZAR
TXN-20260415-0003,2026/04/15 09:05,1001-2034-5567,Engen Garage fuel,650,D,ZAR
`;

/**
 * A body that is not text at all — a PDF someone uploaded by mistake, NUL bytes
 * included.
 *
 * Whether a reader reports this as unparseable or as the wrong column shape is the
 * reader's own call and this fixture does not dictate one; what story 3 requires
 * either way is the SAME plainly-stated problem-reading-the-file message and no
 * table at all. Assert the outcome, never which internal branch produced it.
 */
export const BINARY_FILE_BODY =
  '%PDF-1.7\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n  trailer\n%%EOF\n';

/**
 * SEVEN columns, WRONG NAMES — a bank's own export, which looks like a CSV and reads
 * like one, and would silently populate the preview with values under the wrong
 * headings if the reader only counted columns (story 1 AC-4, story 3 AC-2).
 */
export const WRONG_COLUMN_NAMES = [
  'Ref',
  'Date',
  'Account',
  'Memo',
  'Value',
  'Type',
  'Curr',
] as const;

export const wrongColumnNamesFileBody = (): string =>
  submittedFileBodyFrom(
    WRONG_COLUMN_NAMES,
    submittedFileRows(3).map((row) =>
      SUBMITTED_FILE_COLUMNS.map((column) => row[column]),
    ),
  );

/** SIX columns — the seven with `Currency` dropped. Too few. */
export const tooFewColumnsFileBody = (): string => {
  const columns = SUBMITTED_FILE_COLUMNS.filter(
    (column) => column !== 'Currency',
  );
  return submittedFileBodyFrom(
    columns,
    submittedFileRows(3).map((row) => columns.map((column) => row[column])),
  );
};

/**
 * THE ONE TOLERATED EXTRA COLUMN: `Reason`, last position (BR5, user-confirmed
 * 2026-08-17). See {@link correctionCsvReupload} for what it is for, and
 * {@link unknownExtraColumnFileBody} for what it is NOT.
 */
export const CORRECTION_REASON_COLUMN = 'Reason';

/**
 * ✅ **READABLE** — the correction CSV story 4 generates, fed straight back into the
 * upload without anyone stripping anything: the seven upload columns in order, plus
 * the trailing `Reason` column.
 *
 * This is the round trip the epic exists to enable (download → correct offline →
 * re-upload), so the reader must ACCEPT this file, drop the eighth column and hand
 * back the seven — not report a file it cannot read. Treating it as a wrong shape
 * would dead-end the whole loop at "could not read this file".
 *
 * The body is derived from a real preview's own rejected rows (returned as `preview`,
 * so story 4 can build its correction CSV from the same fixture and assert the bytes
 * match), and `rows` is exactly what a correct reader must produce from it — the same
 * seven-column records, byte for byte, with nothing shifted by the discarded column.
 *
 * TWO QUOTED COMMAS ARE IN HERE ON PURPOSE. One row is rejected for its amount, so it
 * carries `"R 1 245,67"` in the fifth column; one row's `Reason` is the service's
 * `DECIMAL(18,2)` sentence, so the eighth column has a comma too; a third row's
 * `Reason` carries doubled quotes. A reader that locates the eighth column by counting
 * commas instead of parsing drops the wrong thing on every one of them.
 *
 * (What story 4 really writes in that column is the wording shown on screen —
 * app-owned for four defects, the service's own for a transaction-type defect. The
 * reader discards the value either way, so the fixture uses the service's text, the
 * one wording this module can state without duplicating story 2's map.)
 */
export const correctionCsvReupload = (): {
  /** The file those rejected rows came from — story 4 builds its correction CSV from
   * this and must produce {@link csv}. */
  preview: SubmittedFilePreview;
  /** What a correct reader must produce: the seven-column records, `Reason` dropped. */
  rows: SubmittedFileRow[];
  /** The eight-column body, exactly as story 4's correction CSV writes it. */
  csv: string;
  /** The discarded eighth-column values, in row order — for a test that wants to
   * name what must NOT survive the read. */
  reasons: string[];
} => {
  const preview = submittedFilePreview({
    lineCount: 5,
    file: { Id: 5008 },
    reject: [
      { line: 2, column: 'Amount' },
      { line: 3, column: 'Currency' },
      { line: 5, column: 'TransactionType' },
    ],
  });
  const rows = preview.rejectedRows;
  const reasons = preview.rejectedLineNumbers
    .slice()
    .sort((a, b) => a - b)
    .map(
      (line) =>
        preview.rejections.find((rejection) => rejection.Id === line)
          ?.ErrorMessage ?? '',
    );

  return {
    preview,
    rows,
    csv: submittedFileBodyFrom(
      [...SUBMITTED_FILE_COLUMNS, CORRECTION_REASON_COLUMN],
      rows.map((row, index) => [
        ...SUBMITTED_FILE_COLUMNS.map((column) => row[column]),
        reasons[index],
      ]),
    ),
    reasons,
  };
};

/** The correction-CSV round-trip body on its own, for a test that only needs the
 * bytes. Pair it with {@link correctionCsvReupload}`().rows` to assert what survives. */
export const correctionCsvReuploadBody = (): string =>
  correctionCsvReupload().csv;

/**
 * ❌ **UNREADABLE** — eight columns where the extra one is NOT `Reason`.
 *
 * The tolerance above is narrow on purpose: a trailing column NAMED `Reason`, in LAST
 * position, and nothing else. It exists so this epic's own correction CSV round-trips
 * — it is not a lax parser that shrugs at any extra column. A file carrying an
 * unknown `Notes` column is a file the app does not understand, and story 3's
 * wrong-column-shape criterion needs it to stay a true failure.
 */
export const UNKNOWN_EXTRA_COLUMN = 'Notes';

export const unknownExtraColumnFileBody = (): string =>
  submittedFileBodyFrom(
    [...SUBMITTED_FILE_COLUMNS, UNKNOWN_EXTRA_COLUMN],
    submittedFileRows(3).map((row) => [
      ...SUBMITTED_FILE_COLUMNS.map((column) => row[column]),
      'Approved by T. Mokoena',
    ]),
  );

/**
 * ❌ **UNREADABLE** — the boundary case between the two above: nine columns, the seven
 * plus `Reason` plus an unknown one.
 *
 * `Reason` is present, so a reader that tests "does the header contain Reason?" or
 * "are there more than seven columns?" would wave this through. The rule is that the
 * ONLY tolerated shape is exactly the seven followed by exactly one `Reason` — this
 * file is not that, and must be reported as a file that cannot be read.
 */
export const reasonPlusUnknownColumnFileBody = (): string =>
  submittedFileBodyFrom(
    [...SUBMITTED_FILE_COLUMNS, CORRECTION_REASON_COLUMN, UNKNOWN_EXTRA_COLUMN],
    submittedFileRows(3).map((row) => [
      ...SUBMITTED_FILE_COLUMNS.map((column) => row[column]),
      'Currency must be a supported currency code.',
      'Approved by T. Mokoena',
    ]),
  );

/**
 * A file whose lines DISAGREE with the record count the service reports for it
 * (story 3 AC-3): three readable lines, a `FileLog` claiming 142.
 *
 * The file parses perfectly — that is the point. The app is not looking at what it
 * thinks it is looking at, and reporting it as an ordinary preview with different
 * numbers would quietly contradict the record count already on the page.
 */
export const MISREPORTED_RECORD_COUNT = '142';

export const previewWithCountMismatch = (): SubmittedFilePreview =>
  submittedFilePreview({
    lineCount: 3,
    file: { Id: 5006 },
    recordCount: MISREPORTED_RECORD_COUNT,
  });

/**
 * This project's endorsed volume ceiling
 * (`documentation/requirements-application.md` §1.7/§10) — the size the file is both
 * DOWNLOADED and PARSED at in the browser (NFR-1), which is why story 1 AC-5 cares
 * that reading it hands the main thread back between chunks.
 */
export const LARGE_FILE_ROW_COUNT = 10_000;

/** A ceiling-sized file's bytes — GENERATED, never a literal. Roughly 700 KB. */
export const largeSubmittedFileCsv = (
  count: number = LARGE_FILE_ROW_COUNT,
): string => submittedFileCsv(submittedFileRows(count));

/**
 * A ceiling-sized preview with one rejected line near the end, so a test about volume
 * is still a test about a real file: the last rows must be reachable, and the
 * rejected one among them must still be found.
 */
export const largePreview = (
  count: number = LARGE_FILE_ROW_COUNT,
): SubmittedFilePreview =>
  submittedFilePreview({
    lineCount: count,
    file: { Id: 5007 },
    reject: [{ line: count - 1, column: 'Currency' }],
  });
