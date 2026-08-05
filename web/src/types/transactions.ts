/**
 * The expense payment request (the backend's "transaction") as this project's
 * transactions contract declares it.
 *
 * Shapes are anchored to `documentation/transactions-api.yaml`
 * (`TransactionRead`, `TransactionReadList`) — exact PascalCase field names, as the
 * transactions service returns them. Field requiredness follows
 * `documentation/requirements-application.md` §7 (Shape: Transaction) and the epic
 * brief's Data Model; the OpenAPI schema declares no `required` list, so
 * requiredness here reflects what the application actually reads.
 *
 * This module is the single source of truth for the transaction status names. The
 * test factory in `src/mocks/data/transaction.ts` re-exports from here rather than
 * re-declaring the shape or the status strings, so mocks and production code cannot
 * drift — the same arrangement `src/types/files.ts` has with
 * `src/mocks/data/file-log.ts`.
 *
 * TWO VOCABULARIES BELONG TO THE SERVICE, not to this app: `Status` and
 * `TransactionType`. Both are typed `string` on purpose. A value the app has no
 * wording for is displayed exactly as it arrived — never blanked, never remapped to
 * a known one, never treated as an error (epic brief §Notes & Caveats, a
 * user-confirmed decision at INTAKE: do not reintroduce a hardcoded enum check).
 */

/**
 * `TransactionRead` — one imported expense payment request, as
 * `GET /v1/transactions` returns it.
 *
 * Every field below is required because the request list and its detail surface
 * read all of them, except `UserNote`, which only a rejected request carries.
 */
export interface TransactionRead {
  Id: number;
  /** The file this request was imported from. */
  FileLogId: number;
  FileName: string;
  /** The request's primary identifier, and how a row is recognised on screen. */
  Reference: string;
  /**
   * The date the service wrote, as a string. Rendered as received: the format is
   * an unverified assumption for this epic (brief §Notes & Caveats), so
   * normalising it here would hide a real formatting difference rather than
   * surface it.
   */
  TransactionDate: string;
  /**
   * The full account number. NEVER rendered whole: every list surface shows only
   * its last four digits (POPIA — project.md §Compliance), and the full value is
   * revealed by an explicit action on a single request.
   */
  AccountNumber: string;
  Description: string;
  Amount: number;
  /**
   * Money in or money out. Typed `string`, deliberately NOT narrowed: the service
   * owns the accepted set (the sample file uses `C` / `D` while the contract's own
   * example spells `Debit` out), so the app translates the codes it knows and
   * shows anything else verbatim.
   */
  TransactionType: string;
  /** Three-letter currency code, e.g. `ZAR`. */
  Currency: string;
  /**
   * Where the request stands. Typed `string`, deliberately NOT narrowed to
   * {@link TransactionStatus}: the contract declares a free-form string, and an
   * unrecognised value must be displayed as received. Use
   * {@link isKnownTransactionStatus} to branch on the three known values.
   */
  Status: string;
  /** Populated on a rejected request; read-only wherever it appears. */
  UserNote?: string;
  LastChangedUser: string;
  LastChangedDate: string;
}

/** `TransactionReadList` — the body of `GET /v1/transactions`. */
export interface TransactionReadList {
  Transactions: TransactionRead[];
}

/**
 * The three `Status` values this application recognises
 * (`documentation/requirements-application.md` §7 → Shape: Transaction, Enums;
 * epic brief §Data Model). Spelling and casing are the contract's own.
 *
 * "Cancelled" is deliberately absent: it is a FILE-level state (a cancelled file's
 * requests never reach this list), which is why the shared status badge keeps a
 * neutral intent available without any transaction status exercising it.
 */
export const TRANSACTION_STATUS_IMPORTED = 'Imported';
export const TRANSACTION_STATUS_APPROVED = 'Approved';
export const TRANSACTION_STATUS_REJECTED = 'Rejected';

/** Every recognised status, in lifecycle order. */
export const TRANSACTION_STATUSES = [
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_REJECTED,
] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/**
 * Whether a `Status` string is one of the three recognised values.
 *
 * The contract permits any string, so this is a genuine runtime question: a value
 * outside the three is passed through to the user untranslated (never hidden,
 * never coerced to a default), so an unexpected backend status stays visible.
 */
export const isKnownTransactionStatus = (
  status: string,
): status is TransactionStatus =>
  (TRANSACTION_STATUSES as readonly string[]).includes(status);
