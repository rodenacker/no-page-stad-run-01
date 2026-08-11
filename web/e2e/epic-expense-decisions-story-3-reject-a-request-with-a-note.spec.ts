/**
 * Story Metadata:
 * - Epic: expense-decisions — Approve or reject a request
 * - Story: 3 — Reject a request with a note
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R2, R7, R9, R10, R11, R15, BR4, BR6, NFR1
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-5 (the WHOLE rejection is completable with the keyboard alone: reaching the
 *   action, writing the note, correcting a missing note, and confirming) → this file,
 *   as ONE journey. It is one criterion because the claim is about the sequence: a
 *   flow can be keyboard-reachable at every individual step and still be impossible
 *   to finish without a mouse.
 * - AC-1 (Reject asks for a note, Approve asks for none), AC-2 (blank or
 *   whitespace-only note refused with the exact wording, on submit rather than while
 *   typing, nothing recorded), AC-3 (the confirmation names the request and Cancel
 *   holds focus; cancelling records nothing) and AC-4 (confirming records the
 *   rejection, the note is shown with it, the decide actions are withdrawn, a
 *   confirmation message appears) → the Vitest layer at
 *   `web/src/__tests__/integration/epic-expense-decisions-story-3-reject-a-request-with-a-note.test.tsx`.
 *   Deliberately NOT duplicated here — this spec asserts only what a real browser and
 *   real keystrokes can prove.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running locally. The two boundaries epic 1
 * established are reused as-is; this spec adds no harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. Every protected screen is
 *    gated SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` (below), for this screen's two browser-side
 *    calls:
 *    - `GET /transactions-api/v1/transactions` — the list read (no query parameters;
 *      the endpoint returns the whole set and all narrowing is in memory).
 *    - `POST /api/decisions` — story 1's OWN route handler
 *      (`web/src/app/api/decisions/route.ts`), called from the browser through
 *      `web/src/lib/api/decisions.ts`. Mocking it at the browser boundary is what
 *      stops the decision leaving for the real transactions service: that handler runs
 *      inside the Next.js process, where `blockLiveBackends` cannot see its outbound
 *      call. An UNMOCKED decide call in this spec would be a live write.
 *
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(ROLE_APPROVER)`), seeded via `context.addCookies()` rather than
 *   by driving the sign-in form — epic 1 story 2's spec owns that journey, and the
 *   cookie is the app's sole conveyance of session. Cookies ignore port, so one seed
 *   serves the dev server (:3000) and the epic-end production run (:3100).
 * - Every response body comes from the project-wide factories under
 *   `web/src/mocks/data/` (`userInfoFor(role)`, `transactionWithStatus()`,
 *   `transactionDecided()`, `transactionListResponse()`, `rejectSuccessResponse()`),
 *   and the note itself is the factory's `REJECTION_NOTE` / `WHITESPACE_ONLY_NOTE`.
 *   No response shape and no note text is authored in this file, so this spec and the
 *   Vitest layer cannot drift on the contract.
 * - The Approver is the only role offered the decide actions (brief R14/BR7), so this
 *   spec signs in as `ROLE_APPROVER` throughout. That a Finance Uploader is offered
 *   neither action is story 2's AC-2, in Vitest.
 *
 * Implementation patterns this spec assumes (READ THESE BEFORE IMPLEMENTING — if the
 * implementation diverges from them, this spec will not pass):
 *
 * - **The decide call is made from the BROWSER**, through `lib/api/decisions.ts` to the
 *   app's own `POST /api/decisions` (story 1's target file). `page.route()` cannot
 *   intercept a fetch made by the Next.js server or by a Server Action — if the
 *   decision moves into a Server Action, this spec's mock is bypassed and the write
 *   leaves for the real transactions service. A 200 answer means "recorded"; the
 *   `DefaultResponse` envelope says nothing about the outcome by design (brief BR1).
 * - **The note the Approver typed travels in that call's body.** This spec reads the
 *   posted body as text and looks for the note in it, so any field name is fine — what
 *   is pinned is that the typed words reach the service rather than being accepted on
 *   screen and dropped.
 * - **Reject is reached through the per-request action overflow** — the Shadcn
 *   `dropdown-menu` `RequestActions.tsx` already renders on every row and card (its
 *   trigger names itself "Actions for request <reference>", matching
 *   `REQUEST_ACTIONS_NAME`), holding a menu item worded with "reject". That is the
 *   epic's own reuse note ("the home for this epic's per-request actions") and the
 *   mechanism story 5 of `expense-request-list` already pinned at both widths.
 * - **Label contract** (kept narrow, because the two steps must not be confusable):
 *     the action, and the control that sends it at BOTH steps → /reject/i
 *     the note field's own label                              → /note|reason/i
 *     the dismiss choice on the confirmation                  → /cancel/i
 *   BR6 words the confirmation "Reject request TXN-…?" and story 2's checklist words
 *   the dismissal "Cancel", so both are quoted rather than guessed.
 * - **Two steps, in this order**: choosing Reject asks for the note; sending THAT asks
 *   for confirmation. Both are modal boxes over the list (the surface already opens a
 *   request that way), and this spec tells them apart by what each CONTAINS rather than
 *   by a fixed role — so a Shadcn `dialog` for the note with the epic's `alert-dialog`
 *   for the confirmation, or one dialog that swaps its contents, both satisfy it.
 *   Radix reports the two primitives as `dialog` and `alertdialog`, and Playwright
 *   matches roles exactly, which is why neither is pinned.
 * - **The send control is ENABLED while the note is empty.** BR4 is checked on SUBMIT,
 *   not on keystroke (the project's validation-timing convention, requirements §6.3),
 *   so the refusal has to be reachable by pressing the control with nothing typed. A
 *   control disabled until the note is non-empty cannot take keyboard focus at all,
 *   and this spec fails on it — deliberately.
 * - **Cancel holds initial focus on the confirmation** (NFR2), even though an editable
 *   field appeared earlier in the flow. That is the one place this epic overrides the
 *   project's usual "first editable field takes focus" rule.
 * - The refusal wording is verbatim from the brief (R9/BR4) and is asserted inside the
 *   note step's own container rather than through `getByRole('alert')`: Next renders a
 *   permanently empty body-level `role="alert"` route announcer, so an unscoped alert
 *   query always matches two elements.
 * - **The list behind an OPEN modal cannot be addressed by role.** Radix marks
 *   everything outside the open dialog `aria-hidden="true"` — including the app shell
 *   wrapper that holds `<main>` — so while the note step is up, `getByRole('main')`
 *   correctly matches nothing, however untouched the list is. That is a property of the
 *   dialog, not of the app's data. So "nothing was recorded" is asserted here in two
 *   ways that are both valid with a modal open: no decide call left the browser at all
 *   ({@link DecisionCall.timesSent}) — the ONLY way a decision can be recorded — and the
 *   row itself, read through the DOM ({@link rowBehindTheModal}) rather than through the
 *   accessibility tree, still reads as awaiting a decision. Once no modal is open, the
 *   list is addressed by role again ({@link requestRow}), as everywhere else.
 * - Cookie assumptions: the mock `session` cookie carries production-like attributes
 *   (HttpOnly, SameSite=Strict). `Secure` is omitted because the E2E server is plain
 *   http on localhost; the real cookie's full attribute set is asserted in the Vitest
 *   layer (epic 1, story 1).
 *
 * ACCESSIBILITY: the two states this story ADDS to `/requests` — the note step showing
 * its refusal, and the confirmation — are scanned in the real browser inside the
 * journey below. The settled list screen itself is already scanned by
 * `expense-request-list` story 4, so it is not re-scanned here.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — `/requests` offers
 * no Reject action at all today, so the journey stops at its first step.
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER } from '../src/mocks/data/role';
import {
  REJECTION_NOTE,
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_REJECTED,
  TRANSACTION_TYPE_DEBIT_CODE,
  WHITESPACE_ONLY_NOTE,
  rejectSuccessResponse,
  transactionDecided,
  transactionListResponse,
  transactionWithStatus,
} from '../src/mocks/data/transaction';

import type { TransactionRead } from '../src/mocks/data/transaction';
import type { BrowserContext, Locator, Page } from '@playwright/test';

/** This story's screen. */
const REQUESTS_ROUTE = '/requests';

/**
 * The exact refusal an empty or whitespace-only note must produce, quoted verbatim
 * from the brief (R9 / BR4). Wording is the requirement here, not a developer choice,
 * which is why it is pinned to the character rather than to a pattern.
 */
const MISSING_NOTE_REFUSAL =
  'Add a note explaining why this request is rejected.';

/**
 * How this story's controls read to a user. See the header's label contract — these
 * are quoted from the brief's own wording (BR6) rather than invented, and kept narrow
 * so the note step and the confirmation can never be confused for one another.
 */
const REJECT_NAME = /reject/i;
const NOTE_FIELD_NAME = /note|reason/i;
const CANCEL_NAME = /cancel/i;

/** The per-request action overflow `RequestActions.tsx` already renders on every row. */
const REQUEST_ACTIONS_NAME = /(action|more|option|menu)/i;

/**
 * WCAG 2.2 AA — this project's effective accessibility bar
 * (`documentation/requirements-application.md` §6.6.5, recorded in project.md
 * §Baseline NFRs as superseding the template's 2.1 AA floor). The identical tag set
 * every earlier epic's scans used. Scoped explicitly because axe's defaults also run
 * best-practice rules, which would fail this spec on issues outside the agreed bar.
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
 * The request this journey rejects, and a second one beside it so the list is a real
 * list rather than a single row.
 *
 * Both are still `Imported` — the only status the decide actions are offered for
 * (brief BR3) — and they differ in account number, amount and date, so the pair can
 * never be marked as possible duplicates (that mark, and the Approver-only
 * notification it raises on load, belong to `expense-request-list` and would otherwise
 * put an unrelated notification on screen the moment an Approver lands here).
 *
 * Their references carry a date segment the factory's generated sets never produce, so
 * each row can be found by its own reference rather than by position.
 */
const REQUEST_TO_REJECT = transactionWithStatus(TRANSACTION_STATUS_IMPORTED, {
  Id: 7601,
  Reference: 'TXN-20260430-0601',
  AccountNumber: '2044-8871-3390',
  Description: 'Conference travel - Cape Town',
  Amount: 4820.5,
  TransactionDate: '2026-04-30 09:14:00',
  TransactionType: TRANSACTION_TYPE_DEBIT_CODE,
});

const OTHER_REQUEST = transactionWithStatus(TRANSACTION_STATUS_IMPORTED, {
  Id: 7602,
  Reference: 'TXN-20260430-0602',
  AccountNumber: '5589-3374-9902',
  Description: 'Client lunch - Rosebank',
  Amount: 615.25,
  TransactionDate: '2026-04-29 12:40:00',
  TransactionType: TRANSACTION_TYPE_DEBIT_CODE,
});

/** The same request as a fresh read returns it once the rejection has been recorded. */
const REJECTED_REQUEST = transactionDecided(REQUEST_TO_REJECT, {
  status: TRANSACTION_STATUS_REJECTED,
  note: REJECTION_NOTE,
});

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/** Story 1's decide endpoint, as the browser addresses it. */
const DECISIONS_ENDPOINT_GLOB = '**/api/decisions**';

const jsonResponse = (
  body: unknown,
): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/**
 * Blocks the live services (see LIVE_BACKEND_ORIGINS). Registered LAST in each test,
 * because Playwright matches the most recently registered route first: that way a call
 * sent to a service's own origin is aborted and fails visibly, instead of being quietly
 * answered by the origin-agnostic mocks above it.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Answers this screen's browser-side read of the expense requests from whatever the
 * feed currently holds, so a decision recorded mid-test changes what a re-read returns.
 * The glob names no origin, so it matches whichever port the app is served on (:3000 in
 * dev, :3100 in the epic-end production run).
 */
const mockTransactionList = async (
  page: Page,
  served: () => TransactionRead[],
): Promise<void> => {
  await page.route('**/transactions-api/v1/transactions**', (route) =>
    route.fulfill(jsonResponse(transactionListResponse(served()))),
  );
};

/** What the browser sent when it recorded a decision. */
interface DecisionCall {
  /** The raw body of the decide call, or `null` if no decision has been sent yet. */
  bodySent: () => string | null;
  /**
   * How many decisions have left the browser so far.
   *
   * This call is the only way a decision can be RECORDED (brief BR1), so `0` is the
   * strictest available form of "nothing was recorded" — and unlike reading the list,
   * it can be asserted while a modal is open (see the header's Radix note).
   */
  timesSent: () => number;
}

/**
 * Answers story 1's decide endpoint with a success, and lets a test say what the
 * service does as a consequence (`onDecided` changes what a fresh list read returns).
 *
 * Registered in EVERY test, including before any decision is taken: this is the only
 * call in this story that changes data, and an unmocked one is forwarded to the live
 * transactions service by the app's own route handler, from inside the Next.js process
 * where `blockLiveBackends` cannot see it.
 */
const mockDecisionEndpoint = async (
  page: Page,
  { onDecided }: { onDecided?: () => void } = {},
): Promise<DecisionCall> => {
  let bodySent: string | null = null;
  let timesSent = 0;

  await page.route(DECISIONS_ENDPOINT_GLOB, (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      // Nothing in this story addresses this path with another method; letting one
      // through would forward it to the live transactions service.
      return route.abort();
    }
    bodySent = request.postData();
    timesSent += 1;
    onDecided?.();
    return route.fulfill(
      jsonResponse(rejectSuccessResponse(REQUEST_TO_REJECT.Id)),
    );
  });

  return { bodySent: () => bodySent, timesSent: () => timesSent };
};

/**
 * Puts the browser in a signed-in state as the named role, without a real credential:
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

/**
 * Answers a BROWSER-side identity read from the shared userinfo source, so it can never
 * disagree with what the Node-side stub returns for the same session.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(userInfoFor(roleName))),
  );
};

/** One request's row, found by its own reference — never by position. */
const requestRow = (page: Page, reference: string): Locator =>
  page.getByRole('main').getByRole('row').filter({ hasText: reference });

/**
 * The same row, while a modal is open over the list.
 *
 * {@link requestRow} reads the accessibility tree, and Radix takes the whole page
 * behind an open dialog OUT of that tree (`aria-hidden="true"` on the app shell wrapper
 * around `<main>`) — so it matches nothing while the note step is up, whatever the list
 * says. This reads the DOM instead, where the row is still there to be read, so the
 * claim "the request was left exactly as it was" can be made at the moment it matters:
 * with the refusal on screen. Still found by the request's own reference, never by
 * position; `tr` is the list's row element and the narrow-width cards are not a table,
 * so this cannot match a request twice.
 */
const rowBehindTheModal = (page: Page, reference: string): Locator =>
  page.locator('main tr').filter({ hasText: reference });

/**
 * The note field, found by its own label rather than through whatever container it is
 * put in — so it can be located before that container has been identified, which is
 * what {@link noteStep} then uses it for. It cannot collide with the list's own
 * free-text search, which is a `searchbox` named for searching.
 */
const noteField = (page: Page): Locator =>
  page.getByRole('textbox', { name: NOTE_FIELD_NAME });

/**
 * Either kind of modal box. Radix reports a plain `Dialog` as `dialog` and an
 * `AlertDialog` as `alertdialog`, and Playwright matches roles exactly — so a spec that
 * pinned one would fail the story for a choice it was free to make.
 */
const anyDialog = (page: Page): Locator =>
  page.getByRole('dialog').or(page.getByRole('alertdialog'));

/** The step that asks for the note: whichever box the note field is sitting in. */
const noteStep = (page: Page): Locator =>
  anyDialog(page).filter({ has: noteField(page) });

/**
 * The confirmation step: the box that holds no editable field. That is what separates
 * it from the note step whether the implementation opens a second dialog over the first
 * or swaps the contents of one — and either is a legitimate reading of AC-3.
 */
const confirmation = (page: Page): Locator =>
  anyDialog(page).filter({ hasNot: page.getByRole('textbox') });

/** How a control reads to a user, for readable failure output. */
const labelOf = (control: Locator): Promise<string> =>
  control.evaluate(
    (element) =>
      (
        element.getAttribute('aria-label') ??
        element.textContent ??
        ''
      ).trim() || element.tagName.toLowerCase(),
  );

/**
 * Presses `key` until the control has keyboard focus. Throws (failing the test with a
 * plain-English reason) when the control cannot be reached — that throw IS the
 * keyboard-reachability assertion, and it is what NFR1 comes down to at each step. The
 * same helper epic 1 story 3 and the request-list epic's story 4 use.
 */
const pressUntilFocused = async (
  page: Page,
  key: string,
  control: Locator,
  maxPresses = 200,
): Promise<void> => {
  for (let press = 0; press <= maxPresses; press += 1) {
    const focused = await control.evaluate(
      (element) => element === document.activeElement,
    );
    if (focused) {
      return;
    }
    await page.keyboard.press(key);
  }
  throw new Error(
    `"${await labelOf(control)}" could not be reached with ${String(maxPresses)} ` +
      `"${key}" presses, so the rejection cannot be completed by keyboard alone (NFR1, AC-5).`,
  );
};

/**
 * Walks to a control and operates it with Enter — the whole of "using a control without
 * a mouse". Space is equivalent on a button and on a Radix menu trigger; Enter is used
 * throughout so one failure never has to be told apart from the other.
 */
const operateByKeyboard = async (
  page: Page,
  control: Locator,
  key = 'Tab',
): Promise<void> => {
  await expect(
    control,
    `"${await labelOf(control)}" is disabled, so keyboard focus can never reach it ` +
      `and the step cannot be completed without a mouse (NFR1)`,
  ).toBeEnabled();
  await pressUntilFocused(page, key, control);
  await page.keyboard.press('Enter');
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
        `${violation.id}: ${violation.help} (${String(violation.nodes.length)} node/s)`,
    ),
    `WCAG 2.2 AA violations while rejecting a request (${state})`,
  ).toEqual([]);
};

test.describe('Epic expense-decisions, Story 3: reject a request with a note', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-5
  // ONE journey, start to finish, on a real keyboard: reaching the action inside the
  // per-request overflow, sending the rejection with nothing written, being refused,
  // correcting that from the keyboard, and confirming — with the confirmation's Cancel
  // holding focus on arrival (NFR2). Split into separate tests it would prove only that
  // each step is reachable in isolation, which is not what NFR1 claims.
  test('the whole rejection — reaching the action, writing the note, correcting a missing note and confirming — is completable with the keyboard alone', async ({
    page,
    context,
  }) => {
    let served: TransactionRead[] = [REQUEST_TO_REJECT, OTHER_REQUEST];

    await mockTransactionList(page, () => served);
    const decision = await mockDecisionEndpoint(page, {
      onDecided: () => {
        served = [REJECTED_REQUEST, OTHER_REQUEST];
      },
    });
    await mockBrowserIdentityCall(page, ROLE_APPROVER);
    await seedSession(context, ROLE_APPROVER);
    await blockLiveBackends(page);

    await page.goto(REQUESTS_ROUTE);

    const targetRow = requestRow(page, REQUEST_TO_REJECT.Reference);
    await expect(targetRow).toContainText(TRANSACTION_STATUS_IMPORTED);

    // ---- 1. Reaching the action. Tab to the request's own action overflow, open it,
    // and arrow down to Reject — never a pointer.
    await operateByKeyboard(
      page,
      targetRow.getByRole('button', { name: REQUEST_ACTIONS_NAME }),
    );

    // Radix portals its menu out of the row, so it is addressed on its own.
    const rejectAction = page
      .getByRole('menu')
      .getByRole('menuitem', { name: REJECT_NAME });
    await expect(
      rejectAction,
      'a request still awaiting a decision offers an Approver no Reject action, so the ' +
        'journey has nowhere to start (R2/BR3)',
    ).toBeVisible();
    await operateByKeyboard(page, rejectAction, 'ArrowDown');

    // ---- 2. The note is asked for, before anything is recorded.
    const note = noteField(page);
    await expect(
      note,
      'choosing Reject recorded a decision without ever asking for a note (R7/R9)',
    ).toBeVisible();

    const step = noteStep(page);
    const sendRejection = step.getByRole('button', { name: REJECT_NAME });
    /** The list underneath, addressed the one way that works with a modal open. */
    const rowUnderTheStep = rowBehindTheModal(
      page,
      REQUEST_TO_REJECT.Reference,
    );

    // ---- 3. Sent with nothing written: refused, in the brief's own words, and the
    // request is left exactly as it was.
    await operateByKeyboard(page, sendRejection);
    await expect(
      step,
      'a rejection sent with an empty note was not refused with the wording R9/BR4 ' +
        'requires — check it is validated on SUBMIT, not on keystroke',
    ).toContainText(MISSING_NOTE_REFUSAL);
    // Nothing was recorded — asserted at both ends: no decision left the browser, and
    // the request behind the refusal still reads as awaiting one.
    expect(
      decision.timesSent(),
      'the request was decided even though its note was empty — no decision may be ' +
        'sent until a note is written (R7/BR4)',
    ).toBe(0);
    await expect(
      rowUnderTheStep,
      'the request changed while its note was empty — nothing may be recorded until a ' +
        'note is written (R7/BR4)',
    ).toContainText(TRANSACTION_STATUS_IMPORTED);

    // ---- 4. Corrected the way a keyboard user corrects it — and spaces are no more a
    // note than nothing at all (BR4: "empty or whitespace-only").
    await pressUntilFocused(page, 'Tab', note);
    await page.keyboard.type(WHITESPACE_ONLY_NOTE);
    await operateByKeyboard(page, sendRejection);
    await expect(
      step,
      'a note made only of spaces was accepted as a reason (BR4)',
    ).toContainText(MISSING_NOTE_REFUSAL);
    expect(
      decision.timesSent(),
      'a note made only of spaces was sent on as a reason (BR4)',
    ).toBe(0);
    await expect(rowUnderTheStep).toContainText(TRANSACTION_STATUS_IMPORTED);

    // The refused state is one this story ADDS to the screen, so it is scanned here
    // rather than only in its happy state — violations are usually state-specific.
    await expectNoAccessibilityViolations(page, 'the note step, refused');

    // ---- 5. The real note, cleared and typed from the keyboard alone.
    await pressUntilFocused(page, 'Tab', note);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(REJECTION_NOTE);
    await expect(
      note,
      'the note field did not take the typed reason, so it cannot be written without a mouse',
    ).toHaveValue(REJECTION_NOTE);

    await operateByKeyboard(page, sendRejection);

    // ---- 6. The confirmation: it names the request and says what is about to happen,
    // and the safe choice already holds focus, so Enter on arrival changes nothing.
    const confirmStep = confirmation(page);
    await expect(
      confirmStep,
      'a note was written but no confirmation was asked for (R10/BR6)',
    ).toBeVisible();
    await expect(confirmStep).toContainText(REQUEST_TO_REJECT.Reference);
    await expect(confirmStep).toContainText(REJECT_NAME);
    await expect(
      confirmStep.getByRole('button', { name: CANCEL_NAME }),
      'Cancel does not hold initial focus on the confirmation (NFR2) — this dialog ' +
        'overrides the project rule that the first editable field takes focus',
    ).toBeFocused();

    await expectNoAccessibilityViolations(page, 'the confirmation, open');

    // ---- 7. Confirmed from the keyboard, and the rejection is recorded.
    await operateByKeyboard(
      page,
      confirmStep.getByRole('button', { name: REJECT_NAME }),
    );

    await expect(
      targetRow,
      'the confirmed rejection never reached the request — the whole point of AC-5 is ' +
        'that this journey FINISHES without a mouse',
    ).toContainText(TRANSACTION_STATUS_REJECTED);

    // ...and the words the Approver typed are the words that were sent, rather than
    // being accepted on screen and dropped on the way out.
    expect(
      decision.bodySent(),
      'the rejection was sent without the note the Approver typed (R2/R7)',
    ).toContain(REJECTION_NOTE);
  });
});
