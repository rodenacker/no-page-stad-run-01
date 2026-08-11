/**
 * Story Metadata:
 * - Epic: bulk-approval-and-live-refresh — Story 5: when the list cannot refresh itself
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R6, BR9
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — after two refreshes in a row have failed, the list states plainly that it
 *   can no longer refresh itself and shows the time it was last up to date.
 * - AC-2 — a single failed refresh raises nothing: the rows and the reader's place are
 *   left exactly as they were.
 * - AC-3 — the requests already on screen stay visible and readable the whole time that
 *   notice is showing; the list is never blanked or replaced by an error.
 * - AC-5 — the time shown as "last up to date" is when the last successful refresh
 *   happened, not when the failure did.
 *
 * AC-4 (once a refresh succeeds again the notice clears by itself and refreshing carries
 * on, with no action from the reader) is this story's Playwright spec's, driven with
 * `page.clock` in a real browser — deliberately not duplicated here
 * (testing-policy.md § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE SURFACE is the list the earlier epics already built — the CLIENT component
 *    `web/src/components/requests/ExpenseRequestList.tsx` (named export
 *    `ExpenseRequestList`). jsdom cannot render `requests/page.tsx` itself (an async
 *    server component resolving the session), which is the split every epic here uses:
 *    the server page gates, the client component is the unit under test. Story 4 gives
 *    that component its 15-second self-refresh (BR6); this story is only about what
 *    happens when that refresh stops working. Do NOT add a second list or a second
 *    refresh loop.
 * 2. TWO STRIKES, NOT ONE (BR9). The notice appears only after TWO CONSECUTIVE failed
 *    polls. One failed poll changes nothing whatsoever on screen, and a poll that
 *    succeeds between two failures puts the count back to nothing — the count is
 *    "failures since the last success", never "failures ever". A read that fails
 *    counts however it failed: a refusal from the service and a dropped connection are
 *    both a failed refresh (AC-1 below uses one of each).
 * 3. THE NOTICE IS POLITE AND SINGULAR. It is a live region announced politely —
 *    `role="status"` — and never `role="alert"` / `aria-live="assertive"`, inheriting
 *    story 4's NFR2 handling: a background failure must not interrupt whatever the
 *    reader is doing. There is exactly ONE of it however many further polls fail; it
 *    does not stack. Its wording states the SITUATION in plain language rather than a
 *    technical cause, matching {@link CANNOT_REFRESH} ("This list cannot refresh itself
 *    at the moment.", "The list can no longer update itself." …), and it names when the
 *    list was last current, matching {@link LAST_CURRENT} ("Last up to date at …").
 *    Follow the project's failure-message convention (`transactionListFailureMessage`
 *    in `web/src/lib/api/transactions.ts`) for the voice.
 * 4. THE TIME IS MACHINE-READABLE. Inside the notice, a `<time dateTime="…">` whose
 *    `dateTime` is the EXACT instant of the last read that SUCCEEDED
 *    (`new Date(lastCurrentAt).toISOString()`), with visible text in whatever format
 *    suits the screen. That attribute is what the assertions below read, so the visible
 *    wording and format stay the screen's own choice — and `<time>` is the element that
 *    actually means "a time" to assistive technology. `lastCurrentAt` is recorded when
 *    a read SUCCEEDS — including the very first load, which is the last moment the list
 *    was current — and NEVER when one fails. AC-5 exists because "last up to date: now"
 *    written on the failure is the easy, wrong implementation, and it actively misleads.
 * 5. THE ROWS ARE NEVER BLANKED. A failed re-read leaves the last known values exactly
 *    where they are — the project convention established in `SubmittedFilesList.tsx` /
 *    `SubmittedFileDetail.tsx`. The failed-load state (the "Could not load the expense
 *    requests" alert, the service's own reason, and Try again) belongs ONLY to a read
 *    that left the user with nothing; while requests are on screen it must never
 *    appear, and neither must the never-imported empty state.
 * 6. NOTHING IS ASKED OF THE READER. The notice carries no button and no link: no
 *    reload prompt, no retry control, no user action of any kind. Recovery is automatic
 *    on the next successful poll (AC-4, the Playwright spec's) — the last manual check
 *    guards exactly this.
 * 7. NOTHING HERE IS ROLE-AWARE. Both the Approver and the Finance Uploader (the auth
 *    service's `Importer`) read the same list and see the same notice; these tests
 *    render as an Approver because that is this epic's reader, not because the notice
 *    depends on it.
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy). The list, its narrowing controls, its rows and
 * the toast composition are REAL production code, so what the user meets is asserted as
 * rendered text. Every response body — and the failed read's own body — comes from the
 * project-wide factory in `web/src/mocks/data/transaction.ts` that the Playwright layer
 * shares, so the two layers cannot drift. A failed poll is deliberately the SAME body as
 * any other failed read of this list: there is no separate poll endpoint, and what
 * differs is only what the screen does with it.
 *
 * Timers: fake, driven at the app's REAL 15-second cadence (BR6) — no shortened
 * test-only interval, and no real waiting. Every assertion about a time is taken from
 * the fake clock itself (`Date.now()`) rather than computed from the interval, so
 * nothing here depends on how much clock a helper happened to consume.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): a failed refresh
 * currently says nothing at all.
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the list this story teaches to admit when it has stopped
// keeping itself current.
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';
// Real production toast composition (not mocked) — the arrangement the root layout wraps
// every signed-in screen in, and the one this screen is always mounted inside.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
import {
  CLIENT_FALLBACK_DETAILS,
  CLIENT_FALLBACK_MESSAGES,
} from '@/lib/api/errors';
// Project-wide Transaction factory: the single source of truth for the wire shape, its
// canonical values and the body a failed read of this list carries. Shared with the
// Playwright layer — never hand-write a response body in a test.
import {
  TRANSACTION_LIST_FAILURE_MESSAGE,
  TRANSACTION_STATUS_APPROVED,
  transactionListFailureResponse,
  transactionListResponse,
  transactionsAfterColleagueDecided,
  transactionsForBulkSelection,
} from '@/mocks/data/transaction';
import { ROLE_APPROVER } from '@/types/auth';

import type { APIError } from '@/types/api';
import type { TransactionRead } from '@/types/transactions';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockGet = get as unknown as ReturnType<typeof vi.fn>;

type User = ReturnType<typeof userEvent.setup>;

/**
 * How often the list re-reads itself while it is open (BR6, story 4's cadence). Stated
 * as the business rule's own value: the tests drive the app's real interval rather than
 * a shortened one, because an interval a test can move is an interval nobody has to meet.
 */
const REFRESH_INTERVAL_MS = 15_000;

/** When the reader opens the screen. Fixed, so every instant below is deterministic. */
const OPENED_AT = new Date('2026-05-04T09:15:00.000Z').getTime();

/** The one address this screen reads (`GET /v1/transactions`, no parameters). */
const TRANSACTIONS_PATH = '/v1/transactions';

/**
 * A refused read carrying the SERVICE's own reason. The transactions service reports a
 * refusal as a 500 + `DefaultResponse`, so the shared client keeps its own placeholder
 * on `message` and the service's `Messages[]` on `details`.
 */
const REFUSED_READ: APIError = {
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  endpoint: `/transactions-api${TRANSACTIONS_PATH}`,
  details: transactionListFailureResponse().Messages,
};

/**
 * The connection dropping — the manual check's "turn off your network". The shared
 * client reports it with no status at all, which is a different failure from the refusal
 * above and must still count as one of BR9's two strikes.
 */
const CONNECTION_LOST: APIError = {
  message: CLIENT_FALLBACK_MESSAGES.network,
  statusCode: 0,
  endpoint: `/transactions-api${TRANSACTIONS_PATH}`,
  details: [CLIENT_FALLBACK_DETAILS.network],
};

/** How a read can fail, if the next one is going to. */
type Refusal = 'refused' | 'offline';

const FAILURES: Record<Refusal, APIError> = {
  refused: REFUSED_READ,
  offline: CONNECTION_LOST,
};

/**
 * Says the list is not keeping itself current, in plain language and about the situation
 * rather than a technical cause (contract 3). Deliberately a shape rather than one fixed
 * sentence — the screen owns its own voice, as long as it says this.
 */
const CANNOT_REFRESH =
  /\b(cannot|can no longer|can’t|can't|unable to|is not|is no longer|not)\b[^.]*\b(refresh\w*|updat\w+)\b/i;

/** Names when the list was last current, however the moment itself is written. */
const LAST_CURRENT = /\blast\b[^.]*\b(up to date|updated|current|refreshed)\b/i;

/** The failed-load state's own heading — the state a re-read must never reach for. */
const FAILED_LOAD = /could not load the expense requests/i;

/** The never-imported empty state, which is equally not what a failed refresh means. */
const NOTHING_IMPORTED = /no expense requests have been imported yet/i;

/** The search field's own label (`RequestNarrowingControls`). */
const SEARCH_FIELD = /search requests/i;

/** An element's visible text, with runs of whitespace collapsed as the DOM shows it. */
const textOf = (element: HTMLElement): string =>
  (element.textContent ?? '').replace(/\s+/g, ' ').trim();

/** What the list is answering with right now, and whether it is answering at all. */
let servedRequests: TransactionRead[] = [];
let nextReadFails: Refusal | null = null;

/** What every `GET /v1/transactions` hands back from now on. */
const serve = (requests: TransactionRead[]): void => {
  servedRequests = requests;
};

/** Every read from now on fails — the network is down, or the service is refusing. */
const readsFail = (how: Refusal = 'refused'): void => {
  nextReadFails = how;
};

/** Reads work again. */
const readsSucceed = (): void => {
  nextReadFails = null;
};

/**
 * The transactions service as this screen addresses it: one address, answered from the
 * shared factory, or refused. Any other read fails loudly rather than quietly returning
 * a list — the refresh poll and the first load are the SAME call (brief §Data Model).
 */
const readTheList = (endpoint: unknown): Promise<unknown> => {
  const path = String(endpoint);

  if (!path.includes(TRANSACTIONS_PATH)) {
    return Promise.reject(
      new Error(
        `Unexpected GET ${path}. This screen reads the expense requests with ` +
          `GET ${TRANSACTIONS_PATH} and nothing else — the refresh poll is that ` +
          'same call on a timer, not an endpoint of its own.',
      ),
    );
  }

  return nextReadFails === null
    ? Promise.resolve(transactionListResponse(servedRequests))
    : Promise.reject(FAILURES[nextReadFails]);
};

/** Moves the fake clock on and lets React settle everything that changed. */
const settle = async (ms = 0): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/** One whole refresh cycle at the app's real cadence. */
const nextRefresh = (): Promise<void> => settle(REFRESH_INTERVAL_MS);

const setupUser = (): User =>
  userEvent.setup({
    advanceTimers: (delay: number) => {
      vi.advanceTimersByTime(delay);
    },
  });

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderRequests = async (): Promise<void> => {
  render(
    <ToastProvider>
      <ExpenseRequestList roles={[ROLE_APPROVER]} />
      <ToastContainer />
    </ToastProvider>,
  );
  await settle();
};

/** The requests currently listed, as rows — the heading row is not one of them. */
const rowsListed = (): HTMLElement[] =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('columnheader').length === 0);

/**
 * One request's row, found by the reference it carries rather than by position, and
 * required to be unique so a widened match can never quietly select another request.
 */
const rowFor = (reference: string): HTMLElement => {
  const rows = rowsListed().filter((row) => textOf(row).includes(reference));

  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one row carrying "${reference}", found ` +
        `${String(rows.length)} — the list renders one row per request, each ` +
        'identified by its Reference.',
    );
  }
  return rows[0];
};

/** Which requests are listed, in the order the rows are in. */
const referencesListed = (requests: readonly TransactionRead[]): string[] =>
  rowsListed().map((row) => {
    const shown = requests.filter((request) =>
      textOf(row).includes(request.Reference),
    );
    if (shown.length !== 1) {
      throw new Error(
        `A listed row matched ${String(shown.length)} of the served requests ` +
          `("${textOf(row)}") — every row belongs to exactly one request.`,
      );
    }
    return shown[0].Reference;
  });

/** Every request served, in the order it was served. */
const referencesOf = (requests: readonly TransactionRead[]): string[] =>
  requests.map((request) => request.Reference);

/**
 * Every polite live region saying the list has stopped keeping itself current
 * (contract 3). Queried by role and filtered by what it says, so an unrelated status —
 * the load's own placeholder, say — can never be mistaken for this notice.
 */
const staleNotices = (): HTMLElement[] =>
  screen
    .queryAllByRole('status')
    .filter((region) => CANNOT_REFRESH.test(textOf(region)));

/** The one such notice, where a test has established there should be one. */
const staleNotice = (): HTMLElement => {
  const notices = staleNotices();

  if (notices.length !== 1) {
    throw new Error(
      `Expected exactly one polite notice saying the list can no longer refresh ` +
        `itself, found ${String(notices.length)} (see the implementation ` +
        'contract above: one `role="status"` region, stated plainly, never stacked).',
    );
  }
  return notices[0];
};

/** The moment the notice names, as the machine-readable element that carries it. */
const stampIn = (notice: HTMLElement): HTMLTimeElement => {
  const stamp = notice.querySelector('time');

  if (stamp === null) {
    throw new Error(
      'The notice names no time. It must carry a `<time dateTime="…">` holding the ' +
        'instant of the last successful read (contract 4); the visible format is ' +
        `the screen's own choice. The notice reads: "${textOf(notice)}".`,
    );
  }
  return stamp;
};

/** The instant a `<time>` element stands for. */
const instantOf = (stamp: HTMLTimeElement): number => {
  const machineReadable = stamp.getAttribute('datetime') ?? '';
  const instant = Date.parse(machineReadable);

  if (Number.isNaN(instant)) {
    throw new Error(
      `The notice's <time> carries dateTime="${machineReadable}", which is not a ` +
        'readable instant — write it as `new Date(lastCurrentAt).toISOString()` ' +
        '(contract 4).',
    );
  }
  return instant;
};

describe('Epic bulk-approval-and-live-refresh, Story 5: when the list cannot refresh itself', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(OPENED_AT);

    servedRequests = [];
    nextReadFails = null;

    mockGet.mockImplementation((endpoint: string) => readTheList(endpoint));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AC-1
  // Runtime-only: that the poll really stops reaching a service that has gone away is
  // proved in a real browser (this story's Playwright spec) and on the manual checklist
  // with the network switched off. What is pinned here is what the screen says once it
  // has.
  it('states plainly that it can no longer refresh itself, and names when the list was last up to date, after two refreshes in a row have failed', async () => {
    const requests = transactionsForBulkSelection();
    serve(requests);
    await renderRequests();

    // The list is current as of this moment — the instant the notice must name.
    const lastCurrentAt = Date.now();
    expect(rowsListed()).toHaveLength(requests.length);
    expect(staleNotices()).toHaveLength(0);

    // --- one failed refresh: BR9's first strike claims nothing -------------------
    readsFail('refused');
    await nextRefresh();
    expect(staleNotices()).toHaveLength(0);

    // --- a second consecutive failure, of a different kind, is still a second one -
    readsFail('offline');
    await nextRefresh();

    const notice = staleNotice();
    // It says what has happened, and when the list was last current.
    expect(textOf(notice)).toMatch(CANNOT_REFRESH);
    expect(textOf(notice)).toMatch(LAST_CURRENT);

    // Precondition: real time has passed since that moment, so a notice stamped "now"
    // cannot pass by accident.
    expect(Date.now()).toBeGreaterThan(lastCurrentAt);

    const stamp = stampIn(notice);
    expect(instantOf(stamp)).toBe(lastCurrentAt);
    // And the reader is shown it, not only a machine.
    expect(textOf(stamp)).not.toBe('');

    // Nothing is asked of the reader: recovery is automatic (contract 6).
    expect(within(notice).queryAllByRole('button')).toHaveLength(0);
    expect(within(notice).queryAllByRole('link')).toHaveLength(0);

    // Said politely, never as something that interrupts (contract 3).
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // AC-2
  it('raises nothing when a single refresh fails, and nothing when a failure, a success and another failure follow one another — only a second failure in a row raises it', async () => {
    const user = setupUser();
    const requests = transactionsForBulkSelection();
    serve(requests);
    await renderRequests();

    // The reader is part-way through something: the keyboard is in the search box.
    const searchField = screen.getByLabelText(SEARCH_FIELD);
    await user.click(searchField);
    expect(searchField).toHaveFocus();

    // --- one failed refresh -----------------------------------------------------
    readsFail();
    await nextRefresh();

    expect(staleNotices()).toHaveLength(0);
    expect(screen.queryByText(LAST_CURRENT)).not.toBeInTheDocument();
    // The rows are exactly as they were, and so is the reader's place in the screen.
    expect(referencesListed(requests)).toEqual(referencesOf(requests));
    expect(searchField).toHaveFocus();

    // --- a refresh that works puts the count back to nothing (BR9: CONSECUTIVE) ---
    readsSucceed();
    await nextRefresh();
    readsFail();
    await nextRefresh();

    // One failure either side of a success is not two in a row.
    expect(staleNotices()).toHaveLength(0);
    expect(screen.queryByText(LAST_CURRENT)).not.toBeInTheDocument();
    expect(referencesListed(requests)).toEqual(referencesOf(requests));
    expect(searchField).toHaveFocus();

    // The silence above is BR9 counting, not a screen that never speaks: the very
    // next failure — the second in a row — does raise the notice.
    await nextRefresh();
    expect(staleNotices()).toHaveLength(1);
    // Even then the reader is left where they were.
    expect(referencesListed(requests)).toEqual(referencesOf(requests));
    expect(searchField).toHaveFocus();
  });

  // AC-3
  it('keeps every request listed and readable for as long as the notice is showing, and never replaces the list with a failed-load error', async () => {
    const requests = transactionsForBulkSelection();
    serve(requests);
    await renderRequests();

    readsFail();
    await nextRefresh();
    await nextRefresh();

    expect(staleNotices()).toHaveLength(1);

    // Every request is still listed, in the order it was, and still readable.
    expect(referencesListed(requests)).toEqual(referencesOf(requests));
    requests.forEach((request) => {
      const row = rowFor(request.Reference);
      expect(row).toHaveTextContent(request.Description);
      expect(row).toHaveTextContent(String(request.Amount));
      expect(textOf(row)).toContain(request.Status);
    });

    // The failed-load state belongs to a read that left the user with NOTHING
    // (contract 5) — the reader here has rows, so they keep them, and they are never
    // shown the service's own refusal in place of them.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(FAILED_LOAD)).not.toBeInTheDocument();
    expect(
      screen.queryByText(TRANSACTION_LIST_FAILURE_MESSAGE),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /try again/i }),
    ).not.toBeInTheDocument();
    // Nor is a list that cannot refresh a list with nothing in it.
    expect(screen.queryByText(NOTHING_IMPORTED)).not.toBeInTheDocument();

    // Still failing several refreshes later: still ONE notice, still every request.
    await nextRefresh();
    await nextRefresh();
    expect(staleNotices()).toHaveLength(1);
    expect(referencesListed(requests)).toEqual(referencesOf(requests));
  });

  // AC-5
  it('names the moment of the last refresh that SUCCEEDED — not the first load, and not the moment a refresh failed', async () => {
    const requests = transactionsForBulkSelection();
    serve(requests);
    await renderRequests();
    const firstLoadAt = Date.now();

    // A refresh that lands, carrying something new: a colleague has decided the first
    // request. Asserting that change reaches the screen is what proves this poll really
    // succeeded rather than being assumed to have.
    const [decidedByColleague] = requests;
    serve(transactionsAfterColleagueDecided(requests, [decidedByColleague.Id]));
    await nextRefresh();
    const lastCurrentAt = Date.now();
    expect(textOf(rowFor(decidedByColleague.Reference))).toContain(
      TRANSACTION_STATUS_APPROVED,
    );

    // --- and then the refreshes stop working ------------------------------------
    readsFail();
    await nextRefresh();
    await nextRefresh();
    const failedAt = Date.now();

    // Preconditions: three genuinely different instants, so the assertion below can
    // only be satisfied by the middle one.
    expect(lastCurrentAt).toBeGreaterThan(firstLoadAt);
    expect(failedAt).toBeGreaterThan(lastCurrentAt);

    expect(instantOf(stampIn(staleNotice()))).toBe(lastCurrentAt);
  });
});
