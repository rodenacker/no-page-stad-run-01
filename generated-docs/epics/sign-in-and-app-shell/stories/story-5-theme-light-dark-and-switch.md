# Story 5: Brand theme with light and dark, and a switch in the header

| Field | Value |
|---|---|
| Epic | `sign-in-and-app-shell` — Sign in and the signed-in app shell |
| Story index | 5 |
| Slug | `story-5-theme-light-dark-and-switch` |
| Route | `/` |
| Target file | `web/src/components/layout/ThemeToggle.tsx` |
| Page action | `create_new` |
| Roles | Finance Uploader, Approver |
| Requirement IDs | R15, BR5, NFR2 |
| Infrastructure only | no |

## Plain summary

The app takes on the project's brand colours and typeface, in both a light and a dark version. It follows your computer's light/dark setting to start with, and the switch in the header lets you choose for yourself — your choice is remembered next time and beats the computer's setting.

## Summary

Populates **both** the `:root` (light) and `.dark` token blocks in `globals.css` from the supplied design-system files — brand, accent, tertiary, background, surface, text, muted text and the four semantic status colours — and wires **Cabin** as the heading and body face.

Resolves the theme **before first paint** via a blocking, head-embedded resolution (remembered override first, else the OS `prefers-color-scheme`), **never** a post-hydration effect, so there is no flash of the wrong theme.

Adds the theme control to the signed-in header; an explicit choice persists across sessions for this browser and takes precedence over the OS setting from then on.

Every colour is referenced **by token name** — no component carries a colour value.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | The app's colours and typeface match the project's supplied design system in both the light and the dark version, and every colour comes from the central theme file rather than being written into individual screens. | `none` (manual + styling gate) |
| AC-2 | On a first visit with no choice of their own, the user gets the version matching their computer's light/dark setting. | `playwright` |
| AC-3 | Using the switch in the header changes the whole app to the other version immediately. | `vitest` |
| AC-4 | A version the user chose themselves is still in effect on a later visit, even when the computer's setting says the opposite. | `playwright` |
| AC-5 | The right version is in place from the first paint — the page never flashes the other one while loading. | `playwright` |
| AC-6 | Text, labels and status colours stay easy to read in both versions. | `none` (manual) |

## Manual test checklist

- ☐ Set your computer to dark mode and open the app → it opens dark; switch the computer to light and reload → it opens light
- ☐ Watch the screen while the page loads → you never see a flash of the wrong version
- ☐ Click the theme switch in the header → the whole app changes immediately
- ☐ Reload, and come back later → your choice is still in effect, even if the computer's setting is the opposite
- ☐ Compare against the supplied design system → brand blue, backgrounds, text and status colours match in both versions
- ☐ Check that status text and labels stay easy to read in both versions

*Plus 1 technical check the agents verify automatically.*

## Token values (from `project.md` §Styling & Branding)

| Token | Light | Dark |
|---|---|---|
| Primary brand | `#00AEEF` | `#49BEE9` |
| Accent / secondary | `#006DE3` | `#5CA1EB` |
| Tertiary accent | `#001276` | `#1E35B8` |
| Background | `#FFFFFF` | `#171D1F` |
| Surface | `#F6F6F6` | `#283236` |
| Text | `#272727` | `#E9ECED` |
| Text muted | `#515151` | `#A5B1B6` |
| Success | `#15803D` | `#2CBE62` |
| Warning | `#B45309` | `#F4842F` |
| Error | `#B91C1C` | `#E97B7B` |
| Info | `#2563EB` | `#779DEE` |

Font (headings + body): **Cabin** (Google Fonts). The design system records the brand face as proprietary self-hosted "Barclays Effra", not loadable — `Cabin` is its own documented substitute. Do **not** attempt to source "Barclays Effra".

## Implementation notes

- `web/src/app/globals.css` already declares the full Shadcn token set in **both** `:root` and `.dark` — this story **replaces the values**. Do not invent new token names, and do not put colour values in components ([styling-centralisation.md](../../../../.claude/policies/styling-centralisation.md) rules 1–5).
- The before-paint theme resolution belongs in the existing root layout (`web/src/app/layout.tsx`) — extend it, don't nest a new provider stack (CLAUDE.md §6).
- Renders inside Story 3's shell — do **not** re-run the accessibility scan here.
- Keep contrast at **WCAG 2.2 AA** in both themes (requirements §6.6.5).
