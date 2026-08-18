# Epic: Land on the screen your role uses

Inherits roles, auth, data source, compliance, and styling from project.md.

**Slug:** `role-aware-landing` · **Depends on:** `sign-in-and-app-shell` (the session/role gate and `requireSession()` this epic reads from), `expense-file-upload` (`/upload`), `expense-request-list` (`/requests`) — both destinations already exist and are already open to both roles in the route access map; this epic changes only where a person is sent, not what exists or who may open it.

---

## Goal

After signing in, send a person straight to the screen their role actually uses — the expense request list for an Approver, the expense files screen for an Importer — instead of always landing on the "What you can do" chooser, while leaving that chooser exactly as it is today for the two cases where it is still the right answer: someone holding both roles, and someone holding neither.

---

## Data Model

This epic introduces no new entities, fields, or API shapes. It reads the same `UserInfoRead.Roles` the landing screen and the access map already read (`web/src/types/auth.ts`, resolved via the existing `requireSession()`); the only "model" here is a destination decision, not data.

| Case | Roles held | Where the person lands |
|---|---|---|
| Approver-only | `Approver` only | `/requests` (today's expense request list) |
| Importer-only | `Importer` only | `/upload` (today's expense files screen) |
| Both roles | `Importer` and `Approver` | `/` — today's chooser page, both entry points, unchanged |
| Neither role | no recognised role | `/` — today's "nothing has been made available" message, unchanged |

---

## Functional Requirements

| ID | Statement |
|---|---|
| R1 | When the identity resolved for a navigation to the landing address (`/`) holds the Approver role and not the Importer role, the app shall send the person to `/requests` instead of rendering the chooser. |
| R2 | When the identity resolved for that navigation holds the Importer role and not the Approver role, the app shall send the person to `/upload` instead of rendering the chooser. |
| R3 | When the identity holds both recognised roles, the landing address renders today's chooser page unchanged — both entry points, the person picks for themselves. |
| R4 | When the identity holds neither recognised role, the landing address renders today's message unchanged — that nothing has been made available to the account yet, and to ask the account holder for the access needed. |
| R5 | The destination decision is made fresh for every navigation to the landing address, from the roles the existing `requireSession()` resolves for that navigation — never cached from an earlier visit or an earlier role set. |
| R6 | The decision reads only `ROLE_IMPORTER` / `ROLE_APPROVER` (`web/src/types/auth.ts`) via the existing access-map / role-check helpers already used by `entryPointsFor()` and `canAccess()` — no second copy of role-matching logic is introduced anywhere for this decision. |
| R7 | A signed-out visitor navigating to the landing address is still sent to sign-in by the existing layout gate, exactly as today — this epic adds no logic ahead of that gate and does not change it. |
| R8 | A deep link or bookmark directly to `/requests` or `/upload` continues to work exactly as today for both roles — this epic does not touch `allowedRoles` for either address, and does not add any redirect away from either screen. |
| R9 | Using the browser's Back button after being sent from the landing address to a destination does not trap the person in a redirect loop — landing on a destination is one-directional; nothing added by this epic redirects `/requests` or `/upload` back toward the landing address. |
| R10 | The signed-in person's own name and role continue to be shown once, by the app shell's header, unaffected by this epic. |

---

## Business Rules

| ID | Statement |
|---|---|
| BR1 | Only the roles on the identity resolved for the current navigation to the landing address decide the destination — the same `requireSession()` call the landing page already makes, not a value cached across navigations or stored client-side. |
| BR2 | `ACCESS_MAP` in `web/src/lib/auth/access-map.ts` — including `allowedRoles` for `LANDING_PATH`, `UPLOAD_PATH`, and `REQUESTS_PATH` — is not modified by this epic. Both screens remain open to both roles exactly as today; only the landing address's own behaviour changes. |
| BR3 | The redirect for a single-role identity is a real server-side redirect issued before any markup renders, not a client-side render swap — so a single-role person never sees a flash of the chooser first, and the browser's history behaves as a normal one-directional navigation rather than a client-pushed state change. |
| BR4 | No code path introduced by this epic sends a person from `/requests` or `/upload` back toward the landing address — the redirect this epic adds is one-directional (landing → destination) only, which is what keeps R9's back-button guarantee true by construction. |

---

## Key Workflows

### 1. Approver-only sign-in

1. Person with only the Approver role signs in.
2. Landing navigation resolves their identity; the decision (R1) sends them straight to `/requests`.
3. They see the expense request list immediately — no chooser screen in between.

### 2. Importer-only sign-in

1. Person with only the Importer role signs in.
2. Landing navigation resolves their identity; the decision (R2) sends them straight to `/upload`.
3. They see the expense files screen immediately — no chooser screen in between.

### 3. Both roles

1. Person holding both Importer and Approver signs in.
2. Landing navigation resolves both roles; today's chooser renders unchanged (R3), offering both entry points.
3. Person picks a destination themselves, exactly as today.

### 4. Neither recognised role

1. Person signs in with a role (or no role) this project does not recognise.
2. Landing navigation resolves no recognised role; today's message renders unchanged (R4).

### 5. Signed-out visitor / deep link (regression guard)

1. A signed-out visitor types the app's address; the existing layout gate sends them to sign-in, unaffected by this epic (R7).
2. A signed-in person (either role) opens `/requests` or `/upload` directly; both continue to open exactly as today (R8), independent of whatever the landing address would have chosen for them.

### 6. Back button after a single-role redirect

1. A single-role person lands, is redirected to their destination (workflow 1 or 2).
2. They press Back. Nothing in this epic sends them forward again in a loop (R9/BR4) — the redirect is one-directional, so there is nothing to loop against.

---

## Feature NFRs

| ID | Statement |
|---|---|
| NFR1 | For a single-role identity, the redirect to that role's destination is resolved and issued server-side before any markup is sent to the browser — no perceptible flash of the chooser page precedes the redirect. |
| NFR2 | The destination decision adds no additional call to the auth service beyond the `requireSession()` resolution the landing page already performs for this request. |

---

## Out of Scope

- Any change to who may open `/requests` or `/upload` — `allowedRoles` in `access-map.ts` is unchanged; this epic is about where a person arrives, never about what they may do once there.
- A per-user, remembered, or configurable landing preference (e.g. "always show me the chooser even though I only hold one role") — the destination is decided purely from the roles on the current identity, every time.
- Any role beyond the project's existing two (`Importer`, `Approver`) — this epic adds no new role and no new role-matching logic.
- Redesigning the chooser page's markup, copy, or the no-roles message — both are reused exactly as they render today for the two cases where they still apply (both roles; neither role).
- Role or permission administration UI — out of scope for the whole application (inherited from `sign-in-and-app-shell`'s brief and project.md).

---

## Notes & Caveats

- **This is a routing decision, not a permissions change.** `RoleEntryPoints` and `entryPointsFor()` already compute exactly the right thing for the two-role and no-role cases — they are not being replaced, only bypassed via redirect for the two single-role cases. Building a second "which roles can see what" computation for this epic's decision (rather than reading the same `ROLE_IMPORTER` / `ROLE_APPROVER` constants and the existing `access-map` helpers) would violate R6 and risk drifting from the access map over time.
- **Guard against the back-button trap by construction, not by testing it away afterward.** The trap this epic must avoid is a *pair* of redirects — landing sends a single-role person to their destination, and something on that destination sends them back to landing (e.g. a well-intentioned "if you're not supposed to be here, go home" check). No such reverse redirect exists today and none should be added for this epic: the existing in-page permission denial (from `sign-in-and-app-shell`, R11/R13) is the mechanism for "you can't be here," and it does not apply to either destination anyway, since both are already open to both roles.
- **No prototype source exists for this project** (intake source was `docs`) — this brief's requirements come directly from the epic description supplied at planning, not from a prototype catalogue.
