# Story 3 — Delete a file straight from the files list

| Field | Value |
|---|---|
| index | 3 |
| slug | `story-3-delete-a-file-straight-from-the-files-list` |
| route | `/upload` |
| targetFile | `web/src/components/files/SubmittedFilesList.tsx` |
| pageAction | `modify_existing` |
| isInfrastructureOnly | `false` |
| requirementIds | R1, R5, R9, R10, R11, R12, BR2, BR3, BR5, BR7 |
| roles | Importer, Approver |

**Also touches:** `web/src/app/(authenticated)/upload/page.tsx` (server-side role decision passed down as a new optional prop).

## plainSummary

The Importer can delete a file directly from the Expense files list, without opening it first. It asks for the same confirmation you would get on the file's own page — including the request counts for a file that has already imported — and the row disappears only because the list asked the service again. If the service refuses, the row stays exactly where it was with the service's own message shown.

## Summary

Adds the delete action to each row of `SubmittedFilesList` (R1), **reusing story 2's shared confirmation** rather than building a second one.

### Role gating — note the polarity trap

Decided on the **server** in `web/src/app/(authenticated)/upload/page.tsx` and passed as a **new optional prop** alongside the existing `viewerRoles?: string[]` — the same `hasRole(session, ROLE_IMPORTER) ? displayNameOf(session) : undefined` value the detail page already computes, doing the same two jobs (gate + `LastChangedUser` audit identity).

**The polarity differs from `viewerRoles`.** That prop's absence means "still notify". This prop's absence must mean **no delete control at all** — the safe default — so any caller that doesn't supply it is unaffected. `expense-file-upload` story 3's pinned optional-prop contract stays satisfied.

`SubmittedFilesList` reads no session in the browser; do not invent a client-side role check.

### The list must re-read, not splice

On success the row disappears **because the list re-read itself through its existing read path** (R12, the "List currency" feature NFR) — not via a locally-spliced array, and without a second timer or disturbing the existing in-progress auto-refresh.

On refusal the list surfaces the service's own wording, leaves every row untouched, and offers the action again (R10/R11).

Still exactly one delete API call in the app.

### Control shape — pinned at test generation

The delete control sits **directly in the row**, alongside the existing `Open` link — **not** behind a per-row menu or overflow button. Story 3's Playwright spec tabs straight to it from the page, so a menu would fail AC-6. If a menu is ever wanted, the acceptance criterion has to change first.

## Acceptance Criteria

| AC | Text | Coverage |
|---|---|---|
| AC-1 | On the Expense files list the Importer sees a delete action against every file row whatever its status, worded exactly as on the file's own page. | vitest |
| AC-2 | An Approver's list carries no delete control on any row, and a list rendered without an acting Importer offers none either — absent, never disabled — while everything the list already did (rows, statuses, notifications, the Open link) is unchanged. | vitest |
| AC-3 | The confirmation opened from a row is the same one the file's own page shows — request counts for an imported file, the short warning otherwise, and the same "count could not be read" state — not a second, different dialog. | vitest |
| AC-4 | Confirming a delete from a row removes the file from the list without a page reload, with the list showing what the service reports after being asked again, and the list's existing self-refreshing behaviour still working afterwards. | playwright |
| AC-5 | When the service refuses a delete asked for from the list, the list shows the service's own message, the file's row stays exactly where it was, the delete can be tried again, and nothing implies the file was removed. | vitest |
| AC-6 | A row's delete action and its confirmation are reachable and completable by keyboard alone from the list, and the list passes an accessibility scan with the confirmation open. | playwright |

## Manual Test Checklist

- Sign in as an Importer and open Expense files → every file row offers a delete action
- Delete a file that has not imported, from the list → the row disappears without the page reloading
- Delete an imported file from the list → you get the same request-count confirmation you would get on the file's own page
- Sign in as an Approver and open Expense files → no row offers a delete action
- If the service refuses the delete → the row is still there, unchanged, and you see the service's own words
- Submit a file so the list is refreshing itself, then delete a different file → the list keeps refreshing normally and nothing appears twice

## Reuse notes

- Story 2's shared `deleteConfirmation` module and wrapper component — **consume them**. A second confirmation on this surface is a defect, not a variation.
- `actingUploaderIn(session)` in `upload/file/page.tsx` and `hasRole(session, ROLE_IMPORTER)` in `upload/page.tsx` already express the server-side role decision. Lift the same expression.
- `SubmittedFilesList` owns its own single interval; it may not grow a second one for the delete.
- The one delete call remains `cancelSubmittedFile` in `web/src/lib/api/files.ts` (renamed at the developer's discretion in story 1).
