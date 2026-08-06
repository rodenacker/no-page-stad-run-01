# Journal — Rejected rows, retry and cancel

What changed, in plain language, as each story was built.

## Story 1 — Open a submitted file and see its processing history

- Every file in the Expense files list is now something you can open. Each row has an Open link that takes you to that file's own page, and the page names the file, the setting it was sent against, when it was processed, its status and its record count — every value exactly as the service reported it — followed by every processing step recorded for it with the outcome and the times it started and finished.
- The coloured status chip that files use was living inside the Expense files list. It has been moved into a shared piece so a file's own page shows a status identically — one place decides what "Validation failed" looks like, so the two screens can never drift apart.
- Opening a file that has been cancelled, or typing an identifier that matches nothing, now gets one plain answer: the file is not available, with a link back to Expense files. It is deliberately not treated as an error, because nothing went wrong — a cancelled file simply leaves the active list. A page whose file could not be read at all is the separate case, and that one does show the service's own reason with a way to ask again.
- A small pre-existing code-tidiness warning in the shared status badge (left over from the previous epic) is fixed, so the project is back to a clean lint run.
