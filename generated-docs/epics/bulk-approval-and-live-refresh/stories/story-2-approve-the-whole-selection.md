# Story 2 — Approve the whole selection at once

- **Epic:** `bulk-approval-and-live-refresh` — Bulk approval and a self-updating list
- **Slug:** `story-2-approve-the-whole-selection`
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Roles:** Approver
- **Requirement IDs:** R1, R5, R8, R9, BR1, BR2, BR3, BR4, BR5, NFR1, NFR3, NFR4
- **Infrastructure only:** no

## Plain summary

An Approver can approve everything they have selected in one action. They are asked to confirm first, and the
question always names the exact number of requests — spelled out in full, even for very large selections. On
confirming, every selected request still Imported becomes Approved, and the result says how many were approved
and how many were left alone because a colleague had already decided them.

## Summary

The bulk action itself. Follows the project confirmation convention established in `expense-decisions` (name
the affected object and count, the backing-out choice holds focus, no effect until accepted) with the literal
count per BR4 — **never** R4's `99+` form. On accept: a fresh read of transaction state (BR2) drops any
selected request no longer Imported (BR1) without ever calling approve for it, then one approve call per
remaining request (BR3) at bounded concurrency (NFR3), then a reconciliation read that computes the
approved/left-unchanged outcome by comparing before and after status (BR5) — **never** from the individual call
bodies, which cannot carry that distinction. Selection and bulk controls are unusable while the batch is in
flight; the list stays readable.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Bulk approve asks the Approver to confirm first, naming the exact number of selected requests in full even when 100 or more are selected, with the backing-out choice already selected; backing out leaves every request exactly as it was. | `vitest` |
| AC-2 | Confirming approves every selected request that is still Imported, and those requests then read Approved in the list. | `vitest` |
| AC-3 | A selected request a colleague decided since it was selected is never submitted for approval, and the result states how many were approved and how many were left unchanged because they had already been decided. | `vitest` |
| AC-4 | While the approvals are being recorded the list stays readable, the selection and bulk controls cannot be used, and the Approver can see that the action is still running. | `vitest` |
| AC-5 | In the browser, selecting several requests and confirming records every one of them and the list then shows the recorded statuses without a manual reload. | `playwright` |
| AC-6 | A large selection does not send every approval at once — approvals are sent a few at a time so the screen stays usable until the whole selection is done. | `vitest` |

## Manual test checklist

- ☐ Select 3 Imported requests and choose bulk approve → you are asked to confirm, the question names 3, and the backing-out choice is already selected
- ☐ Press Escape → nothing is approved; all 3 are still Imported and still selected
- ☐ Confirm instead → all 3 read Approved and you are told "3 approved, 0 left unchanged"
- ☐ Race check (two browsers, both signed in as an Approver): select 3 in the first, approve one of them from the second, then confirm in the first → you are told 2 approved, 1 left unchanged because it had already been decided
- ☐ While a larger selection is being approved → the list is still readable but you cannot change the selection or start a second bulk approve
- ☐ Check the confirmation and the result never show a full account number — only the last four digits

*Plus 2 technical checks verified automatically.*

## The central design constraint — do not "simplify" this

There is **no bulk endpoint**, and `TransactionApprove` returns the same generic `DefaultResponse` whether it
just approved a request or found it already decided. Every mechanic here exists because of that one fact:

- **BR2 — pre-submit re-check.** Re-read transaction state immediately before submitting and drop anything no
  longer Imported. That request is never submitted at all.
- **BR3 — one call per request**, at bounded concurrency (NFR3). Not all at once.
- **BR5 — post-batch reconciliation read.** The approved / left-unchanged counts are computed by comparing
  status **before** and **after**, never from the individual call responses. **This read is load-bearing.**

Do not trust individual call responses to tell you what happened. They cannot.

## BR4 — the count in the confirmation is always literal

R4/UI-20 truncates ambient count indicators to `99+`. UI-09 requires the confirmation to name the affected
count so the user can judge an irreversible action. BR4 resolves the tension: **truncation applies only outside
the confirmation.** The confirmation says "Approve 247 requests?", never "Approve 99+ requests?" — precisely
because the large selections are the ones where the number matters most.

## Implementation notes

### Dependency seams — `expense-decisions` is NOT merged into this tree

Everything here is a capability this story must reuse, described by **what it does**. The exact module names,
exports and signatures **must be confirmed against the merged `main` at BUILD time** — they are planned, not
observed. Adapt to what actually landed; do not add a parallel implementation.

- **The single-request approve call.** This story needs a way to approve exactly one request, stamped with the
  signed-in person's own identity (the service requires a `LastChangedUser` header, and it must never be
  client-supplied). `expense-decisions` story 1 owns this; its story file plans a server route handler plus a
  browser-side caller module beside `lib/api/transactions.ts`. **Do not** write a second approve path, **do
  not** call the `/transactions-api/*` proxy directly, and **do not** re-derive the acting identity in the
  browser.
- **The confirmation convention (UI-09).** `expense-decisions` story 2 establishes the project-wide shape: name
  the affected object and count, backing-out choice holds focus on open, no effect until accepted, built on the
  Shadcn `alert-dialog` primitive already at `web/src/components/ui/alert-dialog.tsx`. Reuse whatever
  composition landed — a second confirmation convention is exactly what this epic's brief says not to create.
- **The re-read-before-submit staleness check.** `expense-decisions` story 4 implements the same idea for one
  request. This story's BR2 is the batch form. Look for a reusable helper on merged `main` first; if story 4
  inlined it in the component, **extract it into `lib/transactions/`** as part of this story rather than
  copying the logic.
- **The per-request action surface.** `web/src/components/requests/RequestActions.tsx` **does** exist in this
  tree, and its own header comments name the overflow menu as the home for a later epic's per-request actions;
  `expense-decisions` will put Approve/Reject there. Check what landed before touching the file.

### Verified reuse — read directly from this tree

- The read is `fetchTransactions` / `transactionListFailureMessage` from `web/src/lib/api/transactions.ts`
  (takes no parameters, returns `{ Transactions: [...] }`). Both the pre-submit re-check and the reconciliation
  read use it — no new endpoint function, and no direct `fetch`.
- **NFR4 — share one fetch.** Where the pre-submit re-check and story 4's refresh poll land in the same
  interaction, they share a single read rather than firing two.
- Notifications use the root layout's existing `ToastProvider` / `useToast()`
  (`web/src/contexts/ToastContext.tsx`). Its 5s default fade suits this story's outcome confirmation.
- Masking is structural: the confirmation and the outcome report are both listings — neither may print or
  attribute-park a full account number (POPIA).
- Keep the memo discipline from story 1: a batch in flight must not re-render every row on each completed call.
