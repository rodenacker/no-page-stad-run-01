/**
 * Story Metadata:
 * - Epic: expense-request-list — Story 6: possible duplicates marked, and the
 *   Approver told
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — two imported requests sharing account number, amount and transaction
 *   date are BOTH marked as possible duplicates, before either has been decided.
 * - AC-2 — rejected requests are left out of the comparison: a rejected request is
 *   never marked, and never causes another request to be marked.
 * - AC-3 — the mark is readable directly in the list, as wording, without opening
 *   the request.
 * - AC-4 — a load that finds at least one possible duplicate notifies the
 *   APPROVER, once; an Importer sees the marks and is notified of nothing.
 *
 * AC-5 (the same requests stay marked through search, filter, sort and paging) is
 * this story's Playwright spec — deliberately not duplicated here
 * (testing-policy.md § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. This story ADDS to the client list component story 1 introduced under
 *    `web/src/components/requests/` — imported below as the named export
 *    `ExpenseRequestList` from `@/components/requests/ExpenseRequestList`. No new
 *    component and no second list: the mark is a column of the one list every
 *    other story in this epic also extends. If story 1 landed that component under
 *    a different name, change this ONE import to match it — never add a second
 *    list component to satisfy this file.
 * 2. Who is signed in reaches the list as an optional `roles` prop
 *    (`ProjectRole[]`, from `@/types/auth`), passed by the server page from
 *    `rolesOf(session)` — the page already holds the session via
 *    `requireSession()`, and the list is a client component that cannot read it.
 *    The prop exists ONLY to decide who gets the notification in AC-4: the marks
 *    themselves are the same for both roles, and no role may be offered an action
 *    (R20 / BR1 — this epic is read-only). A render with no roles notifies nobody.
 * 3. The duplicate key is `AccountNumber` + `Amount` + `TransactionDate` exactly as
 *    the service wrote them (brief BR3, §Derived: Duplicate Flag). When two
 *    requests share it, BOTH are marked (BR2) — not just the later one, and with no
 *    regard to which file they came from.
 * 4. The comparison set is the FULL fetched set MINUS rejected requests. A rejected
 *    request is still LISTED (it is only out of the comparison), and it must never
 *    be marked, nor make its imported twin marked. A naive "any two rows sharing
 *    account + amount + date" comparison fails AC-2 — that is the whole point of
 *    that test.
 * 5. Cancelled-file rows: BR3 also excludes them, but this epic assumes the service
 *    never returns them at all (`state.json.epic.unverifiedAssumptions`, brief
 *    §Notes & Caveats). Do NOT add a client-side cancelled-file exclusion on
 *    speculation, and do not gate the mark on `FileLogId` — nothing here asks for
 *    it, and the assumption is verified by a human at manual test.
 * 6. The flag is computed ONCE per load over the whole fetched set and carried on
 *    the row model the narrowing / sorting / paging pipeline slices, so which
 *    requests are marked cannot change with the visible page (AC-5's Playwright
 *    spec drives that; this file pins the computation itself). Compute it from the
 *    fetched data with a memo keyed on that data — an effect that re-derives on
 *    every render is what makes AC-4's re-render assertion fail.
 * 7. The mark renders in the request's OWN row as WORDING matching
 *    /possible duplicate/i, paired with an intent colour from the `globals.css`
 *    tokens (`--warning`), through the shared status-badge component story 1
 *    extracted — never colour alone, no hex literal, no Tailwind palette utility,
 *    no fourth badge implementation. Exactly ONE element per row carries that
 *    wording: the visible text IS the accessible text, so do not add a screen
 *    -reader-only second copy of the same phrase (it would make the mark
 *    ambiguous to query, and it is not what "never colour alone" means).
 * 8. When the load finds at least one possible duplicate AND the signed-in person
 *    holds `Approver` (R21 — `hasRole` from `@/lib/auth/roles`, the wire value
 *    `Approver` from `@/types/auth`), the screen raises ONE in-app notification
 *    through the existing `useToast()` (`@/contexts/ToastContext`) — one per load,
 *    not one per marked request — left dismissible, which is the app-wide toast
 *    default. An Importer is notified of NOTHING. This is deliberately unlike the
 *    previous epic's import notification, which was ungated: do not copy it.
 * 9. Re-announcing is a defect. Reuse the announce-once-per-record-id ref pattern
 *    from `SubmittedFilesList` so re-rendering the list — for any reason: a search
 *    keystroke, a sort, a page change — cannot bring a dismissed notification back
 *    or stack a second one.
 * 10. No new endpoint and no per-request call: the duplicate comparison happens in
 *    the browser over the one `GET /v1/transactions` body. The mock below fails
 *    loudly on any other read.
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy), plus `next/navigation` as the library
 * client-navigation boundary. The toast infrastructure is the real production code,
 * so the notification is asserted as the text a user actually meets, and every
 * response body comes from the project-wide `@/mocks/data/transaction` factory the
 * Playwright layer shares — so the two layers cannot drift onto different shapes or
 * different duplicate keys.
 *
 * Runtime-only: jsdom cannot judge the intent colour the wording is paired with, or
 * its legibility in dark mode. That pairing is the manual checklist's and the
 * Playwright axe scan's; what is pinned here is that the mark is READABLE AS TEXT,
 * so it is never conveyed by colour alone.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — story 1's list, which this story teaches to mark
// possible duplicates. The import fails until that component exists (TDD red).
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// Real production toast composition (not mocked) — the same one the root layout
// wraps every signed-in screen in, and the surface this story's notification must
// come out of.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';

// Project-wide Transaction factory — the single source both test layers share, and
// the one place the duplicate-key collisions are built. Never hand-write a response
// body, and never re-state the three key fields, in a test.
import {
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_REJECTED,
  createTransaction,
  duplicatePair,
  rejectedMatchOf,
  transactionListResponse,
  transactionsForNarrowing,
} from '@/mocks/data/transaction';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/types/auth';

import type { ProjectRole } from '@/types/auth';
import type {
  TransactionRead,
  TransactionReadList,
} from '@/types/transactions';

vi.mock('@/lib/api/client', () => ({ get: vi.fn(), post: vi.fn() }));

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

/** The body the transactions read answers with, set per test. */
let listBody: TransactionReadList | null = null;

/** Serve these requests as the whole fetched set — one response, no paging. */
const serveTransactions = (transactions: TransactionRead[]): void => {
  listBody = transactionListResponse(transactions);
};

/**
 * The duplicate key as BR3 defines it, used ONLY to state fixture preconditions
 * (that a collision the test relies on is real, and that no other row collides by
 * accident). The component's own derivation is never inspected — every assertion
 * below is about what the user can read.
 */
const duplicateKeyOf = (transaction: TransactionRead): string =>
  [
    transaction.AccountNumber,
    transaction.Amount,
    transaction.TransactionDate,
  ].join(' | ');

/** The screen as the root layout always mounts it: inside the toast composition. */
const listAs = (roles: ProjectRole[]) => (
  <ToastProvider>
    <ExpenseRequestList roles={roles} />
    <ToastContainer />
  </ToastProvider>
);

/**
 * The table row for a request, found by its own `Reference` (its primary
 * identifier, brief §Data Model) rather than by index — so no assertion depends on
 * the order the service returned. Scoped inside the table because a reference may
 * also appear in the notification.
 */
const rowFor = (reference: string): HTMLElement => {
  const row = within(screen.getByRole('table'))
    .getByText(reference)
    .closest('tr');
  if (row === null) {
    throw new Error(
      `No table row found for "${reference}" — the expense request list must ` +
        `render one row per request, carrying its Reference (see the ` +
        `implementation contract above).`,
    );
  }
  return row;
};

/** The wording the possible-duplicate mark, and its notification, must carry. */
const POSSIBLE_DUPLICATE = /possible duplicate/i;

/**
 * The app's in-app notification surface (the root layout's `ToastContainer`), which
 * renders nothing at all while there is nothing to tell the user — so its absence
 * IS "nobody was notified".
 */
const notificationSurface = (): HTMLElement | null =>
  screen.queryByRole('region', { name: /notifications/i });

describe('Epic expense-request-list, Story 6: possible duplicates marked, and the Approver told', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listBody = null;
    mockGet.mockImplementation(async (endpoint: string) => {
      const path = String(endpoint);
      if (!path.includes('/v1/transactions')) {
        throw new Error(
          `Unexpected read of "${path}" — the possible-duplicate mark is computed ` +
            'in the browser over the one fetched transaction list. There is no ' +
            'duplicate endpoint and no per-request call.',
        );
      }
      if (listBody === null) {
        throw new Error(
          'The screen read the transaction list but the test served no body — ' +
            'call serveTransactions(...) before rendering.',
        );
      }
      return listBody;
    });
  });

  // AC-1
  // Data-contract: that the real client reads `GET /v1/transactions` through the
  // app's own proxy and receives the whole set in one response is verified in the
  // browser (this story's Playwright spec) and on the manual checklist.
  it('marks BOTH imported requests that share an account number, amount and transaction date, and marks nothing else', async () => {
    // Two imported requests colliding on the duplicate key, among requests that
    // deliberately collide with nothing.
    const [first, second] = duplicatePair();
    const others = transactionsForNarrowing();
    // The two matching requests sit apart in the response, so nothing can pass by
    // comparing neighbours.
    const requests = [first, ...others, second];

    // Fixture precondition: within this whole set, `first` and `second` are the ONLY
    // two requests sharing a duplicate key — so "marked" below cannot be a lucky
    // blanket, and "unmarked" below cannot be a missed collision.
    expect(
      requests
        .filter((transaction) =>
          requests.some(
            (other) =>
              other.Reference !== transaction.Reference &&
              duplicateKeyOf(other) === duplicateKeyOf(transaction),
          ),
        )
        .map((transaction) => transaction.Reference),
    ).toEqual([first.Reference, second.Reference]);
    serveTransactions(requests);

    render(listAs([ROLE_APPROVER]));

    // Both matching requests are marked — the later one AND the one it matches
    // (BR2), even though they came from two different files.
    await waitFor(() => {
      expect(rowFor(first.Reference)).toHaveTextContent(POSSIBLE_DUPLICATE);
    });
    expect(rowFor(second.Reference)).toHaveTextContent(POSSIBLE_DUPLICATE);

    // ...and neither has been decided yet: the mark does not wait on a decision.
    expect(rowFor(first.Reference)).toHaveTextContent(
      TRANSACTION_STATUS_IMPORTED,
    );
    expect(rowFor(second.Reference)).toHaveTextContent(
      TRANSACTION_STATUS_IMPORTED,
    );

    // Every other request in the same load is listed and left unmarked.
    others.forEach((transaction) => {
      expect(rowFor(transaction.Reference)).not.toHaveTextContent(
        POSSIBLE_DUPLICATE,
      );
    });
  });

  // AC-2
  it('leaves rejected requests out of the comparison: a rejected request is neither marked nor a reason to mark the request it matches', async () => {
    // A genuine imported pair, so the comparison is demonstrably running...
    const [firstDuplicate, secondDuplicate] = duplicatePair();
    // ...and an imported request whose ONLY key twin is a rejected one (BR3).
    const imported = createTransaction();
    const rejected = rejectedMatchOf(imported);
    const requests = [firstDuplicate, imported, rejected, secondDuplicate];

    // Fixture preconditions: the rejected row really does collide with `imported`,
    // it really is rejected, and nothing else in the set shares that key — so the
    // two "not marked" assertions below can only pass if the exclusion works.
    expect(rejected.Status).toBe(TRANSACTION_STATUS_REJECTED);
    expect(
      requests
        .filter(
          (transaction) =>
            duplicateKeyOf(transaction) === duplicateKeyOf(imported),
        )
        .map((transaction) => transaction.Reference),
    ).toEqual([imported.Reference, rejected.Reference]);
    expect(duplicateKeyOf(firstDuplicate)).toBe(
      duplicateKeyOf(secondDuplicate),
    );
    serveTransactions(requests);

    render(listAs([ROLE_APPROVER]));

    // The comparison IS running — the imported pair is marked.
    await waitFor(() => {
      expect(rowFor(firstDuplicate.Reference)).toHaveTextContent(
        POSSIBLE_DUPLICATE,
      );
    });
    expect(rowFor(secondDuplicate.Reference)).toHaveTextContent(
      POSSIBLE_DUPLICATE,
    );

    // The rejected request is still LISTED with its own status — it is out of the
    // comparison, not out of the list...
    expect(rowFor(rejected.Reference)).toHaveTextContent(
      TRANSACTION_STATUS_REJECTED,
    );
    // ...and it is not marked itself,
    expect(rowFor(rejected.Reference)).not.toHaveTextContent(
      POSSIBLE_DUPLICATE,
    );
    // ...nor does it cause the imported request it matches to be marked.
    expect(rowFor(imported.Reference)).not.toHaveTextContent(
      POSSIBLE_DUPLICATE,
    );
  });

  // AC-3
  // Runtime-only: the intent colour the wording is paired with (and its contrast in
  // both themes) is judged by eye on the manual checklist and by the Playwright axe
  // scan — jsdom cannot see colour. What is pinned here is that the mark is
  // readable as TEXT inside the request's own row, so it is never colour alone.
  it('shows the mark as readable wording inside the request’s own row, with nothing opened and no control activated', async () => {
    const [first, second] = duplicatePair();
    const unmarked = createTransaction();
    serveTransactions([first, second, unmarked]);

    render(listAs([ROLE_IMPORTER]));

    // No click, no keystroke, nothing opened — the reader simply looks at the list.
    const mark = await waitFor(() =>
      within(rowFor(first.Reference)).getByText(POSSIBLE_DUPLICATE),
    );
    expect(mark).toBeVisible();
    expect(
      within(rowFor(second.Reference)).getByText(POSSIBLE_DUPLICATE),
    ).toBeVisible();

    // The mark belongs to the request, not to the screen: a request that matches
    // nothing carries no such wording.
    expect(rowFor(unmarked.Reference)).not.toHaveTextContent(
      POSSIBLE_DUPLICATE,
    );

    // Nothing had to be opened to read it — no detail surface is on screen.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // AC-4
  it('notifies the Approver once when the load finds a possible duplicate, does not re-notify on a re-render, and notifies the Importer of nothing', async () => {
    const user = userEvent.setup();
    const [first, second] = duplicatePair();
    serveTransactions([first, second, createTransaction()]);

    // --- the Approver is told (R21) ---------------------------------------
    const approverView = render(listAs([ROLE_APPROVER]));

    const notification = await screen.findByRole('region', {
      name: /notifications/i,
    });
    expect(notification).toHaveTextContent(POSSIBLE_DUPLICATE);
    // One announcement for the load, not one per marked request.
    expect(
      within(notification).getAllByRole('button', {
        name: /dismiss notification/i,
      }),
    ).toHaveLength(1);

    // Once the Approver has dismissed it, re-rendering the list must not bring it
    // back or stack a second one — the announce-once guard, which every later
    // keystroke, sort and page change depends on.
    await user.click(
      within(notification).getByRole('button', {
        name: /dismiss notification/i,
      }),
    );
    expect(notificationSurface()).not.toBeInTheDocument();

    approverView.rerender(listAs([ROLE_APPROVER]));

    await waitFor(() => {
      expect(rowFor(first.Reference)).toHaveTextContent(POSSIBLE_DUPLICATE);
    });
    expect(notificationSurface()).not.toBeInTheDocument();

    approverView.unmount();

    // --- the Importer sees the marks and is told nothing -------------------
    render(listAs([ROLE_IMPORTER]));

    // The same load, marking the same two requests — so the notification decision
    // has already been taken by the time these marks are on screen.
    await waitFor(() => {
      expect(rowFor(first.Reference)).toHaveTextContent(POSSIBLE_DUPLICATE);
    });
    expect(rowFor(second.Reference)).toHaveTextContent(POSSIBLE_DUPLICATE);

    expect(notificationSurface()).not.toBeInTheDocument();
  });
});
