# Story 1: The submitted expense files list

- **Epic:** `expense-file-upload` — Upload an expense file
- **Slug:** `story-1-submitted-files-list`
- **Requirements:** R3, R9, BR5
- **Roles:** Finance Uploader, Approver
- **Route:** `/upload`
- **Target file:** `web/src/app/(authenticated)/upload/page.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary

Both the Finance Uploader and the Approver can open the expense files screen and see every submitted file — its name, the file setting it was sent against, when it was processed, its current status, its most recent processing step and how many records it holds. While the list is loading they see a placeholder, when nothing has been submitted yet they are told so, and when the list cannot be loaded they get a plain message and a Try again button.

## Technical summary

Replaces the `notFound()` placeholder in the existing `/upload` page with the real screen: reads `GET /transactions-api/v1/file-logs?IsActive=Yes` and renders one row per FileLog with `CurrentFileName`, `SettingName`, `ProcessDate`, `CurrentStatus` (as a labelled status chip driven by the `--info` / `--warning` / `--success` / muted tokens), `LastExecutedActivityName` and `RecordCount`, plus loading / empty / error-with-retry states.

Widens `/upload` in `lib/auth/access-map.ts` from Finance-Uploader-only to **both** roles (brief R9) and rewords its entry-point copy so it reads correctly for an Approver who only watches files; the submit permission stays a role check inside the screen (story 2).

Every displayed value is passed straight through from the service (BR5) — an unrecognised `CurrentStatus` renders as returned, never as an error, matching the project-level "displayed, not policed" decision for service-owned vocabularies.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | The screen lists every active submitted file with the columns the brief's data model names — file name, setting name, process date, status, most recent processing activity and record count. | vitest |
| AC-2 | Each file's status is conveyed by a text label paired with an intent colour — never colour alone — for every status value the brief lists. | vitest |
| AC-3 | The screen shows a placeholder while the list is loading, says no files have been submitted yet when the list comes back empty, and offers a Try again action that re-requests the list when it fails. | vitest |
| AC-4 | A status, activity or record-count value the app does not recognise is displayed exactly as the service returned it, rather than being blanked, translated or treated as an error. | vitest |
| AC-5 | Both a Finance Uploader and an Approver are offered the expense files entry point from the landing screen and see the file list when they open it, not a missing-permission message. | playwright |
| AC-6 | A visit to the expense files address while signed out lands on the sign-in screen, never on the file list. | playwright |

## Manual test checklist

- Sign in as a Finance Uploader and open the expense files screen → each file shows its name, the setting it was sent against, when it was processed, its status, its most recent processing step and its record count
- Sign in as an Approver → the landing screen now offers the expense files entry point, and opening it shows the same list (no missing-permission message)
- Compare two files with different statuses → you can tell the statuses apart by reading them, not only by colour
- Switch to dark mode on the file list → the status labels are still easy to read
- Stop the transactions service and reload the screen → you see a plain message with a Try again button, not a blank screen or a browser error page
- Restart the service and press Try again → the list appears
- Sign out, then type the expense files address straight into the address bar → you land on the sign-in page

## Infrastructure reuse notes

- `/upload` already exists at `web/src/app/(authenticated)/upload/page.tsx` with the server-side permission check in place and a `notFound()` placeholder — **replace** the `notFound()` and leave the `requireSession()` / `canAccess()` check as-is (its own header comment says so). Do not add a second gate.
- Authorisation for the screen lives only in `web/src/lib/auth/access-map.ts` — widen `/upload`'s `allowedRoles` to BOTH roles (brief R9) and reword its `entryPoint` copy so it reads correctly for an Approver who only watches files.
- The browser calls the app's own address only: use `TRANSACTIONS_API_BASE_PATH` from `web/src/lib/utils/constants.ts` with `web/src/lib/api/client.ts`. The proxy at `web/src/app/transactions-api/[...path]/route.ts` already handles GET — no new routing, no direct service URL, no `next.config.ts` rewrite.
- Failed-request wording: show the service's own message via `serviceMessageOf` from `web/src/lib/api/errors.ts`, falling back to the screen's own plain wording when all that came back was a client placeholder.
- Status, brand and surface colours come from the tokens already declared in `web/src/app/globals.css` — `--info`, `--warning`, `--success` and their paired foregrounds exist in both `:root` and `.dark`. No hex literal, colour keyword or Tailwind palette utility in any component.
- Use Shadcn primitives already installed (`card`, `button`, `alert`); install `table`, `badge` and `skeleton` with the pinned CLI if needed. The `alert` **default** variant is the one this project uses — the destructive variant fails contrast for wording the user must act on.
- Mock/test factories belong in `web/src/mocks/data/` and re-export the production types (add a `fileLog` factory beside the existing identity/role/user ones) so mocks cannot drift from the app's contract.
- Playwright alert queries must be scoped to a region (e.g. `getByRole('main').getByRole('alert')`) — Next.js renders a permanently empty body-level `role="alert"` route announcer.

## Notes

- AC-6 is the one deep-link guard this epic carries: epic 1 introduced the protected surface and owns the sign-out / back-button trio, but its specs cannot cover a route that did not exist then.
