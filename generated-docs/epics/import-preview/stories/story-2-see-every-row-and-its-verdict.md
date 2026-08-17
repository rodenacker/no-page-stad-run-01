# Story 2 — See every row of the file, and what will happen to it

| Field | Value |
|---|---|
| index | 2 |
| slug | `story-2-see-every-row-and-its-verdict` |
| route | `/upload/file` |
| targetFile | `web/src/components/files/ImportPreview.tsx` |
| pageAction | `modify_existing` (the route and page already exist; this adds a section) |
| isInfrastructureOnly | `false` |
| requirementIds | FR1, FR2, FR3, FR4, FR5, FR8, BR1, BR2, BR3, BR9, NFR-4 |
| roles | Importer, Approver |

**Also touches:** `web/src/lib/files/importPreviewRows.ts` (new — matching and verdict assembly), `web/src/components/files/SubmittedFileDetail.tsx` (renders the new section, passing `file` and the existing `refreshSignal`), `web/src/lib/files/defectWording.ts` (new — extracted from `RejectedRows`, see Reuse notes).

## plainSummary

On a submitted file's page, shows every row of the file you uploaded with a plain verdict on each one — "Will import" or "Rejected" — plus how many of each. It never says a row was imported, because the service has not imported it.

## Summary

A new `ImportPreview` section on `/upload/file`, rendered by `SubmittedFileDetail` alongside `RejectedRows` and `FileDownloadActions` and taking the same `{ file, refreshSignal }` shape (no session or role prop — both roles see everything here). It downloads the original file via the already-wired `downloadSubmittedFile`, parses it with story 1's reader, overlays `fetchFileValidationErrors` + `rejectedRowsIn` to mark rejected rows, and renders the two halves with their two display conventions.

Matching a validation-errors entry to a parsed line lives in `web/src/lib/files/importPreviewRows.ts`, which also implements BR9's fallback.

### The two conventions on one screen (BR3 — read the brief's FACTUAL CORRECTION)

| Half | Account number | Transaction type |
|---|---|---|
| Will-import (✓) | Last four digits, **no** reveal control | App's plain-language label (`transactionTypeLabel`) |
| Rejected (✗) | Last four digits, **with** the per-row reveal `RejectedRows` already uses | The file's own value, **untranslated** |

An earlier brief revision wrongly claimed the shipped `RejectedRows` shows account numbers in full. It does not — it masks them with a per-row reveal, and its own header forbids a reveal-all control. Plan and build against the shipped behaviour.

### Honest wording (BR2 — hard requirement)

A row that passed validation is labelled **"Will import"**. Never "Imported". The backend has not imported it; the app must not claim otherwise. This applies to the row label and the count summary alike.

### Matching (BR9)

`Reference` is the **working assumption** for the join key, but "Reference missing" is itself a rejection reason, so it cannot match every row — and the validation-errors wire shape for this domain is undocumented (the spec's only example is from an unrelated zoo/animal schema). Confirm the real key against a live response during BUILD's API-integration step. Ship the fallback regardless: an entry that cannot be matched is listed **once**, as a rejected row in its own right, using the values and reason the payload itself carries — never dropped, never duplicated, never attached to another line.

## Acceptance Criteria

| AC | Text | Coverage |
|---|---|---|
| AC-1 | Opening a submitted file whose validation has run shows a preview listing every row of the file, in file order, each carrying a text label reading "Will import" or "Rejected" — never colour alone, and never the word "Imported". | playwright |
| AC-2 | A file whose validation has not run yet shows no preview section at all — no heading, no table, and no reads. | vitest |
| AC-3 | A will-import row shows its account number as the last four digits only, with no reveal control, and its transaction type in the app's plain-language wording. | vitest |
| AC-4 | A rejected row shows the file's own values untranslated, its account number as the last four digits with the same per-row reveal the Rejected rows section already offers, and the same defect wording that section applies (app-owned wording for reference, amount, date, and currency; the service's own words for a transaction-type defect). | vitest |
| AC-5 | A rejected row that cannot be tied to a line in the file is still listed once, as a rejected row in its own right, with the values and reason the service gave for it. | vitest |
| AC-6 | The preview states in plain language how many of the file's rows will import and how many were rejected. | vitest |

## Manual Test Checklist

- Open a submitted file that has finished validating → you see a preview listing every row of the file you uploaded
- Compare the preview against your own file → every line is there, in the same order
- Look at a row that passed → it says "Will import" (never "Imported"), its account number shows only the last four digits, and the transaction type reads in plain language
- Look at a row that was rejected → it says "Rejected", shows the values exactly as your file holds them, and gives the reason
- Reveal the account number on one rejected row → only that row's number is shown in full
- Read the summary above the table → the will-import count plus the rejected count add up to the file's record count
- Open a file that is still being processed → there is no preview yet
- Sign in as an Approver and open the same file → you see the identical preview

## Reuse notes

- `downloadSubmittedFile(fileLogId)` + `downloadFailureMessage` (`web/src/lib/api/files.ts`) are already wired for "Download original file" — reuse; do not build a second download path.
- `fetchFileValidationErrors`, `rejectedRowsIn`, `validationErrorsFailureMessage` (`web/src/lib/api/files.ts`) already implement the JSON-array-as-string contract with unparseable and non-array bodies as handled states — reuse, do not re-parse.
- `APP_OWNED_DEFECT_WORDING` and `defectWordingFor` are currently module-private in `web/src/components/files/RejectedRows.tsx`. **Extract to `web/src/lib/files/defectWording.ts`** and have both import it — compose, do not copy, so the four app-owned messages and the verbatim `TransactionType` rule stay stated once.
- `transactionTypeLabel`, `lastFourDigitsOf` (`web/src/lib/transactions/display.ts`) and `components/requests/MaskedAccountNumber` are the single source of truth for the type label and masking — reuse directly.
- `SubmittedFileDetail` already owns the page's single refresh interval and hands `refreshSignal` down. Take the same prop; grow no timer of your own.
- **Reserved control labels on this page — do not collide:** `Try again`, `Try again to load the rejected rows`, `Load this file again`, `Retry validation`, `Cancel file` / `Cancel the file` / `Keep the file`, `Download original file`, `Download error file`, `Reveal account number` / `Hide account number`.
