# Journal — Upload an expense file

Decisions and changes worth remembering from this epic, in build order.

## Story 1 — The submitted expense files list

- The expense files screen is now open to **both roles**, not just the Finance Uploader — the Approver needs to watch files even though they cannot send one. Its entry point on the landing screen was reworded from "Upload an expense file" to "Expense files", with a description that describes the screen rather than promising every visitor they can submit something.
- **Epic 1's role-gating tests had to move house.** They proved the "excluded entry points are absent, never greyed out" rule using the fact that an Approver was not offered the upload screen — which this story deliberately makes untrue. Both the Vitest test and the browser test now prove the same rule on the review-and-decide screen (`/requests`), which is still Approver-only. The rule being checked is unchanged; only the example changed.
- **Forward note for the `expense-request-list` epic:** `/requests` is the last role-exclusive address, and requirements R86/R87 widen it to both roles. When that epic widens it, epic 1's relocated role-gating tests lose their example again and will need a different one (or the rule will need proving on an in-screen action rather than an address). The reasoning is recorded in the header comment of `web/src/lib/auth/access-map.ts` so whoever picks that epic up finds it.
- Status colours follow the mapping already agreed at project level: `Uploaded` and `Validating` read as informational, `Imported` as success, `Validation failed` as a warning, `Cancelled` as neutral. A status the app has never heard of is shown in neutral with its own words and no icon — it is never blanked or treated as an error.
- The list read lives in a new `web/src/lib/api/files.ts` rather than inline in the component, so the required `IsActive=Yes` query parameter is stated once. Story 2's upload wrapper belongs in that same module.
- `ProcessDate` and `RecordCount` are printed exactly as the service returns them — no date or number formatting anywhere — per the project's "displayed, not policed" stance for service-owned values.

### Test infrastructure added this epic

- `web/vitest.setup.ts` gained a small guarded block shimming `hasPointerCapture`, `releasePointerCapture` and `scrollIntoView`, which Radix needs under jsdom. Added for story 2's setting picker; the later request-list epic reuses it for any `select` / `dropdown-menu` / `popover`. Each shim reports jsdom's true state and swallows no errors.
- The setting picker was reconciled to the Shadcn `select` **before** any code was written: the two story-2 test layers initially disagreed (native `<select>` vs. Radix), and only Radix can satisfy the keyboard-only journey, since a browser's own dropdown is drawn by the OS where a test driver cannot reach the options.
