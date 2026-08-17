# Story 3: One ruled strip of fields to narrow by

| Field | Value |
|---|---|
| Epic | `request-list-redesign` |
| Slug | `story-3-one-ruled-strip-of-fields-to-narrow-by` |
| Route | `/requests` |
| Target file | `web/src/components/requests/RequestNarrowingControls.tsx` |
| Page action | `modify_existing` |
| Roles | Importer, Approver |
| Requirement IDs | R12, BR6, R6, R7, R27, BR2 |
| Infrastructure only | false |

## Plain summary

The search box and filters stop being a row of boxes and become one ruled strip of underlined fields with small capitalised labels. Everything you could search, filter or clear before still works exactly the same, and so does the export and who is allowed to see what.

## Summary

Rebuilds `RequestNarrowingControls` as a single ruled field strip — underline-only inputs with no bordered/boxed styling, tracked micro-labels — while preserving all six narrowing fields (status, originating file, transaction type, amount range, transaction date range, free-text search), their combination semantics, the clear-all action and the in-place invalid-range reporting that never applies a reversed range. Re-seats the actions that sit with the strip (export, select-everything, bulk approve) in the same notation, keeping hidden-never-disabled role gating and the Approver-only duplicate notification intact.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | The narrowing controls read as one ruled strip of underlined fields with small capitalised labels and no boxes around them, and every field that was there before is still there. | `vitest` |
| AC-2 | Searching and each filter still cut the list down the same way they did, and using several at once still combines them the same way. | `playwright` |
| AC-3 | Clear all still drops the whole narrowing in one action and brings the full batch back. | `vitest` |
| AC-4 | A range typed the wrong way round is still reported next to the fields and is still not applied — the list stays exactly as it was. | `vitest` |
| AC-5 | Export still hands over exactly what the current narrowing leaves, with account numbers whole in the file and the file attributed to whoever produced it. | `vitest` |
| AC-6 | An Importer sees no decision controls, no bulk approval and no possible-duplicate notification anywhere on the screen; an Approver sees all of them. | `vitest` |

## Manual test checklist

- Look at the narrowing area → underlined fields with small labels, no boxes, all on one strip
- Search for a reference, then also pick a status → the list narrows by both together, as before
- Enter a minimum amount higher than the maximum → you get a message next to the fields and the list does not change
- Click Clear all → every field empties and the whole batch is back
- Export while narrowed → the downloaded file contains only what was listed, with full account numbers and your name on it
- Sign in as an Importer → no Approve, Reject or bulk approval controls appear anywhere on the screen

## Implementation notes

**Six fields, all of them preserved (BR6):** status, originating file, transaction type, amount range, transaction date range, free-text search. Their combination semantics and the clear-all action are unchanged. This story restyles the *controls*; it does not touch `web/src/lib/transactions/narrowing.ts`.

**The invalid-range behaviour is subtle and load-bearing.** A range entered the wrong way round is reported **in place** and **never applied** — the list stays exactly as it was. Underline-only inputs remove the border that currently carries the error state, so the error needs a new home in the notation (a rule-weight or colour change on the underline plus the in-place message). Do not solve it by reintroducing a box, and do not move the message into a toast.

**Underline-only inputs and WCAG 1.4.11.** `--input` is deliberately darker than `--border` precisely so a field's outline clears 3:1 against the background. An underline is now the *only* thing marking the field, so it must use `--input` (or darker) — not `--border`. Getting this wrong is an accessibility regression that looks like a styling choice.

**Shadcn primitives still apply (CLAUDE.md §1).** Compose the existing `input`, `select`, `label` primitives and restyle via tokens/classes — do not hand-roll raw HTML inputs to get the underline look.

**R7 / R27 — hidden, never disabled.** An Importer must not see decision controls, bulk approval, or the possible-duplicate **notification** *at all*. Not greyed, not `aria-disabled`, not present-and-hidden-by-CSS. AC-6's negative sweeps all pass `{ hidden: true }`, so present-but-`aria-hidden`, present-but-`display:none` and present-but-disabled each fail exactly as a working control would.

**⚠ AC-6 means the notification, NOT the duplicate mark.** Read literally, "no possible-duplicate notification anywhere" would have an Importer see nothing duplicate-related — but `expense-request-list` story 6 AC-3/AC-4 already require the Importer to **see the row mark** while being **notified** of nothing. The distinction is load-bearing: the *mark* is shared, the *notification* is Approver-only. Story 3's Vitest spec encodes notification-only and asserts the mark is still present for the Importer, so **AC-6 cannot be satisfied by deleting the mark.**

**New contract the spec introduces — implement it deliberately.** Neither the brief nor the design brief states an accessibility-tree shape for "one ruled field strip". The spec pins the only non-CSS half: the eight controls of the six narrowings live inside **exactly one** grouping element (a `<fieldset>` / `role="group"`) whose accessible name contains **"narrow"** (e.g. `<fieldset><legend>Narrow the batch</legend>`). This is the single new assertion in the file and the one all five tests currently fail on — so build it on cycle 1 rather than discovering it as a failure.

**Export is untouched behaviourally (R6, `csv-export` R1–R4):** narrowing-respecting scope, whole account numbers in the file, exporter attribution. Only its presentation moves into the strip's notation.
