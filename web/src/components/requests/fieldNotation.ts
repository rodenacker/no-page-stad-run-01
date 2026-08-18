/**
 * THE request list's field-label notation, stated once (design brief §3, Typography —
 * `request-list-redesign` R11/R12/R16/R24).
 *
 * This screen is a control document, and every label on it — the control block's figure
 * labels, the narrowing strip's micro-labels, the actions that sit with the strip, the
 * summary of what is applied — is the same object: 11px Azeret Mono, tracked, upper-cased
 * in CSS. Four surfaces carrying four copies of that string is how the tracking on one of
 * them quietly drifts from the others, which in a design whose whole discipline is
 * withholding reads as unfinished rather than restrained.
 *
 * Two things it deliberately does NOT carry:
 *
 * - **No colour.** A label is `--muted-foreground` on the ground and the accent field's
 *   own foreground on the control block, so each use states its own. Two `text-*` colours
 *   on one element resolve by stylesheet order rather than by the order they are written,
 *   so they must never both be here.
 * - **No spacing or layout.** Margins and gaps belong to the surface the label sits on.
 *
 * `uppercase` is CSS, never the DOM: the wording a screen reader is given has to read as
 * words, and the words themselves are the app's own (`lib/transactions/narrowing.ts`'s
 * field names, `lib/transactions/controlTotals.ts`'s figure labels). Never rewrite a
 * label's text to get the look.
 */
export const FIELD_LABEL_CLASS =
  'font-mono text-[11px] font-medium tracking-[0.18em] uppercase';
