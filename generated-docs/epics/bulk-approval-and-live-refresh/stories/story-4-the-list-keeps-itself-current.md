# Story 4 — The list keeps itself current

- **Epic:** `bulk-approval-and-live-refresh` — Bulk approval and a self-updating list
- **Slug:** `story-4-the-list-keeps-itself-current`
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Roles:** Approver, Finance Uploader
- **Requirement IDs:** R3, BR6, BR7, BR8, NFR2, NFR4, NFR5
- **Infrastructure only:** no

## Plain summary

The Expense requests list refreshes itself roughly every 15 seconds while it is open, so a decision a colleague
records shows up without anyone reloading the page. It updates quietly underneath you: nothing you have open
closes, your place on the page and what you were typing in are left alone, and if a refresh reveals that one of
your selected requests has just been decided by someone else, it simply drops out of your selection and the
count goes down. Nothing refreshes while the tab is in the background or while you are part-way through
approving.

## Summary

The self-refresh half of the epic. Polls `GET /v1/transactions` on a fixed 15s interval while the list is
mounted and its tab is visible (BR6), pausing while a bulk-approve confirmation is open or a batch is in flight
and resuming the moment that action finishes (BR7). A refresh replaces the underlying data in place without
collapsing an open dialog, moving focus or resetting narrowing/ordering/page (BR8), announces itself through a
polite live region only (NFR2), and silently prunes from the selection any request no longer Imported so the
visible count corrects itself (BR8's exception). Shares one fetch with the pre-submit re-check where they land
in the same interaction (NFR4).

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | With the list open, a decision recorded elsewhere appears on the list on its own within about 15 seconds, with no reload and no action from the reader. | `playwright` |
| AC-2 | A refresh that brings in changed data leaves an open confirmation open, leaves keyboard focus where it was, and leaves the search, filters, sort order and page being read untouched. | `vitest` |
| AC-3 | Nothing refreshes while the tab is in the background, and a refresh happens straight away when the reader comes back to it. | `vitest` |
| AC-4 | No refresh lands while a bulk-approve confirmation is open or approvals are being recorded; refreshing resumes as soon as that action finishes, whatever its outcome. | `vitest` |
| AC-5 | When a refresh reveals that a selected request has been decided by someone else, it drops out of the selection and the visible count decreases to match, with no separate interruption. | `vitest` |
| AC-6 | A refresh is announced quietly and never interrupts the reader — it does not steal keyboard focus and does not raise anything that has to be dismissed. | `vitest` |

## Manual test checklist

- ☐ Two browsers, both on Expense requests: approve a request in the first → within about 15 seconds the second shows it as Approved without you touching anything
- ☐ While the second browser is mid-way through a bulk-approve confirmation, approve one of its selected requests from the first → the confirmation is not closed under you
- ☐ Select several requests and leave the list open while a colleague decides one of them → your count quietly drops by one and that request is no longer selected
- ☐ Type a search term, sort by a column, go to page 2, then wait for a refresh → your term, your sort and your page are all still where you left them
- ☐ Switch to another browser tab for a minute and come back → the list is up to date shortly after you return
- ☐ Watch a refresh happen while your cursor is in the search box → your typing is not interrupted and focus stays in the box

*Plus 2 technical checks verified automatically.*

## Why this story comes AFTER bulk approval, not before

BR7 (pause while confirming or mid-batch) and BR8's selection-pruning exception can only be wired once the
selection (story 1) and the batch (story 2) exist. Building refresh first would mean stubbing both and coming
back to it.

## A deliberate extension to a documented convention — record it at epic end

`generated-docs/architecture.md` § Conventions currently states that a self-updating view *"re-reads its OWN
call on an interval, only while something it shows is still in progress, and stops once nothing is."* That is
what `SubmittedFilesList.tsx` and `SubmittedFileDetail.tsx` do.

**R3/BR6 needs the opposite:** refresh runs the whole time the list is open, gated on tab visibility and paused
around the user's own action. Nothing here is ever "in progress" in the file-processing sense — the thing being
watched is *other people's decisions*, which never finish.

This is an **extension** of the convention, not a violation. It must be recorded in `architecture.md` at epic
end so a later epic does not "fix" it back to the stop-when-idle form.

## Implementation notes

- **Reuse the refresh discipline, not the stop condition.** `SubmittedFilesList.tsx` and
  `SubmittedFileDetail.tsx` both run a 15s self-refresh and are the precedent for: one interval at most, cleared
  on unmount, and **a failed re-read leaves the last known values on screen** (the failed-load state is only for
  a read that left the user with nothing). Follow all of that. Only the stop condition differs.
- The read is `fetchTransactions` from `web/src/lib/api/transactions.ts`. No new endpoint function, no direct
  `fetch`. **NFR4:** where the poll and story 2's pre-submit re-check land in the same interaction, share one
  fetch rather than firing two.
- **The visibility gate uses `useSyncExternalStore`, not an effect.** Anything already known to the browser
  before React runs (a media query, storage, `document.visibilityState`) is watched with `useSyncExternalStore`
  — the `react-hooks` lint rule rejects setting state in an effect. Copy the two existing patterns:
  `web/src/lib/layout/viewport.ts` and `web/src/lib/theme/theme.ts`.
- **BR8 — update in place.** A refresh replaces the underlying data without collapsing an open dialog, moving
  focus, or resetting narrowing/ordering/page. The one deliberate exception is the selection prune: a request no
  longer Imported drops out of the selection and the count corrects itself, with **no** separate interruption.
- **NFR2 — announce politely only.** A polite live region. Never steal focus, never raise anything that must be
  dismissed.
- **DETERMINISTIC TIMING TESTS — the pattern is proven in this repo; use it and do not invent another.** Four
  existing Playwright specs drive the app's real interval with `page.clock.install()` before navigating, then
  `page.clock.fastForward(...)`, changing the mocked response between ticks — see
  `epic-expense-file-upload-story-3-watch-a-file-finish-importing.spec.ts` and
  `epic-file-validation-and-retry-story-4-retry-validation-or-cancel-the-file.spec.ts`. **No real waiting, no
  arbitrary timeouts, and no shortened interval injected for tests.** In Vitest, use fake timers against the
  app's real 15s constant, for the same reason.
- Only AC-1 is `playwright` here — a genuine browser round-trip jsdom cannot prove. The pause, the visibility
  gate, the selection pruning and the in-place update are all `vitest`, where the clock is fully controlled.
  That split is what keeps this story's tests from being flaky.
- Playwright role queries for a status must be **scoped to a region** — Next renders a permanently empty
  body-level `role="alert"` route announcer, so an unscoped query always matches two elements.
- Keep story 1's memo discipline: a 15s refresh that re-renders every row is the performance failure mode here.
