# Journal — Bulk approval and a self-updating list

## Before building

The plan for this epic was parked while `expense-decisions` was still being built, so four things it planned to reuse were checked against the merged `main` before any code was written. The approve call and the confirmation are exactly as the plan assumed. Two differ: the "has anyone else decided this in the meantime?" check was written inside the request list rather than as a piece on its own (story 2 pulls it out), and Approve and Reject ended up as direct buttons on each row rather than inside the ⋯ menu, following your decision at the last manual test.

## Story 1 — Select requests to approve together

- Ticking requests to approve together is now on the expense request list. Only an Approver sees any of it — a Finance Uploader gets no ticks, no "select all" and no count at all, not even greyed out — and only requests still waiting on a decision can be ticked.
- What is ticked follows the request rather than its place in the list, so searching, filtering, re-ordering or turning the page never loses a tick or changes the count. That was the design decision confirmed at the stories approval, and it means the Approver may end up approving requests that are not on the screen in front of them.
- The count beside the ticks shows the exact number up to 99 and then reads "99+". It disappears entirely when nothing is selected rather than sitting there saying zero.

## Story 2 — Approve the whole selection

- When a bulk approval finishes, any request it approved — and any a colleague had decided first — drops out of the selection, so the count corrects itself instead of still claiming three requests are selected when none of them can be acted on any more. Requests still awaiting a decision keep their tick.
- The result already names a third group — requests whose approval could not be sent at all because the service refused the call — rather than quietly leaving them out of a message that says everything went through. The way to retry just those is the next story's; this story only makes sure the report is never a false success.
