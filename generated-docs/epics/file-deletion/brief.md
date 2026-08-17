# Epic: Delete a submitted file

Inherits roles, auth, data source, compliance, and styling from project.md.

**Depends on:** `expense-file-upload` (the submitted-files list this adds the action to), `file-validation-and-retry` (owns the existing "Cancel file" action this epic renames and widens), and `expense-decisions` (owns the decision records — approve/reject — this can now destroy). All three are merged to main.

**This is not a new capability.** `DELETE /v1/files` (`FilesDelete`) is the API's only delete operation, already wired as `cancelSubmittedFile` in `web/src/lib/api/files.ts` and surfaced as "Cancel file" in `web/src/components/files/SubmittedFileActions.tsx` (on the file's detail page, `/upload/file`, only). This epic changes three things about that existing action and adds nothing new alongside it: **where** it is offered, **which files** it applies to, and **what the confirmation says** before it runs.

---

## Goal

Let the Importer delete any submitted file — including one whose rows have already imported — from the files list as well as the file's own page, after a confirmation that states exactly what is being destroyed.

---

## Data Model

No new entity. This epic reads two things that already exist, both already typed in the codebase:

### ExpenseFile (`FileLog`, from `expense-file-upload` / `file-validation-and-retry`)

| Field | Type | Notes |
|---|---|---|
| `Id` | integer | `LogId` on the delete call — unchanged |
| `CurrentFileName` | string | Named in the confirmation, as today |
| `CurrentStatus` | string | **No longer gates whether delete is offered** (see FR3/BR1) — but still decides whether the file could possibly have produced requests (only `Imported` can) |
| `RecordCount` | string | Not authoritative for the confirmation's request count — see BR4; the service's own transaction rows are |

### Transaction (`TransactionRead`, from `expense-decisions` / `web/src/types/transactions.ts`) — read-only, new use in this epic

| Field | Type | Notes |
|---|---|---|
| `Id` | integer | Not otherwise used here |
| `FileLogId` | integer | The file this request was imported from — **the filter key**; `GET /v1/transactions` takes no query parameters, so this epic filters client-side, per the project's "the list does its own work" convention already used elsewhere |
| `Status` | string | `Imported` \| `Approved` \| `Rejected` — counted separately in the confirmation |
| `Reference`, `LastChangedUser`, `LastChangedDate` | string | Not shown in the confirmation itself (a count, not a per-row breakdown) but available if a future revision wants to name who decided what |

---

## Functional Requirements

| ID | Statement |
|---|---|
| R1 | The Importer shall be able to delete a submitted file directly from the submitted-files list (`SubmittedFilesList`, `/upload`), without opening the file's own page first. |
| R2 | The Importer shall still be able to delete a file from its own detail page (`SubmittedFileDetail`, `/upload/file`) — the existing surface, carried forward under the new name. |
| R3 | The delete action shall be offered for a file in **any** `CurrentStatus`, including `Imported` — not gated to `Uploaded` / `Validation failed` as the current cancel action is. |
| R4 | The existing action and its three confirmation labels shall be renamed coherently on both surfaces: trigger **"Cancel file"** → **"Delete file"**; confirm **"Cancel the file"** → **"Delete the file"**; way out **"Keep the file"** stays as-is (it must not read "Cancel" — the destructive action already reads "Delete", so "Keep the file" continues to be the only unambiguous way-out wording). |
| R5 | Only the Importer may see or use the delete action, on the list and on the detail page. The Approver is never offered it — the decision is made server-side (the `actingUploader` pattern `SubmittedFileDetail` already computes: `hasRole(session, ROLE_IMPORTER) ? displayNameOf(session) : undefined`), and an excluded session receives no markup for it at all (UI-24). |
| R6 | For a file whose `CurrentStatus` is `Imported`, before the confirmation is shown the frontend shall read that file's own expense payment requests (`GET /v1/transactions`, filtered client-side on `FileLogId === file.Id`) and the confirmation shall state: how many requests the file produced in total, and how many of those are already `Approved` or `Rejected`. Wording along the lines of: *"This file produced 40 requests. 12 have already been approved and 3 rejected. Deleting the file removes all of them, and the record of who decided the 15 that were, and cannot be undone."* |
| R7 | For a file whose `CurrentStatus` is anything other than `Imported` (it has never produced requests), the confirmation keeps the existing simpler shape: names the file, states that the file and its rows are removed and cannot be undone. The two confirmations differ because the consequences differ — they must not be flattened into one generic message. |
| R8 | If the request-count read (R6) fails, the confirmation shall say the count could not be read and shall **not** imply the file is safe or harmless to delete — the simple "nothing to lose" wording of R7 must never be shown as a fallback for a file that is `Imported`. |
| R9 | Deleting a file calls the existing `DELETE /v1/files` (`FilesDelete`) via the existing `cancelSubmittedFile` wrapper (renamed at the call-site's discretion, but **not duplicated** — there is exactly one delete API call in this app, before and after this epic). |
| R10 | If the delete call itself refuses or errors — including the untested case of an imported file whose rows have left the staging table the endpoint's own description names — the frontend shall show the service's own error message and take no other action. It shall never report success, never silently no-op, and never leave the confirmation dialog implying the outcome was other than what the service actually returned. |
| R11 | After any delete attempt (success or refusal), whatever surface launched it — the list, or an open file detail page — reflects what the service actually did: a success removes the file from the active list (or, from the detail page, sends the user back to the list, as the current cancel flow already does); a refusal leaves the file and the dialog's underlying screen exactly as they were, with the error shown. |
| R12 | Deleting a file from the list must not fight the list's existing behaviour of auto-refreshing while any file is still processing (`expense-file-upload` story 3) — a delete triggers the same kind of re-read that behaviour already uses, not a parallel refresh mechanism. |

---

## Business Rules

| ID | Statement |
|---|---|
| BR1 | **Reverses a shipped rule.** `file-validation-and-retry`'s FR5/BR2 (`cancelApplies` in `SubmittedFileActions.tsx`) gates the action to `Uploaded` and `Validation failed` only. This epic replaces that gate: the action is offered for a file in any status, deliberately including `Imported`. This is a user-confirmed reversal, not an oversight — see Notes & Caveats. |
| BR2 | Only the Importer role may delete a file, on either surface; role exclusion is decided server-side and the control is absent (not disabled) for any other session — unchanged from `file-validation-and-retry` BR3. |
| BR3 | The confirmation's content depends on whether the file could have produced requests: `CurrentStatus === 'Imported'` gets the request-count confirmation (R6); every other status gets the simple confirmation (R7). A file's status is read as-is from `GET /v1/file-logs` — this epic does not infer "has ever been imported" from any other signal. |
| BR4 | The request count is read by filtering the full `GET /v1/transactions` response on `FileLogId`, client-side — the endpoint accepts no query parameters, so there is no server-side way to ask for one file's rows only. This is the same "read everything, narrow in the browser" convention `expense-request-list` already uses for its own list. |
| BR5 | A failed request-count read is a distinct confirmation state (R8) — it is never treated as "zero requests" and never allowed to fall through to the simple confirmation, which would misrepresent an imported file as harmless to delete. |
| BR6 | **The service's behaviour on an imported file is unverified.** Neither service could be reached without a signed-in session at brief-writing time, so whether `FilesDelete` succeeds, partially succeeds (e.g. the file is deactivated but its transaction rows remain, since they have left the staging table the endpoint's own description names), or refuses outright on an `Imported` file is unknown. The frontend must treat whatever the service returns as authoritative and surface it exactly (R10) — it must not assume success, and must not paper over a partial or unexpected outcome with an optimistic list update. |
| BR7 | `LastChangedUser` continues to be populated from the authenticated Importer's own identity (`GET /v1/auth/userinfo`), never from user input — unchanged from the existing cancel call. |

### Access control (this epic's action)

| Action | Importer | Approver |
|---|---|---|
| Delete a file (list) | ✓ | — |
| Delete a file (detail page) | ✓ | — |

---

## Key Workflows

### 1. Delete a not-yet-imported file, from the list

1. On `/upload`, the Importer sees a delete action against a file whose status is `Uploaded` or `Validation failed`.
2. Choosing it opens the confirmation, naming the file and stating that the file and its rows are removed and this cannot be undone (R7); the way out ("Keep the file") holds focus.
3. On confirmation, `DELETE /v1/files` is called; on success the file leaves the list without a page reload.

### 2. Delete an imported file, from the list

1. On `/upload`, the Importer chooses delete against a file whose status is `Imported`.
2. Before the confirmation opens, the frontend reads `GET /v1/transactions` and filters to this file's `FileLogId`.
3. The confirmation names the file and states the true scale: total requests produced, and how many are already `Approved` / `Rejected`, and that deleting removes all of them and the record of who decided them, irreversibly (R6). The way out holds focus.
4. On confirmation, `DELETE /v1/files` is called. Success removes the file from the list; the request views these transactions fed (if open elsewhere) no longer show them as live.

### 3. Delete a file from its own detail page

1. On `/upload/file?LogId=…`, the Importer sees the same renamed action, gated the same way, with the same two confirmation shapes depending on the file's status.
2. On confirmation and success, the Importer is returned to the files list — unchanged from the existing cancel flow's `router.replace(UPLOAD_PATH)`.

### 4. The service refuses the delete

1. The Importer confirms a delete (from either surface) and the call fails or the service reports it could not complete.
2. The confirmation dialog closes; the screen behind it (list row, or detail page) is unchanged and shows the service's own error message, with the delete action still available to try again (R10/R11) — the existing refusal pattern `SubmittedFileActions` already uses for cancel.

### 5. The request count cannot be read

1. The Importer chooses delete on an `Imported` file; the transactions read fails.
2. The confirmation states the count could not be read and does not soften the warning — it does not fall back to the simple "file and its rows" wording (R8/BR5).

---

## Feature NFRs

- **Keyboard completability:** the delete action and its confirmation — on both surfaces — are fully operable by keyboard alone, per the project's WCAG 2.2 AA bar (`requirements-application.md` §6.6.5), unchanged in kind from the existing cancel confirmation but now also true for the request-count variant.
- **Error UX (NFR-base-5):** a refused delete and a failed request-count read are each a distinct, user-visible state with the service's own wording where available, and a retry affordance — never a silently-swallowed failure.
- **List currency:** deleting a file from the list produces the same on-screen effect as the list's existing re-read behaviour (`expense-file-upload`'s auto-refresh) — the row disappears because the list was asked again, not because of a locally-mutated array standing in for the service's answer.

---

## Out of Scope

- Any second delete API path, a parallel confirmation flow, or a new API wrapper alongside `cancelSubmittedFile`/`FilesDelete` — there is exactly one delete operation in this app.
- Bulk deletion of multiple files in one action.
- Restoring or "undeleting" a file once the service has processed the delete.
- Any change to the Approver's own screens beyond a deleted file's requests no longer being present the next time a list they're viewing re-reads itself — this epic does not add an Approver-facing notice of a deletion in progress elsewhere.
- Resolving the POPIA-vs-audit-trail compliance tension named in Notes below — that is the user's call, already made; this epic implements the decision, it does not re-litigate it.

---

## Notes & Caveats

- **This reverses a shipped, tested rule — carried forward deliberately, not by oversight.** `file-validation-and-retry`'s FR5/BR3 and `SubmittedFileActions.tsx`'s `cancelApplies` explicitly gate the action to `Uploaded` and `Validation failed`, with a code comment stating a file that has imported is intentionally excluded. This epic removes that gate on the user's explicit instruction, after being shown the consequences (below). Implementing this correctly means **deleting** the `cancelApplies` gate's exclusion of `Imported`, not adding a second, wider action next to it — and updating that component's existing tests (and any e2e spec asserting the old restriction) to match the new, wider rule rather than leaving them to fail or be skipped.

- **Real records are destroyed, not just a file.** An imported file's rows are live expense payment requests; some may already carry an Approver's decision — `Approved` or `Rejected` — with a note, who decided it, and when (`expense-decisions` R16/`TransactionRead.LastChangedUser`/`LastChangedDate`). The project otherwise treats a decision as permanent (`expense-decisions` R3/R4: once decided, never decided again) — this epic is a real, user-approved exception to that expectation, not an extension of it. The confirmation (R6) exists specifically so the Importer sees this scale before it happens.

- **The API's actual behaviour on an imported file is unverified — this is a genuine known-unknown, not an inference to resolve away.** `FilesDelete`'s own description reads "Deactivate and delete a file from the staging table using its LogId"; an imported file's rows have already left staging by the time this action is offered on them. Neither service could be probed with a live session during intake, so whether the call succeeds, partially succeeds (e.g. the file record is deactivated but the transaction rows remain reachable via `GET /v1/transactions`), or is refused outright is unknown until BUILD exercises it against the real service. Handle honestly per CLAUDE.md Rule 3: surface whatever the service actually returns; do not assume the happy path, and if the outcome is a partial state, say so rather than reporting a clean success. If BUILD discovers the endpoint rejects imported files outright, that is new information for the user, not a bug to silently work around.

- **Compliance tension, intentionally left open.** POPIA (project.md §Compliance, region ZA) generally favours a data subject's ability to have personal data erased — which argues for allowing exactly this kind of deletion. But destroying the record of who approved or rejected a financial payment request undermines the audit trail the project otherwise treats as permanent, which is usually the opposite pull for financial compliance. This brief does not resolve that tension — the user was shown both sides and chose to proceed with unrestricted deletion. Flagging it here so it is visible to whoever reviews this epic's output, not because it blocks the work.

- **Rename touches more than the two surfaces.** `SubmittedFileActions.tsx`'s file-level doc comment, its `RETRY_LABEL`/`CANCEL_LABEL`/`CONFIRM_CANCEL_LABEL`/`KEEP_FILE_LABEL` constants, `confirmationTitleFor`, `CONFIRMATION_MESSAGE`, `CANCEL_REFUSED_TITLE`, and the exported `cancelFailureMessage`/`cancelSubmittedFile`/`CANCEL_FAILED_MESSAGE` names in `files.ts` all currently say "cancel". A developer implementing this epic should decide how far the rename reaches into internal names (the API operation itself, `FilesDelete`, was always named "delete" — only the frontend's own vocabulary said "cancel") but the **user-visible** three labels (R4) must change; existing unit/e2e specs asserting the old wording (`Cancel file` / `Cancel the file`) will need updating to match, and `file-validation-and-retry`'s own cross-story-contracts note (which pins these exact labels) is superseded by this brief for those three strings.

- **Reading `GET /v1/transactions` for one file's count is a full-list read, per the project's established convention.** The endpoint takes no query parameters at all (confirmed in `transactions-api.yaml`), so the request-count read in R6 fetches every imported request in the system and filters client-side on `FileLogId` — the same shape `expense-request-list` already uses for its own list, built for the project's stated ceiling (10,000 rows). This is a real cost (one full-list network read triggered by opening a delete confirmation on an imported file) but is consistent with how every other list-narrowing operation in this app already works; no new pagination or filtering capability exists on the backend to avoid it.

- **No prototype source exists for this project** (docs-only intake) — no prototype shortcuts to flag.
