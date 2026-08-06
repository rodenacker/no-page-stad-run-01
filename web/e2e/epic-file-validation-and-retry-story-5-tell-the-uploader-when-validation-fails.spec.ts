/**
 * Story Metadata:
 * - Epic: file-validation-and-retry — Story 5: tell the uploader when a file's
 *   validation fails
 * - Route: /upload
 * - Target File: web/src/components/files/SubmittedFilesList.tsx
 * - Page Action: modify_existing
 * - Requirements: FR9 (`R91`), NFR-3, NFR-4
 *
 * Covers the `playwright`-tagged criterion only:
 * - AC-3 — the notification takes the user straight to that file's page and its
 *   rejected rows.
 *
 * AC-1 (a notification naming the file is raised on the transition), AC-2 (it does
 * not fade away on its own), AC-4 (a file already failed when the list opened raises
 * nothing) and AC-5 (an Approver is not notified, and still sees the row change) are
 * the Vitest layer's and are deliberately not repeated here (testing-policy.md §
 * "one tag, one layer"). What this spec adds that jsdom cannot: the notification
 * genuinely reaching the user in a real browser as the file's status advances on real
 * timers, and its link genuinely carrying them across a client-side navigation to the
 * file's rejected rows.
 *
 * This epic's single real-browser accessibility scan belongs to story 1, which owns
 * the submitted-file page (`story-1-open-a-submitted-file.md` §Epic shared surface) —
 * so there is no axe scan here.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy
 * ---------------------------------------------------------------------------
 * Backend calls are ALWAYS mocked — this spec never contacts a live backend and never
 * uses a real credential (testing-policy.md § "Playwright runs against mocks, never
 * live"), even though project.md records both real services as running on this
 * machine. Two boundaries, one contract, exactly as the epic-2 specs established:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. `/upload` and
 *    `/upload/file` are gated SERVER-side (the `(authenticated)` layout's
 *    `requireSession()` → `GET /v1/auth/userinfo` from inside the Next.js process),
 *    and `page.route()` cannot see a fetch the browser never makes. The stub answers
 *    that call from the shared userinfo source, keyed off the `session` cookie value
 *    seeded below.
 * 2. Browser boundary → `page.route()` below, for every transactions-service read the
 *    two screens make (`/transactions-api/v1/file-logs`, `.../file-settings`,
 *    `.../file-process-logs/{LogId}`, `.../files/validation-errors`), plus a
 *    catch-all that aborts any OTHER `/transactions-api/**` call so an unmocked read
 *    cannot travel through the app's own same-origin proxy to the live service, plus
 *    a hard block on the real services' own origins (project.md records them at
 *    :4424 / :4423).
 *
 * Every response body comes from the project-wide mock data in `web/src/mocks/data/`
 * (`file-log.ts`, `file-setting.ts`, `file-process-log.ts`, `validation-error.ts`,
 * `identity.ts`, `role.ts`) — no response shape is authored in this file. The two
 * snapshots of the SAME file come from `fileLogProgression()`, which keeps id, name,
 * setting and process date stable across statuses; that is what makes "this file
 * reached Validation failed while I was watching" distinguishable from "a second,
 * already-failed file appeared".
 *
 * Implementation patterns this spec assumes (read before implementing):
 * - The notification comes out of the root layout's EXISTING toast machinery
 *   (`ToastProvider` / `ToastContainer`, `useToast()`), which renders one
 *   `role="region"` named "Notifications" holding the live notifications. No second
 *   notification mechanism, and no bespoke banner inside the list.
 * - The notification carries a real LINK to `/upload/file?LogId=<id>` — an anchor
 *   (`role="link"`), not a click handler on a `div`. A clickable non-link cannot be
 *   reached or operated by keyboard and would fail this epic's NFR-1 and the
 *   project's WCAG bar; this spec locates the link by role, so an `onClick`-only
 *   toast fails it. The existing `Toast` component renders title + message only, so
 *   giving it somewhere to put that link is part of this story's work.
 * - The file list is read FROM THE BROWSER (epic-2 story 1's infrastructure note)
 *   through `lib/api/files.ts` at the app's own `/transactions-api/...` address, and
 *   re-read on a timer while any listed file is in progress — `page.route()` cannot
 *   intercept a read issued from the Next.js server, and a server-only read could not
 *   notice the transition at all.
 * - The transition is detected on the SAME previous-status-per-id record epic 2
 *   already keeps for the `Imported` case (story metadata / §Infrastructure notes),
 *   so the notification arrives on the refresh that first reports
 *   `Validation failed` — not on the first read of an already-failed file.
 * - Which role is watching arrives as an OPTIONAL prop that still notifies by default
 *   (epic 2 story 3's pinned contract). This spec watches as an Importer — the
 *   service's own name for the requirements' Finance Uploader.
 * - The destination is the submitted-file page story 1 creates, at
 *   `/upload/file?LogId=<id>`, with story 2's rejected-rows section on it; both are
 *   this epic's own earlier stories, so by the epic-end run they exist.
 *
 * QUERYING THE NOTIFICATION — two traps this spec avoids on purpose:
 * - It is found through `getByRole('region', { name: /notifications/i })`, the
 *   surface's own accessible name (the same handle the Vitest layer uses), NOT
 *   through `getByRole('alert')`: Next renders a permanently empty body-level
 *   `role="alert"` route announcer, so an unscoped alert query always matches two
 *   elements, and the toast's own role legitimately varies with its variant
 *   (`alert` for error, `status` otherwise). The notification also renders OUTSIDE
 *   `main` (the container is fixed-position, mounted in the root layout), so scoping
 *   it to `main` would find nothing.
 * - The row and the page content ARE scoped to `main`.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie (epic
 * 1 BR2), seeded directly rather than by driving the sign-in form — epic 1's story 2
 * spec owns that journey. Cookies ignore port, so one seed works for the dev server
 * (:3000) and the epic-end production run (:3100). `Secure` is omitted because the
 * E2E server is plain http on localhost.
 *
 * TIMING — why nothing here waits real time:
 * The refresh that reports the failure is timer-driven, so the browser clock is
 * driven with Playwright's `page.clock`: `install()` before navigating, then
 * `fastForward()` to buy one refresh at the REAL configured interval (no test-only
 * "short interval" prop in production code, and no test sitting waiting). The clock
 * is then `resume()`d before anything is clicked, so the client-side navigation the
 * link performs runs on normally flowing time instead of a frozen one. One 60s jump
 * is far inside epic 1's idle-session window, so the session cannot lapse mid-test.
 *
 * These tests WILL FAIL until implemented (TDD red).
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import {
  FILE_STATUS_VALIDATING,
  FILE_STATUS_VALIDATION_FAILED,
  fileLogListResponse,
  fileLogProgression,
} from '../src/mocks/data/file-log';
import { fileProcessLogListResponse } from '../src/mocks/data/file-process-log';
import { fileSettingListResponse } from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  invalidRowWithUnsupportedCurrency,
  validationErrorsResponse,
} from '../src/mocks/data/validation-error';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FileLog } from '../src/mocks/data/file-log';

/** The Expense files screen the uploader is watching (story metadata Route). */
const UPLOAD_ROUTE = '/upload';

/** The file's own page the notification must take them to (this epic's story 1). */
const FILE_PAGE_ROUTE = '/upload/file';

/**
 * The transactions-service reads these two screens make, as the BROWSER addresses
 * them: the app's own `/transactions-api/*` mount point, never the service's origin
 * (`web/src/lib/utils/constants.ts`). Trailing `**` so query strings are covered.
 */
const TRANSACTIONS_API_GLOB = '**/transactions-api/**';
const FILE_LOGS_URL_GLOB = '**/transactions-api/v1/file-logs**';
const FILE_SETTINGS_URL_GLOB = '**/transactions-api/v1/file-settings**';
const FILE_PROCESS_LOGS_URL_GLOB =
  '**/transactions-api/v1/file-process-logs/**';

/**
 * The rejected-rows read is matched by PATH rather than by glob, so the sibling
 * `.../validation-errors/columns` operation (which story 2 may or may not use, and
 * which has no factory of its own) cannot be answered with a rows body it would not
 * understand. An unmocked columns call falls through to {@link guardTransactionsApi}
 * and is aborted, which is a handled failed read — never a live-service call.
 */
const isValidationErrorsPath = (url: URL): boolean =>
  url.pathname.endsWith('/transactions-api/v1/files/validation-errors');

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * Browser time bought per refresh. `fastForward` fires each due timer at most once,
 * so one jump buys exactly one refresh for any interval up to this length — the same
 * budget epic 2's story-3 spec set, and comfortably inside epic 1's idle window.
 */
const POLL_TICK_MS = 60_000;

/** A mocked JSON response, built from a project-wide factory body. */
const jsonResponse = (
  body: unknown,
): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/**
 * A value this spec identifies a rejected row by, read off the shared factory.
 *
 * Every `ValidationErrorRow` field is optional (the shape comes from parsing an
 * untrusted string), so the value is asserted present here rather than coerced: a
 * factory that stopped carrying it must fail loudly instead of quietly asserting
 * against "undefined".
 */
const rowValue = (value: string | undefined, field: string): string => {
  if (value === undefined || value === '') {
    throw new Error(
      `The rejected-row factory no longer carries a ${field}. This spec ` +
        `identifies the rejected row on the file's page by that value — pick ` +
        `another field from src/mocks/data/validation-error.ts rather than ` +
        `hard-coding one here.`,
    );
  }
  return value;
};

/** The rejected row served for the failed file, and the values it is recognised by. */
const REJECTED_ROW = invalidRowWithUnsupportedCurrency();
const REJECTED_ROW_REFERENCE = rowValue(REJECTED_ROW.Reference, 'Reference');
const REJECTED_ROW_DESCRIPTION = rowValue(
  REJECTED_ROW.Description,
  'Description',
);

/** What the mocked file-logs endpoint is currently serving. */
interface FileLogFeed {
  /** Change what the NEXT read of the list returns — the service moving on. */
  show: (logs: FileLog[]) => void;
}

/**
 * Every backend mock this spec needs, registered in the ONE order that works:
 * Playwright matches the most recently registered route first, so the
 * `/transactions-api/**` catch-all goes on FIRST (it must lose to every specific
 * read below it) and `blockLiveBackends` goes on LAST (a call addressed at a
 * service's own origin must be aborted, not quietly answered by the origin-agnostic
 * mocks above it).
 *
 * The file list is deliberately served from a single mutable snapshot rather than a
 * per-request queue: the browser may legitimately read the list more than once for
 * one on-screen state, and a queue would then silently skip a status. Keeping the
 * served body under the TEST's control (`feed.show()`) means the transition asserted
 * below is exactly one transition.
 */
const installBackendMocks = async (
  page: Page,
  roleName: string,
  initialFiles: FileLog[],
): Promise<FileLogFeed> => {
  // 1. Catch-all: anything under the app's transactions-api mount that this spec has
  //    not mocked is aborted, so it cannot travel on through the same-origin proxy to
  //    the live service.
  await page.route(TRANSACTIONS_API_GLOB, (route) => route.abort());

  // 2. The reads the two screens actually make.
  let currentFiles = initialFiles;
  await page.route(FILE_LOGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileLogListResponse(currentFiles))),
  );
  await page.route(FILE_SETTINGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileSettingListResponse())),
  );
  await page.route(FILE_PROCESS_LOGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileProcessLogListResponse())),
  );
  await page.route(isValidationErrorsPath, (route) =>
    route.fulfill(jsonResponse(validationErrorsResponse([REJECTED_ROW]))),
  );

  // 3. A browser-side identity read, answered from the SAME shared userinfo source
  //    the Node-side stub uses, so the two mock layers cannot disagree.
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(userInfoFor(roleName))),
  );

  // 4. The live services' own origins.
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }

  return {
    show: (logs: FileLog[]) => {
      currentFiles = logs;
    },
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

/** One file's row in the Expense files list, found by the file's own name. */
const fileRow = (page: Page, fileName: string): Locator =>
  page.getByRole('main').getByRole('row').filter({ hasText: fileName });

/**
 * The app's in-app notification surface — the root layout's `ToastContainer`, named
 * "Notifications". Deliberately NOT an `alert` query: see the header's two traps.
 */
const notifications = (page: Page): Locator =>
  page.getByRole('region', { name: /notifications/i });

test.describe('Epic file-validation-and-retry, Story 5: telling the uploader when validation fails', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-3
  test('the notification raised when a watched file fails validation leads straight to that file, showing the rows that were rejected', async ({
    page,
    context,
  }) => {
    // The SAME file at two successive statuses — one id, one name, one row — so the
    // second snapshot is unmistakably this file changing rather than a new file.
    const [validating, failed] = fileLogProgression([
      FILE_STATUS_VALIDATING,
      FILE_STATUS_VALIDATION_FAILED,
    ]);

    // Control the browser clock before anything schedules a timer, so the real
    // configured refresh interval can be crossed instantly.
    await page.clock.install();
    const feed = await installBackendMocks(page, ROLE_IMPORTER, [validating]);
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(UPLOAD_ROUTE);

    // The uploader is watching the list, with this file still being validated — and
    // nothing has been said to them yet.
    const row = fileRow(page, validating.CurrentFileName);
    await expect(row).toContainText(validating.CurrentStatus);
    await expect(notifications(page)).toBeHidden();

    // The service finishes validating the file, and finds bad rows in it. Nobody
    // touches the browser — no click, no keypress, no reload: only time passes.
    feed.show([failed]);
    await page.clock.fastForward(POLL_TICK_MS);

    // The row catches up on its own...
    await expect(row).toContainText(failed.CurrentStatus);

    // ...and the uploader is told, by name, which of their files it was.
    const notification = notifications(page);
    await expect(notification).toBeVisible();
    await expect(notification).toContainText(failed.CurrentFileName);

    // Time flows normally again from here, so the navigation the notification
    // performs is not running against a frozen clock.
    await page.clock.resume();

    // The notification is something they can act on: one link, which is what takes
    // them to the file (an `onClick` handler on a non-link would not be reachable by
    // keyboard, and is not found by this query).
    const openTheFile = notification.getByRole('link');
    await expect(openTheFile).toBeVisible();
    await openTheFile.click();

    // They land on that file's own page — the failed file's, not some other file's.
    await expect(page).toHaveURL(
      new RegExp(`${FILE_PAGE_ROUTE}\\?.*LogId=${failed.Id}`),
    );
    const filePage = page.getByRole('main');
    await expect(filePage).toContainText(failed.CurrentFileName);

    // ...and what they were notified about is on screen: the rows that were
    // rejected, with the values recorded for them.
    await expect(filePage).toContainText(REJECTED_ROW_REFERENCE);
    await expect(filePage).toContainText(REJECTED_ROW_DESCRIPTION);
  });
});
