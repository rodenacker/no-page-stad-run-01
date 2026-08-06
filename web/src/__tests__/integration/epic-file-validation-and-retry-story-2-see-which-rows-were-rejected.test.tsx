/**
 * Story Metadata:
 * - Epic: file-validation-and-retry — Story 2: see which rows were rejected and why
 * - Route: /upload/file
 * - Target File: web/src/app/(authenticated)/upload/file/page.tsx
 * - Page Action: modify_existing
 *
 * Covers this story's criteria, all six of which are tagged `vitest`:
 * - AC-1 (FR1) — every rejected row of a failed file is listed with the values
 *   recorded FOR THAT ROW: reference, transaction date, account number,
 *   description, amount, transaction type and currency.
 * - AC-2 (FR2) — a row rejected for a missing reference, a non-numeric amount, an
 *   unreadable transaction date or an unsupported currency shows THIS APP's fixed
 *   wording for that field, exactly as the brief states it — and never the
 *   service's own text for those four rules.
 * - AC-3 (FR3) — a row the transactions service rejected over its transaction type
 *   shows the SERVICE's own reason for that row word for word; the app judges no
 *   transaction type itself and offers no accepted-type list anywhere.
 * - AC-4 — a file that has not failed validation shows no rejected-rows list at
 *   all; a failed file whose rows cannot be read AS ROWS says so plainly instead of
 *   drawing an empty table.
 * - AC-5 — the wait is announced while the rows are being read, and a failed read
 *   shows the service's own wording with one action that asks for them again.
 * - AC-6 — a rejected row's account number shows only its last four digits until an
 *   explicit action on THAT ONE ROW reveals the rest (POPIA, project.md
 *   §Compliance).
 *
 * Story 1's page chrome (the file's own identity, its status chip, its processing
 * history) and stories 3–5 (downloads, retry/cancel, the notification) are their own
 * files — deliberately not touched here.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 *  1. The rejected rows are a SECTION of story 1's submitted-file page, implemented
 *     as a client component at `web/src/components/files/RejectedRows.tsx`, named
 *     export `RejectedRows`, with one required prop: `file` (the `FileLog` story 1's
 *     page has already resolved from `GET /v1/file-logs?IsActive=Yes`). It does NOT
 *     re-read the file itself, and it takes no session or role prop — both roles see
 *     these rows (brief §Access control).
 *  2. The section is a `<section aria-labelledby>` whose heading NAMES it with the
 *     word "rejected" (e.g. "Rejected rows"), so it is addressable as a region. All
 *     three non-data states below live inside it.
 *  3. The read happens in the BROWSER, through a new endpoint function in
 *     `web/src/lib/api/files.ts` calling the shared client (CLAUDE.md §2 — never
 *     `fetch()`): `GET /transactions-api/v1/files/validation-errors` with
 *     `FileLogId=<file.Id>`. The mock below fails loudly on any other read, and on a
 *     read that does not identify the file.
 *  4. WIRE QUIRK: the body is `{ ValidationErrors: { JsonArray: "<json string>" } }`
 *     — the rows arrive AS A JSON STRING and must be parsed. TWO parse outcomes are
 *     handled failure states, never a crash and never an empty table: a string that
 *     will not parse, and a string that parses to something that is NOT an array of
 *     rows (the case a bare `try { JSON.parse } catch {}` sails straight past).
 *  5. Nothing at all is rendered — no heading, no table, no read — unless
 *     `file.CurrentStatus` is `Validation failed` (`FILE_STATUS_VALIDATION_FAILED`
 *     from `@/types/files`).
 *  6. One table row per rejected row, carrying that row's SEVEN recorded values
 *     (`Reference`, `TransactionDate`, `AccountNumber`, `Description`, `Amount`,
 *     `TransactionType`, `Currency`) EXACTLY as the source file held them: no
 *     reformatting, no re-casing, no translation. In particular
 *     `transactionTypeLabel` (`@/lib/transactions/display`), which turns `C` into
 *     "Credit — money in" on IMPORTED requests, must NOT be applied here: the whole
 *     point of this list is to show the user what their file actually contains so
 *     they can correct it outside the app. The one exception is the account number,
 *     which is masked (item 9).
 *  7. WHERE THE DEFECT WORDING COMES FROM is the heart of this story, and the two
 *     sources must not be mixed:
 *     - the four rules THIS APP owns, selected by the row's `ErrorColumn` — fixed
 *       wording, verbatim from the brief (see the four constants below), and the
 *       service's own text for those columns must never reach the user;
 *     - `ErrorColumn: 'TransactionType'` — the service's `ErrorMessage` for that
 *       row, word for word. No app-side accepted-type list, map or validation rule
 *       exists for this field, in this epic or anywhere else (brief §Notes &
 *       Caveats, a user decision at INTAKE — not a shortcut to revisit).
 *     - any OTHER `ErrorColumn`, or a message with no `ErrorColumn` at all — the
 *       service's `ErrorMessage`, as sent. The app only speaks where it owns the
 *       rule; it never guesses which value looks wrong.
 *     - no defect signal at all — the row is still listed with its values, and NO
 *       reason is invented for it.
 *  8. `ErrorColumn` / `ErrorMessage` are an INFERENCE, not documented in
 *     `transactions-api.yaml` (epic `unverifiedAssumptions`). They are read from the
 *     `@/mocks/data/validation-error` factory here so that a live response naming
 *     them differently is a ONE-PLACE fix (that factory plus `ValidationErrorRow` in
 *     `@/types/files`) rather than a rewrite of this file.
 *  9. MASKING IS POPIA (project.md §Compliance), not formatting: every row's account
 *     number shows its last four digits only, through the existing
 *     `MaskedAccountNumber` / `lastFourDigitsOf` — do not write a second masking
 *     helper. A per-row control named for what it does AND what it acts on (e.g.
 *     "Reveal account number") reveals the full value for THAT ONE ROW. There is no
 *     reveal-all control, and a masked row must not carry the full value anywhere in
 *     its markup — a value parked in a `title` or `data-` attribute leaks exactly as
 *     surely as one printed in a cell.
 * 10. The three non-data states follow the shape `SubmittedFilesList` already
 *     established (project.md NFR-base-5): a busy state ANNOUNCED with text a screen
 *     reader is given (`role="status"`, wording containing "Loading"), and a failed
 *     read reported as `serviceMessageOf(e) ?? serviceDetailOf(e) ?? <own plain
 *     wording>` from `@/lib/api/errors` with ONE "Try again" action. The client's own
 *     placeholders ("Internal Server Error: …") never reach the user.
 * 11. This section is read-only: no editing of a rejected row exists anywhere in
 *     this project (brief §Out of Scope).
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy), plus `next/navigation` as the library
 * client-navigation boundary (the file arrives as a prop — nothing here asserts
 * navigation). The toast composition is the real production code, as the root layout
 * always mounts it. Every response body comes from the project-wide
 * `@/mocks/data/validation-error` and `@/mocks/data/file-log` factories the
 * Playwright layer shares, so the two layers cannot drift onto different shapes,
 * different defect signals or different service wording.
 *
 * Runtime-only: that the rest of the file's page stays usable while this section is
 * loading or has failed is a page-composition fact — what is pinned here is that
 * every state this section produces is confined to the section itself and always
 * offers a way forward. The real composition is verified by story 1's browser spec
 * and the manual checklist.
 *
 * Data-contract: that the request really carries `FileLogId` through the app's own
 * proxy to the transactions service, and that the live response is shaped the way
 * item 8 assumes, is verified in the browser and at the manual-test approval.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): the rejected-rows
 * section does not exist yet.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — this import fails until the section exists (TDD red).
import { RejectedRows } from '@/components/files/RejectedRows';

// Real production toast composition (not mocked) — the same one the root layout
// wraps every signed-in screen in, so this section is rendered as the app mounts it.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
import {
  CLIENT_FALLBACK_DETAILS,
  CLIENT_FALLBACK_MESSAGES,
} from '@/lib/api/errors';
// The app's own display rules for an IMPORTED request. `lastFourDigitsOf` is the one
// masking helper (reused here); `transactionTypeLabel` is imported to prove the
// opposite — that a rejected row's own type value is NOT translated (contract 6).
import {
  lastFourDigitsOf,
  transactionTypeLabel,
} from '@/lib/transactions/display';

// Project-wide factories: the single source of truth for the file and for the
// rejected-row wire shape, its canonical values and the SERVICE's own wording.
// Shared with the Playwright layer — never hand-write a response body in a test.
import {
  FILE_STATUS_IMPORTED,
  FILE_STATUS_VALIDATION_FAILED,
  fileLogWithStatus,
} from '@/mocks/data/file-log';
import { TRANSACTION_TYPE_CREDIT_CODE } from '@/mocks/data/transaction';
import {
  REJECTED_TRANSACTION_TYPE,
  SERVICE_DEFECT_REASONS,
  TRANSACTION_TYPE_DEFECT_REASON,
  VALIDATION_ERRORS_FAILURE_MESSAGE,
  invalidRowWithMessageOnly,
  invalidRowWithNoDefectSignal,
  invalidRowsForEveryDefect,
  nonArrayValidationErrorsResponse,
  unparseableValidationErrorsResponse,
  validationErrorsFailureResponse,
  validationErrorsResponse,
} from '@/mocks/data/validation-error';

import type { FileLog } from '@/mocks/data/file-log';
import type {
  ValidationErrorRow,
  ValidationErrors,
} from '@/mocks/data/validation-error';
import type { APIError, QueryParams } from '@/types/api';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

/**
 * The client-navigation boundary — a library, never the code under test. The section
 * lives on the file's page at `/upload/file?LogId=<id>`; the file itself arrives as
 * a prop (contract 1), so nothing here asserts navigation.
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

const mockGet = get as unknown as ReturnType<typeof vi.fn>;

/**
 * The one address these rows come from. Used to ROUTE the mock (so a read of
 * anything else fails loudly), not to assert a call.
 */
const VALIDATION_ERRORS_PATH = '/v1/files/validation-errors';

/** ------------------------------------------------------------------------
 * The four rules THIS APP owns, and its fixed wording for each — quoted from
 * the brief (FR2 / R38, R39, R40, R42) and from story 2's own table. These are
 * the app's contract, so they are stated here as literals; everything the
 * SERVICE says comes from the shared factory instead.
 * ------------------------------------------------------------------------ */
const MISSING_REFERENCE_MESSAGE =
  'This request has no reference and cannot be imported.';
const NON_NUMERIC_AMOUNT_MESSAGE =
  'Amount must be a number, for example 1245.67.';
const UNREADABLE_DATE_MESSAGE =
  'Transaction date must be a valid date and time.';
const UNSUPPORTED_CURRENCY_MESSAGE =
  'Currency must be a supported currency code.';

/** Fixed wording by the column it belongs to — the app's whole vocabulary here. */
const APP_OWNED_WORDING: Record<string, string> = {
  Reference: MISSING_REFERENCE_MESSAGE,
  Amount: NON_NUMERIC_AMOUNT_MESSAGE,
  TransactionDate: UNREADABLE_DATE_MESSAGE,
  Currency: UNSUPPORTED_CURRENCY_MESSAGE,
};

const APP_OWNED_COLUMNS = Object.keys(APP_OWNED_WORDING);

/** The wording this section falls back to when the rows will not read as rows. */
const UNREADABLE_ROWS_WORDING = /could not be read/i;

/** A file in the only state this section renders for. */
const failedFile = (overrides: Partial<FileLog> = {}): FileLog =>
  fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED, overrides);

/**
 * What the service answers with, per file id — so a read that does not identify the
 * file it is asking about cannot quietly succeed.
 */
const rowsByFileId = new Map<number, ValidationErrors>();

/** Registers the body `GET /v1/files/validation-errors` answers for `file`. */
const serveRowsFor = (file: FileLog, body: ValidationErrors): void => {
  rowsByFileId.set(file.Id, body);
};

/** The section as the root layout always mounts it: inside the toast composition. */
const renderRejectedRows = (file: FileLog) =>
  render(
    <ToastProvider>
      <RejectedRows file={file} />
      <ToastContainer />
    </ToastProvider>,
  );

/** The rejected-rows section itself — every state this story owns lives inside it. */
const section = (): HTMLElement =>
  screen.getByRole('region', { name: /rejected/i });

/** The same, for asserting the section is not there at all (AC-4). */
const querySection = (): HTMLElement | null =>
  screen.queryByRole('region', { name: /rejected/i });

/**
 * The table row for a rejected row, found by the description that row carries
 * rather than by position — and required to be unique, so a widened match can never
 * quietly select a different row (testing-policy.md § anti-pattern 7).
 */
const rowFor = (description: string): HTMLElement => {
  const rows = within(screen.getByRole('table'))
    .getAllByRole('row')
    .filter((row) => row.textContent?.includes(description));

  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one table row carrying "${description}", found ` +
        `${String(rows.length)} — the rejected-rows section must render one row ` +
        `per rejected row, carrying that row's own recorded values (see the ` +
        `implementation contract above).`,
    );
  }
  return rows[0];
};

/** The description a fixture row is identified by, insisted on rather than assumed. */
const descriptionOf = (row: ValidationErrorRow): string => {
  const { Description } = row;
  if (typeof Description !== 'string' || Description === '') {
    throw new Error(
      'Fixture precondition failed: every rejected row used here carries its own ' +
        'Description, which is how its table row is found (see ' +
        '@/mocks/data/validation-error).',
    );
  }
  return Description;
};

/** The full account number a fixture row carries (the value the app must mask). */
const accountNumberOf = (row: ValidationErrorRow): string => {
  const { AccountNumber } = row;
  if (typeof AccountNumber !== 'string' || AccountNumber === '') {
    throw new Error(
      'Fixture precondition failed: every rejected row used here carries a full, ' +
        'unmasked AccountNumber — masking can only be proved if the mock hands the ' +
        'component something to mask (see @/mocks/data/validation-error).',
    );
  }
  return AccountNumber;
};

/** The service's own reason a fixture row carries, insisted on rather than assumed. */
const serviceReasonOf = (row: ValidationErrorRow): string => {
  const { ErrorMessage } = row;
  if (typeof ErrorMessage !== 'string' || ErrorMessage === '') {
    throw new Error(
      'Fixture precondition failed: this rejected row must carry the service’s own ' +
        'ErrorMessage (see @/mocks/data/validation-error).',
    );
  }
  return ErrorMessage;
};

/** The one fixture row rejected over `column`, insisted on rather than assumed. */
const rowRejectedFor = (
  rows: ValidationErrorRow[],
  column: string,
): ValidationErrorRow => {
  const matches = rows.filter((row) => row.ErrorColumn === column);
  if (matches.length !== 1) {
    throw new Error(
      `Fixture precondition failed: expected exactly one row rejected over ` +
        `"${column}", found ${String(matches.length)} (see ` +
        `@/mocks/data/validation-error → invalidRowsForEveryDefect).`,
    );
  }
  return matches[0];
};

/**
 * The recorded values a row must show as text, skipping any the source file did not
 * hold at all (a row rejected for a MISSING reference has no reference to show). The
 * account number is not among them — it is masked, and has its own assertions.
 */
const recordedValuesOf = (row: ValidationErrorRow): string[] =>
  [
    row.Reference,
    row.TransactionDate,
    row.Description,
    row.Amount,
    row.TransactionType,
    row.Currency,
  ]
    .filter(
      (value): value is string | number => value !== undefined && value !== '',
    )
    .map(String);

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

/** A promise the test resolves itself, so the in-flight state is observable. */
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * A refused read carrying the SERVICE's own wording. The transactions service reports
 * a refusal as a 500 + `DefaultResponse`, so the client keeps its own placeholder on
 * `message` and the service's `Messages[]` on `details` — which is exactly why
 * `serviceMessageOf` alone is not enough (contract 10).
 */
const SERVICE_REFUSAL: APIError = {
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  endpoint: `/transactions-api${VALIDATION_ERRORS_PATH}`,
  details: validationErrorsFailureResponse().Messages,
};

/** A failure the service gave no readable reason for at all — only plumbing. */
const UNEXPLAINED_FAILURE: APIError = {
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  endpoint: `/transactions-api${VALIDATION_ERRORS_PATH}`,
  details: [CLIENT_FALLBACK_DETAILS.serverError],
};

describe('Epic file-validation-and-retry, Story 2: see which rows were rejected and why', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rowsByFileId.clear();

    // The service, as far as this section is concerned: it answers ONE address, only
    // for the file it was asked about, and complains loudly about anything else — so
    // a read of the wrong endpoint, or one that fails to identify the file, cannot
    // pass as a working implementation.
    mockGet.mockImplementation(
      async (endpoint: string, params?: QueryParams) => {
        const path = String(endpoint);
        if (!path.includes(VALIDATION_ERRORS_PATH)) {
          throw new Error(
            `Unexpected read of "${path}" — the rejected rows come from ` +
              `GET ${VALIDATION_ERRORS_PATH}, and the file itself arrives as a prop ` +
              `(see the implementation contract).`,
          );
        }

        const requestedId = Number(params?.FileLogId);
        const body = rowsByFileId.get(requestedId);
        if (body === undefined) {
          throw new Error(
            `Read of ${VALIDATION_ERRORS_PATH} asked for FileLogId=` +
              `"${String(params?.FileLogId)}", which no test fixture serves — the ` +
              `call must carry the file's own Id (served here: ` +
              `${JSON.stringify([...rowsByFileId.keys()])}).`,
          );
        }
        return body;
      },
    );
  });

  // AC-1 (FR1)
  it('lists every rejected row of a failed file with that row’s own recorded values, exactly as the source file held them', async () => {
    const file = failedFile();
    const rows = invalidRowsForEveryDefect();

    // Fixture preconditions, so each assertion below means what it says:
    // every row is identified by its own description...
    expect(new Set(rows.map(descriptionOf)).size).toBe(rows.length);
    // ...the row rejected for a MISSING reference genuinely has none to show, while
    // every other row carries all six of its non-account values...
    expect(rows.map((row) => recordedValuesOf(row).length)).toEqual([
      5, 6, 6, 6, 6,
    ]);
    // ...and the app's own C/D wording really would be a translation, so the
    // negative assertion at the end of this test is not vacuous.
    expect(transactionTypeLabel(TRANSACTION_TYPE_CREDIT_CODE)).not.toBe(
      TRANSACTION_TYPE_CREDIT_CODE,
    );
    expect(
      rows.filter(
        (row) => row.TransactionType === TRANSACTION_TYPE_CREDIT_CODE,
      ),
    ).toHaveLength(4);

    serveRowsFor(file, validationErrorsResponse(rows));

    renderRejectedRows(file);

    // One row per rejected row, plus the header row — pinned to the fixture size, so
    // a truncated or empty render cannot pass.
    await waitFor(() => {
      expect(
        within(screen.getByRole('table')).getAllByRole('row'),
      ).toHaveLength(rows.length + 1);
    });

    rows.forEach((fixture) => {
      const row = rowFor(descriptionOf(fixture));

      // Every recorded value scoped to its OWN row, printed as the file held it —
      // including the values that failed validation (an amount that is text, a date
      // that is not a date, a currency code the service does not accept).
      recordedValuesOf(fixture).forEach((value) => {
        expect(row).toHaveTextContent(value);
      });

      // The account number is the one masked value (AC-6 owns the reveal).
      expect(row).toHaveTextContent(lastFourDigitsOf(accountNumberOf(fixture)));
    });

    // The rejected type value the service named is shown as recorded, not softened.
    expect(
      rowFor(descriptionOf(rowRejectedFor(rows, 'TransactionType'))),
    ).toHaveTextContent(REJECTED_TRANSACTION_TYPE);

    // Nothing here is translated: the "Credit — money in" wording the imported-request
    // surfaces use is deliberately NOT applied to a row the user has to go and fix in
    // their own file (contract 6).
    expect(section()).not.toHaveTextContent(
      transactionTypeLabel(TRANSACTION_TYPE_CREDIT_CODE),
    );
  });

  // AC-2 (FR2)
  it('explains a missing reference, a non-numeric amount, an unreadable date and an unsupported currency in this app’s own fixed wording, and never in the service’s', async () => {
    const file = failedFile();
    const rows = invalidRowsForEveryDefect();
    serveRowsFor(file, validationErrorsResponse(rows));

    renderRejectedRows(file);

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    APP_OWNED_COLUMNS.forEach((column) => {
      const fixture = rowRejectedFor(rows, column);
      const row = rowFor(descriptionOf(fixture));

      // The app's fixed wording for that field, as one whole sentence, exactly as the
      // brief states it — not paraphrased and not truncated.
      expect(
        within(row).getByText(APP_OWNED_WORDING[column]),
      ).toBeInTheDocument();

      // The service's machine-ish text for a rule the APP owns never reaches the
      // user ("Row 4: column [Reference] failed rule NOT_NULL.").
      expect(row).not.toHaveTextContent(SERVICE_DEFECT_REASONS[column]);

      // One row, one explanation: no other field's wording is stuck on it too.
      APP_OWNED_COLUMNS.filter((other) => other !== column).forEach((other) => {
        expect(row).not.toHaveTextContent(APP_OWNED_WORDING[other]);
      });
    });

    // ...and none of that service text is anywhere else on the screen either.
    APP_OWNED_COLUMNS.forEach((column) => {
      expect(section()).not.toHaveTextContent(SERVICE_DEFECT_REASONS[column]);
    });
  });

  // AC-3 (FR3)
  it('shows the transactions service’s own reason for a transaction-type rejection word for word, judges no transaction type itself, and offers no accepted-type list', async () => {
    const file = failedFile();

    // The five defects this epic has wording rules for, plus the two shapes the
    // epic's recorded assumption warns about: a message the service did NOT attribute
    // to a column, and a row carrying no defect signal at all.
    const unattributed: ValidationErrorRow = {
      ...invalidRowWithMessageOnly(),
      Id: 6,
      Description: 'Vodacom airtime',
      AccountNumber: '1001-2034-5676',
    };
    const noSignal = invalidRowWithNoDefectSignal({
      Id: 7,
      Description: 'Takealot office chair',
      AccountNumber: '1001-2034-5677',
    });
    const rows = [...invalidRowsForEveryDefect(), unattributed, noSignal];

    // Fixture preconditions: the transaction-type row really is explained by the
    // SERVICE, the unattributed row really has a message but no column, and the last
    // row really has neither — so the assertions below cannot pass by accident.
    const typeDefect = rowRejectedFor(rows, 'TransactionType');
    expect(serviceReasonOf(typeDefect)).toBe(TRANSACTION_TYPE_DEFECT_REASON);
    expect(unattributed.ErrorColumn).toBeUndefined();
    expect(noSignal.ErrorColumn).toBeUndefined();
    expect(noSignal.ErrorMessage).toBeUndefined();
    expect(new Set(rows.map(descriptionOf)).size).toBe(rows.length);

    serveRowsFor(file, validationErrorsResponse(rows));

    renderRejectedRows(file);

    await waitFor(() => {
      expect(
        within(screen.getByRole('table')).getAllByRole('row'),
      ).toHaveLength(rows.length + 1);
    });

    // --- FR3: the service's sentence, verbatim, on the row it belongs to --------
    const typeRow = rowFor(descriptionOf(typeDefect));
    expect(
      within(typeRow).getByText(TRANSACTION_TYPE_DEFECT_REASON),
    ).toBeInTheDocument();

    // The app said nothing of its own about that row: none of the four messages it
    // owns is applied to a transaction-type defect...
    APP_OWNED_COLUMNS.forEach((column) => {
      expect(typeRow).not.toHaveTextContent(APP_OWNED_WORDING[column]);
    });
    // ...and it invented no rule sentence of its own for the field either.
    expect(section()).not.toHaveTextContent(/transaction type must/i);

    // The explanation belongs to the row, not to the screen: the row rejected over
    // its currency is not also told about a transaction type.
    expect(
      rowFor(descriptionOf(rowRejectedFor(rows, 'Currency'))),
    ).not.toHaveTextContent(TRANSACTION_TYPE_DEFECT_REASON);

    // --- the app only speaks where it owns the rule -----------------------------
    // A defect the service described but did not attribute to a column: its own words
    // reach the user, and the app does not guess which value looked wrong (this row's
    // currency is the unsupported one, and it is NOT explained as such).
    const unattributedRow = rowFor(descriptionOf(unattributed));
    expect(
      within(unattributedRow).getByText(serviceReasonOf(unattributed)),
    ).toBeInTheDocument();
    APP_OWNED_COLUMNS.forEach((column) => {
      expect(unattributedRow).not.toHaveTextContent(APP_OWNED_WORDING[column]);
    });

    // A row with no defect signal at all is still listed with its own values, and no
    // reason is invented for it.
    const noSignalRow = rowFor(descriptionOf(noSignal));
    recordedValuesOf(noSignal).forEach((value) => {
      expect(noSignalRow).toHaveTextContent(value);
    });
    APP_OWNED_COLUMNS.forEach((column) => {
      expect(noSignalRow).not.toHaveTextContent(APP_OWNED_WORDING[column]);
    });
    expect(noSignalRow).not.toHaveTextContent(TRANSACTION_TYPE_DEFECT_REASON);

    // --- no accepted-type list is offered anywhere -------------------------------
    // Nothing to choose from: this section holds no picker, menu or option list, so
    // it cannot be presenting a set of acceptable transaction types.
    (
      ['combobox', 'listbox', 'option', 'menu', 'menuitem', 'radio'] as const
    ).forEach((role) => {
      expect(within(section()).queryAllByRole(role)).toHaveLength(0);
    });
  });

  // AC-4
  it('shows no rejected-rows list at all for a file that has not failed validation, and says so plainly when a failed file’s rows cannot be read as rows', async () => {
    // --- a file that did not fail validation ------------------------------------
    const imported = fileLogWithStatus(FILE_STATUS_IMPORTED);
    // Nothing is served for it: a read would fail loudly, and a section of any kind
    // would be found by the assertions below.
    const importedView = renderRejectedRows(imported);

    expect(querySection()).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    importedView.unmount();

    // --- a failed file whose rows will not parse --------------------------------
    const unparseableFile = failedFile({ Id: 5002 });
    const unparseable = unparseableValidationErrorsResponse();
    serveRowsFor(unparseableFile, unparseable);

    const unparseableView = renderRejectedRows(unparseableFile);

    const unparseableReport = await screen.findByRole('alert');
    expect(unparseableReport).toHaveTextContent(UNREADABLE_ROWS_WORDING);
    // Not an empty table, and not the raw payload dumped on screen either.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(section()).not.toHaveTextContent(
      unparseable.ValidationErrors.JsonArray,
    );

    unparseableView.unmount();

    // --- a failed file whose rows parse into something that is NOT a list -------
    // The case a bare `try { JSON.parse } catch {}` sails straight past.
    const nonArrayFile = failedFile({ Id: 5003 });
    serveRowsFor(nonArrayFile, nonArrayValidationErrorsResponse());

    renderRejectedRows(nonArrayFile);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      UNREADABLE_ROWS_WORDING,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // AC-5
  // Runtime-only: that the REST of the file's page stays usable is page composition,
  // verified by story 1's browser spec and on the manual checklist. What is pinned
  // here is that every state stays inside this section and always offers a way on.
  it('announces the wait while the rows are being read, and reports a failed read in the service’s own wording with one action that asks for them again', async () => {
    const user = userEvent.setup();
    const file = failedFile();
    const rows = invalidRowsForEveryDefect();
    const firstRow = rowRejectedFor(rows, 'Currency');
    serveRowsFor(file, validationErrorsResponse(rows));

    // --- while the read is in flight --------------------------------------------
    // Only the FIRST read is held open, so every read after it still goes through the
    // service stand-in above (which insists on the file's own Id).
    const inFlight = createDeferred<ValidationErrors>();
    mockGet.mockImplementationOnce(() => inFlight.promise);

    const loadingView = renderRejectedRows(file);

    // The wait is ANNOUNCED, not merely drawn — a shape says nothing to a screen
    // reader (contract 10).
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    inFlight.resolve(validationErrorsResponse(rows));

    expect(
      await screen.findByText(descriptionOf(firstRow)),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    loadingView.unmount();

    // --- the read was refused, with the service's own reason ---------------------
    mockGet.mockRejectedValueOnce(SERVICE_REFUSAL);

    const failedView = renderRejectedRows(file);

    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent(VALIDATION_ERRORS_FAILURE_MESSAGE);
    // Never the client's own plumbing, which is all `message` carried on this 500.
    expect(failure).not.toHaveTextContent(CLIENT_FALLBACK_MESSAGES.serverError);
    // The failure is confined to this section, which is still there and still named.
    expect(within(section()).getByRole('alert')).toBe(failure);

    // ONE action, which asks for the rows again — a failed read is not a dead end.
    await user.click(
      within(failure).getByRole('button', { name: /try again/i }),
    );

    expect(
      await screen.findByText(descriptionOf(firstRow)),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    failedView.unmount();

    // --- refused with nothing readable from the service -------------------------
    mockGet.mockRejectedValueOnce(UNEXPLAINED_FAILURE);

    renderRejectedRows(file);

    const unexplained = await screen.findByRole('alert');
    // Plain wording of the app's own — never the client's internal placeholders,
    // from either place a failure can carry them (project.md NFR-base-5).
    expect(unexplained).not.toHaveTextContent(
      CLIENT_FALLBACK_MESSAGES.serverError,
    );
    expect(unexplained).not.toHaveTextContent(
      CLIENT_FALLBACK_DETAILS.serverError,
    );
    expect(
      within(unexplained).getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
  });

  // AC-6
  it('masks every rejected row’s account number to its last four digits until an explicit action on that one row reveals the rest', async () => {
    const user = userEvent.setup();
    const file = failedFile();
    const rows = invalidRowsForEveryDefect();
    const revealed = rowRejectedFor(rows, 'Currency');
    const untouched = rowRejectedFor(rows, 'Amount');

    // Fixture precondition: each row's last four digits identify exactly one row, so
    // "this row is masked" cannot be satisfied by another row's digits.
    expect(
      new Set(rows.map((row) => lastFourDigitsOf(accountNumberOf(row)))).size,
    ).toBe(rows.length);

    serveRowsFor(file, validationErrorsResponse(rows));

    renderRejectedRows(file);

    await waitFor(() => {
      expect(
        within(screen.getByRole('table')).getAllByRole('row'),
      ).toHaveLength(rows.length + 1);
    });

    // --- masked everywhere, until asked otherwise (POPIA) ------------------------
    rows.forEach((fixture) => {
      const row = rowFor(descriptionOf(fixture));
      const accountNumber = accountNumberOf(fixture);

      expect(row).toHaveTextContent(lastFourDigitsOf(accountNumber));
      expect(row).not.toHaveTextContent(accountNumber);
      // Not parked in a title or data- attribute either: that leaks exactly as surely
      // as printing it (see @/components/requests/MaskedAccountNumber).
      expect(row.outerHTML).not.toContain(accountNumber);
    });

    // One row at a time: a reveal-everything control is forbidden outright.
    expect(
      screen.queryAllByRole('button', {
        name: /(reveal|show|unmask) (all|every)/i,
      }),
    ).toHaveLength(0);

    // --- the explicit action, on one row ----------------------------------------
    const reveal = within(rowFor(descriptionOf(revealed))).getByRole('button', {
      name: /account number/i,
    });
    // The control says what it acts on AND what it does — a bare icon with no name,
    // or a name that never mentions the account number, fails here.
    expect(reveal).toHaveAccessibleName(/reveal|show/i);

    await user.click(reveal);

    await waitFor(() => {
      expect(rowFor(descriptionOf(revealed))).toHaveTextContent(
        accountNumberOf(revealed),
      );
    });

    // Every other row stays masked — the reveal belongs to the row it was made on.
    const stillMasked = rowFor(descriptionOf(untouched));
    expect(stillMasked).toHaveTextContent(
      lastFourDigitsOf(accountNumberOf(untouched)),
    );
    expect(stillMasked).not.toHaveTextContent(accountNumberOf(untouched));
    expect(stillMasked.outerHTML).not.toContain(accountNumberOf(untouched));
  });
});
