# Epic: Redesign the expense files view as a batch register

Inherits roles, auth, data source, compliance, and styling from `project.md`. The
typefaces, colour strategy, and design authority `project.md` §Styling & Branding
already carries were changed by `request-list-redesign`, not by this epic — this brief
implements the remaining reach of that same, already-confirmed direction; it does not
re-derive or re-propose any of it.

**Primary sources (all confirmed, all binding):**
`documentation/design-brief-batch-listing.md` ("The Batch Listing", seed key
`29469d17`) — read its §3 (Structural thesis, Sequence, Focal moment, Signature
interaction, Typography, Colour strategy), its **Cross-surface reach** table, and its
§4 Scope and boundaries; `generated-docs/project.md` §Styling & Branding (Colour
strategy, Design authority, Semantic status colours); and
`generated-docs/epics/request-list-redesign/brief.md`, both as the precedent for how a
redesign epic here is framed and as the source of the shared pieces this epic must
reuse (`StatusBadge`/`StatusMark`, the ruled field notation in
`components/requests/fieldNotation.ts`, the ruled action notation `RequestActions`
established, the reserved-gutter convention). Where this brief paraphrases either
source document, the source governs on any conflict.

**Depends on:** every epic that shipped the current expense-files screens and their
behaviour — `expense-file-upload`, `file-validation-and-retry`, `import-preview`,
`file-deletion` — plus `request-list-redesign` for the design language this epic
carries forward and `sign-in-and-app-shell` for the app shell both screens live inside.
This epic **redesigns the presentation** those epics built; it does not revisit what
any of them decided a user may do.

---

## Goal

Carry the Batch Listing direction from the shared expense request list onto the whole
expense-files area — `/upload` (the submitted-files register and the submit-a-file
slip) and `/upload/file` (a file's own page: its detail, its processing history, its
import preview, and its rejected rows) — exactly as `request-list-redesign` applied it
there. The design brief's own **Cross-surface reach** table names these targets
directly: import preview + rejected rows are "the world's strongest fit — these ARE
the source artifact… with the reject listing appended at the back exactly as the
document does it"; Upload is "the batch's submission slip, in the same control-total
grammar"; the Files list is "a register of batches, one ruled line each with its
control totals."

This closes a loop `request-list-redesign` deliberately left open: that epic's control
block reads `BATCH: ALL FILES` because the shared queue cannot name one batch per row.
Here, one row **genuinely is** one batch — the files register is where a batch finally
gets a real name.

This is a presentation redesign only. Every behaviour a user can currently exercise
across both screens must still be exercisable, identically, when this epic is done. No
new capability, no permission change, no new endpoint.

---

## Data Model

**No persisted entity is introduced or changed**, and **no new API call is added.**
This epic acts entirely on data these screens already fetch:

| Existing data | Fetched via | Used by |
|---|---|---|
| `FileLog[]` (`Id`, `ProcessDate`, `SettingName`, `CurrentFileName`, `RecordCount`, `CurrentStatus`, `LastExecutedActivityName`, `HasBulkErrorFile`, …) | `GET /v1/file-logs?IsActive=Yes` | `SubmittedFilesList` (the register), `SubmittedFileDetail` (one file's header) |
| `FileSettingRead[]` | `GET /v1/file-settings` | `SubmitExpenseFileForm` (the setting selector on the slip) |
| `FileProcessLog[]` | `GET /v1/file-process-logs/{LogId}` | `FileProcessingHistory` |
| The file's own bytes, parsed to `ImportPreviewRow[]` | `GET /v1/files/download` | `ImportPreview` |
| `ValidationErrorRow[]` (parsed from `ValidationErrors.JsonArray`) | `GET /v1/files/validation-errors` | `ImportPreview`'s rejected block, `RejectedRows`, `CorrectionRowsDownload` |

Two presentation-only reads already exist and are reused, not re-derived:

- **A file's own "control totals"** are its existing `RecordCount` (how many rows it
  held) alongside, where the import preview has run, the two counts `ImportPreview`
  already states in plain language — rows that will import, rows rejected
  (`import-preview` brief §Data Model). This epic does not add a new aggregate figure
  at the register level: unlike the request list, there is **no** new top-of-screen
  control block summing across files. "One ruled line each with its control totals"
  (design brief, Cross-surface reach) means each row of the register states **its own**
  existing record count as a tabular mono figure inline, in the shared listing
  grammar — not a second, file-spanning total. See Notes & Caveats.
- **Verdict ordering within `ImportPreview`.** The rows are already partitioned by
  verdict for the counts above; this epic changes how they are **arranged on screen**
  (R14 below) — a presentation reordering over data the component already holds, not a
  new read or a new field.

None of the above requires a new API call, a new field on the wire, or a change to any
existing derived value (`isKnownFileStatus`, `rowsToFixIn`, `actingUploaderIn`) — this
epic is new **views** over data these screens already have in memory.

---

## Functional Requirements

Hard constraints carried forward verbatim in substance from the design brief's §4 and
from the two screens' existing briefs (all pre-existing, all must continue to hold):

| ID | Statement | Source |
|---|---|---|
| R1 | Every user-observable behaviour that exists on `/upload` and `/upload/file` today must still hold after this redesign — submitting a file against a named setting, watching a file's status and record count, downloading the original file or the generated error file, retrying validation, deleting a file (with its confirmation stating the true scale), reading the processing history, previewing every row's import/reject verdict, and downloading rejected rows as a correction CSV all produce the same outcomes for the same inputs. | Design brief §4, "Must remain untouched"; epicDescription |
| R2 | Every status is conveyed by an intent-mapped colour paired with an icon or text label, never colour alone. | UI-21; design brief §4 |
| R3 | On a viewport ≥360px wide, each row of the files register, each import-preview row, each rejected row, and each processing-history activity presents its primary identifier, two to three key values, and an action overflow, with no horizontal scrolling of the page. | UI-23; design brief §4 |
| R4 | Every action on both screens — submitting, retrying, deleting, downloading, revealing a masked account number — is completable by keyboard alone, to the project's WCAG 2.2 AA bar. | project.md §Baseline NFRs note; design brief §4 |
| R5 | Account numbers stay masked to their last four digits everywhere `ImportPreview` and `RejectedRows` show them; the correction CSV (`CorrectionRowsDownload`) keeps whatever masking convention it already applies, unchanged by this epic. | project.md §Compliance; `import-preview` brief |
| R6 | A capability a signed-in role lacks is absent from the screen, never present-but-disabled — submitting a file, retrying validation, and deleting a file stay the Importer's alone; both roles keep reading everything else (the register, a file's detail, its processing history, its import preview, its rejected rows, both downloads). | project.md hidden-never-disabled convention; `expense-file-upload`/`file-validation-and-retry`/`file-deletion` role gating |
| R7 | No colour value appears outside a named token in `globals.css`; every token used by these two screens is populated in both `:root` and `.dark`. | styling-centralisation.md rules 1–5; design brief §4 |
| R8 | `Public Sans` (all text) and `Azeret Mono` (figures, references, masked account numbers, record counts, and field labels) are the only two faces on these screens — already loaded project-wide by `request-list-redesign`; this epic spends them, it does not load them again. | project.md §Styling & Branding; design brief §3 Typography |
| R9 | Nothing built here duplicates a piece `request-list-redesign` already shares: the ruled status mark (`StatusBadge`/`StatusMark`/`statusInkFor`), the tracked micro-label and underline-only field notation (`FIELD_LABEL_CLASS`/`RULED_FIELD_CLASS` in `components/requests/fieldNotation.ts`), and the ruled action notation `RequestActions` established are imported and reused as-is on these two screens, not reimplemented as a second dialect of the same design. | epicDescription; design brief §3 |
| R10 | The submitted-files register (`SubmittedFilesList`) is redrawn as a ruled listing in the request list's own grammar: full-bleed to the page padding, hairline row rules, 11px tracked mono column heads, every figure (record count) right-aligned and tabular, and the file reference/setting name set in mono where they function as identifiers. No card, no striped rows, no status pill. | Design brief §3, Cross-surface reach ("Files list… a register of batches, one ruled line each with its control totals") |
| R11 | Each row of the register states its own record count as a tabular mono figure, inline, in the same notation the request list's listing uses for its right-aligned figures — this is the row's "control total," not a new aggregate spanning the register. | Design brief §3, Cross-surface reach; §Data Model above |
| R12 | The per-row `Delete file` control, the per-row `Open` link into the file's own page, and the register's three existing states (busy, nothing submitted yet, failed load with retry) are preserved exactly, restyled into the shared ruled action notation and the shared band-with-hairline-borders treatment the request list's non-row answers already use. | `file-deletion` R1/R11; `expense-request-list`/`request-list-redesign` precedent for restyled state bands |
| R13 | `SubmitExpenseFileForm` — the submission slip — is redrawn using the shared underline-only ruled field notation for its setting selector and its file input's label, and its record-count-shaped feedback (where the form reports a refusal or a submission) is set in the shared tracked-label/mono-figure grammar. It remains a real `<input type="file">` in the tab order and a submit that stays unavailable until a setting and a CSV are both chosen, unchanged. | Design brief §3, Cross-surface reach ("Upload… the batch's submission slip, in the same control-total grammar"); `expense-file-upload` brief |
| R14 | Within `ImportPreview`, rows are arranged as **one listing followed by one reject listing appended at the back** — every row that will import first, in the file's own relative order among themselves, followed by every rejected row, in the file's own relative order among themselves — rather than interleaved in raw file-row order. Each row keeps its existing `Will import` / `Rejected` verdict as words beside an intent colour (`StatusBadge`), unchanged. | Design brief §3, Cross-surface reach ("A listing shown pre-commit, with the reject listing appended at the back exactly as the document does it") |
| R15 | `ImportPreview`'s two blocks (will-import, rejected) are each drawn full-bleed with hairline row rules, tracked mono column heads, and every eligible value (reference, transaction date, masked account number) set in mono — the same listing grammar `request-list-redesign` gave the expense request list, applied here to the pre-commit artifact this design calls its strongest fit. The rejected block carries its own heading in the tracked micro-label notation, reading as a distinct section appended at the close of the will-import listing rather than a second, differently-styled table. | Design brief §3, Cross-surface reach |
| R16 | `RejectedRows` (the file-validation-failed section, sourced separately from `/v1/files/validation-errors`) receives the same ruled-listing treatment as R15 — hairline rules, tracked mono column heads, right-aligned tabular figures where the row's own values are numeric, masked account numbers in mono with the existing per-row reveal — since it is, in the design's own words, part of "the reject listing… exactly as the document does it." | Design brief §3, Cross-surface reach; `file-validation-and-retry` brief |
| R17 | `SubmittedFileDetail`'s own header (setting, processed time, status, record count, most recent activity) is redrawn in the shared tracked-label / tabular-mono-figure field notation rather than as freestanding prose or a card — read as a compact slip stating what this one file is, in the same notation as the submission slip that produced it (R13) and the register row that lists it (R10/R11). | Design brief §3, Cross-surface reach; epicDescription |
| R18 | `FileProcessingHistory`'s table is redrawn with hairline row rules and tracked mono column heads, its two timestamps set in mono, matching the listing grammar used everywhere else on these two screens. An activity still running (no `DecisionResult`, no `EndDate`) continues to be listed exactly as today, showing nothing invented for either. | Design brief §3, Cross-surface reach; `file-validation-and-retry` brief |
| R19 | `FileDownloadActions` and `SubmittedFileActions` (`Retry validation`, `Delete file`, `Download original file`, `Download error file`) and `CorrectionRowsDownload` (`Download rows to fix and re-upload`) are restyled into the shared ruled action notation `RequestActions` established (`FIELD_LABEL_CLASS` on a rule, no boxed buttons), reusing that notation rather than composing a second one — same wording, same gating, same absent-not-disabled behaviour for a control an ineligible session or an ineligible file state does not offer. | epicDescription (reuse shared pieces); `file-deletion`/`file-validation-and-retry`/`import-preview` briefs for the underlying gating |
| R20 | `DeleteFileConfirmation`'s three confirmation shapes (imported-file request-count wording, simple wording, count-unavailable wording) and their three-phrase convention (asks / does it / backs out) are unchanged, restyled only insofar as the shared `ConfirmAction` primitive already reads in the ruled notation project-wide. | `file-deletion` R6/R7/R8; `ConfirmAction` (shared, unchanged by this epic) |
| R21 | The direction contract already emitted at the root layout (seed key `29469d17`, `request-list-redesign` R23/BR10) is unaffected by this epic — it is a project-wide artifact, not a per-epic one — and this epic's build must not remove, duplicate, or relocate it. | Design brief §7; `request-list-redesign` R23/BR10 |
| R22 | Reduced-motion parity: nothing on these two screens introduces a new orchestrated motion of its own. Where an existing transition (a toast confirming a submission or a delete, the 15s self-refresh updating a row in place) already respects `prefers-reduced-motion`, that continues unchanged; this epic adds no competing motion. | Design brief §6, "Motion is one orchestrated grammar, not scattered hover effects"; project.md `[IMPLEMENTATION TRAP]` note |
| R23 | Access to both screens and every action on them is unchanged: both Importer and Approver may open `/upload` and `/upload/file`; only the Importer sees the submit form, retry, and delete; either role reads the register, a file's detail, its processing history, its import preview, and its rejected rows, and either role downloads the original file and the error file. | `expense-file-upload`/`file-validation-and-retry`/`file-deletion` role gating (unchanged) |
| R24 | Screens this epic does not restyle — the landing screen and sign-in — keep working and remain visually intact on the shared token/font layer `request-list-redesign` already changed, even though they are not visually redesigned here. | Design brief §4, Scope and boundaries; `request-list-redesign` R28 |

---

## Business Rules

| ID | Statement |
|---|---|
| BR1 | DOM structure, class names, layout, and component composition are free to change. Existing Vitest and Playwright specs may be updated where the redesign legitimately changes markup or presentation — **never** where doing so would weaken a behavioural assertion. A spec change that removes or loosens an assertion of user-observable behaviour is not a legitimate update under this rule. |
| BR2 | R1's "no behaviour change" covers, without limitation: the submit flow and its setting/CSV validation (`expense-file-upload`); the register's auto-refresh cadence and its toast announcements on status transitions (`expense-file-upload` story 3); retry's status gating and its refusal handling (`file-validation-and-retry`); delete's any-status offer, its three confirmation shapes, its audit identity, and its post-delete navigation (`file-deletion` R1–R12); and import preview's two-read contract, its honest-fallback states, and the correction download's row scope (`import-preview` brief). |
| BR3 | R14's reordering (will-import rows, then every rejected row appended at the back) is a **presentation** change over data `ImportPreview` already holds and already partitions for its two plain-language counts — it changes no row's verdict, no row's values, and no capability. A test asserting the CURRENT file-row interleaving is not a behavioural assertion this rule protects; a test asserting a row's verdict, its values, or its correctability is. |
| BR4 | The reserved two-character gutter convention `request-list-redesign` built for the expense request list (selection tick / decided-status mark in a permanently reserved column) is **not** extended to the files register, `ImportPreview`, or `RejectedRows` by this brief. None of those listings offers a selection or a bulk action, so there is nothing for a gutter to carry beyond the verdict/status each row already states in its own status column. Introducing one without a stated need would be inventing a mechanism the design brief's cross-surface table did not ask for on these surfaces. |
| BR5 | No new aggregate ("control block") is added above the files register. "One ruled line each with its control totals" (design brief, Cross-surface reach) is satisfied by R11 alone — each row's own record count, stated inline — and must not be read as a licence to build a register-spanning total the design brief did not ask for here. |
| BR6 | The shared pieces named in R9 (`StatusBadge`/`StatusMark`, `fieldNotation.ts`'s two exports, `RequestActions`' ruled notation) are imported from their existing modules under `components/requests/` and `components/status/`. No file under `components/files/` or `components/upload/` re-declares an equivalent token, class string, or shape mapping — a second copy of any of them is how this epic would end up in a second dialect of the design, which epicDescription explicitly forbids. |
| BR7 | Hidden-never-disabled continues to govern every role-gated control on both screens (submit, retry, delete): an Importer sees them, an Approver's markup omits them entirely — never rendered and disabled. Nothing in this epic changes which role sees which control. |
| BR8 | No suppression directive of any kind (`eslint-disable`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`) may be used to route around a strict-mode, lint, or type conflict introduced by any requirement in this brief (project CLAUDE.md §4/§10; design brief §4 anti-goals). |
| BR9 | The anti-goals stated for the request list apply here unchanged: no SaaS-admin default (card-wrapped striped table, status pills, chip filter bar) and no dark "fintech terminal." A restyled register, submission slip, or import preview that reintroduces a card or a pill has not implemented this brief. |
| BR10 | R17's redrawing of `SubmittedFileDetail`'s header into the shared field notation is presentation only: the values shown (setting, processed time, status, record count, most recent activity) and their source (`FileLog`, read from the active file list, since there is no get-one-file endpoint) are unchanged. |

---

## Key Workflows

1. **Watch the register.** An Importer or Approver opens `/upload`; the submitted-files register reads as a ruled listing — hairline rules, tracked mono column heads, each row stating its own file name, setting, record count, and status mark (R10/R11) — rather than a card wrapping a striped table.
2. **Submit a file.** An Importer chooses a setting and a CSV on the redrawn submission slip (R13); the existing validation (setting and file both required, non-CSV refused by name) and in-page `role="alert"` feedback are unchanged, restyled into the shared field notation.
3. **Watch a submission get on.** The register keeps re-reading itself on its existing cadence while any file is in progress, announcing an import or a validation failure through the existing toast conventions, unchanged from `expense-file-upload`.
4. **Open a file.** Either role opens a row's `Open` link into `/upload/file`; the file's own header reads as a compact slip in the shared field notation (R17), the same notation the register row and the submission slip use.
5. **Read the processing history.** Either role reads the file's recorded activities as a ruled table with tracked mono column heads (R18); an activity still running shows no outcome and no end time, unchanged.
6. **Preview the import.** Either role reads `ImportPreview`'s single listing — every row that will import, followed by the reject listing appended at the back (R14/R15) — each row carrying its verdict as words beside an intent colour, unchanged from `import-preview`.
7. **Read the rejected rows and download a correction file.** Either role reads `RejectedRows` (once the file's status is `Validation failed`) as a ruled listing (R16); either role downloads the rejected rows as a correction CSV through `CorrectionRowsDownload`, restyled into the shared ruled action notation (R19) but otherwise unchanged.
8. **Retry validation.** An Importer retries a failed file through the redrawn `Retry validation` control (R19); the existing gating (offered only while `Validation failed`), its refusal handling, and the file's own re-read afterward are unchanged.
9. **Delete a file.** An Importer deletes a file from the register or from its own page, through the shared `DeleteFileConfirmation` in its unchanged three shapes (R20); the confirmation still states the file's true scale for an imported file, still names the file, and still leaves the reader on the same screen with the service's own wording on a refusal.
10. **Download the file's own artifacts.** Either role downloads the original submitted file, and the generated error file when the service reported one, through the redrawn `FileDownloadActions` (R19); both remain always-usable controls with their own per-control wait and refusal state.
11. **Read on a narrow viewport.** On a viewport ≥360px, each register row, each import-preview row, each rejected row, and each processing-history activity presents its primary identifier and two to three key values with an action overflow, and no surface scrolls the page sideways (R3).

---

## Feature NFRs

- **Craft bar is the acceptance bar, not polish.** As `request-list-redesign` already found: this world's discipline is withholding — no cards, no shadows, no pills to hide behind. Applied to the register, the slip, and the import/reject listings, a hairline short of exact reads as unfinished, not as restrained. This is an explicit acceptance concern for EPIC-END review and MANUAL-TEST on both screens, not an implementation detail.
- **The reordering in R14 must not degrade correction.** A user correcting a rejected row must be able to find it as reliably in the reordered listing as in the current file-order one — the reject listing appended at the back must be clearly delimited (its own heading, a hairline separating it from the will-import rows above) so a reader is never left wondering whether a row still above the reject heading is a rejected one out of place.
- **No new render-budget risk.** `ImportPreview` and `RejectedRows` may hold as many rows as the submitted file did; this epic's restyling (mono figures, hairline rules per row) must not push either past whatever render behaviour `import-preview`/`file-validation-and-retry` already established for a large file — this epic does not relax or need to relax either existing NFR, and introduces no new fetch that would.
- **Shared-component reuse is itself a review criterion.** Because R9/BR6 forbid a second dialect, EPIC-END review should specifically check that no new token, class string, or shape mapping was declared under `components/files/` or `components/upload/` that duplicates something `components/requests/` or `components/status/` already owns.

---

## Out of Scope

- **The landing screen and sign-in** — later epics in the redesign sequence (design brief §4, "Breadth and order": request list, then import preview + rejected rows, then upload, files list, landing, sign-in). This epic must leave both working and visually intact on the shared token/font layer it does not touch (R24), but does not restyle either.
- **`DESIGN.md`** — owed at the end of the whole redesign effort, written by the `impeccable-documenter` from the built world, not authored as part of this brief or this epic's deliverable.
- **A register-spanning control block, or any new aggregate figure** — explicitly not called for by the design brief's Cross-surface reach table for the files register (BR5); not to be added speculatively.
- **A reserved exception gutter on the register, the import preview, or the rejected rows** — explicitly not extended to these surfaces by this brief (BR4).
- **Any change to server contracts, the data model, roles, authentication, backend connectivity, or the compliance domain** — all confirmed unchanged for this epic (`projectChangesUnchanged`); nothing in this brief alters `project.md` §Roles, §Authentication, §Data Source, or §Compliance.
- **Any new user-facing capability.** This epic is a redesign of presentation only; no epic upstream of it gains or loses a capability as a result of this brief.

---

## Notes & Caveats

- **No prototype source exists for this project** (docs-only intake, confirmed across every prior epic's brief) — no prototype shortcuts to carry forward here.
- **This epic spends styling decisions `request-list-redesign` already made and recorded**, not new ones. `project.md` §Styling & Branding, §Colour strategy, and §Design authority govern; if anything in this brief appears to conflict with them, `project.md` governs.
- **R14's reordering is the one place this brief asks for a genuine presentation change beyond "restyle in place."** It is directly named by the design brief's Cross-surface reach table ("the reject listing appended at the back exactly as the document does it"), not an invention of this brief, but it is flagged here because it is the one requirement in this set that changes row ORDER rather than only row appearance — EPIC-END review should confirm existing `import-preview` Vitest/Playwright specs asserting row order were updated per BR3, not merely left failing or loosened.
- **This epic deliberately does not add a files-register control block or a reserved gutter** (BR4/BR5) — a future epic or a project-change PR would be the place to revisit either, not a decision made implicitly by extending this brief's scope.
- **The status presentation for file statuses (`FileStatusBadge` → the shared `StatusBadge`) already reads as a ruled mark, not a pill**, because `StatusBadge` itself was converted project-wide by `request-list-redesign` (its R26). This epic does not need to do anything further for file-status presentation beyond confirming it was not regressed by the surrounding restyle — the architecture record's description of the register showing "a status chip" predates that shared-component change and should be read as stale, not as a gap this epic must close.
- **`BATCH`/`RUN DATE` on the expense request list read `ALL FILES` and the newest date in the fetched set** precisely because the shared queue cannot name one batch per row (`request-list-redesign`, "Resolved spec gap — what `BATCH` and `RUN DATE` show"). This epic's register is where that promise is kept: each row's `CurrentFileName`/`SettingName` is a real batch name, stated once per row (R10/R11).
