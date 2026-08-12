/**
 * Story Metadata:
 * - Epic: expense-decisions — Approve or reject a request
 * - Story: 4 — A decided request, and only one decision each
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R3, R4, R6, R12, R13, R16, BR1, BR3, NFR3, NFR4
 *
 * Covers the single `playwright`-tagged criterion:
 * - AC-5 — in the browser, a decision confirmed on a request another Approver decided
 *   first is refused, and the request then shows that other person's decision.
 *
 * AC-1 (a decided request offers no decide actions and states where it stands), AC-2
 * (who decided it, when, and the note are visible to both roles), AC-3 (the re-read
 * refuses the decision and records nothing) and AC-4 (the refusal stays until it is
 * dismissed, and the list is brought up to date) are the Vitest layer's, at
 * `web/src/__tests__/integration/epic-expense-decisions-story-4-one-decision-per-request.test.tsx`,
 * and are deliberately not repeated here (testing-policy.md § "one tag, one layer").
 * What this spec adds that jsdom cannot: the refusal genuinely reaching a real
 * Approver in a real browser, through the real confirmation dialog, on a request the
 * service reports as already decided by the time the decision is confirmed.
 *
 * This epic's real-browser accessibility scan belongs to the story that owns the decide
 * surface (story 2), so there is no axe scan here.
 *
 * ---------------------------------------------------------------------------
 * NFR4 — why this is NOT two racing sessions
 * ---------------------------------------------------------------------------
 * The genuine two-session timing race cannot be exercised deterministically (brief
 * NFR4, story §Notes), and orchestrating two live browser sessions to collide on the
 * same millisecond would buy a flaky test rather than a truthful one. The real race
 * stays a MANUAL test (story §Manual test checklist).
 *
 * What is deterministic — and what this spec drives — is the state the race produces:
 * the request is `Imported` when the Approver loads the screen and chooses Approve, and
 * ALREADY DECIDED by someone else by the time they confirm. That is arranged by changing
 * what the mocked `GET /v1/transactions` returns between those two moments, which is
 * precisely the window BR1's re-read-before-submit exists to close.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * (testing-policy.md § "Playwright runs against mocks, never live" — even though
 * project.md records both real services as running on this machine.) Two boundaries,
 * one contract, exactly as epics 1–3 established; this spec reuses them rather than
 * adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started by
 *    `globalSetup` and wired in by `playwright.config.ts`. `/requests` is gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()` cannot
 *    see a fetch the browser never makes. The stub answers that call from the shared
 *    identity source, keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` below, for this screen's read
 *    (`GET /transactions-api/v1/transactions`, which takes no query parameters) and for
 *    the decide call (`POST /api/decisions`), plus a catch-all that aborts any OTHER
 *    `/transactions-api/**` call — that mount point is the app's OWN same-origin
 *    forwarder, so an unmocked read would travel on to the live transactions service
 *    from inside the Next.js process where nothing here could see it — plus a hard block
 *    on the real services' own origins (project.md records them at :4424 / :4423).
 *
 * Every response body comes from the project-wide factories in `web/src/mocks/data/`
 * (`userInfoFor`, `createTransaction`, `transactionDecidedElsewhere`,
 * `transactionListResponse`, `alreadyDecidedResponse`) — no response shape and no
 * person's name is authored in this file, so this spec and the Vitest layer cannot drift
 * on the contract or on who decided what.
 *
 * THE DECIDE CALL IS MOCKED AS A SUCCESS, ON PURPOSE (brief BR1). `alreadyDecidedResponse`
 * is byte-for-byte the success envelope: the service answers the same
 * `DefaultResponse` whatever happened, so nothing in that body can tell "decided" from
 * "already decided". An implementation that submits the decision instead of re-reading
 * first therefore receives a plain success here and has no way to produce the refusal
 * this spec asserts — which is exactly the point. (That no decide call is made at all is
 * AC-3's, in the Vitest layer, where the call itself can be observed.)
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - The decide actions are DIRECT controls on the request's own row
 *   (`RequestActions.tsx`), as story 2 places them — so Approve is reached in ONE click
 *   as a button in the row. A request carries no ⋯ overflow at all; Open is a direct
 *   control too. Each names the request it decides ("Approve request <reference>"), because
 *   every listed request carries a pair of its own; that name is also how this spec
 *   addresses one row's control without matching another row's.
 * - The confirmation is the Shadcn `alert-dialog` (Radix renders `role="alertdialog"`,
 *   portalled to the body, so it is NOT inside `main`), with the confirming control
 *   naming the action it takes — the convention `SubmittedFileActions.tsx` already ships
 *   ("Cancel the file"), so an Approve confirmation reads "Approve…"/"Confirm…" rather
 *   than a bare "OK". Cancel/the way out is never named for the action itself.
 * - BR1's re-read is issued FROM THE BROWSER through `fetchTransactions()` at the app's
 *   own `/transactions-api/...` address, and the decide call FROM THE BROWSER through
 *   story 1's `lib/api/decisions.ts` at the app's own `/api/decisions` address.
 *   `page.route()` cannot intercept a fetch made by the Next.js server or by a Server
 *   Action — if either call moves server-side, this spec's mock is bypassed and the
 *   request leaves for the real transactions service.
 * - The refusal is raised through the root layout's EXISTING toast machinery
 *   (`ToastProvider` / `ToastContainer`, `useToast()`), which renders one
 *   `role="region"` named "Notifications". No second notification surface, and no
 *   bespoke banner inside the list. Its wording is the brief's, verbatim.
 * - The confirmation CLOSES when the decision is refused — the reason is reported on the
 *   screen behind it, never trapping the Approver inside a dialog to read why nothing
 *   happened (the shape `SubmittedFileActions.tsx` already established).
 * - Cookie assumptions: the session travels only in the `session` cookie (epic 1 BR2),
 *   seeded directly rather than by driving the sign-in form — epic 1's story 2 spec owns
 *   that journey. Cookies ignore port, so one seed serves the dev server (:3000) and the
 *   epic-end production run (:3100). `Secure` is omitted because the E2E server is plain
 *   http on localhost; the real cookie's full attribute set is asserted in the Vitest
 *   layer (epic 1, story 1).
 *
 * QUERYING THE REFUSAL — the trap this spec avoids: it is found through
 * `getByRole('region', { name: /notifications/i })`, the surface's own accessible name,
 * NOT through `getByRole('alert')`. Next renders a permanently empty body-level
 * `role="alert"` route announcer, so an unscoped alert query always matches two
 * elements, and a toast's own role legitimately varies with its variant (`alert` for
 * error, `status` otherwise). The notification also renders OUTSIDE `main` (the
 * container is fixed-position, mounted in the root layout), so scoping it to `main`
 * would find nothing. The row IS scoped to `main`.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend response
 * below is mocked, so no live backend is contacted and no real credentials are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — `/requests` offers no
 * decide action at all today, so there is nothing to confirm and nothing to refuse.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER } from '../src/mocks/data/role';
import {
  DECIDING_APPROVER,
  OTHER_APPROVER,
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  alreadyDecidedResponse,
  createTransaction,
  transactionDecidedElsewhere,
  transactionListResponse,
} from '../src/mocks/data/transaction';

import type { TransactionRead } from '../src/mocks/data/transaction';
import type { BrowserContext, Locator, Page } from '@playwright/test';

/** This story's screen. */
const REQUESTS_ROUTE = '/requests';

/**
 * The addresses the browser uses. Both are the APP's own — the transactions service is
 * reached through the same-origin `/transactions-api/*` mount point, and the decide call
 * through story 1's `/api/decisions` route handler (which is what stamps the signed-in
 * person's name on the decision server-side). Neither service's own origin ever appears
 * in browser code. Trailing `**` so query strings are covered.
 */
const TRANSACTIONS_API_GLOB = '**/transactions-api/**';
const TRANSACTIONS_URL_GLOB = '**/transactions-api/v1/transactions**';
const DECISIONS_URL_GLOB = '**/api/decisions**';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * How the controls read to a user.
 *
 * `OPEN_REQUEST_NAME` and `approveRequestName` are the wording `RequestActions.tsx`
 * already ships ("Open request <reference>" / "Approve request <reference>") — every
 * per-request control names the request it acts on, which is what lets this spec drive
 * ONE row's Approve while every other listed request carries one too. The confirming
 * control's name is deliberately loose: the exact wording is the developer's, only the
 * sense of it is fixed. "Cancel" matches neither, so the confirming control can never be
 * confused with the way out.
 */
const OPEN_REQUEST_NAME = /open request/i;
const approveRequestName = (reference: string): RegExp =>
  new RegExp(`approve request ${reference}`, 'i');
const CONFIRM_DECISION_NAME = /approve|confirm/i;

/**
 * The refusal, verbatim from the brief (R4/R13, story 4 AC-3). This is pinned WORDING,
 * not mock data: the user is told the request has already been decided, in these words —
 * not "conflict", not "409", not an unfamiliar service error.
 */
const ALREADY_DECIDED_MESSAGE = 'This request has already been decided.';

/**
 * The request two Approvers are about to decide. Canonical, so it arrives `Imported`
 * (still awaiting a decision) with `System` as the last thing to touch it.
 */
const CONTESTED_REQUEST = createTransaction();

/**
 * The SAME request a moment later, as the service now reports it: approved by
 * {@link OTHER_APPROVER} — a different person from the Approver signed in below. Every
 * identifying value is carried over untouched by the factory, so this is unmistakably
 * this request having changed rather than a second one appearing.
 */
const DECIDED_BY_SOMEONE_ELSE = transactionDecidedElsewhere(CONTESTED_REQUEST);

/** A mocked JSON response, built from a project-wide factory body. */
const jsonResponse = (
  body: unknown,
): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/** What the mocked transactions endpoint is currently serving. */
interface TransactionFeed {
  /** Change what the NEXT read returns — the service moving on underneath the screen. */
  show: (transactions: TransactionRead[]) => void;
}

/**
 * Every backend mock this spec needs, registered in the ONE order that works: Playwright
 * matches the most recently registered route first, so the `/transactions-api/**`
 * catch-all goes on FIRST (it must lose to the specific read below it) and
 * `LIVE_BACKEND_ORIGINS` goes on LAST (a call addressed at a service's own origin must be
 * aborted, not quietly answered by the origin-agnostic mocks above it).
 *
 * The list is served from a single mutable snapshot rather than a per-request queue: the
 * browser may legitimately read it more than once for one on-screen state (the first
 * load, BR1's re-read, and the refresh after the refusal), and a queue would then
 * silently skip a state. Keeping the served body under the TEST's control (`feed.show()`)
 * means the change asserted below is exactly one change, at exactly the moment this spec
 * chose.
 */
const installBackendMocks = async (
  page: Page,
  roleName: string,
  initialTransactions: TransactionRead[],
): Promise<TransactionFeed> => {
  // 1. Catch-all: anything under the app's transactions-api mount that this spec has not
  //    mocked is aborted, so it cannot travel on through the same-origin forwarder to the
  //    live service.
  await page.route(TRANSACTIONS_API_GLOB, (route) => route.abort());

  // 2. The one read this screen makes — and the one BR1 re-reads before submitting.
  let currentTransactions = initialTransactions;
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse(currentTransactions))),
  );

  // 3. The decide call, answered with the generic envelope the service really returns —
  //    see the header: this body says nothing about the outcome, by design.
  await page.route(DECISIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(alreadyDecidedResponse(CONTESTED_REQUEST.Id))),
  );

  // 4. A browser-side identity read, answered from the SAME shared userinfo source the
  //    Node-side stub uses, so the two mock layers cannot disagree about who is signed in.
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(userInfoFor(roleName))),
  );

  // 5. The live services' own origins.
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }

  return {
    show: (transactions: TransactionRead[]) => {
      currentTransactions = transactions;
    },
  };
};

/**
 * Puts the browser in a signed-in state as the named role, without any real credential:
 * the mock `session` cookie the Node-side auth stub maps back to this role when the
 * server-side gate asks it who the session belongs to.
 */
const seedSession = async (
  context: BrowserContext,
  roleName: string,
): Promise<void> => {
  await context.addCookies([
    {
      name: 'session',
      value: sessionTokenFor(roleName),
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
};

/** One request's row, found by its own reference — never by position. */
const requestRow = (page: Page, reference: string): Locator =>
  page.getByRole('main').getByRole('row').filter({ hasText: reference });

/**
 * The app's in-app notification surface — the root layout's `ToastContainer`, named
 * "Notifications". Deliberately NOT an `alert` query: see the header's trap.
 */
const notifications = (page: Page): Locator =>
  page.getByRole('region', { name: /notifications/i });

/** Chooses Approve on one request, from the control on its own row — one click. */
const chooseApprove = async (
  row: Locator,
  reference: string,
): Promise<void> => {
  await row
    .getByRole('button', { name: approveRequestName(reference) })
    .click();
};

test.describe('Epic expense-decisions, Story 4: one decision per request', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-5
  test('a decision confirmed on a request another Approver decided first is refused, and the request then shows the decision that other Approver recorded', async ({
    page,
    context,
  }) => {
    const feed = await installBackendMocks(page, ROLE_APPROVER, [
      CONTESTED_REQUEST,
    ]);
    await seedSession(context, ROLE_APPROVER);

    await page.goto(REQUESTS_ROUTE);

    // The Approver has the request in front of them, still awaiting a decision.
    const row = requestRow(page, CONTESTED_REQUEST.Reference);
    await expect(row).toContainText(TRANSACTION_STATUS_IMPORTED);

    // They choose Approve, and are asked to confirm before anything is recorded.
    await chooseApprove(row, CONTESTED_REQUEST.Reference);
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toBeVisible();

    // …and in that gap — the screen loaded, the confirmation open, nothing submitted yet
    // — ANOTHER Approver decides the same request. This is the race, made deterministic
    // (NFR4): from here the service reports the request as approved by someone else.
    feed.show([DECIDED_BY_SOMEONE_ELSE]);

    await confirmation
      .getByRole('button', { name: CONFIRM_DECISION_NAME })
      .click();

    // The decision is refused, in the brief's own words. Nothing in the decide call's
    // answer could have told the app this (see the header) — only re-reading the request
    // first can, which is what BR1 requires and what this assertion pins.
    const notification = notifications(page);
    await expect(
      notification,
      'confirming a decision on a request someone else had already decided said nothing to the Approver — they must be told it has already been decided (R4/R13), not left believing their decision was recorded',
    ).toBeVisible();
    await expect(
      notification,
      'the refusal did not use the wording the brief pins (R4/R13) — an Approver must be told the request has already been decided, not shown a service error or a generic failure',
    ).toContainText(ALREADY_DECIDED_MESSAGE);

    // …and they are not held inside the confirmation to read why nothing happened.
    await expect(confirmation).toBeHidden();

    // The list catches up to what was actually recorded, so the Approver is looking at
    // the truth rather than at the stale screen they acted on (R13).
    await expect(
      row,
      'the list still shows this request as awaiting a decision after the refusal — it must be brought up to date with the decision that was actually recorded (R13)',
    ).toContainText(TRANSACTION_STATUS_APPROVED);

    // And the request itself names the person who got there first — this is somebody
    // else's decision, not a silent second one recorded under the signed-in Approver.
    await row.getByRole('button', { name: OPEN_REQUEST_NAME }).click();
    const request = page.getByRole('dialog');
    await expect(request).toBeVisible();
    await expect(
      request,
      `the request does not show that ${OTHER_APPROVER} decided it — who decided a request, and when, is part of what every reader must be able to see (R16)`,
    ).toContainText(OTHER_APPROVER);
    await expect(
      request,
      `the request is attributed to ${DECIDING_APPROVER}, the Approver who was refused — a refused decision must leave no trace of itself on the record`,
    ).not.toContainText(DECIDING_APPROVER);
  });
});
