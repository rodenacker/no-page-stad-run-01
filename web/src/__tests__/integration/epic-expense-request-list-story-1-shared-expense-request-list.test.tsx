/**
 * Story Metadata:
 * - Epic: expense-request-list — Story 1: the shared expense request list
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`: AC-1 (one row per imported request carrying
 * the values the service returned, its status as TEXT, and its transaction type as
 * plain language where the app has wording for it and verbatim where it does not),
 * AC-2 (every account number masked to its last four digits, with no reveal-all
 * control — POPIA, not formatting), AC-3 (the tiered wait: nothing under 300ms, a
 * placeholder from 300ms, a still-loading message past 3s) and AC-4 (the
 * nothing-ever-imported empty state, which names expense requests and offers the
 * upload action).
 *
 * AC-5 (a failed retrieval shows the service's own reason plus a working Try again)
 * and AC-6 (an Importer following the header entry point lands on the list, not a
 * not-found and not a permission message) are the Playwright spec's — deliberately
 * not duplicated here (testing-policy.md § "One tag, one layer").
 *
 * AC-1 names both roles. Nothing in this screen is role-aware: there is no
 * per-role filtering, both roles read the identical list read-only, so the role
 * dimension of AC-1 is entirely the access-map widening (`/requests` →
 * `[ROLE_IMPORTER, ROLE_APPROVER]`) that AC-6's Playwright spec drives in a real
 * browser and the manual checklist confirms. That is why no identity fixture is
 * imported below — a Vitest "render it as an Importer" test would pass a role the
 * component never reads, and prove nothing.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 *  1. `web/src/app/(authenticated)/requests/page.tsx` keeps its existing
 *     `requireSession()` / `canAccess()` server-side check exactly as it is and
 *     replaces ONLY the `notFound()` with the real screen. The `(authenticated)`
 *     layout is the sole session gate — do not add a second one.
 *  2. The list itself is a **client** component,
 *     `web/src/components/requests/ExpenseRequestList.tsx`, named export
 *     `ExpenseRequestList`, with no required props. It must read from the BROWSER,
 *     because that is the boundary this story's Playwright spec intercepts
 *     (`page.route()` cannot see a server-side fetch) and because the loading /
 *     empty / failure states are its own state.
 *  3. It reads through `fetchTransactions()` in a new
 *     `web/src/lib/api/transactions.ts` (mirroring `lib/api/files.ts`): `get` from
 *     `@/lib/api/client` — never `fetch()`, CLAUDE.md §2 — at
 *     `TRANSACTIONS_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/transactions``,
 *     with NO query parameters (the endpoint accepts none). The body is
 *     `TransactionReadList` — `{ Transactions: TransactionRead[] }` — and the whole
 *     set is held in memory, since stories 2–4 narrow, sort and page over it.
 *  4. `web/src/types/transactions.ts` (mirroring `types/files.ts`) is the single
 *     source of truth for the shape and the status names, and
 *     `src/mocks/data/transaction.ts` already re-exports from it:
 *     `TransactionRead`, `TransactionReadList`, `TRANSACTION_STATUS_IMPORTED` /
 *     `_APPROVED` / `_REJECTED`, `TRANSACTION_STATUSES`, `TransactionStatus`,
 *     `isKnownTransactionStatus`. `Status` and `TransactionType` are typed `string`
 *     (the service owns those vocabularies), narrowed only by the guard.
 *  5. One `<table>`, one row per request, with a heading on every column. These
 *     tests find a value by its column HEADING, so the eight columns must be
 *     headed recognisably: originating **file**, **reference**, transaction
 *     **date**, **account** number, **description**, **amount**, transaction
 *     **type**, **status**. (`Currency`, `UserNote`, `LastChangedUser` and
 *     `LastChangedDate` belong to story 5's detail surface, not to this table.)
 *  6. Values are the SERVICE's own. `TransactionDate` is printed as it arrived —
 *     do not normalise or re-format it (brief §Notes & Caveats: the format
 *     assumption is unverified, so normalising on speculation would hide it) — and
 *     `Amount` keeps the service's number rather than being rewritten into a
 *     locale currency string, because these assertions read the service's value
 *     back out of the cell.
 *  7. `TransactionType` is translated where the app has wording and shown verbatim
 *     where it does not: `C` → "Credit — money in", `D` → "Debit — money out",
 *     anything else exactly as returned and NEVER treated as an error (no
 *     hardcoded enum — brief §Notes & Caveats, user-confirmed at INTAKE).
 *  8. `Status` is a chip carrying the status TEXT beside an intent colour from the
 *     `--info` / `--success` / `--warning` / `--muted` tokens in `globals.css` (no
 *     hex literal, no Tailwind palette utility). Extract the chip already inside
 *     `components/files/SubmittedFilesList.tsx` into a shared component rather than
 *     writing a third copy, keeping the neutral/cancelled intent available. jsdom
 *     cannot judge colour, so these tests pin the readable text — the pairing is
 *     the manual checklist's and the Playwright axe scan's.
 *  9. **Account numbers**: only the last four DIGITS of `AccountNumber` may reach
 *     the DOM, on every render path, and no control anywhere reveals them all at
 *     once. This is POPIA (`project.md` §Compliance), not formatting. The mask
 *     shape is yours (`••••5567`, `Ending 5567`, …) as long as the four digits are
 *     the only digits in the cell. Story 5 adds the per-request reveal inside the
 *     detail panel; this story has no reveal control at all.
 * 10. **The tiered wait** (R11/R19), at the REAL durations — no test-only props or
 *     shortened values: under 300ms nothing at all is drawn; from 300ms an
 *     announceable placeholder (`role="status"` whose text says it is loading — the
 *     project bar is WCAG 2.2 AA, so a bare skeleton shape is not enough) stands in
 *     for the pending list; past 3s a still-loading message JOINS that placeholder
 *     (the placeholder does not go away). The wording matched below is
 *     /still loading/i.
 * 11. **Nothing ever imported**: the wording "No expense requests have been
 *     imported yet." and a link to `UPLOAD_PATH` (`/upload`, from
 *     `@/lib/auth/access-map`) whose name offers the action. An empty list is an
 *     answer, not a failure — nothing is reported as one.
 * 12. The failed-load state is AC-5's (Playwright) and is not asserted here, but it
 *     is still this component's: `serviceMessageOf(e) ?? serviceDetailOf(e) ??`
 *     the screen's own wording, from `@/lib/api/errors.ts`, plus a Try again that
 *     re-reads the list. Never a client placeholder in front of a user.
 * 13. The screen renders inside the root layout's existing `ToastProvider` +
 *     `ToastContainer` composition (as wrapped below), which story 6's
 *     possible-duplicate notification relies on.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy) — plus `next/link` and `next/navigation`,
 * libraries at the client-navigation boundary that need an App Router context jsdom
 * has not got. The toast composition is the real production code, and every request
 * body comes from the project-wide factory in `@/mocks/data/transaction`, shared
 * with the Playwright layer, so the two layers cannot drift onto different shapes.
 *
 * These tests WILL FAIL until the story is implemented (TDD red) — `/requests` is
 * still a `notFound()` placeholder, and `@/types/transactions`,
 * `@/lib/api/transactions` and the component below do not exist yet.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — these imports fail until implemented (TDD red).
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// Real production toast composition (not mocked) — the same one the root layout
// wraps every signed-in screen in.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
// The upload screen's address from the one place that owns it, so the empty state's
// action cannot drift from the route it points at.
import { UPLOAD_PATH } from '@/lib/auth/access-map';

// Project-wide Transaction factory: the single source of truth for the wire shape
// and its canonical values, shared with the Playwright layer. Never hand-write a
// response body in a test.
import {
  TRANSACTION_TYPE_CREDIT_CODE,
  TRANSACTION_TYPE_DEBIT_CODE,
  createTransaction,
  transactionListResponse,
  transactionsForNarrowing,
} from '@/mocks/data/transaction';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

import type {
  TransactionRead,
  TransactionReadList,
} from '@/types/transactions';

vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  apiClient: vi.fn(),
}));

/**
 * `next/link` stubbed with the plain anchor it renders in the browser, so the empty
 * state's action keeps its `link` role and its `href` without an App Router context
 * in jsdom. A library, never the code under test.
 */
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/** The other half of that boundary, for whatever the screen reads about the URL. */
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

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderList = () =>
  render(
    <ToastProvider>
      <ExpenseRequestList />
      <ToastContainer />
    </ToastProvider>,
  );

/**
 * The plain-language wording each transaction-type code the app knows is shown as
 * (brief R1 / §Data Model). A code that is not in here is the service's own value
 * and reaches the user untouched.
 */
const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  [TRANSACTION_TYPE_CREDIT_CODE]: 'Credit — money in',
  [TRANSACTION_TYPE_DEBIT_CODE]: 'Debit — money out',
};

/** What the type column must read for a given value — translated, or verbatim. */
const expectedTypeLabel = (transactionType: string): string =>
  TRANSACTION_TYPE_LABELS[transactionType] ?? transactionType;

/** Said past 3s, alongside (not instead of) the placeholder. */
const STILL_LOADING = /still loading/i;

/**
 * A control that would reveal account numbers wholesale. Named by intent rather
 * than by wording, and deliberately narrow enough not to catch a sortable "Account
 * number" column heading (story 4 turns the headings into buttons).
 */
const REVEAL_ALL_CONTROL =
  /((reveal|unmask|show|full).*account)|(account.*(reveal|unmask|show|full))/i;

/** An accessible name that offers the upload action rather than merely naming a screen. */
const UPLOAD_ACTION_NAME = /(upload|submit|import)/i;

/** An element's visible text, with runs of whitespace collapsed as the DOM shows it. */
const textOf = (element: HTMLElement): string =>
  (element.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Just the digits in a value, so a mask can be judged by what it exposes. */
const digitsOf = (value: string): string => value.replace(/\D/g, '');

/** The only part of an account number this screen may ever show. */
const lastFourOf = (accountNumber: string): string =>
  digitsOf(accountNumber).slice(-4);

/**
 * Every kind of dash read as the same character, so the type label's wording is
 * what is pinned rather than the author's choice of em dash, en dash or hyphen.
 */
const dashNormalised = (value: string): string => value.replace(/[-‐-―]/g, '—');

/** The list's table — the one arrangement these assertions read. */
const requestsTable = (): HTMLElement => screen.getByRole('table');

/**
 * The table row for a request, found by its own reference and scoped to the table,
 * so the assertions never depend on the order the service returned and are not
 * confused by a narrow-viewport arrangement of the same requests.
 */
const rowFor = (reference: string): HTMLElement => {
  const row = within(requestsTable()).getByText(reference).closest('tr');
  if (row === null) {
    throw new Error(
      `No table row found for "${reference}" — the expense request list must ` +
        `render one table row per request (see the implementation contract above).`,
    );
  }
  return row;
};

/** Which column a heading names, so a value can be read out of its own column. */
const columnIndexOf = (column: RegExp): number => {
  const headings = within(requestsTable()).getAllByRole('columnheader');
  const index = headings.findIndex((heading) => column.test(textOf(heading)));
  if (index === -1) {
    throw new Error(
      `No column heading matching ${String(column)} — the table's columns must be ` +
        `headed as the implementation contract above lists them. Headings found: ` +
        `${headings.map((heading) => `"${textOf(heading)}"`).join(', ')}.`,
    );
  }
  return index;
};

/** One request's value in one column, so a value in the wrong column cannot pass. */
const cellIn = (row: HTMLElement, column: RegExp): HTMLElement => {
  const cells = within(row).getAllByRole('cell');
  const cell = cells[columnIndexOf(column)];
  if (cell === undefined) {
    throw new Error(
      `The row has ${String(cells.length)} cells, which does not reach the column ` +
        `matching ${String(column)} — every row must carry a cell per column.`,
    );
  }
  return cell;
};

const COLUMN = {
  file: /file/i,
  reference: /reference/i,
  date: /date/i,
  account: /account/i,
  description: /description/i,
  amount: /amount/i,
  type: /type/i,
  status: /status/i,
} as const;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

/** A promise the test resolves itself, so the in-flight state is observable. */
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * Moves the clock on and lets React settle what that changed.
 *
 * The tiered wait is a genuinely component-local timer with no browser flow of its
 * own, which is the one case fake timers are for (testing-policy.md § Time-dependent
 * behaviour). Only the timer APIs are faked — microtasks stay real, so the in-flight
 * read still resolves normally — and RTL's auto-advancing `waitFor` / `findBy*` are
 * deliberately avoided while the clock is frozen, since they would step the clock
 * themselves and walk straight over the 300ms and 3s thresholds under test.
 */
const advanceClockBy = (ms: number): Promise<void> =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

describe('Epic expense-request-list, Story 1: the shared expense request list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AC-1
  // Data-contract: that the request really reaches `GET /v1/transactions` through
  // the app's own proxy (and with no query parameters) is verified in the browser —
  // this story's Playwright spec — and on the manual checklist.
  it('lists one row per request the service returned, with each request’s own file, reference, date, description and amount, its status as text, and its transaction type in plain language where the app has wording and exactly as returned where it does not', async () => {
    const requests: TransactionRead[] = transactionsForNarrowing();
    // Fixture precondition: the spread really does exercise BOTH branches of the
    // type label — codes the app translates, and one value it has no wording for —
    // so the verbatim assertion below is not a lucky match.
    expect(
      requests.some(
        (request) => request.TransactionType in TRANSACTION_TYPE_LABELS,
      ),
    ).toBe(true);
    expect(
      requests.some(
        (request) => !(request.TransactionType in TRANSACTION_TYPE_LABELS),
      ),
    ).toBe(true);
    mockGet.mockResolvedValue(transactionListResponse(requests));

    renderList();

    // One row per request, plus the heading row — pinned to the fixture size, so a
    // truncated or empty render cannot pass.
    await waitFor(() => {
      expect(within(requestsTable()).getAllByRole('row')).toHaveLength(
        requests.length + 1,
      );
    });

    requests.forEach((request) => {
      const row = rowFor(request.Reference);

      // The service's own values, each in its own column.
      expect(cellIn(row, COLUMN.file)).toHaveTextContent(request.FileName);
      expect(cellIn(row, COLUMN.reference)).toHaveTextContent(
        request.Reference,
      );
      // Verbatim, unnormalised — the date format is an unverified assumption.
      expect(cellIn(row, COLUMN.date)).toHaveTextContent(
        request.TransactionDate,
      );
      expect(cellIn(row, COLUMN.description)).toHaveTextContent(
        request.Description,
      );
      expect(cellIn(row, COLUMN.amount)).toHaveTextContent(
        String(request.Amount),
      );

      // The status is READABLE, so it is never carried by colour alone.
      expect(textOf(cellIn(row, COLUMN.status))).toContain(request.Status);

      // Plain language for the codes the app knows; the service's own value,
      // untranslated and un-flagged, for anything else.
      expect(dashNormalised(textOf(cellIn(row, COLUMN.type)))).toBe(
        dashNormalised(expectedTypeLabel(request.TransactionType)),
      );
    });

    // A type the app has no wording for is a legitimate value, not an error.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // AC-2
  // POPIA (project.md §Compliance), not formatting: the full value must not be in
  // the page at all — masking it visually while shipping it to the DOM would leak
  // it to anyone reading the markup.
  it('shows only the last four digits of every account number, and offers no control that reveals them all at once', async () => {
    const requests: TransactionRead[] = transactionsForNarrowing();
    mockGet.mockResolvedValue(transactionListResponse(requests));

    renderList();

    await waitFor(() => {
      expect(within(requestsTable()).getAllByRole('row')).toHaveLength(
        requests.length + 1,
      );
    });

    requests.forEach((request) => {
      const shown = textOf(cellIn(rowFor(request.Reference), COLUMN.account));

      // The four digits the screen may show are the ONLY digits it shows — which
      // holds for any mask shape ("••••5567", "Ending 5567", "…5567").
      expect(digitsOf(shown)).toBe(lastFourOf(request.AccountNumber));

      // And the full value is nowhere on the screen, in any punctuation.
      const pageText = textOf(document.body);
      expect(pageText).not.toContain(request.AccountNumber);
      expect(pageText).not.toContain(digitsOf(request.AccountNumber));
    });

    // Story 5 adds a reveal for ONE request inside its detail panel; this screen
    // has no reveal at all, and never a wholesale one.
    expect([
      ...screen.queryAllByRole('button', { name: REVEAL_ALL_CONTROL }),
      ...screen.queryAllByRole('checkbox', { name: REVEAL_ALL_CONTROL }),
      ...screen.queryAllByRole('switch', { name: REVEAL_ALL_CONTROL }),
      ...screen.queryAllByRole('link', { name: REVEAL_ALL_CONTROL }),
    ]).toHaveLength(0);
  });

  // AC-3
  it('draws nothing while the read is under 300ms, stands a placeholder in for the pending list from 300ms, and joins it with a still-loading message past 3s', async () => {
    // Only the timer APIs — microtasks stay real, so the read below still resolves.
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
      ],
    });

    const request = createTransaction();
    const inFlight = createDeferred<TransactionReadList>();
    mockGet.mockReturnValue(inFlight.promise);

    renderList();

    // --- under 300ms: a wait this short is not worth mentioning --------------
    await advanceClockBy(299);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    // --- from 300ms: an announceable placeholder stands in for the list ------
    await advanceClockBy(1);
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    expect(screen.queryByText(STILL_LOADING)).not.toBeInTheDocument();

    // --- up to 3s: the placeholder alone is still the whole answer -----------
    await advanceClockBy(3000 - 300 - 1);
    expect(screen.queryByText(STILL_LOADING)).not.toBeInTheDocument();

    // --- past 3s: the message JOINS the placeholder, it does not replace it --
    await advanceClockBy(1);
    expect(screen.getByText(STILL_LOADING)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();

    // --- the answer arrives: both give way to the request itself -------------
    await act(async () => {
      inFlight.resolve(transactionListResponse([request]));
    });
    expect(
      within(requestsTable()).getByText(request.Reference),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(STILL_LOADING)).not.toBeInTheDocument();
  });

  // AC-4
  it('says no expense requests have been imported yet and offers the upload action as the next step', async () => {
    mockGet.mockResolvedValue(transactionListResponse([]));

    renderList();

    expect(
      await screen.findByText(/no expense requests have been imported yet/i),
    ).toBeInTheDocument();

    // The next step is offered as a real navigational link to the upload screen.
    const uploadActions = screen
      .queryAllByRole('link')
      .filter((link) => link.getAttribute('href') === UPLOAD_PATH);
    expect(uploadActions).toHaveLength(1);
    const [uploadAction] = uploadActions;
    expect(uploadAction).toHaveAccessibleName(UPLOAD_ACTION_NAME);

    // Nothing imported is an answer, not a failure and not a wait — and there is no
    // table of nothing.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
