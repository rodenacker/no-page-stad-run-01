/**
 * Story Metadata:
 * - Epic: files-view-redesign — Redesign the expense files view as a batch register
 * - Story: 3 — A file's own slip, and its processing history
 * - Route: /upload/file (reached as `/upload/file?LogId=<id>` from a file's row)
 * - Target File: web/src/components/files/SubmittedFileDetail.tsx (plus
 *   web/src/components/files/FileProcessingHistory.tsx)
 * - Page Action: modify_existing
 * - Requirements: R17, R18, R1, R2, R7, R8, R9, BR1, BR2, BR6, BR9, BR10
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SPEC EXISTS AT ALL — no acceptance criterion here is tagged `playwright`
 *
 * The planner tagged AC-2/AC-4/AC-5 `vitest` and AC-1/AC-3 `none` (typographic
 * judgement, already on the story's manual checklist). But the story IS routable, and
 * CLAUDE.md §9 requires every routable story to carry a live Playwright spec — so this
 * file covers the ONE thing the Vitest layer structurally cannot: the journey ACROSS the
 * two screens.
 *
 * AC-2's claim is a cross-screen claim — "the header still states the same five things
 * WITH THE SAME VALUES AS THE ROW IT WAS OPENED FROM". A component test can only assert
 * the slip against a fixture it was handed; it cannot open a register, follow a row's own
 * link, and show that the page which loaded describes THAT row's file. That real
 * navigation is what this spec does, and it is all it does:
 *
 *   /upload → a named row of the register → that row's own `Open` link → /upload/file
 *           → the same five values, and that file's own processing history.
 *
 * Deliberately NOT here, to keep one layer per claim:
 * - The slip's and the history's LOOK (compact slip, small capitalised labels, typewriter
 *   figures, hairline rules, no card). AC-1 and AC-3 are tagged `none` BECAUSE only a
 *   person can judge them. Nothing below asserts a class string, a computed style or a
 *   font family; doing that would be faking coverage of a criterion the planner
 *   deliberately left to the manual checklist.
 * - The failure states — a file that cannot be found, and a history that fails to load
 *   (AC-5) — and the still-running activity's absent outcome and finish time (AC-4).
 *   Those are the Vitest layer's, at
 *   `web/src/__tests__/integration/epic-files-view-redesign-story-3-a-files-own-slip-and-its-processing-history.test.tsx`.
 *   The running activity below is listed by name, but what its two empty cells SAY is not
 *   restated here.
 * - The real-browser accessibility scan. This epic places its ONE `@axe-core/playwright`
 *   scan of `/upload` and `/upload/file` in story 6's spec (story 6 §Reuse notes — it is
 *   the only story that already visits both screens, at both widths). A second scan here
 *   would duplicate it and slow the batched run for nothing.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running on this machine. Two boundaries, both
 * established by epic 1 and reused here rather than rebuilt:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started by
 *    `globalSetup` and wired in by `playwright.config.ts`. Both screens are gated
 *    SERVER-side (`(authenticated)/layout.tsx` → `requireSession()`, then
 *    `upload/file/page.tsx` → `canAccess()`), and `page.route()` cannot see a fetch the
 *    browser never makes. The stub answers `GET /v1/auth/userinfo` from the shared
 *    identity source, keyed off the `session` cookie seeded below.
 * 2. Browser boundary → `page.route()` below, for every transactions-service call these
 *    two screens can make, at the app's OWN same-origin mount point
 *    (`app/transactions-api/[...path]/route.ts`):
 *      GET /transactions-api/v1/file-logs?IsActive=Yes      the register's read, and how
 *                                                           /upload/file resolves `LogId`
 *      GET /transactions-api/v1/file-process-logs/<LogId>   this story's own history read
 *      GET /transactions-api/v1/file-settings               the /upload submission slip
 *      GET /transactions-api/v1/transactions                the delete confirmation's count
 *      GET /transactions-api/v1/files/validation-errors     the rejected-rows section
 *      GET /transactions-api/v1/files/download              the import preview's bytes
 *    The last four are mocked even though nothing here asserts anything about them: an
 *    unmocked read is forwarded to the LIVE transactions service from inside the Next.js
 *    process, where `blockLiveBackends` cannot see it.
 *
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by driving
 *   the sign-in form — epic 1 story 2's spec owns that journey, and the cookie is the
 *   app's sole conveyance of session. Cookies ignore port, so one seed serves the dev
 *   server (:3000) and the epic-end production run (:3100). No real credential appears
 *   anywhere in this file.
 * - Every response body comes from the project-wide factories under `web/src/mocks/data/`
 *   (`userInfoFor`, `fileLogWithStatus`, `fileLogListResponse`, `createFileProcessLog`,
 *   `runningFileProcessLog`, `fileProcessLogListResponse`, `activeFileSettings`,
 *   `fileSettingListResponse`, `transactionListResponse`, `validationErrorsResponse`).
 *   No response shape is authored here, so this spec and the Vitest layer cannot drift on
 *   the contract — the history envelope's array property is `FileLog`, not
 *   `FileProcessLog`, and that wire quirk stays the factory's business.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - Both reads happen in the BROWSER, through the shared API client at the app's own
 *   same-origin `/transactions-api/...` address. `page.route()` cannot intercept a fetch
 *   made by the Next.js server or by a Server Action — if either read moves server-side,
 *   these mocks are bypassed and the request leaves for the real service. Unchanged by
 *   this epic: R1/BR2 forbid moving them, and BR10 keeps the file resolved from the ACTIVE
 *   FILE LIST (there is no get-one-file endpoint).
 * - A file's row keeps offering the way in as a real navigational LINK to
 *   `/upload/file?LogId=<that file's Id>` (`submittedFileAddress`), located below by
 *   DESTINATION rather than by label — the wording is the developer's, the destination is
 *   the contract.
 * - The register keeps real TABLE semantics through the restyle (story 1 §Reuse notes:
 *   restyle THROUGH the Shadcn table primitive — real `<th scope>`, `TableCaption`, header
 *   row and table semantics all stay), so a row is addressable by its own file name. Same
 *   for the processing history under R18.
 * - The slip states the file's status as WORDS through the shared `FileStatusBadge` →
 *   `StatusBadge`, whose capitals are CSS and whose DOM text is the service's own value.
 *   Every assertion below matches DOM text, so a `text-transform` change cannot break it.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend response
 * below is mocked, so no live backend is contacted and no real credentials are needed.
 * These tests WILL FAIL until the story is implemented — the redesign has to carry the
 * five values, the row's link and the recorded history through intact, which is exactly
 * what is asserted here.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { SUBMITTED_FILE_PATH, UPLOAD_PATH } from '../src/lib/auth/access-map';
import {
  FILE_STATUS_IMPORTED,
  FILE_STATUS_VALIDATING,
  FILE_STATUS_VALIDATION_FAILED,
  fileLogListResponse,
  fileLogWithStatus,
} from '../src/mocks/data/file-log';
import {
  createFileProcessLog,
  fileProcessLogListResponse,
  runningFileProcessLog,
} from '../src/mocks/data/file-process-log';
import {
  activeFileSettings,
  fileSettingListResponse,
} from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER, ROLE_IMPORTER } from '../src/mocks/data/role';
import { transactionListResponse } from '../src/mocks/data/transaction';
import { validationErrorsResponse } from '../src/mocks/data/validation-error';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FileLog } from '../src/mocks/data/file-log';
import type { FileProcessLog } from '../src/mocks/data/file-process-log';

/* -------------------------------------------------------------------------- */
/* Addresses                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The transactions-service calls these two screens make, as the BROWSER addresses them:
 * the app's own `/transactions-api/*` mount point, never a service origin
 * (`lib/utils/constants.ts`). Matched on the PATHNAME rather than with a `**` glob so one
 * mock cannot swallow another — `/v1/files/download` and `/v1/files/validation-errors`
 * are siblings under a path a glob cannot tell apart.
 */
const FILE_LOGS_PATH = '/v1/file-logs';
const FILE_PROCESS_LOGS_PATH = '/v1/file-process-logs/';
const FILE_SETTINGS_PATH = '/v1/file-settings';
const TRANSACTIONS_PATH = '/v1/transactions';
const VALIDATION_ERRORS_PATH = '/v1/files/validation-errors';
const FILE_DOWNLOAD_PATH = '/v1/files/download';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright, and registered LAST in each test — Playwright matches the most
 * recently registered route first, so a call addressed at a live service is aborted and
 * fails visibly instead of being quietly answered by an origin-agnostic mock above it.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/* -------------------------------------------------------------------------- */
/* The two files in the register                                              */
/* -------------------------------------------------------------------------- */

/**
 * THE file this spec opens.
 *
 * `Validating` on purpose. It is the one status for which `/upload/file` renders neither
 * the import preview (`ImportPreview` shows nothing until validation has run) nor the
 * rejected rows (`RejectedRows` renders only for `Validation failed`) — so the page holds
 * the slip and the history and nothing else, and every value asserted below is really
 * about the SLIP rather than about a figure that happened to appear in a long listing of
 * file rows. Its record count (`96`) is also two digits wide where the neighbour's is
 * three, which is what lets a row be identified by its own count rather than by position.
 */
const OPENED = fileLogWithStatus(FILE_STATUS_VALIDATING, {
  Id: 5041,
  CurrentFileName: 'expenses_2026-04-27.csv',
  // Deliberately not any timestamp in the history below — see the integrity checks.
  ProcessDate: '2026-04-30 15:02:11',
});

/**
 * The second active setting, so the neighbouring file was submitted against a DIFFERENT
 * one and "the slip shows the opened file's setting" is a real claim about which file
 * loaded.
 */
const OTHER_SETTING = activeFileSettings().find(
  (setting) => setting.Name !== OPENED.SettingName,
);

if (!OTHER_SETTING) {
  throw new Error(
    'activeFileSettings() no longer offers a second setting name, so both files below ' +
      'would carry the same setting and the slip could not be shown to state the ' +
      "opened file's own.",
  );
}

/**
 * The file in the row NEXT to it: another name, another setting, another status, another
 * record count, another processed time and another activity. Nothing about it is shared
 * with `OPENED`, which is what lets the assertions below tell "the file I opened" from
 * "a file that was on the register".
 */
const OTHER = fileLogWithStatus(FILE_STATUS_IMPORTED, {
  Id: 5042,
  CurrentFileName: 'expenses_2026-04-18.csv',
  ProcessDate: '2026-04-18 11:37:00',
  SettingName: OTHER_SETTING.Name,
});

const LISTED_FILES: FileLog[] = [OPENED, OTHER];

/* -------------------------------------------------------------------------- */
/* The opened file's processing history                                       */
/* -------------------------------------------------------------------------- */

/**
 * The activity that FINISHED: its own name, the outcome the service recorded for it, and
 * both of its times. This is what "the history lists its activities" is asserted on.
 */
const COMPLETED_ACTIVITY = createFileProcessLog({
  FileName: OPENED.CurrentFileName,
});

/**
 * The activity still RUNNING — which, with the receipt above it, is the coherent history
 * of a file the service reports as `Validating`. It is listed by name below and nothing
 * more: its absent outcome and absent finish time are AC-4, which the Vitest layer owns.
 */
const RUNNING_ACTIVITY = runningFileProcessLog({
  FileName: OPENED.CurrentFileName,
});

const OPENED_HISTORY: FileProcessLog[] = [COMPLETED_ACTIVITY, RUNNING_ACTIVITY];

/**
 * The completed activity's outcome and finish time as their own constants, because the
 * contract types both as optional (an activity still running has neither) — the guard
 * below is what makes them strings the assertions can be written against.
 */
const { DecisionResult: COMPLETED_OUTCOME, EndDate: COMPLETED_FINISHED } =
  COMPLETED_ACTIVITY;

/** The four columns the history has always had (R18 restyles them; it renames nothing). */
const HISTORY_COLUMNS = ['Activity', 'Outcome', 'Started', 'Finished'];

/* -------------------------------------------------------------------------- */
/* Fixture integrity — the criteria are only tested if these hold             */
/* -------------------------------------------------------------------------- */

if (COMPLETED_OUTCOME === undefined || COMPLETED_FINISHED === undefined) {
  throw new Error(
    'createFileProcessLog() no longer returns a COMPLETED activity, so nothing below ' +
      'asserts that a recorded outcome and finish time reach the reader.',
  );
}

if (
  OPENED.CurrentStatus === FILE_STATUS_IMPORTED ||
  OPENED.CurrentStatus === FILE_STATUS_VALIDATION_FAILED
) {
  throw new Error(
    `The opened file's status (${OPENED.CurrentStatus}) makes /upload/file render the ` +
      'import preview and/or the rejected rows as well, whose own figures could satisfy ' +
      'the slip assertions below. Open a file whose validation has not run.',
  );
}

if (
  OTHER.CurrentFileName.includes(OPENED.CurrentFileName) ||
  OPENED.CurrentFileName.includes(OTHER.CurrentFileName)
) {
  throw new Error(
    "One listed file's name contains the other's, so a row located by name could match " +
      'both and the wrong file could be opened without the test noticing.',
  );
}

if (
  OTHER.SettingName === OPENED.SettingName ||
  OTHER.RecordCount === OPENED.RecordCount ||
  OTHER.CurrentStatus === OPENED.CurrentStatus ||
  OTHER.LastExecutedActivityName === OPENED.LastExecutedActivityName ||
  OTHER.ProcessDate === OPENED.ProcessDate
) {
  throw new Error(
    'The two listed files share one of the five values a slip states, so "the slip ' +
      'describes the file that was opened" could pass while showing the neighbour.',
  );
}

/**
 * Everything the history TABLE puts on screen. None of the slip's five values may appear
 * in it: otherwise "the slip states the record count" (and the rest) could be satisfied
 * by a history cell instead of by the slip.
 */
const HISTORY_TEXT = OPENED_HISTORY.flatMap((activity) => [
  activity.ActivityName,
  activity.DecisionResult ?? '',
  activity.StartDate,
  activity.EndDate ?? '',
]).join(' | ');

for (const value of [
  OPENED.SettingName,
  OPENED.ProcessDate,
  OPENED.CurrentStatus,
  OPENED.RecordCount,
  OPENED.LastExecutedActivityName,
]) {
  if (HISTORY_TEXT.includes(value)) {
    throw new Error(
      `"${value}" is one of the slip's five values AND appears in the served processing ` +
        'history, so the slip assertions below could pass on a history cell instead.',
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Mocks                                                                      */
/* -------------------------------------------------------------------------- */

/** A mocked JSON response, built from a project-wide factory body. */
const jsonResponse = (
  body: unknown,
): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/** Blocks the live services outright (see LIVE_BACKEND_ORIGINS). Registered last. */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Answers a browser-side identity read from the shared userinfo source, so it can never
 * disagree with what the Node-side stub returns for the same session. No userinfo body is
 * written here — `userInfoFor` is the one place that shape lives.
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
 * Serves every transactions-service call these two screens can make.
 *
 * Deliberately NOT "one response per request": the browser may legitimately read the same
 * thing more than once for a single on-screen state (React's development double-render,
 * and this page's own 15s catch-up while a file is still working), and a queue would then
 * hand a state to the wrong render.
 */
const serveTransactionsService = async (
  page: Page,
  { files, history }: { files: FileLog[]; history: FileProcessLog[] },
): Promise<void> => {
  await page.route(
    (url) => url.pathname.endsWith(FILE_LOGS_PATH),
    (route) => route.fulfill(jsonResponse(fileLogListResponse(files))),
  );

  await page.route(
    (url) => url.pathname.includes(FILE_PROCESS_LOGS_PATH),
    (route) => route.fulfill(jsonResponse(fileProcessLogListResponse(history))),
  );

  // The /upload submission slip's named settings, and the delete confirmation's request
  // count. Neither is asserted here; both are served so neither can fall through the app's
  // own proxy to the live transactions service.
  await page.route(
    (url) => url.pathname.endsWith(FILE_SETTINGS_PATH),
    (route) => route.fulfill(jsonResponse(fileSettingListResponse())),
  );
  await page.route(
    (url) => url.pathname.endsWith(TRANSACTIONS_PATH),
    (route) => route.fulfill(jsonResponse(transactionListResponse([]))),
  );

  // The rejected-rows read, answered as "the service found nothing wrong" — an answer, not
  // a failure. The opened file's status means that section renders nothing at all (see the
  // integrity check), so this is a fence against a live call rather than a fixture
  // anything below depends on.
  await page.route(
    (url) => url.pathname.endsWith(VALIDATION_ERRORS_PATH),
    (route) => route.fulfill(jsonResponse(validationErrorsResponse([]))),
  );

  // The import preview's own source. Likewise never asked for by a file whose validation
  // has not run; refused rather than answered, so a read that DID happen shows up as a
  // visible change on the page instead of silently reaching the real service.
  await page.route(
    (url) => url.pathname.endsWith(FILE_DOWNLOAD_PATH),
    (route) => route.fulfill({ status: 404 }),
  );
};

/**
 * Puts the browser in a signed-in state without driving the sign-in form and without any
 * real credential: the mock `session` cookie the Node-side stub recognises for this role.
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
/* Locators                                                                   */
/* -------------------------------------------------------------------------- */

/** The screen's own content — Next.js renders a body-level route announcer outside it. */
const screenOf = (page: Page): Locator => page.getByRole('main');

/** One file's row in the register, found by the file's OWN name — never by position. */
const registerRowFor = (page: Page, file: FileLog): Locator =>
  screenOf(page).getByRole('row').filter({ hasText: file.CurrentFileName });

/**
 * A row's way into the file, found by WHERE IT GOES rather than by what it is called: the
 * wording is the developer's, the destination is the contract. Requiring an `a[href]` also
 * pins that it stays a real navigational link through the restyle.
 */
const openLinkIn = (row: Locator): Locator =>
  row.locator(`a[href*="${SUBMITTED_FILE_PATH}"]`);

/**
 * One file's address, tolerant of another query parameter travelling alongside `LogId`
 * (the order and the rest of the query are the developer's).
 */
const fileAddressPattern = (file: FileLog): RegExp =>
  new RegExp(`${SUBMITTED_FILE_PATH}\\?(.*&)?LogId=${String(file.Id)}(&|$)`);

/** `value` as a whole-text match, with any regular-expression meaning of its own removed. */
const exactly = (value: string): RegExp =>
  new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

/**
 * The element inside `region` whose WHOLE text is `value` — the strong form for a single
 * word or a bare figure, which a `toContainText` over a whole region could match inside a
 * longer string (the status `Validating` inside the activity `Validating rows`; a record
 * count inside a timestamp).
 *
 * `.first()` because one value is legitimately carried by an element AND its wrapper — the
 * status mark sets its words in a span inside the span that inks them — and both of those
 * are the same value on screen.
 */
const valueOnItsOwn = (region: Locator, value: string): Locator =>
  region.getByText(exactly(value)).first();

/**
 * The one table on the opened file's page: its processing history. The opened file's status
 * means neither the import preview nor the rejected rows render a listing of their own (see
 * the integrity check), so this cannot resolve to another table — and if a second one ever
 * appears here, Playwright's strict mode says so rather than asserting against the wrong
 * one.
 */
const processingHistory = (page: Page): Locator =>
  screenOf(page).getByRole('table');

/** One recorded activity's row, found by the activity's own name. */
const historyRowFor = (page: Page, activity: FileProcessLog): Locator =>
  processingHistory(page)
    .getByRole('row')
    .filter({ hasText: activity.ActivityName });

/* -------------------------------------------------------------------------- */
/* The five values, asserted the same way on both screens                     */
/* -------------------------------------------------------------------------- */

/**
 * AC-2: the five things a file states about itself — the setting it was submitted against,
 * when it was processed, its status, its record count and its most recent activity — as the
 * service reported them (BR10: presentation only; nothing is recomputed or reformatted).
 *
 * ONE function, run against the register row AND against the slip that opens from it, so
 * "the header still states the same five things with the same values as the row it was
 * opened from" is asserted as literally that: the same five checks passing on both screens.
 *
 * The status and the record count are matched as whole-text elements rather than by
 * containment — see {@link valueOnItsOwn}. Nothing here touches how any of it is drawn: the
 * slip's lettering, its labels and its rules are AC-1/AC-3, which only a person can judge.
 */
const expectStatesTheFile = async (
  region: Locator,
  file: FileLog,
  where: string,
): Promise<void> => {
  await expect(
    region,
    `${where} must show the setting ${file.CurrentFileName} was submitted against`,
  ).toContainText(file.SettingName);

  await expect(
    region,
    `${where} must show when ${file.CurrentFileName} was processed, exactly as the service reported it`,
  ).toContainText(file.ProcessDate);

  await expect(
    region,
    `${where} must show the most recent activity recorded for ${file.CurrentFileName}`,
  ).toContainText(file.LastExecutedActivityName);

  await expect(
    valueOnItsOwn(region, file.CurrentStatus),
    `${where} must state ${file.CurrentFileName}'s status in the service's own words`,
  ).toBeVisible();

  await expect(
    valueOnItsOwn(region, file.RecordCount),
    `${where} must state ${file.CurrentFileName}'s own record count`,
  ).toBeVisible();
};

test.describe("Epic files-view-redesign, Story 3: a file's own slip, and its processing history", () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-2 — the CROSS-SCREEN half of it, which no component test can reach: the slip is
  // compared with the register row it was actually opened from, by following that row's
  // own link.
  test('a file opened from its row in the register states the same setting, processed time, status, record count and most recent activity as that row', async ({
    page,
    context,
  }) => {
    await serveTransactionsService(page, {
      files: LISTED_FILES,
      history: OPENED_HISTORY,
    });
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await seedSession(context, ROLE_IMPORTER);
    await blockLiveBackends(page);

    await page.goto(UPLOAD_PATH);

    // What the ROW says about the file — the values the slip is then held to.
    const row = registerRowFor(page, OPENED);
    await expect(
      row,
      `the register must list ${OPENED.CurrentFileName}`,
    ).toBeVisible();
    await expectStatesTheFile(row, OPENED, "the file's row in the register");

    // The way in is that row's own link, addressed at that file and no other.
    const openFile = openLinkIn(row);
    await expect(
      openFile,
      `${OPENED.CurrentFileName}'s row must still offer a way to open that file`,
    ).toBeVisible();
    await expect(
      openFile,
      `the way into ${OPENED.CurrentFileName} must address that file (LogId=${String(OPENED.Id)})`,
    ).toHaveAttribute('href', fileAddressPattern(OPENED));

    // Walked, not typed: opening the file from its row IS the journey this criterion is
    // about.
    await openFile.click();
    await expect(page).toHaveURL(fileAddressPattern(OPENED));

    const slip = screenOf(page);
    await expect(
      slip,
      'the opened page must name the file it is about',
    ).toContainText(OPENED.CurrentFileName);

    // The same five checks that just passed on the row, now on the slip.
    await expectStatesTheFile(slip, OPENED, "the opened file's slip");

    // ...and they are THIS file's: the file in the neighbouring row is not what opened.
    await expect(
      slip,
      `opening ${OPENED.CurrentFileName} must not show ${OTHER.CurrentFileName}`,
    ).not.toContainText(OTHER.CurrentFileName);
    await expect(
      slip,
      `opening ${OPENED.CurrentFileName} must not show the setting ${OTHER.CurrentFileName} was submitted against`,
    ).not.toContainText(OTHER.SettingName);
  });

  // AC-2 for the other role this story serves (R23: either role opens a file, reads its
  // slip and reads its history), together with the history the slip sits above — asserted
  // after a real navigation, so the history on screen is the history of the file whose row
  // was followed.
  test('an Approver opening the same file from the register reads its processing history, each activity carrying the outcome and times the service recorded', async ({
    page,
    context,
  }) => {
    await serveTransactionsService(page, {
      files: LISTED_FILES,
      history: OPENED_HISTORY,
    });
    await mockBrowserIdentityCall(page, ROLE_APPROVER);
    await seedSession(context, ROLE_APPROVER);
    await blockLiveBackends(page);

    await page.goto(UPLOAD_PATH);
    await openLinkIn(registerRowFor(page, OPENED)).click();
    await expect(page).toHaveURL(fileAddressPattern(OPENED));

    // An Approver gets the file's own slip too — enough of it here to prove which file
    // loaded; all five values are the test above.
    const slip = screenOf(page);
    await expect(
      slip,
      'an Approver must be able to read the file they opened',
    ).toContainText(OPENED.CurrentFileName);
    await expect(
      valueOnItsOwn(slip, OPENED.RecordCount),
      "an Approver's slip must state the file's own record count",
    ).toBeVisible();

    // The history is still a table with its four named columns — the semantics a screen
    // reader navigates by (R18 restyles those heads; it renames nothing). How they are
    // DRAWN is AC-3, which only a person can judge.
    for (const column of HISTORY_COLUMNS) {
      await expect(
        processingHistory(page).getByRole('columnheader', {
          name: column,
          exact: true,
        }),
        `the processing history must still name its "${column}" column`,
      ).toBeVisible();
    }

    // The activity that finished: its own name, the outcome recorded for it, and both of
    // its times.
    const completed = historyRowFor(page, COMPLETED_ACTIVITY);
    await expect(
      completed,
      `the history must list the "${COMPLETED_ACTIVITY.ActivityName}" activity recorded for this file`,
    ).toBeVisible();
    await expect(
      completed,
      'a finished activity must carry the outcome the service recorded for it',
    ).toContainText(COMPLETED_OUTCOME);
    await expect(
      completed,
      'a finished activity must carry the time it started',
    ).toContainText(COMPLETED_ACTIVITY.StartDate);
    await expect(
      completed,
      'a finished activity must carry the time it finished',
    ).toContainText(COMPLETED_FINISHED);

    // The activity still running is listed as well, with the one time it has. What its two
    // empty cells SAY is AC-4 — the Vitest layer's, deliberately not restated here.
    const running = historyRowFor(page, RUNNING_ACTIVITY);
    await expect(
      running,
      'an activity still running must be listed too, not held back until it finishes',
    ).toBeVisible();
    await expect(
      running,
      'an activity still running must carry the time it started',
    ).toContainText(RUNNING_ACTIVITY.StartDate);
  });
});
