'use client';

/**
 * What is currently narrowing the expense request list, and the one way out of all of it
 * (brief R3/R7/R18).
 *
 * Three things here are deliberate:
 *
 * - **One item per active narrowing**, from a list handed in rather than from a fixed
 *   set of chips. That is how the amount and transaction-date ranges appear here at all:
 *   `appliedNarrowings()` states them as entries like "100 to 200", and nothing in this
 *   component knows a range from a pick-one filter. A range entered the wrong way round
 *   is not applied, so it contributes no entry — it is reported inside the narrowing strip
 *   instead.
 * - **Clear all is offered whenever anything is applied**, not only once the narrowing
 *   has emptied the list: R18 is about restoring the whole set from an ordinary narrowed
 *   list as much as from an empty one. It is the only reset on the screen, so there is
 *   never a second one to disagree with it.
 * - **The `<ul>` keeps its list role explicitly.** The stylesheet removes the bullets,
 *   and a list with `list-style: none` stops being announced as a list in some browsers.
 *
 * It reads in the narrowing strip's own notation (`request-list-redesign` R12): a ruled
 * line of tracked micro-labels over the values they name, in place of the boxed panel of
 * pills it used to be — the strip it belongs to has no boxes left for it to match.
 */

import { FIELD_LABEL_CLASS } from '@/components/requests/fieldNotation';
import { Button } from '@/components/ui/button';

import type { AppliedNarrowing } from '@/lib/transactions/narrowing';

/** Names the region, so it is reachable as its own part of the screen. */
const HEADING = 'What is currently applied';
const HEADING_ID = 'expense-request-narrowing-summary-heading';

/** The one action that removes the search term and every filter at once. */
const CLEAR_ALL_LABEL = 'Clear all';

interface AppliedNarrowingSummaryProps {
  /** One entry per narrowing currently applied; never rendered empty. */
  applied: AppliedNarrowing[];
  onClearAll: () => void;
}

export function AppliedNarrowingSummary({
  applied,
  onClearAll,
}: AppliedNarrowingSummaryProps) {
  return (
    <section
      aria-labelledby={HEADING_ID}
      className="border-input -mx-4 grid gap-2 border-b px-4 pb-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2
          id={HEADING_ID}
          className={`${FIELD_LABEL_CLASS} text-muted-foreground`}
        >
          {HEADING}
        </h2>
        {/* The way out of all of it, in the strip's notation rather than as a boxed
            button: ruled text, so it reads as part of the same document. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`${FIELD_LABEL_CLASS} border-input h-auto rounded-none border-b px-1 py-0.5`}
          onClick={onClearAll}
        >
          {CLEAR_ALL_LABEL}
        </Button>
      </div>
      <ul role="list" className="flex flex-wrap gap-x-8 gap-y-1">
        {applied.map((narrowing) => (
          <li
            key={narrowing.id}
            className="flex flex-wrap items-baseline gap-x-2 text-sm"
          >
            <span className={`${FIELD_LABEL_CLASS} text-muted-foreground`}>
              {narrowing.field}
            </span>
            <span className="font-mono">{narrowing.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
