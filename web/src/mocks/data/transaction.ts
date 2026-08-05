/**
 * Project-wide entity factory: Transaction (the epic brief's expense payment
 * request).
 *
 * Single source of truth for canonical `TransactionRead` VALUES (the shape and the
 * status names live in the production module `src/types/transactions.ts` and are
 * re-exported below). Imported by BOTH test layers (Vitest via
 * `@/mocks/data/transaction`, Playwright via a relative
 * `../src/mocks/data/transaction`) and by any runtime mock layer — never
 * re-declared in a test file.
 *
 * Shape anchored to `documentation/transactions-api.yaml` →
 * `components.schemas.TransactionRead` / `TransactionReadList`: exact field names
 * and PascalCase casing. `GET /v1/transactions` takes NO query parameters and
 * returns `{ Transactions: TransactionRead[] }` — build that body with
 * {@link transactionListResponse}, never by hand.
 *
 * PRODUCTION MODULE THIS EXPECTS (added by story 1, per its Technical summary —
 * `web/src/types/transactions.ts`, mirroring `web/src/types/files.ts`):
 *   - `TransactionRead`, `TransactionReadList`
 *   - `TRANSACTION_STATUS_IMPORTED` / `_APPROVED` / `_REJECTED`,
 *     `TRANSACTION_STATUSES`, `TransactionStatus`, `isKnownTransactionStatus`
 * Until that module exists this file reports `Cannot find module` — the expected
 * TDD-red signal, not a defect in the mock data.
 *
 * STATUS VALUES: the three recognised values are `Imported`, `Approved`,
 * `Rejected` (brief §Data Model, from the source `Transaction.Status` enum).
 * "Cancelled" is a FILE-level state and deliberately absent here — a cancelled
 * file's requests are assumed never to reach this list (see
 * {@link cancelledFileMatchOf} for the row that probes that assumption).
 *
 * TRANSACTION TYPE: the service owns the accepted set — the app translates the
 * codes it knows and renders anything else verbatim (brief §Notes & Caveats: do
 * NOT reintroduce a hardcoded enum). The codes below are therefore sample VALUES
 * for mocks, not a production enum: the sample file
 * (`documentation/transactions_2026-04-15.csv`) uses `C` / `D`, while the OpenAPI
 * example spells `Debit` out — both shapes are represented here.
 *
 * ACCOUNT NUMBERS are FULL, unmasked values. Masking to the last four digits is
 * the application's job (POPIA — project.md §Compliance), so a test can only prove
 * masking happens if the mock hands the component something to mask.
 *
 * Import discipline (so the Playwright layer can import this without alias
 * plumbing): type-only imports, and sibling factories by relative path.
 */
import {
  FILE_STATUS_CANCELLED,
  createFileLog,
  fileLogWithStatus,
} from './file-log';
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_REJECTED,
  TRANSACTION_STATUSES,
  isKnownTransactionStatus,
} from '../../types/transactions';

import type { DefaultResponse } from '../../types/api';
import type {
  TransactionRead,
  TransactionReadList,
  TransactionStatus,
} from '../../types/transactions';

export {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_REJECTED,
  TRANSACTION_STATUSES,
  isKnownTransactionStatus,
};
export type { TransactionRead, TransactionReadList, TransactionStatus };

/**
 * The originating file a request belongs to, taken from the FileLog factory so the
 * two entities cannot disagree about which file the rows came from.
 */
const DEFAULT_FILE = createFileLog();

/**
 * Sample `TransactionType` values — NOT a production enum (the service owns the
 * accepted set, brief §Notes & Caveats).
 *
 * `C` / `D` are the sample file's single-letter codes, which the app renders as
 * "Credit — money in" / "Debit — money out". `UNTRANSLATED` is the OpenAPI
 * example's spelled-out `Debit`: a legitimate value the app has no translation
 * for, which must reach the user exactly as sent and never be flagged as an error.
 */
export const TRANSACTION_TYPE_CREDIT_CODE = 'C';
export const TRANSACTION_TYPE_DEBIT_CODE = 'D';
export const TRANSACTION_TYPE_UNTRANSLATED = 'Debit';

/**
 * Canonical `TransactionRead`: an imported request, not yet decided, from the
 * sample file's first row (ZAR, South African description, single-letter type
 * code). Override any field — or use {@link transactionWithStatus} to get a
 * request whose note and last-changed values already match the status you asked
 * for.
 */
export const createTransaction = (
  overrides: Partial<TransactionRead> = {},
): TransactionRead => ({
  Id: 7001,
  FileLogId: DEFAULT_FILE.Id,
  FileName: DEFAULT_FILE.CurrentFileName,
  Reference: 'TXN-20260415-0001',
  TransactionDate: '2026-04-15 08:12:00',
  AccountNumber: '1001-2034-5567',
  Description: 'Salary deposit - April',
  Amount: 15750,
  TransactionType: TRANSACTION_TYPE_CREDIT_CODE,
  Currency: 'ZAR',
  Status: TRANSACTION_STATUS_IMPORTED,
  LastChangedUser: 'System',
  LastChangedDate: '2026-04-15 09:00:00',
  ...overrides,
});

/**
 * The fields that travel WITH a status on a real response: only a rejected request
 * carries a `UserNote`, and a decided request was last changed by a named person
 * rather than by the importer. Keeping them together here is what stops a test
 * mocking an incoherent row (e.g. an `Imported` request with a rejection note).
 */
const STATUS_DEFAULTS: Record<TransactionStatus, Partial<TransactionRead>> = {
  [TRANSACTION_STATUS_IMPORTED]: {
    LastChangedUser: 'System',
    LastChangedDate: '2026-04-15 09:00:00',
  },
  [TRANSACTION_STATUS_APPROVED]: {
    LastChangedUser: 'Thabo Mokoena',
    LastChangedDate: '2026-04-16 10:22:00',
  },
  [TRANSACTION_STATUS_REJECTED]: {
    UserNote: 'Amount does not match the supporting document',
    LastChangedUser: 'Thabo Mokoena',
    LastChangedDate: '2026-04-16 11:05:00',
  },
};

/**
 * A request in the given status, with a coherent note and last-changed pair for
 * that status. Accepts any string — an unrecognised value keeps the canonical
 * defaults and is carried through verbatim, which is the value the app must render
 * as received rather than remap.
 *
 * @example transactionWithStatus(TRANSACTION_STATUS_REJECTED, { Id: 7009 })
 */
export const transactionWithStatus = (
  status: string,
  overrides: Partial<TransactionRead> = {},
): TransactionRead =>
  createTransaction({
    Status: status,
    ...(isKnownTransactionStatus(status) ? STATUS_DEFAULTS[status] : {}),
    ...overrides,
  });

/**
 * One request per recognised status, each with its own id, reference, description
 * and account number so a row can be identified without index-based selection.
 * Their duplicate keys all differ, so no row in this set is a possible duplicate
 * of another.
 */
export const transactionsInEveryStatus = (): TransactionRead[] =>
  TRANSACTION_STATUSES.map((status, index) =>
    transactionWithStatus(status, {
      Id: 7010 + index,
      Reference: `TXN-20260415-00${String(11 + index)}`,
      AccountNumber: `1001-2034-56${String(70 + index)}`,
      Description: [
        'Pick n Pay groceries',
        'Engen Garage fuel',
        'Uber Eats lunch',
      ][index],
      Amount: [1245.67, 650, 189][index],
      TransactionDate: `2026-04-15 1${String(index)}:30:00`,
      TransactionType: TRANSACTION_TYPE_DEBIT_CODE,
    }),
  );

/**
 * A request whose `TransactionType` the app has no translation for (the OpenAPI
 * example's spelled-out `Debit`, which disagrees with the sample file's `D`).
 * It must be displayed exactly as returned, offered as a filter choice under that
 * raw value, and never treated as an error.
 */
export const transactionWithUnrecognisedType = (
  type: string = TRANSACTION_TYPE_UNTRANSLATED,
  overrides: Partial<TransactionRead> = {},
): TransactionRead =>
  createTransaction({
    Id: 7099,
    Reference: 'TXN-20260415-0099',
    AccountNumber: '1001-2034-5599',
    Description: 'Makro hardware purchase',
    Amount: 1567.4,
    TransactionType: type,
    ...overrides,
  });

/**
 * A request whose `TransactionDate` uses the SOURCE FILE's format
 * (`2026/04/15 08:12` — slashes, no seconds) instead of the format the OpenAPI
 * example shows (`2026-04-15 08:12:00`).
 *
 * The epic carries an unverified assumption that the service writes one consistent
 * format; this fixture exists so a test can state what happens when it does not,
 * rather than the mocks silently pretending the risk away. Do not normalise
 * `TransactionDate` in production code on speculation (brief §Notes & Caveats).
 */
export const transactionWithSourceFileDateFormat = (
  date = '2026/04/15 08:12',
  overrides: Partial<TransactionRead> = {},
): TransactionRead =>
  createTransaction({
    Id: 7098,
    Reference: 'TXN-20260415-0098',
    AccountNumber: '1001-2034-5598',
    Description: 'Clicks personal care',
    Amount: 267.85,
    TransactionDate: date,
    TransactionType: TRANSACTION_TYPE_DEBIT_CODE,
    ...overrides,
  });

/**
 * The duplicate key (BR3): two imported requests are possible duplicates when they
 * share `AccountNumber`, `Amount` and `TransactionDate`. Exposed so a test can
 * assert against the same three values the fixtures collide on.
 */
export const DUPLICATE_KEY: Pick<
  TransactionRead,
  'AccountNumber' | 'Amount' | 'TransactionDate'
> = {
  AccountNumber: '1001-2034-5567',
  Amount: 2500,
  TransactionDate: '2026-04-15 10:48:00',
};

/**
 * A request that collides with `transaction` on the duplicate key while staying a
 * distinct record (its own id and reference). This is the one place a key
 * collision is built, so a test never re-states the three key fields by hand.
 *
 * Pass overrides to turn the collision into an EXCLUDED row — or use the ready
 * exclusions {@link rejectedMatchOf} and {@link cancelledFileMatchOf}.
 *
 * @example transactionMatchingKeyOf(createTransaction(), { Id: 7002 })
 */
export const transactionMatchingKeyOf = (
  transaction: TransactionRead,
  overrides: Partial<TransactionRead> = {},
): TransactionRead =>
  createTransaction({
    Id: transaction.Id + 1,
    Reference: `${transaction.Reference}-RE`,
    Description: 'Re-submitted expense request',
    FileLogId: transaction.FileLogId,
    FileName: transaction.FileName,
    AccountNumber: transaction.AccountNumber,
    Amount: transaction.Amount,
    TransactionDate: transaction.TransactionDate,
    TransactionType: transaction.TransactionType,
    Currency: transaction.Currency,
    Status: TRANSACTION_STATUS_IMPORTED,
    ...overrides,
  });

/**
 * Two imported requests sharing {@link DUPLICATE_KEY} — the pair BR2 requires BOTH
 * of to be marked. They come from two different files (the realistic re-import
 * case) and carry distinct ids and references so each can be asserted by name.
 *
 * Apply `overrides` to both rows at once, e.g. to move the shared key.
 */
export const duplicatePair = (
  overrides: Partial<TransactionRead> = {},
): [TransactionRead, TransactionRead] => {
  const first = createTransaction({
    Id: 7201,
    Reference: 'TXN-20260415-0006',
    Description: 'EFT to J. Smith',
    ...DUPLICATE_KEY,
    TransactionType: TRANSACTION_TYPE_DEBIT_CODE,
    ...overrides,
  });
  const second = transactionMatchingKeyOf(first, {
    Id: 7202,
    Reference: 'TXN-20260430-0006',
    Description: 'EFT to J. Smith (resubmitted)',
    FileLogId: 5002,
    FileName: 'expenses_2026-04-30.csv',
  });
  return [first, second];
};

/**
 * A REJECTED request that collides with `transaction` on the duplicate key.
 *
 * BR3 excludes rejected requests from the comparison set: this row must never be
 * marked, and must never cause `transaction` to be marked either. A naive "any two
 * rows sharing account + amount + date" comparison flags both — which is exactly
 * what this fixture exists to catch.
 */
export const rejectedMatchOf = (
  transaction: TransactionRead,
  overrides: Partial<TransactionRead> = {},
): TransactionRead =>
  transactionMatchingKeyOf(transaction, {
    Id: transaction.Id + 100,
    Reference: `${transaction.Reference}-RJ`,
    Description: 'EFT to J. Smith (rejected earlier)',
    Status: TRANSACTION_STATUS_REJECTED,
    UserNote: STATUS_DEFAULTS[TRANSACTION_STATUS_REJECTED].UserNote,
    LastChangedUser: 'Thabo Mokoena',
    LastChangedDate: '2026-04-16 11:05:00',
    ...overrides,
  });

/** The cancelled file the {@link cancelledFileMatchOf} row belongs to. */
export const CANCELLED_FILE = fileLogWithStatus(FILE_STATUS_CANCELLED, {
  Id: 5099,
  CurrentFileName: 'expenses_2026-04-22_cancelled.csv',
});

/**
 * A request belonging to a CANCELLED file that collides with `transaction` on the
 * duplicate key (`FileLogId` / `FileName` point at {@link CANCELLED_FILE}).
 *
 * BR3 excludes cancelled files' rows from the comparison set. The epic's stated
 * assumption is that `GET /v1/transactions` never returns them at all — so this
 * fixture is the probe for what happens if the service does: nothing here should be
 * marked. Use it to state the assumption in a test rather than adding a
 * speculative client-side cancelled-file exclusion.
 */
export const cancelledFileMatchOf = (
  transaction: TransactionRead,
  overrides: Partial<TransactionRead> = {},
): TransactionRead =>
  transactionMatchingKeyOf(transaction, {
    Id: transaction.Id + 200,
    Reference: `${transaction.Reference}-CX`,
    Description: 'EFT to J. Smith (cancelled file)',
    FileLogId: CANCELLED_FILE.Id,
    FileName: CANCELLED_FILE.CurrentFileName,
    ...overrides,
  });

/**
 * A mixed set for search, filter, sort and paging work — every row distinct and
 * identifiable by reference, with NO two rows sharing the duplicate key (so
 * narrowing tests are never disturbed by an accidental duplicate mark; compose
 * {@link duplicatePair} in when duplicates are the point).
 *
 * Deliberate spread, so one fixture feeds every narrowing case:
 * - all three statuses, three originating files, both type codes plus one
 *   untranslated type (each pick-one filter therefore has >1 choice);
 * - amounts sitting exactly ON the 100 and 200 bounds, one inside (189), and 9.99
 *   — which is inside a 100–200 range only if amounts are compared as TEXT;
 * - dates in an earlier year (2025-11-20) and on 2026-04-15 with a time of day
 *   (15:00:00 — the "last day of the range" casualty), plus 2026-04-01/04-30;
 * - distinct last-four digits on every account number, so a search for the visible
 *   last four matches exactly one request.
 */
export const transactionsForNarrowing = (): TransactionRead[] => [
  createTransaction({
    Id: 7101,
    Reference: 'TXN-20260401-0001',
    TransactionDate: '2026-04-01 08:12:00',
    AccountNumber: '1001-2034-5567',
    Description: 'Salary deposit - April',
    Amount: 15750,
    TransactionType: TRANSACTION_TYPE_CREDIT_CODE,
  }),
  createTransaction({
    Id: 7102,
    Reference: 'TXN-20260415-0002',
    TransactionDate: '2026-04-15 08:34:00',
    AccountNumber: '1001-2034-5568',
    Description: 'Woolworths Sandton',
    Amount: 487.32,
    TransactionType: TRANSACTION_TYPE_DEBIT_CODE,
  }),
  transactionWithStatus(TRANSACTION_STATUS_APPROVED, {
    Id: 7103,
    Reference: 'TXN-20260415-0007',
    TransactionDate: '2026-04-15 11:03:00',
    AccountNumber: '2044-8871-3390',
    Description: 'Bank charges',
    Amount: 100,
    TransactionType: TRANSACTION_TYPE_DEBIT_CODE,
  }),
  createTransaction({
    Id: 7104,
    FileLogId: 5002,
    FileName: 'expenses_2026-04-30.csv',
    Reference: 'TXN-20260430-0011',
    TransactionDate: '2026-04-15 15:00:00',
    AccountNumber: '3355-6120-7781',
    Description: 'Uber Eats lunch',
    Amount: 189,
    TransactionType: TRANSACTION_TYPE_DEBIT_CODE,
  }),
  transactionWithStatus(TRANSACTION_STATUS_REJECTED, {
    Id: 7105,
    FileLogId: 5002,
    FileName: 'expenses_2026-04-30.csv',
    Reference: 'TXN-20260430-0012',
    TransactionDate: '2026-04-30 13:49:00',
    AccountNumber: '4412-9008-2245',
    Description: 'Netflix subscription',
    Amount: 200,
    TransactionType: TRANSACTION_TYPE_DEBIT_CODE,
  }),
  transactionWithStatus(TRANSACTION_STATUS_APPROVED, {
    Id: 7106,
    FileLogId: 5002,
    FileName: 'expenses_2026-04-30.csv',
    Reference: 'TXN-20260430-0016',
    TransactionDate: '2026-04-30 15:47:00',
    AccountNumber: '5589-3374-9902',
    Description: 'EFT received - Invoice 4521',
    Amount: 8750,
    TransactionType: TRANSACTION_TYPE_CREDIT_CODE,
  }),
  createTransaction({
    Id: 7107,
    FileLogId: 5003,
    FileName: 'expenses_2025-11-20.csv',
    Reference: 'TXN-20251120-0003',
    TransactionDate: '2025-11-20 09:05:00',
    AccountNumber: '6673-1145-8830',
    Description: 'Engen Garage fuel',
    Amount: 650,
    TransactionType: TRANSACTION_TYPE_DEBIT_CODE,
  }),
  transactionWithUnrecognisedType(TRANSACTION_TYPE_UNTRANSLATED, {
    Id: 7108,
    FileLogId: 5002,
    FileName: 'expenses_2026-04-30.csv',
    Reference: 'TXN-20260430-0020',
    TransactionDate: '2026-04-30 17:45:00',
    AccountNumber: '7791-2263-4408',
    Description: 'Spar convenience store',
    Amount: 9.99,
  }),
];

/**
 * `count` imported requests, each with a unique id, reference, account number,
 * amount and date — so no two share the duplicate key, and any row can be
 * identified by its reference rather than by position.
 *
 * For paging (page sizes 5 / 10 / 20 / 50, default 20) and the 10,000-row volume
 * ceiling. Apply `overrides` to every generated row.
 *
 * @example manyTransactions(45)
 */
export const manyTransactions = (
  count: number,
  overrides: Partial<TransactionRead> = {},
): TransactionRead[] =>
  Array.from({ length: count }, (_, index) => {
    const sequence = String(index + 1).padStart(4, '0');
    const day = String((index % 28) + 1).padStart(2, '0');
    return createTransaction({
      Id: 7300 + index,
      Reference: `TXN-20260415-${sequence}`,
      TransactionDate: `2026-04-${day} 0${String(index % 10)}:15:00`,
      AccountNumber: `1001-2034-${String(6000 + index)}`,
      Description: `Expense request ${sequence}`,
      Amount: 100 + index * 1.25,
      TransactionType:
        index % 2 === 0
          ? TRANSACTION_TYPE_DEBIT_CODE
          : TRANSACTION_TYPE_CREDIT_CODE,
      ...overrides,
    });
  });

/**
 * `GET /v1/transactions` response body — the endpoint takes no query parameters
 * and returns the whole set in one response. Defaults to a single imported
 * request; pass `[]` for the nothing-ever-imported case,
 * {@link transactionsForNarrowing} for the narrowing spread, or
 * {@link manyTransactions} for paging.
 */
export const transactionListResponse = (
  transactions: TransactionRead[] = [createTransaction()],
): TransactionReadList => ({ Transactions: transactions });

/**
 * The wording the SERVICE itself gives for a failed read of the expense requests.
 *
 * Deliberately phrased UNLIKE anything a screen would write for itself ("could not
 * be loaded…"), so a test can tell the two apart: this exact sentence on screen
 * proves the service's own reason reached the user, and its absence proves the
 * screen fell back to its own plain wording (story 1 AC-5, and the
 * `serviceMessageOf ?? serviceDetailOf ?? own wording` rule in `lib/api/errors.ts`).
 */
export const TRANSACTION_LIST_FAILURE_MESSAGE =
  'The transaction store is temporarily unavailable.';

/**
 * A failed `GET /v1/transactions` body. The transactions service describes a
 * failure with the `DefaultResponse` envelope (`Messages[]`, see
 * `documentation/transactions-api.yaml`), which is what
 * {@link TRANSACTION_LIST_FAILURE_MESSAGE} rides on — `apiClient` keeps it on the
 * failure's `details`, where `serviceDetailOf` finds it.
 *
 * For the OTHER half of AC-5 — a failure the service gave no readable reason for —
 * answer with no body at all rather than with an empty envelope: that is what leaves
 * the client holding only its own placeholder, which must never reach the user.
 */
export const transactionListFailureResponse = (
  message: string = TRANSACTION_LIST_FAILURE_MESSAGE,
): DefaultResponse => ({
  Id: 0,
  MessageType: 'ERROR',
  Messages: [message],
});
