# Story 2: The batch's outstanding count, at a glance

| Field | Value |
|---|---|
| Epic | `request-list-redesign` |
| Slug | `story-2-the-batchs-outstanding-count-at-a-glance` |
| Route | `/requests` |
| Target file | `web/src/app/(authenticated)/requests/page.tsx` |
| Page action | `modify_existing` |
| Roles | Importer, Approver |
| Requirement IDs | R11, R16, R19, R21, R25, BR4 |
| Infrastructure only | false |

## Plain summary

The screen now opens with a full-width blue band stating where the batch stands — how many requests there are, how many are still waiting for a decision, how many are done, and what it all adds up to — with the number still waiting for a decision the biggest thing on the screen. Narrow the list and those figures follow the narrowing; select some requests and it also tells you how many and how much you are about to commit.

## Summary

Replaces the "Expense requests" page heading with a full-bleed `--brand-accent` control block rendering `BATCH / RUN DATE / RECORDS / AWAITING DECISION / DECIDED / TOTAL VALUE` as tracked mono labels over tabular figures, `AWAITING DECISION` at display scale (roughly 8:1 against its 11px label, no invented middle tier). All figures are derived client-side from the `TransactionRead[]` the list already holds — no new fetch, no new field. Recomputes the figures over the narrowed set whenever a search or filter is applied, keeping the full-batch record count beside them struck through, and shows a live selected count and selected total value whenever a selection exists.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | The screen opens with a full-width blue band carrying the batch, run date, record count, the number awaiting a decision, the number decided and the total value — each as a small label over its figure — and there is no page title sitting above the list any more. | `vitest` |
| AC-2 | The number of requests awaiting a decision is unmistakably the biggest thing on the screen; no heading, app name or other figure comes close to it. | `none` |
| AC-3 | The figures state the truth about the batch — how many requests there are in total, how many are still awaiting a decision, how many have been decided, and the sum of their amounts. | `vitest` |
| AC-4 | Applying a search or a filter re-states the figures for just what is left, and keeps the whole-batch record count beside them with a line through it; clearing the narrowing puts the whole-batch figures back and the struck-through figure disappears. | `playwright` |
| AC-5 | While requests are selected, the band also says how many are selected and what they add up to; with nothing selected, neither appears at all. | `vitest` |
| AC-6 | The band reads as an official control document rather than a till receipt — the saturated blue field is present and full-width in both light and dark. | `none` |

## Manual test checklist

- Open the request list → a full-width blue band tops the screen and the outstanding count is the biggest thing on it, by a wide margin
- Count the requests awaiting a decision yourself on a small batch → the band's figure matches
- Type something in the search box → the band's figures change to describe what is left, and the original record count stays beside them with a line through it
- Clear the narrowing → the figures go back to describing the whole batch and the struck-through figure vanishes
- As an Approver, tick two requests → the band tells you how many are selected and their total value; untick them and that disappears
- Switch to dark → the band is still a solid blue field, still readable, and does not look like a printed receipt

## Implementation notes

**`BATCH` and `RUN DATE` are settled — do not invent an alternative.** Per the brief's *Resolved spec gap* section: with no originating-file narrowing, `BATCH` reads `ALL FILES` and `RUN DATE` shows the newest `TransactionDate` in the fetched set; when the originating-file filter narrows to one file, `BATCH` sharpens to that file's name and `RUN DATE` to that file's newest `TransactionDate`. Both derived client-side.

**Derivation (brief §Data Model).** `RECORDS` = count of the full fetched set; `AWAITING DECISION` = count where `Status === Imported`; `DECIDED` = count where `Status !== Imported`; `TOTAL VALUE` = sum of `Amount` over the full fetched set. Narrowed figures are the same four recomputed over whatever the existing narrow pipeline leaves. **Reuse `web/src/lib/transactions/narrowing.ts` and `selecting.ts` — do not reimplement either.**

**Spend the tokens that already exist.** `--brand-accent` / `--brand-accent-foreground` are declared in both `:root` and `.dark` and are currently used nowhere. This story is what spends them. Per R25 the field is `--brand-accent`, full-bleed.

**Full-bleed means full-bleed to the layout's padding, not past it.** `AppHeader` uses `px-4` and `(authenticated)/layout.tsx` gives `<main>` the same `px-4` — that pairing is what lines the app name up with the content beneath it. If either changes, both must.

**BR4 is a hard constraint, not a preference:** `AWAITING DECISION` is the single largest typographic element on the screen. Nothing — not the app name in the header, not a column head, not `TOTAL VALUE` — competes with it. AC-2 is judged by eye at manual test, so err large.

**Feature NFR — do not let this read as a receipt.** Mono figures at density go cold; the saturated field is the one thing holding the institutional register. Do not soften it to a tint or a border.

**⚠ Do NOT reuse `countRequests()` for `DECIDED`.** The existing `countRequests()` helper (built for the `file-deletion` confirmation) defines `decided = approved + rejected`. The brief defines `DECIDED` as `Status !== Imported`. **These are not the same**: a row carrying a status outside the three recognised values counts as neither in `countRequests()`, but must count as `DECIDED` here. Reusing that helper ships a wrong outstanding count — the single figure this whole screen is built around. Derive `DECIDED` as `Status !== Imported` and `AWAITING DECISION` as `Status === Imported`, so the two always sum to `RECORDS`.

**⚠ `transactionsForNarrowing()` alone CANNOT catch the `countRequests()` bug.** For that set, `Status !== Imported` and `approved + rejected` **both answer 3** — so a test using only that fixture would pass against the wrong definition. Story 2's Vitest spec therefore composes one extra row in a status outside the three recognised values, giving `RECORDS 9 · AWAITING 5 · DECIDED 4 · TOTAL VALUE 27136.31`, and asserts `DECIDED` does **not** read `3`. Keep that row if you touch the test; without it the definition is unobservable.

### ⚠ How the figures must be marked up — pinned by story 9's specs, built here

Story 9 depends on addressing these figures, so this story's markup decides whether story 9 can pass. Both of story 9's specs fix the contract:

- **Each figure carries its label as its accessible name** — `aria-labelledby` pointing at the visible tracked label is the natural markup. Do **not** render the figures as bare numerals beside unassociated text; visible label text alone is not enough.
- **`AWAITING DECISION` is a `role="status"` live region**, named by its own visible mono label **via `aria-labelledby`, never `aria-label`** — `aria-label` would freeze the live region's name. Its text must be the count **and nothing else**. This is required because the figure moves with no user action at all when self-refresh brings in a colleague's decision (AC-6), and it follows the app's existing `SELECTION_COUNT_LABEL` pattern.

Getting this wrong means story 9's tests fail on work story 2 owns — the most annoying kind of cross-story failure to diagnose.

**Known-good fixture for the aggregate tests.** `transactionsForNarrowing()` in `web/src/mocks/data/transaction.ts` is the natural fixture — three originating files, all three statuses, and verified-by-execution aggregates: `RECORDS 8 · AWAITING 5 · DECIDED 3 · TOTAL VALUE 26136.31` (sums exactly, no float artefact). Narrowed: file `5001` → `3 / 2 / 1 / 16337.32`; file `5002` → `4 / 2 / 2 / 9148.99`; file `5003` → `1 / 1 / 0 / 650`. State these figures **literally** in tests — never recompute them with the logic under test, which would assert nothing.

**⚠ `RUN DATE` test trap.** File `5002`'s newest `TransactionDate` is identical to the whole-set newest (`2026-04-30 17:45:00`), so a test that narrows to `5002` passes even against a broken `RUN DATE` implementation. Narrow to `5001` (`2026-04-15 11:03:00`) or `5003` (`2025-11-20 09:05:00`), whose values genuinely differ from the whole-set value.

**The page is a server component today.** These aggregates are client-derived from data the client component holds, so the control block needs to live where that data lives (or receive it) — decide the seam deliberately rather than lifting the fetch into the server component, which would change behaviour.
