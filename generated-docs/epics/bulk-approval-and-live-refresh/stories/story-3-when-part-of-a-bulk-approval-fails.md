# Story 3 — When part of a bulk approval fails

- **Epic:** `bulk-approval-and-live-refresh` — Bulk approval and a self-updating list
- **Slug:** `story-3-when-part-of-a-bulk-approval-fails`
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Roles:** Approver
- **Requirement IDs:** R5, R10, BR11
- **Infrastructure only:** no

## Plain summary

If some approvals cannot be sent — the connection drops, or the service refuses — the result keeps the three
outcomes apart: how many were approved, how many were left alone because they had already been decided, and how
many could not be submitted. The Approver is offered a way to try again for just the ones that failed, and that
retry checks again first, so a request someone else decided in the meantime is reported as left unchanged rather
than approved a second time.

## Summary

Completes the outcome report's third bucket (R10) and its scoped recovery. A call that fails for a reason other
than the request already being decided is reported separately from the already-decided bucket, with a retry
affordance covering exactly that subset (NFR-base-5). The retry re-runs the BR1/BR2 eligibility re-check rather
than resubmitting the original Ids blindly (BR11), because time has passed.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | When some approvals could not be sent, the result names all three groups separately — approved, left unchanged because already decided, and could not be submitted — and says plainly why the last group failed. | `vitest` |
| AC-2 | The result offers a way to try again covering only the requests that could not be submitted, and the ones already approved are not touched by it. | `vitest` |
| AC-3 | Trying again checks each request's current state first, so one a colleague decided in the meantime is reported as left unchanged instead of being approved. | `vitest` |
| AC-4 | When every approval fails, nothing is reported as approved, the selection is kept, and the way to try again is still offered. | `vitest` |
| AC-5 | In the browser, a bulk approval where some approvals fail reports the failures, and trying again records those remaining requests. | `playwright` |

## Manual test checklist

- ☐ Select 4 requests, start the bulk approval, and turn off your network while it runs → the result tells you how many were approved and how many could not be submitted, in plain words
- ☐ Check the requests that were approved still read Approved, and the ones that failed are still Imported
- ☐ Turn the network back on and use the try-again action → the remaining requests are approved and the result says so
- ☐ Turn the network off before starting a bulk approval and confirm → nothing is reported as approved, and you are offered a way to try again
- ☐ Check you are never told a request was approved when its row still reads Imported

*Plus 2 technical checks verified automatically.*

## Three buckets, kept strictly apart

The outcome report has **three** distinct groups, and conflating any two of them is the bug this story exists
to prevent:

| Bucket | Meaning | Where it comes from |
|---|---|---|
| **Approved** | The status changed to Approved | The reconciliation read (BR5), by before/after comparison |
| **Left unchanged** | Already decided by someone else — never submitted | The pre-submit re-check (BR2) plus the reconciliation read |
| **Could not be submitted** | The call itself failed (network, service error) | The call's own failure, not a status comparison |

"Left unchanged" is **not** a failure — nothing went wrong, a colleague simply got there first. "Could not be
submitted" **is** a failure and is the only bucket the retry covers.

## Implementation notes

- **The retry is scoped, and it re-checks.** It covers exactly the could-not-be-submitted subset. Per BR11 it
  re-runs the BR1/BR2 eligibility re-check first rather than resubmitting the original Ids blindly — time has
  passed, so a request may have been decided in the interim, and it must then be reported as *left unchanged*,
  not approved.
- **The failed-subset report must not fade away.** `useToast` from `web/src/contexts/ToastContext.tsx` defaults
  to a 5s fade, which is right for story 2's success confirmation but **wrong here** — this report carries an
  action the Approver has to take. Use `duration: 0` so it persists until dismissed or acted on. (This is the
  documented mechanic for a message the user must act on.)
- **Never report an approval that did not happen.** Because the approved count comes from the reconciliation
  read (story 2, BR5) and not from call responses, a call that "succeeded" but whose status did not change must
  not land in the approved bucket. The final manual check exists to catch exactly that class of bug.
- Reuse story 2's batch machinery — the re-check, the bounded-concurrency runner and the reconciliation read.
  This story adds the third bucket and the scoped retry on top; it does not introduce a second batch path.
- Error wording follows the project's existing failure-message convention (surface the service's own reason
  where it gives one, otherwise the app's plain sentence) — see `transactionListFailureMessage` in
  `web/src/lib/api/transactions.ts` for the established shape.
- Keep the dependency-seam caution from story 2: the single-request approve caller is created by
  `expense-decisions` and must be confirmed against merged `main`.
