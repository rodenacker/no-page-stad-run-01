# Story 3 — When the file cannot be read

| Field | Value |
|---|---|
| index | 3 |
| slug | `story-3-when-the-file-cannot-be-read` |
| route | `/upload/file` |
| targetFile | `web/src/components/files/ImportPreview.tsx` |
| pageAction | `modify_existing` |
| isInfrastructureOnly | `false` |
| requirementIds | FR5, BR8, NFR-3 |
| roles | Importer, Approver |

## plainSummary

When the app cannot read the file it downloaded — it is not a CSV, its columns are not the ones expected, or the number of lines disagrees with what the service says the file holds — the preview says so plainly instead of showing a half-drawn or misleading table.

## Summary

The honest-degradation half of the preview. Three distinct unreadable outcomes all resolve to a stated problem-reading-the-file message with **no table rendered at all** — never a partial, empty, or misaligned one, and never presented as an ordinary rejection outcome:

1. **Unparseable body** — the downloaded bytes are not CSV.
2. **Wrong column shape** — the columns are not the expected seven.
3. **Count mismatch** — the parsed row count does not reconcile with `FileLog.RecordCount`.

A failed *download*, or a failed *validation-errors read*, is a different class and is reported separately in the service's own words with an explicit ask-again control — following `RejectedRows`' established pattern (a stated failure plus a retry affordance), never a silent empty state.

**Why the count mismatch is an error, not a footnote:** the preview is sourced from the whole file, so the counts are expected to reconcile. A mismatch means the app is not looking at what it thinks it is looking at. Reporting it as a normal preview with different numbers would quietly contradict the record count already on the page.

**Retry label:** `Load the preview again` — chosen to avoid the page's reserved labels (see story 2's Reuse notes).

## Acceptance Criteria

| AC | Text | Coverage |
|---|---|---|
| AC-1 | A downloaded file that cannot be read as CSV produces a plainly stated problem-reading-the-file message and no table at all. | vitest |
| AC-2 | A file whose columns are not the seven the upload expects produces the same handled message, naming the mismatch, rather than a table of misaligned values. | vitest |
| AC-3 | A file whose parsed row count does not reconcile with the record count the service reports for it is reported as a problem reading the file, not as a normal preview with different numbers. | vitest |
| AC-4 | A failed download of the file, or a failed read of the rejected rows, is reported in the service's own words with a control offering to load the preview again. | vitest |
| AC-5 | After a failed read, choosing that control loads the preview successfully once the service answers. | playwright |
| AC-6 | While the file is being fetched and read, the wait is announced rather than leaving an empty section. | vitest |

## Manual Test Checklist

- Open a file whose contents are not a readable CSV → you see a clear "could not read this file" message and no half-drawn table
- Open a file whose columns are not the seven the upload expects → the same clear message, not a table of values in the wrong columns
- Open a file where the number of lines disagrees with the record count on the page → you are told there is a problem reading the file, rather than shown a preview that quietly contradicts the count
- Stop the backend and open a file → the preview says it could not load, in the service's own words, and offers "Load the preview again"
- Start the backend and choose "Load the preview again" → the preview loads
- Watch the page while the file is being fetched → you see a loading message, not blank space

## Reuse notes

- Story 1's reader returns the unparseable / wrong-shape outcomes as values; this story maps them to the on-screen message. Do not re-detect them here.
- `downloadFailureMessage` and `validationErrorsFailureMessage` (`web/src/lib/api/files.ts`) already produce the service's own wording for the two read failures — reuse.
- Follow `RejectedRows`' existing failure-plus-retry pattern rather than inventing a new one.
