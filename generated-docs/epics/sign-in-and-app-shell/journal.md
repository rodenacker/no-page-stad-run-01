# Journal — Sign in and the signed-in app shell

Notable factual changes made while building this epic. Decisions that shaped the
code live in the commit bodies; this is the running record of things worth knowing
later.

## Story 1 — Backend routing, session plumbing and role types

- The test data factories no longer keep their own copy of the two role names or the identity shape — they now re-export them from the app's own `types/auth.ts`. Same values as before, but a mock role name can no longer drift from the role name the app actually checks for.
- Cleaned up the starter template's leftover single-backend setup while wiring the two real services: the stale `http://localhost:8042` address is gone from the app's configuration, the web README, and the env-setup script, and the template's own API-client test no longer asserts the browser-holds-a-token behaviour this project forbids — it now checks the cookie-only contract instead.

## Story 2 — Sign in

- The shared code that talks to the backends was quietly throwing away the reason a service gave for refusing a request, so the sign-in screen would have shown "HTTP 401" instead of the auth service's own words. It now reads the reason from either shape of error the two services send, which means any screen built later gets the same benefit for free.
- The auth service's documentation says a refused sign-in can come back with no explanation at all. When that happens the screen says "Sign-in failed. Check your details and try again." — still without hinting which of the two fields was wrong. If the service is unreachable or broken, the screen says so separately ("Sign-in is unavailable right now"), because re-typing a correct password wouldn't help in that case.
- The refused-sign-in message is shown in one place on the form and is not also popped up as a toast: showing it twice would make a screen reader announce it twice.
- The refusal message deliberately isn't styled with the ready-made Shadcn alert box. That box dims its text slightly, which drops below the colour-contrast level this project has to meet, and it clips long messages to one line — which would have cut off the "you can try again after 14:35" part of a locked-account message.
- The app counts nothing about failed sign-ins itself: whatever the auth service says — including a temporary lockout and when to retry — is shown as given, on the very first attempt if that's what it says.

## Story 3 — The signed-in app shell

- The signed-in header shows your own name with your role underneath it, and clicking that opens a small menu holding Sign out. We used a menu rather than a bare Sign out button because it is also where the theme switch and any future account links belong, and it keeps the header uncluttered.
- The starter template's Welcome page has been deleted, so the app's front door is now the signed-in landing screen. Typed while signed out, that same address takes you to sign-in — the app itself is never sent to the browser first.
- The role shown beside your name lists only roles this app knows about (Finance Uploader, Approver). If the login service ever returns a role belonging to some other system, it is not displayed, because it grants nothing here.
- The accessibility check on the shell found a genuine problem the first time it ran: with the account menu open, the rest of the page was being hidden from screen readers while still being reachable by keyboard. Making the menu non-modal fixed it, and the check now passes both with the menu closed and open.
- The signed-in landing screen currently carries just a short introduction — the entry points that take you to uploading and reviewing arrive with the next story.
- Signing out really waits for the login service to confirm it. If that call fails you stay where you are and get an error saying you are still signed in, instead of being dropped at the sign-in screen with a session still alive.

## Story 4 — Role-aware entry points and the permission message

- The signed-in home screen now shows only what your role lets you do. A Finance Uploader is offered the file upload; an Approver is offered reviewing and deciding. The one you cannot use is not on the screen at all — not greyed out. The short introduction that used to sit there has been replaced by these entry points, so the first thing you see is something you can actually act on.
- The two addresses those entry points point at (`/upload` and `/requests`) are now registered in one shared list that says which role may open each one. If you type in or bookmark an address your role excludes, you get a normal screen inside the usual header that names the permission you are missing and tells you to request it from the account holder, plus a link back to your own home screen. You will never see a browser error page for it. As agreed at the stories approval, these addresses are registered before their screens are built, so following one of those links as a permitted user lands on a not-found page until that epic ships.
- Screens will keep costing one identity check even though both the shell and the page ask who you are — the answer is now reused within a single page load, and still re-checked fresh on every navigation, so a change to someone's roles takes effect on their next screen.
- One automated browser check had to be pointed more precisely: Next.js keeps an invisible announcement slot on every page that looks like an alert to test tooling, so the check now looks for the permission message inside the page's own content. Behaviour of the app is unchanged.

## Story 5 — Brand theme with light and dark

- Both the light and the dark palette are now filled in from your two design-system files, and Cabin is the app's typeface everywhere. The brand face itself ("Barclays Effra") is proprietary and cannot be loaded, so Cabin — the substitute your design system names — is used, downloaded once when the app is built and served from the app rather than from Google.
- The brand blue is a light colour, so text on top of a brand-blue button is the dark text colour rather than white: white on that blue is too faint to read (2.5:1, below the standard), while the dark text gives 5.9:1. Same for the lifted status colours in the dark version. This clears the contrast risk flagged when the sign-in screen and the header were built — both of their automated accessibility checks now run against the real brand colours and pass.
- Your design system's success / warning / error / information colours had no home in the component library's standard set, so named slots were added for them (plus the brand's other two blues), each with a matching text colour and a value in both versions. Screens can now show a status colour without writing a colour value into the screen itself, which is what the next epics need for request statuses.
- The pop-up notification component that came with the starter kit still had fixed light-mode colours baked in — a white card with green/red/grey text — so it would have stayed light while the rest of the app went dark. It now uses the same named colours as everything else.
- The theme switch sits in the header as its own button next to your name, not as an entry inside the account menu: one press changes the whole app, rather than open-menu-then-click.
