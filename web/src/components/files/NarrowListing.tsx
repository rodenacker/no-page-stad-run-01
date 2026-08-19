/**
 * A LISTING AS A PHONE-WIDTH READER RECEIVES IT: the same ruled listing the wide screen
 * draws, tightened to one group of ruled lines per record (`files-view-redesign` R3, source
 * UI-23 — "on a narrow device each record presents its primary identifier, two to three key
 * values and its actions, with no horizontal scrolling of the page").
 *
 * ⚠ **THERE IS NO CARD HERE AND NONE MAY COME BACK.** A box per record is a named anti-goal
 * of this design (BR9): a stack of boxes standing apart on a page is the dashboard treatment
 * the whole redesign replaces. What a narrow reader gets instead is the wide listing's own
 * notation — hairline rules that reach both edges of the page, identifiers and figures in
 * mono, tracked micro-labels — with the columns folded into two or three lines because 360px
 * has no room for eight.
 *
 * It exists as ONE composition because FOUR listings on the two expense-files screens wear
 * it (the register, the import preview, the rejected rows, the processing history), and the
 * epic forbids a second dialect of one design (R9/BR6): four hand-built `ul`/`li`
 * arrangements is how the rule under one of them, or the gap between two labels, quietly
 * stops matching the rest. Every class it spends is IMPORTED from
 * `components/requests/fieldNotation.ts` — it declares no notation of its own.
 *
 * Five things here are deliberate and easy to break:
 *
 * - **It is a DIFFERENT presentation, not a re-flowed table.** Each listing renders this or
 *   its table, never both (`lib/layout/useNarrowViewport.ts` reads the one crossover
 *   `lib/layout/viewport.ts` owns). That is the whole point: the Shadcn table primitive
 *   wraps every table in `overflow-x-auto` with `whitespace-nowrap` cells, and a wide table
 *   kept inside a sideways-scrolling wrapper does not satisfy R3 — a contained sideways
 *   scroll is still a sideways scroll. Nothing here may introduce an `overflow-x` box in its
 *   place, and nothing here sets a width or a `nowrap`.
 * - **One list, exactly ONE {@link NarrowRecord} per record.** The list semantics are what
 *   tell a screen reader how many records there are and where each begins — the narrow
 *   equivalent of the table's rows, which is what R3's "still announced as one list of rows"
 *   comes to. A second, nested list inside a group would announce the listing as twice its
 *   length; a stack of plain `div`s would announce nothing at all. The `ul` carries an
 *   explicit `role="list"`, because Tailwind's preflight removes the bullets and a
 *   bulletless list loses its role in some browsers.
 * - **The groups RUN TOGETHER as one ruled sequence** — see `NARROW_RECORD_CLASS`. No gap,
 *   no margin, nothing between one record and the next but the hairline the first closes
 *   with, and the last one's rule is the listing's own closing edge.
 * - **Full-bleed to the layout's padding** (`PAGE_BLEED_CLASS` cancels `<main>`'s `px-4`) so
 *   every rule reaches the edge of the page, with each group putting that padding back
 *   inside so its values line up with the section's own heading above it. Change the
 *   authenticated layout's horizontal padding and this changes with it.
 * - **A label and its value stay STRUCTURALLY PAIRED** ({@link NarrowField}). A line of
 *   labels above a line of values would still show every value while leaving a reader — and
 *   a screen reader — to guess which figure belongs to which word. The label is the same
 *   tracked micro-label the wide listing heads its column with, and each listing passes the
 *   SAME WORDING its column head uses, so the two presentations cannot name one value two
 *   ways.
 */

import {
  LISTING_LABEL_CLASS,
  NARROW_RECORD_CLASS,
  PAGE_BLEED_CLASS,
} from '@/components/requests/fieldNotation';
import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

/**
 * The listing itself: one list, full-bleed, with NO gap between its records.
 *
 * `label` names it, because there is no table caption at this width and a list of records
 * with no name is one a screen-reader user meets without knowing what they are in.
 */
export function NarrowListing({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <ul role="list" aria-label={label} className={PAGE_BLEED_CLASS}>
      {children}
    </ul>
  );
}

/**
 * ONE RECORD'S group of ruled lines — the narrow listing's row.
 *
 * Its lines are laid out as a grid rather than as flow content so the gap between them is
 * stated once here: a record's lines belong to the record, and two surfaces spacing them
 * differently is the drift this module exists to prevent.
 */
export function NarrowRecord({ children }: { children: ReactNode }) {
  return <li className={`${NARROW_RECORD_CLASS} grid gap-2`}>{children}</li>;
}

/**
 * ONE LINE of a record: as many fields as fit, wrapping onto the next line rather than
 * pushing the page sideways (R3), and aligned on their baselines so a tracked micro-label
 * sits on the same line as the value it names.
 */
export function NarrowRecordLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      {children}
    </div>
  );
}

/**
 * ONE FIELD: its own tracked micro-label, then its own value, and the two never separated.
 *
 * The value carries no face of its own — a figure, an identifier and a piece of prose are
 * set differently, and each listing states which of the three this value is by wrapping it
 * in the notation it belongs to.
 *
 * Two things about how it gives way are the requirement rather than taste (R3): the value
 * drops BELOW its own label when the two cannot share a line, and `min-w-0` lets it shrink at
 * all — a flex item defaults to `min-width: auto`, which refuses to go below its content and
 * is exactly how one long value pushes a whole page sideways.
 */
export function NarrowField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={LISTING_LABEL_CLASS}>{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

/**
 * A HEADING OVER A SECTION OF THE LISTING — the import preview's appended reject listing
 * (R14/R15) is the one that needs it.
 *
 * It is an item of the SAME list, exactly as the wide presentation's heading is a row of the
 * same table: a heading standing between two lists would put a visible gutter between the
 * last record above it and the first below, which is precisely what tells a card stack apart
 * from a ruled listing. The room it opens the section with is composed through `cn`, so the
 * record box's own vertical padding cannot survive underneath it.
 */
export function NarrowBlockHeading({
  id,
  children,
}: {
  /** Ties this heading to whatever names itself by it. */
  id?: string;
  children: ReactNode;
}) {
  return (
    <li className={cn(NARROW_RECORD_CLASS, 'pt-8 pb-2')}>
      <h3 id={id} className={LISTING_LABEL_CLASS}>
        {children}
      </h3>
    </li>
  );
}
