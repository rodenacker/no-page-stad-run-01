/**
 * Story Metadata:
 * - Epic: file-validation-and-retry — Rejected rows, retry and cancel
 * - Story: 1 — Open a submitted file and see its processing history
 * - Route: /upload/file (reached as `/upload/file?LogId=<id>` from a file's row)
 * - Target File: web/src/app/(authenticated)/upload/file/page.tsx
 * - Page Action: create_new
 * - Requirements: FR8, BR4
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-1 (each row of the Expense files list offers a way to open that file, and the
 *   file that opens shows its own name, setting, processed time, status chip and
 *   record count as the service reported them), AC-2 (both roles may open a file and
 *   read its history; any other signed-in account is refused IN PLACE with the
 *   missing permission named) and AC-6 (a real-browser accessibility scan of the
 *   finished page, and every link and control reachable and operable by keyboard
 *   alone) → this file.
 * - AC-3 (every recorded activity with its outcome and its start/finish times),
 *   AC-4 (the announced wait, the "no activity yet" case, and a failed read showing
 *   the service's own wording with one action that asks again) and AC-5 (a file that
 *   is no longer in the active list — cancelled, or an identifier matching nothing —
 *   explains itself and offers the way back) → the Vitest layer at
 *   `web/src/__tests__/integration/epic-file-validation-and-retry-story-1-open-a-submitted-file.test.tsx`.
 *   Deliberately NOT duplicated here.
 * - AC-6 is THIS EPIC'S single real-browser accessibility scan (story §Epic shared
 *   surface): stories 2–4 render their sections inside this same page, so it is
 *   scanned here, complete, using the same mechanism and WCAG tag set as the earlier
 *   epics' scans.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running on this machine. Two boundaries, one
 * contract — both established by epic 1 and reused here rather than rebuilt:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. Every protected screen
 *    is gated SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process, epic 1 BR1/BR3), and
 *    `page.route()` cannot see a fetch the browser never makes. The stub answers that
 *    call from the shared identity source, keyed off the `session` cookie value seeded
 *    below.
 * 2. Browser boundary → `page.route()` below, for every transactions-service read
 *    these two screens make:
 *    - `GET /transactions-api/v1/file-logs?IsActive=Yes` — the active file list, which
 *      is BOTH the Expense files screen's own read and how this page resolves the
 *      requested `LogId` (there is no get-one-file endpoint — story §Technical
 *      summary);
 *    - `GET /transactions-api/v1/file-process-logs/{LogId}` — this story's own read;
 *    - `GET /transactions-api/v1/file-settings` — story 2 of `expense-file-upload`
 *      puts a submit form on the Expense files screen, and that form reads the named
 *      settings for itself;
 *    - `GET /transactions-api/v1/files/validation-errors` — the invalid-row read
 *      stories 2 of THIS epic adds inside this same page.
 *    The last two are mocked even though nothing here asserts anything about them:
 *    `/transactions-api/...` is the app's OWN same-origin mount point
 *    (`app/transactions-api/[...path]/route.ts`), so an unmocked read is forwarded to
 *    the live transactions service from inside the Next.js process, where
 *    `blockLiveBackends` cannot see it — which would both contact a live backend and
 *    put an unrelated failure alert on screen.
 *
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by driving
 *   the sign-in form — epic 1 story 2's spec owns that journey, and the cookie is the
 *   app's sole conveyance of session (epic 1 BR2). Cookies ignore port, so one seed
 *   serves the dev server (:3000) and the epic-end production run (:3100). Re-seeding
 *   the same cookie name/domain/path overwrites it, which is how the tests below switch
 *   identity.
 * - Every response body comes from the project-wide factories under
 *   `web/src/mocks/data/` (`userInfoFor(role)`, `createFileLog()`, `fileLogWithStatus()`,
 *   `fileLogListResponse()`, `fileProcessHistory()`, `fileProcessLogListResponse()`,
 *   `fileProcessLogFailureResponse()`, `fileSettingListResponse()`,
 *   `validationErrorsResponse()`); no response shape is authored in this file, so this
 *   spec and the Vitest layer cannot drift on the contract. The history envelope's array
 *   property is `FileLog`, NOT `FileProcessLog` (story §Infrastructure notes) — that
 *   wire quirk is the factory's business, which is exactly why no body is hand-written
 *   here.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - Both reads happen in the BROWSER, through the shared API client at the app's own
 *   same-origin `/transactions-api/...` address (story §Infrastructure notes).
 *   `page.route()` cannot intercept a fetch made by the Next.js server or by a Server
 *   Action — if either read moves server-side, this spec's mock is bypassed and the
 *   request leaves for the real transactions service. The story's loading state and
 *   "ask for it again" action already imply the browser-side read.
 * - A file's row offers the way to open it as a real navigational LINK to
 *   `/upload/file?LogId=<that file's Id>` — located by DESTINATION below, never by
 *   label, because the wording is the developer's. A link (not a button pushing a
 *   route) is what makes it openable in a new tab and announced as a link.
 * - `/upload/file` is registered in `lib/auth/access-map.ts` and nowhere else, and the
 *   page renders `<PermissionDeniedMessage deniedPath={...} />` when `canAccess()` is
 *   false before rendering anything (story §Infrastructure notes). This spec hardcodes
 *   neither the roles nor the permission wording: it reads the permission from the
 *   access map itself, so it follows whatever that map registers and cannot drift from
 *   it. `addressOf()` already strips the query string, so `?LogId=5001` resolves
 *   against the registered `/upload/file`.
 * - The permission message renders as the Shadcn `alert` primitive (`role="alert"`)
 *   inside the normal signed-in shell, naming the missing permission as the access map
 *   words it — the same shape epic 1 story 4 pinned.
 * - The one action that asks for a failed history read again is worded "Try again" —
 *   the wording every other failure state in this project already uses
 *   (`SubmittedFilesList`, `SubmitExpenseFileForm`, `ExpenseRequestList`). It is
 *   matched exactly below so it can never be confused with story 4's separate
 *   "retry validation" action on this same page.
 * - Playwright alert/role queries are scoped to `main`: Next.js renders a permanently
 *   empty body-level `role="alert"` route announcer, so an unscoped query always
 *   matches two elements.
 * - Cookie assumptions: the mock `session` cookie carries production-like attributes
 *   (HttpOnly, SameSite=Strict). `Secure` is omitted because the E2E server is plain
 *   http on localhost; the real cookie's full attribute set is asserted in the Vitest
 *   layer (epic 1, story 1).
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — `/upload/file` does
 * not exist yet, no row offers a way to open a file, and the address is not registered
 * in the access map.
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
// The ONE place that says which roles may open which address, and how a denial is
// worded — read here instead of restating either, so this spec cannot drift from it.
import { accessEntryFor } from '../src/lib/auth/access-map';
import {
  FILE_STATUS_VALIDATION_FAILED,
  createFileLog,
  fileLogListResponse,
  fileLogWithStatus,
} from '../src/mocks/data/file-log';
import {
  ACTIVITY_FILE_RECEIVED,
  ACTIVITY_ROW_VALIDATION,
  FILE_PROCESS_LOG_FAILURE_MESSAGE,
  OUTCOME_SUCCESS,
  fileProcessHistory,
  fileProcessHistoryAfterRetry,
  fileProcessLogFailureResponse,
  fileProcessLogListResponse,
} from '../src/mocks/data/file-process-log';
import { fileSettingListResponse } from '../src/mocks/data/file-setting';
import { UNRECOGNISED_ROLE, userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER, ROLE_IMPORTER } from '../src/mocks/data/role';
import { validationErrorsResponse } from '../src/mocks/data/validation-error';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FileLog } from '../src/mocks/data/file-log';
import type { FileProcessLog } from '../src/mocks/data/file-process-log';

/** The Expense files screen a file is opened FROM (epic `expense-file-upload`). */
const UPLOAD_PATH = '/upload';

/** This story's screen — one submitted file, identified by `LogId` in the query. */
const FILE_PATH = '/upload/file';

/**
 * The permission `/upload/file` needs, worded exactly as the access map words it
 * (requirements §6.5). Read from the map rather than restated, so rewording the
 * permission cannot leave the assertion below passing against stale copy. It is empty
 * until the address is registered — which the denial test asserts explicitly.
 */
const REQUIRED_PERMISSION = accessEntryFor(FILE_PATH)?.permission ?? '';

/**
 * The transactions-service reads these two screens make, as the BROWSER addresses
 * them: the app's own `/transactions-api/*` mount point, never a service origin
 * (`web/src/lib/utils/constants.ts`). Trailing `**` so query strings and path
 * parameters are covered.
 */
const FILE_LOGS_URL_GLOB = '**/transactions-api/v1/file-logs**';
const FILE_PROCESS_LOGS_URL_GLOB =
  '**/transactions-api/v1/file-process-logs/**';
const FILE_SETTINGS_URL_GLOB = '**/transactions-api/v1/file-settings**';
const VALIDATION_ERRORS_URL_GLOB =
  '**/transactions-api/v1/files/validation-errors**';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * WCAG 2.2 AA — this project's effective accessibility bar (project.md §Baseline
 * NFRs, superseding the template's 2.1 AA floor). The identical tag set the earlier
 * epics' scans used. Scoped explicitly because axe's defaults also run best-practice
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

/** Everything on the page a keyboard user must be able to reach (AC-6). */
const INTERACTIVE_CONTROLS =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The action that asks for a failed history read again. Matched EXACTLY (not as a
 * substring) so it can never resolve to story 4's separate "retry validation" action,
 * which lives on this same page for a Finance Uploader.
 */
const HISTORY_RETRY_NAME = /^try again$/i;

/**
 * The file AC-1 and AC-2 open: the canonical imported file (`Id` 5001), paired with
 * the history of a file that failed validation, was retried, and then imported — so
 * the served history is coherent with the status shown.
 *
 * Its status (`Imported`) appears nowhere in that history's text (`File received`,
 * `Row validation`, `Success`, `Validation failed`) and its record count (`142`)
 * appears in none of the dates — so the value assertions below are really about this
 * file's own summary and cannot be satisfied by a history row instead.
 */
const OPENED_FILE = createFileLog();
const OPENED_FILE_HISTORY = fileProcessHistoryAfterRetry();

/**
 * The second file in the list, so "each row offers a way to open THAT file" is a real
 * per-row check rather than one row examined twice. Its name and identifier differ
 * from `OPENED_FILE`'s, which is what lets the opened page be shown to be the right
 * file.
 */
const OTHER_FILE = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED, {
  Id: 5002,
  CurrentFileName: 'expenses_2026-04-22.csv',
  ProcessDate: '2026-04-22 09:15:00',
  SettingName: 'Travel Claims Import',
});

const LISTED_FILES: FileLog[] = [OPENED_FILE, OTHER_FILE];

/**
 * The file AC-6 scans: one that FAILED validation, because that is the widest surface
 * this epic renders on the page — the error-intent status chip, story 2's invalid
 * rows, story 3's two downloads (the factory gives it `HasBulkErrorFile: 'Yes'`) and
 * story 4's retry and cancel actions are all present for a Finance Uploader.
 */
const FAILED_FILE = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED, {
  Id: 5001,
});
const FAILED_FILE_HISTORY = fileProcessHistory();

/**
 * One recorded activity common to BOTH served histories (`fileProcessHistoryAfterRetry`
 * is `fileProcessHistory` plus the retry, so they share their first two activities) —
 * which is what lets one history assertion serve every test here.
 *
 * It is deliberately an activity that is NOT also the file's own most recent activity,
 * and its start time is not the file's processed time, so "the history is on screen"
 * can never be satisfied by the file's summary values instead.
 */
const [, SECOND_ACTIVITY] = OPENED_FILE_HISTORY;

/** A mocked response, built from a project-wide factory body. */
interface MockedResponse {
  status: number;
  contentType: string;
  body: string;
}

const jsonResponse = (status: number, body: unknown): MockedResponse => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/** The history read answered with the given activities. */
const historyServed = (activities: FileProcessLog[]): MockedResponse =>
  jsonResponse(200, fileProcessLogListResponse(activities));

/**
 * The history read refused. The transactions service reports a refusal as a 500
 * carrying `Messages[]` (story §Infrastructure notes), which is where
 * `FILE_PROCESS_LOG_FAILURE_MESSAGE` travels.
 */
const historyRefused = (): MockedResponse =>
  jsonResponse(500, fileProcessLogFailureResponse());

/**
 * Blocks the live services (see LIVE_BACKEND_ORIGINS). Registered LAST in each test,
 * because Playwright matches the most recently registered route first: that way a call
 * sent to a service's own origin is aborted and fails visibly, instead of being
 * quietly answered by the origin-agnostic mocks above it.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Answers a BROWSER-side identity read from the shared userinfo source, replacing any
 * role mocked earlier in the test, so it can never disagree with what the Node-side
 * stub returns for the same session.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.unroute('**/v1/auth/userinfo');
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(200, userInfoFor(roleName))),
  );
};

/** The active file list — the Expense files screen's read, and how this page resolves `LogId`. */
const mockFileLogList = async (page: Page, files: FileLog[]): Promise<void> => {
  await page.route(FILE_LOGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(200, fileLogListResponse(files))),
  );
};

/**
 * The two reads that belong to OTHER stories on these same screens (the submit form's
 * named settings, and story 2's invalid rows). Mocked in every test here so neither can
 * fall through the app's own route handler to the live transactions service.
 */
const mockNeighbouringReads = async (page: Page): Promise<void> => {
  await page.route(FILE_SETTINGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(200, fileSettingListResponse())),
  );
  await page.route(VALIDATION_ERRORS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(200, validationErrorsResponse())),
  );
};

/** What the mocked processing-history endpoint is currently serving. */
interface HistoryFeed {
  /** Change what the NEXT read of the history returns — the service moving on. */
  serve: (next: MockedResponse) => void;
}

/**
 * Serves a file's processing history, returning whatever the test last asked for.
 *
 * Deliberately NOT "one response per request": the browser may legitimately read once
 * more for a single on-screen state (React's development double-render being the
 * obvious case), and a queue would then silently hand a state to the wrong render.
 */
const serveFileProcessLogs = async (
  page: Page,
  initial: MockedResponse,
): Promise<HistoryFeed> => {
  let current = initial;
  await page.route(FILE_PROCESS_LOGS_URL_GLOB, (route) =>
    route.fulfill(current),
  );
  return {
    serve: (next: MockedResponse) => {
      current = next;
    },
  };
};

/**
 * Puts the browser in a signed-in state as the named role, without a real credential:
 * the mock `session` cookie the Node-side auth stub maps back to this role when the
 * server-side gate asks it who the session belongs to. Re-seeding with another role
 * overwrites the cookie, which is how identity is switched mid-test.
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

/** The address of one file's page, exactly as a row's link addresses it. */
const fileAddressFor = (file: FileLog): string =>
  `${FILE_PATH}?LogId=${String(file.Id)}`;

/**
 * The address of one file's page, tolerant of another query parameter travelling
 * alongside `LogId` (the order and the rest of the query are the developer's).
 */
const fileAddressPattern = (file: FileLog): RegExp =>
  new RegExp(`${FILE_PATH}\\?(.*&)?LogId=${String(file.Id)}(&|$)`);

/** One file's row in the Expense files list, found by the file's own name — never by position. */
const fileRow = (page: Page, file: FileLog): Locator =>
  page
    .getByRole('main')
    .getByRole('row')
    .filter({ hasText: file.CurrentFileName });

/**
 * A row's way to open the file, found by WHERE IT GOES rather than by what it is
 * called: the wording is the developer's, while the destination is the contract.
 * Requiring an `a[href]` also pins that it stays a real navigational link.
 */
const openFileLinkIn = (row: Locator): Locator =>
  row.locator(`a[href*="${FILE_PATH}"]`);

/**
 * AC-1: the opened page shows the file's own values, exactly as the service reported
 * them (brief BR5 — nothing recomputed or reformatted in the frontend). Scoped to the
 * screen's own content, and every value below is a string that appears nowhere else in
 * what is served for this file, so each assertion is about the value it names.
 */
const expectFileValuesOnScreen = async (
  page: Page,
  file: FileLog,
): Promise<void> => {
  const screen = page.getByRole('main');

  await expect(
    screen,
    'the opened page must name the file it is about',
  ).toContainText(file.CurrentFileName);
  await expect(
    screen,
    'the opened page must show the setting the file was submitted against',
  ).toContainText(file.SettingName);
  await expect(
    screen,
    'the opened page must show when the file was processed, as the service reported it',
  ).toContainText(file.ProcessDate);
  await expect(
    screen,
    'the opened page must show the status the service reported for the file',
  ).toContainText(file.CurrentStatus);
  await expect(
    screen,
    'the opened page must show how many records the file held, as the service reported it',
  ).toContainText(file.RecordCount);
};

/**
 * AC-2: the file's processing history is readable. The activity name and outcome
 * asserted here belong to the served history alone — `File received` is not this
 * file's most recent activity, and the start time is not its processed time — so this
 * cannot pass on the file's summary values.
 */
const expectHistoryOnScreen = async (page: Page): Promise<void> => {
  const screen = page.getByRole('main');

  await expect(
    screen,
    'the file page must list the activities the service recorded for the file',
  ).toContainText(ACTIVITY_FILE_RECEIVED);
  await expect(screen).toContainText(ACTIVITY_ROW_VALIDATION);
  await expect(
    screen,
    'each listed activity must carry the outcome the service recorded for it',
  ).toContainText(OUTCOME_SUCCESS);
  await expect(
    screen,
    'each listed activity must carry the times it started and finished',
  ).toContainText(SECOND_ACTIVITY.StartDate);
};

/**
 * What the browser actually paints on a control, or `'none'`.
 *
 * Read from computed style rather than class names on purpose: a class assertion would
 * pass even if the styling token painted nothing at all, which is exactly what "a
 * visible focus indicator" cares about. Both shapes count, because Shadcn/Tailwind
 * render `focus-visible` styling as an outline on some primitives and a `box-shadow`
 * ring on others. Callers compare the focused paint with the unfocused paint, so a
 * control carrying a permanent shadow cannot pass by accident.
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
 * Presses `key` until the control has keyboard focus. Throws (failing the test with a
 * plain-English reason) when the control cannot be reached — that throw IS the
 * keyboard-reachability assertion.
 */
const pressUntilFocused = async (
  page: Page,
  key: string,
  control: Locator,
  maxPresses = 80,
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
      `"${key}" presses, so it is not operable by keyboard alone (AC-6).`,
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
        `${violation.id}: ${violation.help} (${String(violation.nodes.length)} node/s)`,
    ),
    `WCAG 2.2 AA violations on the submitted file page (${state})`,
  ).toEqual([]);
};

test.describe('Epic file-validation-and-retry, Story 1: open a submitted file and see its processing history', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-1
  // Walked the way a user gets there — from a row of the Expense files list, by
  // following the link, not by typing the address — because "each row offers a way to
  // open that file" is half of what this criterion asks.
  test('every file in the Expense files list can be opened, and the file that opens shows its own name, setting, processed time, status and record count', async ({
    page,
    context,
  }) => {
    await mockFileLogList(page, LISTED_FILES);
    await serveFileProcessLogs(page, historyServed(OPENED_FILE_HISTORY));
    await mockNeighbouringReads(page);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await seedSession(context, ROLE_IMPORTER);
    await blockLiveBackends(page);

    await page.goto(UPLOAD_PATH);

    // EVERY row offers the way in, each pointing at its OWN file — not one shared
    // link, and not a link on the first row only.
    for (const file of LISTED_FILES) {
      const openFile = openFileLinkIn(fileRow(page, file));
      await expect(
        openFile,
        `${file.CurrentFileName}'s row must offer a way to open that file`,
      ).toBeVisible();
      await expect(
        openFile,
        `the way into ${file.CurrentFileName} must address that file (LogId=${String(file.Id)}), not another`,
      ).toHaveAttribute('href', fileAddressPattern(file));
    }

    // Opened by following the row's own link.
    await openFileLinkIn(fileRow(page, OPENED_FILE)).click();
    await expect(page).toHaveURL(fileAddressPattern(OPENED_FILE));

    // The file's own values, as the service reported them.
    await expectFileValuesOnScreen(page, OPENED_FILE);

    // ...and they are THIS file's: the other listed file is not what opened.
    await expect(
      page.getByRole('main'),
      `opening ${OPENED_FILE.CurrentFileName} must not show ${OTHER_FILE.CurrentFileName}`,
    ).not.toContainText(OTHER_FILE.CurrentFileName);
  });

  // AC-2
  // Three identities in one journey, because the criterion is about who may read this
  // page and who may not: both project roles open it and read the history (brief BR4),
  // then an account whose role this project does not recognise is refused in place.
  // Walking them in sequence also proves the identity switch really happened, rather
  // than the same person being checked three times.
  test('a Finance Uploader and an Approver each open a submitted file and read its history, while an account whose role is not recognised is refused in place with the missing permission named', async ({
    page,
    context,
  }) => {
    await mockFileLogList(page, LISTED_FILES);
    await serveFileProcessLogs(page, historyServed(OPENED_FILE_HISTORY));
    await mockNeighbouringReads(page);

    // The address must be registered in the access map — that registration is what
    // carries both the permission wording a denied user is shown and the roles that
    // may open it (story §Infrastructure notes).
    expect(
      REQUIRED_PERMISSION,
      `${FILE_PATH} must be registered in lib/auth/access-map.ts with the permission it needs, so a denied user can be told which one is missing`,
    ).not.toBe('');

    for (const roleName of [ROLE_IMPORTER, ROLE_APPROVER]) {
      await seedSession(context, roleName);
      await mockBrowserIdentityCall(page, roleName);
      await blockLiveBackends(page);

      const signedInUser = userInfoFor(roleName);
      await page.goto(fileAddressFor(OPENED_FILE));

      // Signed in as this role — the assertion that the switch above took effect.
      await expect(page.getByRole('banner')).toContainText(
        new RegExp(signedInUser.LastName, 'i'),
      );

      // The file's page, and its history, are readable by this role.
      await expect(page).toHaveURL(fileAddressPattern(OPENED_FILE));
      await expectFileValuesOnScreen(page, OPENED_FILE);
      await expectHistoryOnScreen(page);

      // ...and NOT the missing-permission message. Asserted on the denial's own
      // wording rather than on the absence of every alert, because other sections of
      // this page belong to later stories and may legitimately report something.
      await expect(
        page.getByRole('main'),
        `${roleName} may read a submitted file's processing history (brief BR4), so the missing-permission message must not be shown`,
      ).not.toContainText(REQUIRED_PERMISSION);
    }

    // Now the same address as an account whose only role this project does not
    // recognise, so the access map excludes it from everything — as if the address had
    // been bookmarked. Both layers switch identity together: re-seeding overwrites the
    // cookie the auth stub resolves to that account, and the browser-side userinfo
    // follows.
    await seedSession(context, UNRECOGNISED_ROLE);
    await mockBrowserIdentityCall(page, UNRECOGNISED_ROLE);
    const deniedUser = userInfoFor(UNRECOGNISED_ROLE);
    const response = await page.goto(fileAddressFor(OPENED_FILE));

    // A rendered screen, not a not-found (404) or a generic error (5xx)...
    expect(response?.status()).toBe(200);
    // ...refused IN PLACE: the user is not bounced elsewhere.
    await expect(page).toHaveURL(fileAddressPattern(OPENED_FILE));

    // The in-page permission message (Shadcn `alert` → role="alert"), scoped to the
    // screen's own content: Next.js renders its route announcer as a second,
    // permanently empty `role="alert"` at body level, so an unscoped query matches two
    // elements. Scoping to `main` also pins that the denial is part of the page rather
    // than floating chrome.
    const permissionMessage = page.getByRole('main').getByRole('alert');
    await expect(permissionMessage).toBeVisible();
    await expect(
      permissionMessage,
      'the refusal must name the missing permission, as the access map words it, rather than only saying access was denied',
    ).toContainText(REQUIRED_PERMISSION);
    await expect(
      permissionMessage,
      'the refusal must say how to get that access (requirements §6.4 recovery)',
    ).toContainText(/(request|ask)[\s\S]{0,60}access/i);

    // Still inside the normal signed-in shell, showing who is signed in — not a bare
    // error screen, and not Next.js's not-found page.
    await expect(page.getByRole('banner')).toContainText(
      new RegExp(deniedUser.LastName, 'i'),
    );
    await expect(page.getByText(/this page could not be found/i)).toHaveCount(
      0,
    );

    // ...and none of the file's history reached this account.
    await expect(
      page.getByRole('main'),
      'a refused account must not be shown the file it may not read',
    ).not.toContainText(ACTIVITY_FILE_RECEIVED);
  });

  // AC-6
  // This epic's single real-browser accessibility scan, on the page a Finance Uploader
  // sees for a file that FAILED validation — the widest surface the epic renders
  // (error-intent status chip, invalid rows, both downloads, retry and cancel). Two
  // states are scanned, because violations are usually state-specific: the failed
  // history read (an alert and its action) and the finished page. The keyboard pass
  // covers both halves of the criterion — every control reached by Tab with a visible
  // focus indicator, and one of them operated with Enter alone.
  test('the submitted file page passes an automated WCAG 2.2 AA check and every control on it is reachable and operable by keyboard alone', async ({
    page,
    context,
  }) => {
    await mockFileLogList(page, [FAILED_FILE]);
    // Starts refused, so the state with an alert on it is scanned before the finished
    // one — and so the action that asks again has something to recover from.
    const history = await serveFileProcessLogs(page, historyRefused());
    await mockNeighbouringReads(page);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await seedSession(context, ROLE_IMPORTER);
    await blockLiveBackends(page);

    await page.goto(fileAddressFor(FAILED_FILE));

    const screen = page.getByRole('main');

    // Settled in the failed state before scanning: the service's own wording is on
    // screen (story §Infrastructure notes — `serviceMessageOf ?? serviceDetailOf ??
    // own wording`).
    await expect(screen).toContainText(FILE_PROCESS_LOG_FAILURE_MESSAGE);
    await expectNoAccessibilityViolations(
      page,
      'the history read having failed',
    );

    // The action that asks for the history again is operable by KEYBOARD alone —
    // reached by Tab and activated with Enter, never clicked. Matched exactly, so
    // story 4's separate retry-validation action cannot stand in for it.
    const tryAgain = screen.getByRole('button', { name: HISTORY_RETRY_NAME });
    await expect(
      tryAgain,
      'a failed history read must offer exactly one action that asks for it again',
    ).toHaveCount(1);

    history.serve(historyServed(FAILED_FILE_HISTORY));
    await pressUntilFocused(page, 'Tab', tryAgain);
    await page.keyboard.press('Enter');
    await expectHistoryOnScreen(page);

    // Every control on the finished page takes focus from the keyboard, and paints
    // something the user can SEE when it does.
    const controls = screen.locator(INTERACTIVE_CONTROLS);
    const unfocused: { label: string; paint: string }[] = [];
    const focused: { label: string; paint: string }[] = [];

    for (
      let index = 0, total = await controls.count();
      index < total;
      index += 1
    ) {
      const control = controls.nth(index);
      const label = await labelOf(control);
      unfocused.push({ label, paint: await focusPaintOf(control) });
      await pressUntilFocused(page, 'Tab', control);
      focused.push({ label, paint: await focusPaintOf(control) });
    }

    expect(
      focused
        .filter(
          (control, index) =>
            control.paint === 'none' ||
            control.paint === unfocused[index].paint,
        )
        .map((control) => control.label),
      'controls on the submitted file page that paint no visible focus indicator when reached by keyboard',
    ).toEqual([]);

    // A sweep that examined nothing proves nothing: this page always offers at least
    // the action(s) the epic adds to a failed file.
    expect(
      focused.length,
      'no control was found on the submitted file page, so the keyboard pass checked nothing',
    ).toBeGreaterThan(0);

    await expectNoAccessibilityViolations(
      page,
      'the finished page, with the processing history on screen',
    );
  });
});
