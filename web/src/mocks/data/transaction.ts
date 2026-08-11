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
 * masking happens if the mock hands the component something to mask. The CSV export
 * is the one deliberate exception that writes the value whole (csv-export brief
 * §Compliance Exception), which the same full value here is what proves.
 *
 * DECIDING A REQUEST (epic `expense-decisions`): the approve/reject calls and the
 * decided-request shapes live in the final section of this file. Two things there
 * matter more than the rest:
 *   - `DECIDING_APPROVER` is derived from `userInfoFor(ROLE_APPROVER)` rather than
 *     spelled out, because the same name has to appear in two places at once — the
 *     `LastChangedUser` REQUEST HEADER both decide calls require, and the
 *     `LastChangedUser` FIELD the audit view then shows (brief R16). Deriving it
 *     from the identity source is what stops those two drifting apart.
 *   - `alreadyDecidedResponse` is deliberately IDENTICAL to the success body
 *     (brief BR1): the service answers the same `DefaultResponse` envelope whatever
 *     happened, so the response cannot be parsed to detect an already-decided
 *     request. Detection is a fresh re-read before submitting, not a body check.
 *
 * APPROVING MANY AT ONCE, AND A LIST THAT REFRESHES ITSELF (epic
 * `bulk-approval-and-live-refresh`): the last section of this file. It adds no new
 * entity and no new call — bulk approval is N of the same single approve call, and
 * the self-refresh is the same `GET /v1/transactions` read on a timer. What it does
 * add is the one thing those stories turn on: SUCCESSIVE SNAPSHOTS of the same
 * list, where a named few requests have been decided between one read and the next.
 * `transactionsAfterColleagueDecided` / `transactionsAfterApproving` produce them
 * from a list you already have, in the same order, so a test never hand-builds a
 * second list and accidentally changes something else too.
 *
 * Import discipline (so the Playwright layer can import this without alias
 * plumbing): type-only imports, and sibling factories by relative path.
 */
import {
  FILE_STATUS_CANCELLED,
  createFileLog,
  fileLogWithStatus,
} from './file-log';
import { userInfoFor } from './identity';
import { ROLE_APPROVER } from './role';
import { fullNameOf } from './user';
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
 * The signed-in Approver's own display name, taken from the identity source rather
 * than spelled out here.
 *
 * It is the value the app must put in the `LastChangedUser` header of both decide
 * calls (from the authenticated session, never client-supplied — brief §Notes &
 * Caveats) AND the value that then comes back on the decided request and is shown
 * on the audit view (R16). Deriving both from `userInfoFor(ROLE_APPROVER)` means a
 * test asserting "the header said who decided it" and a test asserting "the screen
 * shows who decided it" can never be checking two different people.
 */
export const DECIDING_APPROVER = fullNameOf(userInfoFor(ROLE_APPROVER));

/**
 * A DIFFERENT Approver — the person who got there first in the already-decided race
 * (brief Workflow 3, R4/R13). Deliberately not {@link DECIDING_APPROVER}, so a test
 * can tell "someone else decided this" apart from "I decided this".
 *
 * This project has exactly two role NAMES but any number of people holding them, so
 * a second approver is a real identity, not a second role.
 */
export const OTHER_APPROVER = 'Naledi Khumalo';

/**
 * The canonical rejection note (brief R2/R9): the reason an Approver types when
 * rejecting, and the value that must then be recorded and shown alongside the
 * rejected status.
 */
export const REJECTION_NOTE = 'Amount does not match the supporting document';

/**
 * A note made only of whitespace — the value BR4 requires a rejection to be REFUSED
 * for, exactly as an empty one is. A test that only ever tries `''` proves nothing
 * about the rule as written ("empty or whitespace-only"), which is why the value
 * lives here rather than being invented per test.
 */
export const WHITESPACE_ONLY_NOTE = '   ';

/** When a decided request was decided (approval / rejection). */
const APPROVED_AT = '2026-04-16 10:22:00';
const REJECTED_AT = '2026-04-16 11:05:00';

/**
 * The fields that travel WITH a status on a real response: only a rejected request
 * carries a `UserNote`, and a decided request was last changed by a named person
 * rather than by the importer. Keeping them together here is what stops a test
 * mocking an incoherent row (e.g. an `Imported` request with a rejection note, or a
 * decided one still showing `System` as the last person to touch it).
 */
const STATUS_DEFAULTS: Record<TransactionStatus, Partial<TransactionRead>> = {
  [TRANSACTION_STATUS_IMPORTED]: {
    LastChangedUser: 'System',
    LastChangedDate: '2026-04-15 09:00:00',
  },
  [TRANSACTION_STATUS_APPROVED]: {
    LastChangedUser: DECIDING_APPROVER,
    LastChangedDate: APPROVED_AT,
  },
  [TRANSACTION_STATUS_REJECTED]: {
    UserNote: REJECTION_NOTE,
    LastChangedUser: DECIDING_APPROVER,
    LastChangedDate: REJECTED_AT,
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
 * FREE TEXT THAT BREAKS A NAIVE CSV WRITER (csv-export epic, BR3 / RFC 4180).
 *
 * `Description` and `UserNote` are the two free-text fields a person types, so they
 * are where a comma, a quotation mark or a line break actually arrives. A writer that
 * joins values with commas and rows with newlines turns any of these into extra
 * columns or extra rows in the hand-over file — which a receiving system, not a
 * person, reads next.
 *
 * Each constant isolates ONE hostile character so a failure names which case broke,
 * and the values are exported so a test asserts the round-trip against the same
 * string the mock supplied rather than restating it. Both line-break spellings are
 * present on purpose: a lone `\n`, and the `\r\n` that also happens to be RFC 4180's
 * record separator (the harsher collision).
 *
 * Values are realistic expense wording (ZA locale, project.md §Compliance) — the
 * sample upload file happens to contain no such characters, which is exactly why
 * relying on it would leave this untested.
 */
export const DESCRIPTION_WITH_COMMA =
  'Catering, venue hire and travel to Cape Town';
export const DESCRIPTION_WITH_QUOTES =
  'Reprint of the "Annual Report" for the board';
export const DESCRIPTION_WITH_LINE_BREAK =
  'Conference registration\nDelegate: T. Mokoena';
export const DESCRIPTION_WITH_EVERY_HOSTILE_CHARACTER =
  'Venue hire, "deposit" portion\r\nbalance due on 30 April';
export const USER_NOTE_WITH_EVERY_HOSTILE_CHARACTER =
  'Amount, "VAT" and date disagree\r\nwith the attached invoice';

/**
 * Four requests whose free text carries the characters RFC 4180 requires quoting:
 * one per hostile character, plus one carrying all three in BOTH free-text fields
 * (`Description` and `UserNote` — the rejected row, which is the only status that
 * carries a note).
 *
 * Every row keeps its own id, reference and account number, and no two share the
 * duplicate key, so a row is identified by its reference rather than by position.
 * Use with {@link transactionListResponse} to answer `GET /v1/transactions`.
 */
export const transactionsWithCsvHostileText = (): TransactionRead[] => [
  createTransaction({
    Id: 7401,
    Reference: 'TXN-20260415-0031',
    TransactionDate: '2026-04-15 08:20:00',
    AccountNumber: '8801-4472-1130',
    Description: DESCRIPTION_WITH_COMMA,
    Amount: 4820.5,
    TransactionType: TRANSACTION_TYPE_DEBIT_CODE,
  }),
  createTransaction({
    Id: 7402,
    Reference: 'TXN-20260415-0032',
    TransactionDate: '2026-04-15 09:41:00',
    AccountNumber: '8801-4472-1131',
    Description: DESCRIPTION_WITH_QUOTES,
    Amount: 1375,
    TransactionType: TRANSACTION_TYPE_DEBIT_CODE,
  }),
  createTransaction({
    Id: 7403,
    Reference: 'TXN-20260415-0033',
    TransactionDate: '2026-04-15 11:12:00',
    AccountNumber: '8801-4472-1132',
    Description: DESCRIPTION_WITH_LINE_BREAK,
    Amount: 2650,
    TransactionType: TRANSACTION_TYPE_DEBIT_CODE,
  }),
  transactionWithStatus(TRANSACTION_STATUS_REJECTED, {
    Id: 7404,
    Reference: 'TXN-20260415-0034',
    TransactionDate: '2026-04-15 13:05:00',
    AccountNumber: '8801-4472-1133',
    Description: DESCRIPTION_WITH_EVERY_HOSTILE_CHARACTER,
    Amount: 9990,
    TransactionType: TRANSACTION_TYPE_DEBIT_CODE,
    UserNote: USER_NOTE_WITH_EVERY_HOSTILE_CHARACTER,
  }),
];

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
    UserNote: REJECTION_NOTE,
    LastChangedUser: DECIDING_APPROVER,
    LastChangedDate: REJECTED_AT,
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
 *
 * A FAILED REFRESH POLL is this same body (epic `bulk-approval-and-live-refresh`,
 * R6/BR9) — there is no separate poll endpoint and so no separate failure fixture.
 * What differs is only what the screen does with it: a failed initial read leaves
 * the user with nothing and gets the failed-load state, while a failed re-read
 * leaves the rows already on screen exactly where they are, and only a SECOND
 * consecutive failure raises the "cannot refresh itself" notice. Answer two reads in
 * a row with this (or with a rejection) to reach it, and one to prove nothing
 * changes.
 */
export const transactionListFailureResponse = (
  message: string = TRANSACTION_LIST_FAILURE_MESSAGE,
): DefaultResponse => ({
  Id: 0,
  MessageType: 'ERROR',
  Messages: [message],
});

/* -------------------------------------------------------------------------- */
/* Deciding a request — POST /v1/transactions/approve and /reject              */
/* -------------------------------------------------------------------------- */

/**
 * The body of `POST /v1/transactions/reject`
 * (`documentation/transactions-api.yaml` → `TransactionRejectWrite`): the note, and
 * nothing else. `TransactionId` travels as a QUERY parameter and `LastChangedUser`
 * as a HEADER — neither belongs in this body, which is the mistake this helper
 * exists to make impossible.
 *
 * Approve has NO body at all: it is `TransactionId` + `LastChangedUser` only.
 *
 * @example expect(bodySent).toEqual(rejectionWriteBody('Duplicate claim'))
 */
export const rejectionWriteBody = (
  note: string = REJECTION_NOTE,
): { UserNote: string } => ({ UserNote: note });

/**
 * The request AFTER a decision has been recorded on it — the row a fresh read
 * returns once someone has approved or rejected it.
 *
 * Everything that identifies the request (id, reference, account, amount, file) is
 * carried over untouched, because a decision changes only `Status`, `UserNote`,
 * `LastChangedUser` and `LastChangedDate` (brief §Out of Scope: imported values are
 * read-only). The four decision fields are then made coherent for the status asked
 * for, so no test can mock an approved request that still carries a rejection note.
 *
 * @example transactionDecided(request, { status: TRANSACTION_STATUS_REJECTED, note: 'Duplicate claim' })
 */
export const transactionDecided = (
  transaction: TransactionRead,
  {
    status = TRANSACTION_STATUS_APPROVED,
    by = DECIDING_APPROVER,
    note,
    at,
  }: {
    status?: string;
    by?: string;
    note?: string;
    at?: string;
  } = {},
): TransactionRead => {
  // Any note the request already carried goes FIRST, before the status defaults put
  // back whichever one this status legitimately has. Spreading the defaults over the
  // request cannot remove a field the request already had, so without this an
  // already-rejected request re-decided as approved would keep its rejection note —
  // exactly the incoherent row this helper exists to make impossible.
  const withoutDecision: TransactionRead = { ...transaction };
  delete withoutDecision.UserNote;

  return {
    ...withoutDecision,
    Status: status,
    ...(isKnownTransactionStatus(status) ? STATUS_DEFAULTS[status] : {}),
    LastChangedUser: by,
    ...(note === undefined ? {} : { UserNote: note }),
    ...(at === undefined ? {} : { LastChangedDate: at }),
  };
};

/**
 * The same request as re-read a moment later, already decided by SOMEONE ELSE
 * ({@link OTHER_APPROVER}) — the state BR1's re-read-before-submit is there to
 * find, and R4/R13's "this request has already been decided" is the answer to.
 *
 * Feed it back through {@link transactionListResponse} for the re-read, since the
 * transactions service has no single-request GET: the fresh read is another
 * `GET /v1/transactions`.
 *
 * @example transactionListResponse([transactionDecidedElsewhere(request)])
 */
export const transactionDecidedElsewhere = (
  transaction: TransactionRead,
  status: string = TRANSACTION_STATUS_APPROVED,
): TransactionRead =>
  transactionDecided(transaction, { status, by: OTHER_APPROVER });

/**
 * `POST /v1/transactions/approve` success body — the generic `DefaultResponse`
 * envelope, which says nothing about the request's new status. A caller learns the
 * outcome only by re-reading the list (see {@link transactionListResponse}).
 */
export const approveSuccessResponse = (
  transactionId: number = createTransaction().Id,
): DefaultResponse => ({
  Id: transactionId,
  MessageType: 'SUCCESS',
  Messages: ['Transaction approved'],
});

/** `POST /v1/transactions/reject` success body — same envelope as approve. */
export const rejectSuccessResponse = (
  transactionId: number = createTransaction().Id,
): DefaultResponse => ({
  Id: transactionId,
  MessageType: 'SUCCESS',
  Messages: ['Transaction rejected'],
});

/**
 * The body a decide call answers with when the request was ALREADY DECIDED.
 *
 * It returns {@link approveSuccessResponse} — the exact same body, field for field.
 * That is not an oversight, it is brief BR1 stated as data: the service answers one
 * envelope whatever happened, so no amount of parsing the response can tell
 * "decided" from "already decided". Any implementation that passes a test using
 * this fixture WITHOUT re-reading the request's status first is reading the outcome
 * out of a body that does not carry it.
 */
export const alreadyDecidedResponse = (
  transactionId: number = createTransaction().Id,
): DefaultResponse => approveSuccessResponse(transactionId);

/**
 * The wording the SERVICE itself gives for a refused decision — deliberately
 * phrased as only a backend would phrase it, so a test can tell it apart from
 * wording the screen wrote for itself (`serviceMessageOf ?? serviceDetailOf ?? own
 * wording`, `lib/api/errors.ts`).
 */
export const DECISION_REFUSED_MESSAGE =
  'The transaction could not be updated (the record is locked by another process).';

/**
 * `POST /v1/transactions/approve` / `/reject` failure body. Both operations declare
 * only 200 / 401 / 500, and the 500 carries this same `DefaultResponse` envelope —
 * so a refusal's reason travels in `Messages[]`, which `apiClient` keeps on the
 * failure's `details`.
 *
 * For the other half of the error case — a failure the service gave no readable
 * reason for — answer with no body at all rather than an empty envelope, so the
 * client is left holding only its own placeholder (which must never reach the user,
 * project.md NFR-base-5).
 */
export const decisionFailureResponse = (
  message: string = DECISION_REFUSED_MESSAGE,
): DefaultResponse => ({ Id: 0, MessageType: 'ERROR', Messages: [message] });

/* -------------------------------------------------------------------------- */
/* Approving many at once, and a list that refreshes itself                    */
/* (epic `bulk-approval-and-live-refresh`)                                     */
/* -------------------------------------------------------------------------- */

/**
 * The list a bulk-selection screen starts from: `importedCount` requests still
 * awaiting a decision, followed by one already Approved and one already Rejected.
 *
 * The two decided rows are the point of the fixture, not padding — only an
 * `Imported` request may be selected or bulk-approved (brief BR1), so a set of
 * nothing but selectable rows cannot tell a correct implementation from one that
 * offers a tick on everything.
 *
 * `importedCount` is what reaches the count thresholds: pass 100 or more for the
 * ambient indicator's `99+` form (R4), a handful for the ordinary case. The
 * imported rows come from {@link manyTransactions} unchanged — this is a
 * composition of the existing generator, not a second one — and the decided pair's
 * ids and references are derived from the highest imported id, so no id can ever
 * collide with a generated row however large the count grows. That matters more
 * here than elsewhere: the selection is held as a SET OF IDS (story 1), so two rows
 * sharing an id would silently select two requests with one tick.
 *
 * No two rows share {@link DUPLICATE_KEY}, so a selection test is never disturbed
 * by an unrelated duplicate mark. Compose {@link duplicatePair} in where duplicates
 * are the point.
 *
 * @example transactionsForBulkSelection(100)
 */
export const transactionsForBulkSelection = (
  importedCount = 6,
): TransactionRead[] => {
  const imported = manyTransactions(importedCount);
  const highestId = imported.reduce(
    (highest, transaction) => Math.max(highest, transaction.Id),
    0,
  );
  const decided = [
    TRANSACTION_STATUS_APPROVED,
    TRANSACTION_STATUS_REJECTED,
  ].map((status, index) =>
    transactionWithStatus(status, {
      Id: highestId + 1 + index,
      Reference: `TXN-20260501-000${String(1 + index)}`,
      TransactionDate: `2026-05-0${String(1 + index)} 09:20:00`,
      AccountNumber: `2044-8871-99${String(10 + index)}`,
      Description: ['Absa card settlement', 'Vodacom airtime bundle'][index],
      Amount: [3120.4, 899][index],
      TransactionType: TRANSACTION_TYPE_DEBIT_CODE,
    }),
  );
  return [...imported, ...decided];
};

/**
 * The SAME list as read a moment later, with only the named requests now decided —
 * the next snapshot of `GET /v1/transactions`.
 *
 * This is the shape every read after the first one takes in this epic, because the
 * transactions service has no delta channel and no single-request GET: the
 * pre-submit re-check (BR2), the post-batch reconciliation read (BR5), the 15s
 * refresh poll (BR6) and the retry's re-check (BR11) are all just another full-list
 * read that differs from the last one. Deriving that read from the list you already
 * have — rather than authoring a second list — is what keeps the difference between
 * two polls limited to the thing under test.
 *
 * Order, and every request not named, are preserved exactly. Both matter: BR8
 * requires a refresh to update in place without reordering or otherwise disturbing
 * the reader, and a test can only prove that if the fixture itself changed nothing
 * else. Only `Status`, `UserNote`, `LastChangedUser` and `LastChangedDate` move (see
 * {@link transactionDecided}).
 *
 * Throws on an id that is not in the list — a snapshot meant to show a request being
 * decided, that silently decides nothing, turns a race test into a test of nothing.
 *
 * Prefer the two named wrappers, which say WHO decided:
 * {@link transactionsAfterColleagueDecided} and {@link transactionsAfterApproving}.
 */
export const transactionsAfterDeciding = (
  transactions: TransactionRead[],
  ids: readonly number[],
  {
    status = TRANSACTION_STATUS_APPROVED,
    by = DECIDING_APPROVER,
    note,
    at,
  }: {
    status?: string;
    by?: string;
    note?: string;
    at?: string;
  } = {},
): TransactionRead[] => {
  const missing = ids.filter(
    (id) => !transactions.some((transaction) => transaction.Id === id),
  );
  if (missing.length > 0) {
    throw new Error(
      `Cannot decide transaction id(s) ${missing.join(', ')}: no such request in ` +
        `this list (it holds ${String(transactions.length)} request(s)). A snapshot ` +
        `that decides nothing would make a staleness test pass without a race ever ` +
        `happening.`,
    );
  }
  const targeted = new Set(ids);
  return transactions.map((transaction) =>
    targeted.has(transaction.Id)
      ? transactionDecided(transaction, { status, by, note, at })
      : transaction,
  );
};

/**
 * The next read of the list, with the named requests decided by SOMEONE ELSE
 * ({@link OTHER_APPROVER}) — a colleague got there first.
 *
 * This is the state the whole epic is built around, and it is read in three places:
 * the pre-submit re-check that drops those requests from the batch without ever
 * calling approve for them (BR1/BR2), the outcome's "left unchanged because they
 * had already been decided" count (R5), and the refresh that quietly prunes them
 * from an active selection so the visible count corrects itself (BR8).
 *
 * Deliberately NOT {@link DECIDING_APPROVER}, so a test can tell "someone else
 * decided this" apart from "my own batch approved this" — the distinction the
 * outcome report's first two buckets rest on.
 *
 * @example
 *   const before = transactionsForBulkSelection(5);
 *   const after = transactionsAfterColleagueDecided(before, [before[1].Id]);
 *   mockGet
 *     .mockResolvedValueOnce(transactionListResponse(before))
 *     .mockResolvedValue(transactionListResponse(after));
 */
export const transactionsAfterColleagueDecided = (
  transactions: TransactionRead[],
  ids: readonly number[],
  status: string = TRANSACTION_STATUS_APPROVED,
): TransactionRead[] =>
  transactionsAfterDeciding(transactions, ids, { status, by: OTHER_APPROVER });

/**
 * The reconciliation read (BR5): the list as it stands once this user's own batch
 * has landed, with exactly the named requests now Approved by
 * {@link DECIDING_APPROVER}.
 *
 * The approved count in the outcome report is computed by comparing each selected
 * request's status BEFORE the batch to its status in this read — never from the
 * individual approve responses, which carry the same body whatever happened
 * ({@link alreadyDecidedResponse}). So this fixture is what an implementation that
 * trusts the call bodies instead will fail against: name here only the requests
 * that genuinely changed, and any request reported as approved without appearing
 * here is a false success.
 *
 * @example transactionListResponse(transactionsAfterApproving(before, selectedIds))
 */
export const transactionsAfterApproving = (
  transactions: TransactionRead[],
  ids: readonly number[],
): TransactionRead[] =>
  transactionsAfterDeciding(transactions, ids, {
    status: TRANSACTION_STATUS_APPROVED,
    by: DECIDING_APPROVER,
  });
