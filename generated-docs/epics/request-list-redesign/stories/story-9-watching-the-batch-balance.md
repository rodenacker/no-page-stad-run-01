# Story 9: Watching the batch balance

| Field | Value |
|---|---|
| Epic | `request-list-redesign` |
| Slug | `story-9-watching-the-batch-balance` |
| Route | `/requests` |
| Target file | `web/src/components/requests/ExpenseRequestList.tsx` |
| Page action | `modify_existing` |
| Roles | Approver |
| Requirement IDs | R17, BR7, R22, BR8, R1, BR2 |
| Infrastructure only | false |

## Plain summary

Before you commit a decision you can see the batch as it will be afterwards — the affected rows marked, and the outstanding count visibly not balancing until you confirm. When you do confirm, the count rolls down in place without anything on the screen jumping, the row goes quiet and takes its mark. If you have asked your computer to reduce animation, it simply snaps straight to the same result.

## Summary

Adds the epic's one orchestrated motion grammar. Before an irreversible decision commits — single or bulk — the affected rows show inked-but-unbalanced against the control total as a visible state change on the rows and/or the control block, not merely as dialog copy, and the total visibly does not balance until confirmation. On resolution the `AWAITING DECISION` figure decrements with a mechanical tabular digit roll at zero layout shift while the row inks its gutter mark and desaturates; the bulk case rolls once for the resolved batch. Under `prefers-reduced-motion` the transition snaps to the identical end state. All existing decision machinery runs unchanged.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Before a single decision is confirmed, the affected row is visibly marked and the outstanding count visibly does not balance — you can see what the batch will look like afterwards, on the screen itself and not only in the confirmation's wording. | `vitest` |
| AC-2 | Before a bulk approval is accepted, the same unbalanced state is visible for every selected request, alongside the confirmation naming the exact count. | `vitest` |
| AC-3 | Backing out of either confirmation puts the rows and the figures back exactly as they were, and nothing is decided. | `vitest` |
| AC-4 | When a decision resolves — one request or a whole selection — the outstanding count rolls down in place with nothing on the screen jumping or shifting, while the row goes quiet and takes its mark. | `playwright` |
| AC-5 | With reduced motion asked for, the same end state is reached instantly with no animation — the same decremented count, the same quiet row, the same mark. | `playwright` |
| AC-6 | Everything the decision flow already did still happens: the check for a decision made by someone else in the meantime, the refusal of an already-decided request, the report of which of a bulk selection succeeded and which did not, and the list keeping itself current on its own. | `vitest` |

## Manual test checklist

- As an Approver, start approving a request and stop before confirming → the row is marked and the outstanding count visibly does not add up yet
- Cancel that confirmation → the row and the figures go straight back to how they were and nothing was decided
- Confirm the approval → the outstanding count rolls down in place, nothing on the screen jumps, and the row goes quiet with its mark
- Select several requests and bulk-approve → the confirmation names the exact count, you see the unbalanced state first, then the count rolls once for the whole lot
- Turn on your computer's 'reduce motion' setting and approve again → no animation at all, but exactly the same result on screen
- With the list open, have someone else decide a request → its row goes quiet and takes its mark, and the count corrects itself without you doing anything

## Implementation notes

**This story touches the most dangerous code in the epic.** It rewires the area around the decide and bulk-approve flows, all of which shipped and all of which must behave identically (R1, BR2, AC-6). Reuse `web/src/lib/transactions/{deciding,bulkApproval,refreshing}.ts` untouched; this story adds a **presentation layer over** them, not inside them.

**BR7 — the proof line is a visible state change, not dialog copy.** It must appear on the affected row(s) and/or the control block, before **both** a single-decision confirmation and a bulk-approve confirmation is accepted. A confirmation dialog that merely *describes* the outcome does not satisfy R17. AC-3's revert-on-cancel is the other half: backing out restores rows and figures exactly, and decides nothing.

**The digit roll must work *with* the existing reduced-motion rule.** `globals.css` already ends with a global `@media (prefers-reduced-motion: reduce)` block forcing animation and transition durations to `0.01ms` app-wide. The roll must reach its correct end state under that rule rather than fighting it with a competing declaration. **AC-5 is a functional-equivalence requirement, not an accessibility courtesy** — both paths render the same information at the same moment.

**Zero layout shift is why the figures are tabular.** The roll changes digits in place. If the figure is not set in a tabular/monospaced face, the block reflows as `316 → 315 → 99`, and AC-4 fails on the "nothing jumps" clause.

**One orchestrated motion, and only one (BR8).** Do not add scattered hover-effect motion elsewhere on the screen to compete with it. This is the screen's entire motion grammar.

**Bulk rolls once**, for the resolved batch — not once per request. The three-bucket outcome report (approved / skipped / failed) and partial-failure retry from `bulk-approval-and-live-refresh` are unchanged, and the roll reflects only what actually resolved.

**Non-obvious coupling — do not break it.** The bulk-approve confirmation is gated on `bulkApprovalAsked` **alone and deliberately not also on the selection being non-empty**; an inline comment explains that a dialog which unmounts itself never reports itself closed, which would leave self-refresh **paused for the rest of the session**. This story rewires exactly that area. That gate must survive.

### What "does not balance" means, mechanically (pinned by this story's Vitest spec)

Neither brief states this, so the spec fixes it: while a decision is awaiting confirmation, **`AWAITING DECISION` states the projected figure** while **`RECORDS` and `DECIDED` still state what the batch actually is** — so the three visibly do not add up. **`DECIDED` must not move with it.** Moving both re-balances the block and there is nothing left for the reader to see, which defeats R17 entirely. Confirm this reads right by eye at MANUAL-TEST.

**The pre-commit wording is `NOT YET CONFIRMED`.** New surface owned by this story, pinned in the spec, used two ways:
- As a control-block label-over-figure pair — **absent** while nothing is pending (this project's convention: an indicator reading `0` is a fixture, not an answer).
- As the row mark, in the `StatusBadge` grammar — **words on the row**, because per BR3 a gutter shape alone would not satisfy R3.

**The figures must carry their labels as accessible names** (`aria-labelledby` pointing at the visible tracked label is the natural markup). This story's spec requires it; story 2 builds the block. Programmatic labelling is additive, so one implementation satisfies both — but **story 2 must not render the figures as bare numerals beside unassociated text**, or this story's tests fail on work story 2 owns.

**The `bulkApprovalAsked` gate is load-bearing for AC-6, not incidental.** It is what pauses self-refresh so a colleague's decision lands in the pre-submit read. AC-6 *uses* it. No test forces it to change — and none should.

**The count you decrement must use story 2's definition.** `AWAITING DECISION` is `Status === Imported` and `DECIDED` is `Status !== Imported` — **not** the existing `countRequests()` helper's `approved + rejected` (see story 2's notes). If this story recomputes the figure a different way from story 2, the roll will land on a number that disagrees with the band it lives in.

**Self-refresh is part of AC-6.** A request another approver decides arrives via refresh: its row desaturates and inks its mark, and the control totals correct themselves with no user action. The refresh cadence and its pausing rules are unchanged.
