# Journal — Land on the screen your role uses

## Story 1 — Land on the screen your role uses

- Three specs written before this change assumed a single-role person stops at the "What you can do" screen, so they had to be re-expressed rather than left to fail. Signing in as an Importer is now checked to end on the expense files screen (it used to be checked to end on the chooser). The two "leave this screen by the header and come back" journeys used to travel via the chooser, which a single-role person no longer sees at all — they now travel via the other screen both roles can open, so they still prove the same thing: the screen you were on really was left behind, and the header alone got you back. Nothing was deleted and no assertion was loosened.
- Those re-expressed journeys now pass through screens they did not visit before, so each of them was given the mocked responses that screen reads — no test in this project is allowed to reach a real backend.

## Story 2 — Back, bookmarks and the app's name still behave

- This story was about proving the Back button and the app-name link stay safe now that people are sent straight to their own screen. Rather than assume, the story's browser tests were run for real against a production build: all three passed against the code as it already stood, so the one-directional guarantee was genuinely there and not just hoped for. What did change is that the code now spells out that the app's address must be *replaced* in browser history rather than added to it. Next.js happens to do that by default today, but the same instruction means the opposite in a slightly different context, so leaving it unsaid meant the whole guarantee rested on a default nobody had chosen. Now a future change that would quietly re-introduce the trap has to argue with a written decision.
- One thing worth knowing for later: the "Access needed" message has a link reading "Back to what you can do", which points at the app's address. That wording could have become wrong now the app's address forwards single-role people onward. It hasn't — that message only ever appears for an account whose role the app doesn't recognise, and those people still get the chooser rather than being forwarded — so it was left alone.
## Epic end

- Two older tests started failing for a reason that turned out to be a compliment to the new behaviour rather than a fault in it. Both were checking "I have really left the screen I was on" — but they recognised the old screen by something the new screen also shows: the expense request list names the file each request came from, and the expense files screen has a table just like the request list does. Both checks were rewritten to look for something that genuinely belongs to only one screen, so they still prove the screen was left behind — and would still fail if it wasn't. No product bug; the app behaved correctly in both cases.

## Story 2 — Back, bookmarks and the app's name still behave (continued)

- Diagnostic note: a local `next dev` server on :3000 is not usable for these E2E specs (it points at the real auth service, so a mock session cookie never validates). The epic-end path (`E2E_PROD=1`, port 3100, no server reuse) is the one that gives clean results.
