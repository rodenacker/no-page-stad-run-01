/**
 * Story Metadata:
 * - Epic: expense-request-list — Story 3: filter by amount range and date range
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-4 — an upper bound BELOW the lower bound is reported on the screen as the
 *   wrong way round, is NOT applied, and leaves the visible requests exactly as
 *   they were rather than emptying the list. This is the R10/R18 failure mode the
 *   epic exists to prevent: an unexplained empty list.
 * - AC-6 — amounts are compared as NUMBERS (9.99 is outside a 100-to-200 range,
 *   which it is not by text order) and dates CHRONOLOGICALLY (a request from an
 *   earlier year is outside a range whose bounds fall in a later one).
 *
 * AC-1 (lower bound only), AC-2 (upper bound only), AC-3 (both bounds, inclusive,
 * including the last-day-of-range request whose stored value carries a time of day)
 * and AC-5 (the ranges narrow alongside the search and the other filters, appear in
 * the summary of what is applied, and are removed by clear-all) are the Playwright
 * spec's — deliberately not duplicated here (testing-policy.md § "One tag, one
 * layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 *  1. Both ranges are added to the SAME client component stories 1 and 2 build —
 *     `web/src/components/requests/ExpenseRequestList.tsx`, named export
 *     `ExpenseRequestList`, no required props — narrowing the one set already
 *     fetched. `GET /v1/transactions` accepts no query parameters, so nothing here
 *     is a re-read: no new request is made when a bound changes.
 *  2. **Four typeable bound inputs**, each reachable by its own label. These tests
 *     drive them with `user.type()`, so a calendar-popover-only control (or a
 *     control that is not an input) cannot pass — which is deliberate: story 4's
 *     keyboard-completability sweep has to be able to evidence them, and Playwright
 *     has to be able to `fill()` them. A calendar affordance may be added *in
 *     addition to* the typeable field, never instead of it. The labels these tests
 *     query (each must match exactly one labelled control), and the values they
 *     type:
 *       - /minimum.*amount/i  ← "100" / "200"     (e.g. "Minimum amount")
 *       - /maximum.*amount/i  ← "200" / "100"     (e.g. "Maximum amount")
 *       - /earliest.*date/i   ← "2026-04-01"      (e.g. "Earliest transaction date")
 *       - /latest.*date/i     ← "2026-04-30"      (e.g. "Latest transaction date")
 *     Both a native `<input type="date">` and a plain text/number Shadcn `input`
 *     were confirmed typeable and clearable under jsdom, so either satisfies these
 *     assertions. **Prefer `type="date"` / `type="number"`**: the browser then only
 *     ever hands the component a complete value, so there is no half-typed
 *     "2026-0" to interpret. If you do use a text field, an incomplete or
 *     unparseable value must simply not act as a bound (never as a bound of 0, and
 *     never as an invalid-range report).
 *  3. **Comparison semantics** (brief R7, story §Technical summary):
 *     - amount → compared as NUMBERS against the `Amount` number. Never as text,
 *       and never against the formatted cell string.
 *     - date → compared CHRONOLOGICALLY against `TransactionDate` **as the service
 *       writes it**, with the upper day bound covering a value that carries a time
 *       of day (`2026-04-15 15:00:00` is inside a range whose latest bound is
 *       `2026-04-15`). Do NOT invent a normalisation of `TransactionDate`: the
 *       format is an unverified assumption recorded for the manual-test approval
 *       (`state.json.epic.unverifiedAssumptions`, brief §Notes & Caveats) — encode
 *       the documented behaviour, do not guess a repair the service has not
 *       confirmed.
 *     - BOTH bounds are INCLUSIVE, and either bound may be given alone (the other
 *       end stays open).
 *  4. **An invalid range is reported and NOT applied — neither of its bounds.**
 *     When the upper bound is below the lower bound:
 *       - the screen says so, in an announceable `role="alert"` whose wording
 *         contains "wrong way round" and names which range it is (the word "amount"
 *         or the word "date"). Suggested wording: "The amount range is the wrong way
 *         round — the highest amount is below the lowest, so it has not been
 *         applied." / "The date range is the wrong way round — the latest date is
 *         before the earliest, so it has not been applied.";
 *       - that whole range stops narrowing the list — **not just the offending
 *         bound**. This is the only deterministic reading of "leaves the previously
 *         visible set alone" (a "keep the last valid state" implementation would
 *         depend on which keystroke arrived last) and it is what "does not count as
 *         active narrowing" means: with only an invalid range entered, the list is
 *         exactly as it was before either bound was typed;
 *       - the values the user typed stay in their inputs. The screen reports; it
 *         never silently swaps, clamps or blanks a bound;
 *       - the narrowed-empty state (R10/R18) is NOT entered, and the report clears
 *         as soon as the range is emptied or corrected.
 *     The other range, the search term and the pick-one filters keep narrowing
 *     normally while one range is invalid.
 *  5. Both ranges join story 2's existing active-narrowing summary and its
 *     **Clear all** — no parallel reset of their own. An invalid range contributes
 *     nothing to that summary (point 4).
 *  6. The bound inputs are component state driven by the user's typing. The
 *     `next/navigation` stubs below are inert: do not make the URL the source of
 *     truth for what the controls hold, or the controls stop responding to typing.
 *  7. Colour, type face and radius come only from the tokens in
 *     `web/src/app/globals.css` — no hex literals, no Tailwind palette utilities.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy) — plus `next/link` and `next/navigation`,
 * libraries at the client-navigation boundary that need an App Router context jsdom
 * has not got. Every request body comes from the project-wide factory in
 * `@/mocks/data/transaction`, shared with the Playwright layer, so the two layers
 * cannot drift onto different data: `transactionsForNarrowing()` already carries the
 * amounts sitting exactly on 100 and 200, the 9.99 text-order trap, the 2025-dated
 * request and the `2026-04-15 15:00:00` last-day-of-range row.
 *
 * These tests WILL FAIL until the story is implemented (TDD red) — `/requests` is
 * still a `notFound()` placeholder, and `@/types/transactions` and the component
 * below do not exist yet.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — these imports fail until implemented (TDD red).
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// Real production toast composition (not mocked) — the same one the root layout
// wraps every signed-in screen in, and the arrangement story 1 renders the list in.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';

// Project-wide Transaction factory: the single source of truth for the wire shape
// and its canonical values, shared with the Playwright layer. Never hand-write a
// response body in a test.
import {
  transactionListResponse,
  transactionsForNarrowing,
} from '@/mocks/data/transaction';

import type { UserEvent } from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

import type { TransactionRead } from '@/types/transactions';

vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  apiClient: vi.fn(),
}));

/**
 * `next/link` stubbed with the plain anchor it renders in the browser, so any action
 * the screen offers keeps its `link` role and its `href` without an App Router
 * context in jsdom. A library, never the code under test.
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

/**
 * The other half of that boundary. Inert on purpose: the bounds are the component's
 * own state (contract point 6), so nothing here supplies them.
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

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderList = () =>
  render(
    <ToastProvider>
      <ExpenseRequestList />
      <ToastContainer />
    </ToastProvider>,
  );

/** The bound inputs, by the label each must carry (contract point 2). */
const BOUND = {
  minimumAmount: /minimum.*amount/i,
  maximumAmount: /maximum.*amount/i,
  earliestDate: /earliest.*date/i,
  latestDate: /latest.*date/i,
} as const;

/** The wording an invalid range must be reported in (contract point 4). */
const WRONG_WAY_ROUND = /wrong way round/i;

/** An element's visible text, with runs of whitespace collapsed as the DOM shows it. */
const textOf = (element: HTMLElement): string =>
  (element.textContent ?? '').replace(/\s+/g, ' ').trim();

/** The list's table — the one arrangement these assertions read. */
const requestsTable = (): HTMLElement => screen.getByRole('table');

/**
 * The whole fetched set for these tests. The shared factory's spread is what makes
 * both criteria assertable — see the fixture preconditions inside AC-6.
 */
const ALL: TransactionRead[] = transactionsForNarrowing();

/** A fixture request by its reference, so no assertion selects a row by index. */
const requestReferenced = (reference: string): TransactionRead => {
  const found = ALL.find((request) => request.Reference === reference);
  if (found === undefined) {
    throw new Error(
      `No request referenced "${reference}" in transactionsForNarrowing() — the ` +
        `shared factory (src/mocks/data/transaction.ts) has moved underneath this ` +
        `test. Re-anchor these fixtures rather than weakening the assertions.`,
    );
  }
  return found;
};

/** Amount exactly ON the lower bound of the 100-to-200 range used below. */
const ON_LOWER_BOUND = requestReferenced('TXN-20260415-0007');
/** Amount comfortably inside that range (and dated on the range's last day). */
const INSIDE_RANGE = requestReferenced('TXN-20260430-0011');
/** Amount exactly ON the upper bound. */
const ON_UPPER_BOUND = requestReferenced('TXN-20260430-0012');
/** 9.99 — inside "100" to "200" only if amounts are compared as TEXT. */
const TEXT_ORDER_TRAP = requestReferenced('TXN-20260430-0020');
/** Dated in an earlier YEAR than either bound of the April 2026 range below. */
const EARLIER_YEAR = requestReferenced('TXN-20251120-0003');

/**
 * The references of the fetched requests currently rendered, scoped to the table so
 * a narrow-viewport arrangement of the same requests cannot be counted twice, and
 * read in fixture order so the assertions never depend on the order the service
 * returned or on the sort in force.
 */
const visibleReferences = (): string[] =>
  ALL.filter(
    (request) =>
      within(requestsTable()).queryAllByText(request.Reference).length > 0,
  ).map((request) => request.Reference);

/**
 * Waits until EXACTLY the given requests are listed — nothing missing, nothing
 * extra. Pinned to the fixture, so neither an empty render nor an unnarrowed one
 * can pass (testing-policy.md § anti-pattern 8).
 */
const expectExactlyListed = async (
  expected: TransactionRead[],
): Promise<void> => {
  const wanted = expected.map((request) => request.Reference).sort();
  await waitFor(() => {
    expect(visibleReferences().sort()).toEqual(wanted);
  });
};

/** Types a value into a bound input, replacing whatever it held. */
const typeBound = async (
  user: UserEvent,
  bound: RegExp,
  value: string,
): Promise<void> => {
  const input = screen.getByLabelText(bound);
  await user.clear(input);
  await user.type(input, value);
};

/** Empties a bound input. */
const clearBound = async (user: UserEvent, bound: RegExp): Promise<void> => {
  await user.clear(screen.getByLabelText(bound));
};

/**
 * The screen's own report that a range is the wrong way round, as an announceable
 * alert naming which range it is. Tolerates the screen carrying other alerts, and
 * says what it did find when there is no such report.
 */
const wrongWayRoundReport = async (
  namingItsRange: RegExp,
): Promise<HTMLElement> =>
  await waitFor(() => {
    const alerts = screen.getAllByRole('alert');
    const report = alerts.find(
      (alert) =>
        WRONG_WAY_ROUND.test(textOf(alert)) &&
        namingItsRange.test(textOf(alert)),
    );
    if (report === undefined) {
      throw new Error(
        `No alert reporting a range as "wrong way round" and naming ` +
          `${String(namingItsRange)} — an upper bound below the lower bound must ` +
          `be reported in place (see the implementation contract above). Alerts ` +
          `found: ${alerts.map((alert) => `"${textOf(alert)}"`).join(', ') || 'none'}.`,
      );
    }
    return report;
  });

describe('Epic expense-request-list, Story 3: amount-range and date-range filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-4
  it('reports a range entered the wrong way round without applying it, leaving every request that was visible still visible instead of emptying the list', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue(transactionListResponse(ALL));

    renderList();

    // The set the user is looking at before touching a bound.
    await expectExactlyListed(ALL);

    // --- an amount range the wrong way round -------------------------------
    // A minimum of 200 with a maximum of 100 can match nothing at all, so an
    // implementation that applied it would empty the list — the unexplained-empty
    // failure mode R10/R18 exist to prevent.
    await typeBound(user, BOUND.minimumAmount, '200');
    await typeBound(user, BOUND.maximumAmount, '100');

    const amountReport = await wrongWayRoundReport(/amount/i);
    expect(amountReport).toHaveTextContent(WRONG_WAY_ROUND);

    // Not applied — every request is still listed, exactly as before. Neither bound
    // narrows while the range is the wrong way round, so this is the same set the
    // user was looking at before either was typed (contract point 4).
    await expectExactlyListed(ALL);

    // The bounds the user typed are still theirs: reported, never swapped,
    // clamped or blanked.
    expect(screen.getByLabelText(BOUND.minimumAmount)).toHaveDisplayValue(
      '200',
    );
    expect(screen.getByLabelText(BOUND.maximumAmount)).toHaveDisplayValue(
      '100',
    );

    // And because the range never counted as active narrowing, the screen is not
    // in the narrowed-empty state: the list itself is still what is on show.
    expect(requestsTable()).toBeInTheDocument();

    // --- emptying it withdraws the report ----------------------------------
    await clearBound(user, BOUND.minimumAmount);
    await clearBound(user, BOUND.maximumAmount);

    await waitFor(() => {
      expect(
        screen
          .queryAllByRole('alert')
          .filter((alert) => WRONG_WAY_ROUND.test(textOf(alert))),
      ).toHaveLength(0);
    });
    await expectExactlyListed(ALL);

    // --- the same holds for the date range ---------------------------------
    await typeBound(user, BOUND.earliestDate, '2026-04-30');
    await typeBound(user, BOUND.latestDate, '2026-04-01');

    const dateReport = await wrongWayRoundReport(/date/i);
    expect(dateReport).toHaveTextContent(WRONG_WAY_ROUND);

    await expectExactlyListed(ALL);
    expect(screen.getByLabelText(BOUND.earliestDate)).toHaveDisplayValue(
      '2026-04-30',
    );
    expect(screen.getByLabelText(BOUND.latestDate)).toHaveDisplayValue(
      '2026-04-01',
    );
    expect(requestsTable()).toBeInTheDocument();
  });

  // AC-6
  it('compares amounts as numbers, so 9.99 is outside a 100-to-200 range, and dates chronologically, so a request from an earlier year is outside a range whose bounds fall in a later one', async () => {
    const user = userEvent.setup();

    // Fixture preconditions — these are what make the assertions below mean what
    // they say, rather than passing by luck on some other request.
    expect(ON_LOWER_BOUND.Amount).toBe(100);
    expect(INSIDE_RANGE.Amount).toBe(189);
    expect(ON_UPPER_BOUND.Amount).toBe(200);
    expect(TEXT_ORDER_TRAP.Amount).toBe(9.99);
    // The trap itself: by TEXT order 9.99 sits at or above "100", so a string
    // comparison lets it into a 100-to-200 range. By number it is far below.
    expect(String(TEXT_ORDER_TRAP.Amount) >= '100').toBe(true);
    expect(TEXT_ORDER_TRAP.Amount < 100).toBe(true);
    // Exactly one request is dated outside April 2026, and it is in an earlier year.
    expect(
      ALL.filter(
        (request) => !request.TransactionDate.startsWith('2026-04'),
      ).map((request) => request.Reference),
    ).toEqual([EARLIER_YEAR.Reference]);
    expect(EARLIER_YEAR.TransactionDate.startsWith('2025-')).toBe(true);

    mockGet.mockResolvedValue(transactionListResponse(ALL));

    renderList();

    await expectExactlyListed(ALL);

    // --- amounts are numbers, not text ------------------------------------
    await typeBound(user, BOUND.minimumAmount, '100');
    await typeBound(user, BOUND.maximumAmount, '200');

    // Exactly the three requests inside 100–200, bounds included. 9.99 is NOT one
    // of them — the whole point of this criterion.
    await expectExactlyListed([ON_LOWER_BOUND, INSIDE_RANGE, ON_UPPER_BOUND]);
    expect(
      within(requestsTable()).queryAllByText(TEXT_ORDER_TRAP.Reference),
    ).toHaveLength(0);

    // With the upper end reopened, a minimum of 100 still leaves 9.99 out — this is
    // where a text comparison ("9.99" >= "100") wrongly lets it back in, and the
    // upper bound is no longer there to hide the mistake.
    await clearBound(user, BOUND.maximumAmount);

    await expectExactlyListed(
      ALL.filter((request) => request !== TEXT_ORDER_TRAP),
    );
    expect(
      within(requestsTable()).queryAllByText(TEXT_ORDER_TRAP.Reference),
    ).toHaveLength(0);

    await clearBound(user, BOUND.minimumAmount);
    await expectExactlyListed(ALL);

    // --- dates are chronological ------------------------------------------
    // A range whose bounds both fall in April 2026 leaves out the request dated in
    // 2025, and keeps every request dated inside it. Note what "every" costs here:
    // three of the kept requests are stored as `2026-04-30 <time>`, i.e. ON the
    // latest bound but carrying a time of day, so the upper day bound has to cover
    // the whole day (brief R7). A bare text comparison of the stored value against
    // "2026-04-30" would drop all three — the last-day casualty the epic's
    // unverified date-format assumption warns about.
    await typeBound(user, BOUND.earliestDate, '2026-04-01');
    await typeBound(user, BOUND.latestDate, '2026-04-30');

    await expectExactlyListed(
      ALL.filter((request) => request !== EARLIER_YEAR),
    );
    expect(
      within(requestsTable()).queryAllByText(EARLIER_YEAR.Reference),
    ).toHaveLength(0);
  });
});
