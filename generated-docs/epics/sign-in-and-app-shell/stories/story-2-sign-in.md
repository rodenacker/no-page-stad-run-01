# Story 2: Sign in

| Field | Value |
|---|---|
| Epic | `sign-in-and-app-shell` — Sign in and the signed-in app shell |
| Story index | 2 |
| Slug | `story-2-sign-in` |
| Route | `/sign-in` |
| Target file | `web/src/app/sign-in/page.tsx` |
| Page action | `create_new` |
| Roles | Finance Uploader, Approver |
| Requirement IDs | R1, R4, R5, R6, R7, R8, R9, R12, R18, NFR1, NFR3 |
| Infrastructure only | no |

## Plain summary

A Finance Uploader or an Approver signs in with their username and password and lands in the app. Missing fields are called out when you leave the field, and a refused sign-in never tells you which of the two was wrong.

## Summary

Creates the unauthenticated `/sign-in` screen: a single two-field form (Username, Password), both required and asterisk-marked with one legend line, Username focused on open. Required-field checks report **on blur**, credential rejection reports **on submit**, nothing reports on keystroke.

Submits through the same-origin auth path, forwards the `Set-Cookie` from the auth service to the browser, and navigates to the app shell on success. Refused credentials show a message that does **not** reveal which field was wrong.

**IMPORTANT:** the app does **not** count failed attempts itself — the auth service owns lockout and its spec documents no lockout response, so the screen surfaces whatever refusal message the service returns (including a temporary-lockout message and retry time if the service sends one). Do **not** build a client-side attempt counter.

Composes the existing Shadcn input/label/button primitives.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | The sign-in screen shows one form with a Username and a Password field, both marked as required with a single line explaining the marker, and the cursor starts in Username. | `vitest` |
| AC-2 | Leaving a required field empty and moving off it shows "Username and password are required."; nothing is reported while the user is still typing. | `vitest` |
| AC-3 | Signing in with accepted credentials takes the user to the app's main signed-in screen. | `playwright` |
| AC-4 | A refused sign-in shows a message that does not say which of the two fields was wrong, and the user re-enters both. | `vitest` |
| AC-5 | Whatever reason the auth service gives for refusing a sign-in — including a temporarily locked account and when it can be retried — is shown to the user as given. | `vitest` |
| AC-6 | The form can be completed and submitted with the keyboard alone, every control shows a visible focus indicator, and an automated accessibility check of the screen passes. | `playwright` |

## Manual test checklist

- ☐ Open the app while signed out → the sign-in screen appears with the cursor already in Username
- ☐ Leave Username empty and move to Password → you see "Username and password are required."
- ☐ Type into either field → no message appears while you are typing
- ☐ Sign in with a correct username and password → you land on the main signed-in screen
- ☐ Sign in with a wrong password → the message does not say which field was wrong
- ☐ Complete and submit the form using only Tab and Enter → it works, and you can always see which control has focus

*Plus 2 technical checks the agents verify automatically.*

## Implementation notes

- Shadcn primitives already present in `web/src/components/ui/`: `button`, `card`, `input`, `label`. Install `form` with the pinned CLI rather than hand-rolling: `(cd web && npx shadcn add form --yes)`.
- Add the sign-in schema to the existing `web/src/lib/validation/schemas.ts` (Zod) — don't create a parallel validation module.
- Reuse the existing toast infrastructure (`web/src/contexts/ToastContext.tsx`, `web/src/components/toast/`, `web/src/lib/utils/toast.ts`) for error surfacing — don't build a new notification system.
- Accessibility bar for this project is **WCAG 2.2 AA** (requirements §6.6.5), with full keyboard completability.
- No colour values in components — reference tokens per [styling-centralisation.md](../../../../.claude/policies/styling-centralisation.md).
