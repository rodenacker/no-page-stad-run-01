/**
 * The mark a request carries while a decision on it is waiting to be confirmed — this
 * user's own, single or part of a selection (`request-list-redesign` R17, BR7/BR3).
 *
 * It is the half of R17 that a confirmation dialog cannot satisfy. A dialog that merely
 * DESCRIBES what is about to happen is not the batch showing the reader what it will look
 * like afterwards; the affected rows have to say so themselves, on the screen, beside the
 * control block's own unbalanced figures.
 *
 * Three things here are deliberate and easy to break:
 *
 * - **It is WORDS, not a shape in the gutter** (BR3/R3). The two-character gutter may well
 *   be where the eye finds an affected row, but a mark with no accompanying text anywhere on
 *   the row does not satisfy R3 on its own — and on these rows the gutter is usually already
 *   carrying the selection tick that put the decision in flight. So the wording sits beside
 *   the status, where every other row-level mark on this listing is read.
 * - **It is the shared `StatusBadge` grammar**, not a mark of its own: wording paired with a
 *   shape and an intent colour, in the same tracked notation as the status beside it. The
 *   intent is `attention` — the one whose whole job is "look at this now" — because the row
 *   is not in a new state, it is a row the reader is being asked about. What tells it apart
 *   from `PossibleDuplicateMark`, which shares that intent, is its WORDS: two marks on one
 *   row are two phrases, never two colours.
 * - **The phrase is stated once, in `lib/transactions/controlTotals.ts`**, because the
 *   control block labels its own gap with the very same words. If the row and the band ever
 *   said this differently, the reader would have two answers to what has not happened yet.
 *
 * It marks; it decides nothing, and it never appears on its own initiative — the list
 * renders it for exactly the requests a confirmation it opened is still standing over, so
 * backing out takes every one of them off the screen (AC-3).
 */
import { StatusBadge } from '@/components/status/StatusBadge';
import { NOT_YET_CONFIRMED } from '@/lib/transactions/controlTotals';

import type { StatusPresentation } from '@/components/status/StatusBadge';

/**
 * What the mark means, in the shared mark's vocabulary: something for the reader to attend
 * to right now. The shape that says so is the shared component's, not this file's.
 */
const PRESENTATION: StatusPresentation = { intent: 'attention' };

export function NotYetConfirmedMark() {
  return <StatusBadge status={NOT_YET_CONFIRMED} presentation={PRESENTATION} />;
}
