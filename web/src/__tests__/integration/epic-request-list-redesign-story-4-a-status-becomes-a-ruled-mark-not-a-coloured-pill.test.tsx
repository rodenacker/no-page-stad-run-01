/**
 * Story Metadata:
 * - Epic: request-list-redesign — Story 4: a status becomes a ruled mark, not a
 *   coloured pill
 * - Route: /requests
 * - Target File: web/src/components/status/StatusBadge.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — a status reads as a mark plus a capitalised word, no longer as a rounded
 *   coloured pill, and still carries the status IN WORDS.
 * - AC-3 — a status the app has no wording for still reaches the reader in the
 *   service's own words, with NO shape claiming to know what it means.
 * - AC-4 — the possible-duplicate mark still says so in words beside its shape, in
 *   the same notation as the statuses.
 * - AC-6 — the cancelled mark exists and renders correctly if it is exercised.
 *
 * Not here, on purpose (testing-policy.md § "One tag, one layer"):
 * - AC-2 (imported / approved / rejected / cancelled are told apart by SHAPE with the
 *   colour ignored entirely) is tagged `none` — it is judged by eye, in greyscale, on
 *   the manual checklist. jsdom has no pixels, so any "the shapes differ" assertion
 *   here would be a class or SVG-internals check pretending to be that judgement.
 * - AC-5 (the submitted-files list, a file's detail, its import preview and its
 *   rejected rows still show their statuses correctly) is this story's Playwright
 *   spec, in a real browser.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. `StatusBadge` (`@/components/status/StatusBadge`) is a SHARED surface with eight
 *    consumers — `FileStatusBadge`, `SubmittedFilesList`, `SubmittedFileDetail`,
 *    `ImportPreview`, `RequestDetailPanel`, `RequestCards`, `PossibleDuplicateMark`
 *    and `ExpenseRequestList`. Change it ONCE, there (R26/R28, story §Implementation
 *    notes). Do not fork a request-list-only mark, and do not leave the files screens
 *    on the old pill. These tests deliberately reach it through three DIFFERENT real
 *    consumers — the request list, the file-status vocabulary, and the
 *    possible-duplicate mark — so a change that only fixes the request list fails
 *    here rather than at manual test.
 * 2. THE WORD STAYS. The mark is a shape BESIDE a capitalised word, never a shape
 *    instead of one: BR3 is explicit that the shape taxonomy supplements, and never
 *    replaces, the colour-plus-icon/text pairing R3/UI-21 already requires. Every
 *    test below asserts the status reaches the reader as TEXT, in the service's own
 *    words, exactly as sent — no remapping, no re-wording, no lowercasing of the
 *    value itself.
 * 3. EXACTLY ONE element carries that wording. The visible text IS the accessible
 *    text: no screen-reader-only second copy (a reader would hear the same status
 *    twice for one request), and no separate hidden label for the shape.
 * 4. THE PILL SURFACE GOES. R26 retires the chip: the mark must be composed WITHOUT
 *    the Shadcn `badge` primitive (`@/components/ui/badge`, which stamps
 *    `data-slot="badge"` and whose base class is an unconditional `rounded-full`
 *    capsule with a filled background). The story says it outright: "No pill surface
 *    at all… If the Shadcn `badge` primitive can't carry this without a pill, compose
 *    the mark from `badge`-free primitives rather than fighting it — but keep it one
 *    shared component." That is what `pillSurfaceAround(...)` below checks, and it is
 *    the assertion that fails against today's `<Badge>`-based implementation.
 * 5. A SHAPE IS DRAWN IN THE DOM for a status the app recognises, and for the
 *    possible-duplicate mark — an SVG glyph or a text glyph, either is fine, but it
 *    must be in the markup (not only a CSS pseudo-element), so it is verifiable and
 *    so it can be kept decorative. WHERE the four shapes live — chosen inside the
 *    shared component per state, or still supplied by each caller's vocabulary map —
 *    is the developer's design call; BR11 only requires that all four
 *    (imported/awaiting, approved, rejected, cancelled) exist in the shared component
 *    so story 6's two-character gutter can consume them.
 * 6. THE UNRECOGNISED PASSTHROUGH SURVIVES, WITH NO SHAPE (AC-3). A value this app
 *    has no name for keeps reaching the reader verbatim, and gets no glyph and no
 *    extra character of any kind — a shape there would be the component claiming to
 *    know a meaning it does not have.
 * 7. `Cancelled` is a FILE-level state (BR11). A cancelled file's transactions never
 *    reach the request list, so AC-6 exercises the cancelled mark through the one live
 *    consumer that genuinely has that state — the file-status vocabulary
 *    (`FileStatusBadge`). Its absence from the request list's live data is expected,
 *    not a bug: do NOT invent a way to show a cancelled request.
 * 8. No suppression directive of any kind may be used to route around a type or lint
 *    conflict this change introduces (BR9, CLAUDE.md §4).
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy), plus `next/navigation` as the library
 * client-navigation boundary. Every component under test is the real production one,
 * every status value comes from the project-wide factories in `@/mocks/data/` (which
 * the Playwright layer shares), and the possible-duplicate wording comes from the
 * production constant — so no wording, and no status vocabulary, is restated here.
 *
 * Runtime-only: jsdom cannot see the hairline rule, the tracking, the uppercase/
 * capitalised treatment (a CSS `text-transform` leaves `textContent` untouched), the
 * intent colour, or whether the four shapes are told apart in greyscale. All of that
 * is the manual checklist's and the Playwright axe scan's. What is pinned here is the
 * part a reader still depends on when the styling is stripped away: the status is
 * carried in words, once, beside a shape, with no pill around it.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production components under test — the shared mark, reached through three real
// consumers rather than in isolation (see contract item 1).
import { FileStatusBadge } from '@/components/files/FileStatusBadge';
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';
import { PossibleDuplicateMark } from '@/components/requests/PossibleDuplicateMark';

// Real production toast composition (not mocked) — the same one the root layout wraps
// every signed-in screen in, and which the request list mounts inside.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';

// The one place the possible-duplicate wording is stated (production code), so this
// file cannot describe the mark differently from the app.
import { POSSIBLE_DUPLICATE_MARK } from '@/lib/transactions/duplicates';

// Project-wide factories — the single source both test layers share. Status VALUES
// come from here (and from the production status vocabularies they re-export); no
// response body and no status string is hand-written in this file.
import {
  FILE_STATUS_CANCELLED,
  FILE_STATUS_IMPORTED,
  fileLogWithStatus,
  fileLogWithUnrecognisedStatus,
  isKnownFileStatus,
} from '@/mocks/data/file-log';
import {
  transactionListResponse,
  transactionsInEveryStatus,
} from '@/mocks/data/transaction';
import { ROLE_APPROVER } from '@/types/auth';
import { isKnownTransactionStatus } from '@/types/transactions';

import type { ProjectRole } from '@/types/auth';
import type {
  TransactionRead,
  TransactionReadList,
} from '@/types/transactions';

vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
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

/** The body the transactions read answers with, set per test. */
let listBody: TransactionReadList | null = null;

/** Serve these requests as the whole fetched set — one response, no paging. */
const serveTransactions = (transactions: TransactionRead[]): void => {
  listBody = transactionListResponse(transactions);
};

/** The screen as the root layout always mounts it: inside the toast composition. */
const listAs = (roles: ProjectRole[]) => (
  <ToastProvider>
    <ExpenseRequestList roles={roles} />
    <ToastContainer />
  </ToastProvider>
);

/**
 * The table row for a request, found by its own `Reference` (its primary identifier)
 * rather than by index — so no assertion depends on the order the service returned,
 * or on which column the mark ends up in after the redesign.
 */
const rowFor = (reference: string): HTMLElement => {
  const row = within(screen.getByRole('table'))
    .getByText(reference)
    .closest('tr');
  if (row === null) {
    throw new Error(
      `No table row found for "${reference}" — the request listing must render one ` +
        'row per request, carrying its Reference (see the implementation contract ' +
        'above).',
    );
  }
  return row;
};

/**
 * The retired pill surface: the Shadcn `badge` primitive stamps `data-slot="badge"`
 * on whatever it renders, and its base class is an unconditional `rounded-full`
 * capsule with a filled intent background. R26 retires it for the status mark
 * (contract item 4), so neither the mark nor anything around it may be one.
 *
 * Looks BOTH ways on purpose — up from the wording (today's badge IS the element
 * holding the text) and down from a scope (a mark rendered on its own) — so the
 * check cannot be sidestepped by moving the label one element in or out.
 *
 * Whether the finished mark LOOKS like a capsule is a judgement jsdom cannot make;
 * that belongs to the manual checklist and the Playwright pass. This pins the one
 * part that is verifiable here: the pill primitive is gone.
 */
const PILL_SURFACE = '[data-slot="badge"]';

const pillSurfaceAround = (element: HTMLElement): Element | null =>
  element.closest(PILL_SURFACE) ?? element.querySelector(PILL_SURFACE);

/**
 * Whether the mark draws a shape beside its word — an SVG glyph, or a glyph
 * character sitting next to the label. Either is a legitimate way to render a ruled
 * mark, so this asks the question in a way that does not dictate the answer: is there
 * anything in the markup besides the word itself?
 *
 * It deliberately cannot see a shape drawn ONLY by CSS (a border, a pseudo-element),
 * which is why contract item 5 requires the shape to exist in the DOM.
 */
const carriesAShape = (scope: HTMLElement, word: string): boolean =>
  scope.querySelector('svg') !== null ||
  (scope.textContent ?? '').replace(word, '').replace(/\s+/gu, '') !== '';

/**
 * Scope names for the marks rendered on their own. A `StatusBadge` renders no
 * landmark of its own, so each is rendered inside a named region — a plain scope for
 * `within(...)` and for the shape probe above, in place of a `data-testid` or a
 * `container` query.
 */
const MARK_UNDER_TEST = 'the mark under test';
const COMPARISON_MARK = 'the comparison mark';

const markNamed = (name: string): HTMLElement =>
  screen.getByRole('region', { name });

describe('Epic request-list-redesign, Story 4: a status becomes a ruled mark, not a coloured pill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listBody = null;
    mockGet.mockImplementation(async (endpoint: string) => {
      const path = String(endpoint);
      if (!path.includes('/v1/transactions')) {
        throw new Error(
          `Unexpected read of "${path}" — this story restyles the status mark. It ` +
            'changes no fetch: the listing still reads the one transaction list.',
        );
      }
      if (listBody === null) {
        throw new Error(
          'The screen read the transaction list but the test served no body — call ' +
            'serveTransactions(...) before rendering.',
        );
      }
      return listBody;
    });
  });

  // AC-1
  // Data-contract: that the real client reads `GET /v1/transactions` through the app's
  // own proxy is verified in the browser (this story's Playwright spec) and on the
  // manual checklist. What is pinned here is what the reader can read off each row.
  it('shows every recognised status as its own word in the request’s row — once, and with no pill surface around it', async () => {
    const requests = transactionsInEveryStatus();

    // Fixture preconditions: three DIFFERENT statuses, every one of them a value the
    // app recognises — so "the word is on the row" below exercises the recognised
    // mark, not AC-3's unrecognised passthrough, and no two rows can satisfy each
    // other's assertion.
    expect(new Set(requests.map((request) => request.Status)).size).toBe(
      requests.length,
    );
    requests.forEach((request) => {
      expect(isKnownTransactionStatus(request.Status)).toBe(true);
    });
    serveTransactions(requests);

    render(listAs([ROLE_APPROVER]));

    const [firstRequest] = requests;
    await waitFor(() => {
      expect(rowFor(firstRequest.Reference)).toBeInTheDocument();
    });

    requests.forEach((request) => {
      const row = rowFor(request.Reference);

      // The status still reaches the reader IN WORDS, exactly as the service wrote
      // them (BR3 — the shape supplements the wording, it never replaces it)...
      const wording = within(row).getAllByText(request.Status);
      // ...carried by exactly ONE element: the visible text is the accessible text,
      // with no screen-reader-only second copy (contract item 3).
      expect(
        wording,
        `The status "${request.Status}" must be carried by exactly one element in ` +
          'its row — the visible wording IS the accessible wording.',
      ).toHaveLength(1);

      const [mark] = wording;
      expect(mark).toBeVisible();

      // ...and it is no longer a pill: the Shadcn `badge` capsule is gone from the
      // mark and from everything wrapping it (R26, contract item 4).
      expect(
        pillSurfaceAround(mark),
        `The status "${request.Status}" is still rendered through the Shadcn ` +
          '`badge` pill primitive. R26 retires the chip: compose the ruled mark ' +
          'from `badge`-free primitives.',
      ).toBeNull();
    });
  });

  // AC-3
  it('passes a status it has no wording for straight through in the service’s own words, with no shape claiming to know what it means', () => {
    const unrecognised = fileLogWithUnrecognisedStatus().CurrentStatus;
    const recognised = fileLogWithStatus(FILE_STATUS_IMPORTED).CurrentStatus;

    // Fixture preconditions: the first value really is outside the vocabulary this
    // app knows, and the second really is inside it — so the two halves of this test
    // cannot both be explained by "shapes are never drawn".
    expect(isKnownFileStatus(unrecognised)).toBe(false);
    expect(isKnownFileStatus(recognised)).toBe(true);

    render(
      <>
        <section aria-label={MARK_UNDER_TEST}>
          <FileStatusBadge status={unrecognised} />
        </section>
        <section aria-label={COMPARISON_MARK}>
          <FileStatusBadge status={recognised} />
        </section>
      </>,
    );

    // The unfamiliar value reaches the reader verbatim — not hidden, not remapped to
    // something the app does recognise, not reduced to a shape.
    const passthrough = markNamed(MARK_UNDER_TEST);
    expect(within(passthrough).getByText(unrecognised)).toBeVisible();
    expect(within(passthrough).getAllByText(unrecognised)).toHaveLength(1);

    // ...and nothing beside the words: no glyph, no stray character, so the mark
    // never claims a meaning it does not have.
    expect(
      carriesAShape(passthrough, unrecognised),
      `"${unrecognised}" is a status this app has no wording for, so the mark must ` +
        'draw NO shape beside it — a shape there claims a meaning the app does not ' +
        'have (AC-3).',
    ).toBe(false);

    // The control: in this same render, a status the app DOES recognise gets its
    // shape — so "no shape" above is the passthrough rule, not a mark that renders
    // no shapes at all.
    const known = markNamed(COMPARISON_MARK);
    expect(within(known).getByText(recognised)).toBeVisible();
    expect(
      carriesAShape(known, recognised),
      `"${recognised}" is a status this app recognises, so its mark must draw a ` +
        'shape beside the word (contract item 5).',
    ).toBe(true);

    // Neither of them is a pill any more (R26/R28 — the files vocabulary reads
    // through the same shared mark).
    expect(pillSurfaceAround(passthrough)).toBeNull();
    expect(pillSurfaceAround(known)).toBeNull();
  });

  // AC-4
  it('keeps the possible-duplicate mark saying so in words beside its shape, in the same notation as a status', () => {
    const recognised = fileLogWithStatus(FILE_STATUS_IMPORTED).CurrentStatus;

    render(
      <>
        <section aria-label={MARK_UNDER_TEST}>
          <PossibleDuplicateMark />
        </section>
        <section aria-label={COMPARISON_MARK}>
          <FileStatusBadge status={recognised} />
        </section>
      </>,
    );

    // The mark still SAYS "possible duplicate" — the wording an Approver reads
    // straight off the row, never a colour or a shape on its own (R3/BR3).
    const duplicate = markNamed(MARK_UNDER_TEST);
    expect(within(duplicate).getByText(POSSIBLE_DUPLICATE_MARK)).toBeVisible();
    expect(
      within(duplicate).getAllByText(POSSIBLE_DUPLICATE_MARK),
    ).toHaveLength(1);

    // The same notation as a status: a shape beside the words, and no pill — asserted
    // on the duplicate mark and on a status mark in the same render, so the two
    // cannot drift into two different notations (story §Implementation notes:
    // `PossibleDuplicateMark` keeps composing on top of the shared mark).
    const status = markNamed(COMPARISON_MARK);
    expect(
      carriesAShape(duplicate, POSSIBLE_DUPLICATE_MARK),
      'The possible-duplicate mark must keep a shape beside its wording, in the ' +
        'same notation as a status mark (AC-4).',
    ).toBe(true);
    expect(carriesAShape(status, recognised)).toBe(true);
    expect(
      pillSurfaceAround(duplicate),
      'The possible-duplicate mark is still rendered through the Shadcn `badge` ' +
        'pill primitive. It composes on the shared ruled mark, so it loses the ' +
        'capsule with it (R26).',
    ).toBeNull();
    expect(pillSurfaceAround(status)).toBeNull();
  });

  // AC-6
  it('renders the cancelled mark correctly wherever it is exercised — its own word beside a shape, unlike an unrecognised value', () => {
    const cancelled = fileLogWithStatus(FILE_STATUS_CANCELLED).CurrentStatus;

    // Fixture precondition: `Cancelled` is a value the app RECOGNISES (a file-level
    // state, BR11) — which is why it gets a shape of its own, where AC-3's
    // unrecognised value gets none. Both sit at the inert end of the vocabulary, so
    // this is the pair most easily collapsed into one treatment by mistake.
    expect(isKnownFileStatus(cancelled)).toBe(true);

    render(
      <section aria-label={MARK_UNDER_TEST}>
        <FileStatusBadge status={cancelled} />
      </section>,
    );

    const mark = markNamed(MARK_UNDER_TEST);
    expect(within(mark).getByText(cancelled)).toBeVisible();
    expect(within(mark).getAllByText(cancelled)).toHaveLength(1);
    expect(
      carriesAShape(mark, cancelled),
      'The cancelled mark must exist and render its own shape beside the word — ' +
        'BR11 requires all four shapes in the shared component, even though no ' +
        'listed request can be cancelled.',
    ).toBe(true);
    expect(
      pillSurfaceAround(mark),
      'The cancelled mark is still rendered through the Shadcn `badge` pill ' +
        'primitive (R26).',
    ).toBeNull();
  });
});
