/**
 * Story Metadata:
 * - Epic: request-list-redesign — Story 6: the exception gutter down the left
 * - Route: /requests
 * - Target File: web/src/components/requests/ExpenseRequestList.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — a narrow two-character column runs down the left of every row: present
 *   and empty on an ordinary row, and never collapsed away even when nothing on
 *   the page needs marking;
 * - AC-3 — ticking a request to approve it happens in that left-hand column
 *   itself, there is no separate tick-box column beside it, and requests select
 *   and deselect exactly as before;
 * - AC-6 — only an Approver is offered selection, and only on requests still
 *   awaiting a decision; for anyone else there is no selection control on the
 *   screen at all.
 *
 * Not here, and deliberately so:
 * - AC-2 (each state's mark distinguishable while ignoring colour entirely) and
 *   AC-5 (a decided row goes visibly quiet while awaiting rows keep full
 *   contrast) are tagged `none` — shape legibility and relative contrast are
 *   judged by eye against the design brief, not by jsdom, which renders no
 *   colour, no width and no glyph. The gutter's TWO-CHARACTER WIDTH (BR5) is in
 *   that same category: what is pinned below is that the column and its per-row
 *   cell exist unconditionally and are not hidden, never a class or a width.
 * - AC-4 (a selection made and undone by keyboard alone, surviving narrowing,
 *   re-ordering and paging) is the Playwright spec's — a real browser's own focus
 *   order and key handling (testing-policy.md § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these assertions pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE SURFACE IS THE LIST THAT ALREADY EXISTS — `ExpenseRequestList`, still
 *    fed `roles` by the server page. No second list, no wrapper, no new route, no
 *    change to `lib/auth/access-map.ts`: `/requests` stays registered for both
 *    roles, because what only ONE role may DO is a check on the control inside
 *    the screen (R7/R27).
 * 2. THE GUTTER IS A REAL, PERMANENTLY RESERVED FIRST COLUMN of the table
 *    (R15/BR5). Concretely: the first `columnheader` is the gutter's, carrying an
 *    accessible name that says what the column is — the assertions below match
 *    any name containing "exception" (e.g. an `sr-only` "Exceptions and
 *    selection"), because a nameless leftmost cell tells a screen-reader user
 *    nothing about the marks in it. Every body row then has exactly one `cell` in
 *    that column, for EVERY reader: the table has the SAME number of columns
 *    whoever is signed in, and the column is present whether or not anything on
 *    the page needs marking. It may not be dropped, `hidden`, or
 *    `display:none`-ed when the page happens to hold no marks — that empty column
 *    IS the design (BR5), because it is what makes a marked row findable by
 *    scanning one column.
 * 3. AN ORDINARY ROW'S GUTTER CARRIES NOTHING. Per the brief's §Data Model, the
 *    mark for "ordinary, undecided, no exception" is *empty* — so for a reader
 *    offered no selection, an undecided non-duplicate row's gutter cell holds no
 *    text and no control. Reserving the width with a non-breaking space or a
 *    CSS-sized empty cell is fine; printing a placeholder glyph or a dash is not.
 * 4. THE EXISTING SELECTION COLUMN IS REMOVED, and the Shadcn `Checkbox` MOVES
 *    INTO THE GUTTER CELL (AC-3/BR5) — restyled as one of the gutter's marks,
 *    never replaced by a `<div>` with a click handler. It keeps `role="checkbox"`
 *    (so it keeps `aria-checked`), keeps naming its own request through
 *    `selectRequestLabel(reference)`, and keeps its `checked` state. AC-4's
 *    keyboard assertion depends on it still being a real focusable control, and
 *    every assertion below finds it by role and accessible name — never by a
 *    class — so the restyling is free.
 * 5. SELECTION SEMANTICS DO NOT CHANGE (R1/BR2). `lib/transactions/selecting.ts`
 *    is reused untouched; the ambient count indicator (`role="status"` named
 *    "Selected requests", absent at zero), the toolbar's "Select all listed
 *    requests" — which still takes every still-`Imported` request the active
 *    narrowing LEFT, not just the page on screen — and the transient
 *    `selectionLocked` disable while a bulk approval is in flight all stay
 *    exactly as they are. The specs for `bulk-approval-and-live-refresh` stories
 *    1–4 keep running and keep finding each row's tick with
 *    `within(row).getByRole('checkbox', …)`, which survives this move precisely
 *    because the control stays a real checkbox inside the row. None of them may
 *    be loosened to accommodate the redesign (BR1).
 * 6. WHO IS OFFERED A TICK IS UNCHANGED (AC-6/R7): `ROLE_APPROVER` and nobody
 *    else, on `Status === 'Imported'` requests and no others. Everyone and
 *    everything else is offered NOTHING AT ALL — absent from the accessibility
 *    tree, never present-but-disabled. The queries below find disabled controls
 *    too, so a greyed-out tick fails exactly as a working one would.
 * 7. R20 IS DESATURATION, NOT A DISABLED STATE. A decided row stays listed,
 *    stays readable (its reference, description and status are still on it) and
 *    stays reachable (its Open control still works). It is not removed, not
 *    `aria-hidden`, not `aria-disabled`, and its actions are not disabled — it
 *    simply holds less contrast than a row still awaiting a decision, which is
 *    AC-5's by-eye check, not an assertion here.
 * 8. THE BULK-APPROVE CONFIRMATION GATE STAYS AS IT IS. It is gated on
 *    `bulkApprovalAsked` ALONE, deliberately not also on the selection being
 *    non-empty — an inline comment in the list explains why (a dialog that
 *    unmounts itself never reports itself closed, which would leave self-refresh
 *    paused for the rest of the session). This story rewires the selection area;
 *    that gate must survive intact.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy). Every response body comes from the
 * project-wide factories in `@/mocks/data/transaction`, shared with the
 * Playwright layer so the two cannot drift onto different shapes:
 * `transactionsForBulkSelection` (requests still awaiting a decision plus one
 * already Approved and one already Rejected — a set of nothing but selectable
 * rows could not tell a correct implementation from one that offers a tick on
 * everything) and `transactionsInEveryStatus` (one row per recognised status, so
 * the page genuinely holds rows that need marking).
 *
 * These tests WILL FAIL until the story is implemented (TDD red): the list has no
 * gutter column at all today, its selection ticks live in a separate column that
 * only an Approver sees, and that column is absent entirely for anyone else.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the list this story reshapes.
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

// Project-wide Transaction factories: the single source of truth for the wire
// shape and its canonical values, shared with the Playwright layer. Never
// hand-write a response body in a test.
import {
  TRANSACTION_STATUS_IMPORTED,
  transactionListResponse,
  transactionsForBulkSelection,
  transactionsInEveryStatus,
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

/** The listing itself. */
const listing = (): HTMLElement => screen.getByRole('table');

/** The listing's column headings, left to right. */
const headings = (): HTMLElement[] =>
  within(listing()).getAllByRole('columnheader');

/**
 * How the gutter column heads itself — contract item 2. Read by a screen reader
 * only: the marks in the column are what a sighted reader scans.
 */
const GUTTER_COLUMN_NAME = /exception/i;

/**
 * The gutter's own column heading, which must be the FIRST one: "runs down the
 * LEFT of every row" is a claim about position, so position is what is checked
 * here (and only here — a request is always identified by its reference below,
 * never by where it sits).
 */
const gutterHeading = (): HTMLElement => {
  const named = within(listing()).queryAllByRole('columnheader', {
    name: GUTTER_COLUMN_NAME,
  });
  if (named.length !== 1) {
    throw new Error(
      `Expected exactly one column heading naming the exception gutter, found ` +
        `${String(named.length)}. The gutter is one permanently reserved column ` +
        `(BR5), and its heading is how a screen-reader user is told what the ` +
        `leftmost cell of every row holds.`,
    );
  }
  return named[0];
};

/** How many columns the listing has, whoever is reading it. */
const columnCount = (): number => headings().length;

/**
 * The headings of every column EXCEPT the gutter's, so the value columns can be
 * compared between two readers without constraining what selection chrome the
 * gutter's own heading may hold.
 */
const valueColumnHeadings = (): string[] =>
  headings()
    .slice(1)
    .map((heading) => (heading.textContent ?? '').trim());

/** The rows carrying requests — the heading row holds no `cell`. */
const requestRows = (): HTMLElement[] =>
  within(listing())
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('cell').length > 0);

/**
 * The table row for a named request, found by the reference the row carries
 * rather than by position — and required to be unique, so a widened match can
 * never quietly read the wrong request.
 */
const rowFor = (reference: string): HTMLElement => {
  const rows = requestRows().filter((row) =>
    row.textContent?.includes(reference),
  );

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
 * Which column the gutter is, which must be the first — so a row's gutter cell is
 * read from the gutter's own heading rather than from "whatever happens to be
 * leftmost", which today's bolted-on checkbox column would also satisfy.
 */
const gutterColumnIndex = (): number => {
  const index = headings().indexOf(gutterHeading());
  if (index !== 0) {
    throw new Error(
      `The exception gutter is column ${String(index + 1)} of the listing, but ` +
        `R15/BR5 puts it down the LEFT: it must be the first column, so the ` +
        `reader scans one narrow column at the edge of the page.`,
    );
  }
  return index;
};

/** A row's gutter cell — the cell in the gutter's own column. */
const gutterOf = (row: HTMLElement): HTMLElement =>
  within(row).getAllByRole('cell')[gutterColumnIndex()];

/** How one request's own selection control names itself (unchanged, R1/BR2). */
const selectionControlFor = (reference: string): RegExp =>
  new RegExp(`^select\\b.*${reference}`, 'i');

/** The "select everything currently listed" control (unchanged, R1/BR2). */
const SELECT_ALL_CONTROL = /^select all\b/i;

/** How the ambient count indicator names itself (unchanged, R1/BR2). */
const SELECTION_COUNT_NAME = /selected requests/i;

/** How a row's Open control names itself. */
const openControlFor = (reference: string): RegExp =>
  new RegExp(`^open\\b.*${reference}`, 'i');

/** Anything offering to approve — the per-request decision and the bulk action. */
const APPROVE_ACTION = /^approve\b/i;

/** One request's selection control, which must live in that row's gutter cell. */
const tickInGutterOf = async (reference: string): Promise<HTMLElement> =>
  await waitFor(() =>
    within(gutterOf(rowFor(reference))).getByRole('checkbox', {
      name: selectionControlFor(reference),
    }),
  );

/** Ticks or unticks one request, in the gutter. */
const toggleSelectionOf = async (
  user: User,
  reference: string,
): Promise<void> => {
  await user.click(await tickInGutterOf(reference));
};

/** The ambient count indicator, or `null` when it is not on the screen at all. */
const countIndicator = (): HTMLElement | null =>
  screen.queryByRole('status', { name: SELECTION_COUNT_NAME });

/**
 * Waits for the indicator to read exactly the given count — as a whole value,
 * not as part of a longer one, so "2" cannot be satisfied by "12" or "20".
 */
const expectCount = async (count: string): Promise<void> => {
  const wholeValue = new RegExp(`(^|[^\\d+])${count}(?![\\d+])`);
  await waitFor(() => {
    expect(
      screen.getByRole('status', { name: SELECTION_COUNT_NAME }),
    ).toHaveTextContent(wholeValue);
  });
};

/** Every role a mark or a control in the gutter could present itself under. */
const CONTROL_ROLES = [
  'button',
  'checkbox',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
] as const;

/** Every activatable control inside `surface`. */
const controlsIn = (surface: HTMLElement): HTMLElement[] =>
  CONTROL_ROLES.flatMap((role) => within(surface).queryAllByRole(role));

/** Every activatable control in `surface` whose accessible name matches. */
const controlsNamed = (surface: HTMLElement, name: RegExp): HTMLElement[] =>
  CONTROL_ROLES.flatMap((role) =>
    within(surface).queryAllByRole(role, { name }),
  );

/** What a failed negative assertion should print: the offending element, named. */
const described = (element: HTMLElement): string =>
  `<${element.tagName.toLowerCase()}> "${(element.textContent ?? '').trim()}"`;

/** The requests in a fixture set that are still awaiting a decision. */
const importedIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status === TRANSACTION_STATUS_IMPORTED);

/** The requests in a fixture set somebody has already decided. */
const decidedIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status !== TRANSACTION_STATUS_IMPORTED);

describe('Epic request-list-redesign, Story 6: the exception gutter down the left', () => {
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
  it('reserves a gutter column down the left of every row, present and empty when nothing on the page needs marking', async () => {
    // A page where NOTHING needs marking: every request still awaiting a
    // decision (so no decided mark), no two sharing the duplicate key (so no
    // exception mark), read by an Importer (so no selection mark). This is
    // exactly the case BR5 says the gutter must survive — and the case a
    // "render the column only when it has something in it" implementation
    // fails.
    const nothingToMark = importedIn(transactionsForBulkSelection(6));
    expect(nothingToMark).toHaveLength(6);
    serve(nothingToMark);

    const ordinaryPage = renderList([ROLE_IMPORTER]);

    await waitFor(() => {
      expect(rowFor(nothingToMark[0].Reference)).toBeInTheDocument();
    });

    // The gutter is the leftmost column, and it says what it is.
    expect(gutterHeading()).toBe(headings()[0]);
    expect(gutterHeading()).toBeVisible();

    const reservedColumns = columnCount();
    const reservedValueColumns = valueColumnHeadings();

    // Every row has a cell in it — reserved, blank, and not collapsed out of the
    // page. An ordinary row's mark is EMPTY (brief §Data Model), so the cell
    // holds no text and no control: a placeholder glyph or a dash would fail.
    expect(requestRows()).toHaveLength(nothingToMark.length);
    for (const request of nothingToMark) {
      const row = rowFor(request.Reference);
      const gutter = gutterOf(row);

      expect(gutter).toBeVisible();
      expect(gutter).not.toHaveAttribute('aria-hidden', 'true');
      expect((gutter.textContent ?? '').trim()).toBe('');
      expect(controlsIn(gutter).map(described)).toEqual([]);
      // ...and it is a column of the table proper, not a decoration floated
      // beside it: the row has one cell per heading.
      expect(within(row).getAllByRole('cell')).toHaveLength(reservedColumns);
    }

    // Nothing was marked on that page, which is what made it the ordinary case.
    expect(screen.queryAllByRole('checkbox').map(described)).toEqual([]);

    ordinaryPage.unmount();

    // --- and a page that DOES hold marks is the same shape -------------------
    // One request per recognised status: rows that have been decided, so the
    // gutter now has marks to carry. The column count must not move — the
    // gutter is permanently reserved, not conditionally added.
    const rowsToMark = transactionsInEveryStatus();
    expect(importedIn(rowsToMark)).toHaveLength(1);
    expect(decidedIn(rowsToMark)).toHaveLength(2);
    serve(rowsToMark);

    renderList([ROLE_IMPORTER]);

    await waitFor(() => {
      expect(rowFor(rowsToMark[0].Reference)).toBeInTheDocument();
    });

    expect(gutterHeading()).toBe(headings()[0]);
    expect(columnCount()).toBe(reservedColumns);
    expect(valueColumnHeadings()).toEqual(reservedValueColumns);

    for (const request of rowsToMark) {
      const gutter = gutterOf(rowFor(request.Reference));
      expect(gutter).toBeVisible();
      expect(gutter).not.toHaveAttribute('aria-hidden', 'true');
    }
  });

  // AC-3
  it('puts the selection tick in the gutter itself with no second tick-box column beside it, and selects and deselects exactly as before', async () => {
    const user = userEvent.setup();

    const requests = transactionsForBulkSelection(6);
    const awaitingDecision = importedIn(requests);
    const [first, second] = awaitingDecision;

    // Fixture preconditions, so a set that quietly stopped covering both halves
    // fails here rather than passing an assertion about nothing. Eight requests
    // in all, which the default 20-request page shows at once.
    expect(awaitingDecision).toHaveLength(6);
    expect(decidedIn(requests)).toHaveLength(2);
    expect(requests).toHaveLength(8);
    serve(requests);

    const approverView = renderList([ROLE_APPROVER]);

    await waitFor(() => {
      expect(rowFor(first.Reference)).toBeInTheDocument();
    });

    const approverColumns = columnCount();
    const approverValueColumns = valueColumnHeadings();

    for (const request of awaitingDecision) {
      const row = rowFor(request.Reference);
      const gutter = gutterOf(row);

      // The tick is IN the gutter — a real checkbox that names its own request,
      // found by role and name so the restyling into a gutter mark is free.
      const tick = within(gutter).getByRole('checkbox', {
        name: selectionControlFor(request.Reference),
      });
      expect(tick).toBeEnabled();
      expect(tick).not.toBeChecked();

      // ...and it is the ONLY cell in the row that holds one: the bolted-on
      // checkbox column is gone, not hidden beside the gutter (BR5).
      const cellsHoldingATick = within(row)
        .getAllByRole('cell')
        .filter((cell) => within(cell).queryAllByRole('checkbox').length > 0);
      expect(cellsHoldingATick.map(described)).toHaveLength(1);
      expect(cellsHoldingATick[0]).toBe(gutter);
    }

    // --- selecting and deselecting, unchanged (R1/BR2) -----------------------
    expect(countIndicator()).not.toBeInTheDocument();

    await toggleSelectionOf(user, first.Reference);
    await expectCount('1');
    expect(await tickInGutterOf(first.Reference)).toBeChecked();

    await toggleSelectionOf(user, second.Reference);
    await expectCount('2');
    expect(await tickInGutterOf(second.Reference)).toBeChecked();

    // Putting both back leaves nothing selected, and the indicator goes with the
    // selection rather than staying behind reading zero.
    await toggleSelectionOf(user, first.Reference);
    await toggleSelectionOf(user, second.Reference);

    await waitFor(() => {
      expect(countIndicator()).not.toBeInTheDocument();
    });
    expect(await tickInGutterOf(first.Reference)).not.toBeChecked();
    expect(await tickInGutterOf(second.Reference)).not.toBeChecked();

    // "Select everything currently listed" still takes every request awaiting a
    // decision, and every one of those ticks now reads as selected in its own
    // gutter.
    await user.click(
      await screen.findByRole('checkbox', { name: SELECT_ALL_CONTROL }),
    );
    await expectCount('6');
    for (const request of awaitingDecision) {
      expect(await tickInGutterOf(request.Reference)).toBeChecked();
    }

    approverView.unmount();

    // --- the columns do not differ by reader --------------------------------
    // The gutter is permanently reserved for everyone (BR5) and selection lives
    // inside it, so an Importer reads a listing of exactly the same columns. An
    // implementation that kept a separate tick-box column for the Approver
    // fails here, because that column would exist for one reader and not the
    // other.
    renderList([ROLE_IMPORTER]);

    await waitFor(() => {
      expect(rowFor(first.Reference)).toBeInTheDocument();
    });
    expect(gutterHeading()).toBe(headings()[0]);
    expect(columnCount()).toBe(approverColumns);
    expect(valueColumnHeadings()).toEqual(approverValueColumns);
  });

  // AC-6
  it('offers selection to an Approver only on requests still awaiting a decision, and to nobody else at all, while a decided row stays listed and readable', async () => {
    const requests = transactionsForBulkSelection(6);
    const awaitingDecision = importedIn(requests);
    const alreadyDecided = decidedIn(requests);
    expect(awaitingDecision).toHaveLength(6);
    expect(alreadyDecided).toHaveLength(2);
    serve(requests);

    // --- the Approver, who is the contrast the negatives are read against ----
    const approverView = renderList([ROLE_APPROVER]);

    for (const request of awaitingDecision) {
      expect(await tickInGutterOf(request.Reference)).toBeInTheDocument();
    }

    for (const request of alreadyDecided) {
      const row = rowFor(request.Reference);

      // A request somebody has already decided offers no tick at all — absent,
      // not greyed out (R7). `queryAllByRole` finds disabled controls too, so a
      // disabled tick fails here exactly as a working one would.
      expect(within(row).queryAllByRole('checkbox').map(described)).toEqual([]);

      // ...and the row itself stays present, readable and reachable: R20
      // desaturates a decided row, it does not remove it, hide it from a screen
      // reader, or turn it into a disabled one (that is what "still readable" in
      // AC-5 rests on).
      expect(gutterOf(row)).toBeVisible();
      expect(row).not.toHaveAttribute('aria-hidden', 'true');
      expect(row).not.toHaveAttribute('aria-disabled', 'true');
      expect(row).toHaveTextContent(request.Reference);
      expect(row).toHaveTextContent(request.Description);
      expect(row).toHaveTextContent(request.Status);

      const open = within(row).getByRole('button', {
        name: openControlFor(request.Reference),
      });
      expect(open).toBeEnabled();
    }

    approverView.unmount();

    // --- the Importer, offered nothing of the sort (R7/R27) ------------------
    renderList([ROLE_IMPORTER]);

    const stillAwaiting = awaitingDecision[0];
    await waitFor(() => {
      expect(rowFor(stillAwaiting.Reference)).toBeInTheDocument();
    });

    // The gutter is still reserved for this reader — it is where the marks they
    // scan for live — but it holds no offer to select.
    expect(gutterHeading()).toBe(headings()[0]);
    expect(
      controlsIn(gutterOf(rowFor(stillAwaiting.Reference))).map(described),
    ).toEqual([]);
    expect(
      within(rowFor(stillAwaiting.Reference))
        .queryAllByRole('checkbox')
        .map(described),
    ).toEqual([]);

    // ...and nowhere else on the screen either — nothing tucked into a toolbar
    // and greyed out, no "select everything listed", nothing at all.
    expect(screen.queryAllByRole('checkbox').map(described)).toEqual([]);

    // Nor the action a selection leads to: a Finance Uploader may not approve
    // one request and may not approve a selection of them.
    expect(controlsNamed(document.body, APPROVE_ACTION).map(described)).toEqual(
      [],
    );

    // And with nothing selectable there is nothing to count.
    expect(countIndicator()).not.toBeInTheDocument();
  });
});
