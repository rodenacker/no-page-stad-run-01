/**
 * What the import preview says will happen to each row of a submitted file: every line
 * of the file the user sent, in FILE ORDER, each carrying a will-import or rejected
 * verdict, plus any rejection the service reported that belongs to no line at all
 * (epic `import-preview` FR1–FR3, BR9).
 *
 * This module is the join between two independent reads — the original file, parsed by
 * `lib/files/parseSubmittedFileCsv.ts`, and the rejected rows the service reported for
 * it — and it is deliberately pure: text and rows in, rows and counts out. No fetching,
 * no React, no display decisions. That is what lets the preview, the correction CSV
 * (story 4) and any later confirmation step agree about which rows were rejected
 * without any of them re-deriving it.
 *
 * Five things here are deliberate and easy to break:
 *
 * - **THE JOIN KEY IS A WORKING ASSUMPTION, STATED ONCE.** The validation-errors wire
 *   shape is inferred, not documented (`@/types/files` → `ValidationErrorRow`), and both
 *   backend services were unreachable when this epic was planned, so `Reference` is the
 *   most reasonable key rather than a confirmed one. It is named once, in
 *   {@link REJECTION_MATCH_KEY}, so a live response that turns out to carry a positional
 *   or identity key instead is a ONE-LINE change here and nothing else in the app moves.
 * - **THE KEY CANNOT MATCH EVERY ROW, AND THAT IS NOT A BUG** (BR9). "Reference missing"
 *   is itself one of the four rejection reasons, so precisely the rows most in need of a
 *   clear rejected display are the ones a reference-based match cannot find. A rejection
 *   that matches no line is therefore listed as a rejected row IN ITS OWN RIGHT, using
 *   the values and reason the payload itself carries — never dropped, never duplicated,
 *   and never attributed to a line it might not belong to. Guessing would be worse than
 *   the honest fallback.
 * - **ONE LINE, AT MOST ONE REJECTION.** A position already claimed is not offered to a
 *   second rejection carrying the same reference; that second rejection falls through to
 *   the fallback above rather than overwriting the first or vanishing.
 * - **NOTHING IS TRANSLATED OR REFORMATTED HERE.** Every value stays exactly the text
 *   the file (or the service) held — an `Amount` that is not a number, a
 *   `TransactionDate` that is not a date. How a row READS (masking, the plain-language
 *   transaction type, the defect wording's placement) belongs to the screen; what the
 *   row IS belongs here.
 * - **THE REASON COMES FROM THE SHARED WORDING** (`lib/files/defectWording.ts`), for a
 *   matched and an unmatched rejection alike — so the preview, the `Rejected rows`
 *   section and the correction CSV cannot end up explaining the same defect three ways.
 */
import { defectWordingFor } from '@/lib/files/defectWording';

import type {
  SubmittedFileColumn,
  SubmittedFileRow,
} from '@/lib/files/parseSubmittedFileCsv';
import type { ValidationErrorRow } from '@/types/files';

/**
 * ⚠ THE OPEN QUESTION: what ties a rejected row back to its line in the file.
 *
 * `Reference` is this epic's working assumption (brief §Data Model). See this module's
 * header — changing it is the whole of the change, provided the fallback below keeps
 * carrying the rows it cannot find.
 */
export const REJECTION_MATCH_KEY: SubmittedFileColumn = 'Reference';

/** What the preview says will happen to one row. Never `imported`: the service has not
 * imported anything, and the app must not claim it has (BR2). */
export type ImportPreviewVerdict = 'will-import' | 'rejected';

/** Where a listed row's values came from. */
export type ImportPreviewRowSource =
  /** A line of the file the user submitted — its own bytes. */
  | 'file-line'
  /** A rejection with no line of its own (BR9): all it has is the service's payload. */
  | 'validation-errors';

/** One row of the preview: what it holds, and what will happen to it. */
export interface ImportPreviewRow {
  /** Stable across re-reads of the same file; unique within one preview. */
  key: string;
  verdict: ImportPreviewVerdict;
  /** The row's values as text, exactly as its source held them. */
  values: SubmittedFileRow;
  source: ImportPreviewRowSource;
  /** The service's own entry for a rejected row — absent on a will-import row. */
  rejection?: ValidationErrorRow;
  /** What the user reads about the defect, from the shared wording. `undefined` when
   * the service gave no defect signal at all; no reason is invented for it. */
  reason?: string;
}

/** Every row of the preview, and what its two halves add up to. */
export interface ImportPreviewRows {
  /** Every line of the file in file order, then any rejection matching no line. */
  rows: ImportPreviewRow[];
  counts: {
    /** Lines the service did not reject. */
    willImport: number;
    /** Rejected lines PLUS the rejections that match no line — they are rejected rows
     * in their own right. */
    rejected: number;
  };
}

/** A row of empty cells — the base an unmatched rejection's values fill in, so its keys
 * come from one place and a value the service omitted reads as an empty cell rather
 * than the word `undefined`. */
const EMPTY_VALUES: SubmittedFileRow = {
  Reference: '',
  TransactionDate: '',
  AccountNumber: '',
  Description: '',
  Amount: '',
  TransactionType: '',
  Currency: '',
};

/** A recorded value as text: a number the service sent becomes its own digits, and an
 * absent value becomes an empty cell (which is what "missing" looks like in a file). */
const asText = (value: string | number | undefined): string =>
  value === undefined ? '' : String(value);

/** A rejection's own recorded values, for a row with no line of its own to draw from. */
const valuesOfRejection = (
  rejection: ValidationErrorRow,
): SubmittedFileRow => ({
  ...EMPTY_VALUES,
  Reference: asText(rejection.Reference),
  TransactionDate: asText(rejection.TransactionDate),
  AccountNumber: asText(rejection.AccountNumber),
  Description: asText(rejection.Description),
  Amount: asText(rejection.Amount),
  TransactionType: asText(rejection.TransactionType),
  Currency: asText(rejection.Currency),
});

/**
 * The value a row is matched by, or `undefined` when it carries none.
 *
 * An EMPTY key is no key: a line with no reference and a rejection with no reference
 * are not the same row just because both are blank — treating them as a match is
 * exactly the mis-attribution BR9 forbids.
 */
const matchKeyIn = (
  values: Partial<Record<SubmittedFileColumn, string | number>>,
): string | undefined => {
  const key = values[REJECTION_MATCH_KEY];
  return typeof key === 'string' && key !== '' ? key : undefined;
};

/** Which lines carry each match key, in file order — a queue per key, so two lines
 * sharing a reference are claimed one at a time rather than both at once. */
const linePositionsByKey = (
  lines: readonly SubmittedFileRow[],
): Map<string, number[]> => {
  const positions = new Map<string, number[]>();
  lines.forEach((line, position) => {
    const key = matchKeyIn(line);
    if (key === undefined) {
      return;
    }
    const claimed = positions.get(key);
    if (claimed === undefined) {
      positions.set(key, [position]);
    } else {
      claimed.push(position);
    }
  });
  return positions;
};

/**
 * Assemble the preview: one row per line of the file in file order, each rejected line
 * carrying the service's reason, plus one more row for every rejection that matches no
 * line at all (BR9).
 */
export const importPreviewRows = (
  lines: readonly SubmittedFileRow[],
  rejections: readonly ValidationErrorRow[],
): ImportPreviewRows => {
  const unclaimed = linePositionsByKey(lines);
  const rejectionByPosition = new Map<number, ValidationErrorRow>();
  const unmatched: ValidationErrorRow[] = [];

  for (const rejection of rejections) {
    const key = matchKeyIn(rejection);
    const positions = key === undefined ? undefined : unclaimed.get(key);
    const position = positions?.shift();
    if (position === undefined) {
      // No line to attach it to — it is listed on its own rather than guessed onto
      // somebody else's line or quietly dropped.
      unmatched.push(rejection);
      continue;
    }
    rejectionByPosition.set(position, rejection);
  }

  const fileRows: ImportPreviewRow[] = lines.map((values, position) => {
    const rejection = rejectionByPosition.get(position);
    if (rejection === undefined) {
      return {
        key: `line-${String(position)}`,
        verdict: 'will-import',
        values,
        source: 'file-line',
      };
    }
    return {
      key: `line-${String(position)}`,
      verdict: 'rejected',
      values,
      source: 'file-line',
      rejection,
      reason: defectWordingFor(rejection),
    };
  });

  const unmatchedRows: ImportPreviewRow[] = unmatched.map(
    (rejection, index) => ({
      key: `unmatched-${String(index)}`,
      verdict: 'rejected',
      values: valuesOfRejection(rejection),
      source: 'validation-errors',
      rejection,
      reason: defectWordingFor(rejection),
    }),
  );

  return {
    rows: [...fileRows, ...unmatchedRows],
    counts: {
      willImport: lines.length - rejectionByPosition.size,
      rejected: rejectionByPosition.size + unmatchedRows.length,
    },
  };
};
