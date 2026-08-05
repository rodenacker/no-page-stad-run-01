/**
 * The mark a request carries when another request in the same load shares its account
 * number, amount and transaction date (brief R8, BR2/BR3).
 *
 * Three things here are deliberate and easy to break:
 *
 * - **It is WORDING paired with an intent colour, never colour alone** (R8, R14, WCAG
 *   2.2 AA) — so it is readable in the list itself, without opening the request and
 *   without seeing the colour at all. It is the shared `StatusBadge`, which owns the
 *   intents and their `globals.css` tokens: `attention` is the `--warning` one, because
 *   a possible duplicate is something the reader has to look at rather than something
 *   that has gone well or been refused.
 * - **One implementation, both presentations.** The desktop row and the phone-width card
 *   render this same component, so the mark cannot end up worded or coloured one way in
 *   the table and another way on a card.
 * - **Exactly one element carries the wording.** No screen-reader-only second copy: the
 *   visible text IS the accessible text, and duplicating it would have a screen reader
 *   say the same phrase twice for one request.
 *
 * It marks; it decides nothing. Nothing about a possible duplicate is acted on in this
 * epic — the request is still read-only (BR1).
 */
import { Copy } from 'lucide-react';

import { StatusBadge } from '@/components/status/StatusBadge';
import { POSSIBLE_DUPLICATE_MARK } from '@/lib/transactions/duplicates';

import type { StatusPresentation } from '@/components/status/StatusBadge';

/**
 * What the mark means, in the shared badge's vocabulary: something for the reader to
 * attend to, beside an icon of one thing copied onto another.
 */
const PRESENTATION: StatusPresentation = { intent: 'attention', icon: Copy };

export function PossibleDuplicateMark() {
  return (
    <StatusBadge status={POSSIBLE_DUPLICATE_MARK} presentation={PRESENTATION} />
  );
}
