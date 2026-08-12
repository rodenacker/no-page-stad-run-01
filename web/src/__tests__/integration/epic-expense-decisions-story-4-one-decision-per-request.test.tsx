/**
 * Story Metadata:
 * - Epic: expense-decisions — Story 4: a decided request, and only one decision each
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — a request that has already been approved or rejected offers no decide
 *   action and says where it stands instead, with its status readable as text.
 * - AC-2 — on a decided request, who decided it, when, and the note where there is
 *   one are visible to a Finance Uploader exactly as to an Approver (R16).
 * - AC-3 — a decision on a request someone else decided first is refused with
 *   "This request has already been decided.", and NOTHING is sent (BR1).
 * - AC-4 — that refusal stays until it is dismissed, and the list is brought up to
 *   date with the decision that was actually recorded.
 *
 * AC-5 (the same race in a real browser) is this story's Playwright spec's —
 * deliberately not duplicated here (testing-policy.md § "One tag, one layer"). The
 * genuine two-session timing race is a manual-test focus item (brief NFR4); what is
 * pinned below is the re-read logic, against a controlled stale-state fixture.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE SURFACE is the list `expense-request-list` already built — the CLIENT
 *    component `web/src/components/requests/ExpenseRequestList.tsx` (named export
 *    `ExpenseRequestList`), with the opened request's read-only panel
 *    (`RequestDetailPanel`, `role="dialog"`, named for the request) and the
 *    per-request controls (`RequestActions`) it already renders. jsdom cannot render
 *    `requests/page.tsx` itself (an async server component resolving the session),
 *    which is the split every epic here uses: the server page gates, the client
 *    component is the unit under test. Do NOT add a second list, panel or audit view.
 * 2. WHO MAY DECIDE reaches the browser through the `roles` prop the page already
 *    passes (`rolesOf(session)`) — story 2's gating, re-used here, not re-plumbed.
 * 3. THE DECIDE CONTROLS (story 2's) are offered on a request ONLY while its
 *    `Status` is `Imported` (BR3), on both surfaces that carry per-request actions:
 *    the opened request's panel, and the request's OWN ROW — as direct controls one
 *    activation away. A request carries no ⋯ overflow menu at all; Open is a direct
 *    control too. Their accessible names begin with "Approve" / "Reject" and go on
 *    to name the request, which they must: every listed request carries a pair of
 *    its own. On a DECIDED request they are ABSENT from the row and from the panel
 *    — not disabled, not `aria-hidden` (the project's hidden-never-disabled rule) —
 *    and in their place the opened request states where it stands in a sentence
 *    containing "already been approved" / "already been rejected", matching the
 *    status the request actually carries. The sweep below covers both places, so a
 *    decide control left behind in either of them fails.
 * 4. THE AUDIT VALUES (R16) — `Status`, `UserNote`, `LastChangedUser`,
 *    `LastChangedDate` — are shown on the opened request exactly as the service sent
 *    them, to BOTH roles. `RequestDetailPanel` already renders all four; this story
 *    keeps them, so these assertions are a regression guard rather than new work.
 * 5. BR1 — RE-READ BEFORE SUBMITTING, AND REFUSE LOCALLY. Both decide operations
 *    answer the same `DefaultResponse` envelope whatever happened, so the answer
 *    cannot be parsed to detect an already-decided request. The mock below proves it:
 *    any decide call is answered with `alreadyDecidedResponse()`, which IS
 *    `approveSuccessResponse()` field for field. So once the confirmation is
 *    accepted, and BEFORE any decide call is made, the app re-reads the request's
 *    current status with a fresh `GET /v1/transactions` (`fetchTransactions` in
 *    `lib/api/transactions.ts` — the contract has no single-request read and the list
 *    call takes no parameters) and, if the request is no longer `Imported`, sends
 *    NOTHING and refuses locally. Any GET this file does not recognise, and any
 *    non-GET call at all, is recorded/refused loudly below.
 * 6. THE REFUSAL WORDING IS "This request has already been decided." (R4/R13), and
 *    it is a message the user must acknowledge: raise it through the existing
 *    `useToast()` from `@/contexts/ToastContext` with `duration: 0` — the
 *    never-auto-dismisses mode `file-validation-and-retry` added to `ToastOptions`
 *    (`web/src/types/toast.ts`). Do not build a second persistent-message surface,
 *    and do not leave it on the default 5s.
 * 7. THE LIST IS BROUGHT UP TO DATE after the refusal, so the request shows the
 *    decision that was actually recorded (R13) — the re-read already holds it; do
 *    not leave the user looking at the stale row.
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy). The list, the panel, the confirmation and
 * the toast composition are REAL production code, so what the user meets is asserted
 * as rendered text. Every response body comes from the project-wide `@/mocks/data/*`
 * factories the Playwright layer shares, so the two layers cannot drift.
 *
 * Timers: fake, so a minute can pass without a message that must persist being
 * waited for in real time. `userEvent` is given the same clock (RTL advances it
 * while it waits, via the `jest` shim in `vitest.setup.ts`). No `axe()` runs here —
 * accessibility is the Playwright scan's.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, {
  PointerEventsCheckLevel,
} from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the list this story teaches to hold one decision per
// request. Story 2 adds the decide controls to it; this story closes the guarantee.
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';
// Real production toast composition (not mocked) — the surface the root layout wraps
// every signed-in screen in, and the one a refusal that must persist is raised on.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { apiClient, del, get, post, put } from '@/lib/api/client';
// Project-wide Transaction factory: the single source of truth for the wire shape and
// its canonical values, shared with the Playwright layer. `transactionDecidedElsewhere`
// is the BR1 fixture — the same request, already decided by someone else — and
// `alreadyDecidedResponse` is the answer that cannot be told from success.
import {
  DECIDING_APPROVER,
  OTHER_APPROVER,
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_REJECTED,
  alreadyDecidedResponse,
  createTransaction,
  transactionDecidedElsewhere,
  transactionListResponse,
  transactionsInEveryStatus,
} from '@/mocks/data/transaction';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/types/auth';

import type { RenderResult } from '@testing-library/react';
import type { ProjectRole } from '@/types/auth';
import type { TransactionRead } from '@/mocks/data/transaction';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;
const mockGet = get as unknown as ReturnType<typeof vi.fn>;
const mockPost = post as unknown as ReturnType<typeof vi.fn>;
const mockPut = put as unknown as ReturnType<typeof vi.fn>;
const mockDel = del as unknown as ReturnType<typeof vi.fn>;

type User = ReturnType<typeof userEvent.setup>;

/**
 * How much FAKE time a test is prepared to let pass while the screen catches up with
 * a decision it has just been asked for. Deliberately generous and deliberately not
 * any interval the implementation might use — no test here knows one.
 */
const DECISION_WINDOW_MS = 10_000;

/**
 * How long a message is left alone before it is looked at again — the manual check's
 * "leave it for a minute". Anything comfortably longer than the toast default
 * satisfies these tests; the default itself is nobody's contract here.
 */
const LEFT_ALONE_MS = 60_000;

/** The wording R4/R13 require, exactly as the criterion states it. */
const ALREADY_DECIDED = /this request has already been decided\./i;

/**
 * The decide controls' accessible names (story 2's). Anchored at the start, so
 * "Approve" and "Approve request TXN-…" both qualify while a status VALUE the request
 * merely carries ("Approved") never does.
 */
const APPROVE = /^approve\b/i;
const REJECT = /^reject\b/i;

/** The confirming choice inside the confirmation, whose other control is the way out. */
const CONFIRM_APPROVE = /\bapprove\b/i;

/**
 * Wording that would mean a request can still be decided. The `\b` bounds keep the
 * STATUS VALUES "Approved" / "Rejected" out of it — those are text a request carries,
 * not something a control offers to do.
 */
const DECIDES_A_REQUEST = /\b(approve|reject|decline|decide)\b/i;

/**
 * The sentence a DECIDED request must state where its decide actions used to be
 * (R12), naming the state the request actually carries rather than a vague "this
 * request cannot be changed".
 */
const stateMessageFor = (status: string): RegExp =>
  new RegExp(`already been ${status.toLowerCase()}`, 'i');

/** Roles a user can activate — where an "Approve" or a "Reject" would show up. */
const CONTROL_ROLES = [
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
] as const;

/** What a failed negative assertion should print: the offending control, named. */
const described = (element: HTMLElement): string =>
  `<${element.tagName.toLowerCase()}> "${(element.textContent ?? '').trim()}"`;

/**
 * Every control within `surface` that offers to decide the request — including
 * hidden and disabled ones, since a greyed-out Approve on a decided request fails
 * exactly as a working one would.
 */
const decideControlsIn = (surface: HTMLElement): string[] =>
  CONTROL_ROLES.flatMap((role) =>
    within(surface).queryAllByRole(role, {
      name: DECIDES_A_REQUEST,
      hidden: true,
    }),
  ).map(described);

/** One recorded call that could CHANGE something, whatever address it was aimed at. */
interface MutatingCall {
  endpoint: string;
  method: string;
}

let decisionCalls: MutatingCall[] = [];
let servedRequests: TransactionRead[] = [];

/**
 * What every `GET /v1/transactions` answers from now on. Changing it mid-test is how
 * "somebody else decided this request a moment ago" is expressed: nothing on screen
 * knows, and only a fresh read can find out (BR1).
 */
const serveRequests = (...requests: TransactionRead[]): void => {
  servedRequests = requests;
};

/**
 * The transactions service as this screen addresses it.
 *
 * Reads are answered from the shared factory. ANY call that is not a read is recorded
 * as an attempt to record a decision and answered with the already-decided body —
 * which is the SUCCESS body, field for field (BR1). An implementation that submits
 * first and reads the outcome out of that answer therefore cannot tell the two apart,
 * and AC-3 says so.
 */
const route = async (endpoint: string, method: string): Promise<unknown> => {
  const path = String(endpoint);
  const verb = method.toUpperCase();

  if (verb !== 'GET') {
    decisionCalls.push({ endpoint: path, method: verb });
    return alreadyDecidedResponse();
  }
  if (path.includes('/v1/transactions')) {
    return transactionListResponse(servedRequests);
  }

  throw new Error(
    `Unexpected GET ${path}. The current status of a request is re-read with the ` +
      'list call itself (GET /v1/transactions, no parameters) — the contract ' +
      'defines no single-request read (see the implementation contract above).',
  );
};

/** Advance the fake clock inside `act`, so timer-driven renders are flushed first. */
const settle = async (ms = 0): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const setupUser = (): User =>
  userEvent.setup({
    advanceTimers: (delay: number) => {
      vi.advanceTimersByTime(delay);
    },
    // Radix puts `pointer-events: none` on the body while a modal is open; jsdom then
    // reports the dialog's own controls as un-clickable even though a real browser
    // lets them through.
    pointerEventsCheck: PointerEventsCheckLevel.Never,
  });

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderRequests = async (roles: ProjectRole[]): Promise<RenderResult> => {
  const view = render(
    <ToastProvider>
      <ExpenseRequestList roles={roles} />
      <ToastContainer />
    </ToastProvider>,
  );
  await settle();
  return view;
};

/**
 * The table row for a named request, found by the reference the row carries rather
 * than by position — and required to be unique, so a widened match can never quietly
 * select the wrong request.
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

/** Opens one request's panel and hands back the panel itself. */
const openRequest = async (
  user: User,
  reference: string,
): Promise<HTMLElement> => {
  const control = await waitFor(() =>
    within(rowFor(reference)).getByRole('button', { name: /^open/i }),
  );
  await user.click(control);
  return await screen.findByRole('dialog');
};

/**
 * Back to the list, the way a keyboard user gets there — and a no-op when the screen
 * has already closed the panel itself, so neither behaviour is assumed.
 */
const returnToTheList = async (user: User): Promise<void> => {
  await user.keyboard('{Escape}');
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
};

/**
 * The app's in-app notification surface (the root layout's `ToastContainer`), which
 * renders nothing at all while there is nothing to tell the user — so its absence IS
 * "no message is on screen".
 */
const notificationSurface = (): HTMLElement | null =>
  screen.queryByRole('region', { name: /notifications/i });

/** The same surface where a test has already established it is there. */
const openNotifications = (): HTMLElement =>
  screen.getByRole('region', { name: /notifications/i });

/**
 * The dismiss control of every message currently on screen — one per message, so this
 * is how many the user is looking at. It also holds the implementation to offering a
 * way to dismiss the one that never fades.
 */
const dismissControls = (): HTMLElement[] =>
  within(openNotifications()).getAllByRole('button', {
    name: /dismiss notification/i,
  });

describe('Epic expense-decisions, Story 4: a decided request, and only one decision each', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    decisionCalls = [];
    servedRequests = [];

    mockGet.mockImplementation((endpoint: string) => route(endpoint, 'GET'));
    mockApiClient.mockImplementation(
      (endpoint: string, config?: { method?: string }) =>
        route(endpoint, config?.method ?? 'GET'),
    );
    mockPost.mockImplementation((endpoint: string) => route(endpoint, 'POST'));
    mockPut.mockImplementation((endpoint: string) => route(endpoint, 'PUT'));
    mockDel.mockImplementation((endpoint: string) => route(endpoint, 'DELETE'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AC-1
  it('offers no decide action on a request that has already been decided and says where it stands instead, while one still awaiting a decision offers both', async () => {
    const user = setupUser();
    const [imported, approved, rejected] = transactionsInEveryStatus();

    // Fixture precondition: the three rows really are one still-open request and two
    // decided ones, so the contrast below is the STATUS and nothing else.
    expect(imported.Status).toBe(TRANSACTION_STATUS_IMPORTED);
    expect([approved.Status, rejected.Status]).not.toContain(
      TRANSACTION_STATUS_IMPORTED,
    );

    serveRequests(imported, approved, rejected);
    await renderRequests([ROLE_APPROVER]);

    // The request still awaiting a decision offers both actions — so every absence
    // below is about the decision having been made, not about a screen that offers
    // an Approver nothing anywhere. On its own row first, which is where story 2
    // puts them and where a decision costs one activation...
    const importedRow = rowFor(imported.Reference);
    expect(
      within(importedRow).getByRole('button', {
        name: new RegExp(`^approve\\b.*${imported.Reference}`, 'i'),
      }),
    ).toBeInTheDocument();
    expect(
      within(importedRow).getByRole('button', {
        name: new RegExp(`^reject\\b.*${imported.Reference}`, 'i'),
      }),
    ).toBeInTheDocument();

    // ...and in the opened request.
    const importedDetail = await openRequest(user, imported.Reference);
    expect(
      within(importedDetail).getByRole('button', { name: APPROVE }),
    ).toBeInTheDocument();
    expect(
      within(importedDetail).getByRole('button', { name: REJECT }),
    ).toBeInTheDocument();
    await returnToTheList(user);

    for (const decided of [approved, rejected]) {
      // --- the opened request: a state message where the actions used to be ------
      const detail = await openRequest(user, decided.Reference);

      expect(detail).toHaveAccessibleName(new RegExp(decided.Reference));
      expect(detail).toHaveTextContent(stateMessageFor(decided.Status));
      // Runtime-only: the intent colour beside the label is judged by eye on the
      // manual checklist — jsdom cannot see colour. What is pinned is that the
      // status is readable as TEXT, so it is never carried by colour alone (NFR3).
      expect(within(detail).getByText(decided.Status)).toBeInTheDocument();
      expect(decideControlsIn(detail)).toEqual([]);

      await returnToTheList(user);

      // --- and the row the actions live on --------------------------------------
      const row = rowFor(decided.Reference);
      expect(within(row).getByText(decided.Status)).toBeInTheDocument();
      expect(decideControlsIn(row)).toEqual([]);
      // The row is still rendering its controls — so the absence above is a real
      // absence rather than a row that has stopped offering anything at all.
      expect(
        within(row).getByRole('button', { name: /^open/i }),
      ).toBeInTheDocument();
    }
  });

  // AC-2
  it('shows who decided a request, when, and the rejection note where there is one — to a Finance Uploader exactly as to an Approver', async () => {
    const [, approved, rejected] = transactionsInEveryStatus();
    // The rejected one was decided by SOMEBODY ELSE, so each panel is proved to show
    // its own request's values rather than one name reused for every decision.
    const rejectedByAnother = transactionDecidedElsewhere(
      rejected,
      TRANSACTION_STATUS_REJECTED,
    );
    const rejectionNote = rejectedByAnother.UserNote;
    if (rejectionNote === undefined) {
      throw new Error(
        'Fixture precondition failed: a rejected request must carry a UserNote ' +
          '(see @/mocks/data/transaction).',
      );
    }
    expect(rejectedByAnother.LastChangedUser).toBe(OTHER_APPROVER);
    expect(approved.LastChangedUser).toBe(DECIDING_APPROVER);

    const bothRoles: ProjectRole[] = [ROLE_IMPORTER, ROLE_APPROVER];

    for (const role of bothRoles) {
      const user = setupUser();
      serveRequests(approved, rejectedByAnother);
      const view = await renderRequests([role]);

      // A rejected request: the note, who rejected it, and when.
      const rejectedDetail = await openRequest(
        user,
        rejectedByAnother.Reference,
      );
      expect(rejectedDetail).toHaveTextContent(rejectionNote);
      expect(rejectedDetail).toHaveTextContent(OTHER_APPROVER);
      expect(rejectedDetail).toHaveTextContent(
        rejectedByAnother.LastChangedDate,
      );
      await returnToTheList(user);

      // An approved one: its own decider and moment, and no note invented for it.
      const approvedDetail = await openRequest(user, approved.Reference);
      expect(approvedDetail).toHaveTextContent(DECIDING_APPROVER);
      expect(approvedDetail).toHaveTextContent(approved.LastChangedDate);
      expect(approvedDetail).not.toHaveTextContent(rejectionNote);
      expect(approvedDetail).not.toHaveTextContent(OTHER_APPROVER);

      view.unmount();
    }
  });

  // AC-3
  it('refuses a decision on a request another Approver decided first, and sends nothing at all', async () => {
    const user = setupUser();
    const request = createTransaction();
    expect(request.Status).toBe(TRANSACTION_STATUS_IMPORTED);

    serveRequests(request);
    await renderRequests([ROLE_APPROVER]);

    const detail = await openRequest(user, request.Reference);
    await user.click(within(detail).getByRole('button', { name: APPROVE }));

    const confirmation = await screen.findByRole('alertdialog');

    // While the confirmation is on screen, ANOTHER Approver decides the same
    // request. Nothing this screen already holds knows that — only a fresh read
    // taken before submitting can find out (BR1).
    serveRequests(transactionDecidedElsewhere(request));

    await user.click(
      within(confirmation).getByRole('button', { name: CONFIRM_APPROVE }),
    );

    // The refusal, in the wording R4/R13 require...
    expect(
      await screen.findByText(
        ALREADY_DECIDED,
        {},
        { timeout: DECISION_WINDOW_MS },
      ),
    ).toBeInTheDocument();

    // ...and no decision was recorded: nothing was sent AT ALL. The decide call
    // would have answered with the already-decided body, which is the success body
    // field for field — so an implementation that submitted first and read that
    // answer would have reported a second decision as its own.
    await settle(DECISION_WINDOW_MS);
    expect(decisionCalls).toEqual([]);
  });

  // AC-4
  it('leaves the refusal on screen until it is dismissed, and brings the list up to date with the decision that was actually recorded', async () => {
    const user = setupUser();
    const request = createTransaction();
    // What the other Approver actually recorded — a REJECTION, so "up to date"
    // cannot be satisfied by the status this user was about to set.
    const recorded = transactionDecidedElsewhere(
      request,
      TRANSACTION_STATUS_REJECTED,
    );

    serveRequests(request);
    await renderRequests([ROLE_APPROVER]);

    const detail = await openRequest(user, request.Reference);
    await user.click(within(detail).getByRole('button', { name: APPROVE }));

    const confirmation = await screen.findByRole('alertdialog');
    serveRequests(recorded);
    await user.click(
      within(confirmation).getByRole('button', { name: CONFIRM_APPROVE }),
    );

    await screen.findByText(
      ALREADY_DECIDED,
      {},
      { timeout: DECISION_WINDOW_MS },
    );

    await returnToTheList(user);

    // A minute goes by with nobody touching it: a message the user has to
    // acknowledge does not fade on its own (R11 — `duration: 0`).
    await settle(LEFT_ALONE_MS);
    expect(openNotifications()).toHaveTextContent(ALREADY_DECIDED);
    expect(dismissControls()).toHaveLength(1);

    // The list caught up with what was actually recorded, so the user can see the
    // decision instead of the state they were acting on.
    await waitFor(
      () => {
        expect(
          within(rowFor(request.Reference)).getByText(recorded.Status),
        ).toBeInTheDocument();
      },
      { timeout: DECISION_WINDOW_MS },
    );
    expect(
      within(rowFor(request.Reference)).queryByText(
        TRANSACTION_STATUS_IMPORTED,
      ),
    ).not.toBeInTheDocument();

    // And the refusal goes when — and only when — the user dismisses it.
    await user.click(dismissControls()[0]);
    expect(notificationSurface()).not.toBeInTheDocument();
  });
});
