# Story 2 — See which rows were rejected and why

- **Slug:** `story-2-see-which-rows-were-rejected`
- **Epic:** `file-validation-and-retry` — Rejected rows, retry and cancel
- **Requirement IDs:** FR1, FR2, FR3
- **Roles:** Finance Uploader, Approver
- **Route:** `/upload/file`
- **Target file:** `web/src/app/(authenticated)/upload/file/page.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary (user-facing)

On a file whose status is "Validation failed", the file's page lists every row that was rejected, with the values recorded for that row and what is wrong with it. For the four checks this app owns — a missing reference, an amount that is not a number, an unreadable transaction date, an unsupported currency — it shows this app's own fixed wording. For a row the transactions service rejected over its transaction type, it shows the service's own reason for that row, word for word.

## Technical summary

Adds the rejected-rows section to the submitted-file page created in story 1, reading `GET /transactions-api/v1/files/validation-errors?FileLogId=<id>` (`ValidationErrors.JsonArray` — a JSON array delivered as a string, so it must be parsed, and a body that will not parse is a handled failure, never a crash).

Per-row values are the Transaction-shaped fields in the brief's Data Model. The defect is rendered from a fixed field→message map for the four app-owned rules (FR2) and verbatim from the service for a transaction-type defect (FR3). **No app-side transaction-type enum is written anywhere** — that is a standing project decision, not a shortcut to revisit.

`GET /v1/files/validation-errors/columns?FileLogId=<id>` may be used to label columns if the live response warrants it.

Account numbers are masked to their last four digits per `project.md` §Compliance, revealed only by an explicit action on a single row.

**Spec gap — halt rather than guess.** The brief flags the wire shape of one array element as genuinely undocumented (the spec's only example is from an unrelated zoo/animal domain). Treat the brief's Data Model field set as the intended shape, but where the live shape cannot carry FR2/FR3's field-level messages, halt and flag rather than guessing. See the epic's `unverifiedAssumptions` in `state.json`.

### Fixed message text (FR2) — exact strings

| Field defect | Message |
|---|---|
| `Reference` missing | `This request has no reference and cannot be imported.` |
| `Amount` not numeric | `Amount must be a number, for example 1245.67.` |
| `TransactionDate` unreadable | `Transaction date must be a valid date and time.` |
| `Currency` not a supported code | `Currency must be a supported currency code.` |
| `TransactionType` | *(the service's own reason for that row, verbatim — FR3)* |

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | On a file whose validation failed, every rejected row is listed with the values recorded for that row — its reference, transaction date, account number, description, amount, transaction type and currency. | `vitest` |
| AC-2 | A row rejected for a missing reference, an amount that is not a number, an unreadable transaction date or an unsupported currency code shows this app's fixed wording for that field, exactly as the brief states it. | `vitest` |
| AC-3 | A row the transactions service rejected over its transaction type shows the service's own reason for that row word for word; the app never judges a transaction type itself and offers no list of accepted types anywhere. | `vitest` |
| AC-4 | A file that has not failed validation shows no rejected-rows list at all, and a failed file whose rejected rows cannot be read as rows says so plainly instead of drawing an empty table. | `vitest` |
| AC-5 | While the rejected rows are being read the wait is announced, and a failed read shows the service's own wording with one action that asks for them again — the rest of the file's page stays usable either way. | `vitest` |
| AC-6 | An account number on a rejected row shows only its last four digits until the user takes an explicit action on that one row to reveal the rest. | `vitest` |

## Manual test checklist

- ☐ Open a file whose status is 'Validation failed' → you see a list of every row that was rejected, showing the values from your file
- ☐ Find a row that has no reference → it says "This request has no reference and cannot be imported."
- ☐ Find a row whose amount is not a number → it says "Amount must be a number, for example 1245.67."
- ☐ Find a row rejected over its transaction type → it shows the reason the transactions service gave for that row, not wording the app invented
- ☐ Look at any rejected row's account number → only the last four digits show, until you choose to reveal the rest on that row
- ☐ Open a file that imported successfully → its page shows no rejected-rows list

Plus 2 technical checks verified automatically.

## Infrastructure & reuse notes

The epic-wide list lives in `story-1-open-a-submitted-file.md` — read it. The ones that bite hardest here:

- Every backend call goes through `web/src/lib/api/client.ts` at the app's OWN same-origin address (`/transactions-api/...`). New file endpoints belong in `web/src/lib/api/files.ts`.
- `GET /v1/files/validation-errors` returns `{ ValidationErrors: { JsonArray: "<json string>" } }` — a JSON array delivered AS A STRING. Parse it; an unparseable body is a handled failure state (AC-4), never a crash.
- A failed call's user-facing wording is `serviceMessageOf(e) ?? serviceDetailOf(e) ?? <own wording>` from `web/src/lib/api/errors.ts` — the service reports refusals as a 500 with `Messages[]`, which lands on `details`.
- Mock factories go in `web/src/mocks/data/`; `fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED)` already gives a coherent failed file. Both test layers import the same factory — never author response bodies inline.
- No component may name a colour; all tokens live in `web/src/app/globals.css`.
