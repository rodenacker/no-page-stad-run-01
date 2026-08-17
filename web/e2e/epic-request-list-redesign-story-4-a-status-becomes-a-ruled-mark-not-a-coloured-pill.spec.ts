/**
 * Story Metadata:
 * - Epic: request-list-redesign — Redesign the request list as a batch listing
 * - Story: 4 — A status becomes a ruled mark, not a coloured pill
 * - Route: /requests (this story's target is the SHARED mark, so its regression
 *   surface is the files screens: /upload and /upload/file?LogId=<id>)
 * - Target File: web/src/components/status/StatusBadge.tsx
 * - Page Action: modify_existing
 * - Requirements: R26, R18, R3, BR3, BR11, R28
 *
 * ---------------------------------------------------------------------------
 * Coverage split (feature-planner tags — one tag, one test, one layer)
 * ---------------------------------------------------------------------------
 * - AC-5 (the submitted-files list, a file's detail, its import preview and its
 *   rejected rows all still show their statuses correctly in the new mark) → the
 *   single test below, this story's ONLY `playwright`-tagged criterion.
 * - AC-1 (a status reads as a shape beside a capitalised word, no longer a rounded
 *   coloured pill), AC-3 (an unrecognised status still reaches the reader in the
 *   service's own words, with no shape claiming a meaning), AC-4 (the
 *   possible-duplicate mark still says so in words) and AC-6 (the cancelled mark
 *   renders correctly if exercised) → the Vitest layer at
 *   `web/src/__tests__/integration/epic-request-list-redesign-story-4-a-status-becomes-a-ruled-mark-not-a-coloured-pill.test.tsx`.
 *   Deliberately NOT duplicated here.
 * - AC-2 (the four shapes are told apart with colour ignored entirely) is tagged
 *   `none`: it is a greyscale-screenshot judgement, on this story's manual checklist.
 * - No axe scan here. This epic's real-browser accessibility scan belongs to the
 *   redesigned request-list surface, and the files screens' own scans already ran in
 *   `file-validation-and-retry` story 1 and `import-preview` story 2 — this story
 *   restyles a shared component, it does not introduce a surface.
 *
 * ---------------------------------------------------------------------------
 * What this test is, and what it deliberately does not assert
 * ---------------------------------------------------------------------------
 * This is the R28 REGRESSION GUARD for the shared mark. `StatusBadge` is rendered by
 * eight consumers (story §Implementation notes); four of them are the files screens,
 * which this epic explicitly does NOT restyle (brief §Out of Scope). Restyling the
 * one shared component for the request list must therefore leave every files surface
 * still SAYING what it said before.
 *
 * So it asserts one thing per surface, in a real browser: the status reaches the
 * reader AS WORDS, in its own readable run of text, on the file's row, on the file's
 * own page, on each row of its import preview, and against each of its rejected rows.
 *
 * It asserts NO colour, NO CSS class and NO shape. Those are the mark's visual
 * grammar, which this epic is free to replace outright (brief BR1) — a spec that
 * pinned them would fail on the intended redesign and would have to be loosened,
 * which is exactly the spec change BR1 forbids. The greyscale/shape half of the
 * design lives on the manual checklist (AC-2) and the pill-versus-mark half in the
 * Vitest layer (AC-1), where the rendered component is the subject.
 *
 * Consequence, stated plainly: this test SHOULD pass both before and after the
 * restyle. That is what a regression guard is for. It fails the moment the files
 * screens are left half-restyled, unstyled, or rendering a mark with no word in it —
 * the R28 failure this story's notes call out as the real risk.
 *
 * The status word is matched as a WHOLE READABLE RUN (anchored, case-insensitive,
 * tolerating a leading/trailing glyph character), never as a substring of the row.
 * That is deliberate and load-bearing: the files list also shows each file's most
 * recent activity, so a substring match on `Validating` would be satisfied by
 * `Validating rows` and one on `Cancelled` by `Cancelled by user` — the status
 * column could vanish entirely and a substring assertion would still pass.
 * Case-insensitive so a tracked/uppercased label still counts as the same word.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running on this machine. Two boundaries, both
 * established by the earlier epics and REUSED here rather than rebuilt:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. Both screens are gated
 *    SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process, epic 1 BR1/BR3), and
 *    `page.route()` cannot see a fetch the browser never makes. The stub answers that
 *    call from the shared identity source, keyed off the `session` cookie seeded below.
 * 2. Browser boundary → `page.route()` below, for every transactions-service read
 *    these two screens make at the app's own same-origin `/transactions-api/...`
 *    mount point:
 *    - `GET /v1/file-logs?IsActive=Yes` — the submitted-files list, and how the file
 *      page resolves the requested `LogId` (there is no get-one-file endpoint);
 *    - `GET /v1/file-settings` — the submit form on the files screen reads the named
 *      settings for itself;
 *    - `GET /v1/file-process-logs/{LogId}` — the file page's processing history;
 *    - `GET /v1/files/download?FileLogId=<id>` — the bytes the import preview is
 *      parsed from;
 *    - `GET /v1/files/validation-errors?FileLogId=<id>` — the rejected-row overlay,
 *      read by BOTH the preview and the rejected-rows section;
 *    - `GET /v1/files/validation-errors/columns` and `GET /v1/transactions` — ABORTED,
 *      not answered, exactly as `import-preview` story 2's spec does: neither is a
 *      source of anything asserted here, and blocking them makes a dependency on them
 *      fail visibly instead of quietly reaching a live service.
 *    Every one of these is mocked in this test even where nothing is asserted about
 *    it: `/transactions-api/...` is the app's OWN route handler, so an unmocked read
 *    is forwarded to the live transactions service from inside the Next.js process
 *    (where a browser-level origin block cannot see it) — which would both contact a
 *    live backend and put an unrelated failure alert on the screen, breaking the
 *    "nothing is broken" half of this test.
 *    Plus a hard block on the real services' own origins (:4424 / :4423) so no
 *    browser-side call can leak to a live backend even if the app were pointed at the
 *    wrong address.
 *
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by
 *   driving the sign-in form — epic 1 story 2's spec owns that journey, and the
 *   cookie is the app's sole conveyance of session (epic 1 BR2). Cookies ignore port,
 *   so one seed serves the dev server (:3000) and the epic-end production run (:3100).
 * - Every response body comes from the project-wide factories under
 *   `web/src/mocks/data/` (`userInfoFor()`, `fileLogsInEveryStatus()`,
 *   `fileLogListResponse()`, `fileProcessHistory()`, `fileProcessLogListResponse()`,
 *   `fileSettingListResponse()`, `previewWithRejectedRows()`); no response shape and
 *   no CSV byte is authored in this file, so this spec cannot drift from the Vitest
 *   layer on the contract. The defect sentence each rejected row must read is taken
 *   from the app's own shared wording module rather than retyped here, for the same
 *   reason.
 *
 * ---------------------------------------------------------------------------
 * Implementation patterns this spec assumes (read before implementing)
 * ---------------------------------------------------------------------------
 * - THE MARK STAYS ONE SHARED COMPONENT (story §Implementation notes). Both files
 *   screens keep rendering the SAME `StatusBadge` the request list does — forking a
 *   request-list-only mark, or leaving these screens on the old pill, is the R28
 *   failure this test exists to catch.
 * - THE WORD SURVIVES THE RESTYLE (R3/UI-21, BR3). The mark's text label is real,
 *   readable text on the page — a shape alone, or a status conveyed only by colour,
 *   fails every assertion below. The label may be tracked, uppercased or re-cased by
 *   the new notation; it is matched case-insensitively for exactly that reason.
 * - THE WORD IS ITS OWN RUN OF TEXT. The status label is not buried inside a longer
 *   sentence in the same element: it is the readable content of the mark (a glyph
 *   sibling — an svg, or a single glyph character — is fine). This is how a reader
 *   picks the status out of a row, and how these assertions tell the status apart
 *   from the activity text beside it.
 * - Every read stays in the BROWSER, through the shared API client at the app's own
 *   `/transactions-api/...` address. `page.route()` cannot intercept a fetch made by
 *   the Next.js server or a Server Action, so moving any of these reads server-side
 *   would bypass these mocks and leave for the real transactions service.
 * - A file's row keeps offering a real navigational LINK to
 *   `/upload/file?LogId=<that file's Id>` — located by DESTINATION below, never by
 *   label, because the wording is the developer's.
 * - The file page keeps its three named sections — `File details`, `Import preview`
 *   and `Rejected rows` (each a `<section aria-labelledby>` with its own heading, so
 *   each is a named `region`). They are addressed as regions here because the preview
 *   and the rejected-rows section deliberately list the SAME rejected rows, and an
 *   unscoped query could not tell which surface it was reading.
 * - Alert queries are scoped to `main`: Next renders a permanently empty body-level
 *   `role="alert"` route announcer, so an unscoped query always matches two elements.
 * - Cookie assumptions: the mock `session` cookie carries production-like attributes
 *   (HttpOnly, SameSite=Strict). `Secure` is omitted because the E2E server is plain
 *   http on localhost; the real cookie's full attribute set is asserted in the Vitest
 *   layer (epic 1, story 1).
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credential is
 * needed.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
// The app's OWN sentence for a rejected row's defect — read from the shared module
// rather than retyped, so the wording this test expects on screen cannot drift from
// the wording the app renders.
import { defectWordingFor } from '../src/lib/files/defectWording';
import {
  FILE_STATUSES,
  fileLogListResponse,
  fileLogsInEveryStatus,
} from '../src/mocks/data/file-log';
import {
  fileProcessHistory,
  fileProcessLogListResponse,
} from '../src/mocks/data/file-process-log';
import { fileSettingListResponse } from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
  previewWithRejectedRows,
} from '../src/mocks/data/submitted-file';

import type { BrowserContext, Locator, Page, Route } from '@playwright/test';
import type { FileLog } from '../src/mocks/data/file-log';

/* -------------------------------------------------------------------------- */
/* The two screens                                                             */
/* -------------------------------------------------------------------------- */

/** The submitted expense files list (epic `expense-file-upload`). */
const UPLOAD_PATH = '/upload';

/** One submitted file's own page, identified by `LogId` in the query. */
const FILE_PATH = '/upload/file';

/* -------------------------------------------------------------------------- */
/* The files being shown                                                       */
/* -------------------------------------------------------------------------- */

/**
 * THE FILE the file page is opened for: the canonical five-line preview fixture whose
 * lines 3 and 5 the service rejected. One call gives its `FileLog` (status
 * `Validation failed`, which is what makes BOTH the import preview and the
 * rejected-rows section render), its CSV bytes, and the validation-errors body
 * describing those same two lines — so this spec cannot pair a file with an overlay
 * describing a different one.
 */
const PREVIEW = previewWithRejectedRows();

/**
 * What the submitted-files list is served: one file per recognised file status, plus
 * the file the page is opened for.
 *
 * One row per status is the point — the mark is shared, so a restyle that breaks it
 * breaks every status at once, and a single-status list could not tell a broken mark
 * apart from a broken row. It also exercises the CANCELLED mark, which BR11 says must
 * render correctly if used even though no listed request can be cancelled.
 */
const LISTED_FILES: FileLog[] = [...fileLogsInEveryStatus(), PREVIEW.file];

/** The file page's address, exactly as a row's link addresses it. */
const filePageAddress = (file: FileLog): RegExp =>
  new RegExp(`${FILE_PATH}\\?(.*&)?LogId=${String(file.Id)}(&|$)`);

/* -------------------------------------------------------------------------- */
/* Fixture integrity — AC-5 is only tested if these hold                       */
/* -------------------------------------------------------------------------- */

if (
  new Set(LISTED_FILES.map((file) => file.CurrentStatus)).size <
  FILE_STATUSES.length
) {
  throw new Error(
    'The list served below no longer covers every recognised file status, so this ' +
      'test could no longer show that the shared mark still reads correctly for all ' +
      'of them (R28). Statuses served: ' +
      LISTED_FILES.map((file) => file.CurrentStatus).join(', '),
  );
}

if (PREVIEW.unmatchableRejections.length > 0) {
  throw new Error(
    'previewWithRejectedRows() now carries a rejection with no line in the file ' +
      '(BR9), so a rejected row could no longer be found by its own reference here.',
  );
}

if (
  PREVIEW.counts.willImport === 0 ||
  PREVIEW.rejectedLineNumbers.length === 0
) {
  throw new Error(
    'previewWithRejectedRows() no longer holds BOTH a will-import line and a ' +
      'rejected one, so this test could not show the two verdict marks still read ' +
      'correctly side by side.',
  );
}

/* -------------------------------------------------------------------------- */
/* What each surface must say                                                  */
/* -------------------------------------------------------------------------- */

const escapeForRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * "This word, on its own, as the readable content of the mark."
 *
 * Anchored, so `Validating` cannot be satisfied by the `Validating rows` activity
 * text sitting in the next cell (nor `Cancelled` by `Cancelled by user`) — without
 * the anchors the status column could be missing altogether and every assertion below
 * would still pass. Case-insensitive, because the new notation is free to track or
 * uppercase the label and it is still the same word. A leading or trailing
 * non-alphanumeric character is tolerated so a mark whose glyph is a single character
 * in the same element as its label still counts as readable.
 */
const readsAsTheWord = (word: string): RegExp =>
  new RegExp(
    `^[^\\p{L}\\p{N}]*${escapeForRegExp(word)}[^\\p{L}\\p{N}]*$`,
    'iu',
  );

/** The two verdict labels an import-preview row carries (requirement text, not wire data). */
const WILL_IMPORT = readsAsTheWord('Will import');
const REJECTED = readsAsTheWord('Rejected');

/** One line of the previewed file, and the verdict its row must read. */
interface PreviewLineFixture {
  /** 1-based position in the file's data lines. */
  readonly line: number;
  /** How the line is addressed on screen: its own reference. */
  readonly reference: string;
  readonly expected: RegExp;
  readonly forbidden: RegExp;
}

const PREVIEW_LINES: readonly PreviewLineFixture[] = PREVIEW.rows.map(
  (row, index) => {
    const line = index + 1;
    const rejected = PREVIEW.rejectedLineNumbers.includes(line);
    return {
      line,
      reference: row.Reference,
      expected: rejected ? REJECTED : WILL_IMPORT,
      forbidden: rejected ? WILL_IMPORT : REJECTED,
    };
  },
);

/**
 * One rejected row, and the sentence the rejected-rows section must state about it.
 *
 * That sentence is this surface's status: `RejectedRows` shows no status mark of its
 * own (it lists rows the service already refused), so what must survive here is that
 * each row still SAYS in words what is wrong with it — the same shared wording the
 * preview uses, from the app's own module.
 */
interface RejectedRowFixture {
  readonly reference: string;
  readonly defect: string;
}

const REJECTED_ROWS: readonly RejectedRowFixture[] = PREVIEW.rejections.map(
  (row) => {
    const defect = defectWordingFor(row);
    const reference = row.Reference;
    if (
      defect === undefined ||
      reference === undefined ||
      reference === '' ||
      defect === ''
    ) {
      throw new Error(
        'A rejection in previewWithRejectedRows() has no reference or no defect ' +
          'wording, so its row could not be found on screen and checked for what it ' +
          'says. (That case is real — it is why BR9 and NO_REASON_GIVEN exist — but ' +
          'it belongs on the fixture built for it.)',
      );
    }
    return { reference, defect };
  },
);

/* -------------------------------------------------------------------------- */
/* Mocks                                                                       */
/* -------------------------------------------------------------------------- */

/** The reads these two screens make, as the BROWSER addresses them. */
const FILE_LOGS_URL_GLOB = '**/transactions-api/v1/file-logs**';
const FILE_SETTINGS_URL_GLOB = '**/transactions-api/v1/file-settings**';
const FILE_PROCESS_LOGS_URL_GLOB =
  '**/transactions-api/v1/file-process-logs/**';
const FILE_DOWNLOAD_PATH = '/v1/files/download';
const VALIDATION_ERRORS_PATH = '/v1/files/validation-errors';
const VALIDATION_ERRORS_COLUMNS_PATH = '/v1/files/validation-errors/columns';
const TRANSACTIONS_PATH = '/v1/transactions';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

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

/** The active file list — the files screen's own read, and how the file page resolves `LogId`. */
const mockFileLogList = async (page: Page): Promise<void> => {
  await page.route(FILE_LOGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(200, fileLogListResponse(LISTED_FILES))),
  );
};

/**
 * The reads that belong to OTHER sections of these screens: the submit form's named
 * settings and the file's processing history. Answered in full so neither can fall
 * through the app's own route handler to the live transactions service, and neither
 * can put a failure alert on a screen this test asserts is intact.
 */
const mockNeighbouringReads = async (page: Page): Promise<void> => {
  await page.route(FILE_SETTINGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(200, fileSettingListResponse())),
  );
  await page.route(FILE_PROCESS_LOGS_URL_GLOB, (route) =>
    route.fulfill(
      jsonResponse(200, fileProcessLogListResponse(fileProcessHistory())),
    ),
  );
};

/** The `FileLogId` this request asked about, or `null` if it sent none. */
const fileAskedAboutBy = (route: Route): string | null =>
  new URL(route.request().url()).searchParams.get('FileLogId');

/**
 * The submitted file's own bytes, streamed the way the service streams them
 * (`application/octet-stream`), so the real binary-response path in the API client is
 * the one exercised. A request for any OTHER file — or one that forgot the identifier
 * — is refused, so a preview built from the wrong download fails loudly rather than
 * rendering somebody else's rows.
 */
const mockFileDownload = async (page: Page): Promise<void> => {
  await page.route(
    (url) => url.pathname.endsWith(FILE_DOWNLOAD_PATH),
    (route: Route) => {
      if (fileAskedAboutBy(route) !== String(PREVIEW.file.Id)) {
        return route.fulfill(
          jsonResponse(404, {
            Messages: [
              'No file was requested by identifier — the preview must download the ' +
                'file whose page it is on (GET /v1/files/download?FileLogId=<id>).',
            ],
          }),
        );
      }
      return route.fulfill({
        status: 200,
        contentType: SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
        headers: {
          'content-disposition': `attachment; filename="${PREVIEW.file.CurrentFileName}"`,
        },
        body: PREVIEW.csv,
      });
    },
  );
};

/**
 * The rejected-row overlay both the preview and the rejected-rows section read, in the
 * wire's own JSON-array-as-a-string envelope. Matched by PATH so it cannot also
 * swallow the columns call, and answered only for the file it was asked about.
 */
const mockValidationErrorsRead = async (page: Page): Promise<void> => {
  await page.route(
    (url) => url.pathname.endsWith(VALIDATION_ERRORS_PATH),
    (route: Route) =>
      route.fulfill(
        jsonResponse(
          200,
          fileAskedAboutBy(route) === String(PREVIEW.file.Id)
            ? PREVIEW.validationErrors
            : { JsonArray: '[]' },
        ),
      ),
  );
};

/**
 * Blocks the two reads nothing here may depend on: the optional validation-error
 * columns call (no shared factory describes its body) and `GET /v1/transactions`
 * (the request list's read, which has no business on these screens). Blocking turns a
 * hidden dependency into a visible failure instead of a quiet live-service call.
 */
const blockUnusedReads = async (page: Page): Promise<void> => {
  await page.route(
    (url) =>
      url.pathname.endsWith(VALIDATION_ERRORS_COLUMNS_PATH) ||
      url.pathname.endsWith(TRANSACTIONS_PATH),
    (route) => route.abort(),
  );
};

/**
 * Puts the browser in a signed-in state as the named role, without a real credential:
 * the mock `session` cookie the Node-side auth stub maps back to this role when the
 * server-side gate asks it who the session belongs to.
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
/* Locators                                                                    */
/* -------------------------------------------------------------------------- */

/** One file's row in the submitted-files list, found by the file's own name. */
const fileRow = (page: Page, file: FileLog): Locator =>
  page
    .getByRole('main')
    .getByRole('row')
    .filter({ hasText: file.CurrentFileName });

/**
 * A row's way to open the file, found by WHERE IT GOES rather than by what it is
 * called: the wording is the developer's, the destination is the contract.
 */
const openFileLinkIn = (row: Locator): Locator =>
  row.locator(`a[href*="${FILE_PATH}"]`);

/**
 * The file page's three named sections. Addressed as regions because the preview and
 * the rejected-rows section deliberately list the SAME rejected rows — an unscoped
 * query could not say which surface it had read.
 */
const fileDetails = (page: Page): Locator =>
  page.getByRole('main').getByRole('region', { name: /^file details$/i });

const importPreview = (page: Page): Locator =>
  page.getByRole('main').getByRole('region', { name: /^import preview$/i });

const rejectedRows = (page: Page): Locator =>
  page.getByRole('main').getByRole('region', { name: /^rejected rows$/i });

/** One row inside a section, found by the file line's own reference. */
const rowFor = (section: Locator, reference: string): Locator =>
  section.getByRole('row').filter({ hasText: reference });

/** Anything on the screen reporting a problem (scoped to the page's own content). */
const failureAlerts = (page: Page): Locator =>
  page.getByRole('main').getByRole('alert');

/* -------------------------------------------------------------------------- */
/* The test                                                                    */
/* -------------------------------------------------------------------------- */

test.describe('Epic request-list-redesign, Story 4: a status becomes a ruled mark, not a coloured pill', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-5
  // ONE journey across all four surfaces, because it is one criterion about one
  // shared component: the mark is restyled once, so the regression is either present
  // on all of these screens or on none, and walking them in sequence is what shows
  // the shared component still reads correctly wherever it is used (R28).
  //
  // Walked the way an Importer gets there: the files list, then a file opened from its
  // own row — never by typing the address — so the screens are the ones a user meets.
  test('the submitted-files list, a file’s detail, its import preview and its rejected rows all still show their statuses in words', async ({
    page,
    context,
  }) => {
    await mockFileLogList(page);
    await mockNeighbouringReads(page);
    await mockFileDownload(page);
    await mockValidationErrorsRead(page);
    await blockUnusedReads(page);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await seedSession(context, ROLE_IMPORTER);
    await blockLiveBackends(page);

    /* ---------------------------------------------------------------------- */
    /* Surface 1 — the submitted-files list                                   */
    /* ---------------------------------------------------------------------- */

    await page.goto(UPLOAD_PATH);

    for (const file of LISTED_FILES) {
      const row = fileRow(page, file);
      await expect(
        row,
        `${file.CurrentFileName} must still be listed on the submitted files screen`,
      ).toBeVisible();

      await expect(
        row.getByText(readsAsTheWord(file.CurrentStatus)),
        `${file.CurrentFileName}'s row must still show its status as the word ` +
          `"${file.CurrentStatus}" — the mark is restyled by this story, but the ` +
          'status must still reach the reader in words, never as a shape or a colour ' +
          'alone (R3/UI-21, BR3). Matched as the whole readable label, so the ' +
          'activity text in the next cell cannot stand in for a missing status.',
      ).toBeVisible();
    }

    await expect(
      failureAlerts(page),
      'the submitted files screen is reporting a problem, so what the statuses read ' +
        'there cannot be judged (R28 — this screen must remain intact)',
    ).toHaveCount(0);

    /* ---------------------------------------------------------------------- */
    /* Surface 2 — the file's own detail                                      */
    /* ---------------------------------------------------------------------- */

    await openFileLinkIn(fileRow(page, PREVIEW.file)).click();
    await expect(page).toHaveURL(filePageAddress(PREVIEW.file));

    const details = fileDetails(page);
    await expect(
      details,
      'the opened file must still show its own details section',
    ).toBeVisible();
    await expect(
      details.getByText(readsAsTheWord(PREVIEW.file.CurrentStatus)),
      `the file's own page must still show its status as the word ` +
        `"${PREVIEW.file.CurrentStatus}". Scoped to the details section on purpose: ` +
        'the processing history below it records the same outcome, so an unscoped ' +
        'match would pass even with the status field empty.',
    ).toBeVisible();

    /* ---------------------------------------------------------------------- */
    /* Surface 3 — the file's import preview                                  */
    /* ---------------------------------------------------------------------- */

    const preview = importPreview(page);
    await expect(
      preview,
      'a file whose validation has run must still show its import preview',
    ).toBeVisible();

    for (const fixture of PREVIEW_LINES) {
      const row = rowFor(preview, fixture.reference);
      await expect(
        row,
        `line ${String(fixture.line)} of the file ("${fixture.reference}") must still ` +
          'appear in the import preview',
      ).toBeVisible();

      await expect(
        row.getByText(fixture.expected),
        `the preview row for line ${String(fixture.line)} ` +
          `("${fixture.reference}") must still read its verdict in words. The mark ` +
          'restyled by this story is the one that carries it, so a verdict left as a ' +
          'shape or a colour alone fails UI-21 here as well as on the request list.',
      ).toBeVisible();

      await expect(
        row.getByText(fixture.forbidden),
        `the preview row for line ${String(fixture.line)} ` +
          `("${fixture.reference}") now reads the OTHER verdict as well, so what the ` +
          'reader is told about this row is ambiguous',
      ).toHaveCount(0);
    }

    /* ---------------------------------------------------------------------- */
    /* Surface 4 — the file's rejected rows                                   */
    /* ---------------------------------------------------------------------- */

    const rejected = rejectedRows(page);
    await expect(
      rejected,
      'a file whose validation failed must still show its rejected rows',
    ).toBeVisible();

    for (const fixture of REJECTED_ROWS) {
      const row = rowFor(rejected, fixture.reference);
      await expect(
        row,
        `the rejected row "${fixture.reference}" must still be listed`,
      ).toBeVisible();

      await expect(
        row,
        `the rejected row "${fixture.reference}" must still state what is wrong with ` +
          'it in words. This section carries no status mark of its own — the ' +
          "sentence IS the row's status here — so it must survive a restyle of the " +
          'shared mark untouched (R28).',
      ).toContainText(fixture.defect);
    }

    await expect(
      failureAlerts(page),
      'the file’s page is reporting a problem, so the statuses on its three sections ' +
        'cannot be judged (R28 — these screens must remain intact while the shared ' +
        'mark is restyled)',
    ).toHaveCount(0);
  });
});
