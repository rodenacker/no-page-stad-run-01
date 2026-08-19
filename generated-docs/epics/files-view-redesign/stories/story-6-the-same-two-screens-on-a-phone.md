# Story 6 — The same two screens on a phone

- **slug:** `story-6-the-same-two-screens-on-a-phone`
- **route:** `/upload`
- **targetFile:** `web/src/components/files/SubmittedFilesList.tsx`
- **pageAction:** `modify_existing`
- **roles:** Importer, Approver
- **requirementIds:** R3, R4, R21, R24, R1, BR1, BR9
- **isInfrastructureOnly:** false

## Plain summary

On a narrow screen every listing on both screens — the files register, the import preview, the rejected rows and the processing history — becomes the same ruled listing, tightened: each row shows what identifies it, two or three key values and its actions, with nothing needing sideways scrolling.

## Summary

Carries the narrow-viewport form of the ruled listing across all four listings on `/upload` and `/upload/file`, reusing the existing crossover in `lib/layout/viewport.ts` rather than deriving a second breakpoint. Each row becomes one group of ruled lines carrying its primary identifier, two to three key values and its actions, with no horizontal page scroll at 360px, list semantics intact, and full action parity with the wide presentation by tap and by keyboard. Also the epic's closing regression pass: the landing screen and sign-in remain intact on the shared token/font layer, and the root layout's direction contract is untouched.

## Acceptance criteria

| ID | Criterion | Coverage |
|---|---|---|
| AC-1 | On a 360px-wide screen each file in the register is one group of ruled lines showing its file name, two to three key values and its actions, with no sideways scrolling of the page. | playwright |
| AC-2 | At that width each import-preview row, each rejected row and each processing-history activity reads the same way — its identifier, two to three key values, its actions reachable — with no sideways scrolling of the page. | playwright |
| AC-3 | Nothing is reachable only on a wide screen — every action offered on either screen at desktop width is offered at phone width, by tap and by keyboard. | playwright |
| AC-4 | Status marks, verdicts and masked account numbers stay legible at that width, and each listing is still announced as one list of rows. | playwright |
| AC-5 | Nothing outside these two screens moved — the landing screen and sign-in still look and work as they did, and the app's recorded design direction is still in place, unchanged. | playwright |

## Manual test checklist

- Narrow the browser to phone width and open Expense files → each file is a group of ruled lines and you never have to scroll sideways
- Open a validated file at phone width → the preview rows, the rejected rows and the processing history all read the same way, still with no sideways scrolling
- Compare what you can do at phone width against a wide screen → nothing is missing
- Check a status and a masked account number at phone width → both are still easy to read
- Open the landing screen, then sign out and back in → both still look and work exactly as they did

## Reuse notes (from the planner — read before implementing)

- Reuse the existing narrow/wide crossover in `web/src/lib/layout/viewport.ts` — the same switch the request list already turns on. **Do not derive a second breakpoint.**
- `web/src/components/ui/table.tsx` wraps every table in `overflow-x-auto` with `whitespace-nowrap` cells. That wrapper is exactly what makes today's seven-column tables scroll sideways inside their container — this story has to answer it rather than inherit it.
- **Accessibility baseline lives here.** `epicIntroducesSharedSurface` is `false` for this epic (correctly — the shell, fonts, tokens and direction contract all already exist), so no baseline is placed automatically. This project's bar is **WCAG 2.2 AA**, superseding the template's 2.1 floor, and R4 puts keyboard completability on both screens. `test-generator` must add a single `@axe-core/playwright` scan of `/upload` **and** `/upload/file` in this story's spec — it is the only story that already visits both.
- R24 is the closing regression guard: the landing screen and sign-in are **out of scope to restyle** but must still work and look as they do. The root layout's direction contract (seed key `29469d17`) is untouched.
