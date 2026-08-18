/**
 * Story Metadata:
 * - Epic: bulk-approval-and-live-refresh — Story 4: the list keeps itself current
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-2 — a refresh that brings in changed data leaves an open confirmation open,
 *   leaves the keyboard where it was, and leaves the search, the filters, the
 *   ordering and the page being read untouched;
 * - AC-3 — nothing refreshes while the tab is in the background, and a refresh
 *   happens straight away when the reader comes back to it;
 * - AC-4 — no refresh lands while a bulk-approve confirmation is open, and
 *   refreshing resumes as soon as that action finishes;
 * - AC-5 — a refresh that reveals a selected request was decided by somebody else
 *   drops it out of the selection and the visible count decreases to match, with
 *   no separate interruption;
 * - AC-6 — a refresh is announced quietly: it does not take the keyboard and
 *   raises nothing that has to be dismissed.
 *
 * AC-1 (a decision recorded elsewhere arriving on its own within about 15 seconds,
 * with no reload) is the Playwright spec's, driven with `page.clock` against the
 * app's real cadence — a genuine browser round trip, and the one thing jsdom cannot
 * prove (testing-policy.md § "One tag, one layer"). Deliberately not repeated here.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these assertions pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE REFRESH ATTACHES TO THE LIST THAT ALREADY EXISTS — do not build a second
 *    one and do not wrap it. The component under test is
 *    `web/src/components/requests/ExpenseRequestList.tsx`, still fed `roles` by the
 *    server page (`rolesOf(session)`), which already owns the single fetch, the
 *    narrow → order → slice pipeline, the tiered wait and the three non-data
 *    states.
 * 2. THE REFRESH IS THE SAME READ THE LIST ALREADY MAKES: `fetchTransactions()`
 *    from `@/lib/api/transactions` (`GET /v1/transactions`, no parameters, whole
 *    set in one body). No new endpoint function, no per-request read and no direct
 *    `fetch` — the mock below throws on any other address. Reuse
 *    `components/files/SubmittedFilesList.tsx`'s refresh DISCIPLINE (one timer at
 *    most, cleared on unmount, a failed re-read leaving the last known values on
 *    screen) but NOT its stop condition: this list refreshes the whole time it is
 *    open, because what it watches is other people's decisions, which never finish
 *    (story §"A deliberate extension to a documented convention").
 * 3. NO TEST HERE KNOWS THE CADENCE, and none may. Every assertion either waits for
 *    a user-observable change within a window far longer than 15 seconds, or lets
 *    such a window pass and asserts that nothing changed. Keep the app's real 15s
 *    constant — do NOT add a shortened, test-only interval or a prop to inject one:
 *    an interval a test can move is an interval nobody has to meet.
 * 4. THE VISIBILITY GATE reads `document.visibilityState` and listens for
 *    `visibilitychange` on `document`, watched as external state with
 *    `useSyncExternalStore` (copy `lib/layout/viewport.ts` / `lib/theme/theme.ts`);
 *    setting state from an effect is what the `react-hooks` rule rejects. While the
 *    tab is hidden NO read is made, and coming back to it reads STRAIGHT AWAY
 *    rather than waiting out the next tick (AC-3 allows a thousandth of the
 *    cadence, no more).
 * 5. THE PAUSE (BR7) covers a bulk-approve confirmation being open and a batch
 *    being in flight, and it ENDS the moment that action finishes — including when
 *    the reader backs out of the confirmation, which is the outcome AC-4 drives
 *    (brief Workflow 5: "once the approver confirms (or cancels), polling resumes
 *    on its normal cadence").
 * 6. A REFRESH UPDATES IN PLACE (BR8). It does not collapse an open dialog, move
 *    the keyboard, or reset the search term, a filter bound, the ordering or the
 *    page being read. The ONE deliberate exception is the selection: a request that
 *    is no longer `Imported` silently leaves it and the count corrects itself, with
 *    no notification, no dialog and nothing to dismiss.
 * 7. THE SELECTION LAYER IS STORY 1's and is used here exactly as its contract
 *    pins it: one `role="checkbox"` per still-`Imported` request in its own row,
 *    named "Select request <Reference>"; the ambient count indicator is a
 *    `role="status"` whose accessible name contains "Selected requests", carrying
 *    the count as its text and absent at zero. THE BULK ACTION IS STORY 2's,
 *    reusing the project's confirmation convention (the Shadcn `alert-dialog`,
 *    which Radix renders as `role="alertdialog"`). This file names neither one's
 *    wording beyond that: the bulk control is found as the only control offering to
 *    approve that is NOT one of the per-request Approve controls inside the table.
 * 8. NFR2 — THE ANNOUNCEMENT IS POLITE AND NOTHING ELSE. A refresh may announce
 *    itself through a polite live region (`aria-live="polite"`, or a `role="status"`
 *    which is implicitly polite). It may NOT be assertive, may not be a `role="alert"`,
 *    may not open a dialog and may not raise an in-app notification: a background data
 *    change must never interrupt whatever the reader is doing.
 * 9. A FAILED RE-READ CHANGES NOTHING ON SCREEN. The failed-load state belongs to a
 *    read that left the user with nothing; the "cannot refresh itself" notice and
 *    its two-consecutive-failures rule (R6/BR9) are story 5's and are not pinned
 *    here.
 * 10. NOTHING BELOW COUNTS CALLS. How many reads happened is the implementation's
 *    business (NFR4 lets the poll and story 2's pre-submit re-check share one
 *    fetch); the pause and the visibility gate are asserted through what the reader
 *    can see instead, which is also what testing-policy.md § Anti-patterns
 *    requires.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy). Every response body comes from the
 * project-wide factory in `@/mocks/data/transaction`, shared with the Playwright
 * layer, so the two layers cannot drift onto different shapes: successive polls are
 * `transactionsAfterColleagueDecided(...)` applied to the set already served, which
 * changes only the named request's decision fields and preserves order — the only
 * thing that makes "the refresh disturbed nothing else" provable.
 *
 * Timers: this refresh is a component-local interval with no browser-level flow of
 * its own — the testing-policy's last-resort fake-timer case, and the reason AC-1
 * (the real round trip) is Playwright's. Time only ever moves on the FAKE clock;
 * there is no real-time sleep anywhere. No `axe()` runs under a frozen clock —
 * accessibility is scanned in a real browser elsewhere.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): the list is read
 * once today and never again on its own.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, {
  PointerEventsCheckLevel,
} from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the list this story teaches to keep itself current.
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// The real production notification composition (not mocked): the arrangement the
// root layout wraps every signed-in screen in, and the one surface a refresh must
// NOT reach (NFR2).
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
import { TRANSACTIONS_ENDPOINT } from '@/lib/api/transactions';

// The chosen ordering belongs to the SESSION, not to the component, so a test that
// sorts would otherwise hand its ordering to the next one — see `beforeEach`.
import { rememberSort } from '@/lib/transactions/sortPreference';

// Project-wide Transaction factory: the single source of truth for the wire shape
// and its canonical values, shared with the Playwright layer. Never hand-write a
// response body in a test.
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  transactionListResponse,
  transactionsAfterColleagueDecided,
  transactionsForBulkSelection,
} from '@/mocks/data/transaction';
import { ROLE_APPROVER } from '@/types/auth';

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

/**
 * How much FAKE time a test is prepared to let pass while waiting for the list to
 * catch up on its own. Deliberately NOT the implementation's interval and several
 * times longer than it: the criterion is that the list keeps itself current without
 * anyone touching it, not that it does so on any particular schedule.
 */
const REFRESH_WINDOW_MS = 60_000;

/**
 * Long enough that a list which refreshes at all would have refreshed several times
 * over — which is what makes "nothing happened" mean the refresh was PAUSED rather
 * than merely slow.
 */
const SEVERAL_REFRESH_WINDOWS_MS = 3 * REFRESH_WINDOW_MS;

/**
 * What "straight away" is allowed to mean when the reader comes back to the tab
 * (AC-3): a thousandth of the 15-second cadence. A screen that merely waits out its
 * next ordinary tick cannot satisfy this, which is the whole point of the criterion.
 */
const IMMEDIATELY_MS = 1_000;

/** R12's default page size, stated as the requirement's own literal. */
const DEFAULT_PAGE_SIZE = 20;

/**
 * A term carried by every imported request's description ("Expense request 0001")
 * and by neither of the fixture's already-decided rows — so the search narrows to a
 * known set, and the narrowing is unmistakably still applied after a refresh.
 */
const SEARCH_TERM = 'req';

/** A bound every fixture amount clears, so the filter applies without hiding rows. */
const MINIMUM_AMOUNT = '100';

/** What the transactions service currently holds; every read answers from it. */
let served: TransactionRead[] = [];

/**
 * Puts a set of requests behind `GET /v1/transactions`. Changing it mid-test is how
 * "a colleague decided this a moment ago" is expressed: nothing on screen knows, and
 * only a fresh read can find out.
 */
const serve = (requests: TransactionRead[]): void => {
  served = requests;
};

/** Whether the reader's tab is in the background right now. */
let tabIsHidden = false;

/**
 * Advance the fake clock inside `act`, so timer-driven renders are flushed before
 * anything is asserted. Called with no argument it just flushes what is pending —
 * which is how the first read is settled after mounting.
 */
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
    // Radix puts `pointer-events: none` on the body while a modal is open; jsdom
    // then reports the dialog's own controls as un-clickable even though a real
    // browser lets them through.
    pointerEventsCheck: PointerEventsCheckLevel.Never,
  });

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderList = async (roles: ProjectRole[]): Promise<void> => {
  render(
    <ToastProvider>
      <ExpenseRequestList roles={roles} />
      <ToastContainer />
    </ToastProvider>,
  );
  await settle();
};

/**
 * Puts the tab in the background, or brings the reader back to it, exactly as a
 * browser does: the state the document reports, plus the event that says it changed.
 *
 * `document.visibilityState` is defined in `beforeEach` (jsdom has no way to change
 * its own), so the gate is answered by the same API the implementation asks — no
 * test-only hook in production code.
 */
const setTabHidden = async (hidden: boolean): Promise<void> => {
  tabIsHidden = hidden;
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
  });
};

/**
 * Every table row carrying a request's reference.
 *
 * Found by TEXT rather than by `getByRole('table')`, unlike the sibling stories'
 * helpers, for one reason: while a modal confirmation is open Radix marks everything
 * behind it `aria-hidden`, so every role query against the list underneath comes back
 * empty. AC-2 and AC-4 both have to read the rows behind an open dialog, and a helper
 * that works in only half the file would be worse than one that says why.
 */
const rowsCarrying = (reference: string): HTMLElement[] => {
  const rows = screen
    .queryAllByText(reference)
    .map((cell) => cell.closest('tr'))
    .filter((row): row is HTMLTableRowElement => row !== null);
  return [...new Set<HTMLElement>(rows)];
};

/**
 * The one row for a named request, required to be unique so a widened match can
 * never quietly assert about the wrong request.
 */
const rowFor = (reference: string): HTMLElement => {
  const rows = rowsCarrying(reference);
  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one table row carrying "${reference}", found ` +
        `${String(rows.length)} — the list renders one row per request, each ` +
        'identified by its Reference.',
    );
  }
  return rows[0];
};

/** Whether a request is on the page currently being read. */
const isListed = (reference: string): boolean =>
  rowsCarrying(reference).length === 1;

/** Where a request stands, as its own row states it. */
const expectStatusOn = (reference: string, status: string): void => {
  expect(within(rowFor(reference)).getByText(status)).toBeInTheDocument();
};

/**
 * Waits for a request's row to catch up with a decision made elsewhere.
 *
 * The check interval is widened from the default 50ms because the clock it is
 * advancing is the FAKE one: a 60-second window at 50ms costs 1,200 re-queries of
 * the whole list for no extra fidelity, and the shortest window any test here uses
 * still gets several checks.
 */
const waitForStatusOn = async (
  reference: string,
  status: string,
  timeout = REFRESH_WINDOW_MS,
): Promise<void> => {
  await waitFor(
    () => {
      expectStatusOn(reference, status);
    },
    { timeout, interval: 250 },
  );
};

/** How one request's own selection control names itself — story 1's contract. */
const selectionControlFor = (reference: string): RegExp =>
  new RegExp(`^select\\b.*${reference}`, 'i');

/** One request's selection control, on its own row. */
const selectionControlOn = async (reference: string): Promise<HTMLElement> =>
  await waitFor(() =>
    within(rowFor(reference)).getByRole('checkbox', {
      name: selectionControlFor(reference),
    }),
  );

/** Ticks one request. */
const select = async (user: User, reference: string): Promise<void> => {
  await user.click(await selectionControlOn(reference));
};

/** How the ambient count indicator names itself — story 1's contract. */
const SELECTION_COUNT_NAME = /selected requests/i;

/** The ambient count indicator, or `null` when nothing is selected. */
const countIndicator = (): HTMLElement | null =>
  screen.queryByRole('status', { name: SELECTION_COUNT_NAME });

/**
 * Waits for the indicator to read exactly the given count — as a whole value, not as
 * part of a longer one, so "2" is never satisfied by "12" or "20".
 */
const expectCount = async (count: number): Promise<void> => {
  const wholeValue = new RegExp(`(^|[^\\d+])${String(count)}(?![\\d+])`);
  await waitFor(() => {
    const indicator = countIndicator();
    expect(indicator).not.toBeNull();
    expect(indicator).toHaveTextContent(wholeValue);
  });
};

/** Every role a bulk action could be offered under. */
const CONTROL_ROLES = ['button', 'menuitem', 'link'] as const;

/** What a failed negative assertion should print: the offending element, named. */
const described = (element: HTMLElement): string =>
  `<${element.tagName.toLowerCase()}> "${(element.textContent ?? '').trim()}"`;

/** One request's own Approve control, on its own row (`expense-decisions`). */
const approveControlOn = async (reference: string): Promise<HTMLElement> =>
  await waitFor(() =>
    within(rowFor(reference)).getByRole('button', {
      name: new RegExp(`^approve\\b.*${reference}`, 'i'),
    }),
  );

/**
 * The control that approves the whole SELECTION (story 2's), found by what it is
 * rather than by wording this story does not own: the only control offering to
 * approve that is not one of the per-request Approve controls inside the table.
 */
const bulkApproveControl = (): HTMLElement => {
  const table = screen.getByRole('table');
  const outsideTheTable = CONTROL_ROLES.flatMap((role) =>
    screen.queryAllByRole(role, { name: /approve/i }),
  ).filter((control) => !table.contains(control));

  if (outsideTheTable.length !== 1) {
    throw new Error(
      'Expected exactly one control offering to approve the selection outside the ' +
        `table, found ${String(outsideTheTable.length)} ` +
        `(${outsideTheTable.map(described).join(', ')}). The bulk action lives in ` +
        "the list's own toolbar beside the selected-count indicator (story 2).",
    );
  }
  return outsideTheTable[0];
};

/**
 * The app's in-app notification surface (the root layout's `ToastContainer`), which
 * renders nothing at all while there is nothing to tell the reader — so its absence
 * IS "nothing was raised".
 */
const notificationSurface = (): HTMLElement | null =>
  screen.queryByRole('region', { name: /notifications/i });

/**
 * How insistently an element announces itself: an explicit `aria-live`, or the
 * politeness implied by `role="status"` (polite) and `role="alert"` (assertive).
 */
const politenessOf = (element: Element): 'polite' | 'assertive' | null => {
  const declared = element.getAttribute('aria-live');
  if (declared === 'polite' || declared === 'assertive') {
    return declared;
  }
  if (declared === 'off') {
    return null;
  }
  const role = element.getAttribute('role');
  if (role === 'status') {
    return 'polite';
  }
  return role === 'alert' ? 'assertive' : null;
};

/**
 * What the screen is currently saying at each level of insistence.
 *
 * Read from the document rather than through a role query because there is no role
 * for "a live region": `aria-live` is the attribute NFR2 is written in, and the
 * difference between polite and assertive is exactly what has to be asserted.
 */
const announcementsAt = (politeness: 'polite' | 'assertive'): string[] =>
  [
    ...document.querySelectorAll<HTMLElement>(
      '[aria-live], [role="status"], [role="alert"]',
    ),
  ]
    .filter((region) => politenessOf(region) === politeness)
    .map((region) => (region.textContent ?? '').trim())
    .filter((text) => text !== '');

/** The requests in a fixture set that are still awaiting a decision. */
const importedIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status === TRANSACTION_STATUS_IMPORTED);

/** The search box the narrowing layer already offers. */
const searchField = (): HTMLElement =>
  screen.getByRole('searchbox', { name: /search requests/i });

/** One end of the amount range — a filter that is a plain field, not a listbox. */
const minimumAmountField = (): HTMLElement =>
  screen.getByLabelText(/minimum amount/i);

/** One column's sort control, in the heading row. */
const sortControlFor = (column: RegExp): HTMLElement =>
  screen.getByRole('button', { name: column });

/** The heading of the column the list is ordered by, which carries `aria-sort`. */
const columnHeading = (column: RegExp): HTMLElement =>
  screen.getByRole('columnheader', { name: column });

const AMOUNT_COLUMN = /^amount\b/i;

/**
 * Which page the foot of the listing says the reader is on.
 *
 * The foot states it inside its continuation line — `RECORDS 21–25 OF 25 · PAGE 2 OF 2`
 * (`request-list-redesign` R14) — where it used to be a bare "Page 2 of 2" scrap beside
 * the controls. Matched at the END of an element's text, so the one element whose text
 * finishes with this page counter is the line itself and no wrapper around it. The
 * assertion is unchanged in strength: it still says the reader is on that page, of that
 * many, after the refresh.
 */
const pageCounter = (pageNumber: number, pageCount: number): HTMLElement =>
  screen.getByText(
    new RegExp(
      `page\\s+${String(pageNumber)}\\s+of\\s+${String(pageCount)}$`,
      'i',
    ),
  );

describe('Epic bulk-approval-and-live-refresh, Story 4: the list keeps itself current', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    served = [];
    tabIsHidden = false;
    rememberSort(null);

    // jsdom offers no way to background a tab, so the two values a browser reports
    // are defined here and answered from `tabIsHidden`. Nothing in production code
    // knows about this — the gate reads the same API it would in a browser.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (tabIsHidden ? 'hidden' : 'visible'),
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => tabIsHidden,
    });

    mockGet.mockImplementation((endpoint: unknown) => {
      const path = String(endpoint);
      if (path !== TRANSACTIONS_ENDPOINT) {
        throw new Error(
          `Unexpected read of "${path}" — keeping the list current is a re-read of ` +
            `the list call itself (${TRANSACTIONS_ENDPOINT}, no parameters), not a ` +
            'new endpoint and not a per-request call.',
        );
      }
      return Promise.resolve(transactionListResponse(served));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'visibilityState');
    Reflect.deleteProperty(document, 'hidden');
  });

  // AC-2
  it('brings changed data in underneath the reader, leaving the search, the filter, the ordering, the page, the keyboard and an open confirmation exactly as they were', async () => {
    const user = setupUser();

    // More requests than one page holds, so there is a page to be left on.
    const requests = transactionsForBulkSelection(25);
    const awaitingDecision = importedIn(requests);
    expect(awaitingDecision).toHaveLength(25);
    expect(awaitingDecision.length).toBeGreaterThan(DEFAULT_PAGE_SIZE);
    serve(requests);

    await renderList([ROLE_APPROVER]);

    // --- the reader arranges the list the way they want to read it -----------
    await user.type(searchField(), SEARCH_TERM);
    await user.type(minimumAmountField(), MINIMUM_AMOUNT);
    await user.click(sortControlFor(AMOUNT_COLUMN));

    await waitFor(() => {
      expect(pageCounter(1, 2)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /^next\b/i }));
    await waitFor(() => {
      expect(pageCounter(2, 2)).toBeInTheDocument();
    });

    // Ordered by amount ascending, the last two requests are the ones on the page
    // being read — and both are still awaiting a decision.
    const highestAmount = awaitingDecision[awaitingDecision.length - 1];
    const secondHighest = awaitingDecision[awaitingDecision.length - 2];
    expect(isListed(highestAmount.Reference)).toBe(true);
    expect(isListed(secondHighest.Reference)).toBe(true);
    expectStatusOn(highestAmount.Reference, TRANSACTION_STATUS_IMPORTED);

    // The keyboard is in the search box, mid-sentence as far as the reader is
    // concerned.
    await user.click(searchField());
    expect(searchField()).toHaveFocus();

    // --- a colleague approves one of the requests on that very page ----------
    serve(transactionsAfterColleagueDecided(requests, [highestAmount.Id]));
    await waitForStatusOn(highestAmount.Reference, TRANSACTION_STATUS_APPROVED);

    // Everything the reader had arranged is still exactly as they left it: their
    // term, their bound, their ordering, their page — and the keyboard, which never
    // moved out of the box they were typing in.
    expect(searchField()).toHaveValue(SEARCH_TERM);
    expect(minimumAmountField()).toHaveValue(Number(MINIMUM_AMOUNT));
    expect(columnHeading(AMOUNT_COLUMN)).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(pageCounter(2, 2)).toBeInTheDocument();
    expect(isListed(secondHighest.Reference)).toBe(true);
    expect(searchField()).toHaveFocus();

    // --- and an open confirmation is not collapsed under the reader ----------
    // The per-request confirmation (`expense-decisions`), which is deliberately not
    // the bulk one AC-4 covers: this one is open while the refresh keeps running,
    // and BR8 says a refresh must leave it standing.
    await user.click(await approveControlOn(secondHighest.Reference));
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent(secondHighest.Reference);

    const [thirdHighest] = awaitingDecision.slice(-3);
    serve(transactionsAfterColleagueDecided(served, [thirdHighest.Id]));
    await settle(REFRESH_WINDOW_MS);

    // Still open, still asking about the same request — the reader was not thrown
    // out of the decision they were part-way through making.
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      secondHighest.Reference,
    );
  });

  // AC-3
  it('makes no read while the tab is in the background, and refreshes straight away when the reader comes back to it', async () => {
    const requests = transactionsForBulkSelection(3);
    const [decidedElsewhere] = importedIn(requests);
    serve(requests);

    await renderList([ROLE_APPROVER]);
    expectStatusOn(decidedElsewhere.Reference, TRANSACTION_STATUS_IMPORTED);

    // The reader switches to another tab...
    await setTabHidden(true);

    // ...and while they are away, a colleague approves one of the requests.
    serve(transactionsAfterColleagueDecided(requests, [decidedElsewhere.Id]));
    await settle(SEVERAL_REFRESH_WINDOWS_MS);

    // Several refreshes' worth of time has passed with nothing asked of the
    // service: a backgrounded tab does not poll a list nobody is looking at (BR6).
    expectStatusOn(decidedElsewhere.Reference, TRANSACTION_STATUS_IMPORTED);
    expect(
      within(rowFor(decidedElsewhere.Reference)).queryByText(
        TRANSACTION_STATUS_APPROVED,
      ),
    ).not.toBeInTheDocument();

    // The reader comes back, and the list is current again almost at once — well
    // inside a fraction of an ordinary refresh window, so waiting out the next tick
    // does not satisfy this.
    await setTabHidden(false);
    await waitForStatusOn(
      decidedElsewhere.Reference,
      TRANSACTION_STATUS_APPROVED,
      IMMEDIATELY_MS,
    );
  });

  // AC-4
  it('lands no refresh while a bulk-approve confirmation is open, and resumes the moment that action finishes', async () => {
    const user = setupUser();

    const requests = transactionsForBulkSelection(4);
    const awaitingDecision = importedIn(requests);
    const [firstSelected, secondSelected, , leftAlone] = awaitingDecision;
    expect(awaitingDecision).toHaveLength(4);
    expect(requests.length).toBeLessThanOrEqual(DEFAULT_PAGE_SIZE);
    serve(requests);

    await renderList([ROLE_APPROVER]);

    await select(user, firstSelected.Reference);
    await select(user, secondSelected.Reference);
    await expectCount(2);

    await user.click(bulkApproveControl());
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();

    // A colleague decides a request that is NOT in this selection, so what a
    // refresh would bring is unmistakable and has nothing to do with AC-5's
    // pruning.
    serve(transactionsAfterColleagueDecided(requests, [leftAlone.Id]));
    await settle(SEVERAL_REFRESH_WINDOWS_MS);

    // Several refreshes' worth of time later: the confirmation is still standing
    // and the rows behind it have not moved. Nothing raced the reader's own action.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expectStatusOn(leftAlone.Reference, TRANSACTION_STATUS_IMPORTED);
    expect(
      within(rowFor(leftAlone.Reference)).queryByText(
        TRANSACTION_STATUS_APPROVED,
      ),
    ).not.toBeInTheDocument();

    // Backing out ends the action — one of the outcomes BR7 names — and refreshing
    // picks up again on its own, with nothing asked of the reader.
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    await waitForStatusOn(leftAlone.Reference, TRANSACTION_STATUS_APPROVED);
  });

  // AC-5
  it('drops a request a colleague has just decided out of the selection and corrects the count, without interrupting the reader', async () => {
    const user = setupUser();

    const requests = transactionsForBulkSelection(4);
    const awaitingDecision = importedIn(requests);
    const [firstSelected, decidedElsewhere, thirdSelected] = awaitingDecision;
    expect(requests.length).toBeLessThanOrEqual(DEFAULT_PAGE_SIZE);
    serve(requests);

    await renderList([ROLE_APPROVER]);

    await select(user, firstSelected.Reference);
    await select(user, decidedElsewhere.Reference);
    await select(user, thirdSelected.Reference);
    await expectCount(3);

    // A colleague approves the middle one of the three while the reader is looking
    // at the list.
    serve(transactionsAfterColleagueDecided(requests, [decidedElsewhere.Id]));
    await waitForStatusOn(
      decidedElsewhere.Reference,
      TRANSACTION_STATUS_APPROVED,
    );

    // It has left the selection, and the visible count has come down with it.
    await expectCount(2);
    expect(await selectionControlOn(firstSelected.Reference)).toBeChecked();
    expect(await selectionControlOn(thirdSelected.Reference)).toBeChecked();

    // The decided request offers no selection control at all any more (story 1's
    // rule: absent, never a ticked or greyed-out leftover).
    expect(
      within(rowFor(decidedElsewhere.Reference))
        .queryAllByRole('checkbox')
        .map(described),
    ).toEqual([]);

    // And none of it interrupted the reader: no dialog was raised over the list and
    // there is nothing to dismiss (BR8 — the correction speaks for itself).
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(notificationSurface()).not.toBeInTheDocument();
  });

  // AC-6
  it('announces a refresh politely, taking neither the keyboard nor anything the reader has to dismiss', async () => {
    const requests = transactionsForBulkSelection(3);
    const [decidedElsewhere, leftAlone] = importedIn(requests);
    serve(requests);

    await renderList([ROLE_APPROVER]);

    // The keyboard is on a control belonging to a request nobody is about to touch.
    // Nothing is selected, so story 1's count indicator — the screen's other
    // `role="status"` — is not on screen, and the announcement asserted below can
    // only be the refresh's own.
    const keyboardIsOn = within(rowFor(leftAlone.Reference)).getByRole(
      'button',
      {
        name: /^open\b/i,
      },
    );
    keyboardIsOn.focus();
    expect(keyboardIsOn).toHaveFocus();
    expect(countIndicator()).not.toBeInTheDocument();

    serve(transactionsAfterColleagueDecided(requests, [decidedElsewhere.Id]));
    await waitForStatusOn(
      decidedElsewhere.Reference,
      TRANSACTION_STATUS_APPROVED,
    );

    // The change was announced — and quietly. Politely, or not at all insistently:
    // never `assertive`, never a `role="alert"` (NFR2).
    expect(announcementsAt('polite')).not.toEqual([]);
    expect(announcementsAt('assertive')).toEqual([]);

    // Nothing was raised over the list and nothing waits to be dismissed.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(notificationSurface()).not.toBeInTheDocument();

    // ...and the keyboard is exactly where the reader left it.
    expect(
      within(rowFor(leftAlone.Reference)).getByRole('button', {
        name: /^open\b/i,
      }),
    ).toHaveFocus();
  });
});
