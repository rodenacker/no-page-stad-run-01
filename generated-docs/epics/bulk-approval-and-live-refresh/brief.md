# Epic: Bulk approval and a self-updating list

Inherits roles, auth, data source, compliance, and styling from project.md.

**Depends on:** `expense-decisions` — the single-decision approve/reject flow, the decision confirmation convention (UI-09), and the BR-01 race mitigation (re-read current state before submitting a decision) are established there; this epic reuses that convention rather than inventing a second one. **Also assumes** the shared request list surface from `expense-request-list` already exists (this epic adds multi-select, bulk approval and self-refresh *on top of* that list — it does not render the list itself).

---

## Goal

Let an Approver select many imported requests and approve them in one action with a clear report of any it skipped, and keep every approver's list current on its own so nobody acts on a request a colleague has already decided.

---

## Data Model

Scoped to what this epic reads/writes. Full field tables live in `documentation/requirements-application.md` §7; the request list's own rendering (all columns, search/filter/sort/paging, duplicate marking) belongs to `expense-request-list`.

### Transaction (backend contract: `TransactionRead` / `TransactionReadList`)

| Field | Type | Required | UI-display | Notes |
|---|---|---|---|---|
| Id | integer | yes | hidden | Sent as `TransactionId` on `POST /v1/transactions/approve`. The unit this epic's selection set and outcome report are keyed on. |
| Reference | string | yes | table-col | Identifies a request in the outcome report and in the selection. |
| AccountNumber | string | yes | table-col | **Masked to its last four digits wherever listed** (project.md §Compliance, POPIA) — the bulk-selection view is a listing, so this epic never shows the full value. |
| Amount | number | yes | table-col | Named alongside the request in report/confirmation copy per the project's "Exacting finance desk" voice (requirements §1.8). |
| Status | string | yes | chip | `Imported` \| `Approved` \| `Rejected`. Only `Imported` rows are selectable/eligible for bulk approval (BR-03). This epic re-reads `Status` immediately before acting — see BR2 below. |
| LastChangedUser / LastChangedDate | string | yes | detail | Set by the backend on a successful `TransactionApprove` call; not sent by the frontend. |

### Approve call (backend contract: `POST /v1/transactions/approve`)

| Aspect | Value |
|---|---|
| Request | Query param `TransactionId` (integer) + header `LastChangedUser` (string — the signed-in user's identity) |
| Response | `DefaultResponse` (`Id`, `MessageType`, `Messages[]`) — a generic success envelope. **It does not distinguish "newly approved" from "was already decided"** — both a genuine first approval and a no-op on an already-decided transaction return the same shape. This is the central design constraint of this epic; see BR5. |
| Bulk shape | **None exists.** There is no endpoint that accepts multiple `TransactionId`s. "Approve the selection" is *N independent calls* to this single-transaction endpoint — see BR3. |

### Refresh read (backend contract: `GET /v1/transactions`)

Takes no query parameters; returns the full transaction list (up to 10,000 rows per requirements §1.7/§10). There is no delta/websocket/SSE channel — self-refresh (R3) is polling this same full-list endpoint on an interval, not a push mechanism. This is also the endpoint used for the pre-submit eligibility re-check (BR2) — the two concerns can share one fetch when they land in the same tick.

---

## Functional Requirements

| ID | Statement | Source |
|---|---|---|
| R1 | When an Approver approves a selection of requests, every selected request that is still `Imported` shall be set to `Approved`. | R18 / F-18 |
| R2 | The number of currently selected requests is visible at all times while a selection is active, and the bulk-approve action applies to exactly that selection — no more, no fewer. | R47 / UI-04 |
| R3 | While the request list is open, the frontend shall refresh it automatically (by polling) so that another approver's decision becomes visible without a manual reload. | R20 / F-20 and R48 / UI-05 (twin source citations for the same requirement) |
| R4 | An ambient selection-count indicator displays the exact count up to 99, displays "99+" at 100 or more, and is hidden when the selection is empty. | R63 / UI-20 |
| R5 | After a bulk-approve action completes, the outcome states exactly how many selected requests were approved and how many were left unchanged because they had already been decided. | R76 |
| R6 | When the list can no longer refresh itself, it states that plainly and shows the time it was last current; refreshing resumes automatically, without user action, once the connection returns. | R77 |
| R7 | Only a signed-in user with the Approver role is offered the bulk-approve action (and the selection controls that lead to it); a Finance Uploader is not offered it. | R84 (RBAC: Approver `X`, Finance Uploader `—`) |
| R8 | The bulk-approve confirmation always names the selection's exact, literal count — never the truncated "99+" form from R4 — because R4's truncation is for an ambient indicator, not for the copy that gates an irreversible action. | UI-09 (project-wide confirmation convention, established in `expense-decisions`) + R63/UI-20 (interaction) |
| R9 | Immediately before submitting the approve calls for a bulk action, the frontend re-reads current transaction state and excludes from the batch any selected request no longer `Imported`; those excluded requests are reported per R5 without an approve call ever being made for them. | Derived from the BR-01 race mitigation established in `expense-decisions`; applies R18/F-18's "still Imported" condition operationally |
| R10 | If an individual approve call fails for a reason other than the request already being decided (e.g. a network or server error), that request is reported separately from R5's "already decided" bucket, and the user is offered a way to retry just the failed subset. | Derived — the context notes call out that partial success must handle non-"already-decided" failures, and NFR-base-5 requires a retry affordance for async operations |

---

## Business Rules

| ID | Statement |
|---|---|
| BR1 | A request is eligible for a bulk-approve call only while its `Status` is `Imported` (BR-03); a request that has moved to `Approved` or `Rejected` — by this user or another — since it was selected is excluded from the batch and counted as skipped, never sent to `POST /v1/transactions/approve`. |
| BR2 | The eligibility check in BR1 is evaluated against a **fresh** read of transaction state, fetched immediately before the batch of approve calls is issued — not against whatever state was current at the moment the user built the selection. This is this epic's concrete implementation of the project's BR-01 race mitigation (per `expense-decisions`): the backend returns the same generic response whether or not a request was already decided, so staleness must be caught client-side before the call, not inferred from the call's response. |
| BR3 | `TransactionApprove` decides exactly one transaction per call. Approving a selection of N eligible requests issues N independent calls, each carrying that transaction's `Id` as `TransactionId` and the signed-in user's identity as the `LastChangedUser` header. There is no batching at the transport level; concurrency is a client-side choice (see Notes & Caveats). |
| BR4 | The bulk-approve confirmation (UI-09) always states the selection's exact count, in full, regardless of size — R4's "99+" truncation never applies inside the confirmation copy, only to the ambient selection-count indicator elsewhere on screen. |
| BR5 | Because `TransactionApprove`'s response body cannot distinguish "this call newly approved the request" from "this request was already decided when the call landed," the outcome report in R5 is computed by comparing each originally selected request's status **before** the action to its status **after** the batch completes (via a follow-up read of `GET /v1/transactions`) — never by trusting individual call response bodies to carry that distinction. |
| BR6 | The self-refresh in R3 polls `GET /v1/transactions` on a fixed 15-second interval while the request list is open and its tab/window is visible (no polling while backgrounded/hidden, resuming immediately on becoming visible again). 15 seconds is chosen to keep the list honest for up to three simultaneous approvers without repeatedly re-fetching a list that may run to 10,000 rows on every tick; treat as a tunable default, not a fixed contract, if BUILD or the user has a stronger preference. |
| BR7 | Self-refresh polling pauses while a bulk-approve confirmation is open or a bulk-approve batch is in flight, and resumes immediately once that action finishes (approved, skipped, or failed) — a refresh mid-confirmation or mid-batch must never race the user's own in-flight action. |
| BR8 | A refresh cycle updates the underlying request data in place without collapsing an open confirmation dialog, without moving keyboard focus, and without shifting scroll position. The one exception: if a refresh reveals that a currently selected request is no longer `Imported` (a colleague decided it), that request is silently dropped from the selection and the visible selected count (R2/R4) decreases to match — no separate interruption is shown for this; the next confirmation, if any, will simply name the corrected, smaller count. |
| BR9 | Refresh is treated as unable to continue (triggering R6's offline state) after **two consecutive** failed poll attempts, to avoid flapping the offline state on a single transient network blip; it reverts to normal refreshing as soon as one poll succeeds, and the "last current" timestamp shown in the offline state is the time of the last poll that succeeded. |
| BR10 | Per the project-wide UI-24 convention, the bulk-approve action and the selection controls that lead to it are **hidden**, not shown disabled, for a signed-in user without the Approver role (R7). |
| BR11 | Failed calls (R10) are retried only for the specific requests that failed for a non-"already-decided" reason; retrying re-applies BR1/BR2's eligibility re-check rather than blindly resubmitting the original failed `TransactionId`s, since time has passed and one of them may since have been decided by someone else. |

---

## Key Workflows

### 1. Select and bulk-approve (happy path, nothing raced)

1. Approver selects several `Imported` requests from the list; the selected count is shown (R2), truncated per R4 if ≥100.
2. Approver triggers bulk-approve; a confirmation names the object and the **exact** selection count (R8/BR4) — e.g. "Approve 47 selected expense requests? This cannot be undone." — with the cancel choice holding focus (UI-09).
3. On confirming, the frontend re-reads current transaction state (BR2) and finds every selected request still `Imported`.
4. The frontend issues one approve call per selected request (BR3) with a visible in-flight indicator; the list surface remains readable but selection/bulk controls are disabled for the duration.
5. On completion, a follow-up read confirms the final state; the outcome states "47 approved, 0 left unchanged" (R5), transiently confirmed per the project's UI-19 convention.

### 2. Bulk-approve with a partial skip (someone else decided some in the meantime)

1. Approver selects 50 requests and confirms bulk-approve, naming 50 in the confirmation.
2. The pre-submit re-check (BR2) finds that 3 of the 50 are no longer `Imported` (another approver decided them between selection and confirmation) — those 3 are excluded from the batch (BR1) and their entries drop from the active selection (BR8).
3. 47 approve calls are issued; the follow-up read confirms all 47 landed.
4. The outcome states "47 approved, 3 left unchanged because they had already been decided" (R5) — this is the exact scenario R76's exception path in requirements §6.4.5 describes.

### 3. Bulk-approve with a real failure mixed in

1. Approver selects 20 requests and confirms.
2. 18 calls succeed; 2 fail with a network/server error unrelated to already-being-decided (R10).
3. The outcome distinguishes all three buckets: approved, already-decided/skipped, and "could not be submitted — connection problem" for the 2 failures, with a retry action scoped to just those 2 (NFR-base-5).
4. Retrying re-applies the eligibility re-check (BR11) before resubmitting, since more time has passed.

### 4. Self-refresh while idle (no selection, nothing open)

1. Two approvers have the list open. One approves a single request via the `expense-decisions` flow.
2. Within 15 seconds (BR6), the other approver's list reflects the new status without a manual reload, announced politely to assistive technology (see Feature NFRs) and without moving focus or scroll position (BR8).

### 5. Self-refresh while a selection or confirmation is active

1. An approver has 30 requests selected and a bulk-approve confirmation open.
2. The background poll due at that moment is skipped (BR7); the confirmation is never silently dismissed and the selection is never silently changed mid-confirmation.
3. Once the approver confirms (or cancels), polling resumes on its normal cadence.

### 6. Going offline and recovering

1. The network drops; two consecutive polls fail (BR9).
2. The list states it can no longer refresh itself and shows when it was last current (R6) — the list itself is not hidden or blanked, it simply stops silently pretending to be live.
3. The connection returns; the next poll succeeds, the offline notice clears, and refreshing resumes without the user doing anything.

---

## Feature NFRs

| ID | Statement |
|---|---|
| NFR1 | Selecting requests, seeing the live selected count, and triggering/confirming bulk-approve are all completable by keyboard alone, per the project's WCAG 2.2 AA bar (requirements §6.6.5). |
| NFR2 | Self-refresh updates are announced to assistive technology politely (`aria-live="polite"`), never disruptively (never `assertive`, never a focus-stealing alert) — a background data change must not interrupt whatever the user is doing (BR8). |
| NFR3 | A bulk-approve batch does not fire all N approve calls with unbounded concurrency: calls run with a bounded concurrency (suggested default: 5 in flight at a time) so a large selection (data volumes run to 10,000 rows per requirements §10) neither floods the backend nor leaves the UI unresponsive for the duration. `[INFERRED]` — no source number for this; a reasonable default pending BUILD/user confirmation. |
| NFR4 | The list-refresh poll (BR6) and the pre-submit eligibility re-check (BR2) both hit `GET /v1/transactions`, which returns the full list; where they land in the same interaction, share one fetch rather than issuing two full-list reads back to back. |
| NFR5 | Rendering one page of the refreshed request list still meets the project's general render budget (p95 ≤ 400ms at the 10,000-request volume, requirements §6.6.2) — a refresh cycle must not visibly stall the list. |

---

## Out of Scope

- The single-request approve/reject decision (including the rejection-note flow and its own confirmation) — `expense-decisions`.
- The list itself: its rendering, search, filtering, sort, paging, and duplicate-of-another-request marking — `expense-request-list`.
- CSV export of decided requests — a separate epic.
- Any server-side or infrastructure-level real-time channel (websocket/SSE) — the transactions API offers none; self-refresh here is client-side polling only.
- User and role administration — explicitly out of scope for the whole application (requirements §1.5).

---

## Notes & Caveats

- **This epic's central design constraint: no bulk endpoint, and a response that hides the "already decided" distinction.** `TransactionApprove` takes one `TransactionId` and returns the same generic `DefaultResponse` whether it just approved a request or found it already decided. Every design choice above — the pre-submit re-check (BR2), the post-batch reconciliation read (BR5), the three-bucket outcome (approved / already-decided / failed, R5+R10) — exists because of this one constraint. Do not simplify this during BUILD by trusting individual call responses; the reconciliation read is load-bearing.
- **UI-09 vs UI-20 interaction is deliberate, not an oversight.** R63/UI-20 ("99+" truncation) is a Could-priority convention for ambient count *indicators*. UI-09 (Must) requires the bulk-approve confirmation to name the affected count so the user can judge an irreversible action before taking it — showing "99+" there would defeat that purpose for exactly the selections large enough to matter most. BR4 resolves this: truncation only outside the confirmation.
- **Manual-test focus.** This epic's core value — "nobody acts on a request a colleague has already decided" — is only really verified with **two approvers open on screen at the same time**, one bulk-approving while the other single-decides an overlapping request. Flag this explicitly for the MANUAL-TEST phase; it cannot be meaningfully exercised by a single-session Playwright spec alone.
- **Refresh cadence (15s) is a stated default, not a hard requirement.** No source document gives a number for polling frequency (requirements §1.6 only says the list "refreshes automatically while it is open" and flags that assumption as inferred). 15 seconds balances "up to three approvers must not act on stale state" against "don't refetch a 10,000-row list every couple of seconds." Revisit if the user has a stronger preference once this is in BUILD.
- **Account-number masking applies to the bulk-selection surface.** Per project.md §Compliance (POPIA, user-confirmed), account numbers are masked to their last four digits wherever expense payment requests are listed; the multi-select view is a listing, so it never exposes the full account number — full value only appears via the explicit single-request action owned by `expense-decisions`.
- **CORS is an open backend item, not a frontend defect** (project.md NFR-base-6). Both the polling refresh calls and the N approve calls this epic issues are affected equally by the missing `Access-Control-Allow-Origin` on the transactions-api; treat any in-browser cross-origin failure during BUILD as this known dependency.
- **Data volume context.** Requirements §10 states 1–10,000 records per batch and up to four concurrent users (one uploader, up to three approvers) all viewing the same list — the numbers behind BR6's cadence choice and NFR3's concurrency-bound suggestion.
- No prototype source exists for this project (docs-only intake) — no prototype shortcuts to flag.

---

## Decisions settled at the stories approval (2026-08-11)

Three points the source documents leave open were resolved when this epic's stories were approved. They are
**settled**, not open assumptions — do not re-litigate them during BUILD.

1. **A "select everything currently listed" control IS included.** Not mentioned in the requirements, but R4's
   `99+` threshold is unreachable without it (nobody ticks 100 requests through a 20-row page). It selects every
   *still-Imported* request the active search and filters left — not the whole fetched set, and not only the
   visible page. Confirmed by the user.
2. **A selection SURVIVES narrowing, ordering and paging.** The tick follows the *request*, not the row
   position — which is why the selection is held as a set of transaction Ids. This is the only reading
   consistent with a confirmation that names an exact count (BR4). The known consequence — the Approver may
   approve requests not currently on screen — was shown to the user with a live demo and **accepted
   deliberately**. The alternative (clear the selection on any view change) was declined.
3. **The ambient selected-count indicator lives in the list's own toolbar**, beside the bulk action — not in the
   app header. The header is fixed by project convention (nothing in it is hidden at any width), so a
   conditional indicator there would fight that. Decided by the orchestrator and disclosed at approval.

## Convention extension to record at epic end

`generated-docs/architecture.md` § Conventions currently states that a self-updating view *"re-reads its OWN
call on an interval, only while something it shows is still in progress, and stops once nothing is"* — the
behaviour of `SubmittedFilesList` and `SubmittedFileDetail`.

**R3/BR6 requires the opposite here:** the refresh runs the whole time the list is open, gated on tab
visibility and paused around the user's own action. Nothing on this screen is ever "in progress" in the
file-processing sense — what is being watched is *other people's decisions*, which never finish.

This is an **extension** of the convention, not a violation of it. **Record it in `architecture.md` at epic
end** so a later epic does not "fix" it back to the stop-when-idle form.

## Planned against an unmerged dependency — read before BUILD

This epic was planned while `expense-decisions` was still building, so its code was **not** in the tree the
planner read. Three reuse points were therefore planned from that epic's story files rather than observed:
the single-request approve call, the confirmation composition (UI-09), and the re-read-before-submit staleness
check. Each is marked as a **dependency seam** in the story files that need it (stories 2 and 3).

**At BUILD time, confirm each seam against the merged `main` first** and adapt to what actually landed —
never add a parallel implementation alongside it.
