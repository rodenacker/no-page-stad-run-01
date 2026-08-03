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
