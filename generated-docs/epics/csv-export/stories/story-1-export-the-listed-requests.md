# Story 1 — Export the requests you are looking at

- **Epic:** `csv-export` — Export requests for the payment system
- **Slug:** `story-1-export-the-listed-requests`
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Roles:** Finance Uploader, Approver — *the sign-in service's own names are `Importer` and `Approver`*
- **Requirement IDs:** R1, R2, R3, BR1, BR3, BR4, BR5, BR6, BR7
- **Infrastructure only:** no

## Plain summary

On the Expense requests screen, either role can export what the list is currently showing as a CSV file for
the payment system — every request their search and filters left, whatever its status, in the order the list
is sorted. The file carries the nine columns the payment system expects, including the full account number
(deliberately unmasked here, and nowhere else in the app).

## Summary

Adds the export trigger to the shared expense request list and a client-side CSV builder. The exported rows
are the **ORDERED, NARROWED** set from the list's existing narrow → order → slice pipeline (all matching
requests, never `requestsOnPage` and never the raw fetched set), mapped to the nine RPT-01 columns with a
header row, RFC 4180 escaping, `AccountNumber` and `TransactionType` written verbatim (no `lastFourDigitsOf`,
no `transactionTypeLabel`), a blank cell for an absent `UserNote`, and a timestamped file name handed to the
existing `deliverFile`. Construction yields so the 10,000-row ceiling does not block the main thread.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Both the Finance Uploader and the Approver see an export action on the expense request list, and activating it saves a CSV file to their device. | `playwright` |
| AC-2 | The saved file holds every request the active search and filters left — all of them, not only the page on screen — in the order the list is currently sorted. | `playwright` |
| AC-3 | The file's first line names the nine columns in the order the payment system expects, and each row carries those nine values with the full unmasked account number, the transaction type exactly as the service sent it, and an empty cell where a request has no decision note. | `playwright` |
| AC-4 | A description or decision note containing a comma, a quotation mark or a line break is written so the file reads back as that same single value instead of splitting into extra columns or rows. | `vitest` |
| AC-5 | The saved file's name identifies it as an expense request export and carries the date and time it was produced, so two exports on the same day are told apart rather than colliding. | `playwright` |
| AC-6 | Exporting 10,000 listed requests still produces the complete file, and the screen keeps responding while it is built rather than freezing. | `vitest` |

## Manual test checklist

- ☐ On the Expense requests screen, click Export → a CSV file is saved to your device, its name carrying the date and time.
- ☐ Open that file in a spreadsheet → the first row names the nine columns in order, and a description containing a comma or a quotation mark sits in one unbroken cell.
- ☐ Look at the account number column → it holds the full number, not the last four digits. This is deliberate: the payment system needs it whole.
- ☐ Narrow the list with the search box or a filter, then export → the file holds exactly the requests that were left on screen, and nothing else.
- ☐ Move to page 2 of the list and export → the file still holds every matching request, not just the page you were looking at.
- ☐ Filter to Imported only (requests nobody has decided yet) and export → those undecided requests are in the file.
- ☐ Sign in as an Approver and export → the Approver gets a file too, for whatever their list is showing.

*Plus 2 technical checks verified automatically.*

## The nine columns (RPT-01, fixed order)

`Reference` · `Transaction date` · `Account number` · `Description` · `Amount` · `Transaction type` ·
`Currency` · `Status` · `Decision note`

## Confirmed design decision — export scope

**The export carries every request currently listed, of any status, for both roles.**

The sources conflict: RPT-01 calls this a report of "decided expense payment requests" and names only the
Finance Uploader, while §6.5, F-21 and UI-06 grant export to both roles with no status gate. This was raised
explicitly at the stories approval and **the user confirmed the unrestricted reading** — the export mirrors
the list, and narrowing the list is how the user chooses what goes in. Do **not** add a status filter or a
"finish deciding first" gate.

## Implementation notes (reuse — do not re-derive)

- `deliverFile` in `web/src/lib/files/deliverFile.ts` is the ONE way bytes become a saved file (name passed
  in, blob address released on the next task). Build the CSV as a Blob and hand it to that — do not write a
  second anchor/link path, and never an `<a href>` at an endpoint.
- The "currently listed" set already exists inside `web/src/components/requests/ExpenseRequestList.tsx` as
  the narrow → order → slice pipeline. Export the ORDERED, NARROWED array
  (`orderRequests(narrowRequests(fetched, applied), sort)`) — **NOT** `requestsOnPage` (would export one
  page) and **NOT** the fetched set (would ignore the narrowing, breaking BR1). Reuse `narrowRequests` /
  `orderRequests` from `web/src/lib/transactions/narrowing.ts` and `ordering.ts`.
- Do **NOT** reuse `lastFourDigitsOf` / `MaskedAccountNumber` or `transactionTypeLabel` from
  `web/src/lib/transactions/display.ts` in the export. BR4/BR5 make this the one place both values are
  written verbatim — an existing helper here would silently satisfy the tests and break the hand-over file.
- `TransactionRead` in `web/src/types/transactions.ts` is the row source; `UserNote` is the only optional
  field (blank cell where absent). `Status` and `TransactionType` are free-form strings by contract.
- The new CSV builder belongs at `web/src/lib/transactions/exportCsv.ts`, alongside `narrowing.ts` /
  `ordering.ts` / `duplicates.ts` / `display.ts` — one place that states the nine columns and their order, so
  the header row and the row writer cannot drift.
- Derive the export on **activation**, not in a memo over the fetched set: the list's rows are memoised and
  its narrowing runs through `useDeferredValue` to hold the 10,000-row ceiling — building a 10,000-row string
  per render would defeat that.
- No access-map change: both roles already reach `REQUESTS_PATH` via `web/src/lib/auth/access-map.ts`, and R3
  grants export to both — so there is **no role check on this control at all**, unlike upload
  (Importer-only) or decide (Approver-only).
- The export control has visible wording, so it owes no tooltip; an icon-only control would owe a Shadcn
  `tooltip` AND a matching `aria-label`.
- Every colour/status treatment stays token-based via `StatusBadge` / `globals.css`.
- Playwright download precedent (reading the delivered bytes and `suggestedFilename()`):
  `web/e2e/epic-file-validation-and-retry-story-3-download-the-original-and-error-files.spec.ts`.

## Watch out

Paging is the likeliest silent bug: the list slices to a page **after** narrowing and ordering, so an
implementer who reaches for the array the rows render from will ship a one-page export that passes a casual
eyeball check. AC-2 and its manual step exist to catch exactly that.
