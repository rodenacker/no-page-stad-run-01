# Story 1: Record a decision as the person who made it

- **Epic:** `expense-decisions` — Approve or reject a request
- **Slug:** `story-1-record-a-decision-with-who-made-it`
- **Requirements:** R1, R2, R14, BR7
- **Roles:** Approver (`ROLE_APPROVER`) — the only role permitted to decide; Finance Uploader (`ROLE_IMPORTER`) — refused
- **Route:** `null` (no screen — a server route handler plus its browser-side caller)
- **Target file:** `web/src/app/api/decisions/route.ts`
- **Page action:** `create_new`
- **Infrastructure only:** yes — verified by story 2

## Plain summary

Under the hood, the app gains a safe way to send an approval or a rejection to the service — one that stamps the decision with the name of the person actually signed in, so nobody can record a decision under someone else's name, and only an Approver can send one at all.

## Technical summary

Adds a server-side decision endpoint (`web/src/app/api/decisions/route.ts`) that resolves the signed-in identity from the session cookie via `GET /v1/auth/userinfo`, enforces the Approver role, and forwards to `POST /v1/transactions/approve` or `POST /v1/transactions/reject` with `TransactionId` as a query param, the resolved display name in the required `LastChangedUser` header, and `{ UserNote }` as the reject body.

Adds the browser-side companion `web/src/lib/api/decisions.ts` built on the shared API client, and closes the bypass in the existing `/transactions-api/*` proxy, which currently forwards a caller-supplied `LastChangedUser` header verbatim.

Returns a plain, screen-consumable outcome for success, refusal and unreachable-service without leaking service addresses or stack traces.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | An approval is sent for the named request with the signed-in person's own name as who changed it, taken from the session rather than from anything the caller supplied. | vitest |
| AC-2 | A rejection is sent for the named request with the supplied note, stamped with the same signed-in name. | vitest |
| AC-3 | A caller who is not an Approver is refused and nothing at all is sent to the transactions service. | vitest |
| AC-4 | A caller with no valid session is refused and nothing is sent to the transactions service. | vitest |
| AC-5 | A decide call aimed straight at the forwarding address, or carrying a name of the caller's own choosing, cannot record a decision under a name other than the signed-in one. | vitest |
| AC-6 | When the service refuses the decision or cannot be reached, the caller receives a plain outcome it can act on, carrying nothing internal. | vitest |

## Manual test checklist

*(none — infrastructure only; story 2's manual tests exercise this end to end)*

## Infrastructure reuse notes

- **Why a separate route handler and not the existing proxy:** `/transactions-api/*` (`web/src/app/transactions-api/[...path]/route.ts` via `lib/api/serviceProxy.ts`) adds nothing of its own and forwards caller headers verbatim, so it cannot satisfy the brief's server-populated `LastChangedUser`. Hence this separate `app/api/decisions/route.ts` mount — and hence AC-5, which closes the header bypass on the proxy path.
- Server-side identity comes from `web/src/lib/auth/requireSession.ts` / `authApi.ts` (`fetchUserInfo`) with `displayNameOf` from `lib/auth/identity.ts` — the same composition the header already shows, so one person is never written two ways.
- Role checks use `ROLE_APPROVER` / `ROLE_IMPORTER` from `web/src/types/auth.ts` with `hasRole` / `rolesOf` from `web/src/lib/auth/roles.ts`.
- Browser calls go through `web/src/lib/api/client.ts` (`post`) at the app's own address; add `web/src/lib/api/decisions.ts` beside `transactions.ts` / `files.ts` rather than calling `fetch` from a component, and reuse `serviceMessageOf` / `serviceDetailOf` from `lib/api/errors.ts` for failure wording.
- Do **not** add an entry or a gate in `web/src/lib/auth/access-map.ts` — `/requests` is already registered for both roles; what only one role may *do* is checked on the control inside the screen and on this route.
- Test factories: extend `web/src/mocks/data/transaction.ts` (which re-exports the production types and status constants) rather than declaring decision fixtures; `web/src/mocks/data/identity.ts` supplies role-bearing sessions.

## Notes

- Both decide operations take **exactly one `TransactionId` per call** — there is no bulk/batch decide endpoint. `bulk-approval-and-live-refresh` will call this route once per selected request, so keep its contract single-request and composable.
- `LastChangedUser` is a **required header** on both upstream calls. It must never be client-trusted (brief §Notes & Caveats).
- Both decide operations return the same `DefaultResponse { Id, MessageType, Messages[] }` shape on success and failure — this route must not pretend to distinguish "already decided" from another failure. That distinction is story 4's re-read-before-submit (BR1).
- CORS is an open backend dependency on the transactions-api (`project.md` NFR-base-6); routing the decide calls server-side through this handler sidesteps it for these two operations.
