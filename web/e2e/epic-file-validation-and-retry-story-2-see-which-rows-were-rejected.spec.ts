/**
 * Story Metadata:
 * - Epic: file-validation-and-retry — Rejected rows, retry and cancel
 * - Story: 2 — See which rows were rejected and why
 * - Route: /upload/file (opened as `/upload/file?LogId=<id>`)
 * - Target File: web/src/app/(authenticated)/upload/file/page.tsx
 * - Page Action: modify_existing
 * - Requirements: FR1, FR2, FR3
 *
 * ---------------------------------------------------------------------------
 * Why this spec exists, and what it deliberately does NOT repeat
 * ---------------------------------------------------------------------------
 * The feature-planner tagged all six of this story's criteria `vitest`, so there is
 * no `playwright`-tagged criterion to render. The story is nevertheless ROUTABLE
 * (`/upload/file`), and CLAUDE.md §9 requires every routable story to carry a live
 * Playwright spec — a deferred stub is forbidden here, so every test below is live.
 *
 * The tests below are therefore scoped to the ONE dimension of this story that the
 * Vitest layer structurally cannot reach, rather than being a second rendering of the
 * jsdom assertions (testing-policy.md § "one tag, one layer"). Vitest mocks
 * `@/lib/api/client` wholesale, so it never exercises:
 *
 * - the query the browser actually sends — `FileLogId` on
 *   `GET /transactions-api/v1/files/validation-errors`, serialised by the real client
 *   and forwarded by the app's own same-origin route handler;
 * - the wire quirk end to end — a REAL HTTP body whose `ValidationErrors.JsonArray`
 *   is a JSON array delivered AS A STRING, parsed by the real code path;
 * - what a real 500 + `DefaultResponse` envelope becomes — the service's `Messages[]`
 *   landing on the failure's `details`, where `serviceDetailOf` has to find it
 *   (`lib/api/errors.ts`); a mocked client hands the component a ready-made message
 *   and proves nothing about that chain;
 * - composition — the rejected-rows section lives inside the file page story 1
 *   created, so "the rest of the file's page stays usable" when this section fails is
 *   only observable with the whole page mounted in a real browser, where an unhandled
 *   throw takes out the entire route rather than one component;
 * - masking as DELIVERED markup — jsdom sees the same tree, but only a real page can
 *   evidence that no full account number reached the browser on any render path.
 *
 * So the criteria are honoured here at the WIRE/BROWSER level only:
 * - AC-1 / AC-2 → test 1 (rows listed with their recorded values; this app's fixed
 *   wording for the four rules it owns, and the service's machine text nowhere)
 * - AC-3 → test 2 (the service's own reason, verbatim)
 * - AC-6 → test 3 (masked account numbers; a reveal confined to one row)
 * - AC-4 → test 4 (a body that cannot be read as rows)
 * - AC-5 → test 5 (a failed read shows the service's own wording, with one action
 *   that asks for the rows again)
 *
 * This epic's single real-browser accessibility scan belongs to story 1's AC-6 (the
 * story that owns the shared file page), so no axe scan is repeated here.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running on this machine. This screen crosses
 * BOTH mock boundaries the earlier epics established; this spec reuses them rather
 * than adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started
 *    by `globalSetup` and wired in by `playwright.config.ts`. `/upload/file` is gated
 *    SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` below, for every transactions-service read
 *    this page makes at the app's own `/transactions-api/...` mount point:
 *    - `GET /v1/file-logs?IsActive=Yes` — story 1 resolves the file from the active
 *      list (there is no get-one-file endpoint);
 *    - `GET /v1/file-process-logs/{LogId}` — story 1's processing history, mocked in
 *      every test here even though only test 4 asserts on it: an unmocked read is
 *      forwarded to the LIVE transactions service by the app's own route handler
 *      (inside the Next.js process, where a browser-level block cannot see it), and
 *      its failure alert would occupy the `role="alert"` the failure tests below
 *      read;
 *    - `GET /v1/files/validation-errors?FileLogId={id}` — this story's own read;
 *    - `GET /v1/files/validation-errors/columns` — ABORTED, not answered. The story
 *      treats that call as optional ("may be used to label columns if the live
 *      response warrants it") and no shared factory exists for its body, so rather
 *      than authoring one here the call is blocked: an implementation that depends on
 *      it fails visibly instead of quietly reaching a live service. Column labels are
 *      assumed to come from the app, as the assertions below expect.
 *    Plus a hard block on the real services' own origins (:4424 / :4423) so no
 *    browser-side call can leak to a live backend even if the app were pointed at the
 *    wrong address.
 *
 * The validation-errors mock ANSWERS ONLY THE FILE IT WAS ASKED ABOUT: a request
 * carrying any other `FileLogId` gets an empty row set. That is deliberate — it is
 * what makes "the five rows are on screen" evidence that the app really serialised
 * `FileLogId` onto the request, which is precisely the data-contract step a mocked
 * client in jsdom skips.
 *
 * Every response body comes from the project-wide factories under
 * `web/src/mocks/data/` (`invalidRowsForEveryDefect()`, `validationErrorsResponse()`,
 * `unparseableValidationErrorsResponse()`, `validationErrorsFailureResponse()`,
 * `fileLogWithStatus()`, `fileLogListResponse()`, `fileProcessLogListResponse()`,
 * `userInfoFor()`), so this spec and the Vitest layer cannot drift on the contract.
 * No response shape or body is authored in this file. The only literal strings here
 * are the four FIXED MESSAGES the brief states word for word (FR2) — requirement
 * text, not wire data.
 *
 * ---------------------------------------------------------------------------
 * Implementation patterns this spec assumes (read before implementing)
 * ---------------------------------------------------------------------------
 * - The rejected rows are read FROM THE BROWSER through the shared API client at the
 *   app's own `/transactions-api/...` address (story §Infrastructure notes).
 *   `page.route()` cannot intercept a read issued by the Next.js server or a Server
 *   Action, so a server-only fetch would bypass these mocks and leave for the real
 *   transactions service. The story's announced wait and "ask for them again" action
 *   already imply the browser-side read.
 * - The rejected rows render as a TABLE (the Shadcn `table` primitive, as
 *   `SubmittedFilesList` and the expense request list already do), with a heading row
 *   naming each recorded value and one `row` per rejected row. Rows are addressed by
 *   their own content — never by position — and this section's table is located by
 *   the content it holds, so it can never be confused with the processing-history
 *   table on the same page.
 * - The section labels the seven recorded values (reference, transaction date,
 *   account number, description, amount, transaction type, currency) in its heading
 *   row, and shows a value that FAILED a rule exactly as the file recorded it — a
 *   non-numeric amount and an unreadable date cannot be formatted, so they are
 *   printed verbatim.
 * - A failed read renders the Shadcn `alert` (role `alert`) with the action that asks
 *   for the rows again INSIDE it, as `SubmittedFilesList` already does. That is what
 *   lets this spec address the action without colliding with story 4's separate
 *   "retry validation" button elsewhere on the same page.
 * - An account number is masked to its last four digits, with the reveal control
 *   inside the row it belongs to, named for what it reveals. The masking FORMAT is
 *   the developer's (`••••5671`, `****5671`, `…5671` all pass); what is pinned is the
 *   compliance contract — the last four digits are visible, and the full value is not
 *   in the delivered markup until that one row is revealed (POPIA, project.md
 *   §Compliance).
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
 * These tests WILL FAIL until the story is implemented (TDD red) — the file page has
 * no rejected-rows section yet.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import {
  FILE_STATUS_VALIDATION_FAILED,
  fileLogListResponse,
  fileLogWithStatus,
} from '../src/mocks/data/file-log';
import {
  ACTIVITY_ROW_VALIDATION,
  fileProcessLogListResponse,
} from '../src/mocks/data/file-process-log';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  REJECTED_TRANSACTION_TYPE,
  TRANSACTION_TYPE_DEFECT_REASON,
  VALIDATION_ERRORS_FAILURE_MESSAGE,
  invalidRowsForEveryDefect,
  unparseableValidationErrorsResponse,
  validationErrorsFailureResponse,
  validationErrorsResponse,
} from '../src/mocks/data/validation-error';

import type { BrowserContext, Locator, Page, Route } from '@playwright/test';
import type { ValidationErrorRow } from '../src/mocks/data/validation-error';

/* -------------------------------------------------------------------------- */
/* The file whose rows were rejected                                          */
/* -------------------------------------------------------------------------- */

/**
 * The failed file this story's section belongs to. `fileLogWithStatus` gives a
 * coherent `Validation failed` file (record count, last activity, error file) from the
 * project-wide factory, so nothing about it is retyped here.
 */
const FAILED_FILE = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED);

/** The file's own page, reached with its identifier in the query (story 1). */
const FAILED_FILE_PAGE = `/upload/file?LogId=${FAILED_FILE.Id}`;

/**
 * This story's read, matched by PATH so it cannot also swallow the columns call
 * below. A `**`-glob on `validation-errors` would match both.
 */
const VALIDATION_ERRORS_PATH = '/v1/files/validation-errors';
const VALIDATION_ERRORS_COLUMNS_PATH = '/v1/files/validation-errors/columns';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/* -------------------------------------------------------------------------- */
/* The rejected rows, and what the screen must say about each                  */
/* -------------------------------------------------------------------------- */

/** The one defect whose reason comes from the SERVICE, not from this app (FR3). */
const TRANSACTION_TYPE_COLUMN = 'TransactionType';

/**
 * The FIXED wording this app owns, word for word from the brief's FR2 table — the
 * only literal strings in this file, and requirement text rather than wire data. The
 * transactions service's own reason for these four defects must never reach the user;
 * `TransactionType` deliberately has no entry, because the app judges no type itself.
 */
const APP_DEFECT_MESSAGES: Record<string, string> = {
  Reference: 'This request has no reference and cannot be imported.',
  Amount: 'Amount must be a number, for example 1245.67.',
  TransactionDate: 'Transaction date must be a valid date and time.',
  Currency: 'Currency must be a supported currency code.',
};

/** The defects `invalidRowsForEveryDefect()` produces, in the order it produces them. */
const DEFECT_COLUMNS_IN_FIXTURE_ORDER: readonly string[] = [
  'Reference',
  'Amount',
  'TransactionDate',
  'Currency',
  TRANSACTION_TYPE_COLUMN,
];

/** One rejected row, with everything this spec needs to address and read it. */
interface RejectedRowFixture {
  readonly row: ValidationErrorRow;
  /** The row field the service found the defect on. */
  readonly defectColumn: string;
  /**
   * How the row is addressed on screen: its description. Deliberately NOT its
   * reference — the row rejected for a MISSING reference has none, and it still has
   * to be listed.
   */
  readonly handle: string;
  /** The full account number the service sent, which must not reach the browser. */
  readonly accountNumber: string;
  /** The only part of it the screen may show (POPIA). */
  readonly lastFour: string;
  /** What the screen must say is wrong with this row. */
  readonly expectedWording: string;
  /** The service's own machine-phrased reason for the defect. */
  readonly serviceReason: string;
}

/**
 * The five rejected rows — one per defect this epic has wording rules for — turned
 * into fixtures, with every value this spec relies on proved present as it is read.
 * A change to the shared factory that broke any of these assumptions fails loudly at
 * collection rather than silently weakening a test.
 */
const REJECTED_ROWS: readonly RejectedRowFixture[] =
  invalidRowsForEveryDefect().map((row, index) => {
    const defectColumn = DEFECT_COLUMNS_IN_FIXTURE_ORDER[index];
    if (row.ErrorColumn !== defectColumn) {
      throw new Error(
        `invalidRowsForEveryDefect() row ${index + 1} is now rejected over ` +
          `"${String(row.ErrorColumn)}" where this spec expects "${defectColumn}". ` +
          'Realign DEFECT_COLUMNS_IN_FIXTURE_ORDER with the factory.',
      );
    }

    const handle = row.Description;
    if (!handle) {
      throw new Error(
        `Rejected row ${index + 1} has no Description. Every row is addressed on ` +
          'screen by its description here, because the row rejected for a missing ' +
          'reference has no reference to be addressed by.',
      );
    }

    const accountNumber = row.AccountNumber;
    if (!accountNumber) {
      throw new Error(
        `Rejected row ${index + 1} has no AccountNumber, so masking could not be ` +
          'evidenced (the mock must hand the screen something to mask).',
      );
    }

    const serviceReason = row.ErrorMessage;
    if (!serviceReason) {
      throw new Error(
        `Rejected row ${index + 1} carries no ErrorMessage, so there is no ` +
          'service reason to either suppress (FR2) or carry verbatim (FR3).',
      );
    }

    const expectedWording =
      defectColumn === TRANSACTION_TYPE_COLUMN
        ? serviceReason
        : APP_DEFECT_MESSAGES[defectColumn];
    if (!expectedWording) {
      throw new Error(
        `No fixed message is stated for a "${defectColumn}" defect. The brief's FR2 ` +
          'table is the source of truth for those four strings.',
      );
    }

    return {
      row,
      defectColumn,
      handle,
      accountNumber,
      lastFour: accountNumber.replace(/\D/g, '').slice(-4),
      expectedWording,
      serviceReason,
    };
  });

/** The fixture for one defect. Throws rather than silently testing another row. */
const rowRejectedOver = (defectColumn: string): RejectedRowFixture => {
  const found = REJECTED_ROWS.find(
    (candidate) => candidate.defectColumn === defectColumn,
  );
  if (!found) {
    throw new Error(
      `invalidRowsForEveryDefect() no longer contains a row rejected over ` +
        `"${defectColumn}", which this spec's assertions depend on.`,
    );
  }
  return found;
};

const MISSING_REFERENCE_ROW = rowRejectedOver('Reference');
const NON_NUMERIC_AMOUNT_ROW = rowRejectedOver('Amount');
const UNREADABLE_DATE_ROW = rowRejectedOver('TransactionDate');
const UNSUPPORTED_CURRENCY_ROW = rowRejectedOver('Currency');
const TRANSACTION_TYPE_ROW = rowRejectedOver(TRANSACTION_TYPE_COLUMN);

/** The rows whose wording this app owns — the ones FR2 governs. */
const APP_OWNED_ROWS = REJECTED_ROWS.filter(
  (fixture) => fixture.defectColumn !== TRANSACTION_TYPE_COLUMN,
);

/* -------------------------------------------------------------------------- */
/* Fixture integrity — the criteria are only tested if these hold             */
/* -------------------------------------------------------------------------- */

const HANDLES = REJECTED_ROWS.map((fixture) => fixture.handle);
if (new Set(HANDLES).size !== HANDLES.length) {
  throw new Error(
    'Two rejected rows share a Description, so a row could not be identified by ' +
      'its own content on screen.',
  );
}

const LAST_FOURS = REJECTED_ROWS.map((fixture) => fixture.lastFour);
if (new Set(LAST_FOURS).size !== LAST_FOURS.length) {
  throw new Error(
    'Two rejected rows share the last four digits of their account number, so a ' +
      'masked number would no longer identify exactly one row.',
  );
}

if (MISSING_REFERENCE_ROW.row.Reference) {
  throw new Error(
    'The row rejected for a missing reference now HAS a reference, so this spec ' +
      'would no longer prove such a row is listed at all (FR1).',
  );
}

if (typeof NON_NUMERIC_AMOUNT_ROW.row.Amount !== 'string') {
  throw new Error(
    'The row rejected for a non-numeric amount now carries a number, so the ' +
      '"shown exactly as recorded" assertion would prove nothing.',
  );
}

if (TRANSACTION_TYPE_ROW.serviceReason !== TRANSACTION_TYPE_DEFECT_REASON) {
  throw new Error(
    "The transaction-type row's reason no longer matches " +
      'TRANSACTION_TYPE_DEFECT_REASON, so FR3 would be asserted against the wrong ' +
      'sentence.',
  );
}

if (TRANSACTION_TYPE_ROW.row.TransactionType !== REJECTED_TRANSACTION_TYPE) {
  throw new Error(
    'The transaction-type row no longer carries the rejected type value the ' +
      'service objected to.',
  );
}

/**
 * The `JsonArray` string used for the unreadable body: a truncated payload, the most
 * likely way this endpoint fails without failing. Passed to the shared factory
 * explicitly so the exact text is available to assert it was never printed raw
 * (`types/files.ts`: "Parse it; never render it raw").
 */
const TRUNCATED_JSON_ARRAY = '[{"Reference":"TXN-20260415-0001","Amount":';

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

/** The active-files list story 1 resolves this file from. */
const mockFileLogList = async (page: Page): Promise<void> => {
  await page.route('**/transactions-api/v1/file-logs**', (route) =>
    route.fulfill(jsonResponse(200, fileLogListResponse([FAILED_FILE]))),
  );
};

/** Story 1's processing history, so the rest of the page renders as it will in life. */
const mockFileProcessLogList = async (page: Page): Promise<void> => {
  await page.route('**/transactions-api/v1/file-process-logs/**', (route) =>
    route.fulfill(jsonResponse(200, fileProcessLogListResponse())),
  );
};

/**
 * Blocks the optional columns call rather than inventing a body for it (see the
 * Mocking strategy header). An implementation that depends on it fails visibly here
 * instead of reaching the live transactions service through the app's own handler.
 */
const blockValidationErrorColumns = async (page: Page): Promise<void> => {
  await page.route(
    (url) => url.pathname.endsWith(VALIDATION_ERRORS_COLUMNS_PATH),
    (route) => route.abort(),
  );
};

/** What the service answers on the n-th read of this file's rejected rows. */
type ValidationErrorsResponder = (attempt: number) => {
  status: number;
  body: unknown;
};

/**
 * This story's read.
 *
 * The mock answers ONLY the file it was asked about: any other `FileLogId` — or none
 * at all — gets an empty row set, so a screen that forgot to send the identifier
 * shows nothing and the row assertions fail pointing straight at the query. That is
 * the wire step a mocked client in jsdom cannot exercise.
 */
const mockValidationErrorsRead = async (
  page: Page,
  respond: ValidationErrorsResponder,
): Promise<void> => {
  let attempt = 0;
  await page.route(
    (url) => url.pathname.endsWith(VALIDATION_ERRORS_PATH),
    (route: Route) => {
      const askedAbout = new URL(route.request().url()).searchParams.get(
        'FileLogId',
      );
      if (askedAbout !== String(FAILED_FILE.Id)) {
        return route.fulfill(jsonResponse(200, validationErrorsResponse([])));
      }
      attempt += 1;
      const { status, body } = respond(attempt);
      return route.fulfill(jsonResponse(status, body));
    },
  );
};

/** Every rejected row of this file, in the wire's JSON-array-as-a-string envelope. */
const allRejectedRows = (): unknown =>
  validationErrorsResponse(REJECTED_ROWS.map((fixture) => fixture.row));

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
 * Opens the failed file's page as the Finance Uploader (the auth service's
 * `Importer`), with the rejected-rows read answered by `respond`.
 */
const openFailedFilePage = async (
  page: Page,
  context: BrowserContext,
  respond: ValidationErrorsResponder,
): Promise<void> => {
  await mockFileLogList(page);
  await mockFileProcessLogList(page);
  await mockValidationErrorsRead(page, respond);
  await blockValidationErrorColumns(page);
  await mockBrowserIdentityCall(page, ROLE_IMPORTER);
  await seedSession(context, ROLE_IMPORTER);
  await blockLiveBackends(page);

  await page.goto(FAILED_FILE_PAGE);
};

/* -------------------------------------------------------------------------- */
/* Locators                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The rejected-rows table, located by CONTENT it holds — the description of the first
 * rejected row. The file page carries a second table (story 1's processing history),
 * and locating this one by what is in it means the two can never be confused, and no
 * extra labelling contract is imposed on the developer.
 */
const rejectedRowsTable = (page: Page): Locator =>
  page
    .getByRole('main')
    .getByRole('table')
    .filter({ hasText: REJECTED_ROWS[0].handle });

/** One rejected row, found by its own description — never by position. */
const rejectedRow = (page: Page, fixture: RejectedRowFixture): Locator =>
  rejectedRowsTable(page).getByRole('row').filter({ hasText: fixture.handle });

/** The control that reveals the full account number of the row it sits in. */
const revealAccountNumberIn = (row: Locator): Locator =>
  row.getByRole('button', { name: /(reveal|show|unmask).*account/i });

/** The section's failure alert, scoped to the page's content (never body level). */
const failureAlert = (page: Page): Locator =>
  page.getByRole('main').getByRole('alert');

/**
 * Reads the rejected row for `fixture` and requires it to be on screen exactly once.
 * Every per-row assertion goes through this, so a row that never rendered can never
 * pass a "does not contain" check by absence.
 */
const expectRowListed = async (
  page: Page,
  fixture: RejectedRowFixture,
): Promise<Locator> => {
  const row = rejectedRow(page, fixture);
  await expect(
    row,
    `the row recorded as "${fixture.handle}" was rejected over ${fixture.defectColumn}, ` +
      'so it must be listed exactly once among this file’s rejected rows (FR1)',
  ).toHaveCount(1);
  return row;
};

test.describe('Epic file-validation-and-retry, Story 2: the rejected rows of a failed file', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-1, AC-2
  // The wire round trip: a real HTTP body whose rows arrive as a JSON string, parsed
  // by the real code path and rendered — and answered only for the file the browser
  // actually asked about, so the rows being here proves `FileLogId` was sent.
  test('every rejected row is listed with its recorded values, and each app-owned defect shows this app’s own fixed wording', async ({
    page,
    context,
  }) => {
    await openFailedFilePage(page, context, () => ({
      status: 200,
      body: allRejectedRows(),
    }));

    const table = rejectedRowsTable(page);
    await expect(
      table,
      'no rejected-rows table is on screen for a file whose validation failed — ' +
        `either the rows were not read from the browser at ${VALIDATION_ERRORS_PATH}, ` +
        'or the JSON-array-as-a-string body was not parsed (FR1)',
    ).toBeVisible();

    // The seven recorded values are LABELLED, so a reader can tell which value is
    // which. Read as a set rather than queried one heading at a time, so a column
    // whose name matches two concepts cannot trip Playwright's strict mode.
    const headings = await table.getByRole('columnheader').allInnerTexts();
    for (const value of [
      /reference/i,
      /date/i,
      /account/i,
      /description/i,
      /amount/i,
      /type/i,
      /currency/i,
    ]) {
      expect(
        headings.some((heading) => value.test(heading)),
        `no column of the rejected-rows table is named for ${String(value)} — each ` +
          'rejected row lists its reference, transaction date, account number, ' +
          `description, amount, transaction type and currency (FR1). Headings read: ${headings.join(' | ')}`,
      ).toBe(true);
    }

    // Exactly the five rows the service sent — no row dropped, none duplicated. The
    // extra row is the heading row above them.
    await expect(
      table.getByRole('row'),
      `the service sent ${REJECTED_ROWS.length} rejected rows, so the table must hold ` +
        'that many plus its heading row',
    ).toHaveCount(REJECTED_ROWS.length + 1);

    // Each row is present, addressed by its own recorded description.
    for (const fixture of REJECTED_ROWS) {
      const row = await expectRowListed(page, fixture);
      await expect(
        row,
        `the account number of "${fixture.handle}" must show its last four digits ` +
          '(POPIA, project.md §Compliance)',
      ).toContainText(fixture.lastFour);
    }

    // A row that still HAS a reference shows it; the row rejected for a missing one
    // is listed all the same (proved by expectRowListed above).
    for (const fixture of [
      NON_NUMERIC_AMOUNT_ROW,
      UNREADABLE_DATE_ROW,
      UNSUPPORTED_CURRENCY_ROW,
      TRANSACTION_TYPE_ROW,
    ]) {
      const reference = fixture.row.Reference;
      expect(
        reference,
        `fixture "${fixture.handle}" should carry a reference for this check`,
      ).toBeTruthy();
      await expect(rejectedRow(page, fixture)).toContainText(String(reference));
    }

    // A value that FAILED a rule is shown exactly as the file recorded it — neither
    // of these can be formatted, so nothing may tidy them up or drop them.
    await expect(
      rejectedRow(page, NON_NUMERIC_AMOUNT_ROW),
      'the amount that is not a number must be shown as the file recorded it, so the ' +
        'reader can see what to correct',
    ).toContainText(String(NON_NUMERIC_AMOUNT_ROW.row.Amount));
    await expect(
      rejectedRow(page, UNREADABLE_DATE_ROW),
      'the unreadable transaction date must be shown as the file recorded it',
    ).toContainText(String(UNREADABLE_DATE_ROW.row.TransactionDate));
    await expect(
      rejectedRow(page, UNSUPPORTED_CURRENCY_ROW),
      'the unsupported currency code must be shown as the file recorded it',
    ).toContainText(String(UNSUPPORTED_CURRENCY_ROW.row.Currency));

    // FR2 — this app's own fixed wording, on the row it belongs to, word for word.
    for (const fixture of APP_OWNED_ROWS) {
      await expect(
        rejectedRow(page, fixture),
        `the row rejected over ${fixture.defectColumn} must carry this app’s fixed ` +
          `wording for that field, exactly as the brief states it: "${fixture.expectedWording}"`,
      ).toContainText(fixture.expectedWording);
    }

    // ...and the service's own machine-phrased reason for those four defects reaches
    // the user NOWHERE. This is the half that a screen printing whatever the service
    // sent would fail while still looking correct.
    const content = page.getByRole('main');
    for (const fixture of APP_OWNED_ROWS) {
      await expect(
        content,
        `the transactions service’s own reason for the ${fixture.defectColumn} ` +
          'defect is on screen. For the four rules this app owns, its own fixed ' +
          `wording is what the user reads (FR2) — not "${fixture.serviceReason}"`,
      ).not.toContainText(fixture.serviceReason);
    }
  });

  // AC-3
  // FR3 is a standing project decision, not an implementation detail: the service is
  // the sole authority on transaction type, so its sentence travels to the user
  // untouched and the app contributes no wording of its own.
  test('a row rejected over its transaction type carries the service’s own reason word for word, and none of this app’s wording', async ({
    page,
    context,
  }) => {
    await openFailedFilePage(page, context, () => ({
      status: 200,
      body: allRejectedRows(),
    }));

    const row = await expectRowListed(page, TRANSACTION_TYPE_ROW);

    // The rejected value itself is shown, so the reader can see which type was
    // refused...
    await expect(
      row,
      'the transaction type the service refused must be shown as the file recorded it',
    ).toContainText(REJECTED_TRANSACTION_TYPE);

    // ...and the reason is the service's, verbatim.
    await expect(
      row,
      'the transactions service’s own reason for this row must reach the user word ' +
        `for word (FR3): "${TRANSACTION_TYPE_DEFECT_REASON}"`,
    ).toContainText(TRANSACTION_TYPE_DEFECT_REASON);

    // Nothing the app wrote itself is attached to it. An app-side fixed message for
    // transaction type would mean the app had started judging the field.
    for (const [defectColumn, message] of Object.entries(APP_DEFECT_MESSAGES)) {
      await expect(
        row,
        `the transaction-type row carries this app’s fixed ${defectColumn} wording. ` +
          'The app never judges a transaction type itself and holds no accepted-value ' +
          'list for it (FR3)',
      ).not.toContainText(message);
    }
  });

  // AC-6
  // Masking is a compliance contract, and the only thing allowed to undo it is an
  // explicit action on one row. Asserted in a real browser because what matters is
  // what was DELIVERED to it — a full value parked in a title or data attribute is
  // just as much a leak as one printed in a cell.
  test('a rejected row’s account number shows only its last four digits until that one row is revealed', async ({
    page,
    context,
  }) => {
    await openFailedFilePage(page, context, () => ({
      status: 200,
      body: allRejectedRows(),
    }));

    const table = rejectedRowsTable(page);
    await expect(table).toBeVisible();

    // Every row shows its own last four digits — so masking is never "achieved" by
    // rendering no account number at all...
    for (const fixture of REJECTED_ROWS) {
      const row = await expectRowListed(page, fixture);
      await expect(
        row,
        `the row "${fixture.handle}" shows no part of its account number — the last ` +
          'four digits stay visible, only the rest is hidden',
      ).toContainText(fixture.lastFour);
    }

    // ...and no full number is anywhere in what the browser was given.
    const deliveredMarkup = await table.innerHTML();
    const leaked = REJECTED_ROWS.filter((fixture) =>
      deliveredMarkup.includes(fixture.accountNumber),
    );
    expect(
      leaked.map((fixture) => fixture.handle),
      'these rejected rows’ FULL account numbers were delivered to the browser ' +
        '(printed, or hidden in a title / data attribute). They must be masked to the ' +
        'last four digits until a reveal is asked for (POPIA, project.md §Compliance)',
    ).toEqual([]);

    // The explicit action on ONE row reveals that row's number...
    const revealedRow = await expectRowListed(page, UNSUPPORTED_CURRENCY_ROW);
    await revealAccountNumberIn(revealedRow).click();
    await expect(
      revealedRow,
      'the named reveal control did not produce the full account number, so nothing ' +
        'that follows would prove a reveal is contained to one row',
    ).toContainText(UNSUPPORTED_CURRENCY_ROW.accountNumber);

    // ...and only that row's. A reveal is per row, never a reveal-all.
    const stillMaskedMarkup = await table.innerHTML();
    const revealedTooMuch = REJECTED_ROWS.filter(
      (fixture) =>
        fixture.handle !== UNSUPPORTED_CURRENCY_ROW.handle &&
        stillMaskedMarkup.includes(fixture.accountNumber),
    );
    expect(
      revealedTooMuch.map((fixture) => fixture.handle),
      `revealing the account number on "${UNSUPPORTED_CURRENCY_ROW.handle}" also ` +
        'revealed these rows — an explicit action reveals the row it was made on ' +
        'and no other',
    ).toEqual([]);
  });

  // AC-4
  // The wire quirk's failure half, and the one case only a whole page in a real
  // browser can judge: a body that cannot be read as rows must produce a message, not
  // an unhandled throw that takes the entire route down with it.
  test('a validation-errors body that cannot be read as rows says so plainly and leaves the rest of the file’s page readable', async ({
    page,
    context,
  }) => {
    await openFailedFilePage(page, context, () => ({
      status: 200,
      body: unparseableValidationErrorsResponse(TRUNCATED_JSON_ARRAY),
    }));

    // The screen says something about it, in its own words — the service sent a 200
    // and no message, so there is nothing else it could be quoting.
    const alert = failureAlert(page);
    await expect(
      alert,
      'a rejected-rows body that will not parse must be reported to the user, not ' +
        'swallowed (FR1; story §Technical summary: "a handled failure, never a crash")',
    ).toBeVisible();
    await expect(
      alert,
      'the failure notice carries no wording at all',
    ).not.toBeEmpty();

    const content = page.getByRole('main');

    // Not an empty table, and not the raw string either.
    await expect(
      content.getByRole('columnheader', { name: /account/i }),
      'an empty rejected-rows table was drawn for a body that could not be read as ' +
        'rows — AC-4 asks for plain wording instead',
    ).toHaveCount(0);
    await expect(
      content,
      'the unparsed JsonArray string was printed on screen. It is a transport ' +
        'detail: parse it, never render it raw (types/files.ts)',
    ).not.toContainText(TRUNCATED_JSON_ARRAY);
    await expect(
      content,
      'the API client’s internal placeholder reached the user (project.md ' +
        'NFR-base-5)',
    ).not.toContainText(/internal server error/i);

    // The rest of the file's page is untouched — which is what a crash would have
    // destroyed, and what jsdom rendering this section alone can never show.
    await expect(
      content,
      'the file’s own details are gone from the page, so the failed rejected-rows ' +
        'read took the whole page down with it rather than failing in place',
    ).toContainText(FAILED_FILE.CurrentFileName);
    await expect(
      content,
      'the processing history is gone from the page, so the failure was not contained ' +
        'to the rejected-rows section',
    ).toContainText(ACTIVITY_ROW_VALIDATION);
  });

  // AC-5
  // The other thing a mocked client hides completely: how a real 500 carrying the
  // service's `DefaultResponse` envelope becomes a sentence on screen. The
  // transactions service reports a refusal as a 500 with `Messages[]`, which the
  // shared client keeps on the failure's `details` — so `serviceMessageOf` alone finds
  // nothing there and a screen that only looks at `message` shows plumbing instead.
  test('a failed read of the rejected rows shows the service’s own wording, and one action asks for them again', async ({
    page,
    context,
  }) => {
    await openFailedFilePage(page, context, (attempt) =>
      attempt === 1
        ? { status: 500, body: validationErrorsFailureResponse() }
        : { status: 200, body: allRejectedRows() },
    );

    const alert = failureAlert(page);
    await expect(
      alert,
      'the service’s own reason for the failed read must reach the user: it travels ' +
        'in the 500 response’s Messages[], which the shared client keeps on the ' +
        'failure’s details (serviceMessageOf ?? serviceDetailOf ?? own wording)',
    ).toContainText(VALIDATION_ERRORS_FAILURE_MESSAGE);
    await expect(
      page.getByRole('main'),
      'the API client’s internal placeholder reached the user alongside, or instead ' +
        'of, the service’s own wording (project.md NFR-base-5)',
    ).not.toContainText(/internal server error/i);

    // The rest of the page stayed usable through the failure.
    await expect(
      page.getByRole('main'),
      'the file’s own details are gone from the page, so a failed rejected-rows ' +
        'read did not fail in place',
    ).toContainText(FAILED_FILE.CurrentFileName);

    // One action asks for the rows again. Located INSIDE the alert, so it can never
    // resolve to story 4's separate retry-validation control elsewhere on this page.
    const askAgain = alert.getByRole('button', {
      name: /try again|retry|load again|reload/i,
    });
    await expect(
      askAgain,
      'the failed read offers no action that asks for the rejected rows again (AC-5)',
    ).toHaveCount(1);

    await askAgain.click();

    // The second read succeeds, and the rows the service sent are on screen.
    await expect(
      rejectedRowsTable(page),
      'asking for the rejected rows again did not read them again — the second ' +
        'response carried every rejected row',
    ).toBeVisible();
    const recovered = await expectRowListed(page, MISSING_REFERENCE_ROW);
    await expect(recovered).toContainText(
      MISSING_REFERENCE_ROW.expectedWording,
    );
    await expect(
      failureAlert(page),
      'the failure notice is still on screen after the rows arrived',
    ).toHaveCount(0);
  });
});
