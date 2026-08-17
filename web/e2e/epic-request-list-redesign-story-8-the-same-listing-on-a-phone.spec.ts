/**
 * Story Metadata:
 * - Epic: request-list-redesign — Redesign the request list as a batch listing
 * - Story: 8 — The same listing on a phone
 * - Route: /requests
 * - Target File: web/src/components/requests/RequestCards.tsx
 * - Page Action: modify_existing
 * - Requirements: R4 (UI-23), R10, R5, BR2 (+ R11/R16/BR4 held at this width, R15/R18/R26
 *   for the gutter marks, R7/R27 for who is offered what, project.md NFR-base-1 and
 *   NFR-base-3 — the WCAG 2.2 AA bar and the 360px mobile floor)
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - ALL FIVE of this story's acceptance criteria are `playwright`-tagged, so this file is
 *   the story's entire automated coverage. There is no Vitest layer for it, and that is
 *   deliberate: every criterion is about what a real browser does at a real width —
 *   whether the page scrolls sideways, whether a mark is painted large enough to read,
 *   whether a tap and a keystroke both work, which text is physically the largest on the
 *   screen, and whether an action offered on a wide screen is still reachable on a narrow
 *   one. jsdom has no layout, no viewport and no gestures, so it can answer none of them.
 * - AC-1 → "one ruled line-group per request at 360px". AC-2 → "the marks stay readable,
 *   and each request is still one item in a list". AC-3 → "open, select and decide, by tap
 *   and by keyboard". AC-4 → "the control block still holds, and AWAITING DECISION is
 *   still the largest thing on the screen". AC-5 → "nothing is reachable only on a wide
 *   screen".
 * - One further test, carrying no AC: the real-browser axe scan of the NARROW
 *   presentation. It is a distinct state no other spec in this epic reaches (every other
 *   spec runs at the project's desktop width), and testing-policy.md § Accessibility
 *   requires each distinct state a story introduces to be scanned. It is also the only
 *   automated check on WCAG 2.2's target-size rule for the gutter's tick at phone width,
 *   which the story's implementation notes call out directly.
 * - NOT asserted here, because they belong to the stories that own them: the control
 *   block's aggregate DERIVATION and its narrowed/selection behaviour (story 2), the
 *   gutter's composition and the selection's survival across narrowing/ordering/paging
 *   (story 6), the continuation line's wording (story 7), the decide flow's confirmation
 *   copy, staleness guard and already-decided refusal (`expense-decisions`). This story
 *   asserts that what those stories built still WORKS AND READS at 360px.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * This spec never contacts a live backend and never uses a real credential
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running on this machine. Two boundaries, one
 * contract — the arrangement every earlier epic established, reused rather than
 * re-invented:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. `/requests` is gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()` cannot
 *    see a fetch the browser never makes. The stub answers that call from the shared
 *    identity source, keyed off the `session` cookie value seeded below — which is also
 *    what decides that the person here is an Approver (R27: only an Approver is offered
 *    selection and the decisions, so only an Approver can exercise AC-3 and AC-5 in full).
 * 2. Browser boundary → `page.route()` below, for this screen's transactions read
 *    (`GET /transactions-api/v1/transactions`, answered from a feed the test controls, so
 *    the 15s self-refresh only re-serves whatever the test last showed), the identity call
 *    in case a client component reads it, and — in the deciding journey only — the app's
 *    own decide route (`POST /api/decisions`). A catch-all aborts anything else under
 *    `/transactions-api/**`: those are the app's OWN same-origin addresses, so an unmocked
 *    call would be forwarded to the live transactions service by a route handler INSIDE
 *    the Next.js process, where the live-origin block cannot see it. The real services'
 *    own origins (:4424 / :4423) are blocked outright, registered LAST so they win over
 *    the origin-agnostic globs above them.
 *
 * Every response body comes from the project-wide factories under `web/src/mocks/data/`
 * (`transaction.ts`, `identity.ts`, `role.ts`) — no response shape and no canonical value
 * is authored in this file, so this spec and the Vitest layers of the sibling stories
 * cannot drift on the contract. `GET /v1/transactions` takes no query parameters and
 * answers `{ Transactions: [...] }`; the envelope is the factory's business.
 *
 * ---------------------------------------------------------------------------
 * Implementation patterns this spec assumes — READ BEFORE IMPLEMENTING
 * ---------------------------------------------------------------------------
 * - THE VIEWPORT IS SET EXPLICITLY, and the page is loaded AT that width rather than
 *   resized after a desktop render — the way a phone user receives it. 360px is the
 *   project's mobile floor (NFR-base-3) and the width R4/UI-23 names, and it is where
 *   sideways scrolling shows up first.
 * - The request list is read FROM THE BROWSER through the shared API client at the app's
 *   own same-origin `/transactions-api/...` address, as `ExpenseRequestList` already does.
 *   `page.route()` cannot intercept a read issued by the Next.js server or by a Server
 *   Action — moving it into one bypasses these mocks and leaves for the live service.
 * - THE NARROW PRESENTATION IS STILL A REAL LIST: one `listitem` per request, inside one
 *   `list`. That is load-bearing and is asserted directly (AC-2). `lib/layout/viewport.ts`
 *   keeps the narrow/wide crossover it already owns (767px) — this story changes only what
 *   the narrow branch renders, and the two branches are still switched in JavaScript
 *   rather than rendered together with one hidden by CSS.
 * - EACH REQUEST IS ONE GROUP OF RULED LINES, NOT A CARD. Asserted by measurement, not by
 *   class name: consecutive request groups TOUCH (separated by a hairline rule, not by a
 *   gap), which is what tells a ruled listing apart from the `Card`-per-request stack this
 *   story replaces (design brief §4 anti-goals; story §Implementation notes).
 * - NO SIDEWAYS SCROLL, and no sideways scroll SMUGGLED INSIDE the page either: a wide
 *   table kept in an `overflow-x-auto` wrapper does not satisfy R4, so both the page's own
 *   scroll width and every horizontally scrollable box inside `main` are checked.
 * - THE STATUS MARK CARRIES VISIBLE WORDING (R26: a glyph paired with a tracked text
 *   label; BR3: the shape supplements, never replaces, the text/icon pairing R3 requires).
 *   The marks below are therefore located by that wording — the status as the SERVICE sent
 *   it, matched case-insensitively so a CSS `text-transform` is free to shout it.
 * - THE CONTROL BLOCK READS LABEL-THEN-FIGURE (R11: tracked mono labels OVER tabular
 *   figures), so each label reads immediately before its own figure. AC-4's assertions
 *   depend on that adjacency; a header row of labels above a separate row of figures would
 *   fail them. Its labels may be shouted by CSS — nothing here asserts letter case.
 * - PER-REQUEST ACTIONS: `RequestActions` renders every per-request action as a DIRECT
 *   control today, on the row and on the narrow group alike, named for the request it acts
 *   on ("Open request X" / "Approve request X" / "Reject request X" / "Select request X"
 *   from `lib/transactions/{deciding,selecting}.ts`). `generated-docs/architecture.md`
 *   records that as the user-approved supersession of the ⋯ overflow UI-23 named. AC-1 and
 *   AC-5 are therefore written to the OUTCOME — every action reachable in one gesture from
 *   the group — and will pass whether the actions sit on the group or behind an overflow
 *   the group opens. AC-3's KEYBOARD half walks the direct controls, because a menu's
 *   keyboard grammar is a different walk: if this story reintroduces an overflow, re-point
 *   that half at it (a legitimate BR1 markup re-point — the assertion it makes, every
 *   action completable by keyboard alone at 360px, stays exactly as strong).
 * - The detail panel is a `dialog` closed by its own written-out "Close" control or by
 *   Escape; a decision's confirmation is an `alertdialog` (Radix portals both out of
 *   `main`, so they are addressed on the page, not through it). A decision is sent to the
 *   app's own `POST /api/decisions`, and the new status is learnt only by re-reading the
 *   list (`lib/api/decisions.ts`) — which is why the mocked decide answer moves the feed
 *   on as it answers, never before, or the re-read-before-submit guard would refuse the
 *   decision as already decided.
 * - The screen lives inside epic 1's signed-in shell, so its content is within `main` and
 *   every query about the listing is scoped to it — Next renders a permanently empty
 *   body-level `role="alert"` route announcer outside `main`.
 *
 * NO CLOCK IS INSTALLED and nothing here waits real time: every assertion below is
 * auto-waiting, and the list's 15s refresh only re-serves whatever the feed holds. Axe is
 * likewise never run under a faked clock.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend response
 * below is mocked, so no live backend is contacted and no real credentials are needed.
 * These tests WILL FAIL until the story is implemented (TDD red): at 360px `/requests`
 * still renders a stack of Shadcn `Card`s with no gutter and no control block above it.
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER } from '../src/mocks/data/role';
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  approveSuccessResponse,
  duplicatePair,
  transactionDecided,
  transactionListResponse,
  transactionsForNarrowing,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** This story's screen (story metadata Route). */
const REQUESTS_PATH = '/requests';

/**
 * A phone at the project's mobile floor — the width R4/UI-23 names and NFR-base-3 sets
 * (≥360px). Deliberately the narrowest supported width: sideways scrolling, a clipped
 * gutter mark and a control block that will not fit all show up here first.
 */
const PHONE_VIEWPORT = { width: 360, height: 740 };

/**
 * A desktop width for the parity check only — comfortably past the 767px crossover
 * `lib/layout/viewport.ts` owns, so the wide presentation is the one being read.
 */
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

/**
 * The calls this screen makes, as the BROWSER addresses them: the app's own mount
 * points, never a service origin. Trailing `**` so query strings are covered.
 */
const TRANSACTIONS_API_GLOB = '**/transactions-api/**';
const TRANSACTIONS_URL_GLOB = '**/transactions-api/v1/transactions**';
const DECISIONS_URL_GLOB = '**/api/decisions**';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * WCAG 2.2 AA — this project's effective accessibility bar (project.md §Baseline NFRs,
 * superseding the template's 2.1 AA floor), and the identical tag set every earlier
 * epic's scan used. Scoped explicitly because axe's defaults also run best-practice
 * rules, which would fail this spec on issues outside the agreed bar.
 */
const WCAG_22_AA_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
];

/**
 * The served batch: the project-wide narrowing spread — eight requests across three
 * originating files, all three statuses, no two of them a possible duplicate. Its
 * aggregates are the ones story 2's implementation notes state literally (RECORDS 8 /
 * AWAITING 5 / DECIDED 3 / TOTAL VALUE 26136.31), which is what lets AC-4 read the
 * control block's figures without recomputing them with the logic under test.
 */
const LISTED = transactionsForNarrowing();

/** The whole-batch figures, stated literally (story 2 §Implementation notes). */
const RECORDS_FIGURE = 8;
const AWAITING_DECISION_FIGURE = 5;
const DECIDED_FIGURE = 3;
const TOTAL_VALUE_FIGURE = '26136.31';

/**
 * What `BATCH` reads with no originating-file narrowing active — the whole-queue reading
 * the user settled at the stories approval (brief §Resolved spec gap). Pinned because it
 * is a decided value, not a derived one.
 */
const WHOLE_QUEUE_BATCH = 'all files';

/**
 * A pair of possible duplicates to put an exception mark in the gutter, composed onto the
 * served batch for AC-2 alone (the narrowing spread deliberately holds none, so the
 * aggregate figures above stay true for AC-4's set).
 */
const [DUPLICATE_FIRST, DUPLICATE_SECOND] = duplicatePair();

/** AC-2's set: the batch plus the duplicate pair — ten requests, one page (default 20). */
const LISTED_WITH_DUPLICATES: TransactionRead[] = [
  ...LISTED,
  DUPLICATE_FIRST,
  DUPLICATE_SECOND,
];

/** How the mark a possible duplicate carries reads (`lib/transactions/duplicates.ts`). */
const POSSIBLE_DUPLICATE_MARK = /^possible duplicate$/i;

/**
 * How each per-request action names itself and the request it acts on
 * (`lib/transactions/{deciding,selecting}.ts`, `RequestActions.tsx`) — which is what makes
 * one group's control addressable while every listed request carries one of its own.
 */
const openRequestName = (reference: string): RegExp =>
  new RegExp(`open request ${reference}`, 'i');
const approveRequestName = (reference: string): RegExp =>
  new RegExp(`approve request ${reference}`, 'i');
const selectRequestName = (reference: string): RegExp =>
  new RegExp(`select request ${reference}`, 'i');

/** The confirming choice inside a decision's confirmation, never its Cancel. */
const APPROVE_CHOICE = /^approve$/i;

/** The detail panel's own written-out close control (`RequestDetailPanel.tsx`). */
const CLOSE_PANEL = /^close$/i;

/** The export, which either role may use (brief R27, `csv-export` R3). */
const EXPORT_ACTION = /export/i;

/**
 * A group's action overflow, if this story gives it one: a control that says of itself
 * that it opens a menu. Used only to REVEAL the actions before they are asserted — see
 * the header's note on `RequestActions` and architecture.md.
 */
const OVERFLOW_TRIGGER = 'button[aria-haspopup="menu"]';

/**
 * Candidate controls for the parity sweep (AC-5). Disabled controls are left out: a
 * disabled control offers the reader nothing, at either width, so counting one as an
 * action on the wide screen would demand a disabled twin on the narrow one.
 */
const CONTROL_SELECTOR = [
  'button:not([disabled]):not([aria-disabled="true"])',
  'a[href]:not([aria-disabled="true"])',
  '[role="button"]:not([disabled]):not([aria-disabled="true"])',
  '[role="menuitem"]:not([aria-disabled="true"])',
].join(', ');

/**
 * The actions the wide listing offers on a request, as verbs — the guard that keeps AC-5's
 * sweep honest. If the wide row stopped offering one of these, the parity check would
 * quietly have less to prove.
 */
const ACTIONS_THE_WIDE_ROW_OFFERS = ['approve', 'open', 'reject', 'select'];

/**
 * How much space may sit between two consecutive request groups. A hairline rule is a
 * border, so it costs no gap at all; two or three pixels of sub-pixel rounding is the most
 * a ruled listing can honestly produce. The 12px gutter a card stack leaves between its
 * cards fails this.
 */
const RULE_TOLERANCE_PX = 3;

/** The smallest a mark can be painted and still be readable at arm's length. */
const MIN_LEGIBLE_PX = 10;

/** How far apart two marks may sit horizontally and still read as one column. */
const COLUMN_TOLERANCE_PX = 2;

/** A mocked JSON response, built from a project-wide factory body. */
const jsonResponse = (
  body: unknown,
  status = 200,
): { status: number; contentType: string; body: string } => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/** Blocks the live services outright (see LIVE_BACKEND_ORIGINS). */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Answers a BROWSER-side identity read from the shared userinfo source, so it can never
 * disagree with what the Node-side stub returns for the same session — one person
 * server-side and another in the browser would mean two different sets of controls.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(userInfoFor(roleName))),
  );
};

/** What the mocked transactions service is currently holding. */
interface RequestFeed {
  /** Change what the NEXT read of the list returns — the service moving on. */
  show: (requests: TransactionRead[]) => void;
}

/**
 * Serves the whole request set in one response, as the real endpoint does (no query
 * parameters, no server-side narrowing, ordering or paging), returning whatever the test
 * last showed — so anything narrowed, ordered or paged on screen was done by the app
 * itself, and a repeat read (the 15s self-refresh) cannot change the screen by itself.
 *
 * The `/transactions-api/**` catch-all is registered FIRST so it loses to the specific
 * read (Playwright matches the most recently registered route first): any other call
 * under the app's transactions mount is aborted rather than forwarded to the live
 * service by the app's own proxy.
 */
const serveRequests = async (
  page: Page,
  initialRequests: TransactionRead[],
): Promise<RequestFeed> => {
  await page.route(TRANSACTIONS_API_GLOB, (route) => route.abort());

  let requests = initialRequests;
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse(requests))),
  );

  return {
    show: (next: TransactionRead[]) => {
      requests = next;
    },
  };
};

/** One answer from the app's own decide route, and what the service then holds. */
interface DecisionAnswer {
  /** The status it answers with. */
  status: number;
  /** Its body, always from the shared factory. */
  body: unknown;
  /**
   * Applied as the answer is given — never before it: the decide flow re-reads the
   * request before submitting (`expense-decisions` BR1), and a feed already showing the
   * request decided would have that guard refuse the decision instead of recording it.
   */
  andThen?: () => void;
}

/**
 * Answers the decide route with `answers` in order, repeating the last one for any
 * further call. Nothing here counts calls — what is on screen is the evidence.
 */
const mockDecisionCalls = async (
  page: Page,
  answers: readonly DecisionAnswer[],
): Promise<void> => {
  let calls = 0;
  await page.route(DECISIONS_URL_GLOB, (route) => {
    const answer = answers[Math.min(calls, answers.length - 1)];
    calls += 1;
    if (!answer) {
      throw new Error(
        'mockDecisionCalls was given no answers — every decision this spec sends must ' +
          'be answered here, or it would leave for the live service.',
      );
    }
    answer.andThen?.();
    return route.fulfill(jsonResponse(answer.body, answer.status));
  });
};

/**
 * Puts the browser in a signed-in state as the named role, without a real credential:
 * the mock `session` cookie the Node-side auth stub maps back to this role when the
 * server-side gate asks who the session belongs to.
 */
const seedSession = async (
  context: BrowserContext,
  roleName: string,
): Promise<void> => {
  await context.addCookies([
    {
      name: 'session',
      value: sessionTokenFor(roleName),
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
};

/** The screen's own content — everything about the listing is scoped to it. */
const screenOf = (page: Page): Locator => page.getByRole('main');

/** Every request group in the narrow listing, in the order they are read. */
const requestGroups = (page: Page): Locator =>
  screenOf(page).getByRole('listitem');

/** One request's own group, found by its reference — never by position. */
const requestGroup = (page: Page, reference: string): Locator =>
  requestGroups(page).filter({ hasText: reference });

/** One request's row in the WIDE listing, likewise found by its reference. */
const requestRow = (page: Page, reference: string): Locator =>
  screenOf(page).getByRole('row').filter({ hasText: reference });

/** One request's selection control, wherever the presentation puts it. */
const selectionControl = (page: Page, reference: string): Locator =>
  screenOf(page).getByRole('checkbox', { name: selectRequestName(reference) });

/** The export control, which sits above the listing at either width. */
const exportControl = (page: Page): Locator =>
  screenOf(page).getByRole('button', { name: EXPORT_ACTION });

/** The read-only detail panel, portalled out of `main` by Radix. */
const detailPanel = (page: Page): Locator => page.getByRole('dialog');

/** A decision's confirmation, likewise portalled — and an `alertdialog`, not a `dialog`. */
const confirmation = (page: Page): Locator => page.getByRole('alertdialog');

/** The still-`Imported` requests in a served set — the ones a decision may still touch. */
const awaitingDecisionIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status === TRANSACTION_STATUS_IMPORTED);

/** The already-decided requests in a served set — the ones carrying a decision mark. */
const decidedIn = (requests: TransactionRead[]): TransactionRead[] =>
  requests.filter((request) => request.Status !== TRANSACTION_STATUS_IMPORTED);

/**
 * A request's amount as the screen may print it: the digits, with an optional separator
 * wherever a thousands separator would fall and optional cents — so "15750",
 * "15,750.00", "15 750,00" and "R 15 750.00" all satisfy it. Derived from the factory
 * rather than retyped, and no currency symbol is assumed.
 */
const amountOnScreen = (amount: number): RegExp => {
  const [whole, cents] = amount.toFixed(2).split('.');
  const grouped = String(whole).replace(/\B(?=(\d{3})+$)/g, '[\\s,.]?');
  return new RegExp(`${grouped}([.,]${String(cents)})?`);
};

/** A status as the service sent it, matched however the design cases it (R26). */
const statusOnScreen = (status: string): RegExp =>
  new RegExp(`^${status}$`, 'i');

/**
 * A control's accessible name, for the parity sweep and for readable failure output.
 * `aria-label` first, because that is what a reader is actually given for the controls
 * that name their request.
 */
const nameOf = (control: Locator): Promise<string> =>
  control.evaluate(
    (element) =>
      (element.getAttribute('aria-label') ?? element.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim() || element.tagName.toLowerCase(),
  );

/** Every enabled control inside a region, by accessible name. */
const controlNamesIn = async (scope: Locator): Promise<string[]> => {
  const names = await scope
    .locator(CONTROL_SELECTOR)
    .evaluateAll((elements) =>
      elements.map((element) =>
        (element.getAttribute('aria-label') ?? element.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
      ),
    );
  return names.filter((name) => name.length > 0);
};

/**
 * The action a control name describes, reduced to its verb: "Approve request TXN-…" and a
 * menu item reading "Approve" are the same offer to the user, so parity is compared on the
 * verb rather than on the whole sentence.
 */
const verbOf = (name: string): string => {
  const leadingWord = /^[a-z]+/i.exec(name.trim());
  return leadingWord === null
    ? name.trim().toLowerCase()
    : leadingWord[0].toLowerCase();
};

/** The distinct actions a set of control names offers, sorted for a readable diff. */
const actionsIn = (names: string[]): string[] =>
  [...new Set(names.map(verbOf))].sort();

/**
 * Opens a request group's action overflow when this story gives it one, so the group's
 * actions are on screen before anything is asserted about them.
 *
 * A STEP, never an assertion: R4/UI-23 names an action overflow, while
 * `generated-docs/architecture.md` records the ⋯ menu as deliberately removed in favour of
 * direct controls (user-approved at a manual test). Every assertion that follows is
 * unconditional — the actions must be reachable — and this only makes them reachable
 * whichever of the two shapes the story lands on.
 */
const revealActions = async (page: Page, group: Locator): Promise<void> => {
  const overflow = group.locator(OVERFLOW_TRIGGER);
  if ((await overflow.count()) === 0) {
    return;
  }
  await overflow.click();
  await expect(page.getByRole('menu')).toBeVisible();
};

/**
 * One of a request's actions at narrow width, wherever it lives: directly on the group, or
 * as an item of the overflow `revealActions` has just opened. `.or()` is Playwright's own
 * locator combinator, not a query fallback — only one of the two shapes exists in any
 * given build, and the caller has already revealed it.
 */
const actionOn = (page: Page, group: Locator, name: RegExp): Locator =>
  group
    .getByRole('button', { name })
    .or(page.getByRole('menu').getByRole('menuitem', { name }));

/** A locator's painted box, or a failure saying it is not being drawn at all. */
const boxOf = async (
  locator: Locator,
  what: string,
): Promise<{ x: number; y: number; width: number; height: number }> => {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(
      `${what} has no painted box at ${String(PHONE_VIEWPORT.width)}px wide, so a reader cannot see it at all.`,
    );
  }
  return box;
};

/**
 * The gaps, in whole pixels, between each consecutive pair of request groups — the
 * measurement that tells a ruled listing (groups separated by a hairline rule, so they
 * touch) apart from the stack of Shadcn `Card`s this story replaces (each card standing
 * apart in its own box). Read from the browser's own layout, never from class names.
 */
const gapsBetween = async (groups: Locator): Promise<number[]> => {
  const edges = await groups.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    }),
  );
  return edges
    .slice(1)
    .map((edge, index) => Math.round(edge.top - edges[index].bottom));
};

/**
 * Whatever text the browser is painting largest on the whole screen right now, deduped.
 *
 * Elements are read for their OWN text (a text node of their own), so a wrapper does not
 * inherit its child's size, and anything the reader cannot see — display:none,
 * visibility:hidden, a screen-reader-only 1px box — is left out. This is the only honest
 * way to hold BR4 ("`AWAITING DECISION` is the single largest typographic element on the
 * screen") to account, and it takes in the header's app name too, which BR4 explicitly
 * covers.
 */
const largestTextsOn = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const painted: { text: string; fontSize: number }[] = [];

    for (const element of Array.from(document.body.querySelectorAll('*'))) {
      const ownText = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      if (ownText.length === 0) {
        continue;
      }

      const style = window.getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none') {
        continue;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) {
        continue;
      }

      painted.push({
        text: ownText,
        fontSize: Number.parseFloat(style.fontSize),
      });
    }

    const largest = painted.reduce(
      (biggest, item) => Math.max(biggest, item.fontSize),
      0,
    );
    return [
      ...new Set(
        painted
          .filter((item) => item.fontSize === largest)
          .map((item) => item.text),
      ),
    ].sort();
  });

/**
 * Every horizontally scrollable box inside the screen's content, described for a failure
 * message. A page whose own scroll width fits can still hide a sideways scroll INSIDE it —
 * a wide table in an `overflow-x-auto` wrapper — and R4 refuses that too (story
 * §Implementation notes: a table kept inside a sideways-scrolling wrapper does not satisfy
 * it).
 */
const sidewaysScrollingRegions = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const main = document.querySelector('main');
    if (main === null) {
      return ['there is no <main> on the page at all'];
    }
    return Array.from(main.querySelectorAll('*'))
      .filter((element) => {
        const overflowX = window.getComputedStyle(element).overflowX;
        return (
          (overflowX === 'auto' || overflowX === 'scroll') &&
          element.scrollWidth > element.clientWidth + 1
        );
      })
      .map(
        (element) =>
          `<${element.tagName.toLowerCase()}> holding "${(
            element.textContent ?? ''
          )
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 40)}"`,
      );
  });

/**
 * THE HARD FAIL of this story, in both its forms: the page itself must not scroll
 * sideways at 360px, and nothing inside it may scroll sideways in its place.
 */
const expectNothingScrollsSideways = async (
  page: Page,
  state: string,
): Promise<void> => {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
    clientWidth: document.documentElement.clientWidth,
  }));

  // One pixel of tolerance for sub-pixel layout rounding; anything more is real overflow.
  expect(
    scrollWidth,
    `${state}: the page is ${String(scrollWidth)}px wide inside a ${String(clientWidth)}px viewport, so it scrolls sideways — which R4 refuses outright`,
  ).toBeLessThanOrEqual(clientWidth + 1);

  expect(
    await sidewaysScrollingRegions(page),
    `${state}: something inside the screen scrolls sideways in the page's place, which R4 refuses just as flatly`,
  ).toEqual([]);
};

/**
 * Presses `key` until the control has keyboard focus. Throws (failing the test with a
 * plain-English reason) when the control cannot be reached — that throw IS the
 * keyboard-reachability assertion. The same helper epic 1 story 3,
 * `expense-request-list` story 4 and this epic's story 6 use.
 */
const pressUntilFocused = async (
  page: Page,
  key: string,
  control: Locator,
  maxPresses = 120,
): Promise<void> => {
  for (let press = 0; press <= maxPresses; press += 1) {
    const focused = await control.evaluate(
      (element) => element === document.activeElement,
    );
    if (focused) {
      return;
    }
    await page.keyboard.press(key);
  }
  throw new Error(
    `"${await nameOf(control)}" could not be reached with ${String(maxPresses)} ` +
      `"${key}" presses, so it cannot be operated by keyboard alone at ` +
      `${String(PHONE_VIEWPORT.width)}px (AC-3, R5).`,
  );
};

/** Real-browser axe scan of whatever state the page is in right now. */
const expectNoAccessibilityViolations = async (
  page: Page,
  state: string,
): Promise<void> => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_22_AA_TAGS)
    .analyze();

  expect(
    violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes.length} node/s)`,
    ),
    `WCAG 2.2 AA violations on the redesigned request list (${state})`,
  ).toEqual([]);
};

/**
 * Opens the request list as a signed-in Approver — the only role offered selection and the
 * decisions (R7/R27) — with the whole served set in the browser and every backend boundary
 * mocked. Returns the feed, so a test can move the service on.
 */
const openRequestListAsApprover = async (
  page: Page,
  context: BrowserContext,
  requests: TransactionRead[],
): Promise<RequestFeed> => {
  const feed = await serveRequests(page, requests);
  await mockBrowserIdentityCall(page, ROLE_APPROVER);
  await blockLiveBackends(page);
  await seedSession(context, ROLE_APPROVER);

  await page.goto(REQUESTS_PATH);
  return feed;
};

test.describe('Epic request-list-redesign, Story 8: the same listing on a phone', () => {
  // Rendered AT phone width from the first paint, the way a phone user receives it — not
  // resized after a desktop render, which can leave a layout a real phone would never have
  // produced. `hasTouch` is what makes AC-3's taps real taps rather than mouse clicks.
  test.use({ viewport: PHONE_VIEWPORT, hasTouch: true });

  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the identity it needs.
    await context.clearCookies();
  });

  // AC-1
  // The shape of the narrow listing, measured rather than described: every request is one
  // group carrying its reference and a couple of key values with its actions reachable,
  // the groups run together as one ruled sequence instead of standing apart as cards, and
  // nothing scrolls sideways at 360px.
  test('at phone width each request is one ruled line-group with its reference, key values and actions — not a card — and nothing scrolls sideways', async ({
    page,
    context,
  }) => {
    const [firstAwaiting] = awaitingDecisionIn(LISTED);

    // Fixture guards: without both kinds of request the composition below would be checked
    // against one state only.
    expect(
      awaitingDecisionIn(LISTED),
      'the served batch must hold a request still awaiting a decision, or the Approver-only controls below are never on screen',
    ).not.toHaveLength(0);
    expect(
      decidedIn(LISTED),
      'the served batch must hold an already-decided request too, or this criterion is checked against half the listing',
    ).not.toHaveLength(0);

    await openRequestListAsApprover(page, context, LISTED);

    // Every served request is presented, one group each — not a subset, and not one wide
    // table reflowed.
    const groups = requestGroups(page);
    await expect(groups.first()).toBeVisible();
    await expect(
      groups,
      `all ${String(LISTED.length)} served requests must be presented at phone width, one group each`,
    ).toHaveCount(LISTED.length);

    // The composition UI-23 asks for, on the awaiting request: its primary identifier
    // (the reference) plus key values a reader can act on without opening it.
    const group = requestGroup(page, firstAwaiting.Reference);
    await expect(group).toContainText(firstAwaiting.Reference);
    await expect(group).toContainText(statusOnScreen(firstAwaiting.Status));
    await expect(group).toContainText(amountOnScreen(firstAwaiting.Amount));
    await expect(
      group,
      'a group shows a whole account number — masking holds wherever requests are listed (POPIA, project.md §Compliance, brief R6)',
    ).not.toContainText(firstAwaiting.AccountNumber);

    // ...and its actions are on the group, reachable in one gesture (directly or from the
    // group's own overflow — see the header).
    await revealActions(page, group);
    await expect(
      actionOn(page, group, openRequestName(firstAwaiting.Reference)),
      'every request must offer the control that opens it at phone width too',
    ).toBeVisible();
    await expect(
      actionOn(page, group, approveRequestName(firstAwaiting.Reference)),
      'an Approver must still be offered the decision on a request awaiting one at phone width (R27)',
    ).toBeVisible();

    // THE ANTI-GOAL CHECK: the groups run together as one ruled sequence. A stack of cards
    // leaves a visible gutter between each pair; a hairline rule costs nothing at all.
    const gaps = await gapsBetween(groups);
    expect(
      gaps,
      'the gaps between consecutive request groups were not measured at all, so nothing here proves the listing is not a card stack',
    ).toHaveLength(LISTED.length - 1);
    expect(
      Math.max(...gaps),
      `consecutive requests are ${String(Math.max(...gaps))}px apart, so each is standing in a box of its own — at phone width the requests are one group of ruled lines separated by hairline rules, NOT the Shadcn Card-per-request stack this story replaces (design brief §4 anti-goals)`,
    ).toBeLessThanOrEqual(RULE_TOLERANCE_PX);

    await expectNothingScrollsSideways(
      page,
      'the request listing at phone width',
    );
  });

  // AC-2
  // The gutter's marks have to survive the squeeze, and the listing has to stay a listing.
  // Both halves are about what a reader is given: something big enough to see, lined up in
  // one column they can scan down, and one list item per request for anything reading the
  // page aloud.
  test('at phone width the marks stay readable and line up in one column, and each request is still one item in a list', async ({
    page,
    context,
  }) => {
    const decided = decidedIn(LISTED_WITH_DUPLICATES);

    // Fixture guards: the marks below only prove something if the served set really
    // carries them.
    expect(
      decided.length,
      'the served set must hold more than one already-decided request, or the marks cannot be checked for lining up in a column',
    ).toBeGreaterThan(1);
    expect(
      [
        DUPLICATE_FIRST.AccountNumber,
        DUPLICATE_FIRST.Amount,
        DUPLICATE_FIRST.TransactionDate,
      ],
      'the duplicate pair must share the duplicate key, or no exception mark is ever drawn',
    ).toEqual([
      DUPLICATE_SECOND.AccountNumber,
      DUPLICATE_SECOND.Amount,
      DUPLICATE_SECOND.TransactionDate,
    ]);

    await openRequestListAsApprover(page, context, LISTED_WITH_DUPLICATES);

    await expect(requestGroups(page)).toHaveCount(
      LISTED_WITH_DUPLICATES.length,
    );

    /* ---- 1. The decision marks: painted big enough to read, and in one column ---- */

    const markLeftEdges: number[] = [];
    for (const request of decided) {
      const group = requestGroup(page, request.Reference);
      const mark = group.getByText(statusOnScreen(request.Status));
      await expect(
        mark,
        `${request.Reference} is ${request.Status}, and its mark must still carry that wording at phone width — a glyph paired with a readable label (R26/BR3)`,
      ).toBeVisible();

      const box = await boxOf(
        mark,
        `${request.Reference}'s ${request.Status} mark`,
      );
      expect(
        Math.round(box.height),
        `${request.Reference}'s ${request.Status} mark is only ${String(Math.round(box.height))}px tall at phone width — the gutter's marks have to stay readable there, not shrink out of sight (AC-2)`,
      ).toBeGreaterThanOrEqual(MIN_LEGIBLE_PX);
      expect(
        [box.x >= 0, box.x + box.width <= PHONE_VIEWPORT.width + 1],
        `${request.Reference}'s ${request.Status} mark is drawn outside the ${String(PHONE_VIEWPORT.width)}px viewport (from ${String(Math.round(box.x))}px to ${String(Math.round(box.x + box.width))}px), so part of it cannot be read without scrolling sideways`,
      ).toEqual([true, true]);

      markLeftEdges.push(Math.round(box.x));
    }

    const leftmost = Math.min(...markLeftEdges);
    const rightmost = Math.max(...markLeftEdges);
    expect(
      rightmost - leftmost,
      `the decision marks start at different distances from the left (${markLeftEdges.map(String).join('px, ')}px), so there is no one narrow column to scan down — the whole point of the gutter (R15/BR5) is that the eye reads one column, not nine`,
    ).toBeLessThanOrEqual(COLUMN_TOLERANCE_PX);

    /* ---- 2. The exception mark: still there, still readable ---- */

    const duplicateMark = requestGroup(
      page,
      DUPLICATE_FIRST.Reference,
    ).getByText(POSSIBLE_DUPLICATE_MARK);
    await expect(
      duplicateMark,
      `${DUPLICATE_FIRST.Reference} repeats another request's account, amount and date, so it must still be marked as a possible duplicate at phone width (brief R18/BR3)`,
    ).toBeVisible();
    const duplicateBox = await boxOf(
      duplicateMark,
      'the possible-duplicate mark',
    );
    expect(
      Math.round(duplicateBox.height),
      'the possible-duplicate mark is too small to read at phone width',
    ).toBeGreaterThanOrEqual(MIN_LEGIBLE_PX);

    /* ---- 3. Still a list: one list, one item per request ---- */

    // Found by holding BOTH references, which only the listing itself can do — a list of
    // key values inside one request cannot, and neither can a nested one.
    const listing = screenOf(page)
      .getByRole('list')
      .filter({ hasText: DUPLICATE_FIRST.Reference })
      .filter({ hasText: DUPLICATE_SECOND.Reference });
    await expect(
      listing,
      'the requests must sit in ONE list at phone width — that is what tells a screen reader how many there are and where each begins',
    ).toHaveCount(1);
    await expect(
      listing.getByRole('listitem'),
      'exactly one list item per request — a second, nested list item inside a request would announce the listing as twice its length',
    ).toHaveCount(LISTED_WITH_DUPLICATES.length);
    for (const request of LISTED_WITH_DUPLICATES) {
      await expect(
        listing.getByRole('listitem').filter({ hasText: request.Reference }),
        `${request.Reference} must be announced as exactly one item of the listing`,
      ).toHaveCount(1);
    }
  });

  // AC-3
  // One journey per gesture, over two different requests, on the three things an Approver
  // came to do: open a request, tick it, and decide it.
  //
  // THE KEYBOARD JOURNEY GOES FIRST, deliberately: it walks forward with Tab from an
  // untouched page, so nothing it reaches depends on where an earlier pointer gesture
  // happened to leave the focus (and nothing depends on Tab wrapping round the end of the
  // document, which is unreliable). Then the same three things with real taps — a touch
  // gesture, not a mouse click at a small viewport.
  test('at phone width a request can be opened, ticked and decided by keyboard alone, and again by tapping', async ({
    page,
    context,
  }) => {
    const awaiting = awaitingDecisionIn(LISTED);
    const [typed, tapped] = awaiting;
    expect(
      awaiting.length,
      'the served batch must hold at least two requests awaiting a decision, so the keyboard journey and the tap journey each decide one of their own',
    ).toBeGreaterThan(1);

    const feed = await openRequestListAsApprover(page, context, LISTED);
    const approvedIds = new Set<number>();
    // Both decisions are answered the same way: the service records it, so a fresh read
    // (which is the only way this app learns a new status) now reports that request
    // approved. Applied AS the answer is given — never before it, or the decide flow's
    // re-read-before-submit guard would refuse the decision as already decided.
    await mockDecisionCalls(page, [
      {
        status: 200,
        body: approveSuccessResponse(typed.Id),
        andThen: () => {
          approvedIds.add(typed.Id);
          feed.show(
            LISTED.map((request) =>
              approvedIds.has(request.Id)
                ? transactionDecided(request, {
                    status: TRANSACTION_STATUS_APPROVED,
                  })
                : request,
            ),
          );
        },
      },
      {
        status: 200,
        body: approveSuccessResponse(tapped.Id),
        andThen: () => {
          approvedIds.add(tapped.Id);
          feed.show(
            LISTED.map((request) =>
              approvedIds.has(request.Id)
                ? transactionDecided(request, {
                    status: TRANSACTION_STATUS_APPROVED,
                  })
                : request,
            ),
          );
        },
      },
    ]);

    const panel = detailPanel(page);

    /* ---- 1. By keyboard alone: no tap, no click, from an untouched page ---- */

    const typedGroup = requestGroup(page, typed.Reference);
    await expect(typedGroup).toBeVisible();

    // The tick lives in the gutter, ahead of the request's values and its actions, so it is
    // the first of the three reached going forwards.
    const typedTick = selectionControl(page, typed.Reference);
    await pressUntilFocused(page, 'Tab', typedTick);
    await page.keyboard.press('Space');
    await expect(
      typedTick,
      `${typed.Reference} must answer the Space key at phone width — a mark that only answers a tap is not a real checkbox (R5)`,
    ).toBeChecked();

    // Opened with Enter, closed with Escape, which hands the keyboard back to the control
    // that opened it.
    const typedOpen = typedGroup.getByRole('button', {
      name: openRequestName(typed.Reference),
    });
    await pressUntilFocused(page, 'Tab', typedOpen);
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(typed.Reference);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();

    // The decisions sit before Open in the group's reading order, so this walks back to
    // them rather than relying on Tab wrapping round the end of the document.
    const typedApprove = typedGroup.getByRole('button', {
      name: approveRequestName(typed.Reference),
    });
    await pressUntilFocused(page, 'Shift+Tab', typedApprove);
    await page.keyboard.press('Enter');

    const typedConfirmation = confirmation(page);
    await expect(typedConfirmation).toBeVisible();
    // The confirmation opens with the keyboard on its dismissing choice (the decide flow's
    // own convention), so the confirming one is reached from there — still no pointer.
    const confirmChoice = typedConfirmation.getByRole('button', {
      name: APPROVE_CHOICE,
    });
    await pressUntilFocused(page, 'Tab', confirmChoice);
    await page.keyboard.press('Enter');
    await expect(typedConfirmation).toBeHidden();

    await expect(
      requestGroup(page, typed.Reference),
      `${typed.Reference} was approved with the keyboard alone, so the listing must report it ${TRANSACTION_STATUS_APPROVED} at phone width — every action on this screen is completable by keyboard (R5, WCAG 2.2 AA)`,
    ).toContainText(statusOnScreen(TRANSACTION_STATUS_APPROVED));

    /* ---- 2. By tapping, on a second request ---- */

    const tappedGroup = requestGroup(page, tapped.Reference);
    await expect(tappedGroup).toBeVisible();

    // Ticked by tapping the mark in the gutter — a two-character mark still has to be a
    // target a finger can hit (WCAG 2.2 AA target size).
    const tappedTick = selectionControl(page, tapped.Reference);
    await tappedTick.tap();
    await expect(
      tappedTick,
      `${tapped.Reference} must be selectable by tapping its mark in the gutter at phone width`,
    ).toBeChecked();

    // Opened by tapping its own control, and closed again by the panel's own Close.
    await revealActions(page, tappedGroup);
    await actionOn(page, tappedGroup, openRequestName(tapped.Reference)).tap();
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(tapped.Reference);
    await panel.getByRole('button', { name: CLOSE_PANEL }).tap();
    await expect(panel).toBeHidden();

    // ...and decided from its own group, through the confirmation the decide flow owns.
    await revealActions(page, tappedGroup);
    await actionOn(
      page,
      tappedGroup,
      approveRequestName(tapped.Reference),
    ).tap();
    const tappedConfirmation = confirmation(page);
    await expect(tappedConfirmation).toBeVisible();
    await tappedConfirmation
      .getByRole('button', { name: APPROVE_CHOICE })
      .tap();
    await expect(tappedConfirmation).toBeHidden();
    await expect(
      requestGroup(page, tapped.Reference),
      `${tapped.Reference} was approved by tapping, so the listing must report it ${TRANSACTION_STATUS_APPROVED} at phone width too`,
    ).toContainText(statusOnScreen(TRANSACTION_STATUS_APPROVED));

    await expectNothingScrollsSideways(
      page,
      'the request listing at phone width after deciding',
    );
  });

  // AC-4
  // The control block is where 360px hurts most: six labelled figures, one of them at
  // display scale, in the width of a phone. Two things have to survive — it still says
  // where the batch stands, and the outstanding count is still the largest thing on the
  // screen (BR4), which is measured from what the browser actually paints rather than
  // taken on trust.
  test('at phone width the control block still states where the batch stands, and the outstanding count is still the largest thing on the screen', async ({
    page,
    context,
  }) => {
    // Fixture guards, so the figures asserted below cannot quietly describe another set.
    // The figures themselves are stated literally (story 2 §Implementation notes) and are
    // never recomputed with the derivation under test.
    expect(
      LISTED,
      'the served batch must be the narrowing spread',
    ).toHaveLength(RECORDS_FIGURE);
    expect(awaitingDecisionIn(LISTED)).toHaveLength(AWAITING_DECISION_FIGURE);
    expect(decidedIn(LISTED)).toHaveLength(DECIDED_FIGURE);

    await openRequestListAsApprover(page, context, LISTED);
    await expect(requestGroups(page).first()).toBeVisible();

    const screen = screenOf(page);

    // Where the batch stands, label by label. Each label reads immediately before its own
    // figure (R11: labels over figures — see the header), and letter case is left to CSS.
    await expect(
      screen,
      'with no originating-file narrowing, BATCH reads ALL FILES — the whole-queue reading settled at the stories approval',
    ).toContainText(new RegExp(`batch\\D{0,4}${WHOLE_QUEUE_BATCH}`, 'i'));
    await expect(
      screen,
      'RUN DATE must still carry a date at phone width',
    ).toContainText(/run\s*date\D{0,4}\d/i);
    await expect(
      screen,
      `RECORDS must still read ${String(RECORDS_FIGURE)} at phone width`,
    ).toContainText(
      new RegExp(`records\\D{0,4}${String(RECORDS_FIGURE)}\\b`, 'i'),
    );
    await expect(
      screen,
      `AWAITING DECISION must still read ${String(AWAITING_DECISION_FIGURE)} at phone width — it is the figure the whole session exists to drive to zero`,
    ).toContainText(
      new RegExp(
        `awaiting\\s*decision\\D{0,4}${String(AWAITING_DECISION_FIGURE)}\\b`,
        'i',
      ),
    );
    await expect(
      screen,
      `DECIDED must still read ${String(DECIDED_FIGURE)} at phone width`,
    ).toContainText(
      new RegExp(`decided\\D{0,4}${String(DECIDED_FIGURE)}\\b`, 'i'),
    );
    await expect(
      screen,
      `TOTAL VALUE must still read ${TOTAL_VALUE_FIGURE} at phone width`,
    ).toContainText(
      new RegExp(
        `total\\s*value\\D{0,4}${TOTAL_VALUE_FIGURE.replace('.', '[.,]')}`,
        'i',
      ),
    );

    // BR4, measured: the biggest thing the browser is painting anywhere on the screen —
    // header and footer included — is the outstanding count itself. Nothing else may share
    // that size, which is what "no invented middle tier" (R16) comes to at this width.
    expect(
      await largestTextsOn(page),
      `the largest text painted on the screen at ${String(PHONE_VIEWPORT.width)}px must be the outstanding count (${String(AWAITING_DECISION_FIGURE)}) and nothing else — no heading, app name, column head or other figure may match it in scale (BR4/R11's focal moment)`,
    ).toEqual([String(AWAITING_DECISION_FIGURE)]);

    await expectNothingScrollsSideways(
      page,
      'the control block and listing at phone width',
    );
  });

  // Accessibility — the state this story introduces and no other spec in this epic can
  // reach: the whole redesigned screen at the 360px floor, with the control block's
  // saturated field, the gutter's marks at two-character width and a selection live in it.
  // A real browser, so the contrast of the reflowed control block, the painted size of the
  // gutter's tick (WCAG 2.2's target-size rule, which is exactly what a two-character mark
  // on a phone risks) and the focus handling around it are all actually seen — none of
  // which jsdom can see at all. No clock is installed — axe is never run under faked timers.
  test('the narrow listing has no accessibility violations, with and without a selection', async ({
    page,
    context,
  }) => {
    const [firstAwaiting] = awaitingDecisionIn(LISTED);
    expect(
      decidedIn(LISTED),
      'the served batch must include decided requests, or the desaturated groups and their decision marks are never scanned at this width',
    ).not.toHaveLength(0);

    await openRequestListAsApprover(page, context, LISTED);

    // Settle the screen first, so neither scan is racing a placeholder: every served
    // request is in the listing, and the gutter is offering its tick.
    await expect(requestGroups(page)).toHaveCount(LISTED.length);
    const tick = selectionControl(page, firstAwaiting.Reference);
    await expect(tick).toBeVisible();

    await expectNoAccessibilityViolations(
      page,
      'the whole redesigned screen at 360px, nothing selected',
    );

    await tick.check();
    await expect(tick).toBeChecked();

    await expectNoAccessibilityViolations(
      page,
      'at 360px with a request ticked in the gutter',
    );
  });

  // AC-5
  // The parity clause, and the one that catches a real regression: an action that is only
  // reachable on a wide screen. The wide listing is SWEPT for what it offers on a request
  // rather than checked against a hand-written list, so an action added later is covered
  // too; then the same request is read at phone width and every one of those actions has to
  // be reachable there — on the group or from the group's own overflow. The export, which
  // sits above the listing rather than on a request, is checked at both widths beside it.
  //
  // This test runs at desktop width first and then reloads at phone width, so both
  // presentations are the ones the app really renders for those widths.
  test.describe('nothing is reachable only on a wide screen', () => {
    test.use({ viewport: DESKTOP_VIEWPORT });

    test('every action the wide listing offers on a request is reachable at phone width, and so is the export', async ({
      page,
      context,
    }) => {
      const [subject] = awaitingDecisionIn(LISTED);

      await openRequestListAsApprover(page, context, LISTED);

      /* ---- 1. What the WIDE listing offers on this request ---- */

      const wideRow = requestRow(page, subject.Reference);
      await expect(wideRow).toBeVisible();
      const wideActions = actionsIn(await controlNamesIn(wideRow));

      // Guard: a sweep that found nothing, or that lost one of the actions the row has
      // always carried, would leave the parity check with nothing to prove.
      expect(
        wideActions,
        `the wide listing must offer an Approver ${ACTIONS_THE_WIDE_ROW_OFFERS.join(', ')} on a request awaiting a decision — without them this parity check proves nothing`,
      ).toEqual(expect.arrayContaining(ACTIONS_THE_WIDE_ROW_OFFERS));
      await expect(
        exportControl(page),
        'either role may export what is currently listed (brief R27), so the wide listing must offer it',
      ).toBeVisible();

      /* ---- 2. The same request, at phone width ---- */

      await page.setViewportSize(PHONE_VIEWPORT);
      await page.goto(REQUESTS_PATH);

      const group = requestGroup(page, subject.Reference);
      await expect(group).toBeVisible();
      await revealActions(page, group);

      const narrowActions = actionsIn([
        ...(await controlNamesIn(group)),
        // Whatever the group's own overflow holds, if this story gives it one — a menu
        // Radix portals out of the group.
        ...(await controlNamesIn(page.getByRole('menu'))),
      ]);

      const unreachable = wideActions.filter(
        (action) => !narrowActions.includes(action),
      );
      expect(
        unreachable,
        `these actions are offered on the wide listing but cannot be reached on a request at ${String(PHONE_VIEWPORT.width)}px: ${unreachable.join(', ')} — nothing may be reachable only on a wide screen (AC-5). What the narrow group offers: ${narrowActions.join(', ')}`,
      ).toEqual([]);

      await expect(
        exportControl(page),
        'the export must be reachable at phone width too — it is offered to both roles, and a narrow screen loses no capability (AC-5)',
      ).toBeVisible();

      await expectNothingScrollsSideways(
        page,
        'the request listing at phone width, checking parity',
      );
    });
  });
});
