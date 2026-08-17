/**
 * Story Metadata:
 * - Epic: request-list-redesign — Story 5: the listing itself, as a ruled batch
 *   listing
 * - Route: /requests
 * - Target File: web/src/components/requests/ExpenseRequestList.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-4 — account numbers in the listing still show only their last four digits,
 *   and opening a single request still reveals the whole number only by a
 *   deliberate action;
 * - AC-5 — every control a row offered still works (opening a request, the
 *   Approver's Approve and Reject, the possible-duplicate mark) and an Importer
 *   still sees no decision controls;
 * - AC-6 — loading, an empty batch, a failed load with its retry, and a narrowing
 *   that leaves nothing all still read clearly.
 *
 * AC-1 (full-bleed, hairline rules, no card or striped rows) and AC-2 (figures
 * right-aligned and column-perfect, mono references and accounts) are tagged
 * `none`: both are judged by eye, down a column, on a real screen — jsdom reports
 * every element at 0×0 and computes no layout, so a Vitest assertion about them
 * could only re-state a class name, which is exactly the anti-pattern this file
 * must not contain. AC-3 (every heading still orders both ways, and the order
 * survives paging) is this story's Playwright spec — `aria-sort` state through a
 * real navigation, deliberately not duplicated here (testing-policy.md § "One tag,
 * one layer").
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS — the safety net for a restyle of a 2,288-line component
 * ---------------------------------------------------------------------------
 * This story changes how `ExpenseRequestList` PRESENTS the desktop listing and
 * nothing about what it does (brief R1/BR1/BR2). The behaviour layer in
 * `web/src/lib/transactions/*` — narrowing, ordering, selecting, duplicates,
 * deciding, display — must be reused untouched, not rewritten: a rewrite is how a
 * combination rule changes silently while the screen still looks right.
 *
 * So the assertions below deliberately reach for the BEHAVIOUR LAYER's own
 * exports for their expected wording (`confirmationTitleFor`,
 * `confirmDecisionLabel`, `decideActionName`, `decisionRecordedMessage`,
 * `continueFromNoteName`, `POSSIBLE_DUPLICATE_MARK`, `NARROWED_EMPTY_MESSAGE`)
 * rather than re-typing those strings. A restyle that keeps that layer passes; a
 * reimplementation that invents its own wording fails, which is the point.
 *
 * The ONE exception is the account-number mask: its expected value is computed
 * here from the raw fixture (`lastFourOf`) and NOT taken from
 * `lib/transactions/display`, because importing the production helper would make
 * a POPIA assertion agree with whatever that helper does.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE UNIT IS THE EXISTING COMPONENT. `@/components/requests/ExpenseRequestList`,
 *    named export `ExpenseRequestList`, still a client component fed `roles` by the
 *    server page (`rolesOf(session)`), still exporting `NARROWED_EMPTY_MESSAGE`.
 *    No second list, no second route, no parallel "redesigned" component beside the
 *    old one.
 * 2. TABLE SEMANTICS STAY. The desktop listing remains a real `<table>` (the Shadcn
 *    `table` primitive, restyled — CLAUDE.md §1), with one `columnheader` per column
 *    and one cell per column in EVERY row. The assertions below read a value out of
 *    its own column by matching the column's heading and then taking the cell at
 *    that position, and they check that a row carries exactly as many cells as the
 *    header row carries headings. The two-character gutter (R15/BR5) is a column
 *    like any other: it needs its own header cell (screen-reader-only wording is
 *    fine) so the rows and the headings stay aligned. Losing `aria-sort`, `<th
 *    scope>` or the header row is an accessibility regression, not a restyle.
 * 3. MASKING HAS EXACTLY ONE HOME: `components/requests/MaskedAccountNumber.tsx`,
 *    reading `lib/transactions/display`. Reuse it in whatever the restyled row
 *    becomes — never inline a mask into a new cell, and never put the full value in
 *    a `title`, a `data-` attribute or any other corner of the DOM. Only the last
 *    four DIGITS may reach the browser on the listing path (project.md
 *    §Compliance).
 * 4. THE PER-REQUEST REVEAL STAYS WHERE IT IS: inside the opened request's panel
 *    (`RequestDetailPanel`), as a control naming what it does AND what it acts on
 *    ("Reveal account number"), as local state that dies with the panel. There is
 *    no reveal-anything control on the listing itself, and no reveal-all anywhere.
 * 5. EVERY PER-REQUEST CONTROL SURVIVES, UNDER ITS EXISTING NAME: Open ("Open
 *    request TXN-…"), and — for an Approver looking at a request still `Imported` —
 *    Approve and Reject (`decideActionName`), one activation away on the row
 *    itself, plus the same two inside the opened request. A role that may not
 *    decide is offered NOTHING (absent, never disabled): the queries below find
 *    disabled controls too.
 * 6. THE DECIDE FLOWS ARE UNCHANGED, step for step: Approve → confirmation
 *    (`alertdialog`, titled `confirmationTitleFor`, accepted by
 *    `confirmDecisionLabel`) → the call → the request re-read → the row reads its
 *    new status, its decide controls are withdrawn, and the app's one notification
 *    surface carries `decisionRecordedMessage`. Reject inserts the note step first
 *    (a `textbox` named for the note, continued by `continueFromNoteName`) and the
 *    note travels on the call.
 * 7. ALL FOUR STATES KEEP THEIR EXISTING SHAPE AND WORDING (AC-6): the tiered wait
 *    at its REAL durations (nothing under 300ms; an announceable `role="status"`
 *    saying it is loading from 300ms; a "still loading" line JOINING it past 3s —
 *    no test-only props and no shortened thresholds); the never-imported empty
 *    state with its one link to `UPLOAD_PATH`; the failed load as an `alert`
 *    carrying the SERVICE's own reason (never the client's placeholder) plus a Try
 *    again that re-reads; and the narrowed-empty state carrying
 *    `NARROWED_EMPTY_MESSAGE`, the applied-narrowing summary, an enabled Clear all,
 *    and NO upload action of any kind. With no card to sit inside, each of these
 *    needs deliberate composition — but not new wording.
 *
 * Mocked here, and why: only `@/lib/api/client` (the fixed convention,
 * testing-policy.md § Mocking strategy), plus `next/link` and `next/navigation` —
 * libraries at the client-navigation boundary with no App Router context in jsdom.
 * The toast composition is the real production code the root layout mounts. Every
 * response body comes from the project-wide factories in `@/mocks/data/*`, and the
 * roles come from the project-wide identity source (`userInfoFor`), so this file
 * and the Playwright layer cannot drift onto different data or different people.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, {
  PointerEventsCheckLevel,
} from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the list this story restyles, and the one sentence
// the screen already uses for a narrowing that hid everything.
import {
  ExpenseRequestList,
  NARROWED_EMPTY_MESSAGE,
} from '@/components/requests/ExpenseRequestList';

// Real production notification composition (not mocked): the same one the root
// layout wraps every signed-in screen in, and the only surface a recorded
// decision may announce itself through.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get, post } from '@/lib/api/client';
import { DECISION_APPROVE, DECISION_REJECT } from '@/lib/api/decisions';
import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';
// The upload screen's address from the one place that owns it, so both the empty
// state's action and the "no upload action here" assertion follow the real route.
import { UPLOAD_PATH } from '@/lib/auth/access-map';
import { rolesOf } from '@/lib/auth/roles';
// The behaviour layer this story must REUSE, not rewrite — its wording is what the
// assertions below expect to find on screen.
import {
  awaitsDecision,
  confirmDecisionLabel,
  confirmationTitleFor,
  continueFromNoteName,
  decideActionName,
  decisionRecordedMessage,
} from '@/lib/transactions/deciding';
import { POSSIBLE_DUPLICATE_MARK } from '@/lib/transactions/duplicates';
// The project-wide identity source both test layers share: the roles the screen
// gates on come from the same userinfo body Playwright signs in with.
import { userInfoFor } from '@/mocks/data/identity';
// Project-wide Transaction factories: the single source of truth for the wire
// shape, its canonical values and the body a failed read carries. Never
// hand-write a response body in a test.
import {
  REJECTION_NOTE,
  TRANSACTION_LIST_FAILURE_MESSAGE,
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_REJECTED,
  approveSuccessResponse,
  duplicatePair,
  manyTransactions,
  rejectSuccessResponse,
  transactionDecided,
  transactionListFailureResponse,
  transactionListResponse,
  transactionsForNarrowing,
  transactionsInEveryStatus,
} from '@/mocks/data/transaction';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/types/auth';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

import type { DecisionOutcome } from '@/lib/api/decisions';
import type { APIError } from '@/types/api';
import type { ProjectRole } from '@/types/auth';
import type {
  TransactionRead,
  TransactionReadList,
} from '@/types/transactions';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

/**
 * `next/link` stubbed with the plain anchor it renders in the browser, so the empty
 * state's action keeps its `link` role and its `href` without an App Router context
 * in jsdom. A library, never the code under test.
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

/** The other half of that boundary, for whatever the screen reads about the URL. */
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
const mockPost = post as unknown as ReturnType<typeof vi.fn>;

type User = ReturnType<typeof userEvent.setup>;

/* -------------------------------------------------------------------------- */
/* Who is signed in — from the project-wide identity source                    */
/* -------------------------------------------------------------------------- */

/**
 * The roles the server page hands the list (`rolesOf(session)`), derived from the
 * SAME userinfo bodies the Playwright layer signs in with rather than spelled out
 * here — so "as an Approver" means one thing across both layers.
 */
const APPROVER_ROLES: ProjectRole[] = rolesOf(userInfoFor(ROLE_APPROVER));
const IMPORTER_ROLES: ProjectRole[] = rolesOf(userInfoFor(ROLE_IMPORTER));

/* -------------------------------------------------------------------------- */
/* The fake transactions service                                               */
/* -------------------------------------------------------------------------- */

/** The one address this screen reads (`GET /v1/transactions`, no parameters). */
const TRANSACTIONS_PATH = '/v1/transactions';

/** The app's own decide route — never the transactions service directly. */
const DECIDE_ENDPOINT = /decision/i;

/**
 * A refused read carrying the SERVICE's own reason. The transactions service
 * reports a refusal as a 500 + `DefaultResponse`, so the shared client keeps its
 * own placeholder on `message` and the service's `Messages[]` on `details` — which
 * is why the failed-load state can only reach the user's eyes through
 * `serviceDetailOf`.
 */
const REFUSED_READ: APIError = {
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  endpoint: `/transactions-api${TRANSACTIONS_PATH}`,
  details: transactionListFailureResponse().Messages,
};

/**
 * One decide call, as the BROWSER made it: which request it was for, which
 * decision it named, and the note it carried.
 *
 * Read tolerantly (the id may travel in the body or as a query parameter, the
 * decision in the address or in a field) because the transport shape belongs to
 * `expense-decisions` story 1 and is asserted there. What matters here is that a
 * decision for THIS request, carrying THIS note, still leaves the browser after
 * the restyle.
 */
interface DecideCall {
  TransactionId: number | undefined;
  outcome: DecisionOutcome;
  UserNote?: string;
}

/** A POST body as a bag of fields, tolerating a call that sent none. */
const fieldsOf = (body: unknown): Record<string, unknown> =>
  typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)
    : {};

/** The request a decide call is for, from wherever the call named it. */
const transactionIdIn = (
  endpoint: string,
  fields: Record<string, unknown>,
): number | undefined => {
  const inBody = fields.TransactionId;
  if (typeof inBody === 'number') {
    return inBody;
  }
  if (typeof inBody === 'string' && inBody.trim() !== '') {
    return Number(inBody);
  }
  const query = endpoint.includes('?')
    ? endpoint.slice(endpoint.indexOf('?') + 1)
    : '';
  const inAddress = new URLSearchParams(query).get('TransactionId');
  return inAddress === null || inAddress.trim() === ''
    ? undefined
    : Number(inAddress);
};

/**
 * Which decision a call names — in its address or in a field of its own. Matched
 * at the START of a field's value so a NOTE that happens to mention a rejection
 * can never be mistaken for the decision itself.
 */
const outcomeOf = (
  endpoint: string,
  fields: Record<string, unknown>,
): DecisionOutcome =>
  /reject/i.test(endpoint) ||
  Object.values(fields).some(
    (value) => typeof value === 'string' && /^reject/i.test(value),
  )
    ? DECISION_REJECT
    : DECISION_APPROVE;

const decideCallFrom = (endpoint: string, body: unknown): DecideCall => {
  const fields = fieldsOf(body);
  const note = fields.UserNote;
  return {
    TransactionId: transactionIdIn(endpoint, fields),
    outcome: outcomeOf(endpoint, fields),
    ...(typeof note === 'string' ? { UserNote: note } : {}),
  };
};

/** What the service currently holds — every read is answered from this one value. */
let served: TransactionRead[] = [];

/** Set to refuse every read, which is how the failed-load state is reached. */
let readRefusal: APIError | null = null;

/** Every decide call that actually left the browser, in order. */
let decisionsSent: DecideCall[] = [];

/** Puts a set of requests behind `GET /v1/transactions`. */
const serve = (requests: TransactionRead[]): void => {
  served = requests;
};

/* -------------------------------------------------------------------------- */
/* Rendering, and reading the listing back                                     */
/* -------------------------------------------------------------------------- */

/**
 * `userEvent` for a screen with Radix dialogs on it: Radix parks
 * `pointer-events: none` on the body while a modal is open, and jsdom then reports
 * the dialog's own controls as un-clickable even though a real browser lets them
 * through.
 */
const setupUser = (): User =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderList = (roles: ProjectRole[]) =>
  render(
    <ToastProvider>
      <ExpenseRequestList roles={roles} />
      <ToastContainer />
    </ToastProvider>,
  );

/** The listing itself — still one `<table>` after the restyle (contract note 2). */
const requestsTable = (): HTMLElement => screen.getByRole('table');

/** An element's visible text, with runs of whitespace collapsed as the DOM shows it. */
const textOf = (element: HTMLElement): string =>
  (element.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Just the digits in a value, so a mask is judged by what it exposes. */
const digitsOf = (value: string): string => value.replace(/\D/g, '');

/** The only part of an account number this screen may ever show. */
const lastFourOf = (accountNumber: string): string =>
  digitsOf(accountNumber).slice(-4);

/** What a failed negative assertion should print: the offending control, named. */
const described = (element: HTMLElement): string =>
  `<${element.tagName.toLowerCase()}> "${textOf(element)}"`;

/** Two elements in the order the document holds them. */
const inDocumentOrder = (first: HTMLElement, second: HTMLElement): number =>
  (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !==
  0
    ? -1
    : 1;

/**
 * The table row for a named request, found by the reference the row carries
 * rather than by position — and required to be unique, so a widened match can
 * never quietly select the wrong request (testing-policy.md § anti-pattern 7).
 */
const rowFor = (reference: string): HTMLElement => {
  const rows = within(requestsTable())
    .getAllByRole('row')
    .filter((row) => row.textContent?.includes(reference));

  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one table row carrying "${reference}", found ` +
        `${String(rows.length)} — the listing renders one row per request, each ` +
        'identified by its Reference.',
    );
  }
  return rows[0];
};

/** Every row holding values, i.e. the listing without its heading row. */
const bodyRows = (): HTMLElement[] =>
  within(requestsTable())
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('cell').length > 0);

/**
 * A row's cells in document order, counting a `<th scope="row">` (role
 * `rowheader`) as the cell it is — so a gutter or reference column set as a row
 * header is read in its own position rather than dropped.
 */
const cellsOf = (row: HTMLElement): HTMLElement[] =>
  [
    ...within(row).queryAllByRole('cell'),
    ...within(row).queryAllByRole('rowheader'),
  ].sort(inDocumentOrder);

/** Which column a heading names, so a value can be read out of its own column. */
const columnIndexOf = (column: RegExp): number => {
  const headings = within(requestsTable()).getAllByRole('columnheader');
  const index = headings.findIndex((heading) => column.test(textOf(heading)));
  if (index === -1) {
    throw new Error(
      `No column heading matching ${String(column)}. The restyled listing keeps ` +
        'one heading per column (contract note 2). Headings found: ' +
        `${headings.map((heading) => `"${textOf(heading)}"`).join(', ')}.`,
    );
  }
  return index;
};

/**
 * One request's value in one column — and, on the way, the assertion that the row
 * carries a cell per heading. A restyle that adds the two-character gutter
 * (R15/BR5) without giving it a header cell would leave the rows one place out of
 * step with the headings, which is how a value ends up read from the wrong column.
 */
const cellIn = (row: HTMLElement, column: RegExp): HTMLElement => {
  const cells = cellsOf(row);
  const headings = within(requestsTable()).getAllByRole('columnheader');
  if (cells.length !== headings.length) {
    throw new Error(
      `This row carries ${String(cells.length)} cells against ` +
        `${String(headings.length)} column headings. Every row must carry one ` +
        'cell per column — including the reserved gutter column, which needs a ' +
        'header cell of its own (contract note 2).',
    );
  }
  return cells[columnIndexOf(column)];
};

const COLUMN = {
  reference: /reference/i,
  account: /account/i,
  status: /status/i,
} as const;

/* -------------------------------------------------------------------------- */
/* The controls a row and an opened request offer                              */
/* -------------------------------------------------------------------------- */

/**
 * The two decide actions, by the way they name themselves. The `\b` keeps the
 * STATUS VALUES out of the match: "Approved" and "Rejected" are text a request
 * carries, not something a control offers to do.
 */
const APPROVE_ACTION = /^approve\b/i;
const REJECT_ACTION = /^reject\b/i;
const DECIDE_ACTION = /^(approve|reject)\b/i;
const OPEN_ACTION = /^open\b/i;

/** The note step's own field (`REJECTION_NOTE_LABEL`, "Rejection note"). */
const NOTE_FIELD = /note/i;

/**
 * A control that would reveal an account number on the LISTING. Story
 * `expense-request-list` 5 put the only reveal inside the opened request; nothing
 * on the listing itself may offer one, wholesale or otherwise. Deliberately narrow
 * enough not to catch the sortable "Account number" column heading.
 */
const REVEALS_AN_ACCOUNT =
  /((reveal|unmask|show|full).*account)|(account.*(reveal|unmask|show|full))/i;

/** Every role a decide action could be offered under, disabled ones included. */
const CONTROL_ROLES = [
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
] as const;

/** Every activatable control in `surface` whose accessible name matches. */
const controlsNamed = (surface: HTMLElement, name: RegExp): HTMLElement[] =>
  CONTROL_ROLES.flatMap((role) =>
    within(surface).queryAllByRole(role, { name }),
  );

/** Opens one request's detail panel and hands back the panel itself. */
const openRequest = async (
  user: User,
  reference: string,
): Promise<HTMLElement> => {
  const control = await waitFor(() =>
    within(rowFor(reference)).getByRole('button', { name: OPEN_ACTION }),
  );
  await user.click(control);
  return await screen.findByRole('dialog');
};

/** Dismisses the open detail panel the way a keyboard user does. */
const closeOpenRequest = async (user: User): Promise<void> => {
  await user.keyboard('{Escape}');
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
};

/** One of a request's decide controls, on the row itself: one activation away. */
const decideControlOn = (
  reference: string,
  action: string | RegExp,
): HTMLElement =>
  within(rowFor(reference)).getByRole('button', { name: action });

/**
 * Accepts the open confirmation for a decision — the shared `alertdialog`, whose
 * title and confirming label both come from the behaviour layer.
 */
const acceptConfirmation = async (
  user: User,
  outcome: DecisionOutcome,
  reference: string,
): Promise<void> => {
  const confirmation = await screen.findByRole('alertdialog');
  expect(confirmation).toHaveTextContent(
    confirmationTitleFor(outcome, reference),
  );
  // Naming a request must not defeat the masking the listing applies (POPIA).
  await user.click(
    within(confirmation).getByRole('button', {
      name: confirmDecisionLabel(outcome),
    }),
  );
};

/* -------------------------------------------------------------------------- */
/* The four states (AC-6)                                                      */
/* -------------------------------------------------------------------------- */

/** Said past 3s, alongside (not instead of) the placeholder. */
const STILL_LOADING = /still loading/i;

/** The never-imported empty state — an answer, not a failure. */
const NOTHING_IMPORTED = /no expense requests have been imported yet/i;

/** The failed-load state's own heading. */
const FAILED_LOAD = /could not load the expense requests/i;

/** The one control that re-reads the list after a failure. */
const TRY_AGAIN = /try again/i;

/** The one reset on the screen, offered whenever anything is applied. */
const CLEAR_ALL = /clear all/i;

/** The region that names what is currently narrowing the list. */
const APPLIED_SUMMARY = /applied/i;

/** An accessible name that offers the upload action rather than naming a screen. */
const UPLOAD_ACTION_NAME = /(upload|submit|import)/i;

/** The free-text search field (`RequestNarrowingControls`). */
const SEARCH_FIELD = /search/i;

/** How many requests a page holds until somebody changes it (R2/UI-16). */
const DEFAULT_PAGE_SIZE = 20;

/** Room for the search debounce without an explicit wait. */
const SETTLED = { timeout: 2000 };

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

/** A promise the test resolves itself, so the in-flight state is observable. */
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/**
 * Moves the clock on and lets React settle what that changed.
 *
 * The tiered wait is a genuinely component-local timer with no browser flow of its
 * own, which is the one case fake timers are for (testing-policy.md §
 * Time-dependent behaviour). Only the timer APIs are faked — microtasks stay real,
 * so the in-flight read still resolves normally — and RTL's auto-advancing
 * `waitFor` / `findBy*` are deliberately avoided while the clock is frozen, since
 * they would step the clock themselves and walk straight over the 300ms and 3s
 * thresholds under test.
 */
const advanceClockBy = (ms: number): Promise<void> =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

/* -------------------------------------------------------------------------- */

/**
 * Every `GET /v1/transactions` answered from what the fake service currently
 * holds — a service rather than a fixed script, so a re-read after a decision or
 * a retry after a refusal behaves as the real one does.
 *
 * A named function because AC-6 has to replace it for the one moment it holds a
 * read IN FLIGHT, and must then put it back: a `mockReturnValue` left in place
 * would answer every later render with the same settled promise.
 */
const answerReadsFromTheService = (): void => {
  mockGet.mockImplementation(async (endpoint: string) => {
    const path = String(endpoint);
    if (!path.includes(TRANSACTIONS_PATH)) {
      throw new Error(
        `Unexpected read of "${path}" — this screen reads the one expense ` +
          'request list and nothing else; there is no per-request read.',
      );
    }
    if (readRefusal !== null) {
      throw readRefusal;
    }
    return transactionListResponse(served);
  });
};

describe('Epic request-list-redesign, Story 5: the listing itself, as a ruled batch listing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    served = [];
    readRefusal = null;
    decisionsSent = [];

    answerReadsFromTheService();

    mockPost.mockImplementation(async (endpoint: string, body?: unknown) => {
      const path = String(endpoint);
      if (!DECIDE_ENDPOINT.test(path)) {
        throw new Error(
          `Unexpected POST to "${path}" — a decision goes through the app's own ` +
            'decide route (lib/api/decisions.ts), never straight at the ' +
            'transactions service and never from a component.',
        );
      }
      const call = decideCallFrom(path, body);
      decisionsSent.push(call);
      served = served.map((request) =>
        request.Id === call.TransactionId
          ? transactionDecided(request, {
              status:
                call.outcome === DECISION_APPROVE
                  ? TRANSACTION_STATUS_APPROVED
                  : TRANSACTION_STATUS_REJECTED,
              note: call.UserNote,
            })
          : request,
      );
      // The generic envelope, which says nothing about the request's new status:
      // an outcome is learnt by re-reading the list, never by parsing this body.
      return call.outcome === DECISION_APPROVE
        ? approveSuccessResponse(call.TransactionId)
        : rejectSuccessResponse(call.TransactionId);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AC-4
  // POPIA (project.md §Compliance), not formatting: the full value must not be in
  // the page at all while the listing is on screen — masking it visually while
  // shipping it to the DOM would leak it to anyone reading the markup.
  it('shows only the last four digits of every account number in the restyled listing, offers no reveal there, and gives up a whole number only to the deliberate reveal inside one opened request', async () => {
    const user = setupUser();

    const requests: TransactionRead[] = transactionsForNarrowing();
    // Fixture preconditions: distinct last-four digits, and a spread of statuses —
    // a decided row desaturates under R20 and must stay masked exactly the same.
    expect(
      new Set(requests.map((request) => lastFourOf(request.AccountNumber)))
        .size,
    ).toBe(requests.length);
    expect(new Set(requests.map((request) => request.Status)).size).toBe(3);

    serve(requests);
    const listing = renderList(APPROVER_ROLES);
    await screen.findByRole('table');

    // --- the listing: four digits, and nothing else -------------------------
    const listingText = textOf(document.body);
    const listingDigits = digitsOf(listingText);
    requests.forEach((request) => {
      const shown = textOf(cellIn(rowFor(request.Reference), COLUMN.account));

      // The four digits the screen may show are the ONLY digits in the cell,
      // whatever mask shape carries them ("••••5567", "…5567", "Ending 5567").
      expect(digitsOf(shown)).toBe(lastFourOf(request.AccountNumber));

      // ...and the whole value is nowhere in the page, under any punctuation —
      // the page's own digits are compared, so re-grouping it cannot hide it.
      expect(listingText).not.toContain(request.AccountNumber);
      expect(listingDigits).not.toContain(digitsOf(request.AccountNumber));
    });

    // The listing offers no way to reveal an account number at all — wholesale or
    // one at a time. Disabled controls are found by these queries too.
    expect(
      [
        ...screen.queryAllByRole('button', { name: REVEALS_AN_ACCOUNT }),
        ...screen.queryAllByRole('checkbox', { name: REVEALS_AN_ACCOUNT }),
        ...screen.queryAllByRole('switch', { name: REVEALS_AN_ACCOUNT }),
        ...screen.queryAllByRole('link', { name: REVEALS_AN_ACCOUNT }),
      ].map(described),
    ).toEqual([]);

    // --- one opened request: masked until deliberately revealed --------------
    const [first] = requests;
    const second = requests[requests.length - 1];

    const firstDetail = await openRequest(user, first.Reference);
    expect(firstDetail).toHaveTextContent(lastFourOf(first.AccountNumber));
    expect(firstDetail).not.toHaveTextContent(first.AccountNumber);

    // The reveal control says what it acts on AND what it does — a bare icon, or
    // a name that does not mention the account number, fails here.
    const reveal = within(firstDetail).getByRole('button', {
      name: /account number/i,
    });
    expect(reveal).toHaveAccessibleName(/reveal|show/i);

    await user.click(reveal);
    expect(screen.getByRole('dialog')).toHaveTextContent(first.AccountNumber);

    // --- closing it takes the full number off the screen entirely ------------
    await closeOpenRequest(user);
    expect(document.body).not.toHaveTextContent(first.AccountNumber);

    // --- another request is masked, and carries no trace of the first --------
    const secondDetail = await openRequest(user, second.Reference);
    expect(secondDetail).toHaveTextContent(lastFourOf(second.AccountNumber));
    expect(secondDetail).not.toHaveTextContent(second.AccountNumber);
    expect(secondDetail).not.toHaveTextContent(first.AccountNumber);

    // --- and re-opening the first starts masked again: the reveal is
    // per-open-panel state, and does not outlive the panel it was made in.
    await closeOpenRequest(user);
    const reopenedFirst = await openRequest(user, first.Reference);
    expect(reopenedFirst).not.toHaveTextContent(first.AccountNumber);
    expect(reopenedFirst).toHaveTextContent(lastFourOf(first.AccountNumber));
    await closeOpenRequest(user);

    listing.unmount();

    // --- and it holds at the density the redesign is judged at: a full default
    // page of rows, every one of them masked, none of them a full number.
    const wholePage: TransactionRead[] = manyTransactions(25);
    serve(wholePage);
    renderList(APPROVER_ROLES);
    await screen.findByRole('table');

    const rows = bodyRows();
    expect(rows.length).toBe(DEFAULT_PAGE_SIZE);
    const wholePageDigits = digitsOf(textOf(document.body));
    rows.forEach((row) => {
      const reference = textOf(cellIn(row, COLUMN.reference));
      const request = wholePage.find(
        (candidate) => candidate.Reference === reference,
      );
      if (request === undefined) {
        throw new Error(
          `A row carries the reference "${reference}", which is not one of the ` +
            'requests the service served — the reference column must print the ' +
            "request's own Reference.",
        );
      }
      expect(digitsOf(textOf(cellIn(row, COLUMN.account)))).toBe(
        lastFourOf(request.AccountNumber),
      );
      expect(wholePageDigits).not.toContain(digitsOf(request.AccountNumber));
    });
  });

  // AC-5
  it('keeps every control a row offered working — Open, the Approver’s Approve and Reject with their existing steps, and the possible-duplicate mark — and offers an Importer no decision anywhere', async () => {
    const user = setupUser();

    // Two requests that repeat one another on the duplicate key, plus one request
    // per status — so the same set exercises the mark, the decisions and the
    // already-decided rows that must offer none.
    const [duplicateA, duplicateB] = duplicatePair();
    const byStatus: TransactionRead[] = transactionsInEveryStatus();
    const pristine: TransactionRead[] = [duplicateA, duplicateB, ...byStatus];

    const awaiting = byStatus.filter(awaitsDecision);
    const approved = byStatus.find(
      (request) => request.Status === TRANSACTION_STATUS_APPROVED,
    );
    const rejected = byStatus.find(
      (request) => request.Status === TRANSACTION_STATUS_REJECTED,
    );
    if (
      awaiting.length !== 1 ||
      approved === undefined ||
      rejected === undefined
    ) {
      throw new Error(
        'Fixture precondition failed: transactionsInEveryStatus() must supply ' +
          'exactly one request awaiting a decision, one approved and one ' +
          'rejected (see @/mocks/data/transaction).',
      );
    }
    const [undecided] = awaiting;
    expect(awaitsDecision(duplicateA)).toBe(true);

    serve(pristine);
    const approverView = renderList(APPROVER_ROLES);
    await screen.findByRole('table');

    // --- the possible-duplicate mark, read in the row itself ----------------
    expect(rowFor(duplicateA.Reference)).toHaveTextContent(
      POSSIBLE_DUPLICATE_MARK,
    );
    expect(rowFor(duplicateB.Reference)).toHaveTextContent(
      POSSIBLE_DUPLICATE_MARK,
    );
    byStatus.forEach((request) => {
      expect(rowFor(request.Reference)).not.toHaveTextContent(
        POSSIBLE_DUPLICATE_MARK,
      );
    });

    // --- Open still opens the request it names ------------------------------
    const approvedDetail = await openRequest(user, approved.Reference);
    expect(approvedDetail).toHaveAccessibleName(new RegExp(approved.Reference));
    // A request somebody has already decided offers neither decision, in the row
    // or in the panel — absent, never disabled.
    expect(controlsNamed(approvedDetail, DECIDE_ACTION).map(described)).toEqual(
      [],
    );
    await closeOpenRequest(user);

    [approved, rejected].forEach((request) => {
      expect(
        controlsNamed(rowFor(request.Reference), DECIDE_ACTION).map(described),
      ).toEqual([]);
    });

    // --- an Approver is offered both decisions, on the row and in the panel --
    // Each names the request it decides — with an Approve on every listed row, a
    // bare "Approve" would leave a screen-reader user with identical controls.
    expect(
      decideControlOn(
        undecided.Reference,
        decideActionName(DECISION_APPROVE, undecided.Reference),
      ),
    ).toBeVisible();
    expect(
      decideControlOn(
        undecided.Reference,
        decideActionName(DECISION_REJECT, undecided.Reference),
      ),
    ).toBeVisible();

    const undecidedDetail = await openRequest(user, undecided.Reference);
    expect(
      within(undecidedDetail).getByRole('button', {
        name: decideActionName(DECISION_APPROVE, undecided.Reference),
      }),
    ).toBeVisible();
    expect(
      within(undecidedDetail).getByRole('button', {
        name: decideActionName(DECISION_REJECT, undecided.Reference),
      }),
    ).toBeVisible();
    await closeOpenRequest(user);

    // --- Approve still records an approval, end to end ----------------------
    await user.click(decideControlOn(undecided.Reference, APPROVE_ACTION));
    await acceptConfirmation(user, DECISION_APPROVE, undecided.Reference);

    expect(decisionsSent).toContainEqual({
      TransactionId: undecided.Id,
      outcome: DECISION_APPROVE,
    });
    await waitFor(() => {
      expect(rowFor(undecided.Reference)).toHaveTextContent(
        TRANSACTION_STATUS_APPROVED,
      );
    });
    expect(rowFor(undecided.Reference)).not.toHaveTextContent(
      TRANSACTION_STATUS_IMPORTED,
    );
    expect(
      controlsNamed(rowFor(undecided.Reference), DECIDE_ACTION).map(described),
    ).toEqual([]);

    const notifications = await screen.findByRole('region', {
      name: /notifications/i,
    });
    expect(notifications).toHaveTextContent(
      decisionRecordedMessage(DECISION_APPROVE, undecided.Reference),
    );

    // --- Reject still asks for its note first, then records it --------------
    await user.click(decideControlOn(duplicateA.Reference, REJECT_ACTION));
    const noteField = await screen.findByRole('textbox', { name: NOTE_FIELD });
    await user.type(noteField, REJECTION_NOTE);
    await user.click(
      screen.getByRole('button', {
        name: continueFromNoteName(duplicateA.Reference),
      }),
    );
    await acceptConfirmation(user, DECISION_REJECT, duplicateA.Reference);

    expect(decisionsSent).toContainEqual({
      TransactionId: duplicateA.Id,
      outcome: DECISION_REJECT,
      UserNote: REJECTION_NOTE,
    });
    await waitFor(() => {
      expect(rowFor(duplicateA.Reference)).toHaveTextContent(
        TRANSACTION_STATUS_REJECTED,
      );
    });
    expect(
      controlsNamed(rowFor(duplicateA.Reference), DECIDE_ACTION).map(described),
    ).toEqual([]);

    approverView.unmount();

    // --- the Importer: the same listing, and no decision anywhere on it -----
    serve([duplicateA, duplicateB, ...transactionsInEveryStatus()]);
    renderList(IMPORTER_ROLES);
    await screen.findByRole('table');

    pristine.forEach((request) => {
      expect(
        controlsNamed(rowFor(request.Reference), DECIDE_ACTION).map(described),
      ).toEqual([]);
    });
    // Not in a row, not in a toolbar, not greyed out somewhere out of the way.
    expect(controlsNamed(document.body, DECIDE_ACTION).map(described)).toEqual(
      [],
    );

    // ...and nor inside an opened request, which is where a per-request decision
    // would look most natural. Open itself still works for this role.
    const importerDetail = await openRequest(user, undecided.Reference);
    expect(importerDetail).toHaveAccessibleName(
      new RegExp(undecided.Reference),
    );
    expect(controlsNamed(importerDetail, DECIDE_ACTION).map(described)).toEqual(
      [],
    );
    await closeOpenRequest(user);

    // The mark is a reading of the batch, not a permission: an Importer sees it.
    expect(rowFor(duplicateA.Reference)).toHaveTextContent(
      POSSIBLE_DUPLICATE_MARK,
    );
    expect(rowFor(duplicateB.Reference)).toHaveTextContent(
      POSSIBLE_DUPLICATE_MARK,
    );
  });

  // AC-6
  it('still reads clearly in each of the four states: the tiered wait, an empty batch, a failed load with a working retry, and a narrowing that leaves nothing', async () => {
    // --- the wait, at its real durations ------------------------------------
    // Only the timer APIs are faked; microtasks stay real, so the read below
    // still resolves when the test resolves it.
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
      ],
    });

    const inFlight = createDeferred<TransactionReadList>();
    mockGet.mockReturnValue(inFlight.promise);

    const waiting = renderList(APPROVER_ROLES);

    // Under 300ms a wait is not worth mentioning: nothing stands in for the list.
    await advanceClockBy(299);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    // From 300ms an announceable placeholder stands in for the pending rows — a
    // bare skeleton shape says nothing to a screen reader (WCAG 2.2 AA).
    await advanceClockBy(1);
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    expect(screen.queryByText(STILL_LOADING)).not.toBeInTheDocument();

    // Up to 3s that placeholder alone is still the whole answer...
    await advanceClockBy(3000 - 300 - 1);
    expect(screen.queryByText(STILL_LOADING)).not.toBeInTheDocument();

    // ...and past 3s the message JOINS it rather than replacing it.
    await advanceClockBy(1);
    expect(screen.getByText(STILL_LOADING)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();

    // The answer arrives: both give way to the listing itself.
    const arriving: TransactionRead[] = transactionsForNarrowing();
    await act(async () => {
      inFlight.resolve(transactionListResponse(arriving));
    });
    expect(
      within(requestsTable()).getByText(arriving[0].Reference),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(STILL_LOADING)).not.toBeInTheDocument();

    waiting.unmount();
    vi.useRealTimers();
    // Back to the service for the three states below (see
    // `answerReadsFromTheService`).
    answerReadsFromTheService();

    const user = setupUser();

    // --- an empty batch: an answer, not a failure and not a wait ------------
    serve([]);
    const emptyBatch = renderList(APPROVER_ROLES);

    expect(await screen.findByText(NOTHING_IMPORTED)).toBeVisible();
    const uploadActions = screen
      .queryAllByRole('link')
      .filter((link) => link.getAttribute('href') === UPLOAD_PATH);
    expect(uploadActions.map(described)).toHaveLength(1);
    expect(uploadActions[0]).toHaveAccessibleName(UPLOAD_ACTION_NAME);

    // Nothing imported is not a failure, not a wait, and not a table of nothing.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    emptyBatch.unmount();

    // --- a failed load: the service's own reason, and a retry that works ----
    const requests: TransactionRead[] = transactionsForNarrowing();
    serve(requests);
    readRefusal = REFUSED_READ;
    renderList(APPROVER_ROLES);

    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent(FAILED_LOAD);
    // The SERVICE's own wording reaches the user...
    expect(failure).toHaveTextContent(TRANSACTION_LIST_FAILURE_MESSAGE);
    // ...and the client's own placeholder never does (project.md NFR-base-5).
    expect(
      screen.queryByText(CLIENT_FALLBACK_MESSAGES.serverError),
    ).not.toBeInTheDocument();
    // A failed read is not an empty batch and not a narrowing that hid things.
    expect(screen.queryByText(NOTHING_IMPORTED)).not.toBeInTheDocument();
    expect(screen.queryByText(NARROWED_EMPTY_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    // The way out is the retry, and it really re-reads the list.
    readRefusal = null;
    await user.click(within(failure).getByRole('button', { name: TRY_AGAIN }));

    await screen.findByRole('table');
    expect(bodyRows().length).toBe(requests.length);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // --- a narrowing that leaves nothing -----------------------------------
    // A FULL, unmasked account number matches nothing: only the visible last four
    // digits are searchable, so the emptiness here is itself a POPIA assertion.
    await user.type(
      screen.getByLabelText(SEARCH_FIELD),
      requests[0].AccountNumber,
    );

    await waitFor(() => {
      expect(screen.getByText(NARROWED_EMPTY_MESSAGE)).toBeVisible();
    }, SETTLED);
    requests.forEach((request) => {
      expect(screen.queryByText(request.Reference)).not.toBeInTheDocument();
    });

    // It names what is applied, and offers the one-go way back...
    const summary = screen.getByRole('region', { name: APPLIED_SUMMARY });
    expect(summary).toHaveTextContent(requests[0].AccountNumber);
    expect(within(summary).getAllByRole('listitem').length).toBe(1);
    const clearAll = screen.getByRole('button', { name: CLEAR_ALL });
    expect(clearAll).toBeEnabled();

    // ...and it is NOT the never-imported state: offering "upload a file" to
    // someone whose own narrowing hid their requests is the failure mode R10/R18
    // exists to prevent.
    expect(screen.queryByText(NOTHING_IMPORTED)).not.toBeInTheDocument();
    expect(
      screen
        .queryAllByRole('link')
        .filter((link) =>
          (link.getAttribute('href') ?? '').includes(UPLOAD_PATH),
        )
        .map(described),
    ).toEqual([]);
    expect(
      controlsNamed(document.body, /^(upload|submit an expense)/i).map(
        described,
      ),
    ).toEqual([]);

    // Clearing it brings the whole batch back.
    await user.click(clearAll);
    await waitFor(() => {
      expect(bodyRows().length).toBe(requests.length);
    }, SETTLED);
    expect(screen.queryByText(NARROWED_EMPTY_MESSAGE)).not.toBeInTheDocument();
  });
});
