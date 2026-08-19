/**
 * Story Metadata:
 * - Epic: files-view-redesign — Redesign the expense files view as a batch register
 * - Story: 4 — The import preview, with the rejects appended at the back
 * - Route: /upload/file (opened as `/upload/file?LogId=<id>`, reached from `/upload`)
 * - Target File: web/src/components/files/ImportPreview.tsx
 * - Page Action: modify_existing
 * - Requirements: R14, R15, R1, R2, R5, R7, R8, R9, BR1, BR2, BR3, BR4, BR6, BR8, BR9
 *
 * ---------------------------------------------------------------------------
 * Coverage split — and why this spec exists at all
 * ---------------------------------------------------------------------------
 * NO acceptance criterion of this story is tagged `playwright`. AC-1, AC-2, AC-4, AC-5
 * and AC-6 belong to the Vitest layer (`web/src/__tests__/integration/
 * epic-files-view-redesign-story-4-the-import-preview-with-the-rejects-appended.test.tsx`)
 * and AC-3 is tagged `none` — it is typographic judgement on the story's MANUAL
 * checklist, so nothing here asserts a class string, a computed style or a font.
 *
 * The story is nevertheless ROUTABLE, and CLAUDE.md §9 requires a live spec for a
 * routable story. So this spec deliberately does NOT re-run the Vitest layer's matrix.
 * It covers the two things only the real, running app can show:
 *
 *   1. **The reordering is what the app actually serves.** The preview's rows are not
 *      handed to a component here — they are DERIVED IN THE BROWSER from two
 *      independent HTTP reads of the same file: the submitted file's own bytes
 *      (`GET /transactions-api/v1/files/download?FileLogId=<id>`, streamed as
 *      `application/octet-stream`, read as a `Blob`, decoded and parsed client-side)
 *      overlaid with `GET /transactions-api/v1/files/validation-errors?FileLogId=<id>`
 *      to decide each row's verdict. The epic's ONE genuine visible change is the ORDER
 *      those two reads come out in, and order is a property of the delivered document.
 *      A jsdom test that injects a ready-made row list cannot show that the reorder
 *      survives the real two-read path — and R14's own trap is that the parse layer
 *      (`lib/files/importPreviewRows.ts`) must KEEP emitting file order for
 *      `correctionCsv.ts`, so the reorder exists only at render, on this page, over
 *      real bytes.
 *   2. **The per-row account-number reveal still keys off the right row after the
 *      reorder.** The reveal is keyed by a row's identity, and this story moves rows
 *      out of the positions those keys were assigned in. A real click on a real row is
 *      how "only THAT row's number appears" is proven (POPIA, project.md §Compliance).
 *
 * Both are exercised through the REAL ROUTE: the file is opened by clicking its row in
 * the Expense files register at `/upload`, so the navigation, the `LogId` in the address
 * and the reads it triggers are the app's own, not a hand-typed URL.
 *
 * NOT DUPLICATED HERE, on purpose:
 * - the verdict wording per row, the counts, the defect wording and every honest
 *   fallback state (validation not run, unreadable file, unreadable overlay, count
 *   mismatch) — Vitest;
 * - the rejected block's own heading and the rule above it (AC-2) — Vitest;
 * - the WCAG scan of this page with the preview on screen — it already exists in
 *   `epic-import-preview-story-2-see-every-row-and-its-verdict.spec.ts`, runs on this
 *   exact page in this exact state, and therefore covers the new arrangement the moment
 *   this story lands. A second scan of the same page state would be a pure duplicate.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * (testing-policy.md § "Playwright runs against mocks, never live") even though
 * project.md records both services as running on this machine. This journey crosses BOTH
 * mock boundaries the earlier epics established, and reuses their harness rather than
 * inventing one:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started by
 *    `globalSetup` and wired in by `playwright.config.ts`. `/upload` and `/upload/file`
 *    are gated SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()` cannot
 *    see a fetch the browser never makes. The stub answers that call from the shared
 *    identity source, keyed off the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` below, for every transactions-service call these
 *    two screens make at the app's own same-origin `/transactions-api/...` mount point:
 *    - `GET /v1/file-logs?IsActive=Yes` — the Expense files register, and how the file's
 *      own page resolves `LogId` (there is no get-one-file endpoint);
 *    - `GET /v1/file-settings` — the submit-a-file slip on `/upload`, which the Finance
 *      Uploader sees. Mocked so it cannot fall through to a live service;
 *    - `GET /v1/file-process-logs/{LogId}` — the processing history. Mocked in every test
 *      even though nothing here asserts on it: an unmocked read is forwarded to the LIVE
 *      transactions service by the app's own route handler (inside the Next.js process,
 *      where a browser-level origin block cannot see it), and its failure alert would
 *      occupy the page;
 *    - `GET /v1/files/download?FileLogId=<id>` — the preview's primary source, the
 *      submitted file's own bytes;
 *    - `GET /v1/files/validation-errors?FileLogId=<id>` — the overlay that says which of
 *      those lines the service rejected;
 *    - `GET /v1/files/validation-errors/columns` — ABORTED, not answered, exactly as the
 *      earlier specs do: the call is optional, no shared factory describes its body, and
 *      blocking it makes a dependency on it fail visibly instead of quietly reaching a
 *      live service;
 *    - `GET /v1/transactions` — ABORTED. The `import-preview` brief demotes this read to
 *      future confirmation of what actually imported; it is never a source of preview
 *      rows. Blocking it turns a quiet dependency into a visible failure.
 *    Plus a hard block on the real services' own origins (:4424 / :4423) so no
 *    browser-side call can leak to a live backend even if the app were pointed at the
 *    wrong address.
 *
 * BOTH FILE READS ANSWER ONLY THE FILE THEY WERE ASKED ABOUT. A download request
 * carrying the wrong `FileLogId` (or none) is refused outright; a validation-errors
 * request carrying the wrong one gets an empty row set. That is what makes the assertions
 * below evidence that the app really serialised THIS file's identifier onto each request
 * after navigating to its page.
 *
 * EVERY BYTE COMES FROM THE SHARED FIXTURES. `previewWithRejectedRows()`
 * (`web/src/mocks/data/submitted-file.ts`) hands out one coherent file — its `FileLog`,
 * its CSV bytes, and the validation-errors body describing the SAME lines — and the
 * Vitest layer for this story reads the very same fixture. No CSV text, no response shape
 * and no userinfo body is authored in this file.
 *
 * ---------------------------------------------------------------------------
 * Implementation patterns this spec assumes (read before implementing)
 * ---------------------------------------------------------------------------
 * - **REORDER AT RENDER, NOT AT PARSE (R14's trap).** `lib/files/importPreviewRows.ts`
 *   keeps emitting one row per line in FILE order, because `lib/files/correctionCsv.ts`
 *   derives the correction download from it and that download's scope and order are
 *   protected behaviour (BR2). This spec reads the ORDER OFF THE SCREEN, so it passes
 *   only if the arrangement is a presentation decision inside `ImportPreview`.
 * - **The preview stays ONE addressable section named "Import preview".** Every query
 *   below is scoped to that region, because the same rejected lines are also listed again
 *   lower down the page by `RejectedRows` (by design — the user chose that), and the
 *   processing-history table sits above. The region is located by its accessible name,
 *   case-insensitively, so capitalising the heading in the redesign is fine — renaming or
 *   un-naming the section is not.
 * - **Rows stay table rows** (the Shadcn `table` primitive, restyled through it, as the
 *   story's reuse notes require). Rows are located by CONTENT — their own reference —
 *   never by index and never by a test id, so whether the rejected block is a group
 *   inside the one table or a second `<tbody>` is the developer's choice.
 * - **The file is downloaded FROM THE BROWSER** through the shared API client at the app's
 *   own `/transactions-api/...` address and parsed client-side. `page.route()` cannot
 *   intercept a read issued by the Next.js server or a Server Action, so a server-side
 *   download would bypass these mocks and leave for the real service.
 * - **A rejected row's reveal control names what it acts on** ("…account number…"), and
 *   reveals exactly one row. The wording around it is the developer's; that it is a
 *   per-row control naming the account number is the contract.
 * - **The full account number is never in the DOM until its own row is revealed** — not in
 *   a `title`, not in a `data-` attribute. The assertions below read the section's text,
 *   and the masking helper `MaskedAccountNumber` prints last four digits only.
 * - Alert queries are scoped to `main`: Next renders a permanently empty body-level
 *   `role="alert"` route announcer, so an unscoped query always matches two elements.
 * - Cookie assumptions: the session travels only in the `session` cookie, seeded directly
 *   rather than by driving the sign-in form (epic 1 story 2's spec owns that journey).
 *   Cookies ignore port, so one seed serves the dev server (:3000) and the epic-end
 *   production run (:3100). `Secure` is omitted because the E2E server is plain http on
 *   localhost.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend response
 * below is mocked, so no live backend is contacted and no real credential is needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — today's preview lists
 * the file's lines in file order, interleaving the rejected ones.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import {
  FILE_STATUS_UPLOADED,
  fileLogListResponse,
  fileLogWithStatus,
} from '../src/mocks/data/file-log';
import { fileProcessLogListResponse } from '../src/mocks/data/file-process-log';
import { fileSettingListResponse } from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER, ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
  previewWithRejectedRows,
} from '../src/mocks/data/submitted-file';

import type { BrowserContext, Locator, Page, Route } from '@playwright/test';
import type { FileLog } from '../src/mocks/data/file-log';

/* -------------------------------------------------------------------------- */
/* The screens, and the reads they make                                        */
/* -------------------------------------------------------------------------- */

/** The Expense files register, which a file is opened FROM. */
const UPLOAD_PATH = '/upload';

/** One submitted file's own page — where the preview lives. */
const FILE_PATH = '/upload/file';

/**
 * The transactions-service reads these two screens make, as the BROWSER addresses them:
 * the app's own `/transactions-api/*` mount point, never a service origin
 * (`web/src/lib/utils/constants.ts`). Trailing `**` covers query strings and path
 * parameters.
 */
const FILE_LOGS_URL_GLOB = '**/transactions-api/v1/file-logs**';
const FILE_SETTINGS_URL_GLOB = '**/transactions-api/v1/file-settings**';
const FILE_PROCESS_LOGS_URL_GLOB =
  '**/transactions-api/v1/file-process-logs/**';

/** Matched by PATH (not glob) so each answers only its own call. */
const FILE_DOWNLOAD_PATH = '/v1/files/download';
const VALIDATION_ERRORS_PATH = '/v1/files/validation-errors';
const VALIDATION_ERRORS_COLUMNS_PATH = '/v1/files/validation-errors/columns';

/** The demoted read — blocked, never a source of preview rows. */
const TRANSACTIONS_PATH = '/v1/transactions';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/* -------------------------------------------------------------------------- */
/* The file being previewed                                                    */
/* -------------------------------------------------------------------------- */

/**
 * THE canonical preview fixture: a five-line file whose lines 3 and 5 the service
 * rejected. One call gives the `FileLog`, the file's own CSV bytes and the
 * validation-errors body describing those same two lines, so this spec cannot pair a file
 * with an overlay describing a different one.
 *
 * Rejecting lines 3 and 5 OF 5 is what makes this fixture able to PROVE a reorder rather
 * than coincide with one: the arrangement this story requires is 1, 2, 4, 3, 5 —
 * observably not the order the file holds.
 */
const PREVIEW = previewWithRejectedRows();

/**
 * A second file in the register, so the file under test is CHOSEN by its own name rather
 * than being the only row there is. Its validation has not run, so it has no preview of
 * its own to confuse with this one, and it is never opened.
 */
const OTHER_LISTED_FILE: FileLog = fileLogWithStatus(FILE_STATUS_UPLOADED, {
  Id: 5077,
  CurrentFileName: 'expenses_2026-04-22.csv',
  ProcessDate: '2026-04-22 09:15:00',
});

const LISTED_FILES: FileLog[] = [PREVIEW.file, OTHER_LISTED_FILE];

/**
 * How the preview section is addressed as a region. Case-insensitive, so capitalising the
 * heading as part of this redesign is not a breaking change.
 */
const PREVIEW_SECTION_NAME = /^import preview$/iu;

/* -------------------------------------------------------------------------- */
/* What the arrangement must be                                                */
/* -------------------------------------------------------------------------- */

/** Every line's reference, in the order the FILE holds them. */
const FILE_ORDER_REFERENCES = PREVIEW.rows.map((row) => row.Reference);

/** The lines that will import, in the file's own order among THEMSELVES. */
const WILL_IMPORT_REFERENCES = PREVIEW.willImportRows.map(
  (row) => row.Reference,
);

/** The rejected lines, in the file's own order among THEMSELVES. */
const REJECTED_REFERENCES = PREVIEW.rejectedRows.map((row) => row.Reference);

/**
 * The arrangement this story requires: every will-import line first, then every rejected
 * line, each block keeping the file's own relative order. Derived from the fixture, so it
 * can never drift from the file it describes.
 */
const EXPECTED_ARRANGEMENT = [
  ...WILL_IMPORT_REFERENCES,
  ...REJECTED_REFERENCES,
];

/**
 * The rejected line whose account number one deliberate action reveals — the FIRST of the
 * appended block, so the reveal is proven to key off a row the reorder MOVED.
 */
const REVEALED_ROW = PREVIEW.rejectedRows[0];

/** Every account number the file holds, so "whose number is on screen" is answerable. */
const ACCOUNT_NUMBERS = PREVIEW.rows.map((row) => row.AccountNumber);

/** A fixture value used as a literal inside a pattern, never as syntax. */
const escapeForRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * Any of this file's references — how a rendered row is recognised as one of the file's
 * data lines rather than a column heading or the rejected block's own heading. Built from
 * the fixture's own values, so it can never drift from them.
 */
const ANY_ROW_REFERENCE = new RegExp(
  FILE_ORDER_REFERENCES.map(escapeForRegExp).join('|'),
  'u',
);

/**
 * The last four digits of an account number as the FIXTURE holds them — the only part of
 * it any listing surface may print (POPIA, project.md §Compliance). Taken from the
 * fixture's own value rather than from the production masker, so the assertion is not
 * checking that helper against itself.
 */
const lastFourOf = (accountNumber: string): string => accountNumber.slice(-4);

/* -------------------------------------------------------------------------- */
/* Fixture integrity — the assertions below only mean something if these hold   */
/* -------------------------------------------------------------------------- */

if (PREVIEW.unmatchableRejections.length > 0) {
  throw new Error(
    'previewWithRejectedRows() now carries a rejection with no line in the file (BR9), ' +
      'so "one preview row per file line" is no longer the right count here. That case ' +
      'belongs to the Vitest layer, on previewWithUnmatchableRejection().',
  );
}

if (WILL_IMPORT_REFERENCES.length === 0 || REJECTED_REFERENCES.length === 0) {
  throw new Error(
    'previewWithRejectedRows() no longer holds BOTH will-import and rejected lines, so ' +
      'this spec could not show that the two are never interleaved.',
  );
}

if (EXPECTED_ARRANGEMENT.join('|') === FILE_ORDER_REFERENCES.join('|')) {
  throw new Error(
    'previewWithRejectedRows() now rejects a trailing run of lines, so the arrangement ' +
      'this story requires happens to equal the file’s own order — the spec would pass ' +
      'against an unchanged, interleaved preview. Use a fixture that rejects a line with ' +
      'a will-import line after it (today: lines 3 and 5 of 5).',
  );
}

for (const [index, reference] of FILE_ORDER_REFERENCES.entries()) {
  if (reference === '') {
    throw new Error(
      `Line ${String(index + 1)} of previewWithRejectedRows() has no reference, so it ` +
        'could not be recognised on screen by its own content. (A line with no reference ' +
        'is real — it is why BR9 exists — but it belongs on the fixture built for it, ' +
        'previewWithMissingReferenceRejection().)',
    );
  }
}

if (new Set(FILE_ORDER_REFERENCES).size !== FILE_ORDER_REFERENCES.length) {
  throw new Error(
    'Two lines of previewWithRejectedRows() share a reference, so a rendered row could ' +
      'not be attributed to one line rather than the other.',
  );
}

for (const reference of FILE_ORDER_REFERENCES) {
  const contained = FILE_ORDER_REFERENCES.filter(
    (other) => other !== reference && other.includes(reference),
  );
  if (contained.length > 0) {
    throw new Error(
      `Reference "${reference}" is a substring of ${contained.join(', ')}, so reading ` +
        'the rendered arrangement back by reference would attribute one line to another.',
    );
  }
}

for (const [index, accountNumber] of ACCOUNT_NUMBERS.entries()) {
  if (!/\d{4}$/u.test(accountNumber)) {
    throw new Error(
      `Line ${String(index + 1)} of previewWithRejectedRows() has an account number ` +
        `("${accountNumber}") that does not end in four digits, so "only its last four ` +
        'digits are shown" could not be read off the screen.',
    );
  }
}

if (new Set(ACCOUNT_NUMBERS.map(lastFourOf)).size !== ACCOUNT_NUMBERS.length) {
  throw new Error(
    'Two lines of previewWithRejectedRows() share their last four account digits, so a ' +
      'row could not be shown to be still masked by its own four digits.',
  );
}

for (const accountNumber of ACCOUNT_NUMBERS) {
  const contained = ACCOUNT_NUMBERS.filter(
    (other) => other !== accountNumber && other.includes(accountNumber),
  );
  if (contained.length > 0) {
    throw new Error(
      `Account number "${accountNumber}" is a substring of ${contained.join(', ')}, so ` +
        'one row’s revealed number would read as another row’s.',
    );
  }
}

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
 * Blocks the live services (see LIVE_BACKEND_ORIGINS). Registered LAST, because
 * Playwright matches the most recently registered route first: a call sent to a service's
 * own origin is then aborted and fails visibly, instead of being quietly answered by the
 * origin-agnostic mocks above it.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Answers a browser-side identity read from the shared userinfo source, so it can never
 * disagree with what the Node-side auth stub returns for the same session.
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
 * The active-files register — the Expense files screen's read, and how the file's own page
 * resolves the `LogId` in its address.
 */
const mockFileLogList = async (page: Page): Promise<void> => {
  await page.route(FILE_LOGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(200, fileLogListResponse(LISTED_FILES))),
  );
};

/**
 * The submit-a-file slip's named settings, so that read cannot fall through to a live
 * service while the register is on screen.
 */
const mockFileSettings = async (page: Page): Promise<void> => {
  await page.route(FILE_SETTINGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(200, fileSettingListResponse())),
  );
};

/** The processing history, so the rest of the file's page renders as it will in life. */
const mockFileProcessLogList = async (page: Page): Promise<void> => {
  await page.route(FILE_PROCESS_LOGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(200, fileProcessLogListResponse())),
  );
};

/** The `FileLogId` this request asked about, or `null` if it sent none. */
const fileAskedAboutBy = (route: Route): string | null =>
  new URL(route.request().url()).searchParams.get('FileLogId');

/**
 * THE PREVIEW'S PRIMARY SOURCE: the submitted file's own bytes, streamed the way the
 * service streams them (`application/octet-stream`, per `FilesDownload`) so the real
 * binary-response path in `lib/api/client.ts` is the one exercised.
 *
 * A request for any OTHER file — or one that forgot the identifier — is refused, so a
 * preview built from the wrong download fails loudly rather than rendering somebody
 * else's rows in a tidy new arrangement.
 */
const mockFileDownload = async (page: Page): Promise<void> => {
  await page.route(
    (url) => url.pathname.endsWith(FILE_DOWNLOAD_PATH),
    (route: Route) => {
      if (fileAskedAboutBy(route) !== String(PREVIEW.file.Id)) {
        return route.fulfill(
          jsonResponse(404, {
            Messages: [
              'No file was requested by identifier — the preview must download the file ' +
                'whose page it is on (GET /v1/files/download?FileLogId=<id>).',
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
 * The overlay that decides each parsed line's verdict — and therefore which block it
 * belongs in — in the wire's own JSON-array-as-a-string envelope. Matched by PATH so it
 * cannot also swallow the columns call, and answered only for the file it was asked about.
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
 * Blocks the two reads this preview must NOT depend on (see the Mocking strategy header):
 * the optional validation-error columns call, and the demoted transactions read.
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
 * Puts the browser in a signed-in state without driving the sign-in form and without any
 * real credential: the mock `session` cookie the Node-side auth stub maps back to this
 * role when the server-side gate asks who the session belongs to.
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

/**
 * One file's row in the Expense files register, found by the file's own name — never by
 * position.
 */
const registerRowFor = (page: Page, file: FileLog): Locator =>
  page
    .getByRole('main')
    .getByRole('row')
    .filter({ hasText: file.CurrentFileName });

/**
 * A row's way to open the file, found by WHERE IT GOES rather than by what it is called:
 * the wording belongs to the redesign, the destination is the contract. Requiring an
 * `a[href]` also pins that it stays a real navigational link.
 */
const openFileLinkIn = (row: Locator): Locator =>
  row.locator(`a[href*="${FILE_PATH}"]`);

/**
 * The import preview, as its own addressable region. Scoped this way because the same
 * rejected lines are listed AGAIN lower down the page by the Rejected rows section (by
 * design), and the processing-history table sits above — so neither may be read as part
 * of the arrangement under test.
 */
const previewSection = (page: Page): Locator =>
  page.getByRole('main').getByRole('region', { name: PREVIEW_SECTION_NAME });

/**
 * The preview's DATA rows — the ones carrying a line of the file, told apart from column
 * headings and from the rejected block's own heading by holding one of the file's own
 * references.
 */
const previewDataRows = (page: Page): Locator =>
  previewSection(page).getByRole('row').filter({ hasText: ANY_ROW_REFERENCE });

/** One preview row, found by the line's own reference. */
const previewRowFor = (page: Page, reference: string): Locator =>
  previewDataRows(page).filter({ hasText: reference });

/**
 * A rejected row's own way to show its full account number. Located by what it ACTS ON,
 * which is the contract; the surrounding wording (and whether it currently offers to
 * reveal or to hide) is the developer's.
 */
const accountNumberControlIn = (row: Locator): Locator =>
  row.getByRole('button', { name: /account number/iu });

/**
 * The page's failure alerts, scoped to its content — never body level, where Next renders
 * a permanently empty route announcer.
 */
const failureAlerts = (page: Page): Locator =>
  page.getByRole('main').getByRole('alert');

/* -------------------------------------------------------------------------- */
/* The journey                                                                 */
/* -------------------------------------------------------------------------- */

/** Every call these two screens make, answered from the shared fixtures. */
const mockEverySurfaceRead = async (
  page: Page,
  context: BrowserContext,
  roleName: string,
): Promise<void> => {
  await mockFileLogList(page);
  await mockFileSettings(page);
  await mockFileProcessLogList(page);
  await mockFileDownload(page);
  await mockValidationErrorsRead(page);
  await blockDemotedReads(page);
  await mockBrowserIdentityCall(page, roleName);
  await seedSession(context, roleName);
  await blockLiveBackends(page);
};

/**
 * THE REAL ROUTE: start at the Expense files register, find the validated file by its own
 * name, and open it the way a reader does — so the address, the `LogId` on it and every
 * read the file's page then makes are the app's own.
 *
 * Returns once the preview has settled, so nothing below reads a half-rendered page.
 */
const openTheValidatedFileFromTheRegister = async (
  page: Page,
  context: BrowserContext,
  roleName: string,
): Promise<void> => {
  await mockEverySurfaceRead(page, context, roleName);

  await page.goto(UPLOAD_PATH);

  const row = registerRowFor(page, PREVIEW.file);
  await expect(
    row,
    `${PREVIEW.file.CurrentFileName} is not listed in the Expense files register, so its ` +
      'own page could not be opened the way a reader opens it',
  ).toBeVisible();

  await openFileLinkIn(row).click();

  await expect(
    page,
    'opening the file from its row did not land on the file’s own page with its ' +
      'identifier in the address',
  ).toHaveURL(
    new RegExp(
      `${FILE_PATH}\\?(.*&)?LogId=${String(PREVIEW.file.Id)}(&|$)`,
      'u',
    ),
  );

  await expect(
    previewSection(page),
    'no region named "Import preview" is on screen for a file whose validation has run — ' +
      'the preview remains the one addressable section this story rearranges',
  ).toBeVisible();

  await expect(
    previewDataRows(page),
    `the submitted file holds ${String(PREVIEW.rows.length)} data lines, so the preview ` +
      'must carry exactly that many rows once both reads have completed — every line of ' +
      'the file, whichever block it now sits in',
  ).toHaveCount(PREVIEW.rows.length);

  // Nothing failed quietly behind the preview: the download, the parse and the
  // rejected-row overlay all completed, so no error state is standing in for a row.
  await expect(
    failureAlerts(page),
    'the file’s page is reporting a problem while the preview is being read — a preview ' +
      'assembled from partly-failed reads is not the one under test here',
  ).toHaveCount(0);
};

/**
 * Which of the file's references each rendered row holds, in the order the page renders
 * them. A row holding none reads as `''` and a row holding two reads as both joined, so
 * either fault surfaces as a readable diff rather than as a thrown helper.
 */
const renderedArrangement = async (page: Page): Promise<string[]> => {
  const rowTexts = await previewDataRows(page).allInnerTexts();
  return rowTexts.map((text) =>
    FILE_ORDER_REFERENCES.filter((reference) => text.includes(reference)).join(
      ' + ',
    ),
  );
};

test.describe('Epic files-view-redesign, Story 4: the import preview, with the rejects appended at the back', () => {
  // The wide ruled listing is what this story rearranges; the phone-width presentation of
  // these same screens is story 6's, with its own spec. Stated explicitly rather than
  // inherited from the device profile, so a change to that profile cannot silently move
  // this spec onto the narrow form.
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // The epic's ONE genuine change to what a person sees, read off the real page and
  // derived from the real two-read data path (see the header). Opened by the Finance
  // Uploader — the person who submits the file and has to correct it.
  test('a validated file opened from the register previews every row that will import first, then all the rejected rows together at the back', async ({
    page,
    context,
  }) => {
    await openTheValidatedFileFromTheRegister(page, context, ROLE_IMPORTER);

    const arrangement = await renderedArrangement(page);

    // EVERY WILL-IMPORT LINE FIRST, in the file's own order among themselves. Asserted as
    // the leading block, which is what makes "never interleaved" a real claim: a rejected
    // line left where the file put it would appear inside this slice and fail.
    expect(
      arrangement.slice(0, WILL_IMPORT_REFERENCES.length),
      'the rows that will import are not the leading block of the preview, in the file’s ' +
        `own order among themselves. The file holds ${String(PREVIEW.rows.length)} lines ` +
        `and the service rejected lines ${PREVIEW.rejectedLineNumbers.join(' and ')}, so ` +
        `the preview must open with ${WILL_IMPORT_REFERENCES.join(', ')} and nothing ` +
        `else (AC-1). The preview reads, top to bottom: ${arrangement.join(' → ')}`,
    ).toEqual(WILL_IMPORT_REFERENCES);

    // THEN EVERY REJECTED LINE, together, at the back — one block, in the file's own order
    // among themselves. Nothing may follow them and nothing may sit between them.
    expect(
      arrangement.slice(WILL_IMPORT_REFERENCES.length),
      'the rejected rows are not appended as one block at the back of the preview, in the ' +
        `file’s own order among themselves. They must be exactly ` +
        `${REJECTED_REFERENCES.join(', ')}, with no will-import row after or between them ` +
        `(AC-1). The preview reads, top to bottom: ${arrangement.join(' → ')}`,
    ).toEqual(REJECTED_REFERENCES);

    // The same fact stated from the other side, because it is the fact this whole story
    // turns on: what is on screen is NOT the order the file holds. (The fixture guard
    // above makes the two genuinely different, so this cannot pass against an unchanged,
    // interleaved preview.)
    expect(
      arrangement,
      'the preview is still listing the file’s lines in the file’s own order, with the ' +
        'rejected ones interleaved among the rows that will import — this story replaces ' +
        `that with ${EXPECTED_ARRANGEMENT.join(', ')}`,
    ).not.toEqual(FILE_ORDER_REFERENCES);
  });

  // The reveal is keyed off a row's identity, and this story MOVES rows out of the
  // positions those keys were handed out in — so the one thing that can silently break is
  // which row a reveal belongs to. Driven as a real click, by the Approver, who reads the
  // same preview and is under the same POPIA rule.
  test('one rejected row’s full account number is revealed by its own action in the reordered preview, and no other row’s is', async ({
    page,
    context,
  }) => {
    await openTheValidatedFileFromTheRegister(page, context, ROLE_APPROVER);

    const section = previewSection(page);

    // BEFORE THE ACTION: not one full account number is anywhere in the preview, and every
    // row shows its own last four digits. `innerText` is what a sighted reader gets, and
    // `MaskedAccountNumber` puts nothing else in the markup — so a number parked in an
    // attribute or printed in full would show up here.
    const maskedText = await section.innerText();
    expect(
      ACCOUNT_NUMBERS.filter((accountNumber) =>
        maskedText.includes(accountNumber),
      ),
      'a full account number is on screen in the preview before anyone asked for one. ' +
        'Account numbers show their last four digits until a deliberate per-row action ' +
        'reveals one (AC-5, POPIA)',
    ).toEqual([]);

    for (const row of PREVIEW.rows) {
      await expect(
        previewRowFor(page, row.Reference),
        `the row for ${row.Reference} does not show the last four digits of its account ` +
          `number (${lastFourOf(row.AccountNumber)}) — masked is not the same as absent`,
      ).toContainText(lastFourOf(row.AccountNumber));
    }

    // THE DELIBERATE ACTION, on ONE rejected row — the first of the appended block, so this
    // is a row the reorder moved.
    const revealedRow = previewRowFor(page, REVEALED_ROW.Reference);
    await expect(
      revealedRow,
      `the rejected row for ${REVEALED_ROW.Reference} is not in the preview, so its ` +
        'account number could not be revealed from there',
    ).toBeVisible();

    await accountNumberControlIn(revealedRow).click();

    await expect(
      revealedRow,
      `revealing the account number on the rejected row for ${REVEALED_ROW.Reference} did ` +
        'not show that row’s own full number — after the reorder, a reveal must still act ' +
        'on the row whose control was used (AC-5)',
    ).toContainText(REVEALED_ROW.AccountNumber);

    // AND NOBODY ELSE'S. Read across the WHOLE preview, so a leak anywhere in it — a second
    // row unmasked, a summary line repeating the number, a reveal-all — fails here, not
    // only a leak inside another row.
    const revealedText = await section.innerText();
    expect(
      ACCOUNT_NUMBERS.filter((accountNumber) =>
        revealedText.includes(accountNumber),
      ),
      'revealing one rejected row’s account number changed what OTHER rows show. Exactly ' +
        'one full number may be on screen — the row whose control was used — and there is ' +
        'no reveal-all anywhere (AC-5, POPIA)',
    ).toEqual([REVEALED_ROW.AccountNumber]);

    for (const row of PREVIEW.rows.filter(
      (other) => other.Reference !== REVEALED_ROW.Reference,
    )) {
      await expect(
        previewRowFor(page, row.Reference),
        `the row for ${row.Reference} no longer shows the last four digits of its account ` +
          'number after another row was revealed',
      ).toContainText(lastFourOf(row.AccountNumber));
    }
  });
});
