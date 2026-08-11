# Story 4: A decided request, and only one decision each

- **Epic:** `expense-decisions` — Approve or reject a request
- **Slug:** `story-4-one-decision-per-request`
- **Requirements:** R3, R4, R6, R12, R13, R16, BR1, BR3, NFR3, NFR4
- **Roles:** Approver (`ROLE_APPROVER`), Finance Uploader (`ROLE_IMPORTER`) — the audit view is visible to both
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary

A request that has already been decided says where it stands instead of offering Approve or Reject, and shows who decided it, when, and the note if it was rejected — to Approvers and Finance Uploaders alike. If someone else decided the request while you had it on screen, confirming your own decision is refused with "This request has already been decided.", that message stays until you dismiss it, and the list is brought up to date so you can see what was actually recorded.

## Technical summary

Closes the epic's one-decision-per-request guarantee. A decided request renders a state message in place of the decide actions and surfaces `Status`, `UserNote`, `LastChangedUser` and `LastChangedDate` to both roles (largely already carried by the existing `RequestDetailPanel`).

Implements **BR1's re-read-before-submit**: because both decide operations return the same `DefaultResponse` on success and failure, and the contract offers no single-request GET, the confirmed decision re-reads `GET /v1/transactions` immediately before submitting and, if the request is no longer `Imported`, refuses locally with the already-decided wording **without issuing the decide call**, keeps that message until dismissed, and refreshes the list to the recorded state.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | A request that has already been approved or rejected offers no decide actions and states where it stands instead, with its status carried by colour paired with text. | vitest |
| AC-2 | On a decided request, who decided it, when, and the note where there is one, are visible to a Finance Uploader as well as an Approver. | vitest |
| AC-3 | If the request has been decided by someone else since the screen was loaded, confirming a decision is refused with "This request has already been decided." and no decision is recorded. | vitest |
| AC-4 | That refusal stays on screen until it is dismissed, and the list is brought up to date so the request shows the decision that was actually recorded. | vitest |
| AC-5 | In the browser, a decision confirmed on a request another Approver decided first is refused, and the request then shows that other person's decision. | playwright |

## Manual test checklist

- Open a request that is already Approved → it says where it stands and offers no Approve or Reject
- Open a request that is already Rejected → it shows the rejection note, who decided it and when
- Sign in as a Finance Uploader and open the same decided request → you can see the status, the note, who decided it and when, but no decide actions
- Race check (two people or two browsers): sign in as an Approver in each, open the same imported request in both, approve it in the first → then confirm a decision in the second
- The second one is refused with "This request has already been decided." — not a silent second decision and not an unfamiliar error
- That refusal stays on screen until you dismiss it, and the request then shows the decision the first person recorded

## Infrastructure reuse notes

- `RequestDetailPanel.tsx` already renders `Status`, the rejection note, `LastChangedUser` and `LastChangedDate` — **R16 is mostly satisfied by existing code**; this story verifies and completes it rather than adding a second audit surface.
- BR1's re-read has to use `GET /v1/transactions` (via `fetchTransactions` in `web/src/lib/api/transactions.ts`) filtered by `Id`: the contract defines no single-request read and the list call takes no parameters.
- Status display goes through `web/src/components/status/StatusBadge.tsx` with the list's `STATUS_PRESENTATION` map — never a new badge, never a colour value in a component.
- The already-decided refusal is a message the user **must acknowledge** — it must persist until dismissed, so it must **not** use the auto-dismissing toast from `ToastContext.tsx` (R11's second half).
- Reuse story 2's decide plumbing and confirmation; the re-read slots in between "confirmation accepted" and "call the decision endpoint", not as a separate user step.

## Notes

- **The already-decided response is genuinely ambiguous at the transport level** (brief BR1 / §Notes & Caveats). `TransactionApprove` and `TransactionReject` both return `DefaultResponse { Id, MessageType, Messages[] }` regardless of outcome. Do not assume a distinguishing `MessageType` or HTTP status. The re-read-before-submit is the intended approach, not a placeholder. If during BUILD the response does turn out to carry a reliably distinguishable value, that may **supplement** the re-read, never replace it.
- **NFR4 — the race is a manual-test focus item.** The genuine two-session timing race cannot be fully exercised deterministically; AC-3/AC-4 cover the re-read logic with a controlled stale-state fixture, AC-5 covers the browser path, and the manual checklist covers the real race with two sessions.
- Decide actions are rendered/enabled **only** when `Status === 'Imported'` (BR3); for any other status they are not offered at all, and R12's state message is shown instead.
- The audit fields stay visible for as long as the originating file is retained (R16) — nothing here should hide or expire them.
