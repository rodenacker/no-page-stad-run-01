/**
 * What a user reads about ONE rejected row's defect — the single statement of it for
 * every surface that shows a rejected row.
 *
 * Two surfaces need exactly this vocabulary and must never disagree about it: the
 * `Rejected rows` section of a file that failed validation (`file-validation-and-retry`
 * FR2/FR3), and the import preview's rejected rows plus the correction CSV built from
 * them (`import-preview` FR3, BR9). It was module-private inside `RejectedRows.tsx`
 * until the preview needed the same words; extracting it is what keeps the four
 * app-owned sentences and the verbatim `TransactionType` rule stated once.
 *
 * **THE TWO SOURCES ARE NEVER MIXED.** For the four rules this app owns — a missing
 * `Reference`, a non-numeric `Amount`, an unreadable `TransactionDate`, an unsupported
 * `Currency` — the app's own fixed wording is what the user reads, and the service's
 * machine-phrased text never reaches them. For anything else, including a
 * `TransactionType` defect, the SERVICE's own reason is shown word for word: the app
 * holds no accepted-value list for transaction type and never judges one itself (a
 * user decision at INTAKE; do not add an app-side enum or rule for that field).
 */
import type { ValidationErrorRow } from '@/types/files';

/**
 * The FOUR rules this app owns, and its fixed wording for each — quoted from the
 * `file-validation-and-retry` brief's FR2 (`R38`, `R39`, `R40`, `R42`). This map is the
 * app's entire vocabulary about a defect: a column that is not in it is explained by
 * the SERVICE, in the service's own words.
 *
 * `TransactionType` is absent on purpose and must stay absent (FR3).
 *
 * A `Map`, not an object literal, because `ErrorColumn` is a string that came out of
 * parsing an UNTRUSTED payload: looking an arbitrary name up on an object literal can
 * answer with something inherited rather than nothing (`toString`, `constructor`), and
 * every surface reading this must treat a body it cannot make sense of as a handled
 * state and never a crash. A `Map` answers `undefined` for every key but the four.
 */
export const APP_OWNED_DEFECT_WORDING = new Map<string, string>([
  ['Reference', 'This request has no reference and cannot be imported.'],
  ['Amount', 'Amount must be a number, for example 1245.67.'],
  ['TransactionDate', 'Transaction date must be a valid date and time.'],
  ['Currency', 'Currency must be a supported currency code.'],
]);

/**
 * Said in the defect cell of a row the service gave no reason for. It states what is
 * missing; it does not guess at a reason, which is the one thing a surface showing
 * these rows must never do.
 */
export const NO_REASON_GIVEN = 'No reason was given for this row.';

/**
 * What the user reads about one row's defect.
 *
 * The app speaks only where it owns the rule; everywhere else the service's own
 * sentence travels to the user untouched. `undefined` means the row carries no defect
 * signal at all, which is not a licence to invent one — say {@link NO_REASON_GIVEN}
 * instead.
 *
 * An EMPTY `ErrorMessage` is no defect signal, exactly as an absent one is: answering
 * with the empty string would leave a blank cell on screen and a blank `Reason` in the
 * correction CSV, which reads as a reason that was lost rather than one that was never
 * given — the one thing these surfaces must not do.
 */
export const defectWordingFor = (
  row: ValidationErrorRow,
): string | undefined => {
  const { ErrorColumn, ErrorMessage } = row;

  const appOwned =
    ErrorColumn === undefined
      ? undefined
      : APP_OWNED_DEFECT_WORDING.get(ErrorColumn);

  const serviceOwn = ErrorMessage === '' ? undefined : ErrorMessage;

  return appOwned ?? serviceOwn;
};

/**
 * What the user reads about ONE ROW that the service reported MORE THAN ONE defect
 * for — a line whose amount is not a number AND whose currency is not supported is
 * two entries in the payload and one row on screen.
 *
 * **EVERY DEFECT IS SAID, NOT JUST THE FIRST.** Someone correcting the file has to fix
 * all of them; showing one would send them round the download → correct → re-upload
 * loop a second time for a problem the app already knew about.
 *
 * Order is the service's own, and a wording is said ONCE: two entries the app resolves
 * to the same sentence (two defects on one column) are one thing to fix, not two. An
 * empty list means the service gave no defect signal at all for any of them, which is
 * not a licence to invent one — say {@link NO_REASON_GIVEN} instead.
 */
export const defectWordingsFor = (
  rows: readonly ValidationErrorRow[],
): string[] => {
  const wordings: string[] = [];
  for (const row of rows) {
    const wording = defectWordingFor(row);
    if (wording !== undefined && !wordings.includes(wording)) {
      wordings.push(wording);
    }
  }
  return wordings;
};

/**
 * What separates two defect sentences where only ONE line of text will fit — the
 * correction file's `Reason` cell. A space, because each wording is already a complete
 * sentence: a bullet or a semicolon would read as punctuation the app invented, and a
 * line break would end the record in a CSV cell.
 */
export const DEFECT_WORDING_SEPARATOR = ' ';

/**
 * A row's defects as ONE line of text, for a surface that has no room to list them —
 * the correction CSV's `Reason` column. The screen lists them instead, but both start
 * from {@link defectWordingsFor}, so the file and the screen cannot explain the same
 * row differently.
 */
export const defectWordingLine = (wordings: readonly string[]): string =>
  wordings.length === 0
    ? NO_REASON_GIVEN
    : wordings.join(DEFECT_WORDING_SEPARATOR);
