# Story 3 — A file's own slip, and its processing history

- **slug:** `story-3-a-files-own-slip-and-its-processing-history`
- **route:** `/upload/file`
- **targetFile:** `web/src/components/files/SubmittedFileDetail.tsx`
- **pageAction:** `modify_existing`
- **roles:** Importer, Approver
- **requirementIds:** R17, R18, R1, R2, R7, R8, R9, BR1, BR2, BR6, BR9, BR10
- **isInfrastructureOnly:** false

## Plain summary

A file's own page opens with a compact slip — small capitalised labels over their values, figures and times in the typewriter face — instead of a card of prose, and its processing history becomes a ruled table in the same grammar. It says exactly what it said before.

## Summary

Redraws `SubmittedFileDetail`'s header (setting, processed time, status, record count, most recent activity) in the shared tracked-label / tabular-mono-figure field notation rather than a card or freestanding prose, reading as the same notation as the slip that produced the file and the register row that lists it. Redraws `FileProcessingHistory`'s table with hairline row rules, 11px tracked mono column heads and both timestamps in mono. Values, their source (`FileLog` read from the active file list — there is no get-one-file endpoint) and the still-running activity's blank outcome and end time are all unchanged.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | The file's header reads as a compact slip — small capitalised labels over their values, with the record count and the processed time in the typewriter face — not prose and not a card. | none |
| AC-2 | The header still states the same five things with the same values as the row it was opened from, and its status still reads as a colour paired with its words. | vitest |
| AC-3 | The processing history is a ruled table — thin lines between activities, small capitalised column headings, both times in the typewriter face — with no card around it. | none |
| AC-4 | An activity that is still running still shows no outcome and no finish time; nothing is invented for either. | vitest |
| AC-5 | A file that cannot be found, and a processing history that fails to load, still read clearly in the new treatment with their existing wording and their existing way to ask again. | vitest |

## Manual test checklist

- Open a file from the list → its details read as a compact slip of small capitalised labels over their values, with no card around them
- Compare the slip with the row you came from → the setting, processed time, status, record count and latest activity all say the same thing
- Look at the processing history → thin lines between activities, small capitalised column headings, and both times in the typewriter face
- Find a file that is still processing → its running activity still shows no outcome and no finish time
- Type a file address for something that no longer exists → you still get the same plain explanation as before

## Reuse notes (from the planner — read before implementing)

- Import `FIELD_LABEL_CLASS` and the tabular-mono figure treatment from `web/src/components/requests/fieldNotation.ts`; BR6 forbids a second declaration under `components/files/`.
- `FileStatusBadge` already delegates to the shared `StatusBadge` — confirm the restyle did not regress it; do not rebuild status presentation.
- Keep the Shadcn table primitive for the processing history and restyle **through** it: real `<th scope>`, `TableCaption`, header row and table semantics stay.
- The read path is unchanged: there is no get-one-file endpoint, so `FileLog` is read from the active file list (BR10). Do not invent a single-file fetch.
- The behaviour layer is reused untouched: `web/src/lib/files/{fileAddress,fileSubmissions}.ts`.
