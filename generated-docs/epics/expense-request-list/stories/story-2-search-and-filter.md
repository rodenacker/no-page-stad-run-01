# Story 2: Search and filter the request list

- **Epic:** `expense-request-list` — The shared expense request list
- **Slug:** `story-2-search-and-filter`
- **Requirements:** R2, R3, R6, R7, R10, R18
- **Roles:** Finance Uploader (`ROLE_IMPORTER`), Approver (`ROLE_APPROVER`) — both read-only
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary

A search box narrows the list to the requests matching what you type, and you can narrow it further by status, by the file the requests came from, and by transaction type. Whatever you have applied stays visible on screen, and when the narrowing leaves nothing the screen says what is applied and offers to clear it all in one go.

## Technical summary

Adds the client-side narrowing layer to story 1's list component: a debounced free-text search across the displayed fields plus **three pick-one filters** — status, originating file, and transaction type — each offering only the values present in the fetched set, so a value the app did not anticipate is still selectable (the service owns the accepted set, per the epic's confirmed type-translation decision). Type choices render the app's plain-language label where it has one and the service's raw value where it does not.

Includes the visible summary of what is currently applied, and the narrowed-empty state that names the active narrowing, offers **Clear all**, and deliberately does **not** offer the upload action (that distinction — narrowed-empty vs nothing-ever-imported — is R10/R18 against story 1's R9/R17).

All narrowing is in memory over the full fetched set — the endpoint accepts no query parameters.

**Search field scope (decided at the stories approval, not a spec gap):** search covers what is on screen — `Reference`, `Description`, `FileName`, `Amount`, and the **visible last four digits** of `AccountNumber`. Full account numbers are never searchable: matching against the unmasked value would be a way around the masking POPIA requires.

Story 3 adds the amount-range and date-range filters on top of this layer; build the active-narrowing summary and clear-all so a new filter kind joins them without rework.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Typing a term in the search field narrows the list to the requests matching it; clearing the term restores every request. | playwright |
| AC-2 | Choosing a status, an originating file, or a transaction type each narrows the list to the matching requests, and any combination of them chosen together narrows cumulatively. | playwright |
| AC-3 | The search term and every filter currently narrowing the list stay visibly indicated on the screen while they apply. | vitest |
| AC-4 | When the active narrowing leaves no requests visible but requests do exist, the screen names what is applied, offers a clear-all action, and does not offer the upload action. | vitest |
| AC-5 | Activating clear-all removes the search term and every filter at once and restores the whole set of requests. | playwright |
| AC-6 | The status, originating-file and transaction-type choices offered are the values present in the fetched requests — a type is offered under the app's plain-language label where it has one and under the service's own value where it does not, and no value the service sent is missing from the choices. | vitest |

## Manual test checklist

- Type part of a reference or description into the search box → the list narrows to matching requests; clear it → they all come back
- Choose a status → only requests with that status remain, and the chosen status stays visible on screen
- Choose an originating file → only that file's requests remain
- Open the transaction type list → it offers the types your data actually has, in plain wording where the app knows it and the service's own value where it doesn't; choose one → only those requests remain
- Choose a status, a file and a type together → all three narrow the list at once and all three stay visible
- Narrow until nothing matches → the screen tells you what is applied, offers 'Clear all', and does not offer the upload action
- Click 'Clear all' → every request comes back

## Infrastructure reuse notes

- A fixed set of choices (the three pick-one filters) must be the Shadcn `select`, **never a native `<select>`** — the keyboard-completability bar cannot be evidenced against an OS-drawn option list. A selection validates as it is made, not on blur.
- `vitest.setup.ts` already supplies the jsdom stand-ins Radix needs (`matchMedia`, pointer capture, `scrollIntoView`) — required by any test rendering a `select`, `dropdown-menu` or `popover`.
- Shadcn `input` and `select` are already installed in `web/src/components/ui/`.
- Colour, type face and radius come only from the tokens in `web/src/app/globals.css` — no hex literals, no Tailwind palette utilities.
- Do not build server-side query support: `GET /v1/transactions` accepts no parameters. All narrowing is in-memory over story 1's single fetched set.
- Playwright alert/status queries must be scoped to a region (e.g. `getByRole('main').getByRole('alert')`) — Next renders a permanently empty body-level `role="alert"` route announcer.

## Notes

- **`[USER-DIRECTED]` scope addition.** The transaction-type filter was added by the user at the stories approval (2026-08-05), extending the brief's original status + originating-file pair. The brief's R7 has been updated to carry the full filter set; `documentation/requirements-application.md` does not contain it.
- The transaction-type filter must stay consistent with story 1's rendering decision — the service owns the accepted set. Do **not** reintroduce a hardcoded enum: a type value the app has no translation for is still a legitimate, selectable choice shown verbatim.
- The debounce interval is the developer's choice (the brief's R6 leaves it to BUILD); keep it short enough that the Playwright specs' type-then-assert flow sees the narrowed result without an explicit wait beyond Playwright's own auto-waiting.
