# Story 6: Session timeout warning and a graceful return to sign-in

| Field | Value |
|---|---|
| Epic | `sign-in-and-app-shell` — Sign in and the signed-in app shell |
| Story index | 6 |
| Slug | `story-6-session-timeout-warning` |
| Route | `/` |
| Target file | `web/src/components/session/SessionTimeoutWarning.tsx` |
| Page action | `create_new` |
| Roles | Finance Uploader, Approver |
| Requirement IDs | R16, R17 |
| Infrastructure only | no |

## Plain summary

If you leave the app sitting idle, you get a warning shortly before your session would end, with the chance to stay signed in. If you do nothing — or your session has already ended on the service — you are returned to the sign-in screen with a plain explanation rather than an error.

## Summary

Adds an **idle-activity warning** to the signed-in shell: after the configured idle period less the warning lead-time (working defaults: **30 minutes** idle, **60 seconds** warning lead), a warning offers to stay signed in; taking that option touches the session and dismisses the warning; taking no action returns the user to the sign-in screen with a session-timed-out explanation. Any activity resets the countdown.

Separately, when the auth service reports the session **already gone** — the absolute session cap is the service's to enforce, **not** the app's — the next protected navigation or call returns the user to sign-in with the same plain explanation rather than a raw error.

**The app asserts no session lifetime of its own.** The timings above are working defaults and the service remains authoritative. Do **not** build a 12-hour client-side timer.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | After a stretch with no activity, a warning appears about a minute before the session would end, offering the user the chance to stay signed in. | `vitest` |
| AC-2 | Choosing to stay signed in dismisses the warning and the user carries on without entering credentials again. | `vitest` |
| AC-3 | If the user does nothing after the warning, they are returned to the sign-in screen with a message saying the session timed out. | `playwright` |
| AC-4 | When the session has already ended on the auth service, the user's next action returns them to the sign-in screen with the same plain explanation rather than a raw error. | `vitest` |
| AC-5 | Continued activity resets the countdown, so an active user is never shown the warning. | `vitest` |

## Manual test checklist

- ☐ Sign in and then leave the app untouched → shortly before the session would end, a warning appears offering to stay signed in
- ☐ Click the stay-signed-in option → the warning goes away and you carry on without signing in again
- ☐ Leave the warning alone → you are returned to the sign-in screen with a message that the session timed out
- ☐ Keep clicking around the app → no warning appears while you are active
- ☐ If you can, leave the app open past the service's maximum session length → your next click returns you to sign-in with the same plain explanation, not an error

*Plus 1 technical check the agents verify automatically.*

**Manual-test setup note:** to make the idle-timeout checks practical, shorten the idle and warning thresholds via their env vars rather than waiting 30 minutes. Document the variable names in `web/.env.example` when implementing, and point the tester there — every timeout check above uses the same shortened thresholds.

## Implementation notes

- Install `alert-dialog` with the pinned Shadcn CLI for the warning: `(cd web && npx shadcn add alert-dialog --yes)`.
- Make the idle period and warning lead-time configurable (env vars, documented in `web/.env.example`) so they can be shortened for manual testing.
- Reuse the existing toast infrastructure where a non-blocking message is the right surface.
- Renders inside Story 3's shell — do **not** re-run the accessibility scan here.
- Accessibility bar is **WCAG 2.2 AA** (requirements §6.6.5) — the warning must be announced to screen readers and be operable by keyboard.
- No colour values in components — reference tokens per [styling-centralisation.md](../../../../.claude/policies/styling-centralisation.md).
