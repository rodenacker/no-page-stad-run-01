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
 *
 * And two more that arrived with the pre-commit state and the roll (R17/R22, BR7/BR8):
 *
 * - **While decisions are awaiting confirmation the block DELIBERATELY DOES NOT BALANCE**
 *   (R17). `AWAITING DECISION` states what the batch will be; `RECORDS` and `DECIDED` go on
 *   stating what it is, so the reader can see the after-picture and see that it has not
 *   happened yet. The gap is NAMED beside it (`NOT YET CONFIRMED`) rather than left as a
 *   mystery, and that pair is absent while nothing is pending. `lib/transactions/
 *   controlTotals.ts` owns the arithmetic and the ⚠ about which figure may move.
 * - **The roll follows the SETTLED count, never the stated one** (BR8). A projection
 *   appearing or reverting is a state change, not a resolution: it swaps the digits with no
 *   motion at all. The one orchestrated motion on this screen is the count settling onto a
 *   decision that has actually been recorded — one per resolution, so a decision confirmed
 *   does not roll three times on its way (into the projection, back out of it, then down).
 */
import { useId, useMemo, useState } from 'react';

import { FIELD_LABEL_CLASS } from '@/components/requests/fieldNotation';
import {
  AWAITING_DECISION_LABEL,
  BATCH_LABEL,
  DECIDED_LABEL,
  NOT_YET_CONFIRMED,
  RECORDS_LABEL,
  RUN_DATE_LABEL,
  SELECTED_VALUE_LABEL,
  TOTAL_VALUE_LABEL,
  WHOLE_BATCH_RECORDS_LABEL,
  batchNameOf,
  controlTotalsOf,
  figureText,
  preCommitReadingOf,
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

/**
 * The box the digits roll inside (R22's "in place", and the zero-layout-shift half of it).
 *
 * `block` rather than the span's own `inline`, stated unconditionally so the figure's own box
 * is IDENTICAL whether or not it is rolling: a block child of the `<p>` fills the same single
 * line box the text filled directly, and a transform on it takes no part in layout at all.
 * That is what leaves the count's box — and therefore every rule and row beneath the control
 * block — exactly where it was while the digits move.
 */
const ROLL_BOX_CLASS = 'block';

/**
 * The roll itself, declared once in the token layer (`globals.css`, `@keyframes figureRoll`)
 * with the reasoning for its stepped timing and its reduced-motion behaviour. Applied only
 * to a figure that has something to roll TO: an element carrying it on first paint would
 * animate the batch's opening count, which is not a resolution and is not this screen's one
 * motion.
 */
const ROLL_CLASS = 'animate-figure-roll';

/**
 * One space, closing each field's own text.
 *
 * The band's fields are separate elements with no whitespace between them, so without
 * this the band's own text run reads `RECORDS8AWAITING DECISION5DECIDED3` — every figure
 * welded to the label of the field after it. Nothing about the LAYOUT needs it (a
 * white-space-only run inside a flex or grid container is not rendered at all, so it
 * costs nothing), and a screen reader hears each pair correctly either way through
 * `aria-labelledby` — but anything reading the band FLAT gets a sentence rather than one
 * unbroken token: a copy of the band, and a test asserting that a label is followed by
 * its own figure. It closes the whole field rather than the figure element, so a figure's
 * accessible name still carries the value and nothing else.
 */
const FIELD_SEPARATOR = ' ';

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
      {FIELD_SEPARATOR}
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

/**
 * The focal figure — see the ⚠ in this file's header for why it is a `<fieldset>`, and the
 * last two bullets for why it takes two numbers rather than one.
 */
function OutstandingFigure({
  stated,
  settled,
}: {
  /**
   * What the figure SAYS: the projection while decisions are awaiting confirmation, and
   * otherwise the batch's own count.
   */
  stated: number;
  /**
   * What the batch actually IS. The roll follows this and only this, so committing a
   * decision produces one settle rather than three, and a projection appearing or being
   * backed out of swaps the digits with no motion at all (BR8).
   */
  settled: number;
}) {
  const labelId = useId();

  /**
   * Which roll the figure is on. React's documented way to adjust state when a value
   * changes: the comparison happens during the render that first sees the new count, so the
   * generation below is already correct in the commit that paints it — no effect, therefore
   * no frame of the old count sitting on screen before the roll starts.
   *
   * It is a COUNTER rather than the value itself because that is what has to change for the
   * element to be re-created and the animation to run again: two decisions that happen to
   * land on the same count in a row are still two resolutions.
   */
  const [settledBefore, setSettledBefore] = useState(settled);
  const [roll, setRoll] = useState(0);
  if (settledBefore !== settled) {
    setSettledBefore(settled);
    setRoll((rolls) => rolls + 1);
  }

  return (
    <fieldset className="m-0 border-0 p-0">
      <legend id={labelId} className={`${LABEL_CLASS} mb-1.5 p-0`}>
        {AWAITING_DECISION_LABEL}
      </legend>
      {/* Polite, and named by the legend above rather than by an `aria-label` that would
          override its own changing contents. Its text is the count and nothing else — which
          is also why the roll animates ONE element holding the whole figure rather than a
          strip of digits: a strip left in the markup would be read out as "0 1 2 3 4 5 6 7
          8 9" by a screen reader, and this element is the app's statement of the count. */}
      <p
        role="status"
        aria-labelledby={labelId}
        className={OUTSTANDING_FIGURE_CLASS}
      >
        {/* Re-created on each resolution, which is what restarts the roll (a CSS animation
            runs when the element carrying it is inserted). The first paint carries no
            animation class at all — see `ROLL_CLASS`. */}
        <span
          key={roll}
          className={
            roll === 0 ? ROLL_BOX_CLASS : `${ROLL_BOX_CLASS} ${ROLL_CLASS}`
          }
        >
          {figureText(stated)}
        </span>
      </p>
      {FIELD_SEPARATOR}
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
  /**
   * The requests a decision is awaiting confirmation on, by id — one for a single decision,
   * the whole selection for a bulk approval, and NOTHING once either confirmation has been
   * answered either way (R17/BR7).
   *
   * The block derives its unbalanced reading from this and holds no pre-commit state of its
   * own, which is what makes AC-3's revert exact: the list stops asking, the set empties, and
   * every figure is back.
   */
  awaitingConfirmationIds: ReadonlySet<number>;
}

export function BatchControlBlock({
  batch,
  listed,
  narrowed,
  narrowedToFile,
  selectedIds,
  awaitingConfirmationIds,
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

  /**
   * What the block states while the reader is being asked to commit something (R17/BR7).
   * With nothing pending this reads `notYetConfirmed: 0` and an `awaitingDecision` identical
   * to the batch's own, so the pre-commit pair is simply absent and every other figure is
   * untouched.
   */
  const preCommit = useMemo(
    () => preCommitReadingOf(totals, listed, awaitingConfirmationIds),
    [totals, listed, awaitingConfirmationIds],
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
        <OutstandingFigure
          stated={preCommit.awaitingDecision}
          settled={totals.awaitingDecision}
        />

        {/* The gap, NAMED — how many decisions are waiting to be confirmed, in the same
            label-over-figure grammar as everything else on the band (R17/BR7). It joins the
            line only while something is actually pending and is absent from the markup
            otherwise, exactly as the selection pair below is: an indicator permanently
            reading "0 not yet confirmed" is a fixture rather than an answer. Without it a
            projected outstanding count would be indistinguishable, to a screen-reader user,
            from a decision that had already been recorded. */}
        {preCommit.notYetConfirmed > 0 && (
          <ControlFigure
            label={NOT_YET_CONFIRMED}
            figure={figureText(preCommit.notYetConfirmed)}
          />
        )}

        {/* ⚠ The batch as it IS, and it does not move for a pending decision (R17) — see
            the header. `RECORDS` above is the same: only the outstanding count states the
            projection, which is what leaves the three visibly not adding up. */}
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
