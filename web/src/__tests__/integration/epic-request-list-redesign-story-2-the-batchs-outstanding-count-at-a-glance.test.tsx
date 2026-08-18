/**
 * Story Metadata:
 * - Epic: request-list-redesign — Story 2: the batch's outstanding count, at a
 *   glance
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — the screen opens with one control block carrying `BATCH / RUN DATE /
 *   RECORDS / AWAITING DECISION / DECIDED / TOTAL VALUE`, each a small label over
 *   its figure, and there is NO page title sitting above the list any more;
 * - AC-3 — the figures state the truth about the batch: how many requests there
 *   are, how many are still awaiting a decision, how many have been decided, and
 *   the sum of their amounts;
 * - AC-5 — while requests are selected the block also says how many are selected
 *   and what they add up to, and with nothing selected neither figure is on the
 *   screen at all.
 *
 * Deliberately NOT here:
 * - AC-4 (a search or filter re-states the figures for what is LEFT and keeps the
 *   whole-batch record count beside them struck through, and clearing puts the
 *   whole-batch figures back) is this story's Playwright spec's — one tag, one
 *   layer (testing-policy.md § "Where each scenario belongs"). The two figures
 *   AC-1 owns, `BATCH` and `RUN DATE`, ARE asserted here across a narrowing,
 *   because their narrowed values are part of what AC-1's labels must be telling
 *   the truth about (brief §Notes & Caveats, "Resolved spec gap"); the control
 *   TOTALS re-deriving and the struck-through figure are left entirely to AC-4.
 * - AC-2 (the outstanding count is unmistakably the biggest thing on the screen)
 *   and AC-6 (the band reads as an official control document, saturated blue and
 *   full-width in both themes) are judged by eye at manual test — jsdom has no
 *   computed type scale and no colour (testing-policy.md § "`none` is
 *   first-class").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these assertions pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE CONTROL BLOCK IS ONE NAMED REGION. A `<section>` whose accessible name
 *    contains "batch" (e.g. `aria-label="Batch control totals"`), so the whole
 *    block is one landmark a reader can reach and a test can scope to. Every
 *    assertion below is scoped INSIDE it — nothing here is satisfied by a figure
 *    that happens to appear somewhere else on the screen.
 * 2. EACH FIGURE IS A LABELLED GROUP inside that region: `role="group"` (or a
 *    `<section>`/`<fieldset>` carrying that role) whose ACCESSIBLE NAME is its
 *    label — `Batch`, `Run date`, `Records`, `Awaiting decision`, `Decided`,
 *    `Total value` — via `aria-label`, or `aria-labelledby` pointing at the
 *    visible tracked label. A `group` takes no name from its contents, so a
 *    visible 11px label alone leaves the figure unnamed for assistive technology
 *    and unfindable here. The figure itself is the group's text. Matching is
 *    case-insensitive, so the label may be uppercased in the markup or by CSS.
 * 3. SIX FIGURES, NO INVENTED MIDDLE TIER. With nothing selected and nothing
 *    narrowed, the block holds EXACTLY the six groups R11 names — the scale
 *    contrast carries the hierarchy (R16), so there is no seventh "sub-total" to
 *    soften it. A selection adds two more (note 7), taking it to eight.
 * 4. FIGURES PRINT AS THE ROWS PRINT THEM. This screen already shows `Amount` and
 *    `TransactionDate` exactly as the service sent them (`lib/transactions/
 *    display.ts` — "a formatter would be the bug"), so the control totals do the
 *    same: `TOTAL VALUE` reads `26136.31`, not `26 136.31`, not `R26,136.31`, not
 *    `26136.310`; `RUN DATE` reads the `TransactionDate` value verbatim. The
 *    assertions below match the value as a WHOLE figure, so a grouped, padded or
 *    currency-prefixed rendering fails.
 * 5. ⚠ `DECIDED` IS `Status !== Imported` — AND `AWAITING DECISION` IS
 *    `Status === Imported`, so the two ALWAYS sum to `RECORDS` (brief §Data
 *    Model; story §Implementation notes). Do NOT reuse `countRequests()` from
 *    `@/mocks/data/transaction`: it was built for the file-deletion confirmation
 *    and defines `decided = approved + rejected`, which drops any row carrying a
 *    status outside the three recognised values — a row that must count as
 *    DECIDED here. AC-3's second half serves exactly such a row, so an
 *    `approved + rejected` implementation reads `3` where the screen must read
 *    `4`, and its two counts stop summing to `RECORDS`. That figure is the one
 *    this whole screen is built around; nothing else in this file matters more.
 * 6. `BATCH` AND `RUN DATE` ARE SETTLED — do not invent an alternative (brief
 *    §Notes & Caveats, "Resolved spec gap", user-decided at the stories
 *    approval). With no originating-file narrowing active, `BATCH` reads
 *    `ALL FILES` and `RUN DATE` shows the newest `TransactionDate` in the fetched
 *    set. Narrowed to one originating file, `BATCH` sharpens to that file's name
 *    and `RUN DATE` to that file's own newest `TransactionDate`. Both derived
 *    client-side; neither adds a field, a fetch or a contract.
 * 7. THE SELECTION PAIR IS TWO MORE FIGURES IN THE SAME BLOCK (R19): a group
 *    named `Selected requests` carrying the live count, and one named
 *    `Selected value` carrying the summed `Amount` of the selection — beside the
 *    batch total, because it is the money about to be committed. Both are absent
 *    from the markup entirely while nothing is selected: a permanently mounted
 *    "0 / 0.00" pair is a fixture, not an answer (the same rule the existing
 *    ambient indicator already follows). Reuse `selectedIds` and the helpers in
 *    `lib/transactions/selecting.ts`; do not build a second selection.
 * 8. THE `<h1>Expense requests</h1>` GOES. The block opens the screen instead of
 *    a page title above a table (R11), so no heading naming the screen may
 *    remain anywhere on it. The page's `metadata.title` is a different thing —
 *    the browser tab's name, not a title on the screen — and must be left
 *    exactly as it is.
 * 9. NOTHING IS RE-FETCHED AND NOTHING NEW IS SENT. All six figures, and the
 *    selection pair, are derived client-side from the `TransactionRead[]` the
 *    list already holds (brief §Data Model): no new call, no new field, no new
 *    query parameter. Reuse `lib/transactions/narrowing.ts` and `selecting.ts`
 *    rather than reimplementing either.
 * 10. WHERE IT LIVES IS THE DEVELOPER'S SEAM, and these tests do not constrain
 *    it beyond note 1: the page is an async server component while the fetched
 *    set lives in the client list, so the block must live where that data lives
 *    (or be handed it). Do NOT lift the fetch into the server component — that
 *    would change behaviour, which R1/BR1 forbid. Everything below renders the
 *    whole `/requests` screen, so any seam that puts the block on that screen
 *    passes.
 * 11. THE SCREEN'S EXISTING BEHAVIOUR IS UNTOUCHED (R1/BR1). This is a
 *    presentation change: the search box, the six narrowing controls, the sort
 *    controls, paging, the decide flow, bulk approval, the export, masking and
 *    role gating all keep working exactly as they do today. The narrowing this
 *    file drives is the SAME originating-file filter that already exists.
 *
 * Mocked here, and why:
 * - `@/lib/api/client` — the fixed HTTP convention (testing-policy.md § Mocking
 *   strategy). Every read of `GET /v1/transactions` answers from one served set,
 *   so the list's own self-refresh keeps seeing the same batch.
 * - `@/lib/auth/requireSession` — server-only; it reads `next/headers` cookies,
 *   which cannot run in jsdom. Mocking the dependency keeps the page itself real,
 *   exactly as the `expense-file-upload` story-2 tests do, so the `<h1>` this
 *   story removes is genuinely inside the component under test.
 *
 * Every response body and identity comes from the project-wide factories in
 * `web/src/mocks/data/` — the modules the Playwright layer imports too, so the
 * two layers cannot drift onto different figures. `transactionsForNarrowing()` is
 * the fixture the story names for exactly this work: eight requests, all three
 * recognised statuses, three originating files, and aggregates verified by
 * execution (`RECORDS 8 · AWAITING 5 · DECIDED 3 · TOTAL VALUE 26136.31`, which
 * sums exactly with no float artefact). Those figures are stated LITERALLY below
 * and never recomputed from the fixture with the logic under test — a test that
 * recomputes them asserts nothing.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): there is no
 * control block on the screen yet, and the page still carries its own title.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the whole `/requests` screen, title and all.
import ExpenseRequestsPage from '@/app/(authenticated)/requests/page';

// Real production infrastructure (not mocked): the root layout's toast
// composition, which every signed-in screen sits inside.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
import { requireSession } from '@/lib/auth/requireSession';
// The ordering belongs to the SESSION, not to the component, so a test that
// sorted would otherwise hand its ordering to the next one.
import { rememberSort } from '@/lib/transactions/sortPreference';
// Project-wide mock data — never a hand-written response body or identity.
import { userInfoFor } from '@/mocks/data/identity';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/mocks/data/role';
import {
  isKnownTransactionStatus,
  transactionListResponse,
  transactionsForNarrowing,
  transactionWithStatus,
} from '@/mocks/data/transaction';

import type { TransactionRead } from '@/mocks/data/transaction';

vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/lib/auth/requireSession', () => ({ requireSession: vi.fn() }));

const mockGet = get as unknown as ReturnType<typeof vi.fn>;
const mockRequireSession = requireSession as unknown as ReturnType<
  typeof vi.fn
>;

type User = ReturnType<typeof userEvent.setup>;

/* -------------------------------------------------------------------------- */
/* The batch these figures describe                                           */
/* -------------------------------------------------------------------------- */

/** The whole fetched set — the story's named fixture, used as it comes. */
const FETCHED_REQUESTS: TransactionRead[] = transactionsForNarrowing();

/**
 * One request out of the fixture, by the reference it carries. Used only to READ
 * a single row's own values (its file name, its date, its amount) so this file
 * never restates them by hand — never to recompute an aggregate.
 */
const requestNamed = (reference: string): TransactionRead => {
  const found = FETCHED_REQUESTS.filter(
    (request) => request.Reference === reference,
  );
  if (found.length !== 1) {
    throw new Error(
      `Expected exactly one fixture request referenced "${reference}", found ` +
        `${String(found.length)}. transactionsForNarrowing() holds one request ` +
        'per reference; the figures in this file are stated for that set.',
    );
  }
  return found[0];
};

/**
 * THE VERIFIED WHOLE-BATCH FIGURES, stated literally (story §Implementation
 * notes, "Known-good fixture for the aggregate tests"). `AWAITING` + `DECIDED`
 * equals `RECORDS`, which is the invariant contract note 5 exists to protect.
 */
const RECORDS = '8';
const AWAITING_DECISION = '5';
const DECIDED = '3';
const TOTAL_VALUE = '26136.31';

/** What `BATCH` reads while no originating-file narrowing is active. */
const WHOLE_BATCH_LABEL = /all files/i;

/**
 * The newest `TransactionDate` in the whole fetched set — `RUN DATE` while
 * nothing is narrowed. It belongs to `TXN-20260430-0020`, which lives in the
 * `expenses_2026-04-30.csv` file: that is precisely why the narrowing below picks
 * a DIFFERENT file (story §Implementation notes, "`RUN DATE` test trap" — a test
 * narrowing to that file passes even against a `RUN DATE` that never narrowed).
 */
const WHOLE_BATCH_RUN_DATE = '2026-04-30 17:45:00';
const NEWEST_REQUEST_REFERENCE = 'TXN-20260430-0020';

/**
 * The originating file the narrowing below sharpens to, and its own newest
 * `TransactionDate` — genuinely different from the whole-batch value above, so a
 * `RUN DATE` that ignored the narrowing fails.
 */
const NARROWED_FILE = requestNamed('TXN-20260401-0001').FileName;
const NARROWED_FILE_RUN_DATE = '2026-04-15 11:03:00';
const NARROWED_FILE_NEWEST_REFERENCE = 'TXN-20260415-0007';

/* -------------------------------------------------------------------------- */
/* The same batch plus one request in a status this app has never heard of     */
/* -------------------------------------------------------------------------- */

/**
 * A `Status` outside the three recognised values. The service owns this
 * vocabulary — the app renders what it does not recognise verbatim and never
 * remaps it (`@/types/transactions`, `StatusBadge`) — so a value like this can
 * legitimately arrive, and it is NOT `Imported`.
 *
 * It exists here for one reason: it is the row that tells the brief's `DECIDED`
 * (`Status !== Imported`) apart from `countRequests()`'s `approved + rejected`
 * (contract note 5). Without it, both definitions answer the same and the test
 * proves nothing.
 */
const STATUS_OUTSIDE_THE_RECOGNISED_THREE = 'Settled';

/** That request, composed from the project-wide factory. */
const settledRequest = (): TransactionRead =>
  transactionWithStatus(STATUS_OUTSIDE_THE_RECOGNISED_THREE, {
    Id: 7150,
    Reference: 'TXN-20260430-0044',
    TransactionDate: '2026-04-16 07:30:00',
    // Its own account number and amount, so it shares no duplicate key with any
    // other fixture row and cannot raise an unrelated possible-duplicate mark.
    AccountNumber: '8812-4477-9931',
    Description: 'Settled directly by the payment system',
    Amount: 1000,
  });

/**
 * The whole batch WITH that request in it, and the figures it must then read —
 * stated literally, as above. Only `RECORDS`, `DECIDED` and `TOTAL VALUE` move:
 * the row is not `Imported`, so `AWAITING DECISION` must not budge, and the two
 * counts must still sum to `RECORDS`.
 */
const RECORDS_WITH_SETTLED = '9';
const AWAITING_DECISION_WITH_SETTLED = '5';
const DECIDED_WITH_SETTLED = '4';
const TOTAL_VALUE_WITH_SETTLED = '27136.31';

/** What an `approved + rejected` `DECIDED` reads for that same batch. */
const DECIDED_IF_COUNTED_AS_APPROVED_PLUS_REJECTED = '3';

/* -------------------------------------------------------------------------- */
/* The selection AC-5 describes                                               */
/* -------------------------------------------------------------------------- */

/** Two requests still awaiting a decision, so both may be selected. */
const FIRST_SELECTED = requestNamed('TXN-20260401-0001');
const SECOND_SELECTED = requestNamed('TXN-20260415-0002');

/** What the block must then say — literally, again. */
const SELECTED_COUNT = '2';
const SELECTED_VALUE = '16237.32';

/* -------------------------------------------------------------------------- */
/* Control-block contracts (notes 1, 2 and 7)                                 */
/* -------------------------------------------------------------------------- */

/** The block itself: one region whose name says which batch it is describing. */
const CONTROL_BLOCK_NAME = /batch/i;

/** The six figures R11 names, by the accessible name each group must carry. */
const BATCH_FIGURE = /^batch$/i;
const RUN_DATE_FIGURE = /^run date$/i;
const RECORDS_FIGURE = /^records$/i;
const AWAITING_DECISION_FIGURE = /^awaiting decision$/i;
const DECIDED_FIGURE = /^decided$/i;
const TOTAL_VALUE_FIGURE = /^total value$/i;

/** The two that join them only while a selection is live (R19). */
const SELECTED_COUNT_FIGURE = /^selected requests$/i;
const SELECTED_VALUE_FIGURE = /^selected value$/i;

/** How many figures the block holds with nothing selected and nothing narrowed. */
const FIGURES_IN_THE_CONTROL_BLOCK = 6;

/** The page title R11 replaces — it must be nowhere on the screen (note 8). */
const PAGE_TITLE = /expense requests/i;

/** The originating-file filter that already exists on this screen (R12/BR6). */
const FILE_FILTER_LABEL = /originating file/i;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** What the transactions service currently holds; every read answers from it. */
let served: TransactionRead[] = [];

/** Puts a set of requests behind `GET /v1/transactions`. */
const serve = (requests: TransactionRead[]): void => {
  served = requests;
};

/**
 * The whole `/requests` screen as a navigation renders it, for a session of the
 * given role: invoke the async server component once and render what it returned,
 * inside the same toast composition the root layout always provides.
 */
const renderRequestsScreen = async (roleName: string) => {
  mockRequireSession.mockResolvedValue(userInfoFor(roleName));
  return render(
    <ToastProvider>
      {await ExpenseRequestsPage()}
      <ToastContainer />
    </ToastProvider>,
  );
};

/** Waits until the listed requests are on screen — one row each, plus the head. */
const waitForListedRequests = async (count: number): Promise<void> => {
  await waitFor(() => {
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
      count + 1,
    );
  });
};

/** The control block, with a contract reminder when it is not on the screen. */
const controlBlock = (): HTMLElement => {
  const block = screen.queryByRole('region', { name: CONTROL_BLOCK_NAME });
  if (block === null) {
    throw new Error(
      'No control block was found. The screen must open with ONE region whose ' +
        'accessible name contains "batch" (a <section aria-label="Batch ' +
        'control totals">), holding one labelled group per figure — see ' +
        'contract notes 1 and 2.',
    );
  }
  return block;
};

/** One figure in the block, by the label it must be named for. */
const figure = (label: RegExp): HTMLElement =>
  within(controlBlock()).getByRole('group', { name: label });

/** The same figure, or `null` when the block does not carry it at all. */
const figureIfPresent = (label: RegExp): HTMLElement | null =>
  within(controlBlock()).queryByRole('group', { name: label });

/**
 * A value as a WHOLE figure — never as part of a longer one (contract note 4).
 *
 * The lookarounds are what make the assertions mean something: without them "3"
 * is satisfied by "13", and `26136.31` by `126136.310`. They also refuse a
 * grouped or padded rendering of the same number, which is the point — the
 * figures print exactly as the rows print them.
 */
const wholeFigure = (value: string): RegExp =>
  new RegExp(`(^|[^\\d.,])${value.replace(/\./g, '\\.')}(?![\\d.,])`);

/** Waits for one figure to read exactly the given value. */
const expectFigureToRead = async (
  label: RegExp,
  value: string,
): Promise<void> => {
  await waitFor(() => {
    expect(figure(label)).toHaveTextContent(wholeFigure(value));
  });
};

/** Waits for the four control totals to read the given batch figures. */
const expectControlTotals = async (totals: {
  records: string;
  awaitingDecision: string;
  decided: string;
  totalValue: string;
}): Promise<void> => {
  await expectFigureToRead(RECORDS_FIGURE, totals.records);
  await expectFigureToRead(AWAITING_DECISION_FIGURE, totals.awaitingDecision);
  await expectFigureToRead(DECIDED_FIGURE, totals.decided);
  await expectFigureToRead(TOTAL_VALUE_FIGURE, totals.totalValue);
};

/**
 * The table row carrying a named request, found by its reference rather than by
 * position, and required to be unique so a widened match can never quietly act
 * on the wrong request.
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

/** How one request's own selection control names itself (it names its request). */
const selectionControlFor = (reference: string): RegExp =>
  new RegExp(`^select\\b.*${reference}`, 'i');

/** Ticks or unticks one request, on its own row. */
const toggleSelectionOf = async (
  user: User,
  reference: string,
): Promise<void> => {
  const control = await waitFor(() =>
    within(rowFor(reference)).getByRole('checkbox', {
      name: selectionControlFor(reference),
    }),
  );
  await user.click(control);
};

/** Chooses a value on one of the existing pick-one filters: open, then pick. */
const chooseFilterValue = async (
  user: User,
  trigger: HTMLElement,
  name: string,
): Promise<void> => {
  await user.click(trigger);
  const listbox = screen.getByRole('listbox');
  await user.click(within(listbox).getByRole('option', { name }));
  await waitFor(() => {
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
};

describe("Epic request-list-redesign, Story 2: the batch's outstanding count, at a glance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    served = [];
    rememberSort(null);

    mockGet.mockImplementation(() =>
      Promise.resolve(transactionListResponse(served)),
    );
  });

  // AC-1
  it('opens the screen with one control block carrying the batch, run date, record count, awaiting-decision count, decided count and total value as labelled figures, and no page title above the list', async () => {
    const user = userEvent.setup();
    serve(FETCHED_REQUESTS);

    // Fixture preconditions, so a fixture that changed under this file fails
    // HERE rather than quietly re-baselining the figures asserted below.
    expect(FETCHED_REQUESTS).toHaveLength(Number(RECORDS));
    expect(requestNamed(NEWEST_REQUEST_REFERENCE).TransactionDate).toBe(
      WHOLE_BATCH_RUN_DATE,
    );
    expect(requestNamed(NEWEST_REQUEST_REFERENCE).FileName).not.toBe(
      NARROWED_FILE,
    );
    expect(requestNamed(NARROWED_FILE_NEWEST_REFERENCE).FileName).toBe(
      NARROWED_FILE,
    );
    expect(requestNamed(NARROWED_FILE_NEWEST_REFERENCE).TransactionDate).toBe(
      NARROWED_FILE_RUN_DATE,
    );

    await renderRequestsScreen(ROLE_IMPORTER);
    await waitForListedRequests(FETCHED_REQUESTS.length);

    // --- the six labelled figures, and only those six ----------------------
    expect(figure(BATCH_FIGURE)).toBeInTheDocument();
    expect(figure(RUN_DATE_FIGURE)).toBeInTheDocument();
    expect(figure(RECORDS_FIGURE)).toBeInTheDocument();
    expect(figure(AWAITING_DECISION_FIGURE)).toBeInTheDocument();
    expect(figure(DECIDED_FIGURE)).toBeInTheDocument();
    expect(figure(TOTAL_VALUE_FIGURE)).toBeInTheDocument();

    // Exactly six, with nothing selected and nothing narrowed: the scale
    // contrast carries the hierarchy, so there is no extra tier (contract
    // note 3). The selection pair takes this to eight in AC-5's test.
    expect(within(controlBlock()).getAllByRole('group')).toHaveLength(
      FIGURES_IN_THE_CONTROL_BLOCK,
    );

    // --- what the two whole-queue figures say (contract note 6) ------------
    expect(figure(BATCH_FIGURE)).toHaveTextContent(WHOLE_BATCH_LABEL);
    expect(figure(RUN_DATE_FIGURE)).toHaveTextContent(WHOLE_BATCH_RUN_DATE);

    // --- and no page title sitting above the list any more (note 8) --------
    // `hidden: true` so a title merely hidden from the accessibility tree
    // cannot pass as removed.
    expect(
      screen.queryByRole('heading', { name: PAGE_TITLE, hidden: true }),
    ).not.toBeInTheDocument();

    // --- narrowed to one originating file, both sharpen to that file -------
    // The four control TOTALS re-deriving, and the struck-through whole-batch
    // record count, are AC-4's in Playwright — deliberately not asserted here.
    await chooseFilterValue(
      user,
      screen.getByLabelText(FILE_FILTER_LABEL),
      NARROWED_FILE,
    );

    await waitFor(() => {
      expect(figure(BATCH_FIGURE)).toHaveTextContent(NARROWED_FILE);
    });
    expect(figure(BATCH_FIGURE)).not.toHaveTextContent(WHOLE_BATCH_LABEL);

    // The trap this fixture avoids: the narrowed file's newest date genuinely
    // differs from the whole batch's, so a RUN DATE that never narrowed fails.
    expect(figure(RUN_DATE_FIGURE)).toHaveTextContent(NARROWED_FILE_RUN_DATE);
    expect(figure(RUN_DATE_FIGURE)).not.toHaveTextContent(WHOLE_BATCH_RUN_DATE);
  });

  // AC-3
  // Every figure below is stated literally (see this file's header): the counts
  // and the sum are what `transactionsForNarrowing()` verifiably holds, never
  // recomputed here from the fixture with the logic under test.
  it('states the truth about the batch — how many requests, how many still awaiting a decision, how many decided, and what they add up to — counting a request in an unrecognised status as decided', async () => {
    serve(FETCHED_REQUESTS);

    const wholeBatchView = await renderRequestsScreen(ROLE_IMPORTER);
    await waitForListedRequests(FETCHED_REQUESTS.length);

    await expectControlTotals({
      records: RECORDS,
      awaitingDecision: AWAITING_DECISION,
      decided: DECIDED,
      totalValue: TOTAL_VALUE,
    });

    // ------------------------------------------------------------------
    // The same batch, plus one request whose status this app has never heard
    // of. `DECIDED` is `Status !== Imported` (contract note 5), so it counts
    // as decided: an `approved + rejected` implementation reads DECIDED_IF_…
    // here and leaves the two counts no longer summing to RECORDS.
    // ------------------------------------------------------------------
    const settled = settledRequest();

    // Fixture preconditions for the literal figures above and below.
    expect(isKnownTransactionStatus(STATUS_OUTSIDE_THE_RECOGNISED_THREE)).toBe(
      false,
    );
    expect(settled.Amount).toBe(1000);

    wholeBatchView.unmount();
    serve([...FETCHED_REQUESTS, settled]);

    await renderRequestsScreen(ROLE_IMPORTER);
    await waitForListedRequests(FETCHED_REQUESTS.length + 1);

    await expectControlTotals({
      records: RECORDS_WITH_SETTLED,
      awaitingDecision: AWAITING_DECISION_WITH_SETTLED,
      decided: DECIDED_WITH_SETTLED,
      totalValue: TOTAL_VALUE_WITH_SETTLED,
    });

    expect(figure(DECIDED_FIGURE)).not.toHaveTextContent(
      wholeFigure(DECIDED_IF_COUNTED_AS_APPROVED_PLUS_REJECTED),
    );
  });

  // AC-5
  it('says how many requests are selected and what they add up to while a selection exists, and carries neither figure at all when nothing is selected', async () => {
    const user = userEvent.setup();
    serve(FETCHED_REQUESTS);

    // Fixture preconditions: the two requests selected below are the ones the
    // literal selected value is stated for.
    expect([FIRST_SELECTED.Amount, SECOND_SELECTED.Amount]).toEqual([
      15750, 487.32,
    ]);

    await renderRequestsScreen(ROLE_APPROVER);
    await waitForListedRequests(FETCHED_REQUESTS.length);

    // --- nothing selected: neither figure is in the markup at all ----------
    expect(figureIfPresent(SELECTED_COUNT_FIGURE)).not.toBeInTheDocument();
    expect(figureIfPresent(SELECTED_VALUE_FIGURE)).not.toBeInTheDocument();

    // --- two requests selected --------------------------------------------
    await toggleSelectionOf(user, FIRST_SELECTED.Reference);
    await toggleSelectionOf(user, SECOND_SELECTED.Reference);

    await expectFigureToRead(SELECTED_COUNT_FIGURE, SELECTED_COUNT);
    await expectFigureToRead(SELECTED_VALUE_FIGURE, SELECTED_VALUE);

    // The batch's own figures are untouched by a selection: what is selected is
    // stated beside the batch total, never instead of it (R19).
    expect(figure(RECORDS_FIGURE)).toHaveTextContent(wholeFigure(RECORDS));
    expect(figure(TOTAL_VALUE_FIGURE)).toHaveTextContent(
      wholeFigure(TOTAL_VALUE),
    );

    // --- and unselected again: both figures leave the screen ---------------
    await toggleSelectionOf(user, FIRST_SELECTED.Reference);
    await toggleSelectionOf(user, SECOND_SELECTED.Reference);

    await waitFor(() => {
      expect(figureIfPresent(SELECTED_COUNT_FIGURE)).not.toBeInTheDocument();
    });
    expect(figureIfPresent(SELECTED_VALUE_FIGURE)).not.toBeInTheDocument();
  });
});
