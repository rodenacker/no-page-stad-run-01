# Story 5 — The rejected rows, and everything you can do to a file

- **slug:** `story-5-rejected-rows-and-what-you-can-do-to-a-file`
- **route:** `/upload/file`
- **targetFile:** `web/src/components/files/RejectedRows.tsx`
- **pageAction:** `modify_existing`
- **roles:** Importer, Approver
- **requirementIds:** R16, R19, R20, R1, R4, R5, R6, R7, R8, R9, R23, BR1, BR2, BR6, BR7, BR9
- **isInfrastructureOnly:** false

## Plain summary

The rejected-rows section becomes a ruled listing like the rest, and every control on a file's page — retry, delete, the two downloads, and the download of the rows to fix — becomes small capitalised text on a line instead of a boxed button. Which controls you get, when you get them, and what they do are all unchanged.

## Summary

Gives `RejectedRows` the same ruled-listing treatment as the import preview — hairline row rules, tracked mono column heads, right-aligned tabular amounts, masked account numbers in mono with the existing per-row reveal. Restyles `FileDownloadActions`, `SubmittedFileActions` and `CorrectionRowsDownload` into the shared ruled action notation `RequestActions` established, reusing it rather than composing a second one. `DeleteFileConfirmation`'s three confirmation shapes and their three-phrase convention ride the shared `ConfirmAction` primitive unchanged. Every control's gating, wording, per-control wait, refusal handling and absent-not-disabled behaviour is preserved exactly.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | The rejected-rows section is a ruled listing — thin row lines, small capitalised column headings, amounts right-aligned in the typewriter face, masked account numbers in the same face — with no card around it. | none |
| AC-2 | Each rejected row still reveals its own full account number by a deliberate action and no other row's, and the correction file keeps whatever masking convention it already applied. | vitest |
| AC-3 | Retry validation, Delete file, Download original file, Download error file and Download rows to fix all read as small capitalised text on a line, in the same notation as the request list's actions — no boxed buttons are left on the page. | none |
| AC-4 | Every one of those controls is still offered exactly when and to whom it was before — retry only while validation has failed and only to an Importer, delete only to an Importer, both downloads to either role, the error-file download only when the service reported one — and a control that is not offered is absent from the page, never greyed out. | vitest |
| AC-5 | Each control still shows its own wait and reports its own refusal in its existing wording, and deleting still asks in its three existing shapes and still leaves the reader where it did before. | vitest |
| AC-6 | Every one of those controls is reachable and completable by keyboard alone, each showing where the focus is. | playwright |

## Manual test checklist

- Open a file whose validation failed → the rejected rows read as a ruled listing with thin lines, small capitalised headings and amounts lined up on the right
- Reveal one rejected row's account number → only that row shows in full; every other row still shows four digits
- Look at the controls on the file's page → they read as small capitalised text on a line, with no boxed buttons left
- Download the original file, the error file, and the rows to fix → all three still download, each showing its own wait, with the same contents as before
- As an Importer, retry a failed file and then delete a file → both behave and word themselves exactly as before, and the confirmation still names the file
- Sign in as an Approver → retry and delete are absent from the page, not greyed out, and both downloads are still there

## Reuse notes (from the planner — read before implementing)

- Import `RULED_ACTION_CLASS` **and** `RULED_ACTION_ICON_CLASS` from `web/src/components/requests/fieldNotation.ts` — omitting the icon class silently renders the glyph at the button primitive's 16px instead of size-3. BR6 forbids composing a second action notation.
- `DeleteFileConfirmation`'s three shapes ride the shared `web/src/components/common/ConfirmAction.tsx` primitive, which already reads in the ruled notation project-wide — **restyle nothing inside it**.
- Masking has exactly one home: `web/src/components/requests/MaskedAccountNumber.tsx`. No reveal-all (POPIA).
- Hidden-never-disabled applies to every control here: a capability a role lacks is absent from the page.
- The behaviour layer is reused untouched: `web/src/lib/files/{correctionCsv,deleteConfirmation,deliverFile,defectWording,readBlobText}.ts` and `lib/auth/identity.ts`'s `actingUploaderIn`.
- **Density note:** this is the densest story of the six — one listing redraw plus five action components (`RejectedRows.tsx`, `FileDownloadActions.tsx`, `SubmittedFileActions.tsx`, `CorrectionRowsDownload.tsx`, `DeleteFileConfirmation.tsx`). Its criteria split cleanly at AC-2 | AC-3 (rejected rows | the controls) if it needs halving during BUILD.
