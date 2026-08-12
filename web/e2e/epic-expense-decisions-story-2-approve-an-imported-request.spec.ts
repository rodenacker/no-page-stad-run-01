/**
 * Story Metadata:
 * - Epic: expense-decisions — Approve or reject a request
 * - Story: 2 — Approve an imported request
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R1, R10, R11, R15, BR6, NFR1/NFR2 (+ project.md NFR-base-1, the
 *   WCAG 2.2 AA bar)
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-5 (the confirmation of a recorded decision clears itself after a few seconds,
 *   while a message the Approver has to act on stays until it is dismissed) → this
 *   file, as ONE journey through both halves. It belongs here and nowhere else: the
 *   two behaviours differ ONLY in how they treat time, and the jsdom version of that
 *   is `vi.useFakeTimers()` — the exact flakiness `page.clock` exists to remove
 *   (testing-policy.md § "Time-dependent behaviour").
 * - AC-1 (an Approver is offered Approve and Reject on a request awaiting a decision),
 *   AC-2 (neither appears for a Finance Uploader, nor on a decided request), AC-3 (the
 *   confirmation names the request by reference, holds focus on Cancel, and cancelling
 *   changes nothing), AC-4 (confirming records the approval) and AC-6 (a decision that
 *   cannot be recorded leaves the request untouched) are the Vitest layer's, at
 *   `web/src/__tests__/integration/epic-expense-decisions-story-2-approve-an-imported-request.test.tsx`.
 *   Deliberately NOT repeated here — where this spec has to drive through the
 *   confirmation to reach the notification, it does so as a step, not as an assertion.
 * - One accessibility scan is here: the OPEN approve confirmation. The `/requests`
 *   page-level scan already belongs to `expense-request-list` story 4 (its AC-6), but
 *   that scan cannot reach this state — the dialog is new in this story, exists only
 *   for an Approver, and only after a click. testing-policy.md § Accessibility
 *   requires each distinct state a story introduces to be scanned; stories 3 and 4
 *   reuse this same dialog, so it is scanned once, here.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * This spec never contacts a live backend and never uses a real credential
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running on this machine. Two boundaries, one
 * contract — the arrangement epics 1-4 established, reused rather than re-invented:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. `/requests` is gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie value seeded below — which
 *    is also what decides that the person deciding here is an Approver.
 * 2. Browser boundary → `page.route()` below:
 *      GET  /transactions-api/v1/transactions   (the list, and any re-read after a
 *                                                decision)
 *      POST /api/decisions                      (story 1's own decision endpoint)
 *    Both are the app's OWN same-origin addresses, so an unmocked call is forwarded to
 *    the live transactions service by a route handler INSIDE the Next.js process,
 *    where the live-origin block cannot see it — which is why the decision endpoint is
 *    mocked in every test here, including the one that never confirms anything.
 *    A catch-all aborts anything else under `/transactions-api/**`, and the real
 *    services' own origins are blocked outright, registered LAST so they win over the
 *    origin-agnostic globs above them.
 *
 * Every response body comes from the project-wide factories under `web/src/mocks/data/`
 * (`transaction.ts`, `identity.ts`, `role.ts`) — no response shape and no canonical
 * value is authored in this file, so this spec and the Vitest layer cannot drift on the
 * contract.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - The decision is sent FROM THE BROWSER to the app's own `/api/decisions` route
 *   (story 1's contract, via `web/src/lib/api/decisions.ts` on the shared API client).
 *   `page.route()` cannot intercept a fetch made by the Next.js server or by a Server
 *   Action — moving the call into one bypasses these mocks and sends the request to the
 *   live transactions service. This spec asserts nothing about that call's shape
 *   (`TransactionId` in the query, the server-populated `LastChangedUser` header): that
 *   is story 1's Vitest layer.
 * - The per-request Approve action is a DIRECT control on the request's own row
 *   (`RequestActions.tsx`), reachable in one click. A request carries no ⋯ action
 *   overflow at all — every control it offers, Open included, sits on the row (the menu
 *   was removed at a later manual test). Because every listed request carries its own
 *   Approve, each one's accessible name names the request it decides ("Approve request
 *   <reference>"), which is also what lets this spec address one row's Approve without
 *   matching every other row's. The confirmation is the Shadcn `alert-dialog` already
 *   installed, which Radix renders as `role="alertdialog"`, PORTALLED to the body — so
 *   dialog queries are scoped to the dialog itself, never to `main`.
 * - The confirmation CLOSES when the decision is submitted, whichever way it turns out:
 *   a failure is reported on the screen behind it, not inside a dialog the Approver is
 *   left sitting in. That is what makes the persistent notification below the story's
 *   mechanism rather than a second one.
 * - Both notifications come out of the root layout's EXISTING toast machinery
 *   (`ToastProvider` / `ToastContainer` / `useToast()`), which renders one
 *   `role="region"` named "Notifications". The recorded-decision confirmation takes the
 *   default duration (5s — inside R11's 4-8s window); the message the Approver must act
 *   on is raised with `duration: 0`, the never-fades mode `file-validation-and-retry`
 *   added to `ToastOptions` (`web/src/types/toast.ts`). No second notification surface,
 *   and no bespoke banner inside the list.
 *
 * QUERYING THE NOTIFICATION — the trap this spec avoids on purpose: it is found through
 * `getByRole('region', { name: /notifications/i })`, the surface's own accessible name
 * (the same handle the Vitest layer uses), NOT through `getByRole('alert')`. Next
 * renders a permanently empty body-level `role="alert"` route announcer, so an unscoped
 * alert query always matches two elements, and a toast's own role legitimately varies
 * with its variant (`alert` for error, `status` otherwise). The notification also
 * renders OUTSIDE `main` (a fixed-position container mounted in the root layout), so
 * scoping it to `main` would find nothing. Everything about the LIST is scoped to
 * `main`.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie (epic 1
 * BR2), seeded directly rather than by driving the sign-in form — epic 1's story 2 spec
 * owns that journey. Cookies ignore port, so one seed serves the dev server (:3000) and
 * the epic-end production run (:3100). `Secure` is omitted because the E2E server is
 * plain http on localhost.
 *
 * TIMING — why nothing here waits real time, and why the clock is RESUMED:
 * `page.clock.install()` is called before navigating (so no timer escapes the fake
 * clock) and then immediately `resume()`d, which leaves time flowing normally while the
 * dialog is driven — Radix's own focus and animation work runs on
 * `requestAnimationFrame`, which the installed clock also fakes, so a PAUSED clock
 * would stall the very interaction under test. The two notification lifetimes are then
 * measured with `fastForward()` at the app's REAL durations: no test-only "short
 * duration" prop in production code, and no test sitting waiting out 5 seconds. The
 * accessibility test runs with no clock at all — axe is never run under faked timers.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): `/requests` offers no
 * decide action at all today — a request's only control is the one that opens it.
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import {
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_WARNING_LEAD_MS,
} from '../src/lib/session/config';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER } from '../src/mocks/data/role';
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  approveSuccessResponse,
  createTransaction,
  decisionFailureResponse,
  transactionDecided,
  transactionListResponse,
  transactionsInEveryStatus,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** This story's screen (story metadata Route). */
const REQUESTS_PATH = '/requests';

/**
 * The calls this screen makes, as the BROWSER addresses them: the app's own mount
 * points, never a service origin. Trailing `**` so query strings are covered.
 */
const TRANSACTIONS_API_GLOB = '**/transactions-api/**';
const TRANSACTIONS_URL_GLOB = '**/transactions-api/v1/transactions**';

/**
 * Story 1's decision endpoint, on the app's own origin — the only address a decision is
 * ever sent to from the browser. Mocked in every test: unmocked, the Next.js route
 * handler behind it would forward the decision to the live transactions service.
 */
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
 * WCAG 2.2 AA — this project's effective accessibility bar (project.md §Baseline NFRs,
 * superseding the template's 2.1 AA floor), and the identical tag set every earlier
 * epic's scan used. Scoped explicitly because axe's defaults also run best-practice
 * rules, which would fail this spec on issues outside the agreed bar.
 */
const WCAG_22_AA_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
];

/**
 * How the decide action reads, on the request's own row and as the confirming choice in
 * the dialog. Deliberately narrow: the dismissing choice is "Cancel" (R10 / BR6 / NFR2),
 * which cannot match this.
 */
const APPROVE_LABEL = /approve/i;

/**
 * The row's own Approve, named for the request it decides — which is what makes one
 * row's control addressable while every other listed request carries one too (R15).
 */
const approveRequestName = (reference: string): RegExp =>
  new RegExp(`approve request ${reference}`, 'i');

/**
 * How the confirmation of a RECORDED decision reads. Loose on purpose — the developer
 * owns the copy; what is fixed is that it is about the approval that was just recorded
 * (R15), not a failure.
 */
const RECORDED_WORDING = /approv/i;

/**
 * How a decision that could NOT be recorded reads. Also loose: any plainly worded
 * failure says one of these, and pinning the exact sentence is AC-6's business in the
 * Vitest layer, not this test's.
 */
const NOT_RECORDED_WORDING =
  /(could ?n[o']?t|can ?n[o']?t|was not|not recorded|unable|fail|went wrong)/i;

/** The dismiss control every notification carries (`Toast.tsx`). */
const DISMISS_LABEL = /dismiss/i;

/**
 * Browser time bought at each measurement, in the app's REAL durations (R11: a
 * transient confirmation clears itself in 4-8 seconds).
 *
 * - `SHORT_OF_THE_FLOOR_MS` stays inside R11's 4s floor, so a confirmation that
 *   flashed past — no time to read it — fails here.
 * - `PAST_THE_CEILING_MS` carries the clock well beyond R11's 8s ceiling, so a
 *   confirmation that never cleared itself fails there.
 * - `WELL_PAST_ANY_WINDOW_MS` is far beyond every auto-dismiss window this app has, so
 *   a message raised on the default duration by mistake cannot survive it.
 */
const SHORT_OF_THE_FLOOR_MS = 2_000;
const PAST_THE_CEILING_MS = 10_000;
const WELL_PAST_ANY_WINDOW_MS = 60_000;

/**
 * Every jump above is idle time as far as epic 1's idle-session manager is concerned,
 * so the total has to stay well inside the idle window or the session would end
 * mid-test. Checked against the app's own configured values.
 *
 * Note: this process reads the same env names the app does but does not load
 * `web/.env.local` — so if you shorten the idle timings there for manual testing,
 * shorten this budget to match.
 */
const CLOCK_BUDGET_MS =
  SHORT_OF_THE_FLOOR_MS + PAST_THE_CEILING_MS + WELL_PAST_ANY_WINDOW_MS;

if (CLOCK_BUDGET_MS >= SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_LEAD_MS) {
  throw new Error(
    `This spec advances the browser clock by ${CLOCK_BUDGET_MS}ms of idle time, ` +
      `which reaches the configured session idle window ` +
      `(${SESSION_IDLE_TIMEOUT_MS}ms idle, ${SESSION_WARNING_LEAD_MS}ms warning ` +
      `lead) — the session would end mid-test. Raise ` +
      `NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_SECONDS or lower the jumps above.`,
  );
}

/**
 * The one request in `requests` that is still awaiting a decision, found by its status
 * rather than by position — a fixture that stopped carrying one must fail loudly here
 * rather than silently decide the wrong row.
 */
const awaitingDecisionIn = (requests: TransactionRead[]): TransactionRead => {
  const match = requests.find(
    (request) => request.Status === TRANSACTION_STATUS_IMPORTED,
  );
  if (!match) {
    throw new Error(
      'No request awaiting a decision in the fixture — see ' +
        'transactionsInEveryStatus() in web/src/mocks/data/transaction.ts.',
    );
  }
  return match;
};

/**
 * The two requests this spec decides on, both awaiting a decision and both from the
 * project-wide factory. They carry different account numbers, amounts and dates, so
 * neither is a possible duplicate of the other — a duplicate pair would raise the
 * request list's OWN persistent notification to an Approver (epic 3, R21) and there
 * would be no telling that notification from this story's.
 */
const AWAITING_FIRST = createTransaction();
const AWAITING_SECOND = awaitingDecisionIn(transactionsInEveryStatus());

/** The first request as a fresh read reports it once the approval is recorded. */
const APPROVED_FIRST = transactionDecided(AWAITING_FIRST, {
  status: TRANSACTION_STATUS_APPROVED,
});

/** A mocked JSON response, built from a project-wide factory body. */
const jsonResponse = (
  body: unknown,
  status = 200,
): { status: number; contentType: string; body: string } => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/** Blocks the live services outright (see LIVE_BACKEND_ORIGINS). */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Puts the browser in a signed-in state as the named role, without a real credential:
 * the mock `session` cookie the Node-side auth stub maps back to this role when the
 * server-side gate asks who the session belongs to.
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

/**
 * Answers a BROWSER-side identity read from the shared userinfo source, so it can never
 * disagree with what the Node-side stub returns for the same session — one person
 * server-side and another in the browser would mean two different sets of actions.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(userInfoFor(roleName))),
  );
};

/** What the mocked transactions service is currently holding. */
interface RequestFeed {
  /** Change what the NEXT read of the list returns — the service moving on. */
  show: (requests: TransactionRead[]) => void;
}

/**
 * Serves the expense request list, returning whatever the test last called `show` with.
 *
 * Deliberately NOT one snapshot per request: the browser may legitimately read the list
 * more than once for a single on-screen state, and a queue would then silently skip a
 * state. Keeping the served body under the TEST's control means each assertion below is
 * about one exact transition.
 *
 * The `/transactions-api/**` catch-all is registered FIRST so it loses to the specific
 * read (Playwright matches the most recently registered route first): any other call
 * under the app's transactions mount is aborted rather than forwarded to the live
 * service by the app's own proxy.
 */
const serveRequests = async (
  page: Page,
  initialRequests: TransactionRead[],
): Promise<RequestFeed> => {
  await page.route(TRANSACTIONS_API_GLOB, (route) => route.abort());

  let requests = initialRequests;
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse(requests))),
  );

  return {
    show: (next: TransactionRead[]) => {
      requests = next;
    },
  };
};

/** One answer from the app's own decision endpoint, and what the service then holds. */
interface DecisionAnswer {
  /** The status it answers with — 200 recorded, 500 refused. */
  status: number;
  /** Its body, always from the shared factory (brief BR1: one envelope either way). */
  body: unknown;
  /** Applied BEFORE answering: what a fresh read of the list would now return. */
  andThen?: () => void;
}

/**
 * Answers the decision endpoint with `answers` in order, repeating the last one for any
 * further call.
 *
 * A SEQUENCE rather than one fixed body, because the two halves of AC-5 are exactly a
 * decision that is recorded followed by one that is not. Nothing here counts calls —
 * what is on screen is the evidence.
 */
const mockDecisionCalls = async (
  page: Page,
  answers: readonly DecisionAnswer[],
): Promise<void> => {
  let calls = 0;
  await page.route(DECISIONS_URL_GLOB, (route) => {
    const answer = answers[Math.min(calls, answers.length - 1)];
    calls += 1;
    if (!answer) {
      throw new Error(
        'mockDecisionCalls was given no answers — every decision this spec sends ' +
          'must be answered here, or it would leave for the live service.',
      );
    }
    answer.andThen?.();
    return route.fulfill(jsonResponse(answer.body, answer.status));
  });
};

/** The screen's own content — everything about the list is scoped to it. */
const screenOf = (page: Page): Locator => page.getByRole('main');

/** One request's row, found by its `Reference` (the brief's identifier), never by position. */
const requestRow = (page: Page, reference: string): Locator =>
  screenOf(page).getByRole('row').filter({ hasText: reference });

/** The confirmation, portalled to the body by Radix — addressed on its own, not via `main`. */
const confirmation = (page: Page): Locator => page.getByRole('alertdialog');

/**
 * The app's in-app notification surface — the root layout's `ToastContainer`, named
 * "Notifications". Deliberately NOT an `alert` query: see the header's trap.
 */
const notifications = (page: Page): Locator =>
  page.getByRole('region', { name: /notifications/i });

/**
 * Opens the request's confirmation from the Approve control on its own row — ONE click,
 * which is the placement this story owns. A step, not an assertion: that the
 * confirmation names the request and holds focus on Cancel is AC-3's, in the Vitest
 * layer.
 */
const openApproveConfirmation = async (
  page: Page,
  reference: string,
): Promise<Locator> => {
  await requestRow(page, reference)
    .getByRole('button', { name: approveRequestName(reference) })
    .click();

  const dialog = confirmation(page);
  await expect(dialog).toBeVisible();
  return dialog;
};

/**
 * Approves the request the way a user does: the Approve on its row and then the
 * confirmation, which closes on submitting whichever way the decision turns out (see
 * the header's implementation assumptions).
 */
const approve = async (page: Page, reference: string): Promise<void> => {
  const dialog = await openApproveConfirmation(page, reference);
  await dialog.getByRole('button', { name: APPROVE_LABEL }).click();
  await expect(
    dialog,
    'the confirmation must close once the decision is submitted — a failure is ' +
      'reported on the screen behind it, not inside a dialog the Approver is left in',
  ).toBeHidden();
};

/** Real-browser axe scan of whatever state the page is in right now. */
const expectNoAccessibilityViolations = async (
  page: Page,
  state: string,
): Promise<void> => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_22_AA_TAGS)
    .analyze();

  expect(
    violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes.length} node/s)`,
    ),
    `WCAG 2.2 AA violations on the expense request list (${state})`,
  ).toEqual([]);
};

test.describe('Epic expense-decisions, Story 2: approve an imported request', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the identity it needs.
    await context.clearCookies();
  });

  // AC-5
  // One journey through both halves of the criterion, on the same screen and the same
  // notification surface: a decision that IS recorded confirms itself and then clears
  // itself with nobody touching the browser, and a decision that is NOT recorded leaves
  // a message that outlives every auto-dismiss window and goes only when the Approver
  // dismisses it. Told apart by time alone, which is why this is a browser test.
  test('the confirmation of a recorded approval clears itself, while a failed decision leaves a message that stays until it is dismissed', async ({
    page,
    context,
  }) => {
    // Take the browser clock before anything schedules a timer — then let it flow, so
    // the dialog behaves exactly as it does for a user (see the header's TIMING note).
    await page.clock.install();
    await page.clock.resume();

    const feed = await serveRequests(page, [AWAITING_FIRST, AWAITING_SECOND]);
    await mockDecisionCalls(page, [
      {
        status: 200,
        body: approveSuccessResponse(AWAITING_FIRST.Id),
        // The service records it, so a fresh read now reports it approved.
        andThen: () => {
          feed.show([APPROVED_FIRST, AWAITING_SECOND]);
        },
      },
      {
        // The second decision is refused, and the list is left exactly as it was.
        status: 500,
        body: decisionFailureResponse(),
      },
    ]);
    await mockBrowserIdentityCall(page, ROLE_APPROVER);
    await blockLiveBackends(page);
    await seedSession(context, ROLE_APPROVER);

    await page.goto(REQUESTS_PATH);

    // Both requests are awaiting a decision, and the Approver has been told nothing at
    // all yet — so every notification below is one this story raised.
    const firstRow = requestRow(page, AWAITING_FIRST.Reference);
    const secondRow = requestRow(page, AWAITING_SECOND.Reference);
    await expect(firstRow).toContainText(TRANSACTION_STATUS_IMPORTED);
    await expect(secondRow).toContainText(TRANSACTION_STATUS_IMPORTED);
    await expect(notifications(page)).toBeHidden();

    /* ---- 1. A decision that IS recorded: the confirmation clears itself ---- */

    await approve(page, AWAITING_FIRST.Reference);

    // The decision landed (AC-4's ground, asserted here only so the notification that
    // follows is unmistakably about a decision that was really recorded)...
    await expect(firstRow).toContainText(TRANSACTION_STATUS_APPROVED);

    // ...and the Approver is told so (R15).
    const confirmationMessage = notifications(page);
    await expect(confirmationMessage).toBeVisible();
    await expect(confirmationMessage).toContainText(RECORDED_WORDING);

    // A couple of seconds on, it is still there to be read: a confirmation that flashed
    // past would be no confirmation at all (R11's 4s floor).
    await page.clock.fastForward(SHORT_OF_THE_FLOOR_MS);
    await expect(confirmationMessage).toBeVisible();

    // Past the window, it has cleared itself. Nobody dismissed it, nothing was clicked
    // and nothing navigated — only time passed (R11's 8s ceiling).
    await page.clock.fastForward(PAST_THE_CEILING_MS);
    await expect(confirmationMessage).toBeHidden();

    /* ---- 2. A decision that is NOT recorded: the message waits for them ---- */

    await approve(page, AWAITING_SECOND.Reference);

    // The request is left exactly as it was — still awaiting a decision.
    await expect(secondRow).toContainText(TRANSACTION_STATUS_IMPORTED);

    // And this time the Approver has something to act on, said plainly.
    const messageToActOn = notifications(page);
    await expect(messageToActOn).toBeVisible();
    await expect(messageToActOn).toContainText(NOT_RECORDED_WORDING);

    // Far beyond every auto-dismiss window this app has, it is still on screen: what
    // the user must act on does not fade while they are reading it (R11's second half,
    // `duration: 0`). A message left on the default duration cannot survive this jump.
    await page.clock.fastForward(WELL_PAST_ANY_WINDOW_MS);
    await expect(
      messageToActOn,
      'a message the Approver has to act on must stay until it is dismissed — raise ' +
        'it through useToast() with duration: 0 (web/src/types/toast.ts), never on ' +
        'the default duration',
    ).toBeVisible();
    await expect(messageToActOn).toContainText(NOT_RECORDED_WORDING);

    // It goes when — and only when — they dismiss it themselves.
    await messageToActOn.getByRole('button', { name: DISMISS_LABEL }).click();
    await expect(messageToActOn).toBeHidden();
  });

  // Accessibility — the one state the epic's page-level scan cannot reach: this story's
  // confirmation, open over the request list, for the only role that is offered it.
  // Real browser, so the overlay's contrast, the dialog's accessible name and where its
  // focus sits are all seen. No fake clock here — axe is never run under faked timers.
  test('the open approve confirmation has no accessibility violations', async ({
    page,
    context,
  }) => {
    await serveRequests(page, [AWAITING_FIRST, AWAITING_SECOND]);
    // Registered even though nothing is confirmed here: an unmocked decision would
    // leave for the live transactions service through the app's own route handler.
    await mockDecisionCalls(page, [
      { status: 200, body: approveSuccessResponse(AWAITING_FIRST.Id) },
    ]);
    await mockBrowserIdentityCall(page, ROLE_APPROVER);
    await blockLiveBackends(page);
    await seedSession(context, ROLE_APPROVER);

    await page.goto(REQUESTS_PATH);

    // Settle the list underneath first, so the scan is not racing a loading placeholder.
    await expect(requestRow(page, AWAITING_FIRST.Reference)).toContainText(
      TRANSACTION_STATUS_IMPORTED,
    );

    const dialog = await openApproveConfirmation(
      page,
      AWAITING_FIRST.Reference,
    );

    // Scan once the confirmation has arrived and its choices are there to be operated,
    // so the state under the scan is the settled one.
    await expect(
      dialog.getByRole('button', { name: APPROVE_LABEL }),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: /cancel/i })).toBeVisible();

    await expectNoAccessibilityViolations(
      page,
      'the approve confirmation open over the list',
    );
  });
});
