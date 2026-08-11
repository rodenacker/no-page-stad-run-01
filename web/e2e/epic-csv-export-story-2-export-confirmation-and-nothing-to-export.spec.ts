/**
 * Story Metadata:
 * - Epic: csv-export — Export requests for the payment system
 * - Story: 2 — Know what you exported, and be told when there is nothing to export
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R4, BR1, BR2
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-3 (changing a filter and exporting AGAIN produces a file matching the NEW
 *   narrowing, with a confirmation naming the NEW count) and AC-4 (the export is
 *   reachable and activatable by KEYBOARD alone, and its confirmation is perceivable
 *   without a mouse) → this file. Both need a real browser: AC-3 because only a
 *   browser can hand over an actual file and let its bytes be read back, AC-4 because
 *   a real tab order, a real focus indicator and a real live region cannot be
 *   evidenced in jsdom.
 * - AC-1 (the confirmation names the count, the signed-in person and the time) and
 *   AC-2 (a narrowing that matches nothing keeps the action present and produces no
 *   file) are the Vitest layer's, at `web/src/__tests__/integration/
 *   epic-csv-export-story-2-export-confirmation-and-nothing-to-export.test.tsx`.
 *   Deliberately NOT duplicated here (testing-policy.md § "one tag, one layer").
 * - Story 1 of this epic already owns: both roles being offered the action, the nine
 *   RPT-01 columns, the ordered-and-narrowed contents (including the paging trap) and
 *   the file NAME's shape. Nothing here re-asserts any of that — this spec is about
 *   the CONFIRMATION tracking the narrowing, and about reaching the control without a
 *   mouse.
 *
 * WHY AC-3 EXPORTS TWICE. "The confirmation names a count" passes trivially for an
 * implementation that counts the wrong set: the whole fetched set (breaking BR1), or
 * a count captured on the previous export and never recomputed. Both produce a
 * perfectly plausible-looking notification. So the journey below narrows, exports,
 * changes the narrowing, and exports again — and each export's FILE is read back and
 * matched to the narrowing that was active when it was asked for, while the
 * confirmation must name that same, changed number. A stale count and the unfiltered
 * total are each asserted against by name.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * This spec never contacts a live backend and never uses a real credential
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both real services as running on this machine. Two boundaries,
 * one contract — both established by earlier epics and reused here rather than
 * rebuilt:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started by `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. `/requests` is
 *    gated SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` below, for this screen's single transactions
 *    read (`GET /transactions-api/v1/transactions`) and for the identity call in case
 *    a client component reads it — plus a hard block on the real services' own
 *    origins (:4424 / :4423) registered LAST, so a call addressed at a live service is
 *    aborted and fails visibly instead of being quietly answered by the
 *    origin-agnostic mocks above it.
 *
 * Every response body comes from the project-wide factories under
 * `web/src/mocks/data/` (`userInfoFor(role)`, `transactionListResponse()`,
 * `transactionsForNarrowing()`, `transactionsInEveryStatus()`) — no response shape and
 * no canonical value is authored in this file, so this spec and the Vitest layer
 * cannot drift on the contract. `GET /v1/transactions` takes no query parameters and
 * answers `{ Transactions: [...] }`; every count this spec expects is DERIVED from the
 * served fixture, never written down as a literal.
 *
 * Sign-in is faked with the mock `session` cookie the stub recognises for a role,
 * seeded via `context.addCookies()` rather than by driving the sign-in form (epic 1
 * story 2's spec owns that journey; the cookie is the app's sole conveyance of
 * session). Cookies ignore port, so one seed serves the dev server (:3000) and the
 * epic-end production run (:3100). `Secure` is omitted because the E2E server is plain
 * http on localhost. Both roles may export (R3) and neither criterion here is
 * role-specific, so both tests sign in as the Importer — the auth service's own name
 * for the requirements' Finance Uploader. Role reachability is story 1's AC-1.
 *
 * ---------------------------------------------------------------------------
 * Implementation patterns this spec assumes — READ BEFORE IMPLEMENTING
 * ---------------------------------------------------------------------------
 * - The list is read FROM THE BROWSER through the shared API client at the app's own
 *   same-origin `/transactions-api/...` address, and the CSV is built in the browser
 *   from that already-fetched set (brief §Data Model — there is no export endpoint).
 *   `page.route()` cannot intercept a read issued by the Next.js server or a Server
 *   Action, so a server-side read bypasses these mocks and leaves for the real service.
 * - THE FILE IS DELIVERED THROUGH `deliverFile` (`web/src/lib/files/deliverFile.ts`) —
 *   a Blob handed to a hidden anchor carrying a `download` name. That is what makes
 *   `page.waitForEvent('download')` observe it. A navigation, or an `<a href>` at an
 *   endpoint, would not satisfy these tests.
 * - THE EXPORT CONTROL is a `button` with visible wording containing "export", inside
 *   `main`, present and enabled for both roles with no role check (story
 *   §Implementation notes). It is matched on that word, not on exact copy. Being a
 *   real `button` is also what makes it Tab-reachable and Enter-activatable in AC-4;
 *   a `div` with a click handler fails that test by design.
 * - THE CONFIRMATION goes through the app's ONE notification surface — `useToast()` /
 *   the root layout's `ToastContainer`, which renders a single `role="region"` named
 *   "Notifications" whose notifications carry `aria-live` and `role="status"` (or
 *   `alert` for the error variant). No second notification mechanism and no bespoke
 *   banner inside the list; AC-4 asserts the confirmation is INSIDE that live region,
 *   which is what makes it announced rather than merely present in the DOM.
 * - THE CONFIRMATION'S COUNT is written as the number immediately before the words it
 *   counts — "5 expense requests" / "5 requests" (see {@link namesCount}). The
 *   assertions below match that shape rather than exact copy, so the wording is still
 *   the implementer's; what is pinned is that the NUMBER OF REQUESTS EXPORTED is
 *   stated, and that it is the count of the current narrowing rather than the
 *   unfiltered total. A confirmation phrased "2 of 8 requests" would fail here, and
 *   deliberately: the export produced 2, and naming the 8 it did not export invites
 *   exactly the misreading BR1 exists to prevent.
 * - THE NARROWING CONTROLS are the `expense-request-list` epic's, addressed with the
 *   same label patterns its own specs use: the pick-one filters are Shadcn `select`s
 *   whose accessible names contain "status", "file" and "type", and their choices are
 *   named by the service's own values (`Imported` / `Approved` / `Rejected`).
 * - The screen lives inside epic 1's signed-in shell, so its content is within `main`
 *   and every page query here is scoped to it. The notification region is deliberately
 *   NOT scoped to `main` (the container is fixed-position, mounted by the root layout)
 *   and is addressed by its own accessible name rather than by `getByRole('alert')` —
 *   Next renders a permanently empty body-level `role="alert"` route announcer, so an
 *   unscoped alert query always matches two elements.
 *
 * TIMING — nothing here waits real time. Every assertion is web-first, and the two
 * exports in AC-3 are asserted by POSITIVE match on the new count, so a first
 * notification that has not yet auto-dismissed cannot make the second assertion pass
 * or fail by accident. No `waitForTimeout`, and no test-only duration in production
 * code.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — the export raises
 * no confirmation yet.
 * ---------------------------------------------------------------------------
 */
import { readFile } from 'node:fs/promises';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  transactionListResponse,
  transactionsForNarrowing,
  transactionsInEveryStatus,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Download, Locator, Page } from '@playwright/test';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** This story's screen — the shared expense request list. */
const REQUESTS_PATH = '/requests';

/**
 * The one transactions read this screen makes, as the BROWSER addresses it: the app's
 * own `/transactions-api/*` mount point (`web/src/lib/utils/constants.ts`), never the
 * service's origin. No origin in the glob, so it matches whichever port the app is
 * served on (:3000 in dev, :3100 in the epic-end production run).
 */
const TRANSACTIONS_URL_GLOB = '**/transactions-api/v1/transactions**';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/** The control that produces the file, matched on the word that names what it does. */
const EXPORT_ACTION = /export/i;

/** The status filter, as the request-list epic's own specs address it. */
const STATUS_FILTER = /status/i;

/**
 * WCAG 2.2 AA — this project's effective accessibility bar
 * (`documentation/requirements-application.md` §6.6.5, recorded in project.md
 * §Baseline NFRs as superseding the template's 2.1 AA floor). The identical tag set
 * the earlier epics' scans used. Scoped explicitly because axe's defaults also run
 * best-practice rules, which would fail this spec on issues outside the agreed bar.
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
 * How the confirmation is required to state HOW MANY requests it exported: the number
 * immediately before the words it counts ("5 expense requests", "5 requests").
 *
 * Anchored that tightly on purpose. The confirmation also carries the time it was
 * produced (AC-1), and a time of day is full of digits — a looser "the number appears
 * somewhere in the notification" check would happily match `14:02` and pass for a
 * confirmation naming the wrong count entirely. Requiring the number to sit against
 * the word "request" is what makes the count assertion mean the count.
 */
const namesCount = (count: number): RegExp =>
  new RegExp(`\\b${String(count)}\\b\\s+(?:expense\\s+)?requests?\\b`, 'i');

/* -------------------------------------------------------------------------- */
/* AC-3's two narrowings, derived from the shared fixture.                     */
/* -------------------------------------------------------------------------- */

/**
 * The whole fetched set for AC-3 — the shared narrowing spread (three statuses, three
 * originating files, no two rows sharing the duplicate key). Every count and every
 * reference expected below is derived from it, so this spec cannot disagree with the
 * Vitest layer about what the service served.
 */
const SERVED = transactionsForNarrowing();

/** The two statuses the journey narrows by, in the order it applies them. */
const FIRST_STATUS = TRANSACTION_STATUS_IMPORTED;
const SECOND_STATUS = TRANSACTION_STATUS_APPROVED;

const inStatus = (status: string): TransactionRead[] =>
  SERVED.filter((request) => request.Status === status);

const FIRST_NARROWING = inStatus(FIRST_STATUS);
const SECOND_NARROWING = inStatus(SECOND_STATUS);

/** Everything the narrowing removed — what must be in neither file. */
const outsideOf = (narrowing: TransactionRead[]): TransactionRead[] =>
  SERVED.filter((request) => !narrowing.includes(request));

/**
 * The journey only proves anything if the three counts involved are DIFFERENT: a
 * stale count would be indistinguishable from the new one if the two narrowings held
 * the same number of requests, and "not the unfiltered total" would be
 * unassertable if either narrowing happened to be the whole set. Both narrowings hold
 * at least two requests as well, so neither confirmation is a singular-wording edge
 * case. Stated as a loud failure rather than a silent pass.
 */
if (
  FIRST_NARROWING.length < 2 ||
  SECOND_NARROWING.length < 2 ||
  new Set([FIRST_NARROWING.length, SECOND_NARROWING.length, SERVED.length])
    .size !== 3
) {
  throw new Error(
    'AC-3 needs two status narrowings of at least two requests each, whose counts ' +
      'differ from each other and from the whole served set (currently ' +
      `${FIRST_STATUS}: ${String(FIRST_NARROWING.length)}, ${SECOND_STATUS}: ` +
      `${String(SECOND_NARROWING.length)}, served: ${String(SERVED.length)}). ` +
      'transactionsForNarrowing() in web/src/mocks/data/transaction.ts no longer ' +
      'gives that — choose different statuses rather than authoring rows here.',
  );
}

/**
 * The two files are read back a LINE per request, which only holds while no free-text
 * value carries a comma, a quotation mark or a line break. Correct escaping of those
 * is story 1's AC-4 (Vitest), and this fixture deliberately carries none of them — so
 * a fixture that gained one must fail here with the reason rather than as a confusing
 * off-by-one in a row count.
 */
const HOSTILE_CSV_CHARACTERS = /[",\r\n]/;
if (
  SERVED.some((request) =>
    [request.Description, request.UserNote ?? ''].some((text) =>
      HOSTILE_CSV_CHARACTERS.test(text),
    ),
  )
) {
  throw new Error(
    'transactionsForNarrowing() now carries a comma, a quotation mark or a line ' +
      'break in free text, so a CSV record may span several lines and the row counts ' +
      'below no longer hold. Use a fixture without them (escaping itself is story 1 ' +
      "AC-4's, in the Vitest layer).",
  );
}

/* -------------------------------------------------------------------------- */
/* Mock plumbing (the two boundaries described in the header).                 */
/* -------------------------------------------------------------------------- */

/** A mocked JSON response, built from a project-wide factory body. */
const jsonResponse = (
  body: unknown,
): { status: number; contentType: string; body: string } => ({
  status: 200,
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
 * Answers a browser-side identity read from the shared userinfo source, so it can
 * never disagree with what the Node-side stub returns for the same session.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(userInfoFor(roleName))),
  );
};

/**
 * Serves the whole request set in one response, as the real endpoint does (no query
 * parameters, no server-side narrowing) — so anything narrowed, on screen OR in the
 * exported file, was narrowed by the app itself.
 */
const serveTransactions = async (
  page: Page,
  requests: TransactionRead[],
): Promise<void> => {
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse(requests))),
  );
};

/**
 * Puts the browser in a signed-in state without driving the sign-in form and without
 * any real credential: the mock `session` cookie the Node-side auth stub maps back to
 * this role when the server-side gate asks who the session belongs to.
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

/* -------------------------------------------------------------------------- */
/* Locators.                                                                  */
/* -------------------------------------------------------------------------- */

/** The screen's own content — never the shell around it. */
const listScreen = (page: Page): Locator => page.getByRole('main');

/** The request list itself. */
const requestList = (page: Page): Locator =>
  listScreen(page).getByRole('table');

/**
 * The listed requests: the table's DATA rows only. Filtering on "has a `cell`" is
 * what separates them from the heading row, whose children are `columnheader`s — no
 * index arithmetic and no reliance on the header being first.
 */
const requestRows = (page: Page): Locator =>
  requestList(page)
    .getByRole('row')
    .filter({ has: page.getByRole('cell') });

/** The control that produces the file. */
const exportAction = (page: Page): Locator =>
  listScreen(page).getByRole('button', { name: EXPORT_ACTION });

/** One of the pick-one filters from the request-list epic's story 2. */
const filterSelector = (page: Page, name: RegExp): Locator =>
  listScreen(page).getByRole('combobox', { name });

/**
 * The choices an open Shadcn `select` is showing. Scoped to the open list rather than
 * the whole page, because Radix also renders a hidden native `select` for form
 * integration and every other filter on this screen has choices of its own.
 */
const openChoices = (page: Page): Locator => page.getByRole('listbox');

/**
 * Narrows the list by status the way a user does: open the filter, pick the value.
 * The choice is named by the service's own status value, matched whole so `Imported`
 * can never land on another choice that contains it.
 */
const chooseStatus = async (page: Page, status: string): Promise<void> => {
  await filterSelector(page, STATUS_FILTER).click();
  await openChoices(page)
    .getByRole('option', { name: new RegExp(`^${status}$`, 'i') })
    .click();
};

/**
 * The app's in-app notification surface — the root layout's `ToastContainer`, by its
 * own accessible name. Deliberately NOT `getByRole('alert')` (Next's empty route
 * announcer is a second body-level alert, and a toast's role legitimately varies with
 * its variant), and deliberately not scoped to `main` (the container is fixed-position
 * and mounted outside it).
 */
const notifications = (page: Page): Locator =>
  page.getByRole('region', { name: /notifications/i });

/**
 * A notification as ASSISTIVE TECHNOLOGY receives it: the element carrying the
 * announcing role. `.or()` is Playwright's own locator combinator, not a query
 * fallback — the shared toast renders `role="status"` for every variant except the
 * error one, which is `alert`, and this story's confirmation may reasonably be either.
 */
const announcedNotification = (page: Page): Locator => {
  const surface = notifications(page);
  return surface.getByRole('status').or(surface.getByRole('alert'));
};

/**
 * The `aria-live` setting the notification is announced under, or `'none'` when it
 * sits in no live region at all — which is the difference between a confirmation a
 * keyboard-and-screen-reader user is TOLD about and one that is merely in the DOM
 * (AC-4).
 */
const liveRegionSettingOf = (notification: Locator): Promise<string> =>
  notification.evaluate(
    (element) =>
      element.closest('[aria-live]')?.getAttribute('aria-live') ?? 'none',
  );

/* -------------------------------------------------------------------------- */
/* Keyboard helpers (AC-4).                                                    */
/* -------------------------------------------------------------------------- */

/** How a control reads to a user, for readable failure output. */
const labelOf = (control: Locator): Promise<string> =>
  control.evaluate(
    (element) =>
      (
        element.getAttribute('aria-label') ??
        element.textContent ??
        ''
      ).trim() || element.tagName.toLowerCase(),
  );

/**
 * What the browser actually paints on a control, or `'none'`.
 *
 * Read from computed style rather than from class names on purpose: a class assertion
 * would pass even if the styling token painted nothing at all. Both shapes count,
 * because Shadcn/Tailwind render `focus-visible` styling as an outline on some
 * primitives and as a `box-shadow` ring on others; the caller compares the focused
 * paint with the unfocused paint, so a control carrying a permanent shadow cannot pass
 * by accident. The same helper the request-list epic's story 4 sweep uses.
 */
const focusPaintOf = (control: Locator): Promise<string> =>
  control.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const outlineWidth = Number.parseFloat(style.outlineWidth);
    if (style.outlineStyle !== 'none' && outlineWidth > 0) {
      return `outline ${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`;
    }
    if (style.boxShadow && style.boxShadow !== 'none') {
      return `box-shadow ${style.boxShadow}`;
    }
    return 'none';
  });

/**
 * Presses `key` until the control has keyboard focus. Throws (failing the test with a
 * plain-English reason) when the control cannot be reached — that throw IS the
 * keyboard-reachability assertion. The same helper epic 1's story 3, the file-upload
 * epic's story 2 and the request-list epic's story 4 use.
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
    `"${await labelOf(control)}" could not be reached with ${String(maxPresses)} ` +
      `"${key}" presses, so it cannot be operated by keyboard alone (AC-4).`,
  );
};

/* -------------------------------------------------------------------------- */
/* Reading the file that was handed over.                                      */
/* -------------------------------------------------------------------------- */

/**
 * A byte-order mark, built from its code point rather than written as a literal so it
 * is visible in this source. Some writers put one at the head of a CSV for spreadsheet
 * compatibility; it says nothing about the rows, so it is stripped.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);

/** The text that actually landed on the user's disk. */
const deliveredText = async (download: Download): Promise<string> => {
  const contents = await readFile(await download.path(), 'utf8');
  return contents.startsWith(BYTE_ORDER_MARK)
    ? contents.slice(BYTE_ORDER_MARK.length)
    : contents;
};

/**
 * The file's lines. Either line ending is accepted (RFC 4180 says CRLF; a lone `\n` is
 * what most writers produce), and a trailing newline at the end of the file is allowed
 * rather than counted as an empty row.
 */
const csvLinesOf = (contents: string): string[] =>
  contents.replace(/\r?\n$/, '').split(/\r?\n/);

/**
 * The references of the served requests that appear in `texts`, so a request is
 * recognised by its own reference rather than by which column it sits in or where in
 * the file it landed. A text carrying no reference (the header line) is skipped.
 */
const referencesIn = (texts: string[], served: TransactionRead[]): string[] =>
  texts.reduce<string[]>((references, text) => {
    const request = served.find((candidate) =>
      text.includes(candidate.Reference),
    );
    if (request) {
      references.push(request.Reference);
    }
    return references;
  }, []);

/** Sorted references, so a set can be compared without pinning an order. */
const sortedReferences = (requests: TransactionRead[]): string[] =>
  requests.map((request) => request.Reference).sort();

/**
 * Asserts the delivered file holds EXACTLY the requests the narrowing left, and none
 * of the ones it removed.
 *
 * Compared as a SET: which order the rows are in is story 1's AC-2, and pinning it
 * again here would make this spec fail for a reason it is not about.
 */
const expectFileToMatch = (
  contents: string,
  narrowing: TransactionRead[],
  described: string,
): void => {
  const lines = csvLinesOf(contents);

  expect(
    lines,
    `${described}: the file must hold a header row plus exactly one line per request the narrowing left`,
  ).toHaveLength(narrowing.length + 1);

  expect(
    referencesIn(lines.slice(1), SERVED).sort(),
    `${described}: the file must hold exactly the requests the narrowing left (BR1)`,
  ).toEqual(sortedReferences(narrowing));

  for (const request of outsideOf(narrowing)) {
    expect(
      contents,
      `${described}: ${request.Reference} was not in the narrowing, so it must not be in the file (BR1)`,
    ).not.toContain(request.Reference);
  }
};

/* -------------------------------------------------------------------------- */
/* Opening the screen and asking for the export.                               */
/* -------------------------------------------------------------------------- */

/** Signs in as the named role with the given request set served to the browser. */
const openRequestList = async (
  page: Page,
  context: BrowserContext,
  requests: TransactionRead[],
  roleName: string,
): Promise<void> => {
  await mockBrowserIdentityCall(page, roleName);
  await serveTransactions(page, requests);
  await blockLiveBackends(page);
  await seedSession(context, roleName);

  await page.goto(REQUESTS_PATH);
  await expect(requestList(page)).toBeVisible();
};

/** Activates the export and waits for the file the browser actually receives. */
const exportNow = async (page: Page): Promise<Download> => {
  const action = exportAction(page);
  await expect(action).toBeVisible();

  const downloadStarted = page.waitForEvent('download');
  await action.click();
  return downloadStarted;
};

test.describe('Epic csv-export, Story 2: know what you exported, and be told when there is nothing to export', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-3
  // The count has to TRACK the narrowing, not merely exist. Two exports, one changed
  // filter: each file is read back against the narrowing that was active when it was
  // asked for, and each confirmation must name that narrowing's own number. A
  // confirmation still naming the previous export's count, or naming the whole
  // unfiltered set, fails here — those are the two ways a plausible-looking
  // notification misreports a hand-over to a payment system.
  test('changing a filter and exporting again produces a file matching the new narrowing, with a confirmation naming the new count', async ({
    page,
    context,
  }) => {
    await openRequestList(page, context, SERVED, ROLE_IMPORTER);

    // ---- The first narrowing, and the export it produces ------------------
    await chooseStatus(page, FIRST_STATUS);
    await expect(
      requestRows(page),
      `the ${FIRST_STATUS} filter must leave ${String(FIRST_NARROWING.length)} of the ${String(SERVED.length)} requests on screen before the first export is asked for`,
    ).toHaveCount(FIRST_NARROWING.length);

    expectFileToMatch(
      await deliveredText(await exportNow(page)),
      FIRST_NARROWING,
      `the first export (${FIRST_STATUS})`,
    );

    await expect(
      notifications(page),
      `the confirmation must name how many requests were exported — ${String(FIRST_NARROWING.length)} (R4)`,
    ).toContainText(namesCount(FIRST_NARROWING.length));

    // Never the whole fetched set: a narrowing was active, and the file that was just
    // produced holds only what it left (BR1).
    await expect(
      notifications(page),
      `the confirmation must not name the unfiltered total of ${String(SERVED.length)} requests — a narrowing was active (BR1)`,
    ).not.toContainText(namesCount(SERVED.length));

    // ---- The narrowing CHANGES, and the export must follow it -------------
    // The first notification is left exactly as it is: everything below is a POSITIVE
    // match on the NEW count, so a notification that has not yet faded can neither
    // satisfy nor break it.
    await chooseStatus(page, SECOND_STATUS);
    await expect(
      requestRows(page),
      `changing the filter to ${SECOND_STATUS} must leave ${String(SECOND_NARROWING.length)} requests on screen before the second export is asked for`,
    ).toHaveCount(SECOND_NARROWING.length);

    expectFileToMatch(
      await deliveredText(await exportNow(page)),
      SECOND_NARROWING,
      `the second export (${SECOND_STATUS})`,
    );

    // The new count, named. A count captured on the previous export and reused would
    // still say the first narrowing's number here, and this is where that fails.
    await expect(
      notifications(page),
      `the second confirmation must name the NEW count of ${String(SECOND_NARROWING.length)} requests, not the ${String(FIRST_NARROWING.length)} the previous export produced (R4/BR1)`,
    ).toContainText(namesCount(SECOND_NARROWING.length));

    await expect(
      notifications(page),
      `no confirmation may name the unfiltered total of ${String(SERVED.length)} requests (BR1)`,
    ).not.toContainText(namesCount(SERVED.length));
  });

  // AC-4
  // Keyboard alone, start to finish: NOTHING in this test is clicked. The control is
  // reached with Tab, activated with Enter, and the confirmation is then checked for
  // being ANNOUNCED — inside the shared notification region, carrying a live setting —
  // rather than merely present in the DOM, which is the whole difference for someone
  // who never sees the corner of the screen the toast appears in. The state this story
  // introduces to the screen is also scanned in the real browser at the project's
  // WCAG 2.2 AA bar, with the confirmation showing.
  test('the export is reached and activated with the keyboard alone, and its confirmation is announced', async ({
    page,
    context,
  }) => {
    // One request per status, so the whole served set is listed with no narrowing
    // applied — the count the confirmation must name is therefore the served count.
    const served = transactionsInEveryStatus();
    await openRequestList(page, context, served, ROLE_IMPORTER);
    await expect(
      requestRows(page),
      'every served request must be listed before the export is asked for',
    ).toHaveCount(served.length);

    const action = exportAction(page);
    await expect(action).toBeVisible();
    const paintWhenNotFocused = await focusPaintOf(action);

    // ---- Reached with Tab alone (the helper throws if it cannot be) -------
    await pressUntilFocused(page, 'Tab', action);

    // ...and it SHOWS where the keyboard is: a focus indicator the browser actually
    // paints, not merely a class that might paint nothing.
    expect(
      await focusPaintOf(action),
      'the export control must paint a visible focus indicator when the keyboard reaches it, or a keyboard user cannot tell it is about to be activated (AC-4)',
    ).not.toBe(paintWhenNotFocused);

    // ---- Activated with Enter alone, and the file really arrives ----------
    const downloadStarted = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const download = await downloadStarted;
    expect(
      await download.failure(),
      'activating the export from the keyboard must produce the file, exactly as clicking it does (AC-4)',
    ).toBeNull();

    // ---- The confirmation is perceivable without a mouse ------------------
    const confirmation = announcedNotification(page);

    await expect(
      notifications(page),
      "the confirmation must come through the app's one notification surface",
    ).toBeVisible();
    await expect(
      confirmation,
      'the confirmation must be carried by an element with an announcing role (status/alert), so it reaches someone who cannot see the corner it appears in',
    ).toHaveCount(1);
    await expect(
      confirmation,
      `the announced confirmation must name how many requests were exported — ${String(served.length)}`,
    ).toContainText(namesCount(served.length));

    // Announced, not merely rendered: the confirmation sits in a live region, which is
    // what makes a screen reader read it out without the user going looking for it.
    expect(
      await liveRegionSettingOf(confirmation),
      'the confirmation must sit in an aria-live region — a notification that is only in the DOM is not perceivable without a mouse (AC-4)',
    ).toMatch(/^(?:polite|assertive)$/);

    // The new state this story adds to this screen, scanned in a real browser at the
    // project's WCAG 2.2 AA bar (project.md §Baseline NFRs). The request list's other
    // states are scanned by the request-list epic's story 4.
    const { violations } = await new AxeBuilder({ page })
      .withTags(WCAG_22_AA_TAGS)
      .analyze();
    expect(
      violations.map(
        (violation) =>
          `${violation.id}: ${violation.help} (${String(violation.nodes.length)} node/s)`,
      ),
      'WCAG 2.2 AA violations on the expense request list with the export confirmation showing',
    ).toEqual([]);
  });
});
