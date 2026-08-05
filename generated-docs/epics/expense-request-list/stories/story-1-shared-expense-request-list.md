# Story 1: The shared expense request list

- **Epic:** `expense-request-list` — The shared expense request list
- **Slug:** `story-1-shared-expense-request-list`
- **Requirements:** R1, R9, R11, R14, R17, R19, R20
- **Roles:** Finance Uploader (`ROLE_IMPORTER`), Approver (`ROLE_APPROVER`) — both read-only
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary

Both the Finance Uploader and the Approver open one shared screen listing every imported expense payment request with its status, account numbers showing only their last four digits. The screen says so plainly when nothing has been imported yet, and when the list cannot be fetched it explains why and offers Try again.

## Technical summary

Replaces the placeholder `notFound()` in the existing `/requests` page with the real list screen and widens `/requests` in `lib/auth/access-map.ts` to both `ROLE_IMPORTER` and `ROLE_APPROVER` (the cross-epic debt item recorded in `architecture.md`).

Adds `web/src/types/transactions.ts` (`TransactionRead` / `TransactionReadList`, status names) and `web/src/lib/api/transactions.ts` (`TRANSACTIONS_ENDPOINT`, `fetchTransactions`) reading `GET /v1/transactions` same-origin through the shared client, plus a client list component under `web/src/components/requests/` rendering:

- the table columns from the brief's Data Model,
- the status badge (intent colour + status text, never colour alone),
- the plain-language transaction-type label with verbatim fallback for any value the app has no translation for,
- last-four-digit account masking,
- the tiered loading placeholder (nothing under 300ms, skeleton 300ms–3s, still-loading message past 3s),
- the nothing-imported empty state offering the upload action,
- the failed-load state carrying the service's own wording plus retry.

Built for the full fetched set in memory (10,000-row ceiling) since the endpoint takes no query parameters.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | An Importer and an Approver each see one row per imported request carrying the values the service returned, its status as the status text paired with an intent colour (never colour alone), and its transaction type as a plain-language label when the app knows the value, exactly as returned when it does not. | vitest |
| AC-2 | Every account number shown in the list is masked to its last four digits, with no control that reveals them all at once. | vitest |
| AC-3 | A retrieval finishing under 300ms shows no progress indicator; from 300ms a placeholder stands in for the pending list; past 3s a still-loading message joins the placeholder. | vitest |
| AC-4 | When nothing has ever been imported, the screen states that no expense requests have been imported yet and offers the upload action as the next step. | vitest |
| AC-5 | A failed retrieval shows the reason the service gave (or the screen's own plain wording when it gave none) with a Try again action that re-reads the list. | playwright |
| AC-6 | An Importer following the request-list entry point from the app header lands on the list screen, not a page-not-found and not a permission message. | playwright |

## Manual test checklist

- Sign in as an Importer and click the request-list link in the header → you land on the list, not a 'page not found'
- Sign in as an Approver and open the same screen → you see the same imported requests
- Look at any row's account number → only the last four digits are shown
- Look at a row's status → you see the status word with a colour, never a colour on its own
- Look at a row's transaction type → plain wording like 'Credit — money in'; anything the app has no wording for appears exactly as the service sent it
- Stop the transactions service and reload → you get a message explaining the failure and a Try again button that re-reads the list

## Infrastructure reuse notes

- The transactions service is already reachable same-origin through the proxy at `web/src/app/transactions-api/[...path]/route.ts` — no CORS work, no new mount, no direct browser-to-service call. Read it through `get` from `web/src/lib/api/client.ts` with the `TRANSACTIONS_API_BASE_PATH` constant in `web/src/lib/utils/constants.ts`.
- Put the transaction read alongside the existing file calls: a new `web/src/lib/api/transactions.ts` mirroring `web/src/lib/api/files.ts` (endpoint constant + typed fetch + failure-message helper), and a new `web/src/types/transactions.ts` mirroring `web/src/types/files.ts`. Mock factories in `web/src/mocks/data/` must re-export those production types, per the existing convention.
- Failed-call wording: use `serviceMessageOf(e) ?? serviceDetailOf(e) ?? <own wording>` from `web/src/lib/api/errors.ts` — do not write a new error reader, and never show a client-side placeholder to the user.
- The page already exists at `web/src/app/(authenticated)/requests/page.tsx` with the `canAccess` check and `PermissionDeniedMessage` wired in — replace only its `notFound()`. The `(authenticated)` layout is the sole session gate (`requireSession`); do not re-gate.
- Widen `/requests` `allowedRoles` to `[ROLE_IMPORTER, ROLE_APPROVER]` in `web/src/lib/auth/access-map.ts` (the recorded cross-epic debt) and revise its `entryPoint` wording so it no longer promises deciding to an Importer. That single edit also makes the header navigation offer it — `HeaderNav` reads `entryPointsFor`, so no navigation work is needed.
- Role names are `Importer` / `Approver` from `web/src/types/auth.ts` (`ROLE_IMPORTER`, `ROLE_APPROVER`) — the auth service's own wire values. Never match on 'Finance Uploader'.
- The status chip pattern (badge carrying status text + an intent colour) already exists inside `web/src/components/files/SubmittedFilesList.tsx`. **Extract it to a shared component** rather than writing a third copy, and keep the neutral/cancelled intent available even though no `Transaction.Status` exercises it.
- Colour, type face and radius come only from the tokens in `web/src/app/globals.css` (`--success` / `--warning` / `--info` / `--muted`, brand tokens) — no hex literals, no Tailwind palette utilities, no font family named in a component.
- Shadcn primitives already installed in `web/src/components/ui/`: `table`, `select`, `badge`, `skeleton`, `input`, `button`, `dropdown-menu`, `card`, `alert`, `alert-dialog`, `form`, `label`. Install only what is genuinely missing with `(cd web && npx shadcn add <component> --yes)`.
- Skeleton primitive (`web/src/components/ui/skeleton.tsx`) exists for the 300ms–3s placeholder; the busy state pattern (`role="status"`) is established in `SubmittedFilesList`.
- Playwright alert/status queries must be scoped to a region (e.g. `getByRole('main').getByRole('alert')`) — Next renders a permanently empty body-level `role="alert"` route announcer.
- Do not build server-side query support: `GET /v1/transactions` accepts no parameters. All search, filter, sort and paging (stories 2–4) is in-memory over the one fetched set this story establishes.

## Notes

- This is the foundation story for the epic: stories 2–6 all modify the same page and the same list component. Establish the fetched-set-in-memory shape here so the narrowing, sorting and duplicate layers compose on top of it rather than re-fetching.
- The masking established in AC-2 is a **POPIA compliance requirement**, not a formatting nicety (`project.md` §Compliance). Story 5 adds the per-request reveal; this story must never render a full account number anywhere.
- `epicIntroducesSharedSurface` is `false` for this epic — the `(authenticated)` route group, layout, session gate and app shell are epic-1 baselines and are not re-asserted here.
