# Story 1 — Open a submitted file and see its processing history

- **Slug:** `story-1-open-a-submitted-file`
- **Epic:** `file-validation-and-retry` — Rejected rows, retry and cancel
- **Requirement IDs:** FR8, BR4
- **Roles:** Finance Uploader, Approver
- **Route:** `/upload/file`
- **Target file:** `web/src/app/(authenticated)/upload/file/page.tsx`
- **Page action:** `create_new`
- **Infrastructure only:** no
- **Epic shared surface:** yes — this story creates the submitted-file page that stories 2–4 render their sections inside. The epic's cross-story role baseline and its one real-browser accessibility scan belong here.

## Plain summary (user-facing)

Each file in the Expense files list becomes something you can open. The file's own page names the file, the setting it was sent against, when it was processed, its status and how many rows it held — and lists every processing step it has been through, with the outcome and the times each step started and finished. Both the Finance Uploader and the Approver can open it.

## Technical summary

Creates the per-file screen at `/upload/file?LogId=<id>` — a page under `app/(authenticated)/upload/file/`, registered in `lib/auth/access-map.ts` for both roles (no landing-screen entry point; it is reached from the file list).

The page has no get-one-file endpoint available, so it resolves the file by reading the existing `GET /transactions-api/v1/file-logs?IsActive=Yes` and finding the requested `LogId` — which is also what makes BR4 fall out for free: a cancelled (inactive) file is absent from that list, so its page says the file is no longer available rather than surfacing history.

Adds:

- `GET /transactions-api/v1/file-process-logs/{LogId}` to `lib/api/files.ts`
- the `FileProcessLog` / `FileProcessLogList` types to `types/files.ts` — **wire quirk:** the list body's array property is `FileLog`, not `FileProcessLog`
- a `mocks/data/file-process-log.ts` factory
- a `FileProcessingHistory` component with the three non-data states (loading, empty, failed)
- one "open" link per row in the existing `SubmittedFilesList`

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Each row of the Expense files list offers a way to open that file, and opening it shows that file's name, the setting it was submitted against, when it was processed, its status chip and its record count — every value as the service reported it. | `playwright` |
| AC-2 | Both a Finance Uploader and an Approver can open a submitted file's page and read its processing history; any other signed-in account is refused in place with the missing permission named, as every other screen in this app does. | `playwright` |
| AC-3 | The processing history lists every recorded activity for the file with the outcome recorded for it and the times it started and finished. | `vitest` |
| AC-4 | While the history is being read the wait is announced rather than merely drawn; a file with no recorded activity yet says so plainly; and a failed read shows the service's own wording with one action that asks for it again. | `vitest` |
| AC-5 | Opening the page for a file that is no longer in the active list — cancelled, or an identifier that matches nothing — explains that the file is not available and offers the way back to the Expense files list, instead of a blank page or an error screen. | `vitest` |
| AC-6 | The finished submitted-file page passes an accessibility scan in a real browser, and every link and control on it can be reached and operated by keyboard alone. | `playwright` |

## Manual test checklist

- ☐ Sign in as an Importer, open Expense files and open one of the files → you land on that file's own page, showing its name, setting, status and record count
- ☐ Look at the processing history on that page → every step the file went through is listed with its outcome and when it started and finished
- ☐ Sign in as an Approver and open the same file → you see the same page and the same history
- ☐ Press Tab from the top of the file page → every link and button takes focus in a sensible order with a visible focus ring, and Enter activates them
- ☐ Change the file identifier in the address bar to one that does not exist → the page says the file is not available and offers a way back to Expense files, rather than a blank or error screen
- ☐ Use the browser Back button → you return to the Expense files list with the list intact

Plus 2 technical checks verified automatically.

## Infrastructure & reuse notes (epic-wide)

- Every backend call goes through `web/src/lib/api/client.ts` at the app's OWN same-origin address (`/transactions-api/...`, mounted by `app/transactions-api/[...path]/route.ts`) so the session cookie travels by itself. Never a service URL in browser code, never a bare `fetch()`.
- New file endpoints (retry, cancel, both downloads, validation errors, process logs) belong in `web/src/lib/api/files.ts` — the module already says so in its own header — alongside `fetchSubmittedFiles` / `fetchFileSettings` / `uploadExpenseFile`.
- A failed call's user-facing wording is `serviceMessageOf(e) ?? serviceDetailOf(e) ?? <own wording>` from `web/src/lib/api/errors.ts`; the transactions service reports refusals as a 500 with `Messages[]`, which lands on `details`, so `serviceMessageOf` alone finds nothing. `uploadFailureMessage` in `files.ts` is the pattern to copy.
- File types, the five status names and `isKnownFileStatus` / `isFileInProgress` already exist in `web/src/types/files.ts` — extend it with the `FileProcessLog` shapes rather than declaring new ones. `HasBulkErrorFile` is the STRING `'Yes'`/`'No'` on the wire, and `RecordCount` is a string; nothing is recomputed in the frontend.
- Wire quirk to preserve: `GET /v1/file-process-logs/{LogId}` returns `{ FileLog: [...] }` — the array property is `FileLog`, not `FileProcessLog` (transactions-api.yaml `FileProcessLogList`). `GET /v1/files/validation-errors` returns `{ ValidationErrors: { JsonArray: "<json string>" } }` — a JSON array delivered AS A STRING, so it must be parsed, and an unparseable body is a handled failure state.
- Mock factories go in `web/src/mocks/data/` and re-export the production types/constants rather than re-declaring them (`file-log.ts` is the model). `fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED)` already produces a coherent failed file with `HasBulkErrorFile: 'Yes'` and a `BulkErrorFile` name; `fileLogProgression([...])` gives the same file at successive statuses, which is what a retry needs. Both layers import these — Vitest via `@/mocks/data/...`, Playwright via a relative path.
- The new address is registered in `web/src/lib/auth/access-map.ts` and nowhere else, and the page returns `<PermissionDeniedMessage deniedPath={...} />` when `canAccess()` is false before rendering anything. `addressOf()` in that module already strips the query string, so `/upload/file` registers exactly and `?LogId=5001` resolves against it with no new gating machinery. Give the entry no `entryPoint` copy — it is reached from a file's row, not from the landing screen or the header nav.
- Role-conditional actions are decided on the SERVER and left out of the markup, never rendered disabled (source UI-24) — `app/(authenticated)/upload/page.tsx` already shows the shape with `hasRole(session, ROLE_IMPORTER) && <SubmitExpenseFileForm />`. Match on `ROLE_IMPORTER` / `ROLE_APPROVER` from `web/src/types/auth.ts` (the auth service's own wire names); matching on "Finance Uploader" recognises nobody.
- Notifications go through the root layout's existing `ToastProvider` / `useToast` (`web/src/contexts/ToastContext.tsx`, `web/src/components/toast/`). Story 3 of `expense-file-upload` pinned a contract: `SubmittedFilesList` carries no session/role prop and its notification is not role-gated — so story 5's Finance-Uploader-only notification must arrive as an OPTIONAL prop that still notifies by default, leaving epic 2's tests honest.
- The status chip, its intent→token mapping and the pass-through of an unrecognised status already exist inside `SubmittedFilesList.tsx`. Reusing that presentation on the file page means extracting the badge rather than writing a second one — a status must never be shown by colour alone, and no component may name a colour (all tokens live in `web/src/app/globals.css`).
- The cancel confirmation is the Shadcn `alert-dialog`; that primitive is already installed and its overlay has been changed to the `bg-overlay/60` token — do not regenerate it from the CLI, which reinstates a colour keyword. Radix in jsdom needs the Pointer Capture / `scrollIntoView` stand-ins already supplied by `vitest.setup.ts`.
- Playwright alert queries must be scoped to a region (e.g. `getByRole('main').getByRole('alert')`) — Next renders a permanently empty body-level `role="alert"` route announcer, so an unscoped query always matches two elements.
- A list that keeps itself current re-reads its OWN call on one interval, only while something it lists is in progress, and a re-read that fails leaves the last known values on screen. Story 4's post-retry "outcome when it resolves" should follow that established pattern, not invent a second polling mechanism.
- CORS is still absent on the transactions service (project.md NFR-base-6). The same-origin proxy makes it a non-issue for these calls; report any API error truthfully per CLAUDE.md Rule 3 rather than working around it.
