/**
 * Story Metadata:
 * - Epic: expense-file-upload — Story 3: watch a file finish importing
 * - Route: /upload
 * - Target File: web/src/app/(authenticated)/upload/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R10, BR2, BR5 (+ Feature NFR "List currency")
 *
 * Covers the `playwright`-tagged criteria only:
 * - AC-1 — a file listed with an in-progress status updates its status, most recent
 *   processing activity and record count on screen, with no page reload
 * - AC-4 — once no listed file is still in progress, the screen stops re-requesting
 *   the list on its own
 * - AC-6 — the completed expense files screen (list + status labels + submit form)
 *   passes an accessibility scan in a real browser
 * AC-2 (the imported notification), AC-3 (validation-failed shows, no notification)
 * and AC-5 (a failed background refresh keeps the last known values) are the Vitest
 * layer's and are deliberately not repeated here (testing-policy.md § "one tag, one
 * layer").
 *
 * AC-6 is THIS EPIC'S single real-browser accessibility scan: all three stories
 * modify the same `/upload` screen, so it is scanned once here, complete — the file
 * list with every status label the brief lists, plus story 2's submit form. It uses
 * the same mechanism and the same WCAG tag set as epic 1's scan
 * (`epic-sign-in-and-app-shell-story-3-app-shell-identity-and-sign-out.spec.ts`).
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy
 * ---------------------------------------------------------------------------
 * Backend calls are ALWAYS mocked — this spec never contacts a live backend and
 * never uses a real credential (testing-policy.md § "Playwright runs against mocks,
 * never live"), even though project.md records both real services as running on this
 * machine. Two boundaries, one contract:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. `/upload` is gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared userinfo source, keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` below, for the transactions-service reads this
 *    screen makes (`/transactions-api/v1/file-logs`,
 *    `/transactions-api/v1/file-settings`) and the identity call in case a client
 *    component reads it, plus a hard block on the real services' own origins
 *    (project.md records them at :4424 / :4423) so no browser-side call can leak to a
 *    live backend even if the app were wired to the wrong origin.
 *
 * Every response body comes from the project-wide mock data in `web/src/mocks/data/`
 * (`file-log.ts`, `file-setting.ts`, `identity.ts`, `role.ts`) — no response shape is
 * authored in this file. The successive snapshots of the SAME file come from
 * `fileLogProgression()`, which keeps id, name, setting and process date stable
 * across statuses; that is what makes "the row changed" distinguishable from "a
 * second row appeared".
 *
 * Implementation patterns this spec assumes (read before implementing):
 * - The file list is read FROM THE BROWSER — the client-side API client against the
 *   app's own `/transactions-api/...` address (story 1's infrastructure note), which
 *   is also the only way a polling refresh can exist. `page.route()` cannot
 *   intercept a read issued from the Next.js server, so a server-only list fetch
 *   would both break this spec and make the refresh impossible.
 * - The refresh re-reads `GET /transactions-api/v1/file-logs?IsActive=Yes` on a
 *   timer while any listed file is in an in-progress status (`Uploaded` /
 *   `Validating`), and stops once nothing listed is in progress. The interval is the
 *   implementation's choice, but must be no longer than
 *   `POLL_TICK_MS` (60s) — this spec advances the browser clock by that much to buy
 *   exactly one refresh, so a longer interval would look like "it never refreshed".
 * - The list renders as a table (Shadcn `table` — story 1), so each file is a `row`
 *   and rows are addressed by the file's own name, never by position.
 * - Status, most recent activity and record count are displayed exactly as the
 *   service returned them (brief BR5) — the assertions below compare against the
 *   mock's own values, so any translation or reformatting fails them.
 * - The screen lives inside epic 1's signed-in shell, so its content is within
 *   `main`; all queries here are scoped to it (Next.js also renders a permanently
 *   empty body-level `role="alert"` route announcer outside `main`).
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie
 * (epic 1 BR2), seeded directly rather than by driving the sign-in form — epic 1's
 * story 2 spec owns that journey. Cookies ignore port, so one seed works for the dev
 * server (:3000) and the epic-end production run (:3100). `Secure` is omitted
 * because the E2E server is plain http on localhost.
 *
 * TIMING — why nothing here waits real time:
 * The refresh is timer-driven, so the browser clock is driven with Playwright's
 * `page.clock`: `install()` before navigating, then `fastForward()` to buy refreshes
 * at the REAL configured interval. `fastForward` fires each due timer at most once,
 * so one jump = one refresh, whatever interval the implementation chose. No
 * test-only "short interval" prop is needed in production code, and no test sits
 * waiting. The accessibility scan (AC-6) deliberately runs WITHOUT the fake clock —
 * axe is never run under faked timers.
 *
 * These tests WILL FAIL until implemented (TDD red).
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import {
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_WARNING_LEAD_MS,
} from '../src/lib/session/config';
import {
  FILE_STATUS_IMPORTED,
  FILE_STATUS_UPLOADED,
  FILE_STATUS_VALIDATING,
  fileLogListResponse,
  fileLogProgression,
  fileLogsInEveryStatus,
} from '../src/mocks/data/file-log';
import { fileSettingListResponse } from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FileLog } from '../src/mocks/data/file-log';

/** The expense files screen this epic builds (story metadata Route). */
const UPLOAD_ROUTE = '/upload';

/**
 * The two transactions-service reads this screen makes, as the BROWSER addresses
 * them: the app's own `/transactions-api/*` mount point (never the service's origin
 * — `web/src/lib/utils/constants.ts`). Trailing `**` so the query string
 * (`?IsActive=Yes`) is covered.
 */
const FILE_LOGS_URL_GLOB = '**/transactions-api/v1/file-logs**';
const FILE_SETTINGS_URL_GLOB = '**/transactions-api/v1/file-settings**';

/** The list call's required query (brief §Notes: `IsActive` is required). */
const ACTIVE_FILES_QUERY = 'IsActive=Yes';

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
 * NFRs, superseding the template's 2.1 AA floor). The identical tag set epic 1's
 * scan used. Scoped explicitly because axe's defaults also run best-practice rules,
 * which would fail this spec on issues outside the agreed bar.
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
 * Browser time bought per refresh. `fastForward` fires each due timer at most once,
 * so one jump buys exactly one refresh for any interval up to this length.
 */
const POLL_TICK_MS = 60_000;

/** Browser time to sit through after everything has settled, watching for a stray refresh. */
const SETTLED_WATCH_MS = 180_000;

/** Real-time window in which a stray refresh would arrive, if one were still scheduled. */
const STRAY_REFRESH_WINDOW_MS = 3_000;

/**
 * The clock jumps above are idle time as far as epic 1's idle-session manager is
 * concerned (nothing here clicks or types), so they have to stay comfortably inside
 * the idle window or the session would end mid-test. Checked against the app's own
 * configured values.
 *
 * Note: this process reads the same env names the app does, but does not load
 * `web/.env.local` — so if you shorten the idle timings there for manual testing,
 * shorten `SETTLED_WATCH_MS` to match.
 */
const CLOCK_BUDGET_MS = 2 * POLL_TICK_MS + SETTLED_WATCH_MS;

if (CLOCK_BUDGET_MS >= SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_LEAD_MS) {
  throw new Error(
    `This spec advances the browser clock by ${CLOCK_BUDGET_MS}ms of idle time, ` +
      `which reaches the configured session idle window ` +
      `(${SESSION_IDLE_TIMEOUT_MS}ms idle, ${SESSION_WARNING_LEAD_MS}ms warning ` +
      `lead) — the session would end mid-test. Lower SETTLED_WATCH_MS or raise ` +
      `NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_SECONDS.`,
  );
}

/**
 * Attribute stamped on the document element once the first render is on screen. A
 * client-side update leaves it alone; a document reload wipes it — so finding it at
 * the end is the proof that the row advanced WITHOUT the page being reloaded (AC-1).
 */
const NO_RELOAD_MARKER = 'data-e2e-no-reload';

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
 * never disagree with what the Node-side stub returns for the same session. The
 * server-side gate is answered by the stub, not by this route.
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
 * The file settings story 2's submit form offers. Mocked in every test here (even
 * the ones that never submit) so the screen's own second read cannot fall through
 * to a live service.
 */
const mockFileSettings = async (page: Page): Promise<void> => {
  await page.route(FILE_SETTINGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileSettingListResponse())),
  );
};

/** What the mocked file-logs endpoint is currently serving, and what it has been asked. */
interface FileLogFeed {
  /** Change what the NEXT read of the list returns — the service moving on. */
  show: (logs: FileLog[]) => void;
  /** Every list URL the browser has asked for, in order. */
  requests: string[];
}

/**
 * Serves the file list, returning whatever the test last called `show()` with.
 *
 * Deliberately NOT "one snapshot per request": the browser may legitimately read the
 * list more than once for a single on-screen state (React's development double-render
 * being the obvious case), and a queue would then silently skip a status. Keeping the
 * served body under the TEST's control means each assertion below is about one exact
 * transition.
 */
const serveFileLogs = async (
  page: Page,
  initial: FileLog[],
): Promise<FileLogFeed> => {
  let current = initial;
  const requests: string[] = [];

  await page.route(FILE_LOGS_URL_GLOB, (route) => {
    requests.push(route.request().url());
    return route.fulfill(jsonResponse(fileLogListResponse(current)));
  });

  return {
    show: (logs: FileLog[]) => {
      current = logs;
    },
    requests,
  };
};

/**
 * Puts the browser in a signed-in state without driving the sign-in form and without
 * any real credential: the mock `session` cookie the Node-side stub recognises for
 * this role.
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

/** One file's row, found by the file's own name — never by position. */
const fileRow = (page: Page, fileName: string): Locator =>
  page.getByRole('main').getByRole('row').filter({ hasText: fileName });

/** Stamps the reload marker on the document currently on screen. */
const markCurrentDocument = async (page: Page): Promise<void> => {
  await page.evaluate((attribute) => {
    document.documentElement.setAttribute(attribute, 'kept');
  }, NO_RELOAD_MARKER);
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
    `WCAG 2.2 AA violations on the expense files screen (${state})`,
  ).toEqual([]);
};

test.describe('Epic expense-file-upload, Story 3: watch a file finish importing', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-1
  test('a file still being processed brings its own row up to date — no reload, nothing clicked', async ({
    page,
    context,
  }) => {
    // The SAME file at three successive statuses: one id, one name, one setting —
    // so a changed row is unmistakably a changed row.
    const [uploaded, validating, imported] = fileLogProgression([
      FILE_STATUS_UPLOADED,
      FILE_STATUS_VALIDATING,
      FILE_STATUS_IMPORTED,
    ]);

    // Control the browser clock before anything schedules a timer, so the real
    // configured refresh interval can be crossed instantly.
    await page.clock.install();
    await blockLiveBackends(page);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await mockFileSettings(page);
    const feed = await serveFileLogs(page, [uploaded]);
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(UPLOAD_ROUTE);

    // As it lands: the file is in progress, showing the service's own status and
    // most recent processing step.
    const row = fileRow(page, uploaded.CurrentFileName);
    await expect(row).toContainText(uploaded.CurrentStatus);
    await expect(row).toContainText(uploaded.LastExecutedActivityName);

    // Marked AFTER the first paint, so only a reload from here on could remove it.
    await markCurrentDocument(page);

    // The service moves the file on. Nobody touches the browser — no click, no
    // keypress, no reload: only time passes.
    feed.show([validating]);
    await page.clock.fastForward(POLL_TICK_MS);

    await expect(row).toContainText(validating.CurrentStatus);
    await expect(row).toContainText(validating.LastExecutedActivityName);
    // Record count now that there is one to show. (The `Uploaded` snapshot's "0" is
    // deliberately not asserted: a bare 0 also occurs inside the process date, so it
    // proves nothing about the record-count value.)
    await expect(row).toContainText(validating.RecordCount);
    await expect(row).not.toContainText(uploaded.CurrentStatus);
    await expect(row).not.toContainText(uploaded.LastExecutedActivityName);

    // Still nothing but time passing — and the file finishes importing.
    feed.show([imported]);
    await page.clock.fastForward(POLL_TICK_MS);

    await expect(row).toContainText(imported.CurrentStatus);
    await expect(row).toContainText(imported.LastExecutedActivityName);
    await expect(row).toContainText(imported.RecordCount);
    await expect(row).not.toContainText(validating.CurrentStatus);
    await expect(row).not.toContainText(validating.LastExecutedActivityName);
    await expect(row).not.toContainText(validating.RecordCount);

    // Brought up to date in place: one row for this file throughout, not a fresh
    // row per refresh.
    await expect(row).toHaveCount(1);

    // ...and the page the user is looking at is the one they opened: no reload
    // happened between the first status and the last.
    await expect(page.locator('html')).toHaveAttribute(
      NO_RELOAD_MARKER,
      'kept',
      { timeout: 1_000 },
    );

    // Each refresh re-read the ACTIVE files list, as the service requires.
    expect(
      feed.requests.filter((url) => !url.includes(ACTIVE_FILES_QUERY)),
      `every file-list read must carry ${ACTIVE_FILES_QUERY} (brief §Notes: IsActive is a required query parameter)`,
    ).toEqual([]);
  });

  // AC-4
  test('once no listed file is in progress, the screen stops re-requesting the list', async ({
    page,
    context,
  }) => {
    const [validating, imported] = fileLogProgression([
      FILE_STATUS_VALIDATING,
      FILE_STATUS_IMPORTED,
    ]);

    await page.clock.install();
    await blockLiveBackends(page);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await mockFileSettings(page);
    const feed = await serveFileLogs(page, [validating]);
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(UPLOAD_ROUTE);

    // The file is in progress, so the screen is refreshing itself...
    const row = fileRow(page, validating.CurrentFileName);
    await expect(row).toContainText(validating.CurrentStatus);

    // ...until it finishes, which the screen picks up on its own.
    feed.show([imported]);
    await page.clock.fastForward(POLL_TICK_MS);
    await expect(row).toContainText(imported.CurrentStatus);

    const readsWhileProcessing = feed.requests.length;

    // Now watch for one more list read, over a real-time window, while three
    // minutes of browser time pass. Nothing listed is in progress any more, so
    // nothing should arrive. This is the observable consequence — no timer, hook or
    // interval of the implementation's is inspected.
    const strayRefresh = page
      .waitForRequest(FILE_LOGS_URL_GLOB, { timeout: STRAY_REFRESH_WINDOW_MS })
      .then((request) => request.url())
      .catch(() => null);

    await page.clock.fastForward(SETTLED_WATCH_MS);

    expect(
      await strayRefresh,
      `no file is in progress, so the file list must not be re-requested — ${SETTLED_WATCH_MS / 60_000} minutes of browser time produced another read`,
    ).toBeNull();
    expect(
      feed.requests.length,
      'the number of file-list reads must stop growing once nothing is in progress',
    ).toBe(readsWhileProcessing);

    // The quiet stretch left the user exactly where they were, still looking at the
    // finished file — the screen went quiet, not blank.
    await expect(page).toHaveURL(new RegExp(`${UPLOAD_ROUTE}$`));
    await expect(row).toContainText(imported.CurrentStatus);
    await expect(row).toContainText(imported.RecordCount);
  });

  // AC-6
  // This epic's single real-browser accessibility scan, on the finished screen as a
  // Importer — the one role that sees BOTH surfaces the epic adds: the file
  // list (with a status label for every status value the brief lists, so the status
  // chips' colour/contrast pairings are all covered) and story 2's submit form.
  // No fake clock here: axe is never run under faked timers. The mocked list serves
  // one unchanging body, so a refresh cannot alter the DOM under the scan.
  test('the completed expense files screen — list, status labels and submit form — has no accessibility violations', async ({
    page,
    context,
  }) => {
    const files = fileLogsInEveryStatus();

    await blockLiveBackends(page);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await mockFileSettings(page);
    await serveFileLogs(page, files);
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(UPLOAD_ROUTE);

    // Wait for the whole screen to be on display before scanning: every file's row
    // with its status label...
    for (const file of files) {
      await expect(
        fileRow(page, file.CurrentFileName),
        `the row for ${file.CurrentFileName} must show its status label "${file.CurrentStatus}" before the screen is scanned`,
      ).toContainText(file.CurrentStatus);
    }

    // ...and the submit surface the Importer is offered (story 2): the file
    // setting picker and the submit action.
    const uploadForm = page.getByRole('main');
    await expect(uploadForm.getByRole('combobox').first()).toBeVisible();
    await expect(
      uploadForm.getByRole('button', { name: /(submit|upload)/i }).first(),
    ).toBeVisible();

    await expectNoAccessibilityViolations(
      page,
      'the finished list plus the submit form',
    );
  });
});
