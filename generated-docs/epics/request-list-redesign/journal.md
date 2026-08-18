# Journal — epic `request-list-redesign`

Build notes worth keeping: the reasoning behind choices that aren't obvious from
the code, and the trade-offs taken along the way. One section per story.

## Story 2: The batch's outstanding count, at a glance

- The outstanding count had to be two things at once for a screen reader: one named field like the other five figures, and a live region that speaks up when the number moves on its own (a colleague's decision arriving on a refresh). One element cannot be both, and naming two elements "Awaiting decision" would leave neither addressable — so the pair is a fieldset named by its own visible legend, holding the count in the live region. That is now written down as a project convention, because every later figure of this kind will hit the same wall.
- Two existing tests said "nothing on this screen is announcing anything once the list has loaded". That was true before this band existed; the outstanding count is now a permanent announcement region on purpose. Both were changed to say "nothing on the screen says loading" instead — the same fact about the waiting state, at the same strength, without asserting that a figure this epic requires is absent. No behavioural assertion was dropped, and both files pass.
- Every figure in the band is derived in the browser from the requests the list already holds, and handed the very same arrays the rows are drawn from, so the band can never describe a set the listing below it is not showing. No new call, no new field, no query parameter.

## Story 3: One ruled strip of fields to narrow by

- The search box and filters are now one ruled strip of underlined fields with small capitalised labels instead of a row of boxes. Every field, every wording and everything they do is exactly as it was — only how they look changed.
- The "wrong way round" message no longer sits in a bordered warning box. It now appears inside the strip itself, and the two fields of the range it is about get a heavier red underline, so the message and the fields it is about are read together. It still never applies the range, and the list still stays exactly as it was.
- Export and Clear all were re-seated as ruled text controls on the strip so they read as part of the same document. Approve selected kept its solid button, because it is the one control on that line that commits something that cannot be undone.
- The small tracked label used by the control block, the strip, its actions and the applied-narrowing summary is now written in one place, so the four cannot drift apart as later stories add more of them.
