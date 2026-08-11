# Story 2: Approve an imported request

- **Epic:** `expense-decisions` — Approve or reject a request
- **Slug:** `story-2-approve-an-imported-request`
- **Requirements:** R1, R5, R6, R8, R10, R11, R14, R15, BR2, BR3, BR5, BR6, BR7, NFR2, NFR3
- **Roles:** Approver (`ROLE_APPROVER`) — decides; Finance Uploader (`ROLE_IMPORTER`) — never offered the actions
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary

An Approver can approve a request that is still awaiting a decision, from the request list or from the opened request. Approving asks you to confirm first — the message names the request by its reference and Cancel is the option already selected — and once confirmed the request reads Approved, the Approve and Reject actions disappear from it, and a short confirmation message appears and clears itself.

## Technical summary

Introduces the epic's decide surface and the **project-wide confirmation convention**. Adds per-request Approve/Reject controls (offered only when `Status === 'Imported'` and only to `ROLE_APPROVER`, hidden rather than disabled) as **direct controls on the request's own row and card** in `RequestActions`, and in `RequestDetailPanel`, plus a shared confirmation built on the Shadcn `alert-dialog` that names the request by `Reference`, holds initial focus on Cancel, and takes no effect until accepted.

Confirming calls story 1's decision endpoint, updates the request's on-screen status through the shared `StatusBadge`, withdraws the decide actions, and raises a transient toast through the root layout's existing `ToastProvider`; a failed decision leaves the request untouched behind a persistent, plainly-worded message.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | On a request still awaiting a decision, an Approver is offered Approve and Reject — whatever the amount, and even when the request is the Approver's own expense. | vitest |
| AC-2 | Neither Approve nor Reject appears anywhere for a Finance Uploader, nor on a request that has already been decided. | vitest |
| AC-3 | Choosing Approve asks the Approver to confirm, naming the request by its reference and showing no account number in full; cancelling leaves the request exactly as it was. | vitest |
| AC-4 | Confirming records the approval: the request reads Approved with its status shown as colour plus text, the decide actions are withdrawn from it, and a confirmation message is shown. | vitest |
| AC-5 | The confirmation message clears itself after a few seconds, while a message the Approver has to act on stays until it is dismissed. | playwright |
| AC-6 | When the decision cannot be recorded, the request is left as it was and the Approver is told plainly, with a way to try again. | vitest |

## Manual test checklist

- Sign in as an Approver and open Expense requests → each request that is still Imported carries Approve and Reject in its own row, reachable in one click; the `⋯` menu beside them offers only Open
- Sign in as a Finance Uploader and look at the same request → neither Approve nor Reject appears anywhere, not even greyed out
- Look at a request that is already Approved or Rejected → it offers no Approve or Reject either
- Choose Approve → you are asked to confirm, the message names the request by its reference, and Cancel is already selected
- Press Escape (or choose Cancel) → nothing changes; the request is still awaiting a decision
- Confirm the approval → the request now reads Approved, Approve and Reject are gone from it, and a short confirmation message appears and disappears on its own after a few seconds
- Check the confirmation message and the request row never show a full account number — only the last four digits

## Infrastructure reuse notes

- The decide surface **attaches to what `expense-request-list` already built — do not rebuild it**: `web/src/components/requests/ExpenseRequestList.tsx` (list, paging, narrowing, `openRequestId`), `RequestActions.tsx` (the per-request controls, shared by the table row and the phone-width card) and `RequestDetailPanel.tsx` (the opened request).
- **Approve and Reject are DIRECT controls on the request's row and card — never items in the `⋯` overflow.** The user chose this at manual test, having found the overflow made every decision cost two clicks; the actions were MOVED, so the overflow holds only Open and the same decision is never offered twice on one request. A later epic adding a per-request action must not reinstate the overflow placement for a decision. Two consequences carry with it: every decide control's accessible name names the request it acts on (`decideActionName`), because a screen now holds one Approve per listed request and a bare "Approve" would be ambiguous to a screen-reader user; and the phone-width card gives those controls a footer row of their own rather than its action corner, so four controls at 360px neither crowd the reference nor push the page sideways.
- The confirmation uses the Shadcn `alert-dialog` primitive already present at `web/src/components/ui/alert-dialog.tsx` — its overlay is already tokenised; do not regenerate it.
- **A working example of this exact convention already shipped**: `web/src/components/files/SubmittedFileActions.tsx` (the cancel-file confirmation from `file-validation-and-retry`, which the brief required to follow R10/BR6). Read it first and match its shape — naming the object, Cancel holding focus, no effect until accepted. If the shared confirmation extracted here can absorb it, prefer extracting one component over leaving two near-identical dialogs; `web/src/components/session/SessionTimeoutWarning.tsx` is a third `AlertDialog` consumer but is a different pattern (a timed warning, not an action confirmation) — leave it alone.
- Status display goes through `web/src/components/status/StatusBadge.tsx` with the list's own `STATUS_PRESENTATION` map (Imported = informational, Approved = positive, Rejected = negative) — never a new badge, never a colour value in a component.
- Notifications use the existing root-layout `ToastProvider` / `ToastContainer` and `useToast()` from `web/src/contexts/ToastContext.tsx`; its default 5s auto-dismiss already sits inside R11's 4–8s window, so no new timer mechanism is needed. **For a message the user must acknowledge, pass `duration: 0`** — `file-validation-and-retry` added exactly this to `ToastOptions` (`web/src/types/toast.ts`: "`0` means it never fades on its own, which is how a notification the user must act on stays until they act on it or dismiss it"). Use it; do not build a second notification surface. A destination the notification offers must use `link: { href, label }` (a real anchor), never `onClick` — same source, keyboard-reachability.
- Role checks use `ROLE_APPROVER` / `ROLE_IMPORTER` from `web/src/types/auth.ts` with `hasRole` / `rolesOf` from `web/src/lib/auth/roles.ts`; `requests/page.tsx` already passes `rolesOf(session)` into `ExpenseRequestList`, so no new plumbing is needed to know who is signed in on the client.
- Do **not** add an entry or a gate in `web/src/lib/auth/access-map.ts` — `/requests` is already registered for both roles; per the project convention, what only one role may *do* is checked on the control inside the screen, hidden rather than disabled.
- Account-number masking already exists (`MaskedAccountNumber.tsx` plus the detail panel's one-request-at-a-time reveal). Nothing here may widen it, and the confirmation must not print a full account number.
- Decide calls go through story 1's `web/src/lib/api/decisions.ts` — never `fetch` from a component, and never the `/transactions-api/*` proxy directly.

## Notes

- **This story's confirmation pattern is the project-wide convention** (brief §Notes & Caveats). `bulk-approval-and-live-refresh` (bulk approve) and `file-validation-and-retry` (cancel file) must each implement their own action's confirmation to the same rule — name the affected object and count, Cancel holds focus, the action does not take effect until accepted — rather than re-deriving it.
- **NFR2 overrides the project's usual focus rule for this dialog only**: Cancel holds initial focus, not the first editable field (UI-12 from `sign-in-and-app-shell`).
- **No amount threshold anywhere** (R8/BR5) — do not invent a "large amount" confirmation variant or a second-approval step.
- **No self-approval guard** (R5/BR2) — an Approver deciding their own expense is expected behaviour, deliberately allowed. **AC-1's "even when the request is the Approver's own expense" is not directly fixturable**: `TransactionRead` carries no owner/employee/subject field (confirmed against `documentation/transactions-api.yaml` and the brief's Data Model), so there is nothing to mark a request as "mine". Do **not** invent an owner field, and do not add a self-approval check to have something to test. The testable content of R5 is exactly: approve is offered on *any* `Imported` request, with no ownership condition anywhere in the code path.
- Playwright alert/status queries must be scoped to a region (e.g. `getByRole('main').getByRole('alert')`) — Next renders a permanently empty body-level `role="alert"` route announcer.
