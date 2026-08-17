# Design brief — The Batch Listing

**Status:** CONFIRMED by the user 2026-08-17. This is a design requirements document
for a redesign epic. It is an input to PLAN, on the same footing as
`requirements-application.md`.

Produced by the `impeccable` skill's `shape` flow (discovery → `new-work` visual-world
selection → confirmed brief). Product truth for this app lives in `/PRODUCT.md`.

| Field | Value |
|---|---|
| Visitor mode | Operate |
| Visual world | The Batch Listing — clearing-house payment batch / BACS reject listing |
| Selection method | `concept-seed.mjs --scope direction --mode operate`, seed key `29469d17`, assigned index 3 |
| Build path | code-led (no image generation available; ambition lives in the direction contract, audited at finish) |
| Focal surface | the expense request list (`web/src/components/requests/*`) |
| DESIGN.md | owed, but written **at finish from the built world** — never before the build |

---

## 1. Job and audience

Two roles on one shared queue.

- **Importer** (finance) — pushes CSV batches in, clears rejected rows, re-submits corrections.
- **Approver** (one to three, working concurrently) — works a batch down to zero. One irreversible, attributed decision per request.

Both are finance staff, not power users or developers. Visitor mode is **Operate**:
expression may never obscure the task, the state, or a familiar affordance.

**Confirmed usage scene: high-volume scanning.** Most rows in a batch are
unremarkable; a few are anomalies (possible duplicates, unfamiliar payees, odd
amounts). The job is finding the exceptions and clearing the rest. Every design
decision below serves that.

## 2. Outcome and proof

Success is a batch reconciled to zero, with no wrong decisions and a trail that
survives audit.

The product-specific truth a neighbouring admin tool could not claim:
**adjudication under audit, on a shared screen.** Decisions are single, final and
attributed; account numbers are masked in the interface but whole in an attributed
export; and because several approvers work the same queue at once, the interface is
obliged to stay truthful about what a colleague has already decided.

Real evidence on hand: `transactions_2026-04-15.csv`, two live OpenAPI specs, the
requirements catalogue, nine shipped epics. **No customers, benchmarks, pricing or
usage figures exist.** Demonstration rows may be authored at full fidelity and
labelled synthetic; commercial or factual claims may not be invented.

## 3. Selected direction — The Batch Listing

### Visual authority

The clearing-house payment batch listing, and its appended reject listing — the
printed control artifact a bank's payments operation produced for every batch it ran.
Machine notation. **Alignment is the only structure:** no cards, no pills, no
container chrome. Hairline rules only where a rule carries meaning. Tabular figures
throughout.

### Structural thesis

The screen **is** the batch's control document, worked down to zero — not a dashboard
that happens to contain a table.

It refuses the category default it currently ships: a white card wrapping a striped
data table under a row of KPI tiles.

### Sequence

1. **Control block**, full-bleed, brand-blue field — not a page title above a table.
   `BATCH / RUN DATE / RECORDS / AWAITING DECISION / DECIDED / TOTAL VALUE`, as 11px
   tracked mono labels over tabular figures.
2. **One ruled field strip** of narrowing controls. Underline-only inputs, no input
   boxes, tracked micro-labels.
3. **The listing**, full-bleed to the page padding. Hairline row rules, 11px tracked
   mono column heads, every figure right-aligned and tabular, reference and masked
   account in mono.
4. **The continuation line** as footer: `RECORDS 1–20 OF 428 · PAGE 1 OF 22`, with
   the page-size selector as a field. UI-16's always-visible disabled navigation
   reads naturally here, because a listing always states its continuation.

### Focal moment

**`AWAITING DECISION` at display scale** — the largest thing on the screen by a wide
margin, because it is the number the whole session exists to drive to zero.

**A permanently reserved two-character gutter** down the left of the listing. Empty
for an ordinary row; marked for one that needs attention or has been decided. The eye
scans one narrow column, not nine columns of coloured pills. This is the single most
valuable move for the confirmed usage scene. Selection lives in the gutter too —
not in a checkbox column bolted on beside it.

### Signature interaction

**The control total settles.** When a decision resolves — single or bulk —
`AWAITING DECISION` decrements with a mechanical tabular digit roll, changing in
place with **zero layout shift** because the figures are tabular, while the decided
row inks its gutter mark and desaturates. One orchestrated motion, the artifact's own:
a number that must balance, rebalancing. Snaps under `prefers-reduced-motion`.

### Raises carried in, named for their donors

Each is a discipline donated by a challenger this direction beat in the roll. A raise
nobody can read did not happen — each must be visible in the built result.

| Donor | Verdict | Raise |
|---|---|---|
| Variable-Font Specimen | competitive | **Scale contrast carries the entire hierarchy** — roughly 8:1 between the control figure and its 11px tracked label, with no middle tier invented to soften it. |
| Darkroom Safelight Bay | declined | **The irreversible threshold is visible before you cross it.** Before an irreversible decision commits, the affected rows show inked-but-unbalanced against the control total: you see what the batch will look like after committing, and the total visibly does not balance until you do. |
| Tensegrity Breathing Column | declined | **Four statuses structurally distinct as shapes.** Imported / approved / rejected / cancelled each get a different gutter mark and rule treatment, legible scanning down the gutter *before* colour or text is read. Over-satisfies UI-21. |
| Cassette J-Card | declined | **A running subtotal you can watch fill.** A bulk selection shows live count **and total value** in the control block beside the batch total — the money being committed, not just a row count. A real safety feature for a payments product. |
| Character Goods Catalog | declined | **The finished thing recedes without disappearing.** A decided row stays present (audit trail; concurrent approvers must see it was decided) but desaturates to ink-on-ground with its gutter mark carrying the decision, so only awaiting-decision rows hold full contrast. The batch visibly works itself to zero. |
| Alphabet Storm | declined | **A narrowing has visible physical consequence.** Applying a filter re-derives the control totals to describe the narrowed set, keeping the full-batch figure beside it struck through — so a narrowing is never a silent state you forget you are in. |

### Typography — CONFIRMED

| Role | Face | Why |
|---|---|---|
| Text | **Public Sans** | The institutional-forms face (US Web Design System, from Libre Franklin) — genuinely an object from this audience's document world. Real tabular figures. Workhorse, correct for Operate. |
| Figures, references, masked accounts, control totals, field labels | **Azeret Mono** | Squarish institutional mono. Carries the fixed-field notation the world is built on. |

Two faces, no more. Neither appears on impeccable's saturated-defaults list. **Cabin is
retired** — it was a documented stand-in for the unloadable proprietary "Barclays
Effra", never a brand decision (user-confirmed 2026-08-17). Do not attempt to source
"Barclays Effra".

Both faces are loaded and self-hosted through `next/font` in the root layout, as Cabin
is today.

### Colour strategy — Restrained, spent at page scale

**Restrained** (neutrals plus one accent) is the correct strategy for Operate. But it
is spent at **page scale**, not scattered as accents:

- `#006DE3` (`--brand-accent`) owns the **whole control block** as a saturated field.
  This finally spends a token that is currently declared in both themes and used
  nowhere.
- `#00AEEF` (`--primary`) carries interactive state and gutter marks.
- Everything else is ground, ink, hairline and the four semantic status tokens.

**Light is primary.** The physical scene forces it: a paper-derived control artifact
read in a finance office under daylight, alongside a CSV and an email thread. **Dark
ships as an equal citizen** (a standing brand commitment), rendered as the same
listing under a different press — warm neutral ink on the dark ground, never a neon
terminal.

Contrast discipline is inherited, not renegotiated: the brand blues are light colours,
and the existing token layer already pairs `--primary` with dark text at 5.9:1 rather
than white at 2.5:1. Any re-spend keeps that.

### Cross-surface reach

| Surface | Under this world |
|---|---|
| **Import preview + rejected rows** | The world's strongest fit — these *are* the source artifact. A listing shown pre-commit, with the reject listing appended at the back exactly as the document does it. Should follow the request list immediately. |
| Upload | The batch's submission slip, in the same control-total grammar. |
| Files list | A register of batches, one ruled line each with its control totals. |
| Landing | A run sheet — today's batches and their outstanding counts — not entry-point cards. |
| Sign-in | The listing's cover sheet: brand field, wordmark in the notation grammar, one field pair. |
| Status | A ruled mark with glyph plus tracked label. Satisfies UI-21 natively rather than by bolt-on. |

### Honest risks

1. **This world's discipline is withholding.** Strip the boxes, shadows and pills and a
   weak hierarchy has nothing left to hide behind. If the type scale and rule weights
   are not exactly right it reads as unstyled HTML rather than as a designed artifact —
   and that failure mode looks identical to "we did not finish". The craft bar is not
   optional here; it is the whole thing.
2. **Mono figures at density can read cold and receipt-like.** The saturated brand field
   on the control block is the single element keeping it institutional rather than
   thermal-printed. Do not soften it.

## 4. Scope and boundaries

- **Fidelity:** production-ready, against the real backend contract, behind the existing quality gates.
- **Breadth and order:** the expense request list leads and sets the standard. Then import preview + rejected rows. Then upload, files list, landing, sign-in.

### Must remain untouched

- The token discipline in `web/src/app/globals.css` — every value a named token, both `:root` and `.dark` populated, no hex literals, no inline colour functions, no Tailwind palette utilities (`styling-centralisation.md` rules 1–5).
- The brand blues (`#00AEEF` / `#006DE3` / `#001276` and their dark counterparts).
- WCAG 2.2 AA on every surface; every action keyboard-completable, including selection, bulk approval and rejection-with-note.
- **UI-16** — page-size selector always present offering 5/10/20/50, default 20, navigation visible in a disabled state when there is one page.
- **UI-21** — status is intent-mapped colour **paired with** an icon or text label, never colour alone.
- **UI-23** — narrow devices show each request's primary identifier, two to three key values and an action overflow, with no horizontal page scroll.
- Hidden-never-disabled for capability a role lacks.
- Account masking in-app; whole account numbers and exporter attribution in the CSV export.
- The auth, session and gating model. Theme resolution before first paint.
- Render budget: p95 ≤ 400ms for one page of the list at the 10,000-request volume.

### Free to change

DOM structure, class names, layout, component composition. Existing Vitest and
Playwright specs may be updated where the redesign legitimately changes markup or
presentation — **never** where doing so would weaken a behavioural assertion. Every
user-observable behaviour must still hold.

### Anti-goals

- The SaaS-admin default: sidebar nav, KPI stat tiles, a white card wrapping a striped data table, status pills, a chip filter bar. **This is where `web/` already is** — it is the rut, not the target.
- Its predictable opposite: the dark "fintech terminal" — near-black ground, neon-green mono figures, glowing edges.
- Suppression directives of any kind (`eslint-disable`, `@ts-expect-error`).
- Any colour value outside a named token.

## 5. States and ranges

**Volumes:** 1–10,000 records per batch. Page sizes 5 / 10 / 20 / 50, default 20. The
design must hold at 1 row, at 20, at 50, and across a 428-row batch spanning 22 pages.

**Material states that must be designed, not discovered:**

loading · empty batch · load failure with retry · permission-denied inside the shell ·
possible-duplicate marked (Approver only) · decided-by-someone-else arriving via live
refresh · bulk selection spanning a page · rejection-with-note · session-timeout
warning · rejected rows and correction download · narrow viewport (≥360px).

## 6. Interaction and layout

- **Full-width, left-aligned, no centred column.** This is an existing user decision from manual test and is correct for this world — dense listings need the width.
- **Order of loudness:** control block → gutter → listing. Nothing competes with the control total.
- Horizontal padding stays identical between the header and `<main>`; the app name must line up with the content beneath it.
- Feedback is the control total moving. Nothing succeeds silently.
- Motion is one orchestrated grammar, not scattered hover effects. Reduced-motion honoured.

## 7. Constraints and open decisions

Nothing a builder may invent. Two notes:

1. **The UI-16 density tension is resolved by design, not by exception.** The confirmed
   usage scene is high-volume scanning, but UI-16 caps a page at 50 rows, so scanning
   happens *across* pages. The control block is the batch-level truth: you always know
   where you stand in 428 records while looking at 20. Relaxing UI-16 toward a
   virtualised long list would be a **requirements change**, and is not in this epic's
   scope.
2. **`DESIGN.md` is written at finish**, by the `impeccable-documenter`, from the built
   world — not before the build. A rulebook written first gets defended against reality
   instead of describing it.

### The direction contract

Per `new-work.md` §5, the build's **first act** is to write the direction contract as
an HTML comment placed as the first child of `<body>` in the root layout — where it
survives the production build and can be audited. It carries `THESIS`, `OWN-WORLD`,
`STORY`, `FIRST VIEWPORT`, `FORM` (naming seed key `29469d17`), and closes with the
verbatim `FINISH` line. After the first production build, grep the built output for the
seed key: a contract the build erased is a contract nobody can audit.
