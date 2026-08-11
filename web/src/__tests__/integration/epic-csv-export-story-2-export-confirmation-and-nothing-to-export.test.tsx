/**
 * Story Metadata:
 * - Epic: csv-export — Story 2: know what you exported, and be told when there is
 *   nothing to export
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — a completed export raises an ANNOUNCED in-app confirmation naming how
 *   many requests were exported, the signed-in person who produced it, and when.
 * - AC-2 — when the active search and filters match no requests, the export action
 *   is STILL there and usable, activating it saves no file, and the user is told no
 *   requests match what is currently applied.
 *
 * AC-3 (re-exporting after changing the narrowing) and AC-4 (reaching and
 * activating the export by keyboard alone, with perceivable feedback) are this
 * story's Playwright spec — deliberately not duplicated here (testing-policy.md
 * § "One tag, one layer"). Story 1 owns the export action itself, the file's nine
 * columns and its name; nothing here asserts any of those.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ATTRIBUTION IS NOT DECORATIVE (read this first)
 * ---------------------------------------------------------------------------
 * This story carries the SECOND HALF of the epic's mandatory Compliance Exception
 * (brief §COMPLIANCE EXCEPTION). Story 1 writes the full, unmasked account number
 * into the hand-over file; this story makes that export attributable to the person
 * who produced it. Both halves are required — an export carrying whole account
 * numbers with no record of who produced it does NOT satisfy the exception. So the
 * name and the moment in the confirmation below are compliance evidence, not
 * pleasantries, and they may not be dropped as "polish".
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. The confirmation goes through the app's ONE notification surface: `useToast()`
 *    from `@/contexts/ToastContext`, rendered by the root layout's `ToastContainer`
 *    (`region` named "Notifications"). No new notification mechanism, no bespoke
 *    banner, no second surface — the renders below mount exactly the provider +
 *    container composition the app always has, and nothing else would be found.
 * 2. A completed export is NOT an error: its toast variant must be one that carries
 *    `role="status"` (anything but `error` — see `components/toast/Toast.tsx`), which
 *    is what makes the confirmation ANNOUNCED rather than merely visible. This is the
 *    only reason a role is asserted at all.
 * 3. The confirmation names THREE things:
 *      a. how many requests went into the file — the count of the exported
 *         (narrowed, ordered) set, NOT the fetched set and NOT the page on screen.
 *         The fixture below lists 23 requests with a default page size of 20, so a
 *         confirmation reading "20" is the page-count bug this test exists to catch.
 *      b. the signed-in person, by name;
 *      c. when the export was produced, written in the app's existing on-screen
 *         date-time shape — the ISO-like 24-hour `YYYY-MM-DD HH:MM` the transactions
 *         service uses and the list prints verbatim (`2026-04-30`, `14:35`; seconds
 *         optional). A 12-hour clock or a long-form date is not how this app writes a
 *         moment anywhere else.
 * 4. THE NAME ARRIVES AS A PROP. `web/src/app/(authenticated)/requests/page.tsx`
 *    already holds the session (`requireSession()`), so it passes
 *    `displayNameOf(session)` (`@/lib/auth/identity`) into the client list as
 *    `exportedBy?: string` — the same arrangement as `SubmittedFileDetail`'s
 *    `actingUploader?: string`, optional for the same reason. NOTHING READS AN
 *    IDENTITY IN THE BROWSER: the mocked HTTP client below fails loudly on any read
 *    other than the transactions list, so a client-side `GET /v1/auth/userinfo`
 *    added to satisfy AC-1 fails these tests rather than passing them. The second
 *    half of the AC-1 test renders the same screen for the other role to prove the
 *    name genuinely follows the prop instead of being hard-coded.
 * 5. THE NARROWED-EMPTY WORDING IS THE ONE ALREADY ON THIS SCREEN. The list defines
 *    `NARROWED_EMPTY_MESSAGE` ("No expense requests match what is currently
 *    applied.") and this file IMPORTS it from `@/components/requests/ExpenseRequestList`
 *    — so this story must EXPORT that existing constant (or move it to a module both
 *    the list and the export path read) and surface THAT. The brief's BR2 quotes the
 *    source spec's near-identical "No expense requests match the current search and
 *    filters."; adding that as a second sentence to the same screen is the mistake
 *    this contract forbids. The AC-2 test asserts every "no requests match" wording
 *    on screen is that one constant, so a newly-invented twin fails.
 * 6. THE EXPORT CONTROL STAYS PRESENT AND ENABLED when the narrowing has emptied the
 *    list — not removed, not disabled, before or after activation. Activating it
 *    explains why no file was produced. (Removing or disabling it would also break
 *    AC-4's keyboard reachability, which cannot tab to a control that is not there.)
 * 7. ACTIVATING IT IN THAT STATE PRODUCES NO FILE. A file reaches the user exactly
 *    one way — `deliverFile` (`@/lib/files/deliverFile`) building a blob address and
 *    activating a hidden `a[download]` — so the recorder below observes that one
 *    browser boundary. Do not "export an empty CSV" and do not deliver a
 *    header-row-only file.
 * 8. No new endpoint, no re-read: the count, the file and the narrowed-empty answer
 *    all come from the one `GET /v1/transactions` body the list already holds. The
 *    export must not call the service again.
 * 9. The confirmation carries no colour value of its own — the toast's variant
 *    tokens do that (styling-centralisation.md). Nothing here asserts a class.
 *
 * Mocked here, and why: only `@/lib/api/client`'s `get` — the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy) — plus `next/navigation` as the library
 * client-navigation boundary. The toast infrastructure is the REAL production code,
 * so the confirmation is asserted as the text a user actually meets, and every
 * response body comes from the project-wide `@/mocks/data/transaction` factory the
 * Playwright layer shares. The signed-in identities come from
 * `@/mocks/data/identity` — the one place a userinfo body is defined for both
 * layers.
 *
 * Runtime-only, deliberately not here: that the bytes reach the user's disk, what
 * the file is called, and that its confirmation is perceivable without a mouse are
 * real-browser questions (story 1's spec, this story's AC-3/AC-4 spec, and the
 * manual checklist).
 *
 * These tests WILL FAIL until the story is implemented (TDD red). Expected red-phase
 * signals in this file: `NARROWED_EMPTY_MESSAGE` is not exported yet, and
 * `exportedBy` is not a prop of `ExpenseRequestList` yet.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test: the shared expense request list story 1 taught to
// export, which this story teaches to confirm what it exported — and the wording
// the screen ALREADY uses for a narrowing that hid everything (contract note 5).
import {
  ExpenseRequestList,
  NARROWED_EMPTY_MESSAGE,
} from '@/components/requests/ExpenseRequestList';

// Real production toast composition (not mocked) — the same one the root layout
// wraps every signed-in screen in, and the only surface this confirmation may use.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
// How the server page writes the signed-in person's name (contract note 4). Used
// below to state that the name these tests expect is the one the page will pass.
import { displayNameOf } from '@/lib/auth/identity';

// Project-wide fixtures — the single source both test layers share. Never a
// hand-written response body, never a hand-written identity.
import { userInfoFor } from '@/mocks/data/identity';
import {
  manyTransactions,
  transactionListResponse,
  transactionsForNarrowing,
} from '@/mocks/data/transaction';
import { fullNameOf } from '@/mocks/data/user';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/types/auth';

import type { ProjectRole } from '@/types/auth';
import type {
  TransactionRead,
  TransactionReadList,
} from '@/types/transactions';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  get: vi.fn(),
}));

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

/**
 * Blob addresses, which jsdom does not implement at all.
 *
 * Handing a file to the user means turning bytes into an address the browser can
 * save from, and `URL.createObjectURL` simply does not exist in jsdom — the call
 * would throw for reasons that have nothing to do with this story. This is an
 * honest stand-in for a browser API jsdom lacks (the same treatment
 * `vitest.setup.ts` gives `matchMedia` and pointer capture), and it swallows
 * nothing: the export still has to build a Blob and still has to activate a
 * download for anything to be recorded below.
 */
let addressesIssued = 0;
URL.createObjectURL = (): string =>
  `blob:expense-request-export-${String(++addressesIssued)}`;
URL.revokeObjectURL = (): void => {};

/**
 * Every file handed to the user during a test, by the name it was handed over
 * under.
 *
 * `deliverFile` is the app's ONE way to save a file (contract note 7): it appends a
 * hidden `a[download]` and clicks it. Listening for that click at the document is
 * therefore watching the real browser boundary rather than mocking app code — which
 * is what lets AC-2 state "no file was saved" as an observation rather than a call
 * count. The names are recorded but never asserted on: what the file is CALLED is
 * story 1's (`BR7`, its Playwright spec).
 */
const filesHandedOver: string[] = [];

const recordFileHandedOver = (event: Event): void => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const link = target.closest('a[download]');
  if (link === null) {
    return;
  }
  filesHandedOver.push((link as HTMLAnchorElement).download);
  // jsdom has no downloads and would try to NAVIGATE to the blob address, which it
  // also does not implement. The user's browser saves the file here; the test's job
  // is only to notice that it was offered one.
  event.preventDefault();
};

/** The body `GET /v1/transactions` answers with, set per test. */
let listBody: TransactionReadList | null = null;

/** Serve these requests as the whole fetched set — one response, no paging. */
const serveTransactions = (transactions: TransactionRead[]): void => {
  listBody = transactionListResponse(transactions);
};

/**
 * The signed-in people these tests export as, from the one project-wide identity
 * source, with their names written the way the app writes them.
 */
const IMPORTER = userInfoFor(ROLE_IMPORTER);
const APPROVER = userInfoFor(ROLE_APPROVER);
const IMPORTER_NAME = fullNameOf(IMPORTER);
const APPROVER_NAME = fullNameOf(APPROVER);

/**
 * The screen as the root layout always mounts it: the list inside the app's one
 * toast composition, with the signed-in person's name arriving as a prop from the
 * server page (contract notes 1 and 4).
 */
const listAs = (roles: ProjectRole[], exportedBy: string) => (
  <ToastProvider>
    <ExpenseRequestList roles={roles} exportedBy={exportedBy} />
    <ToastContainer />
  </ToastProvider>
);

/** The export control, wherever the list puts it (story 1 owns its wording). */
const exportControl = (): HTMLElement =>
  screen.getByRole('button', { name: /export/i });

/** The app's in-app notification surface — absent while there is nothing to say. */
const notificationSurface = (): HTMLElement | null =>
  screen.queryByRole('region', { name: /notifications/i });

/**
 * A search term no request in any fixture can match, so the list reaches the
 * narrowed-empty state through the user's own narrowing rather than through an
 * empty response (which is the DIFFERENT, never-imported answer).
 */
const TERM_MATCHING_NOTHING = 'zzzz-no-such-request';

/** Any "no requests match" wording on screen — see contract note 5. */
const NO_MATCH_WORDING = /no (expense )?requests match/i;

/**
 * The moment the AC-1 export is produced. Only `Date` is faked, so every real timer
 * the list and the toasts use (the wait tiers, auto-dismiss) still runs for real —
 * what is frozen is the clock the confirmation reads, and nothing else.
 */
const EXPORTED_AT = new Date(2026, 3, 30, 14, 35, 0);
const EXPORTED_ON_TEXT = '2026-04-30';
const EXPORTED_AT_TEXT = '14:35';

describe('Epic csv-export, Story 2: the export confirmation, and being told when there is nothing to export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listBody = null;
    filesHandedOver.length = 0;
    document.addEventListener('click', recordFileHandedOver);
    mockGet.mockImplementation(async (endpoint: string) => {
      const path = String(endpoint);
      if (!path.includes('/v1/transactions')) {
        throw new Error(
          `Unexpected read of "${path}" — the export, its count and its ` +
            'attribution are all built in the browser from the one fetched ' +
            'transaction list. There is no export endpoint, and the signed-in ' +
            "person's name arrives as a prop from the server page " +
            '(displayNameOf(session)) rather than from a browser identity read.',
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

  afterEach(() => {
    document.removeEventListener('click', recordFileHandedOver);
    vi.useRealTimers();
  });

  // AC-1
  it('confirms a completed export by naming how many requests were exported, who produced it and when — announced, and attributed to whoever is signed in', async () => {
    // Only `Date` is faked: the moment the confirmation reads is fixed, while every
    // timer the list and the toast use stays real (no fake-timer flakiness).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EXPORTED_AT);
    const user = userEvent.setup();

    // More requests than one page holds (the default page size is 20), so a
    // confirmation naming the page instead of the export is caught here.
    const requests = manyTransactions(23);
    serveTransactions(requests);

    // Fixture preconditions: the names asserted below are exactly what the server
    // page will pass in (`displayNameOf(session)`), and the two roles are told
    // apart — so "names the signed-in person" cannot pass on a coincidence.
    expect(displayNameOf(IMPORTER)).toBe(IMPORTER_NAME);
    expect(displayNameOf(APPROVER)).toBe(APPROVER_NAME);
    expect(IMPORTER_NAME).not.toBe(APPROVER_NAME);

    // --- the Finance Uploader exports ------------------------------------
    const uploaderView = render(listAs([ROLE_IMPORTER], IMPORTER_NAME));

    await user.click(await waitFor(exportControl));

    const notification = await screen.findByRole('region', {
      name: /notifications/i,
    });
    // Announced, not merely drawn: a completed export is a status, never an error
    // (contract note 2). This is what makes the confirmation reach someone who is
    // not watching that corner of the screen.
    const confirmation = within(notification).getByRole('status');

    // ...it happened at all, because the file was actually handed over first —
    // this is a COMPLETION confirmation, not an acknowledgement of the click.
    // (What the file is called and what is in it are story 1's.)
    expect(filesHandedOver).toHaveLength(1);

    // (a) how many requests went into the file — all 23 that were listed, not the
    // 20 on the page in front of the user.
    expect(confirmation).toHaveTextContent(
      new RegExp(`\\b${String(requests.length)}\\b`),
    );
    expect(confirmation).toHaveTextContent(/requests/i);
    // (b) the person who produced it, by name.
    expect(confirmation).toHaveTextContent(IMPORTER_NAME);
    // (c) when it was produced, in the app's own date-time shape.
    expect(confirmation).toHaveTextContent(EXPORTED_ON_TEXT);
    expect(confirmation).toHaveTextContent(EXPORTED_AT_TEXT);

    uploaderView.unmount();
    filesHandedOver.length = 0;

    // --- the Approver exports the same list ------------------------------
    // Same data, same moment, different signed-in person: the name has to follow
    // the prop the server page passed, so a hard-coded or browser-read identity
    // fails here (contract note 4).
    render(listAs([ROLE_APPROVER], APPROVER_NAME));

    await user.click(await waitFor(exportControl));

    const approverConfirmation = within(
      await screen.findByRole('region', { name: /notifications/i }),
    ).getByRole('status');

    expect(approverConfirmation).toHaveTextContent(APPROVER_NAME);
    expect(approverConfirmation).not.toHaveTextContent(IMPORTER_NAME);
  });

  // AC-2
  it('keeps the export action present and enabled when the narrowing matches nothing, saves no file, and tells the user no requests match — in the wording the screen already uses', async () => {
    // This story's first job (contract note 5), stated as a guard so the red phase
    // names it instead of a query failing on `undefined` further down.
    if (
      typeof NARROWED_EMPTY_MESSAGE !== 'string' ||
      NARROWED_EMPTY_MESSAGE.length === 0
    ) {
      throw new Error(
        'NARROWED_EMPTY_MESSAGE is not exported from ' +
          '@/components/requests/ExpenseRequestList. This story must EXPORT the ' +
          'sentence the screen ALREADY uses for a narrowing that hid everything ' +
          '(or move it to a module both the list and the export path read) and ' +
          'surface THAT from the export — never a second, near-identical sentence ' +
          'on the same screen (contract note 5).',
      );
    }

    const user = userEvent.setup();
    serveTransactions(transactionsForNarrowing());

    render(listAs([ROLE_IMPORTER], IMPORTER_NAME));

    // The list is read, and the user narrows it to nothing with the search box.
    const search = await screen.findByLabelText(/search requests/i);
    await user.type(search, TERM_MATCHING_NOTHING);

    // The narrowing has emptied the list (this is the narrowed-empty answer, not
    // the never-imported one — the fetched set is not empty).
    await waitFor(() => {
      expect(screen.getByText(NARROWED_EMPTY_MESSAGE)).toBeVisible();
    });

    // The export action is STILL there, and still usable (contract note 6) — the
    // control the keyboard has to be able to reach in AC-4.
    const control = exportControl();
    expect(control).toBeVisible();
    expect(control).toBeEnabled();

    // Nothing has been said to the user yet, so whatever appears below can only be
    // the answer to this activation.
    expect(notificationSurface()).not.toBeInTheDocument();

    await user.click(control);

    // The user is told no requests match — through the app's one notification
    // surface, in the sentence this screen already uses.
    const answer = await screen.findByRole('region', {
      name: /notifications/i,
    });
    expect(within(answer).getByText(NARROWED_EMPTY_MESSAGE)).toBeVisible();

    // ...and NO file was saved: no empty file, no header-row-only file.
    expect(filesHandedOver).toEqual([]);

    // The activation left the control exactly as it was — never disabled, never
    // taken away, so it can be used again after the narrowing is changed.
    expect(exportControl()).toBeEnabled();

    // One sentence, not two near-identical ones: every "no requests match" wording
    // anywhere on screen is the list's existing constant (contract note 5).
    screen.getAllByText(NO_MATCH_WORDING).forEach((wording) => {
      expect(wording).toHaveTextContent(NARROWED_EMPTY_MESSAGE);
    });
  });
});
