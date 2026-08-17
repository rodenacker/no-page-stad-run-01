# Story 4: A status becomes a ruled mark, not a coloured pill

| Field | Value |
|---|---|
| Epic | `request-list-redesign` |
| Slug | `story-4-a-status-becomes-a-ruled-mark-not-a-coloured-pill` |
| Route | `/requests` |
| Target file | `web/src/components/status/StatusBadge.tsx` |
| Page action | `modify_existing` |
| Roles | Importer, Approver |
| Requirement IDs | R26, R18, R3, BR3, BR11, R28 |
| Infrastructure only | false |

## Plain summary

Statuses stop being rounded coloured pills and become ruled marks — a small shape beside a capitalised word — with a visibly different shape for each state so you can tell them apart before you notice any colour. This mark is shared with the files screens, so those must still read correctly too.

## Summary

Rewrites the shared `StatusBadge` as a ruled status mark (glyph plus tracked text label, hairline rule treatment, no pill/chip surface), satisfying UI-21's colour-plus-text pairing natively. Introduces the four structurally distinct shapes — imported/awaiting, approved, rejected, cancelled — in the shared component so any surface can use them, ahead of the gutter consuming them in story 6. Keeps the unrecognised-status passthrough (service's own words, no shape claiming meaning), keeps `PossibleDuplicateMark` composing on top of it, and confirms the five other surfaces that render it still read correctly.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | A status reads as a ruled mark — a small shape beside a capitalised word — and no longer as a rounded coloured pill, while still carrying the status in words. | `vitest` |
| AC-2 | Imported, approved, rejected and cancelled each get a visibly different shape, so they can be told apart with the colour ignored entirely. | `none` |
| AC-3 | A status the app has no wording for still reaches the reader in the service's own words, with no shape claiming to know what it means. | `vitest` |
| AC-4 | The possible-duplicate mark still says so in words beside its icon, in the same notation as the statuses. | `vitest` |
| AC-5 | The submitted-files list, a file's detail, its import preview and its rejected rows all still show their statuses correctly in the new mark. | `playwright` |
| AC-6 | The cancelled mark exists and renders correctly if it is used, even though no listed request can be cancelled. | `vitest` |

## Manual test checklist

- Open the request list → statuses read as a shape plus a word, with no pill or coloured capsule around them
- Photograph or screenshot the list in greyscale → you can still tell approved from rejected from awaiting, by shape alone
- Open the submitted-files list and a file's import preview and rejected rows → statuses there read correctly in the new mark, nothing broken or unstyled
- Find a possible duplicate as an Approver → it still says 'possible duplicate' in words, not just a colour

## Implementation notes

**This is a shared surface with eight consumers.** `StatusBadge` is rendered by `FileStatusBadge`, `SubmittedFilesList`, `SubmittedFileDetail`, `ImportPreview`, `RequestDetailPanel`, `RequestCards`, `PossibleDuplicateMark` and `ExpenseRequestList`. Change it **once, here**. Do **not** fork a request-list-only mark, and do **not** leave the files screens on the old pill — that would violate R28 and leave the app visibly half-restyled.

**Four shapes, structurally distinct (R18).** The point is that the shapes differ in *form*, not in tint — legible in greyscale, which is what AC-2's manual test actually checks. Think a filled/hollow/struck/ruled distinction, not four coloured dots. This is the component that story 6's gutter consumes, so the shapes must be usable at two-character width as well as inline with a label.

**BR3 — the shape supplements UI-21, it never replaces it.** The mark is the *first*, pre-colour signal. It does not discharge R3: a mark with no accompanying text or icon anywhere on the row would still fail. Keep the word.

**Keep the unrecognised-status passthrough (AC-3).** The existing component shows a status the app has no wording for in the service's own words. Preserve that, and give it **no** shape — a shape would be the component claiming to know a meaning it does not have.

**BR11 — `cancelled` is a file-level state.** A cancelled file's transactions never reach this list, so the cancelled shape will not appear in live test data. It must still exist and render correctly if exercised. Its absence from the request list at manual test is expected, not a bug — do not "fix" it by inventing a way to show it.

**No pill surface at all.** No `rounded-full`, no chip background. If the Shadcn `badge` primitive can't carry this without a pill, compose the mark from `badge`-free primitives rather than fighting it — but keep it one shared component.
