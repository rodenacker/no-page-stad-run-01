# Epic: Redesign the request list as a batch listing

Inherits roles, auth, data source, and compliance from `project.md`. Styling is
**not** inherited unchanged — this epic is the vehicle for the styling change already
recorded in `project.md` §Styling & Branding (new typefaces, new "Colour strategy"
subsection, new "Design authority" subsection naming
`documentation/design-brief-batch-listing.md` as binding visual direction). Read those
sections there as authoritative; this brief does not re-derive or re-propose them.

**Primary sources (both confirmed, both binding):**
`documentation/design-brief-batch-listing.md` ("The Batch Listing", seed key
`29469d17`, confirmed by the user 2026-08-17) and `PRODUCT.md`. Where this brief
paraphrases either, the source document governs on any conflict.

**Depends on:** every epic that shipped the current expense request list and its
behaviour — `expense-request-list`, `expense-decisions`,
`bulk-approval-and-live-refresh`, `csv-export` — plus `sign-in-and-app-shell` for the
app shell this screen lives inside. This epic **redesigns the presentation** those
epics built; it does not revisit what any of them decided a user may do.

---

## Goal

Rebuild the shared expense request list in the Batch Listing design — a control block
showing the batch's outstanding count at a glance, a scannable exception gutter, and
no change to what anyone can do.

The screen becomes the batch's own control document, worked down to zero, rather than
a dashboard that happens to contain a table (design brief §3, Structural thesis). Every
behaviour a user can currently exercise on this screen must still be exercisable,
identically, when this epic is done.

---

## Data Model

**No persisted entity is introduced or changed.** This epic acts entirely on the
`Transaction` data already fetched by `GET /v1/transactions` for the existing list
(`expense-request-list` §Data Model) — it changes how that data is presented, not what
is fetched, sent, or stored. Four new things exist, and all four are **derived,
client-side, presentation-only aggregates** computed from the same in-memory
`TransactionRead[]` set the current list already holds:

| Derived aggregate | Computed as | Scope |
|---|---|---|
| **Batch control totals** — `RECORDS`, `AWAITING DECISION`, `DECIDED`, `TOTAL VALUE` | `RECORDS` = count of the full fetched set; `AWAITING DECISION` = count where `Status === Imported`; `DECIDED` = count where `Status !== Imported`; `TOTAL VALUE` = sum of `Amount` across the full fetched set | The whole batch, unaffected by narrowing |
| **Narrowed control totals** | The same four aggregates, recomputed over the narrowed set only (whatever `expense-request-list`'s search/filter pipeline currently leaves) | Only shown while a narrowing is active; the full-batch `RECORDS` figure is kept beside it, struck through (Raise 6, R21) |
| **Selection subtotal** — live count + total value | Count and summed `Amount` of the requests currently in `selectedIds` (the existing selection set from `bulk-approval-and-live-refresh`) | Only while a selection is active (Raise 4, R19) |
| **Gutter mark** (per row) | A presentation-only mapping from a row's existing state — `Status`, the existing `isDuplicate` flag, and whether it is currently selected — to one of a fixed set of shapes: empty (ordinary, undecided, no exception), possible-duplicate/exception, and one distinct shape per decided status (approved / rejected / cancelled). Not a new field on `Transaction`; computed at render time from data the list already holds. | Per row |

None of these aggregates requires a new API call, a new field on the wire, or a change
to any existing derived value (`isDuplicate`, the selection set, the narrow → order →
slice pipeline) — they are new **views** over data this app already has in memory.

---

## Functional Requirements

Hard constraints carried forward verbatim in substance from the design brief's §4 and
§5 (all pre-existing, all must continue to hold):

| ID | Statement | Source |
|---|---|---|
| R1 | Every user-observable behaviour that exists on this screen today must still hold after this redesign — the same searches, filters, sorts, pages, decisions, bulk actions, exports, notifications, and role gating produce the same outcomes. | Design brief §4, "Must remain untouched" |
| R2 | A page-size selector offering 5/10/20/50, default 20, is always present; navigation stays visible in a disabled state when the current set fits on one page. | UI-16 |
| R3 | Every status is conveyed by an intent-mapped colour paired with an icon or text label, never colour alone. | UI-21 |
| R4 | On a viewport ≥360px wide, each request presents its primary identifier, two to three key values, and an action overflow, with no horizontal scrolling of the page. | UI-23 |
| R5 | Every action on this screen — including selection, bulk approval, and rejection-with-note — is completable by keyboard alone, to the project's WCAG 2.2 AA bar. | project.md §Baseline NFRs note; requirements §6.6.5 |
| R6 | Account numbers stay masked to their last four digits everywhere this screen shows them; the CSV export keeps them whole and stays attributed to the exporting user. | project.md §Compliance; `csv-export` R4 |
| R7 | A capability a signed-in role lacks is absent from the screen, never present-but-disabled. | project.md hidden-never-disabled convention |
| R8 | Rendering one page of the list at the 10,000-request volume stays within a p95 of 400ms. | `expense-request-list` Feature NFRs; requirements §6.6.2 |
| R9 | No colour value appears outside a named token in `globals.css`; every token used by this screen is populated in both `:root` and `.dark`. | styling-centralisation.md rules 1–5 |
| R10 | The design holds at 1 row, at a 20-row page, at a 50-row page, and across a 428-row batch spanning 22 pages, within the stated 1–10,000-record volume range. | design brief §5 |

The redesign itself, from the design brief's §3 sequence and its named raises:

| ID | Statement | Source |
|---|---|---|
| R11 | A full-bleed control block in the brand-accent field opens the screen — not a page title above a table — showing `BATCH / RUN DATE / RECORDS / AWAITING DECISION / DECIDED / TOTAL VALUE` as tracked mono labels over tabular figures, with `AWAITING DECISION` rendered at display scale as the largest element on the screen. | Design brief §3, Sequence step 1 + Focal moment |
| R12 | One ruled field strip of narrowing controls replaces the current filter chrome: underline-only inputs, no input boxes, tracked micro-labels — while every existing narrowing field, its clear-all action, and its invalid-range reporting behaviour (from `expense-request-list` R7/R10/R18) continue to work exactly as before. | Design brief §3, Sequence step 2 |
| R13 | The listing itself is full-bleed to the page padding, with hairline row rules, 11px tracked mono column heads, every figure right-aligned and tabular, and the reference and masked account number set in mono. | Design brief §3, Sequence step 3 |
| R14 | The pagination footer reads as a continuation line — `RECORDS 1–20 OF 428 · PAGE 1 OF 22` — with the page-size selector presented as a field, while the underlying pagination behaviour (R2/UI-16) is unchanged. | Design brief §3, Sequence step 4 |
| R15 | A permanently reserved two-character gutter runs down the left of the listing: empty for an ordinary row, marked for a row that needs attention or has been decided. Selection lives in the gutter itself, not in a bolted-on checkbox column. | Design brief §3, Focal moment |
| R16 | Scale contrast carries the whole hierarchy: roughly 8:1 between the control block's figure and its 11px tracked label, with no invented middle tier softening it. | Design brief §3, raise donated by Variable-Font Specimen |
| R17 | Before an irreversible decision (single or bulk) commits, the affected rows show inked-but-unbalanced against the control total — the reader sees what the batch will look like after committing, and the total visibly does not balance until they do. | Design brief §3, raise donated by Darkroom Safelight Bay |
| R18 | Imported / approved / rejected / cancelled each get a structurally distinct gutter mark and rule treatment, legible scanning down the gutter before colour or text is read. | Design brief §3, raise donated by Tensegrity Breathing Column |
| R19 | A bulk selection shows a live count and a live total value in the control block, beside the batch total — the money being committed, not just a row count. | Design brief §3, raise donated by Cassette J-Card |
| R20 | A decided row stays present but desaturates to ink-on-ground, with its gutter mark carrying the decision; only rows still awaiting a decision hold full contrast. | Design brief §3, raise donated by Character Goods Catalog |
| R21 | Applying a narrowing re-derives the control totals to describe the narrowed set, keeping the full-batch figure beside it struck through. | Design brief §3, raise donated by Alphabet Storm |
| R22 | When a decision resolves — single or bulk — `AWAITING DECISION` decrements with a mechanical tabular digit roll, with zero layout shift, while the decided row inks its gutter mark and desaturates; the transition snaps (no animation frames) under `prefers-reduced-motion`. | Design brief §3, Signature interaction |
| R23 | The build's first act writes the direction contract as an HTML comment placed as the first child of `<body>` in the root layout, carrying `THESIS`, `OWN-WORLD`, `STORY`, `FIRST VIEWPORT`, `FORM` (naming seed key `29469d17`), and closing with the verbatim `FINISH` line; it must survive the production build and be verifiable by grepping the built output for the seed key. | Design brief §7, "The direction contract" |
| R24 | `Cabin` is retired as the app's typeface. `Public Sans` (all text) and `Azeret Mono` (figures, references, masked account numbers, control totals, and field labels) are loaded and self-hosted via `next/font` in the root layout — two faces, no more. | project.md §Styling & Branding (already changed); design brief §3, Typography |
| R25 | `--brand-accent` (`#006DE3` / `#5CA1EB`) owns the whole control block as a saturated field; `--primary` (`#00AEEF` / `#49BEE9`) carries interactive state and gutter marks; every other surface is ground, ink, hairline, and the four semantic status tokens. Contrast discipline is unchanged — `--primary` keeps its dark foreground (5.9:1) rather than white. | project.md §Colour strategy; design brief §3, Colour strategy |
| R26 | `StatusBadge` stops presenting as a pill and becomes a ruled status mark — a glyph paired with a tracked text label — satisfying R3/UI-21 natively rather than by a bolt-on colour chip. | Design brief §3, Cross-surface reach (Status row) + this epic's explicit scope |
| R27 | Access to this screen and every action on it is unchanged: both Importer and Approver may open the screen; only Approver sees the possible-duplicate notification, the decision actions, and bulk approval; either role may export. | `expense-request-list` R20/R21; `expense-decisions` R14; `bulk-approval-and-live-refresh` R7; `csv-export` R3 |
| R28 | Screens this epic does not restyle — import preview, rejected rows, upload, submitted-files list, the landing screen, sign-in — keep working and remain visually intact on the shared token/font layer this epic changes, even though they are not visually redesigned here. | Design brief §4, Scope and boundaries |

---

## Business Rules

| ID | Statement |
|---|---|
| BR1 | DOM structure, class names, layout, and component composition are free to change. Existing Vitest and Playwright specs may be updated where the redesign legitimately changes markup or presentation — **never** where doing so would weaken a behavioural assertion. A spec change that removes or loosens an assertion of user-observable behaviour is not a legitimate update under this rule. |
| BR2 | R1's "no behaviour change" covers, without limitation: search/filter/sort/paging semantics and their combination rules (`expense-request-list` R2/R3/R6/R7/R13); duplicate marking and its exclusions (BR2/BR3 there); the decide flow, its confirmation convention, the re-read-before-submit staleness guard, and the already-decided refusal (`expense-decisions` R1–R16); bulk selection survival across narrowing/ordering/paging, the bulk-approve confirmation's exact count, the three-bucket outcome report, and self-refresh cadence and pausing (`bulk-approval-and-live-refresh` R1–R10); and the export's narrowing-respecting scope, unmasked account column, and exporter attribution (`csv-export` R1–R4). |
| BR3 | The four gutter-mark shapes (R18) are a shape-and-rule taxonomy distinct from colour — they are the *first*, pre-colour signal a reader scans for. They supplement, and never replace, the colour-plus-icon/text pairing R3/UI-21 already requires; a mark with no accompanying text/icon anywhere on the row would not satisfy R3 on its own. |
| BR4 | `AWAITING DECISION` is the single largest typographic element on the screen; no other numeral, heading, or wordmark competes with it in scale (R11's Focal moment). |
| BR5 | The gutter (R15) is exactly two characters wide and permanently reserved — present, empty, on every ordinary row, never collapsed to zero width when nothing needs marking. The selection control lives inside this gutter, composed as one of its marks, not as a separate checkbox column bolted on beside it. |
| BR6 | The narrowing controls (R12) use underline-only inputs with no bordered/boxed input styling, while preserving every currently offered narrowing field (status, originating file, transaction type, amount range, transaction date range, free-text search), their combination semantics, and the existing invalid-range reporting (a range entered the wrong way round is reported in place and never applied). |
| BR7 | The pre-commit proof line (R17) must be visible before **both** a single decision confirmation and a bulk-approve confirmation is accepted — not only as confirmation-dialog copy, but as a visible state change on the affected row(s) and/or the control block, so the reader sees the unbalanced state before they commit, not only reads about it. |
| BR8 | The control-total roll and the row-desaturation transition (R22) are the one orchestrated motion grammar for this screen. No separate, scattered hover-effect motion is introduced elsewhere on the screen to compete with it. Under `prefers-reduced-motion`, the transition snaps directly to its end state — no animation frames — but the end state itself (decremented total, desaturated row, inked gutter mark) is identical either way. |
| BR9 | No suppression directive of any kind (`eslint-disable`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`) may be used to route around a strict-mode, lint, or type conflict introduced by any requirement in this brief (project CLAUDE.md §4/§10; design brief §4 anti-goals). |
| BR10 | The direction-contract comment (R23) must survive the production build. A build whose output no longer contains the seed key `29469d17` when grepped fails this requirement — the contract is only meaningful if it is auditable in what actually ships. |
| BR11 | The four gutter-mark shapes (R18) must exist in the shared status/mark component for all four states (imported/awaiting, approved, rejected, cancelled) so any surface can use them, but — exactly as already noted for the current `StatusBadge` — "cancelled" is a *file*-level state and a cancelled file's transactions never reach this list (`expense-request-list` §Notes & Caveats). Its shape must exist and render correctly if exercised, but its absence from this screen's live test data is expected, not a bug. |

---

## Key Workflows

1. **Scan the batch at a glance.** An Importer or Approver opens the list; the control block shows `RECORDS / AWAITING DECISION / DECIDED / TOTAL VALUE` for the whole batch, with `AWAITING DECISION` the largest figure on screen (R11/BR4) — the reader knows where the batch stands before reading a single row.
2. **Find the exceptions.** The reader scans the two-character gutter down the listing, not nine columns of coloured pills; a possible-duplicate mark and the four structurally distinct status marks are legible before any colour or text is read (R15/R18).
3. **Narrow, and watch the totals move.** The reader applies a filter or search term through the ruled field strip (R12); the control totals re-derive to describe the narrowed set, with the full-batch `RECORDS` figure kept beside it, struck through (R21).
4. **Decide one request.** An Approver opens an Imported request and chooses Approve or Reject; before confirming, the affected row shows inked-but-unbalanced against the control total (R17/BR7); on confirmation, the existing re-read-before-submit guard runs unchanged (`expense-decisions` BR1), and on success the control total rolls down with zero layout shift while the row inks its gutter mark and desaturates (R22).
5. **Select and bulk-approve.** An Approver selects several Imported requests; the control block shows the live selected count and its total value beside the batch total (R19); the bulk-approve confirmation names the exact count and the pre-commit proof line is visible before it is accepted (R17/BR7); on confirmation, the existing bulk-approval race handling, outcome reporting, and partial-failure retry (`bulk-approval-and-live-refresh` R1–R10) run unchanged, and the control total rolls once for the resolved batch.
6. **Export.** Either role exports whatever the current narrowing shows; the export itself, its unmasked account-number column, and its exporter attribution are unchanged from `csv-export`.
7. **Read on a narrow viewport.** On a viewport ≥360px, each request presents its primary identifier, two to three key values, and an action overflow (R4); the gutter marks remain legible at that width.
8. **Watch the batch stay honest while others decide.** With the list open, self-refresh continues on its existing cadence (`bulk-approval-and-live-refresh` R3/BR6–BR9); a request another approver decides updates in place, its row desaturates and inks its gutter mark, and the control totals reflect the new count without the reader doing anything.

---

## Feature NFRs

- **Render budget holds with the redesign.** The p95 ≤ 400ms one-page render budget at the 10,000-request volume (R8) must hold with the new control block, gutter marks, and tabular-digit-roll transition in place — the roll animation itself must not push a decision's visible update over budget.
- **Reduced-motion parity.** The reduced-motion path (R22/BR8) must reach the exact same end state as the animated path — this is a functional-equivalence requirement, not merely an accessibility courtesy, since the two paths render the same information at the same moment either way.
- **Craft bar is the acceptance bar, not polish.** Per the design brief's own honest risks (§3): this world's discipline is withholding — no cards, no shadows, no pills to hide behind. If the type scale (R16's ~8:1 contrast) and the rule weights are not exactly right, the result reads as unstyled HTML rather than as a designed artifact, and that failure mode looks identical to "we did not finish." This is an explicit acceptance concern for EPIC-END review and MANUAL-TEST, not an implementation detail to wave through as "just CSS."
- **Mono figures must not read cold.** The saturated `--brand-accent` field on the control block (R25) is the one element keeping the mono-figure density institutional rather than thermal-printed/receipt-like (design brief §3, Honest risk 2) — do not soften or omit it.

---

## Out of Scope

- **Import preview and rejected rows, upload, submitted-files list, the landing screen, sign-in** — later epics in the redesign sequence (design brief §4, "Breadth and order": the request list leads, then import preview + rejected rows, then upload, files list, landing, sign-in). This epic must leave every one of these working and visually intact on the shared token/font layer it changes (R28), but does not restyle any of them.
- **`DESIGN.md`** — owed at the end of the whole redesign effort, written by the `impeccable-documenter` from the built world, not authored as part of this brief or this epic's deliverable (design brief §7, point 2).
- **Relaxing UI-16's 50-row page cap** toward a virtualised long list — explicitly called out in the design brief as a requirements change outside this epic's scope (design brief §7, point 1). The density tension is resolved by the control block stating batch-level truth while a page shows 20 — not by changing the page cap.
- **Any change to server contracts, the data model, roles, authentication, backend connectivity, or the compliance domain** — all confirmed unchanged for this epic (`projectChangesUnchanged`); nothing in this brief alters `project.md` §Roles, §Authentication, §Data Source, or §Compliance.
- **Any new user-facing capability.** This epic is a redesign of presentation only; no epic upstream of it gains or loses a capability as a result of this brief.

---

## Notes & Caveats

- **No prototype source exists for this project** (docs-only intake, confirmed across every prior epic's brief) — no prototype shortcuts to carry forward here.
- **This epic is where the already-recorded styling change lands.** `project.md` §Styling & Branding, §Colour strategy, and §Design authority were updated ahead of this brief (user-confirmed 2026-08-17) — this brief implements those decisions; it does not re-decide them. If anything in this brief appears to conflict with `project.md`'s current styling sections, `project.md` governs.
- **Two honest risks are named directly in the design brief (§3)** and are restated above as acceptance concerns rather than left implicit: (1) the discipline is withholding — a hairline short of exact reads as unfinished, not as restrained; (2) mono figures at density can read cold/receipt-like without the saturated control-block field holding the institutional register. Both should be treated as explicit review criteria, not incidental style notes.
- **Cross-surface reach is informational for this epic, not a requirement of it.** The design brief's §3 table (Cross-surface reach) sketches how import preview, upload, files list, landing, and sign-in would eventually take on this world — useful context for not accidentally boxing in a later epic, but none of those rows are requirements here.
- **The UI-16 density tension is explicitly resolved by design, not exception** (design brief §7, point 1) — do not read the 428-row/22-page volume test (R10) as an invitation to relax the page-size cap; the control block is what lets a batch-level truth coexist with a 20-row page.
- **`StatusBadge` is in scope; nothing else in `components/status/`** beyond it is implicated by this brief unless a later requirement above names it.

