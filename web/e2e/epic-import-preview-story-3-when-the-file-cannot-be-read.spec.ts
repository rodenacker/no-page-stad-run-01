/**
 * Story Metadata:
 * - Epic: import-preview — Preview the rows of an import
 * - Story: 3 — When the file cannot be read
 * - Route: /upload/file (opened as `/upload/file?LogId=<id>`)
 * - Target File: web/src/components/files/ImportPreview.tsx
 * - Page Action: modify_existing
 * - Requirements: FR5, BR8, NFR-3
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-5 (after a failed read, choosing the retry control loads the preview once the
 *   service answers) → this file, and only this criterion. RECOVERY is the one thing
 *   this story has that jsdom cannot honestly show: it needs the SAME endpoint to
 *   refuse a real HTTP request and then answer the next one, with the browser's own
 *   fetch, the app's own client and a real user click in between.
 * - AC-1 (unparseable body), AC-2 (wrong column shape), AC-3 (count mismatch), AC-4
 *   (a failed read is reported in the service's own words with a control offering to
 *   load the preview again) and AC-6 (the wait is announced) →
 *   `web/src/__tests__/integration/
 *   epic-import-preview-story-3-when-the-file-cannot-be-read.test.tsx` (`vitest`).
 *   Deliberately NOT duplicated here — the failure state is only established below
 *   far enough to prove the rows that appear afterwards are new.
 * - This page's real-browser accessibility scan is `file-validation-and-retry` story
 *   1 AC-6, and the preview's own is story 2 of this epic. No axe scan is repeated
 *   here.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running locally. This screen crosses BOTH mock
 * boundaries, and earlier epics established each one — this spec reuses them rather
 * than adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. Every protected screen
 *    is gated SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie seeded below.
 * 2. Browser boundary → `page.route()` (below), for every transactions-service call
 *    this page makes: this story's `GET /v1/files/download` (the preview's primary
 *    source), plus the reads the page already performs — `GET /v1/file-logs?IsActive=Yes`
 *    (`file-validation-and-retry` story 1 resolves the file from the active list,
 *    there being no get-one-file endpoint), `GET /v1/file-process-logs/{LogId}` (that
 *    story's history) and `GET /v1/files/validation-errors` (its rejected rows, and
 *    this epic's rejected-row overlay). The reads this story asserts nothing about are
 *    mocked anyway: `/transactions-api/...` is the app's OWN same-origin mount point,
 *    so an unmocked call is forwarded to the live transactions service by the route
 *    handler (inside the Next.js process, where `blockLiveBackends` cannot see it) —
 *    and on any non-200 its own failure `role="alert"` would occupy the page.
 *
 * - Every response body comes from the shared project-wide sources, never authored
 *   here: `previewWithRejectedRows()` (`../src/mocks/data/submitted-file`) supplies the
 *   file's `FileLog`, its exact CSV bytes and the validation-errors envelope that
 *   describes the SAME rows, so the two halves of the preview cannot disagree and the
 *   Vitest layer serves byte-identical content; `SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE` is
 *   the `application/octet-stream` the download really declares;
 *   `fileLogListResponse()`, `fileProcessLogListResponse()` and `userInfoFor(role)`
 *   supply the rest of the page.
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by driving
 *   the sign-in form — epic 1 story 2's spec owns that journey, and the cookie is the
 *   app's sole conveyance of session. Cookies ignore port, so the same seed serves the
 *   dev server (:3000) and the epic-end production run (:3100).
 * - Implementation pattern this assumes (the developer builds to these; if the
 *   implementation diverges, this spec will not pass):
 *   - The preview downloads the original file FROM THE BROWSER, through the shared API
 *     client at the app's own same-origin `/transactions-api/...` address
 *     (`downloadSubmittedFile`, already wired for "Download original file"), and parses
 *     it client-side. `page.route()` cannot intercept a fetch made by the Next.js
 *     server or by a Server Action; if the download moves server-side these mocks are
 *     bypassed and the request leaves for the real transactions service.
 *   - A download the service refuses leaves the preview in a stated failure state: a
 *     `role="alert"` inside the preview, NO table of any kind (BR8), and one control
 *     named exactly "Load the preview again" (story 3 §Retry label — chosen to avoid
 *     the labels this page already owns: `Try again`, `Try again to load the rejected
 *     rows`, `Load this file again`, `Retry validation`, `Cancel file`, `Download
 *     original file`, `Download error file`).
 *   - The preview is its own labelled section — `<section aria-labelledby>` with a
 *     heading naming it, as `RejectedRows` and `FileProcessingHistory` already are —
 *     and its name says "preview". That is what lets every query below be scoped to
 *     the preview, so "Load the preview again" and the preview's own alert can never
 *     resolve to another section's control on this crowded page.
 *   - Activating that control re-runs the read. Nothing else on the page has to be
 *     re-fetched for the preview to recover.
 * - Cookie assumptions: the mock `session` cookie carries production-like attributes
 *   (HttpOnly, SameSite=Strict). `Secure` is omitted because the E2E server is plain
 *   http on localhost; the real cookie's full attribute set is asserted in the Vitest
 *   layer (epic 1, story 1).
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — the submitted
 * file's page has no preview section yet.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { fileLogListResponse } from '../src/mocks/data/file-log';
import { fileProcessLogListResponse } from '../src/mocks/data/file-process-log';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
  previewWithRejectedRows,
} from '../src/mocks/data/submitted-file';

import type { BrowserContext, Locator, Page, Route } from '@playwright/test';

/* -------------------------------------------------------------------------- */
/* The file, and the rows the preview must end up showing                     */
/* -------------------------------------------------------------------------- */

/**
 * The canonical preview fixture: a five-row file the service rejected two lines of.
 * One call gives the `FileLog`, the file's exact bytes and the validation-errors body
 * describing the same lines — so nothing about this file is retyped here, and the
 * Vitest layer reads the identical content.
 */
const PREVIEW = previewWithRejectedRows();

/** The file whose page this story's section lives on. */
const FILE = PREVIEW.file;

/** Its own page, reached with its identifier in the query. */
const FILE_PAGE = `/upload/file?LogId=${String(FILE.Id)}`;

/**
 * The endpoints, matched by PATH rather than by a `**` glob so one mock cannot swallow
 * another: `/v1/files/download` must not also catch `/v1/files/bulk-errors/download`
 * (a different file on a different endpoint, `lib/api/files.ts`), and
 * `/v1/files/validation-errors` must not also catch its `/columns` sibling.
 */
const FILE_DOWNLOAD_PATH = '/v1/files/download';
const FILE_LOGS_PATH = '/v1/file-logs';
const FILE_PROCESS_LOGS_PATH = '/v1/file-process-logs/';
const VALIDATION_ERRORS_PATH = '/v1/files/validation-errors';
const VALIDATION_ERRORS_COLUMNS_PATH = '/v1/files/validation-errors/columns';

/**
 * The preview's own retry control (story 3 §Retry label). Matched EXACTLY, because
 * this page already carries `Load this file again`, `Try again`, `Try again to load
 * the rejected rows` and `Retry validation` — a loose match would resolve to one of
 * those and prove nothing about the preview.
 */
const LOAD_PREVIEW_AGAIN = 'Load the preview again';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/* -------------------------------------------------------------------------- */
/* Fixture integrity — the criterion is only tested if these hold             */
/* -------------------------------------------------------------------------- */

const REFERENCES = PREVIEW.rows.map((row) => row.Reference);

if (REFERENCES.some((reference) => reference === '')) {
  throw new Error(
    'A line of previewWithRejectedRows() no longer carries a Reference, so the ' +
      'recovered preview could not be checked line by line. (A file whose rows have ' +
      'no reference is previewWithMissingReferenceRejection(), a different fixture.)',
  );
}

if (new Set(REFERENCES).size !== REFERENCES.length) {
  throw new Error(
    'Two lines of previewWithRejectedRows() share a Reference, so "this line is ' +
      'listed exactly once" would no longer identify one row.',
  );
}

if (PREVIEW.willImportRows.length === 0 || PREVIEW.rejectedRows.length === 0) {
  throw new Error(
    'previewWithRejectedRows() no longer has both a will-import and a rejected line, ' +
      'so a recovered preview holding "the file’s rows" would prove less than the ' +
      'criterion asks.',
  );
}

/* -------------------------------------------------------------------------- */
/* Mocks                                                                      */
/* -------------------------------------------------------------------------- */

/** A mocked JSON response built from a project-wide factory body. */
const jsonResponse = (
  status: number,
  body: unknown,
): { status: number; contentType: string; body: string } => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/**
 * Whether the transactions service is answering for this file's bytes yet.
 *
 * A FLAG the test flips, deliberately not an attempt counter: the file's page keeps
 * itself current on an interval while a file is still WORKING
 * (`SubmittedFileDetail`), and although this file is in a settled `Validation failed`
 * state, a preview that re-read itself for any other reason would satisfy an
 * "n-th attempt succeeds" mock without the user ever asking. With a flag, the service
 * refuses every read until the test says otherwise — so the rows can only arrive
 * after the control is used.
 */
interface DownloadService {
  answering: boolean;
}

/**
 * This story's read: `GET /v1/files/download?FileLogId={id}`, the preview's primary
 * source (brief §Data Model).
 *
 * The mock answers ONLY the file it was asked about — a read that named a different
 * file, or none at all, is a miss. That is the wire step a mocked client in jsdom
 * cannot exercise: the rows arriving below prove the identifier really travelled.
 */
const mockSubmittedFileDownload = async (
  page: Page,
  service: DownloadService,
): Promise<void> => {
  await page.route(
    (url) => url.pathname.endsWith(FILE_DOWNLOAD_PATH),
    (route: Route) => {
      const askedAbout = new URL(route.request().url()).searchParams.get(
        'FileLogId',
      );
      if (askedAbout !== String(FILE.Id)) {
        return route.fulfill({ status: 404 });
      }

      if (!service.answering) {
        // Refused with NO readable body at all — the client is left holding only its
        // own placeholder, which is what the assertion below proves never reaches the
        // user. Which WORDS a refusal that does carry a reason must show is AC-4, in
        // the Vitest layer.
        return route.fulfill({ status: 500 });
      }

      // The file's own bytes — the same content `PREVIEW.blob()` wraps for the Vitest
      // layer, streamed under the media type the contract declares for this operation.
      return route.fulfill({
        status: 200,
        contentType: SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
        headers: {
          'content-disposition': `attachment; filename="${FILE.CurrentFileName}"`,
        },
        body: PREVIEW.csv,
      });
    },
  );
};

/**
 * The rejected-row overlay for the SAME file — answering throughout, so the only
 * thing failing in the first half of this test is the download.
 */
const mockValidationErrorsRead = async (page: Page): Promise<void> => {
  await page.route(
    (url) => url.pathname.endsWith(VALIDATION_ERRORS_PATH),
    (route) => route.fulfill(jsonResponse(200, PREVIEW.validationErrors)),
  );
};

/**
 * Blocks the optional columns call rather than inventing a body for it. An
 * implementation that depends on it fails visibly here instead of reaching the live
 * transactions service through the app's own route handler.
 */
const blockValidationErrorColumns = async (page: Page): Promise<void> => {
  await page.route(
    (url) => url.pathname.endsWith(VALIDATION_ERRORS_COLUMNS_PATH),
    (route) => route.abort(),
  );
};

/** The active-files list the file's page resolves this file from. */
const mockFileLogList = async (page: Page): Promise<void> => {
  await page.route(
    (url) => url.pathname.endsWith(FILE_LOGS_PATH),
    (route) => route.fulfill(jsonResponse(200, fileLogListResponse([FILE]))),
  );
};

/** The processing history, so the rest of the page renders as it will in life. */
const mockFileProcessLogList = async (page: Page): Promise<void> => {
  await page.route(
    (url) => url.pathname.includes(FILE_PROCESS_LOGS_PATH),
    (route) => route.fulfill(jsonResponse(200, fileProcessLogListResponse())),
  );
};

/**
 * Answers a BROWSER-side identity read from the shared userinfo source, so it can
 * never disagree with what the Node-side auth stub returns for the same session.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(200, userInfoFor(roleName))),
  );
};

/**
 * Blocks the live services (see LIVE_BACKEND_ORIGINS). Registered LAST, because
 * Playwright matches the most recently registered route first: a call sent to a
 * service's own origin is then aborted and fails visibly, instead of being quietly
 * answered by the origin-agnostic mocks above it.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Puts the browser in a signed-in state without driving the sign-in form and without
 * any real credential: the mock `session` cookie the Node-side stub recognises.
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

/** Opens the file's page as the Finance Uploader (the auth service's `Importer`). */
const openFilePage = async (
  page: Page,
  context: BrowserContext,
  service: DownloadService,
): Promise<void> => {
  await mockFileLogList(page);
  await mockFileProcessLogList(page);
  await mockValidationErrorsRead(page);
  await blockValidationErrorColumns(page);
  await mockSubmittedFileDownload(page, service);
  await mockBrowserIdentityCall(page, ROLE_IMPORTER);
  await seedSession(context, ROLE_IMPORTER);
  await blockLiveBackends(page);

  await page.goto(FILE_PAGE);
};

/* -------------------------------------------------------------------------- */
/* Locators — everything is scoped to the preview                             */
/* -------------------------------------------------------------------------- */

/**
 * The preview section itself: the page's own content, narrowed to the labelled region
 * whose name says preview. Every query below hangs off this, because the file's page
 * already carries a rejected-rows section, a processing history and two download
 * actions, several of which have a failure alert and a retry control of their own.
 */
const previewSection = (page: Page): Locator =>
  page.getByRole('main').getByRole('region', { name: /preview/i });

/** The preview's own failure notice — never a body-level or another section's alert. */
const previewAlert = (page: Page): Locator =>
  previewSection(page).getByRole('alert');

/** The one control that asks for the preview again. */
const loadPreviewAgain = (page: Page): Locator =>
  previewSection(page).getByRole('button', {
    name: LOAD_PREVIEW_AGAIN,
    exact: true,
  });

/** One line of the file, wherever the preview lists it — never by position. */
const previewRow = (page: Page, reference: string): Locator =>
  previewSection(page).getByRole('row').filter({ hasText: reference });

test.describe('Epic import-preview, Story 3: when the file cannot be read', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-5
  // The whole point of running this in a browser: the SAME endpoint refuses one real
  // request and answers the next, with the app's own client, its own parse of the
  // delivered bytes and a real click in between. A recovery that only ever happened
  // against a re-primed module mock proves the button calls something; this proves the
  // user gets their rows back.
  test('after a failed read, asking to load the preview again shows the file’s rows once the service answers', async ({
    page,
    context,
  }) => {
    const downloadService: DownloadService = { answering: false };
    await openFilePage(page, context, downloadService);

    // The page itself resolved, so anything missing below is missing from the preview
    // rather than from a file that never loaded.
    await expect(page.getByRole('main')).toContainText(FILE.CurrentFileName);

    const preview = previewSection(page);
    await expect(
      preview,
      'no preview section is on the file’s page — it must be a labelled section whose ' +
        'name says preview, so its own alert and retry control can be told apart from ' +
        'the rejected-rows section’s (see this spec’s implementation assumptions)',
    ).toHaveCount(1);

    // The starting position: the file could not be read, and the preview says so
    // instead of drawing a table of any kind (BR8). WHAT it says is AC-4's business,
    // in the Vitest layer — established here only so the rows below are demonstrably
    // new.
    await expect(
      previewAlert(page),
      'a refused download left the preview silent — no stated failure at all (NFR-3)',
    ).toBeVisible();
    await expect(
      preview.getByRole('table'),
      'the preview drew a table for a file it could not read (BR8) — an empty, ' +
        'partial or misaligned table is exactly what this story forbids',
    ).toHaveCount(0);
    await expect(
      page.getByRole('main'),
      'the API client’s internal placeholder reached the user (project.md NFR-base-5)',
    ).not.toContainText(/internal server error/i);

    const askAgain = loadPreviewAgain(page);
    await expect(
      askAgain,
      `the failed preview offers no control named exactly “${LOAD_PREVIEW_AGAIN}”, so ` +
        'there is nothing for the user to recover with (NFR-3)',
    ).toHaveCount(1);

    // The service starts answering for this file. Flipped BEFORE the click, so the
    // read the click provokes is the first one that can succeed.
    downloadService.answering = true;
    await askAgain.click();

    // Every line of the file is now listed, exactly once each — the recovery is a real
    // one, not a cleared error message over an empty section.
    for (const reference of REFERENCES) {
      await expect(
        previewRow(page, reference),
        `the file’s line “${reference}” is not listed exactly once in the preview ` +
          'after asking to load it again — the retry did not read and parse the file',
      ).toHaveCount(1);
    }

    // ...and the failure notice is gone, rather than sitting above the rows it was
    // reporting the absence of.
    await expect(
      previewAlert(page),
      'the preview still reports a problem reading the file after successfully ' +
        'loading it',
    ).toHaveCount(0);

    // The rest of the page came through the failure and the recovery untouched.
    await expect(
      page.getByRole('main'),
      'the file’s own details are gone from the page, so the preview’s failure did ' +
        'not stay contained to the preview',
    ).toContainText(FILE.CurrentFileName);
  });
});
