/**
 * Story Metadata:
 * - Epic: files-view-redesign — Story 4: the import preview, with the rejects appended
 *   at the back
 * - Route: /upload/file
 * - Target File: web/src/components/files/ImportPreview.tsx
 * - Page Action: modify_existing (the section already exists; this re-arranges it)
 *
 * THE ONE GENUINE BEHAVIOURAL CHANGE IN THIS EPIC, and this file owns it. Everything
 * else in `files-view-redesign` is presentation a human judges; the reordering is
 * something a person can point at: the preview stops interleaving accepted and rejected
 * rows in raw file order and appends every rejected row as its own headed block at the
 * back (R14/R15).
 *
 * Covers the five criteria this story tags `vitest`:
 * - AC-1 — every will-import row is listed FIRST, in the file's own order among
 *   themselves; every rejected row FOLLOWS at the back, in the file's own order among
 *   themselves. The two are never interleaved. Asserted as the ACTUAL RENDERED SEQUENCE
 *   of the file's own rows, not as membership of two groups.
 * - AC-2 — the rejected block is unmistakably its own section, with its own accessible
 *   name, holding exactly the rejected rows and none of the will-import ones.
 * - AC-4 — every row keeps its `Will import` / `Rejected` verdict as words, and every
 *   row's values and its stated reason for rejection are unchanged by the move.
 * - AC-5 — account numbers still show only their last four digits, and the full number
 *   is still revealed ONE REJECTED ROW AT A TIME by a deliberate action; no reveal-all.
 * - AC-6 — the existing honest answers (validation not run yet, the file unreadable,
 *   the rejected rows unreadable, the row count disagreeing with the recorded one) all
 *   still read with their existing wording.
 *
 * AC-3 (full-bleed ruled treatment, hairline row rules, tracked mono column heads) is
 * tagged `none`: it is visual and typographic judgement that only a human can make, it
 * is on this story's manual checklist, and NOTHING here asserts a class string, a
 * computed style or a font-family in its place.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 *  1. **REORDER AT RENDER, NEVER AT PARSE (the R14 trap).**
 *     `web/src/lib/files/importPreviewRows.ts` must keep emitting ONE ROW PER LINE IN
 *     FILE ORDER, with any unmatchable rejection still appended after the file's lines:
 *     `web/src/lib/files/correctionCsv.ts` derives the correction download from exactly
 *     that array (`rowsToFixIn` filters it, preserving order), and the download's row
 *     scope and order are protected behaviour (BR2). The arrangement below is
 *     `ImportPreview`'s own presentation decision over rows it already holds. AC-1
 *     asserts both halves of this: the screen's new order, and the parse layer's
 *     unchanged one.
 *  2. **THE ARRANGEMENT.** In the order the page renders them:
 *       a. every row the preview labels `Will import`, in the file's own relative order
 *          among themselves;
 *       b. then every rejected row, in the file's own relative order among themselves;
 *       c. and, at the very back of (b), any rejection that matches no line in the file
 *          (BR9) — it is a rejected row in its own right and belongs behind the file's
 *          own rejected lines.
 *     No will-import row may appear after a rejected one.
 *  3. **THE REJECTED BLOCK IS A NAMED SECTION OF THE LISTING.** Exactly one container
 *     inside the preview carries an accessible name that BEGINS with the word
 *     "Rejected" (e.g. `Rejected rows`), and it holds every rejected row and no other.
 *     Whether that container is a second `rowgroup` of one table, a table of its own, or
 *     a labelled region is the implementation's call — R15 only requires that the block
 *     reads as a distinct section appended at the close of the will-import listing. What
 *     is NOT optional is that the block is addressable BY NAME: the small capitalised
 *     heading a sighted reader sees must exist in the accessibility tree too, or the
 *     boundary that keeps a rejected row from being taken for a will-import one exists
 *     only in ink. (The hairline above it, the tracking and the mono column heads are
 *     AC-3 — judged by eye, asserted nowhere here.)
 *  4. **THE CAPTION MUST STOP SAYING "in the order the file holds them".** The shipped
 *     `TABLE_CAPTION` describes the listing as being in the file's own order. After this
 *     story that is false, and a stale caption is a quiet lie to precisely the reader who
 *     cannot see the two blocks. Re-word it; AC-1 insists the old claim is gone.
 *  5. **TWO READS, AND ONLY TWO** — `downloadSubmittedFile(file.Id)` and
 *     `fetchFileValidationErrors(file.Id)` + `rejectedRowsIn`, both through
 *     `web/src/lib/api/files.ts` (CLAUDE.md §2). The stub below answers those two
 *     addresses for the file it was asked about and fails loudly on anything else, so
 *     the service's GENERATED error file and `/v1/file-logs/data` cannot pass as a
 *     working implementation. This epic adds no read and removes none.
 *  6. **NOTHING ELSE ABOUT A ROW CHANGES.** The two verdict labels (`Will import` /
 *     `Rejected` — never "Imported", BR2), every row's values as its source held them,
 *     the untranslated transaction type on a rejected row, the shared defect wording
 *     (`@/lib/files/defectWording`), the per-row account-number reveal through the one
 *     masking component (`@/components/requests/MaskedAccountNumber`) with NO reveal-all
 *     (POPIA), the two plain-language counts, and every honest-fallback state all read
 *     exactly as they do today.
 *  7. **BR3, for the sibling specs.** `epic-import-preview-story-2-…` and its browser
 *     twin assert the CURRENT interleaved file order (and count `row` elements across
 *     the whole table). Re-point them to the per-block relative order plus the block
 *     boundary — same strength, new arrangement. Any sibling assertion about a row's
 *     verdict, its values or its correctability stays exactly as strong.
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy). The CSV reader, the matching module, the
 * shared defect wording, the masking component and the display rules are all the REAL
 * production code. Every byte of the file and every validation-errors body comes from
 * the project-wide `@/mocks/data/submitted-file` fixture the Playwright layer shares —
 * no CSV text and no wire body is authored here, so the two layers cannot drift onto
 * files that describe different rows.
 *
 * The canonical fixture rejects lines 3 AND 5 of 5, so the arrangement this story asks
 * for (`1, 2, 4, 3, 5`) is observably DIFFERENT from the file's own order. The fixture
 * proves the reordering rather than coinciding with it.
 *
 * Runtime-only / manual: the ruled treatment itself (AC-3), the hairline above the
 * rejected heading, and that a reader can still find a row to correct as quickly in the
 * reordered listing (the feature NFR) are judged on the manual checklist.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): today the preview
 * renders one interleaved file-order table with no named rejected block.
 */
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The section under test.
import { ImportPreview } from '@/components/files/ImportPreview';
// Real production toast composition (not mocked) — the same one the root layout wraps
// every signed-in screen in, so the section is rendered as the app mounts it.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { apiClient, get } from '@/lib/api/client';
// The endpoints the preview may read. Importing them is what routes the stub: a call to
// any other address is a failure, not a silent pass (contract 5).
import {
  FILE_BULK_ERRORS_DOWNLOAD_ENDPOINT,
  FILE_DOWNLOAD_ENDPOINT,
  FILE_VALIDATION_ERRORS_ENDPOINT,
} from '@/lib/api/files';
// The correction download's row scope and order (BR2) — derived from the parse layer,
// which contract 1 forbids this story from reordering.
import { rowsToFixIn } from '@/lib/files/correctionCsv';
// The SHARED defect wording every rejected-row surface reads from, so this file states
// no defect sentence of its own.
import { defectWordingFor } from '@/lib/files/defectWording';
// The parse layer itself: asserted here to still emit FILE ORDER (contract 1).
import { importPreviewRows } from '@/lib/files/importPreviewRows';
import {
  lastFourDigitsOf,
  transactionTypeLabel,
} from '@/lib/transactions/display';

// Project-wide fixtures, shared with the Playwright layer.
import {
  FILE_STATUS_IMPORTED,
  FILE_STATUS_UPLOADED,
  fileLogWithStatus,
} from '@/mocks/data/file-log';
import {
  MISREPORTED_RECORD_COUNT,
  MULTI_DEFECT_LINE,
  UNMATCHABLE_REFERENCE,
  UNTERMINATED_QUOTE_FILE_BODY,
  previewWithCountMismatch,
  previewWithMultiDefectRow,
  previewWithRejectedRows,
  previewWithUnmatchableRejection,
  submittedFileBlob,
} from '@/mocks/data/submitted-file';
import {
  TRANSACTION_TYPE_DEFECT_REASON,
  unparseableValidationErrorsResponse,
} from '@/mocks/data/validation-error';

import type { FileLog } from '@/mocks/data/file-log';
import type {
  SubmittedFilePreview,
  SubmittedFileRow,
} from '@/mocks/data/submitted-file';
import type { ValidationErrorRow } from '@/mocks/data/validation-error';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;
const mockGet = get as unknown as ReturnType<typeof vi.fn>;

/** The two verdicts, and the word that must never be one of them (BR2, contract 6). */
const WILL_IMPORT_LABEL = 'Will import';
const REJECTED_LABEL = 'Rejected';

/**
 * How the rejected block names itself (contract 3). It NAMES the block — the name begins
 * with the word "Rejected" — rather than merely mentioning rejection somewhere inside a
 * longer sentence, which is what the section's own description already does.
 */
const REJECTED_BLOCK_NAME = /^rejected\b/i;

/**
 * The claim the listing's own description may no longer make (contract 4) — quoted from
 * the shipped `TABLE_CAPTION`, which this story falsifies.
 */
const FILE_ORDER_CLAIM = /in the order the file holds them/i;

/**
 * THE EXISTING WORDING of the preview's honest answers (AC-6), quoted from the shipped
 * component. This story re-arranges the listing; it re-words none of these, and each is
 * matched on a phrase distinctive enough that a re-wording would be caught.
 */
const UNREADABLE_FILE_WORDING = /could not be read as a CSV file/i;
const UNREADABLE_REJECTED_ROWS_WORDING =
  /the rejected rows for this file could not be read/i;
const countMismatchWording = (parsed: number, reported: string): RegExp =>
  new RegExp(
    `holds ${String(parsed)} rows, but the service reports ${reported} records`,
    'i',
  );

/** The one control that asks for the preview again — unchanged by this story. */
const LOAD_THE_PREVIEW_AGAIN = 'Load the preview again';

/** How many data lines {@link UNTERMINATED_QUOTE_FILE_BODY} holds. */
const UNREADABLE_FIXTURE_LINE_COUNT = 3;

/**
 * What the preview must still state about its counts, anchored to the WHOLE of an
 * element's text so a wrapper holding the listing too cannot satisfy them by accident.
 */
const willImportStatement = (count: number): RegExp =>
  new RegExp(`^\\s*${String(count)} rows? will import\\.?\\s*$`, 'i');

const rejectedStatement = (count: number): RegExp =>
  new RegExp(
    `^\\s*${count === 0 ? '(0|no)' : String(count)} rows? (were )?rejected\\.?\\s*$`,
    'i',
  );

/** What a test has arranged for the service to answer with, for one file. */
interface Served {
  preview: SubmittedFilePreview;
  /** Overrides `GET /v1/files/download`; defaults to the fixture's own bytes. */
  download?: () => Promise<unknown>;
  /** Overrides `GET /v1/files/validation-errors`; defaults to the fixture's own body. */
  validationErrors?: () => Promise<unknown>;
}

const servedByFileId = new Map<number, Served>();

/** Registers what the service answers with for a file, and hands the fixture back. */
const serve = (
  preview: SubmittedFilePreview,
  overrides: Omit<Served, 'preview'> = {},
): SubmittedFilePreview => {
  servedByFileId.set(preview.file.Id, { preview, ...overrides });
  return preview;
};

/**
 * The `FileLogId` a read carried, whether it travelled in `apiClient`'s config (the
 * binary download), as `get`'s parameters, or already in the query string.
 */
const fileLogIdIn = (path: string, carrier: unknown): string => {
  const inPath = new URLSearchParams(path.split('?')[1] ?? '').get('FileLogId');
  if (inPath !== null) {
    return inPath;
  }
  if (typeof carrier !== 'object' || carrier === null) {
    return '';
  }
  const record = carrier as Record<string, unknown>;
  const params =
    typeof record.params === 'object' && record.params !== null
      ? (record.params as Record<string, unknown>)
      : record;
  const value = params.FileLogId;
  return value === undefined ? '' : String(value);
};

/**
 * The transactions service, as far as this section is concerned (contract 5): two
 * addresses, for the file it was asked about, and a loud refusal for anything else — so a
 * preview that reached for the service's generated error file, for
 * `/v1/file-logs/data`, or for a file it failed to identify cannot pass as working.
 */
const respondTo = (endpoint: unknown, carrier: unknown): Promise<unknown> => {
  const path = String(endpoint);

  if (path.startsWith(FILE_BULK_ERRORS_DOWNLOAD_ENDPOINT)) {
    return Promise.reject(
      new Error(
        `The preview must not read the service's GENERATED error file ("${path}") — ` +
          'it parses the ORIGINAL submitted file from GET /v1/files/download.',
      ),
    );
  }

  const known =
    path.startsWith(FILE_DOWNLOAD_ENDPOINT) ||
    path.startsWith(FILE_VALIDATION_ERRORS_ENDPOINT);
  if (!known) {
    return Promise.reject(
      new Error(
        `Unexpected read of "${path}" — the preview reads the submitted file and its ` +
          'rejected-row overlay, and nothing else. This story adds no read and ' +
          'removes none (contract 5).',
      ),
    );
  }

  const askedFor = fileLogIdIn(path, carrier);
  const served = servedByFileId.get(Number(askedFor));
  if (served === undefined) {
    return Promise.reject(
      new Error(
        `Read of "${path}" asked for FileLogId="${askedFor}", which no fixture ` +
          `serves — every read must carry the file's own Id (served here: ` +
          `${JSON.stringify([...servedByFileId.keys()])}).`,
      ),
    );
  }

  if (path.startsWith(FILE_DOWNLOAD_ENDPOINT)) {
    return served.download
      ? served.download()
      : Promise.resolve(served.preview.blob());
  }
  return served.validationErrors
    ? served.validationErrors()
    : Promise.resolve(served.preview.validationErrors);
};

/** The section as the root layout always mounts it: inside the toast composition. */
const previewTree = (file: FileLog, refreshSignal: number) => (
  <ToastProvider>
    <ImportPreview file={file} refreshSignal={refreshSignal} />
    <ToastContainer />
  </ToastProvider>
);

const renderImportPreview = (file: FileLog, refreshSignal = 0) =>
  render(previewTree(file, refreshSignal));

/** The preview section itself — every state this story touches lives inside it. */
const section = (): HTMLElement =>
  screen.getByRole('region', { name: /preview/i });

/** The same, for asserting the section is not there at all (AC-6). */
const querySection = (): HTMLElement | null =>
  screen.queryByRole('region', { name: /preview/i });

/**
 * Every row of the listing, in the order the page renders them — across however many
 * tables or row groups the two blocks are drawn as, since contract 3 leaves that to the
 * implementation and nothing here depends on it.
 */
const listedRows = (): HTMLElement[] => within(section()).getAllByRole('row');

/**
 * Waits for the listing to be drawn, without caring how many tables it is drawn as —
 * `getByRole('table')` would fail a legitimate block-per-table implementation
 * (contract 3) for the wrong reason.
 */
const findListedRows = (): Promise<HTMLElement[]> =>
  within(section()).findAllByRole('row');

/**
 * The ONE row carrying `reference`. Required to be unique, so a widened match can never
 * quietly select a different row and so "listed once" stays a real claim — and so no row
 * is ever identified by its position, which is exactly what this story changes.
 */
const rowFor = (reference: string): HTMLElement => {
  const rows = listedRows().filter((row) =>
    row.textContent?.includes(reference),
  );
  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one listed row carrying "${reference}", found ` +
        `${String(rows.length)} — every line of the file, and every rejected row ` +
        'that matches no line, is listed exactly once (contract 2).',
    );
  }
  return rows[0];
};

/**
 * The order the listing actually renders `references` in. Each row is located by the
 * reference it carries rather than by its index, and a row carrying two of them is a
 * failure rather than an ambiguous pass.
 */
const listingOrderOf = (references: readonly string[]): string[] => {
  const seen: string[] = [];
  listedRows().forEach((row) => {
    const carried = references.filter((reference) =>
      row.textContent?.includes(reference),
    );
    if (carried.length > 1) {
      throw new Error(
        `One listed row carries more than one of the file's references ` +
          `(${carried.join(', ')}) — a row of the preview is one row of the file.`,
      );
    }
    if (carried.length === 1) {
      seen.push(carried[0]);
    }
  });
  return seen;
};

/** Every reference the file's own lines carry, in FILE order. */
const fileOrderOf = (preview: SubmittedFilePreview): string[] =>
  preview.rows.map((row) => row.Reference);

/** Every reference the preview must label `Rejected`, in the order contract 2 asks for:
 * the file's own rejected lines in their own relative order, then any rejection with no
 * line of its own. */
const rejectedOrderOf = (preview: SubmittedFilePreview): string[] => [
  ...preview.rejectedRows.map((row) => row.Reference),
  ...preview.unmatchableRejections.map((rejection) =>
    String(rejection.Reference),
  ),
];

/** The whole arrangement contract 2 asks for, derived from the fixture's own pre-computed
 * R14 partition rather than restated by hand. */
const arrangedOrderOf = (preview: SubmittedFilePreview): string[] => [
  ...preview.willImportRows.map((row) => row.Reference),
  ...rejectedOrderOf(preview),
];

/**
 * The rejected block, as a named section of the listing (contract 3).
 *
 * The name is what is required; the container's ROLE is not, so the three roles a block
 * of a listing can legitimately have are all looked for and EXACTLY ONE match is
 * demanded. Where a container and something inside it are both named, the innermost is
 * the block — the section's own description mentions rejected rows too, and that must
 * not be mistaken for the heading this criterion is about.
 */
const rejectedBlock = (): HTMLElement => {
  const scope = within(section());
  const named = [
    ...scope.queryAllByRole('rowgroup', { name: REJECTED_BLOCK_NAME }),
    ...scope.queryAllByRole('table', { name: REJECTED_BLOCK_NAME }),
    ...scope.queryAllByRole('region', { name: REJECTED_BLOCK_NAME }),
  ];
  const innermost = named.filter(
    (element) =>
      !named.some((other) => other !== element && element.contains(other)),
  );
  if (innermost.length !== 1) {
    throw new Error(
      `Expected exactly one section of the listing named "Rejected…", found ` +
        `${String(innermost.length)}. The rejected rows are appended as their own ` +
        'named block, so a rejected row can never be taken for one still sitting ' +
        'among the rows that will import (contract 3).',
    );
  }
  return innermost[0];
};

/**
 * The one row carrying `reference` INSIDE the appended rejected block.
 *
 * Every assertion about a rejected row goes through here rather than through
 * {@link rowFor}, so "this row still says exactly what it said before" is asserted of the
 * row where the move actually put it — the same strength, in the new arrangement (BR3).
 */
const rejectedRowFor = (reference: string): HTMLElement => {
  const block = rejectedBlock();
  const row = rowFor(reference);
  if (!block.contains(row)) {
    throw new Error(
      `The rejected row carrying "${reference}" is not inside the appended rejected ` +
        'block — every rejected row is listed there, and nowhere else (contract 2).',
    );
  }
  return row;
};

/**
 * The one element that states `pattern` and nothing else. An identical wrapper around
 * the sentence matches too, so the innermost match is the statement itself.
 */
const statedOnce = (pattern: RegExp): HTMLElement => {
  const saying = within(section()).getAllByText(pattern);
  const innermost = saying.filter(
    (element) =>
      !saying.some((other) => other !== element && element.contains(other)),
  );
  if (innermost.length !== 1) {
    throw new Error(
      `Expected the preview to state ${String(pattern)} exactly once, found ` +
        `${String(innermost.length)} statements of it.`,
    );
  }
  return innermost[0];
};

/** The file's line `lineNumber`, 1-based as the fixture numbers them. */
const lineOf = (
  preview: SubmittedFilePreview,
  lineNumber: number,
): SubmittedFileRow => preview.rows[lineNumber - 1];

/** The one rejection the fixture placed on `column`, insisted on rather than assumed. */
const rejectionOn = (
  preview: SubmittedFilePreview,
  column: string,
): ValidationErrorRow => {
  const matches = preview.rejections.filter(
    (rejection) => rejection.ErrorColumn === column,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Fixture precondition failed: expected exactly one rejection on "${column}", ` +
        `found ${String(matches.length)} (see @/mocks/data/submitted-file).`,
    );
  }
  return matches[0];
};

/** The full account number a fixture row carries — the value the app must mask. */
const accountNumberOf = (row: { AccountNumber?: string }): string => {
  const { AccountNumber } = row;
  if (typeof AccountNumber !== 'string' || AccountNumber === '') {
    throw new Error(
      'Fixture precondition failed: every row used here carries a full, unmasked ' +
        'AccountNumber — masking can only be proved if the mock hands the component ' +
        'something to mask (see @/mocks/data/submitted-file).',
    );
  }
  return AccountNumber;
};

/** A row showing four digits and nothing more of its account number (POPIA). */
const expectMasked = (row: HTMLElement, accountNumber: string): void => {
  expect(row).toHaveTextContent(lastFourDigitsOf(accountNumber));
  // Nowhere in the row's markup — a value parked in a title or data- attribute leaks
  // exactly as surely as one printed in a cell.
  expect(row.outerHTML).not.toContain(accountNumber);
};

describe('Epic files-view-redesign, Story 4: the import preview, with the rejects appended at the back', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    servedByFileId.clear();

    mockApiClient.mockImplementation((endpoint: unknown, config: unknown) =>
      respondTo(endpoint, config),
    );
    mockGet.mockImplementation((endpoint: unknown, params: unknown) =>
      respondTo(endpoint, params),
    );
  });

  // AC-1 — the reordering itself, as the rendered sequence of the file's own rows.
  it('lists every will-import row first and every rejected row at the back, each in the file’s own relative order, without reordering the rows the correction download is built from', async () => {
    const preview = serve(previewWithRejectedRows());

    // FIXTURE PRECONDITIONS, so this test cannot pass by coincidence. The file's lines
    // 3 and 5 are the rejected ones, so the arrangement asked for (1, 2, 4, 3, 5) is
    // observably DIFFERENT from the file's own order...
    expect(preview.rejectedLineNumbers).toEqual([3, 5]);
    expect(arrangedOrderOf(preview)).toEqual(
      [1, 2, 4, 3, 5].map((line) => lineOf(preview, line).Reference),
    );
    expect(arrangedOrderOf(preview)).not.toEqual(fileOrderOf(preview));

    // ...and THE PARSE LAYER STILL EMITS FILE ORDER (contract 1, the R14 trap). The
    // correction download filters that array and its row order is protected behaviour
    // (BR2), so the reorder must happen at render and nowhere else.
    const parsed = importPreviewRows(preview.rows, preview.rejections);
    expect(parsed.rows.map((row) => row.values.Reference)).toEqual(
      fileOrderOf(preview),
    );
    expect(rowsToFixIn(parsed).map((row) => row.values.Reference)).toEqual(
      preview.rejectedRows.map((row) => row.Reference),
    );

    renderImportPreview(preview.file);

    await findListedRows();

    // THE ARRANGEMENT ON SCREEN: will-import rows first in the file's own relative
    // order, then the rejected ones in theirs. Every line of the file is accounted for
    // exactly once, so this is not merely "the two groups exist" — it is the sequence.
    await waitFor(() => {
      expect(listingOrderOf(fileOrderOf(preview))).toEqual(
        arrangedOrderOf(preview),
      );
    });

    // NEVER INTERLEAVED, said the other way round: no will-import row appears after a
    // rejected one.
    const rendered = listingOrderOf(fileOrderOf(preview));
    const firstRejected = rendered.indexOf(rejectedOrderOf(preview)[0]);
    preview.willImportRows.forEach((row) => {
      expect(rendered.indexOf(row.Reference)).toBeLessThan(firstRejected);
    });

    // The two plain-language counts still state the same numbers: this is an
    // arrangement, not a re-count.
    expect(
      statedOnce(willImportStatement(preview.counts.willImport)),
    ).toBeInTheDocument();
    expect(
      statedOnce(rejectedStatement(preview.counts.rejected)),
    ).toBeInTheDocument();

    // ...and the listing no longer describes itself as being in the file's own order,
    // which this story falsifies (contract 4).
    expect(section()).not.toHaveTextContent(FILE_ORDER_CLAIM);

    cleanup();

    // The same arrangement where the rejected block has a TAIL: a line the service
    // reported twice is still one rejected row, and a rejection matching no line at all
    // belongs behind the file's own rejected lines (contract 2c).
    const withTail = serve(previewWithMultiDefectRow());

    expect(withTail.rejectedLineNumbers).toEqual([MULTI_DEFECT_LINE, 4]);
    expect(withTail.unmatchableRejections).toHaveLength(1);
    expect(arrangedOrderOf(withTail)).toEqual([
      ...[1, 3, 5].map((line) => lineOf(withTail, line).Reference),
      ...[MULTI_DEFECT_LINE, 4].map((line) => lineOf(withTail, line).Reference),
      UNMATCHABLE_REFERENCE,
    ]);

    renderImportPreview(withTail.file);

    await findListedRows();

    await waitFor(() => {
      expect(
        listingOrderOf([...fileOrderOf(withTail), UNMATCHABLE_REFERENCE]),
      ).toEqual(arrangedOrderOf(withTail));
    });
  });

  // AC-2 — the block boundary, as something the accessibility tree carries too.
  it('appends the rejected rows as their own named section holding every rejected row and none of the will-import ones', async () => {
    const preview = serve(previewWithUnmatchableRejection());

    // Fixture preconditions: one rejected line the match found, one rejection with no
    // line of its own, and four rows that will import.
    expect(preview.rejectedLineNumbers).toEqual([3]);
    expect(preview.unmatchableRejections).toHaveLength(1);
    expect(preview.willImportRows).toHaveLength(4);

    renderImportPreview(preview.file);

    await findListedRows();

    await waitFor(() => {
      expect(rejectedBlock()).toBeInTheDocument();
    });

    const block = rejectedBlock();

    // EVERY REJECTED ROW IS INSIDE THE BLOCK — the file's own rejected line and the
    // rejection that matches no line alike — and each still says it was rejected.
    rejectedOrderOf(preview).forEach((reference) => {
      const row = rowFor(reference);
      expect(block).toContainElement(row);
      expect(within(row).getByText(REJECTED_LABEL)).toBeInTheDocument();
    });

    // ...AND NO WILL-IMPORT ROW IS, so no rejected row can be taken for one still
    // sitting among the rows that will import.
    preview.willImportRows.forEach((row) => {
      const listed = rowFor(row.Reference);
      expect(block).not.toContainElement(listed);
      expect(within(listed).getByText(WILL_IMPORT_LABEL)).toBeInTheDocument();
    });
    expect(within(block).queryAllByText(WILL_IMPORT_LABEL)).toHaveLength(0);

    // The block is APPENDED: it holds the tail of the listing, not a slice out of the
    // middle of it.
    expect(listingOrderOf(fileOrderOf(preview))).toEqual(
      arrangedOrderOf(preview).filter(
        (reference) => reference !== UNMATCHABLE_REFERENCE,
      ),
    );
  });

  // AC-4 — the move changes what a row is next to, and nothing about what it says.
  it('keeps every row’s verdict wording, its own values and its stated reason for rejection exactly as they read before the move', async () => {
    const preview = serve(previewWithRejectedRows());
    const willImport = lineOf(preview, 2);
    const appOwned = rejectionOn(preview, 'Currency');
    const appOwnedLine = lineOf(preview, 3);
    const serviceOwnedLine = lineOf(preview, 5);

    // Fixture preconditions: the will-import row carries a type code the app HAS plain
    // wording for, and the rejected row carries one too — so "translated here, not
    // there" is a real claim rather than a vacuous one...
    expect(transactionTypeLabel(willImport.TransactionType)).not.toBe(
      willImport.TransactionType,
    );
    expect(transactionTypeLabel(appOwnedLine.TransactionType)).not.toBe(
      appOwnedLine.TransactionType,
    );
    // ...and the service's own machine-phrased text for the app-owned rule differs from
    // the app's sentence, so "never reaches the user" is testable.
    expect(defectWordingFor(appOwned)).not.toBe(appOwned.ErrorMessage);

    renderImportPreview(preview.file);

    await findListedRows();

    // A WILL-IMPORT ROW, unchanged: the honest verdict as words, its own values, and its
    // transaction type in the app's plain language.
    const willImportRow = rowFor(willImport.Reference);
    expect(
      within(willImportRow).getByText(WILL_IMPORT_LABEL),
    ).toBeInTheDocument();
    expect(
      within(willImportRow).getByText(willImport.TransactionDate),
    ).toBeInTheDocument();
    expect(
      within(willImportRow).getByText(willImport.Description),
    ).toBeInTheDocument();
    expect(
      within(willImportRow).getByText(willImport.Amount),
    ).toBeInTheDocument();
    expect(
      within(willImportRow).getByText(
        transactionTypeLabel(willImport.TransactionType),
      ),
    ).toBeInTheDocument();

    // A REJECTED ROW, unchanged: the file's own values printed as the file held them —
    // including the value the service objected to — and the type NOT translated, because
    // the point is to show the user what their own file contains.
    // Read from the block the move put it in, so this is the same claim about the row in
    // its new home rather than a claim that survives only where it used to sit.
    const appOwnedRow = rejectedRowFor(appOwnedLine.Reference);
    expect(within(appOwnedRow).getByText(REJECTED_LABEL)).toBeInTheDocument();
    expect(
      within(appOwnedRow).getByText(appOwnedLine.Currency),
    ).toBeInTheDocument();
    expect(
      within(appOwnedRow).getByText(appOwnedLine.Description),
    ).toBeInTheDocument();
    expect(
      within(appOwnedRow).getByText(appOwnedLine.TransactionType),
    ).toBeInTheDocument();
    expect(appOwnedRow).not.toHaveTextContent(
      transactionTypeLabel(appOwnedLine.TransactionType),
    );

    // THE STATED REASON, from the shared wording: the app's own fixed sentence where the
    // app owns the rule, with the service's text for it still never reaching the user...
    expect(
      within(appOwnedRow).getByText(String(defectWordingFor(appOwned))),
    ).toBeInTheDocument();
    expect(appOwnedRow).not.toHaveTextContent(String(appOwned.ErrorMessage));

    // ...and the SERVICE's own reason, word for word, where the service owns it.
    const serviceOwnedRow = rejectedRowFor(serviceOwnedLine.Reference);
    expect(
      within(serviceOwnedRow).getByText(REJECTED_LABEL),
    ).toBeInTheDocument();
    expect(
      within(serviceOwnedRow).getByText(TRANSACTION_TYPE_DEFECT_REASON),
    ).toBeInTheDocument();
    expect(
      within(serviceOwnedRow).getByText(serviceOwnedLine.TransactionType),
    ).toBeInTheDocument();

    // BR2, unchanged by the rearrangement: nothing here says a row was imported.
    expect(within(section()).queryAllByText(/^imported$/i)).toHaveLength(0);
  });

  // AC-5 — POPIA, unchanged by the move.
  it('still shows only the last four digits of every account number, and reveals a full one on one rejected row at a time with no reveal-all anywhere', async () => {
    const user = userEvent.setup();
    const preview = serve(previewWithRejectedRows());
    const revealing = lineOf(preview, 3);
    const otherRejected = lineOf(preview, 5);

    // Fixture precondition: distinct last four digits, so a masked number still
    // identifies exactly one row.
    const maskedDigits = preview.rows.map((row) =>
      lastFourDigitsOf(accountNumberOf(row)),
    );
    expect(new Set(maskedDigits).size).toBe(preview.rows.length);

    renderImportPreview(preview.file);

    await findListedRows();

    // EVERY row starts masked, in both blocks.
    preview.rows.forEach((row) => {
      expectMasked(rowFor(row.Reference), accountNumberOf(row));
    });

    // A will-import row offers no way to unmask one at all (BR3) — that convention is
    // not softened by the two blocks now being drawn apart.
    preview.willImportRows.forEach((row) => {
      expect(
        within(rowFor(row.Reference)).queryByRole('button', {
          name: /(reveal|show|unmask|full)/i,
        }),
      ).not.toBeInTheDocument();
    });

    // A DELIBERATE ACTION on ONE rejected row, in the block the move put it in.
    await user.click(
      within(rejectedRowFor(revealing.Reference)).getByRole('button', {
        name: /reveal account number/i,
      }),
    );

    await waitFor(() => {
      expect(rejectedRowFor(revealing.Reference)).toHaveTextContent(
        accountNumberOf(revealing),
      );
    });

    // ...and EVERY OTHER ROW still shows four digits — the other rejected row included,
    // since the reveal belongs to the row it was made on.
    expectMasked(
      rejectedRowFor(otherRejected.Reference),
      accountNumberOf(otherRejected),
    );
    preview.willImportRows.forEach((row) => {
      expectMasked(rowFor(row.Reference), accountNumberOf(row));
    });

    // NO REVEAL-ALL, on either block or above them (POPIA).
    expect(
      within(section()).queryAllByRole('button', {
        name: /(reveal|show|unmask) (all|every)/i,
      }),
    ).toHaveLength(0);
  });

  // AC-6 — the honest answers, in their existing wording.
  it('still gives its existing honest answers when validation has not run, the file cannot be read, the rejected rows cannot be read, or the row count disagrees with the recorded one', async () => {
    // 1. VALIDATION HAS NOT RUN — no section at all, and no reads: asking for a whole
    //    file the user is shown nothing of is a cost paid for no answer.
    const stillUploaded = fileLogWithStatus(FILE_STATUS_UPLOADED, { Id: 5401 });

    renderImportPreview(stillUploaded);

    expect(querySection()).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(mockApiClient).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();

    cleanup();

    // 2. THE FILE CANNOT BE READ — a quoted field opened and never closed. The problem
    //    is stated in its existing wording, and NO listing is drawn: a half-drawn one
    //    would quietly tell the user something false about their file (BR8).
    //    Its RecordCount agrees with the three lines that body holds, so a count
    //    mismatch is ruled out and the answer on screen is genuinely about the read.
    const unreadableFile = fileLogWithStatus(FILE_STATUS_IMPORTED, {
      Id: 5402,
      RecordCount: String(UNREADABLE_FIXTURE_LINE_COUNT),
    });
    serve(
      { ...previewWithRejectedRows(), file: unreadableFile },
      {
        download: () =>
          Promise.resolve(submittedFileBlob(UNTERMINATED_QUOTE_FILE_BODY)),
      },
    );

    renderImportPreview(unreadableFile);

    expect(await within(section()).findByRole('alert')).toHaveTextContent(
      UNREADABLE_FILE_WORDING,
    );
    expect(within(section()).queryByRole('table')).not.toBeInTheDocument();
    expect(within(section()).queryAllByRole('row')).toHaveLength(0);

    cleanup();

    // 3. THE REJECTED ROWS CANNOT BE READ — the file is fine, so this is a FAILED read:
    //    its existing wording, and the one control offering to ask again. Without the
    //    overlay every row would otherwise show as one that will import, which the app
    //    cannot claim (BR2) — so no listing either.
    const unreadableOverlay = serve(previewWithRejectedRows(), {
      validationErrors: () =>
        Promise.resolve(unparseableValidationErrorsResponse()),
    });

    renderImportPreview(unreadableOverlay.file);

    expect(await within(section()).findByRole('alert')).toHaveTextContent(
      UNREADABLE_REJECTED_ROWS_WORDING,
    );
    expect(
      within(section()).getAllByRole('button', {
        name: LOAD_THE_PREVIEW_AGAIN,
      }),
    ).toHaveLength(1);
    expect(within(section()).queryByRole('table')).not.toBeInTheDocument();
    expect(section()).not.toHaveTextContent(/will import/i);

    cleanup();

    // 4. THE ROW COUNT DISAGREES with the one the service recorded — reported as a
    //    problem reading the file, in its existing wording, rather than as an ordinary
    //    preview whose numbers quietly contradict the record count already on the page.
    const mismatch = serve(previewWithCountMismatch());

    expect(mismatch.file.RecordCount).toBe(MISREPORTED_RECORD_COUNT);
    expect(Number(mismatch.file.RecordCount)).not.toBe(mismatch.rows.length);

    renderImportPreview(mismatch.file);

    expect(await within(section()).findByRole('alert')).toHaveTextContent(
      countMismatchWording(mismatch.rows.length, MISREPORTED_RECORD_COUNT),
    );
    expect(within(section()).queryByRole('table')).not.toBeInTheDocument();
    expect(section()).not.toHaveTextContent(/will import/i);
  });
});
