/**
 * Story Metadata:
 * - Epic: files-view-redesign — Redesign the expense files view as a batch register
 * - Story: 2 — The submission slip
 * - Route: /upload
 * - Target File: web/src/components/upload/SubmitExpenseFileForm.tsx
 * - Page Action: modify_existing
 * - Requirements: R13, R1, R4, R6, R7, R9, R23, BR1, BR2, BR6, BR7, BR9
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-4 (the whole slip is completable by keyboard alone — the setting, the real
 *   file field and the submit all reachable in a sensible order, each showing where
 *   the focus is) → this file, as the single test below.
 * - AC-1 (underline-only ruled fields with small capitalised labels, no boxes and no
 *   card) is tagged `none`: it is typographic judgement, already on the story's
 *   manual checklist. It is deliberately NOT automated here — in particular this
 *   spec asserts no Tailwind class string and no font-family.
 * - AC-2 (submit unavailable until both choices are made, a non-CSV refused by
 *   name), AC-3 (the confirmation's words, and the register picking the new file up)
 *   and AC-5 (an Approver's screen carries no form at all) → the Vitest layer at
 *   `web/src/__tests__/integration/epic-files-view-redesign-story-2-the-submission-slip.test.tsx`.
 *   Not duplicated here.
 * - This epic's single real-browser `@axe-core/playwright` scan covers `/upload` AND
 *   `/upload/file` in STORY 6's spec (story 6 §Reuse notes — it is the only story
 *   that already visits both), so no axe scan is repeated here.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * (testing-policy.md § "Playwright runs against mocks, never live" — even though
 * project.md records both services as reachable locally.) Two boundaries, both
 * established by earlier epics and reused here rather than re-invented:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`,
 *    started by `globalSetup` and wired in by `playwright.config.ts`. `/upload` is
 *    gated SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie seeded below. That same
 *    server-side session is also what decides the slip is rendered AT ALL — only an
 *    Importer's is (`page.tsx` → `hasRole(session, ROLE_IMPORTER)`), so this journey
 *    needs the Importer's cookie or there is no slip on the screen to operate.
 * 2. Browser boundary → `page.route()` (below), for this screen's three transactions
 *    calls: `GET /transactions-api/v1/file-settings` (fills the setting field),
 *    `POST /transactions-api/v1/files/upload` (the submission) and
 *    `GET /transactions-api/v1/file-logs?IsActive=Yes` (the register below the slip,
 *    re-read after the submission).
 *
 * - Sign-in is faked with the mock `session` cookie the stub maps back to a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by
 *   driving the sign-in form — `sign-in-and-app-shell` story 2 owns that journey,
 *   and the cookie is the app's sole conveyance of session. Cookies ignore port, so
 *   one seed serves the dev server (:3000) and the epic-end production run (:3100).
 * - Every response body comes from the project-wide factories under
 *   `web/src/mocks/data/` (`userInfoFor`, `fileSettingListResponse`,
 *   `fileLogListResponse`, `fileLogWithStatus`, `uploadSuccessResponse`); no
 *   response shape is authored in this file, so this spec and the Vitest layer
 *   cannot drift on the contract.
 * - What the upload REQUEST carried is captured, so the closing assertion can say
 *   plainly that the keyboard-only journey submitted the file the user chose against
 *   the setting they chose — the difference between a form that merely took focus in
 *   a tidy order and a slip that was actually completed.
 * - The live service origins are blocked LAST (Playwright matches the most recently
 *   registered route first), so a browser-side call addressed to a real service is
 *   aborted and fails visibly instead of being quietly answered by the mocks above.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - THE FILE FIELD STAYS A REAL `<input type="file">`. This is the whole risk the
 *   redesign creates: an underline-only ruled field must not become a styled `div`
 *   with a click handler, nor a label whose input is `display: none` / `hidden` /
 *   `tabindex="-1"`. The assertions below check that the element the "CSV file"
 *   label names really is `input[type=file]` AND that Tab reaches it — a div takes
 *   no focus and opens no file chooser, so a keyboard user could never send a file.
 * - THE RULED TREATMENT MUST NOT DROP OR CLIP THE FOCUS INDICATOR. `RULED_FIELD_CLASS`
 *   replaces the boxed input's border, and the focus ring goes with the border if
 *   nothing replaces it. Each of the three stops is checked for painting something
 *   visibly different once the keyboard arrives — read from computed style in a real
 *   browser rather than from class names, because a class assertion would pass even
 *   if the ring were painted inside a clipping ancestor and therefore invisible.
 * - The setting field stays the Shadcn `select`: a trigger exposed as `combobox`
 *   that opens a listbox of `option`s, reachable with the arrow keys and chosen with
 *   Enter. A native `<select>` (whose options cannot take keyboard focus) or a
 *   hand-rolled picker will not satisfy the walk below.
 * - Each of the three controls keeps an ACCESSIBLE NAME from its ruled label — "File
 *   setting", "CSV file", and the submit's own wording. AC-1 may set those labels in
 *   small capitals; the accessible name is computed from the label's TEXT, so a CSS
 *   `uppercase` treatment is fine, but taking the label out of a real `<label for>`
 *   / `aria-label` relationship is not. Every stop below is addressed by its
 *   accessible name, never by tab-stop index alone.
 * - Submit stays a real `<button type="submit">`, DISABLED until both a setting and
 *   a CSV are in hand (BR1) — which also means it is not a tab stop until then, so
 *   the walk reaches it only after the file is chosen. It must answer the Enter key,
 *   not only a click.
 * - The settings read, the upload and the register's read all happen from the
 *   BROWSER, through the shared API client at the app's own same-origin
 *   `/transactions-api/...` address. `page.route()` cannot intercept a fetch made by
 *   the Next.js server or by a Server Action; if any of these moves server-side the
 *   mock is bypassed and the request leaves for the real transactions service.
 * - `FileSettingId`, `FileSettingName` and `FileName` travel as QUERY PARAMETERS on
 *   the upload call, with the raw file as the `application/octet-stream` body (epic
 *   `expense-file-upload` brief §Notes & Caveats). The mock reads the chosen setting
 *   and file name from the query string; a multipart body would leave them unset.
 * - The submission is confirmed IN PAGE as a `role="alert"` inside the screen's own
 *   `main`, and `alert` queries are scoped to `main`: Next.js renders its route
 *   announcer as a second, permanently empty body-level `role="alert"`.
 * - Cookie assumptions: the mock `session` cookie carries production-like
 *   attributes (HttpOnly, SameSite=Strict). `Secure` is omitted because the E2E
 *   server is plain http on localhost.
 *
 * NO CLOCK IS INSTALLED and nothing here waits real time — every assertion is
 * auto-waiting. The register's own refresh cadence only re-serves the same body.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend
 * response below is mocked, so no live backend is contacted and no real credentials
 * are needed.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SPEC MAY BE GREEN BEFORE THE STORY IS BUILT — and why that is correct
 * ---------------------------------------------------------------------------
 * AC-4 is a PRESERVATION criterion, not a new capability: keyboard completability of
 * this slip shipped with `expense-file-upload` story 2, and brief R1/BR2 forbid this
 * presentation-only epic from changing any behaviour. A test that FAILED today would
 * have to be asserting something other than what AC-4 says. What this spec is FOR is
 * the restyle: it is the guard that fails the moment the boxed input becomes a styled
 * div, the file input leaves the tab order, a label stops naming its control, or the
 * ruled treatment paints no focus indicator. The same arrangement
 * `request-list-redesign` story 6 AC-4 uses for the exception gutter.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { expenseCsvFile } from './fixtures/csv-files';
import { sessionTokenFor } from './support/auth-api-stub';
import {
  FILE_STATUS_IMPORTED,
  fileLogListResponse,
  fileLogWithStatus,
  uploadSuccessResponse,
} from '../src/mocks/data/file-log';
import {
  activeFileSettings,
  fileSettingListResponse,
} from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';

import type { BrowserContext, Locator, Page } from '@playwright/test';

/** This story's screen. */
const UPLOAD_PATH = '/upload';

/**
 * The setting the user chooses — the SECOND of the two active settings the mocked
 * service offers, so a passing test cannot be one that merely read a lone default:
 * the field has to have been operated by keyboard for this name to end up on the
 * submission.
 */
const [, CHOSEN_SETTING] = activeFileSettings();

/**
 * One file the service already holds, so the register below the slip renders as it
 * really would rather than as its empty state. `Imported` — a finished file — on
 * purpose: it leaves the register nothing to keep polling for, so nothing about this
 * keyboard walk depends on a refresh cadence.
 */
const ALREADY_LISTED = fileLogWithStatus(FILE_STATUS_IMPORTED, {
  Id: 4900,
  CurrentFileName: 'expenses_2026-03-31.csv',
  ProcessDate: '2026-03-31 17:45:00',
});

/** The setting field, addressed by the accessible name its ruled label gives it. */
const SETTING_FIELD_NAME = /file setting/i;

/** The file field, addressed by the accessible name its ruled label gives it. */
const FILE_FIELD_NAME = /csv file/i;

/**
 * The submit control, named for what it does rather than by exact wording — the same
 * pattern `expense-file-upload` story 2's spec uses, so the two specs on this screen
 * pin one contract.
 */
const SUBMIT_ACTION = /^(upload|submit)\b/i;

/** Wording that tells the user the submission went through. */
const SUBMISSION_CONFIRMED = /(uploaded|submitted|received)/i;

/**
 * Stands in for a value the upload request never sent. Self-describing, so a failure
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

/** What the mocked service learned from the submission. */
interface UploadCapture {
  /** `FileName` as the request carried it. */
  fileName: string;
  /** `FileSettingName` as the request carried it. */
  settingName: string;
}

/**
 * Blocks the live services (see LIVE_BACKEND_ORIGINS). Registered LAST in the test,
 * because Playwright matches the most recently registered route first.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Puts the browser in a signed-in state as the named role, without a real
 * credential: the mock `session` cookie the Node-side auth stub maps back to this
 * role when the server-side gate asks it who the session belongs to. For the
 * Importer, this is also what makes the slip render at all.
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
 * switched together with `seedSession`, so the person the server rendered for and the
 * person the browser reads are the same one.
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
 * Answers the setting field's read of the named settings with the shared envelope
 * factory (two active settings plus one retired one). The glob names no origin, so it
 * matches whichever port the app is served on.
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

/** The register below the slip, answered with the one file the service holds. */
const mockFileLogList = async (page: Page): Promise<void> => {
  await page.route('**/transactions-api/v1/file-logs**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fileLogListResponse([ALREADY_LISTED])),
    }),
  );
};

/**
 * Accepts the submission, recording which file and which setting the request
 * carried — the only way to tell a completed slip from a form that merely took focus
 * in the right order.
 */
const mockUpload = async (page: Page): Promise<UploadCapture> => {
  const capture: UploadCapture = {
    fileName: NOT_SENT,
    settingName: NOT_SENT,
  };

  await page.route('**/transactions-api/v1/files/upload**', async (route) => {
    // The upload's identifying values are QUERY parameters, with the raw file as the
    // body — so this is where the service learns what was submitted.
    const submission = new URL(route.request().url()).searchParams;
    capture.fileName = submission.get('FileName') ?? NOT_SENT;
    capture.settingName = submission.get('FileSettingName') ?? NOT_SENT;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(uploadSuccessResponse()),
    });
  });

  return capture;
};

/**
 * What the browser actually PAINTS on a control, or `'none'`.
 *
 * Read from computed style rather than from class names on purpose: a class assertion
 * would pass even if the ruled field painted nothing at all, or painted it inside a
 * clipping ancestor — which is exactly what "showing where the focus is" cares about.
 * Both shapes count, because Shadcn/Tailwind render `focus-visible` styling as an
 * outline on some primitives and as a `box-shadow` ring on others; the caller
 * compares the focused paint with the RESTING paint, so a control carrying a
 * permanent shadow cannot pass by accident. The same helper `request-list-redesign`
 * story 6 uses for the gutter's selection mark.
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

/**
 * What kind of element a control actually is — `input[type=file]`, `button`, `div`.
 * This is how a styled div masquerading as a field is caught: the underline-only
 * treatment takes the visual box away, and nothing on screen then distinguishes a
 * real file input from a div with a click handler until a keyboard user tries to use
 * it.
 */
const controlKindOf = (control: Locator): Promise<string> =>
  control.evaluate((element) =>
    element instanceof HTMLInputElement
      ? `${element.tagName.toLowerCase()}[type=${element.type}]`
      : element.tagName.toLowerCase(),
  );

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
 * Presses `key` until the control has keyboard focus. Throws (failing the test with a
 * plain-English reason) when the control cannot be reached — that throw IS the
 * keyboard-reachability assertion. The same helper epic 1 story 3,
 * `expense-file-upload` story 2 and `request-list-redesign` story 6 use.
 */
const pressUntilFocused = async (
  page: Page,
  key: string,
  control: Locator,
  maxPresses = 60,
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
      `"${key}" presses from the stop before it, so the submission slip is not ` +
      'completable by keyboard alone (AC-4).',
  );
};

/** Why every stop on the slip has to paint something once the keyboard arrives. */
const FOCUS_INDICATOR_REASON =
  'each stop on the submission slip must paint something visibly different once ' +
  'the keyboard reaches it — an underline-only ruled field that drops the boxed ' +
  "input's focus ring along with its border leaves a keyboard user unable to see " +
  'where they are (AC-4, R4, WCAG 2.2 AA)';

test.describe('Epic files-view-redesign, Story 2: the submission slip', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the session it needs.
    await context.clearCookies();
  });

  // AC-4
  // One keyboard-only journey through the whole slip: the mouse is never used, and
  // every stop is addressed by its accessible name rather than by position. The one
  // unavoidable gap is the operating system's own file-picker dialog, which no
  // browser automation can drive — so the file field is proved to be a REAL file
  // input that Tab reaches and that shows its focus, and the file is then handed to
  // that same focused input the way the dialog would hand it over.
  test('the setting, the real file field and the submit are each reached in order by keyboard alone, each showing where the focus is, and the slip completes', async ({
    page,
    context,
  }) => {
    await seedSession(context, ROLE_IMPORTER);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await mockFileSettingList(page);
    await mockFileLogList(page);
    const upload = await mockUpload(page);
    await blockLiveBackends(page);

    const csv = expenseCsvFile();

    await page.goto(UPLOAD_PATH);
    const screen = page.getByRole('main');

    const settingField = screen.getByRole('combobox', {
      name: SETTING_FIELD_NAME,
    });
    const fileField = screen.getByLabel(FILE_FIELD_NAME);
    const submit = screen.getByRole('button', { name: SUBMIT_ACTION });

    // The slip is on screen with nothing chosen yet — so every choice below is one
    // this keyboard journey made.
    await expect(settingField).toBeVisible();
    await expect(
      submit,
      'with neither a setting nor a CSV chosen the submit must be unavailable (BR1), so it is not a tab stop yet either',
    ).toBeDisabled();

    /* ---- Stop 1: the setting ---- */

    const settingAtRest = await focusPaintOf(settingField);
    await pressUntilFocused(page, 'Tab', settingField);
    await expect(
      settingField,
      'the first stop on the slip must be the field named "File setting"',
    ).toBeFocused();
    const settingFocused = await focusPaintOf(settingField);
    expect(settingFocused, FOCUS_INDICATOR_REASON).not.toBe('none');
    expect(settingFocused, FOCUS_INDICATOR_REASON).not.toBe(settingAtRest);

    // Opened and chosen from by keyboard alone — a native <select>, whose options
    // take no focus of their own, cannot satisfy this.
    await page.keyboard.press('Enter');
    const chosenOption = page.getByRole('option', {
      name: CHOSEN_SETTING.Name,
    });
    await expect(chosenOption).toBeVisible();
    await pressUntilFocused(page, 'ArrowDown', chosenOption);
    await page.keyboard.press('Enter');
    await expect(settingField).toContainText(CHOSEN_SETTING.Name);

    // A setting on its own is still not enough to send anything (BR1).
    await expect(
      submit,
      'with a setting chosen but no CSV the submit must still be unavailable (BR1)',
    ).toBeDisabled();

    /* ---- Stop 2: the file field, which must still be a real file input ---- */

    const fileAtRest = await focusPaintOf(fileField);
    await pressUntilFocused(page, 'Tab', fileField);
    await expect(
      fileField,
      'the stop after the setting must be the field named "CSV file"',
    ).toBeFocused();

    expect(
      await controlKindOf(fileField),
      'the "CSV file" label must still name a real <input type="file"> — an ' +
        'underline-only ruled field that became a styled div, or an input taken out ' +
        'of the tab order, opens no file chooser and leaves a keyboard user unable ' +
        'to send a file at all (AC-4, R4)',
    ).toBe('input[type=file]');

    const fileFocused = await focusPaintOf(fileField);
    expect(fileFocused, FOCUS_INDICATOR_REASON).not.toBe('none');
    expect(fileFocused, FOCUS_INDICATOR_REASON).not.toBe(fileAtRest);

    // The file is handed to the input the keyboard is already on, standing in for the
    // OS file dialog that opens from here.
    await fileField.setInputFiles(csv);
    await expect(
      fileField,
      'choosing a file must leave the keyboard where it was, so the next stop is the one after the file field',
    ).toBeFocused();

    /* ---- Stop 3: the submit, now that both choices are in hand ---- */

    await expect(
      submit,
      'with both a setting and a CSV chosen the submit must become available (BR1)',
    ).toBeEnabled();

    const submitAtRest = await focusPaintOf(submit);
    await pressUntilFocused(page, 'Tab', submit);
    await expect(
      submit,
      'the stop after the file field must be the submit control',
    ).toBeFocused();
    const submitFocused = await focusPaintOf(submit);
    expect(submitFocused, FOCUS_INDICATOR_REASON).not.toBe('none');
    expect(submitFocused, FOCUS_INDICATOR_REASON).not.toBe(submitAtRest);

    // Operated with Enter, not a click.
    await page.keyboard.press('Enter');

    /* ---- The slip was actually completed ---- */

    const confirmation = screen.getByRole('alert');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(SUBMISSION_CONFIRMED);

    expect(
      { file: upload.fileName, setting: upload.settingName },
      'the keyboard-only journey must submit the chosen file against the chosen setting — reaching the three stops is only half of AC-4',
    ).toEqual({ file: csv.name, setting: CHOSEN_SETTING.Name });
  });
});
