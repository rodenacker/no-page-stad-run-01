# Employee Expenses

A central finance person uploads batches of ad-hoc employee expense payment requests as CSV files; between one and three approvers review the imported requests on a shared screen and record a single approval decision per request, after which an external system handles reimbursement.

| Field | Value |
|---|---|
| Project slug | `employee-expenses` |
| Created | 2026-08-03T00:00:00Z |
| Intake source | docs |
| Backend connectivity | verified — both auth-api/BFF and transactions-api reachable (see below); CORS still an open item on both |

---

## Roles & Permissions

**Template:** `custom`

| Permission | Finance Uploader | Approver |
|---|---|---|
| View main dashboard | ✓ | ✓ |
| Upload an expense file | ✓ | |
| Review and decide on a transaction | | ✓ |
| Bulk-approve transactions | | ✓ |

> Permissions extend during BUILD as new stories surface new actions — see [agent-autonomy.md](.claude/shared/agent-autonomy.md). Additions land here via a project-change PR (§6.1 of the epic-branch plan). Permission removals or role-set changes halt for user review.
>
> `[SOURCE NOTE]` The source spec (`documentation/requirements-application.md` §6.5) already documents a detailed roles-×-resources access-control matrix (Transaction, ExpenseFile, FileSetting, FileProcessLog, User, Role, SignInRequest, and per-flow access) for these two roles, including one conditional grant (`Approver` may decide their own expense request, per BR-02). That detail is intentionally **not** duplicated here — per the custom-template convention this table stays minimal at the project level — and instead feeds the Functional Requirements / Access Control sections of each epic's `brief.md` as its stories surface those actions.

---

## Authentication

| Field | Value |
|---|---|
| Method | `bff` |
| BFF login endpoint (if BFF) | `POST /v1/auth/login` |
| BFF userinfo endpoint (if BFF) | `GET /v1/auth/userinfo` |
| BFF logout endpoint (if BFF) | `POST /v1/auth/logout` |
| Custom auth notes (if custom) | N/A |

> Auth method is never inferred — the user must confirm explicitly per [authentication-intake.md](.claude/policies/authentication-intake.md).

Session is conveyed exclusively via an HttpOnly, Secure, `SameSite=Strict` cookie named `session`, set by the BFF on successful login (`documentation/auth-api.yaml`). Both the auth-api/BFF and transactions-api declare the same `SessionCookie` security scheme (`apiKey` in `cookie`, name `session`) — the transactions-api trusts the session minted by the BFF. The frontend never holds a credential or token (see Rule 10, [authentication-intake.md](.claude/policies/authentication-intake.md)).

---

## Data Source & Backend Integration

| Field | Value |
|---|---|
| Data source | `existing-api` |
| Backend status | `running` |
| Mock layer required | no — both backends are running and reachable |

### Backend connectivity — auth-api / BFF (VERIFIED)

| Aspect | Value |
|---|---|
| Base URL | `http://localhost:4424` |
| Auth scheme | `cookie` — SessionCookie, `apiKey` in cookie, name `session`, minted by `POST /v1/auth/login` |
| Auth header | N/A (cookie-based; browser attaches automatically) |
| Auth value format | N/A |
| Credential env vars | none — Rule 10: nothing static for the frontend to hold |
| Smoke-test endpoint | `GET /v1/health` |
| Smoke-test mode | reachability-only |
| Smoke-test status | verified |
| Smoke-test verified at | 2026-08-03 (see `generated-docs/specs/api-smoke-test.sh`) |
| Smoke-test notes | 200 OK on `GET /v1/health` |
| CORS / proxy notes | No `Access-Control-Allow-Origin` header returned. Frontend (`localhost:3000`) and BFF (`localhost:4424`) are different ports — cross-origin for CORS purposes even though same-site for the `SameSite=Strict` cookie. The BFF must return a non-wildcard `Access-Control-Allow-Origin` (matching the frontend origin) plus `Access-Control-Allow-Credentials: true`. Open backend requirement — see NFR-base-6 below. |

### Backend connectivity — transactions-api (VERIFIED)

| Aspect | Value |
|---|---|
| Base URL | `http://localhost:4423/transactions-api` (no trailing slash — user-confirmed value; the spec's own `servers:` entry has a trailing slash, `http://localhost:4423/transactions-api/`) |
| Auth scheme | `cookie` — same SessionCookie scheme as the BFF (shared session) |
| Auth header | N/A (cookie-based) |
| Auth value format | N/A |
| Credential env vars | none |
| Smoke-test endpoint | `GET /v1/file-sources`, `GET /v1/transactions` |
| Smoke-test mode | reachability-only |
| Smoke-test status | verified |
| Smoke-test verified at | 2026-08-03 (see `generated-docs/specs/api-smoke-test.sh`) |
| Smoke-test notes | Initially unreachable during intake (404 on all endpoint attempts — the service had not yet been started). Re-probed once started: `GET /v1/file-sources` and `GET /v1/transactions` both returned 401. Under reachability-only mode (authentication-intake.md Rule 10) a 401/403 on the unauthenticated probe scores as success/reachable — the service is up and correctly enforcing the session cookie. |
| CORS / proxy notes | No `Access-Control-Allow-Origin` header returned. Same open item as the BFF below — cross-origin from a `localhost:3000` frontend, needs a non-wildcard `Access-Control-Allow-Origin` plus `Access-Control-Allow-Credentials: true`. Still unverified in-browser. |

### Required env var shape (names only — no values; two base URLs, not one)

| Env var | Purpose |
|---|---|
| `NEXT_PUBLIC_AUTH_API_BASE_URL` | auth-api / BFF base URL (login, logout, userinfo, health) |
| `NEXT_PUBLIC_TRANSACTIONS_API_BASE_URL` | transactions-api base URL (files, transactions, users, roles, file-sources) |

`web/.env.local` and `web/.env.example` were stale (declared a single `NEXT_PUBLIC_API_BASE_URL=http://localhost:8042`, matching neither service) and have been updated to the two-service shape above with the non-secret localhost URLs — no credential values, per Rule 10.

### API specs

| Path | Source |
|---|---|
| `documentation/auth-api.yaml` | user-provided |
| `documentation/transactions-api.yaml` | user-provided |

---

## Compliance

**Applicable domains:** `popia` — user-confirmed via the INTAKE compliance blocking multi-select. PCI-DSS, HIPAA, and SOC 2 were confirmed **not** applicable.
**Region (if Personal data applies):** `ZA` — South Africa (POPIA), user-confirmed at the multi-select (not locale-inferred; the ZAR-currency / South African merchant-name locale signals in the sample CSV are consistent with this but were not the basis for the answer).

### Compliance Requirements

> The three bullets below are `[SOURCE-DOCUMENTED]`, taken directly from `documentation/requirements-application.md` §6.6.4 "Compliance UI behaviour" — nothing generic was added on top of them, and the generic POPIA consent-mechanism boilerplate from `compliance-intake.md` is deliberately **not** emitted because the source explicitly documents the opposite (no consent banner needed). Applying domain knowledge for the confirmed `popia` domain beyond what §6.6.4 already states is left as `[INFERRED]` per compliance-intake.md's standard treatment — no additional obligations are added here where they would conflict with the source.

- `[SOURCE-DOCUMENTED]` Account numbers MUST be masked to their last four digits wherever expense payment requests are listed; the full value is revealed only by an explicit user action on a single request.
- `[SOURCE-DOCUMENTED]` The exported CSV carries unmasked account numbers, because the external reimbursement system consumes it as-is; the export action is attributed to the signed-in user who produced it.
- `[SOURCE-DOCUMENTED]` No consent banner is presented — every user is a named, authenticated member of staff and no optional tracking is performed.

---

## Styling & Branding

Extracted from `documentation/design-system-light.html` and `documentation/design-system-dark.html` — both ship an embedded JSON metadata block (`"colours"` / `"typography"`) with raw hex values and provenance tags (`extracted-from-url` vs `inferred-from-domain`). These two files are the styling source of truth for this project; both a light and a dark theme are provided.

| Field | Value |
|---|---|
| Primary brand color (light) | `#00AEEF` |
| Primary brand color (dark) | `#49BEE9` |
| Accent / secondary (light) | `#006DE3` |
| Accent / secondary (dark) | `#5CA1EB` |
| Tertiary accent (light) | `#001276` |
| Tertiary accent (dark) | `#1E35B8` |
| Background (light) | `#FFFFFF` |
| Background (dark) | `#171D1F` |
| Surface (light) | `#F6F6F6` |
| Surface (dark) | `#283236` |
| Text (light) | `#272727` |
| Text (dark) | `#E9ECED` |
| Text muted (light) | `#515151` |
| Text muted (dark) | `#A5B1B6` |
| Font family (headings) | `Cabin` (Google Fonts) |
| Font family (body) | `Cabin` (Google Fonts) |
| Theme | both |
| Source | `documentation/design-system-light.html` + `documentation/design-system-dark.html` |

> The design system's own metadata records the brand heading/body font as proprietary self-hosted "Barclays Effra" (`@font-face`, not loadable), substituted with `Cabin` as the nearest loadable humanist-sans equivalent. Treat `Cabin` as the production font; do not attempt to source "Barclays Effra".

### Semantic status colors (light / dark)

Directly relevant to this app's status displays (UI-21: "Status values are conveyed by intent-mapped colour paired with an icon or text label" — approved=success, rejected=error, imported=informational, cancelled=neutral):

| Semantic | Light | Dark |
|---|---|---|
| Success | `#15803D` | `#2CBE62` |
| Warning | `#B45309` | `#F4842F` |
| Error | `#B91C1C` | `#E97B7B` |
| Info | `#2563EB` | `#779DEE` |

> Component-specific styling (button radii, card shadows, etc.) emerges during BUILD. This section captures only palette intent and typography per [styling-centralisation.md](.claude/policies/styling-centralisation.md).

### Theme switching (dark mode) — project-wide convention

**User-confirmed** (not inferred) — applies across every epic, since theming is a project-wide concern:

- On first load, the app respects the user's OS colour-scheme preference (`prefers-color-scheme`).
- An in-app control, placed in the signed-in app header, lets the user override that preference.
- An explicit user override is remembered across sessions and takes precedence over the OS setting on every subsequent load.

Both the `:root` (light) and `.dark` token blocks in `web/src/app/globals.css` are populated from `documentation/design-system-light.html` and `documentation/design-system-dark.html` respectively, one value per token per theme — the paired light/dark hex table above (Primary / Accent / Background / Surface / Text / Text muted, plus the Semantic status colors table) is the source for both blocks.

`[OWNER]` The theme control itself (the header UI element that lets the user switch/override the theme) is in scope for the **`sign-in-and-app-shell`** epic, since it lives in the signed-in app header. That epic's `brief.md` must include it as a requirement — flagging here so it is not lost between project.md and epic planning.

No component may reference a colour directly — [styling-centralisation.md](.claude/policies/styling-centralisation.md) rules 1–5 (tokens by name only, no hex literals, no inline colour functions, no Tailwind palette utilities, both `:root` and `.dark` populated for every token). This is what makes the OS-follow + override behaviour work end-to-end without per-screen dark-mode work.

`[IMPLEMENTATION TRAP]` The theme must be resolved (OS preference or remembered override) **before first paint** — otherwise the user sees a flash of the wrong theme on load. This is the one real implementation risk in this approach and should be handled explicitly during BUILD (e.g. a blocking inline script / theme resolution before hydration), not left to a client-side effect that runs after render.

---

## Baseline NFRs

- **NFR-base-1:** Accessibility — WCAG 2.1 Level AA baseline
- **NFR-base-2:** Performance — First Contentful Paint < 2.5s on a mid-tier mobile network
- **NFR-base-3:** Responsive design — mobile (≥360px) / tablet (≥768px) / desktop (≥1280px) breakpoints
- **NFR-base-4:** Browser support — latest two versions of Chrome / Edge / Firefox / Safari
- **NFR-base-5:** Error UX — user-visible error states with retry affordance for all async operations
- **NFR-base-6:** CORS — both the auth-api/BFF and the transactions-api must return a non-wildcard `Access-Control-Allow-Origin` matching the frontend origin plus `Access-Control-Allow-Credentials: true`, so the browser-managed session cookie is honoured on cross-origin requests from `localhost:3000`. Currently absent on both services at smoke-test time — open backend requirement, not a frontend-side fix.

> Source-doc note: `documentation/requirements-application.md` §6.6.5 states the project's own accessibility target as **WCAG 2.2 AA** (one level higher than this template's WCAG 2.1 AA baseline) for every surface, including the request list, decision confirmations, and the sign-in form, plus full keyboard completability for every action (including selection, bulk approval, and rejection with a note). Treat WCAG 2.2 AA as this project's effective accessibility bar, superseding NFR-base-1's 2.1 AA floor.
