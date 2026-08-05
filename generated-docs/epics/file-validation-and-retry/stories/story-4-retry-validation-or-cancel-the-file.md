# Story 4 — Retry validation or cancel the file

- **Slug:** `story-4-retry-validation-or-cancel-the-file`
- **Epic:** `file-validation-and-retry` — Rejected rows, retry and cancel
- **Requirement IDs:** FR4, FR5, BR1, BR2, BR3
- **Roles:** Finance Uploader
- **Route:** `/upload/file`
- **Target file:** `web/src/app/(authenticated)/upload/file/page.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary (user-facing)

On a file whose validation failed, the Finance Uploader can retry validation — the file goes back to an in-progress status, a new step is recorded, and the outcome shows when it resolves — or cancel the file. Cancelling asks for confirmation first: it names the file, says the file and its rows are removed and cannot be recovered, and the "keep the file" choice holds focus, with nothing happening until it is confirmed. An Approver is offered neither action.

## Technical summary

Adds the two mutating actions to the submitted-file page:

| Action | Endpoint | Header |
|---|---|---|
| Retry validation | `POST /transactions-api/v1/files/retry-validation?LogId=<id>` | none — the spec declares no `LastChangedUser`; **do not add one speculatively** |
| Cancel file | `DELETE /transactions-api/v1/files?LogId=<id>` | `LastChangedUser`, populated from the authenticated identity (`GET /v1/auth/userinfo`) — **never from user input** |

That header asymmetry is as-documented; preserve it.

**Which actions are offered** is decided server-side from the session role, matching the existing `/upload` pattern (`hasRole(session, ROLE_IMPORTER)`), so an Approver's browser never receives the markup. **Which actions apply** is decided from the file's status: retry while validation has failed; cancel while `Uploaded` or `Validation failed`.

The cancel confirmation follows the project's `UI-09` convention — names the affected file, states the action is irreversible, the cancel-out ("keep the file") choice holds focus, and nothing takes effect until confirmed. `UI-09` is formally assigned to the `expense-decisions` epic, but its cancel-file clause governs this action; **do not treat this cancel as exempt because the requirement lives elsewhere.**

After a confirmed cancel the file is inactive and therefore gone from the active list — which is why the user is returned to the Expense files list rather than left on a page whose file no longer resolves.

BR1 (a file with invalid rows is never imported while they remain) and BR2 (a cancelled file's rows are removed from staging, from either originating status) are service-side guarantees this story surfaces rather than enforces — the frontend computes neither.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | A Finance Uploader viewing a file whose validation failed is offered Retry validation and Cancel file; an Approver viewing the same file is offered neither — both are absent from the page rather than shown greyed out. | `playwright` |
| AC-2 | Retry validation is offered only while the file's validation has failed; Cancel file is offered while the file is awaiting processing or has failed validation; neither is offered once the file has imported or been cancelled, and the page states the file's state instead. | `vitest` |
| AC-3 | Retrying puts the file back into an in-progress status and records a new processing activity, and the page shows the outcome when it resolves — imported, or failed again with the rejected rows and error file refreshed for the new attempt. | `vitest` |
| AC-4 | Choosing Cancel file asks for confirmation first: the confirmation names the file, says the file and its rows are removed and it cannot be undone, opens with the keep-the-file choice holding focus, and nothing is cancelled unless it is confirmed. | `vitest` |
| AC-5 | Confirming the cancel deactivates the file, and the file is no longer in the Expense files list afterwards. | `playwright` |
| AC-6 | A retry or a cancel the service refuses is reported on the page using the service's own wording where it sent one, and leaves the file exactly as it was. | `vitest` |

## Manual test checklist

- ☐ Sign in as an Importer and open a file whose status is 'Validation failed' → you see Retry validation and Cancel file
- ☐ Sign in as an Approver and open that same file → neither Retry validation nor Cancel file appears anywhere on the page
- ☐ Choose Retry validation → the file goes back to an in-progress status and a new step appears in its processing history
- ☐ Choose Cancel file → a confirmation names the file, warns it cannot be undone, and the keep-the-file choice already has focus
- ☐ Press Escape at that confirmation → nothing is cancelled and the file is untouched
- ☐ Confirm the cancel → the file is gone from the Expense files list
- ☐ Open a file that has already imported → neither Retry validation nor Cancel file is offered, and the page says the file has imported

Plus 2 technical checks verified automatically.

## Infrastructure & reuse notes

The epic-wide list lives in `story-1-open-a-submitted-file.md` — read it. The ones that bite hardest here:

- Role-conditional actions are decided on the SERVER and left out of the markup, never rendered disabled (UI-24) — `app/(authenticated)/upload/page.tsx` already shows the shape with `hasRole(session, ROLE_IMPORTER) && <SubmitExpenseFileForm />`. Match on `ROLE_IMPORTER` / `ROLE_APPROVER` from `web/src/types/auth.ts` (the auth service's own wire names); matching on "Finance Uploader" recognises nobody.
- The cancel confirmation is the Shadcn `alert-dialog`; that primitive is **already installed** and its overlay has been changed to the `bg-overlay/60` token — do not regenerate it from the CLI, which reinstates a colour keyword. Radix in jsdom needs the Pointer Capture / `scrollIntoView` stand-ins already supplied by `vitest.setup.ts`.
- A list that keeps itself current re-reads its OWN call on one interval, only while something it lists is in progress, and a re-read that fails leaves the last known values on screen. AC-3's "outcome when it resolves" follows that established pattern (`SubmittedFilesList` / `isFileInProgress`) — do not invent a second polling mechanism.
- A failed call's user-facing wording is `serviceMessageOf(e) ?? serviceDetailOf(e) ?? <own wording>` from `web/src/lib/api/errors.ts` (AC-6).
- `fileLogProgression([...])` gives the same file at successive statuses — that is the factory a retry test needs.
- Playwright alert queries must be scoped to a region (e.g. `getByRole('main').getByRole('alert')`) — Next renders a permanently empty body-level `role="alert"` route announcer, so an unscoped query always matches two elements.
