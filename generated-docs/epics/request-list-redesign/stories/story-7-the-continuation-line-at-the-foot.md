# Story 7: The continuation line at the foot

| Field | Value |
|---|---|
| Epic | `request-list-redesign` |
| Slug | `story-7-the-continuation-line-at-the-foot` |
| Route | `/requests` |
| Target file | `web/src/components/requests/RequestListPagination.tsx` |
| Page action | `modify_existing` |
| Roles | Importer, Approver |
| Requirement IDs | R14, R2, R10, BR2 |
| Infrastructure only | false |

## Plain summary

The bottom of the screen stops being a row of buttons and reads like a listing's own continuation line — "records 1–20 of 428 · page 1 of 22" — with the requests-per-page choice presented as a field beside it. Paging, the page sizes on offer and the always-visible back/next controls all behave exactly as before.

## Summary

Restyles `RequestListPagination` as a continuation line in the listing's notation — `RECORDS 1–20 OF 428 · PAGE 1 OF 22` — with the page-size selector presented as a ruled field rather than a control chip. Preserves UI-16 exactly: 5/10/20/50 on offer, default 20, navigation always rendered and merely unusable when the set fits one page, and a page-size change re-cutting from the first page. Verified to hold at one request, at a 20-row page, at a 50-row page and across a 428-request batch spanning 22 pages.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | The foot of the listing reads as one continuation line stating which records are shown, out of how many, and which page of how many — not as a row of controls. | `vitest` |
| AC-2 | The requests-per-page choice is presented as a field, still offers 5, 10, 20 and 50, and still starts at 20. | `vitest` |
| AC-3 | Moving forward and back still walks through the same requests in the same order, and changing the page size re-cuts the list from the first page. | `playwright` |
| AC-4 | When everything listed fits on one page, the back and next controls are still on the screen and visibly unusable, never removed. | `vitest` |
| AC-5 | The continuation line and the listing both hold their shape at one request, at a page of 50, and across a 428-request batch spanning 22 pages. | `playwright` |

## Manual test checklist

- Look at the foot of the list → one line stating which records you are seeing, out of how many, and which page of how many
- Change requests per page to 50 → the line updates and you are back on page 1
- Narrow the list down to a handful → back and next are still there, greyed and unusable, not gone
- Page to the end of a large batch → the line always tells you exactly where you are, and the last page is not broken
- Narrow the list to a single request → the line and the listing still look deliberate, not empty and unfinished

## Implementation notes

**Non-obvious coupling — do not "fix" it.** `RequestListPagination` deliberately renders the page controls in a **plain row rather than a `ul`/`li`**, because at phone width the requests themselves are the page's only list (one `listitem` per request). A well-meaning change to semantic list markup here breaks an accessibility assertion carried over from `expense-file-upload` / `expense-request-list`, for a reason that will look completely unrelated to pagination. Preserve the current structure.

**Page sizes are owned elsewhere.** `PAGINATION.PAGE_SIZE_OPTIONS` in `web/src/lib/utils/constants.ts` owns 5/10/20/50 and the default of 20. This story **restyles the selector; it does not re-declare the options.**

**UI-16 (R2) is a `Must`, and AC-4 is the part usually got wrong:** when the current set fits on one page the navigation is **still rendered** and merely unusable — never removed, never conditionally unmounted. Keep the Shadcn `pagination` primitive and the existing disabled semantics.

**The selector becomes a field, in the strip's notation** (consistent with story 3's underline-only inputs) — but it remains a real, labelled, keyboard-operable `select`. A "field" here is a styling decision, not a semantic one.

**AC-5's volume range is a real test, not a formality.** Two ends break most often: a single request (the line and the listing must still look deliberate, not like an unfinished empty state) and the final page of a 22-page batch (the `RECORDS 421–428 OF 428` case, where a naive range calculation overshoots).

**Figures in mono.** The continuation line is notation — its numerals belong in Azeret Mono so the line doesn't reflow width as you page through.
