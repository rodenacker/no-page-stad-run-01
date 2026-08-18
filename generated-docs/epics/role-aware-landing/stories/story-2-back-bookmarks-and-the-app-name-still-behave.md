# Story 2 — Back, bookmarks and the app's name still behave

- **slug:** `story-2-back-bookmarks-and-the-app-name-still-behave`
- **route:** `/`
- **targetFile:** `web/src/app/(authenticated)/page.tsx`
- **pageAction:** `modify_existing`
- **roles:** Importer, Approver
- **requirementIds:** R8, R9, BR2, BR4
- **isInfrastructureOnly:** false

## Plain summary

Now that you are sent straight to your own screen, moving around still works the way you expect — the Back button gets you off the screen instead of pushing you back onto it, clicking the app's name brings you to your own screen without trapping you, and a bookmarked or pasted address for either screen opens exactly as it did before.

## Summary

Guarantees the landing redirect is one-directional. The redirect issued at `/` must replace the landing entry in browser history rather than add to it, so pressing Back after arriving at a destination leaves the destination instead of re-firing the redirect; and nothing on `/requests` or `/upload` sends a person back toward `/`. Also covers the header's app-name link (which points at `LANDING_PATH` from every screen) now returning a single-role person to their own screen, and confirms `allowedRoles` for both destinations is untouched so direct addresses keep working for both roles.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | After being sent from the app's address to their own screen, pressing the browser's Back button takes the person off that screen — they are not pushed straight forward onto it again. | playwright |
| AC-2 | Clicking the app's name in the header while on your own screen brings you back to that same screen rather than the "What you can do" screen, and Back still works normally afterwards. | playwright |
| AC-3 | Typing or pasting the address of the expense request list, or of the expense files screen, opens that screen for either role exactly as before — nothing sends the person away from it. | playwright |
| AC-4 | Who may open the expense request list and the expense files screen is unchanged — both remain open to both roles. | vitest |

## Manual test checklist

- Sign in as an Approver so you land on the expense request list, then press the browser's Back button → you leave the list; you are not stuck watching it reappear.
- From your own screen, click the app's name in the header → you come straight back to that screen, not the "What you can do" screen.
- Do that two or three times, then press Back repeatedly → you can still work your way back through the pages you visited.
- As an Importer, paste the expense request list's address into the address bar → the list opens as before and nothing sends you away.
- As an Approver, paste the expense files screen's address into the address bar → the files screen opens as before and nothing sends you away.
- If you have an account holding both roles, click the app's name in the header → you get the "What you can do" screen, as before.

## Reuse notes (from the planner — read before implementing)

- The whole of R9/BR4 is one decision: the landing redirect must carry **replace** semantics so the landing entry does not remain in browser history and re-fire on Back.
- `web/src/components/layout/AppHeader.tsx` links the app's name to `LANDING_PATH` from every screen (line ~52). That link is what makes this story's loop risk real; it is **not** to be changed — only proven safe.
- Guard the trap by construction, not by testing it away: the trap is a *pair* of redirects. No reverse redirect from `/requests` or `/upload` toward `/` exists today, and none may be added (brief §Notes & Caveats).
- `ACCESS_MAP` `allowedRoles` stays untouched (BR2) — AC-4 is the regression guard on that.
