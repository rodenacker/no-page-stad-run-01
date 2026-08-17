
## Manual test — PASSED (2026-08-17)

The user worked through the epic's checklist and confirmed everything checked out,
including the three items no automated test could settle. All automated gates were
green beforehand: 193 Vitest tests, 9 Playwright tests against the production build,
the full quality suite, and an epic-end code review at high effort.

**What this resolves — the BR6 unknown is now answered.**

`DELETE /v1/files` was documented as removing a file "from the staging table", and an
imported file's rows have already left staging. Whether the service would delete such a
file, partially succeed, or refuse outright was untestable during BUILD (reading it
needs a signed-in session, and the frontend holds no credentials by design). The
manual pass covered:

1. **Deleting a file whose rows had already imported** — confirmed working.
2. **Nothing orphaned afterwards** — the expense requests list was checked after an
   imported-file delete; no decided requests were left behind without a file.
3. **The confirmation's numbers** — checked against the requests list for the same file,
   so the client-side `FileLogId` filter is counting the right rows.

Also confirmed by the same pass: the confirm choice remaining usable while the count is
still loading reads acceptably on a destructive action, and both the count wording and
the fallback refusal sentence read correctly to a real reader.

**Consequence worth carrying forward:** deleting an imported file genuinely destroys
live expense payment requests and the record of who approved or rejected them. That is
the user-directed reversal of the project's decision-permanence rule (R19/R24/R94),
now confirmed to work end to end rather than merely offered. `epic-plan.md`'s
"Deleting an imported file may not be supported" open dependency can be closed.
