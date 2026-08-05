# Story 6: Possible duplicates marked, and the Approver told

- **Epic:** `expense-request-list` — The shared expense request list
- **Slug:** `story-6-possible-duplicates`
- **Requirements:** R4, R8, R21, BR2, BR3
- **Roles:** Finance Uploader (`ROLE_IMPORTER`) sees the marks; Approver (`ROLE_APPROVER`) also notified
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary

When two imported requests share the same account number, amount and transaction date, both are marked in the list as possible duplicates before anyone decides on either — visible at a glance without opening them. Rejected requests are left out of the comparison, and an Approver opening the list gets an in-app notification when duplicates are found.

## Technical summary

Computes the duplicate flag **client-side over the whole fetched set on load** per BR3 — the key is `AccountNumber` + `Amount` + `TransactionDate`, **both** matching requests are flagged, and **rejected requests are excluded from the comparison set**.

Marks the flag in the list as **text plus an intent colour** (never colour alone), readable without opening the request, and notifies an **Approver** — and only an Approver — through the root layout's existing `ToastProvider` when the load finds at least one possible duplicate.

Marks are computed over the **full** set, not the visible page, so they survive narrowing (stories 2–3), sorting and paging (story 4).

Live/self-refresh recomputation belongs to `bulk-approval-and-live-refresh`; this epic computes **on load only**.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | When two imported requests share the same account number, amount and transaction date, both are marked as possible duplicates in the list before either has been decided. | vitest |
| AC-2 | Rejected requests are left out of the comparison — a rejected request is never marked, and never causes another request to be marked. | vitest |
| AC-3 | The possible-duplicate mark is readable directly in the list without opening the request, as wording paired with a colour rather than colour alone. | vitest |
| AC-4 | When the list loads and at least one possible duplicate was found, an Approver is notified in the app; an Importer sees the marks but receives no notification. | vitest |
| AC-5 | A possible-duplicate mark stays on the same requests after searching, filtering, sorting and paging, because the comparison covers every fetched request rather than the visible page. | playwright |

## Manual test checklist

- Import a file with two requests sharing the same account number, amount and date → both appear marked as possible duplicates, in words as well as colour
- Check a rejected request that matches another → neither is marked because of the rejected one
- Sign in as an Approver and open the list while duplicates exist → you get an in-app notification about them
- Sign in as an Importer and open the same list → you see the marks but get no notification
- Search, filter, sort and page through the list → the same requests stay marked

## Infrastructure reuse notes

- The Approver duplicate notification uses the root layout's existing `ToastProvider` / `ToastContainer` (`web/src/contexts/ToastContext.tsx`). `SubmittedFilesList` shows the **announce-once-per-record-id** ref pattern — reuse it so a re-render does not re-notify. Any test rendering the surface renders it inside that provider composition.
- The duplicate mark reuses the shared status-badge component extracted in story 1 (text + intent colour), with the neutral/warning intent from the `globals.css` tokens — no hex literals, no fourth badge implementation.
- Compute the flag **once per load** over the full fetched set and carry it on the row model, so narrowing/sorting/paging cannot change which requests are marked.
- Colour, type face and radius come only from the tokens in `web/src/app/globals.css` — no hex literals, no Tailwind palette utilities.
- Playwright alert/status queries must be scoped to a region (e.g. `getByRole('main').getByRole('alert')`) — Next renders a permanently empty body-level `role="alert"` route announcer.

## Notes

- **Get the exclusions right.** BR3 excludes rows belonging to **cancelled files** and **rejected requests** from the comparison set. A naive "any two rows sharing account+amount+date" comparison over-flags. Rejected requests are excludable from the response itself (`Status`); cancelled-file rows are assumed never to reach this list at all — see the assumption below.
- **Unverified assumption (in the manual-test ledger):** a cancelled file's requests are assumed never to be returned by `GET /v1/transactions` (`requirements-application.md` §2.3 key invariant). If the service does return them, requests will be marked that should not have been compared. Do not add a client-side cancelled-file exclusion on speculation — surface it at manual test.
- **Unverified assumption (in the manual-test ledger):** the date comparison uses `TransactionDate` as the service writes it. Inconsistent formatting can cause two genuine duplicates to be missed. Story 3's date-range filter shares this assumption.
- R14's neutral/"cancelled" status colour stays available in the shared badge component but is not expected to be exercised by any `Transaction.Status` value in this epic — its absence in test data is expected, not a bug (brief Notes & Caveats).
- The notification is **role-gated to the Approver** (R21) — unlike the previous epic's import notification, which was deliberately not role-gated. Do not copy that story's ungated behaviour.
- This story computes on load only. Recomputing as the list self-updates is `bulk-approval-and-live-refresh`; do not pre-empt it with polling here.
