# Story 5 — When the list cannot refresh itself

- **Epic:** `bulk-approval-and-live-refresh` — Bulk approval and a self-updating list
- **Slug:** `story-5-when-the-list-cannot-refresh`
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Roles:** Approver, Finance Uploader
- **Requirement IDs:** R6, BR9
- **Infrastructure only:** no

## Plain summary

If the list can no longer refresh itself, it says so plainly and shows the time it was last up to date, instead
of quietly pretending to be current. The requests already on screen stay there. One brief hiccup is not enough
to raise the notice, and as soon as a refresh works again the notice clears and refreshing carries on by itself
— the reader never has to do anything.

## Summary

R6's stale-list state. Two consecutive failed polls (BR9) put the list into a plainly worded "cannot refresh"
state carrying the timestamp of the last poll that succeeded; the rows already loaded are never blanked or
hidden. One failed poll changes nothing on screen. Recovery is automatic on the next successful poll with no
user action, per the project convention that a failed re-read leaves the last known values in place and the
failed-load state is reserved for a read that left the user with nothing.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | After two refreshes in a row have failed, the list states plainly that it can no longer refresh itself and shows the time it was last up to date. | `vitest` |
| AC-2 | A single failed refresh raises nothing — the rows and the reader's place are left exactly as they were. | `vitest` |
| AC-3 | The requests already on screen stay visible and readable the whole time that notice is showing; the list is never blanked or replaced by an error. | `vitest` |
| AC-4 | In the browser, once a refresh succeeds again the notice clears by itself and the list carries on refreshing, with no action from the reader. | `playwright` |
| AC-5 | The time shown as "last up to date" is when the last successful refresh happened, not when the failure did. | `vitest` |

## Manual test checklist

- ☐ With Expense requests open, turn off your network and wait about half a minute → the list tells you it can no longer refresh itself and shows when it was last up to date
- ☐ Check the requests are all still listed and readable while that notice is showing
- ☐ Check the time shown is when the list was last current, not the current time
- ☐ Turn the network back on and wait → the notice disappears on its own and you did not have to press anything
- ☐ Check you are never asked to reload the page yourself to recover

*Plus 1 technical check verified automatically.*

## Why this is its own story rather than part of story 4

R6's stale-list state has its own surface, its own two-strikes rule (BR9), and its own recovery path. Folding it
into story 4 would have pushed that story past six acceptance criteria, which is the signal to split.

## Implementation notes

- **Two strikes, not one (BR9).** One failed poll changes nothing on screen — transient failures are normal and
  a notice on every hiccup would be noise. The state is entered only after **two consecutive** failures, and is
  left on the **next** success.
- **Never blank the list.** This follows the existing project convention directly: a failed re-read leaves the
  last known values in place, and the failed-load state is reserved for a read that left the user with
  *nothing*. Here the user has rows, so they keep them. See `SubmittedFilesList.tsx` /
  `SubmittedFileDetail.tsx` for the established behaviour.
- **The timestamp is of the last SUCCESS.** Record it when a poll succeeds, not when one fails — AC-5 exists
  because "last updated: now" on a failure is the easy, wrong implementation and it actively misleads.
- **Recovery is automatic and silent.** No reload prompt, no retry button, no user action of any kind — the next
  successful poll clears the notice. The final manual check guards this.
- Wording is plain and states the situation, not a technical cause. Follow the project's failure-message
  convention (see `transactionListFailureMessage` in `web/src/lib/api/transactions.ts`).
- The notice is announced politely and never steals focus (inherits story 4's NFR2 handling).
- **Timing tests:** AC-4 is `playwright` using the proven `page.clock.install()` / `fastForward()` pattern with
  the mocked response failing then recovering between ticks. Everything else is `vitest` with fake timers
  against the app's real 15s constant. No real waits, no shortened test-only interval.
- Playwright role queries for this notice must be **scoped to a region** — Next's body-level empty
  `role="alert"` route announcer otherwise makes an unscoped query match two elements.
