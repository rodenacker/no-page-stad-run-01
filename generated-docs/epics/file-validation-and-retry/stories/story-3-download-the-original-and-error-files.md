# Story 3 — Download the original file and the error file

- **Slug:** `story-3-download-the-original-and-error-files`
- **Epic:** `file-validation-and-retry` — Rejected rows, retry and cancel
- **Requirement IDs:** FR6, FR7
- **Roles:** Finance Uploader, Approver
- **Route:** `/upload/file`
- **Target file:** `web/src/app/(authenticated)/upload/file/page.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary (user-facing)

A submitted file's page lets either role download the file exactly as it was originally submitted, and — for a file that failed validation — the error file the service generated for it. A file that has no error file simply does not offer that download.

## Technical summary

Adds both downloads to the submitted-file page, through the two endpoints the brief pins:

| Download | Endpoint | Operation |
|---|---|---|
| Original file | `GET /transactions-api/v1/files/download?FileLogId=<id>` | `FilesDownload` |
| Error file | `GET /transactions-api/v1/files/bulk-errors/download?FileLogId=<id>` | `FilesBulkErrorsDownload` |

**Do not use `GET /v1/file-logs/data?LogId=<id>` (`FileLogDataDownload`) for either download.** A third, similarly-shaped operation exists in the spec, but no §6.10 pointer references it for this epic's requirements. The source contract flags this trio as a known ambiguity; the §6.10 mapping above resolves it.

Both stream `application/octet-stream` through the same-origin proxy, so the session cookie travels by itself.

The error-file control is gated on the file's `HasBulkErrorFile` (the STRING `'Yes'`/`'No'` on the wire) and is **absent — not disabled** — when there is none.

A refused download must be reported inside the page (`project.md` NFR-base-5), which is what rules out a bare `<a href>` link that would drop the user onto a raw error response.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | A submitted file's page offers a way to download the file as it was originally submitted, and choosing it delivers that file to the user. | `playwright` |
| AC-2 | A file that has a generated error file offers a way to download it, and choosing it delivers the error file. | `playwright` |
| AC-3 | A file with no generated error file is not offered the error-file download at all — the action is absent from the page rather than shown greyed out. | `vitest` |
| AC-4 | Both a Finance Uploader and an Approver are offered both downloads on the same file. | `vitest` |
| AC-5 | A download the service cannot deliver is reported on the page — the service's own wording where it sent one, otherwise plain wording of the app's own — and the user is never dropped onto a raw error response. | `vitest` |

## Manual test checklist

- ☐ On a file's page, choose to download the file you originally submitted → the CSV downloads
- ☐ On a file whose status is 'Validation failed', choose to download the error file → the error file downloads
- ☐ Open a file that imported cleanly → no error-file download is offered on it
- ☐ Sign in as an Approver and open a failed file → both downloads are offered to you as well
- ☐ Reach both download controls with Tab and start them with Enter → both work without a mouse

Plus 1 technical check verified automatically.

## Infrastructure & reuse notes

The epic-wide list lives in `story-1-open-a-submitted-file.md` — read it. The ones that bite hardest here:

- Every backend call goes through `web/src/lib/api/client.ts` at the app's OWN same-origin address (`/transactions-api/...`). Both download endpoints belong in `web/src/lib/api/files.ts`.
- A failed call's user-facing wording is `serviceMessageOf(e) ?? serviceDetailOf(e) ?? <own wording>` from `web/src/lib/api/errors.ts` — the service reports refusals as a 500 with `Messages[]`, which lands on `details`. `uploadFailureMessage` in `files.ts` is the pattern to copy.
- `HasBulkErrorFile` is the STRING `'Yes'`/`'No'`, not a boolean; `fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED)` already sets it with a `BulkErrorFile` name.
- Role-conditional markup is decided on the SERVER and left out entirely, never rendered disabled (UI-24) — the same rule that makes AC-3 "absent, not greyed out".
