/**
 * Story Metadata:
 * - Epic: file-validation-and-retry — Rejected rows, retry and cancel
 * - Story: 3 — Download the original file and the error file
 * - Route: /upload/file (opened as `/upload/file?LogId=<id>`)
 * - Target File: web/src/app/(authenticated)/upload/file/page.tsx
 * - Page Action: modify_existing
 * - Requirements: FR6, FR7
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-1 (the original submitted file downloads) and AC-2 (the generated error file
 *   downloads) → this file. A real browser is the only place an actual FILE
 *   DOWNLOAD can be observed — the download event, the name it arrives under and
 *   the bytes that land on disk — none of which jsdom can produce.
 * - AC-3 (no error file → the action is absent, not disabled), AC-4 (both roles are
 *   offered both downloads) and AC-5 (a refused download is reported in the page,
 *   never a raw error response) → `web/src/__tests__/integration/
 *   epic-file-validation-and-retry-story-3-download-the-original-and-error-files.test.tsx`
 *   (`vitest`). Deliberately NOT duplicated here.
 * - This epic's single real-browser accessibility scan of the submitted-file page is
 *   story 1's AC-6, so no axe scan is repeated here.
 *
 * WHY BOTH TESTS ASSERT THE DELIVERED BYTES, not just "a download happened":
 * the two downloads are two DIFFERENT files on two DIFFERENT endpoints —
 *   original file → `GET /transactions-api/v1/files/download?FileLogId=<id>`
 *                   (`FilesDownload`)
 *   error file    → `GET /transactions-api/v1/files/bulk-errors/download?FileLogId=<id>`
 *                   (`FilesBulkErrorsDownload`)
 * — and the source contract flags this pair, plus a third similarly-shaped
 * operation (`GET /v1/file-logs/data?LogId=<id>`, `FileLogDataDownload`), as a
 * genuine ambiguity (epic `unverifiedAssumptions` #3; brief §Notes & Caveats
 * resolves it via the §6.10 mapping above). "Some file downloaded" would pass with
 * the two endpoints transposed, or with the forbidden third one wired to both
 * actions. So each test pins the CONTENT the user received, and the two mocked
 * payloads are deliberately different files (`./fixtures/csv-files`), with the
 * forbidden third endpoint answered by a decoy payload that matches neither.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running locally. This screen crosses BOTH
 * mock boundaries, and earlier epics established each one — this spec reuses them
 * rather than adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`,
 *    started by `globalSetup` and wired in by `playwright.config.ts`. Every
 *    protected screen is gated SERVER-side (`(authenticated)/layout.tsx` →
 *    `requireSession()` → `GET /v1/auth/userinfo` from inside the Next.js process),
 *    and `page.route()` cannot see a fetch the browser never makes. The stub answers
 *    that call from the shared identity source, keyed off the `session` cookie value
 *    seeded below.
 * 2. Browser boundary → `page.route()` (below), for every transactions-service call
 *    this page makes: this story's two download endpoints, plus the reads the page
 *    already performs — `GET /v1/file-logs?IsActive=Yes` (story 1 resolves the file
 *    from the active list, there being no get-one-file endpoint),
 *    `GET /v1/file-process-logs/{LogId}` (story 1's history) and
 *    `GET /v1/files/validation-errors` (story 2's invalid rows). The two reads this
 *    story asserts nothing about are mocked anyway: `/transactions-api/...` is the
 *    app's OWN same-origin mount point, so an unmocked call is forwarded to the live
 *    transactions service by the route handler (inside the Next.js process, where
 *    `blockLiveBackends` cannot see it) — and on any non-200 its own failure
 *    `role="alert"` would occupy the page.
 *
 * - Every response body comes from the shared sources, never authored here: the
 *   project-wide factories under `web/src/mocks/data/` (`userInfoFor(role)`,
 *   `fileLogWithStatus()`, `fileLogListResponse()`, `fileProcessLogListResponse()`,
 *   `validationErrorsResponse()`) and the download payload fixtures in
 *   `./fixtures/csv-files`. `HasBulkErrorFile` is the STRING `'Yes'`/`'No'` on the
 *   wire and `RecordCount` is a string — both the factory's business.
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by
 *   driving the sign-in form — epic 1 story 2's spec owns that journey, and the
 *   cookie is the app's sole conveyance of session. Cookies ignore port, so the same
 *   seed serves the dev server (:3000) and the epic-end production run (:3100).
 * - Implementation pattern this assumes:
 *   - Each download is started from the BROWSER, through the shared API client at
 *     the app's own same-origin `/transactions-api/...` address (story
 *     §Infrastructure & reuse notes) — i.e. from a client component, reading the
 *     `application/octet-stream` response as a Blob (`lib/api/client.ts` already
 *     returns one for binary responses) and handing it to the user. `page.route()`
 *     cannot intercept a fetch made by the Next.js server or by a Server Action; if
 *     a download moves server-side, these mocks are bypassed and the request leaves
 *     for the real transactions service. AC-5's "a refused download is reported on
 *     the page, and the user is never dropped onto a raw error response" already
 *     rules out the plain `<a href>` alternative.
 *   - The download therefore arrives as a browser download of that Blob, on THIS
 *     page (not a popup) — `page.waitForEvent('download')` below is what observes
 *     it. The name it arrives under is the name the SERVICE reported for the file
 *     (`CurrentFileName` for the original, `BulkErrorFile` for the error file), so
 *     the user gets the file they asked for rather than a GUID; the mocked responses
 *     also carry `Content-Disposition: attachment; filename="…"` with that same
 *     name, so the assertion holds whether the name comes from the response header
 *     or from a `download` attribute.
 *   - Each action is a CONTROL, not a link (a refused download must be reported in
 *     place), and is named so that "original"/"submitted" identifies one and
 *     "error file" the other — e.g. "Download the original file" and "Download the
 *     error file". The queries below match on those words, not on exact copy.
 * - Cookie assumptions: the mock `session` cookie carries production-like
 *   attributes (HttpOnly, SameSite=Strict). `Secure` is omitted because the E2E
 *   server is plain http on localhost; the real cookie's full attribute set is
 *   asserted in the Vitest layer (epic 1, story 1).
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — the
 * submitted-file page offers neither download yet.
 * ---------------------------------------------------------------------------
 */
import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import {
  errorFileDownload,
  forbiddenFileLogDataDownload,
  submittedFileDownload,
} from './fixtures/csv-files';
import { sessionTokenFor } from './support/auth-api-stub';
import {
  FILE_STATUS_VALIDATION_FAILED,
  fileLogListResponse,
  fileLogWithStatus,
} from '../src/mocks/data/file-log';
import { fileProcessLogListResponse } from '../src/mocks/data/file-process-log';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  invalidRowsForEveryDefect,
  validationErrorsResponse,
} from '../src/mocks/data/validation-error';

import type { MockDownloadPayload } from './fixtures/csv-files';
import type { BrowserContext, Download, Locator, Page } from '@playwright/test';

/**
 * The file both downloads belong to: a file that failed validation, so the service
 * has generated an error file for it and reports `HasBulkErrorFile: 'Yes'` — the
 * value the error-file action is gated on (AC-2/AC-3).
 */
const FAILED_FILE = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED);

/** This story's screen: the submitted file's own page, opened for that file. */
const FILE_PAGE_PATH = `/upload/file?LogId=${String(FAILED_FILE.Id)}`;

/**
 * The two actions, matched by the WORDS that distinguish them rather than by exact
 * copy — the story fixes which file each one delivers, not the wording. Controls,
 * not links: a refused download is reported in the page (AC-5).
 */
const ORIGINAL_DOWNLOAD_ACTION = /download.*(original|submitted)/i;
const ERROR_DOWNLOAD_ACTION = /download.*error/i;

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * Blocks the live services (see LIVE_BACKEND_ORIGINS). Registered LAST in each
 * test, because Playwright matches the most recently registered route first: that
 * way a call sent to a service's own origin is aborted and fails visibly, instead
 * of being quietly answered by the origin-agnostic mocks above it.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Answers a download endpoint with one of the shared payloads: the
 * `application/octet-stream` stream both endpoints declare, named by
 * `Content-Disposition` so the delivered name is the service's own either way (see
 * the header's implementation assumptions).
 */
const mockDownloadEndpoint = async (
  page: Page,
  urlGlob: string,
  payload: MockDownloadPayload,
): Promise<void> => {
  await page.route(urlGlob, (route) =>
    route.fulfill({
      status: 200,
      contentType: payload.mimeType,
      headers: {
        'content-disposition': `attachment; filename="${payload.name}"`,
      },
      body: payload.body,
    }),
  );
};

/**
 * Puts the whole page behind mocks: the reads that draw the submitted-file page,
 * then the three download-shaped endpoints.
 *
 * ORDER MATTERS. Playwright matches the most recently registered route first, and
 * `**\/v1/file-logs**` also matches `/v1/file-logs/data` — so the forbidden third
 * endpoint is registered AFTER the active-list read, otherwise its decoy payload
 * would never be reached and an implementation calling it would be handed the file
 * list instead.
 */
const mockTheFilePage = async (page: Page): Promise<void> => {
  // Story 1's resolution of the file: there is no get-one-file endpoint, so the page
  // finds the requested LogId in the active list.
  await page.route('**/transactions-api/v1/file-logs**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fileLogListResponse([FAILED_FILE])),
    }),
  );

  // Story 1's processing history — mocked so its own failure alert cannot occupy
  // the page while this story's downloads are being asserted.
  await page.route('**/transactions-api/v1/file-process-logs/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fileProcessLogListResponse()),
    }),
  );

  // Story 2's invalid rows, on the same page, for the same reason. The rows are the
  // same rejected rows the error file below is built from.
  await page.route(
    '**/transactions-api/v1/files/validation-errors**',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          validationErrorsResponse(invalidRowsForEveryDefect()),
        ),
      }),
  );

  // FR6 — the file exactly as it was submitted.
  await mockDownloadEndpoint(
    page,
    '**/transactions-api/v1/files/download**',
    submittedFileDownload(),
  );

  // FR7 — the error file the service generated for the failed file.
  await mockDownloadEndpoint(
    page,
    '**/transactions-api/v1/files/bulk-errors/download**',
    errorFileDownload(),
  );

  // The forbidden third operation, answered with a decoy so that reaching for it
  // delivers bytes matching NEITHER expected file — a failure on what the user
  // received, rather than a pass because something downloaded.
  await mockDownloadEndpoint(
    page,
    '**/transactions-api/v1/file-logs/data**',
    forbiddenFileLogDataDownload(),
  );
};

/**
 * Puts the browser in a signed-in state as the named role, without a real
 * credential: the mock `session` cookie the Node-side auth stub maps back to this
 * role when the server-side gate asks it who the session belongs to.
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

/**
 * Answers a BROWSER-side identity read from the shared userinfo source. Always the
 * same role the session cookie was seeded with, so the person the server rendered
 * for and the person the browser reads are one and the same.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(userInfoFor(roleName)),
    }),
  );
};

/**
 * Opens the failed file's page as the given role, with every call mocked, and waits
 * until the file itself is on screen — so a download action's absence below means
 * the action is missing, not that the page had not finished resolving the file.
 */
const openFilePage = async (
  page: Page,
  context: BrowserContext,
  roleName: string,
): Promise<Locator> => {
  await seedSession(context, roleName);
  await mockBrowserIdentityCall(page, roleName);
  await mockTheFilePage(page);
  await blockLiveBackends(page);

  await page.goto(FILE_PAGE_PATH);

  const screen = page.getByRole('main');
  await expect(screen.getByText(FAILED_FILE.CurrentFileName)).toBeVisible();
  return screen;
};

/** The bytes that actually landed on the user's disk. */
const deliveredText = async (download: Download): Promise<string> =>
  readFile(await download.path(), 'utf8');

test.describe('Epic file-validation-and-retry, Story 3: download the original file and the error file', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // AC-1
  test('choosing the original-file download delivers the file exactly as it was submitted', async ({
    page,
    context,
  }) => {
    const original = submittedFileDownload();
    const screen = await openFilePage(page, context, ROLE_IMPORTER);

    const action = screen.getByRole('button', {
      name: ORIGINAL_DOWNLOAD_ACTION,
    });
    await expect(action).toBeVisible();

    const downloadStarted = page.waitForEvent('download');
    await action.click();
    const download = await downloadStarted;

    // A file really reached the user — not a cancelled or failed transfer.
    expect(await download.failure()).toBeNull();

    // ...under the name the SERVICE gave the submitted file, so the user recognises
    // what they just saved.
    expect(download.suggestedFilename()).toBe(original.name);

    // ...and it is the ORIGINAL file's own bytes. This is what rules out the two
    // download endpoints being transposed and rules out the forbidden third
    // operation: each mocked endpoint streams different content, so only a call to
    // `GET /v1/files/download` can produce this text (see the header).
    expect(await deliveredText(download)).toBe(original.body);

    // The page reported no failure in place of the download (NFR-base-5's error
    // state stayed empty). Scoped to `main` because Next.js renders its route
    // announcer as a second, permanently empty body-level `role="alert"`.
    await expect(screen.getByRole('alert')).toHaveCount(0);
  });

  // AC-2
  test('choosing the error-file download delivers the generated error file, not the submitted one', async ({
    page,
    context,
  }) => {
    const errorFile = errorFileDownload();
    // Precondition, not an app assertion: the action exists at all only because the
    // service reported an error file for this file. If the shared factory ever stops
    // saying so, the action's absence below would be correct behaviour and the
    // failure would read as a missing feature — this line names the real cause. The
    // no-error-file case itself is AC-3, in the Vitest layer.
    expect(
      FAILED_FILE.HasBulkErrorFile,
      'the Validation failed file from src/mocks/data/file-log.ts must report HasBulkErrorFile: Yes',
    ).toBe('Yes');

    const screen = await openFilePage(page, context, ROLE_IMPORTER);

    const action = screen.getByRole('button', { name: ERROR_DOWNLOAD_ACTION });
    await expect(action).toBeVisible();

    const downloadStarted = page.waitForEvent('download');
    await action.click();
    const download = await downloadStarted;

    expect(await download.failure()).toBeNull();

    // The generated error file's own name, as the service reported it on the file
    // log (`BulkErrorFile`) — not the submitted file's name.
    expect(download.suggestedFilename()).toBe(errorFile.name);

    // ...and the error file's own bytes: the rejected rows with the reason each was
    // rejected for. Distinct content from the submitted file, so this passing means
    // `GET /v1/files/bulk-errors/download` was the endpoint used — the pair cannot
    // be silently transposed (see the header).
    expect(await deliveredText(download)).toBe(errorFile.body);

    await expect(screen.getByRole('alert')).toHaveCount(0);
  });
});
