/**
 * Story Metadata:
 * - Epic: expense-decisions — Story 3: reject a request with a note
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — choosing Reject asks for a note before anything is recorded, and
 *   choosing Approve asks for none.
 * - AC-2 — a note that is blank OR only spaces is refused, in the brief's exact
 *   words, ON SUBMIT rather than while typing, and nothing is recorded.
 * - AC-3 — with a note written the Approver is asked to confirm; the message names
 *   the request by its reference and says it is a rejection, Cancel holds focus,
 *   and cancelling records nothing.
 * - AC-4 — confirming records the rejection with its note: the request reads
 *   Rejected, the note is shown with it, the decide actions are withdrawn, and a
 *   confirmation message is shown.
 *
 * AC-5 (the whole rejection completed with the keyboard alone) is this story's
 * Playwright spec's — deliberately not duplicated here (testing-policy.md § "One
 * tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE SURFACE. This story adds the note step to the decide surface story 2
 *    introduces — it does NOT build a second one. The unit under test is the client
 *    list `@/components/requests/ExpenseRequestList` (from `expense-request-list`),
 *    and Reject is reached the way story 2 places it: as a control on the request's
 *    OWN ROW, one activation away. A request has no ⋯ overflow menu at all — every
 *    action it offers is a direct control, Open included (the menu was removed at a
 *    later manual test). The same reject flow is offered from the opened request
 *    (`RequestDetailPanel`); nothing here asserts that second entry point, only that
 *    the flow itself behaves — one flow, two ways in.
 * 2. LABELS these tests query by (distinct words, so no query — and no user — can
 *    mistake the control that ASKS for the one that DOES it or the one that backs
 *    out, the discipline `SubmittedFileActions` already follows). Each is matched
 *    from the START of the accessible name, so a control may also name the request
 *    it acts on ("Reject request TXN-20260415-0001") — which the row controls MUST
 *    do, since every listed request carries its own pair:
 *      row control     "Reject…"         ·  row control (story 2)    "Approve…"
 *      note field      accessible name matching /note/i, composed from the Shadcn
 *                      `textarea` + `label` primitives — never a hand-rolled input
 *      note submit     "Continue…"
 *      confirm         "Reject…"         ·  way out                  "Cancel…"
 *    The way out is Radix's `AlertDialogCancel`, which holds initial focus for free
 *    (NFR2) — so a stray Enter on the confirmation rejects nothing. That still holds
 *    with an editable field earlier in the flow: the note step is BEFORE the
 *    confirmation, not inside it.
 * 3. VALIDATION TIMING IS THE POINT OF AC-2 (brief BR4, requirements §6.3): the
 *    note is checked when the note step is SUBMITTED, never on keystroke. A field
 *    that complains while the user is still typing fails this story even though the
 *    same wording eventually appears. The refusal is verbatim, and is the only
 *    wording for both the empty and the whitespace-only case:
 *      "Add a note explaining why this request is rejected."
 * 4. NOTHING IS SENT UNTIL THE CONFIRMATION IS ACCEPTED (R10). Until then — while
 *    the note is being written, while it is being refused, and after backing out —
 *    the browser has made no decide call at all. The mock below records every POST,
 *    so "nothing recorded" is asserted as an empty list of calls rather than as an
 *    unchanged screen.
 * 5. THE DECIDE CALL goes through story 1's `web/src/lib/api/decisions.ts` to the
 *    app's OWN route (`POST /api/decisions`, `app/api/decisions/route.ts`) — never
 *    `fetch` from a component and never the `/transactions-api/*` proxy. It names
 *    the request with `TransactionId` (in the body or as a query parameter — the
 *    mock accepts either) and carries the reject body `{ UserNote }`, whose shape
 *    comes from the shared `rejectionWriteBody` factory rather than from a literal
 *    here. `LastChangedUser` is the ROUTE's business, resolved from the session
 *    (story 1) — nothing below asserts it, and the browser must not send one.
 * 6. THE OUTCOME ARRIVES BY RE-READING, on this project's established pattern: both
 *    decide operations answer the generic `DefaultResponse` envelope, which says
 *    nothing about the request's new state (brief BR1). The fake service below
 *    records the decision and answers a later read with the decided request, so an
 *    implementation that re-reads `GET /v1/transactions` satisfies these tests; one
 *    that reads the outcome out of the decide response cannot.
 * 7. THE NOTE IS SHOWN BY THE EXISTING DETAIL PANEL. `RequestDetailPanel` already
 *    renders `UserNote` ("Rejection note") — do not add a second place a note is
 *    shown, and do not put it in the list row.
 * 8. THE DECIDE ACTIONS ARE WITHDRAWN once the request is no longer `Imported`
 *    (R12/BR3) — absent from the row, not disabled, which is this project's rule
 *    everywhere. The Open action stays: the request is still readable.
 * 9. THE CONFIRMATION MESSAGE is a transient in-app notification through the
 *    existing `useToast()` (`@/contexts/ToastContext`) at its DEFAULT duration
 *    (R11/R15 — the 5s default already sits inside the 4–8s window); it names the
 *    request and says it was rejected. `duration: 0` is for a message the user must
 *    act on, not for this one. Do not build a second notification surface.
 * 10. NO NEW READ ENDPOINT and no per-request GET: the screen still reads the one
 *    `GET /v1/transactions` body. The mock fails loudly on anything else.
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy), plus `next/navigation`, the framework
 * boundary. The toast composition, the Shadcn/Radix dialogs and everything under
 * `lib/` are the REAL production code, so what the user meets is asserted as
 * rendered text. Every response body comes from the project-wide
 * `@/mocks/data/transaction` factory the Playwright layer shares, so the two layers
 * cannot drift onto different shapes, statuses or notes.
 *
 * Data-contract: jsdom cannot prove that the real client, the app's own decide route
 * and the transactions service are wired to each other — that chain is verified in
 * the browser (this story's Playwright spec) and on the manual checklist. What is
 * pinned here is what the browser sends and what the Approver then sees.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, {
  PointerEventsCheckLevel,
} from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — story 2's decide surface on the shared list, which
// this story teaches to ask for a rejection note. The import fails until that
// component exists (TDD red).
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';
// Real production toast composition (not mocked) — the surface the root layout wraps
// every signed-in screen in, so the confirmation reads as text either way.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get, post } from '@/lib/api/client';
// Project-wide Transaction factory — the single source both test layers share. It
// owns the canonical note, the whitespace-only note BR4 also refuses, the reject
// body's shape and what a decided request looks like. Never hand-write one here.
import {
  REJECTION_NOTE,
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_REJECTED,
  WHITESPACE_ONLY_NOTE,
  createTransaction,
  rejectSuccessResponse,
  rejectionWriteBody,
  transactionDecided,
  transactionListResponse,
  transactionWithStatus,
} from '@/mocks/data/transaction';
import { ROLE_APPROVER } from '@/types/auth';

import type { TransactionRead } from '@/mocks/data/transaction';
import type { ProjectRole } from '@/types/auth';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

/**
 * The client-navigation boundary — a library, never the code under test. The list
 * screen lives inside the App Router; nothing in this story asserts navigation.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/requests',
  useSearchParams: () => new URLSearchParams(),
}));

const mockGet = get as unknown as ReturnType<typeof vi.fn>;
const mockPost = post as unknown as ReturnType<typeof vi.fn>;

type User = ReturnType<typeof userEvent.setup>;

/** The refusal, verbatim from the brief (R9/BR4). Both refused cases read this. */
const NOTE_REQUIRED_MESSAGE =
  'Add a note explaining why this request is rejected.';

/**
 * The controls each step is driven by — see contract note 2.
 *
 * Matched from the START of the accessible name, so a control that also names the
 * request it acts on (as every control on this screen already does — "Reject request
 * TXN-20260415-0001") satisfies them, while a STATUS a request merely carries
 * ("Rejected") never does.
 */
const REJECT_ACTION = /^reject\b/i;
const APPROVE_ACTION = /^approve\b/i;
const OPEN_ACTION = /^open\b/i;
const NOTE_FIELD = /note/i;
const CONTINUE = /^continue\b/i;
const WAY_OUT = /^cancel\b/i;

/** The endpoint a decide call goes to — the app's own route, not the service's. */
const DECIDE_ENDPOINT = /decision/i;

/**
 * One decide call, as the BROWSER made it: which request it is for, whether it names
 * a rejection, and the note it carried.
 *
 * Read tolerantly (the id may travel in the body or as a query parameter) because
 * what this story pins is that a rejection for THIS request carrying THIS note was
 * sent — the transport shape is story 1's, and is asserted there.
 */
interface DecideRequest {
  TransactionId: number | undefined;
  rejection: boolean;
  UserNote?: string;
}

/** A POST body as a bag of fields, tolerating a call that sent none. */
const fieldsOf = (body: unknown): Record<string, unknown> =>
  typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)
    : {};

/** The request a decide call is for, from wherever the call named it. */
const transactionIdIn = (
  endpoint: string,
  fields: Record<string, unknown>,
): number | undefined => {
  const inBody = fields.TransactionId;
  if (typeof inBody === 'number') {
    return inBody;
  }
  if (typeof inBody === 'string' && inBody.trim() !== '') {
    return Number(inBody);
  }
  const query = endpoint.includes('?')
    ? endpoint.slice(endpoint.indexOf('?') + 1)
    : '';
  const inAddress = new URLSearchParams(query).get('TransactionId');
  return inAddress === null || inAddress.trim() === ''
    ? undefined
    : Number(inAddress);
};

/**
 * Whether the call says it is a rejection — in its address or in a field of its own.
 * Matched at the START of a value so a NOTE that happens to mention a rejection can
 * never be mistaken for the decision itself.
 */
const namesARejection = (
  endpoint: string,
  fields: Record<string, unknown>,
): boolean =>
  /reject/i.test(endpoint) ||
  Object.values(fields).some(
    (value) => typeof value === 'string' && /^reject/i.test(value),
  );

const decideRequestFrom = (endpoint: string, body: unknown): DecideRequest => {
  const fields = fieldsOf(body);
  const note = fields.UserNote;
  return {
    TransactionId: transactionIdIn(endpoint, fields),
    rejection: namesARejection(endpoint, fields),
    ...(typeof note === 'string' ? { UserNote: note } : {}),
  };
};

/** What `GET /v1/transactions` currently answers with — the fake service's state. */
let servedRequests: TransactionRead[] = [];

/** Every decide call the browser has made, in order. */
let decideRequests: DecideRequest[] = [];

/** Serve these requests as the whole fetched set — one response, no paging. */
const serveTransactions = (transactions: TransactionRead[]): void => {
  servedRequests = transactions;
};

/**
 * `userEvent` for a screen with Radix dialogs on it: Radix parks
 * `pointer-events: none` on the body while a modal is open, and jsdom then reports
 * the dialog's own controls as un-clickable even though a real browser lets them
 * through.
 */
const setupUser = (): User =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderRequestList = async (
  roles: ProjectRole[] = [ROLE_APPROVER],
): Promise<void> => {
  render(
    <ToastProvider>
      <ExpenseRequestList roles={roles} />
      <ToastContainer />
    </ToastProvider>,
  );
  await screen.findByRole('table');
};

/**
 * The table row for a named request, found by the reference the row carries rather
 * than by position (testing-policy.md § anti-pattern 7).
 *
 * Deliberately found by TEXT rather than through the table's role: while a modal
 * dialog is open Radix marks the rest of the page `aria-hidden`, which takes the
 * table out of the accessibility tree. Role queries INSIDE the row are therefore
 * only made while no dialog is open.
 */
const rowFor = (reference: string): HTMLElement => {
  const row = screen.getByText(reference).closest('tr');
  if (row === null) {
    throw new Error(
      `No table row found for "${reference}" — the expense request list must ` +
        'render one row per request, carrying its Reference.',
    );
  }
  return row;
};

/**
 * One of a request's two decide controls, on the row itself (story 2's placement):
 * a plain `button` in the row, one activation away.
 */
const decideControlOn = (reference: string, action: RegExp): HTMLElement =>
  within(rowFor(reference)).getByRole('button', { name: action });

/** Takes one of a request's offered decisions, by name. */
const chooseAction = async (
  user: User,
  reference: string,
  action: RegExp,
): Promise<void> => {
  await user.click(decideControlOn(reference, action));
};

/** Starts a rejection and hands back the note field it must ask for. */
const startRejecting = async (
  user: User,
  reference: string,
): Promise<HTMLElement> => {
  await chooseAction(user, reference, REJECT_ACTION);
  return await screen.findByRole('textbox', { name: NOTE_FIELD });
};

/** Submits the note step, whatever is (or is not) in the field. */
const submitNote = async (user: User): Promise<void> => {
  await user.click(screen.getByRole('button', { name: CONTINUE }));
};

/** Backs out of whatever is open, the way a keyboard user does. */
const dismissWithEscape = async (user: User): Promise<void> => {
  await user.keyboard('{Escape}');
  await waitFor(() => {
    expect(
      screen.queryByRole('textbox', { name: NOTE_FIELD }),
    ).not.toBeInTheDocument();
  });
};

describe('Epic expense-decisions, Story 3: reject a request with a note', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    servedRequests = [];
    decideRequests = [];

    mockGet.mockImplementation(async (endpoint: string) => {
      const path = String(endpoint);
      if (!path.includes('/v1/transactions')) {
        throw new Error(
          `Unexpected read of "${path}" — this screen reads the one expense ` +
            'request list and nothing else; there is no per-request read.',
        );
      }
      return transactionListResponse(servedRequests);
    });

    // The fake decide service: it records the decision and answers the generic
    // envelope, which says nothing about the request's new state (brief BR1). A
    // later read is where the outcome actually shows up.
    mockPost.mockImplementation(async (endpoint: string, body?: unknown) => {
      const path = String(endpoint);
      if (!DECIDE_ENDPOINT.test(path)) {
        throw new Error(
          `Unexpected POST to "${path}" — a decision goes through the app's own ` +
            'decide route (lib/api/decisions.ts), never straight at the ' +
            'transactions service and never from a component.',
        );
      }
      const decision = decideRequestFrom(path, body);
      decideRequests.push(decision);
      servedRequests = servedRequests.map((request) =>
        decision.rejection && request.Id === decision.TransactionId
          ? transactionDecided(request, {
              status: TRANSACTION_STATUS_REJECTED,
              note: decision.UserNote,
            })
          : request,
      );
      return rejectSuccessResponse(decision.TransactionId);
    });
  });

  // AC-1
  it('asks for a note when Reject is chosen — before anything is recorded — and asks for none when Approve is chosen', async () => {
    const user = setupUser();
    const request = createTransaction();
    // Fixture precondition: the request is still awaiting a decision, so both
    // actions are on offer in the first place (brief BR3).
    expect(request.Status).toBe(TRANSACTION_STATUS_IMPORTED);
    serveTransactions([request]);

    await renderRequestList();

    // --- Reject asks for a note, and records nothing yet -------------------
    const note = await startRejecting(user, request.Reference);
    expect(note).toBeVisible();
    // Nothing has been sent: the note is being asked for BEFORE any decision.
    expect(decideRequests).toEqual([]);

    await dismissWithEscape(user);
    // Backing out of the note leaves the request exactly as it was.
    expect(rowFor(request.Reference)).toHaveTextContent(
      TRANSACTION_STATUS_IMPORTED,
    );
    expect(decideRequests).toEqual([]);

    // --- Approve asks for no note at all (R9) ------------------------------
    await chooseAction(user, request.Reference, APPROVE_ACTION);

    const confirmation = await screen.findByRole('alertdialog');
    // The approval goes straight to its confirmation: there is nothing to write,
    // in the confirmation or anywhere else on the screen.
    expect(within(confirmation).queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: NOTE_FIELD }),
    ).not.toBeInTheDocument();
  });

  // AC-2
  it('refuses a blank note and a spaces-only note in the brief’s exact words, on submitting rather than while typing, and records nothing', async () => {
    const user = setupUser();
    const request = createTransaction();
    serveTransactions([request]);

    await renderRequestList();

    const note = await startRejecting(user, request.Reference);
    // Nothing is being complained about before the user has done anything.
    expect(screen.queryByText(NOTE_REQUIRED_MESSAGE)).not.toBeInTheDocument();

    // --- typing an unacceptable value raises NOTHING ----------------------
    // The whole point of AC-2: the rule is checked on submit, never on keystroke
    // (brief BR4, requirements §6.3). A field that complains here fails this story.
    await user.type(note, WHITESPACE_ONLY_NOTE);
    expect(note).toHaveValue(WHITESPACE_ONLY_NOTE);
    expect(screen.queryByText(NOTE_REQUIRED_MESSAGE)).not.toBeInTheDocument();

    // --- submitting a spaces-only note is refused, in those exact words -----
    await submitNote(user);

    expect(await screen.findByText(NOTE_REQUIRED_MESSAGE)).toBeVisible();
    // The flow did not move on to the confirmation, and nothing was sent. Asserted
    // as the confirmation's ABSENCE rather than as "no Reject control anywhere":
    // the request's row carries its own Reject the whole time (story 2's placement),
    // so a name-based sweep would be answered by the row rather than by the step.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(decideRequests).toEqual([]);
    // The note is still being asked for — the refusal held the flow where it was.
    expect(note).toBeVisible();

    // --- and an empty note is refused the same way -------------------------
    await user.clear(note);
    await submitNote(user);

    expect(await screen.findByText(NOTE_REQUIRED_MESSAGE)).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(decideRequests).toEqual([]);

    // The request itself was never touched by any of it.
    await dismissWithEscape(user);
    expect(rowFor(request.Reference)).toHaveTextContent(
      TRANSACTION_STATUS_IMPORTED,
    );
    expect(decideRequests).toEqual([]);
  });

  // AC-3
  it('asks the Approver to confirm a written rejection, naming the request and the action with Cancel holding focus, and records nothing when it is cancelled', async () => {
    const user = setupUser();
    const request = createTransaction();
    serveTransactions([request]);

    await renderRequestList();

    const note = await startRejecting(user, request.Reference);
    await user.type(note, REJECTION_NOTE);
    await submitNote(user);

    // --- the confirmation names the request AND the action (R10/BR6) -------
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent(request.Reference);
    expect(confirmation).toHaveTextContent(/reject/i);

    // The way out holds focus, so confirming is never what a stray Enter does —
    // even though the flow now has an editable field earlier in it (NFR2).
    const wayOut = within(confirmation).getByRole('button', { name: WAY_OUT });
    await waitFor(() => {
      expect(wayOut).toHaveFocus();
    });

    // --- backing out records nothing at all --------------------------------
    await user.click(wayOut);
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(decideRequests).toEqual([]);
    // ...and leaves the request awaiting a decision, still offering the action.
    expect(rowFor(request.Reference)).toHaveTextContent(
      TRANSACTION_STATUS_IMPORTED,
    );
    expect(decideControlOn(request.Reference, REJECT_ACTION)).toBeVisible();
  });

  // AC-4
  // Data-contract: that the real client reaches the app's own decide route, which
  // stamps the decision with the signed-in identity and forwards it to the
  // transactions service, is verified in the browser and on the manual checklist.
  it('records the rejection with its note once confirmed: the request reads Rejected, its note is shown with it, the decide actions are withdrawn and a confirmation is raised', async () => {
    const user = setupUser();
    const request = createTransaction();
    // A second request awaiting a decision, so a decision that spilled onto every
    // request — or onto the wrong one — cannot pass unnoticed.
    const otherRequest = transactionWithStatus(TRANSACTION_STATUS_IMPORTED, {
      Id: 7051,
      Reference: 'TXN-20260415-0051',
      AccountNumber: '1001-2034-5551',
      Description: 'Woolworths Sandton',
      Amount: 480.25,
      TransactionDate: '2026-04-16 07:45:00',
    });
    serveTransactions([request, otherRequest]);

    await renderRequestList();

    const note = await startRejecting(user, request.Reference);
    await user.type(note, REJECTION_NOTE);
    await submitNote(user);

    const confirmation = await screen.findByRole('alertdialog');
    await user.click(
      within(confirmation).getByRole('button', { name: REJECT_ACTION }),
    );

    // --- the rejection was sent for THIS request, carrying THIS note --------
    await waitFor(() => {
      expect(decideRequests).toEqual([
        {
          TransactionId: request.Id,
          rejection: true,
          ...rejectionWriteBody(REJECTION_NOTE),
        },
      ]);
    });

    // --- the request now reads Rejected, and only that request --------------
    await waitFor(() => {
      expect(rowFor(request.Reference)).toHaveTextContent(
        TRANSACTION_STATUS_REJECTED,
      );
    });
    expect(rowFor(otherRequest.Reference)).toHaveTextContent(
      TRANSACTION_STATUS_IMPORTED,
    );

    // --- the Approver is told, in a message naming the request (R15) --------
    const notification = await screen.findByRole('region', {
      name: /notifications/i,
    });
    expect(notification).toHaveTextContent(request.Reference);
    expect(notification).toHaveTextContent(/rejected/i);

    // --- the decide actions are withdrawn from it (R12) ---------------------
    // From the row, where they live...
    const decidedRow = rowFor(request.Reference);
    expect(
      within(decidedRow).queryByRole('button', { name: REJECT_ACTION }),
    ).not.toBeInTheDocument();
    expect(
      within(decidedRow).queryByRole('button', { name: APPROVE_ACTION }),
    ).not.toBeInTheDocument();
    // The other request, still awaiting a decision, keeps both — so these are
    // absences about THIS request rather than a screen that has stopped offering
    // decisions at all.
    expect(
      decideControlOn(otherRequest.Reference, REJECT_ACTION),
    ).toBeVisible();

    // ...while the decided request keeps the one control it still owes a reader:
    // Open, which is how the note below is reached.
    const openControl = within(decidedRow).getByRole('button', {
      name: OPEN_ACTION,
    });
    expect(openControl).toBeVisible();

    // --- and the note is shown with the request it was written for ----------
    await user.click(openControl);

    const panel = await screen.findByRole('dialog');
    expect(panel).toHaveTextContent(TRANSACTION_STATUS_REJECTED);
    expect(panel).toHaveTextContent(REJECTION_NOTE);
  });
});
