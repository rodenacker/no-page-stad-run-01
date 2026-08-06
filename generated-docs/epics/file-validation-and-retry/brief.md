# Epic: Rejected rows, retry and cancel

Inherits roles, auth, data source, compliance, and styling from project.md.

## Goal

Show the Finance Uploader exactly which rows of a file were rejected and why, let them download the error file or the original, retry validation or cancel the file, and let either role review a file's processing history.

## Dependency

Assumes `expense-file-upload` is already in place (upload flow, the active file list, file-setting selection). That epic is the entry point — a file's row in the active file list is what a user opens to reach the failed-file actions this epic adds: invalid-row view, retry, cancel, both downloads, and processing history.

## Data Model

Entities this epic reads and mutates, scoped to failure/retry/cancel/download/history. Full field catalogues live in `documentation/requirements-application.md` §7; only the fields this epic's screens use are called out below.

### ExpenseFile (read + retry/cancel actions)

| Field | Type | Notes |
|---|---|---|
| Id | integer | `LogId` in the API — key for retry, cancel, both downloads, and processing-history lookup |
| CurrentFileName | string | Shown so the uploader can confirm which file they are acting on |
| CurrentStatus | string | Enum: `Uploaded`, `Validating`, `Validation failed`, `Imported`, `Cancelled`. This epic's actions apply while status is `Validation failed` (retry, cancel, view errors, download error file) or, for cancel, also `Uploaded`. |
| RecordCount | string | How many rows the file contained |
| IsActive | boolean | `false` once cancelled — a cancelled file's row disappears from the active list (owned by `expense-file-upload`'s list, but this epic's cancel action is what flips it) |
| HasBulkErrorFile | string | Gates whether the "download error file" action is offered |
| BulkErrorFile | string | The generated error file reference for a failed file |
| LastExecutedActivityName | string | Most recent processing activity name — also the newest row in the processing-history view |

### FileProcessLog (processing-history view — read only)

| Field | Type | Notes |
|---|---|---|
| FileName | string | The file the activity belongs to |
| ActivityName | string | The processing activity that ran (e.g. validation, retry) |
| DecisionResult | string | The outcome recorded for that activity |
| StartDate | string | When the activity started |
| EndDate | string | When the activity finished |

### Invalid row (from the file's validation-errors list — read only)

Per rejected row: the row's own recorded values (`Reference`, `TransactionDate`, `AccountNumber`, `Description`, `Amount`, `TransactionType`, `Currency` — the same fields a successfully-imported `Transaction` carries, per §7) plus the defect found on that row. **See Notes & Caveats — the wire shape of one array element in this list is not fully documented in `transactions-api.yaml`; the field set above is inferred from the Transaction shape and must be confirmed against a live response during BUILD.**

## Functional Requirements

- **FR1** — List every invalid row of a file that failed validation, together with each row's recorded values (`R7`).
- **FR2** — For a rejected row whose defect matches one of this app's own known field rules, show the fixed message text for that field: `Reference` missing → "This request has no reference and cannot be imported."; `Amount` not numeric → "Amount must be a number, for example 1245.67."; `TransactionDate` unreadable → "Transaction date must be a valid date and time."; `Currency` not a supported code → "Currency must be a supported currency code." (`R38`, `R39`, `R40`, `R42`).
- **FR3** — For a rejected row whose defect is over `TransactionType`, show the transactions service's own rejection reason for that row verbatim. The app holds no accepted-value list for transaction type and never judges a type itself — the service is the sole authority on which types are valid. Do not write an app-side enum or validation rule for this field (`R41`).
- **FR4** — Let the Finance Uploader retry validation for a file that is in the failed state; on retry, the file returns to an in-progress status, a new processing activity is recorded, and the outcome (imported or failed again) is shown when it resolves (`R8`).
- **FR5** — Let the Finance Uploader cancel a submitted file that has not been imported (i.e. `Uploaded` or `Validation failed`); cancelling deactivates the file and removes its rows from staging. The cancel action follows the same confirmation convention as `UI-09` (naming the file and stating the action is irreversible, with the cancel choice holding focus, not taking effect until confirmed) — see Notes & Caveats (`R9`).
- **FR6** — Let a user download the originally submitted file (`R10`).
- **FR7** — Let a user download the generated error file for a file that failed validation (`R11`, `R51`).
- **FR8** — Let a user open a submitted file's processing history and see each recorded activity with its outcome and timing, for as long as the file is active (`R23`, `R70`, `R95`).
- **FR9** — When a submitted file finishes validation with invalid rows, show the Finance Uploader an in-app notification (`R91`).

## Business Rules

- **BR1** — A file with invalid rows is held in the failed state until validation is retried and succeeds; it is never imported while invalid rows remain unresolved (`R29`).
- **BR2** — When a file is cancelled, its rows are removed from staging and never appear as expense payment requests, whether the cancel happened from `Uploaded` or from `Validation failed` (`R32`).
- **BR3** — Only the Finance Uploader may retry or cancel a file. The Approver may view a failed file's invalid rows, its downloads, and its processing history, but is never offered retry or cancel (`R82`).
- **BR4** — The processing-history view is visible to both the Finance Uploader and the Approver while the file remains active; once a file is no longer active its history is no longer surfaced (`R95`).

### Access control (this epic's actions)

| Action | Finance Uploader | Approver |
|---|---|---|
| View invalid rows | ✓ | ✓ |
| Download error file | ✓ | ✓ |
| Download original file | ✓ | ✓ |
| View processing history (while file active) | ✓ | ✓ |
| Retry validation | ✓ | — |
| Cancel file | ✓ | — |

## Key Workflows

### Correct and retry a failed file

1. Open a failed file's invalid rows; each rejected row and its defect are listed, using the field messages from FR2 or, for a transaction-type defect, the service's own reason (FR3).
2. Download the error file; it is delivered to the user (FR7).
3. Correct the source data outside the application — no in-application row editing exists or is offered.
4. Retry validation for the file; the file returns to an in-progress status and a new processing activity is recorded (FR4).
5. The outcome resolves to imported or failed again. If it fails again, the invalid-row list and error file are refreshed for the new attempt; the uploader may retry again or cancel the file.

### Cancel a file

1. From a file that is `Uploaded` or `Validation failed`, the Finance Uploader chooses to cancel it.
2. A confirmation names the file and states that cancelling removes it and its rows and cannot be undone; the cancel choice holds focus; the action does not take effect until confirmed (the `UI-09` convention, carried forward here even though `UI-09` itself is assigned to `expense-decisions`).
3. On confirmation, the file is deactivated, its rows are removed from staging (BR2), and it leaves the active file list.

### View a file's processing history

1. Either role opens a submitted file's processing history while it is active.
2. Each recorded activity is listed with its outcome (`DecisionResult`) and timing (`StartDate` / `EndDate`).

## Feature NFRs

- **NFR-1** — Every action in this epic (opening invalid rows, retrying, cancelling, both downloads, opening processing history) is completable by keyboard alone, meeting the project's WCAG 2.2 AA bar (`documentation/requirements-application.md` §6.6.5).
- **NFR-2** — A file's `CurrentStatus` chip (including `Validation failed`) follows `UI-21`: intent-mapped colour paired with an icon or text label, never colour alone. Use the palette tokens in `project.md` §Styling & Branding (error = failed, informational = validating/imported states this epic reads but does not own).
- **NFR-3** — A failed-validation state persists until the uploader acknowledges it (opens the errors, retries, or cancels) rather than auto-dismissing, per `UI-19`'s rule that state the user must act on persists.
- **NFR-4** — The in-app notification in FR9 is in-app only — no email/SMS/webhook channel exists for this project (`documentation/requirements-application.md` §6.7/§1.7 capability catalogue maps every notification point to `in-app`).

## Out of Scope

- The imported expense request list itself and its search/filter/sort/paging — owned by `expense-request-list`.
- Approving or rejecting an imported request, bulk approval, and duplicate marking — owned by `expense-decisions`. The `UI-09` confirmation convention this epic's cancel action follows is formally assigned there; this epic only carries the pattern forward for its own cancel action.
- Creating or administering file settings, and the file-upload/submission flow itself — owned by `expense-file-upload`.
- Editing any row's values, in this file or after import — no such capability exists anywhere in this project (`documentation/requirements-application.md` §1.5 explicit out-of-scope item).

## Notes & Caveats

- **App holds no transaction-type enum (user decision).** FR3 is a deliberate INTAKE decision: the sample CSV writes `TransactionType` as single letters (`C`/`D`), while the transactions-api's own documented example spells the value out (`"Debit"`). Rather than the app maintaining its own accepted-value list that could drift from either representation, the transactions service is the sole authority on validity, and the app's job is only to surface the service's own rejection reason against the offending row. Do not add an app-side enum for this field, in this epic or elsewhere.
- **`UI-09` confirmation convention carried forward for cancel.** `UI-09` ("Approve, reject, bulk-approve and cancel-file are gated by a confirmation that names the affected object and count, with the cancel choice holding focus") is formally assigned to the `expense-decisions` epic, but its cancel-file clause governs this epic's cancel action. Implement the same confirmation shape here; do not treat this epic's cancel as exempt because the requirement lives elsewhere.
- **CORS is an open backend item.** Every action in this epic calls the transactions-api (`http://localhost:4423/transactions-api`, `NEXT_PUBLIC_TRANSACTIONS_API_BASE_URL`), which does not yet return the CORS headers a cross-origin browser request needs (`project.md` NFR-base-6). This is a backend dependency, not a frontend defect — surface API errors truthfully per CLAUDE.md Rule 3 rather than working around them.
- **Two distinct, already-identified download endpoints — use these, not the third one.** `transactions-api.yaml` §6.10 in the requirements doc maps: original file → `GET /v1/files/download?FileLogId={id}` (`FilesDownload`); error file → `GET /v1/files/bulk-errors/download?FileLogId={id}` (`FilesBulkErrorsDownload`). Both stream `application/octet-stream`. A third, similarly-shaped operation exists in the spec — `GET /v1/file-logs/data?LogId={id}` (`FileLogDataDownload`) — but it is not referenced by any §6.10 pointer for this epic's requirements; do not use it for either download. (Requirements §9 "Key terminology" flags this pair as a real ambiguity in the source contract — resolved here by following the §6.10 mapping.)
- **Real spec gap: the invalid-row wire shape is not documented for this domain.** `FileValidationErrorGetList`'s response (`ValidationErrors.JsonArray`) is a JSON-array-as-string; the spec's only example is from an unrelated domain (zoo/animal-record fields like `Species`, `HabitatId`) and does not show a `Transaction`-shaped row or an explicit "defect/error message" field. Likewise `FileValidationErrorColumnGetList`'s example (`Name`, `Age`) is generic, not this project's columns. Treat the per-row field set in this brief's Data Model as the intended shape (derived from `Transaction` in §7 plus a defect signal), but confirm the actual field names against a live validation-errors response during BUILD API integration — do not hard-code assumptions from the spec's placeholder examples. Where the live shape doesn't map cleanly to the field-level messages in FR2/FR3, halt and flag rather than guessing.
- **`LastChangedUser` header on cancel, absent on retry.** `FilesDelete` (cancel) requires a `LastChangedUser` header — populate it from the authenticated user's identity (auth-api `GET /v1/auth/userinfo`), never from user input. `FilesRetryValidation` (retry) declares no such header in the spec — this asymmetry is as-documented; don't add one speculatively.
- **No prototype source.** This project's intake was docs-only; no `prototype-src/` or `genesis.md` exists, so there are no prototype shortcuts to flag for this epic.

### Cross-story contracts pinned at test generation

All five stories' tests were written up front, in parallel, and four of them render into the **same** page. These are the contracts they agreed on — they are already encoded in the test files, so a developer who implements something different will fail tests belonging to another story. Each test file repeats the relevant part in its own header; this is the one place they are collected.

- **`/upload/file` is an async SERVER component.** `web/src/app/(authenticated)/upload/file/page.tsx` calls `requireSession()` + `canAccess()` and returns `<PermissionDeniedMessage deniedPath={…} />` before rendering anything when access is refused. It does not become a client component — the epic's server-side gating rule (source UI-24: role-conditional actions are decided on the server and omitted from the markup, never rendered disabled) depends on it. It hands the identifier down to client units:
  - `components/files/SubmittedFileDetail` — `{ logId: string | undefined; actingUploader?: string }`. `logId` is the identifier **exactly as it arrived in the address**, because cancelled, unknown and unusable are one answer to the user (story 1 AC-5). `actingUploader` is the server-decided `hasRole(session, ROLE_IMPORTER) ? displayNameOf(session) : undefined` — it both gates the uploader-only actions and supplies the cancel audit identity.
  - `components/files/FileProcessingHistory` — `{ logId: number }`.
  - `components/files/RejectedRows` — `{ file: FileLog }`; renders nothing at all unless the status is `Validation failed`.
  - `components/files/FileDownloadActions` — `{ file: FileLog }`, and deliberately **no** session/role prop: both downloads are available to both roles, so there is nothing to gate.
- **Control labels are reserved across stories.** Story 1 claims the exact words **"Try again"** for retrying a failed *history read* (matched `/^try again$/i`). Story 4's retry-validation control must therefore be worded **"Retry validation"**, and story 3's download-failure recovery must not use "Try again" either — otherwise the queries resolve to the wrong control and tests fail on ambiguity. Story 4's confirmation labels: trigger `Cancel file`, confirm `Cancel the file`, way out `Keep the file` (the way out must read "keep" — labelling it "Cancel" is ambiguous when the destructive action is itself a cancel).
- **`SubmittedFilesList` keeps its existing prop contract.** `expense-file-upload` story 3 pinned that this component takes no session/role prop and its notification is not role-gated. Story 5 adds **`viewerRoles?: string[]`** — optional, and when absent the component **still notifies**, which is what keeps the earlier epic's tests honest. Present → notify only when it includes `ROLE_IMPORTER`.
- **The toast machinery needs a link, not an `onClick`.** Story 5's notification carries a link to `/upload/file?LogId=<id>`, but `ToastOptions` (`web/src/types/toast.ts`) currently offers only `onClick`. Extend `Toast` / `ToastOptions` with a real link — a clickable non-link is not keyboard-operable and would breach the project's WCAG bar. Non-auto-dismissal is expressible in the existing machinery as `duration: 0` (`TOAST_DEFAULTS.DURATION` applies only when duration is omitted); no new mechanism is needed.
- **The per-row defect signal is an inference, named here for the first time.** No source documents a per-row defect field, so the shared factory declares `ErrorColumn` + `ErrorMessage` on `ValidationErrorRow` and everything keys off that. FR2's four fixed app messages are selected by `ErrorColumn`; FR3's `TransactionType` reason is the service's `ErrorMessage` **verbatim**. The two must never be mixed, and a live-response mismatch should be a one-place fix in `web/src/mocks/data/validation-error.ts` plus the type. A defect the service described but did not attribute to a column shows the service's `ErrorMessage`; a row with no defect signal is listed with its values and **no invented reason**.
- **Rejected-row values are shown verbatim.** In particular the `transactionTypeLabel` translation used on imported requests (`C` → "Credit — money in") must **not** be applied to a rejected row: the purpose of that list is to show the user what their file actually contains so they can fix it outside the app.
- **A cancelled file has no action-gating state.** Cancelling sets `IsActive: false`, so the file leaves `GET /v1/file-logs?IsActive=Yes` and its page stops resolving altogether — that is story 1's "no longer available" state, not a variant of the page with the actions hidden.

## Requirement traceability

| Local ID | Source ID |
|---|---|
| FR1 | R7 |
| FR2 | R38, R39, R40, R42 |
| FR3 | R41 |
| FR4 | R8, R74 |
| FR5 | R9 |
| FR6 | R10 |
| FR7 | R11, R51 |
| FR8 | R23, R70, R95 |
| FR9 | R91 |
| BR1 | R29 |
| BR2 | R32 |
| BR3 | R82 |
| BR4 | R95 |
