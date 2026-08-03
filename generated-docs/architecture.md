# Architecture & Reuse Registry

> One line per durable thing. Edit the line when it changes; delete it when the thing is gone.
> No story narrative, no dates, no rationale.

## Shared utilities & components

| Export | Location | Capability |
| --- | --- | --- |
| `apiClient`, `get`, `post`, `put`, `del` | `web/src/lib/api/client.ts` | The only HTTP surface. Same-origin paths by default; `baseUrl` in the request config addresses a service directly for server-side calls; sends no credential (cookie-session only). |
| `API_BASE_PATH`, `AUTH_API_BASE_PATH`, `TRANSACTIONS_API_BASE_PATH`, `AUTH_ENDPOINTS` | `web/src/lib/utils/constants.ts` | Same-origin API paths for both backends, plus the auth service's login/logout/userinfo paths. |
| `UserInfoRead`, `RoleRead`, `ROLE_FINANCE_UPLOADER`, `ROLE_APPROVER`, `PROJECT_ROLES`, `ProjectRole` | `web/src/types/auth.ts` | The identity/role contract and the two project role names — single source of truth, re-exported by the `src/mocks/data/` factories. |
| `requireSession`, `SIGN_IN_ROUTE` | `web/src/lib/auth/requireSession.ts` | Server-side gate for protected layouts: resolves the current identity or redirects to the sign-in screen. |
| `authApiBaseUrl`, `fetchUserInfo` | `web/src/lib/auth/authApi.ts` | Server-side auth-service access: configured base URL, and identity lookup that forwards the session cookie (`null` on 401/403, throws on real failures). |
| `SESSION_COOKIE_NAME`, `sessionCookieOptions`, `clearedSessionCookieOptions`, `sessionCookieHeader` | `web/src/lib/auth/sessionCookie.ts` | The session cookie's name and attributes; set and cleared forms derive from one place so they always match. |
| `isProjectRole`, `rolesOf`, `hasRole` | `web/src/lib/auth/roles.ts` | Role checks against the current userinfo response; unrecognised role names grant nothing. |

## Conventions

- The browser only ever calls the app's own address. `next.config.ts` rewrites `/v1/auth/*` and `/transactions-api/*` to the two services, whose addresses come from `AUTH_API_BASE_URL` / `TRANSACTIONS_API_BASE_URL` (or the `NEXT_PUBLIC_*` equivalents) — never from a literal in application code.
- Authentication is cookie-session only: no token or credential in browser-reachable state, no auth header from the API client. Server-side calls forward the incoming `session` cookie explicitly.
- Authorisation is re-resolved per server-rendered navigation from `GET /v1/auth/userinfo`; nothing caches roles.
- Test/mock factories in `web/src/mocks/data/` re-export the production types and role constants rather than declaring their own, so mocks cannot drift from the app's contract.

## Cross-epic debt

- CORS on both backends is an open backend requirement (project.md NFR-base-6). The same-origin rewrites make it a non-issue for browser calls; any future direct browser-to-service call would reintroduce it.
