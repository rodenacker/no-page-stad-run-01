# Story 2 — The confirmation says what you are about to destroy

| Field | Value |
|---|---|
| index | 2 |
| slug | `story-2-the-confirmation-says-what-you-are-about-to-destroy` |
| route | `/upload/file` |
| targetFile | `web/src/components/files/SubmittedFileActions.tsx` |
| pageAction | `modify_existing` |
| isInfrastructureOnly | `false` |
| requirementIds | R6, R7, R8, R9, BR3, BR4, BR5 |
| roles | Importer |

**Also creates:** `web/src/lib/files/deleteConfirmation.ts` (counting + wording) and a small component wrapping `ConfirmAction` — both **shared**, because story 3 renders the same confirmation from the list.

## plainSummary

Before deleting a file whose rows have already imported, the app reads that file's expense requests and tells you how many there are and how many an Approver has already approved or rejected — so you see the real scale before you agree. A file that never imported keeps the short warning, and if the count cannot be read the app says so instead of pretending there is nothing to lose.

## Summary

Extends the confirmation with a **status-driven content decision** (BR3):

| File status | Confirmation | Transactions read? |
|---|---|---|
| `Imported` | Total requests produced, plus how many are already `Approved` / `Rejected`, and that deleting removes them **and the record of who decided them** (R6) | Yes |
| Anything else | The existing shorter message — names the file, states the file and its rows are removed and cannot be undone (R7) | **No** |
| `Imported`, count read failed | A third, **distinct** state — says the count could not be read and still warns that already-decided requests may be destroyed (R8/BR5) | Attempted, failed |

The count comes from `fetchTransactions` (`web/src/lib/api/transactions.ts`), filtered client-side on `FileLogId === file.Id` (BR4) — the endpoint accepts no query parameters, the project's established full-list-read convention.

**Build the wording and count derivation as a shared piece** (`web/src/lib/files/deleteConfirmation.ts` plus a small wrapper component). Story 3 renders exactly the same confirmation from the list and **must reuse it, not reimplement it**.

### The dangerous case (BR5) — read this twice

A failed count read must **never** fall back to the R7 wording and **never** be rendered as "zero requests". Both would describe an imported file as harmless to delete when it may hold dozens of already-approved requests. This is the one place where a partial failure could silently understate what the user is agreeing to, which is why it has its own acceptance criterion rather than a clause inside another.

Equally, an imported file that genuinely produced **no** requests must be described as none — and must never be confused with the failed-read state.

## Acceptance Criteria

| AC | Text | Coverage |
|---|---|---|
| AC-1 | Choosing Delete file on a file whose status is Imported opens a confirmation naming the file and stating how many expense requests it produced and how many of those are already approved and rejected, and that deleting removes all of them and the record of who decided them, irreversibly. | vitest |
| AC-2 | Choosing Delete file on a file in any other status opens the shorter confirmation — naming the file, stating the file and its rows are removed and cannot be undone — with no counts and no request read performed. | vitest |
| AC-3 | When the request count cannot be read for an imported file, the confirmation says so plainly and still warns that already-decided requests may be destroyed; it never shows the shorter "file and its rows" wording and never treats the failure as a count. | vitest |
| AC-4 | An imported file that genuinely has no requests is described as none, and is never confused with the case where the count could not be read. | vitest |
| AC-5 | While an imported file's requests are being counted the user is told the count is being fetched, and nothing is deleted until the confirming choice is taken. | vitest |
| AC-6 | Both confirmation shapes open with "Keep the file" holding focus, back out on Escape or Enter without deleting anything, and are completable by keyboard alone. | playwright |

## Manual Test Checklist

- Choose Delete file on an imported file → the confirmation tells you how many requests it produced and how many were already approved or rejected
- Choose Delete file on a file that never imported → you get the short warning, with no counts
- Stop the requests service (or delete an imported file while it is unreachable) → the confirmation says the count could not be read and still warns you; it never shows the short "file and its rows" wording
- Delete an imported file that produced no requests → it says there are none, not that the count could not be read
- Press Escape or Enter as soon as either confirmation opens → the file is kept and nothing is sent
- Choose Delete file on a large imported file → you are told the requests are being counted while you wait

## Reuse notes

- `fetchTransactions` (`web/src/lib/api/transactions.ts`) already exists and already takes no parameters. Use it. Do **not** add a filtered endpoint.
- Status constants `TRANSACTION_STATUS_APPROVED` / `_REJECTED` / `_IMPORTED` live in `web/src/types/transactions.ts`; `FILE_STATUS_IMPORTED` in `web/src/types/files.ts` — use the constant for the BR3 branch.
- `web/src/components/common/ConfirmAction.tsx` is the project's one confirmation primitive. Wrap it; do not replace it.
- Exactly one delete API call exists in this app, before and after this epic.
