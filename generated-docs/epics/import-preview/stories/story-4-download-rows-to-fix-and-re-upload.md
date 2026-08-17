# Story 4 — Download the rejected rows to fix and re-upload

| Field | Value |
|---|---|
| index | 4 |
| slug | `story-4-download-rows-to-fix-and-re-upload` |
| route | `/upload/file` |
| targetFile | `web/src/components/files/CorrectionRowsDownload.tsx` |
| pageAction | `modify_existing` |
| isInfrastructureOnly | `false` |
| requirementIds | FR6, FR7, FR8, BR4, BR5, BR6, NFR-3 |
| roles | Importer, Approver |

**Also touches:** `web/src/lib/files/correctionCsv.ts` (new — builds the file), `web/src/components/files/ImportPreview.tsx` (hosts the control), `web/src/components/files/FileDownloadActions.tsx` (explanatory wording distinguishing the two downloads, per FR7/BR6).

## plainSummary

Lets you download just the rejected rows as a spreadsheet file in the same shape the upload accepts, so whoever owns the data can correct it and send it back in as a new upload. It sits next to the existing error-file download, with wording that says which is which.

## Summary

A client-side generated correction CSV built from the preview's rejected rows, delivered through the existing `deliverFile`. A matched rejected row is written from the original file's own parsed line — byte-faithful by construction — and only an unmatched row (BR9) is reconstructed from the validation-errors payload, which is the only data available for it.

Account numbers are always full and unmasked, following `csv-export`'s documented compliance exception (BR4): the file must round-trip through upload, and the upload contract has no masked-value concept. This is deliberate and differs from every on-screen treatment.

### Column shape — SETTLED 2026-08-17, with an unconfirmed risk (BR5)

The file carries the **seven upload columns in the upload's own order, plus an eighth trailing `Reason` column** holding the same rejection wording shown on screen for that row. The user chose the reason column over the safer seven-column default.

- The eighth column is **always last**, so the first seven are byte-identical to the upload shape.
- Header `Reason` — safe against `Reference`; must not collide with any of the seven.
- **Unconfirmed:** `transactions-api.yaml` documents no upload-side column validation, and both services were unreachable when this was decided, so whether `POST /v1/files/upload` tolerates the extra column is unknown. A re-upload of an unmodified correction file is a required manual-test step and is carried in `unverifiedAssumptions`. **If the service refuses it, drop the eighth column** — a one-line change to the column list, not a rework.

### Label (BR6)

**"Download rows to fix and re-upload"** — never the word "error", which the existing service-diagnostic download owns on this page. The two downloads sit together and each needs wording saying which is the service's own diagnostic file and which is the re-uploadable correction file.

## Acceptance Criteria

| AC | Text | Coverage |
|---|---|---|
| AC-1 | As an Approver, choosing "Download rows to fix and re-upload" on a submitted file's page saves a CSV file of that file's rejected rows. | playwright |
| AC-2 | The saved file's first seven columns are exactly the upload's columns, in the upload's own order, followed by a trailing reason column, with a header row. | vitest |
| AC-3 | Each row's trailing reason column holds the same rejection wording shown for that row on screen. | vitest |
| AC-4 | A rejected row that was matched to a line in the original file is written exactly as that file held it across the seven upload columns; a rejected row that could not be matched is written from the values the service reported for it. | vitest |
| AC-5 | Every account number in the saved file is the full value, whatever the screen shows for that row. | vitest |
| AC-6 | The correction download appears beside the existing "Download error file" only when the preview has rejected rows, with wording that says which one is the service's own diagnostic file and which is the re-uploadable correction file. | vitest |
| AC-7 | A correction file that cannot be produced is reported plainly, with the same control still there to ask again. | vitest |

## Manual Test Checklist

- On a file with rejected rows, choose "Download rows to fix and re-upload" → a CSV file saves
- Open the saved file → its first seven columns match the file you originally uploaded, in the same order, with a reason column at the end
- Compare one rejected line against your original file → the seven values are identical, including the full account number
- Read the reason column → it says the same thing the screen says for that row
- Read the two downloads on the page → it is obvious which is the service's error file and which is the file you fix and send back
- **Correct a value in the saved file and upload it through the normal upload flow → it is accepted as a new submission** (this is the one that proves the reason column is safe — if the upload refuses it, say so)
- Open a file with no rejected rows → no correction download is offered
- Sign in as an Approver → you can download the same file

## Reuse notes

- `web/src/lib/transactions/exportCsv.ts` supplies the RFC 4180 escaping and the chunked-yield pattern — follow its structure (a single column list driving both header and records). Do **not** reuse `EXPORT_COLUMNS` (nine-column report shape).
- `web/src/lib/files/deliverFile.ts` delivers the generated blob — the same mechanism `csv-export` and `FileDownloadActions` use.
- Story 2's `importPreviewRows.ts` already knows which rejected rows were matched and which were not — take the distinction from there rather than recomputing it.
- Reason wording comes from the shared `web/src/lib/files/defectWording.ts` extracted in story 2 — one source for screen and file alike.
