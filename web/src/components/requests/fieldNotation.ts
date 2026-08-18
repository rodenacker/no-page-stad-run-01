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

/**
 * THE ruled field notation, stated once beside the label that names it (design brief §3,
 * Sequence steps 2 and 4 — `request-list-redesign` R12/R14).
 *
 * A field on this screen is marked by an UNDERLINE and nothing else: no border box, no
 * filled surface, no rounded corner. It is here rather than in one component's file
 * because two surfaces now wear it — the narrowing strip's eight fields and the foot's
 * requests-per-page field — and a field on the strip and a field on the continuation line
 * are the same object in this design.
 *
 * Two things about it are load-bearing rather than cosmetic:
 *
 * - **The underline's COLOUR is deliberately absent**, so the primitives' own
 *   `border-input` stands. `--input` is the darker of the two hairline tokens precisely so
 *   an underline clears 3:1 against the ground (WCAG 1.4.11) — and with the box gone that
 *   underline is the only thing outlining the field, so `--border` in its place would drop
 *   it below the bar.
 * - **The focus ring is untouched.** An underline-only field still has to paint a visible
 *   focus indicator, and this project's one focus notation is the primitives' ring.
 *
 * Size and width belong to the surface, not here: a strip field fills its column, the
 * foot's page-size field is as wide as the figure it holds.
 */
export const RULED_FIELD_CLASS =
  'rounded-none border-0 border-b bg-transparent px-0 shadow-none dark:bg-transparent dark:hover:bg-transparent';
