/**
 * Which expense requests are possible duplicates of one another (brief R4/R8,
 * BR2/BR3, §Derived: Duplicate Flag).
 *
 * The flag does not exist in the API response and there is no endpoint that answers
 * it: it is derived in the browser, over the ONE set `GET /v1/transactions` returned.
 * It lives away from the screen for the same reason the narrowing and the ordering do
 * — the list, its notification and any later surface that mentions duplicates must all
 * mean the same thing by it.
 *
 * Four things here are deliberate and easy to break:
 *
 * - **The key is `AccountNumber` + `Amount` + `TransactionDate`, exactly as the
 *   service wrote them** (BR3). Nothing is trimmed, rounded, re-cased or reformatted —
 *   `TransactionDate` in particular is compared verbatim, because its format is an
 *   unverified assumption for this epic (brief §Notes & Caveats) and normalising on
 *   speculation would hide a real difference rather than surface it.
 * - **BOTH matching requests are flagged** (BR2), not just the later one, with no
 *   regard to which file either came from — a re-imported row and the row it repeats
 *   are equally worth a second look, and the reader is deciding between them.
 * - **Rejected requests are outside the comparison set** (BR3). A rejected request is
 *   never flagged AND never causes the request it matches to be flagged: re-submitting
 *   something that was refused is the normal way to correct it, so flagging the
 *   correction would flag every corrected request in the system. It stays LISTED — the
 *   exclusion is from the comparison, not from the screen.
 * - **Cancelled files' rows are NOT excluded here.** BR3 excludes them too, but this
 *   epic's stated assumption is that `GET /v1/transactions` never returns them at all
 *   (brief §Notes & Caveats, carried in the manual-test ledger). A speculative
 *   `FileLogId` exclusion would need the file list this module cannot see, and would
 *   quietly bury the assumption instead of letting a human confirm it.
 *
 * Everything below is computed ONCE per load over the WHOLE fetched set. Comparing
 * only the requests currently on screen would make the flag depend on the search term,
 * the filters, the ordering and the page — two matching requests on different pages
 * would each look unique (story AC-5).
 */
import { TRANSACTION_STATUS_REJECTED } from '@/types/transactions';

import type { TransactionRead } from '@/types/transactions';

/**
 * The wording the mark carries wherever it is shown. Stated once, so the row, the card
 * and the Approver's notification cannot describe the same thing differently.
 */
export const POSSIBLE_DUPLICATE_MARK = 'Possible duplicate';

/**
 * The duplicate key (BR3) as one comparable value. `JSON.stringify` rather than a
 * joined string: it keeps the three values separated whatever they contain, and it
 * keeps a number distinct from the same digits as text, so "as the service wrote them"
 * survives the comparison.
 */
const duplicateKeyOf = (request: TransactionRead): string =>
  JSON.stringify([
    request.AccountNumber,
    request.Amount,
    request.TransactionDate,
  ]);

/**
 * Whether a request takes part in the comparison at all (BR3).
 *
 * Only the rejected exclusion is applied — see this module's header for why a
 * cancelled-file exclusion is deliberately absent. An APPROVED request stays in: BR3
 * excludes exactly two kinds of row, and a request already approved is still a payment
 * that a newly imported twin would repeat.
 */
const isInComparisonSet = (request: TransactionRead): boolean =>
  request.Status !== TRANSACTION_STATUS_REJECTED;

/**
 * The ids of every request that shares its duplicate key with another request in the
 * same fetched set — both members of each match (BR2).
 *
 * Ids rather than the requests themselves, so the answer can be carried alongside the
 * narrow → order → slice pipeline without reshaping what flows through it: a row is
 * marked because of what the WHOLE set holds, which is a fact about the load rather
 * than about the row.
 */
export const possibleDuplicateIdsIn = (
  requests: TransactionRead[],
): ReadonlySet<number> => {
  const idsByKey = new Map<string, number[]>();

  requests.filter(isInComparisonSet).forEach((request) => {
    const key = duplicateKeyOf(request);
    const sharingThisKey = idsByKey.get(key);
    if (sharingThisKey === undefined) {
      idsByKey.set(key, [request.Id]);
      return;
    }
    sharingThisKey.push(request.Id);
  });

  const marked = new Set<number>();
  idsByKey.forEach((ids) => {
    if (ids.length > 1) {
      ids.forEach((id) => marked.add(id));
    }
  });
  return marked;
};
