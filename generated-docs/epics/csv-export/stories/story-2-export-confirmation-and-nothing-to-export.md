# Story 2 — Know what you exported, and be told when there is nothing to export

- **Epic:** `csv-export` — Export requests for the payment system
- **Slug:** `story-2-export-confirmation-and-nothing-to-export`
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Roles:** Finance Uploader, Approver
- **Requirement IDs:** R4, BR1, BR2
- **Infrastructure only:** no

## Plain summary

After an export, you get an in-app confirmation naming how many requests went into the file, who produced it
and when — so the hand-over is attributable to a person. And if your search and filters match no requests,
exporting tells you that instead of saving an empty file.

## Summary

Adds the completion confirmation through the app's single notification surface (`useToast`), carrying the
exported count, the signed-in person's name (from `displayNameOf(session)` on the server page, passed in as a
prop — never read in the browser) and the time, satisfying the brief's Compliance Exception attribution half.
Also handles the narrowed-empty path: the export control stays present when the narrowing has emptied the list
(never removed, never disabled), and activating it surfaces the list's existing narrowed-empty wording instead
of producing a file. Keyboard completability for the trigger and its feedback is proved here.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | A completed export raises an announced in-app confirmation naming how many requests were exported, the signed-in person who produced it, and when. | `vitest` |
| AC-2 | When the active search and filters match no requests, the export action is still there to use, and activating it saves no file — the user is told no requests match what is currently applied. | `vitest` |
| AC-3 | Changing the search or a filter and exporting again produces a file matching the new narrowing, with a confirmation naming the new count. | `playwright` |
| AC-4 | The export action can be reached and activated using the keyboard alone, and its confirmation is perceivable without a mouse. | `playwright` |

## Manual test checklist

- ☐ Narrow the list, then export → a confirmation appears naming how many requests were exported, your name, and the time.
- ☐ Clear the filters and export again → the new confirmation names the larger count.
- ☐ Search for something that matches nothing, then click Export → you are told no requests match, and no file is saved.
- ☐ Reach the Export action with the Tab key only and press Enter → the export runs and the confirmation appears, with no mouse used.
- ☐ Sign in as the other role and export → the confirmation names that person instead of you.

*Plus 1 technical check verified automatically.*

## Why the attribution matters

This story carries the **second half of the brief's mandatory Compliance Exception**. The first half is
Story 1's unmasked account number; this half is that the export is *attributed to the signed-in user who
produced it*. Both are required — an export that carries the full account number with no record of who
produced it does not satisfy the exception. No persisted audit log is required beyond this in-app attribution.

## Implementation notes (reuse — do not re-derive)

- The confirmation goes through the app's single notification surface — `useToast` from
  `web/src/contexts/ToastContext.tsx`, mounted once by the root layout (`region` named Notifications, role
  varies by variant). No new notification mechanism. Any Vitest render of the list needs the provider +
  container composition the app always has.
- The signed-in person's name comes from the server page via `displayNameOf(session)`
  (`web/src/lib/auth/identity.ts`) passed into the client list as a prop — the same arrangement as
  `SubmittedFileDetail`'s `actingUploader`. **Nothing reads an identity in the browser.**
- **Wording collision to resolve, not duplicate:** the brief's BR2 quotes the source spec's *"No expense
  requests match the current search and filters."*, while the list already ships `NARROWED_EMPTY_MESSAGE` =
  *"No expense requests match what is currently applied."* Surface the **existing** sentence rather than
  adding a second, near-identical one to the same screen.
- The export control must stay **present and enabled** when the narrowing has emptied the list — it is not
  removed and not disabled; activating it explains why no file was produced. This keeps the control's
  presence stable and keyboard-reachable regardless of the list's contents.
- The confirmation carries no colour value of its own (styling-centralisation).
