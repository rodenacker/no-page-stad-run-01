# Story 5: The listing itself, as a ruled batch listing

| Field | Value |
|---|---|
| Epic | `request-list-redesign` |
| Slug | `story-5-the-listing-itself-as-a-ruled-batch-listing` |
| Route | `/requests` |
| Target file | `web/src/components/requests/ExpenseRequestList.tsx` |
| Page action | `modify_existing` |
| Roles | Importer, Approver |
| Requirement IDs | R13, R1, R6, R8, BR1, BR2 |
| Infrastructure only | false |

## Plain summary

The table stops being a white card wrapping striped rows and becomes a ruled listing running the full width of the page — hairline lines between rows, small capitalised column headings, every figure right-aligned and lined up, references and masked account numbers in the typewriter face. Everything you could do on a row before, you can still do, identically.

## Summary

Restyles the desktop listing in `ExpenseRequestList` to be full-bleed to the page padding with hairline row rules, 11px tracked mono column heads, right-aligned tabular figures, and reference plus masked account number in mono — removing the card/panel wrapper and the striped-table treatment. Preserves the whole behaviour layer untouched: per-column sorting with `aria-sort`, open-request, Approver-only decide controls, duplicate marking, masking with explicit reveal, and the loading / empty-batch / load-failure-with-retry / narrowed-to-nothing states. Existing Vitest and Playwright assertions are re-pointed at the new markup only where the markup legitimately changed, never loosened.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | The listing runs the full width of the page with thin lines between rows and small capitalised column headings — there is no card, panel or striped-row treatment wrapping it. | `none` |
| AC-2 | Every amount and figure is right-aligned and lines up column-perfect down the page, and references and masked account numbers are set in the typewriter face. | `none` |
| AC-3 | Every column heading still orders the list by its own column, both directions, and the order still holds when you move between pages. | `playwright` |
| AC-4 | Account numbers in the listing still show only their last four digits, and opening a single request still reveals the whole number only by a deliberate action. | `vitest` |
| AC-5 | Every control a row offered still works — opening a request, the Approver's Approve and Reject, and the possible-duplicate mark — and an Importer still sees no decision controls. | `vitest` |
| AC-6 | Loading, an empty batch, a failed load with its retry, and a narrowing that leaves nothing all still read clearly in the new treatment. | `vitest` |

## Manual test checklist

- Open the request list → the rows run the full width of the page, separated by thin lines, with no white card around them
- Run your eye down the amount column → every figure is right-aligned and the digits line up exactly
- Click a column heading twice → the list sorts up then down, and the sort is still in force when you move to page 2
- Open a single request → the whole account number is only shown after you deliberately ask for it; the listing still shows four digits
- As an Approver, use Approve and Reject on a row → both still behave as they did before
- Narrow to something that matches nothing → you get a clear message and a way back, not an empty page
- Page through a large batch quickly → pages appear immediately, with no lag or stutter

## Implementation notes

**`ExpenseRequestList.tsx` is ~2,288 lines. This story restyles its desktop presentation only.** The behaviour layer lives in `web/src/lib/transactions/{narrowing,ordering,selecting,duplicates,deciding,bulkApproval,refreshing,exportCsv,sortPreference,display}.ts` and must be **reused untouched, not rewritten**. A rewrite here is exactly how R1/BR2 gets broken silently — the tests would still pass while a combination rule quietly changed.

**Keep `<table>` semantics.** Restyling to hairline rules and full-bleed does not mean abandoning table markup. `aria-sort` on sortable column heads, real `<th scope>`, and a proper header row all stay — losing them is an accessibility regression, and AC-3's assertion depends on `aria-sort`.

**Keep the Shadcn `table` primitive (CLAUDE.md §1)** and restyle through it; don't hand-roll a grid of `div`s to escape the card. The card/panel wrapper and the striped-row treatment are what go.

**Masking has exactly one home.** `web/src/components/requests/MaskedAccountNumber.tsx` is the single masking surface — reuse it. Never inline masking into a restyled row. AC-4's "deliberate action" reveal in the detail panel is existing behaviour; don't move it.

**BR1 in practice.** Where a selector in an existing spec targets markup this story legitimately changes (a class, a wrapper, a cell structure), re-point it. Where a spec asserts *user-observable behaviour* — a sort order, a masked value, a control's presence or absence for a role — that assertion stays exactly as strong. If a change would require weakening one, the change is wrong, not the test.

**Tabular figures.** Azeret Mono is monospaced so its digits align inherently; for any figure set in Public Sans, `tabular-nums` is required. AC-2 is judged by eye down a column.

**R8 — the render budget survives.** p95 ≤ 400ms for one page at the 10,000-request volume. Hairline rules and mono figures are cheap; a per-row shadow, filter, or backdrop would not be. Avoid per-row expensive effects.

**All four states must read in the new treatment (AC-6):** loading, empty batch, load failure with retry, narrowed-to-nothing. With no card to sit inside, an empty state has nothing framing it — it needs deliberate composition rather than a centred sentence on a blank page.
