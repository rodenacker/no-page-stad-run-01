# Story 4: Get between screens from anywhere

- **Epic:** `expense-file-upload` — Upload an expense file
- **Slug:** `story-4-get-between-screens`
- **Requirements:** R11, BR6
- **Roles:** Finance Uploader, Approver
- **Route:** all signed-in screens (the shared app header)
- **Target file:** `web/src/components/layout/AppHeader.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary

From any signed-in screen, a menu in the header lists every screen the person's roles let them open, so they can move between screens without using the browser's Back button. The screen they are on is marked as current, and the app's name takes them back to the landing screen. A screen their role excludes is not in the menu at all.

## Technical summary

Adds navigation to the shared `AppHeader`. The list of destinations is **exactly** `entryPointsFor(session)` from `web/src/lib/auth/access-map.ts` — the same role-aware facts the landing screen's `RoleEntryPoints` already renders, so the two can never disagree and no epic has to remember to register itself in a second place (BR6).

The app name becomes a link to `LANDING_PATH`. The current screen is indicated via `aria-current="page"` plus a visible treatment. Excluded destinations are absent from the markup, never rendered disabled (the UI-24 convention epic 1 established).

**Added mid-epic** after the user reported the gap at the manual test — see the brief's Notes & Caveats for why this is a scope addition rather than a missed requirement, and for the user's decision that unbuilt-but-permitted screens are still offered.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | The header offers a navigation destination for every screen the current session's roles permit, each linking to that screen's address — a Finance Uploader is offered the expense files screen, an Approver is offered both the expense files screen and the review-and-decide screen. | vitest |
| AC-2 | A screen the current roles exclude is absent from the navigation entirely — not present and disabled, and not merely hidden by styling. | vitest |
| AC-3 | The app's name in the header is a link to the signed-in landing screen. | vitest |
| AC-4 | The screen currently being viewed is marked as the current one in the navigation, and the other destinations are not. | vitest |
| AC-5 | From the expense files screen a user can reach the landing screen and come back again using only the header, never the browser's Back button. | playwright |
| AC-6 | The navigation is reachable and operable using the keyboard alone, and remains usable on a narrow phone-sized screen. | playwright |

## Manual test checklist

- Sign in as a Finance Uploader and open the expense files screen → the header offers a way back to the landing screen and to the screens you are allowed to open
- From the expense files screen, use the header to go to the landing screen and then back into expense files → you never need the browser's Back button
- Look at the header while on the expense files screen → it is clear which screen you are currently on
- Click the app's name in the header → you land on the signed-in landing screen
- Narrow the browser window to phone width → the navigation is still usable
- Move through the header using only the keyboard → you can reach and follow every destination in it
- Sign in as an Approver → the header additionally offers the review-and-decide screen (following it lands on a "page not found" until that epic is built — expected for now)

## Reconciled test contracts (build to these)

- **Destinations come from `entryPointsFor(session)` only.** Do not hand-list routes in the header, and do not add a second registry. The access map is the single source (BR6); this is what makes the menu automatically correct as later epics widen or add routes.
- **`AppHeader` already receives the full `session`** (`UserInfoRead`), so the role-aware list needs no new prop, no client-side fetch and no context.
- **The header is a sibling of `<main>`, never inside it** — it must stay a `banner` landmark (existing header contract, WCAG 2.2 AA per requirements §6.6.5). Put the navigation in a `<nav>` inside that header.
- **Do not break epic 1's shell or landing-screen tests.** If one of them becomes genuinely wrong because the header now contains links, retarget it with a comment explaining the supersession — as story 1 did for the role-gating tests — rather than weakening or deleting it.
- **Story 2's keyboard-only E2E walk is at risk.** It reaches the setting picker by pressing Tab from page load until focused, within a fixed press budget. Adding focusable links to the header inserts stops **before** the form. Verify that spec's press budget still reaches the picker, and raise the budget in that spec if the new stops exhaust it — do not remove the header links from the tab order to make it pass (that would break AC-6).
- **A permitted screen whose epic has not shipped is still offered** (the Approver's review-and-decide link reaches a not-found page for now). This is user-accepted; do not add "coming soon" scaffolding, and do not filter it out.

## Notes

- Story 3's accessibility scan runs on the finished `/upload` screen, which renders this header — so the epic-end E2E re-run scans the new navigation too. No separate scan is needed here.
