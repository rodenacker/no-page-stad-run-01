/**
 * What the user is told before a submitted file is deleted, and the counting that
 * wording rests on (`file-deletion` R6, R7, R8, BR3, BR4, BR5).
 *
 * It lives here rather than inside a component because the SAME confirmation is
 * opened from two surfaces — the file's own page (`SubmittedFileActions`) and a row
 * of the Expense files list (`SubmittedFilesList`) — and they must read identically.
 * A second wording built for the second surface, however plausible, is the way this
 * goes wrong.
 *
 * Five things here are deliberate and easy to break:
 *
 * - **THERE ARE THREE STATES, NEVER TWO.** A file that has IMPORTED gets the real
 *   numbers ({@link importedConfirmationMessage}); a file in any other status gets
 *   the short warning ({@link NEVER_IMPORTED_MESSAGE}) and its requests are never
 *   read at all; and an imported file whose count could NOT be read gets its own
 *   state ({@link countUnavailableMessage}). Which one applies is decided from the
 *   file's `CurrentStatus` as the service reported it (BR3) — never inferred from
 *   any other signal.
 * - **A FAILED COUNT IS NEVER A ZERO AND NEVER THE SHORT WORDING** (BR5). Both would
 *   describe a file as harmless to delete when it may hold dozens of requests an
 *   Approver has already decided. The failed state says plainly that the count could
 *   not be read, carries the SERVICE's own reason for that, and still warns that
 *   already-decided requests may go with the file. A genuine none
 *   ({@link importedConfirmationMessage} for zero) has to stay tellable apart from
 *   it, which is why the two sentences share no wording.
 * - **THE COUNT IS THE SERVICE'S TRANSACTION ROWS, NOT THE FILE'S `RecordCount`**
 *   (BR4). `GET /v1/transactions` takes no query parameters, so the whole set is
 *   read and narrowed on `FileLogId` in the browser — the project's established
 *   convention. `RecordCount` is the file's own self-reported figure and can
 *   disagree with the rows the service actually holds.
 * - **`RequestCounts` IS DECLARED HERE.** The shared mock factory
 *   (`src/mocks/data/transaction.ts`) counts into a structurally identical object,
 *   but production owns its own type: `src/lib` never imports from `src/mocks`.
 * - **Each state is ONE sentence-run, not a stack of paragraphs**, because the shared
 *   `ConfirmAction`'s description is a single string.
 */
import { fetchTransactions } from '@/lib/api/transactions';
import { FILE_STATUS_IMPORTED } from '@/types/files';
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_REJECTED,
} from '@/types/transactions';

import type { FileLog } from '@/types/files';
import type {
  TransactionRead,
  TransactionReadList,
} from '@/types/transactions';

/**
 * The three controls' own wording, reserved across BOTH surfaces this confirmation
 * is reached from.
 *
 * They are deliberately all different, so no query — and no user — can mistake the
 * control that ASKS for the one that DOES it or the one that backs out. None of them
 * may read "Cancel" (R4): beside a destructive choice called Delete, "Cancel" would
 * read as a second name for the action rather than the way out of it.
 */
export const DELETE_FILE_LABEL = 'Delete file';
export const CONFIRM_DELETE_LABEL = 'Delete the file';
export const KEEP_FILE_LABEL = 'Keep the file';

/** The confirmation names the file it is about — nothing vague like "this file". */
export const deleteConfirmationTitleFor = (file: FileLog): string =>
  `Delete ${file.CurrentFileName}?`;

/**
 * The R7 wording: a file that never imported has produced no expense payment
 * requests, so what is lost is the file and its rows. No counts, and nothing is read
 * to write it.
 */
export const NEVER_IMPORTED_MESSAGE =
  'The file and all of its rows are removed, and none of them will become expense payment requests. This cannot be undone — you would have to submit the file again.';

/** What the user is told WHILE an imported file's requests are being counted. */
export const COUNTING_REQUESTS_MESSAGE =
  'Counting the expense payment requests this file produced…';

/**
 * The R8/BR5 state: the count could not be read.
 *
 * It never softens into the short wording and never states a number, because no
 * number was received — but it does say what may be at stake, since an imported
 * file's requests may already carry an Approver's decision.
 */
export const COUNT_UNAVAILABLE_MESSAGE =
  'The expense payment requests this file produced could not be counted, so there is no telling how many would go with it. Some may already have been approved or rejected, and deleting the file destroys them and the record of who decided them. This cannot be undone.';

/**
 * That state WITH the service's own reason for the failed read appended
 * (project.md NFR-base-5) — never the client's internal placeholder, which
 * `transactionListFailureMessage` already filters out.
 */
export const countUnavailableMessage = (reason: string): string =>
  `${COUNT_UNAVAILABLE_MESSAGE} ${reason}`;

/** One file's request counts, as the confirmation states them. */
export interface RequestCounts {
  /** Every request the file produced. */
  total: number;
  approved: number;
  rejected: number;
  /** `approved + rejected` — the "record of who decided them" number (R6). */
  decided: number;
}

/** "40 expense payment requests", or one of them. */
const requestsPhrase = (total: number): string =>
  `${String(total)} expense payment request${total === 1 ? '' : 's'}`;

/** What deleting takes with it, as a phrase that reads for one request or forty. */
const allOfThem = (total: number): string =>
  total === 1 ? 'it' : `all ${String(total)} of them`;

/** How many have already been decided, said only about the outcomes present. */
const decidedSentence = ({ approved, rejected }: RequestCounts): string => {
  const have = (count: number): string => (count === 1 ? 'has' : 'have');
  if (approved > 0 && rejected > 0) {
    return `${String(approved)} of them ${have(approved)} already been approved and ${String(rejected)} rejected.`;
  }
  if (approved > 0) {
    return `${String(approved)} of them ${have(approved)} already been approved.`;
  }
  return `${String(rejected)} of them ${have(rejected)} already been rejected.`;
};

/**
 * The R6 wording for an imported file, built from the numbers actually counted —
 * including the case where the file genuinely produced NONE, which must be stated as
 * none and must never read like the count could not be read.
 */
export const importedConfirmationMessage = (counts: RequestCounts): string => {
  if (counts.total === 0) {
    return 'This file produced no expense payment requests at all. Deleting it removes the file and its rows, and cannot be undone.';
  }
  const produced = `This file produced ${requestsPhrase(counts.total)}.`;
  if (counts.decided === 0) {
    return `${produced} None of them have been approved or rejected yet. Deleting the file removes ${allOfThem(counts.total)}, and cannot be undone.`;
  }
  return `${produced} ${decidedSentence(counts)} Deleting the file removes ${allOfThem(counts.total)} and the record of who decided the ${String(counts.decided)} already decided. This cannot be undone.`;
};

/**
 * Whether this file could have produced expense payment requests at all (BR3) — the
 * one condition that decides between the counted confirmation and the short one.
 * Read from the status the service reported, as-is.
 */
export const mayHaveProducedRequests = (file: FileLog): boolean =>
  file.CurrentStatus === FILE_STATUS_IMPORTED;

/**
 * One file's requests, out of every request in the system (BR4).
 *
 * The narrowing is the browser's job because `GET /v1/transactions` accepts no
 * query parameters — there is no server-side way to ask for one file's rows.
 */
export const requestsProducedBy = (
  fileId: number,
  requests: readonly TransactionRead[],
): TransactionRead[] =>
  requests.filter((request) => request.FileLogId === fileId);

/** The three numbers the confirmation states, counted from the rows themselves. */
export const countRequests = (
  requests: readonly TransactionRead[],
): RequestCounts => {
  const approved = requests.filter(
    (request) => request.Status === TRANSACTION_STATUS_APPROVED,
  ).length;
  const rejected = requests.filter(
    (request) => request.Status === TRANSACTION_STATUS_REJECTED,
  ).length;
  return {
    total: requests.length,
    approved,
    rejected,
    decided: approved + rejected,
  };
};

/**
 * The rows a read answered with, or `undefined` where the body carried NO READABLE
 * LIST AT ALL.
 *
 * That distinction is the whole point, and it is the opposite of the tolerance the
 * list surfaces use (`filesIn` in `SubmittedFilesList`, where an absent array is a
 * legitimately empty list). Here an absent array is not an answer: the shared client
 * resolves with `undefined` for a 204 and for a response it could not parse
 * (`lib/api/client.ts`), so treating "no array" as "no rows" would turn a count that
 * was never actually read into a confident zero — and a zero here reads as "this file
 * produced no expense payment requests at all", the most reassuring sentence the
 * confirmation can say, immediately before an irreversible delete that may destroy
 * live requests and the record of who decided them. A count that was not read is the
 * `unavailable` state (BR5), never a number.
 */
const requestsIn = (
  body: TransactionReadList | undefined,
): TransactionRead[] | undefined =>
  Array.isArray(body?.Transactions) ? body.Transactions : undefined;

/**
 * How many requests one file produced, and how many are already decided — or
 * `undefined` where the read ANSWERED but carried no readable list, which is a failed
 * count and not a zero (BR5).
 *
 * Rejects with whatever the read rejected with, so the caller can report the
 * service's own reason — a failure here is a STATE the user is told about (R8/BR5),
 * never a zero and never a silently swallowed count. The unreadable-body case is
 * reported as that same state by the caller rather than rejected with an invented
 * error, because anything carrying a `message` would be shown to the user as though
 * the SERVICE had said it (`serviceMessageOf`, project.md NFR-base-5).
 */
export const fetchRequestCountsFor = (
  fileId: number,
): Promise<RequestCounts | undefined> =>
  fetchTransactions().then((body) => {
    const requests = requestsIn(body);
    return requests === undefined
      ? undefined
      : countRequests(requestsProducedBy(fileId, requests));
  });

/** Where the count for one confirmation has got to. */
export type RequestCountState =
  /** This file never imported, so there is nothing to count (R7). */
  | { phase: 'not-counted' }
  | { phase: 'counting' }
  | { phase: 'counted'; counts: RequestCounts }
  /** The read was attempted and refused — its own state, never a zero (BR5). */
  | { phase: 'unavailable'; reason: string };

export const NOT_COUNTED: RequestCountState = { phase: 'not-counted' };
export const COUNTING: RequestCountState = { phase: 'counting' };

/**
 * The state the confirmation is REALLY in, read against what the service says about
 * the file NOW — never the status it was in when the delete was asked for.
 *
 * Both surfaces re-read the file list while any file is still being processed, so a
 * file can IMPORT while its confirmation is on screen. Deriving the state here rather
 * than freezing it at the ask is what stops the short "none of them will become
 * expense payment requests" wording surviving that moment for a file whose rows are
 * now live expense payment requests, some of them possibly already decided (BR5 — the
 * same understatement the failed-count state exists to prevent, arriving by a
 * different route).
 *
 * A file that has BECOME countable and has no count yet is therefore counting: the
 * read is owed, and the caller starts it from this same derivation, so the wording on
 * screen and the read in flight cannot disagree. Every other state is whatever was
 * actually read — a count already taken still names real requests, whatever the file's
 * status does afterwards.
 */
export const countStateFor = (
  file: FileLog,
  counted: RequestCountState,
): RequestCountState =>
  mayHaveProducedRequests(file) && counted.phase === 'not-counted'
    ? COUNTING
    : counted;

/** What the confirmation says, for whichever of the three states applies. */
export const deleteConfirmationMessageFor = (
  count: RequestCountState,
): string => {
  switch (count.phase) {
    case 'not-counted':
      return NEVER_IMPORTED_MESSAGE;
    case 'counting':
      return COUNTING_REQUESTS_MESSAGE;
    case 'counted':
      return importedConfirmationMessage(count.counts);
    case 'unavailable':
      return countUnavailableMessage(count.reason);
  }
};
