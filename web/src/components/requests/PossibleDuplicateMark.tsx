/**
 * The mark a request carries when another request in the same load shares its account
 * number, amount and transaction date (brief R8, BR2/BR3).
 *
 * Three things here are deliberate and easy to break:
 *
 * - **It is WORDING paired with a shape and an intent colour, never colour alone** (R8,
 *   R14, WCAG 2.2 AA) — so it is readable in the list itself, without opening the request
 *   and without seeing the colour at all. It is the shared `StatusBadge`, which owns the
 *   intents, their `globals.css` tokens and the shape each is drawn as: `attention` is the
 *   `--warning` one, marked with the doubled bar, because a possible duplicate is
 *   something the reader has to look at rather than something that has gone well or been
 *   refused — and it reads in the same notation as a status because it sits beside one.
 * - **One implementation, both presentations.** The desktop row and the phone-width
 *   line-group render this same component, so the mark cannot end up worded or coloured
 *   one way in the table and another way at narrow width.
 * - **Exactly one element carries the wording.** No screen-reader-only second copy: the
 *   visible text IS the accessible text, and duplicating it would have a screen reader
 *   say the same phrase twice for one request.
 *
 * It marks; it decides nothing. Nothing about a possible duplicate is acted on in this
 * epic — the request is still read-only (BR1).
 */
import { StatusBadge } from '@/components/status/StatusBadge';
import { POSSIBLE_DUPLICATE_MARK } from '@/lib/transactions/duplicates';

import type { StatusPresentation } from '@/components/status/StatusBadge';

/**
 * What the mark means, in the shared mark's vocabulary: something for the reader to
 * attend to. The shape that says so is the shared component's, not this file's.
 */
const PRESENTATION: StatusPresentation = { intent: 'attention' };

export function PossibleDuplicateMark() {
  return (
    <StatusBadge status={POSSIBLE_DUPLICATE_MARK} presentation={PRESENTATION} />
  );
}
