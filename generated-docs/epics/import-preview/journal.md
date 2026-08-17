
## Manual test — SKIPPED (2026-08-17)

The user chose "Skip for now" at the manual-test approval. The epic merges without
a hands-on pass, so the three items below were never checked against the real
backend. All automated gates were green: 176 Vitest tests, 4 Playwright tests
(1 non-routable stub skipped), the full quality suite, and an epic-end code review.

**Still unconfirmed — these need a signed-in session against the live services:**

1. **Rejected-row matching.** Rows are tied back to their line by `Reference`, a
   working assumption — the validation-errors wire shape is undocumented for this
   domain (the spec's only example is from an unrelated schema). Isolated in
   `REJECTION_MATCH_KEY` (`web/src/lib/files/importPreviewRows.ts`) so a different
   real key is a one-place change, with the BR9 fallback shipped for anything
   that cannot be placed.

2. **The download returns the original file.** If the service returns something
   reprocessed or packaged rather than the submitted CSV, the preview reports it
   cannot read the file instead of listing rows.

3. **The correction CSV round-trip (BR5).** The file carries a trailing `Reason`
   column by user decision, making it eight wide against the upload's seven.
   Whether `POST /v1/files/upload` accepts it is untested. Mitigated by
   construction: the column is always last, so the first seven are byte-identical
   to the upload shape, and dropping it is a one-line change to
   `CORRECTION_COLUMNS` (`web/src/lib/files/correctionCsv.ts`), which is generated
   from the parser's own column list.

**Unverified by consequence:** whether the validation service reports one entry per
rejected row or one per defect. The epic-end code review found the multi-defect case
was handled wrongly (the row appeared twice); it is now correct under both shapes,
but no real multi-problem file has been seen.
