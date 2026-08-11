# Journal — Export requests for the payment system

Notable decisions and knock-on effects recorded as each story was built.

## Story 1 — Export the requests you are looking at

- The export writes the requests the list is actually showing — every one the search and filters left, in the order the column headings put them — not just the twenty on the page you happen to be looking at. That was the single easiest thing to get wrong here, so the list hands the export the very same ordered, filtered set the rows are drawn from, and the automated tests fail loudly (by 9,980 rows) if anyone ever swaps it for the page.
- The account number goes into this one file whole, and the transaction type goes in exactly as the payment service sent it (`C` / `D` / `Debit`) rather than the friendly wording the screen shows. Everywhere else in the app the number is still masked to its last four digits. The two rules now live in two clearly separate places — the screen's wording in `display.ts`, the file's raw values in the new `exportCsv.ts` — so reaching for the wrong one is a visible mistake rather than an accident.
- The saved file is called something like `expense-requests-export-2026-08-11-14-35-07.csv`. The time of day is written with dashes on purpose: Windows does not allow a colon in a file name, and the browser would quietly rename the file behind the app's back, so the user would end up with a name nobody chose.
- At the app's stated ceiling of 10,000 requests the file is written in batches of 500 with a pause between them, so the screen keeps drawing and responding while it is built instead of locking up for the duration. The automated test proves the file is complete at 10,000 rows; whether it *feels* smooth is on the manual checklist, because that is a judgement only a person watching a real browser can make.
- The export control is never disabled — not even while a file is being built. That follows the rule the file-download controls already set: taking the control out from under a keyboard user the moment they activate it moves their focus somewhere they did not choose. A second activation legitimately produces a second file.
