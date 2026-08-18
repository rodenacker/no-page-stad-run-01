/**
 * The batch's own control block: where this batch stands, stated before a single row is
 * read (brief R11/R16/R19/R21/R25, BR4 — design brief §3, Sequence step 1 and Focal
 * moment).
 *
 * It replaces the page title. A reader opening the request list is not looking for the
 * name of the screen they just navigated to; they are looking for how much is still
 * outstanding — so the screen opens with the figures and the outstanding count is the
 * largest thing on it, by a wide margin.
 *
 * Six things here are deliberate and easy to break:
 *
 * - **Every figure is DERIVED from the requests the list already holds** — see
 *   `lib/transactions/controlTotals.ts`, which owns the derivation (and the ⚠ about
 *   `countRequests()`). Nothing here fetches, and nothing here counts for itself.
 * - **The figures follow the narrowing, and the whole batch stays beside them** (R21).
 *   While anything is applied, the four totals describe what is LEFT and the whole-batch
 *   record count is kept beside them with a line through it — so the reader can never
 *   forget they are inside a narrowing. With nothing applied that struck-through figure is
 *   ABSENT from the markup, not merely re-valued: there is no narrowing for it to explain.
 * - **`AWAITING DECISION` is the single largest typographic element on the screen**
 *   (BR4/R16): roughly 8:1 against its own 11px tracked label, with no middle tier
 *   invented between the two to soften it. Nothing else in the app — not the wordmark in
 *   the header, not a column head, not `TOTAL VALUE` — comes near it. Shrinking it is not
 *   a styling preference; it is the requirement.
 * - **The field is `--brand-accent`, saturated and full-bleed** (R25, and the epic's
 *   "mono figures must not read cold" NFR). It is the one element holding this screen's
 *   institutional register against the density of the mono figures; a tint or a border in
 *   its place makes the whole listing read as a till receipt. Full-bleed means to the
 *   layout's padding, not past it: `-mx-4` cancels `<main>`'s `px-4` and `-mt-8` its
 *   `py-8`, and the band re-applies `px-4` so its labels line up with the app's name in
 *   the header and with the rows beneath it. If either of those layout values changes,
 *   this changes with it.
 * - **Each figure carries its label as its ACCESSIBLE NAME**, so a screen-reader user
 *   hears "Awaiting decision, 5" rather than a numeral with some text near it, and the
 *   named element carries the figure and nothing else. The visible tracked label is the
 *   name (`aria-labelledby`), so exactly one element on the screen carries the wording.
 * - **⚠ `AWAITING DECISION` is a `<fieldset>` named by its `<legend>`, holding a
 *   `role="status"` figure.** Two facts have to hold at once: the figure is a POLITE LIVE
 *   REGION (it moves with no user action at all when a self-refresh brings in a
 *   colleague's decision, exactly as the ambient selection count does), and the pair is
 *   one named group like the other five. They cannot be the same element — an element has
 *   one role — and the group cannot be named by a second `aria-label`/`aria-labelledby`
 *   carrying the same words, or two elements on the screen would answer to "Awaiting
 *   decision" and neither a reader nor a test could tell which one is the figure. A
 *   `<legend>` names its `<fieldset>` NATIVELY, which resolves both: one element points at
 *   the label, one element carries the count. `aria-label` on the live region is
 *   specifically wrong — it would freeze the region's name over its changing contents.
 */
import { useId, useMemo } from 'react';

import { FIELD_LABEL_CLASS } from '@/components/requests/fieldNotation';
import {
  AWAITING_DECISION_LABEL,
  BATCH_LABEL,
  DECIDED_LABEL,
  RECORDS_LABEL,
  RUN_DATE_LABEL,
  SELECTED_VALUE_LABEL,
  TOTAL_VALUE_LABEL,
  WHOLE_BATCH_RECORDS_LABEL,
  batchNameOf,
  controlTotalsOf,
  figureText,
  runDateOf,
  selectionSubtotalOf,
} from '@/lib/transactions/controlTotals';
import { SELECTION_COUNT_LABEL } from '@/lib/transactions/selecting';

import type { ReactNode } from 'react';

import type { TransactionRead } from '@/types/transactions';

/**
 * What the block itself is called: one named region, so the whole thing is a landmark a
 * reader can reach in one move rather than six figures loose on the page.
 */
export const CONTROL_BLOCK_LABEL = 'Batch control totals';

/**
 * A field's label: the screen's one label notation, shared with the narrowing strip and
 * everything else on it (`components/requests/fieldNotation.ts`) — 11px, tracked,
 * upper-cased in CSS rather than in the DOM.
 *
 * It carries no colour, so here it inherits the band's own: the full foreground, never a
 * dimmed one, because at this size an opacity would drop the label below AA on the
 * saturated field.
 */
const LABEL_CLASS = FIELD_LABEL_CLASS;

/** A field's figure: mono and tabular, so columns of them line up digit for digit. */
const FIGURE_CLASS = 'font-mono text-base tabular-nums';

/**
 * The outstanding count, at display scale — roughly 8:1 against the 11px label above it
 * (R16). See this file's header before changing it.
 */
const OUTSTANDING_FIGURE_CLASS =
  'font-mono text-[88px] leading-none tabular-nums';

/** One label-over-figure pair, with an optional second figure beside the first. */
function ControlFigure({
  label,
  figure,
  beside,
}: {
  label: string;
  figure: string;
  /** Anything stated alongside this figure — the struck-through whole batch (R21). */
  beside?: ReactNode;
}) {
  const labelId = useId();

  return (
    <div className="grid gap-1.5">
      <span id={labelId} className={LABEL_CLASS}>
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        {/* The figure, and only the figure: the label names THIS element, so what a
            screen reader reads out under that name is the value and nothing else. */}
        <span role="group" aria-labelledby={labelId} className={FIGURE_CLASS}>
          {figure}
        </span>
        {beside}
      </div>
    </div>
  );
}

/**
 * The whole batch's record count, kept beside the narrowed figures with a line through it
 * (R21).
 *
 * The name and the line-through are on the SAME element on purpose: a line through a
 * number is invisible to a screen reader, so the element that carries the strike is the
 * one that has to say what it is.
 */
function WholeBatchRecords({ records }: { records: number }) {
  return (
    <span
      role="group"
      aria-label={WHOLE_BATCH_RECORDS_LABEL}
      className={`${FIGURE_CLASS} line-through`}
    >
      {figureText(records)}
    </span>
  );
}

/** The focal figure — see the ⚠ in this file's header for why it is a `<fieldset>`. */
function OutstandingFigure({ awaitingDecision }: { awaitingDecision: number }) {
  const labelId = useId();

  return (
    <fieldset className="m-0 border-0 p-0">
      <legend id={labelId} className={`${LABEL_CLASS} mb-1.5 p-0`}>
        {AWAITING_DECISION_LABEL}
      </legend>
      {/* Polite, and named by the legend above rather than by an `aria-label` that would
          override its own changing contents. Its text is the count and nothing else. */}
      <p
        role="status"
        aria-labelledby={labelId}
        className={OUTSTANDING_FIGURE_CLASS}
      >
        {figureText(awaitingDecision)}
      </p>
    </fieldset>
  );
}

interface BatchControlBlockProps {
  /** The whole fetched set — the batch the block is describing. */
  batch: readonly TransactionRead[];
  /**
   * What the search and filters LEFT, which is what the four totals describe (R21). The
   * same array the rows are drawn from, so the band can never state figures for a set the
   * listing below it is not showing.
   */
  listed: readonly TransactionRead[];
  /**
   * Whether anything is applied at all. It decides one thing: whether the whole-batch
   * record count is kept beside the narrowed figures, struck through.
   */
  narrowed: boolean;
  /**
   * The originating file the narrowing has sharpened to, or `''` for the whole queue —
   * the only narrowing `BATCH` and `RUN DATE` follow (brief §Resolved spec gap).
   */
  narrowedToFile: string;
  /** What is selected, by id: the money about to be committed (R19). */
  selectedIds: ReadonlySet<number>;
}

export function BatchControlBlock({
  batch,
  listed,
  narrowed,
  narrowedToFile,
  selectedIds,
}: BatchControlBlockProps) {
  /**
   * Memoised on the arrays the list already memoises, so a keystroke that leaves the
   * narrowed set alone re-derives nothing — the band re-renders with the list, and it
   * counts a set that can run to the 10,000-request ceiling.
   */
  const totals = useMemo(() => controlTotalsOf(listed), [listed]);
  const runDate = useMemo(
    () => runDateOf(batch, narrowedToFile),
    [batch, narrowedToFile],
  );
  const selection = useMemo(
    () => selectionSubtotalOf(batch, selectedIds),
    [batch, selectedIds],
  );

  return (
    <section
      aria-label={CONTROL_BLOCK_LABEL}
      className="bg-brand-accent text-brand-accent-foreground -mx-4 -mt-8 px-4 py-6"
    >
      {/* One line of fields, all figures sitting on the same bottom edge, so the scale
          contrast between the outstanding count and everything else is what carries the
          hierarchy (R16). It wraps onto further lines rather than scrolling sideways. */}
      <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
        <ControlFigure
          label={BATCH_LABEL}
          figure={batchNameOf(narrowedToFile)}
        />
        <ControlFigure label={RUN_DATE_LABEL} figure={runDate} />
        <ControlFigure
          label={RECORDS_LABEL}
          figure={figureText(totals.records)}
          beside={
            narrowed ? <WholeBatchRecords records={batch.length} /> : undefined
          }
        />
        <OutstandingFigure awaitingDecision={totals.awaitingDecision} />
        <ControlFigure
          label={DECIDED_LABEL}
          figure={figureText(totals.decided)}
        />
        <ControlFigure
          label={TOTAL_VALUE_LABEL}
          figure={figureText(totals.totalValue)}
        />

        {/* What is about to be committed, beside the batch total and never instead of it
            (R19) — and absent from the markup entirely while nothing is selected, exactly
            as the ambient count is: a permanent "0 / 0.00" pair is a fixture, not an
            answer. The count is labelled with the SAME phrase the ambient indicator uses,
            so one selection cannot be described two ways on one screen. */}
        {selection.count > 0 && (
          <>
            <ControlFigure
              label={SELECTION_COUNT_LABEL}
              figure={figureText(selection.count)}
            />
            <ControlFigure
              label={SELECTED_VALUE_LABEL}
              figure={figureText(selection.totalValue)}
            />
          </>
        )}
      </div>
    </section>
  );
}
