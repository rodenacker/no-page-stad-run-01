# Story 5: Open one request, with its account number protected

- **Epic:** `expense-request-list` — The shared expense request list
- **Slug:** `story-5-request-detail-and-account-number`
- **Requirements:** R5, R15, R16, BR1
- **Roles:** Finance Uploader (`ROLE_IMPORTER`), Approver (`ROLE_APPROVER`) — both read-only
- **Route:** `/requests`
- **Target file:** `web/src/app/(authenticated)/requests/page.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary

Opening a request shows everything the service holds about it — currency, any rejection note, who last changed it and when — all read-only, with no way to change anything anywhere. The account number stays masked to its last four digits until you deliberately reveal it, one request at a time. On a phone-width screen each request appears as a card with its reference, a few key values and a menu to open it.

## Technical summary

Adds a read-only per-request detail surface under `web/src/components/requests/` showing the fields the table does not carry — `Currency`, `UserNote`, `LastChangedUser`, `LastChangedDate` — plus a **named reveal control** that unmasks the account number for that **one** request only: never a reveal-all, and never persisting across rows or pages (POPIA carry-forward from `project.md` §Compliance).

Asserts BR1/R5 negatively: **no** control in the list or the detail edits an imported value — no edit action, no editable field, no submit.

Also delivers the narrow-viewport presentation — `Reference` plus two-to-three key values and an action overflow that opens the detail, with no horizontal page scrolling.

**Design choice resolved at the stories approval:** the user chose a **panel/dialog over the list**, one request at a time, with the reveal control inside it — over an expandable row. Closing it returns the user to the list with place, sort and page unchanged. See the brief's Notes & Caveats.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Opening a request shows every value the service holds for it, including its currency, its rejection note when one exists, and who last changed it and when, all presented read-only. | vitest |
| AC-2 | No control in the list or in an opened request offers any way to change an imported value — no edit action, no editable field, no submit. | vitest |
| AC-3 | An opened request shows its account number masked to its last four digits until a clearly-named reveal control is activated, which reveals the full number for that one request only. | vitest |
| AC-4 | Account numbers remain masked after searching, filtering, sorting and paging, and a number revealed on one request is not revealed on any other request or after moving to another page. | playwright |
| AC-5 | Every icon-only control on the screen reveals its name on hover and on keyboard focus and carries a matching accessible label. | playwright |
| AC-6 | At phone width each request presents its reference plus two-to-three key values and an action overflow that opens the request, and the page never scrolls sideways. | playwright |

## Manual test checklist

- Open a request from the list → you see all its values, including currency, any rejection note, and who last changed it and when
- Look for any way to change a value, in the list or in the opened request → there is none
- In the opened request, click the reveal control → the full account number appears for that request only
- Close it and open a different request → that one's account number is masked again
- Search, sort and page through the list → account numbers stay masked everywhere
- Hover over, then Tab to, an icon-only control → its name appears and is announced
- Narrow the browser window to phone width → each request shows its reference plus a few key values and a menu to open it, and the page never scrolls sideways

## Infrastructure reuse notes

- Install the Shadcn `dialog` and `tooltip` primitives if genuinely missing: `(cd web && npx shadcn add dialog tooltip --yes)`. `dropdown-menu` (for the narrow-viewport action overflow) and `card` are already installed in `web/src/components/ui/`.
- Reuse story 1's masking helper — do not write a second masking function. The reveal is **local, per-open-request state**; it must not live in any store that outlives the open panel, or survive a page change.
- The shared status-badge component extracted in story 1 renders the status inside the detail panel too — no third copy.
- Icon-only controls need both a visible name on hover **and** on keyboard focus (`tooltip`) **and** a matching accessible label — the tooltip alone does not satisfy R15.
- `vitest.setup.ts` already supplies the jsdom stand-ins Radix needs (`matchMedia`, pointer capture, `scrollIntoView`) — required for `dialog`, `dropdown-menu` and `tooltip`.
- Colour, type face and radius come only from the tokens in `web/src/app/globals.css` — no hex literals, no Tailwind palette utilities.
- Playwright alert/status queries must be scoped to a region (e.g. `getByRole('main').getByRole('alert')`) — Next renders a permanently empty body-level `role="alert"` route announcer.

## Notes

- **The masking is a POPIA compliance requirement, not a nicety** (`project.md` §Compliance). It must hold on **every** render path — initial load, after narrowing, after sorting, after paging — and the reveal must be scoped to one request at a time. A "reveal all" control is forbidden.
- AC-4 is deliberately the cross-cutting regression check: it is the one criterion that exercises masking against stories 2, 3 and 4's narrowing, ranges, sorting and paging together.
- AC-2 is a *negative* criterion protecting BR1 — the frontend provides no operation, screen or control that changes an imported value. Deciding on a request (approve/reject) is the **next** epic and must not be pre-empted here, not even as a disabled control.
- Story 2's search covers only the **visible last four digits** of the account number; this story's reveal does not widen search scope.
