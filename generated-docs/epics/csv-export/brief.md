# Epic: Export requests for the payment system

Inherits roles, auth, data source, compliance, and styling from project.md.

**Depends on:** `expense-request-list` — this epic exports whatever that epic's list is currently showing (its search term, filters, and sort). This epic does not build the list, its search/filter/sort/paging, or duplicate marking; see Out of Scope.

---

## Goal

Let either role export the requests currently listed as a CSV file for the external payment system, attributed to the person who produced it.

This is a hand-over file to a real, external, downstream payment system — not a convenience download. Its column shape is fixed by the source spec (RPT-01) and must be produced exactly, because a receiving system, not a person, reads it next.

---

## Data Model

This epic introduces no new persistent entity. It produces one **derived, client-side-only** shape — the export CSV row — computed from the `Transaction` shape already in memory (see `documentation/requirements-application.md` §7 Shape: Transaction). No new API call is required or available: `GET /v1/transactions` takes no query parameters, and there is no export endpoint in `documentation/transactions-api.yaml`. The export is generated entirely client-side from the transaction data already held in the browser for the request list (per `expense-request-list`).

### CSV row shape (mandatory — RPT-01), mapped to `Transaction`

RPT-01 (`documentation/requirements-application.md` §6.7) fixes the export's columns. Each maps cleanly to an existing `Transaction` field — no gap:

| # | RPT-01 column | `Transaction` field | Notes |
|---|---|---|---|
| 1 | Reference | `Reference` | |
| 2 | Transaction date | `TransactionDate` | |
| 3 | Account number | `AccountNumber` | **Unmasked** — see Compliance Exception below. This is the one place in the app where the masking rule from project.md §Compliance does *not* apply, and that is deliberate. |
| 4 | Description | `Description` | May contain commas, quotes, or line breaks (see sample data) — must be CSV-escaped correctly, not just comma-split. |
| 5 | Amount | `Amount` | |
| 6 | Transaction type | `TransactionType` | **Raw service value, not a translated label** — see Transaction Type Decision below. |
| 7 | Currency | `Currency` | |
| 8 | Status | `Status` | Raw value from the service (`Imported` / `Approved` / `Rejected`). |
| 9 | Decision note | `UserNote` | Empty/blank cell when there is no note (e.g. an `Imported` or `Approved` row never rejected). |

Column order and header row should follow this table. Header text uses the RPT-01 column names above (or an equally plain equivalent) — no internal field names in the header row.

---

## COMPLIANCE EXCEPTION — read before implementing (mandatory, not optional)

**The exported CSV carries the full, unmasked account number.** Everywhere else in the app, account numbers are masked to their last four digits (project.md §Compliance, POPIA, user-confirmed) and the full value is revealed only by an explicit user action on one request at a time. **The export is the one deliberate, documented exception to that rule** — the external reimbursement system consumes the account number as-is and cannot work with a masked value. This is not an oversight and must not be "fixed" by masking the export column.

Both halves of this exception are mandatory:

1. The export's Account number column carries the **full, unmasked** value — do not reuse the masked display value used on the list.
2. **The export action is attributed to the signed-in user who produced it.** Capture and surface (in-app, e.g. in the export confirmation/notification) that this user generated this export at this time. (No dedicated audit-viewer entity is required by this epic beyond that attribution — this app has no export-history log requirement elsewhere in the spec.)

---

## Functional Requirements

Re-numbered locally from the assigned requirement inventory (source IDs noted for traceability).

| ID | Statement | Source |
|---|---|---|
| R1 | When a user triggers the export action, the system shall produce a CSV file containing the requests currently listed (i.e. respecting the list's active search term and filters) and their statuses. | R21 (F-21), R49 (UI-06) |
| R2 | The CSV file's rows shall carry exactly the nine RPT-01 columns in the table above, including the unmasked account number and the decision note (blank where none exists). | R89 (RPT-01) |
| R3 | The export action shall be available to both the Finance Uploader and the Approver, for whatever set of requests each currently has listed. | R87 (RBAC) |
| R4 | The export shall be attributed to the signed-in user who produced it (see Compliance Exception above). | R89 (RPT-01), project.md §Compliance |

## Business Rules

| ID | Statement |
|---|---|
| BR1 | The export always reflects the request list's **current narrowing** — active free-text search and active filters (status, originating file, transaction date) — at the moment the export is triggered. It does not export the unfiltered full table when a narrowing is active. |
| BR2 | If the current narrowing matches zero requests, the export action does not produce an empty/junk file — surface the existing empty-state message instead of triggering a download. The sentence used is the one the request list already shows in that state: **"No expense requests match what is currently applied."** (The source spec, `documentation/requirements-application.md` §5 Flow: Export transactions, words it as "No expense requests match the current search and filters." — the same statement. Adding it as a second, near-identical sentence to the same screen would read as two different answers, so the existing wording is reused.) |
| BR3 | CSV values must be escaped per RFC 4180 (or an equivalent correct CSV writer): any field containing a comma, a double quote, or a line break must be quoted, with embedded double quotes doubled. `Description` and `UserNote` are free text and will contain these characters in real data. |
| BR4 | The account number column in the export is never masked, regardless of the masking state shown on screen (see Compliance Exception). |
| BR5 | `TransactionType` is exported using the **raw value returned by the transactions-api**, not a UI-translated label — see Transaction Type Decision below. |
| BR6 | Generating the export must not freeze or visibly hang the browser at the app's stated maximum volume (up to 10,000 rows per a single batch/list, per §10 Volumes). |
| BR7 | The generated file is named descriptively and unambiguously (e.g. including the export date/time), so repeated exports on the same day don't collide or get confused with each other. |

## Key Workflows

**Export transactions** (`documentation/requirements-application.md` §5 Flow: Export transactions):

1. User narrows the list to the requests to be handed over (search/filter — delivered by `expense-request-list`; only matching requests remain).
2. User triggers the export action.
3. A CSV file is produced client-side from the currently-listed requests and downloaded to the user's device.
4. The user gets a clear, in-app confirmation that the export completed (naming the count exported), attributed to them as the user who produced it.

Exception path: if the current narrowing matches nothing, the trigger surfaces "No expense requests match the current search and filters." instead of producing a file.

## Feature NFRs

- Export generation (CSV construction + download trigger) must complete without a noticeable UI freeze at up to 10,000 listed rows (see BR6). If synchronous generation at that volume risks blocking the main thread, do the CSV construction in a way that keeps the UI responsive (e.g. chunked/async construction), rather than a single blocking loop.
- Full keyboard completability: the export trigger must be reachable and activatable by keyboard alone, and the completion/confirmation feedback must be perceivable without a mouse — this app's accessibility bar is **WCAG 2.2 AA** (project.md §Baseline NFRs supersedes the 2.1 AA floor for this project; see `documentation/requirements-application.md` §6.6.5).
- Status values in any on-screen export confirmation follow the existing intent-mapped colour + icon/text convention (UI-21) — not relevant to the CSV file itself, but relevant to the confirmation UI this epic adds.

## Out of Scope

- The request list itself, its search, filters, sort, paging, and duplicate marking — delivered by `expense-request-list`. This epic only reads that list's current state to build the export.
- Approving/rejecting requests, and the decision note's origin — delivered by `expense-decisions`. This epic only reads the `Status` and `UserNote` values already present.
- Any backend export endpoint or server-side report generation — none exists in `documentation/transactions-api.yaml`; the export is produced entirely client-side from data already fetched for the list.
- Scheduling or recurring exports — RPT-01 states `on-demand` only.
- A dedicated export-history/audit-log viewer — the spec's audit-trail viewer (§6.9) covers `Transaction` and `ExpenseFile` field changes, not export events; this epic satisfies "attributed to the signed-in user who produced it" via in-app confirmation, not a persisted log.

## Notes & Caveats

**Scope tension in the source spec — flagging rather than silently resolving.** RPT-01 (`documentation/requirements-application.md` §6.7) describes the report's purpose as handing over *"decided expense payment requests"* and names its audience as the Finance Uploader only. Read literally, that could mean the export should be gated to `Approved`/`Rejected` rows only, and to the Finance Uploader only. However:

- §6.5 (Access control / RBAC) explicitly grants the "Export transactions" action to **both** Finance Uploader and Approver (`X` in both rows), which R87 restates.
- §6.1 F-21 and §6.4 UI-06 (R21/R49, the two acceptance criteria driving this epic's core requirement) say only "the requests currently listed" / "the requests that were listed" — with no status restriction — and §5's own Flow: Export transactions step 1 is "narrow the list to the requests to be handed over," implying the user (using status as one of the available filter dimensions) decides what's included, rather than the system enforcing a decided-only gate.

**This brief adopts the unrestricted reading**: the export carries whatever the current list narrowing shows, of any status, and is available to both roles without restriction. RPT-01's "decided requests" language is treated as describing the *typical* real-world use (you'll normally filter to decided rows before handing off to payment), not a hard requirement gate — status is offered as a filter, not enforced as a precondition. **This is the one point in this epic most worth confirming with the user at the stories-approval step** — if the intended behaviour is actually "block export unless every listed row is Approved or Rejected," that is a different, additive business rule this brief does not currently include.

> **RESOLVED — confirmed by the user at the stories approval (2026-08-11).** The unrestricted reading stands:
> the export carries **every request currently listed, of any status, for both roles**. The user was shown all
> three readings (export everything / quietly skip undecided rows / refuse the export while any listed row is
> undecided) with a live preview of what each would put in the file, and chose the unrestricted one. Narrowing
> the list is how the user chooses what goes in. **Do not** add a status filter or a "finish deciding first"
> gate during BUILD — this is a settled decision, not an open assumption.

**Transaction type — raw value decision, flag for confirmation.** The app holds no accepted-value list for `TransactionType` (INTAKE decision: the transactions-api service is the sole authority on accepted values — see project.md). The two data sources disagree on shape: the *upload* sample CSV (`documentation/transactions_2026-04-15.csv`) uses single-letter values (`C`, `D`), while the transactions-api's own `TransactionRead` schema example shows the spelled-out form (`"Debit"`). Since `GET /v1/transactions` is what this epic actually reads from (not the upload file), the export will carry **whatever `GET /v1/transactions` returns for `TransactionType`** — i.e. the service's own response format, unmodified by any on-screen translation the list may apply for display. This is the safer default because the external payment system, not a person, consumes this file. Flagging because if the list epic introduces a friendlier on-screen label for `TransactionType`, it would be a mistake to accidentally export that label instead of the raw API value — implementers should export the untransformed field from the fetched `Transaction` object.

**CORS dependency.** Both this epic's read of `GET /v1/transactions` and everything else in the app depend on the open backend item at project.md §Baseline NFRs NFR-base-6 (transactions-api currently returns no `Access-Control-Allow-Origin` header). Not an in-scope fix for this epic, but the export cannot function until that's resolved on the backend.

**Prototype:** no `documentation/prototype-src/` or `documentation/genesis.md` exists for this project (docs-only intake) — no prototype shortcuts to carry-forward notes for this epic.
