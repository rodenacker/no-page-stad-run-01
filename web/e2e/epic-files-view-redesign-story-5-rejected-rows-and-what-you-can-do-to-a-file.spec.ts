/**
 * Story Metadata:
 * - Epic: files-view-redesign — Redesign the expense files view as a batch register
 * - Story: 5 — The rejected rows, and everything you can do to a file
 * - Route: /upload/file (a file's own page, addressed as `/upload/file?LogId=<id>`)
 * - Target File: web/src/components/files/RejectedRows.tsx (plus
 *   `FileDownloadActions.tsx`, `SubmittedFileActions.tsx`, `CorrectionRowsDownload.tsx`)
 * - Page Action: modify_existing
 * - Requirements: R19 (the five controls restyled into the shared ruled action
 *   notation), R4 (every action completable by keyboard alone, to the project's
 *   WCAG 2.2 AA bar), R20 (the delete confirmation's shapes unchanged), R1/BR1/BR2
 *   (behaviour preserved exactly), BR7 (hidden-never-disabled)
 *
 * WHAT THIS SPEC IS FOR — the real risk of the restyle. R19 turns five boxed buttons
 * into small capitalised text on a hairline rule. The way that goes wrong is not
 * cosmetic: a control drawn as a tracked label on a rule is one refactor away from
 * being a styled `<span>`/`<div>` with an `onClick`, which looks identical, works by
 * mouse, and is unreachable and inoperable by keyboard. Nothing in the Vitest layer
 * can catch it — jsdom has no real tab order, no real focus-visible styling and no
 * real activation semantics. So every assertion below is driven by the KEYBOARD
 * (`Tab`, `Enter`, `Space`) and nothing here ever calls `.click()`: a control that
 * needs a mouse fails.
 *
 * Coverage split (feature-planner tags — one tag, one layer):
 * - AC-6 (every one of the five controls — Retry validation, Delete file, Download
 *   original file, Download error file, Download rows to fix — reachable and
 *   completable by keyboard alone, each showing where the focus is) → this file, and
 *   only this.
 * - AC-1 and AC-3 are tagged `none`: the ruled listing's own look and the controls
 *   reading as small capitalised text on a line are typographic judgements only a
 *   human can make, and they are on this story's manual checklist. Nothing here
 *   asserts a class string, a computed font or a border, which is the one way an
 *   automated test can pretend to cover them.
 * - AC-2 (per-row account-number reveal and the correction file's masking), AC-4
 *   (which control is offered to whom and when, absent rather than disabled) and AC-5
 *   (each control's own wait, its own refusal wording, and the delete confirmation's
 *   three shapes) are the Vitest layer's, at `web/src/__tests__/integration/
 *   epic-files-view-redesign-story-5-rejected-rows-and-what-you-can-do-to-a-file.test.tsx`.
 *   Deliberately not duplicated here.
 * - NO ACCESSIBILITY SCAN LIVES HERE. This epic's `@axe-core/playwright` scans of
 *   `/upload` and `/upload/file` belong to story 6, which is the only story that
 *   visits both screens (that story's own reuse notes place them there). Repeating a
 *   page-level scan here would only re-report the same violations twice.
 *
 * WHY AC-6 RENDERS AS FOUR TESTS. The criterion covers five controls, and they cannot
 * share one linear keyboard journey:
 *   1. reachability and the focus indicator are one sweep over all five at once;
 *   2. the three downloads are observable only as real browser download events, and
 *      each is a separate activation;
 *   3. RETRY is offered only while validation has failed, and asking for it moves the
 *      file on at the service;
 *   4. DELETE ends the page it is on — confirming it takes the reader back to the
 *      register — so it can only ever be the last thing a test does.
 * Each test below states which controls it is about.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * This spec never contacts a live backend and never uses a real credential
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running on this machine. Two boundaries, one
 * contract, both established by earlier epics and reused here rather than rebuilt:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started by `globalSetup` and wired
 *    in by `playwright.config.ts`. Both screens are gated SERVER-side
 *    (`(authenticated)/layout.tsx` → `requireSession()` → `GET /v1/auth/userinfo` from
 *    inside the Next.js process), and `page.route()` cannot see a fetch the browser
 *    never makes. The stub answers that call from the shared identity source, keyed off
 *    the `session` cookie value seeded below — which is also what decides whether the
 *    Importer-only retry and delete are in this page's markup at all (BR7).
 * 2. Browser boundary → `page.route()` below, for every transactions-service call these
 *    two screens make and every call these five controls send:
 *      GET    /transactions-api/v1/file-logs?IsActive=Yes        (the register, and how
 *                                                                 `/upload/file`
 *                                                                 resolves its LogId)
 *      GET    /transactions-api/v1/file-process-logs/<LogId>     (its history)
 *      GET    /transactions-api/v1/files/validation-errors?...   (the rejected rows)
 *      GET    /transactions-api/v1/files/download?...            (the file's own bytes:
 *                                                                 the original-file
 *                                                                 download AND what the
 *                                                                 import preview parses)
 *      GET    /transactions-api/v1/files/bulk-errors/download?... (the generated error file)
 *      GET    /transactions-api/v1/file-settings                 (the submission slip)
 *      GET    /transactions-api/v1/transactions                  (the delete
 *                                                                 confirmation's count
 *                                                                 read — never made for
 *                                                                 a file that has not
 *                                                                 imported, mocked so it
 *                                                                 cannot leak if it is)
 *      POST   /transactions-api/v1/files/retry-validation?LogId=<id>
 *      DELETE /transactions-api/v1/files?LogId=<id>
 *    `/transactions-api` is the app's OWN same-origin mount point, so an unmocked call
 *    is forwarded to the live transactions service by the route handler INSIDE the
 *    Next.js process, where a `page.route()` block could not see it — which is why every
 *    read either screen makes is mocked in every test, not only the ones asserted on.
 *    Finally the real services' own origins are blocked outright, registered LAST so
 *    they win over the origin-agnostic globs above them.
 *
 * EVERY RESPONSE BODY COMES FROM THE PROJECT-WIDE FACTORIES under `web/src/mocks/data/`
 * — none is authored here, so this spec and the Vitest layer cannot drift on the
 * contract. `previewWithRejectedRows()` hands back ONE coherent file: its `FileLog`
 * (status `Validation failed`, `HasBulkErrorFile: 'Yes'`, so retry and the error-file
 * download are both genuinely offered), the exact CSV bytes the download answers with,
 * and the validation-errors body describing the same rows — which is what makes the
 * rejected-rows section and the import preview's correction download both real on this
 * page instead of empty. Identity comes from `userInfoFor(role)`.
 *
 * Implementation patterns this spec assumes (read before implementing):
 * - THE FIVE CONTROLS STAY REAL CONTROLS. Restyle THROUGH the Shadcn `Button` primitive
 *   with the shared `RULED_ACTION_CLASS` / `RULED_ACTION_ICON_CLASS`
 *   (`components/requests/fieldNotation.ts`, BR6 — never a second notation): a real
 *   `<button>` in the tab order, activating on both `Enter` and `Space`, keeping the
 *   primitive's focus ring. `RULED_ACTION_CLASS` deliberately does not touch the focus
 *   ring, and this spec fails if the restyle paints it away — an underlined label with
 *   no visible focus indicator is unusable by keyboard even when it is operable.
 * - NEITHER DOWNLOAD, AND NOT THE CORRECTION DOWNLOAD, IS DISABLED WHILE ITS FILE IS ON
 *   ITS WAY (`FileDownloadActions`' own header): disabling the control a keyboard user
 *   has just activated takes the focus out from under them. Each activation below
 *   asserts the control it pressed still holds focus afterwards.
 * - EVERY CALL IS ISSUED FROM THE BROWSER through the shared API client at the app's own
 *   `/transactions-api/...` address. `page.route()` cannot intercept a fetch made by the
 *   Next.js server or by a Server Action, so moving any of these server-side both
 *   bypasses these mocks and sends the request to the live transactions service.
 * - THE THREE DOWNLOADS ARE HANDED OVER BY `deliverFile` (a Blob on a hidden anchor
 *   carrying a `download` name), which is what makes `page.waitForEvent('download')`
 *   observe them and `download.suggestedFilename()` the name the APP chose. A plain
 *   `<a href>` at a service address would drop the user onto a raw error response the
 *   moment the service refused (project.md NFR-base-5) and is not an option.
 * - THE DELETE IS GATED BY THE SHARED `ConfirmAction` alert dialog, portalled to the
 *   body by Radix as `role="alertdialog"` and opening with the way OUT ("Keep the file")
 *   holding focus, so a stray `Enter` on arrival keeps the file. Dialog queries below
 *   are scoped to the dialog itself, not to `main`. R20 restyles nothing inside it.
 * - Which controls exist is decided SERVER-side from the session role (`actingUploaderIn`
 *   in `lib/auth/identity.ts`), so an Approver's browser never receives the retry/delete
 *   markup at all (BR7). This spec signs in as an Importer, because it needs all five
 *   controls on one page; WHO gets which control is AC-4's, in the Vitest layer.
 * - Every assertion on page content is scoped to `main`: Next.js renders a permanently
 *   empty body-level `role="alert"` route announcer, so an unscoped `alert`/region query
 *   always matches two elements.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie, seeded
 * directly rather than by driving the sign-in form (epic 1 story 2's spec owns that
 * journey). Cookies ignore port, so one seed serves the dev server (:3000) and the
 * epic-end production run (:3100). `Secure` is omitted because the E2E app is served
 * over plain http; the real cookie's full attribute set is asserted in the Vitest layer.
 *
 * TIMING: nothing here waits real time and nothing needs a fake clock. The one
 * timer-driven behaviour on this page (the 15s re-read while a file is still getting on)
 * is not what this story is about, and every assertion below is on a state an
 * interaction produces at once — Playwright's own auto-waiting covers the rest.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend response
 * below is mocked, so no live backend is contacted and no real credentials are needed.
 * These tests WILL FAIL until the story is implemented (TDD red).
 * ---------------------------------------------------------------------------
 */
import { Buffer } from 'node:buffer';

import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import {
  FILE_STATUS_VALIDATION_FAILED,
  deleteSuccessResponse,
  fileLogListResponse,
  retrySuccessResponse,
} from '../src/mocks/data/file-log';
import {
  fileProcessHistory,
  fileProcessHistoryWithRetryRunning,
  fileProcessLogListResponse,
} from '../src/mocks/data/file-process-log';
import { fileSettingListResponse } from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
  previewWithRejectedRows,
} from '../src/mocks/data/submitted-file';
import { transactionListResponse } from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FileLog } from '../src/mocks/data/file-log';
import type { FileProcessLog } from '../src/mocks/data/file-process-log';
import type { SubmittedFilePreview } from '../src/mocks/data/submitted-file';

/** The register a file is opened from, and the file's own page. */
const UPLOAD_PATH = '/upload';
const FILE_PATH = '/upload/file';

/** A file's own page (the file is identified by the `LogId` query). */
const filePageFor = (file: FileLog): string =>
  `${FILE_PATH}?LogId=${String(file.Id)}`;

/**
 * That page's address, tolerant of another query parameter travelling alongside
 * `LogId` — the order and the rest of the query are the developer's.
 */
const filePageUrlPattern = (file: FileLog): RegExp =>
  new RegExp(`${FILE_PATH}\\?(.*&)?LogId=${String(file.Id)}(&|$)`);

/** The register's address — `/upload/file` deliberately does not match. */
const UPLOAD_URL_PATTERN = new RegExp(`${UPLOAD_PATH}$`);

/**
 * The transactions-service calls these screens make, as the BROWSER addresses them:
 * the app's own `/transactions-api/*` mount point, never a service origin. Trailing
 * `**` so query strings are covered.
 */
const FILE_LOGS_URL_GLOB = '**/transactions-api/v1/file-logs**';
const FILE_PROCESS_LOGS_URL_GLOB =
  '**/transactions-api/v1/file-process-logs/**';
const VALIDATION_ERRORS_URL_GLOB =
  '**/transactions-api/v1/files/validation-errors**';
const FILE_DOWNLOAD_URL_GLOB = '**/transactions-api/v1/files/download**';
const ERROR_FILE_DOWNLOAD_URL_GLOB =
  '**/transactions-api/v1/files/bulk-errors/download**';
const FILE_SETTINGS_URL_GLOB = '**/transactions-api/v1/file-settings**';
const TRANSACTIONS_URL_GLOB = '**/transactions-api/v1/transactions**';
const RETRY_VALIDATION_URL_GLOB =
  '**/transactions-api/v1/files/retry-validation**';

/**
 * The delete call is `DELETE /transactions-api/v1/files?LogId=<id>` — a path a glob
 * cannot separate from its own children (`/files/download`,
 * `/files/bulk-errors/download`, `/files/retry-validation`), so it is matched exactly
 * on the pathname instead.
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
 * THE FIVE CONTROLS AC-6 IS ABOUT, matched on their own visible wording — which is
 * also their accessible name, since `uppercase` in the ruled notation is CSS and never
 * the DOM (`fieldNotation.ts`: "the wording is untouched wherever it is used").
 *
 * Anchored at the start and deliberately mutually exclusive, because this page is
 * crowded with near neighbours a loose pattern would collide with: `Delete file` (the
 * trigger) against `Delete the file` (the confirming choice inside the dialog), and
 * `Download error file` (the service's own diagnostic) against `Download rows to fix
 * and re-upload` (the correction file this app builds).
 */
const RETRY_VALIDATION = /^retry validation\b/i;
const DELETE_FILE = /^delete file\b/i;
const DOWNLOAD_ORIGINAL_FILE = /^download original file\b/i;
const DOWNLOAD_ERROR_FILE = /^download error file\b/i;
const DOWNLOAD_ROWS_TO_FIX = /^download rows to fix\b/i;

/** The confirmation's other two phrases (R20's three-phrase convention). */
const CONFIRM_DELETE = /^delete the file\b/i;
const KEEP_THE_FILE = /^keep the file\b/i;

/**
 * The elements a keyboard user can actually operate. A `<span role="button">` or a
 * `<div onClick>` is what R19's restyle could turn one of these controls into — it
 * would still answer `getByRole('button')`, so the tag the browser really gives focus
 * to is checked as well.
 */
const REAL_CONTROL_TAGS = ['button', 'a'];

/**
 * How many `Tab` presses one sweep of this page is allowed. The file page carries the
 * signed-in shell, the way back, these five controls, and a reveal control on every
 * previewed and rejected row — comfortably under this, with room for a full wrap-around
 * whatever the sweep started from.
 */
const MAX_TAB_PRESSES = 150;

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
 * disagree with what the Node-side stub returns for the same session. The server-side
 * gate is answered by the stub, not by this route.
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
 * Serves every read the register and the file's own page make, all of them describing
 * the ONE file the shared fixture built, and returns whatever the test last asked for.
 *
 * Deliberately NOT "one snapshot per request": the browser may legitimately read the
 * same thing more than once for a single on-screen state (React's development
 * double-render being the obvious case), and a queue would then silently skip a state.
 * Keeping the served body under the TEST's control means each assertion is about one
 * exact transition.
 */
const serveTheFileScreens = async (
  page: Page,
  preview: SubmittedFilePreview,
): Promise<FilePageFeed> => {
  let files: FileLog[] = [preview.file];
  let history: FileProcessLog[] = fileProcessHistory();

  // There is no get-one-file endpoint: both screens read the active list, and
  // `/upload/file` finds the requested `LogId` in it.
  await page.route(FILE_LOGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileLogListResponse(files))),
  );
  await page.route(FILE_PROCESS_LOGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileProcessLogListResponse(history))),
  );
  // Which of the file's rows the service rejected — what the rejected-rows section
  // lists and what the correction download is built from.
  await page.route(VALIDATION_ERRORS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(preview.validationErrors)),
  );
  // The submission slip on the register reads the named settings for itself.
  await page.route(FILE_SETTINGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileSettingListResponse())),
  );
  // The delete confirmation counts an IMPORTED file's expense payment requests. This
  // file never imported, so it is not read at all — mocked anyway, because an unmocked
  // call would be forwarded to the live transactions service by the app's own proxy.
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse([]))),
  );

  // The originally submitted file's bytes, streamed as the contract declares them.
  // Answered for BOTH readers: the import preview parses them, and the original-file
  // download hands them to the user.
  await page.route(FILE_DOWNLOAD_URL_GLOB, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
      headers: {
        'content-disposition': `attachment; filename="${preview.file.CurrentFileName}"`,
      },
      body: Buffer.from(await preview.blob().arrayBuffer()),
    });
  });

  // The generated error file. Its CONTENTS are the service's own and there is no
  // fixture for them — nothing here asserts on them, and inventing a canonical body
  // would be authoring a response shape this project does not own. What identifies this
  // download is the name the service reported for it (`BulkErrorFile`), which is what
  // the test below pins, so the same bytes serve.
  await page.route(ERROR_FILE_DOWNLOAD_URL_GLOB, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
      headers: {
        'content-disposition': `attachment; filename="${preview.file.BulkErrorFile ?? ''}"`,
      },
      body: Buffer.from(await preview.blob().arrayBuffer()),
    });
  });

  return {
    showFiles: (next: FileLog[]) => {
      files = next;
    },
    showHistory: (next: FileProcessLog[]) => {
      history = next;
    },
  };
};

/**
 * Answers the two mutating calls these controls send, and lets a test say what the
 * service does as a consequence.
 *
 * Registered in EVERY test, including the ones that never activate either: these are
 * the only calls on this page that change data, and an unmocked one would be forwarded
 * to the live transactions service by the app's own proxy.
 */
const mockFileActions = async (
  page: Page,
  effects: { onRetried?: () => void; onDeleted?: () => void } = {},
): Promise<void> => {
  await page.route(RETRY_VALIDATION_URL_GLOB, (route) => {
    effects.onRetried?.();
    return route.fulfill(jsonResponse(retrySuccessResponse()));
  });

  await page.route(isDeleteFileCall, (route) => {
    if (route.request().method() !== 'DELETE') {
      // Nothing on these screens addresses this path with another method; letting one
      // through would forward it to the live transactions service.
      return route.abort();
    }
    effects.onDeleted?.();
    return route.fulfill(jsonResponse(deleteSuccessResponse()));
  });
};

/**
 * Puts the browser in a signed-in state without driving the sign-in form and without
 * any real credential: the mock `session` cookie the Node-side stub recognises for this
 * role.
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
const screenOf = (page: Page): Locator => page.getByRole('main');

/**
 * What the browser actually PAINTS on a control, or `'none'`.
 *
 * Read from computed style rather than from class names on purpose: a class assertion
 * would pass even if the styling token painted nothing at all, which is exactly what "a
 * visible focus indicator" cares about. Both shapes count, because Shadcn/Tailwind
 * render `focus-visible` styling as an outline on some primitives and a `box-shadow`
 * ring on others (the `button` primitive uses `focus-visible:ring-[3px]`). Callers
 * compare the focused paint with the unfocused paint, so a control carrying a permanent
 * shadow cannot pass by accident.
 */
const focusPaintOf = (control: Locator): Promise<string> =>
  control.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const outlineWidth = Number.parseFloat(style.outlineWidth);
    if (style.outlineStyle !== 'none' && outlineWidth > 0) {
      return `outline ${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`;
    }
    if (style.boxShadow && style.boxShadow !== 'none') {
      return `box-shadow ${style.boxShadow}`;
    }
    return 'none';
  });

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

/** Whatever the keyboard has just landed on. */
interface FocusedElement {
  /** How it reads to a user — its own wording, whitespace collapsed. */
  name: string;
  /** What KIND of element the browser gave focus to (see REAL_CONTROL_TAGS). */
  tag: string;
}

/**
 * The element that currently holds focus, or `null` when nothing does. `document.body`
 * is reported as nothing, because that is where a browser parks focus between the last
 * control of a document and the first.
 */
const focusedElementIn = (page: Page): Promise<FocusedElement | null> =>
  page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) {
      return null;
    }
    return {
      name: (element.getAttribute('aria-label') ?? element.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
      tag: element.tagName.toLowerCase(),
    };
  });

/**
 * Presses `key` until the control has keyboard focus. Throws (failing the test with a
 * plain-English reason) when the control cannot be reached — that throw IS the
 * keyboard-reachability assertion.
 */
const pressUntilFocused = async (
  page: Page,
  key: string,
  control: Locator,
  maxPresses = MAX_TAB_PRESSES,
): Promise<void> => {
  for (let press = 0; press <= maxPresses; press += 1) {
    const focused = await control.evaluate(
      (element) => element === document.activeElement,
    );
    if (focused) {
      return;
    }
    await page.keyboard.press(key);
  }
  throw new Error(
    `"${await labelOf(control)}" could not be reached with ${String(maxPresses)} ` +
      `"${key}" presses, so it is not operable by keyboard alone (AC-6).`,
  );
};

/** One of the five controls, as this spec addresses it. */
interface StoryControl {
  /** How it reads to a user — used in failure output. */
  label: string;
  /** Its own wording, as a pattern (see the five constants above). */
  name: RegExp;
}

/**
 * The five, each named so no assertion below has to pick one out of a list by its
 * position.
 */
const RETRY_CONTROL: StoryControl = {
  label: 'Retry validation',
  name: RETRY_VALIDATION,
};
const DELETE_CONTROL: StoryControl = {
  label: 'Delete file',
  name: DELETE_FILE,
};
const ORIGINAL_FILE_CONTROL: StoryControl = {
  label: 'Download original file',
  name: DOWNLOAD_ORIGINAL_FILE,
};
const ERROR_FILE_CONTROL: StoryControl = {
  label: 'Download error file',
  name: DOWNLOAD_ERROR_FILE,
};
const ROWS_TO_FIX_CONTROL: StoryControl = {
  label: 'Download rows to fix and re-upload',
  name: DOWNLOAD_ROWS_TO_FIX,
};

const THE_FIVE_CONTROLS: StoryControl[] = [
  RETRY_CONTROL,
  DELETE_CONTROL,
  ORIGINAL_FILE_CONTROL,
  ERROR_FILE_CONTROL,
  ROWS_TO_FIX_CONTROL,
];

/** One of those controls on the page. */
const controlOn = (page: Page, control: StoryControl): Locator =>
  screenOf(page).getByRole('button', { name: control.name });

/**
 * Waits until the file's page has finished resolving everything these five controls
 * depend on: the file itself, and the import preview whose rejected rows the correction
 * download is built from. Anything missing after this is missing, rather than still on
 * its way.
 *
 * Each control is also asserted to resolve to exactly ONE thing on the page — the
 * near-miss wordings this page carries (`Delete file` / `Delete the file`, `Download
 * error file` / `Download rows to fix and re-upload`) make an ambiguous query the most
 * likely way for a keyboard assertion below to be about the wrong control.
 */
const expectAllFiveControlsOffered = async (
  page: Page,
  preview: SubmittedFilePreview,
): Promise<void> => {
  const screen = screenOf(page);
  await expect(
    screen,
    'the page must name the file it is about before its controls are asserted on',
  ).toContainText(preview.file.CurrentFileName);
  await expect(
    screen,
    'the file must be in the state that offers all five controls — validation having failed',
  ).toContainText(FILE_STATUS_VALIDATION_FAILED);

  for (const control of THE_FIVE_CONTROLS) {
    await expect(
      controlOn(page, control),
      `exactly one control on this page may answer to "${control.label}" (AC-6 asserts on that one control)`,
    ).toHaveCount(1);
  }
};

/**
 * Opens the file's page directly as an Importer, with every call mocked. The journey a
 * user actually takes to get here — from the register, by keyboard — is driven in full
 * by the first test; the tests that follow are about what the controls DO once the page
 * is open, so they start here.
 */
const openTheFilePage = async (
  page: Page,
  context: BrowserContext,
  preview: SubmittedFilePreview,
): Promise<void> => {
  await mockBrowserIdentityCall(page, ROLE_IMPORTER);
  await blockLiveBackends(page);
  await seedSession(context, ROLE_IMPORTER);

  await page.goto(filePageFor(preview.file));
  await expectAllFiveControlsOffered(page, preview);
};

/** The newest activity of a history — the one a retry adds. */
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

test.describe('Epic files-view-redesign, Story 5: the rejected rows, and everything you can do to a file', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the identity it needs.
    await context.clearCookies();
  });

  // AC-6 — reachability and the focus indicator, for all five controls at once.
  //
  // Walked the way a user gets here: from the register, by opening a file whose
  // validation failed — so the retry and the error-file download are genuinely on
  // offer rather than being asserted on a page reached by typing an address.
  test('every one of the five controls is reached by keyboard alone from the register, as a real control that shows where the focus is', async ({
    page,
    context,
  }) => {
    const preview = previewWithRejectedRows();
    // Preconditions, not app assertions: all five controls only exist together on a
    // file the service failed validation on AND generated an error file for, with rows
    // it rejected.
    expect(
      preview.file.CurrentStatus,
      'the shared fixture must hand back a file whose validation FAILED, or retry is not offered at all',
    ).toBe(FILE_STATUS_VALIDATION_FAILED);
    expect(
      preview.file.HasBulkErrorFile,
      'the shared fixture must report a generated error file, or the error-file download is not offered at all',
    ).toBe('Yes');
    expect(
      preview.rejectedRows,
      'the shared fixture must hold rejected rows, or the correction download is not offered at all',
    ).not.toHaveLength(0);

    await serveTheFileScreens(page, preview);
    await mockFileActions(page);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await blockLiveBackends(page);
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(UPLOAD_PATH);

    // The register, and the way into this file — found by WHERE IT GOES rather than by
    // what it is called, since the wording is the developer's and the destination is
    // the contract.
    const register = screenOf(page);
    await expect(register).toContainText(preview.file.CurrentFileName);
    const openTheFile = register.locator(`a[href*="${FILE_PATH}"]`);
    await expect(
      openTheFile,
      'the register must offer exactly one way into the one file it is listing',
    ).toHaveCount(1);

    // Reached by Tab and followed with Enter — never clicked.
    await pressUntilFocused(page, 'Tab', openTheFile);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(filePageUrlPattern(preview.file));

    await expectAllFiveControlsOffered(page, preview);

    // What each control paints when NOTHING has focus, so the focused paint below is a
    // change rather than a permanent decoration.
    const unfocusedPaints = new Map<string, string>();
    for (const control of THE_FIVE_CONTROLS) {
      unfocusedPaints.set(
        control.label,
        await focusPaintOf(controlOn(page, control)),
      );
    }

    // ONE forward sweep of the page with the Tab key, collecting each of the five as it
    // is reached. A control that is a styled span or a div with a click handler is
    // never focused by this sweep at all, and is reported as unreachable below.
    const reached: {
      label: string;
      tag: string;
      focusedPaint: string;
      unfocusedPaint: string;
    }[] = [];
    const stillToReach = new Set(
      THE_FIVE_CONTROLS.map((control) => control.label),
    );

    for (
      let press = 0;
      press < MAX_TAB_PRESSES && stillToReach.size > 0;
      press += 1
    ) {
      await page.keyboard.press('Tab');
      const focused = await focusedElementIn(page);
      if (!focused) {
        continue;
      }
      const control = THE_FIVE_CONTROLS.find(
        (candidate) =>
          stillToReach.has(candidate.label) &&
          candidate.name.test(focused.name),
      );
      if (!control) {
        continue;
      }
      stillToReach.delete(control.label);
      reached.push({
        label: control.label,
        tag: focused.tag,
        focusedPaint: await focusPaintOf(controlOn(page, control)),
        unfocusedPaint: unfocusedPaints.get(control.label) ?? 'none',
      });
    }

    // Every one of them takes focus from the keyboard...
    expect(
      [...stillToReach],
      'controls on the file’s page that the Tab key never reaches, so they cannot be operated by keyboard alone (AC-6)',
    ).toEqual([]);

    // ...as a real control the browser can focus and activate, not a styled span or a
    // div with a click handler wearing the ruled notation (R19).
    expect(
      reached
        .filter((control) => !REAL_CONTROL_TAGS.includes(control.tag))
        .map((control) => `${control.label} is a <${control.tag}>`),
      'controls that are not a real focusable button or link — the ruled notation must be restyled THROUGH the button primitive, never hand-rolled (BR6/R19)',
    ).toEqual([]);

    // ...and each one paints something the user can SEE while it holds focus, different
    // from what it paints when it does not. `RULED_ACTION_CLASS` leaves the primitive's
    // focus ring alone precisely so this holds.
    expect(
      reached
        .filter(
          (control) =>
            control.focusedPaint === 'none' ||
            control.focusedPaint === control.unfocusedPaint,
        )
        .map((control) => control.label),
      'controls that paint no visible focus indicator when reached by keyboard (AC-6: "each showing where the focus is")',
    ).toEqual([]);
  });

  // AC-6 — the three downloads, completed by keyboard alone.
  //
  // Both activation keys are exercised, because a real control answers to both and a
  // div with a click handler answers to neither: Enter on two of them, Space on the
  // third. Each file is identified by the name it ARRIVES under, so a control cannot
  // pass by having handed over some other file.
  test('all three downloads complete by keyboard alone, each keeping the focus of the person who asked', async ({
    page,
    context,
  }) => {
    const preview = previewWithRejectedRows();
    const errorFileName = requiredValue(
      preview.file.BulkErrorFile,
      'generated error file name',
    );

    await serveTheFileScreens(page, preview);
    await mockFileActions(page);
    await openTheFilePage(page, context, preview);

    // THE ORIGINAL FILE — reached by Tab, activated with Enter.
    const originalFile = controlOn(page, ORIGINAL_FILE_CONTROL);
    const originalArriving = page.waitForEvent('download');
    await pressUntilFocused(page, 'Tab', originalFile);
    await page.keyboard.press('Enter');
    const original = await originalArriving;

    expect(
      await original.failure(),
      'activating "Download original file" with Enter must deliver the file (AC-6)',
    ).toBeNull();
    expect(
      original.suggestedFilename(),
      'the original-file download must hand over the submitted file under the name the service holds for it',
    ).toBe(preview.file.CurrentFileName);
    await expect(
      originalFile,
      'the control a keyboard user just activated must keep its focus — a download on its way is announced, never disabled',
    ).toBeFocused();

    // THE GENERATED ERROR FILE — reached by Tab, activated with Space.
    const errorFile = controlOn(page, ERROR_FILE_CONTROL);
    const errorFileArriving = page.waitForEvent('download');
    await pressUntilFocused(page, 'Tab', errorFile);
    await page.keyboard.press('Space');
    const errorFileDownload = await errorFileArriving;

    expect(
      await errorFileDownload.failure(),
      'activating "Download error file" with Space must deliver the file (AC-6)',
    ).toBeNull();
    expect(
      errorFileDownload.suggestedFilename(),
      "the error-file download must hand over the service's own generated file, under the name it reported for it",
    ).toBe(errorFileName);
    await expect(errorFile).toBeFocused();

    // THE ROWS TO FIX — the file this application builds from the rejected rows,
    // reached by Tab and activated with Enter.
    const rowsToFix = controlOn(page, ROWS_TO_FIX_CONTROL);
    const rowsToFixArriving = page.waitForEvent('download');
    await pressUntilFocused(page, 'Tab', rowsToFix);
    await page.keyboard.press('Enter');
    const correction = await rowsToFixArriving;

    expect(
      await correction.failure(),
      'activating "Download rows to fix and re-upload" with Enter must deliver the file (AC-6)',
    ).toBeNull();
    const correctionName = correction.suggestedFilename();
    expect(
      correctionName,
      'the rows to fix are handed over as a CSV file',
    ).toMatch(/\.csv$/i);
    expect(
      correctionName,
      'the rows to fix are a new file this application builds, not the submitted file handed back',
    ).not.toBe(preview.file.CurrentFileName);
    expect(
      correctionName,
      "the rows to fix are not the service's own generated error file",
    ).not.toBe(errorFileName);
    await expect(rowsToFix).toBeFocused();

    // Nothing was refused: all three arrived, so no control reported a failure in place
    // of its file.
    await expect(
      screenOf(page).getByRole('alert'),
      'no download may report a refusal when all three files were delivered',
    ).toHaveCount(0);
  });

  // AC-6 — Retry validation, completed by keyboard alone.
  //
  // "Completable" means the service was really asked and the page really moved on: the
  // POST arrives, and the new attempt the service recorded appears on the page's own
  // re-read. A control that only looked pressed would fail both halves.
  test('Retry validation completes by keyboard alone and the newly recorded attempt appears', async ({
    page,
    context,
  }) => {
    const preview = previewWithRejectedRows();
    // The attempt a retry adds: a new validation activity that has started and has not
    // resolved. Its start time appears nowhere in the history served before the retry,
    // so it cannot be matched by accident.
    const retryStarted = requiredValue(
      newestActivity(fileProcessHistoryWithRetryRunning()).StartDate,
      'retry start time',
    );

    const feed = await serveTheFileScreens(page, preview);
    await mockFileActions(page, {
      onRetried: () => {
        // The service accepted the retry and recorded a new attempt against the file.
        feed.showHistory(fileProcessHistoryWithRetryRunning());
      },
    });
    await openTheFilePage(page, context, preview);

    const screen = screenOf(page);
    const retry = controlOn(page, RETRY_CONTROL);
    await expect(
      screen,
      'the retry’s own new attempt must not be on the page before it is asked for',
    ).not.toContainText(retryStarted);

    const retryAsked = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().includes('/transactions-api/v1/files/retry-validation'),
    );

    // Reached by Tab, activated with Enter — never clicked.
    await pressUntilFocused(page, 'Tab', retry);
    await page.keyboard.press('Enter');

    // The service was really asked, from the browser, at the app's own address.
    await retryAsked;

    // ...and the attempt it recorded is on the page, which is the outcome the reader
    // was waiting for.
    await expect(
      screen,
      'a retry completed by keyboard must produce the same outcome as any other: the newly recorded attempt on screen',
    ).toContainText(retryStarted);
    // Nothing was refused, and the reader is still on the file's own page.
    await expect(page).toHaveURL(filePageUrlPattern(preview.file));
  });

  // AC-6 — Delete file, completed by keyboard alone, confirmation included.
  //
  // Last of the four, because confirming it ends the page: the file leaves the active
  // list and the reader is put back on the register. Both of the confirmation's own
  // controls are keyboard business too — the way OUT holds focus on arrival, so a
  // stray Enter keeps the file, and the confirming choice has to be reached
  // deliberately.
  test('Delete file completes by keyboard alone through its confirmation, and the reader lands back on the register', async ({
    page,
    context,
  }) => {
    const preview = previewWithRejectedRows();

    const feed = await serveTheFileScreens(page, preview);
    await mockFileActions(page, {
      onDeleted: () => {
        // The service deactivates the file, so it is no longer in the active list
        // either screen reads.
        feed.showFiles([]);
      },
    });
    await openTheFilePage(page, context, preview);

    const deleteFile = controlOn(page, DELETE_CONTROL);

    // Reached by Tab, opened with Enter — never clicked.
    await pressUntilFocused(page, 'Tab', deleteFile);
    await page.keyboard.press('Enter');

    // The confirmation is portalled to the body by Radix, so it is addressed on its own
    // rather than through `main`.
    const confirmation = page.getByRole('alertdialog');
    await expect(
      confirmation,
      'the delete must still ask first, in the shared confirmation (R20)',
    ).toBeVisible();
    await expect(
      confirmation,
      'the confirmation still names the file it is about',
    ).toContainText(preview.file.CurrentFileName);

    // The way OUT holds focus on arrival, so Enter or Space on landing keeps the file.
    const keepTheFile = confirmation.getByRole('button', {
      name: KEEP_THE_FILE,
    });
    await expect(
      keepTheFile,
      'the confirmation must open with the way out holding focus (R20)',
    ).toBeFocused();

    // The confirming choice is reached deliberately, by keyboard, and shows where the
    // focus is when it is.
    const confirmDelete = confirmation.getByRole('button', {
      name: CONFIRM_DELETE,
    });
    const unfocusedPaint = await focusPaintOf(confirmDelete);
    await pressUntilFocused(page, 'Tab', confirmDelete);
    const focusedPaint = await focusPaintOf(confirmDelete);
    expect(
      focusedPaint,
      'the confirming choice must paint a visible focus indicator when it is reached by keyboard (AC-6)',
    ).not.toBe('none');
    expect(
      focusedPaint,
      'the confirming choice must LOOK different while it holds focus, or a keyboard user cannot tell which choice they are about to take',
    ).not.toBe(unfocusedPaint);

    const deleteSent = page.waitForRequest(
      (request) =>
        request.method() === 'DELETE' &&
        isDeleteFileCall(new URL(request.url())),
    );

    await page.keyboard.press('Enter');

    // The service was really asked to delete the file...
    await deleteSent;

    // ...and the reader, whose file no longer exists, is put back on the register.
    await expect(page).toHaveURL(UPLOAD_URL_PATTERN);
    await expect(
      screenOf(page),
      'the deleted file must not still be listed on the register the reader lands on',
    ).not.toContainText(preview.file.CurrentFileName);
  });
});
