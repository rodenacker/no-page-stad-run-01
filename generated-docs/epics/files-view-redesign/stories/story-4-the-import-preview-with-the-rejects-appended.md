# Story 4 — The import preview, with the rejects appended at the back

- **slug:** `story-4-the-import-preview-with-the-rejects-appended`
- **route:** `/upload/file`
- **targetFile:** `web/src/components/files/ImportPreview.tsx`
- **pageAction:** `modify_existing`
- **roles:** Importer, Approver
- **requirementIds:** R14, R15, R1, R2, R5, R7, R8, R9, BR1, BR2, BR3, BR4, BR6, BR8, BR9
- **isInfrastructureOnly:** false

## Plain summary

The preview of a file's rows stops mixing accepted and rejected rows together. Every row that will import is listed first, then all the rejected rows follow in one clearly-headed block at the end — and both blocks are drawn as the same ruled listing as the rest of the app. Every row still says the same thing about itself.

## Summary

**The one genuine change to what a person sees in this epic.** Re-arranges `ImportPreview` from a single file-order table into one will-import listing followed by a rejected listing appended at the back, each block preserving the file's own relative order among its own rows, with the rejected block carrying its own tracked micro-label heading and a hairline separating it from the rows above. Redraws both blocks full-bleed with hairline row rules, tracked mono column heads and reference / transaction date / masked account number in mono. Verdict wording, row values, defect wording, per-row reveal, the two plain-language counts, the two-read contract and every honest-fallback state are unchanged.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Every row that will import is listed first, in the file's own order among themselves, and every rejected row follows at the back, in the file's own order among themselves — the two are never interleaved. | vitest |
| AC-2 | The rejected block is unmistakably its own section — its own small capitalised heading with a line above it — so no rejected row can be taken for one still sitting among the rows that will import. | vitest |
| AC-3 | Both blocks are drawn full width with thin row lines, small capitalised column headings, and reference, transaction date and account number in the typewriter face — one listing, not two differently-styled tables. | none |
| AC-4 | Every row keeps its Will import or Rejected verdict as words beside a colour, and every row's values and its stated reason for rejection are unchanged. | vitest |
| AC-5 | Account numbers still show only their last four digits, and the full number is still revealed one rejected row at a time by a deliberate action, with no reveal-all anywhere. | vitest |
| AC-6 | The preview's existing honest answers — validation not run yet, the file unreadable, the rejected rows unreadable, the row count disagreeing with the recorded one — all still read clearly in the new treatment with their existing wording. | vitest |

## Manual test checklist

- Open a file that has been validated → every row that will import is listed first, and all the rejected rows follow together in one block at the end
- Look at where the two blocks meet → the rejected block has its own heading and a line above it, so you can see exactly where it starts
- Compare the preview against the file you sent → within each block the rows are still in the order the file had them
- Check any rejected row → it still says why it was rejected, in exactly the same words
- Reveal an account number on a rejected row → only that row's number shows in full; every other row still shows four digits
- Check the two counts above the listing → they still state the same numbers as before

## Reuse notes (from the planner — read before implementing)

- **R14 TRAP — read this first.** The reordering is a **presentation** reorder inside `ImportPreview` only. `web/src/lib/files/importPreviewRows.ts` must keep emitting one row per line in **file order**, because `web/src/lib/files/correctionCsv.ts` derives the correction download from it and that download's row scope and order are protected behaviour (BR2). **Reorder at render, not at parse.**
- **BR3 in practice:** `web/e2e/epic-import-preview-story-2-see-every-row-and-its-verdict.spec.ts` and its Vitest twin assert the current interleaved file order. Re-point them to assert per-block relative order (will-import rows in file order among themselves, rejected rows in file order among themselves) **plus** the block boundary — same strength, new arrangement. Any spec asserting a row's verdict, its values or its correctability stays exactly as strong.
- Masking has exactly one home: `web/src/components/requests/MaskedAccountNumber.tsx`. Reuse it; never inline masking into a restyled row, and never add a reveal-all (POPIA).
- Import the shared notation from `web/src/components/requests/fieldNotation.ts` — BR6 forbids a second declaration.
- Keep the Shadcn table primitive and restyle through it; `web/src/components/ui/table.tsx`'s `overflow-x-auto` wrapper is what story 6 answers at phone width.
- The behaviour layer is reused untouched: `web/src/lib/files/{importPreviewRows,correctionCsv,defectWording,readBlobText}.ts`.
- BR4: no reserved exception gutter is added to the preview.
