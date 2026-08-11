/**
 * Story Metadata:
 * - Epic: expense-decisions — Story 2: approve an imported request
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — an Approver is offered Approve and Reject on a request still awaiting
 *   a decision, whatever its amount;
 * - AC-2 — neither action appears anywhere for a Finance Uploader (the auth
 *   service's `Importer`), nor on a request that has already been decided;
 * - AC-3 — choosing Approve asks for confirmation, naming the request by its
 *   reference and showing no account number in full, and cancelling leaves the
 *   request exactly as it was;
 * - AC-4 — confirming records the approval: the request reads Approved, its
 *   decide actions are withdrawn, and a confirmation message is shown;
 * - AC-6 — a decision that cannot be recorded leaves the request as it was and
 *   tells the Approver plainly, with a way to try again.
 *
 * AC-5 (the confirmation clears itself after a few seconds while a message the
 * Approver has to act on stays until it is dismissed) is the Playwright spec's:
 * it is a real duration against a real clock, and re-running it here under jsdom
 * fake timers would prove nothing about the shipped one (testing-policy.md §
 * "One tag, one layer" and § Time-dependent behaviour).
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE DECIDE SURFACE ATTACHES TO WHAT `expense-request-list` ALREADY BUILT —
 *    do not rebuild it. The component under test is the existing client
 *    component `web/src/components/requests/ExpenseRequestList.tsx`, still fed
 *    `roles` by the server page (`rolesOf(session)`), with its per-request
 *    overflow (`RequestActions.tsx`) and its opened request
 *    (`RequestDetailPanel.tsx`). No second list, no second route, no second
 *    server-side gate — `/requests` is already registered for both roles in
 *    `lib/auth/access-map.ts` and must stay that way.
 * 2. WHO may decide is read from `roles`: an Approver (`ROLE_APPROVER`) is
 *    offered the actions and everybody else is offered NOTHING AT ALL — absent,
 *    never disabled and never greyed out (R14/BR7, the hidden-not-disabled rule
 *    this project uses everywhere). The queries below find disabled controls
 *    too, so a greyed-out "Approve" fails exactly as a working one would.
 * 3. WHICH requests offer them: only `Status === 'Imported'` (R6/BR3). Two
 *    conditions are deliberately ABSENT and must not be invented:
 *      - no amount threshold, "large amount" variant or second-approval step
 *        (R8/BR5);
 *      - no self-approval guard (R5/BR2). `TransactionRead` carries no owner /
 *        employee / subject field, so "the Approver's own expense" cannot be
 *        fixtured at all — the testable content of R5 is exactly that approve is
 *        offered on ANY `Imported` request, with no ownership condition anywhere
 *        in the code path. Do not add an owner field to have something to test.
 * 4. WHERE the controls live: as `menuitem`s in each request's existing actions
 *    overflow (the `dropdown-menu` `RequestActions` already renders, explicitly
 *    left in place as the home for this epic's per-request actions), and as
 *    controls inside the opened request's panel. Each accessible name begins
 *    with "Approve" / "Reject"; naming the request as well ("Approve request
 *    TXN-20260415-0001") is welcome and matches either query below.
 * 5. THE CONFIRMATION is the Shadcn `alert-dialog` already installed at
 *    `components/ui/alert-dialog.tsx` (do NOT regenerate it from the CLI —
 *    that reinstates a raw colour keyword over its token). Radix renders it with
 *    `role="alertdialog"`. Per the R10/BR6 convention it NAMES the request by
 *    its `Reference`, prints no full account number (POPIA — naming a request
 *    must not defeat the masking the list applies), and opens with the way OUT
 *    holding focus — `AlertDialogCancel`, labelled "Cancel", which NFR2 makes
 *    the initially focused control for this dialog in place of UI-12's usual
 *    first-editable-field rule. Nothing is sent until the confirming control is
 *    taken. `components/files/SubmittedFileActions.tsx` already ships this exact
 *    convention for cancel-file: read it first and match its shape (if one
 *    shared confirmation can absorb both, prefer extracting it over leaving two
 *    near-identical dialogs).
 * 6. THE DECIDE CALL goes through story 1's `web/src/lib/api/decisions.ts` on the
 *    shared API client (CLAUDE.md §2) — never `fetch` from a component, never the
 *    `/transactions-api/*` proxy directly. Only `@/lib/api/client` is mocked
 *    below, so that endpoint module is exercised for real; the `LastChangedUser`
 *    stamping it relies on is story 1's own contract and is not re-pinned here.
 * 7. AFTER A RECORDED DECISION the request reads Approved through the shared
 *    `StatusBadge` — intent colour paired with the status TEXT, never colour
 *    alone (NFR3/R14) — and its decide actions are withdrawn from it. The mocks
 *    below answer every fresh `GET /v1/transactions` with the decided request
 *    from the moment the decide call is accepted, so an on-screen update and a
 *    re-read (the arrangement story 4 needs for BR1) both satisfy this.
 * 8. THE NOTIFICATION is the root layout's existing `ToastProvider` /
 *    `ToastContainer` and `useToast()` — `role="region"`, named "Notifications".
 *    Do not build a second notification surface. The confirmation of a recorded
 *    approval names the request by its `Reference` and says it was approved.
 * 9. A REFUSED DECISION leaves the request exactly as it was, closes the
 *    confirmation (a user is never trapped in a dialog to read why something did
 *    not happen), and reports the SERVICE's own wording —
 *    `serviceMessageOf(error) ?? serviceDetailOf(error) ?? <own wording>`, the
 *    rule `lib/api/errors.ts` exists for — never the client's placeholder
 *    (project.md NFR-base-5). The way to try again is the action itself, still
 *    on offer.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy). Every body comes from the project-wide
 * factory in `@/mocks/data/transaction`, shared with the Playwright layer, so the
 * two layers cannot drift onto different shapes; its `AccountNumber` values are
 * FULL, unmasked numbers, because a test can only prove the confirmation does not
 * print one if the mock hands the screen something to print.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): nothing in the
 * list, its overflow or its detail panel offers a decision yet — the previous
 * epic asserts the opposite on purpose.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the list the previous epic built, which this
// story attaches the decide actions to.
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// The real production notification composition (not mocked): the same one the
// root layout wraps every signed-in screen in, and the only surface a decision
// may announce itself through.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get, post } from '@/lib/api/client';
import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';

// Project-wide Transaction factory: the single source of truth for the wire
// shape and its canonical values, shared with the Playwright layer. Never
// hand-write a response body in a test.
import {
  DECISION_REFUSED_MESSAGE,
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  approveSuccessResponse,
  createTransaction,
  decisionFailureResponse,
  transactionDecided,
  transactionListResponse,
  transactionsInEveryStatus,
} from '@/mocks/data/transaction';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/types/auth';

import type { TransactionRead } from '@/mocks/data/transaction';
import type { APIError } from '@/types/api';
import type { ProjectRole } from '@/types/auth';

vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockGet = get as unknown as ReturnType<typeof vi.fn>;
const mockPost = post as unknown as ReturnType<typeof vi.fn>;

type User = ReturnType<typeof userEvent.setup>;

/**
 * What the transactions service currently holds. Every `GET /v1/transactions` —
 * the first read, a re-read before submitting (story 4's BR1) or a re-read after
 * a decision — is answered from this one value, so the mocks behave like a
 * service rather than like a fixed script.
 */
let served: TransactionRead[] = [];

/** Every decide call that actually left the browser, in the order they were sent. */
const decisionsSent: unknown[][] = [];

/** Puts a set of requests behind `GET /v1/transactions`. */
const serve = (requests: TransactionRead[]): void => {
  served = requests;
};

/**
 * The service recording an approval: the one request still awaiting a decision
 * becomes Approved, and every later read says so.
 *
 * It insists on exactly one `Imported` request in the served set, because that is
 * what makes "which request did this decide call name?" unambiguous WITHOUT this
 * file having to know the call's shape — that shape is story 1's contract
 * (`lib/api/decisions.ts`), not this story's, and re-pinning it here would tie
 * these tests to a decision they do not own.
 */
const recordTheApproval = (): void => {
  const awaitingDecision = served.filter(
    (request) => request.Status === TRANSACTION_STATUS_IMPORTED,
  );
  if (awaitingDecision.length !== 1) {
    throw new Error(
      'Fixture precondition failed: a test that sends a decision must serve ' +
        `exactly one Imported request, found ${String(awaitingDecision.length)}.`,
    );
  }
  const decided = transactionDecided(awaitingDecision[0]);
  served = served.map((request) =>
    request.Id === decided.Id ? decided : request,
  );
};

/**
 * What the shared client throws when a decide call is REFUSED: the client's own
 * placeholder on `message`, and the service's `Messages[]` on `details`
 * (`lib/api/client.ts` → 500 branch). That split is the whole point of AC-6 — the
 * reason the user must be shown is only reachable through `serviceDetailOf`.
 */
const DECISION_REFUSED: APIError = {
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  details: decisionFailureResponse().Messages,
  endpoint: '/api/decisions',
};

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderList = (roles: ProjectRole[]) =>
  render(
    <ToastProvider>
      <ExpenseRequestList roles={roles} />
      <ToastContainer />
    </ToastProvider>,
  );

/**
 * The table row for a named request, found by the reference the row carries
 * rather than by position — and required to be unique, so a widened match can
 * never quietly select the wrong request.
 */
const rowFor = (reference: string): HTMLElement => {
  const rows = within(screen.getByRole('table'))
    .getAllByRole('row')
    .filter((row) => row.textContent?.includes(reference));

  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one table row carrying "${reference}", found ` +
        `${String(rows.length)} — the list renders one row per request, each ` +
        'identified by its Reference.',
    );
  }
  return rows[0];
};

/** Opens one request's actions overflow and hands back the open menu. */
const openActionsMenuFor = async (
  user: User,
  reference: string,
): Promise<HTMLElement> => {
  const trigger = await waitFor(() =>
    within(rowFor(reference)).getByRole('button', { name: /^actions\b/i }),
  );
  await user.click(trigger);
  return await screen.findByRole('menu');
};

/** Closes the open overflow the way a keyboard user does. */
const closeActionsMenu = async (user: User): Promise<void> => {
  await user.keyboard('{Escape}');
  await waitFor(() => {
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
};

/** Opens one request's detail panel and hands back the panel itself. */
const openRequest = async (
  user: User,
  reference: string,
): Promise<HTMLElement> => {
  const control = await waitFor(() =>
    within(rowFor(reference)).getByRole('button', { name: /^open\b/i }),
  );
  await user.click(control);
  return await screen.findByRole('dialog');
};

/** Dismisses the open detail panel the way a keyboard user does. */
const closeOpenRequest = async (user: User): Promise<void> => {
  await user.keyboard('{Escape}');
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
};

/**
 * The two decide actions, by the way they name themselves. The `\b` keeps the
 * STATUS VALUES out of the match: "Approved" and "Rejected" are text a request
 * carries, not something a control offers to do.
 */
const APPROVE_ACTION = /^approve\b/i;
const REJECT_ACTION = /^reject\b/i;
const DECIDE_ACTION = /^(approve|reject)\b/i;

/** The way out of the confirmation (R10/BR6/NFR2) — see contract item 5. */
const WAY_OUT_OF_CONFIRMATION = /^cancel\b/i;

/** Every role a decide action could be offered under, disabled ones included. */
const CONTROL_ROLES = [
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
] as const;

/** Every activatable control in `surface` whose accessible name matches. */
const controlsNamed = (surface: HTMLElement, name: RegExp): HTMLElement[] =>
  CONTROL_ROLES.flatMap((role) =>
    within(surface).queryAllByRole(role, { name }),
  );

/** What a failed negative assertion should print: the offending control, named. */
const described = (element: HTMLElement): string =>
  `<${element.tagName.toLowerCase()}> "${(element.textContent ?? '').trim()}"`;

/** The one request still awaiting a decision in a fixture set. */
const awaitingDecisionIn = (requests: TransactionRead[]): TransactionRead => {
  const awaiting = requests.filter(
    (request) => request.Status === TRANSACTION_STATUS_IMPORTED,
  );
  if (awaiting.length !== 1) {
    throw new Error(
      'Fixture precondition failed: expected exactly one Imported request ' +
        `(see @/mocks/data/transaction), found ${String(awaiting.length)}.`,
    );
  }
  return awaiting[0];
};

/** A request in a fixture set that has already been decided, by status. */
const withStatusIn = (
  requests: TransactionRead[],
  status: string,
): TransactionRead => {
  const match = requests.find((request) => request.Status === status);
  if (match === undefined) {
    throw new Error(
      `Fixture precondition failed: no request with status "${status}" ` +
        '(see @/mocks/data/transaction).',
    );
  }
  return match;
};

/** Chooses Approve on a request and hands back the confirmation it opens. */
const chooseApprove = async (
  user: User,
  reference: string,
): Promise<HTMLElement> => {
  const menu = await openActionsMenuFor(user, reference);
  await user.click(
    within(menu).getByRole('menuitem', { name: APPROVE_ACTION }),
  );
  return await screen.findByRole('alertdialog');
};

describe('Epic expense-decisions, Story 2: approve an imported request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    served = [];
    decisionsSent.length = 0;

    // The service, as these tests model it: every read answers with what it
    // currently holds, and an accepted decide call changes what it holds.
    mockGet.mockImplementation(() =>
      Promise.resolve(transactionListResponse(served)),
    );
    mockPost.mockImplementation((...args: unknown[]) => {
      decisionsSent.push(args);
      recordTheApproval();
      // The generic `DefaultResponse` envelope: it says nothing about the
      // request's new status, so a screen learns the outcome by reading the
      // request again, never by parsing this body (brief BR1).
      return Promise.resolve(approveSuccessResponse());
    });
  });

  // AC-1
  it('offers an Approver both Approve and Reject on any request still awaiting a decision, whatever its amount', async () => {
    const user = userEvent.setup();

    // Two requests at opposite ends of any threshold somebody might be tempted
    // to invent (R8/BR5): a few rand, and nearly a hundred thousand. Both are
    // simply "Imported", which is the ONLY condition on the offer.
    //
    // R5/BR2's "even when it is the Approver's own expense" has no fixture here
    // on purpose: `TransactionRead` carries no owner / employee / subject field
    // (checked against documentation/transactions-api.yaml and the brief's Data
    // Model), so there is nothing to mark a request as the Approver's own. What
    // is testable is stated below — the offer is made on any Imported request,
    // with no ownership condition in the way.
    const smallest = createTransaction({
      Id: 7401,
      Reference: 'TXN-20260415-0401',
      AccountNumber: '1001-2034-5401',
      Description: 'Spar convenience store',
      Amount: 9.99,
      TransactionDate: '2026-04-15 07:20:00',
    });
    const largest = createTransaction({
      Id: 7402,
      Reference: 'TXN-20260415-0402',
      AccountNumber: '1001-2034-5402',
      Description: 'Annual conference travel',
      Amount: 98750.5,
      TransactionDate: '2026-04-15 16:40:00',
    });
    serve([smallest, largest]);

    renderList([ROLE_APPROVER]);

    const smallestMenu = await openActionsMenuFor(user, smallest.Reference);
    expect(
      within(smallestMenu).getByRole('menuitem', { name: APPROVE_ACTION }),
    ).toBeInTheDocument();
    expect(
      within(smallestMenu).getByRole('menuitem', { name: REJECT_ACTION }),
    ).toBeInTheDocument();
    await closeActionsMenu(user);

    const largestMenu = await openActionsMenuFor(user, largest.Reference);
    expect(
      within(largestMenu).getByRole('menuitem', { name: APPROVE_ACTION }),
    ).toBeInTheDocument();
    expect(
      within(largestMenu).getByRole('menuitem', { name: REJECT_ACTION }),
    ).toBeInTheDocument();
    await closeActionsMenu(user);

    // ...and the opened request offers the same two decisions, so an Approver
    // who read the detail before deciding does not have to go back to the row.
    const detail = await openRequest(user, largest.Reference);
    expect(
      within(detail).getByRole('button', { name: APPROVE_ACTION }),
    ).toBeInTheDocument();
    expect(
      within(detail).getByRole('button', { name: REJECT_ACTION }),
    ).toBeInTheDocument();
  });

  // AC-2
  it('offers Approve and Reject nowhere for a Finance Uploader, and on no request that has already been decided', async () => {
    const user = userEvent.setup();

    // One request per status, so the same set proves both halves.
    const requests = transactionsInEveryStatus();
    const awaitingDecision = awaitingDecisionIn(requests);
    const approved = withStatusIn(requests, TRANSACTION_STATUS_APPROVED);
    serve(requests);

    // --- the Approver, who is the contrast the negatives are read against ----
    const approverView = renderList([ROLE_APPROVER]);

    const awaitingMenu = await openActionsMenuFor(
      user,
      awaitingDecision.Reference,
    );
    expect(
      within(awaitingMenu).getByRole('menuitem', { name: APPROVE_ACTION }),
    ).toBeInTheDocument();
    await closeActionsMenu(user);

    // A request somebody has already decided offers neither action — absent,
    // not disabled (R6/BR3, R12).
    const approvedMenu = await openActionsMenuFor(user, approved.Reference);
    expect(controlsNamed(approvedMenu, DECIDE_ACTION).map(described)).toEqual(
      [],
    );
    await closeActionsMenu(user);

    // ...and neither does it when it is opened, which is the other place a
    // per-request decision would look natural.
    const approvedDetail = await openRequest(user, approved.Reference);
    expect(controlsNamed(approvedDetail, DECIDE_ACTION).map(described)).toEqual(
      [],
    );
    await closeOpenRequest(user);

    approverView.unmount();

    // --- the Finance Uploader, offered nothing anywhere (R14/BR7) ------------
    renderList([ROLE_IMPORTER]);

    const uploaderMenu = await openActionsMenuFor(
      user,
      awaitingDecision.Reference,
    );
    expect(controlsNamed(uploaderMenu, DECIDE_ACTION).map(described)).toEqual(
      [],
    );
    await closeActionsMenu(user);

    const uploaderDetail = await openRequest(user, awaitingDecision.Reference);
    expect(controlsNamed(uploaderDetail, DECIDE_ACTION).map(described)).toEqual(
      [],
    );
    await closeOpenRequest(user);

    // Nowhere on the whole screen — not in a row, not in a toolbar, not greyed
    // out somewhere out of the way.
    expect(controlsNamed(document.body, DECIDE_ACTION).map(described)).toEqual(
      [],
    );
  });

  // AC-3
  it('asks the Approver to confirm, naming the request and printing no account number in full, and leaves the request exactly as it was when the confirmation is cancelled', async () => {
    const user = userEvent.setup();

    const request = createTransaction();
    serve([request]);

    renderList([ROLE_APPROVER]);

    const confirmation = await chooseApprove(user, request.Reference);

    // It names the request it is about — nothing vague like "this request"
    // (R10/BR6).
    expect(confirmation).toHaveTextContent(request.Reference);
    // ...and naming it does not defeat the masking the list applies. POPIA
    // (project.md §Compliance): the full account number is revealed only by an
    // explicit action on a single request, and this is not that action.
    expect(confirmation).not.toHaveTextContent(request.AccountNumber);

    // The way out holds focus, so a stray Enter approves nothing (NFR2, which
    // overrides UI-12's first-editable-field rule for this dialog).
    const wayOut = within(confirmation).getByRole('button', {
      name: WAY_OUT_OF_CONFIRMATION,
    });
    await waitFor(() => {
      expect(wayOut).toHaveFocus();
    });

    await user.click(wayOut);
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    // Nothing at all was sent: the action does not take effect until the
    // confirmation is accepted (R10).
    expect(decisionsSent).toEqual([]);

    // ...and the request is exactly where it was — still awaiting a decision,
    // still offering both — with nothing announced about it.
    expect(rowFor(request.Reference)).toHaveTextContent(
      TRANSACTION_STATUS_IMPORTED,
    );
    expect(
      screen.queryByRole('region', { name: /notifications/i }),
    ).not.toBeInTheDocument();

    const reopenedMenu = await openActionsMenuFor(user, request.Reference);
    expect(
      within(reopenedMenu).getByRole('menuitem', { name: APPROVE_ACTION }),
    ).toBeInTheDocument();
    expect(
      within(reopenedMenu).getByRole('menuitem', { name: REJECT_ACTION }),
    ).toBeInTheDocument();
  });

  // AC-4
  it('records the approval once it is confirmed: the request reads Approved, the Approver is told, and the decide actions are withdrawn from it', async () => {
    const user = userEvent.setup();

    const requests = transactionsInEveryStatus();
    const awaitingDecision = awaitingDecisionIn(requests);
    serve(requests);

    renderList([ROLE_APPROVER]);

    const confirmation = await chooseApprove(user, awaitingDecision.Reference);
    await user.click(
      within(confirmation).getByRole('button', { name: APPROVE_ACTION }),
    );

    // The request now reads Approved. The status is TEXT beside its intent
    // colour, never colour alone (NFR3/R14) — the colour half is the shared
    // `StatusBadge`'s own tokenised contract and is checked in the browser, not
    // in jsdom.
    await waitFor(() => {
      expect(rowFor(awaitingDecision.Reference)).toHaveTextContent(
        TRANSACTION_STATUS_APPROVED,
      );
    });
    expect(rowFor(awaitingDecision.Reference)).not.toHaveTextContent(
      TRANSACTION_STATUS_IMPORTED,
    );

    // The Approver is told, in the app's one notification surface, which
    // request it was and what happened to it (R15).
    const notifications = await screen.findByRole('region', {
      name: /notifications/i,
    });
    expect(notifications).toHaveTextContent(awaitingDecision.Reference);
    expect(notifications).toHaveTextContent(/approved/i);

    // ...and the decide actions are gone from that request — absent, not
    // disabled (R12), in the overflow and in the opened request alike.
    const decidedMenu = await openActionsMenuFor(
      user,
      awaitingDecision.Reference,
    );
    expect(controlsNamed(decidedMenu, DECIDE_ACTION).map(described)).toEqual(
      [],
    );
    await closeActionsMenu(user);

    const decidedDetail = await openRequest(user, awaitingDecision.Reference);
    expect(controlsNamed(decidedDetail, DECIDE_ACTION).map(described)).toEqual(
      [],
    );
  });

  // AC-6
  it('leaves the request as it was and tells the Approver plainly when the decision cannot be recorded, with the action still there to try again', async () => {
    const user = userEvent.setup();

    const request = createTransaction();
    serve([request]);
    // The service refuses the decision, so nothing about the request changes.
    mockPost.mockRejectedValue(DECISION_REFUSED);

    renderList([ROLE_APPROVER]);

    const confirmation = await chooseApprove(user, request.Reference);
    await user.click(
      within(confirmation).getByRole('button', { name: APPROVE_ACTION }),
    );

    // The service's own reason reaches the user...
    expect(await screen.findByText(DECISION_REFUSED_MESSAGE)).toBeVisible();
    // ...and the client's own placeholder never does (project.md NFR-base-5).
    expect(
      screen.queryByText(CLIENT_FALLBACK_MESSAGES.serverError),
    ).not.toBeInTheDocument();

    // The user is not left holding the confirmation open to read why.
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    // The request is exactly as it was — still awaiting a decision...
    expect(rowFor(request.Reference)).toHaveTextContent(
      TRANSACTION_STATUS_IMPORTED,
    );

    // ...and the way to try again is the action itself, still on offer.
    const menu = await openActionsMenuFor(user, request.Reference);
    expect(
      within(menu).getByRole('menuitem', { name: APPROVE_ACTION }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: REJECT_ACTION }),
    ).toBeInTheDocument();
  });
});
