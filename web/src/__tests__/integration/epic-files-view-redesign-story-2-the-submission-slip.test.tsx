/**
 * Story Metadata:
 * - Epic: files-view-redesign — Story 2: the submission slip
 * - Route: /upload
 * - Target File: web/src/components/upload/SubmitExpenseFileForm.tsx
 * - Page Action: modify_existing
 * - Requirements: R13, R1, R4, R6, R7, R9, R23, BR1, BR2, BR6, BR7, BR9
 *
 * Covers the criteria tagged `vitest`:
 * - AC-2 — submit stays unavailable until a setting AND a CSV are both chosen, and a
 *   file that is not a CSV is still refused in place, on its own NAME, in the same
 *   words, with the refused file named on screen.
 * - AC-3 — a successful submission still reports what was sent in the same words, and
 *   the register below still picks the new file up.
 * - AC-5 — an Approver's screen carries no submit form at all: absent from the page,
 *   not present and unavailable.
 *
 * AC-4 (the whole slip completable by keyboard alone, each control showing where the
 * focus is) is this story's Playwright spec — deliberately not duplicated here
 * (testing-policy.md § "One tag, one layer"): a visible focus indicator is a
 * real-browser judgement.
 *
 * AC-1 (underlined fields with small capitalised labels — no input boxes, no card, no
 * boxed submit in a panel) is tagged `none`: typographic judgement only a human can
 * make, and it is already on this story's manual checklist. Nothing below asserts a
 * class string, a computed style or a font-family — faking that coverage that way is
 * explicitly forbidden by this epic's coverage contract.
 *
 * ---------------------------------------------------------------------------
 * THIS IS A PRESENTATION-ONLY REDESIGN — EVERY BEHAVIOUR HERE ALREADY SHIPPED
 * ---------------------------------------------------------------------------
 * Nothing in this file is a new capability. Every assertion below re-states a
 * behaviour `expense-file-upload` (R1/R2/R4/R5/R6/R7/BR1/BR3/BR4) already built and
 * that this epic's R1/BR2 require to survive the restyle untouched. So this file is a
 * REGRESSION FENCE around the redraw: per BR1, DOM structure, class names, layout and
 * composition are free to change, and none of the assertions below may be loosened to
 * accommodate the new markup. Where the sibling suite
 * (`epic-expense-file-upload-story-2-submit-an-expense-file`) already pins one of
 * these behaviours, the assertions here are deliberately at least as strong.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE SLIP KEEPS ITS ACCESSIBLE NAMING (R4, R13). The setting selector is still
 *    reachable by a visible label whose words contain "File setting", the file field by
 *    one containing "CSV file", and the submit control still has an accessible name
 *    containing "Upload file". These are matched case-insensitively and WITHOUT the
 *    required-field asterisk, because the design's capitals are `text-transform` from
 *    the shared `FIELD_LABEL_CLASS` — never a rewritten label. Do not get the look by
 *    changing the words: the wording a screen reader is given must still read as words,
 *    and `fieldNotation.ts` says exactly that in its own header.
 * 2. IT STAYS A REAL `<input type="file">`, still associated with its label — an
 *    underline-only treatment must not become a div with a click handler, or AC-4's
 *    keyboard walk has nothing to reach. `getByLabelText` below is what pins that
 *    association; a styled `<div>` fails it.
 * 3. SUBMIT IS UNAVAILABLE UNTIL BOTH CHOICES ARE IN HAND (R13, `expense-file-upload`
 *    BR1). A setting alone is not enough, and a file whose NAME is not a CSV is not
 *    enough.
 * 4. THE CSV RULE IS STILL A CHECK ON THE FILE'S NAME, RUN IN THE BROWSER ON SELECTION
 *    (`expense-file-upload` R5/BR3). AC-2's fixture is deliberately a file NAMED
 *    `.xlsx` whose browser-reported content type IS `text/csv`, so a screen that
 *    decided on the content type instead would wrongly accept it. The refusal wording
 *    is unchanged — `Only CSV files can be uploaded.`
 *    (`lib/validation/schemas.ts`'s `CSV_ONLY_MESSAGE`, quoted literally here rather
 *    than imported, so re-wording the constant cannot quietly re-word the
 *    requirement) — and the refused file's OWN name stays on screen beside it, so the
 *    reader can see WHICH file was refused. Choosing a CSV afterwards withdraws the
 *    refusal (R7).
 * 5. THE OUTCOME IS STILL SAID IN THE PAGE, AS ONE ANNOUNCEABLE `role="alert"` — not a
 *    toast, and not a message that replaces the slip — and still in the same words: the
 *    title `File submitted`, then `<file> was uploaded against the <setting> setting.`
 *    That report is where R13's "record-count-shaped feedback" gets restyled; what it
 *    SAYS may not change.
 * 6. THE REGISTER BELOW STILL PICKS THE NEW FILE UP. The upload's answer carries no
 *    file identifier, so the file can only appear through a RE-READ of the active file
 *    list, and the connection between the two independent client components stays
 *    `lib/files/fileSubmissions.ts` (`announceFileSubmitted` /
 *    `subscribeToFileSubmissions`), reused untouched — not rebuilt, and not replaced by
 *    the form reaching into the list. AC-3's service stub answers `GET /v1/file-logs`
 *    differently once the upload has been accepted, so the new row can only appear if
 *    that re-read really happened; and the assertion is scoped INSIDE the register, so
 *    the confirmation naming the same file cannot satisfy it.
 * 7. HIDDEN, NEVER DISABLED (R6/R23/BR7, source UI-24). For a session without the
 *    Importer role the slip is left out of the markup altogether. AC-5's negative
 *    queries pass `{ hidden: true }`, so a present-but-`aria-hidden`,
 *    present-but-`display:none` or present-but-disabled submit fails exactly as a
 *    working one would. The decision stays the server-side one the page already makes
 *    (`hasRole(session, ROLE_IMPORTER)`); the form itself carries no role check.
 * 8. This story restyles the SLIP. It adds no endpoint and changes no request shape:
 *    `lib/files/{fileSubmissions,parseSubmittedFileCsv}.ts`, `lib/api/files.ts` and
 *    `lib/auth/identity.ts`'s `actingUploaderIn` are reused as they are.
 *
 * Mocked here, and why:
 * - `@/lib/api/client` — the fixed HTTP convention (testing-policy.md § Mocking
 *   strategy). `apiClient` and `get`/`post` are answered from ONE responder keyed on
 *   the endpoint path, so the real `lib/api/files.ts` wrapper runs for real whichever
 *   client entry point it reaches for.
 * - `@/lib/auth/requireSession` — server-only, reads `next/headers` cookies, which
 *   cannot run in jsdom. Mocking the dependency keeps the page itself real.
 * - `next/navigation` and `next/link` — libraries at the client-navigation boundary,
 *   never the code under test.
 * The real slip, the real register, the real toast composition, the real validation
 * schema and the real submission announcement all run.
 *
 * Every response body and every identity comes from the project-wide factories in
 * `@/mocks/data/*`, which the Playwright layer imports too — so the two layers cannot
 * drift onto different data.
 *
 * Runtime-only, deliberately NOT here: the underline notation itself, the absence of
 * boxes and card, the tracked capitals, the mono figures, and the focus indicator on an
 * underline-only field. jsdom can see none of them — they belong to this epic's axe
 * scan, this story's Playwright spec and the manual checklist.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test.
import UploadPage from '@/app/(authenticated)/upload/page';
import { SubmitExpenseFileForm } from '@/components/upload/SubmitExpenseFileForm';

// Real production infrastructure (not mocked): the root layout's toast composition,
// which every `(authenticated)` screen sits inside.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';

import { apiClient, get, post } from '@/lib/api/client';
import { requireSession } from '@/lib/auth/requireSession';

// Project-wide mock data — never a hand-written response body.
import {
  FILE_STATUS_UPLOADED,
  createFileLog,
  fileLogListResponse,
  fileLogWithStatus,
  uploadSuccessResponse,
} from '@/mocks/data/file-log';
import {
  activeFileSettings,
  fileSettingListResponse,
} from '@/mocks/data/file-setting';
import { userInfoFor } from '@/mocks/data/identity';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/mocks/data/role';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

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
 * `next/link` stubbed with the plain anchor it renders in the browser, so the screen
 * keeps its links without an App Router context in jsdom. A library, never the code
 * under test.
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

/**
 * The wording these tests reach the slip by — contract note 1. Case-insensitive and
 * asterisk-free on purpose: the design's capitals are CSS, so the words themselves are
 * unchanged, and a required marker is free to move.
 */
const SETTING_FIELD_LABEL = /file setting/i;
const CSV_FIELD_LABEL = /csv file/i;
const SUBMIT_CONTROL_NAME = /upload file/i;

/** The refusal wording, unchanged (contract note 4). */
const CSV_ONLY_MESSAGE = 'Only CSV files can be uploaded.';

/** The confirmation's own title, unchanged (contract note 5). */
const CONFIRMATION_TITLE = 'File submitted';

/** The two active settings the picker offers; each is asserted by its NAME. */
const [MONTHLY_SETTING, TRAVEL_SETTING] = activeFileSettings();

/**
 * The file the Importer picks off their own computer. Deliberately NOT the name of any
 * file already on the register, so "the register picked the new file up" can never be
 * satisfied by a row that was there all along.
 */
const CHOSEN_CSV_NAME = 'expenses_2026-05-31.csv';

/** A file NAMED as a CSV, as the user picked it. */
const csvFile = (): File =>
  new File(
    ['Reference,TransactionDate,Amount\nEXP-0001,2026-04-15,1250.00\n'],
    CHOSEN_CSV_NAME,
    { type: 'text/csv' },
  );

const NON_CSV_NAME = 'expenses_2026-05-31.xlsx';

/**
 * A file whose NAME does not identify a CSV, while its browser-reported content type
 * deliberately IS a CSV one — contract note 4. A screen that checked the type instead
 * of the name would wrongly accept this.
 */
const nonCsvFile = (): File =>
  new File(['not a csv at all'], NON_CSV_NAME, { type: 'text/csv' });

/** The file already on the register before anything is submitted. */
const ALREADY_LISTED = createFileLog();

/**
 * The file the Importer submits below, as the service lists it on the NEXT read of the
 * active file list — its own id, and the `Uploaded` status a just-submitted file has.
 */
const NEWLY_SUBMITTED = fileLogWithStatus(FILE_STATUS_UPLOADED, {
  Id: 5002,
  CurrentFileName: CHOSEN_CSV_NAME,
  SettingName: MONTHLY_SETTING.Name,
  ProcessDate: '2026-05-31 08:12:00',
});

/**
 * Whether the service has accepted an upload yet. This is what makes the register's
 * re-read observable: the file list answers with one row before the submission and two
 * after it, so the new row can only appear if the list really asked again (contract
 * note 6).
 */
let uploadAccepted = false;

/**
 * Answers the transactions service on whichever client entry point the endpoint layer
 * reaches for, routing on the endpoint path — so these tests stay indifferent to
 * whether `lib/api/files.ts` uses `apiClient` or one of the convenience helpers.
 */
const stubTransactionsService = (): void => {
  const respond = (endpoint: unknown): Promise<unknown> => {
    const path = String(endpoint);

    if (path.includes(FILE_SETTINGS_ENDPOINT)) {
      return Promise.resolve(fileSettingListResponse());
    }
    if (path.includes(UPLOAD_ENDPOINT)) {
      uploadAccepted = true;
      return Promise.resolve(uploadSuccessResponse());
    }
    if (path.includes(FILE_LOGS_ENDPOINT)) {
      return Promise.resolve(
        fileLogListResponse(
          uploadAccepted ? [ALREADY_LISTED, NEWLY_SUBMITTED] : [ALREADY_LISTED],
        ),
      );
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
 * The slip inside the root layout's real toast composition — where this screen always
 * sits in the running app (`src/app/layout.tsx`).
 */
const renderSubmitForm = () =>
  render(
    <ToastProvider>
      <SubmitExpenseFileForm />
      <ToastContainer />
    </ToastProvider>,
  );

/**
 * The whole `/upload` screen as a navigation renders it, for a session of the given
 * role: invoke the async server component once and render what it returned, inside the
 * same toast composition.
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
 * The setting selector, once the named settings have arrived — the slip reads them
 * itself, so this is a `findBy*`.
 */
const settingSelector = () => screen.findByLabelText(SETTING_FIELD_LABEL);

/** Chooses a named setting the way a user does: open the list, then pick by name. */
const chooseSetting = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
): Promise<void> => {
  await user.click(await settingSelector());
  const listbox = screen.getByRole('listbox');
  await user.click(within(listbox).getByRole('option', { name }));
};

/** Picks a file off the user's computer, through the real file field. */
const chooseFile = async (
  user: ReturnType<typeof userEvent.setup>,
  file: File,
): Promise<void> => {
  await user.upload(screen.getByLabelText(CSV_FIELD_LABEL), file);
};

const submitControl = () =>
  screen.getByRole('button', { name: SUBMIT_CONTROL_NAME });

/** The register below the slip, once it has answered. */
const register = () => screen.findByRole('table');

/**
 * A user session for these tests. `applyAccept: false` is deliberate: `accept=".csv"`
 * is only a hint to the file chooser — a real user can still choose "All files" — which
 * is precisely why the browser-side name check has to exist. Letting user-event enforce
 * `accept` would hide the very behaviour AC-2 is about.
 */
const setupUser = () => userEvent.setup({ applyAccept: false });

describe('Epic files-view-redesign, Story 2: the submission slip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadAccepted = false;
  });

  // AC-2
  it('keeps submit unavailable until both a setting and a CSV are chosen, and still refuses a file that is not a CSV on its own name, in the same words, naming the file', async () => {
    const user = setupUser();
    stubTransactionsService();

    renderSubmitForm();

    // Nothing chosen yet — there is nothing to submit.
    const selector = await settingSelector();
    expect(submitControl()).toBeDisabled();

    // A setting on its own is still not enough. The chosen setting is asserted by its
    // own NAME, so this cannot pass on a lone default.
    await chooseSetting(user, TRAVEL_SETTING.Name);
    expect(selector).toHaveTextContent(TRAVEL_SETTING.Name);
    expect(submitControl()).toBeDisabled();

    // A file whose NAME is not a CSV is refused in place, on selection, in the same
    // words — even though its content type says `text/csv`.
    await chooseFile(user, nonCsvFile());

    expect(await screen.findByText(CSV_ONLY_MESSAGE)).toBeVisible();
    // The refusal names the file it is about, so the reader knows which one it was.
    expect(screen.getByText(NON_CSV_NAME)).toBeVisible();
    expect(submitControl()).toBeDisabled();
    // And nothing was sent: no submission is reported.
    expect(screen.queryByText(CONFIRMATION_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByText(/was uploaded against/i)).not.toBeInTheDocument();

    // Choosing a CSV instead withdraws the refusal and completes the slip.
    await chooseFile(user, csvFile());

    expect(screen.queryByText(CSV_ONLY_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByText(CHOSEN_CSV_NAME)).toBeVisible();
    expect(submitControl()).toBeEnabled();
  });

  // AC-3
  it('still reports a successful submission in the same words, and the register below still picks the new file up', async () => {
    const user = setupUser();
    stubTransactionsService();

    await renderUploadPage(ROLE_IMPORTER);

    // The register is showing what was already submitted, and the slip is on the
    // Importer's screen (the presence half of AC-5's absence).
    expect(
      within(await register()).getByText(ALREADY_LISTED.CurrentFileName),
    ).toBeVisible();
    expect(
      within(await register()).queryByText(CHOSEN_CSV_NAME),
    ).not.toBeInTheDocument();

    await chooseSetting(user, MONTHLY_SETTING.Name);
    await chooseFile(user, csvFile());
    await user.click(submitControl());

    // The outcome is said in the page, as one announceable report, in the same words:
    // what was sent, and what it was sent against.
    const report = await screen.findByRole('alert');
    expect(report).toHaveTextContent(CONFIRMATION_TITLE);
    expect(report).toHaveTextContent(
      `${CHOSEN_CSV_NAME} was uploaded against the ${MONTHLY_SETTING.Name} setting.`,
    );

    // And the register below picked the file up — asserted INSIDE the register, so the
    // report naming the same file cannot satisfy it — without dropping the row it
    // already had.
    await waitFor(async () => {
      expect(within(await register()).getByText(CHOSEN_CSV_NAME)).toBeVisible();
    });
    expect(
      within(await register()).getByText(ALREADY_LISTED.CurrentFileName),
    ).toBeVisible();
  });

  // AC-5
  it("carries no submit form at all on an Approver's screen — absent from the page, not present and unavailable", async () => {
    stubTransactionsService();

    await renderUploadPage(ROLE_APPROVER);

    // The Approver still gets the screen and the register (R23) — asserted first so the
    // absences below cannot pass because the whole screen failed to render.
    expect(
      within(await register()).getByText(ALREADY_LISTED.CurrentFileName),
    ).toBeVisible();

    // The slip is absent from the markup, not shown unavailable (R6/BR7, source
    // UI-24). `hidden: true` still matches an `aria-hidden`, `display:none` or disabled
    // control, so a greyed-out submit fails exactly as a working one would.
    expect(
      screen.queryByLabelText(SETTING_FIELD_LABEL),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(CSV_FIELD_LABEL)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: SUBMIT_CONTROL_NAME,
        hidden: true,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: SUBMIT_CONTROL_NAME, hidden: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/submit an expense file/i),
    ).not.toBeInTheDocument();
  });
});
