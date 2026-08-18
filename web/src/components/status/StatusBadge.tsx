/**
 * The one way this app shows a status: a RULED MARK — a small drawn shape beside the
 * status in tracked words, in the intent's own ink. Never colour alone (source UI-21,
 * `request-list-redesign` R3/R26/BR3, WCAG 2.2 AA), and no longer a rounded coloured
 * pill (R26).
 *
 * Three things live here so no screen has to decide them again:
 *
 * - **The intents and their ink.** Every colour is a token from `globals.css` with a
 *   value in both themes (styling-centralisation.md), so a status reads in light and
 *   dark with no per-screen work. Callers name an INTENT, not a colour.
 * - **The SHAPES.** One per intent, drawn here and nowhere else (R18/BR11): hollow,
 *   filled, struck, ruled and doubled. They differ in FORM rather than in tint, so a
 *   reader scanning down a column tells them apart before any colour is read — which is
 *   the whole point of the taxonomy and is judged in greyscale, by eye. They are drawn
 *   in a square viewBox at `currentColor` so the same mark works inline beside a word
 *   and, sized by the caller, at two-character width in a listing's gutter.
 * - **What an unrecognised status looks like.** A value this app has no name for is
 *   shown neutral, with NO shape — a shape would be this component claiming to know a
 *   meaning it does not have — and above all with the service's own words. Every
 *   vocabulary on the wire belongs to the backend.
 *
 * A caller maps its own status vocabulary to a {@link StatusPresentation} — a
 * `Record<KnownStatus, StatusPresentation>` plus its own known-value guard — and hands
 * the raw status string here. The file vocabulary, the request vocabulary and the import
 * preview's two verdicts all do; none of them draws a shape of its own, so two surfaces
 * can never disagree about what "approved" looks like.
 *
 * It also carries marks that are not statuses but are read the same way — a short phrase
 * paired with a shape and an intent colour (see
 * `components/requests/PossibleDuplicateMark`). Anything of that shape belongs here
 * rather than in a badge of its own.
 *
 * **Why the Shadcn `badge` primitive is deliberately not used here.** CLAUDE.md §1 asks
 * for Shadcn primitives to be composed rather than hand-rolled; it does not mandate
 * `badge` specifically. That primitive applies an unconditional `rounded-full` capsule
 * with a filled intent background — which IS the pill R26 retires. So the mark is
 * composed from the token layer instead, and there is no chip surface anywhere in it: no
 * radius, no background, no border. Do not read this as licence to hand-roll elsewhere.
 */
import { FIELD_LABEL_CLASS } from '@/components/requests/fieldNotation';
import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

/**
 * What a status MEANS, in the four-plus-one vocabulary this project settled at
 * project level (project.md §Semantic status colors):
 *
 * - `informational` — under way, or simply where something stands (awaiting a decision)
 * - `positive` — finished well
 * - `attention` — needs the user to look at it
 * - `negative` — refused or rejected
 * - `neutral` — inert, cancelled, or a value this app does not recognise
 */
export const STATUS_INTENTS = [
  'informational',
  'positive',
  'attention',
  'negative',
  'neutral',
] as const;

export type StatusIntent = (typeof STATUS_INTENTS)[number];

/**
 * The ink each intent is drawn in — the shape and its word both, since the mark has no
 * surface of its own to tint. Token names only; no colour value appears here, and both
 * themes are covered in `globals.css`.
 */
const INTENT_INK: Record<StatusIntent, string> = {
  informational: 'text-info',
  positive: 'text-success',
  attention: 'text-warning',
  negative: 'text-destructive',
  neutral: 'text-muted-foreground',
};

/**
 * The ink one intent is drawn in, for a surface that renders {@link StatusMark} on its
 * own — a listing's reserved gutter, where the shape has no word beside it to carry the
 * ink for it, and where the row around it may be desaturated (`request-list-redesign`
 * R20) so `currentColor` would quietly mute the mark that is carrying the decision.
 *
 * It answers a token class, never a colour: the intent → token mapping stays stated in
 * exactly one place, so the gutter's mark and the mark beside the word can never be
 * inked differently.
 */
export const statusInkFor = (intent: StatusIntent): string =>
  INTENT_INK[intent];

/**
 * The shape each intent is drawn as, in a 12×12 field, at `currentColor` (R18/BR11).
 *
 * They are told apart by FORM, not by tint — which is what makes the column scannable
 * in greyscale, and what keeps them legible when a gutter shows the shape with the word
 * elsewhere on the row:
 *
 * - `informational` — a HOLLOW rule-box: an open square, nothing inked in it yet
 * - `positive` — the same square INKED solid: the decision is on the record
 * - `negative` — the square STRUCK through: on the record, and refused
 * - `neutral` — a RULE and no box at all: inert, nothing to decide (a cancelled file)
 * - `attention` — a DOUBLED bar in the margin: the editorial change-bar a reader scans
 *   for, and doubled because the thing it most often marks is a record that repeats
 *   another
 *
 * `neutral` is the CANCELLED shape (BR11): a cancelled file's transactions never reach
 * the request list, so it will not appear in that screen's live data — its absence there
 * is expected, and it must still render correctly wherever it is exercised.
 */
const INTENT_SHAPE: Record<StatusIntent, ReactNode> = {
  informational: (
    <rect
      x="1.75"
      y="1.75"
      width="8.5"
      height="8.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  ),
  positive: (
    <rect x="1.75" y="1.75" width="8.5" height="8.5" fill="currentColor" />
  ),
  negative: (
    <>
      <rect
        x="1.75"
        y="1.75"
        width="8.5"
        height="8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line
        x1="1.75"
        y1="10.25"
        x2="10.25"
        y2="1.75"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </>
  ),
  neutral: (
    <line
      x1="0.75"
      y1="6"
      x2="11.25"
      y2="6"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  ),
  attention: (
    <>
      <rect x="2.25" y="0.75" width="2" height="10.5" fill="currentColor" />
      <rect x="7.75" y="0.75" width="2" height="10.5" fill="currentColor" />
    </>
  ),
};

/**
 * One intent's shape on its own, drawn in whatever ink it inherits.
 *
 * Exported because the shapes are shared: a listing's reserved gutter shows the shape
 * where the word is read elsewhere on the row, and it must be the SAME shape the mark
 * beside the word uses — a second drawing of "approved" is how the two drift apart.
 * `className` is how a caller sizes it (the default is inline-with-a-word size).
 *
 * Always decorative: the meaning is carried in words by whatever renders it, so this is
 * `aria-hidden` and a caller must name what it marks in text of its own (BR3 — the
 * shape supplements the wording, it never replaces it).
 */
export function StatusMark({
  intent,
  className,
}: {
  intent: StatusIntent;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={cn('size-3 shrink-0', className)}
    >
      {INTENT_SHAPE[intent]}
    </svg>
  );
}

/** How one recognised status is shown: what it means, which decides how it is drawn. */
export interface StatusPresentation {
  intent: StatusIntent;
}

/**
 * The status as the service sent it: its shape, then its own words, in the intent's ink.
 *
 * Exactly ONE element carries the wording — the visible text is the accessible text,
 * with no screen-reader-only second copy, which would have a reader hear the same status
 * twice for one record. `uppercase` is CSS (the shared field notation), never the DOM, so
 * the words a screen reader is given are still the service's own.
 *
 * `presentation` is omitted for a status this app does not recognise: the mark then reads
 * neutral and draws NO shape, and the unfamiliar value still reaches the user verbatim.
 */
export function StatusBadge({
  status,
  presentation,
}: {
  status: string;
  presentation?: StatusPresentation;
}) {
  const intent = presentation?.intent;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5',
        INTENT_INK[intent ?? 'neutral'],
      )}
    >
      {intent === undefined ? null : <StatusMark intent={intent} />}
      <span className={FIELD_LABEL_CLASS}>{status}</span>
    </span>
  );
}
