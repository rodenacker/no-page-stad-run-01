/**
 * Story Metadata:
 * - Epic: file-validation-and-retry — Rejected rows, retry and cancel
 * - Story: 3 — Download the original file and the error file
 * - Route: /upload/file
 * - Target File: web/src/app/(authenticated)/upload/file/page.tsx
 * - Page Action: modify_existing
 * - Requirements: FR6, FR7
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-3, AC-4, AC-5 → this file (`vitest`)
 * - AC-1 and AC-2 (choosing a download actually DELIVERS the file to the user) →
 *   `web/e2e/epic-file-validation-and-retry-story-3-download-the-original-and-error-files.spec.ts`
 *   (`playwright`). A real download needs a real browser; deliberately NOT
 *   duplicated here. That spec also signs in as EACH role, so per-role coverage of
 *   both downloads exists end-to-end — see note 9 below.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. TWO DOWNLOADS, TWO DIFFERENT ENDPOINTS — this is the whole point of the
 *    story, and transposing them is the mistake that would ship silently:
 *      - the file AS ORIGINALLY SUBMITTED →
 *        `GET /transactions-api/v1/files/download?FileLogId=<id>`  (`FilesDownload`)
 *      - the GENERATED ERROR FILE →
 *        `GET /transactions-api/v1/files/bulk-errors/download?FileLogId=<id>`
 *        (`FilesBulkErrorsDownload`)
 *    The spec publishes a THIRD, similarly-shaped operation keyed on the same file —
 *    `GET /transactions-api/v1/file-logs/data?LogId=<id>` (`FileLogDataDownload`) —
 *    and the source contract flags the trio as a known ambiguity (epic
 *    `unverifiedAssumptions` #3). The requirements resolve it via the §6.10 mapping
 *    above: this epic uses NEITHER download from `file-logs/data`. The AC-3 test
 *    asserts each action asks its own endpoint, for its own file id, and asks
 *    neither of the other two.
 * 2. Both endpoints belong in `web/src/lib/api/files.ts` (the module says so in its
 *    own header), built on the shared client at the app's OWN same-origin address —
 *    `${TRANSACTIONS_API_BASE_PATH}/v1/...` — so the `session` cookie travels by
 *    itself (CLAUDE.md §2; never a service URL in browser code, never a bare
 *    `fetch()`). Both stream `application/octet-stream`, so the call asks the client
 *    for the binary body (`isBinaryResponse`) rather than JSON.
 * 3. The two controls are one client component:
 *    `web/src/components/files/FileDownloadActions.tsx`, named export
 *    `FileDownloadActions`, taking the resolved file: `{ file: FileLog }`. It takes
 *    NO session and NO role prop — see note 9.
 * 4. The accessible names these tests query by, and the element kind:
 *      - original file → a BUTTON named `Download original file`
 *      - error file    → a BUTTON named `Download error file`
 *    Both must be buttons that request through the client, NOT an `<a href>`
 *    pointing at the service: a plain link would drop the user onto a raw error
 *    response when the service refuses, which project.md NFR-base-5 forbids. The
 *    AC-5 test fails on any element whose `href` addresses `/transactions-api/...`.
 * 5. The error-file control is GATED on the file's `HasBulkErrorFile`, which is the
 *    STRING `'Yes'` / `'No'` on the wire — not a boolean, so `if
 *    (file.HasBulkErrorFile)` is true for `'No'` too. When there is no error file
 *    the control is LEFT OUT of the markup, never rendered disabled (source UI-24,
 *    the same rule as every other conditional action in this app).
 * 5b. NEITHER CONTROL IS DISABLED while its own file is on its way (the announced-wait,
 *    keyboard-focus convention this epic applies everywhere: disabling the control a
 *    keyboard user just activated takes the focus out from under them). Which is exactly
 *    why EACH DOWNLOAD KEEPS ITS OWN WAIT AND ITS OWN REFUSAL — with both controls
 *    usable, both files can be on their way at once, and one shared state would let
 *    whichever answered first clear the other's announced wait or overwrite the other's
 *    refusal. An in-flight guard that made the second control silently do nothing is NOT
 *    the answer; the state is per download. Each download's wait and refusal name the
 *    file they are about, so a reader meeting one knows which download it belongs to.
 * 6. A refused download shows the SERVICE's own wording, in an `alert` (the error
 *    toast this app already uses is one, so is the Shadcn `alert`). Mind the trap:
 *    the transactions service reports a refusal as a 500 carrying a
 *    `DefaultResponse` (`Messages[]`) body, and `apiClient`'s 500 branch puts its
 *    OWN placeholder on `APIError.message` and the service's `Messages[]` on
 *    `APIError.details` — so `serviceMessageOf(error)` alone finds NOTHING here.
 *    Use `serviceMessageOf(e) ?? serviceDetailOf(e) ?? <own wording>`
 *    (`lib/api/errors.ts`); `uploadFailureMessage` in `lib/api/files.ts` is the
 *    pattern to copy. `Internal Server Error: …` must never reach the user, and the
 *    action must still be there to try again (NFR-base-5).
 * 7. CROSS-STORY: the exact label `Try again` is RESERVED by story 1 for the action
 *    that re-reads a file's processing history (its test matches `/^try again$/i`).
 *    A recovery affordance on a failed DOWNLOAD must therefore not carry that exact
 *    label — the download buttons of note 4 staying usable is what satisfies
 *    NFR-base-5 here, and any extra recovery control needs its own wording.
 * 8. CROSS-STORY: the page itself belongs to STORY 1 and stays an ASYNC SERVER
 *    component (`requireSession()` + `canAccess()` + `<PermissionDeniedMessage />`
 *    before anything renders, per the epic's Infrastructure & reuse notes and source
 *    UI-24). jsdom cannot render one, so NOTHING in this file imports the page:
 *    these tests drive the client boundary the page hands down to —
 *    `@/components/files/SubmittedFileDetail`, prop `{ logId: string | undefined }`,
 *    which resolves the file and is where this story's actions are composed in.
 *    That is also the wiring assertion: building `FileDownloadActions` and
 *    forgetting to place it on the file's surface fails AC-4.
 * 9. NEITHER download is role-gated, and the way that is guaranteed is STRUCTURAL:
 *    the epic brief's access-control table grants both downloads to the Finance
 *    Uploader (the auth service's `Importer`) AND the Approver, so neither
 *    `SubmittedFileDetail` nor `FileDownloadActions` takes a session or a role prop
 *    and there is nothing on this surface that can differ per role. Do NOT copy the
 *    `hasRole(session, ROLE_IMPORTER) && …` shape that stories 4 and 5 need for
 *    retry and cancel, and do not add a role prop to make it. Both roles are
 *    exercised end-to-end in the sibling Playwright spec.
 * ---------------------------------------------------------------------------
 *
 * Mocked here, and why:
 * - `@/lib/api/client` — the fixed HTTP convention (testing-policy.md § Mocking
 *   strategy). Both `apiClient` and `get` are stubbed from ONE responder keyed on
 *   the endpoint path, so the real `lib/api/files.ts` wrapper runs for real
 *   whichever client entry point it chooses.
 * - `next/navigation` and `next/link` — the client-navigation boundary; libraries,
 *   never the code under test.
 * Nothing else is mocked: with the page left to story 1 (note 8) there is no
 * server-only module in play here, so no session plumbing needs standing in.
 *
 * Response bodies come only from the project-wide factories in
 * `web/src/mocks/data/` — the same modules the Playwright layer imports, so the two
 * layers cannot drift on the file-log / process-log / validation-error contracts.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — these imports fail until implemented (TDD red).
import { FileDownloadActions } from '@/components/files/FileDownloadActions';
import { SubmittedFileDetail } from '@/components/files/SubmittedFileDetail';

// Real production infrastructure (not mocked): the root layout's toast
// composition, which every `(authenticated)` screen sits inside.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';

import { apiClient, get } from '@/lib/api/client';
import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';
import { TRANSACTIONS_API_BASE_PATH } from '@/lib/utils/constants';

// Project-wide mock data — never a hand-written response body.
import {
  FILE_STATUS_IMPORTED,
  FILE_STATUS_VALIDATION_FAILED,
  fileLogListResponse,
  fileLogWithStatus,
  uploadFailureResponse,
} from '@/mocks/data/file-log';
import { fileProcessLogListResponse } from '@/mocks/data/file-process-log';
import { validationErrorsResponse } from '@/mocks/data/validation-error';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

import type { APIError } from '@/types/api';
import type { FileLog } from '@/types/files';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/upload/file',
  // The identifier the file surface is rendered for, so it resolves the same file
  // whether it reads the address itself or takes the `logId` prop of note 8.
  useSearchParams: () => new URLSearchParams({ LogId: String(FAILED_FILE.Id) }),
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

/**
 * Blob URLs, which jsdom does not implement at all.
 *
 * Handing a downloaded file to the user means turning the bytes the service streamed
 * into something the browser can save, and `URL.createObjectURL` is how that is done
 * — it simply does not exist in jsdom, so the call would throw for reasons that have
 * nothing to do with the story. These are honest stand-ins for a browser API jsdom
 * lacks (the same treatment `vitest.setup.ts` gives `matchMedia` and pointer
 * capture), and NOTHING below asserts on them: whether the bytes actually reach the
 * user's disk is a real-browser question, which is why AC-1/AC-2 are Playwright's.
 */
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = (): string => 'blob:downloaded-file';
  URL.revokeObjectURL = (): void => {};
}

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;
const mockGet = get as unknown as ReturnType<typeof vi.fn>;

/**
 * The transactions endpoints, as the browser addresses them — the app's own
 * same-origin mount point, never a service URL (contract note 2).
 */
const FILE_LOGS_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/file-logs`;
const FILE_PROCESS_LOGS_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/file-process-logs`;
const VALIDATION_ERRORS_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/files/validation-errors`;

/** The file exactly as it was submitted (`FilesDownload`) — FR6. */
const ORIGINAL_DOWNLOAD_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/files/download`;

/** The error file the service generated (`FilesBulkErrorsDownload`) — FR7. */
const ERROR_FILE_DOWNLOAD_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/files/bulk-errors/download`;

/**
 * The THIRD, similarly-shaped operation (`FileLogDataDownload`). No requirement in
 * this epic maps to it (contract note 1) — it is listed here only so a request to it
 * is recognised and fails the test rather than passing unnoticed.
 */
const FILE_LOG_DATA_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/file-logs/data`;

/** The accessible names of the two controls (contract note 4). */
const ORIGINAL_DOWNLOAD_NAME = /download original file/i;
const ERROR_FILE_DOWNLOAD_NAME = /download error file/i;

/**
 * A file that failed validation: `HasBulkErrorFile: 'Yes'` and a `BulkErrorFile`
 * name, straight from the shared factory — so BOTH downloads are offered on it.
 */
const FAILED_FILE = fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED);

/**
 * A file that imported cleanly: `HasBulkErrorFile: 'No'`, so there is no error file
 * to download. Its own id and name, so a request made for the failed file can never
 * be mistaken for one made for this one.
 */
const IMPORTED_FILE = fileLogWithStatus(FILE_STATUS_IMPORTED, {
  Id: 5002,
  CurrentFileName: 'expenses_2026-04-22.csv',
});

/**
 * The bytes a download streams. Deliberately NOT a shared factory: the two download
 * endpoints answer `application/octet-stream`, so what comes back is an opaque
 * body with no contract shape for the two test layers to drift on — unlike every
 * JSON body above, which comes from `web/src/mocks/data/`.
 */
const downloadedBytes = (): Blob =>
  new Blob(['Reference,Amount\nEXP-0001,1250.00\n'], {
    type: 'application/octet-stream',
  });

/**
 * A download the service has NOT answered yet, plus the way to answer it — so a test can
 * hold one download in flight while the other resolves, which is the only way to see
 * whether the two interfere with each other.
 */
const downloadStillOnItsWay = (): {
  body: Promise<Blob>;
  arrive: (contents: Blob) => void;
} => {
  let arrive: ((contents: Blob) => void) | undefined;
  const body = new Promise<Blob>((resolve) => {
    arrive = resolve;
  });
  if (arrive === undefined) {
    throw new Error(
      'A Promise executor runs synchronously, so this cannot happen — but the ' +
        'compiler cannot know that.',
    );
  }
  return { body, arrive };
};

/**
 * The wording the SERVICE itself gives for a refused download — sourced from the
 * shared `DefaultResponse` refusal envelope every file endpoint answers with, and
 * phrased as only a backend would phrase it so a test can tell it apart from wording
 * the screen wrote for itself.
 */
const REFUSED_DOWNLOAD_REASON = uploadFailureResponse(
  'The stored file could not be read from the import share.',
).Messages[0];

/**
 * The `APIError` the shared client rejects with when the service refuses a download:
 * a 500 whose `DefaultResponse` body carries the reason. Note the service's wording
 * lands in `details` while `message` holds the client's own placeholder — that is
 * what `apiClient`'s 500 branch does, and it is the whole point of contract note 6.
 */
const refusedDownload = (endpoint: string): APIError => ({
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  details: [REFUSED_DOWNLOAD_REASON],
  endpoint,
});

interface ServiceStub {
  /** How `GET /v1/files/download` answers. Defaults to delivering the file. */
  originalDownload?: () => Promise<unknown>;
  /** How `GET /v1/files/bulk-errors/download` answers. Defaults to delivering it. */
  errorFileDownload?: () => Promise<unknown>;
}

/**
 * Answers the transactions service on whichever client entry point the endpoint
 * layer reaches for, routing on the endpoint path. One responder for every entry
 * point is what keeps these tests indifferent to whether `lib/api/files.ts` uses
 * `apiClient` or one of the convenience helpers.
 *
 * The reads belonging to the file surface's OTHER sections (its processing history
 * from story 1, its invalid rows from story 2) are answered from their own shared
 * factories, so a surface assembled from all three does not sit in an unrelated
 * failure state while this story's actions are exercised.
 *
 * `FileLogDataDownload` is refused deliberately and FIRST: it is the ambiguous third
 * operation this epic maps nothing to (contract note 1), and answering it as if it
 * were the file list would let a transposed call sail through.
 */
const stubTransactionsService = ({
  originalDownload,
  errorFileDownload,
}: ServiceStub = {}) => {
  const respond = (endpoint: unknown): Promise<unknown> => {
    const path = String(endpoint);
    if (path.startsWith(FILE_LOG_DATA_ENDPOINT)) {
      return Promise.reject(
        new Error(
          `No requirement in this epic maps to FileLogDataDownload ("${path}") — ` +
            'the original file comes from /v1/files/download and the error file ' +
            'from /v1/files/bulk-errors/download.',
        ),
      );
    }
    if (path.startsWith(ERROR_FILE_DOWNLOAD_ENDPOINT)) {
      return errorFileDownload
        ? errorFileDownload()
        : Promise.resolve(downloadedBytes());
    }
    if (path.startsWith(ORIGINAL_DOWNLOAD_ENDPOINT)) {
      return originalDownload
        ? originalDownload()
        : Promise.resolve(downloadedBytes());
    }
    if (path.startsWith(VALIDATION_ERRORS_ENDPOINT)) {
      return Promise.resolve(validationErrorsResponse());
    }
    if (path.startsWith(FILE_PROCESS_LOGS_ENDPOINT)) {
      return Promise.resolve(fileProcessLogListResponse());
    }
    if (path.startsWith(FILE_LOGS_ENDPOINT)) {
      return Promise.resolve(fileLogListResponse([FAILED_FILE, IMPORTED_FILE]));
    }
    return Promise.reject(
      new Error(`This test stubs no transactions endpoint at "${path}".`),
    );
  };

  mockApiClient.mockImplementation((endpoint: unknown) => respond(endpoint));
  mockGet.mockImplementation((endpoint: unknown) => respond(endpoint));
};

/** Query parameters, whether they travelled in `apiClient`'s config or `get`'s. */
const paramsOf = (config: unknown): Record<string, unknown> => {
  if (typeof config !== 'object' || config === null) {
    return {};
  }
  const record = config as Record<string, unknown>;
  const nested = record.params;
  if (typeof nested === 'object' && nested !== null) {
    return nested as Record<string, unknown>;
  }
  return record;
};

/** The file the request was made for — from the query string or the parameters. */
const fileLogIdOf = (path: string, config: unknown): string => {
  const inPath = new URLSearchParams(path.split('?')[1] ?? '').get('FileLogId');
  if (inPath !== null) {
    return inPath;
  }
  const value = paramsOf(config).FileLogId;
  return value === undefined ? '' : String(value);
};

/**
 * Which download the screen asked the service for, and for which file — one entry
 * per distinct request, as `<endpoint>?FileLogId=<id>`.
 *
 * Deduplicated, and only the three download operations are reported, so this states
 * exactly what FR6/FR7 pin: which endpoint each action addresses. It deliberately
 * says nothing about how MANY times a request was made.
 */
const downloadsAsked = (): string[] => {
  const asked = [...mockApiClient.mock.calls, ...mockGet.mock.calls]
    .map((call) => ({ path: String(call[0]), config: call[1] }))
    .filter(({ path }) =>
      [
        ORIGINAL_DOWNLOAD_ENDPOINT,
        ERROR_FILE_DOWNLOAD_ENDPOINT,
        FILE_LOG_DATA_ENDPOINT,
      ].some((endpoint) => path.startsWith(endpoint)),
    )
    .map(
      ({ path, config }) =>
        `${path.split('?')[0]}?FileLogId=${fileLogIdOf(path, config)}`,
    );
  return [...new Set(asked)];
};

/** How the request for one file's download reads in the assertions below. */
const downloadOf = (endpoint: string, file: FileLog): string =>
  `${endpoint}?FileLogId=${file.Id}`;

/** Forgets the requests made so far, keeping the stubbed responses in place. */
const clearRecordedRequests = () => {
  mockApiClient.mockClear();
  mockGet.mockClear();
};

/**
 * Any control that addresses the service DIRECTLY. Must always be empty: a link
 * straight to a download endpoint is what would drop the user onto a raw error
 * response when the service refuses (contract note 4, AC-5).
 */
const linksAddressingTheService = (): string[] =>
  screen
    .queryAllByRole('link', { hidden: true })
    .map((link) => link.getAttribute('href') ?? '')
    .filter((href) => href.includes(TRANSACTIONS_API_BASE_PATH));

/**
 * The two download actions for one file, inside the root layout's real toast
 * composition — where this screen always sits in the running app.
 */
const renderDownloadActions = (file: FileLog) =>
  render(
    <ToastProvider>
      <FileDownloadActions file={file} />
      <ToastContainer />
    </ToastProvider>,
  );

/**
 * The whole submitted-file surface for one identifier — story 1's client component,
 * which resolves the file itself and is where this story's actions are composed in
 * (contract note 8). The page above it stays a server component and is story 1's.
 */
const renderFileSurface = (file: FileLog) =>
  render(
    <ToastProvider>
      <SubmittedFileDetail logId={String(file.Id)} />
      <ToastContainer />
    </ToastProvider>,
  );

describe('Epic file-validation-and-retry, Story 3: Download the original file and the error file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-3 — plus the FR6/FR7 endpoint mapping, pinned here because "the error-file
  // download is offered" is only right if it is the ERROR-FILE endpoint it asks for.
  it('asks each download its own endpoint for that file, and offers no error-file download at all on a file that has none', async () => {
    const user = userEvent.setup();
    stubTransactionsService();

    const failedFile = renderDownloadActions(FAILED_FILE);

    // A failed file has an error file (`HasBulkErrorFile: 'Yes'`), so both are offered.
    await user.click(
      screen.getByRole('button', { name: ORIGINAL_DOWNLOAD_NAME }),
    );

    // The originally submitted file comes from `FilesDownload` — and nothing else
    // was asked for, so the two downloads cannot have been transposed.
    await waitFor(() => {
      expect(downloadsAsked()).toEqual([
        downloadOf(ORIGINAL_DOWNLOAD_ENDPOINT, FAILED_FILE),
      ]);
    });

    clearRecordedRequests();
    await user.click(
      screen.getByRole('button', { name: ERROR_FILE_DOWNLOAD_NAME }),
    );

    // The generated error file comes from `FilesBulkErrorsDownload` — a different
    // endpoint, for the same file.
    await waitFor(() => {
      expect(downloadsAsked()).toEqual([
        downloadOf(ERROR_FILE_DOWNLOAD_ENDPOINT, FAILED_FILE),
      ]);
    });

    failedFile.unmount();

    // A file that imported cleanly reports `HasBulkErrorFile: 'No'` — the string,
    // not a boolean.
    renderDownloadActions(IMPORTED_FILE);

    // Its own download is still offered; asserted first so the absences below cannot
    // pass because nothing rendered at all.
    expect(
      screen.getByRole('button', { name: ORIGINAL_DOWNLOAD_NAME }),
    ).toBeEnabled();

    // Absent from the markup, not shown greyed out (AC-3 / UI-24). `hidden: true`
    // still matches an aria-hidden or disabled control, so a disabled button or a
    // link would both fail this.
    expect(
      screen.queryByRole('button', {
        name: ERROR_FILE_DOWNLOAD_NAME,
        hidden: true,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', {
        name: ERROR_FILE_DOWNLOAD_NAME,
        hidden: true,
      }),
    ).not.toBeInTheDocument();
  });

  // AC-4
  // Both downloads reach both roles by being on a surface that has no session and no
  // role to branch on (contract note 9): this asserts they are actually PLACED on the
  // file's surface — the wiring a component built in isolation would miss — and that
  // neither is withheld. That the same two controls appear for a signed-in Finance
  // Uploader and for a signed-in Approver is proven end-to-end, per role, in the
  // sibling Playwright spec; the page's own role gate is story 1's server-rendered
  // permission check and is covered there.
  it('places both downloads on the submitted-file surface, which carries no role of its own to withhold either', async () => {
    stubTransactionsService();

    renderFileSurface(FAILED_FILE);

    // `findBy*` because the surface resolves the file from the service itself.
    expect(
      await screen.findByRole('button', { name: ORIGINAL_DOWNLOAD_NAME }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: ERROR_FILE_DOWNLOAD_NAME }),
    ).toBeEnabled();
  });

  // AC-5
  // Data-contract: the full chain against the running service is verified in the
  // manual checklist.
  it("reports a refused download in the service's own words, keeps the action available, and never addresses the service directly", async () => {
    const user = userEvent.setup();
    stubTransactionsService({
      errorFileDownload: () =>
        Promise.reject(refusedDownload(ERROR_FILE_DOWNLOAD_ENDPOINT)),
    });

    renderDownloadActions(FAILED_FILE);

    // Nothing on screen points the browser at the service, so a refusal cannot land
    // the user on a raw error response.
    expect(linksAddressingTheService()).toEqual([]);

    await user.click(
      screen.getByRole('button', { name: ERROR_FILE_DOWNLOAD_NAME }),
    );

    // The service's own reason, announced — not the client's internal placeholder.
    const announcement = await screen.findByRole('alert');
    expect(announcement).toHaveTextContent(REFUSED_DOWNLOAD_REASON);
    expect(
      screen.queryByText(CLIENT_FALLBACK_MESSAGES.serverError),
    ).not.toBeInTheDocument();

    // Still on the page and still usable, so the user can ask again (NFR-base-5).
    expect(
      screen.getByRole('button', { name: ERROR_FILE_DOWNLOAD_NAME }),
    ).toBeEnabled();
    expect(linksAddressingTheService()).toEqual([]);

    // The refusal was reported in place — the other download is untouched by it.
    expect(
      screen.getByRole('button', { name: ORIGINAL_DOWNLOAD_NAME }),
    ).toBeEnabled();
  });

  // AC-5, the other half of it: with both controls deliberately left usable while a file
  // is on its way (contract note 5b), both files can be on their way at once — so what
  // one download reports must never be the other download's business.
  it('keeps each download’s announced wait and its own refusal to itself while both are in flight', async () => {
    const user = userEvent.setup();
    // The original file is asked for and simply has not arrived yet; the error file is
    // refused while it is still out.
    const original = downloadStillOnItsWay();
    stubTransactionsService({
      originalDownload: () => original.body,
      errorFileDownload: () =>
        Promise.reject(refusedDownload(ERROR_FILE_DOWNLOAD_ENDPOINT)),
    });

    renderDownloadActions(FAILED_FILE);

    await user.click(
      screen.getByRole('button', { name: ORIGINAL_DOWNLOAD_NAME }),
    );

    // The wait is announced, and it says WHICH file is being prepared.
    const announcedWait = await screen.findByRole('status');
    expect(announcedWait).toHaveTextContent(/original file/i);

    // The reader takes the other download while the first is still out — which they can,
    // because neither control is disabled.
    expect(
      screen.getByRole('button', { name: ERROR_FILE_DOWNLOAD_NAME }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole('button', { name: ERROR_FILE_DOWNLOAD_NAME }),
    );

    // The error file's refusal is reported in the service's own words, naming the
    // download that failed...
    const refusal = await screen.findByRole('alert');
    expect(refusal).toHaveTextContent(REFUSED_DOWNLOAD_REASON);
    expect(refusal).toHaveTextContent(/error file/i);
    // ...and the original file is still on its way: its announced wait was not taken off
    // the screen by what happened to the other download.
    expect(screen.getByRole('status')).toHaveTextContent(/original file/i);

    // The original file then arrives. That ends its OWN wait...
    await act(async () => {
      original.arrive(downloadedBytes());
    });
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    // ...and leaves the other download's refusal exactly where it was, rather than
    // clearing it as though the error file had been delivered too.
    expect(screen.getByRole('alert')).toHaveTextContent(
      REFUSED_DOWNLOAD_REASON,
    );

    // Both controls are still there and still usable, so either can be asked again.
    expect(
      screen.getByRole('button', { name: ORIGINAL_DOWNLOAD_NAME }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: ERROR_FILE_DOWNLOAD_NAME }),
    ).toBeEnabled();
    expect(linksAddressingTheService()).toEqual([]);
  });
});
