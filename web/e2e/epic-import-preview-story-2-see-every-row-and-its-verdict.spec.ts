/**
 * Story Metadata:
 * - Epic: import-preview — Preview the rows of an import
 * - Story: 2 — See every row of the file, and what will happen to it
 * - Route: /upload/file (opened as `/upload/file?LogId=<id>`)
 * - Target File: web/src/components/files/ImportPreview.tsx
 * - Page Action: modify_existing (the route and page already exist; this adds a section)
 * - Requirements: FR1, FR2, FR3, FR4, FR5, FR8, BR1, BR2, BR3, BR9, NFR-4
 *
 * ---------------------------------------------------------------------------
 * Coverage split (feature-planner tags — one tag, one test, one layer)
 * ---------------------------------------------------------------------------
 * - AC-1 (every row of the file, in file order, each carrying a "Will import" or
 *   "Rejected" text label — never colour alone, never the word "Imported") → test 1
 *   below, the story's ONLY `playwright`-tagged criterion.
 * - AC-2 (no preview before validation has run), AC-3 (a will-import row's masked
 *   account number and plain-language transaction type), AC-4 (a rejected row's
 *   untranslated values, per-row reveal and defect wording), AC-5 (BR9's unmatchable
 *   rejected row) and AC-6 (the plain-language counts) → `web/src/__tests__/
 *   integration/epic-import-preview-story-2-see-every-row-and-its-verdict.test.tsx`
 *   (`vitest`). Deliberately NOT duplicated here.
 * - Test 2 is this EPIC's single real-browser accessibility scan. The preview is a new
 *   surface on the submitted-file page and NFR-2 puts it at WCAG 2.2 AA, but no story
 *   in this epic carries an accessibility criterion of its own — and the earlier
 *   epic's scan (`file-validation-and-retry` story 1 AC-6) ran on a page that had no
 *   preview section on it. So the scan lives with the story that introduces the
 *   surface. `file-validation-and-retry` stories 2–4 already established that the
 *   scan is not repeated per story; stories 3 and 4 of THIS epic therefore do not
 *   repeat it either.
 *
 * ---------------------------------------------------------------------------
 * Why AC-1 belongs in a real browser rather than in jsdom
 * ---------------------------------------------------------------------------
 * The Vitest layer mocks `@/lib/api/client` wholesale, so it hands the component a
 * ready-made row list and never exercises the thing this criterion is actually about:
 * the preview's rows come from THE FILE ITSELF — downloaded as bytes over HTTP from
 * `GET /transactions-api/v1/files/download?FileLogId=<id>` as `application/octet-stream`,
 * read as a `Blob` by the real client, decoded to text and parsed client-side — with
 * `GET /transactions-api/v1/files/validation-errors?FileLogId=<id>` overlaid on top to
 * decide each row's verdict. Two independent reads, both over the real wire, agreeing
 * about the same file. Only a browser runs that chain end to end.
 *
 * It is also the only place "in file order" means anything: order is a property of the
 * DELIVERED document, and this spec reads it back out of the rendered page.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running on this machine. This screen crosses
 * BOTH mock boundaries the earlier epics established; this spec reuses their harness
 * rather than inventing one:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. `/upload/file` is gated
 *    SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` below, for every transactions-service call this
 *    page makes at the app's own same-origin `/transactions-api/...` mount point:
 *    - `GET /v1/file-logs?IsActive=Yes` — `file-validation-and-retry` story 1 resolves
 *      the file from the active list (there is no get-one-file endpoint);
 *    - `GET /v1/file-process-logs/{LogId}` — that story's processing history, mocked
 *      in every test even though nothing here asserts on it: an unmocked read is
 *      forwarded to the LIVE transactions service by the app's own route handler
 *      (inside the Next.js process, where a browser-level origin block cannot see it),
 *      and its failure alert would occupy the page;
 *    - `GET /v1/files/download?FileLogId=<id>` — THIS story's primary source, the
 *      submitted file's own bytes (brief §Data Model, revised 2026-08-17);
 *    - `GET /v1/files/validation-errors?FileLogId=<id>` — the overlay that marks which
 *      of those rows the service rejected;
 *    - `GET /v1/files/validation-errors/columns` — ABORTED, not answered, exactly as
 *      `file-validation-and-retry` story 2's spec does: the call is optional, no shared
 *      factory describes its body, and blocking it makes a dependency on it fail
 *      visibly instead of quietly reaching a live service;
 *    - `GET /v1/transactions` — ABORTED. The brief DEMOTES this read: it is future
 *      confirmation of what actually imported, not a source of the preview's rows
 *      (§Data Model, "Forward path"). Blocking it turns "the preview quietly depends on
 *      the backend split that has not shipped" into a visible failure rather than a
 *      permanently empty will-import half.
 *    Plus a hard block on the real services' own origins (:4424 / :4423) so no
 *    browser-side call can leak to a live backend even if the app were pointed at the
 *    wrong address.
 *
 * BOTH file reads ANSWER ONLY THE FILE THEY WERE ASKED ABOUT. A download request
 * carrying the wrong `FileLogId` (or none) is refused outright; a validation-errors
 * request carrying the wrong one gets an empty row set. That is deliberate — it is what
 * makes the assertions below evidence that the app really serialised `FileLogId` onto
 * each request, which is precisely the data-contract step a mocked client in jsdom
 * skips.
 *
 * EVERY BYTE COMES FROM THE SHARED FIXTURE. `previewWithRejectedRows()`
 * (`web/src/mocks/data/submitted-file.ts`) hands out one coherent file — its `FileLog`,
 * its CSV bytes, and the validation-errors body describing the SAME rows — and the
 * Vitest layer for this story reads the very same fixture. No CSV text and no response
 * shape is authored in this file: the whole point of the preview is that the parsed
 * file and the rejected-row overlay agree, and two layers writing their own bytes is
 * exactly how that agreement rots.
 *
 * ---------------------------------------------------------------------------
 * Implementation patterns this spec assumes (read before implementing)
 * ---------------------------------------------------------------------------
 * - The original file is downloaded FROM THE BROWSER through the shared API client
 *   (`downloadSubmittedFile`, already wired by `file-validation-and-retry` FR6) at the
 *   app's own `/transactions-api/...` address, and parsed client-side. `page.route()`
 *   cannot intercept a read issued by the Next.js server or a Server Action, so a
 *   server-side download would bypass these mocks and leave for the real transactions
 *   service.
 * - THE PREVIEW IS ONE ORDERED LIST, NOT TWO STACKED HALVES. AC-1 says "every row of
 *   the file, IN FILE ORDER", so a will-import row and a rejected row sit next to each
 *   other in the positions their file gave them. The story's "two halves" language
 *   (BR3) is about the two per-row DISPLAY conventions — masking, reveal, translated
 *   vs. untranslated type — not about splitting the rows into two tables. Grouping the
 *   rows by verdict would destroy file order and fail test 1.
 * - It renders as a TABLE (the Shadcn `table` primitive, as `SubmittedFilesList`, the
 *   expense request list and `RejectedRows` already do), one `row` per file line. The
 *   table is located here by CONTENT it holds, never by position or a test id, so it
 *   cannot be confused with the two tables already on this page and no extra labelling
 *   contract is imposed on the developer.
 * - Each row carries its verdict as VISIBLE TEXT reading "Will import" or "Rejected"
 *   (UI-21 / NFR-4: intent-mapped colour paired with an icon or a text label, never
 *   colour alone). The assertions below read `innerText`, so a verdict conveyed only
 *   by colour, or only by a screen-reader-only string, fails.
 * - THE WORD "IMPORTED" NEVER APPEARS ON A PREVIEW ROW (BR2, the epic's hard honesty
 *   rule). The backend has not imported anything; a row the service did not reject is
 *   a row that WILL import. "Will import" is fine — "Imported" as a row's verdict is
 *   the failure this spec exists to catch.
 * - The preview shares the page with `RejectedRows`, which lists the same rejected rows
 *   again by design (the user chose this). Every query below is scoped to the preview
 *   table for that reason.
 * - Alert queries are scoped to `main`: Next renders a permanently empty body-level
 *   `role="alert"` route announcer, so an unscoped query always matches two elements.
 * - Cookie assumptions: the session travels only in the `session` cookie, seeded
 *   directly rather than by driving the sign-in form (epic 1 story 2's spec owns that
 *   journey). Cookies ignore port, so one seed serves the dev server (:3000) and the
 *   epic-end production run (:3100). `Secure` is omitted because the E2E server is
 *   plain http on localhost.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credential is
 * needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — the submitted-file
 * page has no preview section yet, and nothing in the app can read a CSV.
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from '@axe-core/playwright';
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
/* The file being previewed                                                    */
/* -------------------------------------------------------------------------- */

/**
 * THE canonical preview fixture: a five-line file whose lines 3 and 5 the service
 * rejected. One call gives the `FileLog`, the file's own CSV bytes and the
 * validation-errors body describing those same two lines, so this spec cannot pair a
 * file with an overlay that describes a different one.
 */
const PREVIEW = previewWithRejectedRows();

/** The file's own page, reached with its identifier in the query. */
const FILE_PAGE = `/upload/file?LogId=${String(PREVIEW.file.Id)}`;

/** The two reads this story's preview is assembled from. */
const FILE_DOWNLOAD_PATH = '/v1/files/download';
const VALIDATION_ERRORS_PATH = '/v1/files/validation-errors';
const VALIDATION_ERRORS_COLUMNS_PATH = '/v1/files/validation-errors/columns';

/** The demoted read (brief §Data Model) — blocked, never a source of preview rows. */
const TRANSACTIONS_PATH = '/v1/transactions';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * WCAG 2.2 AA — this project's effective accessibility bar (project.md §Baseline NFRs
 * and this epic's NFR-2, superseding the template's 2.1 AA floor). The identical tag
 * set the earlier epics' scans used. Scoped explicitly because axe's defaults also run
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

/* -------------------------------------------------------------------------- */
/* What the screen must say about each row                                     */
/* -------------------------------------------------------------------------- */

/**
 * The two verdict labels, word for word from AC-1. Requirement text, not wire data —
 * which is why these are the only literal strings in this file.
 */
const WILL_IMPORT_LABEL = /will import/i;
const REJECTED_LABEL = /\brejected\b/i;

/**
 * The claim BR2 forbids. Matched as a WHOLE WORD, so the honest "Will import" and a
 * heading such as "Import preview" pass while "Imported" — a row asserting the backend
 * has already taken it — does not.
 */
const IMPORTED_CLAIM = /\bimported\b/i;

/** One file line, and the verdict the preview must show against it. */
interface PreviewLineFixture {
  /** 1-based position in the file's data lines — the order AC-1 is about. */
  readonly line: number;
  /** How the line is addressed on screen: its own reference. */
  readonly reference: string;
  /** The service rejected this line. */
  readonly rejected: boolean;
  /** The label this line must carry, and the one it must not. */
  readonly expectedLabel: RegExp;
  readonly forbiddenLabel: RegExp;
}

const LINES: readonly PreviewLineFixture[] = PREVIEW.rows.map((row, index) => {
  const line = index + 1;
  const rejected = PREVIEW.rejectedLineNumbers.includes(line);
  return {
    line,
    reference: row.Reference,
    rejected,
    expectedLabel: rejected ? REJECTED_LABEL : WILL_IMPORT_LABEL,
    forbiddenLabel: rejected ? WILL_IMPORT_LABEL : REJECTED_LABEL,
  };
});

/* -------------------------------------------------------------------------- */
/* Fixture integrity — AC-1 is only tested if these hold                       */
/* -------------------------------------------------------------------------- */

if (PREVIEW.unmatchableRejections.length > 0) {
  throw new Error(
    'previewWithRejectedRows() now carries a rejection with no line in the file ' +
      '(BR9), so "one preview row per file line" would no longer be the right count ' +
      'here. That case is story 2 AC-5, in the Vitest layer, on its own fixture.',
  );
}

if (PREVIEW.rejectedLineNumbers.length === 0) {
  throw new Error(
    'previewWithRejectedRows() no longer rejects any line, so this spec could not ' +
      'prove the two verdicts appear side by side in one ordered list.',
  );
}

if (PREVIEW.counts.willImport === 0) {
  throw new Error(
    'previewWithRejectedRows() now rejects every line, so this spec could not prove ' +
      'a will-import row is labelled "Will import" rather than "Imported" (BR2).',
  );
}

const REFERENCES = LINES.map((fixture) => fixture.reference);

for (const fixture of LINES) {
  if (!fixture.reference) {
    throw new Error(
      `Line ${String(fixture.line)} of previewWithRejectedRows() has no reference, ` +
        'so it could not be addressed on screen by its own content. (A file line with ' +
        'no reference is real — it is why BR9 exists — but it belongs on the fixture ' +
        'built for it, previewWithMissingReferenceRejection().)',
    );
  }
}

if (new Set(REFERENCES).size !== REFERENCES.length) {
  throw new Error(
    'Two lines of previewWithRejectedRows() share a reference, so "each line appears ' +
      'exactly once, in this position" could not be told apart from a duplicate.',
  );
}

for (const reference of REFERENCES) {
  const contained = REFERENCES.filter(
    (other) => other !== reference && other.includes(reference),
  );
  if (contained.length > 0) {
    throw new Error(
      `Reference "${reference}" is a substring of ${contained.join(', ')}, so reading ` +
        'the rendered order back by reference would attribute one line to another.',
    );
  }
}

/**
 * Any of this file's references — how a rendered row is recognised as one of the
 * file's data lines rather than a heading or a summary row. Built from the fixture's
 * own values, so it can never drift from them.
 */
const escapeForRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ANY_ROW_REFERENCE = new RegExp(
  REFERENCES.map(escapeForRegExp).join('|'),
  'u',
);

/* -------------------------------------------------------------------------- */
/* Mocks                                                                       */
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
 * Blocks the live services (see LIVE_BACKEND_ORIGINS). Registered LAST in each test,
 * because Playwright matches the most recently registered route first: a call sent to
 * a service's own origin is then aborted and fails visibly, instead of being quietly
 * answered by the origin-agnostic mocks above it.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Answers a browser-side identity read from the shared userinfo source, so it can
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

/** The active-files list this page resolves the requested file from. */
const mockFileLogList = async (page: Page): Promise<void> => {
  await page.route('**/transactions-api/v1/file-logs**', (route) =>
    route.fulfill(jsonResponse(200, fileLogListResponse([PREVIEW.file]))),
  );
};

/** The processing history, so the rest of the page renders as it will in life. */
const mockFileProcessLogList = async (page: Page): Promise<void> => {
  await page.route('**/transactions-api/v1/file-process-logs/**', (route) =>
    route.fulfill(jsonResponse(200, fileProcessLogListResponse())),
  );
};

/** The `FileLogId` this request asked about, or `null` if it sent none. */
const fileAskedAboutBy = (route: Route): string | null =>
  new URL(route.request().url()).searchParams.get('FileLogId');

/**
 * THIS STORY'S PRIMARY SOURCE: the submitted file's own bytes, streamed the way the
 * service streams them (`application/octet-stream`, per `FilesDownload`) so the real
 * binary-response path in `lib/api/client.ts` is the one exercised.
 *
 * A request for any OTHER file — or one that forgot the identifier — is refused, so a
 * preview built from the wrong download fails loudly rather than rendering somebody
 * else's rows.
 */
const mockFileDownload = async (page: Page): Promise<void> => {
  await page.route(
    (url) => url.pathname.endsWith(FILE_DOWNLOAD_PATH),
    (route: Route) => {
      if (fileAskedAboutBy(route) !== String(PREVIEW.file.Id)) {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            Messages: [
              'No file was requested by identifier — the preview must download the ' +
                'file whose page it is on (GET /v1/files/download?FileLogId=<id>).',
            ],
          }),
        });
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
 * The overlay that decides each parsed row's verdict, in the wire's own
 * JSON-array-as-a-string envelope. Matched by PATH so it cannot also swallow the
 * columns call below, and answered only for the file it was asked about.
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
 * Blocks the two reads this story must NOT depend on (see the Mocking strategy
 * header): the optional validation-error columns call, and `GET /v1/transactions`,
 * which the brief demotes to future confirmation of what actually imported.
 */
const blockDemotedReads = async (page: Page): Promise<void> => {
  await page.route(
    (url) =>
      url.pathname.endsWith(VALIDATION_ERRORS_COLUMNS_PATH) ||
      url.pathname.endsWith(TRANSACTIONS_PATH),
    (route) => route.abort(),
  );
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

/**
 * Opens the previewed file's page as the Finance Uploader (the auth service's
 * `Importer`), with every call this page makes answered from the shared fixtures.
 */
const openFilePage = async (
  page: Page,
  context: BrowserContext,
): Promise<void> => {
  await mockFileLogList(page);
  await mockFileProcessLogList(page);
  await mockFileDownload(page);
  await mockValidationErrorsRead(page);
  await blockDemotedReads(page);
  await mockBrowserIdentityCall(page, ROLE_IMPORTER);
  await seedSession(context, ROLE_IMPORTER);
  await blockLiveBackends(page);

  await page.goto(FILE_PAGE);
};

/* -------------------------------------------------------------------------- */
/* Locators                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The preview table, located by CONTENT only it can hold: the reference of a line the
 * service did NOT reject.
 *
 * That is what separates it from the two tables already on this page. The rejected-rows
 * section lists the same rejected lines over again (by design — the user chose it), so
 * a rejected reference would match twice; the processing-history table holds
 * activities, not rows. A will-import reference appears in the preview and nowhere
 * else.
 */
const WILL_IMPORT_REFERENCE = PREVIEW.willImportRows[0].Reference;

const previewTable = (page: Page): Locator =>
  page
    .getByRole('main')
    .getByRole('table')
    .filter({ hasText: WILL_IMPORT_REFERENCE });

/**
 * The preview's DATA rows — the ones carrying a line of the file, told apart from the
 * heading row (and from any summary row) by holding one of the file's own references.
 */
const previewDataRows = (page: Page): Locator =>
  previewTable(page).getByRole('row').filter({ hasText: ANY_ROW_REFERENCE });

/** The section's failure alert, scoped to the page's content (never body level). */
const failureAlerts = (page: Page): Locator =>
  page.getByRole('main').getByRole('alert');

test.describe('Epic import-preview, Story 2: every row of the file, and what will happen to it', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-1
  // Three claims in one journey, because they are one behaviour: the preview holds the
  // WHOLE file (not the rows some other endpoint knows about), in the order the file
  // put them in, each row saying in words what will happen to it — and never claiming
  // an import the backend has not performed (BR2).
  test('the preview lists every row of the submitted file, in file order, each labelled "Will import" or "Rejected" — and no row claims it was imported', async ({
    page,
    context,
  }) => {
    await openFilePage(page, context);

    const table = previewTable(page);
    await expect(
      table,
      'no preview of the submitted file’s rows is on screen for a file whose ' +
        'validation has run — either the file was not downloaded from the browser at ' +
        `${FILE_DOWNLOAD_PATH}?FileLogId=${String(PREVIEW.file.Id)}, or its bytes were ` +
        'not parsed into rows (FR1)',
    ).toBeVisible();

    // EVERY ROW OF THE FILE, AND ONLY THOSE ROWS. The file holds five data lines, so
    // five rows carry one — none dropped (a preview sourced from what the backend
    // imported would be missing the rejected ones) and none duplicated (the rejected
    // lines must not be listed twice inside the preview just because the separate
    // Rejected rows section lists them again elsewhere on the page).
    await expect(
      previewDataRows(page),
      `the submitted file holds ${String(PREVIEW.rows.length)} data lines, so the ` +
        'preview must carry exactly that many rows — every row of the file, whatever ' +
        'its verdict (FR1)',
    ).toHaveCount(PREVIEW.rows.length);

    // Read the rendered rows once, as VISIBLE text. `allInnerTexts()` is what makes the
    // verdict assertions below about something a sighted user can actually read: a
    // verdict conveyed only by colour, or parked in a screen-reader-only string, is
    // absent from this text and fails (UI-21 / NFR-4).
    const renderedRows = await previewDataRows(page).allInnerTexts();

    for (const [position, fixture] of LINES.entries()) {
      const rendered = renderedRows[position];

      // IN FILE ORDER. Position is asserted deliberately — the order of the rows IS
      // the criterion, so the row in position N must be the file's line N and no
      // other. (Everywhere else in this suite a row is addressed by its content;
      // here content is checked AGAINST a position.)
      expect(
        rendered,
        `the preview’s row ${String(position + 1)} is not line ` +
          `${String(fixture.line)} of the file. Every row of the file appears in FILE ` +
          `ORDER (AC-1), so this row must be the one recorded as ` +
          `"${fixture.reference}". The preview reads:\n${renderedRows.join('\n---\n')}`,
      ).toContain(fixture.reference);

      // A TEXT LABEL, NEVER COLOUR ALONE. The verdict is spelled out on the row.
      expect(
        fixture.expectedLabel.test(rendered),
        `line ${String(fixture.line)} ("${fixture.reference}") was ` +
          `${fixture.rejected ? 'rejected by the service' : 'not rejected'}, so its ` +
          `row must READ ${fixture.rejected ? '"Rejected"' : '"Will import"'} in ` +
          'words — an intent-mapped colour is paired with a text label, never used ' +
          `alone (UI-21 / NFR-4). The row reads: "${rendered}"`,
      ).toBe(true);

      // ...and only that verdict, so a row cannot be read both ways.
      expect(
        fixture.forbiddenLabel.test(rendered),
        `line ${String(fixture.line)} ("${fixture.reference}") carries the OTHER ` +
          'verdict as well, so what the reader is being told about this row is ' +
          `ambiguous. The row reads: "${rendered}"`,
      ).toBe(false);

      // BR2, THE EPIC'S HARD HONESTY RULE. The backend has performed no split and has
      // imported nothing: a row the service did not reject is a row that WILL import.
      // "Will import" passes; "Imported" is the claim this test exists to catch.
      expect(
        IMPORTED_CLAIM.test(rendered),
        `line ${String(fixture.line)} ("${fixture.reference}") tells the reader it ` +
          'was IMPORTED. The service has not imported it — this preview is the app’s ' +
          'own determination from the file plus the service’s validation errors, and ' +
          'a row that passed validation reads "Will import" (BR2). The row reads: ' +
          `"${rendered}"`,
      ).toBe(false);
    }

    // Nothing failed quietly behind the preview: the download, the parse and the
    // rejected-row overlay all completed, so no error state is standing in for a row
    // (NFR-3 / BR8). Scoped to `main` because Next renders a permanently empty
    // body-level `role="alert"` route announcer.
    await expect(
      failureAlerts(page),
      'the file’s page is reporting a problem while the preview is being read — a ' +
        'preview assembled from partly-failed reads is not the preview AC-1 describes',
    ).toHaveCount(0);
  });

  // NFR-2 — this epic's single real-browser accessibility scan, on the surface the
  // epic introduces. Run against the preview in its loaded state, in a real browser,
  // where contrast, focus order and table semantics are actually observable; the
  // verdict indicators are the specific thing UI-21 puts at risk here.
  test('the submitted file’s page has no accessibility violations with the preview on screen', async ({
    page,
    context,
  }) => {
    await openFilePage(page, context);

    // Scan only once the preview has settled — a scan of a half-rendered page reports
    // whatever the skeleton looked like.
    await expect(previewDataRows(page)).toHaveCount(PREVIEW.rows.length);

    const { violations } = await new AxeBuilder({ page })
      .withTags(WCAG_22_AA_TAGS)
      .analyze();

    expect(
      violations.map(
        (violation) =>
          `${violation.id}: ${violation.help} (${String(violation.nodes.length)} node/s)`,
      ),
      'WCAG 2.2 AA violations on the submitted file page with the import preview ' +
        'rendered (NFR-2)',
    ).toEqual([]);
  });
});
