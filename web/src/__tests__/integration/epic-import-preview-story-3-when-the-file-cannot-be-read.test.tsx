/**
 * Story Metadata:
 * - Epic: import-preview — Story 3: when the file cannot be read
 * - Route: /upload/file
 * - Target File: web/src/components/files/ImportPreview.tsx
 * - Page Action: modify_existing
 *
 * THE HONEST-DEGRADATION HALF OF THE PREVIEW (brief FR5, BR8, NFR-3). Story 2 owns
 * what the preview shows when the file reads; this file owns what it shows when the
 * file does not — and the single thing every criterion below is really about is that
 * a HALF-DRAWN TABLE IS WORSE THAN NO TABLE. A partial, empty or misaligned table
 * quietly tells the user something false about their file, which is the exact failure
 * this story exists to prevent, so "nothing was rendered" is asserted positively here
 * rather than inferred from a message being present.
 *
 * Covers the five criteria tagged `vitest`:
 * - AC-1 (BR8) — a downloaded body that cannot be read as CSV: a plainly stated
 *   problem-reading-the-file message, and no table at all.
 * - AC-2 (BR8) — a file whose columns are not the seven the upload expects: the same
 *   handled message, naming the mismatch, rather than a table of misaligned values.
 *   (BR5a's one tolerated exception — the seven plus a trailing `Reason`, so story 4's
 *   correction CSV re-uploads unmodified — is story 1's reader's, and is READABLE; the
 *   bodies below are the shapes that stay unreadable around it.)
 * - AC-3 (FR5, BR8) — a file whose parsed row count does not reconcile with the
 *   `RecordCount` the service reports: reported as a PROBLEM READING THE FILE, not as
 *   an ordinary preview showing different numbers.
 * - AC-4 (NFR-3) — a failed DOWNLOAD, or a failed READ OF THE REJECTED ROWS: a
 *   different class from an unreadable body, reported in the SERVICE's own words with
 *   a control offering to load the preview again.
 * - AC-6 (NFR-3) — the wait is announced while the file is being fetched and read.
 *
 * AC-5 (choosing that control loads the preview once the service answers) is
 * Playwright's — a real navigation-and-retry round trip in a browser.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 *  1. The preview is the client component `web/src/components/files/ImportPreview.tsx`,
 *     named export `ImportPreview` — the SAME component story 2 creates; this story
 *     adds its degraded states. One required prop: `file` (the `FileLog` the file's
 *     page has already resolved). No session or role prop: both roles see everything
 *     here (brief §Access control).
 *  2. It is a `<section aria-labelledby>` whose heading NAMES it with the word
 *     "preview", so it is addressable as a region, and that heading is on screen from
 *     the first render — every state below lives INSIDE that section. A degraded
 *     preview is never a blank hole on the page.
 *  3. Both reads go through the shared client (CLAUDE.md §2) via the endpoint
 *     functions `lib/api/files.ts` ALREADY exports — `downloadSubmittedFile`
 *     (`GET /v1/files/download?FileLogId=`) and `fetchFileValidationErrors`
 *     (`GET /v1/files/validation-errors?FileLogId=`). Build no second download path.
 *     The stub below fails loudly on any other address — in particular on the
 *     service's GENERATED error file (`/v1/files/bulk-errors/download`) and on the
 *     ambiguous `FileLogDataDownload` (`/v1/file-logs/data`), neither of which this
 *     epic maps to — and on a read that does not identify the file it is asking about.
 *  4. THE THREE UNREADABLE OUTCOMES CONVERGE ON ONE BEHAVIOUR. An unparseable body, a
 *     wrong column shape, and a parsed row count that does not reconcile with
 *     `FileLog.RecordCount` are three distinct inputs; all three produce a stated
 *     problem reading the file — a `role="alert"` inside the section, worded so the
 *     user can tell what happened ("…could not be read…") — AND NO TABLE: no `table`,
 *     no `grid`, no rows, no cells, and none of the file's own values printed
 *     anywhere. Detecting the first two is story 1's reader's job (it returns them as
 *     values); this component maps them to the message. Do not re-detect them here.
 *  5. A COUNT MISMATCH IS AN ERROR, NOT A FOOTNOTE (FR5). The preview is sourced from
 *     the whole file, so the counts are expected to reconcile; a mismatch means the app
 *     is not looking at what it thinks it is looking at. Reporting it as a normal
 *     preview with different numbers would quietly contradict the record count already
 *     on the page — so no verdict wording ("Will import") may appear in that state. The
 *     message MAY name both numbers; that is honest and is not asserted against.
 *  6. A FAILED READ IS A DIFFERENT CLASS FROM AN UNREADABLE FILE, and is reported in
 *     the SERVICE's OWN WORDS: `downloadFailureMessage(error)` for a refused download,
 *     `validationErrorsFailureMessage(error)` for a refused rejected-rows read (both
 *     already exported by `lib/api/files.ts` — reuse; do not write app prose for these,
 *     and never let the client's own placeholder reach the user). This follows
 *     `RejectedRows`' shipped failure-plus-retry pattern rather than inventing a new
 *     one. A failed rejected-rows read also renders NO table: without the overlay every
 *     parsed row would be shown as "Will import", which is a claim the app cannot make
 *     (BR2's honesty rule).
 *  7. THE RETRY CONTROL IS NAMED `Load the preview again`, exactly. This page is
 *     crowded with ask-again controls and none of them may share a name: `Try again`
 *     (the processing history), `Try again to load the rejected rows`, `Load this file
 *     again`, `Retry validation` are all taken. Two controls with the same accessible
 *     name on one page cannot be told apart, by a reader or by a test.
 *  8. THE WAIT IS ANNOUNCED, not left as an empty section: a `role="status"` inside the
 *     section carrying text a screen reader is given (wording containing "Loading"),
 *     for as long as the file is being fetched AND read — a shape on its own says
 *     nothing (the pattern `RejectedRows` and `SubmittedFilesList` already established,
 *     project.md NFR-base-5).
 *  9. NOTHING HERE MAY THROW. An unhandled throw in the browser takes the whole file
 *     page down with it, which is precisely the crash BR8 forbids.
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy), plus `next/navigation` as the library
 * client-navigation boundary. Story 1's CSV reader is REAL production code here — it
 * is the code under test's collaborator, not a boundary, and mocking it would let a
 * component that mishandles its outcomes pass. Every body on the wire comes from the
 * project-wide `@/mocks/data/submitted-file`, `@/mocks/data/file-log` and
 * `@/mocks/data/validation-error` factories the Playwright layer shares, so the two
 * layers cannot drift onto different bytes or different service wording.
 *
 * Runtime-only: that the REST of the file's page (its status chip, its processing
 * history, its rejected rows, its downloads) stays usable while the preview is in one
 * of these states is a page-composition fact — what is pinned here is that every state
 * this section produces is confined to the section itself. The real composition is
 * verified by the browser spec and the manual checklist.
 *
 * Data-contract: that a LIVE `GET /v1/files/download` really streams the bytes these
 * fixtures stand in for, and that a live refusal carries the service's wording where
 * `downloadFailureMessage` looks for it, is verified in the browser and at the
 * manual-test approval (both backend services were unreachable when this was written).
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — this import fails until the preview exists (TDD red).
import { ImportPreview } from '@/components/files/ImportPreview';

// Real production toast composition (not mocked) — the same one the root layout wraps
// every signed-in screen in, so the section is rendered as the app mounts it.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { apiClient, get } from '@/lib/api/client';
import {
  CLIENT_FALLBACK_DETAILS,
  CLIENT_FALLBACK_MESSAGES,
} from '@/lib/api/errors';
// The endpoints and the two failure-wording helpers this story REUSES rather than
// re-states (contract 3 and 6). Importing the endpoints is what routes the stub — a
// call to any other address is a failure, not a silent pass.
import {
  FILE_BULK_ERRORS_DOWNLOAD_ENDPOINT,
  FILE_DOWNLOAD_ENDPOINT,
  FILE_VALIDATION_ERRORS_ENDPOINT,
  downloadFailureMessage,
  validationErrorsFailureMessage,
} from '@/lib/api/files';
import { TRANSACTIONS_API_BASE_PATH } from '@/lib/utils/constants';

// Project-wide factories, shared with the Playwright layer — no test hand-writes a
// CSV body, a validation-errors body or a service sentence.
import {
  FILE_STATUS_IMPORTED,
  fileLogWithStatus,
  uploadFailureResponse,
} from '@/mocks/data/file-log';
import {
  BINARY_FILE_BODY,
  MISREPORTED_RECORD_COUNT,
  UNKNOWN_EXTRA_COLUMN,
  UNTERMINATED_QUOTE_FILE_BODY,
  previewWithCountMismatch,
  previewWithRejectedRows,
  reasonPlusUnknownColumnFileBody,
  submittedFileBlob,
  submittedFileRow,
  tooFewColumnsFileBody,
  unknownExtraColumnFileBody,
  wrongColumnNamesFileBody,
} from '@/mocks/data/submitted-file';
import {
  VALIDATION_ERRORS_FAILURE_MESSAGE,
  validationErrorsFailureResponse,
  validationErrorsResponse,
} from '@/mocks/data/validation-error';

import type { FileLog } from '@/mocks/data/file-log';
import type { SubmittedFileRow } from '@/mocks/data/submitted-file';
import type { ValidationErrors } from '@/mocks/data/validation-error';
import type { APIError } from '@/types/api';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

/**
 * The client-navigation boundary — a library, never the code under test. The preview
 * lives on the file's page at `/upload/file?LogId=<id>`; the file itself arrives as a
 * prop (contract 1), so nothing here asserts navigation.
 */
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
  useSearchParams: () => new URLSearchParams('LogId=5001'),
}));

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;
const mockGet = get as unknown as ReturnType<typeof vi.fn>;

/**
 * The ambiguous third download operation (`FileLogDataDownload`). No requirement in
 * this epic maps to it (brief §Data Model, which rules it out explicitly) — it is
 * named here only so a request to it is recognised and fails, rather than passing
 * unnoticed as "a download happened".
 */
const FILE_LOG_DATA_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/file-logs/data`;

/**
 * How the section says it could not read the file — the wording the shipped sibling
 * already uses for the same kind of answer ("These rejected rows could not be read",
 * `RejectedRows`), and what the manual checklist promises the user will see. One
 * phrase, not a set of alternatives: a message the user can act on is the point.
 */
const PROBLEM_READING_THE_FILE = /could not be read/i;

/** The one control that asks for the preview again (contract 7). */
const LOAD_THE_PREVIEW_AGAIN = 'Load the preview again';

/**
 * Ask-again controls this page has ALREADY spent, each owned by another section
 * (story 2's Reuse notes). None of them may appear inside the preview: a second
 * control with a name already in use on this screen is unusable, and this list is how
 * that stays true as the page grows.
 */
const RESERVED_CONTROL_LABELS = [
  'Try again',
  'Try again to load the rejected rows',
  'Load this file again',
  'Retry validation',
];

/** How many data lines each unreadable fixture body below holds. */
const UNREADABLE_FIXTURE_LINE_COUNT = 3;

/**
 * A file whose validation HAS run, so the preview is rendered at all (FR1), and whose
 * `RecordCount` agrees with the fixture bodies' three data lines — so for the
 * wrong-column-shape cases a count mismatch is ruled out and the problem the section
 * reports is genuinely about the shape.
 */
const readableCountFile = (overrides: Partial<FileLog> = {}): FileLog =>
  fileLogWithStatus(FILE_STATUS_IMPORTED, {
    RecordCount: String(UNREADABLE_FIXTURE_LINE_COUNT),
    ...overrides,
  });

/**
 * The wording the SERVICE itself gives for a refused download — phrased as only a
 * backend would phrase it, and deliberately unlike the rejected-rows refusal below, so
 * a test can tell which failure reached the user. Carried in the shared
 * `DefaultResponse` refusal envelope every file endpoint answers with.
 */
const DOWNLOAD_REFUSAL_REASON = uploadFailureResponse(
  'The import share holding this file is offline.',
).Messages[0];

/**
 * The `APIError` the shared client rejects with when the service refuses: a 500 whose
 * `DefaultResponse` body carries the reason. Note the service's wording lands in
 * `details` while `message` holds the CLIENT's own placeholder — that is what
 * `apiClient`'s 500 branch does, and it is why contract 6 names the two helpers rather
 * than letting a screen read `message`.
 */
const refusalCarrying = (reason: string, endpoint: string): APIError => ({
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  details: [reason],
  endpoint,
});

const DOWNLOAD_REFUSED = refusalCarrying(
  DOWNLOAD_REFUSAL_REASON,
  FILE_DOWNLOAD_ENDPOINT,
);

const VALIDATION_ERRORS_REFUSED = refusalCarrying(
  validationErrorsFailureResponse().Messages[0],
  FILE_VALIDATION_ERRORS_ENDPOINT,
);

interface ServiceStub {
  /** The file both reads must be made FOR — a read for any other id fails loudly. */
  file: FileLog;
  /** How `GET /v1/files/download` answers. */
  download?: () => Promise<unknown>;
  /** How `GET /v1/files/validation-errors` answers. Defaults to nothing rejected. */
  validationErrors?: () => Promise<unknown>;
}

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

/** The file a request was made for — from the query string or the parameters. */
const fileLogIdOf = (path: string, config: unknown): string => {
  const inPath = new URLSearchParams(path.split('?')[1] ?? '').get('FileLogId');
  if (inPath !== null) {
    return inPath;
  }
  const value = paramsOf(config).FileLogId;
  return value === undefined ? '' : String(value);
};

/**
 * The transactions service, as far as this section is concerned: it answers exactly
 * two addresses, only for the file it was asked about, and complains loudly about
 * anything else — so a read of the wrong endpoint, a call to the service's own
 * generated error file, or one that fails to identify the file cannot pass as a
 * working implementation.
 *
 * One responder is registered on BOTH client entry points, which keeps these tests
 * indifferent to whether `lib/api/files.ts` reaches for `apiClient` or `get`.
 */
const stubTransactionsService = ({
  file,
  download,
  validationErrors,
}: ServiceStub): void => {
  const respond = (endpoint: unknown, config: unknown): Promise<unknown> => {
    const path = String(endpoint);

    if (path.startsWith(FILE_LOG_DATA_ENDPOINT)) {
      return Promise.reject(
        new Error(
          `No requirement in this epic maps to FileLogDataDownload ("${path}") — ` +
            'the preview is sourced from GET /v1/files/download (brief §Data Model, ' +
            'which rules this operation out explicitly).',
        ),
      );
    }
    if (path.startsWith(FILE_BULK_ERRORS_DOWNLOAD_ENDPOINT)) {
      return Promise.reject(
        new Error(
          `The preview must not read the service's GENERATED error file ("${path}") ` +
            '— it parses the ORIGINAL submitted file from GET /v1/files/download ' +
            '(contract 3).',
        ),
      );
    }

    const known =
      path.startsWith(FILE_DOWNLOAD_ENDPOINT) ||
      path.startsWith(FILE_VALIDATION_ERRORS_ENDPOINT);
    if (!known) {
      return Promise.reject(
        new Error(
          `Unexpected read of "${path}" — the preview reads only the file's own ` +
            'bytes and its rejected-rows overlay; the file itself arrives as a prop ' +
            '(contract 1 and 3).',
        ),
      );
    }

    const askedFor = fileLogIdOf(path, config);
    if (askedFor !== String(file.Id)) {
      return Promise.reject(
        new Error(
          `Read of "${path}" asked for FileLogId="${askedFor}" — every read must ` +
            `carry the file's own Id (${String(file.Id)}).`,
        ),
      );
    }

    if (path.startsWith(FILE_DOWNLOAD_ENDPOINT)) {
      return download
        ? download()
        : Promise.reject(
            new Error(
              'This test stubs no download for the preview, yet the file was ' +
                'requested — give `stubTransactionsService` a `download`.',
            ),
          );
    }
    return validationErrors
      ? validationErrors()
      : Promise.resolve(validationErrorsResponse([]));
  };

  mockApiClient.mockImplementation((endpoint: unknown, config: unknown) =>
    respond(endpoint, config),
  );
  mockGet.mockImplementation((endpoint: unknown, config: unknown) =>
    respond(endpoint, config),
  );
};

/** A download that answers with exactly these bytes. */
const answersWith = (body: string) => () =>
  Promise.resolve(submittedFileBlob(body));

/** The preview, inside the root layout's real toast composition. */
const renderPreview = (file: FileLog) =>
  render(
    <ToastProvider>
      <ImportPreview file={file} />
      <ToastContainer />
    </ToastProvider>,
  );

/** The preview section itself — every state this story owns lives inside it. */
const section = (): HTMLElement =>
  screen.getByRole('region', { name: /preview/i });

/** The stated problem, once the section has finished trying to read the file. */
const statedProblem = (): Promise<HTMLElement> =>
  within(section()).findByRole('alert');

/**
 * NO TABLE AT ALL — the assertion this whole story turns on (contract 4).
 *
 * Every way a table can be present is checked, because the failure mode being ruled
 * out is a PARTIAL one: a table element with no rows, a header row with no data
 * beneath it, or a virtualised grid are each exactly the half-drawn render BR8
 * forbids, and each would slip past a check for only one of them.
 */
const expectNoTable = (scope: HTMLElement, what: string): void => {
  const found = within(scope);
  expect(found.queryByRole('table'), what).toBeNull();
  expect(found.queryByRole('grid'), what).toBeNull();
  expect(found.queryAllByRole('row'), what).toHaveLength(0);
  expect(found.queryAllByRole('columnheader'), what).toHaveLength(0);
  expect(found.queryAllByRole('cell'), what).toHaveLength(0);
};

/**
 * ...and none of the file's own values printed anywhere either, which is what rules
 * out a table-less partial render (a list, a definition list, a stack of cards). The
 * values are taken from the fixture rather than written out here, and each is checked
 * to really be in the bytes on the wire first — so a negative assertion can never pass
 * vacuously against a value the file never held.
 */
const expectNoRowValues = (
  scope: HTMLElement,
  body: string,
  row: SubmittedFileRow,
  what: string,
): void => {
  [row.Reference, row.Description, row.AccountNumber].forEach((value) => {
    expect(body, `${what}: fixture precondition`).toContain(value);
    expect(scope, what).not.toHaveTextContent(value);
  });
};

interface Deferred<T> {
  promise: Promise<T>;
  settle: (value: T) => void;
}

/** An answer the test releases itself, so the in-flight state is observable. */
const deferred = <T,>(): Deferred<T> => {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  if (settle === undefined) {
    throw new Error(
      'A Promise executor runs synchronously, so this cannot happen — but the ' +
        'compiler cannot know that.',
    );
  }
  return { promise, settle };
};

describe('Epic import-preview, Story 3: when the file cannot be read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-1 (BR8)
  it('says plainly that a downloaded file could not be read as CSV, and renders no table at all', async () => {
    // Two genuinely different ways a body defeats the reader. Which internal outcome
    // each produces is the reader's own call and is deliberately not asserted — what
    // this criterion requires of BOTH is the same stated problem and the same absence
    // of a table (see @/mocks/data/submitted-file's note on the binary body).
    const unreadableBodies = [
      {
        what: 'a quoted field opened and never closed',
        body: UNTERMINATED_QUOTE_FILE_BODY,
      },
      { what: 'a PDF uploaded by mistake', body: BINARY_FILE_BODY },
    ];

    // The line the unterminated-quote body DOES hold before it goes wrong — the rows a
    // reader might be tempted to hand back "as far as it got". None of it may surface.
    const firstLine = submittedFileRow(1);

    for (const { what, body } of unreadableBodies) {
      const file = readableCountFile();
      stubTransactionsService({ file, download: answersWith(body) });

      renderPreview(file);

      expect(await statedProblem(), what).toHaveTextContent(
        PROBLEM_READING_THE_FILE,
      );
      expectNoTable(section(), what);

      cleanup();
    }

    // The partial render this criterion exists to prevent, stated once against the
    // body that actually has readable lines in it to leak.
    stubTransactionsService({
      file: readableCountFile(),
      download: answersWith(UNTERMINATED_QUOTE_FILE_BODY),
    });
    renderPreview(readableCountFile());
    await statedProblem();
    expectNoRowValues(
      section(),
      UNTERMINATED_QUOTE_FILE_BODY,
      firstLine,
      'the lines before the unterminated quote',
    );
  });

  // AC-2 (BR8)
  it('reports a file whose columns are not the seven the upload expects, naming the mismatch, instead of a table of misaligned values', async () => {
    // Four shapes, one behaviour. The first is the dangerous one: seven columns under
    // a bank's own headings, which a reader that only COUNTED columns would happily
    // pour into the preview under the wrong headings.
    //
    // The last two guard the ONE tolerated extra column from becoming a blanket "ignore
    // anything after the seventh". BR5a makes the seven plus a trailing `Reason`
    // READABLE, so that an employee can re-upload story 4's correction CSV unmodified —
    // and nothing wider than that. So an unknown eighth column is still a file the app
    // cannot read, and so is the seven plus `Reason` PLUS an unknown one: `Reason` being
    // present does not buy the rest of the file a pass.
    const wrongShapes = [
      {
        what: 'seven columns under the wrong names',
        body: wrongColumnNamesFileBody(),
      },
      { what: 'six columns — Currency dropped', body: tooFewColumnsFileBody() },
      {
        what: `eight columns — an unknown trailing ${UNKNOWN_EXTRA_COLUMN} column`,
        body: unknownExtraColumnFileBody(),
      },
      {
        what: `nine columns — a tolerated Reason column AND an unknown ${UNKNOWN_EXTRA_COLUMN} one`,
        body: reasonPlusUnknownColumnFileBody(),
      },
    ];

    // These bodies are built from the sample file's own first three lines, so their
    // values are real and their absence below means something.
    const firstLine = submittedFileRow(1);

    for (const { what, body } of wrongShapes) {
      // RecordCount agrees with the three data lines each body holds, so a count
      // mismatch is ruled out and the problem reported is genuinely about the shape.
      const file = readableCountFile();
      stubTransactionsService({ file, download: answersWith(body) });

      renderPreview(file);

      const problem = await statedProblem();
      expect(problem, what).toHaveTextContent(PROBLEM_READING_THE_FILE);
      // Naming the mismatch: the user is told the columns are the trouble, not left
      // with a bare apology they can do nothing about.
      expect(problem, what).toHaveTextContent(/column/i);

      expectNoTable(section(), what);
      expectNoRowValues(section(), body, firstLine, what);

      cleanup();
    }
  });

  // AC-3 (FR5, BR8)
  it('reports a row count that does not reconcile with the service’s record count as a problem reading the file, not as a preview with different numbers', async () => {
    const preview = previewWithCountMismatch();

    // Fixture preconditions, so this test means what it says: the file PARSES
    // perfectly — that is the whole point — and the two numbers genuinely disagree.
    expect(preview.file.RecordCount).toBe(MISREPORTED_RECORD_COUNT);
    expect(preview.rows).toHaveLength(3);
    expect(Number(preview.file.RecordCount)).not.toBe(preview.rows.length);

    stubTransactionsService({
      file: preview.file,
      download: () => Promise.resolve(preview.blob()),
      validationErrors: () => Promise.resolve(preview.validationErrors),
    });

    renderPreview(preview.file);

    expect(await statedProblem()).toHaveTextContent(PROBLEM_READING_THE_FILE);

    // Not an ordinary preview that happens to disagree with the count already on the
    // page: no table, none of the file's rows, and no verdict wording anywhere. A row
    // labelled "Will import" here would be a claim the app has no basis for, since it
    // is not looking at the file it thinks it is.
    expectNoTable(section(), 'a count mismatch');
    expectNoRowValues(
      section(),
      preview.csv,
      preview.rows[0],
      'a count mismatch',
    );
    expect(section()).not.toHaveTextContent(/will import/i);
  });

  // AC-4 (NFR-3)
  it('reports a failed download and a failed rejected-rows read in the service’s own words, each with one control offering to load the preview again', async () => {
    const preview = previewWithRejectedRows();

    const readFailures = [
      {
        what: 'the download of the file itself was refused',
        stub: {
          file: preview.file,
          download: () => Promise.reject(DOWNLOAD_REFUSED),
          validationErrors: () => Promise.resolve(preview.validationErrors),
        },
        // The service's own words for THIS failure, resolved by the helper the story
        // reuses — never wording this screen invented (contract 6).
        expected: downloadFailureMessage(DOWNLOAD_REFUSED),
      },
      {
        what: 'the rejected-rows read was refused',
        stub: {
          file: preview.file,
          download: () => Promise.resolve(preview.blob()),
          validationErrors: () => Promise.reject(VALIDATION_ERRORS_REFUSED),
        },
        expected: validationErrorsFailureMessage(VALIDATION_ERRORS_REFUSED),
      },
    ];

    // Fixture preconditions: each helper really does surface the SERVICE's sentence
    // rather than the client's placeholder, and the two sentences are distinct — so
    // "the right failure reached the user" is a claim these assertions can actually
    // make.
    expect(readFailures[0].expected).toBe(DOWNLOAD_REFUSAL_REASON);
    expect(readFailures[1].expected).toBe(VALIDATION_ERRORS_FAILURE_MESSAGE);
    expect(readFailures[0].expected).not.toBe(readFailures[1].expected);

    for (const { what, stub, expected } of readFailures) {
      stubTransactionsService(stub);

      renderPreview(preview.file);

      const problem = await statedProblem();
      expect(problem, what).toHaveTextContent(expected);

      // The client's own plumbing wording never reaches a user (project.md
      // NFR-base-5).
      expect(section(), what).not.toHaveTextContent(
        CLIENT_FALLBACK_MESSAGES.serverError,
      );
      expect(section(), what).not.toHaveTextContent(
        CLIENT_FALLBACK_DETAILS.serverError,
      );

      // Exactly one way forward, named for what it loads.
      expect(
        within(section()).getAllByRole('button', {
          name: LOAD_THE_PREVIEW_AGAIN,
        }),
        what,
      ).toHaveLength(1);

      // ...and it does not answer to a name another section on this page already owns
      // (contract 7).
      RESERVED_CONTROL_LABELS.forEach((label) => {
        expect(
          within(section()).queryByRole('button', { name: label }),
          `${what}: reserved label "${label}"`,
        ).toBeNull();
      });

      // A read that failed leaves nothing to draw: without the overlay every parsed
      // row would be shown as "Will import", which the app cannot claim (BR2).
      expectNoTable(section(), what);
      expect(section(), what).not.toHaveTextContent(/will import/i);

      cleanup();
    }
  });

  // AC-6 (NFR-3)
  it('announces the wait while the file is being fetched and read, rather than leaving an empty section', async () => {
    const preview = previewWithRejectedRows();
    const download = deferred<Blob>();
    const overlay = deferred<ValidationErrors>();

    stubTransactionsService({
      file: preview.file,
      download: () => download.promise,
      validationErrors: () => overlay.promise,
    });

    renderPreview(preview.file);

    // The section is on screen from the first render, and what is in it is a sentence
    // a screen reader is given — not blank space, and not a shape on its own.
    const waiting = await within(section()).findByRole('status');
    expect(waiting).toHaveTextContent(/loading/i);

    // The bytes have arrived, but the file still has to be READ — the wait is not over
    // and is still announced.
    download.settle(preview.blob());
    expect(await within(section()).findByRole('status')).toHaveTextContent(
      /loading/i,
    );

    // Once everything has answered, the announcement gives way to the preview itself.
    overlay.settle(preview.validationErrors);
    await waitFor(() => {
      expect(within(section()).queryByRole('status')).toBeNull();
    });
    expect(within(section()).getByRole('table')).toBeInTheDocument();
  });
});
