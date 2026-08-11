/**
 * Keeping the expense request list current while somebody has it open
 * (`bulk-approval-and-live-refresh` R3, BR6/BR8, NFR2/NFR5).
 *
 * The transactions service offers no delta channel, no websocket and no single-request
 * read, so "the list keeps itself current" is the SAME `GET /v1/transactions` on a
 * timer — the whole set, every time. Everything in this module exists because of that
 * one fact:
 *
 * - **The cadence is stated once, here** (BR6). Fifteen seconds keeps the list honest
 *   for up to three simultaneous approvers without re-fetching a set that may run to
 *   10,000 rows every couple of seconds. It is deliberately not injectable and not
 *   shortened for tests: an interval a test can move is an interval nobody has to meet.
 * - **A fresh read is MERGED over the one on screen, not swapped for it** (BR8/NFR5).
 *   Every request the read describes exactly as it already stood keeps the OBJECT the
 *   previous read produced, so the memoised rows and cards hold and a poll re-renders
 *   only the requests that actually moved. Without that, a 15-second timer would
 *   re-render every row on the screen — at the volume ceiling, four times a minute,
 *   for nothing. When a read changes nothing at all the SAME array comes back, so the
 *   narrowing, the ordering, the paging and the duplicate marks are not recomputed
 *   either and the screen does not re-render at all.
 * - **How much moved is counted, not guessed** (NFR2). A request that arrived, changed
 *   or left is one change; that count is what the screen announces politely, and a
 *   count of nothing is what makes silence the right answer.
 *
 * Nothing here reads or writes anything: the read itself is `lib/api/transactions.ts`,
 * and the timer belongs to the screen that holds the rows.
 */

import type { TransactionRead } from '@/types/transactions';

/**
 * How often a list somebody is reading asks the service again (BR6).
 *
 * Long enough that a screen left open all afternoon is not a load on a service handing
 * back the whole set each time, short enough that a colleague's decision is news rather
 * than history. A tunable default, per the brief — but a real duration, in the app, the
 * same one in every environment.
 */
export const LIST_REFRESH_INTERVAL_MS = 15_000;

/**
 * Whether two reads describe one request in exactly the same state.
 *
 * Compared field by field over the properties the service actually sent, rather than
 * against a list of names spelled out here: `UserNote` is present only on a rejected
 * request, and a field a later contract adds would otherwise be silently exempt from
 * the comparison — which would show as a request that never appears to change.
 */
const sameRequest = (
  held: TransactionRead,
  incoming: TransactionRead,
): boolean => {
  const fields = Object.keys(held) as (keyof TransactionRead)[];
  return (
    fields.length === Object.keys(incoming).length &&
    fields.every((field) => held[field] === incoming[field])
  );
};

/** What a fresh read leaves the screen holding, and how much of it moved. */
export interface RefreshedList {
  /**
   * The set to put on screen: the read that just came back, holding the previous
   * read's own objects wherever a request is unchanged — and the previous ARRAY
   * itself when nothing changed at all.
   */
  requests: TransactionRead[];
  /**
   * How many requests arrived, changed or left. Zero means the two reads describe the
   * same list, which is the common case and the one that must cost nothing.
   */
  changed: number;
}

/**
 * A fresh read merged over the requests already on screen.
 *
 * Order is the incoming read's, in full: this never reorders, never appends and never
 * keeps a request the service has stopped listing — it only avoids replacing objects
 * that would render identically (see this module's header).
 */
export const refreshedList = (
  onScreen: TransactionRead[],
  incoming: TransactionRead[],
): RefreshedList => {
  const held = new Map(onScreen.map((request) => [request.Id, request]));

  let changed = 0;
  const requests = incoming.map((request) => {
    const previous = held.get(request.Id);
    if (previous !== undefined && sameRequest(previous, request)) {
      return previous;
    }
    changed += 1;
    return request;
  });

  const stillListed = new Set(incoming.map((request) => request.Id));
  changed += onScreen.filter((request) => !stillListed.has(request.Id)).length;

  return { requests: changed === 0 ? onScreen : requests, changed };
};

/**
 * What the screen says, quietly, when a refresh has brought somebody else's work in
 * (NFR2 — polite, never assertive, never anything to dismiss).
 *
 * It counts every change SINCE THE READER OPENED THE LIST rather than the last poll's
 * alone, for a reason that is about assistive technology rather than about arithmetic:
 * a live region announces its CONTENTS CHANGING, so two consecutive refreshes that each
 * moved one request would write the identical sentence twice and the second would never
 * be spoken. A running total always differs from the one before it.
 *
 * "Elsewhere" is exact, not a hedge: a change the reader made themselves is already on
 * screen — their own re-read put it there — by the time a poll could notice it.
 */
export const listRefreshedMessage = (changes: number): string =>
  changes === 1
    ? 'The list has caught up with 1 change made elsewhere.'
    : `The list has caught up with ${String(changes)} changes made elsewhere.`;
