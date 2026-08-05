# Story 4: Sort and page through the request list

- **Epic:** `expense-request-list` — The shared expense request list
- **Slug:** `story-4-sort-and-page`
- **Requirements:** R12, R13
- **Roles:** Finance Uploader (`ROLE_IMPORTER`), Approver (`ROLE_APPROVER`) — both read-only
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary

Every column can be sorted, ascending on the first click and descending on the second, and the sort you chose stays put for the rest of your session. Page controls with a 5 / 10 / 20 / 50 page-size choice are always on screen — greyed out rather than hidden when everything fits on one page — and everything is usable with the keyboard alone.

## Technical summary

Adds single-field sorting (ascending then descending, active column visibly indicated, choice persisted for the session) and pagination with an always-visible page-size selector defaulting to **20**, **disabled rather than removed** when the narrowed set fits one page.

Sorting and paging compose with the narrowing from stories 2–3 — they operate on the **narrowed** set, in memory, sized for the 10,000-row ceiling with a p95 400ms per-page render budget (`project.md` Baseline NFRs / brief Feature NFRs).

Carries the epic's **accessibility baseline**: one real-browser axe scan plus a keyboard sweep of search, all five filters (including story 3's range bounds), sort and pagination against the project's WCAG 2.2 AA bar and its full-keyboard-completability requirement.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Activating a column heading orders the list by that column ascending; activating the same heading again orders it descending. | playwright |
| AC-2 | The column and direction currently ordering the list are visibly indicated, and the same ordering still applies after leaving the screen and returning within the session. | playwright |
| AC-3 | Page controls and a page-size choice of 5, 10, 20 and 50 are always on the screen, showing 20 requests per page until changed, and choosing a different size changes how many appear on one page. | playwright |
| AC-4 | When the current set of requests fits on a single page, the page controls remain on the screen but cannot be used. | vitest |
| AC-5 | Sorting and paging act on the requests left by the current search and filters, not on the whole fetched set. | playwright |
| AC-6 | The screen passes an automated accessibility check in a real browser, and searching, filtering, sorting and changing pages can each be completed using the keyboard alone with a visible focus indicator throughout. | playwright |

## Manual test checklist

- Click a column heading → the list orders by it; click again → the order reverses, and the heading shows which way it is sorted
- Go to another screen and come back → the same ordering is still applied
- Look at the page controls → they are always there, showing 20 per page to start; choose 50 → more requests appear on one page
- Narrow the list until it fits on one page → the page controls are still visible but greyed out
- With a filter applied, sort and page → only the filtered requests are ordered and paged
- Put the mouse away and use only Tab, the arrow keys and Enter/Space → you can search, filter, sort and change pages, and you can always see where you are

## Infrastructure reuse notes

- Install the Shadcn `pagination` primitive if it is genuinely missing: `(cd web && npx shadcn add pagination --yes)`. The pinned `shadcn` version in `web/package.json` keeps generated output stable — do not use a moving `@latest`.
- The page-size selector is a fixed set of choices, so it must be the Shadcn `select`, **never a native `<select>`** — the keyboard-completability bar cannot be evidenced against an OS-drawn option list.
- `vitest.setup.ts` already supplies the jsdom stand-ins Radix needs (`matchMedia`, pointer capture, `scrollIntoView`).
- Sorting and paging read the *narrowed* set from stories 2–3, not the raw fetched set — one narrowing pipeline, applied before ordering and slicing.
- Colour, type face and radius come only from the tokens in `web/src/app/globals.css` — no hex literals, no Tailwind palette utilities.
- Playwright alert/status queries must be scoped to a region (e.g. `getByRole('main').getByRole('alert')`) — Next renders a permanently empty body-level `role="alert"` route announcer.

## Notes

- AC-6 is where this epic's real-browser accessibility scan runs, and it deliberately covers **story 3's range bounds too** — this is why those bounds must be typeable rather than calendar-popover-only.
- "Persisted for the session" (AC-2) means the sort survives leaving and returning to the screen within the session; it does not require server-side or cross-session persistence.
- Disabled-not-hidden (AC-4) is explicit in R12 — removing the controls when everything fits is a defect, not a simplification.
- The 400ms p95 per-page render budget at the 10,000-row ceiling is the reason sorting and paging must slice an in-memory array rather than re-deriving the narrowed set per row render.
