# Journal — epic files-view-redesign

## Story 1 — The files register as a ruled batch listing

- **The row's Delete lost its red ink.** In the old card-era design it was the only red thing
  on the screen; in this one the shared control notation carries no colour at all, and a red
  control repeated once per row would be the loudest thing on a page whose whole discipline is
  withholding. The delete is still protected exactly as before — it still asks you to confirm,
  and the confirmation still names the file — so nothing about how safe it is has changed, only
  how loud it looks.
- **The design pieces the request list had been keeping to itself are now shared.** Six things
  (the full-page bleed, the ruled band an answer sits in, a listing's edge padding, a ruled row,
  a figure cell, an identifier cell, plus the label-on-a-rule-with-a-glyph control) were written
  inside the request list's own files. The files register needs every one of them, and so will
  the remaining five stories in this epic, so they were moved into the one shared notation file
  and the request list now reads them from there. Nothing about the request list changed on
  screen — its whole test suite still passes — but there is now one copy of each rule weight
  instead of two drifting apart.

## Story 2 — The submission slip

- **The form for sending a file in now reads like the list underneath it:** the setting and the
  file are underlined fields with small capitalised labels instead of boxes in a card, and Submit
  is words on a rule rather than a blue button. Nothing about what it accepts, what it refuses,
  or when Submit becomes available has changed.
- **The line naming the file you picked** used to read "Chosen file: expenses.csv". It now reads
  as a small capitalised label with the file name beside it in the fixed-width lettering — the
  same way every stated value on these screens reads. Same words, no colon.
- **The browser's own "Choose File" button needed stating explicitly.** Once the redrawn slip was
  open in a browser, that button was the one thing still looking unfinished: bold, in the wrong
  lettering, jammed against the file name beside it. It is drawn by the browser and does not pick
  up the field's lettering on its own, so it had to be stated — plus a gap, because taking the box
  away had taken the spacing with it.

## Story 3 — A file's own slip, and its processing history

- **A file's own page now opens like the register line it was opened from:** the file name in the
  typewriter face, then its setting, processed time, status, record count and latest activity as
  small capitalised labels each sitting directly over its own value, on one ruled line that wraps
  on a phone. The old boxed "File details" card is gone. It says exactly what it said before.
- **The processing history is now a ruled table** — thin lines between activities, small
  capitalised column headings, both times in the typewriter face — with no box around it. An
  activity still running still shows no outcome and no finish time; those two cells are simply
  greyed so the times the service did record hold the ink.
- **Three treatments that had quietly been written out twice each are now stated once** in the
  shared notation file and imported everywhere: the mono-tabular figure, the notice with its box
  stripped off, and that notice's small capitalised title. The submitted-files register and the
  submission slip now point at those shared copies instead of their own. One side effect worth
  knowing: the register's two notices now draw their warning symbol 2px smaller, matching the
  words beside it.
- **"Back to Expense files" and "Load this file again" are no longer boxed buttons** — they are
  small capitalised labels on a rule, like every other control on these two screens.
