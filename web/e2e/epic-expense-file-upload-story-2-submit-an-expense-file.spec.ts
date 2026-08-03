/**
 * Story Metadata:
 * - Epic: expense-file-upload — Upload an expense file
 * - Story: 2 — Submit an expense file
 * - Route: /upload
 * - Target File: web/src/app/(authenticated)/upload/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R1, R2, R4, R5, R6, R7, R8, BR1, BR3, BR4
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-4 (a submitted CSV is confirmed and joins the list still in progress) and
 *   AC-6 (the picker, the chooser and the submit action are keyboard operable)
 *   → this file.
 * - AC-1 (only active settings offered, chosen file name shown, submit unavailable
 *   until both are chosen), AC-2 (an Approver is offered no submit form at all),
 *   AC-3 (a non-CSV is refused in place and never sent) and AC-5 (a refused
 *   submission shows the service's reason and keeps the choices) → the Vitest layer
 *   at `web/src/__tests__/integration/epic-expense-file-upload-story-2-submit-an-expense-file.test.tsx`.
 *   Deliberately NOT duplicated here.
 * - This epic's single real-browser accessibility scan runs on the FINISHED screen
 *   (list + status labels + submit form together) as story 3's AC-6, so no axe scan
 *   is repeated here.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running locally. Both boundaries were
 * established by epic 1 and by story 1 of this epic; this spec reuses them rather
 * than adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`,
 *    started by `globalSetup` and wired in by `playwright.config.ts`. Every
 *    protected screen is gated SERVER-side (`(authenticated)/layout.tsx` →
 *    `requireSession()` → `GET /v1/auth/userinfo` from inside the Next.js process,
 *    epic 1 BR1/BR3), and `page.route()` cannot see a fetch the browser never
 *    makes. The stub answers that call from the shared identity source, keyed off
 *    the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` (below), for this story's three transactions
 *    calls: `GET /transactions-api/v1/file-settings` (populate the picker),
 *    `POST /transactions-api/v1/files/upload` (the submission) and
 *    `GET /transactions-api/v1/file-logs?IsActive=Yes` (story 1's list, re-read
 *    after the submission).
 *
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by
 *   driving the sign-in form — epic 1 story 2's spec owns that journey, and the
 *   cookie is the app's sole conveyance of session (epic 1 BR2). Cookies ignore
 *   port, so one seed serves the dev server (:3000) and the epic-end production run
 *   (:3100).
 * - Every response body comes from the project-wide factories under
 *   `web/src/mocks/data/` (`userInfoFor(role)`, `fileSettingListResponse()`,
 *   `fileLogListResponse()`, `fileLogWithStatus()`, `uploadSuccessResponse()`); no
 *   response shape is authored in this file, so this spec and the Vitest layer
 *   cannot drift on the contract. The envelopes are the factories' business:
 *   `{ FileSettings: [...] }` for the settings, `{ FileLog: [...] }` (singular
 *   property, array value) for the list, and the generic `DefaultResponse` for the
 *   upload.
 * - THE UPLOAD RESPONSE CARRIES NO FILE IDENTIFIER. `POST /v1/files/upload` answers
 *   with the generic `DefaultResponse` envelope only, so the screen cannot learn the
 *   new file's id or status from it: the new row can only come from re-reading the
 *   active file list. The list mock below therefore serves what the service would —
 *   the file list WITHOUT the new file before the submission, and WITH it (in its
 *   initial `Uploaded` status, per BR2) afterwards. That switch is driven by the
 *   upload actually happening, not by a call count, so it holds however many times
 *   the list is read (story 3 adds polling to the same screen).
 * - The new row is built from what the upload REQUEST carried (`FileName`,
 *   `FileSettingName`), exactly as the real service records it. So the assertion
 *   "the submitted file appears in the list, against the setting that was chosen"
 *   fails through user-visible output if the app submits the wrong setting, or
 *   submits nothing identifying the file at all.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - The settings read, the upload and the list read all happen from the BROWSER,
 *   through the shared API client at the app's own same-origin
 *   `/transactions-api/...` address (story §Infrastructure reuse notes) — i.e. from
 *   a client component. `page.route()` cannot intercept a fetch made by the Next.js
 *   server or by a Server Action; if any of these moves server-side, the mock is
 *   bypassed and the request leaves for the real transactions service.
 * - `FileSettingId`, `FileSettingName` and `FileName` travel as QUERY PARAMETERS on
 *   the upload call, with the raw file as the `application/octet-stream` body — not
 *   a multipart form (brief §Notes & Caveats). The mock reads the chosen setting and
 *   file name from the query string; a multipart body would leave them unset.
 * - The setting picker is the Shadcn `select` the story prescribes: a trigger
 *   exposed as `combobox` that opens a listbox of `option`s, each reachable with the
 *   arrow keys and chosen with Enter. AC-6 drives exactly that keyboard contract, so
 *   a hand-rolled picker, or a native `<select>` (whose options cannot take
 *   keyboard focus), will not satisfy it.
 * - The file chooser is a real `<input type="file">` that can take keyboard focus.
 *   Visually hiding it is fine (`sr-only`); removing it from the tab order
 *   (`display: none`, `hidden`, `tabindex="-1"`) is not — that is precisely the
 *   keyboard-completability failure AC-6 exists to catch.
 * - The submission is confirmed IN PAGE, as the Shadcn `alert` primitive
 *   (`role="alert"`) inside the screen's own `main` content — the same surface AC-5
 *   uses for a refusal. It must still be on screen once the list has been re-read,
 *   so a transient toast alone does not satisfy AC-4 (story 3 owns the
 *   import-complete toast, which is a different message).
 * - The list renders as the table story 1 prescribes, one `row` per file, so a file
 *   can be identified by its own name instead of by position.
 * - `alert` queries are scoped to `main`: Next.js renders its route announcer as a
 *   second, permanently empty `role="alert"` at body level, so an unscoped query
 *   matches two elements.
 * - Cookie assumptions: the mock `session` cookie carries production-like
 *   attributes (HttpOnly, SameSite=Strict). `Secure` is omitted because the E2E
 *   server is plain http on localhost; the real cookie's full attribute set is
 *   asserted in the Vitest layer (epic 1, story 1).
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 * These tests WILL FAIL until the story is implemented (TDD red) — `/upload` still
 * answers a permitted Finance Uploader with `notFound()` and offers no submit form.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { expenseCsvFile } from './fixtures/csv-files';
import { sessionTokenFor } from './support/auth-api-stub';
import {
  FILE_STATUS_IMPORTED,
  FILE_STATUS_UPLOADED,
  fileLogListResponse,
  fileLogWithStatus,
  uploadSuccessResponse,
} from '../src/mocks/data/file-log';
import {
  activeFileSettings,
  fileSettingListResponse,
} from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_FINANCE_UPLOADER } from '../src/mocks/data/role';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FileLog } from '../src/mocks/data/file-log';

/** This story's screen. */
const UPLOAD_PATH = '/upload';

/**
 * The setting the user chooses — the SECOND of the two active settings the mocked
 * service returns, so a passing test cannot be one that merely read a lone default:
 * the picker has to have been operated for this name to end up on the submission.
 */
const [, CHOSEN_SETTING] = activeFileSettings();

/**
 * A file the service already holds before this journey starts. Its name and setting
 * both differ from the file being submitted, so the new row cannot be confused with
 * it — and its presence proves the list itself rendered before the "not listed yet"
 * check below means anything.
 */
const ALREADY_LISTED = fileLogWithStatus(FILE_STATUS_IMPORTED, {
  Id: 4900,
  CurrentFileName: 'expenses_2026-03-31.csv',
  ProcessDate: '2026-03-31 17:45:00',
});

/** The submit control, named for what it does rather than by exact wording. */
const SUBMIT_ACTION = /^(upload|submit)\b/i;

/** Wording that tells the user the submission went through. */
const SUBMISSION_CONFIRMED = /(uploaded|submitted|received)/i;

/**
 * Stands in for a value the upload request never sent. Self-describing so a failure
 * reads as an explanation rather than as a mystery mismatch.
 */
const NOT_SENT = 'was-not-sent-with-the-upload-request';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/** Everything the mocked service learned from the submission. */
interface UploadCapture {
  /** Whether the upload call has been made yet — what flips the list's contents. */
  submitted: boolean;
  /** `FileName` as the request carried it. */
  fileName: string;
  /** `FileSettingName` as the request carried it. */
  settingName: string;
}

/**
 * Blocks the live services (see LIVE_BACKEND_ORIGINS). Registered LAST in each
 * test, because Playwright matches the most recently registered route first: that
 * way a call sent to a service's own origin is aborted and fails visibly, instead
 * of being quietly answered by the origin-agnostic mocks above it.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Puts the browser in a signed-in state as the named role, without a real
 * credential: the mock `session` cookie the Node-side auth stub maps back to this
 * role when the server-side gate asks it who the session belongs to.
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
 * Answers a BROWSER-side identity read from the shared userinfo source. Always
 * switched together with `seedSession`: the server-rendered screen resolves identity
 * from the cookie via the auth stub, so a mismatch would show one person
 * server-side and another in the browser.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(userInfoFor(roleName)),
    }),
  );
};

/**
 * Answers the picker's read of the named file settings with the shared envelope
 * factory (two active settings plus one retired one, so the picker has something to
 * filter). The glob names no origin, so it matches whichever port the app is served
 * on (:3000 in dev, :3100 in the epic-end production run).
 */
const mockFileSettingList = async (page: Page): Promise<void> => {
  await page.route('**/transactions-api/v1/file-settings**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fileSettingListResponse()),
    }),
  );
};

/**
 * The row the service holds for the file that was just submitted: its own name and
 * the setting it was submitted against, both taken from the upload request, at the
 * initial `Uploaded` status every accepted file starts in (brief BR2). Record count
 * and most recent activity come with that status from the shared factory, so the row
 * cannot be an incoherent one.
 */
const submittedFileFrom = (capture: UploadCapture): FileLog =>
  fileLogWithStatus(FILE_STATUS_UPLOADED, {
    Id: 5101,
    ProcessDate: '2026-04-30 16:20:00',
    CurrentFileName: capture.fileName,
    SettingName: capture.settingName,
  });

/** The active file list as the service would report it at this point in the journey. */
const activeFilesFor = (capture: UploadCapture): FileLog[] =>
  capture.submitted
    ? [submittedFileFrom(capture), ALREADY_LISTED]
    : [ALREADY_LISTED];

/**
 * Mocks the submission and the file list as one connected pair, because that is how
 * the real service behaves: the upload answers with the generic envelope (no file
 * identifier at all), and the file only becomes discoverable through the next read
 * of the active list.
 *
 * Returns what the submission carried, so a test can say plainly which file name the
 * request was missing instead of only reporting a row that never appeared.
 */
const mockUploadAndFileList = async (page: Page): Promise<UploadCapture> => {
  const capture: UploadCapture = {
    submitted: false,
    fileName: NOT_SENT,
    settingName: NOT_SENT,
  };

  await page.route('**/transactions-api/v1/files/upload**', async (route) => {
    // The upload's three identifying values are QUERY parameters, with the raw file
    // as the body (brief §Notes & Caveats) — so this is where the service learns
    // which file was submitted and which setting it was submitted against.
    const submission = new URL(route.request().url()).searchParams;
    capture.fileName = submission.get('FileName') ?? NOT_SENT;
    capture.settingName = submission.get('FileSettingName') ?? NOT_SENT;
    capture.submitted = true;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(uploadSuccessResponse()),
    });
  });

  await page.route('**/transactions-api/v1/file-logs**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fileLogListResponse(activeFilesFor(capture))),
    }),
  );

  return capture;
};

/**
 * A file's row in the list, found by the file's own name rather than by position —
 * so the assertion says "this file's row" and stays true however the list is
 * ordered.
 */
const rowFor = (screen: Locator, fileName: string): Locator =>
  screen.getByRole('row').filter({ hasText: fileName });

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
 * Presses `key` until the control has keyboard focus. Throws (failing the test with
 * a plain-English reason) when the control cannot be reached — that throw IS the
 * keyboard-reachability assertion. Same helper epic 1 story 3 uses for the shell
 * header, applied here to the submit form's three controls.
 */
const pressUntilFocused = async (
  page: Page,
  key: string,
  control: Locator,
  maxPresses = 40,
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
    `"${await labelOf(control)}" could not be reached with ${maxPresses} ` +
      `"${key}" presses, so it is not operable by keyboard alone (AC-6).`,
  );
};

test.describe('Epic expense-file-upload, Story 2: submit an expense file', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-4
  test('submitting a chosen CSV against a chosen setting is confirmed, and the file appears in the list still in progress', async ({
    page,
    context,
  }) => {
    await seedSession(context, ROLE_FINANCE_UPLOADER);
    await mockBrowserIdentityCall(page, ROLE_FINANCE_UPLOADER);
    await mockFileSettingList(page);
    const upload = await mockUploadAndFileList(page);
    await blockLiveBackends(page);

    const csv = expenseCsvFile();

    await page.goto(UPLOAD_PATH);
    const screen = page.getByRole('main');

    // The list is on screen and does not hold this file yet — so its appearance
    // below is the submission's doing.
    await expect(rowFor(screen, ALREADY_LISTED.CurrentFileName)).toBeVisible();
    await expect(rowFor(screen, csv.name)).toHaveCount(0);

    // Choose one of the named settings the service offers.
    const settingPicker = screen.getByRole('combobox');
    await settingPicker.click();
    await page.getByRole('option', { name: CHOSEN_SETTING.Name }).click();
    await expect(settingPicker).toContainText(CHOSEN_SETTING.Name);

    // Choose the CSV, then submit it.
    await screen.locator('input[type="file"]').setInputFiles(csv);
    await screen.getByRole('button', { name: SUBMIT_ACTION }).click();

    // The submission is confirmed on the screen the user is already looking at.
    const confirmation = screen.getByRole('alert');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(SUBMISSION_CONFIRMED);

    // The service was told which file this was — the only thing that lets the
    // uploader recognise their own submission in the list, since the upload response
    // carries no identifier.
    expect(
      upload.fileName,
      "the upload must send the chosen file's own name as the FileName query parameter (brief BR1)",
    ).toBe(csv.name);

    // ...and the submitted file is now in the list: named, against the setting that
    // was chosen, and still being processed rather than already finished.
    const submittedRow = rowFor(screen, csv.name);
    await expect(submittedRow).toBeVisible();
    await expect(submittedRow).toContainText(CHOSEN_SETTING.Name);
    await expect(submittedRow).toContainText(FILE_STATUS_UPLOADED);
  });

  // AC-6
  // A real keyboard-only journey through the whole submit form: the mouse is never
  // used. The one unavoidable gap is the operating system's own file-picker dialog,
  // which no browser automation can drive; so the chooser is proved REACHABLE and
  // FOCUSABLE by keyboard, and the file is then handed to that same focused input
  // the way the dialog would hand it over.
  test('the setting picker, the file chooser and the submit action are each reachable and operable using the keyboard alone', async ({
    page,
    context,
  }) => {
    await seedSession(context, ROLE_FINANCE_UPLOADER);
    await mockBrowserIdentityCall(page, ROLE_FINANCE_UPLOADER);
    await mockFileSettingList(page);
    const upload = await mockUploadAndFileList(page);
    await blockLiveBackends(page);

    const csv = expenseCsvFile();

    await page.goto(UPLOAD_PATH);
    const screen = page.getByRole('main');

    // 1. The setting picker — tabbed to, opened, and chosen from, all by keyboard.
    const settingPicker = screen.getByRole('combobox');
    await expect(settingPicker).toBeVisible();
    await pressUntilFocused(page, 'Tab', settingPicker);
    await page.keyboard.press('Enter');

    const chosenOption = page.getByRole('option', {
      name: CHOSEN_SETTING.Name,
    });
    await expect(chosenOption).toBeVisible();
    await pressUntilFocused(page, 'ArrowDown', chosenOption);
    await page.keyboard.press('Enter');
    await expect(settingPicker).toContainText(CHOSEN_SETTING.Name);

    // 2. The file chooser — reached by Tab from the picker, so a keyboard user can
    // open it. An input taken out of the tab order fails here.
    const fileChooser = screen.locator('input[type="file"]');
    await pressUntilFocused(page, 'Tab', fileChooser);
    await fileChooser.setInputFiles(csv);

    // 3. The submit action — reached by Tab and operated with Enter, not a click.
    const submit = screen.getByRole('button', { name: SUBMIT_ACTION });
    await pressUntilFocused(page, 'Tab', submit);
    await page.keyboard.press('Enter');

    // The keyboard-only journey submitted the file the user chose, against the
    // setting they chose, and said so on screen.
    const confirmation = screen.getByRole('alert');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(SUBMISSION_CONFIRMED);
    expect(
      { file: upload.fileName, setting: upload.settingName },
      'the keyboard-only journey must submit the chosen file against the chosen setting',
    ).toEqual({ file: csv.name, setting: CHOSEN_SETTING.Name });
  });
});
