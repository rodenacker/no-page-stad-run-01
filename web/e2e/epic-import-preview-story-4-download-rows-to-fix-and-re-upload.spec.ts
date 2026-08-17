/**
 * Story Metadata:
 * - Epic: import-preview — Preview the rows of an import
 * - Story: 4 — Download the rejected rows to fix and re-upload
 * - Route: /upload/file (opened as `/upload/file?LogId=<id>`)
 * - Target File: web/src/components/files/CorrectionRowsDownload.tsx
 * - Page Action: modify_existing
 * - Requirements: FR6, FR7, FR8, BR4, BR5, BR6, NFR-3
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-1 (as an APPROVER, choosing "Download rows to fix and re-upload" on a
 *   submitted file's page SAVES A CSV FILE of that file's rejected rows) → this
 *   file, and only this. A real browser is the only place a file download can be
 *   observed at all: the download event, the name it arrives under, and the bytes
 *   that land on disk — none of which jsdom can produce.
 * - AC-2 (the seven upload columns in the upload's order plus a trailing reason
 *   column), AC-3 (the reason column holds the same wording shown on screen), AC-4
 *   (a matched row is written byte-faithfully from the file's own line; an unmatched
 *   one from the values the service reported), AC-5 (every account number is the FULL
 *   value, whatever the screen shows) and AC-6/AC-7 (when the control is offered, how
 *   the two downloads are told apart, and a correction file that cannot be produced)
 *   are the Vitest layer's, at `web/src/__tests__/integration/
 *   epic-import-preview-story-4-download-rows-to-fix-and-re-upload.test.tsx`.
 *   Deliberately NOT duplicated here.
 * - This epic's real-browser accessibility scan of `/upload/file` belongs to the
 *   preview story (story 2), so no axe scan is repeated here.
 *
 * WHY THE ROLE IS AN APPROVER, deliberately. Both roles have full access to
 * everything this epic adds (brief §Access control, FR8) — but this control lives on
 * a page that ALSO carries the Importer-only actions retry and cancel, whose markup
 * an Approver's browser never receives at all (`upload/file/page.tsx` →
 * `actingUploaderIn`, source UI-24). Exercising the Approver is what proves the
 * correction download was not accidentally folded in behind that gate. The Importer's
 * own access is AC-6's business, in the Vitest layer.
 *
 * WHY THIS TEST READS THE DELIVERED BYTES rather than settling for "the control is
 * clickable": the file is a hand-over that must go back OUT of this application and
 * come back IN through the upload flow (FR6). "Something downloaded" would pass for
 * the ORIGINAL file being handed over again, for the service's own error file, and
 * for an empty file — so the test pins what the user actually received: a CSV holding
 * this file's REJECTED rows and none of the rows that will import. The same precedent
 * the `file-validation-and-retry` epic set for downloads (its story 3) and `csv-export`
 * followed (its story 1) is followed here: read the bytes, pin `suggestedFilename()`.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * This spec never contacts a live backend and never uses a real credential
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as reachable on this machine. Two boundaries, both
 * established by earlier epics and reused here rather than rebuilt:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. `/upload/file` is gated
 *    SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` below, for every transactions-service call this
 *    page makes: `GET /v1/file-logs?IsActive=Yes` (story 1 of
 *    `file-validation-and-retry` resolves the file from the active list, there being
 *    no get-one-file endpoint), `GET /v1/file-process-logs/{LogId}` (its history),
 *    `GET /v1/files/validation-errors` (the rejected-row overlay, read by BOTH the
 *    existing Rejected rows section and this epic's preview) and
 *    `GET /v1/files/download` (the ORIGINAL file's bytes, which this epic parses
 *    client-side and which the correction file is built from). Plus a hard block on
 *    the real services' own origins (:4424 / :4423), registered LAST, so a call
 *    addressed at a live service is aborted and fails visibly instead of being quietly
 *    answered by the origin-agnostic mocks above it.
 *
 * EVERY RESPONSE BODY COMES FROM THE SHARED FIXTURES, none authored here:
 * `previewWithRejectedRows()` (`src/mocks/data/submitted-file`) hands back one
 * coherent file — its `FileLog`, the exact CSV bytes the download answers with, and
 * the validation-errors body describing the SAME rows — so the parsed file and the
 * rejected-row overlay cannot disagree, and the Vitest layer fights the same data.
 * `SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE` is the `application/octet-stream` the contract
 * declares for that download, so the client's binary-response handling meets the same
 * content type it will meet in production. Identity comes from `userInfoFor(role)`.
 *
 * Sign-in is faked with the mock `session` cookie the stub recognises for a role,
 * seeded via `context.addCookies()` rather than by driving the sign-in form (epic 1
 * story 2's spec owns that journey; the cookie is the app's sole conveyance of
 * session). Cookies ignore port, so one seed serves the dev server (:3000) and the
 * epic-end production run (:3100). `Secure` is omitted because the E2E server is plain
 * http on localhost; the real cookie's full attribute set is asserted in the Vitest
 * layer (epic 1, story 1).
 *
 * ---------------------------------------------------------------------------
 * Implementation patterns this spec assumes — READ BEFORE IMPLEMENTING
 * ---------------------------------------------------------------------------
 * - THE ORIGINAL FILE IS DOWNLOADED AND PARSED IN THE BROWSER, through the shared API
 *   client at the app's own same-origin `/transactions-api/...` address (the already
 *   wired `downloadSubmittedFile`, brief §Data Model). `page.route()` cannot intercept
 *   a read issued by the Next.js server or by a Server Action — a server-side fetch
 *   bypasses these mocks and leaves for the real transactions service.
 * - THE CORRECTION FILE IS BUILT IN THE BROWSER from those parsed rows and handed over
 *   by `deliverFile` (`web/src/lib/files/deliverFile.ts`) — a Blob given to a hidden
 *   anchor carrying a `download` name, exactly as `csv-export` and
 *   `FileDownloadActions` already do. That is what makes
 *   `page.waitForEvent('download')` observe it and what makes
 *   `download.suggestedFilename()` the name the APP chose. There is no correction
 *   endpoint and none is being added, so an `<a href>` at a service address is not an
 *   option.
 * - THE CONTROL LIVES INSIDE THE PREVIEW SECTION (story §Also touches:
 *   `ImportPreview.tsx` hosts it), which is the epic's new
 *   `<section aria-labelledby>` on this page — i.e. a `region` whose accessible name
 *   says "preview". Every query below is scoped to that region. What changes in the
 *   existing Downloads section is the explanatory WORDING that says which download is
 *   which (FR7/BR6), not a second copy of this control.
 * - ITS LABEL IS "Download rows to fix and re-upload" (BR6) and must never contain the
 *   word "error", which the shipped "Download error file" control owns on this page.
 *   The two are matched below by their own distinguishing words, and each is asserted
 *   to resolve to exactly ONE control on the page — including under the LOOSE pattern
 *   the `file-validation-and-retry` spec already uses for the error file
 *   (`/download.*error/i`), which the new label must not answer to.
 * - THE SAVED FILE'S NAME says what it holds — the rows to fix — and is therefore
 *   neither the submitted file's own name nor the generated error file's, and carries
 *   no "error" wording (BR6). See {@link CORRECTION_FILE_NAME}.
 * - The screen lives inside epic 1's signed-in shell, so its content is within `main`
 *   and every query here is scoped to it — Next.js renders a permanently empty
 *   body-level `role="alert"` route announcer outside `main`.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * This test WILL FAIL until the story is implemented (TDD red) — `/upload/file` has no
 * preview section and no correction download yet.
 * ---------------------------------------------------------------------------
 */
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { fileLogListResponse } from '../src/mocks/data/file-log';
import { fileProcessLogListResponse } from '../src/mocks/data/file-process-log';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER } from '../src/mocks/data/role';
import {
  SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
  previewWithRejectedRows,
} from '../src/mocks/data/submitted-file';

import type { BrowserContext, Download, Locator, Page } from '@playwright/test';
import type { SubmittedFilePreview } from '../src/mocks/data/submitted-file';

/**
 * The epic's new section on the submitted file's page, addressed as the `region` its
 * heading names. Scoping to it is not tidiness: "Download error file" already lives on
 * this page, and a page-wide query for a download control is exactly how the wrong one
 * gets found (BR6).
 */
const PREVIEW_SECTION = /preview/i;

/**
 * THE NEW CONTROL (BR6: "Download rows to fix and re-upload"), matched on the words
 * that distinguish it from every other download on this page rather than on the whole
 * string, so wording may be adjusted around them.
 */
const CORRECTION_DOWNLOAD_ACTION = /download rows to fix/i;

/**
 * THE SHIPPED CONTROL this one must never be confused with, matched exactly as
 * `file-validation-and-retry`'s own spec matches it — LOOSELY, on "download …
 * error". That looseness is the point: the new label is asserted below not to answer
 * to it, which is what BR6's "never the word error" actually buys.
 */
const ERROR_FILE_ACTION = /download.*error/i;

/**
 * What the saved file's NAME must say: the rows to fix. The three spellings are the
 * vocabulary the story itself uses for this artifact ("rows to fix", "correction
 * file", "rejected rows") — what is pinned is that the name identifies WHAT IT HOLDS,
 * not which of those words is chosen. It must also carry no "error" wording, and must
 * be neither of the two file names the service already owns on this page (asserted
 * separately below).
 */
const CORRECTION_FILE_NAME = /fix|correct|rejected/i;

/** The word BR6 reserves for the service's own diagnostic download, on this page. */
const ERROR_WORDING = /error/i;

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/** A byte-order mark, built from its code point so it is visible in this source. */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);

/** A mocked JSON response, built from a shared factory body. */
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
 * Puts the whole page behind mocks, all four responses describing the ONE file the
 * shared fixture built: the active list it is resolved from, its processing history,
 * the validation-errors overlay, and the file's own bytes.
 */
const mockTheFilePage = async (
  page: Page,
  preview: SubmittedFilePreview,
): Promise<void> => {
  // There is no get-one-file endpoint: the page finds the requested LogId in the
  // active list.
  await page.route('**/transactions-api/v1/file-logs**', (route) =>
    route.fulfill(jsonResponse(fileLogListResponse([preview.file]))),
  );

  // The processing history — mocked so its own failed-read alert cannot occupy the
  // page while this story's download is being asserted.
  await page.route('**/transactions-api/v1/file-process-logs/**', (route) =>
    route.fulfill(jsonResponse(fileProcessLogListResponse())),
  );

  // Which of the file's rows the service rejected — the overlay the preview marks its
  // rejected rows from, and therefore what the correction file is built out of.
  await page.route(
    '**/transactions-api/v1/files/validation-errors**',
    (route) => route.fulfill(jsonResponse(preview.validationErrors)),
  );

  // The originally submitted file itself, streamed as the contract declares it. Served
  // from the fixture's own Blob, so the bytes the browser parses are the bytes the
  // Vitest layer parses.
  await page.route('**/transactions-api/v1/files/download**', async (route) => {
    const bytes = Buffer.from(await preview.blob().arrayBuffer());
    await route.fulfill({
      status: 200,
      contentType: SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
      headers: {
        'content-disposition': `attachment; filename="${preview.file.CurrentFileName}"`,
      },
      body: bytes,
    });
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

/** The screen's own content — never the shell around it. */
const fileScreen = (page: Page): Locator => page.getByRole('main');

/** This epic's section on that screen. */
const previewSection = (page: Page): Locator =>
  fileScreen(page).getByRole('region', { name: PREVIEW_SECTION });

/**
 * Opens the file's page as the given role with every call mocked, and waits until the
 * file itself is on screen — so anything missing below is missing, rather than still
 * being resolved.
 */
const openFilePage = async (
  page: Page,
  context: BrowserContext,
  roleName: string,
  preview: SubmittedFilePreview,
): Promise<void> => {
  await mockBrowserIdentityCall(page, roleName);
  await mockTheFilePage(page, preview);
  await blockLiveBackends(page);
  await seedSession(context, roleName);

  await page.goto(`/upload/file?LogId=${String(preview.file.Id)}`);
  await expect(
    fileScreen(page).getByText(preview.file.CurrentFileName),
  ).toBeVisible();
};

/**
 * The text that actually landed on the user's disk. A leading byte-order mark is
 * stripped: writing one is a legitimate spreadsheet-compatibility choice that says
 * nothing about the rows.
 */
const deliveredText = async (download: Download): Promise<string> => {
  const contents = await readFile(await download.path(), 'utf8');
  return contents.startsWith(BYTE_ORDER_MARK)
    ? contents.slice(BYTE_ORDER_MARK.length)
    : contents;
};

/**
 * The file's lines. Either line ending is accepted (RFC 4180 says CRLF; most writers
 * emit a lone `\n`), and a trailing newline is allowed rather than counted as an empty
 * row. The fixture's rejected rows carry no embedded line break, so no record here
 * spans more than one line — the hostile-text case is the Vitest layer's (AC-4).
 */
const csvLinesOf = (contents: string): string[] =>
  contents.replace(/\r?\n$/, '').split(/\r?\n/);

test.describe('Epic import-preview, Story 4: download the rejected rows to fix and re-upload', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-1
  test('an Approver choosing "Download rows to fix and re-upload" saves a CSV of that file\'s rejected rows', async ({
    page,
    context,
  }) => {
    // One five-row file, two of whose rows the service rejected — its bytes, its
    // validation errors and its FileLog all from the one shared fixture.
    const preview = previewWithRejectedRows();
    // Preconditions, not app assertions: this test can only mean anything if the
    // fixture really does hold both kinds of row, and if the page really does carry
    // the error-file download the new control must be told apart from.
    expect(
      preview.rejectedRows,
      'the shared preview fixture must hold rejected rows for the correction file to be built from',
    ).not.toHaveLength(0);
    expect(
      preview.willImportRows,
      'the shared preview fixture must also hold rows that will import, or "only the rejected rows" proves nothing',
    ).not.toHaveLength(0);
    expect(
      preview.file.HasBulkErrorFile,
      'the Validation failed file from src/mocks/data/file-log.ts must report HasBulkErrorFile: Yes, so the existing "Download error file" control is on the page too',
    ).toBe('Yes');

    await openFilePage(page, context, ROLE_APPROVER, preview);

    // The Approver is offered the correction download — inside the preview section,
    // where the story puts it, and not behind the Importer-only retry/cancel gate that
    // lives on this same page (FR8, BR7).
    const section = previewSection(page);
    const action = section.getByRole('button', {
      name: CORRECTION_DOWNLOAD_ACTION,
    });
    await expect(
      action,
      'an Approver must be offered the correction download on a submitted file with rejected rows (FR8)',
    ).toBeVisible();

    // BR6 — the two downloads on this page are unambiguous, in BOTH directions. The
    // new control is the only thing on the page answering to its own label...
    await expect(
      fileScreen(page).getByRole('button', {
        name: CORRECTION_DOWNLOAD_ACTION,
      }),
      'exactly one control on this page may answer to "Download rows to fix and re-upload"',
    ).toHaveCount(1);
    // ...and the LOOSE pattern the file-validation-and-retry spec uses to find the
    // service's own error file still finds exactly that one control, never this one.
    await expect(
      fileScreen(page).getByRole('button', { name: ERROR_FILE_ACTION }),
      'the shipped "Download error file" query must still match exactly one control — the new label may not contain the word "error" (BR6)',
    ).toHaveCount(1);
    await expect(
      section.getByRole('button', { name: ERROR_FILE_ACTION }),
      'the error-file download belongs to the Downloads section, not to the preview (BR6)',
    ).toHaveCount(0);

    const downloadStarted = page.waitForEvent('download');
    await action.click();
    const download = await downloadStarted;

    // A file really reached the user — not a cancelled or failed transfer.
    expect(
      await download.failure(),
      'choosing the correction download must deliver a file to the Approver',
    ).toBeNull();

    // ...saved as a CSV, named for what it holds — the rows to fix.
    const name = download.suggestedFilename();
    expect(name, 'the correction file is saved as a .csv file (FR6)').toMatch(
      /\.csv$/i,
    );
    expect(
      name,
      'the file name must say what it holds — the rows to fix (BR6)',
    ).toMatch(CORRECTION_FILE_NAME);
    expect(
      name,
      "the correction file must not be named as an error file — that wording belongs to the service's own diagnostic download (BR6)",
    ).not.toMatch(ERROR_WORDING);
    expect(
      name,
      'the correction file is a new artifact, not the submitted file handed back',
    ).not.toBe(preview.file.CurrentFileName);
    expect(
      name,
      "the correction file is not the service's own generated error file",
    ).not.toBe(preview.file.BulkErrorFile);

    // ...and it holds THIS FILE'S REJECTED ROWS: one line each under a header row.
    // WHICH columns, in what order, with what reason wording and what account number,
    // is the Vitest layer's (AC-2 to AC-5).
    const contents = await deliveredText(download);
    const lines = csvLinesOf(contents);
    expect(
      lines,
      'the correction file must hold a header row plus exactly one line per rejected row',
    ).toHaveLength(preview.rejectedRows.length + 1);

    for (const rejected of preview.rejectedRows) {
      expect(
        contents,
        `the rejected row ${rejected.Reference} must be in the correction file (FR6)`,
      ).toContain(rejected.Reference);
    }

    // ...and none of the rows that will import. A file carrying those would be
    // re-uploaded as duplicates of rows the service already accepted.
    for (const willImport of preview.willImportRows) {
      expect(
        contents,
        `${willImport.Reference} will import, so it must not be in the file of rows to fix (FR6)`,
      ).not.toContain(willImport.Reference);
    }

    // The preview reported no failure in place of the download (NFR-3's error state
    // stayed empty). Scoped to the section, so an unrelated alert elsewhere on this
    // busy page cannot fail this story.
    await expect(section.getByRole('alert')).toHaveCount(0);
  });
});
