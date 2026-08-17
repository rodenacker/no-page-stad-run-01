/**
 * Story Metadata:
 * - Epic: file-deletion — Delete a submitted file
 * - Story: 1 — Delete any file from its own page
 * - Route: /upload/file (a file's own page, addressed as `/upload/file?LogId=<id>`)
 * - Target File: web/src/components/files/SubmittedFileActions.tsx
 * - Page Action: modify_existing
 * - Requirements: R2, R3, R4, R5, R9, R10, R11, BR1, BR2, BR7 (+ source UI-09
 *   confirmation convention, UI-24 role-conditional markup)
 *
 * Coverage split (feature-planner tags — one tag, one layer):
 * - AC-4 (confirming a delete the service accepts removes the file and returns the
 *   user to the Expense files list, where it is no longer listed) and AC-6 (the
 *   action and both confirmation shapes are completable by keyboard alone, the way
 *   out holds focus, and the surface passes an accessibility scan with the
 *   confirmation open) → this file.
 * - AC-1 (the three renamed labels, and no cancel-vocabulary control left on the
 *   page), AC-2 (the action is offered in EVERY status, including `Imported`,
 *   with retry's own rule unchanged), AC-3 (a non-Importer receives no markup for it)
 *   and AC-5 (a refused delete shown in the service's own words, nothing claimed as
 *   successful) are the Vitest layer's:
 *   `web/src/__tests__/integration/epic-file-deletion-story-1-delete-any-file-from-its-own-page.test.tsx`.
 * - AC-6 renders as TWO tests here, deliberately: walking the keyboard through both
 *   confirmation shapes and running an axe scan are different kinds of evidence, and
 *   axe must be scanned on a settled page rather than mid-keyboard-walk. Splitting
 *   them means a keyboard regression and an accessibility regression fail separately
 *   and are read separately.
 *
 * Where the neighbouring stories' evidence lives, so nothing is scanned twice:
 * - THIS FILE HOLDS THE EPIC'S ACCESSIBILITY SCAN of `/upload/file`. Story 2 (the
 *   confirmation's wording) and story 3 (the same action on `/upload`) must not
 *   repeat a full-page scan of THIS surface — story 3's own scan is of the LIST,
 *   a different page.
 * - The SHORT confirmation's open-dialog scan already exists, on this same surface,
 *   in `epic-file-validation-and-retry-story-4-…spec.ts` (the confirmation over a
 *   `Validation failed` file — the same `ConfirmAction` primitive under its renamed
 *   labels). The scan below therefore takes the state that spec cannot reach: the
 *   confirmation over an `Imported` file, which only exists because THIS story
 *   removes the `cancelApplies` status gate.
 * - Backing OUT of a confirmation with Escape or Enter without deleting anything is
 *   story 2's AC-6. This file proves the other half — that each shape can be
 *   CARRIED THROUGH on the keyboard — and does not restate the dismissal.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy
 * ---------------------------------------------------------------------------
 * Backend calls are ALWAYS mocked — this spec never contacts a live backend and never
 * uses a real credential (testing-policy.md § "Playwright runs against mocks, never
 * live"), even though project.md records both real services as running on this
 * machine. Two boundaries, one contract:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. Every screen under
 *    `(authenticated)` is gated SERVER-side (`requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie value seeded below —
 *    which is also what decides whether this page's markup carries the delete action
 *    at all (R5/BR2).
 * 2. Browser boundary → `page.route()` below, for everything these two screens read
 *    and everything this action sends:
 *      GET    /transactions-api/v1/file-logs?IsActive=Yes     (resolves the file, and
 *                                                              is the Expense files
 *                                                              list's own read)
 *      GET    /transactions-api/v1/file-process-logs/<LogId>  (its history)
 *      GET    /transactions-api/v1/files/download?FileLogId=… (the import preview)
 *      GET    /transactions-api/v1/files/validation-errors?…  (the rejected-rows section)
 *      GET    /transactions-api/v1/file-settings              (the /upload submit form)
 *      GET    /transactions-api/v1/transactions               (story 2's request count)
 *      DELETE /transactions-api/v1/files?LogId=<id>           (THE delete — the app's only one)
 *    The reads this story asserts nothing about are mocked anyway: `/transactions-api`
 *    is the app's OWN same-origin mount point, so an unmocked call is forwarded to the
 *    live transactions service by the route handler INSIDE the Next.js process, where
 *    `blockLiveBackends` cannot see it. The transactions read is registered in every
 *    test for exactly that reason — story 2 makes an `Imported` file's confirmation
 *    read it, and it must never leave this machine.
 *    Finally the real services' own origins are blocked outright, registered LAST so
 *    they win over the origin-agnostic matchers above them.
 *
 * Every response body comes from the project-wide factories under
 * `web/src/mocks/data/` (`transaction.ts`, `file-log.ts`, `file-process-log.ts`,
 * `file-setting.ts`, `submitted-file.ts`, `identity.ts`, `role.ts`) — no response
 * shape and no canonical value is authored in this file, so this spec and the Vitest
 * layer cannot drift on the contract. In particular the list AFTER a successful
 * delete is `fileLogsAfterDeleting(scenario)` and the requests after it are
 * `transactionsAfterDeletingFile(scenario)`: the service's own second answer, so the
 * row's absence below is what the service reports and not an array this spec spliced.
 *
 * Implementation patterns this spec assumes (read before implementing):
 * - The delete call is issued FROM THE BROWSER through the shared API client at the
 *   app's own `/transactions-api/v1/files` address, as `cancelSubmittedFile` already
 *   does (renamed at the developer's discretion — there is still exactly ONE delete
 *   call). `page.route()` cannot intercept a fetch made by the Next.js server or by a
 *   Server Action, so moving it server-side both bypasses these mocks and sends the
 *   request to the live transactions service.
 * - The file is named on that call by the `LogId` QUERY parameter (not `FileLogId`,
 *   which is what the two download operations use).
 * - After a confirmed, accepted delete the file is inactive and no longer resolves on
 *   its own page, so the user is returned to the Expense files list (`/upload`) —
 *   unchanged from the flow this story renames.
 * - The Expense files list reflects the delete by RE-READING `GET /v1/file-logs`
 *   (Feature NFR "List currency"), which is why the mock simply starts answering with
 *   the file gone rather than the spec asserting on any client-side bookkeeping.
 * - The confirmation is the project's one `ConfirmAction` (Shadcn `alert-dialog`),
 *   which Radix renders as `role="alertdialog"` PORTALLED to the body — so dialog
 *   queries below are scoped to the dialog itself, not to `main`. Its way out is
 *   FIRST in the markup and holds focus on open, and the confirming choice follows it,
 *   which is what makes the single forward Tab below the whole keyboard journey.
 * - Whether the action is offered is decided SERVER-side from the session
 *   (`hasRole(session, ROLE_IMPORTER)`), so a session that may not delete never
 *   receives the markup. That polarity is AC-3's, in the Vitest layer.
 * - Every assertion on page content is scoped to `main`: Next.js renders a permanently
 *   empty body-level `role="alert"` route announcer, so an unscoped alert/region query
 *   always matches two elements.
 *
 * Label contract — matched EXACTLY (`exact: true`), never loosely, because this
 * surface is crowded with reserved wording that a loose match would collide with
 * (`Retry validation`, `Try again`, `Load this file again`, `Load the preview again`,
 * `Download original file`, `Download error file`, `Download rows to fix and
 * re-upload`):
 *     the trigger              → "Delete file"
 *     the confirming choice    → "Delete the file"
 *     the way out              → "Keep the file"   (unchanged by this story)
 * The two retired cancel-vocabulary labels this story replaces are quoted nowhere in
 * this file — deliberately, so a grep for them across `web/` finds only what still
 * needs changing. That they are gone from the page is AC-1's assertion, in the Vitest
 * layer.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie, seeded
 * directly rather than by driving the sign-in form (epic 1 story 2's spec owns that
 * journey). Cookies ignore port, so one seed serves the dev server (:3000) and the
 * epic-end production run (:3100). `Secure` is omitted because the E2E app is served
 * over plain http; the real cookie's full attribute set is asserted in the Vitest
 * layer.
 *
 * TIMING — nothing here waits real time and no clock is faked: every step below is an
 * auto-waiting expectation on what the user can see. The files these tests act on are
 * in settled statuses, so the page's refresh-while-in-progress behaviour is not in
 * play, and axe is never run under faked timers.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import {
  FILE_STATUS_IMPORTED,
  FILE_STATUS_UPLOADED,
  deleteSuccessResponse,
  fileLogListResponse,
} from '../src/mocks/data/file-log';
import { fileProcessLogListResponse } from '../src/mocks/data/file-process-log';
import { fileSettingListResponse } from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
  submittedFilePreview,
} from '../src/mocks/data/submitted-file';
import {
  fileLogsAfterDeleting,
  fileNeverImportedToDelete,
  importedFileToDelete,
  otherFilesInTransactionsList,
  transactionListResponse,
  transactionsAfterDeletingFile,
} from '../src/mocks/data/transaction';
import { validationErrorsResponse } from '../src/mocks/data/validation-error';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FileLog } from '../src/mocks/data/file-log';
import type { SubmittedFilePreview } from '../src/mocks/data/submitted-file';
import type { TransactionRead } from '../src/mocks/data/transaction';

/* -------------------------------------------------------------------------- */
/* Addresses                                                                   */
/* -------------------------------------------------------------------------- */

/** This story's screen, and the Expense files list a confirmed delete returns to. */
const FILE_PAGE_PATH = '/upload/file';
const EXPENSE_FILES_PATH = '/upload';

/** A file's own page — the file is identified by the `LogId` query. */
const filePageFor = (logId: number): string =>
  `${FILE_PAGE_PATH}?LogId=${String(logId)}`;

/** The Expense files list's address — `/upload/file` deliberately does not match. */
const EXPENSE_FILES_URL_PATTERN = new RegExp(`${EXPENSE_FILES_PATH}$`);

/**
 * The transactions-service calls these screens make, as the BROWSER addresses them:
 * the app's own `/transactions-api/*` mount point, never a service origin. Matched on
 * the PATHNAME rather than with a `**` glob so one mock cannot swallow another —
 * `/v1/files` must not also catch `/v1/files/download` or
 * `/v1/files/validation-errors`, and `/v1/transactions` must not catch
 * `/v1/transactions/approve`.
 */
const FILE_LOGS_PATH = '/v1/file-logs';
const FILE_PROCESS_LOGS_PATH = '/v1/file-process-logs/';
const FILE_DOWNLOAD_PATH = '/v1/files/download';
const VALIDATION_ERRORS_PATH = '/v1/files/validation-errors';
const FILE_SETTINGS_PATH = '/v1/file-settings';
const TRANSACTIONS_PATH = '/v1/transactions';

/**
 * The delete itself: `DELETE /transactions-api/v1/files?LogId=<id>` — the bare
 * `/files` path, which is the parent of the upload, download and retry operations and
 * so cannot be told from them by a glob.
 */
const DELETE_FILE_PATH = '/transactions-api/v1/files';

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

/* -------------------------------------------------------------------------- */
/* Labels and the accessibility bar                                            */
/* -------------------------------------------------------------------------- */

/** This story's three user-visible labels (R4). Matched exactly — see the header. */
const DELETE_FILE_LABEL = 'Delete file';
const CONFIRM_DELETE_LABEL = 'Delete the file';
const KEEP_FILE_LABEL = 'Keep the file';

/**
 * WCAG 2.2 AA — this project's effective accessibility bar (project.md §Baseline
 * NFRs, superseding the template's 2.1 AA floor), and the identical tag set the
 * earlier epics' scans used. Scoped explicitly because axe's defaults also run
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

/**
 * How many Tab presses a control may be behind. Generous enough for the whole signed-in
 * shell (skip link, navigation, theme control) ahead of the page's own actions, small
 * enough that an unreachable control fails quickly with a plain-English reason.
 */
const MAX_TAB_PRESSES = 80;

/* -------------------------------------------------------------------------- */
/* The files these tests delete                                                */
/* -------------------------------------------------------------------------- */

/**
 * THE case this story creates: a file whose rows have already IMPORTED — 40 expense
 * requests, 15 of them already decided — which the shipped `cancelApplies` gate hid
 * the action from entirely. Deleting it is only reachable at all because this story
 * removes that gate (BR1), which is what makes it the right file for both criteria.
 *
 * The scenario also carries the other files that share the list and the transactions
 * response, so "this file is gone" below is distinguishable from "the list is empty
 * or failed to load".
 */
const IMPORTED = importedFileToDelete();

/**
 * A file that never imported — the OTHER confirmation shape (R7, story 2 AC-2), and
 * the second half of AC-6's "both confirmation shapes". `Uploaded` rather than
 * `Validation failed` so this page carries no rejected-rows or preview sections to
 * settle before the keyboard walk.
 */
const NEVER_IMPORTED = fileNeverImportedToDelete(FILE_STATUS_UPLOADED);

/**
 * The imported file's own bytes, built FROM that file so the preview it feeds is
 * coherent with it (same id, same name, and a line per row of its `RecordCount`) —
 * an incoherent pair would put the preview into its count-mismatch state and scan a
 * page this story never produces.
 */
const IMPORTED_PREVIEW = submittedFilePreview({
  lineCount: IMPORTED.expected.total,
  file: IMPORTED.file,
});

/* -------------------------------------------------------------------------- */
/* Fixture integrity — the criteria are only tested if these hold             */
/* -------------------------------------------------------------------------- */

if (IMPORTED.file.CurrentStatus !== FILE_STATUS_IMPORTED) {
  throw new Error(
    'importedFileToDelete() no longer returns an Imported file, so nothing below ' +
      'exercises the status gate this story removes (BR1).',
  );
}

if (NEVER_IMPORTED.file.CurrentStatus === FILE_STATUS_IMPORTED) {
  throw new Error(
    'The never-imported scenario is Imported, so both keyboard walks below would ' +
      'open the SAME confirmation shape and AC-6 would only be half tested.',
  );
}

if (
  IMPORTED_PREVIEW.file.RecordCount !== String(IMPORTED_PREVIEW.rows.length)
) {
  throw new Error(
    "The imported file's record count and its bytes disagree, so its page would " +
      'render the preview count-mismatch state and the scan below would be of a ' +
      'state this story does not create.',
  );
}

/**
 * One line of the imported file, named by its own reference — the signal that the
 * page's preview has finished loading, so the accessibility scan is of a settled page
 * and not of a skeleton. Identified by content, never by a row position on screen.
 */
const PREVIEWED_LINE_REFERENCE = IMPORTED_PREVIEW.rows[0].Reference;

if (!PREVIEWED_LINE_REFERENCE) {
  throw new Error(
    "The imported file's first line carries no Reference, so there is nothing to " +
      'wait for before scanning the page (see submittedFilePreview()).',
  );
}

const REMAINING_AFTER_DELETE = fileLogsAfterDeleting(IMPORTED);

if (REMAINING_AFTER_DELETE.length === 0) {
  throw new Error(
    'fileLogsAfterDeleting() leaves no other file, so "the deleted file is gone ' +
      'from the list" could not be told apart from an empty or failed list.',
  );
}

if (
  REMAINING_AFTER_DELETE.some((file) =>
    file.CurrentFileName.includes(IMPORTED.file.CurrentFileName),
  )
) {
  throw new Error(
    "Another file's name contains the deleted file's name, so a row located by " +
      'name could not prove the deleted one is absent.',
  );
}

/* -------------------------------------------------------------------------- */
/* Mocks                                                                       */
/* -------------------------------------------------------------------------- */

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

/** What the mocked transactions service is currently serving. */
interface TransactionsService {
  /** Change what the NEXT read of the active file list returns — the service moving on. */
  showFiles: (files: FileLog[]) => void;
  /** Change what the NEXT read of the expense requests returns. */
  showRequests: (requests: TransactionRead[]) => void;
  /** The `LogId` the browser asked to delete, or `null` if it never asked. */
  deletedLogId: () => string | null;
}

/**
 * Serves every call these two screens make, returning whatever the test last asked
 * for, and answers the one delete call.
 *
 * Deliberately NOT "one snapshot per request": the browser may legitimately read the
 * same thing more than once for a single on-screen state (React's development
 * double-render being the obvious case), and a queue would then silently skip a
 * state. Keeping the served bodies under the TEST's control means each assertion
 * below is about one exact transition.
 *
 * `onDeleted` is where the SERVICE's consequence is expressed — the test says what the
 * service then reports, and the screen is only ever right or wrong about that.
 */
const serveTransactionsService = async (
  page: Page,
  {
    files: initialFiles,
    requests: initialRequests,
    previews = [],
    onDeleted,
  }: {
    files: FileLog[];
    requests: TransactionRead[];
    previews?: SubmittedFilePreview[];
    onDeleted?: (logId: string | null) => void;
  },
): Promise<TransactionsService> => {
  let files = initialFiles;
  let requests = initialRequests;
  let deleted: string | null = null;

  await page.route(
    (url) => url.pathname.endsWith(FILE_LOGS_PATH),
    (route) => route.fulfill(jsonResponse(fileLogListResponse(files))),
  );

  await page.route(
    (url) => url.pathname.includes(FILE_PROCESS_LOGS_PATH),
    (route) => route.fulfill(jsonResponse(fileProcessLogListResponse())),
  );

  // Story 2's request count (R6/BR4: the whole list, narrowed in the browser). Served
  // in every test, whether or not the confirmation reads it yet — an unmocked read
  // would be forwarded to the live transactions service by the app's own proxy.
  await page.route(
    (url) => url.pathname.endsWith(TRANSACTIONS_PATH),
    (route) => route.fulfill(jsonResponse(transactionListResponse(requests))),
  );

  // The import preview's own source: the file's bytes, answered only for the file
  // actually asked about, so a read that named another file is a visible miss.
  await page.route(
    (url) => url.pathname.endsWith(FILE_DOWNLOAD_PATH),
    (route) => {
      const askedAbout = new URL(route.request().url()).searchParams.get(
        'FileLogId',
      );
      const preview = previews.find(
        ({ file }) => String(file.Id) === askedAbout,
      );
      if (!preview) {
        return route.fulfill({ status: 404 });
      }
      return route.fulfill({
        status: 200,
        contentType: SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
        headers: {
          'content-disposition': `attachment; filename="${preview.file.CurrentFileName}"`,
        },
        body: preview.csv,
      });
    },
  );

  // The rejected-rows section's read, and the Expense files list's submit form — this
  // story asserts on neither; they are served so neither can reach a live service.
  // Neither file under test has a rejected row (the imported one imported cleanly,
  // the other never reached validation), so the service reports none — which is not
  // a failure, it is the service saying there is nothing wrong.
  await page.route(
    (url) => url.pathname.endsWith(VALIDATION_ERRORS_PATH),
    (route) => route.fulfill(jsonResponse(validationErrorsResponse([]))),
  );
  await page.route(
    (url) => url.pathname.endsWith(FILE_SETTINGS_PATH),
    (route) => route.fulfill(jsonResponse(fileSettingListResponse())),
  );

  // THE delete — registered last of the transactions-service routes, so the bare
  // `/v1/files` path cannot be shadowed by one of its children above.
  await page.route(
    (url) => url.pathname.endsWith(DELETE_FILE_PATH),
    (route) => {
      const request = route.request();
      if (request.method() !== 'DELETE') {
        // Nothing in this story addresses this path with another method; letting one
        // through would forward it to the live transactions service.
        return route.abort();
      }
      deleted = new URL(request.url()).searchParams.get('LogId');
      onDeleted?.(deleted);
      return route.fulfill(jsonResponse(deleteSuccessResponse()));
    },
  );

  return {
    showFiles: (next: FileLog[]) => {
      files = next;
    },
    showRequests: (next: TransactionRead[]) => {
      requests = next;
    },
    deletedLogId: () => deleted,
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

/* -------------------------------------------------------------------------- */
/* Locators                                                                    */
/* -------------------------------------------------------------------------- */

/** The delete action on the file's own page. */
const deleteTrigger = (page: Page): Locator =>
  page
    .getByRole('main')
    .getByRole('button', { name: DELETE_FILE_LABEL, exact: true });

/** The confirmation, which Radix portals to the body rather than into `main`. */
const confirmation = (page: Page): Locator => page.getByRole('alertdialog');

/** The choice that carries the delete out. */
const confirmDeleteChoice = (page: Page): Locator =>
  confirmation(page).getByRole('button', {
    name: CONFIRM_DELETE_LABEL,
    exact: true,
  });

/** The way out, which must hold focus the moment the confirmation opens. */
const keepFileChoice = (page: Page): Locator =>
  confirmation(page).getByRole('button', {
    name: KEEP_FILE_LABEL,
    exact: true,
  });

/** One file's row in the Expense files list, found by the file's own name. */
const fileRow = (page: Page, fileName: string): Locator =>
  page.getByRole('main').getByRole('row').filter({ hasText: fileName });

/* -------------------------------------------------------------------------- */
/* Keyboard helpers                                                            */
/* -------------------------------------------------------------------------- */

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
 * Presses Tab until the control has keyboard focus. Throws (failing the test with a
 * plain-English reason) when the control cannot be reached — that throw IS the
 * keyboard-reachability assertion, and it is what the epic's keyboard-completability
 * NFR comes down to at each step. The same helper the decisions and request-list
 * epics use.
 */
const tabUntilFocused = async (page: Page, control: Locator): Promise<void> => {
  for (let press = 0; press <= MAX_TAB_PRESSES; press += 1) {
    const focused = await control.evaluate(
      (element) => element === document.activeElement,
    );
    if (focused) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(
    `"${await labelOf(control)}" could not be reached with ${String(
      MAX_TAB_PRESSES,
    )} Tab presses, so the delete cannot be completed by keyboard alone (AC-6).`,
  );
};

/**
 * Walks to a control and operates it with Enter — the whole of "using a control
 * without a mouse". Space is equivalent on a button; Enter is used throughout so one
 * failure never has to be told apart from the other.
 */
const operateByKeyboard = async (
  page: Page,
  control: Locator,
): Promise<void> => {
  await expect(
    control,
    `"${await labelOf(control)}" is disabled, so keyboard focus can never reach it ` +
      'and the delete cannot be completed without a mouse (AC-6)',
  ).toBeEnabled();
  await tabUntilFocused(page, control);
  await page.keyboard.press('Enter');
};

/**
 * One whole delete, driven entirely from the keyboard: reach the action, open the
 * confirmation, check the way out holds focus, then walk forward to the confirming
 * choice and take it. Returns having asserted the two things AC-6 names about the
 * dialog itself; the caller asserts what the delete then did.
 */
const deleteByKeyboardAlone = async (page: Page): Promise<void> => {
  await operateByKeyboard(page, deleteTrigger(page));

  const dialog = confirmation(page);
  await expect(dialog).toBeVisible();

  // The safe choice holds focus, so a stray Enter on arrival keeps the file
  // (source UI-09). It is also where the walk to the confirming choice starts.
  await expect(
    keepFileChoice(page),
    'the confirmation must open with the way out holding focus, so arriving here ' +
      'and pressing Enter keeps the file',
  ).toBeFocused();

  await operateByKeyboard(page, confirmDeleteChoice(page));
  await expect(dialog).toBeHidden();
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
    `WCAG 2.2 AA violations on the submitted-file page (${state})`,
  ).toEqual([]);
};

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

test.describe('Epic file-deletion, Story 1: delete any file from its own page', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the identity it needs.
    await context.clearCookies();
  });

  // AC-4
  test('confirming the delete returns the Importer to the Expense files list, where the file is no longer listed', async ({
    page,
    context,
  }) => {
    const service = await serveTransactionsService(page, {
      files: IMPORTED.fileLogs,
      requests: IMPORTED.transactions,
      previews: [IMPORTED_PREVIEW],
      onDeleted: () => {
        // What the SERVICE reports once it has accepted the delete: the file is gone
        // from the active list and its rows are gone from the requests. The list
        // below shows this because it asked again — nothing here is spliced on the
        // client (R11/R12, Feature NFR "List currency").
        service.showFiles(fileLogsAfterDeleting(IMPORTED));
        service.showRequests(transactionsAfterDeletingFile(IMPORTED));
      },
    });
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await blockLiveBackends(page);
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(filePageFor(IMPORTED.file.Id));

    const main = page.getByRole('main');
    // The file this page is about, in the status that used to hide the action
    // altogether — so what follows is the widened rule (BR1) being exercised.
    await expect(main).toContainText(IMPORTED.file.CurrentFileName);
    await expect(main).toContainText(FILE_STATUS_IMPORTED);

    await deleteTrigger(page).click();

    const dialog = confirmation(page);
    await expect(dialog).toBeVisible();
    await confirmDeleteChoice(page).click();

    // The file no longer resolves on a page of its own, so the user lands back on the
    // Expense files list...
    await expect(page).toHaveURL(EXPENSE_FILES_URL_PATTERN);

    // ...where the list is plainly there — every other file still listed...
    for (const remaining of REMAINING_AFTER_DELETE) {
      await expect(fileRow(page, remaining.CurrentFileName)).toBeVisible();
    }

    // ...and the deleted file is not in it, which is what the service now reports.
    await expect(
      fileRow(page, IMPORTED.file.CurrentFileName),
      'the deleted file is still listed on the Expense files list',
    ).toHaveCount(0);

    // The file the user chose is the file the service was asked to delete — named by
    // `LogId`, not by anything the page invented.
    expect(
      service.deletedLogId(),
      'the delete must name the file the confirmation was about (LogId query parameter)',
    ).toBe(String(IMPORTED.file.Id));
  });

  // AC-6
  test('both confirmation shapes are completable by keyboard alone, with the way out holding focus', async ({
    page,
    context,
  }) => {
    // Both files active at once, among the other files that share the list, so each
    // walk happens on a page that looks like the real one.
    const activeFiles = [
      IMPORTED.file,
      NEVER_IMPORTED.file,
      ...otherFilesInTransactionsList(),
    ];
    const service = await serveTransactionsService(page, {
      files: activeFiles,
      requests: IMPORTED.transactions,
      previews: [IMPORTED_PREVIEW],
      onDeleted: (logId) => {
        // The service deactivated whichever file was named, so it leaves the active
        // list — the next read says so.
        service.showFiles(
          activeFiles.filter((file) => String(file.Id) !== logId),
        );
      },
    });
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await blockLiveBackends(page);
    await seedSession(context, ROLE_IMPORTER);

    const main = page.getByRole('main');

    // SHAPE ONE — a file whose rows have imported (the request-count confirmation).
    await page.goto(filePageFor(IMPORTED.file.Id));
    await expect(main).toContainText(IMPORTED.file.CurrentFileName);
    await expect(main).toContainText(FILE_STATUS_IMPORTED);

    await deleteByKeyboardAlone(page);

    // Carried through: the delete really happened, and the user is back on the list
    // without the file.
    await expect(page).toHaveURL(EXPENSE_FILES_URL_PATTERN);
    await expect(fileRow(page, IMPORTED.file.CurrentFileName)).toHaveCount(0);
    expect(service.deletedLogId()).toBe(String(IMPORTED.file.Id));

    // SHAPE TWO — a file that never imported (the shorter confirmation).
    await page.goto(filePageFor(NEVER_IMPORTED.file.Id));
    await expect(main).toContainText(NEVER_IMPORTED.file.CurrentFileName);
    await expect(main).toContainText(NEVER_IMPORTED.file.CurrentStatus);

    await deleteByKeyboardAlone(page);

    await expect(page).toHaveURL(EXPENSE_FILES_URL_PATTERN);
    await expect(
      fileRow(page, NEVER_IMPORTED.file.CurrentFileName),
    ).toHaveCount(0);
    expect(service.deletedLogId()).toBe(String(NEVER_IMPORTED.file.Id));
  });

  // AC-6 — this epic's accessibility scan (see the coverage split): the file's own
  // page with the delete offered on an IMPORTED file, a state that exists only
  // because this story removes the status gate, and then the confirmation open over
  // it. Real browser, so the overlay's contrast, the dialog's name and its focus
  // placement are all seen. No fake clock — axe is never run under faked timers.
  test('the file page and its open delete confirmation have no accessibility violations', async ({
    page,
    context,
  }) => {
    await serveTransactionsService(page, {
      files: IMPORTED.fileLogs,
      requests: IMPORTED.transactions,
      previews: [IMPORTED_PREVIEW],
    });
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await blockLiveBackends(page);
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(filePageFor(IMPORTED.file.Id));

    // Settle everything underneath first — the file, its rows, and the action — so
    // the scan is of a finished page rather than of skeletons.
    const main = page.getByRole('main');
    await expect(main).toContainText(IMPORTED.file.CurrentFileName);
    await expect(main).toContainText(FILE_STATUS_IMPORTED);
    await expect(main).toContainText(PREVIEWED_LINE_REFERENCE);
    await expect(deleteTrigger(page)).toBeVisible();

    await expectNoAccessibilityViolations(
      page,
      'the delete action offered on an imported file',
    );

    await deleteTrigger(page).click();

    // Scan only once the dialog has arrived and taken focus, so the state under the
    // scan is the settled one.
    await expect(confirmation(page)).toBeVisible();
    await expect(keepFileChoice(page)).toBeFocused();

    await expectNoAccessibilityViolations(
      page,
      'the delete confirmation open over an imported file',
    );
  });
});
