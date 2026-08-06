/**
 * Story Metadata:
 * - Epic: file-validation-and-retry — Rejected rows, retry and cancel
 * - Story: 4 — Retry validation or cancel the file
 * - Route: /upload/file (a file's own page, addressed as `/upload/file?LogId=<id>`)
 * - Target File: web/src/app/(authenticated)/upload/file/page.tsx
 * - Page Action: modify_existing
 * - Requirements: FR4, FR5, BR1, BR2, BR3 (+ source UI-09 confirmation convention,
 *   UI-24 role-conditional markup)
 *
 * Coverage split (feature-planner tags — one tag, one layer):
 * - AC-1 (a Finance Uploader is offered retry and cancel; an Approver is offered
 *   NEITHER, absent from the page rather than greyed out) and AC-5 (confirming the
 *   cancel deactivates the file, which then leaves the Expense files list) → this
 *   file. AC-1 needs two signed-in identities, so it renders as two tests; AC-5's
 *   confirmation is only reachable through the dialog, so its dismiss path and its
 *   confirm path are one test each.
 * - AC-2 (which actions apply at which status), AC-4 (the confirmation's own wording
 *   and focus rules) and AC-6 (a refused retry/cancel reported in the service's own
 *   wording) are the Vitest layer's:
 *   `web/src/__tests__/integration/epic-file-validation-and-retry-story-4-retry-validation-or-cancel-the-file.test.tsx`.
 * - AC-3 (retry puts the file back in progress, records a new activity, and shows the
 *   outcome when it resolves) is tagged `vitest`; it gets ONE real-browser complement
 *   here, because the resolution is timer-driven and jsdom can only prove it with
 *   fake timers, while `page.clock` proves it against the app's real refresh interval
 *   in a real browser. The dialog's focus and keyboard behaviour is complemented for
 *   the same reason: jsdom has no real focus management and no real Escape handling.
 * - One accessibility scan is here and nowhere else in this story: the OPEN cancel
 *   confirmation. This epic's page-level scan belongs to story 1 (its AC-6), but that
 *   scan cannot reach this state — the dialog exists only in this story, only for a
 *   Finance Uploader, and only after a click. testing-policy.md requires each
 *   distinct state a story introduces to be scanned.
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
 *    shared identity source, keyed off the `session` cookie value seeded below — which
 *    is also what decides whether this page's markup carries the two actions at all.
 * 2. Browser boundary → `page.route()` below, for everything this screen reads and
 *    everything these two actions send:
 *      GET    /transactions-api/v1/file-logs?IsActive=Yes        (resolves the file)
 *      GET    /transactions-api/v1/file-process-logs/<LogId>     (its history)
 *      GET    /transactions-api/v1/files/validation-errors?...    (story 2's section)
 *      GET    /transactions-api/v1/file-settings                 (the /upload form)
 *      POST   /transactions-api/v1/files/retry-validation?LogId=<id>
 *      DELETE /transactions-api/v1/files?LogId=<id>
 *    The two reads this story does not assert on are mocked anyway: `/transactions-api`
 *    is the app's OWN same-origin mount point, so an unmocked call is forwarded to the
 *    live transactions service by the route handler INSIDE the Next.js process, where
 *    `blockLiveBackends` cannot see it. `mockFileActions` is likewise registered in
 *    every test, so no retry or cancel can ever leave this machine.
 *    Finally the real services' own origins are blocked outright, registered LAST so
 *    they win over the origin-agnostic globs above them.
 *
 * Every response body comes from the project-wide factories under
 * `web/src/mocks/data/` (`file-log.ts`, `file-process-log.ts`, `validation-error.ts`,
 * `file-setting.ts`, `identity.ts`, `role.ts`) — no response shape and no canonical
 * value is authored in this file, so this spec and the Vitest layer cannot drift on
 * the contract. `fileLogProgression()` supplies the SAME file at successive statuses
 * (one id, one name), which is what makes "this file advanced" distinguishable from
 * "a different file appeared".
 *
 * Implementation patterns this spec assumes (read before implementing):
 * - Both mutating calls are issued FROM THE BROWSER through the shared API client at
 *   the app's own `/transactions-api/...` address (epic §Infrastructure notes).
 *   `page.route()` cannot intercept a fetch made by the Next.js server or by a Server
 *   Action, so moving either call server-side both bypasses these mocks and sends the
 *   request to the live transactions service.
 * - The cancel call carries `LastChangedUser` taken from the authenticated identity
 *   (`GET /v1/auth/userinfo`) and never from user input; this spec asserts the value
 *   the browser sent is one of that identity's own — its display name or its email.
 *   The retry call declares no such header, and that asymmetry is as-documented.
 * - Labels this spec locates the controls by (kept deliberately narrow, because the
 *   destructive action and its dismissal must not be confusable):
 *     retry            → /retry validation/i
 *     cancel (trigger, and the confirming choice in the dialog) → /cancel (the )?file/i
 *     the dismiss choice in the dialog → must be worded with "keep" (the story's own
 *       "keep the file"). Labelling it "Cancel" is what UI-09 rules out here: the
 *       destructive action is itself called Cancel file, so "Cancel" would mean both
 *       things at once.
 * - The confirmation is the Shadcn `alert-dialog` the epic pins (already installed;
 *   its overlay uses the `bg-overlay/60` token — do not regenerate it from the CLI).
 *   Radix renders it as `role="alertdialog"`, PORTALLED to the body — so dialog
 *   queries below are scoped to the dialog itself, not to `main`.
 * - Which actions are offered is decided SERVER-side from the session role
 *   (`hasRole(session, ROLE_IMPORTER)`, the shape `app/(authenticated)/upload/page.tsx`
 *   already uses), so an Approver's browser never receives the markup. A disabled
 *   control fails AC-1 here, which asserts absence.
 * - After a confirmed cancel the file is inactive and no longer resolves on its own
 *   page, so the user is returned to the Expense files list (`/upload`).
 * - After an accepted retry the page re-reads the file and its history — either at
 *   once or by starting the same refresh-while-in-progress pattern
 *   `SubmittedFilesList` already uses (`isFileInProgress`, one interval, its own
 *   call). This spec changes the served body BEFORE clicking and then advances the
 *   browser clock, so either shape passes; the interval must be no longer than
 *   `POLL_TICK_MS`.
 * - History timestamps and statuses are shown as the service sent them (the project
 *   reformats nothing — `SubmittedFilesList` renders `ProcessDate` verbatim), so the
 *   assertions below compare against the mock's own values.
 * - Every assertion on page content is scoped to `main`: Next.js renders a permanently
 *   empty body-level `role="alert"` route announcer, so an unscoped `alert`/region
 *   query always matches two elements.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie, seeded
 * directly rather than by driving the sign-in form (epic 1 story 2's spec owns that
 * journey). Cookies ignore port, so one seed serves the dev server (:3000) and the
 * epic-end production run (:3100). `Secure` is omitted because the E2E app is served
 * over plain http; the real cookie's full attribute set is asserted in the Vitest
 * layer.
 *
 * TIMING — why nothing here waits real time: the post-retry resolution is timer-driven,
 * so that one test drives the browser clock with `page.clock` (`install()` before
 * navigating, then `fastForward()` at the REAL configured interval). No test-only
 * "short interval" prop is needed in production code and no test sits waiting. The
 * accessibility scan and the dialog tests run WITHOUT the fake clock — axe is never
 * run under faked timers, and the dialog's own focus/animation behaviour is asserted
 * against real time.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import {
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_WARNING_LEAD_MS,
} from '../src/lib/session/config';
import {
  FILE_STATUS_IMPORTED,
  FILE_STATUS_VALIDATING,
  FILE_STATUS_VALIDATION_FAILED,
  cancelSuccessResponse,
  fileLogListResponse,
  fileLogProgression,
  fileLogWithStatus,
  fileLogsInEveryStatus,
  retrySuccessResponse,
} from '../src/mocks/data/file-log';
import {
  ACTIVITY_ROW_VALIDATION,
  OUTCOME_SUCCESS,
  fileProcessHistory,
  fileProcessHistoryAfterRetry,
  fileProcessHistoryWithRetryRunning,
  fileProcessLogListResponse,
} from '../src/mocks/data/file-process-log';
import { fileSettingListResponse } from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER, ROLE_IMPORTER } from '../src/mocks/data/role';
import { fullNameOf } from '../src/mocks/data/user';
import {
  invalidRowsForEveryDefect,
  validationErrorsResponse,
} from '../src/mocks/data/validation-error';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FileLog } from '../src/mocks/data/file-log';
import type { FileProcessLog } from '../src/mocks/data/file-process-log';

/** This story's screen, and the Expense files list a confirmed cancel returns to. */
const FILE_PAGE_PATH = '/upload/file';
const EXPENSE_FILES_PATH = '/upload';

/** A file's own page (story 1: the file is identified by the `LogId` query). */
const filePageFor = (logId: number): string =>
  `${FILE_PAGE_PATH}?LogId=${logId}`;

/** The file page's address, for asserting the user is still on it. */
const filePageUrlPattern = (logId: number): RegExp =>
  new RegExp(`${FILE_PAGE_PATH}\\?LogId=${logId}$`);

/** The Expense files list's address — `/upload/file` deliberately does not match. */
const EXPENSE_FILES_URL_PATTERN = new RegExp(`${EXPENSE_FILES_PATH}$`);

/**
 * The transactions-service calls this screen makes, as the BROWSER addresses them:
 * the app's own `/transactions-api/*` mount point, never a service origin. Trailing
 * `**` so query strings are covered.
 */
const FILE_LOGS_URL_GLOB = '**/transactions-api/v1/file-logs**';
const FILE_PROCESS_LOGS_URL_GLOB =
  '**/transactions-api/v1/file-process-logs/**';
const FILE_SETTINGS_URL_GLOB = '**/transactions-api/v1/file-settings**';
const RETRY_VALIDATION_URL_GLOB =
  '**/transactions-api/v1/files/retry-validation**';

/**
 * Story 2's rejected-rows read. The glob also covers its optional
 * `validation-errors/columns` companion: this story asserts nothing about that
 * section, and what matters is that neither read reaches a live service.
 */
const VALIDATION_ERRORS_URL_GLOB =
  '**/transactions-api/v1/files/validation-errors**';

/**
 * The cancel call is `DELETE /transactions-api/v1/files?LogId=<id>` — a path that a
 * glob cannot separate from its own children (`/files/download`,
 * `/files/retry-validation`), so it is matched exactly on the pathname instead.
 */
const isCancelFileCall = (url: URL): boolean =>
  url.pathname.endsWith('/transactions-api/v1/files');

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
 * The two actions this story adds, and the confirmation's dismiss choice. See the
 * header's label contract: the dismissal must be worded with "keep", because the
 * destructive action is itself called Cancel file.
 */
const RETRY_VALIDATION_LABEL = /retry validation/i;
const CANCEL_FILE_LABEL = /cancel (the )?file/i;
const KEEP_THE_FILE_LABEL = /keep/i;

/**
 * UI-09's irreversibility clause, as this story states it: "the file and its rows are
 * removed and it cannot be undone". Both accepted phrasings of the same promise are
 * allowed; anything softer (a bare "Are you sure?") fails.
 */
const IRREVERSIBLE_WORDING = /cannot be undone|cannot be recovered/i;

/**
 * Browser time bought per refresh. `fastForward` fires each due timer at most once, so
 * one jump buys exactly one refresh for any interval up to this length —
 * `SubmittedFilesList` currently uses 15s, and this story reuses that pattern.
 */
const POLL_TICK_MS = 60_000;

/**
 * Real-time window in which a cancel call would arrive, if the dismissed confirmation
 * had wrongly sent one.
 */
const STRAY_CALL_WINDOW_MS = 3_000;

/**
 * The clock jumps in the retry test are idle time as far as epic 1's idle-session
 * manager is concerned, so they have to stay well inside the idle window or the
 * session would end mid-test. Checked against the app's own configured values.
 *
 * Note: this process reads the same env names the app does but does not load
 * `web/.env.local` — so if you shorten the idle timings there for manual testing,
 * shorten the budget here to match.
 */
const CLOCK_BUDGET_MS = 2 * POLL_TICK_MS;

if (CLOCK_BUDGET_MS >= SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_LEAD_MS) {
  throw new Error(
    `This spec advances the browser clock by ${CLOCK_BUDGET_MS}ms of idle time, ` +
      `which reaches the configured session idle window ` +
      `(${SESSION_IDLE_TIMEOUT_MS}ms idle, ${SESSION_WARNING_LEAD_MS}ms warning ` +
      `lead) — the session would end mid-test. Raise ` +
      `NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_SECONDS or lower POLL_TICK_MS.`,
  );
}

/**
 * The file these tests act on: one whose validation has failed, from the project-wide
 * factory (which also gives it a coherent record count, most recent activity and
 * generated error file).
 */
const FAILED_FILE = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED);

/**
 * The newest activity of a history — the one a retry adds. Written as a helper so a
 * row is identified by its content, never by a hard-coded index into the fixture.
 */
const newestActivity = (history: FileProcessLog[]): FileProcessLog => {
  const activity = history[history.length - 1];
  if (!activity) {
    throw new Error(
      'The processing-history fixture is empty — this spec asserts on its newest activity.',
    );
  }
  return activity;
};

/** A fixture field this spec asserts on, refused loudly if the fixture stops carrying it. */
const requiredValue = (value: string | undefined, what: string): string => {
  if (!value) {
    throw new Error(
      `The mocked processing history has no ${what}, which this spec asserts on ` +
        `(see web/src/mocks/data/file-process-log.ts).`,
    );
  }
  return value;
};

/** One of the two files the mocked active list holds — the one that is NOT cancelled below. */
const fileInStatus = (files: FileLog[], status: string): FileLog => {
  const match = files.find((file) => file.CurrentStatus === status);
  if (!match) {
    throw new Error(
      `No file with status "${status}" in the fixture — ` +
        `see fileLogsInEveryStatus() in web/src/mocks/data/file-log.ts.`,
    );
  }
  return match;
};

/**
 * A second active file, with its own id and name, so "the cancelled file is gone from
 * the list" is distinguishable from "the list is empty or failed to load". Its status
 * is a settled one, so its presence never starts the list's own refresh.
 */
const OTHER_ACTIVE_FILE = fileInStatus(
  fileLogsInEveryStatus(),
  FILE_STATUS_IMPORTED,
);

/** The identity the mocked auth service reports for a signed-in Finance Uploader. */
const SIGNED_IN_IMPORTER = userInfoFor(ROLE_IMPORTER);

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

/** What the mocked transactions service is currently serving for this file. */
interface FilePageFeed {
  /** Change what the NEXT read of the active file list returns — the service moving on. */
  showFiles: (files: FileLog[]) => void;
  /** Change what the NEXT read of this file's processing history returns. */
  showHistory: (activities: FileProcessLog[]) => void;
}

/**
 * Serves every read the submitted-file page makes, returning whatever the test last
 * called `showFiles` / `showHistory` with.
 *
 * Deliberately NOT "one snapshot per request": the browser may legitimately read the
 * same thing more than once for a single on-screen state (React's development
 * double-render being the obvious case), and a queue would then silently skip a
 * status. Keeping the served body under the TEST's control means each assertion below
 * is about one exact transition.
 */
const serveFilePage = async (
  page: Page,
  initialFiles: FileLog[],
  initialHistory: FileProcessLog[],
): Promise<FilePageFeed> => {
  let files = initialFiles;
  let history = initialHistory;

  await page.route(FILE_LOGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileLogListResponse(files))),
  );
  await page.route(FILE_PROCESS_LOGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileProcessLogListResponse(history))),
  );
  // Story 2's section and story 2's own layer assert on these rows; here they are
  // served only so the read cannot fall through to a live service.
  await page.route(VALIDATION_ERRORS_URL_GLOB, (route) =>
    route.fulfill(
      jsonResponse(validationErrorsResponse(invalidRowsForEveryDefect())),
    ),
  );
  // The Expense files list a confirmed cancel returns to carries story 2's submit
  // form, which reads the named settings for itself.
  await page.route(FILE_SETTINGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileSettingListResponse())),
  );

  return {
    showFiles: (next: FileLog[]) => {
      files = next;
    },
    showHistory: (next: FileProcessLog[]) => {
      history = next;
    },
  };
};

/** What the browser actually sent when it asked for a cancel. */
interface FileActionCalls {
  /** The `LastChangedUser` header the cancel call carried, if it carried one. */
  auditUserSent: () => string | undefined;
}

/**
 * Answers this story's two mutating calls, and lets a test say what the service does
 * as a consequence (`onRetried` / `onCancelled` change what the reads then return).
 *
 * Registered in EVERY test, including the ones that never click either action: these
 * are the only calls in this epic that change data, and an unmocked one would be
 * forwarded to the live transactions service by the app's own proxy.
 */
const mockFileActions = async (
  page: Page,
  effects: { onRetried?: () => void; onCancelled?: () => void } = {},
): Promise<FileActionCalls> => {
  let auditUser: string | undefined;

  await page.route(RETRY_VALIDATION_URL_GLOB, (route) => {
    effects.onRetried?.();
    return route.fulfill(jsonResponse(retrySuccessResponse()));
  });

  await page.route(isCancelFileCall, (route) => {
    const request = route.request();
    if (request.method() !== 'DELETE') {
      // Nothing in this story addresses this path with another method; letting one
      // through would forward it to the live transactions service.
      return route.abort();
    }
    auditUser = request.headers()['lastchangeduser'];
    effects.onCancelled?.();
    return route.fulfill(jsonResponse(cancelSuccessResponse()));
  });

  return { auditUserSent: () => auditUser };
};

/**
 * Resolves to the URL of a cancel call if one arrives within the window, or to `null`
 * if none does — the observable form of "nothing is cancelled unless it is confirmed".
 * Start it BEFORE the interaction it is watching.
 */
const watchForCancelCall = (page: Page): Promise<string | null> =>
  page
    .waitForRequest(
      (request) =>
        request.method() === 'DELETE' &&
        isCancelFileCall(new URL(request.url())),
      { timeout: STRAY_CALL_WINDOW_MS },
    )
    .then((request) => request.url())
    .catch(() => null);

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
        `${violation.id}: ${violation.help} (${violation.nodes.length} node/s)`,
    ),
    `WCAG 2.2 AA violations on the submitted-file page (${state})`,
  ).toEqual([]);
};

test.describe('Epic file-validation-and-retry, Story 4: retry validation or cancel the file', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the identity it needs.
    await context.clearCookies();
  });

  // AC-1
  test('a Finance Uploader on a file whose validation failed is offered both retry and cancel', async ({
    page,
    context,
  }) => {
    await serveFilePage(page, [FAILED_FILE], fileProcessHistory());
    await mockFileActions(page);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await blockLiveBackends(page);
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(filePageFor(FAILED_FILE.Id));

    const main = page.getByRole('main');
    // The file this page is about, in the state that makes both actions apply.
    await expect(main).toContainText(FAILED_FILE.CurrentFileName);
    await expect(main).toContainText(FILE_STATUS_VALIDATION_FAILED);

    const retry = main.getByRole('button', { name: RETRY_VALIDATION_LABEL });
    const cancel = main.getByRole('button', { name: CANCEL_FILE_LABEL });

    await expect(retry).toBeVisible();
    await expect(retry).toBeEnabled();
    await expect(cancel).toBeVisible();
    await expect(cancel).toBeEnabled();
  });

  // AC-1
  test('an Approver on the same file is offered neither action — absent from the page, not greyed out', async ({
    page,
    context,
  }) => {
    await serveFilePage(page, [FAILED_FILE], fileProcessHistory());
    await mockFileActions(page);
    await mockBrowserIdentityCall(page, ROLE_APPROVER);
    await blockLiveBackends(page);
    await seedSession(context, ROLE_APPROVER);

    await page.goto(filePageFor(FAILED_FILE.Id));

    const main = page.getByRole('main');
    // The page IS theirs to read — the file and its recorded activity are on screen,
    // so what follows is a missing action and not a refused page (brief BR3/BR4).
    await expect(main).toContainText(FAILED_FILE.CurrentFileName);
    await expect(main).toContainText(FILE_STATUS_VALIDATION_FAILED);
    await expect(main).toContainText(ACTIVITY_ROW_VALIDATION);

    // Neither action exists for them as a control...
    await expect(
      main.getByRole('button', { name: RETRY_VALIDATION_LABEL }),
    ).toHaveCount(0);
    await expect(
      main.getByRole('button', { name: CANCEL_FILE_LABEL }),
    ).toHaveCount(0);

    // ...nor anywhere in the page's words: decided server-side and left out of the
    // markup, never rendered disabled (source UI-24). A greyed-out control would
    // still carry its role and its label, so both checks above and below would fail.
    await expect(main).not.toContainText(RETRY_VALIDATION_LABEL);
    await expect(main).not.toContainText(CANCEL_FILE_LABEL);
  });

  // AC-5
  // The confirmation itself, in a real browser: real focus management and real
  // keyboard. Dismissing it — by Escape or by the keep-the-file choice — must leave
  // the file exactly as it was and send no cancel, which is the precondition for the
  // confirm path below meaning anything at all (UI-09).
  test('the cancel confirmation names the file, warns it cannot be undone, opens with keep-the-file focused, and cancels nothing when dismissed', async ({
    page,
    context,
  }) => {
    await serveFilePage(page, [FAILED_FILE], fileProcessHistory());
    await mockFileActions(page);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await blockLiveBackends(page);
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(filePageFor(FAILED_FILE.Id));

    const main = page.getByRole('main');
    const cancelTrigger = main.getByRole('button', { name: CANCEL_FILE_LABEL });
    await expect(cancelTrigger).toBeVisible();

    // Watching from before the first click, for the whole interaction.
    const strayCancelCall = watchForCancelCall(page);

    await cancelTrigger.click();

    // The dialog is portalled to the body, so it is addressed on its own — not via
    // `main` (and it is `alertdialog`, not `alert`, so Next's route announcer is not
    // in play here).
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toBeVisible();

    // It names the file being acted on, and says what cancelling does and that it
    // cannot be taken back.
    await expect(confirmation).toContainText(FAILED_FILE.CurrentFileName);
    await expect(confirmation).toContainText(/rows/i);
    await expect(confirmation).toContainText(IRREVERSIBLE_WORDING);

    // The safe choice holds focus, so Enter or Space on arrival keeps the file.
    await expect(
      confirmation.getByRole('button', { name: KEEP_THE_FILE_LABEL }),
    ).toBeFocused();

    // Dismissed with a real Escape keypress...
    await page.keyboard.press('Escape');
    await expect(confirmation).toBeHidden();

    // ...and dismissed again with the keep-the-file choice.
    await cancelTrigger.click();
    await expect(confirmation).toBeVisible();
    await confirmation
      .getByRole('button', { name: KEEP_THE_FILE_LABEL })
      .click();
    await expect(confirmation).toBeHidden();

    // Nothing took effect: same file, same page, same status, and the action is still
    // there to be taken deliberately.
    await expect(page).toHaveURL(filePageUrlPattern(FAILED_FILE.Id));
    await expect(main).toContainText(FAILED_FILE.CurrentFileName);
    await expect(main).toContainText(FILE_STATUS_VALIDATION_FAILED);
    await expect(cancelTrigger).toBeEnabled();

    expect(
      await strayCancelCall,
      'a dismissed confirmation must not cancel the file — the service was asked to deactivate it anyway',
    ).toBeNull();
  });

  // AC-5
  test('confirming the cancel deactivates the file, which is then gone from the Expense files list', async ({
    page,
    context,
  }) => {
    const feed = await serveFilePage(
      page,
      [FAILED_FILE, OTHER_ACTIVE_FILE],
      fileProcessHistory(),
    );
    const actions = await mockFileActions(page, {
      onCancelled: () => {
        // The service deactivates the file (brief BR2), so it is no longer in the
        // active list the Expense files screen reads.
        feed.showFiles([OTHER_ACTIVE_FILE]);
      },
    });
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await blockLiveBackends(page);
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(filePageFor(FAILED_FILE.Id));

    const main = page.getByRole('main');
    await expect(main).toContainText(FAILED_FILE.CurrentFileName);

    await main.getByRole('button', { name: CANCEL_FILE_LABEL }).click();

    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: CANCEL_FILE_LABEL }).click();

    // The file no longer resolves on a page of its own, so the user lands back on the
    // Expense files list...
    await expect(page).toHaveURL(EXPENSE_FILES_URL_PATTERN);

    // ...where the list is plainly there, and the cancelled file is not in it.
    await expect(
      fileRow(page, OTHER_ACTIVE_FILE.CurrentFileName),
    ).toBeVisible();
    await expect(fileRow(page, FAILED_FILE.CurrentFileName)).toHaveCount(0);

    // The deactivation was attributed to the signed-in person, from the identity the
    // auth service reported — never to anything typed into the page.
    expect(
      [SIGNED_IN_IMPORTER.Email, fullNameOf(SIGNED_IN_IMPORTER)],
      'the cancel call must carry LastChangedUser taken from GET /v1/auth/userinfo (epic brief §Notes & Caveats)',
    ).toContain(actions.auditUserSent());
  });

  // AC-3 — real-browser complement (see the coverage split): the resolution is
  // timer-driven, and `page.clock` proves it against the app's own refresh interval
  // instead of jsdom's fake timers.
  test('retrying puts the file back in progress with a new activity recorded, and the outcome shows when it resolves', async ({
    page,
    context,
  }) => {
    // The SAME file at three successive statuses — one id, one name — so an advanced
    // file is unmistakably this file advancing.
    const [failed, validating, imported] = fileLogProgression([
      FILE_STATUS_VALIDATION_FAILED,
      FILE_STATUS_VALIDATING,
      FILE_STATUS_IMPORTED,
    ]);

    // The activity the retry adds, still running (a start time, no outcome, no end)
    // and then resolved — both from the shared factory.
    const runningRetry = newestActivity(fileProcessHistoryWithRetryRunning());
    const resolvedRetry = newestActivity(
      fileProcessHistoryAfterRetry(OUTCOME_SUCCESS),
    );
    const retryStarted = requiredValue(
      runningRetry.StartDate,
      'retry start time',
    );
    const retryFinished = requiredValue(
      resolvedRetry.EndDate,
      'retry end time',
    );

    // Control the browser clock before anything schedules a timer, so the real
    // configured refresh interval can be crossed instantly.
    await page.clock.install();
    const feed = await serveFilePage(page, [failed], fileProcessHistory());
    await mockFileActions(page, {
      onRetried: () => {
        // The service accepts the retry: the file goes back to an in-progress status
        // and a new validation activity starts, unresolved (FR4).
        feed.showFiles([validating]);
        feed.showHistory(fileProcessHistoryWithRetryRunning());
      },
    });
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await blockLiveBackends(page);
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(filePageFor(failed.Id));

    const main = page.getByRole('main');
    await expect(main).toContainText(FILE_STATUS_VALIDATION_FAILED);
    // The retry's own activity is not in the history yet.
    await expect(main).not.toContainText(retryStarted);

    await main.getByRole('button', { name: RETRY_VALIDATION_LABEL }).click();

    // Back in progress, with the newly recorded attempt on screen — started, not yet
    // resolved.
    await page.clock.fastForward(POLL_TICK_MS);
    await expect(main).toContainText(FILE_STATUS_VALIDATING);
    await expect(main).toContainText(retryStarted);
    await expect(main).not.toContainText(retryFinished);

    // The attempt resolves at the service. Nobody touches the browser — only time
    // passes.
    feed.showFiles([imported]);
    feed.showHistory(fileProcessHistoryAfterRetry(OUTCOME_SUCCESS));
    await page.clock.fastForward(POLL_TICK_MS);

    // The outcome is shown: the file imported, and the attempt that was still running
    // a moment ago now carries the time it finished. The outcome VALUE itself is
    // deliberately not asserted here — `OUTCOME_SUCCESS` already appears against the
    // file's first activity, so it would pass whether or not the retry resolved; the
    // retry's own end time is unique to this attempt, and the Vitest layer (AC-3) pins
    // the per-activity outcome.
    await expect(main).toContainText(FILE_STATUS_IMPORTED);
    await expect(main).toContainText(retryFinished);
    await expect(main).not.toContainText(FILE_STATUS_VALIDATING);
  });

  // Accessibility — the one state story 1's page-level scan cannot reach: the cancel
  // confirmation open over the file's page, as the only role that is offered it. Real
  // browser, so the overlay's contrast, the dialog's name and its focus placement are
  // all seen. No fake clock here — axe is never run under faked timers.
  test('the open cancel confirmation has no accessibility violations', async ({
    page,
    context,
  }) => {
    await serveFilePage(page, [FAILED_FILE], fileProcessHistory());
    await mockFileActions(page);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await blockLiveBackends(page);
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(filePageFor(FAILED_FILE.Id));

    // Settle the page underneath first: the file, its history, and both actions.
    const main = page.getByRole('main');
    await expect(main).toContainText(FAILED_FILE.CurrentFileName);
    await expect(main).toContainText(ACTIVITY_ROW_VALIDATION);
    await expect(
      main.getByRole('button', { name: RETRY_VALIDATION_LABEL }),
    ).toBeVisible();

    await main.getByRole('button', { name: CANCEL_FILE_LABEL }).click();

    // Scan only once the dialog has arrived and taken focus, so the state under the
    // scan is the settled one.
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toBeVisible();
    await expect(
      confirmation.getByRole('button', { name: KEEP_THE_FILE_LABEL }),
    ).toBeFocused();

    await expectNoAccessibilityViolations(
      page,
      'the cancel confirmation open over the file',
    );
  });
});
