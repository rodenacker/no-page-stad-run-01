/**
 * THE tracked micro-label notation, stated once (design brief §3, Typography —
 * `request-list-redesign` R11/R12/R16/R24/R26).
 *
 * The request list is a control document, and every label on it — the control block's
 * figure labels, the narrowing strip's micro-labels, the actions that sit with the strip,
 * the summary of what is applied — is the same object: 11px Azeret Mono, tracked,
 * upper-cased in CSS. Four surfaces carrying four copies of that string is how the
 * tracking on one of them quietly drifts from the others, which in a design whose whole
 * discipline is withholding reads as unfinished rather than restrained.
 *
 * It reaches one surface BEYOND that screen, deliberately: the shared status mark
 * (`components/status/StatusBadge`) sets its word in this same notation, and that mark is
 * rendered by the files screens as well as this one (R26/R28). A status label and a field
 * label are the same object in this world, so they are one string here rather than two
 * that look alike.
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
