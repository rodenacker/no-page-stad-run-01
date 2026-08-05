/**
 * Story Metadata:
 * - Epic: expense-request-list — Story 2: search and filter the request list
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-3 — the search term and every filter currently narrowing the list stay
 *   visibly indicated while they apply;
 * - AC-4 — the narrowed-empty state: requests DO exist, the narrowing hides them
 *   all, and the screen names what is applied, offers clear-all, and does NOT offer
 *   the upload action (R10/R18 — the distinction against story 1's
 *   nothing-ever-imported state, R9/R17);
 * - AC-6 — the status / originating-file / transaction-type choices offered are the
 *   values present in the fetched set, types under the app's plain-language label
 *   where it has one and the service's own value where it does not.
 *
 * AC-1 (search narrows / clearing restores), AC-2 (each filter narrows, and
 * combinations narrow cumulatively) and AC-5 (clear-all restores everything) belong
 * to this story's Playwright spec and are deliberately NOT duplicated here
 * (testing-policy.md § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. The narrowing layer is added to STORY 1's list component,
 *    `web/src/components/requests/ExpenseRequestList.tsx` (named export
 *    `ExpenseRequestList`, no required props, client component). It is not a new
 *    parallel component and it does not re-fetch: all narrowing is in memory over
 *    the single set story 1 already fetched from `GET /v1/transactions`, which
 *    accepts no query parameters (brief §Notes & Caveats).
 *    **If story 1 named that file or export differently, story 1's name wins —
 *    rename the import below to match rather than adding a second component.**
 * 2. Narrowing state is component-local React state, NOT the URL's search
 *    parameters. Nothing in this story asks for a shareable/bookmarkable narrowed
 *    address, and the endpoint takes no parameters.
 * 3. Four controls, each with an accessible name (the queries below are how a
 *    keyboard or screen-reader user finds them — WCAG 2.2 AA is this project's bar):
 *    - a free-text search box labelled with the word "search";
 *    - three pick-one filters labelled with "status", "originating file" and
 *      "transaction type" respectively. Each MUST be the Shadcn `select`
 *      (`combobox` trigger opening a `listbox` of `option`s) — never a native
 *      `<select>`, whose OS-drawn list cannot evidence the keyboard bar. `Escape`
 *      closes an open list (also part of that bar; the helpers below rely on it).
 * 4. Each filter offers exactly one choice per DISTINCT value present in the
 *    fetched set — nothing the service sent may be missing, and nothing may be
 *    offered that the fetched set does not contain (no hardcoded enum: the service
 *    owns the accepted set, brief §Notes & Caveats). A transaction type the app has
 *    wording for is offered under that wording ("… money in" / "… money out"); a
 *    value it has no wording for is offered verbatim. Keep the filter's wording and
 *    the table cell's wording coming from ONE translation helper, so a row and its
 *    filter choice can never disagree.
 *    A single leading reset choice whose label starts with "All"/"Any" (e.g. "All
 *    statuses") is permitted and is ignored by the assertions below; every OTHER
 *    choice must be a value present in the data.
 * 5. The active-narrowing summary — one place that says what is currently applied
 *    (R3/R7/R18):
 *    - a `<section>` (role `region`) whose accessible name contains "applied"
 *      (e.g. "What is currently applied");
 *    - inside it, a LIST with **one `listitem` per active narrowing**, each naming
 *      what it narrows by. Story 3's amount range and date range join the same list
 *      without reshaping it, which is why these tests count items rather than
 *      expecting exactly three chips;
 *    - an item disappears as soon as its narrowing stops applying (clear the search
 *      box and the search item goes, the filter items stay).
 * 6. The narrowed-empty state (R10/R18), when the narrowing hides every request but
 *    requests do exist:
 *    - wording that says no requests match what is applied;
 *    - the active-narrowing summary above, still naming everything applied;
 *    - a "Clear all" button, enabled;
 *    - and **no upload action of any kind** — no link to `/upload`, no
 *      upload-named control, and not story 1's "…have been imported yet" wording.
 *      That absence is the whole point of R10/R18 against R9/R17: offering "upload
 *      a file" to someone whose own filter hid their requests is the failure mode
 *      these criteria exist to prevent.
 * 7. Search scope is the ON-SCREEN values only: `Reference`, `Description`,
 *    `FileName`, `Amount`, and the VISIBLE last four digits of `AccountNumber`. A
 *    FULL account number must NOT match anything — matching the unmasked value
 *    would let a searcher confirm a guessed number without ever revealing it, a way
 *    round the masking POPIA requires (project.md §Compliance, brief §Notes &
 *    Caveats). AC-4's test below narrows by a full account number precisely to pin
 *    that, so the empty result there is a compliance assertion, not just a
 *    convenient no-match.
 * 8. Keep the search debounce SHORT (≤300ms). These tests wait on real timers, and
 *    the story asks for a debounce short enough that a type-then-assert flow sees
 *    the narrowed result without an explicit wait.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy) — plus `next/navigation`, which has no App
 * Router context in jsdom (house convention). The toast composition is the real
 * production code the root layout mounts. Every request body comes from the
 * project-wide factory in `@/mocks/data/transaction`, shared with the Playwright
 * layer, so the two layers cannot drift onto different data.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): `/requests` is
 * still a `notFound()` placeholder, story 1's list component does not exist yet, and
 * neither does the narrowing layer this file describes.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — these imports fail until implemented (TDD red).
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// Real production toast composition (not mocked) — the same one the root layout
// wraps every signed-in screen in.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
// The upload address, read from the one place that owns it, so the "no upload
// action here" assertion cannot drift from the real route.
import { UPLOAD_PATH } from '@/lib/auth/access-map';

// Project-wide Transaction factory: the single source of truth for the wire shape
// and its canonical values, shared with the Playwright layer. Never hand-write a
// response body in a test.
import {
  CANCELLED_FILE,
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_TYPE_CREDIT_CODE,
  TRANSACTION_TYPE_DEBIT_CODE,
  TRANSACTION_TYPE_UNTRANSLATED,
  transactionListResponse,
  transactionsForNarrowing,
} from '@/mocks/data/transaction';

import type { TransactionRead } from '@/types/transactions';

vi.mock('@/lib/api/client', () => ({ get: vi.fn(), post: vi.fn() }));

// No App Router context exists in jsdom, so any navigation hook the list reaches
// for would throw on mount. Narrowing itself must not depend on these (contract
// note 2).
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

// --- the fetched set these tests narrow --------------------------------------

/**
 * The shared narrowing fixture: 8 distinct requests, no two sharing the duplicate
 * key, spanning three statuses, three originating files and three transaction-type
 * values (both codes the app translates plus one it does not).
 */
const FETCHED_REQUESTS: TransactionRead[] = transactionsForNarrowing();

const distinct = (values: string[]): string[] => [...new Set(values)];

/** Exactly the values the service sent — what each filter must offer (AC-6). */
const STATUSES_PRESENT = distinct(FETCHED_REQUESTS.map((r) => r.Status));
const FILES_PRESENT = distinct(FETCHED_REQUESTS.map((r) => r.FileName));
const TYPES_PRESENT = distinct(FETCHED_REQUESTS.map((r) => r.TransactionType));

/** A fixture request found by its own reference, never by position. */
const fixtureRequest = (reference: string): TransactionRead => {
  const found = FETCHED_REQUESTS.find(
    (request) => request.Reference === reference,
  );
  if (found === undefined) {
    throw new Error(
      `No fixture request with reference "${reference}" — see ` +
        `transactionsForNarrowing() in web/src/mocks/data/transaction.ts.`,
    );
  }
  return found;
};

/** An imported credit from the default file; its account number is used below. */
const SALARY_REQUEST = fixtureRequest('TXN-20260401-0001');

/**
 * The one request in the fixture that satisfies every narrowing AC-3 applies at
 * once: approved, from the April 30th file, of the type the app calls "…money in",
 * and describing an EFT. So the list stays non-empty while the summary is asserted.
 */
const EFT_REQUEST = fixtureRequest('TXN-20260430-0016');
const SEARCH_TERM = 'EFT';
const SECOND_FILE = EFT_REQUEST.FileName;

/** The app's wording for the two type codes it translates (brief R1). */
const CREDIT_WORDING = /money in/i;
const DEBIT_WORDING = /money out/i;

// --- control and state contracts (notes 3, 5 and 6) --------------------------

const SEARCH_LABEL = /search/i;
const STATUS_FILTER_LABEL = /status/i;
const FILE_FILTER_LABEL = /originating file/i;
const TYPE_FILTER_LABEL = /transaction type/i;

/** The summary region's accessible name — "What is currently applied" and friends. */
const APPLIED_SUMMARY_NAME = /applied/i;

/** A permitted per-filter reset choice ("All statuses", "Any file"), not a value. */
const RESET_CHOICE = /^(all|any)\b/i;

const NARROWED_EMPTY_MESSAGE = /no (expense )?requests match/i;
const NOTHING_IMPORTED_WORDING = /imported yet/i;
const CLEAR_ALL_NAME = /clear all/i;

/** Room for the search debounce (contract note 8) without an explicit wait. */
const SETTLED = { timeout: 2000 };

// --- helpers ------------------------------------------------------------------

/** The list as the root layout always mounts it: inside the toast composition. */
const renderList = () =>
  render(
    <ToastProvider>
      <ExpenseRequestList />
      <ToastContainer />
    </ToastProvider>,
  );

/**
 * Waits for the whole fetched set to be on screen — one row per request plus the
 * header row. Pinned to the fixture size, so a truncated or empty render cannot
 * pass, and so the narrowed-empty test below genuinely starts from "requests exist".
 */
const waitForEveryRequest = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.getAllByRole('row')).toHaveLength(
      FETCHED_REQUESTS.length + 1,
    );
  });
};

/** The active-narrowing summary, with a contract reminder when it is missing. */
const appliedSummary = (): HTMLElement => {
  const summary = screen.queryByRole('region', { name: APPLIED_SUMMARY_NAME });
  if (summary === null) {
    throw new Error(
      'No region naming what is currently applied was found. While a search term ' +
        'or a filter applies, the list must render one summary region (a ' +
        '<section> whose accessible name contains "applied") holding one list ' +
        'item per active narrowing — see contract note 5.',
    );
  }
  return summary;
};

/** Opens a pick-one filter and hands back its open listbox. */
const openFilter = async (
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
): Promise<HTMLElement> => {
  await user.click(trigger);
  return screen.getByRole('listbox');
};

/** Closes the open listbox from the keyboard (contract note 3). */
const closeOpenFilter = async (
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> => {
  await user.keyboard('{Escape}');
  await waitFor(() => {
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
};

/** Chooses a filter value the way a user does: open, then pick. */
const chooseFilterValue = async (
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
  name: string | RegExp,
): Promise<void> => {
  const listbox = await openFilter(user, trigger);
  await user.click(within(listbox).getByRole('option', { name }));
  await waitFor(() => {
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
};

/**
 * The value choices a filter offers, as the user reads them — the optional
 * "All…"/"Any…" reset choice excluded, since it is not a value from the data.
 */
const valueChoicesOf = async (
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
): Promise<string[]> => {
  const listbox = await openFilter(user, trigger);
  const choices = within(listbox)
    .getAllByRole('option')
    .map((option) => (option.textContent ?? '').trim())
    .filter((label) => label.length > 0 && !RESET_CHOICE.test(label));
  await closeOpenFilter(user);
  return choices;
};

describe('Epic expense-request-list, Story 2: search and filter the request list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-3
  it('keeps the search term and every applied filter visibly indicated, one indication per active narrowing, until each one stops applying', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue(transactionListResponse(FETCHED_REQUESTS));

    renderList();
    await waitForEveryRequest();

    // Captured before any narrowing is applied, so these references stay
    // unambiguous once the summary starts naming the same values.
    const searchBox = screen.getByLabelText(SEARCH_LABEL);
    const statusFilter = screen.getByLabelText(STATUS_FILTER_LABEL);
    const fileFilter = screen.getByLabelText(FILE_FILTER_LABEL);
    const typeFilter = screen.getByLabelText(TYPE_FILTER_LABEL);

    // --- a search term on its own is indicated ---------------------------
    await user.type(searchBox, SEARCH_TERM);

    await waitFor(() => {
      expect(appliedSummary()).toHaveTextContent(SEARCH_TERM);
    }, SETTLED);
    expect(within(appliedSummary()).getAllByRole('listitem')).toHaveLength(1);

    // --- and so is each filter, alongside it ------------------------------
    await chooseFilterValue(user, statusFilter, TRANSACTION_STATUS_APPROVED);
    await chooseFilterValue(user, fileFilter, SECOND_FILE);
    await chooseFilterValue(user, typeFilter, CREDIT_WORDING);

    // Each control shows its own chosen value…
    expect(statusFilter).toHaveTextContent(TRANSACTION_STATUS_APPROVED);
    expect(fileFilter).toHaveTextContent(SECOND_FILE);
    expect(typeFilter).toHaveTextContent(CREDIT_WORDING);

    // …and the one summary names all four narrowings at once.
    const summary = appliedSummary();
    expect(summary).toHaveTextContent(SEARCH_TERM);
    expect(summary).toHaveTextContent(TRANSACTION_STATUS_APPROVED);
    expect(summary).toHaveTextContent(SECOND_FILE);
    expect(summary).toHaveTextContent(CREDIT_WORDING);
    // One item per active narrowing — the contract story 3's two ranges join
    // without reshaping (contract note 5), which is why this counts items rather
    // than expecting exactly three chips.
    expect(within(summary).getAllByRole('listitem')).toHaveLength(4);

    // The narrowing really is applied, not merely announced: the one request that
    // satisfies all four is still listed.
    expect(screen.getByText(EFT_REQUEST.Reference)).toBeInTheDocument();

    // --- an indication goes as soon as its narrowing stops applying --------
    await user.clear(searchBox);

    await waitFor(() => {
      expect(appliedSummary()).not.toHaveTextContent(SEARCH_TERM);
    }, SETTLED);

    const narrowed = appliedSummary();
    expect(narrowed).toHaveTextContent(TRANSACTION_STATUS_APPROVED);
    expect(narrowed).toHaveTextContent(SECOND_FILE);
    expect(narrowed).toHaveTextContent(CREDIT_WORDING);
    expect(within(narrowed).getAllByRole('listitem')).toHaveLength(3);
  });

  // AC-4
  it('names what is applied and offers clear-all — and never the upload action — when the narrowing leaves no request visible although requests exist', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue(transactionListResponse(FETCHED_REQUESTS));

    renderList();
    // Requests DO exist: this is the R10/R18 case, not story 1's R9/R17 one.
    await waitForEveryRequest();

    const searchBox = screen.getByLabelText(SEARCH_LABEL);
    const statusFilter = screen.getByLabelText(STATUS_FILTER_LABEL);

    await chooseFilterValue(user, statusFilter, TRANSACTION_STATUS_APPROVED);
    // A FULL, unmasked account number matches nothing — only its visible last four
    // digits are searchable (contract note 7, POPIA). So the narrowing empties the
    // list, and the emptiness is itself the compliance assertion.
    await user.type(searchBox, SALARY_REQUEST.AccountNumber);

    await waitFor(() => {
      expect(
        screen.queryByText(SALARY_REQUEST.Reference),
      ).not.toBeInTheDocument();
    }, SETTLED);
    FETCHED_REQUESTS.forEach((request) => {
      expect(screen.queryByText(request.Reference)).not.toBeInTheDocument();
    });

    // The screen says the narrowing is why nothing is listed…
    expect(screen.getByText(NARROWED_EMPTY_MESSAGE)).toBeInTheDocument();

    // …names everything that is applied…
    const summary = appliedSummary();
    expect(summary).toHaveTextContent(SALARY_REQUEST.AccountNumber);
    expect(summary).toHaveTextContent(TRANSACTION_STATUS_APPROVED);
    expect(within(summary).getAllByRole('listitem')).toHaveLength(2);

    // …and offers the one-go way out.
    expect(screen.getByRole('button', { name: CLEAR_ALL_NAME })).toBeEnabled();

    // The distinction against story 1's nothing-ever-imported state (R9/R17): the
    // creation action is NOT offered to someone whose own narrowing hid their
    // requests — no upload control, no route to the upload screen, and none of
    // story 1's "nothing imported yet" wording.
    expect(
      screen.queryByRole('link', { name: /upload/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /upload/i }),
    ).not.toBeInTheDocument();
    expect(
      screen
        .queryAllByRole('link')
        .filter((link) =>
          (link.getAttribute('href') ?? '').includes(UPLOAD_PATH),
        ),
    ).toEqual([]);
    expect(
      screen.queryByText(NOTHING_IMPORTED_WORDING),
    ).not.toBeInTheDocument();
  });

  // AC-6
  // Data-contract: that these choices are built from what the real service returned
  // (rather than from a mocked body) is confirmed in the browser by this story's
  // Playwright spec and on the manual checklist.
  it('offers exactly the status, originating-file and transaction-type values present in the fetched requests, translated types under the app’s own wording and an untranslated type verbatim', async () => {
    const user = userEvent.setup();

    // Fixture preconditions — so each assertion below covers a real spread of
    // values rather than passing on a single-valued set.
    expect(STATUSES_PRESENT).toHaveLength(3);
    expect(FILES_PRESENT).toHaveLength(3);
    expect(new Set(TYPES_PRESENT)).toEqual(
      new Set([
        TRANSACTION_TYPE_CREDIT_CODE,
        TRANSACTION_TYPE_DEBIT_CODE,
        TRANSACTION_TYPE_UNTRANSLATED,
      ]),
    );

    mockGet.mockResolvedValue(transactionListResponse(FETCHED_REQUESTS));

    renderList();
    await waitForEveryRequest();

    // --- status: every value present, and nothing else --------------------
    const statusChoices = await valueChoicesOf(
      user,
      screen.getByLabelText(STATUS_FILTER_LABEL),
    );
    expect(new Set(statusChoices)).toEqual(new Set(STATUSES_PRESENT));

    // --- originating file: the same, from the files the requests came from --
    const fileChoices = await valueChoicesOf(
      user,
      screen.getByLabelText(FILE_FILTER_LABEL),
    );
    expect(new Set(fileChoices)).toEqual(new Set(FILES_PRESENT));
    // Choices come from the fetched set alone — a file no fetched request belongs
    // to is not offered.
    expect(fileChoices).not.toContain(CANCELLED_FILE.CurrentFileName);

    // --- transaction type: the service owns the accepted set --------------
    const typeChoices = await valueChoicesOf(
      user,
      screen.getByLabelText(TYPE_FILTER_LABEL),
    );
    // One choice per distinct value the service sent — nothing missing, nothing
    // invented (no hardcoded enum).
    expect(typeChoices).toHaveLength(TYPES_PRESENT.length);
    // The value the app has no wording for is offered exactly as it arrived…
    expect(typeChoices).toContain(TRANSACTION_TYPE_UNTRANSLATED);
    // …while the two it does translate are offered under that wording, never as
    // the bare code the user would not recognise.
    expect(typeChoices).not.toContain(TRANSACTION_TYPE_CREDIT_CODE);
    expect(typeChoices).not.toContain(TRANSACTION_TYPE_DEBIT_CODE);
    expect(
      typeChoices.filter((choice) => CREDIT_WORDING.test(choice)),
    ).toHaveLength(1);
    expect(
      typeChoices.filter((choice) => DEBIT_WORDING.test(choice)),
    ).toHaveLength(1);
  });
});
