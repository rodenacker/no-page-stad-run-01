/**
 * Story Metadata:
 * - Epic: request-list-redesign — Redesign the request list as a batch listing
 * - Story: 7 — The continuation line at the foot
 * - Route: /requests
 * - Target File: web/src/components/requests/RequestListPagination.tsx
 * - Page Action: modify_existing
 * - Requirements: R14, R2, R10, BR2
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-1 (the foot reads as ONE continuation line stating which records are shown,
 *   out of how many, and which page of how many), AC-2 (the requests-per-page choice
 *   is a field, still offering 5/10/20/50 and still starting at 20) and AC-4 (a set
 *   that fits one page leaves the back/next controls on the screen and unusable) →
 *   this file (`vitest`).
 * - AC-3 (paging forward and back walks the same requests in the same order, and a
 *   page-size change re-cuts from the first page) and AC-5 (the line and the listing
 *   holding their shape at one request, at a page of 50 and across a 428-request
 *   batch spanning 22 pages) →
 *   `web/e2e/epic-request-list-redesign-story-7-the-continuation-line-at-the-foot.spec.ts`
 *   (`playwright`). Real ordering across many pages, and the rendered shape of the
 *   line at each end of the volume range, need a real browser — so neither is
 *   duplicated here (testing-policy.md § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE CONTINUATION LINE IS ONE LINE. R14 and the design brief (§3, sequence step
 *    4) state its notation exactly: `RECORDS 1–20 OF 428 · PAGE 1 OF 22`. The
 *    assertion below therefore requires a SINGLE element whose whole text is that
 *    line — five figures, in that order, in one reading — rather than the three
 *    separate scraps of text the current foot shows ("20", "428 requests",
 *    "Page 1 of 22"). That is the difference between a continuation line and a row of
 *    controls, and it is the only way a test can state it.
 *    Deliberately tolerant, so styling stays free: the match is case-insensitive
 *    (uppercase may be CSS `text-transform`, and the numerals may be wrapped in their
 *    own mono spans), whitespace between the tokens is optional (flex gaps are not
 *    text), the range dash may be `–`, `—` or `-`, and the `·` separator may be
 *    another mark or absent. What is NOT negotiable is the information: the word
 *    RECORDS, the first and last record numbers of the page, the total, and the page
 *    number out of the page count — in that order, in one element.
 * 2. THE FIGURES MUST DESCRIBE THE LISTING. Each assertion on the line is paired with
 *    the references actually rendered, read out of the DOM (see
 *    {@link referencesOnScreen}) and compared to the fixture's own rows. A line that
 *    is computed wrongly — or hard-coded — fails against the rows beside it. `1–20 OF
 *    428 · PAGE 1 OF 22` and `21–40 OF 428 · PAGE 2 OF 22` are both required, so a
 *    naive implementation that only ever states the first page cannot pass.
 * 3. NOTHING IS EVER REMOVED FROM THE FOOT (R2/UI-16, a `Must`, and AC-4 is the
 *    clause usually got wrong). When the listed set fits one page the back and next
 *    controls are STILL RENDERED and merely `disabled` — never absent, never
 *    conditionally unmounted. They are real `<button>`s carrying the `disabled`
 *    attribute, not anchors with `aria-disabled`: paging changes no address, so these
 *    are state controls, and `disabled` is what makes "cannot be used"
 *    programmatically determinable and takes them out of the tab order. `toBeDisabled`
 *    below does not accept `aria-disabled`.
 * 4. THE PAGE CONTROLS STAY INSIDE THE LABELLED PAGINATION LANDMARK. The story keeps
 *    the Shadcn `pagination` primitive, whose `<nav>` carries an accessible name
 *    naming what it pages ("Expense request pages"). The queries below scope to that
 *    landmark, which is what lets them accept either wording for the two controls
 *    ("Previous"/"Next" or "Back"/"Forward") without colliding with any other button
 *    on the screen.
 * 5. THE PAGE CONTROLS ARE **NOT** A LIST — and this file deliberately asserts no
 *    `ul`/`li` structure for them. At phone width the requests themselves are the
 *    screen's only list (one `listitem` per request); extra `listitem`s in the foot
 *    would break an accessibility assertion inherited from `expense-file-upload` /
 *    `expense-request-list`, for a reason that looks entirely unrelated to
 *    pagination. Keep them in a plain row inside the primitive's landmark (story
 *    § Implementation notes, "Non-obvious coupling — do not fix it").
 * 6. THE PAGE-SIZE SELECTOR STAYS A REAL, LABELLED, KEYBOARD-OPERABLE SHADCN `select`
 *    (`combobox` trigger opening a `listbox` of `option`s — never a native
 *    `<select>`, whose OS-drawn list cannot evidence the project's WCAG 2.2 AA
 *    keyboard bar). Its accessible name still contains "per page" or "page size", and
 *    its trigger still shows the size in force. "Presented as a field" is a STYLING
 *    decision (underline-only, in the strip's notation) — not a semantic one, and not
 *    a licence to drop the label or the role.
 * 7. THIS STORY RESTYLES THE SELECTOR; IT DOES NOT RE-DECLARE THE OPTIONS.
 *    `PAGINATION.PAGE_SIZE_OPTIONS` / `DEFAULT_PAGE_SIZE` in
 *    `web/src/lib/utils/constants.ts` own 5/10/20/50 and the default of 20. The
 *    requirement's own literals are stated below rather than imported (importing the
 *    implementation's value would let a wrong value pass), and the shared constant is
 *    checked against them once as a fixture precondition — so a second, hard-coded
 *    page-size vocabulary in the redesigned foot shows up as a disagreement rather
 *    than as a silently different list.
 * 8. WHETHER THE SELECTOR ITSELF IS DISABLED on a single-page set is deliberately NOT
 *    pinned: R2 requires only that it stay visible, and a reader who has narrowed to
 *    one request may still reasonably change the size.
 * 9. THE FOOT IS FED BY THE NARROWED, ORDERED SET the list already holds — no new
 *    fetch. `GET /v1/transactions` takes no query parameters, so exactly one response
 *    is mocked per render below and never re-resolved; the totals and the page count
 *    are derived client-side from that one set (brief §Data Model).
 * 10. NO ORDERING IS CHOSEN in these tests, so the listing is in the order the
 *    service sent it (`orderRequests(..., null)`) and page 2 is the fixture's rows
 *    21–40. Nothing here asserts sort behaviour.
 *
 * WHY AC-4's assertions read as a preservation guard: "visible but unusable" is
 * behaviour this screen already has, and BR1/BR2 forbid the redesign weakening it.
 * The red signal in that test is the continuation line the redesigned foot must state
 * beside those controls (`RECORDS 1–20 OF 20 · PAGE 1 OF 1`); the present-and-disabled
 * half must be green before AND after, which is the point of carrying it here.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy). The list, its narrowing, ordering and
 * paging, the real page-size selector and the real toast composition all run for
 * real. Response bodies come from the project-wide factory in
 * `web/src/mocks/data/transaction.ts`, shared with the Playwright layer, so the two
 * layers cannot drift onto different data.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): the foot currently
 * shows its figures as three separate scraps of text, not as one continuation line.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the list this epic redesigns (expense-request-list
// story 1), whose foot is `RequestListPagination`.
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// Real production toast composition (not mocked) — the arrangement the root layout
// wraps every signed-in screen in, and the one the list is always mounted inside.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
import { PAGINATION } from '@/lib/utils/constants';

// Project-wide Transaction factory: the single source of truth for the wire shape and
// its canonical values, shared with the Playwright layer. Never hand-write a response
// body in a test.
import {
  manyTransactions,
  transactionListResponse,
} from '@/mocks/data/transaction';

import type { TransactionRead } from '@/types/transactions';

vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockGet = get as unknown as ReturnType<typeof vi.fn>;

/**
 * R2/UI-16's own numbers, stated as the requirement's literals rather than imported
 * from the implementation — see contract note 7.
 */
const DEFAULT_PAGE_SIZE = 20;
const REQUIRED_PAGE_SIZES = [5, 10, 20, 50];

/** A page size that is on offer and is NOT the default, for proving the field works. */
const CHOSEN_PAGE_SIZE = 50;

/**
 * The batch R10 and the design brief name: 428 requests spanning 22 pages at the
 * default size of 20, and 9 pages at 50. The page counts are stated as literals for
 * the same reason the sizes are — re-deriving them here would just re-implement the
 * calculation under test.
 */
const LARGE_BATCH = 428;
const PAGES_AT_DEFAULT_SIZE = 22;
const PAGES_AT_CHOSEN_SIZE = 9;

/**
 * A term that appears in exactly ONE of the generated requests — in its reference and
 * its description, and in no other row's reference, description, account number,
 * amount, date or file name. {@link requestsMentioning} proves that below rather than
 * trusting it.
 */
const NARROWING_TERM = '0007';

/** The generated requests' reference format, used to read the listing out of the DOM. */
const REFERENCE_PATTERN = /^TXN-\d{8}-\d{4}$/;

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderList = () =>
  render(
    <ToastProvider>
      <ExpenseRequestList />
      <ToastContainer />
    </ToastProvider>,
  );

interface ContinuationFigures {
  /** The first record on the page, as the line numbers it. */
  from: number;
  /** The last record on the page. */
  to: number;
  /** How many records there are altogether. */
  total: number;
  /** The page being read, counting from 1. */
  page: number;
  /** How many pages there are. */
  pages: number;
}

/**
 * The continuation line as the reader reads it — `RECORDS 1–20 OF 428 · PAGE 1 OF 22`
 * — with the tolerances contract note 1 spells out: any casing, optional whitespace
 * between tokens, any of three range dashes, and an optional separator mark. Anchored
 * at both ends, which is what makes "one line" assertable: only an element whose
 * ENTIRE text is this line matches, so no surrounding wrapper of unrelated controls
 * can satisfy it.
 */
const continuationLinePattern = ({
  from,
  to,
  total,
  page,
  pages,
}: ContinuationFigures): RegExp =>
  new RegExp(
    [
      '^RECORDS',
      String(from),
      '[–—-]',
      String(to),
      'OF',
      String(total),
      '[·•|/—]?',
      'PAGE',
      String(page),
      'OF',
      `${String(pages)}$`,
    ].join('\\s*'),
    'i',
  );

/**
 * The element carrying the whole continuation line. Throws Testing Library's "unable
 * to find" (with the DOM printed) when no single element reads as that line — which is
 * the failure this story starts from.
 *
 * The innermost match is returned: a wrapper holding nothing but the line matches the
 * same anchored pattern as the line itself, and that nesting is a styling choice
 * rather than something to fail on.
 */
const continuationLine = (figures: ContinuationFigures): HTMLElement => {
  const matches = screen.getAllByText(continuationLinePattern(figures));
  return matches[matches.length - 1];
};

/**
 * Every request reference currently rendered, de-duplicated and sorted — the listing
 * as the reader sees it, read out of the DOM rather than counted off `role="row"`.
 *
 * De-duplicated because a reference set in mono inside its cell matches on both the
 * cell and the span, and sorted because the ORDER rows appear in is the Playwright
 * spec's business (AC-3), not this file's. Comparing this against the fixture's own
 * rows is what stops a continuation line being asserted in isolation from the records
 * it claims to describe.
 */
const referencesOnScreen = (): string[] => {
  const seen = new Set<string>();
  for (const element of screen.queryAllByText(REFERENCE_PATTERN)) {
    const reference = element.textContent?.trim() ?? '';
    if (reference !== '') {
      seen.add(reference);
    }
  }
  return [...seen].sort();
};

/** The same reading of a set of fixture rows, for comparison. */
const referencesOf = (requests: TransactionRead[]): string[] =>
  requests.map((request) => request.Reference).sort();

/**
 * The rows a search term genuinely reaches, across every field the list searches. Used
 * as a fixture precondition: if a term meant to single out one request also appears in
 * another row's account number or amount, "narrowed down to one page" is not what a
 * test using it would be proving.
 */
const requestsMentioning = (
  requests: TransactionRead[],
  term: string,
): TransactionRead[] =>
  requests.filter((request) =>
    [
      request.Reference,
      request.Description,
      request.AccountNumber,
      request.FileName,
      String(request.Amount),
      request.TransactionDate,
    ].some((value) => value.includes(term)),
  );

/** The labelled pagination landmark the two page controls live in (contract note 4). */
const pageControls = (): HTMLElement =>
  screen.getByRole('navigation', { name: /page/i });

/** The way back, whichever of the two accepted wordings it carries. */
const previousPageControl = (): HTMLElement =>
  within(pageControls()).getByRole('button', { name: /previous|back/i });

/** The way forward. */
const nextPageControl = (): HTMLElement =>
  within(pageControls()).getByRole('button', { name: /next|forward/i });

/** The requests-per-page field (Shadcn `select` → `role="combobox"`). */
const pageSizeField = (): HTMLElement =>
  screen.getByRole('combobox', { name: /per page|page size/i });

/** The free-text search the narrowing strip already offers (BR6). */
const searchField = (): HTMLElement =>
  screen.getByRole('searchbox', { name: /search/i });

/** Opens the page-size field and hands back its open list of choices. */
const openPageSizeField = async (
  user: ReturnType<typeof userEvent.setup>,
): Promise<HTMLElement> => {
  await user.click(pageSizeField());
  return screen.getByRole('listbox');
};

/** Waits for an open list of choices to close, so the next step is not racing it. */
const waitForChoicesToClose = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
};

/** The figure a choice offers, however its label is worded ("50", "50 per page"). */
const pageSizeIn = (option: HTMLElement): number =>
  Number(/\d+/.exec(option.textContent ?? '')?.[0]);

/** The page sizes on offer, in the order the reader is offered them. */
const pageSizesOffered = async (
  user: ReturnType<typeof userEvent.setup>,
): Promise<number[]> => {
  const choices = await openPageSizeField(user);
  const offered = within(choices).getAllByRole('option').map(pageSizeIn);
  await user.keyboard('{Escape}');
  await waitForChoicesToClose();
  return offered;
};

/** Chooses a page size the way a reader does: open the field, pick a size. */
const choosePageSize = async (
  user: ReturnType<typeof userEvent.setup>,
  size: number,
): Promise<void> => {
  const choices = await openPageSizeField(user);
  await user.click(
    within(choices).getByRole('option', {
      name: new RegExp(`\\b${String(size)}\\b`),
    }),
  );
  await waitForChoicesToClose();
};

/**
 * R2/UI-16's exact clause, asserted as the two halves it is made of — each of which on
 * its own would miss the real regression. Removing the controls when everything fits is
 * a defect, not a simplification; leaving them usable would be worse.
 *
 * A control that has been removed fails on the presence half as Testing Library's
 * "unable to find", with the DOM printed — which names the defect directly.
 */
const expectPageControlsPresentButUnusable = (): void => {
  // Half 1 — both are still ON the screen.
  expect(previousPageControl()).toBeInTheDocument();
  expect(nextPageControl()).toBeInTheDocument();
  // Half 2 — and neither can be used. `toBeDisabled` does not accept `aria-disabled`,
  // so these must be real `<button disabled>` controls (contract note 3).
  expect(previousPageControl()).toBeDisabled();
  expect(nextPageControl()).toBeDisabled();
};

describe('Epic request-list-redesign, Story 7: the continuation line at the foot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The chosen ordering lives in `sessionStorage` for the session
    // (`sortPreference.ts`), so it would otherwise leak between tests in this file.
    // Nothing here chooses an ordering: the listing stays in the order it was sent.
    window.sessionStorage.clear();
  });

  // AC-1
  it('reads as one continuation line stating which records are shown, out of how many, and which page of how many', async () => {
    const user = userEvent.setup();
    const batch = manyTransactions(LARGE_BATCH);
    mockGet.mockResolvedValue(transactionListResponse(batch));

    renderList();

    // The records the line will claim: the first 20 of the 428 fetched.
    const firstPage = batch.slice(0, DEFAULT_PAGE_SIZE);
    await waitFor(() => {
      expect(referencesOnScreen()).toEqual(referencesOf(firstPage));
    });

    // One element, whose whole text is the line — not three scraps of text sitting in
    // a row of controls (contract note 1).
    expect(
      continuationLine({
        from: 1,
        to: DEFAULT_PAGE_SIZE,
        total: LARGE_BATCH,
        page: 1,
        pages: PAGES_AT_DEFAULT_SIZE,
      }),
    ).toBeInTheDocument();

    // Moving on must move the line with the records, so a hard-coded or
    // first-page-only line cannot pass (contract note 2).
    await user.click(nextPageControl());

    const secondPage = batch.slice(DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE * 2);
    await waitFor(() => {
      expect(referencesOnScreen()).toEqual(referencesOf(secondPage));
    });
    expect(
      continuationLine({
        from: DEFAULT_PAGE_SIZE + 1,
        to: DEFAULT_PAGE_SIZE * 2,
        total: LARGE_BATCH,
        page: 2,
        pages: PAGES_AT_DEFAULT_SIZE,
      }),
    ).toBeInTheDocument();
  });

  // AC-2
  it('presents the requests-per-page choice as a labelled field offering 5, 10, 20 and 50, starting at 20, and cuts the listing to the size chosen', async () => {
    // Fixture precondition: the shared constant this story must keep using still
    // states R2's vocabulary. A second, hard-coded list in the redesigned foot would
    // disagree with these requirement literals (contract note 7).
    expect(PAGINATION.PAGE_SIZE_OPTIONS).toEqual(REQUIRED_PAGE_SIZES);
    expect(PAGINATION.DEFAULT_PAGE_SIZE).toEqual(DEFAULT_PAGE_SIZE);

    const user = userEvent.setup();
    const batch = manyTransactions(LARGE_BATCH);
    mockGet.mockResolvedValue(transactionListResponse(batch));

    renderList();

    // It starts at 20 — both as the field's own reading and as the size actually in
    // force on the listing.
    await waitFor(() => {
      expect(referencesOnScreen()).toEqual(
        referencesOf(batch.slice(0, DEFAULT_PAGE_SIZE)),
      );
    });
    expect(pageSizeField()).toHaveTextContent(
      new RegExp(`\\b${String(DEFAULT_PAGE_SIZE)}\\b`),
    );
    expect(
      continuationLine({
        from: 1,
        to: DEFAULT_PAGE_SIZE,
        total: LARGE_BATCH,
        page: 1,
        pages: PAGES_AT_DEFAULT_SIZE,
      }),
    ).toBeInTheDocument();

    // Exactly the four sizes R2 requires, in that order, and nothing else — a field
    // offering a fifth size, or missing one, fails here.
    expect(await pageSizesOffered(user)).toEqual(REQUIRED_PAGE_SIZES);

    // And the field is a real choice rather than decoration: picking 50 re-cuts the
    // listing and the line to 50 records a page.
    await choosePageSize(user, CHOSEN_PAGE_SIZE);

    await waitFor(() => {
      expect(referencesOnScreen()).toEqual(
        referencesOf(batch.slice(0, CHOSEN_PAGE_SIZE)),
      );
    });
    expect(pageSizeField()).toHaveTextContent(
      new RegExp(`\\b${String(CHOSEN_PAGE_SIZE)}\\b`),
    );
    expect(
      continuationLine({
        from: 1,
        to: CHOSEN_PAGE_SIZE,
        total: LARGE_BATCH,
        page: 1,
        pages: PAGES_AT_CHOSEN_SIZE,
      }),
    ).toBeInTheDocument();
  });

  // AC-4
  it('keeps the back and next controls on the screen and unusable when everything listed fits on one page — at a single request, at an exactly full page, and after narrowing down to one', async () => {
    const user = userEvent.setup();

    // --- one request in the whole batch --------------------------------------
    const singleRequest = manyTransactions(1);
    mockGet.mockResolvedValue(transactionListResponse(singleRequest));

    const singleRequestView = renderList();

    await waitFor(() => {
      expect(referencesOnScreen()).toEqual(referencesOf(singleRequest));
    });
    expectPageControlsPresentButUnusable();
    // The field goes nowhere either, and still reads as the size in force.
    expect(pageSizeField()).toHaveTextContent(
      new RegExp(`\\b${String(DEFAULT_PAGE_SIZE)}\\b`),
    );

    singleRequestView.unmount();

    // --- exactly one full page: 20 records at a page size of 20 ---------------
    // The off-by-one case — `ceil(20 / 20)` is 1 page, so there is genuinely nowhere
    // to go, and the line must say so.
    mockGet.mockReset();
    const exactlyOnePage = manyTransactions(DEFAULT_PAGE_SIZE);
    mockGet.mockResolvedValue(transactionListResponse(exactlyOnePage));

    const fullPageView = renderList();

    await waitFor(() => {
      expect(referencesOnScreen()).toEqual(referencesOf(exactlyOnePage));
    });
    expectPageControlsPresentButUnusable();
    expect(
      continuationLine({
        from: 1,
        to: DEFAULT_PAGE_SIZE,
        total: DEFAULT_PAGE_SIZE,
        page: 1,
        pages: 1,
      }),
    ).toBeInTheDocument();

    fullPageView.unmount();

    // --- narrowed from more than a page down to a single request --------------
    // The set starts LARGER than one page, so the controls start usable: that is what
    // makes the disabled state below attributable to "everything now fits" rather
    // than to a foot that disables them unconditionally.
    mockGet.mockReset();
    const twoPages = manyTransactions(DEFAULT_PAGE_SIZE + 5);
    const matching = requestsMentioning(twoPages, NARROWING_TERM);
    // Fixture precondition: the term singles out exactly one request, across every
    // field the list searches.
    expect(matching).toHaveLength(1);
    mockGet.mockResolvedValue(transactionListResponse(twoPages));

    renderList();

    await waitFor(() => {
      expect(referencesOnScreen()).toEqual(
        referencesOf(twoPages.slice(0, DEFAULT_PAGE_SIZE)),
      );
    });
    expect(nextPageControl()).toBeEnabled();

    await user.type(searchField(), NARROWING_TERM);

    // The generous window accommodates the search debounce, whose exact interval is
    // the developer's choice.
    await waitFor(
      () => {
        expect(referencesOnScreen()).toEqual(referencesOf(matching));
      },
      { timeout: 3000 },
    );

    expectPageControlsPresentButUnusable();
    expect(pageSizeField()).toBeInTheDocument();
  });
});
