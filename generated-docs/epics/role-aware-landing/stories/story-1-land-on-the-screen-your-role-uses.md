# Story 1 — Land on the screen your role uses

- **slug:** `story-1-land-on-the-screen-your-role-uses`
- **route:** `/`
- **targetFile:** `web/src/app/(authenticated)/page.tsx`
- **pageAction:** `modify_existing`
- **roles:** Importer, Approver
- **requirementIds:** R1, R2, R3, R4, R5, R6, R7, R10, BR1, BR3, NFR1, NFR2
- **isInfrastructureOnly:** false

## Plain summary

After signing in, an Approver goes straight to the expense request list and an Importer straight to the expense files screen, instead of stopping at the "What you can do" screen first. Someone holding both roles, or neither, still sees exactly what they see today.

## Summary

Adds a role-based destination decision to the signed-in landing page at `/`. The page resolves the session it already resolves, and for an identity holding exactly one recognised role issues a server-side redirect to that role's screen before any markup is produced; for both roles or no recognised role it renders today's `RoleEntryPoints` output unchanged. The decision reads `ROLE_IMPORTER` / `ROLE_APPROVER` through the existing role and access-map helpers, so no second copy of role-matching logic is introduced.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | A person holding only the Approver role who goes to the app's address arrives at the expense request list, and the "What you can do" screen is never shown on the way. | playwright |
| AC-2 | A person holding only the Importer role who goes to the app's address arrives at the expense files screen, and the "What you can do" screen is never shown on the way. | playwright |
| AC-3 | A person holding both the Importer and Approver roles still gets today's "What you can do" screen with both entry points, wording unchanged. | vitest |
| AC-4 | A person holding no recognised role still gets today's message that nothing has been made available to their account yet, unchanged. | vitest |
| AC-5 | The destination is worked out afresh from the roles on the current visit — a person whose roles have changed since their last visit is sent where their current roles say, never where the previous visit sent them. | vitest |
| AC-6 | A signed-out visitor going to the app's address is still sent to the sign-in screen, with no destination decision happening ahead of that. | playwright |

## Manual test checklist

- Sign in as an Approver → you land straight on the expense request list; you never see the "What you can do" screen.
- Sign in as an Importer → you land straight on the expense files screen; you never see the "What you can do" screen.
- Watch closely as the screen loads after signing in → the "What you can do" screen does not flash up first.
- If you have an account holding both roles, sign in with it → you still get "What you can do" with both entry points, exactly as before.
- If you have an account with neither role, sign in with it → you still get the "nothing has been made available to your account yet" message.
- Sign out, then type the app's address while signed out → you're sent to the sign-in page.
- On whichever screen you land, your own name and role still show once, in the header.

## Reuse notes (from the planner — read before implementing)

- The destination decision must read `ROLE_IMPORTER` / `ROLE_APPROVER` from `web/src/types/auth.ts` through the existing `hasRole` / `rolesOf` helpers in `web/src/lib/auth/roles.ts`, and use `LANDING_PATH` / `UPLOAD_PATH` / `REQUESTS_PATH` from `web/src/lib/auth/access-map.ts` — R6 forbids a second copy of role matching. `rolesOf()` already drops unrecognised role names, which is exactly the "neither role" case.
- `requireSession()` (`web/src/lib/auth/requireSession.ts`) is wrapped in React `cache()` per request, so calling it in the page alongside the layout's call costs no second `GET /v1/auth/userinfo` — NFR2 is satisfied by reusing it, not by inventing a prop-passing scheme.
- The redirect belongs in `web/src/app/(authenticated)/page.tsx` using Next's server-side `redirect()` before returning any markup (BR3/NFR1).
- Do **not** edit `ACCESS_MAP` `allowedRoles` in `web/src/lib/auth/access-map.ts` (BR2). `RoleEntryPoints` and `entryPointsFor()` are reused untouched for the both-roles and no-role cases — they are bypassed by the redirect, not replaced.
- Vitest fixtures for every case already exist in `web/src/mocks/data/identity.ts`: `userInfoFor('Importer'/'Approver')` for single roles, `userInfoForRoles(['Importer','Approver'])` for both, `userInfoWithUnrecognisedRole()` for neither. No new fixtures needed.
- The Playwright auth stub mints **single-role** sessions only — `web/e2e/fixtures/credentials.ts` holds just `importerUser` and `approverUser`, and `web/e2e/support/auth-api-stub.ts` maps a session token to one role. AC-3 and AC-4 are tagged vitest for this reason; if a browser journey for those cases is ever wanted, extend the existing stub rather than writing a second one.
- **Existing specs assume a single-role user lands on the chooser and will fail once this ships — update them, do not delete them:** `web/e2e/epic-sign-in-and-app-shell-story-2-sign-in.spec.ts` (lines ~185, ~259 assert `toHaveURL('/')` after sign-in), `web/e2e/epic-expense-file-upload-story-4-get-between-screens.spec.ts` (~line 413) and `web/e2e/epic-expense-request-list-story-4-sort-and-page.spec.ts` (~line 635). Each of those legs is really testing "the previous screen was left behind" — re-express it against the new destination rather than weakening the assertion.
- Vitest baselines rendering `RoleEntryPoints` directly (`web/src/__tests__/integration/epic-request-list-redesign-baseline.test.tsx` lines ~165, ~201; `epic-sign-in-and-app-shell-story-4-*.test.tsx`) test the component, not the page, so they stay valid.
