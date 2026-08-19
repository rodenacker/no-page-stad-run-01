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
 * - **ITS WORDS WRAP RATHER THAN PUSH THE PAGE SIDEWAYS** (`files-view-redesign` R3, source
 *   UI-23). The `button` primitive ships `whitespace-nowrap` and `shrink-0`, which together
 *   make a control's minimum width its ENTIRE label — and a tracked label carries 0.18em of
 *   extra space per character, so a control worded like a sentence ("Download rows to fix and
 *   re-upload") measures over 350px. That minimum then propagates up every grid it sits
 *   inside, because a grid item's `min-width: auto` is its min-content size and an `auto`
 *   track is at least that wide: ONE such control made the whole `/upload/file` screen 24px
 *   wider than a 360px phone, sideways-scrolling every section on it. Both are cancelled
 *   here rather than per surface, because it is the notation that carries the long labels.
 */
export const RULED_ACTION_CLASS = `${FIELD_LABEL_CLASS} border-input h-auto shrink rounded-none border-b px-1 py-1 whitespace-normal`;

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

/**
 * A ruled action that carries a glyph beside its words — the common case.
 *
 * {@link RULED_ACTION_CLASS} deliberately states no gap, because the notation is worn by
 * controls with and without a glyph. Every control that HAS one needs the same gap, so
 * the pair is stated once here rather than composed per surface: the expense request's
 * own three controls and each register row's Open / Delete are the same object, and a
 * second copy of `gap-1.5` beside a second copy of the notation is how one of them
 * quietly stops matching the rest.
 */
export const RULED_ACTION_WITH_ICON_CLASS = `${RULED_ACTION_CLASS} gap-1.5`;

/**
 * FULL-BLEED TO THE PAGE PADDING, stated once for every surface in the app that runs edge
 * to edge (`request-list-redesign` R13, `files-view-redesign` R10/R15/R16).
 *
 * `-mx-4` cancels `<main>`'s own `px-4`, so the element's box — and therefore any rule
 * drawn on it — reaches the edge of the page; `px-4` puts the padding back inside, so the
 * content still lines up with the app's name in the header and with every label above it.
 * If the authenticated layout's horizontal padding changes, this changes with it.
 *
 * Both halves are exported because a listing needs the bleed WITHOUT the padding: a table
 * puts the page padding on its own outer cells instead ({@link LISTING_EDGE_PADDING_CLASS}),
 * which is what keeps the values inside the rules aligned with everything else.
 */
export const PAGE_BLEED_CLASS = '-mx-4';
export const FULL_BLEED_CLASS = `${PAGE_BLEED_CLASS} px-4`;

/**
 * A place in a listing that is NOT a row: a wait, an empty set, a failed read, a notice
 * about the reading itself, a refusal reported behind a closed dialog.
 *
 * With the card gone from every listing in this design there is nothing framing any of
 * these but the ruling itself, so each one is a full-bleed band closed by a hairline top
 * and bottom — the same rule weight the rows carry, so an answer reads as part of the
 * listing rather than as text stranded on a blank page. The vertical room the surface adds
 * (`py-*`) is what keeps it from reading as one more row.
 */
export const RULED_BAND_CLASS = `${FULL_BLEED_CLASS} border-y`;

/**
 * The `alert` primitive with the CARD it ships with taken off it, for an answer that sits
 * inside a ruled band ({@link RULED_BAND_CLASS}) rather than floating over the page.
 *
 * No radius, no border of its own, no surface and no padding: the band's own hairlines are
 * what frame it, and the padding belongs to the band. Everything the alert IS — its role,
 * its wording, its title and description — is untouched; only the box around it goes.
 *
 * It is stated here rather than beside each use because a refusal on the register, a report
 * from the submission slip, a file that cannot be opened and a history that cannot be read
 * are all the same object in this design (`request-list-redesign` R13,
 * `files-view-redesign` R12/BR9), and four copies of one string is how the radius or the
 * surface quietly comes back on one of them.
 *
 * It sizes the alert's own glyph down with it, for the reason {@link RULED_ACTION_ICON_CLASS}
 * exists: the primitive's 16px mark out-weighs the words it decorates once those words are
 * a tracked micro-label ({@link RULED_ALERT_TITLE_CLASS}).
 */
export const RULED_ALERT_CLASS =
  'rounded-none border-0 bg-transparent p-0 [&>svg]:size-3.5';

/**
 * An alert's own title inside a ruled band: the tracked micro-label, unclamped so a title
 * too long for one line wraps instead of being cut off.
 *
 * A notice's heading is a word that NAMES what happened rather than a sentence about it, so
 * it is the same object as a column head — and it carries no colour of its own, leaving the
 * alert's own foreground to ink it.
 */
export const RULED_ALERT_TITLE_CLASS = `${FIELD_LABEL_CLASS} line-clamp-none`;

/**
 * The page padding, applied to a listing's own outer cells instead of to a box around it.
 *
 * The table itself is full-bleed ({@link PAGE_BLEED_CLASS}) so every hairline row rule
 * reaches the edge of the page; putting the padding on the first and last cell is what
 * keeps the values inside those rules lined up with the labels and bands above them.
 */
export const LISTING_EDGE_PADDING_CLASS =
  '[&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4';

/**
 * A listed row: the hairline rule beneath it (the table primitive's own `border-b`) is the
 * whole treatment.
 *
 * This cancels the primitive's per-row hover fill and its colour transition, and it is the
 * requirement rather than a preference: a row that tints under the pointer is the
 * striped-table treatment arriving one row at a time, which every listing in this design
 * names as an anti-goal. Cancelling the transition with it also keeps a page of rows off
 * the compositor at volume.
 */
export const LISTING_ROW_CLASS =
  'transition-none hover:bg-transparent has-aria-expanded:bg-transparent';

/**
 * ONE RECORD AT PHONE WIDTH: a group of ruled lines, not a card
 * (`request-list-redesign` R4/R10, `files-view-redesign` R3 — both from UI-23).
 *
 * A screen too narrow for nine columns gets a genuinely DIFFERENT presentation rather than
 * a re-flowed table (`lib/layout/viewport.ts` owns the crossover), and this is the box each
 * record is drawn in: the hairline beneath it is the whole treatment, the page padding is
 * put back inside it, and it carries NO MARGIN — so consecutive records touch and the
 * listing reads as one ruled sequence rather than as the stack of boxes every listing in
 * this design names as an anti-goal. That is measurable: a card stack leaves a visible
 * gutter between each pair, a hairline rule costs nothing at all.
 *
 * The LAST record's rule is the listing's own closing edge, which is why the box around a
 * narrow listing draws none of its own — unlike the wide table, whose primitive
 * deliberately leaves its last row unruled.
 *
 * It is stated here rather than beside one listing because five surfaces now wear it — the
 * expense request list's line-group and the four listings on the two expense-files screens
 * (the register, the import preview, the rejected rows, the processing history) — and five
 * copies of one string is how the rule under one of them quietly stops matching the rest.
 * Padding a surface needs MORE of (a block heading opening a section of the listing) is
 * composed on top through `cn`, never by restating this.
 */
export const NARROW_RECORD_CLASS = 'border-b px-4 py-3';

/**
 * A word that NAMES something in a listing rather than being a value in it: a column head,
 * and a block's own heading over the rules beneath it.
 *
 * The tracked micro-label at `--muted-foreground`, so the ink belongs to the values rather
 * than to the words naming them — and one string, because a column head and the heading
 * above the block it heads are the same object in this design (`request-list-redesign` R13,
 * `files-view-redesign` R10/R15). It also cancels the table primitive's own head weight and
 * near-black ink.
 *
 * The capitals are `text-transform`, so the wording — and any accessible name built from
 * it — still reads as words: never retype a label in capitals to get the look. Alignment
 * belongs to the surface: a figure column adds `text-right` itself.
 *
 * A head that carries a CONTROL (the request list's sort buttons) wears
 * {@link FIELD_LABEL_CLASS} on the control instead and keeps only the ink on the `th`,
 * because the primitive's own selectors beat a `font-*` utility inherited from the cell.
 */
export const LISTING_LABEL_CLASS = `${FIELD_LABEL_CLASS} text-muted-foreground`;

/**
 * A FIGURE — a number this world counts or totals: Azeret Mono and tabular, so digits are
 * the same width wherever they are read and a figure changing in place shifts nothing
 * around it (`request-list-redesign` R13, `files-view-redesign` R11/R17).
 *
 * Alignment and size deliberately belong to the surface, because the same figure is set
 * two ways: down a listing's column it is right-aligned so the digits line up
 * ({@link FIGURE_CELL_CLASS}), while on a slip it sits under the label naming it and must
 * start where that label starts. Both are the same object, so the face and the tabular
 * figures are stated once here.
 */
export const FIGURE_CLASS = 'font-mono tabular-nums';

/**
 * A figure in a LISTING: the figure notation, right-aligned, so the digits line up
 * column-perfect down the page (`request-list-redesign` R13, `files-view-redesign` R11).
 */
export const FIGURE_CELL_CLASS = `${FIGURE_CLASS} text-right`;

/**
 * A fixed-field value that is not a figure to be added up — a reference, a file name, a
 * setting name, a masked account number, a date as the service wrote it. Mono, because
 * that is the notation this design reads an identifier in (project.md §Styling &
 * Branding), and left where the column starts.
 *
 * Its weight is the notation's, never an added emphasis: down a ruled column the
 * fixed-width face is what makes one identifier scannable against the next, so a
 * `font-medium` on top of it is the card-era treatment rather than this one.
 */
export const NOTATION_CELL_CLASS = 'font-mono';
