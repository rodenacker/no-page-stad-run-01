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

/**
 * THE ruled action notation, stated once (design brief §3 — `request-list-redesign`
 * R12/R13/R24).
 *
 * An action on this screen that is not a row's own value is a tracked micro-label on a
 * rule, never a boxed button: this listing has no boxes left for one to match. Six controls
 * now wear it — the export, `Clear all`, each request's own Open/Approve/Reject, the page
 * controls, the empty state's next step and the failed read's retry — and they are drawn
 * from here for the same reason {@link FIELD_LABEL_CLASS} is: six copies of one string is
 * how the rule under one of them quietly stops matching the rest, which in a design whose
 * whole discipline is withholding reads as unfinished rather than restrained.
 *
 * It carries the label notation, the hairline and the geometry, and nothing else:
 *
 * - **The rule's COLOUR is `border-input`**, for the reason {@link RULED_FIELD_CLASS}
 *   states — with no box around the control that hairline is the only thing outlining it,
 *   and `--border` in its place would drop it below 3:1 (WCAG 1.4.11).
 * - **No gap and no colour.** A control with an icon beside its words states its own gap
 *   (`gap-1.5`); the ink is whatever the surface it sits on gives it.
 * - **The wording is untouched wherever it is used**: the capitals are `text-transform`, so
 *   a control's accessible name is still the words the app wrote.
 */
export const RULED_ACTION_CLASS = `${FIELD_LABEL_CLASS} border-input h-auto rounded-none border-b px-1 py-1`;

/**
 * The glyph beside a ruled action's words, stated here beside the notation it belongs to.
 *
 * At 11px a 16px icon out-weighs the word it is decorating, so every ruled action sizes its
 * glyph down. It has to be set ON THE ICON rather than on the button: the `button` primitive
 * sizes any icon that carries no size of its own (`[&_svg:not([class*='size-'])]:size-4`)
 * with a selector that beats a button-level override — which is also why an icon that simply
 * omits this quietly renders at the primitive's 16px rather than at the notation's size.
 */
export const RULED_ACTION_ICON_CLASS = 'size-3';
