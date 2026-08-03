# Story 4: Role-aware entry points and the permission message

| Field | Value |
|---|---|
| Epic | `sign-in-and-app-shell` — Sign in and the signed-in app shell |
| Story index | 4 |
| Slug | `story-4-role-gating-and-permission-message` |
| Route | `/` |
| Target file | `web/src/app/(authenticated)/page.tsx` |
| Page action | `modify_existing` |
| Roles | Finance Uploader, Approver |
| Requirement IDs | R10, R11, R13, R14, BR3 |
| Infrastructure only | no |

## Plain summary

You are only offered what your role allows — a Finance Uploader is offered uploading, an Approver is offered reviewing, and the other one is not shown at all rather than greyed out. If you go straight to an address your role excludes, the app explains it on the page, names the permission you are missing and how to ask for it.

## Summary

Delivers this epic's **reusable role-gating mechanism** and its first live use. The signed-in landing screen renders only the entry points the current session's roles allow (**hidden, never disabled**), driven by a **single route/action access map** seeded from the requirements' roles-×-resources matrix (upload = Finance Uploader; review and decide / bulk approve = Approver).

Adds the in-page permission-denied surface **inside the normal app shell**, naming the missing permission with a path to request access, plus a way back to a permitted screen. The denial check runs **server-side ahead of routing** so an excluded address cannot fall through to a generic not-found page.

## User-approved design decision

At the stories approval the user chose **"register the addresses now"** for role-denial handling (`designChoices.roleDenialRegistration: "register-now"`).

**What this means:** the access map is seeded in *this* epic with the upload and review paths from requirements §6.5, so permission denial is observable and testable from epic 1 onward. **Known interim state:** for a *permitted* user, those addresses have no page until their own epics ship, so a permitted click lands on not-found until then. This is accepted and temporary.

**Cross-epic convention:** later epics attach their screens to these same access-map entries rather than re-implementing gating. Do not build a second gating mechanism.

## Canonical route addresses for the access map (pinned here — both spec files must agree)

Your source documents name *actions*, not URLs, so these are chosen here and are authoritative for the whole project. Later epics attach their screens to these exact addresses:

| Address | Screen | Allowed roles | Ships in |
|---|---|---|---|
| `/` | Signed-in landing | Finance Uploader, Approver | this epic |
| `/upload` | Submit an expense file + file list | Finance Uploader | epic 2 |
| `/requests` | Shared expense request list, review and decide | Approver *(see note)* | epic 4 |

**Known future adjustment — do not treat as a defect later.** `/requests` is seeded **Approver-only** in this epic because §6.5 grants the *review-and-decide flow* to the Approver, and that is what makes AC-1/AC-2's "offered vs absent" pair observable now. But requirement **R86** gives *both* roles read access to the request list, and **R87** gives both the export. So epic 4 (`expense-request-list`) must **widen `/requests` to both roles** while keeping the decide actions themselves Approver-only inside the screen. That is a deliberate, recorded evolution of the access map, not a regression.

Module paths the tests pin:
- `web/src/lib/auth/access-map.ts` — the single seeded access map both components derive from.
- `web/src/components/dashboard/RoleEntryPoints.tsx` — `({ user })`, `user` being the `UserInfoRead` body; renders one navigational **link** per allowed entry point.
  **Hard contract:** each entry point must be a real navigational link **carrying an `href`** — not a button with `router.push()`. Both of this story's spec files derive the target address from that `href` rather than hardcoding it, so a button-based implementation fails them.
- `web/src/components/auth/PermissionDeniedMessage.tsx` — `({ deniedPath })`; links back to `/`, never back to the denied address.

## Project-level permissions addition

`project.md` §Roles & Permissions currently lists only "View main dashboard" for both roles. This story adds **upload** (Finance Uploader) and **review / bulk-approve** (Approver) from requirements §6.5. That is a permissions *addition* — a Tier-2 factual change that lands in `project.md` via the [§6.1 project-change flow](../../../../.claude/policies/epic-branch-concurrency.md). Surface it with `requiresProjectChange: true` rather than editing `project.md` from this branch.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | A Finance Uploader is offered the file-upload entry point and an Approver is not offered it at all — it is absent, not shown greyed out. | `vitest` |
| AC-2 | An Approver is offered the review-and-decide entry point and a Finance Uploader is not offered it at all. | `vitest` |
| AC-3 | Going straight to an address the user's role excludes shows a message on the page naming the missing permission and how to request access, inside the normal app shell — not a generic error or not-found screen. | `playwright` |
| AC-4 | From that permission message the user can get back to a screen their role does allow. | `vitest` |
| AC-5 | The set of entry points offered follows the roles on the current session, so a user whose roles differ is offered a different set. | `vitest` |

## Manual test checklist

- ☐ Sign in as a Finance Uploader → you are offered the upload entry point, and the review-and-decide entry point is nowhere on the screen (not greyed out)
- ☐ Sign in as an Approver → you are offered review-and-decide, and the upload entry point is nowhere on the screen
- ☐ As an Approver, type the upload screen's address into the address bar → you see a message on the page naming the permission you are missing and how to ask for access, with the normal header still around it
- ☐ From that message, follow the link back → you return to a screen you can use
- ☐ Confirm you never get a browser error page or a blank screen for an address your role excludes

*Plus 1 technical check the agents verify automatically.*

## Implementation notes

- Renders inside Story 3's shell — do **not** re-assert shell-wide gating or re-run the accessibility scan here.
- Consume the role-check helpers from Story 1; do not re-derive role logic.
- Install `alert` with the pinned Shadcn CLI for the permission message: `(cd web && npx shadcn add alert --yes)`.
- Accessibility bar is **WCAG 2.2 AA** (requirements §6.6.5).
- No colour values in components — reference tokens per [styling-centralisation.md](../../../../.claude/policies/styling-centralisation.md).
