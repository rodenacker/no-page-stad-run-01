# Epic Plan — Employee Expenses

Every epic in this project, what it delivers, and what it builds on. Live status
(not started / in flight / done) is shown by `/status` and the dashboard.

> Plan only — edited during planning on `main`, never on an epic branch.

## Epics

| # | Epic | Delivers | Builds on |
|---|---|---|---|
| 1 | Sign in and the signed-in app shell (`sign-in-and-app-shell`) | Let a Finance Uploader or an Approver sign in with their own credentials, see who they are signed in as, sign out, and reach only the screens and actions their role allows. | — |
| 2 | Upload an expense file (`expense-file-upload`) | Let the Finance Uploader submit a CSV batch of expense payment requests against a named file setting, and let both roles watch each submitted file's status and imported record count. | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| 3 | Rejected rows, retry and cancel (`file-validation-and-retry`) | Show the Finance Uploader exactly which rows of a file were rejected and why, let them download the error file or the original, retry validation or cancel the file, and let either role review a file's processing history. | Upload an expense file (`expense-file-upload`) |
| 4 | The shared expense request list (`expense-request-list`) | Give both roles one shared list of every imported expense payment request they can search, filter, sort and page through, with possible duplicate requests clearly marked and every value read-only. | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| 5 | Approve or reject a request (`expense-decisions`) | Let an Approver record one final decision on an imported expense payment request — approve it, or reject it with a note — after a confirmation, with no way to decide the same request twice and a visible record of who decided what. | The shared expense request list (`expense-request-list`) |
| 6 | Bulk approval and a self-updating list (`bulk-approval-and-live-refresh`) | Let an Approver select many imported requests and approve them in one action with a clear report of any it skipped, and keep every approver's list current on its own so nobody acts on a request a colleague has already decided. | Approve or reject a request (`expense-decisions`) |
| 7 | Export requests for the payment system (`csv-export`) | Let either role export the requests currently listed as a CSV file for the external payment system, attributed to the person who produced it. | The shared expense request list (`expense-request-list`) |
| 8 | Preview the rows of an import (`import-preview`) | Show the Importer every row of a submitted file with a clear imported/rejected verdict once validation has run, and let them download the rejected rows as a re-uploadable CSV to send back for correction. | Upload an expense file (`expense-file-upload`), Rejected rows, retry and cancel (`file-validation-and-retry`) |
| 9 | Delete a submitted file (`file-deletion`) | Let the Importer delete any submitted file — including one whose rows have already imported — from the files list as well as the file's own page, after a confirmation that states exactly what is being destroyed. | Upload an expense file (`expense-file-upload`), Rejected rows, retry and cancel (`file-validation-and-retry`), Approve or reject a request (`expense-decisions`) |

## Coverage

Everything in the spec is assigned to an epic:

| What you asked for | Epic |
|---|---|
| Sign in with a username and password (R1) | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| Sign out and end the session (R2) | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| Show who is signed in (R3) | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| Submit an expense file against a named file setting (R4) | Upload an expense file (`expense-file-upload`) |
| Accept CSV files only (R5) | Upload an expense file (`expense-file-upload`) |
| List every submitted file with its status and record count (R6) | Upload an expense file (`expense-file-upload`) |
| Show a failed file's invalid rows and what is wrong with each (R7) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| Retry validation on a failed file (R8) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| Cancel a submitted file that has not been imported (R9) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| Download the file that was originally submitted (R10) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| Download the error file generated for a failed file (R11) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| List every imported expense request with its status, in words the reader understands (R12) | The shared expense request list (`expense-request-list`) |
| Search the expense request list (R13) | The shared expense request list (`expense-request-list`) |
| Filter the expense request list (R14) | The shared expense request list (`expense-request-list`) |
| Mark requests that match another request on the duplicate key (R15) | The shared expense request list (`expense-request-list`) |
| Approve one imported request (R16) | Approve or reject a request (`expense-decisions`) |
| Reject one imported request with a note (R17) | Approve or reject a request (`expense-decisions`) |
| Approve several selected requests in one action (R18) | Bulk approval and a self-updating list (`bulk-approval-and-live-refresh`) |
| Allow only one decision per request (R19) | Approve or reject a request (`expense-decisions`) |
| Refresh the shared list on its own while it is open (R20) | Bulk approval and a self-updating list (`bulk-approval-and-live-refresh`) |
| Export expense requests as a CSV file (R21) | Export requests for the payment system (`csv-export`) |
| Never offer a way to edit imported request values (R22) | The shared expense request list (`expense-request-list`) |
| Show a submitted file's processing history (R23) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| Once decided, a request cannot be decided again (R24) | Approve or reject a request (`expense-decisions`) |
| An Approver may still decide a request that is their own expense (R25) | Approve or reject a request (`expense-decisions`) |
| Decide actions are offered only while a request is Imported (R26) | Approve or reject a request (`expense-decisions`) |
| A rejection must carry a note (R27) | Approve or reject a request (`expense-decisions`) |
| Imported request values can never be changed (R28) | The shared expense request list (`expense-request-list`) |
| A file with invalid rows stays unimported until a retry succeeds (R29) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| A non-CSV file is refused before processing starts (R30) | Upload an expense file (`expense-file-upload`) |
| No amount limit restricts an Approver's decision (R31) | Approve or reject a request (`expense-decisions`) |
| A cancelled file's rows never appear as requests (R32) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| Both sides of a duplicate match are marked before any decision (R33) | The shared expense request list (`expense-request-list`) |
| What counts as a duplicate (R34) | The shared expense request list (`expense-request-list`) |
| Username is required before sign-in is submitted (R35) | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| Password is required before sign-in is submitted (R36) | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| The submitted file's name must identify a CSV file (R37) | Upload an expense file (`expense-file-upload`) |
| A rejected row missing its reference says so (R38) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| A rejected row with a non-numeric amount says so (R39) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| A rejected row with an unreadable date says so (R40) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| A row the service rejected over its transaction type says why (R41) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| A rejected row with an unsupported currency says so (R42) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| A note is required only when the decision is a rejection (R43) | Approve or reject a request (`expense-decisions`) |
| See the chosen file name before submitting it (R44) | Upload an expense file (`expense-file-upload`) |
| Free-text search on the request list (R45) | The shared expense request list (`expense-request-list`) |
| Filter the request list by status and originating file (R46) | The shared expense request list (`expense-request-list`) |
| Select several requests and act on the selection as a group (R47) | Bulk approval and a self-updating list (`bulk-approval-and-live-refresh`) |
| The list updates itself while it is open (R48) | Bulk approval and a self-updating list (`bulk-approval-and-live-refresh`) |
| Export the listed requests as a CSV file (R49) | Export requests for the payment system (`csv-export`) |
| A possible duplicate is visibly distinguished in the list (R50) | The shared expense request list (`expense-request-list`) |
| Open a file's invalid rows and download its error file (R51) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| Destructive actions are confirmed first (R52) | Approve or reject a request (`expense-decisions`) |
| When field checks report (R53) | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| Required fields are marked (R54) | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| The first field is ready for typing when a form opens (R55) | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| An empty list names what is missing and offers the next step (R56) | The shared expense request list (`expense-request-list`) |
| 'No data' and 'no matches' read differently (R57) | The shared expense request list (`expense-request-list`) |
| Waiting is shown as a placeholder, not a blank screen (R58) | The shared expense request list (`expense-request-list`) |
| Paging controls with a page-size choice (R59) | The shared expense request list (`expense-request-list`) |
| Sort the list by any shown column (R60) | The shared expense request list (`expense-request-list`) |
| Form length shapes the form (R61) | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| Confirmations fade, things you must acknowledge do not (R62) | Approve or reject a request (`expense-decisions`) |
| How counts are displayed (R63) | Bulk approval and a self-updating list (`bulk-approval-and-live-refresh`) |
| Status is never colour alone (R64) | The shared expense request list (`expense-request-list`) |
| Icon-only controls announce themselves (R65) | The shared expense request list (`expense-request-list`) |
| The list works on a narrow screen (R66) | The shared expense request list (`expense-request-list`) |
| Actions your role excludes are hidden, not greyed out (R67) | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| A screen your role excludes explains itself in place (R68) | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| A decided request or cancelled file states its state instead of offering actions (R69) | Approve or reject a request (`expense-decisions`) |
| Open a submitted file's processing history (R70) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| Nothing imported yet (R71) | The shared expense request list (`expense-request-list`) |
| Search and filters are still narrowing the set (R72) | The shared expense request list (`expense-request-list`) |
| A non-CSV file is refused with a clear reason (R73) | Upload an expense file (`expense-file-upload`) |
| A failed file makes its rows and error file available (R74) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| A request someone else already decided is refused clearly (R75) | Approve or reject a request (`expense-decisions`) |
| Bulk approval reports what it skipped (R76) | Bulk approval and a self-updating list (`bulk-approval-and-live-refresh`) |
| When the list can no longer refresh itself (R77) | Bulk approval and a self-updating list (`bulk-approval-and-live-refresh`) |
| A slow first load shows a placeholder (R78) | The shared expense request list (`expense-request-list`) |
| Rejected credentials do not reveal which field was wrong (R79) | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| A denied direct link explains the denial in place (R80) | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| Only the Finance Uploader can submit a file (R81) | Upload an expense file (`expense-file-upload`) |
| Only the Finance Uploader can retry or cancel a file (R82) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| Only an Approver can approve or reject a request (R83) | Approve or reject a request (`expense-decisions`) |
| Only an Approver can bulk-approve (R84) | Bulk approval and a self-updating list (`bulk-approval-and-live-refresh`) |
| Both roles can read the file list, its settings and the identity reference data (R85) | Upload an expense file (`expense-file-upload`) |
| Both roles can read the expense request list and a request's detail (R86) | The shared expense request list (`expense-request-list`) |
| Both roles can export what they can see (R87) | Export requests for the payment system (`csv-export`) |
| Both roles sign in the same way, and their roles decide what follows (R88) | Sign in and the signed-in app shell (`sign-in-and-app-shell`) |
| The hand-over file for the external payment system (R89) | Export requests for the payment system (`csv-export`) |
| Tell the uploader when a file finishes importing (R90) | Upload an expense file (`expense-file-upload`) |
| Tell the uploader when a file finishes with invalid rows (R91) | Rejected rows, retry and cancel (`file-validation-and-retry`) |
| Confirm a recorded decision to the Approver (R92) | Approve or reject a request (`expense-decisions`) |
| Tell Approvers when a request is marked a possible duplicate (R93) | The shared expense request list (`expense-request-list`) |
| See who decided a request, when, and with what note (R94) | Approve or reject a request (`expense-decisions`) |
| See a file's recorded processing steps and their outcomes (R95) | Rejected rows, retry and cancel (`file-validation-and-retry`) |

_95 requirements, all assigned._

### Added after the original plan

Requested by the user on 2026-08-17, after epics 1–7 had shipped. Not in the original source spec:

| What you asked for | Epic |
|---|---|
| See every row of a submitted file, marked as passing validation or rejected (N1) | Preview the rows of an import (`import-preview`) |
| Download the rejected rows as a CSV an employee can correct and re-upload (N2) | Preview the rows of an import (`import-preview`) |
| Import a file's valid rows even when other rows were rejected (N3) | Preview the rows of an import (`import-preview`) |
| Delete a file straight from the files list, without opening it (N4) | Delete a submitted file (`file-deletion`) |
| Delete a file whose rows have already imported (N5) | Delete a submitted file (`file-deletion`) |

## Decisions made at the plan approval

These were settled with the user during INTAKE and apply across epics:

- **Transaction types are displayed, not policed.** The app holds no accepted-value list for transaction type — the transactions service is the sole authority on validity. The list renders whatever value the service returns, translated to plain words for the reader ("Credit — money in", "Debit — money out"); an untranslated value displays exactly as returned and is never treated as an error. Resolved a conflict between the sample CSV (`C`/`D`) and the API's documented example (`Debit`).
- **Dark mode follows the device, with an override.** The app respects the OS colour-scheme preference on first load; a control in the signed-in header lets the user override it, and that override persists. Both `:root` and `.dark` token blocks come from the two supplied design-system files. Recorded in `project.md` §Styling & Branding; the control itself belongs to epic 1.
- **Compliance is POPIA (South Africa)**, user-confirmed. Account numbers are masked to their last four digits wherever requests are listed, with the full value revealed only by an explicit action on a single request — except in the exported CSV, which carries unmasked values because the external payment system consumes it as-is.

- **A part-valid file now imports its good rows (2026-08-17, supersedes R29).** The original rule was that a file with *any* invalid row imports nothing until a retry succeeds (R29 / requirements §2.3 invariant `C-031`, assigned to `file-validation-and-retry` as its BR1). At the user's request this is reversed for epic 8: the valid rows import, and the rejected rows come back as a correctable CSV for a separate upload. **The split itself is the backend's to make** — until the transactions-api does it, a part-valid file still imports nothing. The preview works regardless (it reads the submitted file directly), but it says "will import", not "imported", for rows the service has not actually taken. See the open backend dependency below.

- **A file can now be deleted after it has imported, destroying its decisions (2026-08-17, epic 9).** `file-validation-and-retry` allowed cancelling a file only while it was `Uploaded` or `Validation failed` — never once its rows had become expense payment requests. At the user's request that gate is removed: the Importer can delete any file. Because an imported file's rows are live requests, deleting one **permanently removes those requests and the record of who approved or rejected them** — which runs against the project's otherwise-firm rule that a decision is permanent and can never be revisited (R19/R24/R94). The user was shown this consequence explicitly and confirmed it. Two things follow: the confirmation must state the true scale before the fact (how many requests, how many already decided), and **whether the service can even do it is untested** — `FilesDelete` deletes "from the staging table" and imported rows have left staging. See the open backend dependency below.
- **"Cancel file" is renamed "Delete file" (2026-08-17, epic 9).** One action, one name, on both the files list and a file's own page. It was always the same API operation (`DELETE /v1/files`, whose own description is "Deactivate and delete a file"); only the label differed. The confirmation's way-out stays worded as "Keep the file" — it must never read "Cancel", which would be ambiguous.

## Conventions that cross epic boundaries

Recorded here because the requirement lives in one epic but the obligation is wider:

- **The confirmation convention** (requirements UI-09) is assigned to `expense-decisions`, but `file-validation-and-retry` (cancel a file) and `bulk-approval-and-live-refresh` (bulk approve) must follow it too: a confirmation naming the affected object and count, with the cancel choice holding focus, and no effect until it is accepted.
- **The list does its own work.** `GET /v1/transactions` takes no query parameters, so searching, filtering, sorting and paging all happen in the browser over the full list — up to 10,000 rows, which requirements §1.7 and §10 both endorse.
- **Duplicate marking is derived client-side** from account number + amount + transaction date; the flag does not exist in the API. That is why the duplicate rule sits with `expense-request-list` rather than upload.
- **Bulk approval is N calls.** `TransactionApprove` decides one request per call, so bulk approval issues one call per selected request and reports how many were approved and how many were skipped.
- **"Already decided" cannot be read from the response.** The service returns the same generic response either way, so the app re-reads current state immediately before submitting a decision and reports anything no longer awaiting a decision as skipped.

## Known dependencies outside this project

**Partial import of a part-valid file (epic 8).** The transactions-api currently holds a file with any
invalid row in `Validation failed` and imports none of its rows (requirements invariant `C-031`). Epic 8's
premise — valid rows import, rejected rows split off for a separate upload — needs the service to change
that behaviour. **Epic 8 is not blocked on it:** the preview reads the originally-submitted file directly
(`GET /v1/files/download`) and marks each row as passing validation or rejected, so the user sees the whole
file either way. What the backend gap costs is the last step — rows shown as "will import" genuinely have
not imported yet, and the epic says so plainly rather than implying otherwise. Once the service performs
the split, those rows can be confirmed as imported against `GET /v1/transactions` (`FileLogId`).

**Deleting an imported file may not be supported (epic 9).** `DELETE /v1/files` (`FilesDelete`) is documented
as deleting a file "from the staging table". An imported file's rows have left staging and become expense
payment requests, so whether the service deletes them, deletes only the file record, partially succeeds, or
refuses outright is **unknown** — it needs a signed-in session against a real imported file to find out. The
frontend is built to report whatever the service actually does, including a refusal, in the service's own
words; it never claims a success it did not observe. If the service turns out to refuse, the honest fix is to
put the not-yet-imported gate back, not to work around it.

**CORS on both backend services.** Neither the auth-api/BFF (`http://localhost:4424`) nor the transactions-api
(`http://localhost:4423/transactions-api`) returns an `Access-Control-Allow-Origin` header. Both are cross-origin
from the frontend, and the session-cookie flow needs a non-wildcard origin plus `Access-Control-Allow-Credentials: true`.
Automated tests are unaffected; hands-on browser testing of sign-in needs this in place. Tracked as `NFR-base-6` in
`project.md`. Re-verify connectivity any time with `/api-status --check`.
