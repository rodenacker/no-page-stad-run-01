# Story 1: The app's new face, ink and the direction on record

| Field | Value |
|---|---|
| Epic | `request-list-redesign` |
| Slug | `story-1-new-face-ink-and-direction-on-record` |
| Route | `/` (root layout — affects every screen) |
| Target file | `web/src/app/layout.tsx` |
| Page action | `modify_existing` |
| Roles | Importer, Approver |
| Requirement IDs | R23, R24, R25, R9, R28, BR9, BR10 |
| Infrastructure only | false |
| Introduces shared surface | **true** — this is the epic's shared-surface story (root layout + token layer) |

## Plain summary

The whole app changes typeface and the way its blues are spent, and the design's intent is written into the page itself so anyone can check later that what shipped is what was agreed. Every screen — including the six not being redesigned — must come through this looking right.

## Summary

Retires Cabin and loads **Public Sans** (all text) plus **Azeret Mono** (figures, references, masked account numbers, control totals, field labels) self-hosted through `next/font` in the root layout, keeping the existing `--font-*` token indirection in `globals.css` rather than naming faces in components. Writes the direction contract as an HTML comment as the **first child of `<body>`**, carrying `THESIS` / `OWN-WORLD` / `STORY` / `FIRST VIEWPORT` / `FORM` (seed key `29469d17`) and the verbatim `FINISH` line, and confirms it survives the production build. Confirms the token layer still populates `:root` and `.dark` for every token used, that `--primary` keeps its dark foreground, and that sign-in, landing, upload, submitted files, import preview and rejected rows are all still intact on the changed shared layer.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Every screen's text is set in the new typefaces — the institutional text face for words, the typewriter-style face for figures, references and masked account numbers — and the old face appears nowhere. | `playwright` |
| AC-2 | The page the app serves carries the design's direction statement as the very first thing inside the page body, including the design's own reference key. | `playwright` |
| AC-3 | The six screens this epic does not redesign — sign-in, the landing screen, upload, the submitted-files list, a file's import preview and its rejected rows — all still open and read correctly on the new face and colours. | `playwright` |
| AC-4 | Light and dark are both still decided before the screen first paints, and a remembered choice still beats the operating system's setting. | `playwright` |
| AC-5 | Both light and dark draw every surface from the shared palette — nothing loses its colour, and no text loses its readability, in either one. | `none` |

## Manual test checklist

- Open any screen → the text is in a new typeface and figures look like typewriter figures; nothing looks like the old font
- Visit sign-in, the landing screen, upload, the submitted-files list, a file's import preview and its rejected rows → each one still looks finished and readable, not half-restyled
- Switch to dark and walk the same screens → every one is readable, nothing is washed out or invisible
- Reload the app with dark chosen → it comes up dark immediately, with no flash of light first
- Look at a figure and a word side by side → the figures line up in columns because they are all the same width

## Implementation notes

**Both faces are verified present in `next/font/google`** and both are variable with a full `100–900` `wght` axis — Public Sans (`Public_Sans`) and Azeret Mono (`Azeret_Mono`). The wide weight axis is what makes R16's ~8:1 scale contrast in story 2 readable rather than merely large; use it.

**Keep the `next/font` indirection.** The established pattern declares the face in `web/src/app/layout.tsx` exposing only a CSS variable, wired to `--font-sans` in `globals.css` `@theme inline`. Replace `--font-cabin` with the two new variables and add a `--font-mono` wiring for Azeret Mono. **No component may name a face** — that is what keeps the swap a one-file change.

**The direction contract (R23, BR10).** An HTML comment, first child of `<body>`, ≤150 words, five blocks plus the closing `FINISH` line. It must be emitted markup, not a JSX-stripped comment — a `{/* … */}` JSX comment is compiled away and will NOT survive. After the first production build, grep `web/.next` for `29469d17`; BR10 fails if it is absent. The `FINISH` line is verbatim: `FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance`.

**R28 is the real risk in this story.** Six screens are not being restyled but all of them ride this shared layer. Changing the app's typeface changes every metric on every screen — line lengths, wrapping, button widths, table column widths. AC-3 exists to catch that, and its Playwright coverage is the cheapest place to catch it.

**Do not touch the reduced-motion block.** `globals.css` already ends with a global `@media (prefers-reduced-motion: reduce)` rule forcing durations to `0.01ms` app-wide. Story 9's digit roll must work *with* it; do not weaken it here.

**`--primary-foreground` is deliberately the dark ink (5.9:1), not white** — white on `#00AEEF` is 2.5:1 and fails. Keep it. Story 1's Vitest spec *computes* this from the palette via WCAG relative luminance rather than pinning a hex, so changing it to white fails the test rather than silently passing.

### ⚠ BR10 has no automated coverage — it needs an explicit build-grep step

**Neither test layer can verify BR10.** Playwright can see the direction-contract comment in the served DOM, but it cannot prove the comment survived a **production build** — and BR10's requirement is precisely that. Without a deliberate step, BR10 ships unverified.

The check, to be run by the developer on this story and again at EPIC-END after the quality-check's `build` gate produces `web/.next`:

```bash
(cd web && npm run build) && grep -rl "29469d17" web/.next | head
```

**A non-empty result is the pass.** An empty result means the build erased the contract — most likely because it was written as a JSX comment (`{/* … */}`), which the compiler strips. It must be **emitted markup**: a real HTML comment placed as the first child of `<body>` in the root layout, not inside a slotted or child component.

**⚠ React cannot render a comment node at all.** This is harder than "don't use a JSX comment", and it is where a first attempt will fail:

- `{/* … */}` is stripped by the compiler — nothing reaches the output.
- `{'<!-- … -->'}` as a text child is **HTML-escaped** into `&lt;!-- … --&gt;`, which is visible text, not a comment.

So the comment has to be injected as raw markup (e.g. via `dangerouslySetInnerHTML` on a wrapper, or another technique that writes directly into the streamed markup). Story 1's Playwright spec asserts AC-2 against **the navigation response's own bytes**, not the live DOM — precisely because a comment node cannot be observed the usual way — and its failure message reports exactly what it found instead, so the constraint is unambiguous at implementation time.

**Why the spec does not probe `var(--font-mono)` at runtime.** Under `@theme inline`, that token dereferences a `next/font` variable declared on `<body>`, so reading it at `:root` is invalid-at-computed-value-time and would fail a *correct* implementation. AC-1's figure-face clause is therefore asserted as "the mono face is declared, self-hosted, and really downloads app-wide" — not "element X renders in it". Which elements take the mono face is decided by stories 2, 5 and 7, not here.

**AC-4 will likely pass before this story is implemented.** It is a pure guard on the root layout and was deliberately not contorted to manufacture a red. AC-3 *is* red, because it additionally requires all six unredesigned screens to be set in the new text face.

Record the grep result in the story's commit body so the evidence is auditable rather than asserted.
