# Epic: The shared expense request list

Inherits roles, auth, data source, compliance, and styling from project.md.

**Depends on:** `sign-in-and-app-shell` (session, signed-in identity, app header/shell, theme control).

---

## Goal

Give both roles — Finance Uploader and Approver — one shared list of every imported expense payment request they can search, filter, sort and page through, with possible duplicate requests clearly marked and every value read-only. This is the everyday screen both roles work from before any decision is made on a request; deciding, selecting/bulk-acting, live self-refresh, and export are delivered by other epics (see Out of Scope).

---

## Data Model

Consumed read-only from `GET /v1/transactions` (transactions-api, no query parameters — the endpoint returns every imported request in one response; there is no server-side paging, search, sort or filter). Response shape: `TransactionReadList { Transactions: TransactionRead[] }`.

### Transaction (per request, `documentation/requirements-application.md` §7)

| Field | Type | Display | Notes for this epic |
|---|---|---|---|
| `Id` | integer | hidden | Row identity; used for row keys and the duplicate-detail action, not shown. |
| `FileLogId` | integer | hidden | Identifies the originating file. |
| `FileName` | string | table-col | Filterable ("originating file", UI-03). |
| `Reference` | string | table-col | Primary identifier — the mobile-card "primary identifier" (UI-23). |
| `TransactionDate` | string | table-col | Sortable; part of the duplicate key (BR-11). |
| `AccountNumber` | string | table-col | **Masked to its last four digits everywhere the list appears; the full value is revealed only by an explicit user action on a single request** (POPIA carry-forward — see Notes & Caveats). Part of the duplicate key (BR-11). |
| `Description` | string | table-col | |
| `Amount` | number | table-col | Part of the duplicate key (BR-11). |
| `TransactionType` | string (enum, values as supplied by the service) | enum/chip | Rendered as a plain-language label when a translation is known (e.g. `C` → "Credit — money in", `D` → "Debit — money out", per the sample file's single-letter convention); any other value the app has no translation for is displayed exactly as returned and is never treated as an error. The service is the sole authority on valid values. |
| `Currency` | string (3-letter code) | detail/table-col | |
| `Status` | string (`Imported` / `Approved` / `Rejected` per the source Transaction enum) | chip | Rendered via the intent-mapped colour + icon/text convention (approved=success, rejected=error, imported=informational). See Notes & Caveats re: "cancelled" as a status colour. |
| `UserNote` | string, optional | detail | Populated on rejected requests; read-only here (rejection itself is out of scope — see below). |
| `LastChangedUser` | string | detail | |
| `LastChangedDate` | string | detail | |

### Derived: Duplicate Flag (not part of the API — computed client-side)

| Field | Derivation | Refresh trigger |
|---|---|---|
| `isDuplicate` (per request) | Two imported requests match the duplicate key when they share the same `AccountNumber`, `Amount` and `TransactionDate` (BR3). The comparison set is every row of the fetched list **excluding** rows belonging to cancelled files and rejected requests. When a match is found, **both** matching requests are flagged. | On load of the full transaction list (this epic does not own live/self-refresh — see Out of Scope). |

---

## Functional Requirements

1. **R1** — The list displays every imported expense payment request together with its current status. Each request's transaction type is rendered as a plain-language label when the app has a translation for the value the service returned (e.g. "Credit — money in", "Debit — money out"); a value with no known translation is displayed exactly as the service returned it and is never treated as an error.
2. **R2** — Entering a search term narrows the list to only the requests matching that term.
3. **R3** — Applying a filter narrows the list to only the requests satisfying it, and the currently active filters remain visible.
4. **R4** — A request that matches another request on the duplicate key (BR2/BR3) is marked, and so is the request it matches, before either is decided.
5. **R5** — No control anywhere in the list or a request's detail offers a way to edit an imported request's values; every value is presented read-only.
6. **R6** — The free-text search field narrows the listed requests to those matching the entered term (character-level, as the user types or on commit — resolve exact debounce during BUILD).
7. **R7** — Filters for status and for originating file narrow the listed requests, and the active filters stay visibly indicated while applied.
8. **R8** — A request marked as a possible duplicate is visually distinguishable directly in the list, without the reader opening it, before any decision is taken on either matching request.
9. **R9** — When no file has ever been imported, the list's empty state names "expense requests" as the missing object and offers the upload action as the primary next step.
10. **R10** — When the current search and/or filters remove every request from view (but requests do exist), the state names the active narrowing and offers a clear-all action, and does not offer the creation action.
11. **R11** — No progress indicator appears for a wait under 300ms; a placeholder stands in for the pending list from 300ms to 3s; beyond 3s the placeholder is joined by a still-loading message.
12. **R12** — Pagination controls, including a page-size selector offering 5 / 10 / 20 / 50 with 20 as the default, are always visible; when the current (narrowed) set fits on one page, the controls remain visible but disabled.
13. **R13** — Every displayed column supports single-field sorting — ascending on first activation, descending on the second — with the currently active sort visibly indicated and persisted for the session.
14. **R14** — Every status value is conveyed by an intent-mapped colour paired with an icon or text label, never by colour alone — approved as success, rejected as error, imported as informational, cancelled as neutral.
15. **R15** — Every icon-only control in this screen (e.g. reveal-account-number, sort indicators, filter controls) reveals its name on hover and on keyboard focus and carries a matching accessible label; no primary destructive action is icon-only (none exist in this epic).
16. **R16** — On a narrow viewport, each request presents its primary identifier (`Reference`) plus two-to-three key values and an action overflow, with no horizontal scrolling of the page.
17. **R17** — When nothing has ever been imported, the list states that no expense requests have been imported yet and offers the upload action.
18. **R18** — When search and/or filters are narrowing an otherwise non-empty imported set, the list states that narrowing is active, shows what is currently applied, and clearing the narrowing restores the whole set.
19. **R19** — While the initial list retrieval is in flight beyond the threshold in R11, a placeholder stands in for the pending list rather than an empty screen; no user action is required.
20. **R20** — Both the Finance Uploader and the Approver can read the expense request list and open a request's detail; neither role is offered any action outside this epic's read-only scope (e.g. no decide, no edit).
21. **R21** — When an imported request is marked as a possible duplicate (during this epic's on-load computation), the Approver receives an in-app notification.

## Business Rules

1. **BR1** — Once a request is imported, none of its values may be changed; the frontend provides no operation, screen, or control that changes them (blocker).
2. **BR2** — When two imported requests match on the duplicate key (BR3), both are marked as possible duplicates before either is decided (blocker).
3. **BR3** — Two imported requests match on the duplicate key when they share the same account number, amount and transaction date. The comparison set is the rows of the file being imported plus all previously imported requests; rows belonging to cancelled files, and rejected requests, are excluded from the comparison set (blocker).

---

## Key Workflows

1. **Open the shared list.** A Finance Uploader or Approver navigates to the request list (within the app shell from `sign-in-and-app-shell`).
2. **Fetch and compute.** The frontend calls `GET /v1/transactions` once (no query parameters), receives the full set, and computes the duplicate flag for every request per BR3.
3. **Narrow.** The user types a search term and/or applies a status/originating-file filter; the visible set narrows entirely client-side and the active narrowing stays visible (R2/R3/R6/R7).
4. **Sort.** The user activates a column header; the list re-orders by that column (ascending, then descending on a second click) and the active sort persists for the rest of the session.
5. **Page.** The user pages through the narrowed, sorted set using the pagination controls and page-size selector (R12).
6. **Notice a duplicate.** The user sees a duplicate-marked request directly in the list (R8) and may open its detail to inspect the full (still read-only) values before deciding elsewhere.
7. **Notification.** If the on-load computation marks a request a possible duplicate, the Approver receives an in-app notification (R21).

---

## Feature NFRs

- **Client-side scale:** all search, filter, sort and paging happen in-browser over the full fetched set. Must stay responsive at the stated volume ceiling of 10,000 rows (`requirements-application.md` §10, §1.7 — "≤10⁴ records → in-memory index acceptable"). Render budget: p95 ≤ 400ms to render one page of the list at the 10,000-row volume; time-to-meaningful-content p95 ≤ 1.5s (§6.6.2).
- **Accessibility:** WCAG 2.2 AA (project-wide bar, superseding the WCAG 2.1 AA baseline — project.md, Baseline NFRs note) across the list, its search/filter/sort controls, and pagination, with full keyboard completability for every one of those interactions.
- **Compliance carry-forward:** account-number masking (last four digits, full value revealed only by an explicit per-row action) must hold on every render path of this list — initial load, after narrowing, after sorting, after paging.

---

## Out of Scope

- Approving or rejecting a request, and the confirmation flow around a decision — **`expense-decisions`** epic.
- Multi-select, bulk approval, and the list's self-refresh / live-update behaviour while open — **`bulk-approval-and-live-refresh`** epic.
- CSV export of the listed requests — **`csv-export`** epic.
- Editing any imported request value — excluded by design (R5, BR1); no epic delivers this.
- File upload, file processing status, and file-level actions (retry validation, cancel, download) — **`expense-file-upload`** epic.

---

## Notes & Caveats

- **All narrowing is client-side by design.** `GET /v1/transactions` accepts no query parameters — there is no server-side search, filter, sort or paging. The frontend fetches the full set once and must implement search/filter/sort/paging entirely in memory. This is an explicit architectural choice endorsed by the source requirements (§1.7, §10), not a shortcut — build for the full 10,000-row ceiling from the start rather than adding it later.
- **The duplicate flag does not exist in the API response.** It must be computed entirely client-side per BR3, including both exclusions (rows of cancelled files, and rejected requests, are excluded from the comparison set). Get the exclusions right — a naive "any two rows sharing account+amount+date" comparison over-flags.
- **Transaction-type translation has no accepted-value list in the app.** The sample data (`documentation/transactions_2026-04-15.csv`) uses single-letter codes (`C`, `D`); the API schema's own example spells `Debit` out — the two sources disagree on shape, confirming the service, not the frontend, owns the accepted set. Render known codes as plain language; render anything else verbatim and never flag it as an error. This was a user-confirmed decision at the INTAKE approval — do not reintroduce a hardcoded enum validation.
- **Possible discrepancy to verify during BUILD:** R14/UI-21 calls for a "cancelled" status colour (neutral) among the transaction status states, but the source's own `Transaction.Status` enum (`requirements-application.md` §7) lists only `Imported`, `Approved`, `Rejected` — "Cancelled" is a *file*-level state (§2.3 Expense File lifecycle), and a cancelled file's transactions "never reach the transaction list" (§2.3 key invariant). Keep the neutral/cancelled colour mapping available in the shared status-badge component (so other epics or a future status value can use it), but do not expect to see it exercised by a `Transaction.Status` value in this epic — treat its absence in test data as expected, not a bug.
- **Account-number masking is a POPIA compliance requirement, not a nicety** — see `project.md` §Compliance. It must be enforced on every value of `AccountNumber` rendered by this screen, with the reveal action scoped to one request at a time (never a "reveal all" control).
- **CORS is an open backend dependency, not a frontend defect.** The transactions-api currently returns no `Access-Control-Allow-Origin` header (project.md, NFR-base-6). Until that's resolved, `GET /v1/transactions` calls from the browser at `localhost:3000` may fail in-browser even though the smoke test (server-to-server) succeeded. Surface any such failure per the standard error-UX rule (NFR-base-5) — do not treat it as "no backend".
- **Depends on `sign-in-and-app-shell`** for the authenticated session (cookie-based, transactions-api trusts the shared `session` cookie) and the signed-in app shell this list lives inside.
