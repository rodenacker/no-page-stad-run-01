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
 * - AC-1, AC-2, AC-3, AC-5 → this file (`vitest`)
 * - AC-4 (submit a CSV, see the confirmation and the file in the list) and AC-6
 *   (keyboard + axe) → `web/e2e/epic-expense-file-upload-story-2-submit-an-expense-file.spec.ts`
 *   (`playwright`). Deliberately NOT duplicated here.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. `web/src/app/(authenticated)/upload/page.tsx` keeps the `requireSession()` /
 *    `canAccess()` gate it already has (story 1 widened `/upload` to both roles),
 *    and additionally renders the submit surface — `<SubmitExpenseFileForm />` —
 *    ONLY when `hasRole(session, ROLE_IMPORTER)` (`@/lib/auth/roles.ts`).
 *    For any other session the form is LEFT OUT OF THE MARKUP, never rendered
 *    disabled (brief BR4 / source UI-24). The page stays an async server
 *    component callable with no arguments, so a test can `render(await
 *    UploadPage())` exactly as the epic-1 layout tests do.
 * 2. The submit surface is one client component:
 *    `web/src/components/upload/SubmitExpenseFileForm.tsx`, named export
 *    `SubmitExpenseFileForm`, renderable with NO required props (anything story 3
 *    needs to wire — a "the list should re-read itself now" callback, say — must
 *    be optional). It loads the file settings itself through `@/lib/api/client`
 *    (CLAUDE.md §2 — never a bare `fetch()`), so it owns its own loading state.
 * 3. It offers ONLY the settings whose `IsActive` is true. The service returns
 *    active and inactive settings in one list (`GET /v1/file-settings` has no
 *    IsActive filter — see documentation/transactions-api.yaml), so the filter is
 *    the screen's own job (brief §Data Model, FileSetting.IsActive).
 * 4. Controls, and the exact wording these tests query by:
 *    - the setting picker is the Shadcn `select` primitive (Radix — install it
 *      with the pinned CLI; `@radix-ui/react-select` is already a dependency),
 *      labelled `File setting *`. It presents as a `combobox` trigger that opens a
 *      `listbox` of `option`s — NOT a native `<select>`, whose OS-drawn popup the
 *      sibling Playwright spec cannot drive (its AC-6 keyboard walk needs the
 *      options to be real, visible, focusable DOM). Give the trigger the `id` the
 *      `FormLabel`'s `htmlFor` points at, so it is reachable by its label.
 *      Rendering it in jsdom relies on the Radix pointer-capture /
 *      `scrollIntoView` shims added to `web/vitest.setup.ts` for this story.
 *    - the file chooser is `<input type="file">` labelled `CSV file *`.
 *    - there is one submit control, accessible name containing `Upload file`.
 *    - required fields carry the `aria-hidden` asterisk marker plus the single
 *      legend line, as `SignInForm` already does.
 * 5. The CSV check runs IN THE BROWSER on selection, before any request, and says
 *    exactly: `Only CSV files can be uploaded.` — the check is on the file NAME
 *    (brief R5, on `ExpenseFile.CurrentFileName`), not on the browser-reported
 *    content type. Choosing a CSV afterwards clears it (brief R7).
 * 6. The upload itself goes through a dedicated endpoint wrapper
 *    (`web/src/lib/api/files.ts`) built on `apiClient`, because `post()`
 *    JSON-stringifies its body and this call needs `FileSettingId`,
 *    `FileSettingName` and `FileName` as QUERY parameters with the raw file as an
 *    `application/octet-stream` body (brief §Notes & Caveats). These tests never
 *    assert that request shape — they assert what the user sees, plus the one
 *    thing BR3 makes observable: that a refused file produces NO upload request
 *    at all.
 * 7. A refusal must show the SERVICE's own wording. Mind the trap: the
 *    transactions service answers a refused upload with a 500 carrying a
 *    `DefaultResponse` (`Messages[]`) body, and `apiClient`'s 500 branch puts its
 *    own placeholder on `APIError.message` and the service's `Messages[]` on
 *    `APIError.details`. So `serviceMessageOf(error)` alone returns `undefined`
 *    here — the endpoint layer has to read the service's wording out of
 *    `details` (the same gap epic 1 closed for sign-in in
 *    `lib/auth/signInApi.ts`). `Internal Server Error: …` must never reach the
 *    user (project.md NFR-base-5).
 * ---------------------------------------------------------------------------
 *
 * Mocked here, and why:
 * - `@/lib/api/client` — the fixed HTTP convention (testing-policy.md § Mocking
 *   strategy). Both `apiClient` and `get`/`post` are stubbed from ONE responder
 *   keyed on the endpoint path, so the real `lib/api/files.ts` wrapper runs for
 *   real whichever client entry point it chooses.
 * - `@/lib/auth/requireSession` — server-only, reads `next/headers` cookies,
 *   which cannot run in jsdom. Mocking the dependency keeps the page itself real.
 * - `next/navigation` and `next/link` — the client-navigation boundary; libraries,
 *   never the code under test.
 *
 * Response bodies come only from the project-wide factories in
 * `web/src/mocks/data/` — the same modules the Playwright layer imports, so the
 * two layers cannot drift on the file-settings / file-log / upload contracts.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — these imports fail until implemented (TDD red).
import UploadPage from '@/app/(authenticated)/upload/page';
import { SubmitExpenseFileForm } from '@/components/upload/SubmitExpenseFileForm';

// Real production infrastructure (not mocked): the root layout's toast
// composition, which every `(authenticated)` screen sits inside.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';

import { apiClient, get, post } from '@/lib/api/client';
import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';
import { requireSession } from '@/lib/auth/requireSession';
import { TRANSACTIONS_API_BASE_PATH } from '@/lib/utils/constants';

// Project-wide mock data — never a hand-written response body.
import {
  createFileLog,
  fileLogListResponse,
  uploadFailureResponse,
  uploadSuccessResponse,
} from '@/mocks/data/file-log';
import {
  activeFileSettings,
  fileSettingListResponse,
  inactiveFileSetting,
} from '@/mocks/data/file-setting';
import { userInfoFor } from '@/mocks/data/identity';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/mocks/data/role';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

import type { APIError } from '@/types/api';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/lib/auth/requireSession', () => ({ requireSession: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/upload',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/**
 * `next/link` stubbed with the plain anchor it renders in the browser, so the
 * screen keeps its links without an App Router context in jsdom. A library,
 * never the code under test.
 */
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;
const mockGet = get as unknown as ReturnType<typeof vi.fn>;
const mockPost = post as unknown as ReturnType<typeof vi.fn>;
const mockRequireSession = requireSession as unknown as ReturnType<
  typeof vi.fn
>;

/** Endpoint paths from the transactions contract, as the browser addresses them. */
const FILE_SETTINGS_ENDPOINT = '/v1/file-settings';
const FILE_LOGS_ENDPOINT = '/v1/file-logs';
const UPLOAD_ENDPOINT = '/v1/files/upload';

/** The wording these tests query by — see contract note 4. */
const SETTING_PICKER_LABEL = /file setting\s*\*/i;
const CSV_FILE_LABEL = /csv file\s*\*/i;
const SUBMIT_BUTTON_NAME = /upload file/i;

/** The refusal wording brief R2/R7 require, exactly. */
const CSV_ONLY_MESSAGE = 'Only CSV files can be uploaded.';

/** The two active settings the picker must offer, and the one it must not. */
const [MONTHLY_SETTING, TRAVEL_SETTING] = activeFileSettings();
const RETIRED_SETTING = inactiveFileSetting();

/**
 * The file the user picks off their own computer; its name is the one that must be
 * on screen before submission (R6). Deliberately NOT the name of any file already
 * in the list, so an assertion about the chosen file can never be satisfied by a
 * row story 1's list happens to be showing.
 */
const CHOSEN_CSV_NAME = 'expenses_2026-05-31.csv';

/** A CSV as the user picked it off their computer. */
const csvFile = (): File =>
  new File(
    ['Reference,TransactionDate,Amount\nEXP-0001,2026-04-15,1250.00\n'],
    CHOSEN_CSV_NAME,
    { type: 'text/csv' },
  );

/**
 * A file whose NAME does not identify a CSV. Its content type is deliberately a
 * CSV one: brief R5 makes this a check on `CurrentFileName`, so a screen that
 * decided on the browser-reported type instead would wrongly accept this.
 */
const nonCsvFile = (): File =>
  new File(['not a csv at all'], 'expenses_2026-05-31.xlsx', {
    type: 'text/csv',
  });

/**
 * The `APIError` the shared client rejects with when the transactions service
 * refuses an upload: a 500 whose `DefaultResponse` body carries the reason. Note
 * the service's wording lands in `details` while `message` holds the client's own
 * placeholder — that is what `apiClient`'s 500 branch does, and it is the whole
 * point of contract note 7.
 */
const REFUSED_UPLOAD_REASON = uploadFailureResponse(
  'This file setting is not accepting new files at the moment.',
).Messages[0];

const refusedUpload = (): APIError => ({
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  details: [REFUSED_UPLOAD_REASON],
  endpoint: `${TRANSACTIONS_API_BASE_PATH}${UPLOAD_ENDPOINT}`,
});

interface ServiceStub {
  /** How `GET /v1/file-settings` answers. Defaults to the full list. */
  settings?: () => Promise<unknown>;
  /** How `POST /v1/files/upload` answers. Defaults to accepting the file. */
  upload?: () => Promise<unknown>;
}

/**
 * Answers the transactions service on whichever client entry point the endpoint
 * layer reaches for, routing on the endpoint path. One responder for every entry
 * point is what keeps these tests indifferent to whether `lib/api/files.ts` uses
 * `apiClient` or one of the convenience helpers.
 */
const stubTransactionsService = ({ settings, upload }: ServiceStub = {}) => {
  const respond = (endpoint: unknown): Promise<unknown> => {
    const path = String(endpoint);
    if (path.includes(FILE_SETTINGS_ENDPOINT)) {
      return settings ? settings() : Promise.resolve(fileSettingListResponse());
    }
    if (path.includes(UPLOAD_ENDPOINT)) {
      return upload ? upload() : Promise.resolve(uploadSuccessResponse());
    }
    if (path.includes(FILE_LOGS_ENDPOINT)) {
      return Promise.resolve(fileLogListResponse());
    }
    return Promise.reject(
      new Error(`This test stubs no transactions endpoint at "${path}".`),
    );
  };

  mockApiClient.mockImplementation((endpoint: unknown) => respond(endpoint));
  mockGet.mockImplementation((endpoint: unknown) => respond(endpoint));
  mockPost.mockImplementation((endpoint: unknown) => respond(endpoint));
};

/**
 * Every upload request the screen actually issued. BR3 makes this observable:
 * a refused file must never reach the service, so this has to stay empty.
 */
const uploadRequests = (): string[] =>
  [...mockApiClient.mock.calls, ...mockPost.mock.calls]
    .map((call) => String(call[0]))
    .filter((endpoint) => endpoint.includes(UPLOAD_ENDPOINT));

/**
 * The submit form inside the root layout's real toast composition — where this
 * screen always sits in the running app (`src/app/layout.tsx`).
 */
const renderSubmitForm = () =>
  render(
    <ToastProvider>
      <SubmitExpenseFileForm />
      <ToastContainer />
    </ToastProvider>,
  );

/**
 * The whole `/upload` screen as a navigation renders it, for the session of the
 * given role: invoke the async server component once and render what it returned,
 * inside the same toast composition.
 */
const renderUploadPage = async (roleName: string) => {
  mockRequireSession.mockResolvedValue(userInfoFor(roleName));
  return render(
    <ToastProvider>
      {await UploadPage()}
      <ToastContainer />
    </ToastProvider>,
  );
};

/**
 * The picker trigger, once the settings have arrived. `findBy*` because the screen
 * loads them itself (contract note 2).
 */
const settingPicker = () => screen.findByLabelText(SETTING_PICKER_LABEL);

/**
 * Opens the picker and hands back the listbox. The options only exist in the DOM
 * once it is open — that is what a Radix `Select` is, and what lets the Playwright
 * layer walk the same options by keyboard.
 */
const openSettingPicker = async (
  user: ReturnType<typeof userEvent.setup>,
): Promise<HTMLElement> => {
  await user.click(await settingPicker());
  return screen.getByRole('listbox');
};

/** Chooses a named setting the way a user does: open, then pick. */
const chooseSetting = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) => {
  const listbox = await openSettingPicker(user);
  await user.click(within(listbox).getByRole('option', { name }));
};

/** Picks a file off the user's computer. */
const chooseFile = async (
  user: ReturnType<typeof userEvent.setup>,
  file: File,
) => {
  await user.upload(screen.getByLabelText(CSV_FILE_LABEL), file);
};

const submitButton = () =>
  screen.getByRole('button', { name: SUBMIT_BUTTON_NAME });

/**
 * A user session for these tests. `applyAccept: false` is deliberate: an
 * `accept=".csv"` attribute is only a hint to the file picker — a real user can
 * still choose "All files" or drop a file in — which is precisely why the
 * client-side check in brief BR3 has to exist. Letting user-event enforce
 * `accept` would hide the very behaviour AC-3 is about.
 */
const setupUser = () => userEvent.setup({ applyAccept: false });

describe('Epic expense-file-upload, Story 2: Submit an expense file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-1
  it('offers only the active file settings, shows the chosen file name before submission, and allows submitting only once a setting and a CSV file are both chosen', async () => {
    const user = setupUser();
    // The service returns both active settings AND a retired one in one list.
    stubTransactionsService();

    renderSubmitForm();

    // Nothing chosen yet — there is nothing to submit (BR1).
    const picker = await settingPicker();
    expect(submitButton()).toBeDisabled();

    // Only the active settings are offered (brief §Data Model, FileSetting.IsActive).
    const listbox = await openSettingPicker(user);
    expect(
      within(listbox).getByRole('option', { name: MONTHLY_SETTING.Name }),
    ).toBeInTheDocument();
    expect(
      within(listbox).getByRole('option', { name: TRAVEL_SETTING.Name }),
    ).toBeInTheDocument();
    expect(
      within(listbox).queryByRole('option', { name: RETIRED_SETTING.Name }),
    ).not.toBeInTheDocument();

    // A setting on its own is still not enough (BR1 needs all three of setting,
    // file and file name).
    await user.click(
      within(listbox).getByRole('option', { name: TRAVEL_SETTING.Name }),
    );
    expect(picker).toHaveTextContent(TRAVEL_SETTING.Name);
    expect(submitButton()).toBeDisabled();

    await chooseFile(user, csvFile());

    // The chosen file's own name is on screen BEFORE anything is submitted (R6).
    expect(screen.getByText(CHOSEN_CSV_NAME)).toBeVisible();
    expect(submitButton()).toBeEnabled();
  });

  // AC-2
  // Runtime-only: that the gate decides on the server, before any submit markup
  // is ever sent to the browser, is confirmed in the manual checklist.
  it('offers the submit form to an Importer and offers an Approver no submit surface anywhere on the screen', async () => {
    stubTransactionsService();

    const uploaderView = await renderUploadPage(ROLE_IMPORTER);

    expect(await settingPicker()).toBeInTheDocument();
    expect(screen.getByLabelText(CSV_FILE_LABEL)).toBeInTheDocument();
    expect(submitButton()).toBeInTheDocument();

    uploaderView.unmount();

    await renderUploadPage(ROLE_APPROVER);

    // The Approver still gets the screen and the file list (brief R9) — the file
    // list is story 1's; asserted here only so the absences below cannot pass
    // because the whole screen failed to render.
    expect(
      await screen.findByText(createFileLog().CurrentFileName),
    ).toBeVisible();

    // Absent from the markup, not shown disabled (BR4 / UI-24). `hidden: true`
    // still matches aria-hidden and disabled controls, so a greyed-out submit
    // button would fail this.
    expect(
      screen.queryByLabelText(SETTING_PICKER_LABEL),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(CSV_FILE_LABEL)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: SUBMIT_BUTTON_NAME, hidden: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: SUBMIT_BUTTON_NAME, hidden: true }),
    ).not.toBeInTheDocument();
  });

  // AC-3
  it('refuses a file whose name is not a CSV without sending anything to the service, then clears the refusal when a CSV is chosen instead', async () => {
    const user = setupUser();
    stubTransactionsService();

    renderSubmitForm();
    await chooseSetting(user, MONTHLY_SETTING.Name);

    await chooseFile(user, nonCsvFile());

    // Refused in place, in the app's own words (R2/R7), on selection.
    expect(await screen.findByText(CSV_ONLY_MESSAGE)).toBeVisible();
    // Nothing reached the service — the check ran in the browser first (BR3/R4).
    expect(uploadRequests()).toEqual([]);
    expect(submitButton()).toBeDisabled();

    // Choosing a CSV instead clears the refusal and allows submitting (R7).
    await chooseFile(user, csvFile());

    expect(screen.queryByText(CSV_ONLY_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByText(CHOSEN_CSV_NAME)).toBeVisible();
    expect(submitButton()).toBeEnabled();
  });

  // AC-5
  // Data-contract: full chain verified during manual checklist.
  it("shows the service's own reason when it refuses the submission, and keeps the chosen setting and file so the user can submit again", async () => {
    const user = setupUser();
    stubTransactionsService({ upload: () => Promise.reject(refusedUpload()) });

    renderSubmitForm();
    const picker = await settingPicker();
    await chooseSetting(user, MONTHLY_SETTING.Name);
    await chooseFile(user, csvFile());
    await user.click(submitButton());

    // The service's wording, not the client's internal placeholder.
    expect(await screen.findByText(REFUSED_UPLOAD_REASON)).toBeVisible();
    expect(
      screen.queryByText(CLIENT_FALLBACK_MESSAGES.serverError),
    ).not.toBeInTheDocument();

    // Both choices survive the refusal, so submitting again needs no re-entry.
    expect(picker).toHaveTextContent(MONTHLY_SETTING.Name);
    expect(screen.getByText(CHOSEN_CSV_NAME)).toBeVisible();
    expect(submitButton()).toBeEnabled();
  });
});
