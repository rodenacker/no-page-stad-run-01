'use client';

/**
 * Every imported expense payment request, as the transactions service reports it —
 * the one shared screen both the Finance Uploader (the auth service's `Importer`) and
 * the Approver work from (brief R1, R20). Read-only: nothing here changes a request
 * (BR1).
 *
 * Six things about this component are deliberate and easy to break:
 *
 * - **The whole set is read once, in the BROWSER, and held in memory.**
 *   `GET /v1/transactions` accepts no query parameters, so there is no server-side
 *   search, filter, sort or paging to ask for (brief §Notes & Caveats): the set below
 *   is the one the later narrowing, sorting and paging layers work over, and none of
 *   them re-reads the service. Reading from the browser is also what lets the session
 *   cookie travel by itself and makes the three non-data states this component's own
 *   business rather than a server render's.
 * - **Everything on screen is the service's own value.** The date is printed exactly
 *   as it arrived (its format is an unverified assumption for this epic — normalising
 *   on speculation would hide a real difference rather than surface it) and the amount
 *   keeps the number the service sent. A status or transaction type this app has never
 *   heard of is shown as written rather than blanked, remapped or treated as an error
 *   — the backend owns both vocabularies.
 * - **An account number never reaches the browser whole.** Only its last four digits
 *   are rendered, on every render path, and there is no control that reveals them
 *   wholesale. This is POPIA (project.md §Compliance), not formatting: a full value in
 *   a title or data attribute would leak it just as surely as printing it.
 * - **The wait is tiered** (R11/R19): under 300ms nothing is drawn at all, because a
 *   flash of skeleton is worse than a moment of stillness; from 300ms an announced
 *   placeholder stands in for the pending list; past 3s a still-loading message JOINS
 *   that placeholder rather than replacing it.
 * - **All three non-data states are answered** (project.md NFR-base-5): the announced
 *   busy state, a plain sentence when nothing has ever been imported plus the upload
 *   action as the next step, and — when the list cannot be read — the service's own
 *   wording plus one action that asks for it again. An empty list is an answer, not a
 *   failure.
 * - **The status chip is the shared `StatusBadge`**, which pairs an intent colour with
 *   the status TEXT and an icon, never colour alone (R14). This screen supplies only
 *   what each status MEANS; the tokens are the badge's.
 *
 * The narrowing layer (R2/R3/R6/R7/R10/R18) sits on top of that one fetched set:
 *
 * - **Nothing narrows on the server and nothing re-reads.** The search term, the three
 *   pick-one filters and the four range bounds are component state, narrowing the set
 *   already in memory. They are deliberately NOT in the URL: the endpoint takes no
 *   parameters, and nothing in this screen asks for a shareable narrowed address.
 * - **A range entered the wrong way round is reported, never applied.** The report sits
 *   with the controls and the range stops narrowing entirely — neither bound — so the
 *   list is left exactly as it was instead of going unexplainedly empty, and the range
 *   contributes nothing to the summary of what is applied. The bounds the user typed stay
 *   in their fields: the screen reports, it never swaps, clamps or blanks a value.
 * - **The term narrows as it is typed, with no timer in the way.** Responsiveness at the
 *   feature NFR's 10,000-row ceiling is React's to manage (`useDeferredValue`, which
 *   re-filters at a lower priority than the keystrokes) rather than a delay the user
 *   waits out.
 * - **The narrowed-empty state is a different answer from the never-imported one**: it
 *   names what is applied and offers Clear all, and it deliberately does NOT offer the
 *   upload action (R10/R18 against R9/R17). Offering "submit a file" to someone whose
 *   own filter hid their requests is the failure mode those requirements exist to
 *   prevent.
 *
 * Ordering and paging (R12/R13) sit on top of the narrowing, in one pipeline:
 *
 * - **Narrow, then order, then slice — in that order.** What is ordered and paged is
 *   what the search and filters LEFT, never the whole fetched set. Slicing first and
 *   narrowing afterwards is the regression this order prevents: a request the user
 *   filtered out would come back on a later page.
 * - **The whole set is ordered once and the page is a slice of it.** Nothing
 *   re-derives the narrowed set per row, which is what the feature NFR's 400ms p95
 *   per-page render at the 10,000-row ceiling needs.
 * - **The heading row is rendered FROM the column definitions**, so every displayed
 *   column has a sort control (R13) by construction. Each one is a real button inside
 *   its `columnheader`, the active column carries `aria-sort`, and the direction is in
 *   the control's own accessible name — the arrow beside it is decoration, and R15
 *   does not let an icon carry state on its own.
 * - **The chosen ordering belongs to the session, not to this component.** It is read
 *   from `lib/transactions/sortPreference.ts` as external state, so it survives leaving
 *   the screen and returning (R13) without being copied into component state.
 * - **The page controls are never taken away.** When the narrowed set fits one page
 *   they are disabled, not removed (R12) — see `RequestListPagination`. The page being
 *   read goes back to the first one whenever the set underneath it changes, because
 *   page 7 of a set the user has just narrowed to four requests is not a page anyone
 *   asked for.
 *
 * Opening one request, and the narrow-viewport presentation (R5/R15/R16/BR1):
 *
 * - **A request opens in a panel OVER the list, one at a time** — the user's own choice
 *   at the stories approval, over an expandable row. This component holds only WHICH
 *   request is open (by id); the panel holds the reveal, so closing it returns the
 *   reader to their place, ordering and page untouched. See `RequestDetailPanel`.
 * - **Still nothing changes a request** (BR1/R5). The only per-request control is
 *   "open it", a direct control on the row and on the narrow line-group alike — see `RequestActions`
 *   for why there is no ⋯ overflow behind it.
 * - **At phone width the requests are RULED LINE-GROUPS, not a table — and not cards
 *   either** (`request-list-redesign` R4/R10). Which presentation is rendered is decided
 *   by the browser's own media query, watched as external state, so only one of the two is
 *   ever in the markup: a table hidden by CSS would still be read by assistive technology
 *   and would still be the thing a test finds. A wide table in a sideways-scrolling
 *   wrapper does not satisfy R4 either way. The narrow presentation is `RequestCards`
 *   (the file name is historical — the Shadcn `Card` per request it once composed is a
 *   named anti-goal of this design and is gone), and it is handed the same readings this
 *   file settles for the wide listing: how a status reads, and which shape a request's own
 *   state puts in the gutter.
 *
 * Possible duplicates, and who is told about them (R4/R8/R21, BR2/BR3):
 *
 * - **The comparison covers the WHOLE fetched set, once per load.** Which requests are
 *   marked is worked out from every request that came back — see
 *   `lib/transactions/duplicates.ts` for the key and the rejected-request exclusion —
 *   and then carried through the narrow → order → slice pipeline by id. Comparing the
 *   requests currently on screen instead would make the mark depend on the search term,
 *   the filters, the ordering and the page: two matching requests on different pages
 *   would each look unique (story 6 AC-5).
 * - **The mark is a memo of the fetched data, never an effect.** An effect that
 *   re-derived it per render would raise the Approver's notification again every time
 *   the list re-rendered — a keystroke in the search box would bring a dismissed
 *   notification back.
 * - **Only the Approver is notified, once per load** (R21). `roles` is how this client
 *   component learns who is signed in, since the server page holds the session; it
 *   exists for that decision alone. The marks themselves are identical for both roles,
 *   and neither role is offered anything to DO about a duplicate in this epic (BR1).
 *   An Importer sees the marks and is told nothing. Note this is deliberately UNLIKE
 *   the previous epic's import notification, which is not role-gated.
 * - **Which duplicates the user has already been told about lives in a ref**, keyed by
 *   request id, exactly as `SubmittedFilesList` remembers which files it has announced.
 *   That is what makes a dismissed notification stay dismissed across every later
 *   re-render, while a duplicate that appears in a LATER read is still news.
 *
 * Exporting the listed requests for the payment system (csv-export R1/R2/R3):
 *
 * - **The export is handed the ORDERED, NARROWED set, not the page on screen.** The
 *   pipeline above already holds it as `orderedRequests`, so the export is one more
 *   reader of that array — every request the search and filters left, in the order the
 *   list is sorted. Handing it `requestsOnPage` would ship a one-page file that looks
 *   perfectly correct on screen, and handing it the fetched set would ignore the
 *   narrowing (csv-export BR1). Both are silent corruptions of a hand-over file a machine
 *   reads next.
 * - **The file itself is built only when the control is activated**, and the account
 *   number goes into it WHOLE — the one documented exception to the masking rule the rest
 *   of this component obeys. Both are `ExportRequestsAction`'s and
 *   `lib/transactions/exportCsv.ts`'s business, which is where the reasoning lives.
 * - **The control carries no role check**, unlike submitting a file: both roles may
 *   export whatever each has listed.
 * - **What the export TELLS the user is the export control's own business too** (R4/BR2):
 *   a completed export raises the app's one notification naming how many requests went
 *   into the file, who produced it and when, and a narrowing that has hidden everything
 *   produces no file and says so. This component contributes two things to that and
 *   nothing else — the ordered, narrowed set, and the signed-in person's name from the
 *   `exportedBy` prop, which it passes straight through. The narrowed-empty sentence is
 *   the SAME one the rows' place shows (`NARROWED_EMPTY_MESSAGE`, stated once in
 *   `lib/transactions/narrowing.ts`): two near-identical sentences on one screen read as
 *   two different answers.
 *
 * Deciding one request (`expense-decisions` R1/R10/R11/R12/R14/R15, BR3/BR6/BR7):
 *
 * - **This component owns the decide flow; the row, the line-group and the panel only ask.**
 *   `RequestActions` and `RequestDetailPanel` are handed `onDecide` — and handed it
 *   ONLY for an Approver looking at a request that is still `Imported` — so a reader who
 *   may not decide, or a request that has already been decided, has no decide control in
 *   its markup at all. Absent, never disabled: the project's rule everywhere, and the
 *   thing a greyed-out Approve would quietly break.
 * - **The two decisions are DIRECT controls on the row and on the narrow line-group** (user decision
 *   at manual test), and there is no ⋯ overflow anywhere on a request — so deciding one
 *   costs one activation rather than two. They are therefore on
 *   screen once per listed request, which is why each one's accessible name carries the
 *   request's reference; "Approve" alone would be a screenful of identical controls.
 * - **Nothing is sent until the confirmation is accepted** (R10/BR6). Choosing Approve
 *   or Reject only records WHICH decision is being asked about; the shared
 *   `ConfirmAction` then names the request by its reference, holds focus on the way out
 *   (NFR2) and prints no account number — naming a request must not defeat the masking
 *   the list applies (project.md §Compliance).
 * - **A rejection is asked WHY first** (R7/R9/BR4). Choosing Reject opens
 *   `RejectionNoteStep` — a step of its own, BETWEEN the action and the confirmation,
 *   never inside it: the confirmation's way out holds focus precisely so a stray Enter
 *   decides nothing, and an editable field in it would defeat that. Approving asks for
 *   no note at all. The note then travels with the decision as `UserNote`, and the
 *   same request's confirmation is the same shared dialog either way.
 * - **The confirmation closes as the decision is submitted, whichever way it turns
 *   out.** A refusal is reported behind it, through the app's one notification surface:
 *   a user is never held in a dialog to read why nothing happened, and a message trapped
 *   behind an open dialog is unreachable to a screen reader anyway.
 * - **The outcome arrives by RE-READING, never out of the answer.** Both decide
 *   operations return the same generic envelope whatever happened (brief BR1), so a
 *   recorded decision is followed by a fresh `GET /v1/transactions`, and it is that read
 *   which moves the request's status, withdraws its decide actions and updates the
 *   opened panel. A re-read that fails leaves the last known rows on screen.
 * - **AND THE REQUEST IS RE-READ BEFORE ANYTHING IS SENT** (brief BR1, R4/R13). That
 *   same envelope is also what a decide call answers when the request was ALREADY
 *   decided, so nothing in the answer can tell an Approver they were beaten to it. An
 *   accepted confirmation therefore reads `GET /v1/transactions` FIRST and sends the
 *   decision only while that fresh read still shows the request awaiting one; otherwise
 *   it refuses locally — no decide call at all — tells the Approver in R4/R13's words,
 *   and leaves them looking at the decision that was actually recorded, because the
 *   same read is what puts it on screen. There are now two re-reads in the decide path
 *   and they answer different questions: this one asks "may I still?", the one after a
 *   recorded decision asks "what happened?".
 * - **The two notification lifetimes are the R11 rule, not a choice per message**: a
 *   recorded decision confirms itself on the toast's default 5s (inside the 4-8s
 *   window) and fades; a decision that was NOT recorded is something the Approver has to
 *   act on, so it is raised with `duration: 0` and waits for them.
 * - **A decision that STICKS hands the keyboard back** (NFR1). The decide controls the
 *   Approver was standing on are withdrawn the moment the request stops awaiting a
 *   decision, and a control that is removed while it holds focus drops it on the floor —
 *   the whole page has to be walked again to reach anything. So this component names the
 *   request whose controls are going (`handOffFocusTo`) and the request's own surface
 *   moves focus to its Open control; see `RequestActions`. It is asked for wherever the
 *   offer ENDS — the decision the Approver recorded, and the one a fresh read shows
 *   somebody else had already recorded — and nowhere the request is left exactly as it
 *   was: a refused decision keeps its controls, and focus comes back to them by itself.
 *
 * Selecting several requests to approve together (`bulk-approval-and-live-refresh`
 * R2/R4/R7, BR1/BR10):
 *
 * - **The selection is a set of transaction IDS, held here, above the pipeline.** So a
 *   tick follows the REQUEST: a search that hides it, an ordering that moves it and a
 *   page nobody is reading all leave the selection and its count exactly where they
 *   were. The deliberate consequence, accepted at the stories approval, is that a bulk
 *   action may cover requests that are not on screen — which is why the count is always
 *   visible and why the action that uses it names an exact figure.
 * - **Each row and line-group gets a plain `selected` boolean, never the set.** Handing the
 *   set down would defeat the memo on every row on every tick — and, once this list
 *   refreshes itself, on every poll. Same shape as `possibleDuplicate` and `canDecide`.
 * - **Only an Approver is offered any of it** (R7/BR10): no per-request tick in the
 *   gutter, no "select everything listed" and no count. Absent from the markup, never
 *   disabled — the rule this project applies everywhere. The gutter itself stays, for
 *   both roles: it is where the marks they scan for live (see below).
 * - **"Select everything currently listed" means the NARROWED set**, not the page on
 *   screen and not the whole fetched set, and it covers only requests still awaiting a
 *   decision (BR1). Unticking it is this screen's clear-the-selection action.
 * - **`99+` is the ambient indicator's alone** (R4): anything that gates an action
 *   states the literal count. Both forms live in `lib/transactions/selecting.ts`.
 *
 * Approving the whole selection at once (R1/R5/R8/R9, BR1-BR5, NFR3):
 *
 * - **The batch is N single-request approve calls** — there is no bulk endpoint (BR3).
 *   They run a few at a time, at the bound stated in `lib/transactions/bulkApproval.ts`,
 *   so a selection that can run to thousands neither floods the service nor leaves the
 *   screen unusable while it works through them (NFR3).
 * - **Nothing is sent until a FRESH read says it may be** (BR1/BR2), and the read is the
 *   same one a single decision takes — the check itself now lives in
 *   `lib/transactions/bulkApproval.ts` and both paths ask it, so "already decided"
 *   cannot come to mean two things on one screen. A selected request the read shows
 *   decided is dropped from the batch with no call made for it at all, and reported as
 *   left unchanged.
 * - **The outcome is a comparison of two reads, never the call answers** (BR5). The
 *   service answers the same envelope whether it approved a request or found it already
 *   decided, so the approved count comes from the read taken AFTER the batch against the
 *   one taken before it. That second read is load-bearing, not a refresh.
 * - **The selection controls are DISABLED while the batch runs** — the one place this
 *   screen shows a disabled control rather than an absent one. It is transient state,
 *   not a permission: BR10's hidden-never-disabled rule governs who may act, and that
 *   still never reaches the markup. The list itself stays readable throughout, and the
 *   batch announces itself politely, since no row changes until the read.
 * - **What the batch decided stops being selected** (BR8): approved requests, and
 *   requests a colleague decided first, drop out of the selection and the count corrects
 *   itself. Anything still awaiting a decision keeps its tick.
 *
 * When part of a batch fails (R5/R10, BR11):
 *
 * - **Three buckets, never two.** A call that FAILED is not the same thing as a request
 *   nobody sent a call for. "Left unchanged" means a colleague decided it first and
 *   nothing went wrong; "could not be submitted" means the call itself was refused. The
 *   report names all three, empty ones included, and gives the SERVICE's own reason for
 *   the failures — never the client's placeholder (project.md NFR-base-5).
 * - **The report waits, and carries the way out.** Something the Approver has to act on
 *   does not fade (`duration: 0`), and the way to act on it is a real button inside the
 *   notification (`action` on the toast surface) — not a click handler on its body,
 *   which no keyboard can reach.
 * - **Trying again is scoped, re-checks, and asks nothing.** It covers exactly the
 *   requests whose calls failed, and it runs the SAME batch (`runBulkApproval`), so the
 *   eligibility re-check happens again over that subset: a request decided in the
 *   interim comes back as left unchanged rather than approved a second time (BR11). It
 *   does not ask for confirmation again — this bulk approval was confirmed when it
 *   started, and choosing a named, smaller subset is itself the deliberate act — and
 *   taking it dismisses the report, so two answers about one batch are never on screen
 *   together.
 *
 * Keeping itself current while somebody is reading it (R3, BR6/BR7/BR8, NFR2/NFR4/NFR5):
 *
 * - **The refresh is this list's OWN read, on a timer** — `GET /v1/transactions` again,
 *   from the browser, at `lib/transactions/refreshing.ts`'s cadence. There is no delta
 *   channel and no single-request read to ask for instead (brief §Data Model), and a
 *   read issued from the server could not be a self-refresh at all.
 * - **It runs the WHOLE time the list is open**, which is this epic's deliberate
 *   extension of the project's stop-when-idle convention (`SubmittedFilesList`, which
 *   watches files that eventually finish). What this list watches is other people's
 *   decisions, and those never finish — so there is no idle state to stop at. Everything
 *   else about that convention is followed exactly: one timer at most, cleared when this
 *   component goes away, and a re-read that fails leaves the last known rows on screen.
 * - **Nothing is asked of a service nobody is watching** (BR6). The timer is gated on
 *   the document being visible, watched as external state (`lib/layout/pageVisibility`),
 *   and a reader who comes back to the tab gets a read STRAIGHT AWAY rather than waiting
 *   out the tick they missed.
 * - **It pauses around the reader's own bulk action** (BR7): while the bulk-approve
 *   confirmation is open and while the batch is in flight, nothing polls — a refresh
 *   must never race an action the Approver is part-way through. It resumes the moment
 *   that action ends, whichever way it ended, backing out included. That pause is also
 *   what satisfies NFR4: the batch's own pre-submit re-check and its read back are the
 *   only reads of that interaction, so no poll can fire a second full-list read beside
 *   them. The pause is NOT extended to a single request's confirmation: that flow takes
 *   its own reads, and the dialog is unaffected by rows changing behind it.
 * - **A refresh updates in place** (BR8). The reader's search term, filters, ordering,
 *   page and keyboard are all untouched, an open dialog is left standing, and a request
 *   that reads exactly as it already did keeps the very object it had — so a poll
 *   re-renders only what moved (NFR5, and see `refreshedList`). The one deliberate
 *   exception is the selection: a request a colleague has decided drops out of it and
 *   the visible count corrects itself, with nothing raised about it.
 * - **It is announced politely and nowhere else** (NFR2). One `role="status"` line,
 *   present from the start so its contents CHANGING is what gets spoken; never an alert,
 *   never a dialog, and never the app's notification surface — a background data change
 *   must not interrupt whatever the reader is doing.
 *
 * And when refreshing itself stops working (R6, BR9):
 *
 * - **Two strikes, never one.** One failed read changes nothing whatsoever on screen —
 *   transient failures are ordinary, and a notice on each would be noise. Only the SECOND
 *   consecutive failure raises the notice, and the count is failures since the last
 *   SUCCESS: a read that works in between puts it back to nothing.
 * - **The moment named is the last read that SUCCEEDED**, held in a ref and written into
 *   the notice as a machine-readable `<time>`. It is recorded when a read lands and never
 *   when one fails — "last up to date: now", stamped on the failure, is the easy
 *   implementation and it misleads the reader about the one thing they are being told.
 * - **The rows are never blanked.** The failed-load state — the alert, the service's own
 *   reason and Try again — belongs to a read that left the reader with NOTHING (the
 *   convention `SubmittedFilesList` established). Here they have rows, so they keep them,
 *   in their order, with their narrowing, ordering, page and keyboard untouched.
 * - **Nothing is asked of the reader.** The notice carries no button and no link, and
 *   recovery is the next successful poll clearing it — the timer never stopped, so there
 *   is nothing to restart.
 * - **It is polite, and one of it** (NFR2, inherited from the announcement above): a
 *   single `role="status"` region, never an alert, however many further polls fail.
 *
 * The batch's control block (`request-list-redesign` R11/R19/R21, BR4):
 *
 * - **This screen has no page title any more.** It opens with the control block instead —
 *   the batch's record count, what is still awaiting a decision, what has been decided and
 *   what it all adds up to. See `BatchControlBlock`, which owns the presentation, and
 *   `lib/transactions/controlTotals.ts`, which owns the derivation.
 * - **The block is handed the same arrays the rows are drawn from.** The whole fetched set,
 *   the narrowed set the pipeline already holds, and the selection — so the figures can
 *   never describe a set the listing below them is not showing, and the band costs no
 *   second derivation of anything. Nothing is re-fetched for it: there is no aggregate
 *   endpoint, and there does not need to be (brief §Data Model).
 * - **It reads the DEFERRED narrowing**, like the rows and the summary do, which is why it
 *   moves with them rather than a render ahead of them.
 *
 * The exception gutter down the left (`request-list-redesign` R15/R18/R20, BR5):
 *
 * - **The gutter is a real, permanently reserved first column** — two characters wide, on
 *   every row, for every reader, whether or not anything on the page needs marking. An
 *   empty gutter is the design and not wasted space: it is what makes a marked row
 *   findable by scanning one narrow column instead of reading nine. It is never dropped,
 *   hidden or collapsed, and an ordinary row's gutter carries NOTHING — no placeholder
 *   glyph, no dash (brief §Data Model settles R18 against R15/BR5).
 * - **Selection lives IN it, and the column it used to have of its own is gone** — removed,
 *   not hidden. What moved is only where the control sits: it is still the Shadcn
 *   `checkbox`, still named for the request it selects, still carrying its checked state
 *   and still disabled while a batch is in flight, so every selection semantic above holds
 *   unchanged and `lib/transactions/selecting.ts` is reused untouched. Restyled as one of
 *   the gutter's marks — square and unshadowed, so an unticked request reads as the
 *   taxonomy's hollow rule-box and a ticked one as the inked box — and never rebuilt as a
 *   `div` with a click handler, which would take no focus, answer no Space key and report
 *   no state.
 * - **The shapes are the shared mark's, not a second set** (`StatusMark` from
 *   `components/status/StatusBadge`, sized to the column). A decided request's decision is
 *   what its gutter carries, in the intent's own ink — named explicitly, because the row
 *   around it has receded and `currentColor` would mute the one thing still marking it.
 * - **A row that needs attention is marked by a rule down its outer edge** rather than by
 *   a shape in the two characters, because those two characters may already be carrying an
 *   offer to select the request — and a possible duplicate still awaiting a decision is
 *   exactly the row an Approver most needs to find. The wording stays beside the status
 *   (`PossibleDuplicateMark`), so the mark supplements words and never replaces them (BR3).
 * - **A decided row recedes, it does not disappear** (R20). It stays listed, keeps every
 *   value on it and keeps its controls working — the audit trail, and what a second
 *   Approver needs to see — and simply drops to ink-on-ground so only the requests still
 *   awaiting a decision hold full contrast. Not `aria-hidden`, not `aria-disabled`, not a
 *   dim: a relative contrast move, and one that stays comfortably readable.
 *
 * Watching the batch balance (`request-list-redesign` R17/R22, BR7/BR8):
 *
 * - **Before an irreversible decision commits, the screen ITSELF shows what the batch will
 *   look like afterwards** (R17/BR7) — not the confirmation's wording, which describes an
 *   outcome rather than showing one. Two things say it together: the control block states the
 *   OUTSTANDING count the batch will have while `RECORDS` and `DECIDED` go on stating what it
 *   is, so the three visibly do not add up; and every affected row carries the words `Not yet
 *   confirmed` beside its status. Both readings come from ONE derived set of ids
 *   (`awaitingConfirmationIds`), which is why they can never disagree.
 * - **Nothing about it is stored, and nothing about it is optimistic.** The set is a reading
 *   of the two confirmations this component already owned, so backing out of either restores
 *   every figure and every row exactly and decides nothing (AC-3) — there is no second state
 *   to unwind. What actually happened still arrives only by RE-READING, exactly as before.
 * - **The machinery underneath is untouched** (R1/BR2). `lib/transactions/deciding.ts`,
 *   `bulkApproval.ts` and `refreshing.ts` are reused as they shipped: the re-read before
 *   anything is sent, the already-decided refusal in its own words, the three-bucket outcome
 *   with its scoped retry, and the self-refresh with its pausing rules all behave identically.
 *   This is a presentation layer OVER them, never inside them.
 * - **The one orchestrated motion on this screen is the outstanding count settling** (R22/
 *   BR8) — see `BatchControlBlock` and the `figureRoll` keyframes in `globals.css`. It follows
 *   the count the batch ACTUALLY has, so a decision produces one settle rather than three
 *   (into the projection, back out of it, then down), and it is the reason this screen has no
 *   hover fills or row transitions to compete with it. It also belongs to the BATCH moving
 *   rather than to the block's figures moving: those figures describe the narrowed set (R21),
 *   so a keystroke in the search box re-states them — silently and instantly, with no roll
 *   and nothing announced, because narrowing what is described is not a decision. The block
 *   is handed the whole fetched set as well as the narrowed one and works the difference out
 *   itself; nothing here has to tell it which just happened.
 *
 * The continuation line at the foot (`request-list-redesign` R14):
 *
 * - **The listing states its own continuation** — `RECORDS 1–20 OF 428 · PAGE 1 OF 22` —
 *   instead of scattering those figures through a row of controls. It is
 *   `RequestListPagination`'s, derived from the same page slice the rows are drawn from,
 *   and it is the screen's ONLY statement of the records range and the page counter: a
 *   second copy anywhere (a narrow-width duplicate, a screen-reader-only one) would leave
 *   the reader with two answers to "where am I".
 * - **The rule between the listing and that line is ONE rule.** The full-bleed listing box
 *   below draws the closing hairline, and the foot deliberately draws none — see the
 *   comment at the `RequestListPagination` call.
 */

import { ArrowDown, ArrowUp, ArrowUpDown, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { ConfirmAction } from '@/components/common/ConfirmAction';
import { AppliedNarrowingSummary } from '@/components/requests/AppliedNarrowingSummary';
import { BatchControlBlock } from '@/components/requests/BatchControlBlock';
import { ExportRequestsAction } from '@/components/requests/ExportRequestsAction';
import {
  FIELD_LABEL_CLASS,
  FIGURE_CELL_CLASS,
  LISTING_EDGE_PADDING_CLASS,
  LISTING_ROW_CLASS,
  NOTATION_CELL_CLASS,
  PAGE_BLEED_CLASS,
  RULED_ACTION_CLASS,
  RULED_BAND_CLASS,
} from '@/components/requests/fieldNotation';
import { MaskedAccountNumber } from '@/components/requests/MaskedAccountNumber';
import { NotYetConfirmedMark } from '@/components/requests/NotYetConfirmedMark';
import { PossibleDuplicateMark } from '@/components/requests/PossibleDuplicateMark';
import { RejectionNoteStep } from '@/components/requests/RejectionNoteStep';
import { RequestActions } from '@/components/requests/RequestActions';
import { RequestCards } from '@/components/requests/RequestCards';
import { RequestDetailPanel } from '@/components/requests/RequestDetailPanel';
import { RequestListPagination } from '@/components/requests/RequestListPagination';
import { RequestNarrowingControls } from '@/components/requests/RequestNarrowingControls';
import {
  StatusBadge,
  StatusMark,
  statusInkFor,
} from '@/components/status/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/contexts/ToastContext';
import {
  DECISION_APPROVE,
  DECISION_REJECT,
  decisionFailureMessage,
  recordDecision,
} from '@/lib/api/decisions';
import {
  fetchTransactions,
  transactionListFailureMessage,
} from '@/lib/api/transactions';
import { UPLOAD_PATH } from '@/lib/auth/access-map';
import {
  isPageVisible,
  isPageVisibleOnServer,
  subscribeToPageVisibility,
} from '@/lib/layout/pageVisibility';
import {
  isNarrowViewport,
  isNarrowViewportOnServer,
  subscribeToViewportWidth,
} from '@/lib/layout/viewport';
import {
  BULK_APPROVE_ACTION_LABEL,
  BULK_APPROVE_CONFIRMATION_MESSAGE,
  BULK_APPROVE_CONFIRM_LABEL,
  BULK_APPROVE_REFUSED_TITLE,
  NOTHING_SENT_MESSAGE,
  OUTCOME_UNKNOWN_MESSAGE,
  approvedIn,
  bulkApprovalInFlightMessage,
  bulkApprovalOutcomeMessage,
  bulkApprovalOutcomeTitle,
  bulkApproveConfirmationTitle,
  eligibilityIn,
  retryRefusedApprovalsLabel,
  staleDecisionMessage,
  stalenessIn,
  submitApprovals,
} from '@/lib/transactions/bulkApproval';
import {
  DECISION_REFUSED_TITLE,
  WAY_OUT_OF_CONFIRMATION,
  awaitsDecision,
  confirmDecisionLabel,
  confirmationMessageFor,
  confirmationTitleFor,
  decisionInFlightMessage,
  decisionRecordedMessage,
  decisionRecordedTitle,
} from '@/lib/transactions/deciding';
import { transactionTypeLabel } from '@/lib/transactions/display';
import { possibleDuplicateIdsIn } from '@/lib/transactions/duplicates';
import {
  NARROWED_EMPTY_MESSAGE,
  NO_NARROWING,
  appliedNarrowings,
  narrowRequests,
  rangeReports,
  withFilterValue,
} from '@/lib/transactions/narrowing';
import {
  REQUEST_COLUMNS,
  nextSortFor,
  orderRequests,
  pageCountOf,
  pageOf,
  sortStateOf,
} from '@/lib/transactions/ordering';
import {
  CANNOT_REFRESH_MESSAGE,
  FAILED_REFRESHES_BEFORE_STALE,
  LAST_UP_TO_DATE_LEAD,
  LIST_REFRESH_INTERVAL_MS,
  REFRESH_RESUMES_MESSAGE,
  listRefreshedMessage,
  refreshedList,
} from '@/lib/transactions/refreshing';
import {
  NOTHING_SELECTED,
  SELECTION_COUNT_LABEL,
  SELECT_EVERYTHING_LISTED_LABEL,
  selectRequestLabel,
  selectableIdsIn,
  selectionCountMessage,
  withDecidedRequestsDropped,
  withIdsSelected,
  withSelectionToggled,
} from '@/lib/transactions/selecting';
import {
  rememberSort,
  rememberedSort,
  rememberedSortOnServer,
  subscribeToSort,
} from '@/lib/transactions/sortPreference';
import { PAGINATION } from '@/lib/utils/constants';
import { onScreenDateTime } from '@/lib/utils/dateTime';
import { ROLE_APPROVER } from '@/types/auth';
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_REJECTED,
  isKnownTransactionStatus,
} from '@/types/transactions';

import type {
  StatusIntent,
  StatusPresentation,
} from '@/components/status/StatusBadge';
import type { DecisionOutcome } from '@/lib/api/decisions';
import type {
  NarrowingField,
  RequestNarrowing,
} from '@/lib/transactions/narrowing';
import type {
  RequestColumn,
  RequestColumnDefinition,
  RequestSort,
} from '@/lib/transactions/ordering';
import type { RefreshedList } from '@/lib/transactions/refreshing';
import type { ProjectRole } from '@/types/auth';
import type {
  TransactionRead,
  TransactionReadList,
  TransactionStatus,
} from '@/types/transactions';

/** Announced while the list is being read, so the wait is not shapes and motion only. */
const LOADING_MESSAGE = 'Loading the expense requests…';

/** Said once the wait has gone on long enough to be worth mentioning (R11). */
const STILL_LOADING_MESSAGE =
  'Still loading the expense requests. This is taking longer than usual.';

/** Nothing has ever been imported — an answer, not a failure (R9/R17). */
const EMPTY_MESSAGE = 'No expense requests have been imported yet.';

/** The next step from that empty state: send a file in to be imported. */
const EMPTY_ACTION_LABEL = 'Submit an expense file';

/** Names what did not happen, so the alert is not just an apology. */
const FAILED_TITLE = 'Could not load the expense requests';

/**
 * Requests exist, but everything applied has hidden them all (R10/R18). This is not the
 * never-imported state and must not read like it — nothing here mentions importing, and
 * the upload action is not offered.
 *
 * The sentence itself lives with the narrowing (`lib/transactions/narrowing.ts`) because
 * the export path has to say the SAME thing when activating it produced no file
 * (csv-export BR2). It is re-exported here so every reader of this screen's wording — the
 * rows, the export, and anything asserting there is only ONE such sentence — reaches it
 * from one place.
 */
export { NARROWED_EMPTY_MESSAGE };

/** The way back, in the user's terms — Clear all sits with the summary above it. */
const NARROWED_EMPTY_HINT =
  'Change what is applied, or clear it all, to see the requests again.';

/**
 * Heads the column holding each row's controls. Not sortable — there is no value in it
 * to order by — and read by a screen reader only, since the controls in it name
 * themselves.
 */
const ACTIONS_COLUMN_LABEL = 'Actions';

/**
 * Heads the reserved gutter (`request-list-redesign` R15/BR5), read by a screen reader
 * only: what a sighted reader scans is the marks in the column, and a visible heading
 * over two characters would be wider than the column it names.
 *
 * The wording is pinned from two directions at once, and both are real:
 *
 * - it must SAY "exceptions", because a leftmost column of shapes is otherwise unnamed
 *   to anyone reading by name — the marks in it are the whole reason the column exists;
 * - it must NOT contain any word another column's heading contains (`status`, `amount`,
 *   `reference`, `file`, `date`, `account`, `description`, `type`). A heading of "Status
 *   mark" — the obvious choice — would make "the column headed status" ambiguous, and
 *   every surface that addresses a column by its own distinctive word (this screen's
 *   sort controls are addressed that way throughout) would then match two columns.
 */
const GUTTER_COLUMN_LABEL = 'Exceptions and selection';

/**
 * The full bleed, the ruled band, the listing's edge padding and the listed row's own
 * treatment all live in `fieldNotation.ts` now (`PAGE_BLEED_CLASS`, `RULED_BAND_CLASS`,
 * `LISTING_EDGE_PADDING_CLASS`, `LISTING_ROW_CLASS`, imported above): `files-view-redesign`
 * carries this same ruled listing onto the expense-files screens, and a second copy of any
 * of them under `components/files/` is how the rule weight or the bleed on one surface
 * quietly stops matching the rest (that epic's BR6).
 */

/**
 * The reserved gutter's own cell, for the heading row and for every listed row alike
 * (R15/BR5).
 *
 * Three things about it are the requirement rather than styling:
 *
 * - **`font-mono` and `w-[2ch]` together are the two-character width.** The width is
 *   stated in the notation this design measures a character in (Azeret Mono, the same
 *   face the references and figures beside it are set in), so "two characters" is
 *   literally two characters and not a rounded pixel value that drifts with the face.
 * - **It is on EVERY row and for EVERY reader**, which is what makes the column
 *   permanently reserved: an empty gutter is the design, because it is what leaves a
 *   marked row findable by scanning one narrow column instead of reading nine.
 * - **The left rule is always drawn**, transparent unless the row is an exception, so a
 *   marked row and an ordinary one line up to the pixel down the column.
 */
const GUTTER_CELL_CLASS = 'w-[2ch] border-l-2 border-l-transparent font-mono';

/**
 * The mark's own field inside that cell: exactly two characters wide whether or not it
 * holds anything, which is what reserves the column when nothing on the page needs
 * marking (BR5). Reserved by CSS rather than by a placeholder character — an ordinary
 * row's gutter carries no glyph and no dash (brief §Data Model).
 */
const GUTTER_MARK_BOX_CLASS = 'flex w-[2ch] items-center justify-center';

/** A mark in the gutter, drawn at the gutter's own width — the shape sized to the column. */
const GUTTER_MARK_CLASS = 'size-[2ch]';

/**
 * The selection control AS ONE OF THE GUTTER'S MARKS (R15/BR5/AC-3).
 *
 * It is still the Shadcn `checkbox` primitive underneath — a real, focusable control
 * that reports its own checked state and answers the Space key — restyled to the
 * gutter's notation and never replaced by a `div` with a click handler. Squared off
 * (nothing in this world has a radius) and stripped of the primitive's drop shadow, it
 * becomes the taxonomy's own hollow rule-box while a request is unticked and the inked
 * box once it is: the same two shapes the status marks beside it are drawn as, which is
 * what lets one narrow column carry both an exception and an offer to act.
 *
 * The focus ring is deliberately left exactly as the primitive draws it: a two-character
 * column is precisely where a focus indicator gets styled away, and a keyboard user has
 * to be able to see where they are (R5, WCAG 2.2 AA).
 */
const SELECTION_MARK_CLASS = `${GUTTER_MARK_CLASS} rounded-none shadow-none`;

/**
 * A row that needs attention, marked in the gutter as a rule down its outer edge — the
 * editorial change-bar a reader scans a margin for (R15: the gutter marks a row that
 * needs attention as well as one that has been decided).
 *
 * It is a RULE rather than a shape (R18's marks are a shape-and-rule taxonomy) because
 * the two characters themselves may already be carrying an offer to select the request:
 * a possible duplicate awaiting a decision is exactly the row an Approver most needs to
 * find, so the exception cannot be the thing that loses the gutter. The wording stays
 * beside the status where it always was (`PossibleDuplicateMark`), so the mark
 * supplements words and never replaces them (BR3).
 */
const EXCEPTION_RULE_CLASS = 'border-l-warning';

/**
 * A request somebody has already decided: still listed, still readable, but dropped to
 * ink-on-ground so only the requests still awaiting a decision hold full contrast
 * (R20). The batch visibly works itself towards zero.
 *
 * A relative contrast move, NOT a disabled state and not a dim: the row keeps every
 * value on it, its controls keep working, and the ink it drops to is the token the whole
 * app reads secondary text in — which stays well clear of the contrast bar in both
 * themes. What keeps its full ink is the decision itself: the gutter's mark, and the
 * status beside it.
 */
const DECIDED_ROW_CLASS = 'text-muted-foreground';

/* A figure cell and a fixed-field cell are `fieldNotation.ts`'s `FIGURE_CELL_CLASS` /
   `NOTATION_CELL_CLASS`, imported above — the files register, the import preview and the
   rejected rows read their identifiers and their counts in the same notation
   (`files-view-redesign` R11/R15/R16, BR6). */

/** A stable empty set, so narrowing is not recomputed while the list is not loaded. */
const NO_REQUESTS: TransactionRead[] = [];

/**
 * Nobody signed in, as far as this component can tell — which notifies nobody. Stable,
 * so the render that omits the prop does not look like a new set of roles each time.
 */
const NO_ROLES: ProjectRole[] = [];

/** Heads the Approver's notification when a load finds possible duplicates (R21). */
const DUPLICATES_FOUND_TITLE = 'Possible duplicates found';

/**
 * What the Approver is told: how many requests the load marked, why, and that nothing
 * has happened to them. ONE sentence for the load, however many requests were marked —
 * a notification per marked request would bury the screen it is pointing at.
 *
 * Always plural: a match takes at least two requests, so a load that marks anything
 * marks two or more.
 */
const duplicatesFoundMessage = (markedRequests: number): string =>
  `${String(markedRequests)} expense requests share an account number, amount and ` +
  'transaction date with another request. They are marked in the list; nothing has ' +
  'been decided on any of them.';

/**
 * The two thresholds R11/R19 fix. Real durations, deliberately not shortened or
 * made injectable: a threshold a test can move is a threshold nobody has to meet.
 */
const PLACEHOLDER_AFTER_MS = 300;
const STILL_LOADING_AFTER_MS = 3000;

/**
 * How many ruled placeholder rows stand in for the pending listing. Three: enough for the
 * ruling to read as a listing rather than as one bar, and few enough that the placeholder
 * never claims to know how many requests are on their way.
 */
const PLACEHOLDER_ROWS = [0, 1, 2];

/**
 * How much of the wait the user is shown: nothing at all, a placeholder standing in
 * for the pending list, or that placeholder plus a still-loading message.
 */
type WaitTier = 'brief' | 'placeholder' | 'prolonged';

/**
 * A decision the reader has been asked to confirm. Holding the request itself (not just
 * its id) is what lets the confirmation name it even as the list re-reads underneath.
 */
interface PendingDecision {
  request: TransactionRead;
  outcome: DecisionOutcome;
  /**
   * The reason a rejection carries (R2/R7). Written at the step before this one and
   * held here until the confirmation is accepted, so it travels with the decision
   * rather than being asked for again. An approval never has one (R9).
   */
  note?: string;
}

/**
 * A decision already on its way. Announced per REQUEST rather than as one shared "busy"
 * flag, so two decisions in flight at once cannot clear each other's announcement.
 */
interface DecisionInFlight {
  requestId: number;
  message: string;
}

/** Where the list is: being read, read, or unreadable. */
type ListState =
  | { phase: 'loading'; wait: WaitTier }
  | { phase: 'loaded'; requests: TransactionRead[] }
  | { phase: 'failed'; message: string };

const LOADING: ListState = { phase: 'loading', wait: 'brief' };

/**
 * What each recognised status MEANS (brief §Data Model, R14): an imported request is
 * simply where it stands, an approved one finished well, a rejected one was refused.
 * The colours and the shapes those intents wear belong to the shared mark.
 *
 * "Cancelled" is not here on purpose: it is a FILE state, and a cancelled file's
 * requests never reach this list (BR11). The shared mark keeps a neutral intent and its
 * ruled shape available for it, so its absence from this map is expected rather than an
 * omission.
 */
const STATUS_PRESENTATION: Record<TransactionStatus, StatusPresentation> = {
  [TRANSACTION_STATUS_IMPORTED]: { intent: 'informational' },
  [TRANSACTION_STATUS_APPROVED]: { intent: 'positive' },
  [TRANSACTION_STATUS_REJECTED]: { intent: 'negative' },
};

/**
 * The requests in a response body, tolerating a body that carries none: an absent
 * property is the empty list, which is a legitimate answer and not a failure.
 */
const requestsIn = (
  body: TransactionReadList | undefined,
): TransactionRead[] =>
  Array.isArray(body?.Transactions) ? body.Transactions : [];

/**
 * How one request's status reads, or `undefined` for a value this app has never heard
 * of — which the shared badge shows neutral, in the service's own words.
 */
const presentationOf = (
  request: TransactionRead,
): StatusPresentation | undefined =>
  isKnownTransactionStatus(request.Status)
    ? STATUS_PRESENTATION[request.Status]
    : undefined;

/**
 * Which of the shared shapes a request's own state puts in the gutter, and `undefined`
 * for the rows that carry none (R15/R18/BR5). Stated once and handed to BOTH
 * presentations — the wide row below and the narrow line-group (`RequestCards`) — so the
 * gutter cannot mark the same request two ways at two widths.
 *
 * Two readings are settled here, and both are deliberate:
 *
 * - **A request still awaiting a decision has an EMPTY gutter.** R18 reads as though
 *   every status should carry a shape, which would contradict R15/BR5's "empty on an
 *   ordinary row"; the brief's §Data Model settles it — the mark for "ordinary,
 *   undecided, no exception" is *empty*. That empty column is what makes the marked rows
 *   findable, so nothing stands in for it: no placeholder glyph, no dash.
 * - **A status this app has never heard of draws NO shape**, exactly as the shared mark
 *   treats it beside the word: a shape would claim a meaning the app does not have. The
 *   row still recedes, because it is no longer awaiting a decision.
 */
const gutterIntentOf = (request: TransactionRead): StatusIntent | undefined =>
  awaitsDecision(request) ? undefined : presentationOf(request)?.intent;

/**
 * One request's row: the service's values, its type in plain language, its status, and
 * the controls that open it.
 *
 * Memoised, and its props kept stable for that reason — the request itself, whether the
 * load marked it a possible duplicate, whether it is selected (plain booleans, so the
 * memo still holds), and callbacks that take the request rather than fresh closures per
 * row. A row's contents depend on nothing else, so a keystroke in the search box or a
 * range bound that leaves the page unchanged re-renders no rows at all. That is what
 * keeps a page render inside the feature NFR's 400ms p95 at the 10,000-row ceiling,
 * where every row carries controls of its own.
 *
 * `selected` being a BOOLEAN rather than the selection itself is the load-bearing half
 * of that: the list holds a set of ids, and handing that set to every row would defeat
 * this memo on every tick — and, once the list refreshes itself, on every poll.
 */
const ExpenseRequestRow = memo(function ExpenseRequestRow({
  request,
  possibleDuplicate,
  awaitingConfirmation,
  selectable,
  selected,
  selectionLocked,
  onToggleSelection,
  canDecide,
  handOffFocus,
  onFocusHandedOff,
  onOpen,
  onDecide,
}: {
  request: TransactionRead;
  possibleDuplicate: boolean;
  /**
   * Whether a decision on this request is waiting to be confirmed — the reader's own,
   * single or as part of a selection (R17/BR7). A plain boolean, so the memo still holds,
   * and the list's answer rather than this row's: the same value reaches the phone-width
   * line-group, so the mark cannot appear at one width and not the other.
   */
  awaitingConfirmation: boolean;
  /**
   * Whether THIS request may be selected: an Approver, and a request still awaiting a
   * decision (BR1). False means no control at all in the gutter — absent, never a
   * disabled tick (BR10). The gutter's cell is there either way: it is reserved for
   * every row and every reader (BR5), so the rows stay aligned with the heading row
   * whoever is signed in.
   */
  selectable: boolean;
  /** Whether this request is in the selection. A plain boolean, so the memo holds. */
  selected: boolean;
  /**
   * Whether the selection is being acted on right now, in which case the tick cannot be
   * moved (bulk-approval AC-4). This is the ONE place this screen shows a disabled
   * control rather than an absent one: it is transient state — the batch is in flight —
   * and not a permission, which BR10 keeps out of the markup entirely.
   */
  selectionLocked: boolean;
  /** Ticks or unticks this request; the list owns what is selected. */
  onToggleSelection: (request: TransactionRead) => void;
  /**
   * Whether this reader is offered a decision on THIS request. A plain boolean, worked
   * out by the list from who is signed in and the request's own status, so the memo
   * still holds and the row itself judges nothing.
   */
  canDecide: boolean;
  /** Whether this row's decide controls are the ones going away (see `RequestActions`). */
  handOffFocus: boolean;
  onFocusHandedOff: () => void;
  onOpen: (request: TransactionRead) => void;
  onDecide: (request: TransactionRead, outcome: DecisionOutcome) => void;
}) {
  /**
   * Whether this request has stopped awaiting a decision, which is what makes its row
   * recede (R20). Taken as "not awaiting one" rather than as a list of decided statuses,
   * so it agrees with the control totals above the listing — where DECIDED is likewise
   * the remainder — however the service's status vocabulary grows.
   */
  const decided = !awaitsDecision(request);
  const gutterIntent = gutterIntentOf(request);

  return (
    <TableRow
      className={`${LISTING_ROW_CLASS}${decided ? ` ${DECIDED_ROW_CLASS}` : ''}`}
    >
      {/* THE RESERVED GUTTER (R15/BR5) — this listing's first column, two characters
          wide, present and empty on an ordinary row and never collapsed away when
          nothing on the page needs marking.

          It carries at most one mark, because two characters hold one:
          - the request's own selection control, for an Approver looking at a request
            still awaiting a decision — selection lives IN the gutter, composed as one
            of its marks, and the column it used to have of its own is gone (AC-3);
          - otherwise the shape the shared mark draws for a decision already recorded,
            which is what carries that decision on a row that has receded (R20).
          An exception is the rule down the cell's outer edge, so it is never the thing
          the tick displaces. */}
      <TableCell
        className={`${GUTTER_CELL_CLASS}${possibleDuplicate ? ` ${EXCEPTION_RULE_CLASS}` : ''}`}
      >
        <span className={GUTTER_MARK_BOX_CLASS}>
          {selectable ? (
            <Checkbox
              className={SELECTION_MARK_CLASS}
              checked={selected}
              disabled={selectionLocked}
              onCheckedChange={() => {
                onToggleSelection(request);
              }}
              // Every listed request carries one of these, so the control says WHICH
              // request it selects rather than leaving a screen-reader user with a
              // column of identical "Select"s.
              aria-label={selectRequestLabel(request.Reference)}
            />
          ) : (
            gutterIntent !== undefined && (
              // The SAME shape the mark beside the status is drawn as — the shared
              // component's, sized to the column, never a second drawing of it. Ink
              // named here because the row around it has receded and the mark carrying
              // the decision must not recede with it.
              <StatusMark
                intent={gutterIntent}
                className={`${GUTTER_MARK_CLASS} ${statusInkFor(gutterIntent)}`}
              />
            )
          )}
        </span>
      </TableCell>
      <TableCell>{request.FileName}</TableCell>
      {/* The request's own identifier, in the notation this design reads a reference in
          (R13/AC-2). Its weight is the notation's, not an added emphasis: down a ruled
          column the fixed-width face is what makes one reference scannable against the
          next. */}
      <TableCell className={NOTATION_CELL_CLASS}>{request.Reference}</TableCell>
      <TableCell className={`${NOTATION_CELL_CLASS} whitespace-nowrap`}>
        {request.TransactionDate}
      </TableCell>
      {/* Mono is set on the CELL, so the one masking surface stays untouched: the same
          `MaskedAccountNumber` prints a failed file's rejected rows on a screen this epic
          does not restyle (R28), and it inherits whatever face the surface around it is
          set in. Masking has exactly one home and this is not it. */}
      <TableCell className={NOTATION_CELL_CLASS}>
        <MaskedAccountNumber accountNumber={request.AccountNumber} />
      </TableCell>
      <TableCell>{request.Description}</TableCell>
      <TableCell className={FIGURE_CELL_CLASS}>{request.Amount}</TableCell>
      <TableCell>{transactionTypeLabel(request.TransactionType)}</TableCell>
      <TableCell>
        {/* Where the request stands, and — beside it, in words — whether a decision on it
            is waiting to be confirmed (R17/BR7) and whether another request in the same
            load repeats it (R8). Each mark sits in the row itself so it is readable
            without opening anything, and each is one element carrying one phrase.

            The pre-commit mark comes FIRST because it is the most immediate thing about
            the row: the reader is being asked about this request right now. It is words
            rather than a shape in the gutter for two reasons — those two characters are
            usually already carrying the tick that put the decision in flight, and a mark
            with no accompanying text anywhere on the row would not satisfy R3 (BR3). */}
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge
            status={request.Status}
            presentation={presentationOf(request)}
          />
          {awaitingConfirmation && <NotYetConfirmedMark />}
          {possibleDuplicate && <PossibleDuplicateMark />}
        </div>
      </TableCell>
      {/* The row's own controls, held to the right-hand edge of the page so they read as
          one column of margin annotations down the listing rather than as a ragged band
          in the middle of it — the heading above them has been right-aligned all along. */}
      <TableCell className="text-right">
        <RequestActions
          reference={request.Reference}
          handOffFocus={handOffFocus}
          onFocusHandedOff={onFocusHandedOff}
          onOpen={() => {
            onOpen(request);
          }}
          onDecide={
            canDecide
              ? (outcome) => {
                  onDecide(request, outcome);
                }
              : undefined
          }
        />
      </TableCell>
    </TableRow>
  );
});

/** The arrow beside a heading. Decoration: the direction is in the name, not here. */
const SORT_ICONS = {
  ascending: ArrowUp,
  descending: ArrowDown,
  none: ArrowUpDown,
};

/**
 * One column's heading and the control that orders the list by it (R13/R15).
 *
 * The `columnheader` carries the state (`aria-sort`) and the button carries the
 * action, which is the standard accessible sorting pattern: a clickable `<th>` would be
 * unreachable by keyboard, and an arrow on its own would leave the direction to
 * eyesight alone. Only the column in force reports a direction — ordering is
 * single-field, so every other column says `none`.
 *
 * The heading is the screen's tracked micro-label notation (R13: 11px tracked mono column
 * heads), imported from `fieldNotation.ts` rather than restated — a column head and a
 * field label are the same object in this design. Two things about that are deliberate:
 * the capitals are `text-transform`, so the wording a screen reader is given still reads
 * as words and the sort control's accessible name is unchanged; and the head is set in
 * `--muted-foreground` so the ink belongs to the values beneath it rather than to the
 * words naming them. The primitive's hover fill is cancelled — a filled head is the panel
 * treatment this story removes — leaving the ghost variant's own ink change as the
 * pointer-and-keyboard state.
 */
function SortableColumnHeading({
  column,
  sort,
  onSort,
}: {
  column: RequestColumnDefinition;
  sort: RequestSort | null;
  onSort: (column: RequestColumn) => void;
}) {
  const direction = sortStateOf(sort, column.key);
  const SortIcon = SORT_ICONS[direction];

  return (
    <TableHead
      scope="col"
      aria-sort={direction}
      className={`text-muted-foreground${column.numeric === true ? ' text-right' : ''}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`${FIELD_LABEL_CLASS} -mx-2 hover:bg-transparent dark:hover:bg-transparent`}
        onClick={() => {
          onSort(column.key);
        }}
      >
        {column.label}
        {direction !== 'none' && (
          <span className="sr-only">, sorted {direction}</span>
        )}
        {/* Sized down to the head's own scale: at 11px a 16px glyph would out-weigh the
            word it belongs to. Still decoration — the direction is in the name. */}
        <SortIcon
          aria-hidden="true"
          className={direction === 'none' ? 'size-3 opacity-50' : 'size-3'}
        />
      </Button>
    </TableHead>
  );
}

interface ExpenseRequestListProps {
  /**
   * The recognised roles the signed-in person holds, from the server page that has the
   * session (`rolesOf(session)`) — this is a client component and cannot read it.
   *
   * It decides ONE thing: who is notified when a load finds a possible duplicate (R21,
   * the Approver only). The list itself is the same for both roles, and neither is
   * offered anything that changes a request (R20/BR1). Optional on purpose — a render
   * that omits it simply notifies nobody.
   */
  roles?: ProjectRole[];
  /**
   * The signed-in person's NAME, from the same server page (`displayNameOf(session)`).
   *
   * It exists for one purpose too: an export is attributed to whoever produced it
   * (csv-export R4 — the second half of that epic's mandatory compliance exception), and
   * this screen is where an export is asked for. Nothing here reads an identity from the
   * browser; this is handed down to the export control unchanged, exactly as
   * `SubmittedFileDetail` is handed its `actingUploader`. Optional for the same reason: a
   * render with no session behind it has no name to give.
   */
  exportedBy?: string;
}

export function ExpenseRequestList({
  roles = NO_ROLES,
  exportedBy,
}: ExpenseRequestListProps) {
  const [state, setState] = useState<ListState>(LOADING);
  /** Bumped by Try again; asking for the list again is what re-runs the read. */
  const [readsRequested, setReadsRequested] = useState(0);

  /**
   * What the user has applied. Every control reads this one, so each shows its own
   * chosen value the instant it is chosen.
   */
  const [narrowing, setNarrowing] = useState<RequestNarrowing>(NO_NARROWING);
  /** What the search box holds, spaces and all; the term applied is the trimmed one. */
  const [searchInput, setSearchInput] = useState('');

  /**
   * The ordering in force. It belongs to the SESSION, not to this component, so it
   * survives leaving the screen and coming back (R13) — watched as external state
   * rather than copied into a `useState` an effect would have to fill in.
   */
  const sort = useSyncExternalStore(
    subscribeToSort,
    rememberedSort,
    rememberedSortOnServer,
  );

  /** How many requests a page holds, and which page is being read (from 0). */
  const [pageSize, setPageSize] = useState<number>(
    PAGINATION.DEFAULT_PAGE_SIZE,
  );
  const [pageIndex, setPageIndex] = useState(0);

  /**
   * Which request is open, by id — never a copy of the request itself, so what the panel
   * shows is always the fetched set's own values. `null` is "the reader is on the list".
   */
  const [openRequestId, setOpenRequestId] = useState<number | null>(null);

  /**
   * Which requests are selected to be acted on together, by id (bulk-approval R2/R4).
   *
   * Ids, never row positions: the selection sits ABOVE the narrow → order → slice
   * pipeline, so a tick follows the request through a search that hides it, an ordering
   * that moves it and a page nobody is reading. The accepted consequence — a bulk action
   * may cover requests that are not on screen — is why the count is on screen at all
   * times and why the confirmation that gates the action names an exact figure.
   */
  const [selectedIds, setSelectedIds] =
    useState<ReadonlySet<number>>(NOTHING_SELECTED);

  /**
   * One request ticked or unticked. Stable, because every row and line-group holds it — and
   * it takes the REQUEST rather than being rebuilt per row, which is what keeps them
   * memoised through a selection change (see `ExpenseRequestRow`).
   */
  const toggleSelectionOf = useCallback((request: TransactionRead): void => {
    setSelectedIds((current) => withSelectionToggled(current, request.Id));
  }, []);

  /** The id the select-everything control and its wording are wired together by. */
  const selectEverythingId = useId();

  /**
   * Whether the Approver has been asked to confirm approving the whole selection
   * (R8/BR4). Nothing is read and nothing is sent while this is merely open: choosing
   * the bulk action only asks the question.
   */
  const [bulkApprovalAsked, setBulkApprovalAsked] = useState(false);

  /**
   * How many requests the batch now running was asked to approve, or `null` when no
   * batch is running. It is the selection's own size, announced the moment the Approver
   * accepts: the read that decides which of them are still eligible is a round trip
   * away, and a screen that says nothing at all after an accepted, irreversible action
   * is the worse answer. What the batch actually did is the outcome's business (R5).
   */
  const [bulkApprovalSubmitting, setBulkApprovalSubmitting] = useState<
    number | null
  >(null);

  /** Whether a batch is in flight — which locks the selection controls (AC-4). */
  const bulkApprovalRunning = bulkApprovalSubmitting !== null;

  /**
   * The same fact as a ref, for the ONE caller that cannot read it from state: the
   * "try again" control the failed-batch report carries (R10) is created while a batch
   * is still running, so the state it closed over says "running" forever. The ref is
   * read at the moment the control is taken, which is what the guard actually means.
   */
  const bulkApprovalInFlight = useRef(false);

  /**
   * The decision the reader is being asked to confirm, if any. Choosing Approve or
   * Reject only sets this: nothing is sent until the confirmation is accepted (R10).
   */
  const [pendingDecision, setPendingDecision] =
    useState<PendingDecision | null>(null);

  /**
   * The request whose rejection note is being written, if any (R7/R9/BR4). A step of
   * its own, before the confirmation: while this is open nothing has been sent and
   * nothing has been confirmed. `null` means no rejection is being written.
   */
  const [rejectionBeingWritten, setRejectionBeingWritten] =
    useState<TransactionRead | null>(null);

  /** The decisions currently on their way, one entry per request. */
  const [decisionsInFlight, setDecisionsInFlight] = useState<
    DecisionInFlight[]
  >([]);

  /**
   * The request whose decide controls are being taken off the screen, by id — the one
   * the Approver just decided, or the one a fresh read has just shown was decided by
   * somebody else. Its surface hands the keyboard to its own Open control rather than
   * letting a control disappear with focus on it (NFR1 — see this file's header).
   *
   * `null` the rest of the time. It STANDS until the request's own controls report the
   * hand-off done, because the read that withdraws them is a round trip away — and it
   * cannot fire twice or fire late, since the controls hand the keyboard over only on
   * the commit that takes them off the screen, which happens once per decision.
   */
  const [handOffFocusTo, setHandOffFocusTo] = useState<number | null>(null);

  /** The hand-off has happened; nothing is waiting for the keyboard any more. */
  const focusHandedOff = useCallback((): void => {
    setHandOffFocusTo(null);
  }, []);

  /** The app's one notification surface, in the root layout (R21, and R11/R15). */
  const { showToast } = useToast();

  /**
   * Which possible duplicates the user has already been told about, by request id. This
   * is a record of what has been SAID, not something rendered, so it lives in a ref —
   * the same arrangement `SubmittedFilesList` uses to tell a file that has just finished
   * from one that was already finished when the screen opened.
   *
   * It is what makes a dismissed notification stay dismissed: re-rendering the list for
   * any reason — a keystroke, a sort, a page change — finds nothing new to announce.
   */
  const duplicatesAlreadyAnnounced = useRef<Set<number>>(new Set());

  /**
   * Whether the reader is at phone width. The browser already knows before React runs,
   * so it is watched rather than copied into state (see `lib/layout/viewport.ts`).
   */
  const narrowViewport = useSyncExternalStore(
    subscribeToViewportWidth,
    isNarrowViewport,
    isNarrowViewportOnServer,
  );

  /**
   * Whether the reader is looking at this tab at all (BR6). The document knows before
   * React runs, so — like the width above — it is watched rather than copied into state.
   */
  const readerIsHere = useSyncExternalStore(
    subscribeToPageVisibility,
    isPageVisible,
    isPageVisibleOnServer,
  );

  /**
   * The requests the last successful read left on screen.
   *
   * A ref rather than state because it is what a LATER read is compared against, not
   * something rendered: the comparison happens inside a promise that resolved long
   * after the render it was started from, so reading the rows out of `state` there
   * would compare against whatever was on screen when the poll was scheduled.
   */
  const requestsOnScreen = useRef<TransactionRead[]>(NO_REQUESTS);

  /**
   * When this list was last genuinely current: the instant of the last read that
   * SUCCEEDED (R6/AC-5). A ref, because it is written on every read that lands and read
   * only when the notice below is raised — holding it in state would re-render the whole
   * list four times a minute to record something nobody is looking at.
   *
   * It starts as the moment the screen opened, which is the only honest answer before the
   * first read lands; every read that succeeds — the first load included — moves it on,
   * and no failure ever touches it.
   */
  const lastCurrentAt = useRef(Date.now());

  /**
   * How many reads in a row have failed SINCE THE LAST ONE THAT WORKED (BR9). A ref for
   * the same reason: counting to one changes nothing on screen.
   */
  const failedRefreshes = useRef(0);

  /**
   * When the list was last current, while it can no longer refresh itself — and `null`
   * whenever refreshing is working, which is what takes the notice away again.
   *
   * This is the ONE piece of all this that is rendered, so it is the one piece held in
   * state. It is set on the failure that reaches BR9's threshold and cleared by the next
   * read that succeeds, with no user action in between (R6).
   */
  const [cannotRefreshSince, setCannotRefreshSince] = useState<number | null>(
    null,
  );

  /**
   * A read landed: this is the moment the list was last current, and nothing is failing
   * any more.
   *
   * The state is touched only when there was something to clear, so the ordinary case —
   * a poll that simply worked — costs no render at all (NFR5).
   */
  const listIsCurrent = useCallback((): void => {
    lastCurrentAt.current = Date.now();
    if (failedRefreshes.current === 0) {
      return;
    }
    failedRefreshes.current = 0;
    setCannotRefreshSince(null);
  }, []);

  /**
   * A read failed. One is a hiccup and says nothing (AC-2); the second in a row is what
   * raises the notice, naming the moment recorded above rather than this one (AC-5).
   *
   * Further failures beyond the second re-state the same instant, so React holds the
   * render and the notice never stacks (AC-3).
   */
  const refreshFailed = useCallback((): void => {
    failedRefreshes.current += 1;
    if (failedRefreshes.current < FAILED_REFRESHES_BEFORE_STALE) {
      return;
    }
    setCannotRefreshSince(lastCurrentAt.current);
  }, []);

  /**
   * Puts a fresh read on screen without disturbing anything the reader arranged (BR8),
   * and answers with what it left there.
   *
   * Every request the read describes exactly as it already stood keeps the object it
   * had, and a read that changed nothing at all leaves the state object itself
   * untouched — so the narrowing, ordering, paging and duplicate marks are not
   * recomputed and no row re-renders (NFR5). The one thing it deliberately DOES change
   * is the selection: a request that has stopped awaiting a decision comes out of it and
   * the visible count corrects itself, with nothing raised about it.
   */
  const showFreshRequests = useCallback(
    (incoming: TransactionRead[]): RefreshedList => {
      // Whatever asked for it, this read landed — so this is the moment the list was
      // last current, and refreshing is working again (R6).
      listIsCurrent();

      const refreshed = refreshedList(requestsOnScreen.current, incoming);
      requestsOnScreen.current = refreshed.requests;

      setState((current) =>
        current.phase !== 'loaded' || current.requests === refreshed.requests
          ? current
          : { phase: 'loaded', requests: refreshed.requests },
      );
      setSelectedIds((current) =>
        withDecidedRequestsDropped(current, refreshed.requests),
      );

      return refreshed;
    },
    [listIsCurrent],
  );

  /**
   * Reads the list and puts what came back on screen.
   *
   * `stillWatching` is how a caller says its read no longer matters: this component
   * has gone away, or the user has asked for the list again.
   */
  const readList = useCallback(
    (stillWatching: () => boolean): Promise<void> =>
      fetchTransactions()
        .then((body) => {
          if (!stillWatching()) {
            return;
          }
          const requests = requestsIn(body);
          requestsOnScreen.current = requests;
          // The first load is the last moment the list was current, too (R6).
          listIsCurrent();
          setState({ phase: 'loaded', requests });
        })
        .catch((error: unknown) => {
          if (!stillWatching()) {
            return;
          }
          // The service's own wording when it sent one, from either place a failure
          // can carry it — never the client's placeholder, which is plumbing
          // (project.md NFR-base-5).
          setState({
            phase: 'failed',
            message: transactionListFailureMessage(error),
          });
        }),
    [listIsCurrent],
  );

  useEffect(() => {
    // A read still in flight when this component goes away — or when the user asks
    // for the list again — must not land on a screen that has moved on.
    let watching = true;

    /**
     * Moves the wait on one tier, and only while the list is still being read: a
     * timer that fires just after the answer arrived must not put a placeholder back
     * over rows that are already on screen.
     */
    const showWaitTier = (wait: WaitTier): void => {
      if (!watching) {
        return;
      }
      setState((current) =>
        current.phase === 'loading' ? { phase: 'loading', wait } : current,
      );
    };

    const placeholderTimer = setTimeout(() => {
      showWaitTier('placeholder');
    }, PLACEHOLDER_AFTER_MS);
    const stillLoadingTimer = setTimeout(() => {
      showWaitTier('prolonged');
    }, STILL_LOADING_AFTER_MS);

    const stopWaiting = (): void => {
      clearTimeout(placeholderTimer);
      clearTimeout(stillLoadingTimer);
    };

    void readList(() => watching).finally(stopWaiting);

    return () => {
      watching = false;
      stopWaiting();
    };
  }, [readsRequested, readList]);

  const readAgain = (): void => {
    setState(LOADING);
    // Asking for the list again starts the count over: what happens next is this read,
    // not the polls that failed before it.
    failedRefreshes.current = 0;
    setCannotRefreshSince(null);
    setReadsRequested((reads) => reads + 1);
  };

  /**
   * The term narrows as the user types (R6), with no timer in the way: a debounce long
   * enough to matter is a debounce the user waits out, and the responsiveness the
   * feature NFR asks for at the 10,000-row ceiling comes from `useDeferredValue` below
   * instead — React keeps the keystrokes smooth by re-filtering at lower priority.
   * Trimmed on the way in: surrounding spaces are typing, not something to narrow by.
   */
  const changeSearchInput = (value: string): void => {
    setSearchInput(value);
    setNarrowing((current) => ({ ...current, search: value.trim() }));
    setPageIndex(0);
  };

  /**
   * A filter choice, or one end of a range, applies as it is made — nothing to commit.
   * A range bound is kept exactly as it was typed; whether it can be used as a bound at
   * all is the narrowing layer's decision, not this screen's.
   */
  const changeFilter = (field: NarrowingField, value: string): void => {
    setNarrowing((current) => withFilterValue(current, field, value));
    setPageIndex(0);
  };

  /** R18: the search term and every filter go at once, and the whole set is back. */
  const clearAllNarrowing = (): void => {
    setSearchInput('');
    setNarrowing(NO_NARROWING);
    setPageIndex(0);
  };

  /**
   * R13: ascending the first time a column is asked for, descending the second. The
   * reader goes back to the first page, because the request that was at the top of page
   * three is not where they were looking once the whole list has been re-ordered.
   */
  const sortBy = (column: RequestColumn): void => {
    rememberSort(nextSortFor(sort, column));
    setPageIndex(0);
  };

  /** A different page size re-cuts the set, so it starts again from the first page. */
  const changePageSize = (size: number): void => {
    setPageSize(size);
    setPageIndex(0);
  };

  /**
   * Opening one request changes nothing else: the narrowing, the ordering and the page
   * are all left where they are, so closing the panel returns the reader to their place.
   *
   * Stable, because every row holds it: a callback rebuilt each render would make the
   * memoised rows re-render on every keystroke, which is the cost they exist to avoid.
   */
  const openRequest = useCallback((request: TransactionRead): void => {
    setOpenRequestId(request.Id);
  }, []);

  /** Back to the list. The panel goes away, and with it everything it was holding. */
  const closeOpenRequest = useCallback((): void => {
    setOpenRequestId(null);
  }, []);

  /**
   * Choosing a decision asks for it — it does not record it (R10/BR6). A rejection is
   * asked WHY first (R7/R9): the note step comes before the confirmation, and an
   * approval goes straight to it with nothing to write. Stable, because every row and
   * line-group holds it.
   */
  const askToDecide = useCallback(
    (request: TransactionRead, outcome: DecisionOutcome): void => {
      if (outcome === DECISION_REJECT) {
        setRejectionBeingWritten(request);
        return;
      }
      setPendingDecision({ request, outcome });
    },
    [],
  );

  /** Backing out of the note leaves the request exactly as it was — nothing sent. */
  const abandonRejectionNote = useCallback((): void => {
    setRejectionBeingWritten(null);
  }, []);

  /**
   * Reads the list again WITHOUT taking the rows off the screen, and answers with what
   * came back.
   *
   * Both halves of a decision go through this one read (brief BR1): the check BEFORE
   * anything is sent — is this request still awaiting a decision? — and the outcome
   * AFTER one is recorded, since the decide answer says nothing about the request's new
   * status. Putting what came back on screen is part of the same act, so the rows the
   * decision was judged against are the rows the reader is then looking at.
   *
   * It REJECTS when the read fails, so the caller can tell "the request has been
   * decided already" from "nobody could find out" and refuse rather than send blind.
   */
  const rereadRequests = useCallback(
    (): Promise<TransactionRead[]> =>
      fetchTransactions().then(
        (body) => showFreshRequests(requestsIn(body)).requests,
      ),
    [showFreshRequests],
  );

  /**
   * The same re-read where the answer is only ever the screen catching up. A read that
   * fails changes nothing: the last known rows stay, and the failed-load state is
   * reserved for a read that left the user with nothing.
   */
  const refreshList = useCallback(
    (): Promise<void> =>
      rereadRequests()
        .then(() => undefined)
        .catch(() => {
          // Nothing to say: the user is still looking at the requests they had.
        }),
    [rereadRequests],
  );

  /**
   * How much of somebody else's work has arrived on this list since the reader opened
   * it, and the polite line that says so (NFR2). A running total, because a live region
   * announces its CONTENTS CHANGING — see `listRefreshedMessage`.
   */
  const changesFromElsewhere = useRef(0);
  const [refreshNote, setRefreshNote] = useState('');

  /** Whether a poll is still out, so a tick never starts a second one beside it. */
  const pollInFlight = useRef(false);

  /**
   * One refresh: the list's own read again, put on screen in place, and announced
   * quietly if it brought anything.
   *
   * A read that FAILS says nothing and changes nothing — the reader keeps the requests
   * they had, exactly as every other re-read in this project behaves. What a screen says
   * once refreshing has stopped working altogether is story 5's, not this.
   */
  const pollForChanges = useCallback(
    (stillWatching: () => boolean): Promise<void> =>
      fetchTransactions()
        .then((body) => {
          // A poll that lands after the reader started their own bulk action, or after
          // this screen went away, must not put anything on it (BR7).
          if (!stillWatching()) {
            return;
          }
          const { changed } = showFreshRequests(requestsIn(body));
          if (changed === 0) {
            return;
          }
          changesFromElsewhere.current += changed;
          setRefreshNote(listRefreshedMessage(changesFromElsewhere.current));
        })
        .catch(() => {
          // Guarded exactly as the landing path above is, and for the same reason: a
          // poll whose answer no longer matters must not report on this screen either
          // way. Counting a failure that arrived after the reader started their own
          // bulk action, backgrounded the tab or left the screen would raise "this list
          // cannot refresh itself" about a read nothing was waiting for — and, on the
          // way out, would set state on a component that has gone.
          if (!stillWatching()) {
            return;
          }
          // The last known rows stay on screen (project convention) — a failed poll
          // never blanks the list, whichever way it failed. What it DOES do is count
          // (BR9): the second failure in a row is where the screen stops looking
          // current and says so.
          refreshFailed();
        }),
    [showFreshRequests, refreshFailed],
  );

  /** There are rows to keep current — nothing else is worth asking the service about. */
  const listLoaded = state.phase === 'loaded';

  /**
   * Whether the reader is part-way through their own bulk approval (BR7): the
   * confirmation is open, or the batch is running. Refreshing stops for both and
   * resumes the moment either ends — including when they simply back out.
   */
  const ownBulkActionUnderWay = bulkApprovalAsked || bulkApprovalRunning;

  /**
   * Whether refreshing has been stopped since the last read — so the reader coming back
   * to the tab is owed one STRAIGHT AWAY rather than being made to wait out the tick
   * they were away for (BR6). A ref, because it records what has happened rather than
   * anything rendered, and because the effect below is the only thing that reads it.
   */
  const owedACatchUp = useRef(false);

  /**
   * The list keeps itself current for as long as somebody is reading it (R3/BR6) — this
   * epic's deliberate extension of the project's stop-when-idle convention, since what
   * is being watched is other people's decisions and those never finish.
   *
   * One timer at most: it is tied to the three facts that decide whether it should be
   * running at all, not to every render, so a keystroke in the search box neither
   * restarts nor multiplies it. It goes when this component does.
   */
  useEffect(() => {
    if (!listLoaded) {
      return;
    }
    if (!readerIsHere) {
      // Nothing is asked of the service while nobody is looking at the answer.
      owedACatchUp.current = true;
      return;
    }
    if (ownBulkActionUnderWay) {
      // The reader's own action owns the list until it finishes; a poll now would race
      // it. Whether one is owed on the other side is left exactly as it was.
      return;
    }

    let watching = true;
    const stillWatching = (): boolean => watching;

    const refresh = (): void => {
      if (pollInFlight.current) {
        return;
      }
      pollInFlight.current = true;
      void pollForChanges(stillWatching).finally(() => {
        pollInFlight.current = false;
      });
    };

    if (owedACatchUp.current) {
      owedACatchUp.current = false;
      refresh();
    }

    const ticking = setInterval(refresh, LIST_REFRESH_INTERVAL_MS);

    return () => {
      watching = false;
      clearInterval(ticking);
    };
  }, [listLoaded, readerIsHere, ownBulkActionUnderWay, pollForChanges]);

  /**
   * The decision the reader has just accepted. The confirmation is already closing —
   * whichever way this turns out, the answer belongs on the screen behind it and not in
   * a dialog the Approver is left sitting in.
   */
  const recordPendingDecision = (): void => {
    if (pendingDecision === null) {
      return;
    }
    const { request, outcome, note } = pendingDecision;
    setPendingDecision(null);

    // One decision at a time PER REQUEST. Confirming closes the dialog, but the row
    // keeps its `Imported` status — and so its decide actions — until the re-read
    // lands, so the same request can be confirmed again while the first call is still
    // out. Sending a second would be a second decision on the request, and the first
    // call's `finally` below would take the "Recording your approval…" line off the
    // screen while the other was still on its way. The announcement already on screen
    // is the answer to a second press.
    if (
      decisionsInFlight.some((decision) => decision.requestId === request.Id)
    ) {
      return;
    }

    setDecisionsInFlight((current) =>
      current.some((decision) => decision.requestId === request.Id)
        ? current
        : [
            ...current,
            {
              requestId: request.Id,
              message: decisionInFlightMessage(outcome, request.Reference),
            },
          ],
    );

    // BR1, the whole of it: the request's CURRENT status, read fresh, before anything
    // is sent. Both decide operations answer the same envelope whether they recorded
    // the decision or refused it as already made, so this read — never the answer — is
    // the only thing that can tell an Approver somebody got there first.
    void rereadRequests()
      .then((requests) => {
        // The check itself lives in `lib/transactions/bulkApproval.ts` — one request
        // here, a whole selection there, and one rule for both: a decision goes out
        // only while a fresh read still shows the request awaiting one.
        const staleness = stalenessIn(requests, request.Id);

        if (staleness !== undefined) {
          // Refused here, with NOTHING sent (R4/R13): a decide call at this point
          // would be a second decision on the request, and its answer would look
          // exactly like a first one. The read above has already put what was
          // actually recorded on screen, so the Approver is left looking at that
          // rather than at the state they were acting on.
          showToast({
            variant: 'error',
            title: DECISION_REFUSED_TITLE,
            message: staleDecisionMessage(staleness),
            // Something the Approver has to act on (choose another request), so it
            // waits for them rather than fading while they read elsewhere (R11).
            duration: 0,
          });
          // Nothing was sent, but the request has still stopped awaiting a decision —
          // the read above put somebody else's decision on screen — so its controls are
          // going with the same commit and the keyboard needs somewhere to land.
          setHandOffFocusTo(request.Id);
          return;
        }

        return recordDecision({
          TransactionId: request.Id,
          Decision: outcome,
          // A rejection carries the reason written at the step before this one; an
          // approval carries none at all (R9), so the field is absent rather than
          // empty.
          ...(note === undefined ? {} : { UserNote: note }),
        }).then(() => {
          // Transient: the Approver asked for this and it happened, so it says so and
          // then clears itself (R11's 4-8s window, which the toast's default sits in).
          showToast({
            variant: 'success',
            title: decisionRecordedTitle(outcome),
            message: decisionRecordedMessage(outcome, request.Reference),
          });
          // The keyboard is handed over BEFORE that read can withdraw the control the
          // Approver is standing on (NFR1): asked for here, taken by the request's own
          // controls, whether they see this commit or the one the re-read brings.
          setHandOffFocusTo(request.Id);
          // The answer carries no status, so the request's new state comes from a
          // fresh read — which is also what withdraws its decide actions (R12).
          return refreshList();
        });
      })
      .catch((error: unknown) => {
        // Either the service refused the decision, or the read that had to come first
        // could not be made — and then nothing was sent, because a decision goes out
        // only while the app can see the request is still awaiting one (BR1). Both
        // are the same thing to the Approver: it was not recorded. So it waits for
        // them (R11) and carries the service's own reason, never the client's
        // placeholder.
        showToast({
          variant: 'error',
          title: DECISION_REFUSED_TITLE,
          message: decisionFailureMessage(error),
          duration: 0,
        });
      })
      .finally(() => {
        setDecisionsInFlight((current) =>
          current.filter((decision) => decision.requestId !== request.Id),
        );
      });
  };

  /**
   * One batch of approvals over the requests named (bulk-approval R1/R5/R9/R10,
   * BR1-BR5/BR11, NFR3). Four steps, in this order, and none of them is optional:
   *
   * 1. **A fresh read** — the requests are judged against the list as it stands NOW,
   *    not as it stood when the ticks were put in (BR2). A read that fails sends
   *    nothing at all: approvals go out only while the app can see which requests are
   *    still awaiting one.
   * 2. **The split** — every named request the read no longer shows awaiting a
   *    decision is dropped from the batch and no approve call is ever made for it
   *    (BR1). It is reported as left unchanged instead (R5).
   * 3. **One call per remaining request** (BR3), at a bounded concurrency (NFR3) so a
   *    selection that can run to thousands neither floods the service nor leaves the
   *    screen unusable. The selection and the bulk action are locked for the duration
   *    and the list itself stays readable.
   * 4. **A read back** — and the approved count comes from comparing that read with the
   *    one in step 1 (BR5), NEVER from the call answers. The service returns the same
   *    envelope whether it approved a request or found it already decided, so an
   *    implementation that trusted the answers would report a colleague's decision as
   *    one of this Approver's own.
   *
   * It takes the requests to act on as an ARGUMENT rather than reading the selection,
   * because it is run twice for the same batch: once for the whole selection, and
   * again — from the report's own "try again" control — for just the requests whose
   * calls FAILED (R10). That second run is the whole of BR11: the same four steps, so
   * the eligibility re-check happens again over the smaller subset and a request a
   * colleague decided in between comes back as left unchanged rather than being
   * approved twice. There is deliberately no second batch path.
   *
   * The three buckets it reports are kept strictly apart (R5/R10): approved is what
   * step 4's comparison shows changed, left unchanged is what step 2 never sent
   * (nothing went wrong — a colleague got there first), and could-not-be-submitted is
   * a call that failed. Only the last of those is a failure, and only it is retried.
   */
  const runBulkApproval = async (ids: readonly number[]): Promise<void> => {
    if (ids.length === 0 || bulkApprovalInFlight.current) {
      return;
    }
    bulkApprovalInFlight.current = true;
    setBulkApprovalSubmitting(ids.length);

    try {
      let before: TransactionRead[];
      try {
        before = await rereadRequests();
      } catch (error: unknown) {
        // Nothing was sent (BR2), so the selection is exactly as it was and the
        // Approver can simply ask again. The service's own reason, never the client's
        // placeholder (project.md NFR-base-5).
        showToast({
          variant: 'error',
          title: BULK_APPROVE_REFUSED_TITLE,
          message: `${transactionListFailureMessage(error)} ${NOTHING_SENT_MESSAGE}`,
          duration: 0,
        });
        return;
      }

      const { eligible, leftUnchanged } = eligibilityIn(before, ids);

      const attempts =
        eligible.length === 0
          ? []
          : await submitApprovals(eligible, (id) =>
              recordDecision({ TransactionId: id, Decision: DECISION_APPROVE }),
            );

      const refused = attempts.filter((attempt) => attempt.refused);
      const submitted = attempts
        .filter((attempt) => !attempt.refused)
        .map((attempt) => attempt.id);

      // Only worth a second read if something was actually sent; where nothing was,
      // the read taken before the batch is already the current state (NFR4).
      let after = before;
      if (submitted.length > 0) {
        try {
          after = await rereadRequests();
        } catch {
          showToast({
            variant: 'error',
            title: BULK_APPROVE_REFUSED_TITLE,
            message: OUTCOME_UNKNOWN_MESSAGE,
            duration: 0,
          });
          return;
        }
      }

      const tally = {
        selected: ids.length,
        approved: approvedIn(after, submitted).length,
        leftUnchanged: leftUnchanged.length,
        refused: refused.length,
      };

      /** Exactly the requests whose own call failed — the only bucket a retry covers. */
      const refusedIds = refused.map((attempt) => attempt.id);

      showToast({
        variant: refused.length === 0 ? 'success' : 'error',
        title: bulkApprovalOutcomeTitle(tally),
        message: bulkApprovalOutcomeMessage(
          tally,
          refused.length === 0
            ? undefined
            : decisionFailureMessage(refused[0].failure),
        ),
        // A completed batch confirms itself and fades (R11's window); one carrying
        // requests that could not be submitted is something the Approver has to act on,
        // so it waits for them and carries the way to act on it (R10, NFR-base-5).
        ...(refused.length === 0
          ? {}
          : {
              duration: 0,
              action: {
                label: retryRefusedApprovalsLabel(refusedIds.length),
                onAction: () => {
                  // No second confirmation: this bulk approval was confirmed when it
                  // started, and choosing a named, smaller subset is itself the
                  // deliberate act. Taking it dismisses this report, so the Approver
                  // is never left with two answers about the same batch.
                  void runBulkApproval(refusedIds);
                },
              },
            }),
      });

      // Whatever the batch decided — and whatever a colleague decided first — has
      // stopped awaiting a decision, so it stops being selectable and the count
      // corrects itself (BR8). Anything still awaiting one keeps its tick, which is
      // what leaves a refused request ready to be tried again.
      setSelectedIds((current) => withDecidedRequestsDropped(current, after));
    } finally {
      bulkApprovalInFlight.current = false;
      setBulkApprovalSubmitting(null);
    }
  };

  /** The bulk approval the Approver has just accepted: the whole selection (R1/R8). */
  const approveSelection = (): Promise<void> =>
    runBulkApproval([...selectedIds]);

  /**
   * What the listed requests and the summary are worked out from. It can trail the
   * controls by a render while React re-filters a large set, which is what keeps typing
   * responsive at the volume ceiling; it always catches up, and both surfaces read the
   * SAME value, so the summary can never name a narrowing the rows do not reflect.
   */
  const appliedNarrowing = useDeferredValue(narrowing);

  /** The whole fetched set — what the filters offer their choices from. */
  const fetchedRequests =
    state.phase === 'loaded' ? state.requests : NO_REQUESTS;

  /**
   * Which requests this load marks as possible duplicates (BR2/BR3), worked out over the
   * WHOLE fetched set and keyed on it — so it is derived once per load and not again
   * until the list is read again. Narrowing, ordering and paging all happen downstream
   * of this, and none of them can change what it holds (story 6 AC-5).
   *
   * A memo of the data, deliberately, not an effect: an effect would re-derive on every
   * render and re-raise the notification below with it.
   */
  const possibleDuplicateIds = useMemo(
    () => possibleDuplicateIdsIn(fetchedRequests),
    [fetchedRequests],
  );

  /**
   * Whether the person reading this is an Approver — the one R21 asks to be told about
   * possible duplicates, and the only one who may decide a request at all
   * (`expense-decisions` R14/BR7). Both answers come from the one `roles` prop the
   * server page fills; there is no second, client-side gate.
   */
  const isApprover = roles.includes(ROLE_APPROVER);

  /**
   * R21: when a load finds at least one possible duplicate, the Approver is told — ONCE
   * for the load, however many requests it marked, and only about requests they have not
   * already been told about. An Importer is told nothing: they see the marks in the list,
   * which is all R8 asks for.
   *
   * The notification does not time out. It is a warning the Approver is meant to act on
   * (by looking at the marked requests), so it stays until they dismiss it rather than
   * disappearing while they are reading elsewhere on the screen.
   */
  useEffect(() => {
    if (!isApprover) {
      return;
    }
    const announced = duplicatesAlreadyAnnounced.current;
    const newlyMarked = [...possibleDuplicateIds].filter(
      (id) => !announced.has(id),
    );
    if (newlyMarked.length === 0) {
      return;
    }
    newlyMarked.forEach((id) => announced.add(id));
    showToast({
      variant: 'warning',
      title: DUPLICATES_FOUND_TITLE,
      message: duplicatesFoundMessage(possibleDuplicateIds.size),
      duration: 0,
    });
  }, [isApprover, possibleDuplicateIds, showToast]);

  /** Recomputed only when the set or the narrowing changes, never per render. */
  const visibleRequests = useMemo(
    () => narrowRequests(fetchedRequests, appliedNarrowing),
    [fetchedRequests, appliedNarrowing],
  );
  const applied = useMemo(
    () => appliedNarrowings(appliedNarrowing),
    [appliedNarrowing],
  );
  /**
   * A range the user has entered the wrong way round. Read from the SAME value the rows
   * and the summary are, so the screen can never report a range it is quietly applying —
   * or apply one it says it has not.
   */
  const reports = useMemo(
    () => rangeReports(appliedNarrowing),
    [appliedNarrowing],
  );

  /**
   * The one pipeline: narrow → order → slice. The narrowed set is ordered ONCE per
   * change and the page is a slice of that array, which is what keeps a page render
   * inside the feature NFR's 400ms p95 at the 10,000-row ceiling.
   */
  const orderedRequests = useMemo(
    () => orderRequests(visibleRequests, sort),
    [visibleRequests, sort],
  );
  const pageCount = pageCountOf(orderedRequests.length, pageSize);
  /**
   * The page actually shown. Every control that changes the set underneath already
   * returns the reader to the first page; this keeps them on a real page even when the
   * set shrinks from somewhere else (the deferred narrowing catching up, a re-read
   * returning fewer requests), without a render-time state update to do it.
   */
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  const requestsOnPage = useMemo(
    () => pageOf(orderedRequests, currentPageIndex, pageSize),
    [orderedRequests, currentPageIndex, pageSize],
  );

  /**
   * What "select everything currently listed" covers: every still-`Imported` request
   * the search and filters LEFT (BR1) — read from the narrowed set, not from the page
   * on screen, which would quietly select twenty of a hundred, and not from the fetched
   * set, which would ignore the narrowing the user applied.
   */
  const selectableListedIds = useMemo(
    () => selectableIdsIn(visibleRequests),
    [visibleRequests],
  );

  /** How many requests are selected — the figure the ambient indicator reads out. */
  const selectedCount = selectedIds.size;

  /**
   * Whether everything currently listed is already selected. Deliberately binary rather
   * than a three-state tick: a partly-filled selection reads as "not everything", which
   * is the truth, and the exact figure is beside it in the count.
   */
  const everythingListedSelected =
    selectableListedIds.length > 0 &&
    selectableListedIds.every((id) => selectedIds.has(id));

  /**
   * Taking everything currently listed ADDS to the selection, so narrowing the list and
   * taking what is left cannot silently drop a request selected earlier. Unticking is
   * this screen's way to clear a selection, so it clears the whole of it — including
   * anything the current narrowing is hiding, which is the only reading under which
   * "clear" means what the user meant by it.
   */
  const changeEverythingListed = (takeEverything: boolean): void => {
    setSelectedIds((current) =>
      takeEverything
        ? withIdsSelected(current, selectableListedIds)
        : NOTHING_SELECTED,
    );
  };

  /**
   * The requests a decision is waiting to be confirmed on, by id (R17/BR7) — the pre-commit
   * state, and the ONE thing this story adds to the screen's state.
   *
   * Four things about it are deliberate:
   *
   * - **It is DERIVED, never stored.** It is a reading of the two confirmations this
   *   component already owns, so backing out of either one — the way out, Escape, or a
   *   selection emptying underneath it — restores every figure and takes every mark off by
   *   construction (AC-3). There is no second piece of state to forget to clear, and nothing
   *   optimistic anywhere: the machinery underneath is untouched and still learns what
   *   happened by re-reading (`lib/transactions/{deciding,bulkApproval,refreshing}.ts`).
   * - **The single decision takes precedence**, because `pendingDecision` is the more
   *   specific ask; the two confirmations are modal, so they cannot honestly be open at once.
   * - **The bulk half reads the SELECTION and the `bulkApprovalAsked` gate**, and the gate
   *   is what keeps the marks off the rows once the batch is under way: a request whose call
   *   was refused stays selected so it can be tried again (bulk-approval BR11), and it must
   *   not go on claiming a decision is awaiting confirmation on it.
   * - **The rejection note step is deliberately NOT in it.** The pre-commit state is the
   *   answer to "you are being asked to commit this"; while the note is being written nothing
   *   has been confirmed and nothing has been asked yet, and the reader is looking at the
   *   note step rather than at the batch behind it.
   */
  const awaitingConfirmationIds = useMemo<ReadonlySet<number>>(() => {
    if (pendingDecision !== null) {
      return new Set([pendingDecision.request.Id]);
    }
    return bulkApprovalAsked ? selectedIds : NOTHING_SELECTED;
  }, [pendingDecision, bulkApprovalAsked, selectedIds]);

  /**
   * The request the panel is showing, resolved from the fetched set rather than kept as
   * a copy — so the panel can never show a value the list no longer holds. A request
   * that is no longer there closes the panel rather than freezing an old version of it.
   */
  const openedRequest = useMemo(
    () =>
      openRequestId === null
        ? null
        : (fetchedRequests.find((request) => request.Id === openRequestId) ??
          null),
    [fetchedRequests, openRequestId],
  );

  return (
    <div className="grid gap-4">
      {/* Where this batch stands, before a row is read (R11) — the full-bleed control
          block that replaced this screen's page title. It is FIRST, in the markup as well
          as on the page, because it is what the reader came for.

          It is on screen only once there is a batch to describe: while the read is in
          flight, when it failed, and when nothing has ever been imported, this screen's
          existing answers stand on their own — a band of zeroes over a "nothing imported
          yet" message would be a fixture rather than a figure, and `RUN DATE` would have
          no value the data supports. */}
      {fetchedRequests.length > 0 && (
        <BatchControlBlock
          batch={fetchedRequests}
          listed={visibleRequests}
          narrowed={applied.length > 0}
          narrowedToFile={appliedNarrowing.fileName}
          selectedIds={selectedIds}
          awaitingConfirmationIds={awaitingConfirmationIds}
        />
      )}

      {/* What a refresh brought in, said quietly and to assistive technology only
          (NFR2): the rows changing is what a sighted reader sees, and nothing here may
          interrupt, steal the keyboard or need dismissing.

          It is in the markup from the start, empty, because a live region announces its
          CONTENTS changing — one added to the page at the moment it has something to
          say may never be read out at all. It carries `aria-live` rather than
          `role="status"` for the same reason it is here at all: this line has NOTHING to
          say until a refresh brings something in, and a `status` region would be a named,
          empty announcement region sitting on the screen the whole time. (The control
          block's outstanding count is the opposite case and is a `role="status"`: it
          always states a figure, and that figure moves under the reader.) */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {refreshNote}
      </p>

      {/* The list has stopped keeping itself current, and says so rather than going on
          looking live (R6/BR9). Deliberately NOT the failed-load `Alert`: that state is
          for a read that left the reader with nothing, this one leaves every row exactly
          where it was — and an `alert` would interrupt whatever they are doing, which
          NFR2 forbids for anything the background refresh does. So it is one polite
          `status` region, carrying no control of any kind: the timer never stopped, and
          the next read that works clears this by itself.

          The moment named is the last read that SUCCEEDED, written as a `<time>` so it
          means "a time" to assistive technology as well as to the eye. */}
      {cannotRefreshSince !== null && (
        <div
          role="status"
          className={`${RULED_BAND_CLASS} grid gap-1 py-3 text-sm`}
        >
          <p className="font-medium">{CANNOT_REFRESH_MESSAGE}</p>
          <p>
            {LAST_UP_TO_DATE_LEAD}{' '}
            <time dateTime={new Date(cannotRefreshSince).toISOString()}>
              {onScreenDateTime(new Date(cannotRefreshSince))}
            </time>
            .
          </p>
          <p className="text-muted-foreground">{REFRESH_RESUMES_MESSAGE}</p>
        </div>
      )}

      {state.phase === 'loading' && state.wait !== 'brief' && (
        <div role="status" className="grid gap-3">
          <span className="sr-only">{LOADING_MESSAGE}</span>
          {/* Placeholders stand in for the rows that are on their way, ruled and
              full-bleed exactly as those rows will be (R13/AC-6) — so the listing does
              not jump from a stack of floating boxes into a ruled page when the answer
              lands. Square, because nothing in this world has a radius. The sentence
              above is what a screen reader is given, since a shape says nothing. */}
          <div aria-hidden="true" className={`${PAGE_BLEED_CLASS} border-y`}>
            {PLACEHOLDER_ROWS.map((row) => (
              <div key={row} className="border-b px-4 py-3.5 last:border-b-0">
                <Skeleton className="h-4 w-full rounded-none" />
              </div>
            ))}
          </div>
          {state.wait === 'prolonged' && (
            <p className="text-muted-foreground text-sm">
              {STILL_LOADING_MESSAGE}
            </p>
          )}
        </div>
      )}

      {state.phase === 'failed' && (
        /* The read left the reader with nothing, so this band stands where the listing
           would be, ruled and full-bleed like it (R13/AC-6). The `alert` itself is
           stripped of the card the primitive ships with — no radius, no border of its
           own, no surface — and the band's own hairlines frame it, so a failure reads as
           this screen's own place rather than as a panel floating on the page. Its
           wording, its role and its retry are untouched. */
        <div className={`${RULED_BAND_CLASS} py-6`}>
          <Alert className="rounded-none border-0 bg-transparent p-0">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle className="line-clamp-none">{FAILED_TITLE}</AlertTitle>
            <AlertDescription className="text-foreground gap-3">
              <p>{state.message}</p>
              <Button
                type="button"
                variant="ghost"
                className={RULED_ACTION_CLASS}
                onClick={readAgain}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {state.phase === 'loaded' && state.requests.length === 0 && (
        /* Nothing has ever been imported — an answer, and with no card to sit inside it
           is composed as a band of its own (R13/AC-6): the same hairlines and the same
           full bleed the rows would have had, so the reader is looking at an empty
           listing rather than at a sentence on a blank page. The wording is unchanged. */
        <div
          className={`${RULED_BAND_CLASS} grid justify-items-start gap-5 py-10`}
        >
          <p className="text-muted-foreground max-w-prose">{EMPTY_MESSAGE}</p>
          {/* The next step, as a real navigational link rather than a button that
              pushes a route. Offered ONLY here: nothing has ever been imported
              (R9/R17), which is a different answer from a narrowing that hid
              everything (R10/R18) — see this file's header. */}
          <Button asChild variant="ghost" className={RULED_ACTION_CLASS}>
            <Link href={UPLOAD_PATH}>{EMPTY_ACTION_LABEL}</Link>
          </Button>
        </div>
      )}

      {state.phase === 'loaded' && state.requests.length > 0 && (
        <>
          {/* The ruled field strip (`request-list-redesign` R12/BR6), and on its first
              line the actions that belong WITH it: what the reader may do to the set the
              strip decides. Both lines run full-bleed to the layout's padding — the same
              `-mx-4 px-4` the control block above uses — so the strip's rules reach the
              edge of the page while its labels line up with the rows beneath it. The
              tighter gap is the strip's own; the screen's `gap-4` separates it from what
              is above and below. */}
          <div className="grid gap-3">
            {/* The hand-over file for the payment system (csv-export R1/R3), offered to
                both roles with no role check of any kind — see `ExportRequestsAction`.
                What it exports is `orderedRequests`: every request the search and filters
                LEFT, in the order the list is sorted, never the page on screen and never
                the whole fetched set (BR1). It sits above the controls that decide that
                set, so a keyboard user reaches it early. */}
            <div className="border-input -mx-4 flex flex-wrap items-center justify-end gap-x-6 gap-y-2 border-b px-4 pb-3">
              {/* The selection controls, offered to an Approver and to nobody else —
                  absent from the markup for anyone else rather than disabled (R7/BR10),
                  which is what makes the exclusion structural. They sit AHEAD of the rows
                  so a keyboard user meets "take everything listed" before the requests
                  themselves, and beside the count, which is where the bulk action joins
                  them. */}
              {isApprover && (
                <div className="mr-auto flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={selectEverythingId}
                      checked={everythingListedSelected}
                      disabled={bulkApprovalRunning}
                      onCheckedChange={(takeEverything) => {
                        changeEverythingListed(takeEverything === true);
                      }}
                      // Named here as well as beside itself, so what a screen reader is
                      // given and what a sighted reader sees are one string.
                      aria-label={SELECT_EVERYTHING_LISTED_LABEL}
                    />
                    <Label
                      htmlFor={selectEverythingId}
                      className={`${FIELD_LABEL_CLASS} text-muted-foreground`}
                    >
                      {SELECT_EVERYTHING_LISTED_LABEL}
                    </Label>
                  </div>

                  {/* R4: on screen the whole time a selection is live, and NOT on it at
                      all once nothing is selected — an indicator reading "0 selected" is
                      a permanent fixture rather than an answer. Announced politely
                      (`status`), since the figure moves under a reader who is doing
                      something else. */}
                  {selectedCount > 0 && (
                    <p
                      role="status"
                      aria-label={SELECTION_COUNT_LABEL}
                      className="font-mono text-sm tabular-nums"
                    >
                      {selectionCountMessage(selectedCount)}
                    </p>
                  )}

                  {/* The action the selection leads to (R1), beside the count it acts
                      on and offered only while there IS a selection — an Approve with
                      nothing selected has nothing to act on, and the count and the
                      action belong on screen together. Named for the SELECTION, so it
                      can never be confused with the "Approve request TXN-…" control
                      every listed request carries. Disabled only while a batch of its
                      own is running (AC-4): transient state, not a permission.

                      It keeps its filled weight where the strip's other actions are
                      ruled text: this is the one control on the line that COMMITS
                      something irreversible. */}
                  {selectedCount > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={bulkApprovalRunning}
                      className={`${FIELD_LABEL_CLASS} rounded-none`}
                      onClick={() => {
                        setBulkApprovalAsked(true);
                      }}
                    >
                      {BULK_APPROVE_ACTION_LABEL}
                    </Button>
                  )}
                </div>
              )}

              <ExportRequestsAction
                listedRequests={orderedRequests}
                exportedBy={exportedBy}
              />
            </div>

            {/* The choices come from the WHOLE fetched set, so a filter always offers
                its own way back out of what it narrowed to.

                A range the wrong way round is reported INSIDE the strip and applied
                nowhere: the list stays as it was, which is the whole point (R7 against
                R10/R18). The report is handed to the strip rather than drawn here,
                because the underline-only fields carry the error state in the notation
                now that there is no border left to carry it — and it is read from the
                SAME narrowing the rows and the summary are, so the screen can never
                report a range it is quietly applying. */}
            <RequestNarrowingControls
              requests={state.requests}
              searchInput={searchInput}
              onSearchInputChange={changeSearchInput}
              narrowing={narrowing}
              onFilterChange={changeFilter}
              rangeReports={reports}
            />
          </div>

          {applied.length > 0 && (
            <AppliedNarrowingSummary
              applied={applied}
              onClearAll={clearAllNarrowing}
            />
          )}

          {/* One line per decision on its way. Announced, because nothing on screen
              has changed yet: the request keeps its status until the re-read. */}
          {decisionsInFlight.map((decision) => (
            <p
              key={decision.requestId}
              role="status"
              className="text-muted-foreground text-sm"
            >
              {decision.message}
            </p>
          ))}

          {/* The batch on its way, announced the same polite way and in ONE element:
              the rows keep their place and their statuses until the read that follows
              the calls, so without this the screen would look inert for the duration. */}
          {bulkApprovalSubmitting !== null && (
            <p role="status" className="text-muted-foreground text-sm">
              {bulkApprovalInFlightMessage(bulkApprovalSubmitting)}
            </p>
          )}

          {visibleRequests.length === 0 ? (
            /* The narrowing has hidden every request: the listing's own place, ruled and
               full-bleed like the rows it is standing in for (R13/AC-6), so the reader can
               see WHERE the requests went from rather than a message adrift under the
               strip. Still not the never-imported state — no upload action, and the
               wording is untouched (R10/R18). */
            <div className={`${RULED_BAND_CLASS} grid gap-2 py-10`}>
              <p className="max-w-prose">{NARROWED_EMPTY_MESSAGE}</p>
              <p className="text-muted-foreground max-w-prose text-sm">
                {NARROWED_EMPTY_HINT}
              </p>
            </div>
          ) : (
            /* One presentation or the other, never both: see this file's header. */
            <>
              {narrowViewport ? (
                <RequestCards
                  requests={requestsOnPage}
                  presentationOf={presentationOf}
                  gutterIntentOf={gutterIntentOf}
                  possibleDuplicateIds={possibleDuplicateIds}
                  awaitingConfirmationIds={awaitingConfirmationIds}
                  maySelect={isApprover}
                  selectedIds={selectedIds}
                  selectionLocked={bulkApprovalRunning}
                  onToggleSelection={toggleSelectionOf}
                  mayDecide={isApprover}
                  handOffFocusTo={handOffFocusTo}
                  onFocusHandedOff={focusHandedOff}
                  onOpenRequest={openRequest}
                  onDecideRequest={askToDecide}
                />
              ) : (
                /* The listing runs full-bleed to the page padding (R13/AC-1): the box is
                   widened past `<main>`'s `px-4` so every hairline row rule reaches the
                   edge of the page, exactly as the strip's rule above it does, while the
                   values inside keep that padding through the outer cells. The closing
                   hairline is drawn here rather than on the last row, which the primitive
                   deliberately leaves unruled — a listing worked down a page needs a
                   bottom edge as much as it needs the rules between its rows. That one
                   rule is also the continuation line's top edge (R14), which is why the
                   foot beneath it draws none of its own.
                   There is no card, no panel and no striped-row treatment left around it;
                   what frames the listing is the ruling. */
                <div className={`${PAGE_BLEED_CLASS} border-b`}>
                  <Table className={LISTING_EDGE_PADDING_CLASS}>
                    {/* The caption names the columns in the order they are
                        read, the reserved gutter included. It stays SHORT on
                        what the gutter's marks mean: the states themselves are
                        named in words in the row's own status column, and a
                        caption that restated them would put this screen's
                        phrases on the page twice over. */}
                    <TableCaption className="sr-only">
                      Imported expense payment requests: a narrow reserved
                      column down the left carrying each request&apos;s mark,
                      and the control that selects it where you may select one;
                      then the file each came from, its reference, transaction
                      date, the last four digits of its account number, its
                      description, amount, transaction type and status, and the
                      controls each request offers — opening it, and, where one
                      is still awaiting a decision and you may make it,
                      approving or rejecting it on its own. Every value heading
                      orders the list by its own column.
                    </TableCaption>
                    <TableHeader>
                      {/* Drawn from the column definitions, so every displayed
                          column has a sort control (R13) rather than most of
                          them having one. */}
                      <TableRow className={LISTING_ROW_CLASS}>
                        {/* The reserved gutter's own heading (R15/BR5). It is
                            here for EVERY reader — the column is permanently
                            reserved, so the listing has the same columns
                            whoever is signed in — and it is not sortable:
                            there is no value in the column to order by, and
                            the marks in it belong to the row's other columns
                            anyway. */}
                        <TableHead scope="col" className={GUTTER_CELL_CLASS}>
                          <span className="sr-only">{GUTTER_COLUMN_LABEL}</span>
                        </TableHead>
                        {REQUEST_COLUMNS.map((column) => (
                          <SortableColumnHeading
                            key={column.key}
                            column={column}
                            sort={sort}
                            onSort={sortBy}
                          />
                        ))}
                        {/* The controls column: no value in it, so nothing to
                            order by. */}
                        <TableHead scope="col" className="text-right">
                          <span className="sr-only">
                            {ACTIONS_COLUMN_LABEL}
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requestsOnPage.map((request) => (
                        <ExpenseRequestRow
                          key={request.Id}
                          request={request}
                          possibleDuplicate={possibleDuplicateIds.has(
                            request.Id,
                          )}
                          awaitingConfirmation={awaitingConfirmationIds.has(
                            request.Id,
                          )}
                          selectable={isApprover && awaitsDecision(request)}
                          selected={selectedIds.has(request.Id)}
                          selectionLocked={bulkApprovalRunning}
                          onToggleSelection={toggleSelectionOf}
                          canDecide={isApprover && awaitsDecision(request)}
                          handOffFocus={handOffFocusTo === request.Id}
                          onFocusHandedOff={focusHandedOff}
                          onOpen={openRequest}
                          onDecide={askToDecide}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}

          {/* The listing's continuation line — `RECORDS 1–20 OF 428 · PAGE 1 OF 22`
              — and the controls that move through it (R14). Always on the screen,
              whether or not there is anywhere to page to (R12), including when the
              narrowing has left nothing listed.

              It deliberately brings NO rule of its own: the hairline closing the
              listing above it (drawn on the full-bleed box below) is the single rule
              between the last row and this line, and is therefore the line's own top
              edge as well. Two hairlines a `gap-4` apart with nothing between them
              read as an empty band rather than as a closed listing — so if either
              side ever changes, the rule stays ONE. */}
          <RequestListPagination
            total={orderedRequests.length}
            pageSize={pageSize}
            onPageSizeChange={changePageSize}
            pageIndex={currentPageIndex}
            pageCount={pageCount}
            onPageChange={setPageIndex}
          />

          {/* One request at a time, over the list. It is MOUNTED only while open, which
              is what makes its reveal die with it (POPIA — see `RequestDetailPanel`);
              the list keeps its narrowing, ordering and page underneath, so closing
              puts the reader back exactly where they were. */}
          {openedRequest !== null && (
            <RequestDetailPanel
              key={openedRequest.Id}
              request={openedRequest}
              statusPresentation={presentationOf(openedRequest)}
              onDecide={
                isApprover && awaitsDecision(openedRequest)
                  ? (outcome) => {
                      askToDecide(openedRequest, outcome);
                    }
                  : undefined
              }
              onClose={closeOpenRequest}
            />
          )}
        </>
      )}

      {/* Why, before anything is confirmed (R7/R9/BR4) — and only for a rejection.
          Mounted only while a note is being written, and it decides nothing itself:
          the note it hands back is what opens the confirmation below. */}
      {rejectionBeingWritten !== null && (
        <RejectionNoteStep
          key={rejectionBeingWritten.Id}
          reference={rejectionBeingWritten.Reference}
          onNoteWritten={(note) => {
            setRejectionBeingWritten(null);
            setPendingDecision({
              request: rejectionBeingWritten,
              outcome: DECISION_REJECT,
              note,
            });
          }}
          onCancel={abandonRejectionNote}
        />
      )}

      {/* Asked from the row's own controls and from the opened request alike, so it lives
          out here with the flow it belongs to rather than inside either of them. It is
          mounted only while a decision is pending: closing it is what ends the ask. */}
      {pendingDecision !== null && (
        <ConfirmAction
          open
          onOpenChange={(stillAsking) => {
            if (!stillAsking) {
              setPendingDecision(null);
            }
          }}
          title={confirmationTitleFor(
            pendingDecision.outcome,
            pendingDecision.request.Reference,
          )}
          description={confirmationMessageFor(pendingDecision.outcome)}
          confirmLabel={confirmDecisionLabel(pendingDecision.outcome)}
          wayOutLabel={WAY_OUT_OF_CONFIRMATION}
          onConfirm={recordPendingDecision}
        />
      )}

      {/* The same shared confirmation, asked of the whole selection (R8/BR4): the
          SAME dialog the single decision uses, never a second convention. Its title
          carries the selection's literal count however large it is — the `99+` form
          belongs to the ambient indicator alone — and it names no account number, the
          confirmation being a listing surface like the list behind it.

          It is gated on `bulkApprovalAsked` ALONE — never also on there still being a
          selection. The control that opens it exists only while something is selected,
          so it can never open empty; but a selection CAN empty underneath it (a single
          decision started a moment earlier lands and prunes the one request that was
          ticked), and a dialog that unmounts on its own never reports itself closed.
          `bulkApprovalAsked` would then stay true for good — which is also what pauses
          the self-refresh, so the list would silently stop keeping itself current for
          the rest of the session. Confirming an empty selection does nothing
          (`runBulkApproval` refuses it), and either answer clears the flag. */}
      {bulkApprovalAsked && (
        <ConfirmAction
          open
          onOpenChange={(stillAsking) => {
            if (!stillAsking) {
              setBulkApprovalAsked(false);
            }
          }}
          title={bulkApproveConfirmationTitle(selectedCount)}
          description={BULK_APPROVE_CONFIRMATION_MESSAGE}
          confirmLabel={BULK_APPROVE_CONFIRM_LABEL}
          wayOutLabel={WAY_OUT_OF_CONFIRMATION}
          onConfirm={() => {
            void approveSelection();
          }}
        />
      )}
    </div>
  );
}
