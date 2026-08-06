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
