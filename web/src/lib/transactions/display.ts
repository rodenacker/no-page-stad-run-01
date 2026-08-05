/**
 * How an expense payment request's values read on screen.
 *
 * Two of them are not printed as they arrived, and both rules are stated here — once
 * — because every surface of this list has to apply the same one: the request list
 * itself, the narrowing controls that offer the values present in the fetched set,
 * and the request's own detail.
 *
 * Everything else about a request IS printed exactly as the service sent it (the
 * date, the amount, the description, the status text), so there is nothing here for
 * those: a formatter would be the bug.
 */

/**
 * The two `TransactionType` codes this app has wording for — the sample file's
 * single-letter convention (`documentation/transactions_2026-04-15.csv`).
 *
 * This is NOT an accepted-value list. The service owns the accepted set: the
 * contract's own example spells `Debit` out where the sample file writes `D`, which
 * is precisely why the frontend translates what it recognises and passes everything
 * else through untouched (epic brief §Notes & Caveats — a user-confirmed decision at
 * INTAKE; do not turn this into validation).
 */
export const TRANSACTION_TYPE_CREDIT = 'C';
export const TRANSACTION_TYPE_DEBIT = 'D';

/** Plain language for the codes above, in the user's terms rather than the file's. */
const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  [TRANSACTION_TYPE_CREDIT]: 'Credit — money in',
  [TRANSACTION_TYPE_DEBIT]: 'Debit — money out',
};

/**
 * A transaction type as the user reads it: plain language where the app has wording
 * for the value, and the service's own value verbatim where it does not. An
 * unrecognised value is a legitimate value, never an error.
 */
export const transactionTypeLabel = (transactionType: string): string =>
  TRANSACTION_TYPE_LABELS[transactionType] ?? transactionType;

/**
 * The last four digits of an account number — the only part of it any list surface
 * may show (POPIA, project.md §Compliance). Empty when the value carries no digits
 * at all.
 */
export const lastFourDigitsOf = (accountNumber: string): string =>
  accountNumber.replace(/\D/g, '').slice(-4);
