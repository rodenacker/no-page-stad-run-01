/**
 * Story Metadata:
 * - Epic: request-list-redesign — Story 8: the same listing on a phone
 * - Route: /requests
 * - Target File: web/src/components/requests/RequestCards.tsx
 * - Page Action: modify_existing
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE HOLDS NO AC-NUMBERED TEST
 * ---------------------------------------------------------------------------
 * ALL FIVE of this story's acceptance criteria are tagged `playwright`, and that
 * tagging is right: every one of them is about what a 360px-wide screen actually
 * DOES — no sideways scrolling, a mark that stays readable, tapping as well as
 * typing, a six-figure control block reflowing while `AWAITING DECISION` stays the
 * largest thing on it, parity of every action with the desktop listing. jsdom has
 * no layout engine, reports every element at 0×0, and cannot tell a legible mark
 * from an invisible one, so none of that can be honestly asserted here (see
 * testing-policy.md § "One tag, one layer").
 *
 * What this file does instead is the narrow slice that genuinely belongs at the
 * component layer and that the E2E spec does NOT duplicate:
 *
 * - the named ANTI-GOAL is actually gone — `RequestCards` composes the Shadcn
 *   `Card` primitive today, and the design direction replaces that presentation
 *   rather than extending it (brief §4 / story implementation notes);
 * - the LIST SEMANTICS survive the change — exactly one list item per request,
 *   which is what tells assistive technology how many requests there are and where
 *   each one starts, and is why `RequestListPagination` deliberately avoids
 *   `ul`/`li` (story 7);
 * - the narrow presentation is NOT the wide listing re-flowed inside a
 *   sideways-scrolling wrapper — the tempting shortcut once the wide listing is
 *   itself a ruled table (UI-23/R4 forbids it, and it is the one form of "it fits"
 *   that jsdom can catch cheaply);
 * - SELECTING, OPENING and DECIDING behave exactly as they do at wide width
 *   (BR2's carried-forward behaviour), which is cheap to drive here;
 * - ROLE GATING holds at this width too — a Finance Uploader (the auth service's
 *   `Importer`) is offered no decision and no selection control anywhere, absent
 *   rather than disabled (R7/R27).
 *
 * Only the first of those is red today, and deliberately so: the rest are
 * behaviour and semantics this epic must CARRY FORWARD unchanged (R1/BR1), so a
 * test that passes now and keeps passing is exactly the guard they need. BR1 is
 * explicit that a redesign may change markup but never weaken a behavioural
 * assertion.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these assertions pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE VIEWPORT SWITCH IS THE ONE THAT ALREADY EXISTS. `ExpenseRequestList`
 *    reads `web/src/lib/layout/viewport.ts` through `useSyncExternalStore` and
 *    renders one presentation or the other. This story changes ONLY the narrow
 *    presentation. These tests answer the production `NARROW_VIEWPORT_QUERY`
 *    itself — imported, never spelled out — so nothing here re-derives or pins the
 *    breakpoint value, and moving the crossover would not be caught (or blessed)
 *    by this file.
 * 2. THE CARD PRESENTATION MUST NOT SURVIVE. A request's line-group may not be, or
 *    contain, a Shadcn `Card` — the primitive stamps `data-slot="card"` /
 *    `data-slot="card-header"` / `…-content` / `…-footer` on what it renders, and
 *    those markers are what test 1 looks for. This is a deliberate composition
 *    assertion (a named anti-goal of the design direction is a real acceptance
 *    criterion here), not a class assertion: no styling is asserted anywhere in
 *    this file.
 * 3. ONE `listitem` PER REQUEST, INSIDE A LIST. Not two (a nested list would give
 *    the reader every request twice), and not a stack of `div`s (which would say
 *    nothing at all). The requests are the page's ONLY list at this width.
 * 4. THE REQUESTS ARE NOT A TABLE AT THIS WIDTH. `role="table"` must be absent
 *    while the narrow presentation is on screen — a wide table inside an
 *    `overflow-x` wrapper is precisely what UI-23/R4 rules out, and it is the
 *    easiest regression to introduce once the wide listing is a ruled table of its
 *    own.
 * 5. EVERY PER-REQUEST ACTION IS REACHABLE FROM THE REQUEST'S OWN LINE-GROUP,
 *    under the SAME accessible names the wide listing uses — `Open request <ref>`,
 *    `Approve request <ref>`, `Reject request <ref>` (`decideActionName`), `Select
 *    request <ref>` (`selectRequestLabel`). The helpers below deliberately do NOT
 *    care whether an action sits directly on the line-group or inside the action
 *    overflow UI-23 allows: they reach it either way. What is asserted is that it
 *    is REACHABLE and that activating it does the same thing as at wide width.
 *    (Note the standing user decision recorded in `RequestActions`: the decisions
 *    are direct controls with no overflow, taken at manual test. This file does
 *    not re-litigate that either way.)
 * 6. THE SELECTION CONTROL KEEPS ITS ROLE. It is a `checkbox` whose accessible
 *    name is `selectRequestLabel(reference)`, and its checked state is how the
 *    reader knows what is selected — the contract `bulk-approval-and-live-refresh`
 *    story 1 pinned. R15/BR5 move it INTO the gutter; that is placement, not a
 *    licence to change what it is or how its state is conveyed (BR1: markup may
 *    change, a behavioural assertion may not be weakened).
 * 7. HIDDEN, NEVER DISABLED, still (R7/BR10). Test 6 opens the action overflow if
 *    there is one before asserting the negatives, so a decision parked inside an
 *    unopened menu cannot pass, and it finds disabled controls too, so a greyed-out
 *    Approve fails exactly as a working one would.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy). `window.matchMedia` is SUPPLIED, not
 * mocked: jsdom implements none of it, so `vitest.setup.ts` already stands in a
 * nothing-matches version, and this file stands in one that answers the single
 * production query the list asks (the same treatment pointer capture and
 * `ResizeObserver` get). Every response body comes from the project-wide factory
 * in `@/mocks/data/transaction`, and the signed-in identity from
 * `@/mocks/data/identity` — read through the production `rolesOf`, so the roles
 * this list is handed are the ones the app itself would derive from a userinfo
 * response. No body is authored here.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): each request is
 * still presented as a Shadcn `Card` at narrow width, which is the anti-goal test 1
 * refuses.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the list that owns the viewport switch and hands the
// narrow presentation everything it renders.
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// The notification composition the root layout wraps every signed-in screen in, and
// the one the list is mounted inside. Not mocked.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
import { DECISION_APPROVE } from '@/lib/api/decisions';
import { rolesOf } from '@/lib/auth/roles';

// The crossover the list already switches on — imported, never restated, because
// this story keeps that switch and changes only what the narrow side renders.
import { NARROW_VIEWPORT_QUERY } from '@/lib/layout/viewport';

// Every word the screen says about a decision, from the one place all three
// surfaces read it — so a test can never assert wording the app does not use.
import {
  DECIDE_OUTCOMES,
  confirmationTitleFor,
  decideActionName,
} from '@/lib/transactions/deciding';
import { selectRequestLabel } from '@/lib/transactions/selecting';

// The chosen ordering belongs to the SESSION, not to the component, so it outlives
// a test unless it is put back — see `beforeEach`.
import { rememberSort } from '@/lib/transactions/sortPreference';

// Project-wide identity source: the userinfo body both test layers gate on.
import { userInfoFor } from '@/mocks/data/identity';

// Project-wide Transaction factory: the single source of truth for the wire shape
// and its canonical values, shared with the Playwright layer.
import {
  TRANSACTION_STATUS_IMPORTED,
  transactionListResponse,
  transactionsForBulkSelection,
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

/** Whatever `vitest.setup.ts` left in place, put back after every test. */
let suppliedMatchMedia: typeof window.matchMedia;

/**
 * Answers the ONE media query the list asks — the production
 * `NARROW_VIEWPORT_QUERY` — as a phone-width screen would, and answers every other
 * query "not applied", exactly as the shared stand-in does (so the theme's
 * `prefers-color-scheme` and any `prefers-reduced-motion` check read as they do in
 * every other test).
 */
const answerAsNarrowViewport = (): void => {
  window.matchMedia = ((query: string) => ({
    matches: query === NARROW_VIEWPORT_QUERY,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

/**
 * The roles the app itself would derive from each signed-in identity — read through
 * production `rolesOf` over the shared userinfo body, rather than hand-listing a
 * role name here.
 */
const APPROVER_ROLES = rolesOf(userInfoFor(ROLE_APPROVER));
const FINANCE_UPLOADER_ROLES = rolesOf(userInfoFor(ROLE_IMPORTER));

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderList = (roles: ProjectRole[]) =>
  render(
    <ToastProvider>
      <ExpenseRequestList roles={roles} />
      <ToastContainer />
    </ToastProvider>,
  );

/** The requests in a fixture set that are still awaiting a decision. */
const importedIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status === TRANSACTION_STATUS_IMPORTED);

/** The requests in a fixture set somebody has already decided. */
const decidedIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status !== TRANSACTION_STATUS_IMPORTED);

/** What a failed negative assertion should print: the offending control, named. */
const described = (element: HTMLElement): string => {
  const name =
    element.getAttribute('aria-label') ?? (element.textContent ?? '').trim();
  return `<${element.tagName.toLowerCase()}> "${name}"`;
};

/**
 * Every list item carrying a named request — found by the reference the request's
 * own lines carry, never by position.
 */
const lineGroupsFor = (reference: string): HTMLElement[] =>
  screen
    .queryAllByRole('listitem')
    .filter((item) => item.textContent?.includes(reference) === true);

/** The ONE list item a named request is announced as. */
const lineGroupFor = (reference: string): HTMLElement => {
  const groups = lineGroupsFor(reference);
  if (groups.length !== 1) {
    throw new Error(
      `Expected exactly one list item carrying "${reference}", found ` +
        `${String(groups.length)} — the narrow presentation announces one list ` +
        'item per request (story implementation notes: this is load-bearing).',
    );
  }
  return groups[0];
};

/** The named request's line-group, once the list has loaded. */
const shownLineGroupFor = async (reference: string): Promise<HTMLElement> =>
  await waitFor(() => lineGroupFor(reference));

/** The list a line-group is announced inside, or `null` if it is in none. */
const listAround = (item: HTMLElement): Element | null =>
  item.closest('ul, ol, [role="list"]');

/**
 * Anything the Shadcn `Card` primitive renders, by the `data-slot` markers it
 * stamps on its own parts — the honest way to ask "is this request presented as a
 * card?", since the card is a composition choice rather than a role or a piece of
 * text. Nothing here asserts a class or a style.
 */
const CARD_COMPOSITION = '[data-slot="card"], [data-slot^="card-"]';

const cardCompositionIn = (element: HTMLElement): string[] =>
  [
    ...(element.matches(CARD_COMPOSITION) ? [element] : []),
    ...Array.from(element.querySelectorAll(CARD_COMPOSITION)),
  ].map(
    (part) =>
      `<${part.tagName.toLowerCase()} data-slot="${part.getAttribute('data-slot') ?? ''}">`,
  );

/** Every role a per-request action could be offered under, menu items included. */
const ACTION_ROLES = ['button', 'menuitem', 'link'] as const;

/** Every activatable control on screen offering the named action. */
const controlsNamed = (name: string | RegExp): HTMLElement[] =>
  ACTION_ROLES.flatMap((role) => screen.queryAllByRole(role, { name }));

/** How the control that opens a request names itself and the request. */
const openActionFor = (reference: string): RegExp =>
  new RegExp(`^open\\b.*${reference}`, 'i');

/** What an action overflow, if the presentation offers one, looks like. */
const OVERFLOW_TRIGGER_NAME = /\b(more|actions?|options?|menu)\b/i;

const overflowTriggersOn = (group: HTMLElement): HTMLElement[] =>
  within(group)
    .queryAllByRole('button')
    .filter(
      (control) =>
        control.getAttribute('aria-haspopup') !== null ||
        OVERFLOW_TRIGGER_NAME.test(
          control.getAttribute('aria-label') ?? control.textContent ?? '',
        ),
    );

/**
 * Opens the named request's action overflow if it has one, and does nothing if it
 * does not. UI-23 allows an overflow at this width and the standing user decision
 * recorded in `RequestActions` removed the one that existed — this file takes no
 * side, it just makes sure everything on offer is actually on screen before
 * anything is asserted about what is or is not offered.
 */
const revealEveryActionOn = async (
  user: User,
  reference: string,
): Promise<void> => {
  const triggers = overflowTriggersOn(lineGroupFor(reference));
  if (triggers.length === 1) {
    await user.click(triggers[0]);
  }
};

/**
 * The named per-request action, reached however this presentation offers it —
 * directly on the line-group, or from inside its action overflow. Navigation, not
 * assertion: the caller's expectation runs unconditionally afterwards, so an action
 * that is genuinely missing fails here with the reason printed.
 */
const actionOnRequest = async (
  user: User,
  reference: string,
  name: string | RegExp,
): Promise<HTMLElement> => {
  if (controlsNamed(name).length === 0) {
    await revealEveryActionOn(user, reference);
  }
  const found = controlsNamed(name);
  if (found.length !== 1) {
    throw new Error(
      `Expected exactly one control named ${String(name)} for request ` +
        `"${reference}", found ${String(found.length)} — every action the wide ` +
        'listing offers must be reachable from the request at narrow width too ' +
        '(R4/BR2), under the same accessible name.',
    );
  }
  return found[0];
};

/** Reaches the named per-request action and activates it. */
const activateOnRequest = async (
  user: User,
  reference: string,
  name: string | RegExp,
): Promise<void> => {
  await user.click(await actionOnRequest(user, reference, name));
};

/** One request's selection control, in the request's own line-group. */
const tickOn = (reference: string): HTMLElement =>
  within(lineGroupFor(reference)).getByRole('checkbox', {
    name: selectRequestLabel(reference),
  });

describe('Epic request-list-redesign, Story 8: the same listing on a phone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    served = [];
    // The ordering is remembered for the session, so a test that sorts would
    // otherwise hand its ordering to the next one.
    rememberSort(null);

    suppliedMatchMedia = window.matchMedia;
    answerAsNarrowViewport();

    mockGet.mockImplementation(() =>
      Promise.resolve(transactionListResponse(served)),
    );
  });

  afterEach(() => {
    window.matchMedia = suppliedMatchMedia;
  });

  // R4 / brief §4 anti-goal — the component-layer half of AC-1. What a 360px screen
  // LOOKS like, and that it never scrolls sideways, is the Playwright spec's.
  it('presents each request as its own line-group rather than as a card', async () => {
    const requests = transactionsForBulkSelection(3);
    serve(requests);

    // Five requests in all — three still awaiting a decision, two already decided —
    // so the presentation is never proven on a set of identical rows.
    expect(importedIn(requests)).toHaveLength(3);
    expect(decidedIn(requests)).toHaveLength(2);

    renderList(APPROVER_ROLES);

    for (const request of requests) {
      const group = await shownLineGroupFor(request.Reference);

      // The card presentation is a NAMED ANTI-GOAL of this direction: it is
      // replaced, not extended (brief §4; story implementation notes). Neither the
      // line-group itself nor anything inside it may be a Shadcn card.
      expect(cardCompositionIn(group)).toEqual([]);
    }
  });

  // R10 / R4, and the list semantics carried from earlier epics — the component-layer
  // half of AC-2. Whether the gutter mark stays READABLE at 360px is Playwright's.
  it('announces exactly one list item per request, and no table, at this width', async () => {
    const requests = transactionsForBulkSelection(3);
    serve(requests);

    renderList(APPROVER_ROLES);

    for (const request of requests) {
      // Exactly one — a nested list would announce the same request twice, and a
      // stack of plain `div`s would announce nothing at all.
      await waitFor(() => {
        expect(lineGroupsFor(request.Reference)).toHaveLength(1);
      });
      expect(listAround(lineGroupFor(request.Reference))).not.toBeNull();
    }

    // Not the wide listing re-flowed inside a sideways-scrolling wrapper, which is
    // exactly what UI-23/R4 rules out at this width.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // BR2 — selection behaves identically at this width. AC-3 covers doing it by tap
  // and by keyboard in a real browser; this pins the behaviour itself.
  it('selects and unselects a request from its own line-group, and offers no tick on one already decided', async () => {
    const user = userEvent.setup();
    const requests = transactionsForBulkSelection(3);
    const awaiting = importedIn(requests)[0];
    const alreadyDecided = decidedIn(requests)[0];
    serve(requests);

    renderList(APPROVER_ROLES);

    await shownLineGroupFor(awaiting.Reference);
    expect(tickOn(awaiting.Reference)).not.toBeChecked();

    await user.click(tickOn(awaiting.Reference));
    await waitFor(() => {
      expect(tickOn(awaiting.Reference)).toBeChecked();
    });

    await user.click(tickOn(awaiting.Reference));
    await waitFor(() => {
      expect(tickOn(awaiting.Reference)).not.toBeChecked();
    });

    // A request somebody has already decided offers none at all: absent, not greyed
    // out (R7/BR10). `queryAllByRole` finds disabled controls too.
    expect(
      within(lineGroupFor(alreadyDecided.Reference))
        .queryAllByRole('checkbox')
        .map(described),
    ).toEqual([]);
  });

  // BR2 — opening a request behaves identically at this width, and the panel says
  // WHICH request is open.
  it('opens a request from its own line-group, into the same panel the wide listing opens', async () => {
    const user = userEvent.setup();
    const requests = transactionsForBulkSelection(3);
    const request = importedIn(requests)[0];
    serve(requests);

    renderList(APPROVER_ROLES);

    await shownLineGroupFor(request.Reference);
    await activateOnRequest(
      user,
      request.Reference,
      openActionFor(request.Reference),
    );

    const panel = await screen.findByRole('dialog', {
      name: new RegExp(request.Reference),
    });
    expect(panel).toBeInTheDocument();
  });

  // BR2 / R27 — deciding behaves identically at this width: the same confirmation
  // convention, naming the same request, before anything is recorded.
  it('asks the same confirmation when an Approver decides a request at this width', async () => {
    const user = userEvent.setup();
    const requests = transactionsForBulkSelection(3);
    const request = importedIn(requests)[0];
    serve(requests);

    renderList(APPROVER_ROLES);

    await shownLineGroupFor(request.Reference);
    await activateOnRequest(
      user,
      request.Reference,
      decideActionName(DECISION_APPROVE, request.Reference),
    );

    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent(
      confirmationTitleFor(DECISION_APPROVE, request.Reference),
    );
  });

  // R7 / R27 — role gating holds at this width too: hidden, never disabled. The
  // parity half (AC-5, nothing reachable ONLY on a wide screen) is Playwright's.
  it('offers a Finance Uploader no decision and no selection control at this width, while still letting them read a request', async () => {
    const user = userEvent.setup();
    const requests = transactionsForBulkSelection(3);
    const awaiting = importedIn(requests)[0];
    serve(requests);

    renderList(FINANCE_UPLOADER_ROLES);

    await shownLineGroupFor(awaiting.Reference);

    // Everything this presentation offers, on screen — so a decision parked inside
    // an unopened overflow cannot pass the negatives below.
    await revealEveryActionOn(user, awaiting.Reference);

    // Reading the request is still offered, so the negatives are a gating result
    // rather than an empty screen.
    expect(controlsNamed(openActionFor(awaiting.Reference))).toHaveLength(1);

    for (const outcome of DECIDE_OUTCOMES) {
      expect(
        controlsNamed(decideActionName(outcome, awaiting.Reference)).map(
          described,
        ),
      ).toEqual([]);
    }

    expect(
      controlsNamed(selectRequestLabel(awaiting.Reference)).map(described),
    ).toEqual([]);
    expect(screen.queryAllByRole('checkbox').map(described)).toEqual([]);
  });
});
