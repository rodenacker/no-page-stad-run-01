# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two roles, both signing in to the same app, both reaching the same shared expense
request list:

- **Importer** (called "Finance Uploader" in the requirements) — a central finance
  person. Uploads batches of ad-hoc employee expense payment requests as CSV files,
  watches them validate and import, deals with rejected rows, and re-submits
  corrections. Does not decide requests.
- **Approver** — one to three people who review the imported requests on a shared
  screen and record one approval decision per request. Works a batch down to zero.
  May bulk-approve. May decide their own expense request (BR-02). Does not upload.

The role names above are the names the sign-in service actually returns
(`GET /v1/auth/userinfo`, verified 2026-08-04); there is no role called "Finance
Uploader" in the service. The app displays the service's own word, `Importer`.

Approvers are finance staff, not power users or developers. The confirmed usage scene
is **high-volume scanning**: most requests in a batch are unremarkable, a few are
anomalies (possible duplicates, unfamiliar payees, odd amounts), and the job is to
find the exceptions and clear the rest.

## Product Purpose

Get a batch of employee expense payment requests from a CSV file to a recorded,
attributable decision per request, after which an external system handles
reimbursement. Success is a batch worked to zero with no wrong decisions and a
trail that survives audit.

## Positioning

Adjudication under audit, on a shared screen. What distinguishes this from a generic
admin CRUD tool is that every decision is single, final and attributed: one approval
decision per request, recorded against the person who made it, with account numbers
masked in the interface and exports attributed to whoever produced them. Multiple
approvers work the same queue concurrently, so the interface has to stay truthful
about what has already been decided by someone else.

`[CONFIRMED 2026-08-17]` This app is also a **showcase**: it exists to demonstrate
that the Stadium Builder workflow produces genuinely well-designed applications, not
merely working ones. Where a design choice is close, the more distinctive option is
the correct one — craft and identity are part of what this product is for.

## Operating Context

- Corporate finance / shared-services setting. Desktop-first, wide monitors, though
  narrow viewports are a hard requirement (UI-23, NFR-base-3: ≥360px / ≥768px /
  ≥1280px).
- The source artifact is a CSV file. `documentation/transactions_2026-04-15.csv` is a
  real sample.
- The audience's own document world: bank statements, remittance advices, payment
  batch listings, reject listings, reconciliation schedules, audit workpapers,
  general ledgers. These are factual parts of how this work is done.
- Two backends: an auth-api/BFF (`documentation/auth-api.yaml`) and a
  transactions-api (`documentation/transactions-api.yaml`). Both verified reachable;
  CORS is an open backend item on both.
- Session is an HttpOnly, Secure, SameSite=Strict cookie. The frontend never holds a
  credential or token.

## Capabilities and Constraints

Shipped across nine epics: `sign-in-and-app-shell`, `expense-file-upload`,
`file-validation-and-retry`, `import-preview`, `file-deletion`,
`expense-request-list`, `expense-decisions`, `bulk-approval-and-live-refresh`,
`csv-export`.

Confirmed data and interaction constraints that bind any design work:

| Fact | Source |
|---|---|
| 1–10,000 records supplied per batch | requirements §10 (C-045) |
| Page-size selector always present, offering 5 / 10 / 20 / 50, default 20; navigation stays visible in a disabled state when there is only one page | UI-16 (Must) |
| p95 ≤ 400ms to render one page of the request list at the 10,000-request volume | requirements §6 render budget |
| ≤10⁴ records means an in-memory client-side search/filter index is acceptable | requirements §6.1 |
| Narrow devices show each request's primary identifier, two to three key values and an action overflow, with no horizontal page scroll | UI-23 (Should) |
| A status is conveyed by intent-mapped colour **paired with an icon or text label**, never colour alone | UI-21 |
| Account numbers are masked to their last four digits in the interface; the CSV export carries them whole and is attributed to the exporting user | project.md §Compliance, csv-export R4 |
| Entry points a role may not use are **hidden, never disabled** | expense-request-list R10 |
| One approval decision per request, irreversible | project.md purpose |
| No colour value may appear outside a named token in `web/src/app/globals.css` — no hex literals, no inline colour functions, no Tailwind palette utilities, and every token populated in both `:root` and `.dark` | `.claude/policies/styling-centralisation.md` rules 1–5 |
| Theme resolves before first paint (OS preference, overridable, override remembered) | project.md §Theme switching |
| No `eslint-disable`, no `@ts-expect-error`, no suppressions | CLAUDE.md §4 |

`[CONFIRMED 2026-08-17]` **Design-change boundary:** DOM structure, class names,
layout and component composition are free to change. Every user-observable behaviour
must still hold. Existing Vitest and Playwright specs may be updated where the
redesign legitimately changes markup or presentation, but not where doing so would
weaken a behavioural assertion.

**Open / undecided:** CORS on both backend services (backend-side, not a frontend
fix). Whether the density problem created by UI-16's 50-row page cap is solved by
design within pages or by requesting a change to UI-16.

## Brand Commitments

- **Name:** Employee Expenses.
- **Palette — binding.** The brand blues are commitments, confirmed 2026-08-17:
  primary `#00AEEF` light / `#49BEE9` dark; accent `#006DE3` / `#5CA1EB`; tertiary
  `#001276` / `#1E35B8`. Source: `documentation/design-system-light.html` and
  `documentation/design-system-dark.html`, which carry embedded JSON metadata with
  provenance tags.
- **Both themes ship.** Light and dark are equal citizens, not a light design with a
  dark afterthought.
- **Typeface — not a commitment.** The design system records the brand face as
  proprietary self-hosted "Barclays Effra", which is not loadable. `Cabin` is a
  documented stand-in, not a brand decision (confirmed 2026-08-17), so the typeface
  is open. Do not attempt to source "Barclays Effra".
- **Accessible contrast is part of the brand, not a constraint on it.** The brand
  blues are light colours; the existing token layer pairs `--primary` with dark text
  (5.9:1) rather than white (2.5:1). Any re-spend of the palette inherits that
  discipline.

## Evidence on Hand

- `documentation/requirements-application.md` — the full source specification
  (~72KB), including the roles × resources access-control matrix (§6.5), the UI
  requirements catalogue (UI-*), volumes (§10) and the accessibility target (§6.6.5).
- `documentation/auth-api.yaml`, `documentation/transactions-api.yaml` — real
  OpenAPI specs for both backends.
- `documentation/transactions_2026-04-15.csv` — a real sample expense batch.
- `documentation/design-system-light.html`, `documentation/design-system-dark.html` —
  the palette source, with provenance metadata.
- `generated-docs/project.md`, `generated-docs/epic-plan.md`,
  `generated-docs/architecture.md` — the project's own confirmed facts.
- A running app: nine completed epics with Vitest integration tests and Playwright
  E2E specs per story.

**Absences future work must not fabricate:** no customers, no benchmarks, no pricing,
no usage statistics, no testimonials. No production deployment. Demonstration expense
data may be authored at full fidelity and labelled synthetic; the sample CSV is the
model for what real rows look like.

## Product Principles

1. **The exception is the work.** Most rows are fine. The interface's job is to make
   the few that are not — duplicates, anomalies, rejects — impossible to miss while
   the rest stay quiet enough to sweep past.
2. **A decision is a record, not a click.** Every decision is single, final,
   attributed and auditable. The interface must never make one feel casual or
   reversible, and must never hide who already decided.
3. **Density is a feature, not a compromise.** These screens are dense by nature;
   width and rows-per-screen serve the task. Space is spent where it buys
   comprehension, not where it buys calm.
4. **Show a door only if it opens.** Capability the signed-in person lacks is absent,
   never greyed out.
5. **Never colour alone.** Status is always colour plus icon or text — for
   accessibility, and because a printed or photographed screen is real evidence in
   this domain.

## Accessibility & Inclusion

**WCAG 2.2 Level AA** on every surface, including the request list, decision
confirmations and the sign-in form (requirements §6.6.5). This supersedes the
template's WCAG 2.1 AA baseline. Every action must be completable by keyboard alone,
including selection, bulk approval, and rejection with a note. Status must never rely
on colour alone (UI-21). `prefers-reduced-motion` is honoured.
