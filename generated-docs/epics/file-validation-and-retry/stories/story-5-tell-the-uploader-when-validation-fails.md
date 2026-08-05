# Story 5 — Tell the uploader when a file's validation fails

- **Slug:** `story-5-tell-the-uploader-when-validation-fails`
- **Epic:** `file-validation-and-retry` — Rejected rows, retry and cancel
- **Requirement IDs:** FR9
- **Roles:** Finance Uploader
- **Route:** `/upload`
- **Target file:** `web/src/components/files/SubmittedFilesList.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary (user-facing)

While the Finance Uploader has the Expense files list open, a file that finishes validating with rejected rows raises a notification naming the file. Unlike the "file imported" confirmation, this one stays until it is dismissed or acted on, and it takes the uploader straight to that file's rejected rows.

## Technical summary

Completes the notification pair the previous epic deliberately left half-built. Epic 2's `SubmittedFilesList` already tracks each listed file's previous status per id in a ref and notifies on arrival at `Imported`, and explicitly did **not** announce a `Validation failed` outcome because that is this epic's `R91`.

This story adds that announcement on the transition into `Validation failed`, as a **non-auto-dismissing** notification (`UI-19` / this epic's NFR-3: state the user must act on persists) carrying a link to `/upload/file?LogId=<id>`.

Audience is the Finance Uploader, so the list takes an **OPTIONAL** prop the page sets from the session. Epic 2's pinned contract requires any role gating here to be an optional prop that **still notifies by default**, so epic 2's existing tests stay honest — do not make the prop required and do not change `SubmittedFilesList`'s existing default behaviour.

NFR-4: in-app only. No email, SMS or webhook channel exists for this project.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | While a Finance Uploader has the Expense files list open, a file that finishes validation with rejected rows raises an in-app notification naming that file. | `vitest` |
| AC-2 | That notification stays on screen until the user dismisses or acts on it — it does not fade away on its own, unlike the confirmation shown when a file imports. | `vitest` |
| AC-3 | The notification takes the user straight to that file's page and its rejected rows. | `playwright` |
| AC-4 | A file that was already in the failed state when the list was opened raises no notification — only a file that reaches that state while the list is open. | `vitest` |
| AC-5 | An Approver watching the same list is not notified about rejected rows, and still sees the file's status change on the row exactly as before. | `vitest` |

## Manual test checklist

- ☐ As an Importer, leave the Expense files list open while a file finishes validating with bad rows → a notification appears naming that file
- ☐ Leave that notification alone for a minute → it is still there; it does not disappear on its own
- ☐ Click the notification → you land on that file's page showing its rejected rows
- ☐ Reload the list while that file is already in the failed state → no notification appears for it again
- ☐ As an Approver, watch the same file fail → you get no notification, but the row's status still changes on its own

Plus 1 technical check verified automatically.

## Infrastructure & reuse notes

The epic-wide list lives in `story-1-open-a-submitted-file.md` — read it. The ones that bite hardest here:

- Notifications go through the root layout's existing `ToastProvider` / `useToast` (`web/src/contexts/ToastContext.tsx`, `web/src/components/toast/`) — do not add a second notification mechanism.
- **Pinned contract from epic 2, story 3:** `SubmittedFilesList` carries no session/role prop and its notification is not role-gated. This story's Finance-Uploader-only notification must arrive as an OPTIONAL prop that still notifies by default, leaving epic 2's tests honest.
- The previous-status-per-id ref that drives AC-4 (no notification for a file already failed when the list opened) already exists in `SubmittedFilesList` for the `Imported` case — extend it, don't parallel it.
- `fileLogProgression([...])` gives the same file at successive statuses — that is the factory this story's transition tests need. Both layers import from `web/src/mocks/data/`.
- Playwright alert queries must be scoped to a region (e.g. `getByRole('main').getByRole('alert')`) — Next renders a permanently empty body-level `role="alert"` route announcer, so an unscoped query always matches two elements.
- A status must never be shown by colour alone, and no component may name a colour (all tokens live in `web/src/app/globals.css`).
