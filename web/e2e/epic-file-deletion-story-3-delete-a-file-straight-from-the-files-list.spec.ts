/**
 * Story Metadata:
 * - Epic: file-deletion — Delete a submitted file
 * - Story: 3 — Delete a file straight from the files list
 * - Route: /upload (the Expense files list, from `expense-file-upload`)
 * - Target File: web/src/components/files/SubmittedFilesList.tsx
 * - Page Action: modify_existing
 * - Requirements: R1, R5, R9, R10, R11, R12, BR2, BR3, BR5, BR7
 *
 * Coverage split (feature-planner tags — one tag, one layer). This file carries the
 * two `playwright`-tagged criteria and nothing else:
 * - AC-4 — confirming a delete from a row removes the file WITHOUT a page reload, the
 *   list shows what the service reports AFTER BEING ASKED AGAIN, and the list's
 *   existing self-refreshing behaviour still works afterwards.
 * - AC-6 — a row's delete action and its confirmation are reachable and completable
 *   by keyboard alone from the list, and the list passes an accessibility scan with
 *   the confirmation open.
 * AC-1 (the action on every row), AC-2 (an Approver's list carries none), AC-3 (the
 * confirmation is story 2's shared one) and AC-5 (a refused delete leaves the row
 * where it was, in the service's own words) are the Vitest layer's:
 * `web/src/__tests__/integration/epic-file-deletion-story-3-delete-a-file-straight-from-the-files-list.test.tsx`.
 *
 * AC-6 is the `/upload` SURFACE's real-browser accessibility scan for this epic —
 * the confirmation open over the files LIST, a state no earlier scan can reach
 * (`expense-file-upload` story 3 scanned the same screen before this action existed).
 * Story 1's spec owns the `/upload/file` surface's scan, so the two do not overlap.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy
 * ---------------------------------------------------------------------------
 * Backend calls are ALWAYS mocked — this spec never contacts a live backend and never
 * uses a real credential (testing-policy.md § "Playwright runs against mocks, never
 * live"), even though project.md records both real services as running on this
 * machine. Two boundaries, one contract — the same arrangement every earlier spec on
 * this screen uses:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. `/upload` is gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie value seeded below — which
 *    is also what decides, server-side, whether this list's rows carry a delete
 *    control at all (R5/BR2).
 * 2. Browser boundary → `page.route()` below, for everything this screen reads and
 *    everything the delete sends:
 *      GET    /transactions-api/v1/file-logs?IsActive=Yes   (the list, and its re-reads)
 *      GET    /transactions-api/v1/transactions             (the request count, R6/BR4)
 *      GET    /transactions-api/v1/file-settings            (story 2's submit form)
 *      DELETE /transactions-api/v1/files?LogId=<id>         (the one delete call, R9)
 *    Reads this story asserts nothing about are mocked anyway: `/transactions-api` is
 *    the app's OWN same-origin mount point, so an unmocked call is forwarded to the
 *    live transactions service by the route handler INSIDE the Next.js process, where
 *    `blockLiveBackends` cannot see it. The live services' own origins are blocked
 *    outright, registered LAST so they win over the origin-agnostic globs above them.
 *
 * Every response body comes from the project-wide factories under
 * `web/src/mocks/data/` (`file-log.ts`, `transaction.ts`, `file-setting.ts`,
 * `identity.ts`, `role.ts`) — no response shape and no canonical value is authored in
 * this file, so this spec and the Vitest layer cannot drift on the contract. In
 * particular `importedFileToDelete()` pairs the file with the requests it produced
 * (interleaved with two OTHER files' rows, which is what makes the client-side
 * `FileLogId` filter provable), and `fileLogsAfterDeleting()` /
 * `transactionsAfterDeletingFile()` are what the SERVICE reports once the delete has
 * genuinely landed.
 *
 * Implementation patterns this spec assumes (read before implementing):
 * - The list is read, and the delete is sent, FROM THE BROWSER through the shared API
 *   client at the app's own `/transactions-api/...` address (`lib/api/files.ts`).
 *   `page.route()` cannot intercept a fetch made by the Next.js server or by a Server
 *   Action, so moving either call server-side both bypasses these mocks and sends the
 *   request to the live transactions service.
 * - Each row offers the delete action as a control IN THE ROW, alongside the existing
 *   `Open` link — not hidden behind a row menu that must be opened first. AC-6 tabs
 *   straight to it.
 * - The labels are this epic's renamed three (R4), and they are deliberately not
 *   confusable with one another:
 *     row action        → /delete file/i        ("Delete the file" does not match it)
 *     confirming choice → /delete the file/i
 *     way out           → /keep the file/i
 * - The confirmation is story 2's SHARED one (a Shadcn `alert-dialog`, `role=
 *   "alertdialog"`, PORTALLED to the body), so dialog queries below are scoped to the
 *   dialog rather than to `main`. A second, list-only confirmation is a defect.
 * - On success the row disappears because the list RE-READ ITSELF through its existing
 *   read path (R12) — `GET /transactions-api/v1/file-logs?IsActive=Yes`, the same call
 *   the auto-refresh already makes, not a locally-spliced array and not a second
 *   timer. AC-4 proves that by answering the re-read with a body in which ANOTHER
 *   file has also moved on: a splice cannot produce that.
 * - The delete must not disturb `SubmittedFilesList`'s single existing interval: a
 *   file still in progress goes on catching up afterwards (R12).
 * - Nothing here navigates. Unlike the detail page's flow (story 1), which returns the
 *   user to the list, this is an in-place update: the URL stays `/upload` and the
 *   document is never reloaded.
 * - Every assertion on page content is scoped to `main`: Next.js renders a permanently
 *   empty body-level `role="alert"` route announcer, so an unscoped `alert` query
 *   always matches two elements. Rows are located by the FILE'S OWN NAME, never by
 *   position, so one file's delete can never be mistaken for another's.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie, seeded
 * directly rather than by driving the sign-in form (epic 1 story 2's spec owns that
 * journey). Cookies ignore port, so one seed serves the dev server (:3000) and the
 * epic-end production run (:3100). `Secure` is omitted because the E2E app is served
 * over plain http on localhost.
 *
 * TIMING — why nothing here waits real time: the list's refresh is timer-driven, so
 * AC-4 drives the browser clock with `page.clock` (`install()` before navigating, then
 * `fastForward()` past the REAL configured interval). No test-only "short interval"
 * prop is needed in production code and no test sits waiting. AC-6 runs WITHOUT the
 * fake clock — axe is never run under faked timers, and the dialog's real focus
 * behaviour is what that test is about.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
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
  FILE_STATUS_VALIDATION_FAILED,
  deleteSuccessResponse,
  fileLogListResponse,
  fileLogProgression,
} from '../src/mocks/data/file-log';
import { fileSettingListResponse } from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  fileLogsAfterDeleting,
  fileNeverImportedToDelete,
  importedFileToDelete,
  transactionListResponse,
  transactionsAfterDeletingFile,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FileLog } from '../src/mocks/data/file-log';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** The Expense files list this story adds the action to (story metadata Route). */
const UPLOAD_ROUTE = '/upload';

/** The list's address, for asserting the user never left it. */
const UPLOAD_URL_PATTERN = new RegExp(`${UPLOAD_ROUTE}$`);

/**
 * The transactions-service reads this screen makes, as the BROWSER addresses them:
 * the app's own `/transactions-api/*` mount point, never a service origin. Trailing
 * `**` so query strings are covered.
 */
const FILE_LOGS_URL_GLOB = '**/transactions-api/v1/file-logs**';
const TRANSACTIONS_URL_GLOB = '**/transactions-api/v1/transactions**';
const FILE_SETTINGS_URL_GLOB = '**/transactions-api/v1/file-settings**';

/** The list call's required query (brief §Notes: `IsActive` is required). */
const ACTIVE_FILES_QUERY = 'IsActive=Yes';

/**
 * The delete is `DELETE /transactions-api/v1/files?LogId=<id>` — the BARE `/v1/files`
 * path, which a glob cannot separate from its own children (`/files/download`,
 * `/files/retry-validation`), so it is matched exactly on the pathname instead.
 */
const isDeleteFileCall = (url: URL): boolean =>
  url.pathname.endsWith('/transactions-api/v1/files');

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright, and registered LAST in each test — Playwright matches the most
 * recently registered route first, so a call addressed at a live service fails
 * visibly instead of being quietly answered by an origin-agnostic mock above it.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * WCAG 2.2 AA — this project's effective accessibility bar (project.md §Baseline
 * NFRs, superseding the template's 2.1 AA floor), and the identical tag set every
 * earlier scan in this project used. Scoped explicitly because axe's defaults also
 * run best-practice rules, which would fail this spec on issues outside the agreed
 * bar.
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
 * This epic's three renamed labels (R4). Kept narrow and non-overlapping: the
 * destructive action, its confirmation and the way out must never be confusable, and
 * `/delete file/i` deliberately does not match "Delete the file".
 */
const DELETE_FILE_LABEL = /delete file/i;
const CONFIRM_DELETE_LABEL = /delete the file/i;
const KEEP_THE_FILE_LABEL = /keep the file/i;

/**
 * Browser time bought per refresh. `fastForward` fires each due timer at most once, so
 * one jump buys exactly one refresh for any interval up to this length —
 * `SubmittedFilesList` currently uses 15s, and this story must not change that.
 */
const POLL_TICK_MS = 60_000;

/** Real-time window in which the list's re-read after a delete must arrive. */
const RE_READ_WINDOW_MS = 5_000;

/**
 * The clock jump in AC-4 is idle time as far as epic 1's idle-session manager is
 * concerned, so it has to stay well inside the idle window or the session would end
 * mid-test. Checked against the app's own configured values.
 *
 * Note: this process reads the same env names the app does but does not load
 * `web/.env.local` — so if you shorten the idle timings there for manual testing,
 * shorten the budget here to match.
 */
const CLOCK_BUDGET_MS = 2 * POLL_TICK_MS;

if (CLOCK_BUDGET_MS >= SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_LEAD_MS) {
  throw new Error(
    `This spec advances the browser clock by ${String(CLOCK_BUDGET_MS)}ms of idle ` +
      `time, which reaches the configured session idle window ` +
      `(${String(SESSION_IDLE_TIMEOUT_MS)}ms idle, ` +
      `${String(SESSION_WARNING_LEAD_MS)}ms warning lead) — the session would end ` +
      `mid-test. Raise NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_SECONDS or lower POLL_TICK_MS.`,
  );
}

/**
 * Attribute stamped on the document element once the first render is on screen. A
 * client-side update leaves it alone; a document reload wipes it — so finding it at
 * the end is the proof that the row went WITHOUT the page being reloaded (AC-4).
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
 * server-side gate — which is what decides whether the rows carry a delete control at
 * all — is answered by the stub, not by this route.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(userInfoFor(roleName))),
  );
};

/** What the mocked transactions service is currently serving this screen. */
interface UploadScreenFeed {
  /** Change what the NEXT read of the active file list returns. */
  showFiles: (files: FileLog[]) => void;
  /** Change what the NEXT read of the expense payment requests returns. */
  showRequests: (requests: TransactionRead[]) => void;
}

/**
 * Serves every read the Expense files screen makes, returning whatever the test last
 * called `showFiles` / `showRequests` with.
 *
 * Deliberately NOT "one snapshot per request": the browser may legitimately read the
 * same thing more than once for a single on-screen state (React's development
 * double-render being the obvious case), and a queue would then silently skip a
 * snapshot. Keeping the served body under the TEST's control means each assertion
 * below is about one exact transition.
 */
const serveUploadScreen = async (
  page: Page,
  initialFiles: FileLog[],
  initialRequests: TransactionRead[],
): Promise<UploadScreenFeed> => {
  let files = initialFiles;
  let requests = initialRequests;

  await page.route(FILE_LOGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileLogListResponse(files))),
  );
  // The whole set, decoy rows and all — the app narrows to one file's requests in the
  // browser, because this endpoint takes no query parameters (BR4).
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse(requests))),
  );
  // Story 2's submit form, which shares this screen and reads the named settings for
  // itself. Served so it cannot fall through to a live service.
  await page.route(FILE_SETTINGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileSettingListResponse())),
  );

  return {
    showFiles: (next: FileLog[]) => {
      files = next;
    },
    showRequests: (next: TransactionRead[]) => {
      requests = next;
    },
  };
};

/** What the browser actually sent when it asked for a delete. */
interface DeleteCall {
  /** The `LogId` the delete call named, if one was sent — which file was deleted. */
  fileIdSent: () => string | null;
}

/**
 * Answers this story's one mutating call, and lets a test say what the service does as
 * a consequence (`onDeleted` changes what the reads then return).
 *
 * Registered in EVERY test: this is the only call in this epic that changes data, and
 * an unmocked one would be forwarded to the live transactions service by the app's own
 * proxy.
 */
const mockDeleteFile = async (
  page: Page,
  { onDeleted }: { onDeleted?: () => void } = {},
): Promise<DeleteCall> => {
  let fileId: string | null = null;

  await page.route(isDeleteFileCall, (route) => {
    const request = route.request();
    if (request.method() !== 'DELETE') {
      // Nothing in this story addresses this path with another method; letting one
      // through would forward it to the live transactions service.
      return route.abort();
    }
    fileId = new URL(request.url()).searchParams.get('LogId');
    onDeleted?.();
    return route.fulfill(jsonResponse(deleteSuccessResponse()));
  });

  return { fileIdSent: () => fileId };
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

/** One file's row, found by the file's OWN NAME — never by position. */
const fileRow = (page: Page, fileName: string): Locator =>
  page.getByRole('main').getByRole('row').filter({ hasText: fileName });

/** That row's own delete action, so one file's delete cannot be another's. */
const deleteActionIn = (row: Locator): Locator =>
  row.getByRole('button', { name: DELETE_FILE_LABEL });

/** Stamps the reload marker on the document currently on screen. */
const markCurrentDocument = async (page: Page): Promise<void> => {
  await page.evaluate((attribute) => {
    document.documentElement.setAttribute(attribute, 'kept');
  }, NO_RELOAD_MARKER);
};

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
 * keyboard-reachability assertion. The same helper epic 1's story 3, the file-upload
 * epic's story 2 and the csv-export epic's story 2 use.
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
      `"${key}" presses, so it cannot be operated by keyboard alone (AC-6).`,
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
    `WCAG 2.2 AA violations on the Expense files list (${state})`,
  ).toEqual([]);
};

test.describe('Epic file-deletion, Story 3: delete a file straight from the files list', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the identity it needs.
    await context.clearCookies();
  });

  // AC-4
  test('confirming a delete from a row drops the file because the list asked the service again — no reload, and the list goes on refreshing itself', async ({
    page,
    context,
  }) => {
    // The file being deleted, the requests it produced, and the two OTHER files whose
    // rows share the transactions response.
    const scenario = importedFileToDelete();

    // A DIFFERENT file, still being processed, at three successive statuses — one id,
    // one name — so a changed row is unmistakably that file changing. Its presence is
    // what keeps the list's existing refresh running, before the delete and after it.
    const [uploaded, validating, imported] = fileLogProgression([
      FILE_STATUS_UPLOADED,
      FILE_STATUS_VALIDATING,
      FILE_STATUS_IMPORTED,
    ]);

    // Control the browser clock before anything schedules a timer, so the real
    // configured refresh interval can be crossed instantly.
    await page.clock.install();
    const feed = await serveUploadScreen(
      page,
      [...scenario.fileLogs, uploaded],
      scenario.transactions,
    );
    const deleteCall = await mockDeleteFile(page, {
      onDeleted: () => {
        // What the service reports once the delete has landed: the file is gone from
        // the active list and its requests are gone with it — AND, in that same
        // answer, the file still being processed has moved on. A list that spliced
        // the deleted row out of the array it already had could not know that.
        feed.showFiles([...fileLogsAfterDeleting(scenario), validating]);
        feed.showRequests(transactionsAfterDeletingFile(scenario));
      },
    });
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await blockLiveBackends(page);
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(UPLOAD_ROUTE);

    // As it lands: the file to be deleted is listed, and so is a file still working.
    const targetRow = fileRow(page, scenario.file.CurrentFileName);
    const busyRow = fileRow(page, uploaded.CurrentFileName);
    await expect(targetRow).toContainText(FILE_STATUS_IMPORTED);
    await expect(busyRow).toContainText(FILE_STATUS_UPLOADED);

    // Marked AFTER the first paint, so only a reload from here on could remove it.
    await markCurrentDocument(page);

    // The delete is asked for against THAT row...
    await deleteActionIn(targetRow).click();

    // ...and confirmed in the shared confirmation, which names the file it is about.
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(scenario.file.CurrentFileName);

    // Watching from before the confirmation is accepted: the list must ASK the service
    // again, which is the only way the row may leave (R11/R12).
    const reReadAfterDelete = page
      .waitForRequest(FILE_LOGS_URL_GLOB, { timeout: RE_READ_WINDOW_MS })
      .then((request) => request.url())
      .catch(() => null);

    await confirmation
      .getByRole('button', { name: CONFIRM_DELETE_LABEL })
      .click();

    // The row is gone...
    await expect(targetRow).toHaveCount(0);

    // ...and everything else the service said in that same answer is on screen too:
    // the file still being processed has advanced. This is the difference between a
    // list that re-read itself and one that removed a row from an array it already
    // held — the latter could not possibly show this.
    await expect(busyRow).toContainText(FILE_STATUS_VALIDATING);
    await expect(busyRow).not.toContainText(FILE_STATUS_UPLOADED);

    // The other files the service still reports are untouched, so "the row went" is
    // distinguishable from "the list emptied or failed".
    for (const remaining of fileLogsAfterDeleting(scenario)) {
      await expect(fileRow(page, remaining.CurrentFileName)).toBeVisible();
    }

    // The service was genuinely asked again, through the list's existing read.
    const reReadUrl = await reReadAfterDelete;
    expect(
      reReadUrl,
      'after a confirmed delete the list must re-read GET /v1/file-logs — a row that ' +
        'disappears without the service ever being asked again is a spliced array ' +
        'standing in for the service’s answer (R12, Feature NFR "List currency")',
    ).not.toBeNull();
    expect(
      reReadUrl,
      `that re-read must be the list's existing call, carrying ${ACTIVE_FILES_QUERY}`,
    ).toContain(ACTIVE_FILES_QUERY);

    // It was THIS row's file that was deleted, named by its own id.
    expect(
      deleteCall.fileIdSent(),
      'the delete must name the file whose row it was asked from (LogId)',
    ).toBe(String(scenario.file.Id));

    // Nothing navigated and nothing reloaded: the user is still on the list they were
    // looking at, in the very same document.
    await expect(page).toHaveURL(UPLOAD_URL_PATTERN);
    await expect(page.locator('html')).toHaveAttribute(
      NO_RELOAD_MARKER,
      'kept',
      { timeout: 1_000 },
    );

    // And the list's own self-refreshing behaviour survived the delete: the file still
    // being processed goes on catching up, with nobody touching the browser — only
    // time passing (R12).
    feed.showFiles([...fileLogsAfterDeleting(scenario), imported]);
    await page.clock.fastForward(POLL_TICK_MS);

    await expect(busyRow).toContainText(FILE_STATUS_IMPORTED);
    await expect(busyRow).not.toContainText(FILE_STATUS_VALIDATING);
    await expect(busyRow).toHaveCount(1);
    await expect(targetRow).toHaveCount(0);
  });

  // AC-6
  // Keyboard alone, end to end, in a real browser — real focus management, real
  // Enter, real focus trapping — followed by this epic's accessibility scan of the
  // `/upload` surface in the one state no earlier scan could reach: the confirmation
  // open over the list. No fake clock: axe is never run under faked timers, and every
  // listed file here is settled, so nothing refreshes underneath the scan.
  test('a row’s delete action and its confirmation are completable by keyboard alone, and the list with the confirmation open has no accessibility violations', async ({
    page,
    context,
  }) => {
    const scenario = importedFileToDelete();
    // A file that never imported, listed alongside — so the target row's action has to
    // be told apart from another row's, and the scan covers a list whose rows are not
    // all in one status.
    const neverImported = fileNeverImportedToDelete(
      FILE_STATUS_VALIDATION_FAILED,
    );
    const otherFiles = [neverImported.file, ...fileLogsAfterDeleting(scenario)];

    const feed = await serveUploadScreen(
      page,
      [scenario.file, ...otherFiles],
      scenario.transactions,
    );
    const deleteCall = await mockDeleteFile(page, {
      onDeleted: () => {
        feed.showFiles(otherFiles);
        feed.showRequests(transactionsAfterDeletingFile(scenario));
      },
    });
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await blockLiveBackends(page);
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(UPLOAD_ROUTE);

    // The screen is settled — the target row and the rows either side of it.
    const targetRow = fileRow(page, scenario.file.CurrentFileName);
    await expect(targetRow).toContainText(FILE_STATUS_IMPORTED);
    for (const other of otherFiles) {
      await expect(fileRow(page, other.CurrentFileName)).toBeVisible();
    }

    // Reached with the Tab key alone, from a page nobody has clicked...
    const deleteAction = deleteActionIn(targetRow);
    await pressUntilFocused(page, 'Tab', deleteAction);

    // ...and opened with the keyboard alone.
    await page.keyboard.press('Enter');

    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(scenario.file.CurrentFileName);

    // The safe choice holds focus, so Enter on arrival keeps the file.
    const keepTheFile = confirmation.getByRole('button', {
      name: KEEP_THE_FILE_LABEL,
    });
    await expect(keepTheFile).toBeFocused();

    // The count read has landed, so the confirmation is in its settled state before it
    // is scanned. (What the wording says about those requests is story 2's Vitest
    // layer; this is only how this spec knows the dialog has finished arriving.)
    await expect(confirmation).toContainText(String(scenario.expected.total));

    await expectNoAccessibilityViolations(
      page,
      'the delete confirmation open over the files list',
    );

    // Completed with the keyboard alone: on to the confirming choice, and Enter.
    const confirmDelete = confirmation.getByRole('button', {
      name: CONFIRM_DELETE_LABEL,
    });
    await pressUntilFocused(page, 'Tab', confirmDelete, 20);
    await page.keyboard.press('Enter');

    // The file the keyboard user acted on is the one that went — and only that one.
    await expect(confirmation).toBeHidden();
    await expect(targetRow).toHaveCount(0);
    for (const other of otherFiles) {
      await expect(fileRow(page, other.CurrentFileName)).toBeVisible();
    }
    expect(
      deleteCall.fileIdSent(),
      'the keyboard journey must have deleted the file whose row it started from (LogId)',
    ).toBe(String(scenario.file.Id));
  });
});
