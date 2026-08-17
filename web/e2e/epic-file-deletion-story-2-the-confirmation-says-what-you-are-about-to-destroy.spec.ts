/**
 * Story Metadata:
 * - Epic: file-deletion — Delete a submitted file
 * - Story: 2 — The confirmation says what you are about to destroy
 * - Route: /upload/file (a file's own page, addressed as `/upload/file?LogId=<id>`)
 * - Target File: web/src/components/files/SubmittedFileActions.tsx
 * - Page Action: modify_existing
 * - Requirements: R6, R7, R8, R9, BR3, BR4, BR5 (+ the epic's "Keyboard
 *   completability" feature NFR, and source UI-09's way-out-holds-focus convention)
 *
 * Coverage split (feature-planner tags — one tag, one layer):
 * - AC-6 (both confirmation shapes open with "Keep the file" holding focus, back out
 *   on Escape or Enter without deleting anything, and are completable by keyboard
 *   alone) is the ONLY criterion tagged `playwright` in this story, and it is this
 *   file's whole subject. It renders as FOUR tests rather than one because it makes
 *   two distinct claims about two distinct confirmation shapes, and each pairing is
 *   an independent way for the story to be wrong:
 *     1. the request-count confirmation (an `Imported` file) backs out safely,
 *     2. the short confirmation (a file that never imported) backs out safely,
 *     3. the request-count confirmation can be driven end to end by keyboard,
 *     4. the short confirmation can be driven end to end by keyboard.
 *   Collapsing them would mean the first failure hid the other three.
 * - AC-1..AC-5 (what each confirmation SAYS — the counts, the short wording, the
 *   failed-read state, the genuine-none case, the counting-in-progress state) are the
 *   Vitest layer's:
 *   `web/src/__tests__/integration/epic-file-deletion-story-2-the-confirmation-says-what-you-are-about-to-destroy.test.tsx`.
 *   Nothing here re-asserts that wording; the numbers checked below are only enough
 *   to prove which of the two shapes is on screen.
 * - NO accessibility scan here. This surface's `@axe-core/playwright` scan — including
 *   the open confirmation — belongs to story 1's spec
 *   (`epic-file-deletion-story-1-delete-any-file-from-its-own-page.spec.ts`, its
 *   AC-6). Running a second scan of the same page in this file would duplicate it.
 *   Keyboard operability, which axe cannot see, is what this file is for.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy
 * ---------------------------------------------------------------------------
 * Backend calls are ALWAYS mocked — this spec never contacts a live backend and never
 * uses a real credential (testing-policy.md § "Playwright runs against mocks, never
 * live"), even though project.md records both real services as running on this
 * machine. Two boundaries, exactly as the shipped `file-validation-and-retry` specs
 * established them:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. Every screen under
 *    `(authenticated)` is gated SERVER-side (`requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie seeded below — which is
 *    also what decides whether this page's markup carries the delete action at all.
 * 2. Browser boundary → `page.route()` below, for everything this screen reads and
 *    everything this action sends:
 *      GET    /transactions-api/v1/file-logs?IsActive=Yes        (resolves the file)
 *      GET    /transactions-api/v1/file-process-logs/<LogId>     (its history)
 *      GET    /transactions-api/v1/files/validation-errors?...   (story 2 of the
 *                                                                 earlier epic)
 *      GET    /transactions-api/v1/file-settings                 (the /upload form)
 *      GET    /transactions-api/v1/transactions                  (THIS story's count)
 *      DELETE /transactions-api/v1/files?LogId=<id>              (the delete itself)
 *    The reads this story asserts nothing about are mocked anyway: `/transactions-api`
 *    is the app's OWN same-origin mount point, so an unmocked call is forwarded to the
 *    live transactions service by the route handler INSIDE the Next.js process, where
 *    `blockLiveBackends` cannot see it. The delete route is likewise registered in
 *    EVERY test, including the two that must never trigger one — that is what makes
 *    "no delete was sent" an observation about the service rather than a hope.
 *    The real services' own origins are blocked outright, registered LAST so they win
 *    over the origin-agnostic globs above them.
 *
 * Every response body comes from the project-wide factories under `web/src/mocks/data/`
 * — `transaction.ts` (`importedFileToDelete`, `fileNeverImportedToDelete`,
 * `transactionListResponse`, `fileLogsAfterDeleting`), `file-log.ts`
 * (`deleteSuccessResponse`, `fileLogListResponse`), `file-process-log.ts`,
 * `validation-error.ts`, `file-setting.ts`, `identity.ts`, `role.ts`. No response shape
 * and no canonical value is authored in this file, so this spec and the Vitest layer
 * cannot drift on the contract. The paired fixture matters here: its transactions
 * response interleaves the file's own rows with two OTHER imported files' rows, so the
 * request-count confirmation is only reachable through a working `FileLogId` filter.
 *
 * Implementation patterns this spec assumes (read before implementing):
 * - Both the request-count read and the delete are issued FROM THE BROWSER through the
 *   shared API client at the app's own `/transactions-api/...` address.
 *   `page.route()` cannot intercept a fetch made by the Next.js server or by a Server
 *   Action, so moving either call server-side both bypasses these mocks and sends the
 *   request to the live transactions service.
 * - The request count comes from the full `GET /v1/transactions` read, narrowed
 *   client-side on `FileLogId` (BR4) — the endpoint takes no query parameters.
 * - Labels, exactly as R4 renames them (asserted as exact accessible names, because
 *   the destructive choice and the way out must never be confusable):
 *     trigger     → "Delete file"
 *     confirming  → "Delete the file"
 *     way out     → "Keep the file"   (unchanged; it must NOT read "Cancel")
 *   The superseded "Cancel file" / "Cancel the file" wording must be gone from this
 *   surface, which the two back-out tests assert directly.
 * - The confirmation is the project's one `ConfirmAction` (Shadcn `alert-dialog`), so
 *   Radix renders it as `role="alertdialog"`, PORTALLED to the body — dialog queries
 *   below are scoped to the dialog itself, never to `main`. `AlertDialogCancel` is
 *   first in the footer markup, which is what gives the way out initial focus and puts
 *   the confirming choice one Tab away.
 * - Which session may act is decided SERVER-side (`hasRole(session, ROLE_IMPORTER)`),
 *   so only an Importer's browser receives this markup at all.
 * - After a confirmed delete the file is inactive and no longer resolves on its own
 *   page, so the user is returned to the Expense files list (`/upload`) — unchanged
 *   from the flow this action already had.
 * - Assertions on page content are scoped to `main`: Next.js renders a permanently
 *   empty body-level `role="alert"` route announcer, so an unscoped query would match
 *   twice.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie, seeded
 * directly rather than by driving the sign-in form (epic 1 story 2's spec owns that
 * journey). Cookies ignore port, so one seed serves the dev server (:3000) and the
 * epic-end production run (:3100). `Secure` is omitted because the E2E app is served
 * over plain http.
 *
 * TIMING — nothing here waits real time and no clock is faked. Every wait is an
 * auto-retrying expectation; the one deliberate window is `STRAY_CALL_WINDOW_MS`, the
 * time a wrongly-sent delete would have to arrive in.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import {
  FILE_STATUS_UPLOADED,
  deleteSuccessResponse,
  fileLogListResponse,
} from '../src/mocks/data/file-log';
import {
  fileProcessHistory,
  fileProcessLogListResponse,
} from '../src/mocks/data/file-process-log';
import { fileSettingListResponse } from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  fileLogsAfterDeleting,
  fileNeverImportedToDelete,
  importedFileToDelete,
  transactionListResponse,
} from '../src/mocks/data/transaction';
import {
  invalidRowsForEveryDefect,
  validationErrorsResponse,
} from '../src/mocks/data/validation-error';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FileLog } from '../src/mocks/data/file-log';
import type {
  FileDeletionScenario,
  RequestCounts,
} from '../src/mocks/data/transaction';

/** This story's screen, and the Expense files list a confirmed delete returns to. */
const FILE_PAGE_PATH = '/upload/file';
const EXPENSE_FILES_PATH = '/upload';

/** A file's own page — the file is identified by the `LogId` query. */
const filePageFor = (logId: number): string =>
  `${FILE_PAGE_PATH}?LogId=${logId}`;

/** The file page's address, for asserting the user is still on it. */
const filePageUrlPattern = (logId: number): RegExp =>
  new RegExp(`${FILE_PAGE_PATH}\\?LogId=${logId}$`);

/** The Expense files list's address — `/upload/file` deliberately does not match. */
const EXPENSE_FILES_URL_PATTERN = new RegExp(`${EXPENSE_FILES_PATH}$`);

/**
 * The transactions-service calls these screens make, as the BROWSER addresses them:
 * the app's own `/transactions-api/*` mount point, never a service origin. Trailing
 * `**` so query strings are covered.
 */
const FILE_LOGS_URL_GLOB = '**/transactions-api/v1/file-logs**';
const FILE_PROCESS_LOGS_URL_GLOB =
  '**/transactions-api/v1/file-process-logs/**';
const FILE_SETTINGS_URL_GLOB = '**/transactions-api/v1/file-settings**';
const VALIDATION_ERRORS_URL_GLOB =
  '**/transactions-api/v1/files/validation-errors**';

/** This story's own read: the whole request list, narrowed to one file in the browser. */
const TRANSACTIONS_URL_GLOB = '**/transactions-api/v1/transactions**';

/**
 * The delete is `DELETE /transactions-api/v1/files?LogId=<id>` — a path a glob cannot
 * separate from its own children (`/files/download`, `/files/retry-validation`), so it
 * is matched exactly on the pathname instead.
 */
const isDeleteFileCall = (url: URL): boolean =>
  url.pathname.endsWith('/transactions-api/v1/files');

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright, and registered LAST in each test — Playwright matches the most
 * recently registered route first, so a call addressed at a live service fails visibly
 * instead of being quietly answered by an origin-agnostic mock above it.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * The three labels R4 pins, as EXACT accessible names. Exact because "Delete file" and
 * "Delete the file" are one word apart: a substring match would let the trigger's query
 * find the confirming choice, and this spec's whole subject is which of them a stray
 * keypress reaches.
 */
const DELETE_FILE_LABEL = 'Delete file';
const CONFIRM_DELETE_LABEL = 'Delete the file';
const KEEP_THE_FILE_LABEL = 'Keep the file';

/**
 * The superseded wording. R4 renames the trigger and the confirming choice, so neither
 * old phrase may survive anywhere on this surface — including in the dialog.
 */
const OLD_CANCEL_WORDING = /cancel (the )?file/i;

/** UI-09's irreversibility clause — both accepted phrasings of the same promise. */
const IRREVERSIBLE_WORDING = /cannot be undone|cannot be recovered/i;

/**
 * Real-time window in which a delete call would arrive, if a backed-out confirmation
 * had wrongly sent one.
 */
const STRAY_CALL_WINDOW_MS = 3_000;

/**
 * How far a keyboard-only user may reasonably have to Tab to reach the delete action
 * from the top of the page. Generous — the point is that the control is IN the keyboard
 * order at all, not how deep it sits.
 */
const KEYBOARD_REACH_LIMIT = 60;

/** The two shapes AC-6 names, each from the project-wide paired fixture. */
const IMPORTED_FILE = importedFileToDelete();
const NEVER_IMPORTED_FILE = fileNeverImportedToDelete(FILE_STATUS_UPLOADED);

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
 * Answers a browser-side identity read from the shared userinfo source, so it can never
 * disagree with what the Node-side stub returns for the same session.
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
interface ServiceFeed {
  /** Change what the NEXT read of the active file list returns. */
  showFiles: (files: FileLog[]) => void;
}

/**
 * Serves every read the file's page and the Expense files list make, including this
 * story's own request-count read.
 *
 * Deliberately NOT "one snapshot per request": the browser may legitimately read the
 * same thing more than once for a single on-screen state, and a queue would then
 * silently skip a step. Keeping the served body under the TEST's control means each
 * assertion below is about one exact transition.
 */
const serveScreens = async (
  page: Page,
  scenario: FileDeletionScenario,
): Promise<ServiceFeed> => {
  let files = scenario.fileLogs;

  await page.route(FILE_LOGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileLogListResponse(files))),
  );
  await page.route(FILE_PROCESS_LOGS_URL_GLOB, (route) =>
    route.fulfill(
      jsonResponse(fileProcessLogListResponse(fileProcessHistory())),
    ),
  );
  // The WHOLE request list, this file's rows interleaved with two other files' — a
  // confirmation that forgets to filter on FileLogId reports visibly wrong numbers.
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse(scenario.transactions))),
  );
  // Neither of these is asserted on here; they are served so no read can fall through
  // to a live service.
  await page.route(VALIDATION_ERRORS_URL_GLOB, (route) =>
    route.fulfill(
      jsonResponse(validationErrorsResponse(invalidRowsForEveryDefect())),
    ),
  );
  await page.route(FILE_SETTINGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileSettingListResponse())),
  );

  return {
    showFiles: (next: FileLog[]) => {
      files = next;
    },
  };
};

/** What the browser actually asked the service to delete. */
interface DeleteCalls {
  /** The `LogId` the delete call carried, or `undefined` if no delete was sent. */
  logIdSent: () => string | undefined;
}

/**
 * Answers the one delete call this app has, and lets a test say what the service does
 * as a consequence.
 *
 * Registered in EVERY test, including the two where a delete must never happen: an
 * unmocked DELETE would be forwarded to the live transactions service by the app's own
 * proxy, and there would be no record here of it having been sent.
 */
const mockFileDelete = async (
  page: Page,
  effects: { onDeleted?: () => void } = {},
): Promise<DeleteCalls> => {
  let logId: string | undefined;

  await page.route(isDeleteFileCall, (route) => {
    const request = route.request();
    if (request.method() !== 'DELETE') {
      // Nothing in this story addresses this path with another method; letting one
      // through would forward it to the live transactions service.
      return route.abort();
    }
    logId = new URL(request.url()).searchParams.get('LogId') ?? undefined;
    effects.onDeleted?.();
    return route.fulfill(jsonResponse(deleteSuccessResponse()));
  });

  return { logIdSent: () => logId };
};

/**
 * Resolves to the URL of a delete call if one arrives within the window, or to `null`
 * if none does — the service's own account of "nothing was destroyed", rather than a
 * count of mock invocations. Start it BEFORE the interaction it is watching.
 */
const watchForDeleteCall = (page: Page): Promise<string | null> =>
  page
    .waitForRequest(
      (request) =>
        request.method() === 'DELETE' &&
        isDeleteFileCall(new URL(request.url())),
      { timeout: STRAY_CALL_WINDOW_MS },
    )
    .then((request) => request.url())
    .catch(() => null);

/**
 * Puts the browser in a signed-in Importer state without driving the sign-in form and
 * without any real credential: the mock `session` cookie the Node-side stub recognises.
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

/** The confirmation itself — portalled to the body, so never scoped to `main`. */
const confirmationOf = (page: Page): Locator => page.getByRole('alertdialog');

/** A control inside the confirmation, by its exact accessible name. */
const dialogButton = (page: Page, name: string): Locator =>
  confirmationOf(page).getByRole('button', { name, exact: true });

/** The delete trigger on the file's own page. */
const deleteTriggerOn = (page: Page): Locator =>
  page.getByRole('main').getByRole('button', {
    name: DELETE_FILE_LABEL,
    exact: true,
  });

/**
 * Opens the file's page as the signed-in Importer, with everything mocked, and waits
 * until the browser has rendered the file — which also means the client component has
 * hydrated, so the keyboard is live.
 */
const openFilePage = async (
  page: Page,
  context: BrowserContext,
  scenario: FileDeletionScenario,
): Promise<Locator> => {
  await mockBrowserIdentityCall(page, ROLE_IMPORTER);
  await blockLiveBackends(page);
  await seedSession(context, ROLE_IMPORTER);

  await page.goto(filePageFor(scenario.file.Id));

  const main = page.getByRole('main');
  await expect(main).toContainText(scenario.file.CurrentFileName);
  await expect(main).toContainText(scenario.file.CurrentStatus);
  return main;
};

/**
 * Presses Tab until the given control holds focus, proving it is reachable in the
 * keyboard order. Fails with a readable message — and a real focus assertion — if it
 * never is.
 */
const tabUntilFocused = async (
  page: Page,
  target: Locator,
  what: string,
): Promise<void> => {
  for (let presses = 0; presses < KEYBOARD_REACH_LIMIT; presses += 1) {
    const focused = await target.evaluate(
      (element) => element === document.activeElement,
    );
    if (focused) {
      break;
    }
    await page.keyboard.press('Tab');
  }

  // Asserted unconditionally, whether it took nought presses or fifty-nine: the claim
  // is that this control IS the one holding focus now.
  await expect(
    target,
    `${what} was never focused within ${String(KEYBOARD_REACH_LIMIT)} Tab presses — ` +
      `it is not reachable by keyboard`,
  ).toBeFocused();
};

/**
 * A file the delete under test does NOT touch, so "the deleted file is gone" is
 * distinguishable from "the list is empty or failed to load". Named from the fixture
 * rather than picked by position.
 */
const survivorOf = (scenario: FileDeletionScenario): FileLog => {
  const survivor = fileLogsAfterDeleting(scenario).find(
    (file) => file.CurrentFileName !== scenario.file.CurrentFileName,
  );
  if (!survivor) {
    throw new Error(
      `The deletion scenario for "${scenario.file.CurrentFileName}" carries no other ` +
        `file, so an empty list would pass as a successful delete ` +
        `(see web/src/mocks/data/transaction.ts).`,
    );
  }
  return survivor;
};

/**
 * The three numbers the request-count confirmation states (R6). Only enough to prove
 * WHICH shape is on screen — the Vitest layer (AC-1) owns the wording around them.
 * Each is matched as a whole number, scoped to the dialog.
 */
const expectStatesCounts = async (
  page: Page,
  counts: RequestCounts,
): Promise<void> => {
  for (const value of [counts.total, counts.approved, counts.rejected]) {
    await expect(confirmationOf(page)).toContainText(
      new RegExp(`\\b${String(value)}\\b`),
    );
  }
};

test.describe('Epic file-deletion, Story 2: the confirmation says what you are about to destroy', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the identity it needs.
    await context.clearCookies();
  });

  // AC-6 — shape 1 (an `Imported` file): the request-count confirmation.
  // The way out must hold focus BOTH on arrival and once the count lands, because a
  // dialog that focused "Delete the file" would let a single stray Enter destroy 40
  // requests and the record of the 15 decisions already taken on them.
  test('the request-count confirmation opens with Keep the file focused and backs out on Enter and on Escape, deleting nothing', async ({
    page,
    context,
  }) => {
    await serveScreens(page, IMPORTED_FILE);
    await mockFileDelete(page);
    const main = await openFilePage(page, context, IMPORTED_FILE);

    // Watching from before the first click, across the whole interaction.
    const strayDelete = watchForDeleteCall(page);

    const trigger = deleteTriggerOn(page);
    await expect(trigger).toBeVisible();
    await trigger.click();

    const confirmation = confirmationOf(page);
    await expect(confirmation).toBeVisible();

    // On arrival — before the count has even been read — the safe choice holds focus.
    await expect(dialogButton(page, KEEP_THE_FILE_LABEL)).toBeFocused();

    // A stray Enter at that moment backs out; it does not delete.
    await page.keyboard.press('Enter');
    await expect(confirmation).toBeHidden();

    // Opened again, and this time left until the count has arrived: this is the shape
    // that states the scale, and the file it names.
    await trigger.click();
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(
      IMPORTED_FILE.file.CurrentFileName,
    );
    await expectStatesCounts(page, IMPORTED_FILE.expected);

    // The count arriving must not move focus onto the destructive choice.
    await expect(dialogButton(page, KEEP_THE_FILE_LABEL)).toBeFocused();

    // The renamed labels, and not a trace of the superseded wording (R4) on the dialog.
    await expect(dialogButton(page, CONFIRM_DELETE_LABEL)).toBeVisible();
    await expect(confirmation).not.toContainText(OLD_CANCEL_WORDING);

    // Dismissed with a real Escape keypress.
    await page.keyboard.press('Escape');
    await expect(confirmation).toBeHidden();

    // Nothing took effect: same file, same page, same status, and the action is still
    // there to be taken deliberately.
    await expect(page).toHaveURL(filePageUrlPattern(IMPORTED_FILE.file.Id));
    await expect(main).toContainText(IMPORTED_FILE.file.CurrentFileName);
    await expect(main).toContainText(IMPORTED_FILE.file.CurrentStatus);
    // The page behind is checked HERE rather than while the dialog was open: an open
    // modal marks the rest of the page aria-hidden (correctly — Radix removes the
    // background from the accessibility tree), so getByRole('main') matches nothing
    // until it closes. Asserting it mid-dialog fails as "element(s) not found", which
    // says nothing about the wording. The claim is unchanged, only its timing.
    await expect(main).not.toContainText(OLD_CANCEL_WORDING);
    await expect(trigger).toBeEnabled();

    expect(
      await strayDelete,
      'backing out of the confirmation must destroy nothing — the service was asked to delete the file anyway',
    ).toBeNull();
  });

  // AC-6 — shape 2 (a file that never imported): the short confirmation. The same two
  // ways out must be as safe here, on a dialog with no counts in it.
  test('the short confirmation opens with Keep the file focused and backs out on Enter and on Escape, deleting nothing', async ({
    page,
    context,
  }) => {
    await serveScreens(page, NEVER_IMPORTED_FILE);
    await mockFileDelete(page);
    const main = await openFilePage(page, context, NEVER_IMPORTED_FILE);

    const strayDelete = watchForDeleteCall(page);

    const trigger = deleteTriggerOn(page);
    await expect(trigger).toBeVisible();
    await trigger.click();

    const confirmation = confirmationOf(page);
    await expect(confirmation).toBeVisible();

    // It is a real confirmation — it names the file and says the loss is permanent —
    // and the safe choice holds focus.
    await expect(confirmation).toContainText(
      NEVER_IMPORTED_FILE.file.CurrentFileName,
    );
    await expect(confirmation).toContainText(IRREVERSIBLE_WORDING);
    await expect(dialogButton(page, KEEP_THE_FILE_LABEL)).toBeFocused();

    // The renamed labels here too, with the superseded wording gone (R4).
    await expect(dialogButton(page, CONFIRM_DELETE_LABEL)).toBeVisible();
    await expect(confirmation).not.toContainText(OLD_CANCEL_WORDING);

    // A stray Enter on arrival backs out...
    await page.keyboard.press('Enter');
    await expect(confirmation).toBeHidden();

    // With the dialog closed, the page behind is reachable again and carries no trace
    // of the superseded wording either. Checked here for the same reason as the
    // request-count test above: an open modal aria-hides the background, so
    // getByRole('main') cannot match while the confirmation is up.
    await expect(main).not.toContainText(OLD_CANCEL_WORDING);

    // ...and so does Escape.
    await trigger.click();
    await expect(confirmation).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirmation).toBeHidden();

    // The file is exactly where it was, and still deletable on purpose.
    await expect(page).toHaveURL(
      filePageUrlPattern(NEVER_IMPORTED_FILE.file.Id),
    );
    await expect(main).toContainText(NEVER_IMPORTED_FILE.file.CurrentFileName);
    await expect(main).toContainText(NEVER_IMPORTED_FILE.file.CurrentStatus);
    await expect(trigger).toBeEnabled();

    expect(
      await strayDelete,
      'backing out of the confirmation must destroy nothing — the service was asked to delete the file anyway',
    ).toBeNull();
  });

  // AC-6 — the other half: a keyboard-only user must be able to complete the delete,
  // not merely escape it. No pointer is used anywhere in this test.
  test('the request-count confirmation is completable by keyboard alone', async ({
    page,
    context,
  }) => {
    const feed = await serveScreens(page, IMPORTED_FILE);
    const deletes = await mockFileDelete(page, {
      onDeleted: () => {
        // The service deletes the file, so it leaves the active list the Expense files
        // screen re-reads (R11/R12).
        feed.showFiles(fileLogsAfterDeleting(IMPORTED_FILE));
      },
    });
    await openFilePage(page, context, IMPORTED_FILE);

    // Reached by Tab, opened by Enter — the trigger is in the keyboard order.
    const trigger = deleteTriggerOn(page);
    await expect(trigger).toBeVisible();
    await tabUntilFocused(page, trigger, 'the Delete file action');
    await page.keyboard.press('Enter');

    const confirmation = confirmationOf(page);
    await expect(confirmation).toBeVisible();
    await expectStatesCounts(page, IMPORTED_FILE.expected);

    // From the focused way out, the confirming choice is reachable by Tab and taken
    // with Enter — a deliberate keyboard journey, never an accidental one.
    const confirmChoice = dialogButton(page, CONFIRM_DELETE_LABEL);
    await expect(dialogButton(page, KEEP_THE_FILE_LABEL)).toBeFocused();
    await tabUntilFocused(page, confirmChoice, 'the Delete the file choice');
    await page.keyboard.press('Enter');

    // The service was asked to delete THIS file...
    await expect(page).toHaveURL(EXPENSE_FILES_URL_PATTERN);
    expect(
      deletes.logIdSent(),
      'the keyboard-completed delete must name the file it was opened on',
    ).toBe(String(IMPORTED_FILE.file.Id));

    // ...and the list the user lands back on no longer holds it, while the other files
    // are plainly still there.
    const survivor = survivorOf(IMPORTED_FILE);
    await expect(fileRow(page, survivor.CurrentFileName)).toBeVisible();
    await expect(fileRow(page, IMPORTED_FILE.file.CurrentFileName)).toHaveCount(
      0,
    );
  });

  // AC-6 — the same keyboard-only journey through the short confirmation.
  test('the short confirmation is completable by keyboard alone', async ({
    page,
    context,
  }) => {
    const feed = await serveScreens(page, NEVER_IMPORTED_FILE);
    const deletes = await mockFileDelete(page, {
      onDeleted: () => {
        feed.showFiles(fileLogsAfterDeleting(NEVER_IMPORTED_FILE));
      },
    });
    await openFilePage(page, context, NEVER_IMPORTED_FILE);

    const trigger = deleteTriggerOn(page);
    await expect(trigger).toBeVisible();
    await tabUntilFocused(page, trigger, 'the Delete file action');
    await page.keyboard.press('Enter');

    const confirmation = confirmationOf(page);
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(
      NEVER_IMPORTED_FILE.file.CurrentFileName,
    );

    const confirmChoice = dialogButton(page, CONFIRM_DELETE_LABEL);
    await expect(dialogButton(page, KEEP_THE_FILE_LABEL)).toBeFocused();
    await tabUntilFocused(page, confirmChoice, 'the Delete the file choice');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(EXPENSE_FILES_URL_PATTERN);
    expect(
      deletes.logIdSent(),
      'the keyboard-completed delete must name the file it was opened on',
    ).toBe(String(NEVER_IMPORTED_FILE.file.Id));

    const survivor = survivorOf(NEVER_IMPORTED_FILE);
    await expect(fileRow(page, survivor.CurrentFileName)).toBeVisible();
    await expect(
      fileRow(page, NEVER_IMPORTED_FILE.file.CurrentFileName),
    ).toHaveCount(0);
  });
});
