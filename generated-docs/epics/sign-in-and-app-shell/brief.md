# Epic: Sign in and the signed-in app shell

Inherits roles, auth, data source, compliance, and styling from project.md.

**Slug:** `sign-in-and-app-shell` · **Root epic** — nothing else depends on this epic being built after it; every later epic (file upload, transaction review, export) sits on top of the sign-in flow, the role gate, and the app shell this epic delivers.

---

## Goal

Let a Finance Uploader or an Approver sign in with their own credentials, see who they are signed in as, sign out, and reach only the screens and actions their role allows.

---

## Data Model

This epic introduces no persistent domain entities of its own (Transaction, ExpenseFile, etc. belong to later epics) — it consumes the identity/session shapes from `documentation/auth-api.yaml` and requirements §7.

| Shape | Fields | Notes |
|---|---|---|
| `LoginRequest` (submitted to `POST /v1/auth/login`) | `Username` (string), `Password` (string) | Maps to requirements §7 `SignInRequest`. Both required — see R4/R5. |
| `UserInfoRead` (returned by `GET /v1/auth/userinfo`) | `Id` (int), `Email` (string), `FirstName` (string), `LastName` (string), `RolesString` (string), `Roles` (array of `RoleRead`), `LastChangedUser`, `LastChangedDate` | The signed-in identity and role set. `RolesString` is a single readable value (e.g. "Approver"); `Roles` carries the same roles individually as `{ Id, Name }`. |
| `RoleRead` | `Id` (int), `Name` (string) | The two real role names for this project are **Finance Uploader** and **Approver** — see Notes & Caveats re: the schema's own "Viewer" example. |
| `DefaultResponse` | `Id`, `MessageType`, `Messages[]` | Standard success envelope for `POST /v1/auth/login` (200) and `POST /v1/auth/logout` (200). |
| `ErrorResponse` | `Error` (code), `Message` (human-readable) | Returned on `POST /v1/auth/login` 400 (e.g. `INVALID_REQUEST` / "Username and password are required."). |

No session token or credential is ever held client-side (Rule 10, `authentication-intake.md`) — the only "identity state" the frontend holds is whatever `requireSession()` / the layout gate resolves per request, plus the user's explicit theme override (see R15).

---

## Functional Requirements

| ID | Statement |
|---|---|
| R1 | The frontend shall authenticate a user with a username and a password; on success the expense screens become reachable. |
| R2 | The frontend shall sign the user out, end the session, and return the user to the sign-in screen. |
| R3 | While a session is active, the frontend shall display the signed-in user's identity. |
| R4 | The sign-in form shall require a username before submission; if omitted, the message is "Username and password are required." |
| R5 | The sign-in form shall require a password before submission; if omitted, the message is "Username and password are required." |
| R6 | Synchronous field checks (e.g. required-field presence) report on blur; cross-field and server-checked rules (e.g. rejected credentials) report on submit; no check reports on keystroke. |
| R7 | Required fields carry a leading asterisk with one legend line explaining the marker; where at least 80% of the form's fields are required (true for this two-field sign-in form), optional fields would instead be marked "(optional)" — moot here since both fields are required. |
| R8 | The first editable field (Username) receives focus when the sign-in form opens. |
| R9 | The sign-in form has two fields and is presented as a single form (no section headings, no stepping/tabbing — that escalation only applies above 8 fields). |
| R10 | Actions a signed-in user's roles exclude are hidden, not shown disabled. |
| R11 | Reaching a screen a signed-in user's roles exclude shows an in-page permission message naming the missing permission and a path to request access, not a generic error screen. |
| R12 | Rejected credentials are reported without revealing which field was wrong; the user re-enters both username and password. |
| R13 | A denied direct link to an excluded screen explains the denial in place (same in-page message as R11), rather than a generic error page. |
| R14 | Both roles sign in the same way (identical form, identical flow); once signed in, the user's role set determines which actions and screens are offered afterwards — this epic delivers the sign-in flow and the gating mechanism; per-action gating for other epics' screens is wired into that mechanism by those epics. |
| R15 | The signed-in app header includes a theme control: on first load the app follows the OS `prefers-color-scheme`; the control lets the signed-in user override it; an explicit override is remembered and takes precedence over the OS setting on every subsequent load, for this browser/user. |
| R16 | An idle session (no user activity) times out after 30 minutes; a warning appears 60 seconds before idle sign-out gives the user a chance to stay signed in. |
| R17 | The **auth service** enforces any absolute session cap (an inferred 12 hours). The app asserts **no** session lifetime of its own and MUST NOT implement a client-side absolute timer — when the service reports the session gone, the user's next action returns them to the sign-in screen with the same plain timed-out explanation rather than a raw error. |
| R18 | After five consecutive failed sign-in attempts on an account, sign-in states that the account is temporarily locked and states when it can be retried. |

R16–R18 are sourced from requirements §6.6.1 "Session UX" and are marked `inferred` there (not literally stated by the original brief) — treat as this epic's working defaults, not a hard contract; see Notes & Caveats.

---

## Business Rules

| ID | Statement |
|---|---|
| BR1 | Every screen other than the sign-in screen is gated server-side; a request with no valid session is redirected to the sign-in screen before any protected content renders (no client-side-only gate, no flash of protected content). |
| BR2 | The frontend holds no session token in JavaScript-reachable state — the HttpOnly, Secure, `SameSite=Strict` `session` cookie set by `POST /v1/auth/login` is the sole conveyance of authentication state, attached automatically by the browser on subsequent requests. |
| BR3 | Which actions and screens are offered is driven by the roles in the current `GET /v1/auth/userinfo` response, not by a value cached indefinitely from an earlier check or hardcoded per role name — the layout gate re-resolves identity/role on server-rendered navigation. |
| BR4 | Logout only treats the session as ended, and only navigates to the sign-in screen, after `POST /v1/auth/logout` returns a successful response — a failed logout call surfaces an error rather than redirecting as if it had succeeded (BFF Rule 8, `bff-auth-pattern.md`). |
| BR5 | Theme precedence: absent an explicit user override, the OS `prefers-color-scheme` governs on every load; once the signed-in user sets an explicit override via the header control, that override persists (across sessions, on this browser) and takes precedence over the OS setting from then on. |

---

## Key Workflows

### 1. Sign in (happy path)

1. User opens the app without an active session; the sign-in screen is shown, the Username field already focused (R8).
2. User enters a username and password (both required, checked on blur per R6/R4/R5) and submits.
3. On success, `POST /v1/auth/login` sets the session cookie; the user lands on the app shell with the expense screens reachable (R1).
4. The signed-in user's identity is shown in the app header (R3), and the theme control reflects the resolved theme (R15).

### 2. Sign in (rejected credentials)

1. User submits an incorrect username or password.
2. The message reported does not reveal which field was wrong (R12); both fields are re-entered.
3. After five consecutive failures on the same account, the message instead states the account is temporarily locked and when it can be retried (R18).

### 3. Sign out

1. Signed-in user chooses sign out from the app shell.
2. `POST /v1/auth/logout` is called and awaited; only on a successful response does the client end the session and return to the sign-in screen (BR4, R2).

### 4. Session ends on its own (idle or absolute timeout)

1. 60 seconds before a 30-minute idle timeout would fire, a warning gives the user the chance to remain signed in (R16).
2. If the user takes no action, the session ends and the sign-in screen is shown again. Separately, whenever the **auth service** reports the session already gone — it owns any absolute cap (R17) — the user's next action returns them to sign-in with the same plain explanation. The app does not run its own absolute timer.

### 5. Reaching an excluded screen or action

1. A signed-in user's role does not include a given screen or action.
2. That action is not shown at all in places the user can browse to (R10); if the user reaches the excluded screen directly (e.g. a bookmarked or typed URL), an in-page message explains the denial and names the missing permission, with a path to request access — not a generic error page (R11/R13).

### 6. Switching the theme

1. On first load (no stored override for this user/browser), the app matches the OS `prefers-color-scheme` — resolved before first paint, so there is no flash of the wrong theme.
2. The signed-in user toggles the theme control in the app header; the app switches immediately and remembers the override.
3. On every subsequent load, the remembered override takes precedence over the OS setting until the user changes it again.

---

## Feature NFRs

| ID | Statement |
|---|---|
| NFR1 | The sign-in form is fully keyboard-completable (tab to each field, submit via Enter or a reachable button) per the project's WCAG 2.2 AA bar (requirements §6.6.5), with a visible focus indicator on every interactive element and no reliance on colour alone for the rejected-credentials message. |
| NFR2 | Theme resolution (OS preference or remembered override) completes before first paint — a blocking, head-embedded resolution ahead of hydration, not a client-side effect that runs after render (project.md §Styling & Branding, "Theme switching" implementation trap). |
| NFR3 | The sign-in screen's time-to-interactive meets the project's general budget (p95 ≤ 2.5s, requirements §6.6.2) despite being the first, unauthenticated screen loaded. |
| NFR4 | The session/identity check on entry to a protected route (`GET /v1/auth/userinfo` via the server-side layout gate) resolves within the project's time-to-meaningful-content budget (p95 ≤ 1.5s) without a client-visible blocking spinner for the check itself. |

---

## Out of Scope

- User and account provisioning, password reset, and self-service account creation — the two to three named accounts are pre-provisioned in the credential store outside this application; this application provides no way to create them (requirements §1.6).
- SSO / OIDC / external identity-provider integration — the authentication contract is credentials-only, with no external identity provider (requirements §1.6, §6.6.1).
- Multi-factor authentication or any step-up re-authentication — no action prompts for a second factor or step-up re-auth; the authentication contract defines neither (requirements §6.6.1).
- Per-resource permission enforcement for actions owned by other epics (file upload, transaction review/decision, bulk approval, export) — this epic delivers the sign-in flow and the role-gating mechanism (hidden-vs-offered actions, in-page denial message); each later epic wires its own screens/actions into that mechanism using its own permissions.
- Role and user administration UI (creating/editing users or roles) — explicitly out of scope for the whole application (requirements §1.5).

---

## Notes & Caveats

- **CORS is an open backend dependency, not a frontend defect.** `GET /v1/health` on the auth-api/BFF is verified reachable, but no `Access-Control-Allow-Origin` header is currently returned. Real browser sign-in will not complete cross-origin until the backend adds a non-wildcard `Access-Control-Allow-Origin` (matching the frontend origin) plus `Access-Control-Allow-Credentials: true` (project.md NFR-base-6). Server-side/automated flows are unaffected. If the Next.js same-origin rewrite pattern below is used, this dependency is bypassed entirely for browser calls — see the next note.
- **Use the "existing/multiple backends" shape from `bff-auth-pattern.md`, not the "single BFF you control" shape.** The auth-api is an existing backend owned by another team, at its own real paths (`/v1/auth/login`, `/v1/auth/userinfo`, `/v1/auth/logout`, `/v1/auth/health` on `http://localhost:4424`) — not the policy's illustrative `/bff/auth/*` names. Map these via same-origin `next.config` rewrites (policy §"Existing or multiple backends") so the browser only ever calls same-origin `/v1/*` paths; this also sidesteps the CORS dependency above for in-browser calls, since the browser never crosses origins.
- **`GET /v1/auth/userinfo` response shape differs from the policy's illustrative example.** The policy's Next.js integration pattern shows a `{ username, displayName }` shape; this project's real response is `UserInfoRead` (`Id, Email, FirstName, LastName, RolesString, Roles[]` — see Data Model above, from `documentation/auth-api.yaml`). Build the integration against the real schema, not the policy's example. Note also that `LoginRequest.Username` may be an email address in practice (the spec's own login example is `demo@test.com`) — don't assume a separate non-email username field exists server-side.
- **Role-name example in the spec is not the source of truth.** `documentation/auth-api.yaml`'s `RoleRead` example uses `"Viewer"`, and requirements §9 separately flags a "Viewer" vs "Approver" naming inconsistency in the source material. This project's two real roles, confirmed in project.md, are **Finance Uploader** and **Approver** — build role checks against those two names, not "Viewer".
- **Session UX numbers are inferred, not stated.** The 30-minute idle timeout, 60-second warning, 12-hour absolute timeout, and five-failed-attempts lockout (R16–R18) all carry an `inferred` source tag in requirements §6.6.1 rather than a literal source citation. Treat them as sensible working defaults; they are cheap to revisit if the user has a stronger opinion once this epic is in BUILD.
- **Scope boundary with the roles-×-resources matrix (requirements §6.5).** That matrix covers every resource across the whole application. This epic owns only the sign-in/session columns (`SignInRequest`, and the general principle that role determines what's offered afterwards, R14) plus the generic hidden/in-page-denial mechanism (R10/R11/R13). The per-resource cells (Transaction, ExpenseFile, FileSetting, etc.) belong to the epics that own those screens and actions — they consume this epic's gating mechanism rather than re-implementing it.
