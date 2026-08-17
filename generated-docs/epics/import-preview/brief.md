# Epic: Preview the rows of an import

Inherits roles, auth, data source, compliance, and styling from project.md.

**Depends on:** `expense-file-upload` and `file-validation-and-retry` (both merged to main). This epic does **not** add a new entry point — it extends the existing submitted-file detail page (`/upload/file`) that `file-validation-and-retry` already built, adding a preview section alongside `RejectedRows` and `FileDownloadActions`. It reuses those two epics' established contracts rather than inventing parallel ones: `SubmittedFileDetail`'s `{ logId, actingUploader }` props, the `ValidationErrorRow` shape (`ErrorColumn`/`ErrorMessage`), the FR2/FR3 rejected-row message rules, the `refreshSignal` convention `RejectedRows` and `FileProcessingHistory` already use, and `downloadSubmittedFile` (`GET /v1/files/download?FileLogId={id}`) — already wired in `lib/api/files.ts` for `file-validation-and-retry`'s "Download original file" action, and now this epic's primary data source (see Data Model).

---

## Goal

Show the Importer every row of a submitted file with a clear verdict — will import, or rejected — once validation has run, and let them download the rejected rows as a re-uploadable CSV to send back for correction.

---

## SUPERSESSION — read before implementing (mandatory, not optional)

**This epic reverses the project's all-or-nothing import rule.** Two prior artifacts stated the opposite of what this epic requires, and both are superseded, not merely extended:

- Source requirement **R29** / `documentation/requirements-application.md` §2.3 key invariant `[SRC: C-031]`: *"A file whose rows have unresolved validation errors is not imported."* (Also stated as BR-06 `[SRC: C-029]` in §6.2.)
- `file-validation-and-retry` brief **BR1**: *"A file with invalid rows is held in the failed state until validation is retried and succeeds; it is never imported while invalid rows remain unresolved (R29)."*

**The new rule (user-directed, this epic):** a submitted file's valid rows import; its rejected rows split off. Neither of the artifacts above governs this epic's behaviour, and nothing in this brief restates the old all-or-nothing rule. Do not carry BR1 or R29 forward into any story built from this brief.

**REVISED 2026-08-17 — the epic is no longer blocked on the backend performing this split.** The first version of this brief made the whole preview depend on `transactions-api` actually splitting a file's rows, which today it does not — leaving the "will-import" half permanently empty and a preview that didn't preview. The user was shown that consequence and chose to fix it in the frontend: the preview's primary source is now the **originally submitted file itself**, parsed client-side, not `GET /v1/transactions` (see Data Model). This means the epic ships a genuinely useful preview today, without waiting for the backend split — but the split (BR1) is still the rule this epic implements, `GET /v1/transactions` still becomes the authoritative confirmation of what actually imported once that split ships (see "Forward path" below), and the honesty constraint still applies: **the app must never claim a row imported when the backend has not imported it.**

---

## Data Model

This epic introduces **no new persistent entity**. It reads entities that already exist and assembles one **derived, client-side-only** shape from them — but its primary source has changed from the previous version of this brief.

### Where the preview's rows come from (revised 2026-08-17)

| Source | Role | Notes |
|---|---|---|
| `GET /v1/files/download?FileLogId={id}` (`FilesDownload`) | **Primary — every row of the preview** | The originally submitted file, downloaded and parsed client-side as CSV. This is the only source that has every row of the file, regardless of what the backend has or hasn't imported yet — it's what makes the preview complete today, ahead of the backend split. Already wired by `file-validation-and-retry` FR6 for its "Download original file" action; this epic reuses the same download, adding a parse step. |
| `GET /v1/files/validation-errors?FileLogId={id}` | **Overlay — marks which parsed rows are rejected** | Already consumed by `file-validation-and-retry`'s `RejectedRows` section — reuse its wiring (`fetchFileValidationErrors`, `rejectedRowsIn`, `validationErrorsFailureMessage`) and its per-row defect handling (`ErrorColumn`/`ErrorMessage`, FR2's four fixed messages, FR3's verbatim service reason for `TransactionType`). A parsed row matched to an entry here is **rejected**; every other parsed row is **will import**. |
| `GET /v1/transactions`, filtered client-side on `FileLogId` | **Demoted — future confirmation, not a source today** | `TransactionRead` carries both `FileLogId` and `FileName`. Not used to populate the preview's rows in this version of the brief — see "Forward path" below for why it stays in the picture. |

**Do not use** `GET /v1/file-logs/data?LogId=` for any of this. `file-validation-and-retry` already ruled it out as an unreferenced third download operation (it streams `application/octet-stream`, not per-row JSON) — the same reasoning applies here.

### ImportPreviewRow (derived, client-side only — not a wire shape)

| Field | Derivation | Notes |
|---|---|---|
| Recorded values (`Reference`, `TransactionDate`, `AccountNumber`, `Description`, `Amount`, `TransactionType`, `Currency`) | Parsed directly from the downloaded original file, one `ImportPreviewRow` per CSV data row, in file order | This is the row's baseline. A row matched to a validation-errors entry (below) has its display rules overridden for the rejected case; every other row keeps these values as parsed. |
| `verdict` | `'will-import'` by default; `'rejected'` when the row is matched to an entry in `GET /v1/files/validation-errors` for this `FileLogId` | See "Matching a rejected row to its original line" below — this match is the epic's central technical risk. |
| `reason` (rejected rows only) | FR2's four fixed app messages by `ErrorColumn`, or the service's own `ErrorMessage` verbatim for a `TransactionType` defect (per `RejectedRows`' existing `defectWordingFor` logic) | Not applicable to a will-import row. |

### Matching a rejected row to its original line — the epic's central technical risk

The validation-errors payload and the parsed original file are two independent reads with no guaranteed shared key, and getting this wrong means either silently mis-attributing a defect to the wrong line or silently dropping a rejected row from the preview — both worse than the honest fallback below.

- `Reference` is the obvious join key, but **"Reference missing" is itself one of the four rejection reasons (FR2)** — so precisely the rows most in need of a clear rejected display are the ones a reference-based match cannot find.
- The validation-errors payload *may* carry a positional or identity field that would make a better key. The spec's only example (`Id`, `PrimaryKeyValue`) is from an unrelated domain (zoo/animal records) and `file-validation-and-retry` already flagged it as not trustworthy for this project's actual field names.
- **Not confirmable at the time of writing.** Both the auth-api/BFF and the transactions-api are unreachable as of 2026-08-17 (connection refused on both) — the matching strategy against a live `GET /v1/files/validation-errors` response **must be confirmed during BUILD's API-integration step**, once the services are reachable, before the matching logic is finalised. Treat the field named above as the working assumption, not a settled fact.
- **Honest fallback, specified now so it isn't improvised during BUILD:** a validation-errors row that cannot be matched to a line in the parsed original file is never dropped, never duplicated onto an arbitrary line, and never guessed onto the wrong line. It is listed as its own rejected row, using the recorded values and defect reason the validation-errors payload itself carries (the same values `RejectedRows` already renders today) — clearly presented as a rejected row in its own right, not merged with any parsed line.

### Once the backend split lands (forward path)

BR1's rule — valid rows import, rejected rows split off — is a backend behaviour this epic's frontend is built ahead of. When `transactions-api` starts performing that split, `GET /v1/transactions` filtered on this file's `FileLogId` becomes the authoritative record of what **actually** imported. At that point, a `will-import` row found in that filtered result upgrades to a genuine `imported` verdict; a `will-import` row not found there (and not flagged as rejected either) is a discrepancy worth surfacing, not silently resolved. This brief does not require building that upgrade now — `GET /v1/transactions` is read in this epic only insofar as later work grows into it — but the verdict model (`will-import` / `rejected`, not `imported` / `rejected`) is chosen specifically so that upgrade is additive rather than a rename.

### Preview totals

| Field | Derivation |
|---|---|
| Will-import count | Parsed rows not matched to a validation-errors entry, count |
| Rejected count | Parsed rows matched to a validation-errors entry, **plus** any validation-errors rows that could not be matched (shown per the honest fallback above), count |
| File's own `RecordCount` | `FileLog.RecordCount`. The two counts above are expected to reconcile against it now that the preview is sourced from the whole file — a mismatch (e.g. the parsed row count itself differs from `RecordCount`) is reported honestly as a problem reading the file, per BR8, never silently absorbed. |

### Parsing the original file (new capability for this project)

No CSV-parsing capability exists in this codebase today — `web/src/lib/transactions/exportCsv.ts` (`csv-export`) only *writes* CSV; reading one is genuinely new. Reuse what's directionally reusable from it (the RFC 4180 escaping rules — quoted-field and doubled-quote handling — apply symmetrically to parsing), but build the parser as its own module. It must handle:

- The seven-column shape and header row (`Reference,TransactionDate,AccountNumber,Description,Amount,TransactionType,Currency` — `documentation/transactions_2026-04-15.csv`).
- Quoted fields containing commas, embedded quotes (doubled, per RFC 4180), and line breaks.
- A trailing newline (with or without one).
- **A file that fails to parse, or whose columns don't match the expected seven, as an explicit handled error state** — the preview reports this plainly and never crashes and never renders a partial or misaligned table (BR8).
- Performance at this project's endorsed volume ceiling (10,000 rows, §1.7/§10) — the file is downloaded *and* parsed in the browser, which sharpens NFR-1 below rather than replacing it.

---

## Functional Requirements

- **FR1** — Once a submitted file's validation has run (`CurrentStatus` is `Imported` or `Validation failed`), show a preview listing **every row of the originally submitted file** (downloaded via `GET /v1/files/download?FileLogId={id}` and parsed client-side), each carrying a clear will-import or rejected verdict.
- **FR2** — A parsed row not matched to a `GET /v1/files/validation-errors` entry is shown as **will import**, with the same row-level rendering already established for imported expense payment requests: `AccountNumber` masked to its last four digits, `TransactionType` shown via the app's plain-language label where one is known and the raw value otherwise (`lib/transactions/display.ts`). It is labelled "will import," never "imported" — the app has not confirmed the backend actually imported it (see Data Model, "Forward path").
- **FR3** — A parsed row matched to a `GET /v1/files/validation-errors` entry (or a validation-errors entry that could not be matched to any parsed line — see Data Model's honest fallback) is shown as **rejected**, reusing `file-validation-and-retry`'s existing per-row contract verbatim: recorded values shown exactly as the source file held them (no `transactionTypeLabel` translation), `AccountNumber` **masked to its last four digits with the same per-row reveal control `RejectedRows` already offers** (see BR3 — an earlier revision of this brief wrongly said "shown in full"; the shipped component masks), and the defect reason resolved by FR2/FR3 of that brief (app-owned wording for `Reference`/`Amount`/`TransactionDate`/`Currency`, the service's own wording verbatim for `TransactionType`).
- **FR4** — Each row's verdict is conveyed by an intent-mapped colour paired with an icon or text label — never colour alone (`UI-21`): will-import = success, rejected = error.
- **FR5** — The preview states, in plain language, how many of the file's rows will import and how many were rejected. These counts are expected to reconcile against the file's own `RecordCount` (the preview is sourced from the whole file, FR1) — a mismatch is reported as a problem reading the file (BR8), never silently absorbed and never presented as if it were a normal partial result.
- **FR6** — Let the Importer (and the Approver — see Access control) download the rejected rows of the preview as a CSV file, generated client-side, in the same seven-column shape the upload flow accepts (`Reference,TransactionDate,AccountNumber,Description,Amount,TransactionType,Currency`, per `documentation/transactions_2026-04-15.csv`), so the file round-trips through `POST /v1/files/upload` as a new, separate submission without modification. **Prefer building each rejected row's line from the original file's own matched line**, byte-faithful by construction, rather than reconstructing it from the validation-errors payload; fall back to reconstructing from validation-errors only for a row that could not be matched (Data Model's honest fallback), since that is the only data available for it.
- **FR7** — This correction-CSV download is distinct from, and coexists with, `file-validation-and-retry`'s existing generated error-file download (`GET /v1/files/bulk-errors/download`, FR7 of that brief). The two are named differently on screen and the preview states why both exist: the error file is the service's own generated diagnostic download; the correction CSV is a re-uploadable file built from the rows shown in this preview, intended to be corrected by hand (or by the employee) and resubmitted as a new upload.
- **FR8** — The preview and both its downloads are available to both the Importer and the Approver, view-only for both roles (see Access control) — mirroring `file-validation-and-retry`'s read-access shape for its own invalid-row view and downloads.

## Business Rules

- **BR1 — SUPERSEDES R29 and `file-validation-and-retry` BR1.** A file's valid rows import; its rejected rows split off from the same submission. A file is no longer held in an all-or-nothing failed state pending a full retry of every row. See the Supersession section above — this is a deliberate, user-directed reversal, not a refinement. The backend does not yet perform this split (see BR2); this epic's frontend renders the split it can determine for itself in the meantime.
- **BR2 — Honesty rule (revised 2026-08-17).** The preview's will-import/rejected verdicts are the app's own determination, from parsing the original file and overlaying the service's own validation-errors — they are **not** a claim that the backend has performed BR1's split. A row shown as "will import" is a row the service did not reject, not a row the service has imported; the wording on screen must never promise an import that has not happened. Once the backend does perform the split, `GET /v1/transactions` becomes the source of truth for what actually imported (Data Model, "Forward path"), and the frontend must not get ahead of that either.
- **BR3 — Compliance split between the two halves (SETTLED — user-confirmed 2026-08-17).** Will-import rows in the preview are treated as listed expense payment requests, so `AccountNumber` is masked to its last four digits per project.md's POPIA rule, exactly as `expense-request-list` already does — applied by this epic at render time to file-sourced values, using `lastFourDigitsOf` (`lib/transactions/display.ts`) as the single source of truth for how masking is done, the same as everywhere else in this project. Rejected rows show the file's own values **untranslated** (no `transactionTypeLabel`), so the user sees exactly what their file contains and can fix it.

**FACTUAL CORRECTION (2026-08-17, found at story planning).** An earlier version of this brief claimed `file-validation-and-retry` shows a rejected row's account number **in full / verbatim**. **It does not.** `web/src/components/files/RejectedRows.tsx` masks every account number through `MaskedAccountNumber` and reveals the full value only for the one row an explicit per-row control is used on; its own header states this is POPIA and that *"there is no reveal-all control, and none may be added."* The claim was wrong about shipped, tested code — do not act on it.

**The rule this epic follows:** the preview's rejected half masks account numbers to their last four digits with the same per-row reveal control `RejectedRows` already uses. The two conventions on this one screen are therefore: **will-import rows** — last four only, no reveal (they are listed expense payment requests); **rejected rows** — last four, with a per-row reveal for the row being corrected. This preserves the user's intent (the person fixing a row can see its full number) without loosening a compliance control that is already shipped. Confirmed with the user 2026-08-17 after the correction was surfaced. `lastFourDigitsOf` (`lib/transactions/display.ts`) and `components/requests/MaskedAccountNumber` remain the single source of truth for how masking is done.
- **BR4 — The generated correction CSV carries unmasked account numbers.** Consistent with `csv-export`'s existing compliance exception (the file must round-trip through upload, and the upload contract has no masked-value concept), the correction CSV's `AccountNumber` column is always the full value, regardless of how that row's account number is displayed on screen.
- **BR5 — Correction-CSV column shape: SETTLED at story planning (user-confirmed 2026-08-17) — the reason column IS included.** The correction CSV carries the seven upload columns, unmasked, in the upload's own order, **plus an eighth trailing column holding the row's rejection reason** (the same wording shown on screen for that row). The user was shown the trade-off and chose the reason column for the benefit of whoever corrects the file offline.
  **This carries an unconfirmed round-trip risk and must not be treated as settled-and-safe.** `transactions-api.yaml` documents no upload-side column validation at all, so whether `POST /v1/files/upload` tolerates the extra column is **unknown** — and both backend services were unreachable when this was decided, so it could not be tested. Consequences for BUILD:
  - The eighth column is always **last**, so the first seven are byte-identical to the upload shape and a consumer that reads positionally is unaffected.
  - The reason column header must not collide with any of the seven (`Reason` is safe against `Reference`).
  - A re-upload of an unmodified correction file is a **required manual-test step** and is carried in `unverifiedAssumptions` — if the service refuses it, the fix is to drop the eighth column (a one-line change to the column list), not to rework the epic.

- **BR5a — The reader tolerates the trailing `Reason` column (user-confirmed 2026-08-17).** Discovered at test generation: because story 1's reader requires exactly the seven upload columns, an unmodified re-upload of the correction CSV would be refused as unreadable — dead-ending the very download → correct → re-upload loop this epic exists to enable. The user chose to fix it in the reader rather than drop the column or rely on the employee deleting it.
  **The rule:** the reader accepts the seven upload columns **optionally followed by a single trailing column named `Reason`**, which it discards; the seven parse normally. This tolerance is **specific** — a trailing `Reason` in last position, nothing else. Any other extra column, an unknown eighth, or a ninth alongside `Reason` remains an unreadable wrong-shape file (BR8). Do not generalise this into "ignore any extra columns"; that would silently accept genuinely malformed files.
  This is a deliberate round-trip affordance, not a lax parser — comment it as such where it is implemented, so a later reader does not "tidy it away".
- **BR6 — Both downloads must be clearly distinguished on screen.** The existing "Download error file" control (`file-validation-and-retry`) and this epic's new correction-CSV download live on the same page; their labels, and the explanatory text FR7 requires, must make it unambiguous which is the service's own diagnostic file and which is the re-uploadable correction file. Recommended label for the new control: **"Download rows to fix and re-upload"** — deliberately not "Download error file" or any wording containing "error," which the existing control already owns on this page.
- **BR7 — Role-excluded actions are hidden, never disabled** (`UI-24`) — not applicable to this epic's own actions, since both roles have full view access to everything here (see Access control), but stated for completeness since the preview lives on a page with role-gated actions (retry, cancel) that this epic must not accidentally expose to the Approver.
- **BR8 — A file that cannot be parsed is a handled error state, never a crash and never a silent partial preview.** If the downloaded original file fails to parse, or its columns don't match the expected seven-column shape, or the parsed row count doesn't reconcile with `FileLog.RecordCount`, the preview reports this plainly as a problem reading the file — it does not render an empty, partial, or misaligned table, and does not treat the mismatch as an ordinary rejection outcome.
- **BR9 — A rejected row that cannot be matched to a line in the original file is never dropped, duplicated, or attributed to the wrong line.** It is listed as a rejected row in its own right, using the recorded values and reason the validation-errors payload itself carries (Data Model's honest fallback). This is the specified behaviour for the matching risk described in Data Model — not something to improvise during BUILD.
  - **BR9a (added during BUILD, 2026-08-17 — a case BR9 did not distinguish).** "Cannot be matched" means the rejected row ties to **no line of the file at all**. A *second* rejection for a line that **is** in the file is another **defect on that same row** — a line whose amount is not a number *and* whose currency is not supported — so that line is listed **once**, showing **every** reason the service gave for it, in the preview and in the correction file's `Reason` cell alike. Treating the second one as unmatched would show the user's single line twice, make the will-import and rejected counts add up to more rows than the file holds, and write the line into the correction file twice. Whether the service reports one entry per row or one per defect is still unconfirmed (see Notes & Caveats); this rule is correct either way.

### Access control (this epic's actions)

| Action | Importer | Approver |
|---|---|---|
| View the row-by-row preview (both halves) | ✓ | ✓ |
| Download the rejected rows as a correction CSV | ✓ | ✓ |

Mirrors `file-validation-and-retry`'s table for viewing invalid rows and downloading files — both are read/download actions available to both roles in that epic, and this epic's actions are the same shape.

---

## Key Workflows

### View a submitted file's preview

1. Open a submitted file's detail page (`/upload/file`), already reachable per `file-validation-and-retry`'s story 1.
2. Once the file's status is `Imported` or `Validation failed`, the preview section downloads the original file (`GET /v1/files/download?FileLogId={id}`), parses it client-side, and reads `GET /v1/files/validation-errors?FileLogId={id}` for the same file.
3. Every parsed row is matched against the validation-errors entries; a match is shown as rejected with its reason, everything else as will-import (FR1–FR4). Any validation-errors entry that cannot be matched to a parsed line is still shown, as its own rejected row (Data Model's honest fallback).
4. The preview states the will-import and rejected counts; these are expected to reconcile against the file's `RecordCount`, and a mismatch — or a file that fails to parse — is reported as a problem reading the file rather than a normal outcome (FR5, BR8).

### Download the rejected rows for correction

1. From the preview, the user (either role) downloads the rejected rows as a CSV in the upload's own seven-column shape, built from each rejected row's own matched line in the original file where a match was found, and reconstructed from the validation-errors payload only for a row that could not be matched (FR6).
2. The file is handed to the employee whose rows were rejected, who corrects the data outside the application (no in-application row editing exists anywhere in this project).
3. The corrected file is re-uploaded later as a **new, separate** file submission through the existing upload flow (`expense-file-upload`) — this epic does not add or change anything about how a file is submitted.

### Distinguish the two downloads

1. The user sees both "Download error file" (the service's own generated diagnostic, `file-validation-and-retry`) and "Download rows to fix and re-upload" (this epic's correction CSV) on the same file page.
2. Explanatory text next to each makes clear which is which and why both exist (FR7).

---

## Feature NFRs

- **NFR-1 — Large-preview performance (sharpened 2026-08-17).** The preview downloads and parses the original file in the browser, and its row list may be as large as this project's endorsed volume ceiling (10,000 rows, `documentation/requirements-application.md` §1.7/§10 — the same ceiling `expense-request-list` builds for). Apply the same in-browser paging/virtualisation thinking that epic already applied to a full-volume client-side list, and ensure the download-and-parse step itself stays responsive at that ceiling (e.g. non-blocking parsing, consistent with the yield-based approach `csv-export` already uses for writing) — this is a real cost this epic now bears directly, not a hypothetical.
- **NFR-2 — Accessibility.** WCAG 2.2 AA (project's effective bar, `documentation/requirements-application.md` §6.6.5, superseding the template's WCAG 2.1 AA baseline) across the preview, its verdict indicators, and both download controls, with full keyboard completability.
- **NFR-3 — Error UX.** Every async operation this epic adds (downloading and parsing the original file, reading the rejected-rows overlay, generating and delivering the correction CSV) has a user-visible error state with a retry affordance, per `NFR-base-5` — reusing `RejectedRows`' existing pattern of a stated failure plus an explicit "ask again" control rather than a silent empty state.
- **NFR-4 — Status legibility.** The per-row verdict badge follows `UI-21`: intent-mapped colour paired with an icon or text label, never colour alone, using the palette tokens already defined in `project.md` §Styling & Branding (success = will-import, error = rejected).

---

## Out of Scope

- **The backend actually performing the valid/rejected split.** This epic's frontend determines its own will-import/rejected verdicts from the original file and the validation-errors overlay; it does not and cannot make `transactions-api` split a file's rows itself. Once it does, `GET /v1/transactions` becomes the authoritative confirmation of what imported (Data Model, "Forward path") — building that upgrade is not required by this brief.
- Retrying validation, cancelling a file, viewing a file's processing history, and the existing "Download original file" / "Download error file" actions — all owned by `file-validation-and-retry`; this epic only adds the preview and the correction-CSV download alongside them.
- The file-upload flow itself, including re-uploading a corrected file — owned by `expense-file-upload`. This epic hands the user a file to feed back into that existing flow; it does not add a new upload path.
- Approving, rejecting, or otherwise deciding an imported request — owned by `expense-decisions`. Nothing in this epic's preview offers a decision action.
- Editing any row's values, in the preview or anywhere else — no such capability exists anywhere in this project.
- Confirming the validation-errors matching-key strategy against a live response — cannot be done until the transactions-api is reachable again (both backend services are down as of 2026-08-17); this is BUILD's API-integration step to complete, not something to guess at now (see Data Model).

---

## Notes & Caveats

- **REVISED 2026-08-17 — the preview no longer depends on the backend split to be useful.** The previous version of this brief sourced the will-import half from `GET /v1/transactions`, which meant the preview rendered nothing on that side until the backend actually split a file's rows — a preview that didn't preview. The user was shown this consequence directly and chose the frontend-parses-the-original-file approach instead (Data Model). The backend split (BR1) is still the rule this epic implements and is still an open backend dependency for the *upgrade* from "will import" to a confirmed "imported" (Data Model, "Forward path") — track it alongside the existing CORS open item (`project.md` NFR-base-6) — but it no longer blocks this epic from shipping a complete, useful preview today.
- **BUILD's API-integration check on the matching key (story 2, 2026-08-17).** Both services are reachable again — `GET http://localhost:4424/v1/health` answers 200 and `GET http://localhost:4423/transactions-api/v1/files/validation-errors?FileLogId=1` answers **401**, so the service is up and correctly requiring the session cookie. The live row shape still could not be inspected: reading it needs a signed-in session and the frontend holds no credential (Rule 10). So `Reference` remains the working assumption, exactly as specified — the matching lives in one place (`web/src/lib/files/importPreviewRows.ts`, `REJECTION_MATCH_KEY`) so a different real key is a one-line change, and BR9's fallback ships and carries any row the key cannot place. Confirm at the manual-test approval against a real file.
- **THE CENTRAL RISK: matching a validation-errors row back to its line in the original file (Data Model, BR9).** `Reference` is the natural join key, but a missing reference is itself one of the four rejection reasons — so the rows most in need of a correct rejected display are the hardest to match by reference. The spec's only example field names (`Id`, `PrimaryKeyValue`) are from an unrelated domain and are not trustworthy for this project. **The two backend services are down as of 2026-08-17 (connection refused on both)**, so the actual shape of a live `GET /v1/files/validation-errors` response — and therefore the real matching key — cannot be confirmed until BUILD's API-integration step. The specified fallback (list an unmatched validation-errors row as its own rejected row, never merged onto the wrong line, never dropped) must ship regardless of what the live matching key turns out to be.
- **POPIA masking split — SETTLED, user-confirmed 2026-08-17 (BR3).** This is the first screen in the project to show masked and verbatim account numbers in the same view: will-import rows masked (list convention, applied by this epic at render time to values parsed from the file), rejected rows verbatim (correction convention, reused from `file-validation-and-retry`). Both rules were shown to the user together and approved as-is; no further confirmation is pending.
- **Client-side CSV parsing is a new capability for this project, not incidental to it.** No CSV-parsing code exists in this codebase today (`web/src/lib/transactions/exportCsv.ts` only writes). Build a dedicated parser (or introduce a well-vetted, lightweight parsing dependency — BUILD's call, not fixed here) covering the header row, quoted fields with embedded commas/quotes/line breaks, and a trailing newline, and treat an unparseable file or a wrong column shape as a handled error state (BR8) — never a crash. RFC 4180's quoting rules, already implemented for writing in `exportCsv.ts`, apply symmetrically when reading and are worth reusing as a reference, even though the parser itself is new code.
- **Correction-CSV trailing reason column — SETTLED, include it (BR5).** *(This bullet previously said the opposite — "ship without the trailing column". That was written before the decision and is superseded; BR5 is authoritative.)* The user was shown the round-trip risk and chose to include the trailing `Reason` column. Build it. The risk is unverified, not ignored: the column is always last so the first seven stay byte-identical to the upload shape, a re-upload of an unmodified correction file is a required manual-test step, and it is carried in `unverifiedAssumptions`. If the service refuses the extra column, drop it — a one-line change to the column list.
- **The correction CSV should prefer the original file's own matched lines, not the validation-errors payload, wherever a match exists (FR6).** Using the file's own bytes for a matched rejected row is a stronger round-trip guarantee than reconstructing the row from validation-errors' recorded values, which is an inferred shape (see `web/src/mocks/data/validation-error.ts`). Reconstruction from validation-errors is still needed, and still correct, for the one case with no original line to draw from: an unmatched rejected row (BR9).
- **The correction CSV is generated by the frontend and is a distinct artifact from `file-validation-and-retry`'s error file (FR7, BR6).** Do not consolidate the two controls or their downloads — they serve different purposes (service diagnostic vs. re-uploadable correction) and `file-validation-and-retry`'s error-file shape and re-uploadability are undocumented, which is precisely why this epic does not rely on it.
- **Reuse, don't reinvent, the rejected-row rendering rules.** `RejectedRows` (`file-validation-and-retry`) already implements the exact per-row defect wording (`APP_OWNED_DEFECT_WORDING` map, `defectWordingFor`) and the "rows arrive as a JSON string" parsing contract (`rejectedRowsIn`, handling both an unparseable body and a parsed-but-non-array body as handled states, never a crash). This epic's rejected half should compose that existing logic rather than re-implement it; the verdict badge, the original-file parsing and matching, and the correction-CSV export are the genuinely new pieces.
- **The will-import half reuses `expense-request-list`'s display rules, not its data-fetching scope.** `lib/transactions/display.ts` (`transactionTypeLabel`, `lastFourDigitsOf`) is the single source of truth for how a will-import row's type and account number render — reuse it directly rather than duplicating the translation table or the masking regex.
- **CORS remains an open backend item, unchanged from every other epic that calls the transactions-api** (`project.md` NFR-base-6): this epic's calls (`GET /v1/files/download`, `GET /v1/files/validation-errors`) are cross-origin calls to `http://localhost:4423/transactions-api`, which does not yet return the headers a browser needs. Surface any such failure per the standard error-UX rule (`NFR-base-5`) — do not treat it as "no backend."
- **No prototype source.** This project's intake was docs-only; no `prototype-src/` or `genesis.md` exists, so there are no prototype shortcuts to flag for this epic.

## Cross-story contracts pinned at test generation

All eight test files were written up front, in parallel, and stories 2, 3 and 4 render into the **same** component. These are the contracts they agreed on — already encoded in the test files, so a developer who implements something different will fail tests belonging to another story. Collected here once; each test file repeats the part it depends on.

**The preview surface**

- **The preview section is a `<section aria-labelledby>` whose accessible name contains "preview".** Three specs (stories 2, 3, 4 Playwright) independently located it this way and scope every query to it. Without that handle the queries resolve page-wide and collide with the existing sections.
- **One file-ordered list, not two stacked halves.** The brief's "two halves" language describes the two per-row *display* conventions, not two tables. Story 2's spec asserts a single sequence in file order — grouping rows by verdict fails it.
- **`ImportPreview` takes `{ file, refreshSignal? }`** and **no session or role prop** — both roles see everything here. It grows **no timer of its own**; `SubmittedFileDetail` owns the page's single interval and hands `refreshSignal` down.
- **The verdict label is "Will import" / "Rejected".** The word "Imported" must never appear as a row verdict (BR2) — story 2's specs assert this on both layers with a whole-word check. The backend has not imported anything.
- **`GET /v1/transactions` is not a dependency.** Story 2's Playwright spec **aborts** it, so a preview that quietly starts relying on the not-yet-shipped backend split fails visibly rather than rendering a permanently empty half.

**Where controls live, and what they are called**

- **The correction download lives inside the preview region**, not in `FileDownloadActions` — story 4's spec asserts the error-file control appears **zero** times inside the preview region and exactly once outside it. `FileDownloadActions` gets only the explanatory wording that distinguishes the two downloads (FR7/BR6). AC-6's word "beside" means both are on the file's surface, not literally adjacent.
- **The correction file is delivered through `deliverFile` from the browser**, not a link to a service address.
- **New labels:** `Download rows to fix and re-upload` (never contains "error") and `Load the preview again`. Every reserved label on this page is asserted **absent** from the preview region: `Try again`, `Try again to load the rejected rows`, `Load this file again`, `Retry validation`, `Cancel file` / `Cancel the file` / `Keep the file`, `Download original file`, `Download error file`.
- **Two per-row "Reveal account number" controls will coexist** — `RejectedRows` and the preview both render one for a validation-failed file. The tests scope every reveal query to its own row and accept a row-identifying suffix in the accessible name; do not assume a page-unique label.

**Shared modules**

- **`APP_OWNED_DEFECT_WORDING` / `defectWordingFor` move out of `RejectedRows.tsx` into `web/src/lib/files/defectWording.ts`**, imported by both. Compose, do not copy — the four app-owned sentences and the verbatim `TransactionType` rule stay stated once.
- **BR9's unmatchable row resolves its reason through the shared `defectWordingFor`**, the same as a matched row — not the service's raw `ErrorMessage`. (BR9's own wording, "the same values `RejectedRows` already renders", is the reading to follow.)
- **`parseSubmittedFileCsv(body: string)` returns** `{ status: 'read'; rows } | { status: 'cannot-read'; problem: 'unreadable-body' | 'unexpected-columns' }`. The two refusal reasons must be **distinguishable** — story 3 branches on them. It takes CSV **text, not a `Blob`**; the caller reads the bytes.
- **jsdom implements neither `Blob.text()` nor `Blob.arrayBuffer()`.** Read the downloaded file with `FileReader`. A `.text()` call passes in a browser and throws in every Vitest test on this epic.

**Test-layer facts**

- **The epic's accessibility scan lives in story 2's Playwright spec** (NFR-2). The earlier epic's scan ran on a version of `/upload/file` that had no preview section. Stories 3 and 4 must not repeat it.
- **Every CSV body and validation-errors payload comes from `web/src/mocks/data/submitted-file.ts`.** Neither layer may author its own — that shared source is what keeps Vitest and Playwright from encoding different guesses about an undocumented wire shape.

## Requirement traceability

| Local ID | Source / disposition |
|---|---|
| FR1 | User-directed (epic goal); revised 2026-08-17 to source from the parsed original file |
| FR2 | User-directed; reuses `expense-request-list` display conventions; "will-import" wording is this epic's own honesty rule |
| FR3 | User-directed; reuses `file-validation-and-retry` FR1/FR2/FR3 verbatim; matching risk is this epic's own addition |
| FR4 | `UI-21` (carried forward, project-wide convention) |
| FR5 | User-directed; honesty/reconciliation rule revised 2026-08-17 |
| FR6 | User-directed (epic goal); revised 2026-08-17 to prefer the original file's own lines |
| FR7 | User-directed; distinguishes from `file-validation-and-retry` FR7 |
| FR8 | User-directed; access shape mirrors `file-validation-and-retry` BR3/table |
| BR1 | **Supersedes R29** (`documentation/requirements-application.md` §2.3 `[SRC: C-031]`, §6.2 BR-06 `[SRC: C-029]`) and `file-validation-and-retry` BR1 |
| BR2 | User-directed (honesty constraint); revised 2026-08-17 for the parsed-file source |
| BR3 | Combines project.md §Compliance (POPIA masking) with `file-validation-and-retry`'s "rejected-row values are shown verbatim" precedent — **settled, user-confirmed 2026-08-17** |
| BR4 | Mirrors `csv-export` BR4's compliance exception |
| BR5 | Open — not sourced, flagged for BUILD-time user decision |
| BR6 | User-directed |
| BR7 | `UI-24` (carried forward, project-wide convention) |
| BR8 | User-directed; new 2026-08-17 (parsing-error handling) |
| BR9 | User-directed; new 2026-08-17 (unmatched-row fallback) |
