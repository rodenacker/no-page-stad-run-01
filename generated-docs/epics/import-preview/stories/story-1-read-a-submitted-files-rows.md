# Story 1 — Read a submitted file's rows

| Field | Value |
|---|---|
| index | 1 |
| slug | `story-1-read-a-submitted-files-rows` |
| route | `null` (non-routable) |
| targetFile | `web/src/lib/files/parseSubmittedFileCsv.ts` |
| pageAction | `create_new` |
| isInfrastructureOnly | `true` |
| requirementIds | FR1, BR8, NFR-1 |
| roles | N/A |

## plainSummary

Teaches the app to read a CSV file that a user uploaded, so the rows of a submitted file can be listed back to them. Nothing changes on screen yet.

## Summary

A new client-side CSV reader at `web/src/lib/files/parseSubmittedFileCsv.ts`, built as the symmetric counterpart to the existing writer (`web/src/lib/transactions/exportCsv.ts`) and reusing its RFC 4180 quoting rules as the reference. It parses the seven-column shape with its header row into one record per data line in file order, and returns an explicit unreadable outcome — never partial rows, never a throw — for a body it cannot read or whose columns are not the expected seven.

Construction yields between chunks, the same way `buildRequestExportCsv` does, so a 10,000-row file does not hold the main thread.

**Column shape** (from `documentation/transactions_2026-04-15.csv`, the shape `POST /v1/files/upload` accepts):
`Reference,TransactionDate,AccountNumber,Description,Amount,TransactionType,Currency`

**Unreadable is a value, not an exception.** The caller (story 3) distinguishes *unparseable body*, *wrong column shape*, and *count mismatch*; this module owns the first two and returns them as discriminated outcomes.

**Tolerated eighth column (BR5a, AC-6).** The reader accepts the seven upload columns **optionally followed by a single trailing column named `Reason`** and discards it. That is what story 4's correction CSV emits, so an employee can correct it and re-upload it unmodified. The tolerance is exact — a trailing `Reason` in last position only. An unknown extra column, or a ninth alongside `Reason`, is still a wrong-shape refusal. Comment it as a deliberate round-trip affordance so it is not later "tidied away" into a lax parser.

**Input is CSV text, not a `Blob`** — the caller does the reading. Note that jsdom implements neither `Blob.text()` nor `Blob.arrayBuffer()`, so callers must use `FileReader`; a `.text()` call works in the browser and throws in every Vitest test on this epic.

## Acceptance Criteria

| AC | Text | Coverage |
|---|---|---|
| AC-1 | A seven-column file with a header row reads into one record per data line, in file order, each value under its own column. | vitest |
| AC-2 | A quoted value keeps commas, doubled quotes, and line breaks inside it intact, exactly as the existing writer produces them. | vitest |
| AC-3 | A file with a trailing newline and the same file without one read to the same records, with no empty final record. | vitest |
| AC-4 | A body that cannot be read as CSV, or whose columns are not the expected seven, returns an explicit "cannot be read" outcome rather than partial records or a thrown error. | vitest |
| AC-5 | Reading a 10,000-row file hands the main thread back between chunks rather than parsing in one blocking pass. | vitest |
| AC-6 | A file carrying the seven upload columns followed by a single trailing `Reason` column reads successfully, with the seven values intact and the `Reason` column discarded — so a correction file from story 4 can be re-uploaded unmodified. A different extra column, or a ninth alongside `Reason`, is still "cannot be read". | vitest |

## Manual Test Checklist

_None — under the hood, verified by stories 2 and 3._

## Reuse notes

- `web/src/lib/transactions/exportCsv.ts` supplies the RFC 4180 escaping rules (symmetric for parsing) and the chunked-yield pattern. Follow its structure; do **not** reuse `EXPORT_COLUMNS` — that is a nine-column report shape, not the seven-column upload shape.
