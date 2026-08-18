# Template Feedback

Append-only. One entry per template-level bug found while building this project.

## [template] Starter template hardcodes a single stale API base URL and a client-held-token auth path, in five places

- Symptom: the scaffold assumes one backend at `http://localhost:8042` and a `NEXT_PUBLIC_API_TOKEN` auth header. This project has two backend services and cookie-session auth (the template's own encouraged `bff` option), so five files had to be corrected in the first story of the first epic: `web/src/lib/utils/constants.ts` (`API_BASE_URL` default), `web/src/lib/api/client.ts` (`getAuthHeader()` / `requiresAuth`), `web/src/types/api.ts` (`requiresAuth` flag), `web/README.md`, and `web/scripts/setup-env.js` (fallback `.env.local` contents). Removing the stale constant also broke `tsc` (`TS2305` at `client.ts:16`) and the shipped `web/src/__tests__/integration/api-client.test.ts`, whose `requiresAuth flag` block asserted the browser-held-token behaviour that `authentication-intake.md` Rule 10 forbids for cookie-session projects — a shipped test asserting a forbidden path.
- Workaround applied: rewired the constants to same-origin API paths, replaced the client's `requiresAuth` token path with an optional `baseUrl` override for server-side calls, and rewrote the template test block to assert the cookie-session contract.
- Suggested fix: ship the API base URL as configuration-only with no literal default, and make the token/auth-header path opt-in scaffolding (or generated per auth method during INTAKE) rather than baked into `client.ts` + its shipped test. At minimum, keep the stale URL in one place instead of five.
- Affected: `web/src/lib/utils/constants.ts`, `web/src/lib/api/client.ts`, `web/src/types/api.ts`, `web/src/__tests__/integration/api-client.test.ts`, `web/README.md`, `web/scripts/setup-env.js`

## [template] The `E2E_PROD=1` Playwright mode cannot point browser-side backend calls at a stub, so specs that pass in dev fail at the epic-end run

- Symptom: `playwright.config.ts` sets `webServer.env` (`AUTH_API_BASE_URL` / `NEXT_PUBLIC_AUTH_API_BASE_URL` → the mocked auth service) and its comment states this "points the app's auth base URL at the mocked auth service for this run". That is true for `next dev` but NOT for `E2E_PROD=1`, which serves a pre-built app with `npm run start`: Next resolves `next.config.ts` `rewrites()` during `next build` and writes the literal destination into `.next/routes-manifest.json` (verified: the manifest contains `"destination": "http://localhost:4424/v1/auth/:path*"`). `next start` serves that manifest, so a runtime env var cannot redirect a browser-side call — it reaches the REAL backend, which rejects the test's mock session. Result: two Story 3 specs (`after signing out, the browser Back button…`, `the signed-in shell is fully keyboard operable…`) pass in dev mode and fail under `E2E_PROD=1` — the mode the epic-end batched run uses — with the sign-out never navigating. Rebuilding with the stub URL set (`AUTH_API_BASE_URL=http://127.0.0.1:4599 npm run build`) makes all 10 specs pass, which isolates the cause.
- Impact beyond the harness: the same build-time baking means one built artifact cannot be promoted across environments (dev → staging → prod) — the backend address is compiled in. That contradicts the `bff-auth-pattern.md` same-origin-rewrite recommendation the template gives for "existing or multiple backends", which reads as if the destination were runtime configuration.
- Workaround applied: RESOLVED in this project by Story 7 (option (a) below) — both `rewrites()` entries were removed and replaced with proxy route handlers at `app/v1/auth/[...path]/route.ts` and `app/transactions-api/[...path]/route.ts`, which resolve the service address per request. `.next/routes-manifest.json` now declares no rewrite at all, and all 10 live specs pass under `E2E_PROD=1` against a production build with no change to `playwright.config.ts`. Story 1's committed spec was updated to assert the request-time forwarding instead of the rewrite rules (same intent, stricter check). Still worth fixing in the template, since every new project starts from the same recommendation.
- Suggested fix (template): (a) recommend a request-time proxy route handler instead of `rewrites()` in `bff-auth-pattern.md` §"Existing or multiple backends", so the running server reads the env var — this is what was done here, and it fixes the deployment problem as well as the harness; (b) alternatively, make the `E2E_PROD` webServer build with its own env (`command: 'npm run build && npm run start …'`), which only fixes the harness. Also worth stating in the policy that the server-only env name must be PREFERRED over the `NEXT_PUBLIC_*` one, since `next build` inlines every `NEXT_PUBLIC_*` read as a literal (in the server bundle too) and reading it first re-bakes the address.
- Affected: `web/playwright.config.ts`, `web/next.config.ts`, `.claude/policies/bff-auth-pattern.md`

## [template] The quality gate's `next build` silently breaks a running `npm run dev`, so MANUAL-TEST shows the user stale code

- Symptom: the user reported "there is no menu in the application" for a feature that was built, committed, and verified — twice. The code was correct: 64 Vitest tests, all four gates, and 10 Playwright specs (against a fresh production build on its own port) all passed. The cause was the server the user actually had open. Their `npm run dev` on :3000 had been running since **17:01 the previous day**, while the header files were written at **07:25 the next morning** — and in between, the epic-end quality gate ran `next build` **five times**. `next dev` and `next build` share the same `web/.next` directory, so each gate run overwrote the live dev server's build state underneath it. The dev server kept serving, so there was no error to notice; it just served a stale app. Diagnosis was only possible by comparing the dev server's process start time against the source files' mtimes.
- Why this is a template problem, not a user mistake: leaving `npm run dev` running while building is the *expected* workflow — the manual-test page's own "Open the app" button points at `http://localhost:3000`, and the page's hint tells the user to start it with `npm --prefix web run dev`. The workflow then runs `next build` in the epic-end gate (Step B7.0), and again on every re-verify after a code-review or E2E fix. So the longer an epic takes, the more certain it is that the page handed to the user at MANUAL-TEST points at a poisoned dev server.
- Why it is especially dangerous here: it makes a **correct** implementation look broken at the one gate whose entire purpose is the user's own eyes, and it costs a full fix cycle (re-plan, re-test, re-review, re-run E2E) chasing a defect that does not exist. It also erodes trust in the automated results, which were right all along. In this run it burned two rounds and produced one real-but-incidental fix before the true cause was found.
- Workaround applied: stopped the stale dev server, deleted `web/.next`, started a fresh one, and verified the new process's start time postdates the source files. Logged here because every project on this template is exposed to it.
- Suggested fix, in preference order: (a) give the gate's build its own output directory (`distDir`, e.g. via a build-only config or `next build --distDir .next-gate`) so `next build` can never touch a dev server's `.next` — this removes the class of bug entirely, and the `E2E_PROD` run should serve that same directory; (b) failing that, have the MANUAL-TEST step (`continue.md` B7.1) detect a dev server whose start time predates the newest source file — or simply predates the last gate build — and tell the user to restart it, rather than handing them a page that points at it; (c) at minimum, put a line on the generated `manual-tests.html` telling the user to restart `npm run dev` before they start testing, since the build has almost certainly moved underneath it.
- Affected: `.claude/scripts/quality-gates.js` (the `build` check), `.claude/commands/continue.md` (Steps B7.0 and B7.1), the generated `generated-docs/epics/<slug>/manual-tests.html`, `web/next.config.ts` (`distDir`)

## `.dockerignore` excludes `web/e2e` but not `web/playwright.config.ts`

**What happened.** The `Build & boot image` CI job failed on `next build` inside Docker:

```
./playwright.config.ts:3:35
Type error: Cannot find module './e2e/support/auth-api-stub' or its corresponding type declarations.
```

**Why.** The template's `.dockerignore` excludes `web/e2e` (correct — test code should not ship in a production image) but leaves `web/playwright.config.ts` in the build context. `web/tsconfig.json` includes `**/*.ts`, so `next build` type-checks that config inside the image, and any import it makes from `web/e2e` is unresolvable there.

**Why it will recur.** A Playwright config importing a shared constant from `e2e/` is a natural and correct thing to do — a stub server's port or URL wants one source of truth shared between the config's `webServer.env` and the stub itself. The template's own quality gates, local `npm run build`, and `npm run typecheck` all pass, because they run outside the Docker context. The failure only appears in the Docker job, i.e. at PR time, after everything else is green.

**Fix applied in this project.** Added `web/playwright.config.ts` to `.dockerignore` beside `web/e2e`, with a comment explaining the coupling.

**Suggested template change.** Ship `web/playwright.config.ts` in `.dockerignore` by default, next to `web/e2e`, with that comment. It costs nothing when the config has no `e2e/` imports and prevents a late, confusing CI-only failure when it does.

## [template] The stories review page returns empty acceptance criteria and manual tests for every collapsed story — silently deleting the plan's detail

**What happened.** At the `expense-request-list` stories approval, the user edited one story's plain summary on the review page and pressed Approve. The pasted payload carried all five stories with correct titles, scopes, roles and plain summaries — and `acceptanceCriteria: []` and `manualTestChecklist: []` on *every one of them*, despite the page having rendered 29 criteria and 29 manual tests.

**Why.** `readStory()` (in the generated `stories-review.html`) reads editable text with `innerText`:

```js
const list = sel => [...card.querySelectorAll(sel + " .txt")].map(n => n.innerText.trim()).filter(Boolean);
```

`innerText` is layout-dependent — it returns `""` for elements that are not being rendered. Per the approval-pattern spec, acceptance criteria and manual tests live **inside a collapsed `<details>` disclosure** ("Lead with goals; collapse the detail"), so unless the user happens to expand every story's disclosure before approving, those nodes have no layout and every list comes back empty. The `.filter(Boolean)` then strips the empty strings, so the payload looks like a deliberate deletion rather than a read failure. The same bug hits the `.scope-tag`/`.tag.role`/`.summary` reads only when they are inside a collapsed region, which they are not — which is exactly why the corruption is partial and easy to miss.

**Why it is dangerous.** The two fields it silently empties are the ones that become the story files the `test-generator` and `developer` agents work from. An orchestrator that trusts the payload writes stories with no acceptance criteria at all, and the epic gets built against titles and summaries alone — with no error anywhere, and the user believing they approved the plan they read. The spec's own "collapse the detail" rule guarantees the trigger condition on the default view, so this fires on essentially every stories approval where the user edits anything.

**Workaround applied.** Kept the planner's `acceptanceCriteria` / `manualTestChecklist` for all five stories and applied only the fields that came back populated (the edited plain summary), then told the user plainly what had been ignored and why.

**Suggested template change.** In the `Editable HTML Review Page` section of `.claude/shared/approval-pattern.md`, require `textContent` rather than `innerText` for reading editable nodes (with an explicit note that `innerText` returns `""` inside a collapsed `<details>`, which is where the spec puts this content), and drop the `.filter(Boolean)` blanket-strip so a genuinely-empty field is distinguishable from an unread one. Belt-and-braces at the orchestrator end: treat a payload whose `acceptanceCriteria` is empty for *every* story as a read failure, not an edit — a user deleting all criteria on all stories is not a real scenario. The same `innerText` pattern should be checked in the epic-plan review page and the manual-test check-off page.

**Affected.** `.claude/shared/approval-pattern.md` (page rules + payload shape), the generated `generated-docs/epics/<slug>/stories-review.html` and `generated-docs/epic-plan-review.html`, `.claude/commands/continue.md` §P2 (pasted-payload handling).

## [template] Vitest's 5s default `testTimeout` is too tight for the whole-screen integration tests the template asks for

**What happened.** Three expense-request-list tests (story 2's applied-summary test, both of story 3's range tests, story 4's page-controls test) fail intermittently with `Test timed out in 5000ms` when `npm test` runs the whole suite in parallel workers on a loaded machine. Each passes in isolation in ~2s, and all pass on an uncontended suite run; which of them times out varies from run to run. Verified as not story-specific: with the story under construction stashed, the same three fail.

**Why.** `web/vitest.config.ts` sets no `testTimeout`, so Vitest's 5s default applies — while `testing-policy.md` asks these tests to render a whole screen and drive it through `userEvent` (story 3's types into eight narrowing controls, each keystroke re-rendering a list). ~2s of real work per test leaves almost no headroom once Vitest fans the files out across workers that compete for cores. The result is a red gate that says nothing about the app.

**Why it will recur.** Any project whose screens are rich enough to need multi-control integration tests will hit this, and it gets likelier as the suite grows — more files, more contention. It also teaches the wrong lesson, because the symptom points at the component rather than at the harness.

**Workaround applied.** None in the app. The affected file is re-run on its own to confirm, and the wobble is recorded in `generated-docs/architecture.md` (Cross-epic debt) so nobody reshapes a component to chase it.

**Suggested fix.** Raise `testTimeout` in the template's `web/vitest.config.ts` to something a whole-screen test can meet under contention (10-15s). A timeout is a runaway-test guard, not an assertion, so raising it weakens no test. Optionally cap worker concurrency (`poolOptions.threads.maxThreads`) so jsdom suites do not oversubscribe the machine.

**Affected.** `web/vitest.config.ts`, `.claude/policies/testing-policy.md`

## [template] `code-review-runner` cannot invoke the `/code-review` skill it is built around

- Symptom: at EPIC-END Step B7.0.5 the `code-review-runner` agent could not run
  `/code-review --fix`. `Skill code-review` is refused as `disable-model-invocation`,
  so the agent cannot invoke it at all. Separately, the skill that the name
  `code-review` currently resolves to is
  `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/code-review/commands/code-review.md`
  — a GitHub-PR-comment pipeline that spawns its own subagents and calls
  `gh pr comment`, and which has no `--fix` flag. So even if it were invokable it is
  not the reviewer this step wants: at B7.0.5 there is no PR yet (the PR is opened
  later, at B7.2.2), and the step's whole contract is that fixes are applied to the
  working tree.
- Workaround applied: the runner performed the equivalent branch-diff review itself
  (per the fallback in its own instructions), applied its fixes to the working tree,
  and wrote the findings file in the documented shape. The orchestrator read the file
  and routed the unresolved findings through the developer fix cycle as normal, so the
  epic-end gate behaved correctly end to end.
- Suggested fix: decide which of these the step actually wants and make it explicit,
  rather than leaving the agent to resolve a name collision at runtime —
  (a) ship a template-owned review skill under a name that cannot collide with a
  marketplace plugin (e.g. `stadium-code-review`) and reference that name in
  `code-review-runner.md`; or (b) drop the skill dependency and specify the
  branch-diff review directly in the agent's own instructions, which is what the
  fallback path already does successfully. Either way, `code-review-runner.md` should
  stop naming a skill it cannot invoke, and the `disable-model-invocation` refusal
  should be called out in its Troubleshooting so the fallback is not mistaken for a
  failure.
- Affected: `.claude/agents/code-review-runner.md`, `.claude/commands/continue.md`
  (Step B7.0.5). Observed on epic `file-validation-and-retry`, 2026-08-06.

## [template] The security validator's RBAC check cannot recognise authorization in a route handler, because it only looks for `requireSession()`

- Symptom: `web/src/app/api/decisions/route.ts` was reported as "API route missing authorization check" (Access control (RBAC), critical, blocks merge) even though the route's first three statements ARE the authorization gate: no `session` cookie → `401`; `fetchUserInfo()` returns null → `401`; `hasRole(session, ROLE_APPROVER)` false → `403`. Nothing reaches the transactions service before those three. The check's own fix hint names `requireSession()` / `requireRole()` / `auth()`, so the pattern only matches the page-level spelling.
- Why the suggested fix is not available here: this project's `requireSession()` (`web/src/lib/auth/requireSession.ts`) answers an unauthenticated caller with `redirect(SIGN_IN_ROUTE)`. That is correct for a page or layout and wrong for a route handler, which must return a status a `fetch` caller can act on — the story's own tests pin `401`/`403` responses. Following the hint would have broken the feature to satisfy the validator. Note the template's own scaffolding creates this split: `requireSession()` is the only session helper it ships, and it is redirect-shaped.
- Workaround applied: declared the exception with the validator's documented channel — `// security-ignore: rbac — …` above the `POST` export, with the reason stating where authorization actually happens and why `requireSession()` is unusable in a route handler. This is visible in the validator's own overrides report rather than hidden, but it is still an override standing in for a check that should have passed on its own.
- Suggested fix: teach the RBAC check to recognise a route handler that reads the session cookie and gates on a role helper (e.g. any `hasRole` / `rolesOf` call from `lib/auth/roles.ts` on a path that returns `401`/`403`), not just a `requireSession()`-shaped call. Alternatively, ship a route-handler-shaped companion (`requireSessionOrStatus()` returning a session or a `Response`) so there is a canonical spelling for API routes for the validator to match and for projects to reuse — currently every project that adds an authenticated route handler will hit this.
- Affected: `.github/scripts/security-validator.js` (the RBAC / "API route missing authorization check" rule), `web/src/lib/auth/requireSession.ts` (no route-handler-shaped variant shipped)

## [template] Generated Playwright specs assert on the page BEHIND an open modal by role, which Radix has taken out of the accessibility tree

- Symptom: `web/e2e/epic-expense-decisions-story-3-reject-a-request-with-a-note.spec.ts` failed with `element(s) not found` on `getByRole('main').getByRole('row').filter({ hasText: 'TXN-…' })`, under a hand-written failure message claiming the app had recorded a decision with an empty note (a BR4 violation). The two disagreed, and they imply opposite fixes: the message points at the app, the error points at the locator. The app was correct — the failure screenshot shows both rows still reading `Imported` behind the open note step, with the required refusal on screen, and the DOM snapshot in the trace shows why the query matched nothing: while a Radix `Dialog`/`AlertDialog` is open it sets `aria-hidden="true"` on the app shell wrapper that contains `<main>`, so the whole list leaves the accessibility tree and every role query into it correctly returns nothing.
- Why this recurs: it is a property of every modal in this stack, so any spec that checks "the thing behind the dialog is unchanged" hits it. The Vitest layer of this same story already documents the trap in a comment and works around it (`screen.getByText(reference).closest('tr')`), so the knowledge exists in the project — but nothing in `testing-policy.md` or `test-generator`'s instructions carries it into the Playwright layer, so the browser spec re-made the mistake. It also costs a full fix cycle every time, because the misleading assertion message sends the fixer at the application code first.
- Workaround applied: assert "nothing was recorded" in two ways that are both valid with a modal open — the mocked decide endpoint reports that **no** decide call was made at all (the only way a decision can be recorded), and the row is read through the DOM (`page.locator('main tr').filter({ hasText: reference })`) rather than through the accessibility tree. Role-based queries are kept everywhere no modal is open. Coverage is unchanged and slightly stronger.
- Suggested fix: add an anti-pattern to `testing-policy.md` (and a line to `test-generator`'s Playwright guidance) — "never assert on content behind an OPEN modal with a role query; a modal takes the rest of the page out of the accessibility tree. Assert it through the DOM, or after the modal closes, or by asserting the call that would have changed it was never made." A second, more general note is worth making too: an assertion's custom failure message must describe what the *assertion* proves, not the outcome the author expected — "the request was decided even though its note was empty" was asserted by a locator that cannot tell "decided" from "not visible to a role query".
- Affected: `.claude/policies/testing-policy.md` (anti-patterns), `.claude/agents/test-generator.md`. Observed on epic `expense-decisions`, story 3, 2026-08-11.

## [template] Testing Library’s 1s async-utility budget is left at its default, so `findBy*` flakes in the same parallel run the raised `testTimeout` was meant to cover

**What happened.** `epic-import-preview-story-4-download-rows-to-fix-and-re-upload.test.tsx` failed roughly one full-suite run in four (reproduced: 1 failure in 4 baseline runs) with `Unable to find role="button" and name /^download rows to fix and re-upload$/i`, while passing 4/4 in isolation. Nothing was wrong with the app: instrumenting the wait showed the control appears after 65ms when the file runs alone and after 338-1201ms in the full 43-file run. Testing Library’s default `asyncUtilTimeout` is 1000ms, so the slowest of those measurements lost the race by about 200ms.

**Why.** This is the SIBLING of the `testTimeout` entry above, and the template only has half the problem covered. That entry got `web/vitest.config.ts` raised from Vitest’s 5s default to 15s so a whole-screen test could finish under contention — but the per-query budget inside those same tests is Testing Library’s, not Vitest’s, and `web/vitest.setup.ts` never calls `configure()`. So a test now has 15s to run and each of its `findBy*`/`waitFor` calls still has 1s to see the screen settle. 1000ms is wall-clock in a run where 43 jsdom files share 12 cores: the macrotask that commits a React render can sit behind other workers’ work for longer than the window even when the chain is correct and finishes moments later.

**Why it will recur.** It gets likelier as a suite grows, and it bites hardest exactly where the template’s own guidance points: the longer the asynchronous chain behind a screen (here: resolve the file from a list, download it, read the bytes with `FileReader`, parse the CSV yielding between chunks, then render), the closer the wait sits to the 1s line. The symptom also points at the wrong thing — "unable to find a button" reads as a missing feature, and the tempting fixes (drop the assertion, `.skip` the test) are the two worst outcomes. Three test files in this project had already worked around it privately with per-call `{ timeout: 2000 | 3000 | 10000 }` overrides, which is the same fix applied four times without anyone naming the cause.

**Workaround applied.** `configure({ asyncUtilTimeout: 5000 })` in `web/vitest.setup.ts`, documented there — deliberately below the 15s `testTimeout` so a genuinely missing element still fails as Testing Library’s "Unable to find role=…" with the DOM printed rather than as a bare "Test timed out". Separately, the affected test now waits on an observable settled signal (the preview’s own `role="status"` announcement disappearing) before querying for the control, so a real failure says "the preview settled and the control is not there" instead of "could not find a button". Verified with 6 consecutive full-suite runs.

**Suggested fix.** Ship `configure({ asyncUtilTimeout: … })` in the template’s `web/vitest.setup.ts` alongside the raised `testTimeout`, as one decision rather than two — the two ceilings only make sense set together, and a project that raises one and not the other has moved the flake rather than removed it. Worth a line in `testing-policy.md` too: a budget is a ceiling and changes no expectation, but a test should still hang its wait off an observable "the screen has settled" signal rather than betting one query against a whole asynchronous chain.

**Affected.** `web/vitest.setup.ts`, `web/vitest.config.ts`, `.claude/policies/testing-policy.md`. Observed on epic `import-preview` story 4, found at the `file-deletion` epic-end gate, 2026-08-17.

---

## The `rtk` output wrapper reports a FALSE PASS on a failing gate

**Severity.** High — it silently inverts a gate verdict, which is precisely what CLAUDE.md §5 ("Quality Gates Are Binary — report actual exit codes truthfully") exists to prevent.

**What happened.** During epic `request-list-redesign` B0.2, `npx prettier --check "src/**/*.tsx"` exited **1** with 6 genuinely unformatted files, while the wrapped output printed:

```
Prettier: All files formatted correctly
```

Re-running the identical command through `rtk proxy` showed the truth (`Code style issues found in 6 files`). The **exit code was correct in both cases** — only the human-readable summary lied. `npx playwright test --list` is affected too: it renders as `PASS (0) FAIL (0) skipped (110)`, which reads like a broken suite rather than a successful collection of 110 tests.

**Why it matters here.** An agent or orchestrator that reads the summary line instead of the exit code will report a passing gate over a failing one. Two of this epic's own test-generation agents were misled and had to re-run everything through `rtk proxy` to obtain true output; one initially reported "prettier clean" on a tree that was not.

**Suggested fix.** Either (a) make the wrapper's summary line derive from the child's exit code so it can never contradict it, or (b) add a line to the workflow's gate guidance: **judge every gate by its exit code or its JSON, never by wrapped prose**, and re-run through `rtk proxy` when the two disagree. `quality-gates.js` is unaffected because it returns structured JSON with `overallStatus` — that is the pattern to prefer.

**Affected.** The `rtk` hook's output filter; `.claude/shared/orchestrator-rules.md` gate guidance; the `test-generator` and `developer` agent verification steps. Observed on epic `request-list-redesign` during B0.2 batch test generation, 2026-08-17.

---

## Parallel B0.2 test-generation agents collide when probing production files

**Severity.** Low — self-correcting, but it produces alarming false signals.

**What happened.** B0.2 launches one `test-generator` per story per mode as a single parallel batch (18 agents for a 9-story epic). Several independently used a sound technique: temporarily modify a production file to prove their assertions would pass *after* implementation, then revert with `git checkout --`. Story 3's agent added a `<fieldset>` to `RequestNarrowingControls.tsx`; story 5's agent ran four separate mutations of `ExpenseRequestList.tsx`; story 9's Vitest agent wrote a scratch test file.

Because these overlap in time, siblings observed the intermediate states: story 2's agent reported `RequestNarrowingControls.tsx` as **syntactically broken (unclosed `<fieldset>`, TS17002)**, and two agents reported a stray `zz-scratch-story-9.test.tsx` as an uncommitted file that should not be committed. Every agent behaved correctly and every file was reverted or deleted; the tree ended clean. But a `tsc` run that happens to land inside another agent's probe window fails for a reason unrelated to the file under test.

**Why it's worth fixing.** The probe technique is genuinely valuable — story 5's mutation testing is what proved its green regression net had teeth (4 mutations, 4 caught), and it is far stronger evidence than a red run. The problem is only that B0.2's parallelism doesn't anticipate it.

**Suggested fix.** Give the probe technique an explicit, collision-free home in `test-generator`: require probes to run in a **git worktree or a scratch copy** rather than the shared tree, and require scratch test files to be written to a gitignored path. Alternatively, note in B0.2 that a `tsc`/lint failure naming a file outside the agent's own story is likely a sibling's probe and should be re-run before being believed.

**Affected.** `.claude/agents/test-generator.md`, `.claude/commands/continue.md` § Step B0.2. Observed on epic `request-list-redesign`, 2026-08-17.

## [template] The direction contract's "first child of `<body>`" placement is not achievable in the Next.js App Router, and the one technique that achieves it destroys the app

**Symptom.** Epic `request-list-redesign` story 1 (R23/BR10, from the `impeccable` skill's `new-work.md` §5 via `documentation/design-brief-batch-listing.md` §7) requires the direction contract to be "an HTML comment placed as the first child of `<body>` in the root layout", and the generated Playwright spec asserted exactly that against the navigation response's bytes (`/^\s*<!--/` immediately after the `<body …>` tag). No safe implementation can satisfy it.

**Why.** Two independent framework facts, both verified by experiment on Next 16.2 / React 19.2:
1. Next.js streams its own metadata element (`<div hidden>` from `lib/metadata/metadata.js` `MetadataWrapper`) as the first thing inside `<body>` on every page, ahead of anything the root layout renders — in dev AND in the production build. So no application-level markup, anywhere in the tree, can be first.
2. The only position ahead of it is React's body "preamble": raw markup via `dangerouslySetInnerHTML` on the `<body>` element itself, which DOES land immediately after `<body …>`. But React forbids children beside `dangerouslySetInnerHTML`, so the app's whole content has to be rendered outside `<body>` (React 19 hoists it back in, and `</body>` is written last, so the served bytes are still correct) — and then React re-applies that raw markup on the next client re-render. `router.refresh()` triggers exactly that, and this app calls it on sign-in, sign-out and session timeout. Measured result: `document.body.innerHTML` becomes the comment alone, every rendered screen gone, no error thrown. Placing children inside `<html>` instead also produces `validateDOMNesting` hydration errors.

**Workaround applied.** The contract is emitted as raw markup by an inert `<div hidden dangerouslySetInnerHTML={…}/>` as the first thing the root layout renders in `<body>` — a real HTML comment in the shipped bytes, ahead of every piece of the app's own content, surviving the production build (`grep -rl "29469d17" web/.next` non-empty, and the prerendered HTML carries it). The Playwright helper was corrected to read "the first comment the app itself wrote inside `<body>`, ahead of the app's own content" instead of "the first byte after `<body>`", with the framework reason recorded on the helper. Nothing else about the assertion changed: five blocks, the seed key and the verbatim FINISH line are still read from the response bytes, on a public and a signed-in address.

**Suggested fix.** Reword the convention so it is achievable and still auditable — "an HTML comment emitted as raw markup at the top of `<body>` in the root layout, ahead of the app's own content" — in the `impeccable` direction-contract guidance and anywhere the workflow restates it, and note in `test-generator`'s guidance that a first-byte-after-`<body>` assertion cannot pass in the App Router. Also worth naming as a general trap: `dangerouslySetInnerHTML` on `<html>`/`<head>`/`<body>` is re-applied on client re-render and will wipe the document.

**Affected.** The `impeccable` skill's `new-work.md` §5 direction-contract instruction (reaches projects through the design brief and the story's implementation notes), `.claude/agents/test-generator.md`. Observed on epic `request-list-redesign`, story 1, 2026-08-18.
