# Story 1 — Select requests to approve together

- **Epic:** `bulk-approval-and-live-refresh` — Bulk approval and a self-updating list
- **Slug:** `story-1-select-requests-to-approve-together`
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Roles:** Approver, Finance Uploader
- **Requirement IDs:** R2, R4, R7, BR1, BR10, NFR1
- **Infrastructure only:** no

## Plain summary

An Approver can tick several expense requests that are still Imported and see how many are selected at all
times, including a "select everything currently listed" choice. Requests that have already been Approved or
Rejected cannot be selected, and a Finance Uploader is offered no selection controls at all — they are simply
not there, not greyed out.

## Summary

Adds the multi-select layer to the existing shared request list: a per-request selection control offered only
for `Status === 'Imported'` and only to `ROLE_APPROVER` (absent, never disabled, per BR10), a
select-all-currently-listed control, and the ambient selected-count indicator in the list toolbar (exact to 99,
`99+` from 100, hidden at zero). The selection is held as a set of transaction Ids so it survives the existing
narrow → order → slice pipeline; each row receives a plain boolean so the memoised row/card components stay
memoised.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | An Approver is offered a selection control on every request still Imported, and none on a request already Approved or Rejected. | `vitest` |
| AC-2 | A Finance Uploader is offered no selection control and no bulk-approve action anywhere on the list — absent from the screen, not shown disabled. | `vitest` |
| AC-3 | While anything is selected the count of selected requests is visible; with nothing selected the indicator is not shown at all. | `vitest` |
| AC-4 | The count reads the exact number up to 99 and reads "99+" once 100 or more are selected. | `vitest` |
| AC-5 | Selecting requests, selecting everything currently listed, and clearing the selection are all completable by keyboard alone. | `playwright` |
| AC-6 | Searching, filtering, sorting or paging the list changes neither what is selected nor the count — a selected request stays selected even when it is no longer on the page being read. | `vitest` |

## Manual test checklist

- ☐ Sign in as an Approver and open Expense requests → each request still Imported has a way to select it
- ☐ Look at a request that is already Approved or Rejected → it offers no way to select it
- ☐ Sign in as a Finance Uploader and open the same list → there is nothing to select with and no bulk approve action, not even greyed out
- ☐ Select three requests → a count of 3 appears; clear them → the count disappears
- ☐ Select a few requests, then type in the search box or move to the next page → the count still reads what you selected
- ☐ Using only Tab, Space and Enter, select two requests and then clear them → every step is reachable without a mouse

*Plus 1 technical check verified automatically.*

## Confirmed design decisions (settled at the stories approval, 2026-08-11)

Neither of these is stated in the requirements. Both were put to the user with a live demo and **confirmed**:

1. **A "select everything currently listed" control IS included** (AC-5). It selects every *still-Imported*
   request the active search and filters left — not the whole fetched set, and not only the visible page.
   This is what makes R4's `99+` threshold reachable at all.
2. **A selection SURVIVES narrowing, ordering and paging** (AC-6). The tick follows the *request*, not the row
   position. This is why the selection is held as a set of transaction Ids rather than row indices, and it is
   the only reading consistent with a confirmation that names an exact count (BR4). The known consequence —
   the user may approve requests not currently on screen — is accepted deliberately.

**Count placement:** the ambient indicator lives in the **list's own toolbar**, beside the bulk action — not
in the app header. The header is fixed by project convention (nothing in it is hidden at any width), so a
conditional indicator there would fight that. Decided by the orchestrator, disclosed to the user at approval.

## Implementation notes (reuse — do not re-derive)

- `web/src/components/requests/ExpenseRequestList.tsx` is the surface this story modifies. It already owns
  the single fetch, the whole-set-in-memory model, the narrow → order → slice pipeline, the tiered wait, the
  empty/narrowed-empty/failed states, and `openRequestId`. **Extend it; do not build a second list or a
  wrapper around it.**
- Eligibility is `Status === 'Imported'` via `TRANSACTION_STATUS_IMPORTED` / `isKnownTransactionStatus` from
  `web/src/types/transactions.ts`. Never a new string literal, and **never treat an unrecognised status as an
  error** — `Status` is free-form by contract.
- Role gating: `ROLE_APPROVER` from `web/src/types/auth.ts`. `requests/page.tsx` **already** passes
  `rolesOf(session)` into `ExpenseRequestList` (today only to decide who is told about duplicates), so no new
  plumbing is needed to know who is signed in on the client. **Do not** add or change anything in
  `web/src/lib/auth/access-map.ts`: `/requests` is registered for both roles, and per project convention what
  only one role may *do* is a check on the control inside the screen, **hidden rather than disabled**.
- **PERFORMANCE TRAP — this is a real one here.** `architecture.md` § Conventions: rows and cards are memoised
  on stable props (the request itself plus one callback that *takes* the request). Passing a `Set` of selected
  ids down to every row would defeat that memo on every selection change **and** on every 15s refresh
  (story 4). Pass each row a plain `selected` boolean and a callback that takes the request — exactly as
  `possibleDuplicate` is passed today.
- **KNOWN TEST-TIMING DEBT this story makes worse if ignored:** three existing `expense-request-list` tests
  already brush Vitest's 5s per-test timeout under parallel workers because they re-render the whole list per
  keystroke (`architecture.md` § Cross-epic debt). Adding selection state to the same component raises that
  cost — keep the memo discipline above.
- Account-number masking is already structural (`MaskedAccountNumber.tsx` on every row, full value only inside
  one opened request). The selection surface is a listing — it must never print a full account number (POPIA).
- Status display goes through `web/src/components/status/StatusBadge.tsx` with the list's existing
  `STATUS_PRESENTATION` map. No new badge, no colour value in a component.
- An icon-only control (e.g. a clear-selection button) carries a Shadcn `tooltip` **and** a matching
  `aria-label` from the same string. A choice from a fixed set is the Shadcn `select`, never a native one.
- Test fixtures extend `web/src/mocks/data/transaction.ts` (it re-exports the production types and status
  constants so mocks cannot drift). Role-bearing sessions come from `web/src/mocks/data/identity.ts`.
- Playwright role queries for a status or alert must be **scoped to a region** (e.g. `getByRole('main')`) —
  Next renders a permanently empty body-level `role="alert"` route announcer, so an unscoped query always
  matches two elements.
