/**
 * Story Metadata:
 * - Epic: bulk-approval-and-live-refresh — Bulk approval and a self-updating list
 * - Story: 2 — Approve the whole selection at once
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R1, R5, R8, R9, BR1–BR5, NFR1, NFR3, NFR4 (+ project.md
 *   NFR-base-1, at this project's WCAG 2.2 AA bar)
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-5 (in the browser, selecting several requests and confirming records every one
 *   of them, and the list then shows the recorded statuses without a manual reload) →
 *   this file. It belongs here and nowhere else: it is the whole round trip — a real
 *   selection, a real confirmation, N real calls out of the browser, and the rows
 *   updating themselves afterwards — which is exactly what jsdom cannot witness.
 * - AC-1 (the confirmation names the exact count in full, the way out holds focus, and
 *   backing out changes nothing), AC-2 (confirming approves every still-Imported
 *   selected request), AC-3 (a request a colleague decided is never submitted, and the
 *   outcome says how many were approved and how many were left unchanged), AC-4 (the
 *   list stays readable while the selection and bulk controls cannot be used) and AC-6
 *   (the batch is issued a few at a time, not all at once) are the Vitest layer's, at
 *   `web/src/__tests__/integration/epic-bulk-approval-and-live-refresh-story-2-approve-the-whole-selection.test.tsx`.
 *   Deliberately NOT repeated here — where this spec has to pass through the
 *   confirmation to reach the outcome, it does so as a step, not as an assertion.
 * - One accessibility scan is here: the OPEN bulk-approve confirmation, over a list
 *   with a live selection. The `/requests` page-level scan belongs to
 *   `expense-request-list` story 4, and `expense-decisions` story 2 scanned the
 *   PER-REQUEST confirmation — neither reaches this state, which exists only for an
 *   Approver, only once several requests are ticked, and only after the bulk control
 *   is used (testing-policy.md § Accessibility: scan each distinct state the story
 *   introduces).
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * This spec never contacts a live backend and never uses a real credential
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running on this machine. Two boundaries, one
 * contract — the arrangement epics 1-5 established, reused rather than re-invented:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. `/requests` is gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie value seeded below — which
 *    is also what makes the person here an Approver, the only role offered any of this.
 * 2. Browser boundary → `page.route()` below:
 *      GET  /transactions-api/v1/transactions   (the first read, the pre-submit
 *                                                re-check, and the reconciliation read)
 *      POST /api/decisions                      (`expense-decisions` story 1's own
 *                                                decide endpoint — one call per request)
 *    Both are the app's OWN same-origin addresses, so an unmocked call is forwarded to
 *    the live transactions service by a route handler INSIDE the Next.js process, where
 *    the live-origin block cannot see it — which is why the decide endpoint is mocked
 *    in every test here, including the one that never confirms anything. A catch-all
 *    aborts anything else under `/transactions-api/**`, and the real services' own
 *    origins are blocked outright, registered LAST so they win over the origin-agnostic
 *    globs above them.
 *
 * THE MOCKED SERVICE HERE KEEPS STATE, and that is the point of this spec. It does not
 * answer the list with a fixed "after" snapshot: it answers with the list as it stands
 * given the approvals it has actually been sent, built by feeding those ids through
 * `transactionsAfterApproving()`. So a request reads Approved afterwards ONLY if this
 * browser really sent an approve call for it — an implementation that approves the
 * wrong rows, skips rows, or reports success off the call bodies (which cannot carry
 * that distinction, brief BR5) cannot make the assertions below pass. Nothing here
 * counts calls; what the service ends up holding is the evidence.
 *
 * Every response body comes from the project-wide factories under `web/src/mocks/data/`
 * (`transaction.ts`, `identity.ts`, `role.ts`) — no response shape and no canonical
 * value is authored in this file, so this spec and the Vitest layer cannot drift on the
 * contract.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - Each approval is sent FROM THE BROWSER to the app's own `/api/decisions` route
 *   (`web/src/lib/api/decisions.ts` → `recordDecision`, on the shared API client), one
 *   call per request (BR3). `page.route()` cannot intercept a fetch made by the Next.js
 *   server or by a Server Action — moving the batch into one bypasses these mocks and
 *   sends real approvals to the live transactions service. This spec asserts nothing
 *   about a call's shape (`TransactionId` in the query, the server-populated
 *   `LastChangedUser` header): that is `expense-decisions` story 1's Vitest layer.
 * - The pre-submit re-check (BR2) and the reconciliation read (BR5) are both
 *   `GET /v1/transactions` through `fetchTransactions()`, from the browser — no new
 *   endpoint, no single-request GET, no direct `fetch`.
 * - The per-request selection control is a CHECKBOX on the request's own row, and its
 *   accessible name carries the request's `Reference`, as every per-request control on
 *   this screen already does ("Open request TXN-…", "Approve request TXN-…"). That is
 *   what lets one row's control be addressed while every other listed request carries
 *   one too — and it is story 1's to build.
 * - The bulk action is a control in the LIST'S OWN TOOLBAR whose accessible name says
 *   it acts on the selection (matched loosely below: "approve" … "selected"), so it can
 *   never be confused with a row's own "Approve request TXN-…".
 * - The confirmation is the project's ONE confirmation, `ConfirmAction`
 *   (`web/src/components/common/ConfirmAction.tsx`), built on the Shadcn
 *   `alert-dialog` — which Radix renders as `role="alertdialog"`, PORTALLED to the
 *   body. So dialog queries are scoped to the dialog itself, never to `main`. Its way
 *   out and its confirming choice must not read alike (the existing convention:
 *   "Cancel" backs out).
 * - The outcome is raised on the root layout's EXISTING toast machinery
 *   (`ToastProvider` / `ToastContainer` / `useToast()`), which renders one
 *   `role="region"` named "Notifications" — no second notification surface and no
 *   bespoke banner inside the list.
 *
 * QUERYING THE NOTIFICATION — the trap this spec avoids on purpose: it is found through
 * `getByRole('region', { name: /notifications/i })`, the surface's own accessible name
 * (the same handle the Vitest layer uses), NOT through `getByRole('alert')`. Next
 * renders a permanently empty body-level `role="alert"` route announcer, so an unscoped
 * alert query always matches two elements, and a toast's own role legitimately varies
 * with its variant. The notification also renders OUTSIDE `main`, so scoping it there
 * would find nothing. Everything about the LIST is scoped to `main`.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie (epic 1
 * BR2), seeded directly rather than by driving the sign-in form — epic 1's story 2 spec
 * owns that journey. Cookies ignore port, so one seed serves the dev server (:3000) and
 * the epic-end production run (:3100). `Secure` is omitted because the E2E server is
 * plain http on localhost.
 *
 * No clock is installed and nothing waits real time: every assertion below is a web-first
 * `expect`, which auto-waits. The outcome notification is asserted before the rows
 * precisely because it is the one thing on screen with a lifetime.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): today `/requests`
 * offers no way to select a request and no bulk action at all.
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
 * The decide endpoint on the app's own origin — the only address an approval is ever
 * sent to from the browser (`expense-decisions` story 1). Mocked in every test:
 * unmocked, the Next.js route handler behind it forwards the approval to the live
 * transactions service.
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
 * The bulk action in the list's own toolbar. Deliberately loose on the wording but
 * strict on the shape: it must say it acts on the SELECTION, which is what tells it
 * apart from a row's own "Approve request TXN-…" — and leaves the developer free to
 * name it "Approve selected requests" or "Approve 3 selected requests".
 */
const BULK_APPROVE_NAME = /approve[\s\S]*selected/i;

/** The confirming choice inside the confirmation; the way out is "Cancel". */
const CONFIRM_APPROVE_NAME = /approve/i;

/** The way out of the confirmation, which holds focus when it opens (UI-09/NFR1). */
const WAY_OUT_NAME = /cancel|keep|back/i;

/**
 * How the outcome reads. Loose on the sentence — the exact "N approved, M left
 * unchanged" wording is AC-3's business in the Vitest layer — but it must be about an
 * approval, and it must carry the number of requests this test approved.
 */
const APPROVED_WORDING = /approv/i;
const countIn = (howMany: number): RegExp =>
  new RegExp(`\\b${String(howMany)}\\b`);

/**
 * A window value that a full page load would wipe. It is how "without a manual reload"
 * (AC-5) is observed rather than assumed: the rows below must come to read Approved on
 * the very page load that sent the approvals.
 */
const PAGE_LOAD_MARKER = '__bulkApprovalSpecPageLoadMarker';

/**
 * The list this spec starts from: several requests still awaiting a decision, plus one
 * already Approved and one already Rejected (which is the fixture's point — a set of
 * nothing but selectable rows could not tell a correct implementation from one that
 * offers a tick on everything).
 */
const BEFORE = transactionsForBulkSelection();

/** The requests that can be selected at all — found by status, never by position. */
const awaitingDecisionIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status === TRANSACTION_STATUS_IMPORTED);

const AWAITING_DECISION = awaitingDecisionIn(BEFORE);

if (AWAITING_DECISION.length < 4) {
  throw new Error(
    'This spec needs at least four requests awaiting a decision — three to select ' +
      'and one to leave alone — but transactionsForBulkSelection() returned ' +
      `${String(AWAITING_DECISION.length)}. See web/src/mocks/data/transaction.ts.`,
  );
}

/** The three requests this spec selects and approves together. */
const SELECTED = AWAITING_DECISION.slice(0, 3);

/**
 * A fourth request, awaiting a decision and deliberately NOT selected. It is what makes
 * "every one of them" mean the selection and only the selection: a batch that approved
 * whatever it could reach would leave this one Approved too.
 */
const LEFT_UNSELECTED = AWAITING_DECISION[3];

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
 * server-side and another in the browser would mean two different sets of controls.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(userInfoFor(roleName))),
  );
};

/** The `TransactionId` an approval was sent for, or `undefined` if it carried none. */
const transactionIdIn = (body: unknown): number | undefined => {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const sent = (body as Record<string, unknown>).TransactionId;
  return typeof sent === 'number' ? sent : undefined;
};

/**
 * The mocked transactions service: it serves the request list, and it records the
 * approvals this browser sends it.
 *
 * The list it answers with is always `BEFORE` plus whatever has actually been approved
 * so far — so the pre-submit re-check (BR2), the reconciliation read (BR5) and every
 * later read are all one honest view of a service that moved on because of what the app
 * did, rather than three hand-authored snapshots handed out in a fixed order. It also
 * means no read has to be "the third one": the app may legitimately read the list more
 * than once for a single on-screen state, and a queue would silently skip a state.
 *
 * The `/transactions-api/**` catch-all is registered FIRST so it loses to the specific
 * read (Playwright matches the most recently registered route first): any other call
 * under the app's transactions mount is aborted rather than forwarded to the live
 * service by the app's own proxy.
 */
const serveTransactionsService = async (
  page: Page,
  requests: TransactionRead[],
): Promise<void> => {
  const approved: number[] = [];

  await page.route(TRANSACTIONS_API_GLOB, (route) => route.abort());
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(
      jsonResponse(
        transactionListResponse(transactionsAfterApproving(requests, approved)),
      ),
    ),
  );

  await page.route(DECISIONS_URL_GLOB, (route) => {
    const sent: unknown = route.request().postDataJSON();
    const transactionId = transactionIdIn(sent);
    const known =
      transactionId !== undefined &&
      requests.some((request) => request.Id === transactionId);

    // Recorded only for a request this service actually holds, and only once — a
    // second call for the same request is the no-op the real service performs, and
    // it answers with the very same envelope (brief BR5).
    if (
      known &&
      transactionId !== undefined &&
      !approved.includes(transactionId)
    ) {
      approved.push(transactionId);
    }

    return route.fulfill(
      jsonResponse(approveSuccessResponse(transactionId ?? 0)),
    );
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

/** Ticks one request's own selection control and waits for it to register. */
const selectRequest = async (page: Page, reference: string): Promise<void> => {
  const control = requestRow(page, reference).getByRole('checkbox', {
    name: new RegExp(reference, 'i'),
  });
  await control.check();
  await expect(control).toBeChecked();
};

/**
 * Asks to approve the whole selection and answers the confirmation — a step, not an
 * assertion: that the confirmation names the exact count in full and holds focus on the
 * way out is AC-1's, in the Vitest layer.
 */
const openBulkApproveConfirmation = async (page: Page): Promise<Locator> => {
  await screenOf(page).getByRole('button', { name: BULK_APPROVE_NAME }).click();

  const dialog = confirmation(page);
  await expect(dialog).toBeVisible();
  return dialog;
};

/** Marks this page load, so a later reload can be told from a live update. */
const markThisPageLoad = async (page: Page): Promise<void> => {
  await page.evaluate((key) => {
    (window as unknown as Record<string, unknown>)[key] = true;
  }, PAGE_LOAD_MARKER);
};

/** Whether the browser is still on the page load that was marked. */
const isSamePageLoad = (page: Page): Promise<boolean> =>
  page.evaluate(
    (key) => (window as unknown as Record<string, unknown>)[key] === true,
    PAGE_LOAD_MARKER,
  );

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

/** Signs in as an Approver on a list served by the stateful mocked service. */
const openRequestsAsApprover = async (
  page: Page,
  context: BrowserContext,
): Promise<void> => {
  await serveTransactionsService(page, BEFORE);
  await mockBrowserIdentityCall(page, ROLE_APPROVER);
  await blockLiveBackends(page);
  await seedSession(context, ROLE_APPROVER);

  await page.goto(REQUESTS_PATH);
};

test.describe('Epic bulk-approval-and-live-refresh, Story 2: approve the whole selection', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the identity it needs.
    await context.clearCookies();
  });

  // AC-5
  // The whole round trip in one browser: three requests ticked, one confirmation, three
  // approvals really sent out of the browser, and the rows reading their new statuses
  // afterwards on the same page load. The mocked service only reports a request as
  // Approved if this browser sent an approval for it, so this cannot pass on a batch
  // that approved the wrong rows or reported success without calling anything.
  test('selecting several requests and confirming records every one of them, and the list then shows the recorded statuses without a reload', async ({
    page,
    context,
  }) => {
    await openRequestsAsApprover(page, context);

    // The list has arrived and nothing has been decided yet, so every status below is
    // one this test's own action produced.
    for (const request of [...SELECTED, LEFT_UNSELECTED]) {
      await expect(requestRow(page, request.Reference)).toContainText(
        TRANSACTION_STATUS_IMPORTED,
      );
    }
    await expect(notifications(page)).toBeHidden();

    // Remember this page load, so "without a manual reload" is observed rather than
    // assumed once the statuses change.
    await markThisPageLoad(page);

    /* ---- Select three requests, and leave a fourth alone ---- */

    for (const request of SELECTED) {
      await selectRequest(page, request.Reference);
    }

    /* ---- Approve the whole selection in one action ---- */

    const dialog = await openBulkApproveConfirmation(page);
    await dialog.getByRole('button', { name: CONFIRM_APPROVE_NAME }).click();
    await expect(
      dialog,
      'the confirmation must close once the approvals are on their way — the outcome ' +
        'is reported on the screen behind it, not inside a dialog the Approver is ' +
        'left sitting in',
    ).toBeHidden();

    /* ---- The outcome, and then the list itself ---- */

    // Asserted first because it is the one thing on screen with a lifetime (the
    // outcome confirmation clears itself after a few seconds).
    const outcome = notifications(page);
    await expect(outcome).toBeVisible();
    await expect(outcome).toContainText(APPROVED_WORDING);
    await expect(
      outcome,
      'the outcome must say how many requests were approved (R5) — the whole ' +
        'selection, in this case',
    ).toContainText(countIn(SELECTED.length));

    // Every selected request now reads Approved, which the mocked service reports only
    // for the requests it was actually sent an approval for (R1/BR3).
    for (const request of SELECTED) {
      await expect(requestRow(page, request.Reference)).toContainText(
        TRANSACTION_STATUS_APPROVED,
      );
    }

    // And the request that was never ticked is untouched — "the whole selection" is
    // also "no more than the selection" (R2).
    await expect(
      requestRow(page, LEFT_UNSELECTED.Reference),
      'a request that was not selected must never be approved by a bulk action',
    ).toContainText(TRANSACTION_STATUS_IMPORTED);

    // All of that happened on the page load that sent the approvals: nothing navigated
    // and nobody reloaded anything (AC-5).
    expect(
      await isSamePageLoad(page),
      'the recorded statuses must appear on the same page load — the list re-reads ' +
        'itself after the batch (BR5); it must not reload the page',
    ).toBe(true);
  });

  // Accessibility — the one state no earlier scan can reach: this story's bulk
  // confirmation, open over a list with a live selection, for the only role that is
  // offered any of it. Real browser, so the overlay's contrast, the dialog's accessible
  // name, the ticked rows underneath and where focus sits are all seen.
  test('the open bulk-approve confirmation has no accessibility violations', async ({
    page,
    context,
  }) => {
    await openRequestsAsApprover(page, context);

    // Settle the list first, so the scan is not racing a loading placeholder.
    await expect(requestRow(page, SELECTED[0].Reference)).toContainText(
      TRANSACTION_STATUS_IMPORTED,
    );

    for (const request of SELECTED) {
      await selectRequest(page, request.Reference);
    }

    const dialog = await openBulkApproveConfirmation(page);

    // Scan once the confirmation's choices are there to be operated, so the state under
    // the scan is the settled one. Nothing is confirmed — no approval is sent.
    await expect(
      dialog.getByRole('button', { name: CONFIRM_APPROVE_NAME }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: WAY_OUT_NAME }),
    ).toBeVisible();

    await expectNoAccessibilityViolations(
      page,
      'the bulk-approve confirmation open over a list with three requests selected',
    );
  });
});
