# Epic: Upload an expense file

Inherits roles, auth, data source, compliance, and styling from project.md.

**Depends on:** `sign-in-and-app-shell` (a signed-in session and the app shell/header are assumed present before this epic's screens are reachable).

---

## Goal

Let the Finance Uploader submit a CSV batch of expense payment requests against a named file setting, and let both roles watch each submitted file's status and imported record count.

---

## Data Model

Scoped to what this epic reads and writes. Full field tables live in `documentation/requirements-application.md` §7; only the fields this epic's screens use are called out below.

### ExpenseFile (backend contract: `FileLog` / `FileLogList`)

| Field | Type | Required | UI-display | Notes |
|---|---|---|---|---|
| Id | integer | yes | hidden | Internal identity; used as `LogId` on retry/cancel/download calls (next epic) and `FileLogId` on download calls. |
| ProcessDate | string | yes | table-col | When the file was processed. |
| SettingName | string | yes | table-col | The named file setting the file was submitted against. |
| CurrentFileName | string | yes | table-col | The submitted file's own name. |
| RecordCount | string | yes | table-col | How many rows the file contained / imported. |
| CurrentStatus | string | yes | chip | `Uploaded` \| `Validating` \| `Validation failed` \| `Imported` \| `Cancelled` — this epic surfaces all five values in the list (see §2.5 state-transition matrix) but only drives the `Uploaded → Validating → Imported` and `→ Validation failed` transitions; `Cancelled` and the retry transition are the next epic's concern. |
| LastExecutedActivityName | string | yes | detail | The most recent processing activity — this is the "most recent processing activity" R6 requires; no separate processing-history viewer is in this epic's scope. |
| IsActive | boolean | yes | detail | Whether the file is still active; drives which files the `GET /v1/file-logs?IsActive=Yes` list call returns. |

### FileSetting (backend contract: `FileSettingRead` / `FileSettingReadList`)

| Field | Type | Required | UI-display | Notes |
|---|---|---|---|---|
| Id | integer | yes | hidden | Sent as `FileSettingId` on upload. |
| Name | string | yes | form-input (picker) | The setting name the uploader chooses before submitting a file. |
| SourceName | string | yes | detail | Where files for this setting come from — display-only context in the picker, not editable here. |
| TypeName | string | yes | detail | The kind of file this setting describes — display-only context. |
| IsActive | boolean | yes | — | Only active settings are offered in the picker. |

FileSetting creation/editing (`PUT /v1/file-settings/{SettingId}`) is **not** in this epic — only `GET /v1/file-settings` (read, to populate the picker) is used.

### FileProcessLog

Referenced only for the `LastExecutedActivityName` value already carried on `FileLog` above. The dedicated processing-history list (`GET /v1/file-process-logs/{LogId}`, source F-23/UI-27, priority Could) is **not** assigned to this epic.

---

## Functional Requirements

1. **R1** — The frontend shall let the Finance Uploader submit an expense file against a named file setting; the file is accepted for processing and listed. *(source F-04)*
2. **R2** — If a submitted file is not a CSV file, the frontend shall refuse it and state that only CSV files can be uploaded. *(source F-05)*
3. **R3** — The frontend shall list every submitted expense file with its current processing status, most recent processing activity and imported record count. *(source F-06)*
4. **R4** — A non-CSV file is refused before processing begins — the check happens client-side, before any upload request is sent. *(source BR-07)*
5. **R5** — The submitted file's name must identify a CSV file (format validation on `ExpenseFile.CurrentFileName`). *(source VR)*
6. **R6** — The chosen file name is visible before submission, and the submitted file appears in the file list afterwards. *(source UI-01)*
7. **R7** — When a non-CSV file is chosen, the submission is refused with a statement that only CSV files can be uploaded, and the user can choose a CSV file and submit again. *(source ES — Upload flow, error)*
8. **R8** — Only the Finance Uploader can submit a file; the Approver is not offered the submit action. *(source RBAC — Finance Uploader: ExpenseFile C/R/D and "Upload an expense file" X; Approver: ExpenseFile R only)*
9. **R9** — Both the Finance Uploader and the Approver can read the file list, the file settings, and the identity reference data (User, Role) used to render it. *(source RBAC — ExpenseFile R, FileSetting R, User R, Role R for both roles)*
10. **R10** — The Finance Uploader receives an in-app notification when a submitted file finishes importing. *(source NT-01)*
11. **R11** — From any signed-in screen, the user can reach every other screen their roles permit, without using the browser's Back button. *(source: added during this epic's manual test, 2026-08-04 — see Notes)*

---

## Business Rules

1. **BR1** — Submitting a file requires all three of a chosen file setting (`FileSettingId` + `FileSettingName`), a selected CSV file, and the file's own name (`FileName`); the upload call (`POST /v1/files/upload`) is not made until all three are present.
2. **BR2** — A submitted file's status is `Uploaded` immediately on acceptance, then moves through `Validating` to either `Imported` (no invalid rows) or `Validation failed` (one or more invalid rows) — per §2.5's state-transition matrix. This epic renders all five `CurrentStatus` values in the file list, but only owns the three transitions above; `Validation failed → Validating` (retry) and any `→ Cancelled` transition belong to the `file-validation-and-retry` epic.
3. **BR3** — The non-CSV check (BR-07, blocker) runs client-side on file selection/submission, before the upload request is issued — a rejected file never reaches the backend.
4. **BR4** — The submit action is hidden (not shown disabled) for a signed-in user without the Finance Uploader role, per UI-24's rule that role-excluded actions are hidden rather than disabled.
5. **BR5** — The status, most-recent-activity and record-count values shown for a file are exactly what `GET /v1/file-logs` returns; the frontend does not compute or infer these values.
6. **BR6** — The set of screens offered for navigation is exactly the set the current session's roles permit, read from the one access map (`entryPointsFor`) — the same facts the landing screen already renders. A screen a role excludes is absent, never shown disabled (the UI-24 convention epic 1 established). A permitted screen whose own epic has not shipped yet is still offered, and reaching it lands on a not-found page — user-accepted interim state, see Notes.

---

## Key Workflows

### Submit an expense file (Finance Uploader)

1. Open the file-upload screen; the list of active named file settings is fetched (`GET /v1/file-settings`) and offered as a picker.
2. Choose a file setting; the chosen setting is shown.
3. Select a file from the local filesystem; if its name does not identify a CSV file, the submission is refused immediately with "Only CSV files can be uploaded." — no request is sent (R2, R4, R5, R7).
4. If the file is a CSV, its chosen name is shown before submission (R6).
5. Submit the file (`POST /v1/files/upload`, sending `FileSettingId`, `FileSettingName`, `FileName` and the raw file bytes); the file appears in the file list with an in-progress (`Uploaded` / `Validating`) status (R1, R3).
6. The file's row in the list reflects status changes as validation proceeds, resolving to `Imported` or `Validation failed`, without the user manually reloading the page.
7. On reaching `Imported`, the Finance Uploader receives an in-app notification naming the file and the imported record count (R10).

### View submitted files (both roles)

1. Open the file list; every submitted file is shown with its file name, the setting it was submitted against, current status, most recent processing activity, and record count (`GET /v1/file-logs?IsActive=Yes`) (R3, R9).
2. The Approver sees the same list but is not offered the submit action (R8).

---

## Feature NFRs

- **Keyboard completability:** the file-setting picker, file chooser and submit action are all operable by keyboard alone, per the project's WCAG 2.2 AA bar (§6.6.5 of the source requirements, superseding the template's baseline WCAG 2.1 AA).
- **Status legibility:** the file-status column conveys `CurrentStatus` via an intent-mapped colour paired with an icon or text label — never colour alone (source UI-21; palette tokens in `project.md` §Styling — Info for `Uploaded`/`Validating`/`Imported`, Warning or Error for `Validation failed`, per the semantic mapping already defined at project level).
- **List currency:** a file's row must reflect its current `CurrentStatus` / `LastExecutedActivityName` / `RecordCount` without requiring a manual page reload while that file is still processing (`Uploaded` or `Validating`) — the source states this explicitly for the transaction list (F-20) and implies it here via §5's flow step "wait for validation to finish; the file's status resolves". Flagged as an inference in Notes below.

---

## Out of Scope

- Viewing a failed file's rejected rows, downloading the generated error file, retrying validation, and cancelling a file — all deferred to the `file-validation-and-retry` epic.
- Downloading the originally submitted file (source F-10, priority Could) and viewing a file's full processing history (source F-23/UI-27, priority Could) — neither is in this epic's assigned requirements.
- Creating or editing file settings (`PUT /v1/file-settings/{SettingId}`) — only reading the list to populate the picker is in scope.
- Everything downstream of import: the transaction list, search/filter, duplicate marking, approval/rejection, export — all later epics.
- User and role administration — explicitly out of scope for the whole application (source §1.5).

---

## Notes & Caveats

- **Navigation added mid-epic (R11 / BR6), 2026-08-04.** At this epic's manual test the user reported *"There is no menu in the application"* — correct: epic 1's header carried the app name, the theme switch and the user menu, and the only route into a screen was the landing screen's entry-point cards, with the browser Back button the only way out. No requirement names a menu (source §1 excludes UI layout, deferring it to a later UX design step), so this is a **scope addition, not a missed requirement**. The user chose to add it to this epic rather than defer it, because this epic is what made a second real screen reachable. It is shell work and every later epic inherits it.
  - The user also chose that the menu offers **every permitted screen**, mirroring the access map exactly — so an Approver is offered "Review and decide expense requests" now and reaches a not-found page until the `expense-request-list` epic builds it. Accepted knowingly; it matches the "KNOWN, DELIBERATE INTERIM STATE" already documented in `web/src/lib/auth/access-map.ts`, and it means no epic has to remember to add itself to the menu.

- **List-refresh inference — RESOLVED at the stories approval (2026-08-03):** the source's automatic-refresh requirement (F-20, UI-05) is stated for the shared transaction list, not explicitly for the file list. This brief extended the same expectation to the file list's status column (Feature NFRs above) because §5's Upload flow describes the uploader waiting for validation to resolve on-screen. **The user confirmed the auto-refresh behaviour** over a manual-refresh-button alternative: while any listed file is still processing the list re-reads itself on an interval and stops once nothing is in progress. Story 3 owns it. This also settles the convention for the later `expense-request-list` epic, whose auto-refresh (R20/R48) is explicit in the source.
- **Upload request shape:** `POST /v1/files/upload` takes `FileSettingId`, `FileSettingName` and `FileName` as **query parameters** and the raw file as an `application/octet-stream` request body — not a multipart form. The frontend's API client wrapper for this call needs to build the query string and stream the file body directly.
- **`GET /v1/file-logs` requires `IsActive`** as a required query parameter (example value `"Yes"`). This epic's list call should default to `IsActive=Yes` to show active files (cancelled files, out of this epic's scope, are the `Cancelled` / inactive case).
- **CORS is an open backend item** (project.md NFR-base-6): neither the auth-api/BFF nor the transactions-api currently returns `Access-Control-Allow-Origin` for the browser-origin cookie flow this epic's upload and list calls depend on. Treat any in-browser cross-origin failure during BUILD as this known backend dependency, not a frontend defect.
- **Terminology note (source §9):** the sample CSV and the consumed contract both call each row a "transaction"; this epic's own subject is the **file**, not its rows — row-level detail belongs to later epics.
- **Sample file shape** (`documentation/transactions_2026-04-15.csv`) confirms the CSV rows carry `Reference,TransactionDate,AccountNumber,Description,Amount,TransactionType,Currency` — none of these columns are inputs to the upload call itself (which only needs the file, its name, and the chosen setting); they matter to the *next* epic's validation, not this one.
- No prototype source exists for this project (docs-only intake) — no prototype shortcuts to flag.
