# Story 6: The exception gutter down the left

| Field | Value |
|---|---|
| Epic | `request-list-redesign` |
| Slug | `story-6-the-exception-gutter-down-the-left` |
| Route | `/requests` |
| Target file | `web/src/components/requests/ExpenseRequestList.tsx` |
| Page action | `modify_existing` |
| Roles | Approver, Importer |
| Requirement IDs | R15, BR5, R18, R20, R5, R7, BR2 |
| Infrastructure only | false |

## Plain summary

A narrow two-character column is permanently reserved down the left of the listing. It is empty on an ordinary row and marked on one that needs attention or has already been decided, so you find the exceptions by scanning one thin column instead of reading nine. Ticking a request to approve it now happens in that column too, and decided requests stay listed but go quiet.

## Summary

Adds a permanently reserved two-character gutter as the listing's first column — never collapsed to zero width — carrying the four structurally distinct status marks from story 4 plus the possible-duplicate mark. Moves selection into the gutter itself, composed as one of its marks, and removes the bolted-on checkbox column, while preserving selection semantics exactly: Approver-only, awaiting-decision-only, absent-not-disabled for anyone else, survival across narrowing / ordering / paging, keyboard completability, and the transient lock while a bulk approval is in flight. Decided rows desaturate to ink-on-ground with the gutter mark carrying the decision; only awaiting-decision rows hold full contrast.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | A narrow two-character column runs down the left of every row — empty on an ordinary row, never collapsed away even when nothing on the page needs marking. | `vitest` |
| AC-2 | A request that needs attention and each decided state carry a different mark in that column, distinguishable while ignoring colour entirely. | `none` |
| AC-3 | Ticking a request to approve it happens in that left-hand column itself — there is no separate tick-box column beside it — and requests select and deselect exactly as before. | `vitest` |
| AC-4 | A selection can be made and undone using the keyboard alone, and it survives narrowing, re-ordering and moving between pages. | `playwright` |
| AC-5 | A decided request stays in the list but goes visibly quiet, while requests still awaiting a decision keep full contrast. | `none` |
| AC-6 | Only an Approver is offered selection, and only on requests still awaiting a decision — for anyone else there is no selection control on the screen at all. | `vitest` |

## Manual test checklist

- Open the request list → a narrow blank column runs down the left of every row, and marked rows stand out in it
- Scan only that left column → you can find the possible duplicates and the already-decided rows without reading any other column
- As an Approver, tick a request → the tick happens in that left column, not in a separate tick-box column
- Tick several requests, then search, sort and move to another page → the same requests are still ticked when you come back
- Tick and untick a request using only Tab and Space → it works, and you can always see where the keyboard is
- Look at an already-approved row beside one still awaiting a decision → the decided one is visibly quieter but still fully readable

## Implementation notes

**BR5 is exact:** the gutter is **two characters wide** and **permanently reserved** — present and empty on every ordinary row, never collapsed to zero width when nothing on the page needs marking. An empty gutter is the design, not wasted space: it is what makes the marked rows findable by scanning one column.

**Selection moves *into* the gutter, composed as one of its marks (AC-3).** The existing checkbox column is removed, not hidden. This is the riskiest part of the story: selection semantics must be preserved exactly —

- Approver-only, and only on requests still awaiting a decision.
- **Absent, not disabled**, for anyone else (R7).
- Survives narrowing, re-ordering and paging (`bulk-approval-and-live-refresh` R1–R10) — reuse `web/src/lib/transactions/selecting.ts` untouched.
- The transient lock while a bulk approval is in flight stays.
- Keyboard-completable with a visible focus indicator (R5, WCAG 2.2 AA).

**Keep the Shadcn `checkbox` primitive underneath.** A gutter mark that *is* the selection control still needs a real, focusable, `aria`-correct checkbox — restyle it, do not replace it with a `div` and a click handler. AC-4's keyboard assertion depends on it being a real control.

**R20 — desaturate, don't hide.** A decided row stays present (audit trail; concurrent approvers must see it was decided) but drops to ink-on-ground so only awaiting-decision rows hold full contrast. **Desaturated still means readable** — this is not a disabled state, and it must not fall below the contrast bar. It is a *relative* contrast move, not a dim.

**Story 4 must land first** — the four structurally distinct shapes live in the shared `StatusBadge`, and this gutter consumes them at two-character width. Do not define a second set of shapes here.

**Non-obvious coupling — do not break it.** The bulk-approve confirmation in `ExpenseRequestList` is gated on `bulkApprovalAsked` **alone**, deliberately *not* also on the selection being non-empty. An inline comment explains why: a dialog that unmounts itself never reports itself closed, which would leave self-refresh paused for the rest of the session. This story rewires the selection area; that gate must survive intact.
