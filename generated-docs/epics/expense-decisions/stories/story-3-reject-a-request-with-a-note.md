# Story 3: Reject a request with a note

- **Epic:** `expense-decisions` — Approve or reject a request
- **Slug:** `story-3-reject-a-request-with-a-note`
- **Requirements:** R2, R7, R9, R10, R11, R15, BR4, BR6, NFR1
- **Roles:** Approver (`ROLE_APPROVER`)
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary

An Approver can reject a request, and must say why. Rejecting asks for a note; sending it with the note blank (or just spaces) is refused with "Add a note explaining why this request is rejected." Once you confirm, the request reads Rejected, your note is shown with it, and the decide actions disappear. The whole rejection can be done with the keyboard alone.

## Technical summary

Adds the rejection path onto story 2's decide surface: a note field checked **on submit** (never on keystroke, per the project's validation-timing convention) with the brief's exact refusal wording for an empty or whitespace-only value, then the same reference-naming confirmation with Cancel holding focus.

On confirmation the decision endpoint is called with `{ UserNote }`, the request reads Rejected with the note rendered alongside it via the existing detail surface, decide actions are withdrawn, and a transient confirmation is raised. Approving continues to ask for no note.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Choosing Reject asks the Approver for a note before any decision is recorded, while choosing Approve asks for none. | vitest |
| AC-2 | Submitting a rejection with the note blank or only spaces is refused with "Add a note explaining why this request is rejected.", nothing is recorded, and the refusal appears on submitting rather than while typing. | vitest |
| AC-3 | With a note written, the Approver is asked to confirm, the message names the request by its reference and says it is a rejection, and Cancel holds focus; cancelling records nothing. | vitest |
| AC-4 | Confirming records the rejection with its note: the request reads Rejected, the note is shown with it, the decide actions are withdrawn, and a confirmation message is shown. | vitest |
| AC-5 | The whole rejection — reaching the action, writing the note, correcting a missing note and confirming — can be completed with the keyboard alone. | playwright |

## Manual test checklist

- As an Approver, choose Reject on a request awaiting a decision → you are asked for a note
- Try to send it with the note empty (and again with only spaces) → it is refused with "Add a note explaining why this request is rejected." and nothing is recorded
- Type a note → the refusal message goes away and you are asked to confirm, with the request named by its reference and Cancel already selected
- Confirm → the request now reads Rejected, your note is shown with it, and Approve and Reject are gone from it
- Open the same request again → the note is still there, exactly as you wrote it
- Do the whole rejection again using only the keyboard (Tab, arrow keys, Enter/Space) → every step is reachable and you can complete it without a mouse

## Infrastructure reuse notes

- Reuse story 2's confirmation component and decide plumbing — this is the *same* dialog with a note step, not a second confirmation implementation.
- The note field composes the Shadcn `textarea` / `label` primitives (install with `(cd web && npx shadcn add textarea --yes)` only if genuinely missing) — never a hand-rolled input.
- The rejection note is rendered by `RequestDetailPanel.tsx`, which already displays `UserNote` — do not add a second place a note is shown.
- Decide calls go through story 1's `web/src/lib/api/decisions.ts` with `{ UserNote }` as the reject body.
- Validation wording is verbatim from the brief (R9/BR4): "Add a note explaining why this request is rejected."
- `vitest.setup.ts` already supplies the jsdom stand-ins Radix needs (`matchMedia`, pointer capture, `scrollIntoView`) — required for `alert-dialog` and `dropdown-menu`.

## Notes

- **Validation timing is a project convention**: cross-field / required checks fire **on submit**, not on keystroke (requirements §6.3 header). AC-2 asserts this explicitly — a note field that complains while the user is still typing fails this story.
- The note is required **only** for rejection (R9) — approving must never ask for one.
- NFR1 (fully keyboard-completable) is the whole flow, not just the dialog: reaching the Reject action in the overflow, writing the note, seeing and correcting the refusal, and confirming.
- Cancel still holds initial focus on the confirmation (NFR2, inherited from story 2) even though the flow now contains an editable field earlier in it.
