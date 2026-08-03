# Story 1: Backend routing, session plumbing and role types

| Field | Value |
|---|---|
| Epic | `sign-in-and-app-shell` — Sign in and the signed-in app shell |
| Story index | 1 |
| Slug | `story-1-backend-routing-and-session-plumbing` |
| Route | — (no route; infrastructure) |
| Target file | `web/src/lib/auth/requireSession.ts` |
| Page action | `create_new` |
| Roles | Finance Uploader, Approver |
| Requirement IDs | R14, BR1, BR2, BR3, NFR4 |
| Infrastructure only | **yes** — verified by Story 2 |

## Plain summary

Under-the-hood setup so the app can talk to the two backend services from its own address and work out who is signed in and what their role is. Nothing new to look at yet — every later step in this epic depends on it.

## Summary

Replaces the starter template's single stale API base URL with the project's two-service shape and adds same-origin rewrites in `next.config` (`/v1/auth/*` → auth-api, `/transactions-api/*` → transactions-api) per [bff-auth-pattern.md](../../../../.claude/policies/bff-auth-pattern.md)'s **"existing or multiple backends"** shape, so the browser never makes a cross-origin call.

Adds a server-side auth client plus `requireSession()`, typed against the **real** `UserInfoRead` schema (`Id`, `Email`, `FirstName`, `LastName`, `RolesString`, `Roles[]`) rather than the policy's illustrative `{ username, displayName }`. Adds role types/constants for the two real project roles and the role-check helpers stories 3 and 4 consume.

No component ever holds a token or credential — the `HttpOnly`, `SameSite=Strict` `session` cookie is the sole conveyance.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | Calls the browser makes for sign-in, sign-out and identity go to the app's own address, which forwards them to the auth service — no call is addressed to another origin. | `vitest` |
| AC-2 | The session helper resolves the signed-in person's name, email and role set from the auth service's real identity response, and sends a caller with no valid session to the sign-in screen. | `vitest` |
| AC-3 | No session value or credential is reachable from browser-side code; the session travels only in the browser-managed cookie, which is set with its original attributes on sign-in and cleared with matching attributes on sign-out. | `vitest` |
| AC-4 | Role checks recognise exactly the two project roles, Finance Uploader and Approver, and grant nothing for any other role name. | `vitest` |
| AC-5 | The two backend addresses come from configuration, not from the template's single hardcoded address. | `vitest` |

## Manual test checklist

None — this story has no user-visible behaviour. Its correctness is proved by Story 2's sign-in flow.

*Plus 5 technical checks the agents verify automatically.*

## Epic-level E2E infrastructure — this story owns it

**The problem:** identity is resolved **server-side** (`requireSession()` here, the `(authenticated)` layout in Story 3). Playwright's `page.route()` only intercepts requests the *browser* makes — it cannot see a fetch issued from the Next.js server process. So without a server-side mock layer, **every live E2E spec in this epic** either hits the real backend (unavailable in CI) or fails.

**ALREADY SOLVED — do not build a second solution.** Story 2's test generation stood up a working stub auth service and verified it over real HTTP. These files exist and are the epic's single E2E auth layer:

| File | Role |
|---|---|
| `web/e2e/support/auth-api-stub.ts` | the stub auth service (login, logout, userinfo, health) |
| `web/e2e/support/global-setup.ts` / `global-teardown.ts` | starts and stops it |
| `web/e2e/fixtures/credentials.ts` | the test credentials |
| `web/playwright.config.ts` | registers the setup/teardown and points the app server's auth base URL at the stub via `webServer.env` |

It mints the session cookie from the **same** `web/src/mocks/data/` factories the Vitest layer uses (`sessionCookieFor(role)`, `userInfoFor(role)`), so both layers agree on the identity contract. `msw` is **not** needed — don't install it, and don't add `instrumentation.ts` for this.

**Only one `globalSetup` can be registered in Playwright.** Every signed-in spec in this epic (stories 3, 4, 5, 6) must reuse `e2e/support/auth-api-stub.ts` + `e2e/fixtures/credentials.ts`. A second stub silently breaks the first.

**Two things this story must implement for it to work:**
1. `requireSession()` must **forward the incoming `session` cookie** on its `GET /v1/auth/userinfo` call.
2. The server-side auth base URL must be read from `AUTH_API_BASE_URL` / `NEXT_PUBLIC_AUTH_API_BASE_URL` — **never hardcoded**. That indirection is exactly what lets the tests point the app at the stub instead of `localhost:4424`. Hardcode it and story 2's AC-3 fails.

**Never resolve an E2E auth problem by pointing a spec at the live auth service** — that makes CI depend on a running backend and the suite non-deterministic.

This is a genuine dependency of every routable spec in the epic, not just one story — get it right here and the other five stories inherit it.

## Implementation notes

- **API client exists** at `web/src/lib/api/client.ts` (`get`/`post`/`put`/`del`) — use it per CLAUDE.md §2; never call `fetch()` from a component.
- **STALE CONFIG to fix:** `web/src/lib/utils/constants.ts` still exports `API_BASE_URL` from `NEXT_PUBLIC_API_BASE_URL` defaulting to `http://localhost:8042`, which matches neither service. `web/.env.example` and `web/.env.local` are already on the two-service shape (`NEXT_PUBLIC_AUTH_API_BASE_URL`, `NEXT_PUBLIC_TRANSACTIONS_API_BASE_URL`). Rewire `constants.ts` / the client to the same-origin rewrite paths — **do not leave the 8042 default in place.**
- **DO NOT USE** the token/auth-header path in `web/src/lib/api/client.ts` (~lines 200–206: `NEXT_PUBLIC_API_TOKEN`, `NEXT_PUBLIC_API_AUTH_HEADER`, `NEXT_PUBLIC_API_AUTH_VALUE_PREFIX`). This project is cookie-session only — the frontend holds no token (BR2, [authentication-intake.md](../../../../.claude/policies/authentication-intake.md) Rule 10).
- **Two existing files break when you rewire `constants.ts` — fix both, not just the config:**
  1. `web/src/lib/api/client.ts:16` imports the old `API_BASE_URL` (confirmed: `tsc` reports `TS2305`).
  2. `web/src/__tests__/integration/api-client.test.ts` (~lines 219–300) asserts base-URL prefixing **and** the `requiresAuth` / `NEXT_PUBLIC_API_TOKEN` header path this project explicitly forbids. That template test encodes behaviour contrary to this project's cookie-only contract — update it to the two-service, cookie-session reality rather than leaving it asserting a forbidden path.
- **Env var naming:** `project.md` names the two base URLs `NEXT_PUBLIC_AUTH_API_BASE_URL` / `NEXT_PUBLIC_TRANSACTIONS_API_BASE_URL`, while `bff-auth-pattern.md` prefers the backend origin be server-only. **`project.md` wins** — the tests stub the `NEXT_PUBLIC` names. An implementation that reads a server-only name first and falls back to the `NEXT_PUBLIC` one still passes, and is the better shape.
- `web/next.config.ts` currently has no `rewrites` block (only `output: 'standalone'`) — this story adds it.
- Put `UserInfoRead` / `RoleRead` / role constants alongside the existing type modules (e.g. `web/src/types/auth.ts`), not scattered inline. `web/src/types/api.ts` and `web/src/types/toast.ts` already exist.
- `web/src/lib/utils.ts` exports the `cn` class-merge helper — use it, don't reimplement.
