# Journal — Rejected rows, retry and cancel

What changed, in plain language, as each story was built.

## Story 1 — Open a submitted file and see its processing history

- Every file in the Expense files list is now something you can open. Each row has an Open link that takes you to that file's own page, and the page names the file, the setting it was sent against, when it was processed, its status and its record count — every value exactly as the service reported it — followed by every processing step recorded for it with the outcome and the times it started and finished.
- The coloured status chip that files use was living inside the Expense files list. It has been moved into a shared piece so a file's own page shows a status identically — one place decides what "Validation failed" looks like, so the two screens can never drift apart.
- Opening a file that has been cancelled, or typing an identifier that matches nothing, now gets one plain answer: the file is not available, with a link back to Expense files. It is deliberately not treated as an error, because nothing went wrong — a cancelled file simply leaves the active list. A page whose file could not be read at all is the separate case, and that one does show the service's own reason with a way to ask again.
- A small pre-existing code-tidiness warning in the shared status badge (left over from the previous epic) is fixed, so the project is back to a clean lint run.

## Story 2 — See which rows were rejected and why

- A failed file's page now lists every row the transactions service rejected, with the values your file actually recorded for that row — including the ones that broke a rule, shown exactly as they were written so you can find and fix them in the source file. Nothing is tidied up or translated on the way.
- Where the reason comes from depends on who owns the rule. For the four checks this app owns — a missing reference, an amount that is not a number, an unreadable date, an unsupported currency — you read this app's own fixed wording, and the service's technical text is kept off the screen entirely. For a transaction type, and for anything else the service objects to, you read the transactions service's own sentence word for word; the app never judges a transaction type itself.
- Two cases the service's contract does not describe were decided rather than guessed at: if the service names a problem without saying which column it is on, its own sentence is shown; if it names no problem at all for a row, the row is still listed and says no reason was given, rather than the app making one up or hiding the row.
- If the rejected rows come back in a form the app cannot read as a list of rows, the page says so plainly and offers to ask for them again, instead of drawing an empty table. The rest of the file's page (its details and its processing history) keeps working either way.
- Account numbers on the rejected rows are masked, with a per-row reveal, using the same masking the request list already uses. Asking for the rows again starts them all masked again.

## Story 3 — Download the original file and the error file

- A file's page now offers both downloads: the CSV you originally submitted, and the error file the service generated for a file that failed validation. The error-file button only appears when that file actually has one.
- Both downloads are ordinary buttons, not links to the backend. The page fetches the file itself and then hands it to the browser to save. That is what lets a refusal be explained on the page in the service's own words instead of dumping you on a raw error page — and it is also why the file arrives under the name the service holds for it rather than a random one.
- Neither download button is greyed out while its file is on its way. Greying out the button you have just pressed with the keyboard throws away your place on the page, so instead a short "Preparing the original file…" line is announced while you wait, and the button stays ready if you want to ask again.
- The two downloads use two different addresses, and the service publishes a third very similar one that this app deliberately never calls. Getting that mapping wrong would silently hand you the wrong file, so both the automated checks assert the actual bytes you received, not merely that something downloaded.

## Story 4 — Retry validation or cancel the file

- Retry and cancel now sit on a submitted file's page for the Finance Uploader only. Whether they appear at all is decided on the server from who is signed in, so an Approver's browser never receives them — they are not there to be greyed out. Which of the two applies is decided from the file's own state: retry only after validation has failed, cancel any time before the file has imported.
- Cancelling asks first. The confirmation names the file, says the file and its rows go and that it cannot be undone, and opens with "Keep the file" already selected, so a stray Enter keeps the file. Nothing is sent to the service until "Cancel the file" is chosen, and once it succeeds the user lands back on the Expense files list — the cancelled file no longer has a page of its own.
- After a retry the page keeps itself up to date on its own: it re-checks the file and its processing history straight away, then every 15 seconds for as long as the file is still working, and goes quiet once it has settled. If one of those checks fails, the page keeps showing the last values it had rather than replacing them with an error.
- The processing-history section gained one optional input so the page can tell it "ask again". This keeps ONE timer on the page driving both the file and its history, instead of each section running a timer of its own and drifting apart. Nothing else about that section changed.

## Story 5 — Tell the uploader when a file's validation fails

- While the Finance Uploader has the Expense files list open, a file that finishes validation with rejected rows now raises a notification naming the file, with a link straight to its rejected rows. It appears on the moment the file fails — a file that was already failed when you opened the list is not announced, and a file only gets announced once.
- The notification stays put by asking for a zero lifetime on the existing toast, rather than building any new "sticky notification" machinery. The imported confirmation still fades after five seconds; the rejected-rows one waits for you.
- The toast could only offer a click handler before, which a keyboard user cannot reach, so notifications gained a proper link. Any future notification that needs to send someone somewhere now has one, and following it clears the notification on the way out.
- Two test files disagreed about this one. The earlier epic's test said a file failing validation must raise no notification at all — which was only true while this epic's requirement was still unbuilt, and that test said so itself, pointing at this requirement as the next epic's job. Now that it is built, that one assertion was narrowed to what its own story actually promises: nothing on the screen claims a failed file imported. Everything about the new notification is covered by this story's own tests, and all of the earlier epic's tests still pass.
