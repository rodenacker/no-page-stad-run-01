# Story 3: Watch a file finish importing

- **Epic:** `expense-file-upload` — Upload an expense file
- **Slug:** `story-3-watch-a-file-finish-importing`
- **Requirements:** R10, BR2
- **Roles:** Finance Uploader (notified), Approver (sees the same live rows)
- **Route:** `/upload`
- **Target file:** `web/src/app/(authenticated)/upload/page.tsx`
- **Page action:** `modify_existing`
- **Infrastructure only:** no

## Plain summary

While a submitted file is still being processed, its row keeps itself up to date on screen — status, most recent processing step and record count — without the user reloading the page. When the file finishes importing, the Finance Uploader gets a notification naming the file and how many records were imported.

## Technical summary

Adds self-updating rows to the file list: while any listed file is in an in-progress status (`Uploaded` / `Validating`) the screen re-reads `GET /transactions-api/v1/file-logs?IsActive=Yes` on an interval and updates those rows in place, **stopping once nothing is in progress**.

On a file's transition into the `Imported` status the Finance Uploader is notified through the root layout's existing `ToastProvider` / `useToast`, with the file name and `RecordCount` taken from the service response (R10, BR5).

A file that resolves to `Validation failed` shows that status and produces **no** notification — telling the uploader about invalid rows is the next epic's requirement (R91), and this epic must not pre-empt it. A background refresh that fails leaves the last-known values on screen rather than blanking the list.

**Design choice resolved at the stories approval:** the user chose auto-refresh-while-processing (the recommended default) over a manual Refresh button. See the brief's Notes & Caveats.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | A file listed with an in-progress status updates its status, most recent processing activity and record count on screen without the user reloading the page. | playwright |
| AC-2 | When a submitted file reaches the imported status, the Finance Uploader is shown an in-app notification naming the file and the number of records imported. | vitest |
| AC-3 | When a submitted file ends in the validation-failed status, its row shows that status and no notification claims the file was imported. | vitest |
| AC-4 | Once no listed file is still in progress, the screen stops re-requesting the list on its own. | playwright |
| AC-5 | A background refresh that fails leaves the file list showing its last known values instead of blanking it or replacing the screen with an error. | vitest |
| AC-6 | The completed expense files screen — list, status labels and submit form together — passes an accessibility scan in a real browser. | playwright |

## Manual test checklist

- Submit a CSV as the Finance Uploader and leave the screen open → the file's status moves off in-progress on its own, without you reloading
- Watch the same row → its most recent processing step and record count fill in as processing goes on
- When the file finishes importing → a notification appears naming the file and how many records were imported
- Submit a CSV containing a bad row → the file ends as validation-failed and no notification claims it imported
- Open the screen as an Approver while a file is processing → the status updates for them too, without a reload
- Leave the screen open for a few minutes with nothing processing → the screen stays quiet and responsive

## Infrastructure reuse notes

- Notifications go through the existing root-layout `ToastProvider` / `useToast` (`web/src/contexts/ToastContext.tsx`, `web/src/components/toast/`); any test rendering the screen renders it inside that provider + `ToastContainer` composition, as the `(authenticated)` layout tests already do.
- Browser state that exists before React runs is read with `useSyncExternalStore`, never copied into state in an effect (the `react-hooks` lint rule rejects it).
- The polling loop must clear itself on unmount and must not stack intervals across re-renders.

## Reconciled test contracts (pinned by the generated tests — build to these)

- **The refresh interval must be 60 seconds or less.** Neither the brief nor this story sets a cadence, so the exact value is the developer's choice — but the Playwright spec advances the browser clock in 60-second jumps and buys one refresh per jump, so an interval longer than 60s reads to that spec as "it never refreshed". The Vitest tests deliberately assert only that the row catches up within a fake-clock window, so any sensible cadence satisfies them.
- **The refresh is a re-read of the same list call** (`GET /transactions-api/v1/file-logs?IsActive=Yes`), not a new endpoint and not one call per file. The Vitest layer throws loudly on any other endpoint, and the E2E layer asserts every observed read carries `IsActive=Yes`.
- **The notification is not role-gated inside the list component.** Story 1's component carries no session/role prop, and this story's Approver "sees the same live rows". The tests assert the notification fires on the transition into `Imported`; if role gating is ever wanted it must be an optional prop that still notifies by default.
- **The polling loop must clear itself on unmount and must not stack intervals across re-renders** — the E2E spec counts requests over a bounded window after everything settles.

## Notes

- AC-6 is where this epic's real-browser accessibility scan runs — on the finished screen, list plus submit form together, since all three stories modify the same page.
- AC-3 exists specifically to keep the invalid-rows **notification** out of this epic: that is epic 3's R91.
