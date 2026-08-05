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
 *   is not applied, so it contributes no entry — it is reported beside the controls
 *   instead.
 * - **Clear all is offered whenever anything is applied**, not only once the narrowing
 *   has emptied the list: R18 is about restoring the whole set from an ordinary narrowed
 *   list as much as from an empty one. It is the only reset on the screen, so there is
 *   never a second one to disagree with it.
 * - **The `<ul>` keeps its list role explicitly.** The stylesheet removes the bullets,
 *   and a list with `list-style: none` stops being announced as a list in some browsers.
 */

import { Badge } from '@/components/ui/badge';
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
      className="bg-muted/40 grid gap-3 rounded-md border p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={HEADING_ID} className="text-sm font-medium">
          {HEADING}
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={onClearAll}>
          {CLEAR_ALL_LABEL}
        </Button>
      </div>
      <ul role="list" className="flex flex-wrap gap-2">
        {applied.map((narrowing) => (
          <li key={narrowing.id}>
            <Badge variant="secondary" className="whitespace-normal">
              <span className="text-muted-foreground">{narrowing.field}:</span>
              <span>{narrowing.value}</span>
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
