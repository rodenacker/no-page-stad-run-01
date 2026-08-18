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

## Story 4: A status becomes a ruled mark, not a coloured pill

- Statuses across the whole app now read as a small drawn shape beside the status in tracked capitals, instead of a rounded coloured pill. Because it is one shared mark, the submitted-files list, a file's own page, its import preview and the request list all changed at once — that was the point, not a side effect.
- The four shapes differ in form rather than in colour, so they can be told apart in a greyscale screenshot: an empty box for something still awaiting a decision, the same box filled in for approved, the box struck through for rejected, and a plain rule for a cancelled file. The possible-duplicate mark gets a doubled bar in the margin, like an editor's change bar.
- A status the app has no wording for still comes through in the service's own words and is given no shape at all — a shape there would be the app pretending to know what the value means.
- The pill component the old badge was built from has been removed from the project entirely, so a future screen cannot quietly bring the capsule back; anything that needs a short phrase with a colour uses the shared mark.
- Two file statuses that mean the same kind of thing (Uploaded and Validating) now share one shape and are told apart by their words. They previously had different small icons.

## Story 5: The listing itself, as a ruled batch listing

- The three controls on every row — Approve, Reject and Open — now read in the same ruled style as the export and Clear all actions on the strip above them, instead of as filled and boxed buttons. The story only asked for the listing itself, but nothing else in this epic owns those controls, and a filled button repeated once on every row was the loudest thing left on the screen from before the redesign. Nothing about what they do, what they say, or how the keyboard moves between them has changed. Because the same controls are used on the phone-width cards, those change look too — the phone story will confirm that reads well at 360px.
- The notice that appears when the list has stopped keeping itself current used to be a grey bordered panel. It is now the same ruled band the loading, empty, failed and narrowed-to-nothing states use, so the screen has no panels left on it at all. Its wording and its behaviour are exactly as they were.
- Two API connection errors interrupted this story mid-build. The edits survived intact and were verified after the fact — the story's spec, the type check, and the whole suite against the pre-change baseline — rather than rebuilt.

## Story 6: The exception gutter down the left

- The new left-hand column is only two characters wide, so it can show one mark at a time. On a request you can still act on, that mark is the tick you select it with; once it has been decided, it is the shape for that decision. A request that repeats another one is marked differently — a thin coloured bar down the very left edge of its row — because otherwise, on a duplicate you were about to approve, the tick would have pushed the duplicate warning out of the one column you are scanning. The words "Possible duplicate" still sit in the row beside the status, exactly as before.
- Rows that have already been decided now print in the app's quieter grey, so only the requests still waiting on someone hold full strength and the list visibly works itself down. The decision itself stays at full colour — its mark in the left-hand column and its status word — so you can still tell at a glance what happened to it, and every value on the row is still perfectly readable. Nothing on a decided row is disabled or hidden; its Open button still works.
- The hidden description a screen reader reads out for the table had to be reworded while adding the new column to it. The phrase "already been decided" in the description turned out to be the very phrase the bulk-approval report uses, and a test looking for that report started finding the table's description instead. The description now names the columns without restating what the marks in them mean — those words are on the rows themselves.
- The old screen-reader-only heading "Select" was removed along with the tick-box column it named; the left-hand column's own heading covers both jobs now.

## Story 7: The continuation line at the foot

- The listing already closed its bottom edge with a hairline when story 5 ruled it, and this story's continuation line sits directly beneath that. Rather than give the line a rule of its own — which would have left two hairlines a gap apart with nothing between them, reading as an empty band — the line draws none, so the listing's closing rule is also the line's top edge. That is one rule, and it is now written down in both files so a later story does not add the second one back.
- The underline-only "field" look that story 3 gave the narrowing controls is now stated in one place (`fieldNotation.ts`, beside the label notation it belongs with) instead of living inside the narrowing strip's own file, because the requests-per-page selector at the foot wears the same notation. Same classes as before on the strip — nothing about those eight fields changed — but the two surfaces can no longer drift apart.
- The figures in the line are derived beside the code that cuts the page (`recordRangeOf` next to `pageOf`), so the line and the rows it describes are two readings of one calculation. The two ends that usually go wrong are handled there: the last page of a 428-request batch reads 421–428 rather than overshooting to 440, and a narrowing that has hidden everything reads 0 of 0 rather than claiming a first record that is not there.
- One assertion in an earlier epic's test had to be re-worded: it looked for the exact text "Page 2 of 2" as a scrap of its own, and that scrap is now part of the continuation line. It still asserts the same thing — that a background refresh leaves the reader on the page they were reading — read out of the line instead. Nothing was loosened or removed.

## Story 8: The same listing on a phone

- On a phone the request list is now the same ruled listing as on a desktop, just tighter: each request is a group of lines that runs straight into the next one, instead of sitting in its own card. Cards were the thing this redesign set out to get rid of, so the last place they survived is gone.
- The marks down the left-hand edge are drawn a little larger on a phone than on a desktop. They are still two characters wide, just set at a bigger size — which keeps them easy to see and makes the tick big enough to hit with a thumb rather than a mouse pointer.
- Everything you can do to a request on a wide screen you can still do on a phone: open it, tick it, approve it, reject it, and export what is listed. Checked by comparing the two widths against each other rather than against a hand-written list, so an action added later is covered too.
- The band at the top folds onto three lines at phone width instead of pushing the page sideways, and the outstanding count is still the biggest thing on the screen there.
- Two mistakes in this story's browser test were corrected rather than worked around. It expected the confirmation's button to read "Approve" when the app deliberately words it "Approve request" (the row's button is the one that reads "Approve"), and it checked for the status in a way that could never have matched anything. Both were re-pointed at what the app really does; neither check was weakened — the status one is now stricter, since it insists on one element carrying just the status word.
- The band's own text used to run its fields together ("RECORDS8AWAITING DECISION5") because the labels and figures are separate elements with no space between them. Each field now closes with a space, which changes nothing on screen and nothing a screen reader hears, but makes a copy of the band read as a sentence.
