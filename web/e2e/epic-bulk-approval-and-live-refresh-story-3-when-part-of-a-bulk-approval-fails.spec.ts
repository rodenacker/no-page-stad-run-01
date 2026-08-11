/**
 * Story Metadata:
 * - Epic: bulk-approval-and-live-refresh — Bulk approval and a self-updating list
 * - Story: 3 — When part of a bulk approval fails
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R5, R10, BR11 (+ project.md NFR-base-5 retry affordance, and
 *   NFR-base-1 as this project's WCAG 2.2 AA bar)
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-5 (in the browser, a bulk approval where some approvals fail reports the
 *   failures, and trying again records those remaining requests) → this file, as ONE
 *   journey: select, confirm, watch part of the batch be refused, read the report,
 *   act on it. It belongs here because it is the only layer where the whole chain is
 *   real — a genuine per-request POST that the service answers differently for
 *   different requests, a genuine reconciliation read, and a genuine second batch
 *   driven from the control the report offers.
 * - AC-1 (the report names all three groups separately and says plainly why the last
 *   group failed), AC-2 (the retry covers only the could-not-be-submitted subset and
 *   leaves the approved ones alone), AC-3 (the retry re-checks first, so a request a
 *   colleague decided in the meantime is reported as left unchanged) and AC-4 (when
 *   every approval fails, nothing is reported as approved and the selection is kept)
 *   are the Vitest layer's, at
 *   `web/src/__tests__/integration/epic-bulk-approval-and-live-refresh-story-3-when-part-of-a-bulk-approval-fails.test.tsx`.
 *   Deliberately NOT repeated here: this spec drives THROUGH the confirmation and the
 *   bucket copy as steps, and asserts only what the browser adds.
 * - One accessibility scan is here: the failed-batch report, open over the list. It is
 *   a state no earlier scan can reach — it exists only for an Approver, only after a
 *   bulk approval that was partly refused, and it is the first notification in this
 *   app that carries an ACTION rather than a link. The `/requests` page-level scan
 *   belongs to `expense-request-list` story 4, and the open confirmation's to
 *   `expense-decisions` story 2.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * This spec never contacts a live backend and never uses a real credential
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running on this machine. Two boundaries, one
 * contract — the arrangement epics 1-6 established, reused rather than re-invented:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. `/requests` is gated
 *    SERVER-side (the `(authenticated)` layout's session check calls
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie value seeded below — which
 *    is also what decides that the person approving here is an Approver.
 * 2. Browser boundary → `page.route()` below, as a small MOCKED TRANSACTIONS SERVICE
 *    rather than a queue of canned answers:
 *      GET  /transactions-api/v1/transactions   (the first read, the pre-submit
 *                                                re-check, the reconciliation read,
 *                                                story 4's refresh poll — all the same
 *                                                endpoint, which is exactly why the
 *                                                mock holds STATE instead of a
 *                                                sequence)
 *      POST /api/decisions                      (`expense-decisions` story 1's own
 *                                                decision endpoint — one call per
 *                                                request, there is no bulk endpoint)
 *    A decision the mocked service accepts changes what every later read returns; one
 *    it refuses changes nothing. That is what makes the outcome report's approved
 *    count checkable at all: brief BR5 requires it to come from comparing status
 *    before and after, and an implementation that instead trusted the call bodies
 *    would report the refused request as approved and fail here.
 *    Both addresses are the app's OWN same-origin mount points, so an unmocked call is
 *    forwarded to the live transactions service by a route handler INSIDE the Next.js
 *    process, where the live-origin block cannot see it. A catch-all aborts anything
 *    else under `/transactions-api/**`, and the real services' own origins are blocked
 *    outright, registered LAST so they win over the origin-agnostic globs above them.
 *
 * Every response body comes from the project-wide factories under `web/src/mocks/data/`
 * (`transaction.ts`, `identity.ts`, `role.ts`) — no response shape and no canonical
 * value is authored in this file, so this spec and the Vitest layer cannot drift on the
 * contract.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - Every approve call is sent FROM THE BROWSER to the app's own `/api/decisions`
 *   (`web/src/lib/api/decisions.ts` on the shared API client), one per request, reusing
 *   `expense-decisions`' single-request approve caller — brief story 2 §Dependency
 *   seams. `page.route()` cannot intercept a fetch made by the Next.js server or by a
 *   Server Action: moving the batch into one bypasses these mocks and sends real
 *   approvals to the live transactions service.
 * - The per-request SELECTION control is a checkbox (`role="checkbox"`, the Shadcn
 *   `checkbox` primitive) on the request's own row, named for the request it selects —
 *   "Select request <reference>", the same names-the-request convention every
 *   per-request control on this screen already follows (`decideActionName` in
 *   `web/src/lib/transactions/deciding.ts`). Without it a screen-reader user meets a
 *   screenful of identically named controls, and this spec could not address one row's
 *   tick while every other row carries one too.
 * - The wording every locator below pins is the SAME wording this story's Vitest layer
 *   pins (the bulk action, the confirming choice, "Try again", and the three bucket
 *   phrases) — one contract, checked at two levels, so the layers cannot drift.
 * - The BULK action is a control on the list's own toolbar whose name contains both
 *   "approve" and "select" ("Approve selected requests" / "Approve 3 selected
 *   requests") — which is also what tells it apart from the per-row "Approve request
 *   <reference>" controls `expense-decisions` put on every row.
 * - The confirmation is the Shadcn `alert-dialog` already installed, which Radix
 *   renders as `role="alertdialog"` PORTALLED to the body — so dialog queries are
 *   scoped to the dialog, never to `main` — and it CLOSES on accepting, whichever way
 *   the batch turns out. The outcome belongs on the screen behind it, not in a dialog
 *   the Approver is left sitting in (the convention `expense-decisions` story 2 set).
 * - The outcome report comes out of the root layout's EXISTING toast machinery
 *   (`ToastProvider` / `ToastContainer` / `useToast()`), which renders one
 *   `role="region"` named "Notifications". A report carrying failures is raised with
 *   `duration: 0` (story file §Implementation notes) — it holds an action the Approver
 *   has to take, so it must not fade while they read it.
 * - THE RETRY LIVES INSIDE THAT REPORT, as a real `<button>` in the notification
 *   ("Try again"), reachable by keyboard — not a click handler on the notification's
 *   body, which is not in the tab order (`web/src/components/toast/Toast.tsx` states
 *   this rule for its link). `ToastOptions` today offers `link` (somewhere to GO) but
 *   no action (something to DO); this story is what adds one. Acting on the report
 *   dismisses it, the way following its link already does — a report still offering to
 *   retry requests that have since been approved would be worse than no report.
 *
 * QUERYING THE REPORT — the trap this spec avoids on purpose: it is found through
 * `getByRole('region', { name: /notifications/i })`, the surface's own accessible name
 * (the same handle the Vitest layer uses), NOT through `getByRole('alert')`. Next
 * renders a permanently empty body-level `role="alert"` route announcer, so an unscoped
 * alert query always matches two elements, and a toast's own role legitimately varies
 * with its variant (`alert` for error, `status` otherwise). The report also renders
 * OUTSIDE `main` (a fixed-position container mounted in the root layout), so scoping it
 * to `main` would find nothing. Everything about the LIST is scoped to `main`.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie (epic 1
 * BR2), seeded directly rather than by driving the sign-in form — epic 1's story 2 spec
 * owns that journey. Cookies ignore port, so one seed serves the dev server (:3000) and
 * the epic-end production run (:3100). `Secure` is omitted because the E2E server is
 * plain http on localhost.
 *
 * TIMING: nothing here waits real time and no clock is installed. The report under test
 * is the one that never fades, and every other wait is an auto-waiting `expect`. Story
 * 4's 15s refresh poll is harmless to this spec: it reads the same mocked service, so a
 * poll landing mid-journey returns exactly what the last decision left behind.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): `/requests` offers no
 * selection control and no bulk action at all today.
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER } from '../src/mocks/data/role';
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  approveSuccessResponse,
  decisionFailureResponse,
  transactionListResponse,
  transactionsAfterApproving,
  transactionsForBulkSelection,
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
 * `expense-decisions`' decision endpoint, on the app's own origin — the only address an
 * approval is ever sent to from the browser, and the one a bulk approval calls once per
 * request (brief BR3: there is no bulk endpoint). Mocked in every test: unmocked, the
 * Next.js route handler behind it would forward real approvals to the live service.
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
 * The tick on a request's own row, named for the request it selects — which is what
 * makes one row's control addressable while every listed row carries one too. Stated
 * exactly as story 1's Vitest layer states it, so the two layers pin one contract.
 */
const selectRequestName = (reference: string): RegExp =>
  new RegExp(`^select\\b.*${reference}`, 'i');

/**
 * The bulk action on the list's toolbar. Both words are required deliberately: the
 * per-row controls `expense-decisions` added read "Approve request <reference>" and
 * carry no "select", so this can never pick one of them up by mistake.
 */
const BULK_APPROVE_NAME = /^approve\b.*\bselect/i;

/** The confirming choice inside the confirmation; the way out reads "Cancel". */
const CONFIRM_APPROVE_NAME = /^approve\b/i;

/** The action the failed-subset report offers (NFR-base-5). */
const TRY_AGAIN_NAME = /try again/i;

/**
 * One bucket of the outcome report: a count, and the group it belongs to, as one
 * phrase. The same shape this story's Vitest layer uses, so neither layer can pin
 * wording the other does not — tolerant of the noun ("2 approved" and "2 requests
 * approved" both read correctly) and deliberately intolerant of a number that has
 * drifted away from its bucket, which is the one bug this story exists to prevent.
 */
const bucketPhrase = (count: number, phrase: string): RegExp =>
  new RegExp(`\\b${String(count)}(\\s+requests?)?\\s+${phrase}\\b`, 'i');

/** Requests whose status actually changed, per the reconciliation read (BR5). */
const approved = (count: number): RegExp => bucketPhrase(count, 'approved');

/** Requests the call itself failed for — the only bucket the retry covers (R10). */
const couldNotBeSubmitted = (count: number): RegExp =>
  bucketPhrase(count, 'could not be submitted');

/**
 * The client's own HTTP placeholder, which must never reach a user
 * (project.md NFR-base-5, and the `serviceMessageOf ?? serviceDetailOf ?? own wording`
 * rule in `web/src/lib/api/errors.ts`).
 */
const CLIENT_PLACEHOLDER = /internal server error/i;

/** The list this story starts from: three requests awaiting a decision, plus a decided pair. */
const LISTED_REQUESTS = transactionsForBulkSelection(3);

/**
 * The three selectable requests, found by their status rather than by position — a
 * fixture that stopped carrying three must fail loudly here rather than silently select
 * a request that was already decided.
 */
const awaitingDecisionIn = (requests: TransactionRead[]): TransactionRead[] => {
  const awaiting = requests.filter(
    (request) => request.Status === TRANSACTION_STATUS_IMPORTED,
  );
  if (awaiting.length < 3) {
    throw new Error(
      `This spec needs three requests awaiting a decision and the fixture holds ` +
        `${String(awaiting.length)} — see transactionsForBulkSelection() in ` +
        'web/src/mocks/data/transaction.ts.',
    );
  }
  return awaiting;
};

const [RECORDED_FIRST, RECORDED_SECOND, REFUSED_REQUEST] =
  awaitingDecisionIn(LISTED_REQUESTS);

/** The whole selection, in the order it is ticked. */
const SELECTED_REFERENCES = [
  RECORDED_FIRST.Reference,
  RECORDED_SECOND.Reference,
  REFUSED_REQUEST.Reference,
];

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

/**
 * Which request a decision is for, read off the call the browser actually sent.
 *
 * Throws rather than guessing: a bulk approval that sent one call with a list of ids,
 * or none at all, would otherwise quietly approve nothing and leave this spec asserting
 * against a list that never moved.
 */
const transactionIdOf = (body: string | null): number => {
  const parsed: unknown = body === null ? null : JSON.parse(body);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('TransactionId' in parsed)
  ) {
    throw new Error(
      `A decision reached the mocked service without a TransactionId (body: ` +
        `${String(body)}). Bulk approve sends ONE call per request through ` +
        'recordDecision() — there is no bulk endpoint (brief BR3).',
    );
  }
  const { TransactionId } = parsed;
  if (typeof TransactionId !== 'number') {
    throw new Error(
      `A decision named its request as ${String(TransactionId)} rather than a ` +
        'transaction id.',
    );
  }
  return TransactionId;
};

/** The mocked transactions service, as this spec drives it. */
interface MockedTransactionsService {
  /** From now on, an approve call for one of these ids is refused by the service. */
  refuse: (ids: readonly number[]) => void;
  /** The service recovers: nothing is refused any more. */
  recover: () => void;
}

/**
 * Serves the expense requests and the approve calls as one small stateful service.
 *
 * Stateful rather than a queue of canned answers because every read in this epic hits
 * the SAME endpoint — the first read, the pre-submit re-check (BR2), the post-batch
 * reconciliation read (BR5), the retry's re-check (BR11) and story 4's refresh poll —
 * so a queue would silently hand the wrong snapshot to whichever read happened to land
 * first. Here, a decision the service accepted is visible to every later read and one
 * it refused is visible to none, which is the only ground truth an outcome report
 * computed per BR5 can be checked against.
 *
 * The `/transactions-api/**` catch-all is registered FIRST so it loses to the specific
 * read (Playwright matches the most recently registered route first): any other call
 * under the app's transactions mount is aborted rather than forwarded to the live
 * service by the app's own proxy.
 */
const startMockedTransactionsService = async (
  page: Page,
  initialRequests: TransactionRead[],
): Promise<MockedTransactionsService> => {
  await page.route(TRANSACTIONS_API_GLOB, (route) => route.abort());

  let requests = initialRequests;
  let refused: ReadonlySet<number> = new Set<number>();

  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse(requests))),
  );

  await page.route(DECISIONS_URL_GLOB, (route) => {
    const call = route.request();
    if (call.method() !== 'POST') {
      // Nothing in this story addresses this path with another method; letting one
      // through would forward it to the live transactions service.
      return route.abort();
    }

    const transactionId = transactionIdOf(call.postData());

    if (refused.has(transactionId)) {
      // The service refuses this one, and the request stays exactly as it was — the
      // could-not-be-submitted bucket (R10), which is NOT the already-decided bucket.
      return route.fulfill(jsonResponse(decisionFailureResponse(), 500));
    }

    // Recorded: every later read reports it approved. The envelope itself says nothing
    // about that (brief BR5), which is the point — an implementation that reads the
    // outcome out of this body instead of out of the next read will report the refused
    // request as approved and fail below.
    requests = transactionsAfterApproving(requests, [transactionId]);
    return route.fulfill(jsonResponse(approveSuccessResponse(transactionId)));
  });

  return {
    refuse: (ids: readonly number[]) => {
      refused = new Set(ids);
    },
    recover: () => {
      refused = new Set<number>();
    },
  };
};

/** The screen's own content — everything about the list is scoped to it. */
const screenOf = (page: Page): Locator => page.getByRole('main');

/** One request's row, found by its `Reference` (the brief's identifier), never by position. */
const requestRow = (page: Page, reference: string): Locator =>
  screenOf(page).getByRole('row').filter({ hasText: reference });

/**
 * The app's in-app notification surface — the root layout's `ToastContainer`, named
 * "Notifications". Deliberately NOT an `alert` query: see the header's trap.
 */
const notifications = (page: Page): Locator =>
  page.getByRole('region', { name: /notifications/i });

/** The action the failed-subset report offers, inside the report itself. */
const tryAgain = (page: Page): Locator =>
  notifications(page).getByRole('button', { name: TRY_AGAIN_NAME });

/**
 * Opens the list signed in as an Approver, against a mocked transactions service
 * holding `requests`.
 */
const openTheListAsAnApprover = async (
  page: Page,
  context: BrowserContext,
  requests: TransactionRead[],
): Promise<MockedTransactionsService> => {
  const service = await startMockedTransactionsService(page, requests);
  await mockBrowserIdentityCall(page, ROLE_APPROVER);
  await blockLiveBackends(page);
  await seedSession(context, ROLE_APPROVER);
  await page.goto(REQUESTS_PATH);
  return service;
};

/**
 * Selects the named requests and approves the whole selection, through the confirmation.
 *
 * A step, not an assertion: that the confirmation names the exact count and holds focus
 * on the way out is story 2's, in its Vitest layer.
 */
const bulkApprove = async (
  page: Page,
  references: readonly string[],
): Promise<void> => {
  for (const reference of references) {
    await requestRow(page, reference)
      .getByRole('checkbox', { name: selectRequestName(reference) })
      .check();
  }

  await screenOf(page).getByRole('button', { name: BULK_APPROVE_NAME }).click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: CONFIRM_APPROVE_NAME }).click();
  await expect(
    dialog,
    'the confirmation must close once the batch is under way — the outcome is ' +
      'reported on the screen behind it, not inside a dialog the Approver is left in',
  ).toBeHidden();
};

/**
 * Runs a bulk approval of all three requests in which the service refuses exactly one,
 * and waits until the report of it is on screen. Shared by both tests below.
 */
const bulkApproveWithOneRefusal = async (
  page: Page,
  context: BrowserContext,
): Promise<MockedTransactionsService> => {
  const service = await openTheListAsAnApprover(page, context, LISTED_REQUESTS);
  service.refuse([REFUSED_REQUEST.Id]);

  // Settle the list first, so the ticks go onto rows that are really there.
  for (const reference of SELECTED_REFERENCES) {
    await expect(requestRow(page, reference)).toContainText(
      TRANSACTION_STATUS_IMPORTED,
    );
  }
  await expect(notifications(page)).toBeHidden();

  await bulkApprove(page, SELECTED_REFERENCES);
  await expect(tryAgain(page)).toBeVisible();

  return service;
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

test.describe('Epic bulk-approval-and-live-refresh, Story 3: when part of a bulk approval fails', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the identity it needs.
    await context.clearCookies();
  });

  // AC-5
  // The whole journey, in one browser: three requests approved together, the service
  // refusing one of them, the report that keeps the refusal apart from what was
  // actually recorded, and the retry that finishes the job once the service is back.
  test('a bulk approval with a refused call reports what could not be submitted, and trying again records the rest', async ({
    page,
    context,
  }) => {
    const service = await bulkApproveWithOneRefusal(page, context);

    /* ---- 1. What was recorded, and what was not ---- */

    // The two the service accepted have moved...
    await expect(requestRow(page, RECORDED_FIRST.Reference)).toContainText(
      TRANSACTION_STATUS_APPROVED,
    );
    await expect(requestRow(page, RECORDED_SECOND.Reference)).toContainText(
      TRANSACTION_STATUS_APPROVED,
    );
    // ...and the one it refused has not: it is still awaiting a decision, exactly as
    // before the batch. Nothing about it was changed by a call that never landed.
    await expect(requestRow(page, REFUSED_REQUEST.Reference)).toContainText(
      TRANSACTION_STATUS_IMPORTED,
    );

    /* ---- 2. The report keeps the two outcomes apart ---- */

    const report = notifications(page);
    await expect(report).toBeVisible();

    // Two approved — the count that came from re-reading the list, not from three
    // identical response envelopes. An implementation that trusted the call bodies
    // would say three here, while a row on screen still read Imported.
    await expect(
      report,
      'the approved count must come from comparing status before and after the ' +
        'batch (BR5) — never from the approve responses, which carry the same ' +
        'envelope whatever happened',
    ).toContainText(approved(2));

    // One could not be submitted, said in its own words: this is a failure, and it is
    // not the "already decided by a colleague" bucket (R10).
    await expect(report).toContainText(couldNotBeSubmitted(1));

    // And what it says about why is language, not plumbing (NFR-base-5).
    await expect(report).not.toContainText(CLIENT_PLACEHOLDER);

    /* ---- 3. The way to try again, once the service is back ---- */

    service.recover();
    await tryAgain(page).click();

    // Acting on the report takes it off the screen — a report still offering to retry
    // requests that have just been approved would misreport the list.
    await expect(tryAgain(page)).toBeHidden();

    // The one that failed is now recorded, and the list says so without a reload.
    await expect(requestRow(page, REFUSED_REQUEST.Reference)).toContainText(
      TRANSACTION_STATUS_APPROVED,
    );

    // The retry covered exactly that one request, and reports exactly that one.
    await expect(notifications(page)).toContainText(approved(1));

    // The two already approved were never touched by the retry — a second approval of
    // a request already decided is the thing BR11's re-check exists to prevent.
    await expect(requestRow(page, RECORDED_FIRST.Reference)).toContainText(
      TRANSACTION_STATUS_APPROVED,
    );
    await expect(requestRow(page, RECORDED_SECOND.Reference)).toContainText(
      TRANSACTION_STATUS_APPROVED,
    );
  });

  // Accessibility — the state no earlier scan can reach: this story's failed-batch
  // report, sitting over the list with an action in it. Real browser, so the report's
  // contrast against the surface behind it, its accessible name and whether its action
  // can be reached at all are all seen. No fake clock — axe is never run under faked
  // timers, and this report is the one that never fades anyway.
  test('the failed bulk-approval report has no accessibility violations', async ({
    page,
    context,
  }) => {
    await bulkApproveWithOneRefusal(page, context);

    // Scan once the report has settled and the list behind it has finished moving, so
    // the state under the scan is not a half-applied one.
    await expect(requestRow(page, REFUSED_REQUEST.Reference)).toContainText(
      TRANSACTION_STATUS_IMPORTED,
    );
    await expect(tryAgain(page)).toBeEnabled();

    await expectNoAccessibilityViolations(
      page,
      'the failed bulk-approval report open over the list',
    );
  });
});
