# Story 3: Filter by amount range and date range

- **Epic:** `expense-request-list` — The shared expense request list
- **Slug:** `story-3-amount-and-date-range-filters`
- **Requirements:** R3, R7, R10, R18
- **Roles:** Finance Uploader (`ROLE_IMPORTER`), Approver (`ROLE_APPROVER`) — both read-only
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary

You can also narrow the list to an amount range and a transaction date range. Give just a lower bound, just an upper bound, or both — requests sitting exactly on a bound are included. If you enter a range the wrong way round the screen tells you instead of quietly emptying the list, and the ranges work alongside the search and the other filters, clearing together with them.

## Technical summary

Adds two **two-bound** filters to story 2's narrowing layer:

- an **amount range** compared numerically against the `Amount` number — never as text (9.99 must not fall inside 100–200 by string order);
- a **transaction date range** compared chronologically against `TransactionDate` as the service writes it, with the upper day bound covering a value that carries a time of day (a request stored as `2026-04-15 15:00:00` falls inside a range whose latest bound is `2026-04-15`).

Either bound may be given alone, and **both bounds are inclusive**. An upper bound below the lower bound is reported in place and **not applied**, leaving the previously visible set alone rather than producing an unexplained empty list — and it does not count as active narrowing for the narrowed-empty state.

Both ranges join story 2's existing active-narrowing summary and are cleared by its clear-all. The bound inputs must be typeable / `fill`-able rather than calendar-popover-only, so the epic's keyboard-completability sweep (story 4, AC-6) can evidence them.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Giving only a lower bound — a minimum amount, or an earliest transaction date — narrows the list to the requests at or above that bound, with the other end left open. | playwright |
| AC-2 | Giving only an upper bound — a maximum amount, or a latest transaction date — narrows the list to the requests at or below that bound, with the other end left open. | playwright |
| AC-3 | Giving both bounds narrows the list to the requests inside the range, and a request sitting exactly on either bound is included — including a request dated on the last day of a date range whose stored value carries a time of day. | playwright |
| AC-4 | An upper bound below the lower bound is reported on the screen as the wrong way round, is not applied, and leaves the visible requests as they were rather than emptying the list. | vitest |
| AC-5 | The amount range and the date range narrow alongside the search term and the other filters, appear in the summary of what is currently applied, and are removed by clear-all with everything else. | playwright |
| AC-6 | Amounts are compared as numbers and dates chronologically, so a request of 9.99 is outside a 100-to-200 range and a request from an earlier year is outside a range whose bounds fall in a later one. | vitest |

## Manual test checklist

- Enter a minimum amount only → only requests at or above it remain; enter a maximum only → only requests at or below it remain
- Enter both amount bounds → only requests inside the range remain, including any request whose amount is exactly the minimum or exactly the maximum
- Do the same three checks with the date range — earliest only, latest only, both → the same behaviour on transaction dates, and a request dated on the last day of the range is included
- Enter a minimum higher than the maximum → the screen tells you the range is the wrong way round and the list stays as it was, rather than going empty
- Combine an amount range, a date range and a status → all three narrow the list together and all three show in what's applied
- Click 'Clear all' → both ranges empty along with the search and the other filters, and every request comes back
- Check an amount like 9.99 against a range of 100 to 200 → it is left out (amounts are compared as numbers, not as text)

## Infrastructure reuse notes

- The bound inputs must be **typeable** (Shadcn `input`, already installed) — a calendar-popover-only date picker cannot be driven by the keyboard sweep in story 4 AC-6 or filled reliably by Playwright. If a calendar affordance is added it must be **in addition to** a typeable field, never instead of it.
- Both ranges must plug into story 2's active-narrowing summary and clear-all rather than carrying their own parallel reset — one source of truth for "what is currently applied".
- Colour, type face and radius come only from the tokens in `web/src/app/globals.css` — no hex literals, no Tailwind palette utilities.
- `vitest.setup.ts` already supplies the jsdom stand-ins Radix needs (`matchMedia`, pointer capture, `scrollIntoView`), required if any bound control uses a `popover`.
- Do not build server-side query support: `GET /v1/transactions` accepts no parameters. Range filtering is in-memory over story 1's single fetched set.

## Notes

- **`[USER-DIRECTED]` scope addition.** The amount-range and date-range filters were added by the user at the stories approval (2026-08-05); the brief's R7 originally named only status and originating file. R7 has been updated to carry the full filter set. `documentation/requirements-application.md` does not contain these filters.
- **Why this is its own story rather than part of story 2.** Two-bound filters differ in kind from a pick-one dropdown: one bound or both, boundary inclusivity, an invalid-range case, and numeric-vs-chronological comparison. Five filters plus search in one story would have carried ~11 acceptance criteria, over the per-story cap.
- **Sharpens the epic's date-format assumption.** The date range compares `TransactionDate` as the service writes it, so inconsistent formatting (or a time of day on some rows only) can silently exclude requests that do fall inside the range — a request dated on the **last day** of the range is the most likely casualty. This is recorded in `state.json.epic.unverifiedAssumptions` for the manual-test approval; do not "fix" it by guessing a normalisation the service has not confirmed.
- The invalid-range behaviour is deliberately *report and don't apply*, not *apply and show an empty list* — an empty list with no explanation is the failure mode R10/R18 exist to prevent.
