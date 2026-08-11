# Journal — Export requests for the payment system

Notable decisions and knock-on effects recorded as each story was built.

## Story 1 — Export the requests you are looking at

- The export writes the requests the list is actually showing — every one the search and filters left, in the order the column headings put them — not just the twenty on the page you happen to be looking at. That was the single easiest thing to get wrong here, so the list hands the export the very same ordered, filtered set the rows are drawn from, and the automated tests fail loudly (by 9,980 rows) if anyone ever swaps it for the page.
- The account number goes into this one file whole, and the transaction type goes in exactly as the payment service sent it (`C` / `D` / `Debit`) rather than the friendly wording the screen shows. Everywhere else in the app the number is still masked to its last four digits. The two rules now live in two clearly separate places — the screen's wording in `display.ts`, the file's raw values in the new `exportCsv.ts` — so reaching for the wrong one is a visible mistake rather than an accident.
- The saved file is called something like `expense-requests-export-2026-08-11-14-35-07.csv`. The time of day is written with dashes on purpose: Windows does not allow a colon in a file name, and the browser would quietly rename the file behind the app's back, so the user would end up with a name nobody chose.
- At the app's stated ceiling of 10,000 requests the file is written in batches of 500 with a pause between them, so the screen keeps drawing and responding while it is built instead of locking up for the duration. The automated test proves the file is complete at 10,000 rows; whether it *feels* smooth is on the manual checklist, because that is a judgement only a person watching a real browser can make.
- The export control is never disabled — not even while a file is being built. That follows the rule the file-download controls already set: taking the control out from under a keyboard user the moment they activate it moves their focus somewhere they did not choose. A second activation legitimately produces a second file.

## Story 2 — Know what you exported, and be told when there is nothing to export

- After exporting, you now get a confirmation in the corner of the screen saying how many requests went into the file, your name, and the time — written the same way times appear everywhere else in the app (for example `2026-04-30 14:35`). That attribution is not decoration: the export file carries full account numbers, and the rules this project follows only allow that if there is a record of who produced it.
- If your search and filters have hidden every request, the Export button is still there and still usable — pressing it now explains that nothing matches, instead of quietly saving an empty file.
- The screen already had a sentence for "nothing matches what you have applied", and the epic's written requirement quoted a slightly different wording of the same thing. Rather than put two near-identical sentences on one screen, the export now reuses the sentence the list already shows, and that sentence moved to one shared place so the two can never drift apart. The epic brief was updated to record which wording the app actually uses.
- Added one small shared helper for writing a date and time the app itself observed, so future screens don't each invent their own format. Times that came from the backend are still shown exactly as sent.
- The count and the person's name are read once, the moment you press Export, and used for both the file name and the confirmation — so a screen that redraws mid-build cannot end up describing a different set of requests, or a different minute, than the file actually contains.
