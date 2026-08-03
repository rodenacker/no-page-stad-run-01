# Journal — Sign in and the signed-in app shell

Notable factual changes made while building this epic. Decisions that shaped the
code live in the commit bodies; this is the running record of things worth knowing
later.

## Story 1 — Backend routing, session plumbing and role types

- The test data factories no longer keep their own copy of the two role names or the identity shape — they now re-export them from the app's own `types/auth.ts`. Same values as before, but a mock role name can no longer drift from the role name the app actually checks for.
- Cleaned up the starter template's leftover single-backend setup while wiring the two real services: the stale `http://localhost:8042` address is gone from the app's configuration, the web README, and the env-setup script, and the template's own API-client test no longer asserts the browser-holds-a-token behaviour this project forbids — it now checks the cookie-only contract instead.
