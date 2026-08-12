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

## Story 3 — When part of a bulk approval fails

- The app's notification surface could show you something to *go to* (a link) but had nothing you could actually *press*. The "try again" this story needs is a thing to do, not a place to go, so notifications can now carry a real button. It is a proper button rather than a clickable message, because a clickable message cannot be reached by keyboard at all — which this project's accessibility bar does not allow.
- The try-again control says what it covers — "Try again for the 2 that could not be submitted" — rather than a bare "Try again". Two reasons: it is honest that only the failures are retried and the ones already approved are left alone, and the request list already has a plain "Try again" for when the whole list fails to load, which two identically-worded recovery buttons on one screen would be confused with.
- Trying again does not ask you to confirm a second time. You confirmed this bulk approval when you started it, and choosing a named, smaller group is itself the deliberate act. It does re-check every request first, so if a colleague decided one in the meantime it is reported as left unchanged instead of being approved twice.

## Story 4 — The list keeps itself current

- The expense request list now refreshes itself every 15 seconds while it is open, so a decision a colleague records turns up without anyone reloading. It stops asking while the tab is in the background and picks up the moment you come back to it, and it holds off entirely while you are part-way through approving a selection.
- A refresh brings the rows up to date underneath you: nothing you have open closes, your search, filters, sort and page are left alone, and the keyboard stays where it was. If a request you had selected has just been decided by someone else, it quietly leaves your selection and the count goes down — no interruption, nothing to dismiss.
- The one thing added for screen-reader users is an invisible line that says how much has changed; sighted readers simply see the rows move.

## Story 5 — When the list cannot refresh

- The expense request list now admits when it has stopped keeping itself up to date. If two refreshes in a row fail it shows a quiet notice saying so, along with the time it was last actually current — the time of the last refresh that worked, never the moment one failed. One failed refresh on its own changes nothing on screen, because brief network hiccups are normal and a warning on each would just be noise. The requests already listed stay exactly where they are the whole time, and nothing is asked of the reader: as soon as a refresh works again the notice disappears on its own, with no reload and no button to press.

### A note on the build

Story 5's first build run was cut short partway through by a spend limit on the account. Nothing was lost — the work in progress was picked up from where it stopped and finished normally.

## Manual test — change requested

- The ⋯ menu on each row of the Expense requests table is gone. It only offered "Open", which is already a button on the row, so it was a second way to reach something you could already click. Approve, Reject and Open now sit directly on every row and on every card at phone width — nothing you could do before has been lost.
- The earlier list epic asked for an action overflow on each request at phone width. Removing the menu goes against the letter of that, though not its point: the actions are still reachable at every width, now directly. Recorded as a deliberate supersede so nobody restores the menu later thinking it went missing by accident.
