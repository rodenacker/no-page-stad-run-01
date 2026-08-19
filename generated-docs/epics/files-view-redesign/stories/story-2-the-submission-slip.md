# Story 2 — The submission slip

- **slug:** `story-2-the-submission-slip`
- **route:** `/upload`
- **targetFile:** `web/src/components/upload/SubmitExpenseFileForm.tsx`
- **pageAction:** `modify_existing`
- **roles:** Importer
- **requirementIds:** R13, R1, R4, R6, R7, R9, R23, BR1, BR2, BR6, BR7, BR9
- **isInfrastructureOnly:** false

## Plain summary

The form for sending a file in becomes the batch's submission slip — the setting and the file are underlined fields with small capitalised labels instead of boxes, and what it tells you back is set in the same lettering as the rest of the screen. What it accepts, what it refuses and when Submit becomes available are all unchanged.

## Summary

Redraws `SubmitExpenseFileForm` using the shared underline-only ruled field notation for the setting selector and the file input's label, and sets its refusal and submission feedback in the shared tracked-label / mono-figure grammar. Keeps a real `<input type="file">` in the tab order, keeps submit unavailable until both a setting and a CSV are chosen, keeps the non-CSV refusal naming the file, keeps the in-page `role="alert"` reporting, and keeps the form absent entirely from a non-Importer session.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | The setting selector and the file field are underlined fields with small capitalised labels — no input boxes, no card, no boxed submit sitting in a panel. | none |
| AC-2 | Submit stays unavailable until both a setting and a CSV are chosen, and a file that is not a CSV is still refused by name in the same in-page message, now set in the shared lettering. | vitest |
| AC-3 | A successful submission still reports what was sent in the same words, and the register below still picks the new file up. | vitest |
| AC-4 | The whole slip is completable by keyboard alone — the setting, the real file field and the submit are all reachable in a sensible order, each showing where the focus is. | playwright |
| AC-5 | An Approver's screen carries no submit form at all — it is absent from the page, not present and unavailable. | vitest |

## Manual test checklist

- As an Importer, open Expense files → the setting and the file are underlined fields with small capitalised labels, not boxes inside a card
- Choose only a setting → Submit stays unavailable until you also choose a CSV
- Choose a file that is not a CSV → you get the same refusal naming the file, now in the new lettering
- Fill in and send the slip using the keyboard only → you reach the setting, the file field and Submit in order, and can always see where you are
- Submit a valid file → it is accepted exactly as before and turns up in the list below
- Sign in as an Approver → there is no submit form on the screen at all

## Reuse notes (from the planner — read before implementing)

- Import `RULED_FIELD_CLASS` and `FIELD_LABEL_CLASS` from `web/src/components/requests/fieldNotation.ts`; BR6 forbids re-declaring an equivalent class string here.
- Keep a **real** `<input type="file">` in the tab order — an underline-only treatment must not become a div-with-a-click-handler. R4 (keyboard completability) is asserted by AC-4.
- The behaviour layer is reused untouched: `web/src/lib/files/{fileSubmissions,parseSubmittedFileCsv}.ts` and `lib/auth/identity.ts`'s `actingUploaderIn` (the single gate both `/upload` and `/upload/file` read).
- Hidden-never-disabled: an Approver's page carries no form at all, not a disabled one.
- Nothing here touches the root layout, the fonts or `globals.css`.
