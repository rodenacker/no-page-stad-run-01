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
