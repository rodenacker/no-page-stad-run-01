/**
 * Story Metadata:
 * - Epic: bulk-approval-and-live-refresh — Story 2: approve the whole selection
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — bulk approve asks first, naming the selection's EXACT count in full
 *   (even at 100+), with the way out holding focus; backing out changes nothing;
 * - AC-2 — confirming approves every selected request still Imported, and those
 *   requests then read Approved;
 * - AC-3 — a request a colleague decided since it was selected is never
 *   submitted, and the outcome reports approved / left-unchanged separately;
 * - AC-4 — while the batch runs the list stays readable, the selection and bulk
 *   controls cannot be used, and the Approver can see it is still running;
 * - AC-6 — a large selection is not fired all at once: approvals run at a bounded
 *   concurrency (NFR3).
 *
 * AC-5 (in a real browser, selecting several requests and confirming records
 * every one of them and the list shows the recorded statuses without a reload) is
 * the Playwright spec's — one tag, one layer.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE SURFACE IS THE EXISTING LIST. The component under test is
 *    `web/src/components/requests/ExpenseRequestList.tsx`, fed `roles` by the
 *    server page exactly as it is today. Story 1 of this epic adds the selection
 *    layer to it (a `checkbox` per still-Imported request for an Approver, a
 *    "Select all…" checkbox, the ambient count); this story adds the bulk action
 *    to the same list. No second list, no second route, no new server gate.
 * 2. THE BULK CONTROL is a single button in the list's own toolbar whose
 *    accessible name says it acts on the SELECTION — "Approve selected requests"
 *    / "Approve 3 selected requests" both satisfy the query below. It must not be
 *    confusable with the per-request "Approve request TXN-…" controls
 *    `expense-decisions` put directly on every row.
 * 3. THE CONFIRMATION IS THE SHARED ONE — `components/common/ConfirmAction.tsx`
 *    (Radix `alertdialog`, way out first and focused, nothing happens until the
 *    confirming choice is taken). Do NOT build a second confirmation convention.
 *    Per BR4 its copy carries the selection's LITERAL count, however large:
 *    "Approve 120 selected expense requests?" — never R4/UI-20's ambient "99+"
 *    form, which stays outside the confirmation. It prints no account number: the
 *    confirmation is a listing surface (project.md §Compliance, POPIA).
 * 4. THE APPROVE CALL IS THE ONE THAT ALREADY EXISTS — `recordDecision` from
 *    `web/src/lib/api/decisions.ts`, one call per request (BR3), posting to the
 *    app's own `/api/decisions` route which stamps the decider from the session.
 *    Never a second approve path, never `/transactions-api/*` directly, never a
 *    client-supplied identity. Only `@/lib/api/client` is mocked below, so
 *    `lib/api/decisions.ts` is exercised for real and the assertions on what left
 *    the browser are assertions on that module's real output.
 * 5. THE PRE-SUBMIT RE-CHECK IS REAL AND LOAD-BEARING (BR1/BR2). An accepted
 *    confirmation FIRST re-reads `GET /v1/transactions` (`fetchTransactions`) and
 *    drops every selected request no longer `Imported`; no approve call is ever
 *    made for those. `expense-decisions` inlined this idea for ONE request inside
 *    `ExpenseRequestList`; this story extracts it into `lib/transactions/` and
 *    uses the extracted helper for both paths rather than copying it.
 * 6. THE OUTCOME COMES FROM A RECONCILIATION READ, NOT FROM THE CALL BODIES
 *    (BR5). `POST /v1/transactions/approve` answers the same envelope whether it
 *    approved a request or found it already decided — the mock below returns
 *    literally the same body for both, so an implementation that parses the
 *    answer cannot pass. The counts come from comparing each selected request's
 *    status in the PRE-SUBMIT read to its status in the read taken after the
 *    batch.
 * 7. THE OUTCOME REPORT is the root layout's one notification surface
 *    (`useToast` / `ToastContainer`, `role="region"` named "Notifications"), and
 *    it names both buckets in figures: "3 approved, 0 left unchanged", and
 *    "2 approved, 1 left unchanged because they had already been decided". The
 *    queries below pin the phrases "N approved" and "N left unchanged" and the
 *    reason wording "already been decided". It prints no account number either.
 * 8. WHILE THE BATCH IS IN FLIGHT the list stays readable (rows keep their place
 *    — no placeholder over them) and a progress line says how many are being
 *    approved: "Approving 3 requests…", inside the `role="status"` live region
 *    this component already announces an in-flight decision through. Keep the
 *    sentence in ONE element (the query reads an element's own text, not its
 *    children's).
 *    The selection controls and the bulk action are DISABLED for the duration —
 *    the one place this project shows a disabled control rather than hiding it,
 *    because this is transient state, not a permission (BR10's hidden-not-
 *    disabled rule governs WHO may act, and is story 1's).
 * 9. CONCURRENCY IS BOUNDED AT FIVE (NFR3). The batch runs at most five approve
 *    calls at once — NFR3's stated default — and AC-6 pins that number against a
 *    selection of twelve, so both ways of getting it wrong fail: all twelve at
 *    once (a flooded service and a stalled screen at the 10,000-row volume) and
 *    one at a time (a serial batch nobody can sit through). Name the bound
 *    `BULK_APPROVE_CONCURRENCY` in `web/src/lib/transactions/bulkApproval.ts` —
 *    the module that also owns the batch runner and the re-check extracted per
 *    item 5 — so story 3's retry runs at the same bound rather than its own.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy). Every body comes from the project-wide
 * factory in `@/mocks/data/transaction`, shared with the Playwright layer, and
 * the mocks behave like a SERVICE rather than a script: each read answers with
 * what the service currently holds, and an accepted approve call changes what it
 * holds. That is what makes the successive snapshots this epic turns on — the
 * pre-submit re-check and the reconciliation read — real reads of a moving state.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): there is no
 * selection, no bulk action and no `lib/transactions/bulkApproval.ts` yet.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the shared list every epic so far has extended.
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// The real production notification composition (not mocked): the same one the
// root layout wraps every signed-in screen in, and the only surface the outcome
// of a bulk approval may be reported through.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get, post } from '@/lib/api/client';
import { DECISION_APPROVE, DECISIONS_ENDPOINT } from '@/lib/api/decisions';

// Project-wide Transaction factory: the single source of truth for the wire
// shape and its canonical values, shared with the Playwright layer. Never
// hand-write a response body in a test.
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  alreadyDecidedResponse,
  approveSuccessResponse,
  transactionListResponse,
  transactionsAfterApproving,
  transactionsAfterColleagueDecided,
  transactionsForBulkSelection,
} from '@/mocks/data/transaction';
import { ROLE_APPROVER } from '@/types/auth';

import type { TransactionRead } from '@/mocks/data/transaction';
import type { DefaultResponse } from '@/types/api';

vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockGet = get as unknown as ReturnType<typeof vi.fn>;
const mockPost = post as unknown as ReturnType<typeof vi.fn>;

type User = ReturnType<typeof userEvent.setup>;

/* -------------------------------------------------------------------------- */
/* The service, as these tests model it                                        */
/* -------------------------------------------------------------------------- */

/**
 * What the transactions service currently holds. EVERY `GET /v1/transactions` is
 * answered from this one value — the first read, the pre-submit re-check (BR2)
 * and the reconciliation read (BR5) alike — so the successive snapshots this epic
 * is built on are genuine reads of a state that moves underneath the screen.
 */
let served: TransactionRead[] = [];

/** Puts a set of requests behind `GET /v1/transactions`. */
const serve = (requests: TransactionRead[]): void => {
  served = requests;
};

/** Every decide call that actually left the browser, in the order they were sent. */
const decisionsSent: unknown[][] = [];

/**
 * The most approve calls this batch may have out at once (NFR3, contract item 9).
 * Stated here as well as in `lib/transactions/bulkApproval.ts` because this test
 * is what fixes the number: it is asserted against a selection of twelve, so an
 * unbounded batch (twelve at once) and a serial one (one at a time) both fail.
 */
const BULK_APPROVE_CONCURRENCY = 5;

/** How many approve calls are out at this instant, and the most there ever were. */
let approvalsInFlight = 0;
let peakApprovalsInFlight = 0;

/** An approve call the test is holding open, so a batch can be inspected mid-flight. */
interface HeldApproval {
  release: () => void;
}
const heldApprovals: HeldApproval[] = [];
let holdApprovals = false;

/**
 * The `TransactionId` one recorded call carried — and, on the way, the two things
 * about that call this story's BR3 fixes: it goes to the app's OWN decide route
 * (which stamps who decided it from the session), and it is an approval. Stated
 * as thrown preconditions rather than assertions so a wrong call names itself.
 */
const transactionIdIn = (call: unknown[]): number => {
  const [endpoint, body] = call;
  if (endpoint !== DECISIONS_ENDPOINT) {
    throw new Error(
      `A bulk approval must go through the app's own decide route (${DECISIONS_ENDPOINT}, ` +
        'lib/api/decisions.ts), which stamps the decider from the session — found a call ' +
        `to "${String(endpoint)}".`,
    );
  }
  if (typeof body !== 'object' || body === null) {
    throw new Error(
      'A decide call must carry a body naming the one request it decides (BR3).',
    );
  }
  const { TransactionId, Decision } = body as {
    TransactionId?: unknown;
    Decision?: unknown;
  };
  if (typeof TransactionId !== 'number') {
    throw new Error(
      'Each call decides exactly ONE request, named by its numeric TransactionId ' +
        '(BR3 — there is no bulk endpoint); found ' +
        `${JSON.stringify(body)}.`,
    );
  }
  if (Decision !== DECISION_APPROVE) {
    throw new Error(
      `A bulk approval sends "${DECISION_APPROVE}" decisions; found ` +
        `"${String(Decision)}".`,
    );
  }
  return TransactionId;
};

/** The requests this batch actually asked the service to approve, by id. */
const approvalsSent = (): number[] =>
  decisionsSent.map((call) => transactionIdIn(call));

/** Ids in a fixed order, so a comparison does not depend on the batch's own order. */
const inIdOrder = (ids: number[]): number[] =>
  [...ids].sort((first, second) => first - second);

/**
 * The service recording one approval: an `Imported` request becomes Approved and
 * every later read says so.
 *
 * The answer is the SAME `DefaultResponse` envelope either way — the already-
 * decided fixture returns `approveSuccessResponse` field for field, which is this
 * epic's central design constraint stated as data (brief §Notes & Caveats). An
 * implementation that reads the outcome out of this body is reading it out of a
 * body that does not carry it.
 */
const recordApproval = (id: number): DefaultResponse => {
  const target = served.find((request) => request.Id === id);
  if (target === undefined) {
    throw new Error(
      `An approve call named request ${String(id)}, which the service does not hold.`,
    );
  }
  if (target.Status !== TRANSACTION_STATUS_IMPORTED) {
    // Already decided: nothing is recorded, and the caller cannot tell.
    return alreadyDecidedResponse(id);
  }
  served = transactionsAfterApproving(served, [id]);
  return approveSuccessResponse(id);
};

/** Lets every held approval through, and answers at once from then on. */
const releaseHeldApprovals = async (): Promise<void> => {
  holdApprovals = false;
  const waiting = [...heldApprovals];
  heldApprovals.length = 0;
  for (const held of waiting) {
    held.release();
  }
  await waitFor(() => {
    expect(approvalsInFlight).toBe(0);
  });
};

/* -------------------------------------------------------------------------- */
/* The screen, and the way this story's controls name themselves               */
/* -------------------------------------------------------------------------- */

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderList = () =>
  render(
    <ToastProvider>
      <ExpenseRequestList roles={[ROLE_APPROVER]} />
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

/**
 * The bulk action, named for the SELECTION it acts on — never confusable with the
 * per-request "Approve request TXN-…" control on every row (contract item 2).
 */
const BULK_APPROVE_ACTION = /^approve\b.*\bselected\b/i;

/** Story 1's select-everything-currently-listed control (contract item 1). */
const SELECT_ALL_CONTROL = /select all/i;

/** The way out of the shared confirmation, which holds focus when it opens. */
const WAY_OUT_OF_CONFIRMATION = /^cancel\b/i;

/** The confirming choice inside the confirmation. */
const CONFIRMING_CHOICE = /^approve\b/i;

/** The progress line, naming how many are being approved (contract item 8). */
const approvingReads = (count: number): RegExp =>
  new RegExp(`\\bapproving ${String(count)}\\b`, 'i');

/** The outcome's two buckets, in figures (contract item 7). */
const approvedReads = (count: number): RegExp =>
  new RegExp(`\\b${String(count)} approved\\b`, 'i');
const leftUnchangedReads = (count: number): RegExp =>
  new RegExp(`\\b${String(count)} left unchanged\\b`, 'i');

/** One request's selection control, on its own row. */
const selectionControlOn = async (reference: string): Promise<HTMLElement> =>
  await waitFor(() => within(rowFor(reference)).getByRole('checkbox'));

/** Ticks each named request in turn, as a reader building a selection does. */
const selectRequests = async (
  user: User,
  requests: TransactionRead[],
): Promise<void> => {
  for (const request of requests) {
    await user.click(await selectionControlOn(request.Reference));
  }
};

/** Takes the select-everything-currently-listed choice. */
const selectEverythingListed = async (user: User): Promise<void> => {
  await user.click(
    await screen.findByRole('checkbox', { name: SELECT_ALL_CONTROL }),
  );
};

/** The bulk action itself, wherever the toolbar puts it. */
const bulkApproveControl = async (): Promise<HTMLElement> =>
  await screen.findByRole('button', { name: BULK_APPROVE_ACTION });

/** Asks to approve the selection, and hands back the confirmation it opens. */
const chooseBulkApprove = async (user: User): Promise<HTMLElement> => {
  await user.click(await bulkApproveControl());
  return await screen.findByRole('alertdialog');
};

/** Takes the confirming choice inside an open confirmation. */
const confirmBulkApprove = async (
  user: User,
  confirmation: HTMLElement,
): Promise<void> => {
  await user.click(
    within(confirmation).getByRole('button', { name: CONFIRMING_CHOICE }),
  );
};

/** The requests in a fixture set that are still awaiting a decision. */
const stillImportedIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status === TRANSACTION_STATUS_IMPORTED);

/** The app's one notification surface, where the outcome is reported. */
const outcomeReport = async (): Promise<HTMLElement> =>
  await screen.findByRole('region', { name: /notifications/i });

describe('Epic bulk-approval-and-live-refresh, Story 2: approve the whole selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    served = [];
    decisionsSent.length = 0;
    heldApprovals.length = 0;
    holdApprovals = false;
    approvalsInFlight = 0;
    peakApprovalsInFlight = 0;

    mockGet.mockImplementation(() =>
      Promise.resolve(transactionListResponse(served)),
    );

    mockPost.mockImplementation(
      (...args: unknown[]): Promise<DefaultResponse> => {
        decisionsSent.push(args);
        const id = transactionIdIn(args);
        approvalsInFlight += 1;
        peakApprovalsInFlight = Math.max(
          peakApprovalsInFlight,
          approvalsInFlight,
        );

        const answer = (): DefaultResponse => {
          approvalsInFlight -= 1;
          return recordApproval(id);
        };

        if (!holdApprovals) {
          return Promise.resolve().then(answer);
        }
        return new Promise<DefaultResponse>((resolve) => {
          heldApprovals.push({
            release: () => {
              resolve(answer());
            },
          });
        });
      },
    );
  });

  // AC-1
  it('asks the Approver to confirm first, naming the exact number selected in full even past a hundred, and changes nothing when they back out', async () => {
    const user = userEvent.setup();

    // 120 imported requests — past R4/UI-20's "99+" threshold, which is exactly
    // where BR4 says the confirmation must still say the real number, because a
    // large selection is where the count matters most.
    const requests = transactionsForBulkSelection(120);
    const imported = stillImportedIn(requests);
    const onScreen = imported[0];
    serve(requests);

    renderList();

    await selectEverythingListed(user);

    const confirmation = await chooseBulkApprove(user);

    // The literal count, in full...
    expect(confirmation).toHaveTextContent(
      new RegExp(`\\b${String(imported.length)}\\b`),
    );
    // ...and never the ambient indicator's truncated form (BR4).
    expect(confirmation).not.toHaveTextContent('99+');
    // ...and naming a selection does not defeat the masking the list applies:
    // the confirmation is a listing surface (project.md §Compliance, POPIA).
    expect(confirmation).not.toHaveTextContent(onScreen.AccountNumber);

    // The way out holds focus, so a stray Enter approves nothing at all — the
    // project's confirmation convention, and it matters most for an action that
    // cannot be undone across a hundred-odd requests.
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

    // Nothing at all was sent...
    expect(approvalsSent()).toEqual([]);
    // ...every request is exactly as it was...
    expect(rowFor(onScreen.Reference)).toHaveTextContent(
      TRANSACTION_STATUS_IMPORTED,
    );
    // ...the selection is untouched, so backing out costs the Approver nothing
    // but the confirmation itself...
    expect(
      within(rowFor(onScreen.Reference)).getByRole('checkbox'),
    ).toBeChecked();
    // ...and nothing was announced about an action that did not happen.
    expect(
      screen.queryByRole('region', { name: /notifications/i }),
    ).not.toBeInTheDocument();
  });

  // AC-2
  it('approves every selected request still Imported once the confirmation is accepted, and leaves everything else alone', async () => {
    const user = userEvent.setup();

    const requests = transactionsForBulkSelection(5);
    const imported = stillImportedIn(requests);
    const chosen = imported.slice(0, 3);
    const notChosen = imported.slice(3);
    serve(requests);

    renderList();

    await selectRequests(user, chosen);
    await confirmBulkApprove(user, await chooseBulkApprove(user));

    // Each selected request now reads Approved — the status as TEXT beside its
    // intent colour, never colour alone.
    for (const request of chosen) {
      await waitFor(() => {
        expect(rowFor(request.Reference)).toHaveTextContent(
          TRANSACTION_STATUS_APPROVED,
        );
      });
    }

    // One approve call per selected request and no others (BR3 — there is no
    // bulk endpoint, so the batch IS N single-request calls).
    expect(inIdOrder(approvalsSent())).toEqual(
      inIdOrder(chosen.map((request) => request.Id)),
    );

    // The action applies to exactly the selection, no more: the requests that
    // were left unticked are still awaiting a decision (R2).
    for (const request of notChosen) {
      expect(rowFor(request.Reference)).toHaveTextContent(
        TRANSACTION_STATUS_IMPORTED,
      );
    }

    // ...and the Approver is told what became of the selection.
    expect(await outcomeReport()).toHaveTextContent(approvedReads(3));
  });

  // AC-3
  it('never submits a request a colleague decided since it was selected, and reports it as left unchanged rather than approved', async () => {
    const user = userEvent.setup();

    const requests = transactionsForBulkSelection(5);
    const imported = stillImportedIn(requests);
    const chosen = imported.slice(0, 3);
    const raced = chosen[2];
    serve(requests);

    renderList();

    await selectRequests(user, chosen);

    // Between building the selection and confirming it, another approver decides
    // one of the chosen requests. Deliberately an APPROVAL by a colleague: it
    // leaves the request in the same status this batch would have produced, so an
    // implementation that computes its outcome from the state at SELECTION time —
    // rather than from the pre-submit read (BR2) — reports it as one of ours and
    // fails here. A colleague's rejection would let that bug through.
    serve(transactionsAfterColleagueDecided(served, [raced.Id]));

    await confirmBulkApprove(user, await chooseBulkApprove(user));

    await waitFor(() => {
      expect(rowFor(chosen[0].Reference)).toHaveTextContent(
        TRANSACTION_STATUS_APPROVED,
      );
    });

    // The raced request was never sent at all (BR1/BR2): the fresh read taken
    // before the batch found it already decided, and an approve call for it would
    // have come back looking exactly like a successful one.
    expect(inIdOrder(approvalsSent())).toEqual(
      inIdOrder([chosen[0].Id, chosen[1].Id]),
    );

    // ...and the outcome keeps the two apart, in figures and in plain words —
    // computed by comparing status before and after (BR5), because the call
    // bodies cannot carry that distinction.
    const report = await outcomeReport();
    expect(report).toHaveTextContent(approvedReads(2));
    expect(report).toHaveTextContent(leftUnchangedReads(1));
    expect(report).toHaveTextContent(/already been decided/i);
    // The report is a listing too: it names counts, never account numbers.
    expect(report).not.toHaveTextContent(raced.AccountNumber);
  });

  // AC-4
  it('keeps the list readable but the selection and bulk controls unusable while the approvals are being recorded, and says it is still running', async () => {
    const user = userEvent.setup();

    const requests = transactionsForBulkSelection(5);
    const imported = stillImportedIn(requests);
    const chosen = imported.slice(0, 3);
    serve(requests);

    renderList();

    await selectRequests(user, chosen);

    // The approvals are held open, so the batch can be inspected mid-flight.
    holdApprovals = true;
    await confirmBulkApprove(user, await chooseBulkApprove(user));

    // The Approver can see it is still running — announced from the same polite
    // live region an in-flight single decision already speaks through, so it
    // reaches a screen-reader user without stealing their place.
    const progress = await screen.findByText(approvingReads(chosen.length));
    expect(progress).toBeVisible();
    expect(progress.closest('[role="status"]')).not.toBeNull();

    // The list itself stays readable — the rows keep their place and their
    // statuses; nothing is blanked or replaced by a placeholder.
    expect(screen.getByRole('table')).toBeVisible();
    expect(rowFor(chosen[0].Reference)).toHaveTextContent(
      TRANSACTION_STATUS_IMPORTED,
    );

    // ...while the selection cannot be changed underneath the batch and a second
    // bulk approval cannot be started on top of it.
    expect(
      within(rowFor(chosen[0].Reference)).getByRole('checkbox'),
    ).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: SELECT_ALL_CONTROL }),
    ).toBeDisabled();
    expect(await bulkApproveControl()).toBeDisabled();

    await releaseHeldApprovals();

    // Once it is done every selected request reads Approved...
    for (const request of chosen) {
      await waitFor(() => {
        expect(rowFor(request.Reference)).toHaveTextContent(
          TRANSACTION_STATUS_APPROVED,
        );
      });
    }
    // ...and the screen stops saying an action is still running, because it is not.
    expect(
      screen.queryByText(approvingReads(chosen.length)),
    ).not.toBeInTheDocument();
    expect(await outcomeReport()).toHaveTextContent(approvedReads(3));
  });

  // AC-6
  it('sends a large selection a few approvals at a time rather than all at once, and still approves every one of them', async () => {
    const user = userEvent.setup();

    // Twelve requests against a bound of five: more than twice the bound, so a
    // batch that fires everything at once and a batch that sends them one after
    // another are both plainly distinguishable from a bounded one.
    const requests = transactionsForBulkSelection(12);
    const imported = stillImportedIn(requests);
    serve(requests);

    renderList();

    await selectEverythingListed(user);
    await confirmBulkApprove(user, await chooseBulkApprove(user));

    // Every selected request is approved...
    await waitFor(() => {
      expect(inIdOrder(approvalsSent())).toEqual(
        inIdOrder(imported.map((request) => request.Id)),
      );
    });
    expect(await outcomeReport()).toHaveTextContent(
      approvedReads(imported.length),
    );

    // ...but never more than the batch's own bound were ever out at once, so a
    // selection that can run to thousands neither floods the service nor leaves
    // the screen unusable for the duration.
    expect(peakApprovalsInFlight).toBe(BULK_APPROVE_CONCURRENCY);
  });
});
