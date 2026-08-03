# Story 7: Backend addresses resolved at request time, not build time

| Field | Value |
|---|---|
| Epic | `sign-in-and-app-shell` — Sign in and the signed-in app shell |
| Story index | 7 |
| Slug | `story-7-request-time-backend-routing` |
| Route | — (route handlers, not a page) |
| Target file | `web/src/app/v1/auth/[...path]/route.ts` |
| Page action | `create_new` |
| Roles | Finance Uploader, Approver |
| Requirement IDs | R14, BR1, BR2 (revisits story 1's plumbing) |
| Infrastructure only | **yes** — verified by stories 2 and 3's Playwright specs passing against a production build |

## Plain summary

Under-the-hood fix so the app looks up the backend addresses while it's running rather than having them fixed in place when it's built. Nothing changes on screen. It means one build of the app can be used in every environment, and it makes the browser tests pass against a real production build instead of only against the development server.

## Why this story exists

Added after story 6, on the user's explicit decision at the build-config question.

Next.js resolves `next.config.ts` `rewrites()` during `next build` and bakes the literal destination into the build output — `web/.next/routes-manifest.json` contains `"destination": "http://localhost:4424/v1/auth/:path*"`. Two consequences:

1. **Deployment:** one built artifact cannot be promoted dev → staging → production, because the backend address is compiled in. A separate build per environment would be required.
2. **Tests:** two of story 3's Playwright specs fail against a production build (`E2E_PROD=1`). The harness points the app at the stub auth service through an environment variable, but the baked destination ignores it, so the browser's sign-out `POST` reaches the **real** auth service, which rejects the mock session — and the app then *correctly* declines to navigate (BR4). Rebuilding with the stub address set makes all 10 specs pass, which isolates the cause precisely.

This is at odds with [bff-auth-pattern.md](../../../../.claude/policies/bff-auth-pattern.md) §"Existing or multiple backends", which reads as runtime configuration, and story 1 deliberately made the base URLs environment-driven for exactly this reason. This story closes the last gap.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | A browser-side call to an auth path is forwarded to whatever backend address the **running** server is configured with — change the configuration and restart, and the call follows it, with no rebuild. | `vitest` |
| AC-2 | The forwarded request preserves the caller's method, body and relevant headers, and the incoming `session` cookie reaches the backend. | `vitest` |
| AC-3 | The backend's `Set-Cookie` headers are passed back to the browser unchanged, so signing in still mints the session cookie and signing out still clears it — including when the backend sends more than one. | `vitest` |
| AC-4 | The transactions paths are forwarded the same way, from the same request-time configuration, so later epics inherit the fix. | `vitest` |
| AC-5 | The build output contains no hardcoded backend address — nothing in the build names a backend host. | `vitest` |
| AC-6 | A backend that is unreachable surfaces as a server error the caller can act on, not a crash or a hang. | `vitest` |

## Manual test checklist

None — no user-visible behaviour changes. Verified by stories 2 and 3's Playwright specs passing against a production build (`E2E_PROD=1`), which is the whole point of the story.

## Implementation notes

- **Replace** the two `rewrites()` entries in `web/next.config.ts` with request-time route handlers. Resolve the origin per request through story 1's existing `authApiBaseUrl()` / transactions equivalent — do not read the env var at module scope, or the value is captured once at server start instead of per request.
- Pass upstream `Set-Cookie` through with `response.headers.getSetCookie()` — the plain `get()` collapses multiple cookies into one malformed header. This is the security-relevant part: the cookie must arrive at the browser with its original attributes intact (`HttpOnly`, `Secure`, `SameSite=Strict`), so story 1's `sessionCookie.ts` helpers remain the single source of truth for those attributes.
- **Do not** forward hop-by-hop headers (`connection`, `keep-alive`, `transfer-encoding`, `upgrade`) or a stale `host`/`content-length`.
- **Story 1's committed Vitest spec asserts on `next.config.ts`'s rewrite rules directly** (`rules`, `rule.source.startsWith('/')`). Those rewrites are being removed, so that spec must be updated to assert the new request-time contract instead. Update it honestly — the *intent* of story 1's AC-1 ("no call is addressed to another origin" and "addresses come from configuration") is **strengthened** here, not weakened, so keep that intent and change only the mechanism it checks. Say plainly in the commit body what changed and why.
- The frontend still holds **no token** — cookie-session only. The proxy must not add an `Authorization` header or read any credential env var.
- Keep the browser-facing paths identical (`/v1/auth/*`, `/transactions-api/*`) so nothing else in the app changes.

## Definition of done

Beyond the acceptance criteria: `(cd web && npm run test:e2e)` passes in **both** modes — the dev server **and** `E2E_PROD=1` against a production build — with all 10 live specs green and no rebuild-with-test-settings workaround in `playwright.config.ts`.
