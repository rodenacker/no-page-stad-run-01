# Story 1 — Delete any file from its own page

| Field | Value |
|---|---|
| index | 1 |
| slug | `story-1-delete-any-file-from-its-own-page` |
| route | `/upload/file` |
| targetFile | `web/src/components/files/SubmittedFileActions.tsx` |
| pageAction | `modify_existing` |
| isInfrastructureOnly | `false` |
| requirementIds | R2, R3, R4, R5, R9, R10, R11, BR1, BR2, BR7 |
| roles | Importer, Approver |

## plainSummary

On a submitted file's own page the action now reads "Delete file", and it is offered for every file — including one whose rows have already imported, which used to hide the action entirely. Only the Importer sees it; if the service refuses the delete, you are told exactly what it said and the file stays where it is.

## Summary

**Modifies** the shipped action in `web/src/components/files/SubmittedFileActions.tsx`. Two changes, both reversals of shipped behaviour:

1. **Rename the user-visible labels.** Trigger `Cancel file` → **`Delete file`**; confirm `Cancel the file` → **`Delete the file`**; way out `Keep the file` **unchanged** — it must not read "Cancel". Also the confirmation title (`Cancel <name>?` → `Delete <name>?`) and the refusal title.
2. **Remove the `cancelApplies` status gate** (BR1) so the action is offered in every `CurrentStatus` including `Imported` — rather than adding a second, wider action beside it.

Keeps the single existing `cancelSubmittedFile` / `DELETE /v1/files` call (R9) and the server-decided `actingUploader` gate plus `LastChangedUser` audit identity (R5/BR2/BR7).

Owns the **honest-failure contract** for the delete call (R10/R11) on this surface: the service's own message shown, no claimed success, no navigation away, no silent no-op. This is the genuinely untested case now that an imported file can reach the call at all.

### This story owns the shipped-spec repair

Shipped specs pin the old wording and the old restriction and become **wrong** the moment the gate is removed. They must be **updated** — never skipped, `.fixme`'d, or deleted:

- `web/src/__tests__/integration/epic-file-validation-and-retry-story-4-retry-validation-or-cancel-the-file.test.tsx` — notably the case asserting the action is **absent** once the file has imported, plus its file-header contract notes.
- `web/e2e/epic-file-validation-and-retry-story-4-retry-validation-or-cancel-the-file.spec.ts`.

Grep the whole of `web/` for `Cancel file` / `Cancel the file` before finishing. Other specs (e.g. `epic-expense-decisions-story-4`, `epic-import-preview-story-*`) reference the reserved-label discipline in comments and must not be left contradicting reality.

`file-validation-and-retry`'s cross-story-contracts note is superseded **for those three strings only**. `SubmittedFileDetail`'s prop contract `{ logId, actingUploader? }` is **not** superseded.

## Acceptance Criteria

| AC | Text | Coverage |
|---|---|---|
| AC-1 | On a submitted file's page the Importer sees an action reading "Delete file", whose confirmation offers "Delete the file" and "Keep the file"; no control on the page reads "Cancel file" or "Cancel the file" any more. | vitest |
| AC-2 | The delete action is offered whatever the file's status — including a file whose status is Imported, where it was previously absent — and the retry action's own status rule is unchanged. | vitest |
| AC-3 | A session that is not the Importer receives no delete control at all in the page's markup — absent, never disabled or greyed out. | vitest |
| AC-4 | Confirming the delete on a file the service accepts removes the file and returns the user to the Expense files list, where the file is no longer listed. | playwright |
| AC-5 | When the service refuses the delete — including on an imported file — the page shows the service's own message, the user stays on the file's page with the file unchanged and the delete still offered, and nothing reports the delete as having succeeded. | vitest |
| AC-6 | The delete action and both confirmation shapes are completable by keyboard alone, with the way out ("Keep the file") holding focus when the confirmation opens, and the page passes an accessibility scan with the confirmation open. | playwright |

## Manual Test Checklist

- Open a file that has not been processed yet → the action now reads "Delete file", not "Cancel file"
- Open a file whose status is Imported → the delete action is offered (it used to be hidden on imported files)
- Choose Delete file → the two choices read "Delete the file" and "Keep the file"; press Enter straight away and the file is kept
- Confirm the delete on a file that has not imported → you are returned to the Expense files list and the file has gone from it
- Sign in as an Approver and open the same file → there is no delete action anywhere on the page
- If the service refuses to delete an imported file → you see the service's own words, you stay on the file's page, and nothing says it worked

## Reuse notes

- `cancelSubmittedFile` (`web/src/lib/api/files.ts`) is the **one** delete call. Rename it and `cancelFailureMessage` / `CANCEL_FAILED_MESSAGE` / `FILE_CANCEL_ENDPOINT` to delete vocabulary if you like, but do not add a second wrapper or endpoint constant.
- `web/src/components/common/ConfirmAction.tsx` is the project's one confirmation primitive (way out holds focus, controlled open state, nothing called from inside). No new dialog component.
- `isFileInProgress` stays the auto-refresh signal and is unrelated to the delete gate.
