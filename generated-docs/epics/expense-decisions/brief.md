# Epic: Approve or reject a request

Inherits roles, auth, data source, compliance, and styling from project.md.

**Slug:** `expense-decisions` · **Depends on:** `expense-request-list` — this epic decides one request from the shared list that epic delivers; it assumes a request can already be found, opened, and identified by reference before a decision is recorded here.

---

## Goal

Let an Approver record one final decision on an imported expense payment request — approve it, or reject it with a note — after a confirmation, with no way to decide the same request twice and a visible record of who decided what.

---

## Data Model

This epic introduces no new persistent entity — it acts on the existing `Transaction` (requirements §7, `documentation/transactions-api.yaml`), scoped to its decision fields and the two decide operations.

| Shape | Fields relevant to this epic | Notes |
|---|---|---|
| `Transaction` (`TransactionRead`) | `Id` (int), `Reference` (string), `AccountNumber` (string), `Amount` (number), `Status` (`Imported` \| `Approved` \| `Rejected`), `UserNote` (string, optional), `LastChangedUser` (string), `LastChangedDate` (string) | `Status`, `UserNote`, `LastChangedUser`, `LastChangedDate` are the audit fields R16 requires visible. `AccountNumber` is masked to its last four digits wherever shown, per project.md §Compliance — a decision confirmation naming the request must not defeat that masking. |
| `TransactionRejectWrite` (request body of `POST /v1/transactions/reject`) | `UserNote` (string) | The rejection note. Required — see R7/R9/BR4. |
| `DefaultResponse` (response body of both decide operations) | `Id` (int), `MessageType` (string), `Messages` (string[]) | **Generic envelope — see BR1.** The same shape is returned whether the decision succeeded, the request was already decided, or another failure occurred; the response body alone cannot distinguish these cases. |

### API operations consumed

| Operation | Method / path | Query / header params | Body |
|---|---|---|---|
| `TransactionApprove` | `POST /v1/transactions/approve` | `TransactionId` (query, required), `LastChangedUser` (header, required — name of the user performing the action) | none |
| `TransactionReject` | `POST /v1/transactions/reject` | `TransactionId` (query, required), `LastChangedUser` (header, required) | `TransactionRejectWrite { UserNote }` |

Both operations decide **exactly one `TransactionId` per call** — there is no bulk/batch decide endpoint. That matters more for `bulk-approval-and-live-refresh` (which must call one of these per selected request), but it is the shape of the underlying operation this epic wires up first.

`LastChangedUser` is a required header on both calls — populate it from the signed-in user's own identity (`GET /v1/auth/userinfo`, from `sign-in-and-app-shell`), server-side, not from a client-supplied/trusted value.

---

## Functional Requirements

| ID | Statement |
|---|---|
| R1 | When an Approver approves an imported request, the frontend shall set that request's status to Approved. *(source: F-16)* |
| R2 | When an Approver rejects an imported request with a note, the frontend shall set that request's status to Rejected and record the supplied note. *(source: F-17)* |
| R3 | If a request has already been decided, the frontend shall not offer or accept a further decision on it. *(source: F-19)* |
| R4 | When any one Approver has decided a request, no further decision may be recorded; a further attempt is refused with a statement that it has already been decided. *(source: BR-01)* |
| R5 | Where an Approver is the subject of the expense payment request, the approve action is still offered. *(source: BR-02)* |
| R6 | While a request is not Imported, neither approve nor reject may be offered for it. *(source: BR-03)* |
| R7 | A rejection submitted without a note is refused and a note is asked for; the note is recorded with the rejection. *(source: BR-04)* |
| R8 | No amount threshold is applied to an Approver's decision. *(source: BR-08)* |
| R9 | A note is required only when the decision is a rejection ("Add a note explaining why this request is rejected."). *(source: VR Transaction.UserNote)* |
| R10 | Approve and reject are gated by a confirmation naming the affected request and, implicitly, the count (one); the cancel choice holds focus; the action does not take effect until the confirmation is accepted. *(source: UI-09)* |
| R11 | The transient confirmation of a completed decision auto-dismisses after 4–8 seconds; state the user must acknowledge (e.g. a validation message, a refusal) persists until dismissed. *(source: UI-19)* |
| R12 | On a decided request, mutating (decide) actions are hidden and a message names the state. *(source: UI-26)* |
| R13 | A decision on a request someone else already decided is refused with a statement that it has already been decided; the list is refreshed and another request is chosen. *(source: ES, Review-and-decide flow)* |
| R14 | Only an Approver can approve or reject a request; a Finance Uploader has read-only access to requests and is not offered the decide actions. *(source: RBAC — Transaction `A†BR-03` / `U†BR-04` for Approver, `R` only for Finance Uploader)* |
| R15 | An in-app notification is shown to the Approver when a decision is recorded on a request. *(source: NT-03)* |
| R16 | `Status`, `UserNote`, `LastChangedUser` and `LastChangedDate` are visible for every decided request, for as long as its originating file is retained; viewable by both Finance Uploader and Approver. *(source: audit viewer, Transaction)* |

---

## Business Rules

| ID | Statement |
|---|---|
| BR1 | **Already-decided detection works around a generic backend response.** `TransactionApprove`/`TransactionReject` return the same `DefaultResponse` shape on success and on failure — the frontend cannot distinguish "already decided" from another error by the response alone. The frontend must **re-read the request's current status immediately before submitting the decision** (a fresh single-request or list read, not a cached value); if that read shows the request is no longer `Imported`, report it as already-decided/skipped (R4/R13) without submitting the decide call at all. This is the intended approach for this epic — not a placeholder pending a richer backend contract. |
| BR2 | An Approver deciding a request they are themselves the subject of is a deliberate business decision (R5) — no self-approval guard is added, on the client or implied server call. |
| BR3 | Approve and reject are rendered/enabled only when `Transaction.Status === 'Imported'`; for any other status they are not offered at all (R6), and R12's state message is shown instead. |
| BR4 | Reject requires a non-empty `UserNote`; an empty or whitespace-only note blocks submission with "Add a note explaining why this request is rejected." (R7, R9) — this is a cross-field rule, checked on submit, not on keystroke, per the project's general validation-timing rule (requirements §6.3 header). |
| BR5 | No amount-based logic gates, warns on, or routes a decision differently by request size (R8) — do not invent a threshold, a "large amount" confirmation variant, or a second-approval step. |
| BR6 | The approve/reject confirmation (R10) names the specific request by its `Reference` and states the action ("Approve request TXN-00001?" / "Reject request TXN-00001?"), matching the project's confirmation-copy convention (requirements §1.8: name the object and outcome). Cancel holds initial dialog focus. |
| BR7 | Role gating for the decide actions (R14) follows requirements §6.5: Approver has `A†BR-03 U†BR-04` on `Transaction` (approve conditional on BR-03/Imported, reject-with-note conditional on BR-04/note-present); Finance Uploader has `R` only and is never offered either action, consistent with the hidden-not-disabled rule this project uses everywhere (inherited from `sign-in-and-app-shell`). |

---

## Key Workflows

### 1. Approve a request (happy path)

1. Approver opens an Imported request (from `expense-request-list`); approve and reject are both offered (R6/BR3), account number shown masked (project.md §Compliance).
2. Approver chooses Approve; a confirmation names the request by reference and asks for confirmation, with the cancel choice focused (R10/BR6).
3. On confirmation, the frontend re-reads the request's current status (BR1); if still Imported, it calls `POST /v1/transactions/approve` with `TransactionId` and the signed-in user's identity in `LastChangedUser`.
4. On success, the request's status becomes Approved; decide actions are withdrawn and a state message is shown (R12); a transient confirmation is shown to the Approver and auto-dismisses after 4–8 seconds (R11/R15).
5. Status, note (none, for an approval), `LastChangedUser` and `LastChangedDate` are now visible on the audit view (R16).

### 2. Reject a request with a note (happy path)

1. Approver chooses Reject on an Imported request; the confirmation/reject form asks for a note.
2. If submitted with no note, submission is refused and "Add a note explaining why this request is rejected." is shown (R7/R9/BR4); the note field is corrected and resubmitted.
3. With a note present, the confirmation names the request and the action; cancel holds focus (R10/BR6).
4. On confirmation, the frontend re-reads the request's current status (BR1); if still Imported, it calls `POST /v1/transactions/reject` with `TransactionId`, `LastChangedUser`, and `{ UserNote }`.
5. On success, status becomes Rejected, the note is recorded and shown alongside it; decide actions are withdrawn (R12); a transient confirmation is shown and auto-dismisses (R11/R15).

### 3. Attempt to decide an already-decided request (race path)

1. Two Approvers have the same Imported request open at once (this scenario is enabled by `bulk-approval-and-live-refresh`'s live list, but the single-decision race itself belongs to this epic).
2. Approver A decides the request first and succeeds.
3. Approver B, acting on stale on-screen state, confirms a decision on the same request.
4. Per BR1, the frontend re-reads the request immediately before submitting B's decision, finds it is no longer Imported, and refuses locally with "This request has already been decided." (R4/R13) — no decide call is made.
5. The message persists until acknowledged (R11); the list is refreshed and Approver B chooses another request.

### 4. Viewing a decided request

1. A request that is Approved or Rejected shows its status (with intent-mapped colour + icon/label, project.md semantic status colours), and, if rejected, its note.
2. No approve/reject action is offered; a message names the state instead (R12).
3. `Status`, `UserNote`, `LastChangedUser`, `LastChangedDate` remain visible on the audit view for as long as the originating file is retained (R16), to both roles.

---

## Feature NFRs

| ID | Statement |
|---|---|
| NFR1 | Approving, rejecting, writing the rejection note, and completing the confirmation dialog are each fully keyboard-completable, per the project's WCAG 2.2 AA bar (requirements §6.6.5). |
| NFR2 | The approve/reject confirmation dialog's cancel control holds initial focus when the dialog opens (R10) — this overrides the general "first editable field takes focus" rule (UI-12, inherited from `sign-in-and-app-shell`'s R8) for this specific destructive-confirmation case. |
| NFR3 | Status is conveyed by intent-mapped colour paired with an icon or text label, never colour alone (project.md semantic status colours: Approved = success, Rejected = error, Imported = informational), per UI-21. |
| NFR4 | The already-decided race path (Workflow 3) is a genuine timing-dependent race and cannot be fully exercised by a deterministic automated test — flag it as a **manual-test focus item**: verify with two Approver sessions open on the same request, one deciding just ahead of the other, and confirm the second sees the already-decided refusal rather than a silent double-decision or an unrelated error. |

---

## Out of Scope

- Multi-select, bulk approval, and the shared list refreshing itself while open — owned by `bulk-approval-and-live-refresh`. This epic is the single-request decision only; the confirmation convention it establishes (R10/BR6) is **project-wide** and that epic's bulk-approve confirmation must follow the same pattern (naming the affected object and count, cancel holding focus).
- Cancelling a file — owned by `file-validation-and-retry`; that epic's cancel-file confirmation must also follow the R10/BR6 convention established here.
- Any amount-threshold-based gating, warning, or second-reviewer step — deliberately absent (R8/BR5); do not add one.
- A self-approval guard — deliberately absent (R5/BR2); an Approver deciding their own expense is expected behaviour.
- Editing any imported request value — imported values are read-only everywhere (requirements BR-05); this epic only ever changes `Status`, `UserNote`, `LastChangedUser`, `LastChangedDate` via the two decide operations, never any other field.
- Locating or filtering the request being decided — owned by `expense-request-list`; this epic assumes a single Imported request is already on screen.

---

## Notes & Caveats

- **The already-decided response is genuinely ambiguous at the transport level (BR1).** `TransactionApprove` and `TransactionReject` both return the same `DefaultResponse { Id, MessageType, Messages[] }` shape regardless of outcome. Do not assume a distinguishing `MessageType` or HTTP status is guaranteed for the "already decided" case specifically — the re-read-before-submit approach in BR1 is what makes this workable without relying on parsing the response for that distinction. If, during BUILD, the response does turn out to carry a reliably distinguishable value, that can supplement (not replace) the re-read.
- **This epic's confirmation pattern is the project-wide convention.** UI-09 in the source spec names four actions — approve, reject, bulk-approve, and cancel-file — but only lives in this brief. `bulk-approval-and-live-refresh` and `file-validation-and-retry` must each implement their own action's confirmation to the same rule (name the affected object and count; cancel holds focus; action doesn't take effect until accepted) rather than re-deriving it independently.
- **Account-number masking applies to whatever surface shows the account number during this flow** (e.g. a decision confirmation that displays request details) — masked to last four digits by default; full value only via an explicit user action on that single request (project.md §Compliance, POPIA).
- **`LastChangedUser` header is server-populated, not client-trusted.** Both decide calls require a `LastChangedUser` header naming who performed the action; this must come from the authenticated session's own identity (via the BFF-fronted `GET /v1/auth/userinfo`), not a value the client sends as free text.
- **CORS is an open backend dependency on the transactions-api** (project.md NFR-base-6) — both decide calls are cross-origin from `localhost:3000` to `localhost:4423` and will not complete in-browser until the backend returns a non-wildcard `Access-Control-Allow-Origin` plus `Access-Control-Allow-Credentials: true`, unless a same-origin rewrite proxy (as used in `sign-in-and-app-shell`) is applied to the transactions-api too.
