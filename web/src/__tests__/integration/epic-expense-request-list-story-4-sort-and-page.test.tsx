/**
 * Story Metadata:
 * - Epic: expense-request-list — Story 4: sort and page through the request list
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the single criterion tagged `vitest`: AC-4 — when the current set of
 * requests fits on ONE page, the page controls stay on the screen but cannot be
 * used. Both halves are asserted, because each on its own would miss the real
 * regression: removing the controls when everything fits is a defect, not a
 * simplification (R12, "visible but disabled" — story § Notes).
 *
 * AC-1 / AC-2 (ascending-then-descending sorting, the visible sort indicator,
 * and the sort surviving leaving and returning to the screen), AC-3 (the page
 * controls and the 5 / 10 / 20 / 50 choice in use), AC-5 (sorting and paging
 * acting on the narrowed set) and AC-6 (the real-browser accessibility scan and
 * the keyboard sweep) are the Playwright spec's — deliberately not duplicated
 * here (testing-policy.md § "One tag, one layer"). That is why this file is one
 * thorough `it()` about the disabled-not-hidden rule rather than a broad
 * sort-and-page suite.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these assertions pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. The list component is `web/src/components/requests/ExpenseRequestList.tsx`,
 *    named export `ExpenseRequestList`, no required props — story 1's client
 *    component, which stories 2–6 extend rather than replace. If story 1 lands
 *    that component under a different name, this import is the one line to
 *    reconcile (and story 1's own test file is the authority on the name).
 * 2. Paging is applied to the NARROWED set, in memory, over the single fetched
 *    set story 1 establishes — `GET /v1/transactions` takes no query parameters,
 *    so nothing here is re-fetched when the search term changes (this test mocks
 *    exactly one response and never re-resolves it).
 * 3. The default page size is 20 (R12). This test states that 20 as a literal
 *    rather than importing a production constant on purpose: importing the
 *    implementation's own value would make the test pass even if the value were
 *    wrong.
 * 4. The previous/next page controls are real `<button>` elements carrying the
 *    `disabled` attribute when they cannot be used — NOT anchors with
 *    `aria-disabled`. Client-side paging changes no address, so these are state
 *    controls rather than navigation; `disabled` is what makes "cannot be used"
 *    programmatically determinable and takes the control out of the tab order for
 *    the keyboard sweep (AC-6). Their accessible names must contain "previous"
 *    and "next" ("Go to previous page" / "Go to next page" both satisfy this).
 *    If the Shadcn `pagination` primitive is installed for the markup, render its
 *    previous/next slots as buttons rather than its default `<a>`.
 * 5. The page-size selector is a Shadcn `select` (never a native `<select>` —
 *    story § Infrastructure reuse notes), so it exposes `role="combobox"`, and
 *    its accessible name contains "per page" or "page size". Its trigger shows
 *    the page size currently in force.
 * 6. Whether the page-size SELECTOR is itself disabled when everything fits on
 *    one page is deliberately NOT pinned here — R12 only requires that it stay
 *    visible, and a user who has narrowed to three requests may reasonably still
 *    change the size. What is pinned is that it is never removed from the screen.
 * 7. The table renders a header row plus exactly one row per visible request and
 *    no other `role="row"` element (no `<tfoot>` row) — the same row contract
 *    story 1's test file pins, so the counts below are meaningful.
 * 8. The search field (story 2) has an accessible name containing "search". This
 *    file drives it only to make the narrowed set drop below the page size; the
 *    search behaviour itself is story 2's.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy). The request bodies come from the
 * project-wide factory in `@/mocks/data/transaction`, shared with the Playwright
 * layer, so the two layers cannot drift onto different response shapes.
 *
 * These tests WILL FAIL until the story is implemented (TDD red) — sorting and
 * paging do not exist yet, and `/requests` is still a `notFound()` placeholder.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — these imports fail until implemented (TDD red).
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// Real production toast composition (not mocked) — the arrangement the root
// layout wraps every signed-in screen in, and the one story 1's list is mounted
// inside.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';

// Project-wide Transaction factory: the single source of truth for the wire shape
// and its canonical values, shared with the Playwright layer. Never hand-write a
// response body in a test.
import {
  manyTransactions,
  transactionListResponse,
} from '@/mocks/data/transaction';

vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockGet = get as unknown as ReturnType<typeof vi.fn>;

/**
 * R12's default page size, stated as the requirement's own literal rather than
 * imported from the implementation — see contract note 3 above.
 */
const DEFAULT_PAGE_SIZE = 20;

/**
 * A term that appears in exactly ONE of the generated requests (its reference and
 * its description carry the same sequence number), and in none of their account
 * numbers, amounts, dates or file names. The fixture precondition below proves
 * that rather than trusting it.
 */
const NARROWING_TERM = '0007';

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderList = () =>
  render(
    <ToastProvider>
      <ExpenseRequestList />
      <ToastContainer />
    </ToastProvider>,
  );

/** The always-visible page-size selector (Shadcn `select` → `role="combobox"`). */
const pageSizeSelector = (): HTMLElement =>
  screen.getByRole('combobox', { name: /per page|page size/i });

/** The page controls themselves — buttons, per contract note 4. */
const previousPageControl = (): HTMLElement =>
  screen.getByRole('button', { name: /previous/i });

const nextPageControl = (): HTMLElement =>
  screen.getByRole('button', { name: /next/i });

describe('Epic expense-request-list, Story 4: sort and page through the request list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-4
  // Data-contract: that this single fetched set really is the one paged over —
  // rather than a re-read per page — is confirmed in the browser (this story's
  // Playwright spec) and on the manual checklist.
  it('keeps the page controls on the screen but unusable when the requests fit on one page — both at the default page size and after narrowing drops the set below it', async () => {
    const user = userEvent.setup();

    // --- the whole set fits exactly one page at the default size of 20 -------
    const onePageOfRequests = manyTransactions(DEFAULT_PAGE_SIZE);
    mockGet.mockResolvedValue(transactionListResponse(onePageOfRequests));

    const singlePageView = renderList();

    // Every request is visible, so there is genuinely nowhere to page to. Pinned
    // to the fixture size, so a truncated or empty render cannot pass.
    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(
        onePageOfRequests.length + 1,
      );
    });

    // Half 1 — the controls are still ON the screen, showing the size in force.
    expect(pageSizeSelector()).toBeInTheDocument();
    expect(pageSizeSelector()).toHaveTextContent(String(DEFAULT_PAGE_SIZE));
    expect(previousPageControl()).toBeInTheDocument();
    expect(nextPageControl()).toBeInTheDocument();

    // Half 2 — and they cannot be used.
    expect(previousPageControl()).toBeDisabled();
    expect(nextPageControl()).toBeDisabled();

    singlePageView.unmount();

    // --- a narrowed set drops below the page size ----------------------------
    // More requests than one page holds, so the controls START usable: that is
    // what makes the disabled state below attributable to "everything now fits"
    // rather than to a component that disables them unconditionally.
    mockGet.mockReset();
    const twoPagesOfRequests = manyTransactions(DEFAULT_PAGE_SIZE + 5);
    const matching = twoPagesOfRequests.filter((request) =>
      request.Reference.includes(NARROWING_TERM),
    );
    const narrowedOut = twoPagesOfRequests.filter(
      (request) => !request.Reference.includes(NARROWING_TERM),
    );
    // Fixture precondition: the term really does single out ONE request — it
    // must not also appear in another request's account number, amount, date or
    // file name, or "narrowed below the page size" would not be what is proven.
    expect(matching).toHaveLength(1);

    mockGet.mockResolvedValue(transactionListResponse(twoPagesOfRequests));

    renderList();

    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(DEFAULT_PAGE_SIZE + 1);
    });
    expect(nextPageControl()).toBeEnabled();

    await user.type(screen.getByLabelText(/search/i), NARROWING_TERM);

    // The generous timeout accommodates story 2's search debounce, whose exact
    // interval is the developer's choice (brief R6).
    await waitFor(
      () => {
        expect(screen.getAllByRole('row')).toHaveLength(matching.length + 1);
      },
      { timeout: 3000 },
    );
    expect(screen.getByText(matching[0].Reference)).toBeInTheDocument();
    expect(
      screen.queryByText(narrowedOut[0].Reference),
    ).not.toBeInTheDocument();

    // Half 1 again — narrowing to a single page must not take the controls away,
    // and it does not change the page size in force.
    expect(pageSizeSelector()).toBeInTheDocument();
    expect(pageSizeSelector()).toHaveTextContent(String(DEFAULT_PAGE_SIZE));
    expect(previousPageControl()).toBeInTheDocument();
    expect(nextPageControl()).toBeInTheDocument();

    // Half 2 again — and now that everything fits, neither can be used.
    expect(previousPageControl()).toBeDisabled();
    expect(nextPageControl()).toBeDisabled();
  });
});
