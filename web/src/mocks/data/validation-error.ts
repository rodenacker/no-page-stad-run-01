/**
 * Project-wide entity factory: the invalid rows of a file that failed validation
 * (`ValidationErrorRow`), and the response body they arrive in.
 *
 * Single source of truth for canonical invalid-row VALUES (the shape lives in the
 * production module `src/types/files.ts` and is re-exported below). Imported by
 * BOTH test layers (Vitest via `@/mocks/data/validation-error`, Playwright via a
 * relative `../src/mocks/data/validation-error`) and by any runtime mock layer —
 * never re-declared in a test file.
 *
 * ⚠ **THE WIRE SHAPE OF ONE ROW IS INFERRED, NOT DOCUMENTED.**
 * `documentation/transactions-api.yaml` → `FileValidationErrorGetList` gives exactly
 * one example, and it is from an unrelated domain (zoo/animal records: `Species`,
 * `HabitatId`, `Diet`) with no expense fields and no defect field at all. So:
 *   - the seven recorded values are inferred from the `Transaction` shape (epic
 *     brief §Data Model) — and are taken from `./transaction` here rather than
 *     retyped, so the inference lives in ONE place;
 *   - `ErrorColumn` / `ErrorMessage` — how a row says what is wrong with it — are
 *     inferred outright.
 * If a live response names its fields differently, this file and
 * `ValidationErrorRow` in `src/types/files.ts` are the only two places to change.
 * Where the live shape cannot carry the field-level messages FR2/FR3 need, halt and
 * flag rather than guessing (epic brief §Notes & Caveats; `state.json` →
 * `unverifiedAssumptions`).
 *
 * WIRE QUIRK: `GET /v1/files/validation-errors?FileLogId={id}` answers with
 * `{ ValidationErrors: { JsonArray: "<json string>" } }` — the rows are a JSON array
 * delivered AS A STRING, which the consumer must parse. Build that body with
 * {@link validationErrorsResponse}, never by hand, and use
 * {@link unparseableValidationErrorsResponse} /
 * {@link nonArrayValidationErrorsResponse} for the bodies that cannot be read as
 * rows at all (a handled failure state, never a crash).
 *
 * THE SERVICE'S OWN REASON is present on every row here ({@link
 * SERVICE_DEFECT_REASONS}) and is deliberately phrased UNLIKE anything this app
 * would write. That is what makes FR2 and FR3 separable: for the four rules the app
 * owns (`Reference`, `Amount`, `TransactionDate`, `Currency`) the app's own fixed
 * wording is shown and the service's text must NOT reach the user; for a
 * `TransactionType` defect the service's text IS what is shown, word for word, and
 * the app judges nothing itself.
 *
 * ACCOUNT NUMBERS are FULL, unmasked values. Masking to the last four digits is the
 * application's job (POPIA — project.md §Compliance), so a test can only prove
 * masking happens if the mock hands the component something to mask.
 *
 * Import discipline (so the Playwright layer can import this without alias
 * plumbing): type-only imports, and sibling factories by relative path.
 */
import { createTransaction } from './transaction';

import type { DefaultResponse } from '../../types/api';
import type { ValidationErrorRow, ValidationErrors } from '../../types/files';

export type { ValidationErrorRow, ValidationErrors };

/**
 * The row a rejected row is modelled on — the canonical imported request. Its seven
 * recorded values are copied below, so this factory and the Transaction factory
 * cannot disagree about what a row of this project's files holds.
 */
const MODEL_ROW = createTransaction();

/**
 * A rejected row with every recorded value present and readable, and NO defect
 * signal yet. Not exported: a real element of this list is always rejected for
 * something, so every exported helper adds a defect
 * ({@link invalidRowWithNoDefectSignal} being the deliberate exception that probes
 * a response carrying no defect signal at all).
 */
const RECORDED_VALUES: ValidationErrorRow = {
  Reference: MODEL_ROW.Reference,
  TransactionDate: MODEL_ROW.TransactionDate,
  AccountNumber: MODEL_ROW.AccountNumber,
  Description: MODEL_ROW.Description,
  Amount: MODEL_ROW.Amount,
  TransactionType: MODEL_ROW.TransactionType,
  Currency: MODEL_ROW.Currency,
  // Row bookkeeping, from the only part of an element the spec actually evidences.
  Id: 1,
  PrimaryKeyValue: 1,
  ChangeType: 'INSERT',
  ChangedBy: 'System',
  ChangedAt: '2026-04-30 15:05:12',
};

/**
 * The reason the SERVICE gives for each kind of defect — machine-ish, and quite
 * unlike anything this app would put in front of a user, on purpose (see the
 * header). For the four app-owned rules these strings must never appear on screen;
 * for `TransactionType` the string IS what the user must see, verbatim (FR3).
 */
export const SERVICE_DEFECT_REASONS: Record<string, string> = {
  Reference: 'Row 4: column [Reference] failed rule NOT_NULL.',
  Amount: 'Row 7: column [Amount] failed rule DECIMAL(18,2).',
  TransactionDate: 'Row 11: column [TransactionDate] failed rule DATETIME.',
  Currency: 'Row 14: column [Currency] failed rule ISO_CURRENCY.',
  TransactionType:
    'Transaction type "Transfer" is not accepted for this file setting.',
};

/**
 * The service's reason for a `TransactionType` defect — the one reason that reaches
 * the user word for word (FR3). Exported separately because a test asserting
 * verbatim carriage should name the exact sentence it expects on screen.
 */
export const TRANSACTION_TYPE_DEFECT_REASON =
  SERVICE_DEFECT_REASONS.TransactionType;

/** The transaction type the service rejected — a value the app never judges itself. */
export const REJECTED_TRANSACTION_TYPE = 'Transfer';

/**
 * The defective VALUE that goes with each defect: a row rejected for its amount
 * carries text where a number was expected, a row rejected for its date carries
 * something that is not a date, and a row rejected for a missing reference carries
 * no reference. Keeping value and defect together here is what stops a test mocking
 * an incoherent row (e.g. `ErrorColumn: 'Amount'` on a row whose amount is fine).
 */
const DEFECT_VALUES: Record<string, Partial<ValidationErrorRow>> = {
  // An empty cell in the source file. A service that omits the key entirely is the
  // other form of "missing" — invalidRowMissingReference({ Reference: undefined }).
  Reference: { Reference: '' },
  // What a ZA-locale spreadsheet writes: grouped spaces and a decimal comma.
  Amount: { Amount: 'R 1 245,67' },
  // The source file's slash format AND a day that does not exist in April.
  TransactionDate: { TransactionDate: '31/04/2026' },
  Currency: { Currency: 'ZZZ' },
  TransactionType: { TransactionType: REJECTED_TRANSACTION_TYPE },
};

/**
 * A rejected row whose defect is on `column`: the offending value is made
 * defective, `ErrorColumn` names the column, and `ErrorMessage` carries the
 * service's own reason for it.
 *
 * Accepts any column name — including one this app has never heard of, which is a
 * real possibility and must not be a type error.
 *
 * @example invalidRowWithDefectOn('Amount', { Id: 4 })
 */
export const invalidRowWithDefectOn = (
  column: string,
  overrides: Partial<ValidationErrorRow> = {},
): ValidationErrorRow => ({
  ...RECORDED_VALUES,
  ...DEFECT_VALUES[column],
  ErrorColumn: column,
  ErrorMessage: SERVICE_DEFECT_REASONS[column],
  ...overrides,
});

/**
 * Canonical invalid row: rejected for an unsupported currency code.
 *
 * That defect is the canonical one because it leaves all seven recorded values
 * present and displayable — so a test about listing a row's values (story 2 AC-1)
 * is not fighting a blanked cell — while still exercising the app's own fixed
 * wording (FR2).
 */
export const createInvalidRow = (
  overrides: Partial<ValidationErrorRow> = {},
): ValidationErrorRow => invalidRowWithDefectOn('Currency', overrides);

/** A row rejected because it carries no reference (FR2, `R38`). */
export const invalidRowMissingReference = (
  overrides: Partial<ValidationErrorRow> = {},
): ValidationErrorRow => invalidRowWithDefectOn('Reference', overrides);

/** A row rejected because its amount is not a number (FR2, `R39`). */
export const invalidRowWithNonNumericAmount = (
  overrides: Partial<ValidationErrorRow> = {},
): ValidationErrorRow => invalidRowWithDefectOn('Amount', overrides);

/** A row rejected because its transaction date cannot be read (FR2, `R40`). */
export const invalidRowWithUnreadableDate = (
  overrides: Partial<ValidationErrorRow> = {},
): ValidationErrorRow => invalidRowWithDefectOn('TransactionDate', overrides);

/** A row rejected because its currency is not a supported code (FR2, `R42`). */
export const invalidRowWithUnsupportedCurrency = (
  overrides: Partial<ValidationErrorRow> = {},
): ValidationErrorRow => invalidRowWithDefectOn('Currency', overrides);

/**
 * A row the transactions SERVICE rejected over its transaction type (FR3, `R41`).
 *
 * The service's reason ({@link TRANSACTION_TYPE_DEFECT_REASON}) is what must reach
 * the user verbatim; the app holds no accepted-type list and judges nothing here.
 */
export const invalidRowWithTransactionTypeDefect = (
  overrides: Partial<ValidationErrorRow> = {},
): ValidationErrorRow => invalidRowWithDefectOn('TransactionType', overrides);

/**
 * A row whose defect the service described but did NOT attribute to a column — a
 * message with no `ErrorColumn`.
 *
 * This is one of the epic's recorded unverified assumptions ("if the response
 * carries only one general message per row, or none…"): the app cannot pick a
 * field-level message for such a row, so it must show what it was given rather than
 * guessing a field or showing nothing.
 */
export const invalidRowWithMessageOnly = (
  message = 'This row was rejected during validation.',
  overrides: Partial<ValidationErrorRow> = {},
): ValidationErrorRow => {
  const row = createInvalidRow({ ...overrides, ErrorMessage: message });
  delete row.ErrorColumn;
  return row;
};

/**
 * A row carrying NO defect signal at all — neither column nor message.
 *
 * The other half of the same assumption: a response shaped like this cannot explain
 * any row. The row's own values must still be listed, and the screen must not
 * invent a reason for it.
 */
export const invalidRowWithNoDefectSignal = (
  overrides: Partial<ValidationErrorRow> = {},
): ValidationErrorRow => {
  const row = createInvalidRow(overrides);
  delete row.ErrorColumn;
  delete row.ErrorMessage;
  return row;
};

/**
 * One rejected row per defect this epic has wording rules for — the four the app
 * owns plus the transaction-type defect the service explains — each with its own
 * id, reference, account number, description and date, so a row is identified by
 * its content rather than by position.
 *
 * This is the fixture for story 2's list: five rows, five different explanations.
 */
export const invalidRowsForEveryDefect = (): ValidationErrorRow[] =>
  [
    invalidRowMissingReference({
      Description: 'Pick n Pay groceries',
      Amount: 1245.67,
    }),
    invalidRowWithNonNumericAmount({
      Reference: 'TXN-20260415-0007',
      Description: 'Engen Garage fuel',
    }),
    invalidRowWithUnreadableDate({
      Reference: 'TXN-20260415-0011',
      Description: 'Uber Eats lunch',
      Amount: 189,
    }),
    invalidRowWithUnsupportedCurrency({
      Reference: 'TXN-20260415-0014',
      Description: 'Netflix subscription',
      Amount: 200,
    }),
    invalidRowWithTransactionTypeDefect({
      Reference: 'TXN-20260415-0020',
      Description: 'EFT to J. Smith',
      Amount: 2500,
    }),
  ].map((row, index) => ({
    ...row,
    Id: index + 1,
    PrimaryKeyValue: index + 1,
    // Distinct last four digits on every row, so a masked account number still
    // identifies exactly one row.
    AccountNumber: `1001-2034-56${String(71 + index)}`,
  }));

/**
 * `GET /v1/files/validation-errors?FileLogId={id}` response body: the rows
 * SERIALISED into the `ValidationErrors.JsonArray` string the service actually
 * sends (see the header's wire quirk).
 *
 * Defaults to a single rejected row; pass {@link invalidRowsForEveryDefect} for the
 * full spread, or `[]` for a failed file that reports no rows.
 */
export const validationErrorsResponse = (
  rows: ValidationErrorRow[] = [createInvalidRow()],
): ValidationErrors => ({
  ValidationErrors: { JsonArray: JSON.stringify(rows) },
});

/**
 * A response whose `JsonArray` is not valid JSON — a truncated payload, the most
 * likely way this endpoint fails without failing.
 *
 * The rows cannot be read, so the screen must say so plainly instead of drawing an
 * empty table, and must not throw (story 2 AC-4).
 */
export const unparseableValidationErrorsResponse = (
  jsonArray = '[{"Reference":"TXN-20260415-0001","Amount":',
): ValidationErrors => ({ ValidationErrors: { JsonArray: jsonArray } });

/**
 * A response whose `JsonArray` parses but is NOT an array of rows — here a single
 * object where a list was promised.
 *
 * Same handled-failure state as {@link unparseableValidationErrorsResponse}, and the
 * one a `JSON.parse` in a `try`/`catch` alone would sail straight past.
 */
export const nonArrayValidationErrorsResponse = (): ValidationErrors => ({
  ValidationErrors: {
    JsonArray: JSON.stringify(createInvalidRow()),
  },
});

/**
 * The wording the SERVICE itself gives for a failed read of a file's invalid rows.
 *
 * Deliberately phrased UNLIKE anything a screen would write for itself, so a test
 * can tell the two apart: this exact sentence on screen proves the service's own
 * reason reached the user, and its absence proves the screen fell back to its own
 * plain wording (story 2 AC-5, and the
 * `serviceMessageOf ?? serviceDetailOf ?? own wording` rule in `lib/api/errors.ts`).
 */
export const VALIDATION_ERRORS_FAILURE_MESSAGE =
  'The validation results for this file are temporarily unavailable.';

/**
 * A failed `GET /v1/files/validation-errors` body. The transactions service
 * describes a failure with the `DefaultResponse` envelope (`Messages[]`), which is
 * what {@link VALIDATION_ERRORS_FAILURE_MESSAGE} rides on — `apiClient` keeps it on
 * the failure's `details`, where `serviceDetailOf` finds it.
 *
 * For the other half of that criterion — a failure the service gave no readable
 * reason for — answer with no body at all rather than with an empty envelope: that
 * is what leaves the client holding only its own placeholder, which must never
 * reach the user.
 */
export const validationErrorsFailureResponse = (
  message: string = VALIDATION_ERRORS_FAILURE_MESSAGE,
): DefaultResponse => ({
  Id: 0,
  MessageType: 'ERROR',
  Messages: [message],
});
