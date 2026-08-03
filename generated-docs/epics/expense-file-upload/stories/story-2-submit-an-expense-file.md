# Story 2: Submit an expense file

- **Epic:** `expense-file-upload` — Upload an expense file
- **Slug:** `story-2-submit-an-expense-file`
- **Requirements:** R1, R2, R4, R5, R6, R7, R8, BR1, BR3, BR4
- **Roles:** Finance Uploader (submits), Approver (sees no submit surface)
- **Route:** `/upload`
- **Target file:** `web/src/app/(authenticated)/upload/page.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary

The Finance Uploader chooses one of the named file settings, picks a CSV file from their computer, sees the file's name on screen before sending it, and submits it — after which it appears in the list. A file that is not a CSV is refused on the spot with "Only CSV files can be uploaded." and is never sent. An Approver, on the same screen, is not offered the submit form at all.

## Technical summary

Adds the submit surface to the `/upload` screen: fetches `GET /transactions-api/v1/file-settings`, offers only the **active** settings as a picker, takes a local file, and calls `POST /transactions-api/v1/files/upload` with `FileSettingId`, `FileSettingName` and `FileName` as **query parameters** and the raw file as an `application/octet-stream` body (**not** multipart — see brief Notes).

The CSV check is client-side on selection, before any request (BR3), and submit is unavailable until a setting and a CSV file are both present (BR1). The submit form is **absent from the markup** for a session without the Finance Uploader role (BR4 / UI-24), decided by `hasRole` against the session the layout already resolved.

The existing `/transactions-api/[...path]` proxy already exports POST and buffers the request body, so no new routing is needed.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | The Finance Uploader's submit form offers only the active named file settings the service returns, shows the chosen CSV file's name before submission, and allows submitting only once both a setting and a file have been chosen. | vitest |
| AC-2 | A signed-in Approver on the same screen is offered no submit form and no submit action anywhere on the page — absent from the page, not shown disabled. | vitest |
| AC-3 | A chosen file whose name does not identify a CSV is refused in place with "Only CSV files can be uploaded." and nothing is sent to the service; choosing a CSV afterwards clears the refusal and allows submitting. | vitest |
| AC-4 | Submitting a chosen CSV against a chosen setting confirms the submission and the file appears in the list with an in-progress status. | playwright |
| AC-5 | A submission the service refuses shows the reason the service gave and leaves the chosen setting and file in place so the user can submit again. | vitest |
| AC-6 | The setting picker, the file chooser and the submit action are each reachable and operable using the keyboard alone. | playwright |

## Manual test checklist

- Sign in as a Finance Uploader and open the expense files screen → you see a submit form offering the named file settings to choose from
- Before choosing anything, try to submit → you cannot submit until both a setting and a file are chosen
- Choose a setting, then pick a file that is not a CSV (a .xlsx or .txt) → you are told only CSV files can be uploaded
- Pick a CSV file instead → its file name is shown on the screen before you submit, and the earlier refusal is gone
- Submit the CSV → you get a confirmation and the file appears in the list with an in-progress status
- Do the whole flow again using only the keyboard → you can choose the setting, pick the file and submit without touching the mouse
- Sign in as an Approver and open the same screen → there is no submit form and no upload action anywhere on the page

## Infrastructure reuse notes

- The submit-action check inside the screen uses `hasRole(session, ROLE_FINANCE_UPLOADER)` from `web/src/lib/auth/roles.ts` — no new gating mechanism, and the excluded action is **left out of the markup**, never disabled.
- The `post` helper in `web/src/lib/api/client.ts` JSON-stringifies its body and defaults `Content-Type` to `application/json`; this upload needs a raw `application/octet-stream` body with query parameters, so add a dedicated endpoint wrapper (e.g. `web/src/lib/api/files.ts`) that calls `apiClient` with an explicit Content-Type and `params` — do **not** call `fetch()` directly (CLAUDE.md §2).
- Forms follow the established convention: Shadcn `form` + react-hook-form + a Zod schema in `web/src/lib/validation/schemas.ts`, validating on blur (never on a keystroke), `noValidate` on the form, required fields marked with an `aria-hidden` asterisk plus one legend line.
- Install `select` with the pinned Shadcn CLI if not already present; `form`, `input`, `label`, `button`, `card` and `alert` are already installed.
- Failed-request wording: show the service's own message via `serviceMessageOf` from `web/src/lib/api/errors.ts`.
- Add a `fileSetting` factory to `web/src/mocks/data/` re-exporting the production type, so both test layers share one contract.

## Notes

- The CSV check is on the **file name** (`ExpenseFile.CurrentFileName`, R5) — it must run before any request is issued (BR3), so a refused file never reaches the backend.
