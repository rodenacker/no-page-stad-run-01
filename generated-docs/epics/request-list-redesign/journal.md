# Journal — epic `request-list-redesign`

Build notes worth keeping: the reasoning behind choices that aren't obvious from
the code, and the trade-offs taken along the way. One section per story.

## Story 2: The batch's outstanding count, at a glance

- The outstanding count had to be two things at once for a screen reader: one named field like the other five figures, and a live region that speaks up when the number moves on its own (a colleague's decision arriving on a refresh). One element cannot be both, and naming two elements "Awaiting decision" would leave neither addressable — so the pair is a fieldset named by its own visible legend, holding the count in the live region. That is now written down as a project convention, because every later figure of this kind will hit the same wall.
- Two existing tests said "nothing on this screen is announcing anything once the list has loaded". That was true before this band existed; the outstanding count is now a permanent announcement region on purpose. Both were changed to say "nothing on the screen says loading" instead — the same fact about the waiting state, at the same strength, without asserting that a figure this epic requires is absent. No behavioural assertion was dropped, and both files pass.
- Every figure in the band is derived in the browser from the requests the list already holds, and handed the very same arrays the rows are drawn from, so the band can never describe a set the listing below it is not showing. No new call, no new field, no query parameter.
