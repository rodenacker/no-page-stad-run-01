# Journal — The shared expense request list

Notable decisions and knock-on effects recorded as each story was built.

## Story 1 — The shared expense request list

- The status chip that lived inside the submitted-files table is now a shared component both screens use, so a status looks and reads the same wherever it appears. It gained one more meaning for this story — "refused" — which is what a rejected request wears.
- Opening the request list to the Finance Uploader had a knock-on nobody had spotted: it was the last screen only one role could open, so the app now has no screen that shuts a role out. Four tests from the two earlier epics were checking "this person is not offered that screen" using exactly that pair, so they had nothing left to check. They now use a signed-in account whose role the app doesn't recognise — a real situation (the sign-in service can return any role name, and the app deliberately grants unknown ones nothing) — so the same behaviour is still being proved: an excluded screen is absent from the page rather than shown greyed out, and reaching its address explains what permission is missing.
- The word "review" has gone from the request-list link in the header and on the home screen; it now reads "Expense requests", because the link is offered to the Finance Uploader too and they cannot decide anything. The permission the screen names when someone is refused changed with it, from "Review and decide on a transaction" to "Read the expense requests" — the read is what this screen actually needs, and deciding stays the Approver's, checked inside the decision flow when that epic ships.
- A mistyped address inside the app now keeps the app header, so you can leave by the navigation instead of the browser's Back button. That already worked for the request-list address while it had no screen; shipping the screen would have removed the only way to see it, so the behaviour is now general. One trade-off: if you are signed out and mistype an address, you are sent to the sign-in screen rather than shown a "not found" page.

## Story 2 — Search and filter the request list

- The search box now narrows the list as you type, with no built-in pause. Rather than making you wait out a delay, the screen lets your typing stay smooth while it re-filters in the background — which is what keeps it usable when there are thousands of requests.
- The search deliberately only looks at what is on the screen: the reference, description, file name, amount, and the last four digits of an account number that are actually shown. Typing a full account number finds nothing. That is on purpose — being able to search the hidden part would let someone confirm a guessed account number without ever revealing it, which is exactly what the masking rule exists to prevent.
- "Clear all" sits with the box that lists what you have applied, so it is available the moment anything is narrowing the list — not only once the narrowing has hidden everything.
- When your narrowing hides every request, the screen says so, still shows what is applied, and offers "Clear all" — but deliberately does not offer the "submit an expense file" link. That link belongs only to the case where nothing has ever been imported; offering it to someone whose own filter hid their requests would send them off to upload a file they do not need.
- The three filters only ever offer values that are actually in the data that came back, so there is nothing to choose that would give you an empty list for no reason. A transaction type the app has plain wording for is offered under that wording, and a type it has never seen is offered exactly as the service sent it — the same wording used in the table, from one shared place, so a row and its filter choice can never read differently.

## Story 3 — Filter by amount range and date range

- The list can now be narrowed to an amount range and a transaction date range as well as by search and the three pick-one filters. You can give just a lower bound, just an upper bound, or both, and a request sitting exactly on a bound is kept.
- Amounts are compared as numbers, so 9.99 is correctly left out of a 100-to-200 range instead of sneaking in on alphabetical order, and dates are compared by calendar day, so a request recorded at 3pm on the last day of your range still counts as inside it.
- If you enter a range back-to-front (say a minimum of 200 and a maximum of 100) the screen tells you the range is the wrong way round and simply does not apply it — the list stays exactly as it was rather than going mysteriously empty — and the values you typed stay in the boxes so you can correct whichever one was wrong.
- Both ranges show up in the same "What is currently applied" panel as everything else and are cleared by the same single Clear all button; there is still only one reset on the screen.
- The four bound boxes are ordinary typeable fields (a number box for amounts, a date box for dates) rather than calendar-only pickers, so they can be completed entirely from the keyboard.

## Story 4 — Sort and page through the request list

- The list now shows 20 requests a page, with a 5 / 10 / 20 / 50 choice. The starter project came with different numbers (25 a page, chosen from 10/25/50/100); those were replaced outright rather than left sitting beside the real ones, so there is only one set of page sizes in the code.
- The ordering you choose is remembered by the browser for the rest of your session, so leaving the request list and coming back brings it back exactly as you left it. It is deliberately not remembered any longer than that, and it is not part of the address — the backend has no way to be asked for a sorted list, so all the ordering happens on your machine.
- Every column heading is now a button rather than plain text. That is what lets you sort with the keyboard alone, and it also fixed something the accessibility scan would have caught anyway: a wide table you can scroll sideways has to contain something you can Tab to.
- Changing a filter, the search term, the ordering or the page size takes you back to page one. Page seven of a list you have just narrowed to four requests is not a page anyone asked for.

## Story 5 — Open one request, with its account number protected

- Opening a request now shows everything the service holds for it — currency, the rejection note when there is one, and who last changed it and when — in a panel over the list, with a clearly named "Reveal account number" button inside. The reveal is deliberately forgetful: close the panel, or re-open the same request, and the number is masked again, because nothing remembers it outside the open panel.
- There is still no way anywhere on the screen to change, approve or reject a request — not even a greyed-out one. That is checked by a test that fails if any such control appears, so the next epic's decision controls cannot slip in early by accident.
- On a phone-width screen the list is now cards rather than a table — one card per request with its reference, status, amount and date, and a menu to open it. The table isn't merely hidden at that width, it isn't built at all, so a phone reader gets the card version and nothing else.
- The page controls (previous / next / page size) were rebuilt with the same buttons and wording but without the list markup they sat in, so that on a phone the requests are the only list on the screen — which is what "one card per request" has to mean for a screen reader.
- One pre-existing wobble found and left alone: story 3's range-filter test can run out of its 5-second budget when the whole test suite runs at once on a busy machine. It does the same thing on a copy of the project without any of this story's work (worse, in fact), so it is a machine-load artefact rather than something this story caused; it passes on its own and on an unloaded suite run. Recorded in the architecture notes so nobody reshapes working code chasing it.

## Story 6 — Possible duplicates marked, and the Approver told

- Two requests that repeat one another — same account number, same amount, same date — are now both marked "Possible duplicate" in the list itself, so you can see it without opening anything.
- The marking is worked out once, over every request that came back from the service, not over the requests currently on screen. That is what keeps the same requests marked when you search, filter, sort, or page — even when a request's twin is on another page.
- A rejected request is deliberately left out of the comparison. It is never marked, and it never causes the request it matches to be marked, because re-submitting something that was refused is the normal way to correct it — marking the correction would flag a large part of the list.
- The mark sits beside each request's status, in words as well as colour, in both the wide table and the phone-sized cards. No new column was added, so nothing else about the list moved.
- Only an Approver is told about duplicates, and only once per load however many requests were marked. Once they close that message it stays closed for the rest of the session on that screen. Someone signed in as an Importer sees the marks but is never interrupted.
- That message stays on screen until it is closed rather than fading after a few seconds, because it is asking someone to go and look at something.
- While checking nothing else broke, three older tests in this epic (stories 2, 3 and 4) turned out to run out of time when the whole test suite runs at once on a busy machine. It is not caused by this story — the same three fail with this story's code removed — and they all pass when run on their own. Recorded so nobody rewrites a working screen chasing it.
