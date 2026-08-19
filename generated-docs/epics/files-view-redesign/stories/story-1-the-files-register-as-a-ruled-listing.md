# Story 1 — The files register as a ruled batch listing

- **slug:** `story-1-the-files-register-as-a-ruled-listing`
- **route:** `/upload`
- **targetFile:** `web/src/components/files/SubmittedFilesList.tsx`
- **pageAction:** `modify_existing`
- **roles:** Importer, Approver
- **requirementIds:** R10, R11, R12, R1, R2, R6, R7, R8, R9, R22, R23, BR1, BR2, BR4, BR5, BR6, BR7, BR8, BR9
- **isInfrastructureOnly:** false

## Plain summary

The list of submitted files stops being a card wrapping a striped table and becomes a ruled register — thin lines between files, small capitalised column headings, and each file's own record count right-aligned in the typewriter face. Everything you could do to a file from its row, you can still do, identically.

## Summary

Redraws `SubmittedFilesList` as a full-bleed ruled listing in the request list's grammar — hairline row rules, 11px tracked mono column heads, right-aligned tabular record count, file name and setting name set in mono as identifiers — removing the card/panel and striped-row treatment. Restyles the per-row `Open` and Importer-only `Delete file` into the shared ruled action notation and the three non-row answers (busy, nothing submitted yet, failed read with retry) into the shared ruled band treatment. The whole behaviour layer is preserved untouched: the 15s self-refresh cadence, the import / validation-failed toast announcements, the in-flight and refused-delete reporting, and the role gating.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | The register runs the full width of the page with thin lines between files and small capitalised column headings — there is no card, panel, striped-row treatment or status pill anywhere on it. | none |
| AC-2 | Each file's own record count is right-aligned in the typewriter face and the digits line up down the column, the file name and setting read as identifiers in the same face, and no new grand total is added above the register. | none |
| AC-3 | Every row still offers Open, and Delete only to an Importer — an Approver's rows carry no Delete at all — and each row's status still reads as a colour paired with its words. | vitest |
| AC-4 | The three answers that are not rows — waiting, nothing submitted yet, and a failed read with its Try again — all read clearly in the new ruled treatment, and Try again still asks for the list again. | vitest |
| AC-5 | The register still re-reads itself on its own cadence while a file is getting on, still announces an import and a validation failure in the same words, and adds no movement of its own. | playwright |
| AC-6 | Deleting a file from its row still asks first, still names the file, still reports a refusal on the screen behind the closed confirmation, and still leaves the reader on the register. | playwright |

## Manual test checklist

- Open Expense files → the submitted files run the full width of the page separated by thin lines, with no white card and no striped rows
- Run your eye down the record-count column → every figure is right-aligned and the digits line up exactly
- Look above the list → there is no new grand total added, only the files and their own counts
- As an Importer, delete a file from its row → you are still asked to confirm, the confirmation still names the file, and you stay on the list afterwards
- Sign in as an Approver → the rows carry no Delete at all — not a greyed-out one
- Submit a file and watch the list → it still keeps itself up to date on its own and still tells you when a file imports or fails validation

## Reuse notes (from the planner — read before implementing)

- The shared notation lives in `web/src/components/requests/fieldNotation.ts` and is **imported, never re-declared**: `FIELD_LABEL_CLASS` (the 11px tracked mono label), `RULED_FIELD_CLASS` (underline-only field), `RULED_ACTION_CLASS` (a control as a tracked label on a rule) and `RULED_ACTION_ICON_CLASS` (the size-3 glyph beside it — omitting it silently renders at the button primitive's 16px). BR6 forbids any file under `components/files/` or `components/upload/` re-declaring an equivalent token, class string or shape mapping.
- The ruled status mark is `web/src/components/status/StatusBadge.tsx` (`StatusBadge` / `StatusMark` / `statusInkFor`), already converted project-wide by `request-list-redesign` R26. `FileStatusBadge` already delegates to it, so file-status presentation needs **nothing further** here beyond confirming the surrounding restyle did not regress it. The architecture record's phrase "a status chip" for the register predates that change and is stale — do not read it as a gap to close.
- Keep the Shadcn table primitive (CLAUDE.md §1) and restyle **through** it — real `<th scope>`, `TableCaption`, header row and table semantics all stay; only the card wrapper, the striped rows and the boxed controls go. Note `web/src/components/ui/table.tsx` wraps every table in `overflow-x-auto` with `whitespace-nowrap` cells; that wrapper is what makes today's seven-column tables scroll sideways inside their container, and story 6 answers it.
- The behaviour layer is reused untouched, not rewritten — a rewrite is precisely how R1/BR2 breaks while the tests stay green: `web/src/lib/files/{fileSubmissions,deleteConfirmation,fileAddress}.ts`, plus `lib/auth/identity.ts`'s `actingUploaderIn` (the one expression both `/upload` and `/upload/file` gate on, so they cannot gate differently).
- Nothing in this epic touches the root layout, the fonts or `globals.css` — Public Sans, Azeret Mono, the tokens and the direction contract were all landed by `request-list-redesign`. This epic spends them.
