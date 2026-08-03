# Story 3: The signed-in app shell — who you are, and signing out

| Field | Value |
|---|---|
| Epic | `sign-in-and-app-shell` — Sign in and the signed-in app shell |
| Story index | 3 |
| Slug | `story-3-app-shell-identity-and-sign-out` |
| Route | `/` |
| Target file | `web/src/app/(authenticated)/layout.tsx` |
| Page action | `create_new` |
| Roles | Finance Uploader, Approver |
| Requirement IDs | R2, R3, BR1, BR4, NFR4 |
| Infrastructure only | no |

## Plain summary

Once signed in you get the app's header showing your own name and role, and a Sign out that really ends your session and returns you to sign-in. Anything you are not signed in for sends you to sign-in first — including the app's front door and the browser Back button after you sign out.

## Summary

Creates the `(authenticated)` route group and its **server-gated** layout (calls `requireSession()`, redirects **before** any protected content renders) and **replaces** the starter template's welcome page at `/` with the signed-in landing screen.

Adds the app header rendering the signed-in identity and role from the current session, plus sign-out that **awaits** `POST /v1/auth/logout` and only ends the session and navigates on a successful response — a failed logout surfaces an error instead of redirecting as though it worked ([bff-auth-pattern.md](../../../../.claude/policies/bff-auth-pattern.md) Rule 8).

Identity and role are **re-resolved on server-rendered navigation** rather than cached.

**This story owns the shared shell** every later story in this epic renders inside, and carries the epic's one real-browser accessibility scan (AC-5). Stories 4, 5 and 6 render inside this shell and must **not** re-assert shell-wide gating or re-run the accessibility scan.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | A signed-in user sees their own name and their role in the app header. | `vitest` |
| AC-2 | Sign out returns the user to the sign-in screen only after the auth service confirms it; if that call fails, an error is shown and the user is not sent away as though it had worked. | `vitest` |
| AC-3 | While signed out, any protected address — including the app's front door — lands on the sign-in screen rather than a welcome page, and the protected page's content never appears first. | `playwright` |
| AC-4 | After signing out, pressing the browser Back button does not reveal the page that was on screen; the user is returned to the sign-in screen. | `playwright` |
| AC-5 | Every control in the signed-in shell is reachable and operable by keyboard with a visible focus indicator, and an automated accessibility check of the shell passes. | `playwright` |
| AC-6 | The name and role shown come from a fresh session check on each navigation, so a change to the user's roles is reflected on the next screen rather than showing a remembered value. | `vitest` |

## Manual test checklist

- ☐ Sign in → the header shows your own name and your role
- ☐ Click Sign out → you go back to the sign-in screen
- ☐ Sign in, sign out, then press the browser Back button → you are sent to sign-in, not back into the app
- ☐ While signed out, type the app's front-door address → you land on sign-in, not a welcome page
- ☐ While signed out, type a protected address straight into the address bar → you land on sign-in, and the protected page never flashes up first
- ☐ Move through the header with Tab → every control is reachable and clearly focused

*Plus 2 technical checks the agents verify automatically.*

## Implementation notes

### Module paths the tests pin

- Async **server** layout at `web/src/app/(authenticated)/layout.tsx` (default export), awaiting Story 1's `requireSession()`.
- Client `SignOutButton` at `web/src/components/layout/SignOutButton.tsx`. Together with Story 5's `ThemeToggle`, `web/src/components/layout/` is this epic's home for shell components.
- Sign-out goes through `post()` from `@/lib/api/client` (CLAUDE.md §2), **not a Server Action** — a Server Action can't branch client-side into the error path AC-2 requires.

### Landmark trap — real accessibility failure if missed

The template's root layout (`web/src/app/layout.tsx`) currently wraps children in `<main className="min-h-screen">`. A `<header>` nested **inside** `<main>` loses its `banner` landmark role in the real DOM — so an isolated component test can pass while Story 3's real-browser accessibility scan (AC-5) fails. Restructure the root layout so the shell `<header>` is a **sibling** of `<main>`, not a descendant. This is exactly the kind of change CLAUDE.md §6 authorises: replace the template's structure rather than nesting inside it.

### General

- `web/src/app/page.tsx` is the starter template's Welcome page and must be **REPLACED, not wrapped** (CLAUDE.md §6) — AC-3 exists precisely to force that.
- `web/src/app/layout.tsx` already wraps children in `ToastProvider` — **extend that root layout** rather than nesting a new provider stack inside it (CLAUDE.md §6).
- Install `dropdown-menu` with the pinned Shadcn CLI **if** the identity/sign-out area needs a menu: `(cd web && npx shadcn add dropdown-menu --yes)`. A plain header button for sign-out is acceptable and simpler — don't add a menu just to have one.
- **The theme control is NOT a dropdown item.** Story 5 specifies an always-visible switch in the header (a single `<button>` whose accessible name states the theme it will switch *to*). Build that shape, not a menu entry — one shape only, no duplication between this story and Story 5.
- Reuse the existing toast infrastructure for the failed-sign-out error.
- Accessibility bar is **WCAG 2.2 AA** (requirements §6.6.5).
- No colour values in components — reference tokens per [styling-centralisation.md](../../../../.claude/policies/styling-centralisation.md).
