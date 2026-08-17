# Story 8: The same listing on a phone

| Field | Value |
|---|---|
| Epic | `request-list-redesign` |
| Slug | `story-8-the-same-listing-on-a-phone` |
| Route | `/requests` |
| Target file | `web/src/components/requests/RequestCards.tsx` |
| Page action | `modify_existing` |
| Roles | Importer, Approver |
| Requirement IDs | R4, R10, R5, BR2 |
| Infrastructure only | false |

## Plain summary

On a narrow screen the requests stop being a stack of cards and become the same ruled listing, tightened — each request one group of lines showing its reference, a couple of key values and a menu for its actions, with the left-hand marks still readable and nothing needing sideways scrolling.

## Summary

Replaces `RequestCards`' Shadcn `Card`-per-request treatment — an explicit anti-goal of this direction — with a narrow-viewport form of the same ruled listing: one line-group per request carrying the primary identifier, two to three key values and an action overflow, the reserved gutter mark still legible, and no horizontal page scroll at 360px. Keeps one list item per request for assistive technology, and keeps selection, decide and open behaviour identical to the wide presentation and to what shipped.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | On a 360px-wide screen each request is one group of ruled lines — not a card — showing its reference, two to three key values and a menu for its actions, with no sideways scrolling of the page. | `playwright` |
| AC-2 | The left-hand mark stays readable at that width, and each request is still announced as one item in a list. | `playwright` |
| AC-3 | Opening a request, selecting it and deciding it all still work at that width, by tapping and by keyboard. | `playwright` |
| AC-4 | The band at the top still states where the batch stands at that width, and the number awaiting a decision is still the biggest thing on the screen. | `playwright` |
| AC-5 | Nothing is reachable only on a wide screen — every action offered on the desktop listing is offered on the narrow one. | `playwright` |

## Manual test checklist

- Narrow the browser to phone width → requests become ruled line-groups, not cards, and you never have to scroll sideways
- Check a marked row at phone width → the left-hand mark is still easy to see
- As an Approver at phone width, tick a request and approve it → it works exactly as on the desktop screen
- Look at the top band at phone width → it still tells you where the batch stands and the outstanding count is still the biggest thing
- Compare the actions available at phone width with those on a wide screen → nothing is missing

## Implementation notes

**`RequestCards.tsx` composes Shadcn `Card`, which is a named anti-goal of this direction (brief §4).** It is **replaced, not extended.** The file name may stay for continuity, but a card-per-request treatment must not survive.

**Keep the existing viewport switch.** `web/src/lib/layout/viewport.ts` already decides the narrow/wide crossover the list switches presentation on. This story keeps that switch and changes **only the narrow presentation**. Do not re-derive the breakpoint or introduce a second one.

**One `listitem` per request — this is load-bearing.** At phone width the requests are the page's only list, which is why `RequestListPagination` deliberately avoids `ul`/`li` (see story 7). Keep exactly one list item per request; adding a second nested list, or dropping the list semantics for a stack of `div`s, breaks assertions carried from earlier epics.

**UI-23 (R4) is precise:** primary identifier, **two to three** key values, and an action **overflow** — not every column crammed in, and not a horizontal scroll. Sideways page scroll at 360px is a hard fail.

**AC-5 is the parity check that catches real regressions.** Every action available on the desktop listing must be reachable at narrow width — open, select, approve, reject, export. It is easy to lose one to an overflow menu that was never wired up.

**AC-4 spans two stories.** The control block belongs to story 2, but it must still hold its composition and BR4's scale dominance at 360px — where a six-figure control block is hardest to lay out. Expect the block to reflow (stacking or dropping to two columns) while `AWAITING DECISION` stays the largest element.

**Touch targets.** A gutter mark that is also the selection control must still meet the minimum touch target at phone width (WCAG 2.2 AA, target size) — the two-character *visual* gutter can carry a larger *hit* area.
