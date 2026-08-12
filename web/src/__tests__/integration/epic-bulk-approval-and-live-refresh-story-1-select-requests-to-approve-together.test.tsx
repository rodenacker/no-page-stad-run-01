/**
 * Story Metadata:
 * - Epic: bulk-approval-and-live-refresh — Story 1: select requests to approve
 *   together
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — an Approver is offered a selection control on every request still
 *   Imported, and none on a request already Approved or Rejected;
 * - AC-2 — a Finance Uploader (the auth service's `Importer`) is offered no
 *   selection control and no bulk-approve action anywhere on the list — absent
 *   from the screen, never shown disabled;
 * - AC-3 — while anything is selected the count of selected requests is visible,
 *   and with nothing selected the indicator is not on the screen at all;
 * - AC-4 — the count reads the exact number up to 99 and reads "99+" from 100;
 * - AC-6 — searching, sorting and paging change neither what is selected nor the
 *   count: a selected request stays selected while it is off the page being read,
 *   and is still ticked when the reader gets back to it.
 *
 * AC-5 (selecting, selecting everything currently listed and clearing the
 * selection all completable by keyboard alone) is the Playwright spec's — a real
 * browser's own focus order and key handling, which jsdom does not model
 * (testing-policy.md § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these assertions pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE SELECTION LAYER ATTACHES TO THE LIST THAT ALREADY EXISTS — do not build
 *    a second one. The component under test is
 *    `web/src/components/requests/ExpenseRequestList.tsx`, still fed `roles` by
 *    the server page (`rolesOf(session)`), which already owns the single fetch,
 *    the narrow → order → slice pipeline and the three non-data states. No second
 *    list, no wrapper around it, no new route and no change to
 *    `lib/auth/access-map.ts`: `/requests` is registered for both roles and must
 *    stay that way, because what only ONE role may DO is a check on the control
 *    inside the screen (BR10).
 * 2. EACH REQUEST'S SELECTION CONTROL IS A CHECKBOX (`role="checkbox"`, i.e. the
 *    Shadcn `checkbox` primitive — `npx shadcn add checkbox`, not a hand-rolled
 *    `<div>` with a tick in it), living in the request's own row (and, at phone
 *    width, its own card). Its accessible name begins with "Select" and goes on
 *    to name the request by its `Reference` ("Select request TXN-20260415-0001"):
 *    with one control per listed request, a bare "Select" would be a screenful of
 *    identical controls to a screen-reader user. The queries below match any name
 *    of that shape.
 * 3. WHO is offered them is read from `roles` — `ROLE_APPROVER` and nobody else —
 *    and WHICH requests offer them is `Status === 'Imported'`
 *    (`TRANSACTION_STATUS_IMPORTED` / `isKnownTransactionStatus` from
 *    `@/types/transactions`, never a fresh string literal). Everyone and
 *    everything else is offered NOTHING AT ALL: absent, never disabled and never
 *    greyed out (BR10, the hidden-not-disabled rule this project uses
 *    everywhere). The queries below find disabled controls too, so a greyed-out
 *    tick fails exactly as a working one would.
 * 4. THE "SELECT EVERYTHING CURRENTLY LISTED" CONTROL is a checkbox too, named
 *    "Select all …" ("Select all listed requests"). It selects every still-
 *    Imported request the active search and filters LEFT — not only the page on
 *    screen, and not the whole fetched set (settled decision 1 at the stories
 *    approval). AC-4's test drives it with 100 imported requests and a page size
 *    of 20, so an implementation that selects only the visible page reads 20 and
 *    fails.
 * 5. THE AMBIENT COUNT INDICATOR is an element with `role="status"` whose
 *    accessible name contains "Selected requests" (an `aria-label` on the
 *    indicator itself), carrying the count as its text. It lives in the LIST's
 *    own toolbar, beside where the bulk action will go — not in the app header,
 *    which project convention keeps unconditional. `role="status"` is deliberate:
 *    a count that changes under the reader is announced politely, never
 *    assertively. The list already renders other, UNNAMED `role="status"`
 *    elements (the tiered wait, decisions in flight), which is why the indicator
 *    must carry a name of its own — the queries below find it by that name.
 * 6. THE COUNT ITSELF: exact up to 99, "99+" from 100, and the indicator is not
 *    rendered at all at zero (R4/UI-20). "Absent at zero" is asserted, not just
 *    "empty": a permanently mounted indicator that renders "0 selected" fails.
 *    The truncation belongs to this ambient indicator ONLY — story 2's
 *    confirmation names the exact count however large it is (BR4).
 * 7. THE SELECTION IS HELD AS A SET OF TRANSACTION IDS, not row positions and not
 *    a per-row flag, so it survives the existing narrow → order → slice pipeline
 *    (settled decision 2). AC-6's test selects two requests, hides them behind a
 *    search, re-orders the list so they land on another page, and expects the
 *    count never to move and both requests still to be ticked when they are
 *    reached again. The known and deliberately accepted consequence — the
 *    Approver may bulk-approve requests that are not currently on screen — is the
 *    behaviour this pins, not a bug to "fix" by clearing the selection on a view
 *    change.
 * 8. PERFORMANCE, and it is a real trap here: `ExpenseRequestRow` and the cards
 *    are memoised on stable props. Pass each row a plain `selected` BOOLEAN and a
 *    callback that TAKES the request — exactly as `possibleDuplicate` and
 *    `onDecide` are passed today. Handing every row the `Set` itself would defeat
 *    that memo on every tick of every selection change and, once story 4 lands,
 *    on every 15-second refresh (architecture.md § Conventions).
 * 9. NOTHING HERE DECIDES ANYTHING. This story adds selection only: no approve
 *    call is sent, no confirmation is opened, and the decide actions
 *    `expense-decisions` put on each row are left exactly as they are. The bulk
 *    action itself is story 2's.
 * 10. MASKING STILL HOLDS. The selection surface is a listing, so no row may
 *    print a full account number (POPIA — project.md §Compliance); the existing
 *    `MaskedAccountNumber` on every row is what keeps that true and must not be
 *    worked around to label a selection control.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy). Every response body comes from the
 * project-wide factory in `@/mocks/data/transaction`, shared with the Playwright
 * layer, so the two layers cannot drift onto different shapes;
 * `transactionsForBulkSelection` is that factory's fixture for exactly this
 * story — imported requests PLUS one already Approved and one already Rejected,
 * because a set of nothing but selectable rows cannot tell a correct
 * implementation from one that offers a tick on everything.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): nothing on the
 * list offers a selection control yet, and there is no count indicator to find.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the list this story adds the selection layer to.
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// The real production notification composition (not mocked): the arrangement the
// root layout wraps every signed-in screen in, and the one the list is mounted
// inside.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';

// The chosen ordering belongs to the SESSION, not to the component, so it
// outlives a test unless it is put back — see `beforeEach`.
import { rememberSort } from '@/lib/transactions/sortPreference';

// Project-wide Transaction factory: the single source of truth for the wire
// shape and its canonical values, shared with the Playwright layer. Never
// hand-write a response body in a test.
import {
  TRANSACTION_STATUS_IMPORTED,
  transactionListResponse,
  transactionsForBulkSelection,
} from '@/mocks/data/transaction';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/types/auth';

import type { TransactionRead } from '@/mocks/data/transaction';
import type { ProjectRole } from '@/types/auth';

vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockGet = get as unknown as ReturnType<typeof vi.fn>;

type User = ReturnType<typeof userEvent.setup>;

/** What the transactions service currently holds; every read answers from it. */
let served: TransactionRead[] = [];

/** Puts a set of requests behind `GET /v1/transactions`. */
const serve = (requests: TransactionRead[]): void => {
  served = requests;
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

/** Whether a request is listed on the page currently being read. */
const isListed = (reference: string): boolean =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .some((row) => row.textContent?.includes(reference));

/** How one request's own selection control names itself — contract note 2. */
const selectionControlFor = (reference: string): RegExp =>
  new RegExp(`^select\\b.*${reference}`, 'i');

/** The "select everything currently listed" control — contract note 4. */
const SELECT_ALL_CONTROL = /^select all\b/i;

/** How the ambient count indicator names itself — contract note 5. */
const SELECTION_COUNT_NAME = /selected requests/i;

/** One request's selection control, on its own row. */
const selectionControlOn = async (reference: string): Promise<HTMLElement> =>
  await waitFor(() =>
    within(rowFor(reference)).getByRole('checkbox', {
      name: selectionControlFor(reference),
    }),
  );

/** Ticks or unticks one request. */
const toggleSelectionOf = async (
  user: User,
  reference: string,
): Promise<void> => {
  await user.click(await selectionControlOn(reference));
};

/** The ambient count indicator, or `null` when it is not on the screen at all. */
const countIndicator = (): HTMLElement | null =>
  screen.queryByRole('status', { name: SELECTION_COUNT_NAME });

/** The ambient count indicator, which must be on the screen. */
const shownCountIndicator = (): HTMLElement =>
  screen.getByRole('status', { name: SELECTION_COUNT_NAME });

/**
 * Waits for the indicator to read exactly the given count — as a whole value,
 * not as part of a longer one.
 *
 * The lookahead is what makes the two halves of R4 distinguishable: "99" does NOT
 * satisfy a text of "99+", and "2" does not satisfy "12" or "20". Without it a
 * test for the exact form would pass against the truncated one.
 */
const expectCount = async (count: string): Promise<void> => {
  const wholeValue = new RegExp(
    `(^|[^\\d+])${count.replace('+', '\\+')}(?![\\d+])`,
  );
  await waitFor(() => {
    expect(shownCountIndicator()).toHaveTextContent(wholeValue);
  });
};

/** Every role a selection or bulk-approve control could be offered under. */
const CONTROL_ROLES = [
  'button',
  'checkbox',
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

/**
 * Anything that offers to select, at all. Deliberately broader than the named
 * controls above: the Finance Uploader must find nothing of the sort anywhere,
 * whatever it ended up being called.
 */
const everySelectionControl = (): HTMLElement[] =>
  screen.queryAllByRole('checkbox');

/**
 * Anything offering to approve — the per-request decision an Approver has and the
 * bulk action story 2 adds alike. A Finance Uploader is offered neither
 * (project.md §Roles & Permissions, R7/BR10), so one query covers both.
 */
const APPROVE_ACTION = /^approve\b/i;

/** The requests in a fixture set that are still awaiting a decision. */
const importedIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status === TRANSACTION_STATUS_IMPORTED);

/** The requests in a fixture set somebody has already decided. */
const decidedIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status !== TRANSACTION_STATUS_IMPORTED);

/** The search box the narrowing layer already offers (story 2 of the last epic). */
const searchField = (): HTMLElement =>
  screen.getByRole('searchbox', { name: /search/i });

/** One column's sort control, in the heading row. */
const sortControlFor = (column: RegExp): HTMLElement =>
  screen.getByRole('button', { name: column });

describe('Epic bulk-approval-and-live-refresh, Story 1: select requests to approve together', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    served = [];
    // The ordering is remembered for the session, so a test that sorts would
    // otherwise hand its ordering to the next one.
    rememberSort(null);

    mockGet.mockImplementation(() =>
      Promise.resolve(transactionListResponse(served)),
    );
  });

  // AC-1
  it('offers an Approver a selection control on every request still Imported, and none on one already Approved or Rejected', async () => {
    const requests = transactionsForBulkSelection(6);
    const awaitingDecision = importedIn(requests);
    const alreadyDecided = decidedIn(requests);
    serve(requests);

    // Fixture preconditions, so a set that quietly stopped covering both halves
    // fails here rather than passing an assertion about nothing. Eight requests
    // in all, which the default 20-request page (R12) shows at once.
    expect(awaitingDecision).toHaveLength(6);
    expect(alreadyDecided).toHaveLength(2);
    expect(requests).toHaveLength(8);

    renderList([ROLE_APPROVER]);

    // Every request still awaiting a decision offers one — and it says WHICH
    // request it selects, since every listed request now carries one of its own.
    for (const request of awaitingDecision) {
      expect(await selectionControlOn(request.Reference)).toBeInTheDocument();
    }

    // A request somebody has already decided offers none at all: absent, not
    // greyed out (BR1/BR10). `queryAllByRole` finds disabled controls too, so a
    // disabled tick fails here exactly as a working one would.
    for (const request of alreadyDecided) {
      expect(
        within(rowFor(request.Reference))
          .queryAllByRole('checkbox')
          .map(described),
      ).toEqual([]);
    }

    // Nothing selected yet, so nothing is counted (AC-3's other half is below).
    expect(countIndicator()).not.toBeInTheDocument();
  });

  // AC-2
  it('offers a Finance Uploader no selection control and no approve action anywhere on the list', async () => {
    const requests = transactionsForBulkSelection(6);
    const awaitingDecision = importedIn(requests)[0];
    serve(requests);

    // --- the Approver, who is the contrast the negatives are read against ----
    const approverView = renderList([ROLE_APPROVER]);

    expect(
      await selectionControlOn(awaitingDecision.Reference),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: SELECT_ALL_CONTROL }),
    ).toBeInTheDocument();

    approverView.unmount();

    // --- the Finance Uploader, offered nothing of the sort (R7/BR10) ---------
    renderList([ROLE_IMPORTER]);

    await waitFor(() => {
      expect(rowFor(awaitingDecision.Reference)).toBeInTheDocument();
    });

    // Not on the request's own row, where the Approver has one...
    expect(
      within(rowFor(awaitingDecision.Reference))
        .queryAllByRole('checkbox')
        .map(described),
    ).toEqual([]);

    // ...and nowhere else on the screen either — no per-request tick, no
    // "select everything listed", nothing tucked into a toolbar and greyed out.
    expect(everySelectionControl().map(described)).toEqual([]);

    // Nor the action the selection leads to: a Finance Uploader may not approve
    // one request and may not approve a selection of them, so neither the
    // per-request decision nor the bulk action is on their screen at all.
    expect(controlsNamed(document.body, APPROVE_ACTION).map(described)).toEqual(
      [],
    );

    // And with nothing selectable there is nothing to count.
    expect(countIndicator()).not.toBeInTheDocument();
  });

  // AC-3
  it('shows how many requests are selected while a selection is active, and shows no indicator at all once nothing is selected', async () => {
    const user = userEvent.setup();

    const requests = transactionsForBulkSelection(6);
    const [first, second] = importedIn(requests);
    serve(requests);

    renderList([ROLE_APPROVER]);

    // Nothing selected: the indicator is not on the screen — absent, rather than
    // a permanently mounted "0 selected" (R4).
    expect(await selectionControlOn(first.Reference)).toBeInTheDocument();
    expect(countIndicator()).not.toBeInTheDocument();

    await toggleSelectionOf(user, first.Reference);
    await expectCount('1');
    expect(await selectionControlOn(first.Reference)).toBeChecked();

    await toggleSelectionOf(user, second.Reference);
    await expectCount('2');
    expect(await selectionControlOn(second.Reference)).toBeChecked();

    // Putting both back leaves nothing selected, and the indicator goes with the
    // selection rather than staying behind reading zero.
    await toggleSelectionOf(user, first.Reference);
    await toggleSelectionOf(user, second.Reference);

    await waitFor(() => {
      expect(countIndicator()).not.toBeInTheDocument();
    });
    expect(await selectionControlOn(first.Reference)).not.toBeChecked();
    expect(await selectionControlOn(second.Reference)).not.toBeChecked();
  });

  // AC-4
  it('reads "99+" once 100 requests are selected and the exact number below that', async () => {
    const user = userEvent.setup();

    // 100 requests still awaiting a decision — more than the page holds, which is
    // the point: "select everything currently listed" takes every request the
    // search and filters left, not the twenty on screen (contract note 4).
    const requests = transactionsForBulkSelection(100);
    const awaitingDecision = importedIn(requests);
    expect(awaitingDecision).toHaveLength(100);
    expect(decidedIn(requests)).toHaveLength(2);
    serve(requests);

    renderList([ROLE_APPROVER]);

    const selectEverything = await screen.findByRole('checkbox', {
      name: SELECT_ALL_CONTROL,
    });
    await user.click(selectEverything);

    // 100 selected: truncated, and the exact figure is deliberately NOT shown
    // here (it belongs to story 2's confirmation instead — BR4).
    await expectCount('99+');
    expect(shownCountIndicator()).not.toHaveTextContent('100');

    // One fewer, and the count is exact again. This is also what proves the
    // select-all took the 100 imported requests and not all 102: 101 selected
    // would still read "99+" here.
    const firstOnPage = awaitingDecision[0];
    await toggleSelectionOf(user, firstOnPage.Reference);

    await expectCount('99');
    expect(await selectionControlOn(firstOnPage.Reference)).not.toBeChecked();
  });

  // AC-6
  it('keeps the selection and the count through searching, sorting and paging — a selected request stays selected off the page being read', async () => {
    const user = userEvent.setup();

    // 27 requests against the default 20-request page (R12), so the ordering
    // below genuinely moves the selected pair off the page being read.
    const requests = transactionsForBulkSelection(25);
    const awaitingDecision = importedIn(requests);
    const [first, second] = awaitingDecision;
    // The one already-approved request, whose description is the term used below
    // to narrow the list down to it alone.
    const [approved] = decidedIn(requests);
    expect(awaitingDecision).toHaveLength(25);
    expect(requests).toHaveLength(27);
    serve(requests);

    renderList([ROLE_APPROVER]);

    await toggleSelectionOf(user, first.Reference);
    await toggleSelectionOf(user, second.Reference);
    await expectCount('2');

    // --- searching: what is LISTED changes, what is SELECTED does not --------
    // A term carried only by the already-decided request, so both selected
    // requests leave the screen entirely.
    await user.type(searchField(), 'absa');

    await waitFor(() => {
      expect(isListed(approved.Reference)).toBe(true);
    });
    expect(isListed(first.Reference)).toBe(false);
    expect(isListed(second.Reference)).toBe(false);
    await expectCount('2');

    await user.clear(searchField());
    await waitFor(() => {
      expect(isListed(first.Reference)).toBe(true);
    });
    // Back in view, and still ticked: the tick follows the REQUEST, never the row
    // position (settled decision 2).
    expect(await selectionControlOn(first.Reference)).toBeChecked();
    expect(await selectionControlOn(second.Reference)).toBeChecked();

    // --- ordering + paging: the selected pair moves to another page ----------
    // Descending by reference puts the two lowest references last, so both leave
    // the first page without anything being deselected.
    await user.click(sortControlFor(/^reference\b/i));
    await user.click(sortControlFor(/^reference\b/i));

    await waitFor(() => {
      expect(isListed(first.Reference)).toBe(false);
    });
    expect(isListed(second.Reference)).toBe(false);
    await expectCount('2');

    await user.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(isListed(first.Reference)).toBe(true);
    });
    expect(await selectionControlOn(first.Reference)).toBeChecked();
    expect(await selectionControlOn(second.Reference)).toBeChecked();
    await expectCount('2');
  });
});
