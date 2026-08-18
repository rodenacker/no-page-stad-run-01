# Journal — Land on the screen your role uses

## Story 1 — Land on the screen your role uses

- Three specs written before this change assumed a single-role person stops at the "What you can do" screen, so they had to be re-expressed rather than left to fail. Signing in as an Importer is now checked to end on the expense files screen (it used to be checked to end on the chooser). The two "leave this screen by the header and come back" journeys used to travel via the chooser, which a single-role person no longer sees at all — they now travel via the other screen both roles can open, so they still prove the same thing: the screen you were on really was left behind, and the header alone got you back. Nothing was deleted and no assertion was loosened.
- Those re-expressed journeys now pass through screens they did not visit before, so each of them was given the mocked responses that screen reads — no test in this project is allowed to reach a real backend.
