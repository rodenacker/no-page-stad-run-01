/**
 * Story Metadata:
 * - Epic: csv-export — Export requests for the payment system
 * - Story: 1 — Export the requests you are looking at
 * - Route: /requests
 * - Target File: web/src/app/(authenticated)/requests/page.tsx
 * - Page Action: modify_existing
 * - Requirements: R1, R2, R3, BR1, BR3, BR4, BR5, BR6, BR7
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-4 (RFC 4180 escaping of free text) and AC-6 (the 10,000-row ceiling) → this
 *   file (`vitest`).
 * - AC-1 (both roles get a saved file), AC-2 (the file holds every NARROWED request,
 *   in the list's order, not just the page on screen), AC-3 (the nine columns with the
 *   unmasked account number, the raw transaction type and a blank decision note) and
 *   AC-5 (the timestamped file name) →
 *   `web/e2e/epic-csv-export-story-1-export-the-listed-requests.spec.ts` (`playwright`).
 *   A real saved file, a real file name and per-role sign-in need a real browser, so
 *   none of those are duplicated here (testing-policy.md § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE EXPORT CONTROL is a real `<button>` whose accessible name contains "export"
 *    ("Export to CSV" / "Export requests" both satisfy `/export/i`). It has visible
 *    wording, so it owes no tooltip. It carries NO role check at all — R3 grants the
 *    export to the Finance Uploader (the auth service's `Importer`) and the Approver
 *    alike, so there is nothing on this control to gate (story § Implementation notes).
 *    Do not copy the `hasRole(...)` shape upload and decide use.
 * 2. THE EXPORTED SET IS THE ORDERED, NARROWED ARRAY — every request the search and
 *    filters left, in the order the list is sorted:
 *    `orderRequests(narrowRequests(fetched, applied), sort)`. NOT `requestsOnPage`
 *    (would export one page) and NOT the raw fetched set (would ignore the narrowing,
 *    breaking BR1). This is the story's stated likeliest silent bug, so AC-6 below
 *    fetches 10,000 requests, leaves the list on its 20-row first page and requires
 *    10,000 records in the file: a page-shaped export fails by 9,980 rows.
 * 3. THE FILE'S NINE COLUMNS, IN THIS FIXED ORDER, with a header row naming them in
 *    RPT-01's own words — see {@link RPT_01_COLUMNS}. The header text is asserted
 *    EXACTLY (a receiving system, not a person, reads this file next), and these
 *    literals are deliberately NOT imported from the implementation: importing the
 *    implementation's own value would make the test pass even if the value were wrong.
 * 4. WRITTEN VERBATIM, both of them:
 *      - `AccountNumber` — FULL and UNMASKED. The one deliberate exception to the
 *        POPIA masking rule that governs every other surface in this app (brief
 *        §Compliance Exception). Never `lastFourDigitsOf` / `MaskedAccountNumber`.
 *      - `TransactionType` — the RAW service value (`C` / `D` / `Debit`), never
 *        `transactionTypeLabel`'s plain-language wording. The payment system consumes
 *        the code, not the label (BR5).
 *    An existing display helper here would silently satisfy an eyeball check and break
 *    the hand-over file, which is why both are asserted against the fixture's own field
 *    values below.
 * 5. AN ABSENT `UserNote` IS AN EMPTY CELL — the `Decision note` column is present and
 *    empty, never the word "undefined", never a missing field (which would shorten the
 *    record to eight columns).
 * 6. RFC 4180 ESCAPING (BR3): any field holding a comma, a double quote or a line break
 *    is quoted, with embedded quotes doubled. These tests do NOT assert the escaped text
 *    — they read the file back with a plain RFC 4180 reader and require each free-text
 *    value to arrive as the SAME single value, which is AC-4's own wording and leaves a
 *    conforming writer free to quote more fields than the minimum. A `\r\n` inside a
 *    quoted description must survive as `\r\n`: the value belongs to the user who typed
 *    it, so the writer must not normalise it to `\n`.
 * 7. THE CSV BUILDER belongs at `web/src/lib/transactions/exportCsv.ts`, alongside
 *    `narrowing.ts` / `ordering.ts` / `display.ts` — one module stating the nine columns
 *    and their order once, so the header row and the row writer cannot drift. Nothing
 *    below imports it: these tests drive the screen, so the module is free to take
 *    whatever shape suits it as long as the file the user gets is right.
 * 8. THE FILE REACHES THE USER THROUGH `deliverFile` (`web/src/lib/files/deliverFile.ts`)
 *    — a Blob and a name handed to the one existing delivery path, exactly as the file
 *    downloads do. No second anchor/link path, and never an `<a href>` at an endpoint
 *    (there is no export endpoint: `documentation/transactions-api.yaml` has none, and
 *    the whole file is built in the browser from the data already fetched for the list).
 *    That is also how these tests get the bytes: `deliverFile` turns them into a blob
 *    address, so the stub on `URL.createObjectURL` below hands the test the very Blob
 *    the browser was asked to save. Nothing about the delivery mechanism is asserted —
 *    only the contents of the file the user receives.
 * 9. DERIVE THE FILE ON ACTIVATION, not in a memo over the fetched set. The list's rows
 *    are memoised and its narrowing runs through `useDeferredValue` to hold the
 *    10,000-row ceiling (BR6); building a 10,000-row string on every render would defeat
 *    exactly that. Construction yields so the main thread is not blocked in one pass —
 *    what jsdom can prove about that is the AC-6 note below.
 * 10. CROSS-STORY: the completion confirmation (its count, the signed-in person, the
 *    time) and the narrowed-empty path ("no requests match" instead of a file) are
 *    STORY 2's, with their own tests. Nothing here asserts either, and nothing here
 *    passes the list an identity prop — story 2 adds one. The list keeps its existing
 *    `roles` prop, which still decides only who is told about possible duplicates.
 * ---------------------------------------------------------------------------
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy). `URL.createObjectURL` / `revokeObjectURL` are
 * SUPPLIED, not mocked: jsdom implements neither, so a browser API that simply does not
 * exist in this environment stands in (the same treatment `vitest.setup.ts` gives
 * `matchMedia` and pointer capture). Everything else — the list, its narrowing,
 * ordering and paging, the real `deliverFile`, the real toast composition — runs for
 * real.
 *
 * Response bodies and every hostile string come from the project-wide factory in
 * `web/src/mocks/data/transaction.ts`, shared with the Playwright layer, and each value
 * is asserted against the same exported constant the mock supplied — so neither layer
 * can drift onto its own idea of what a comma-bearing description looks like.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): there is no export
 * control on the request list yet.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test. The list already exists (expense-request-list story 1);
// this story extends it with the export, so the assertions below fail on the missing
// control rather than on the import.
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// Real production toast composition (not mocked) — the arrangement the root layout
// wraps every signed-in screen in, and the one the list is always mounted inside.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';

// Project-wide Transaction factory: the single source of truth for the wire shape, its
// canonical values AND the free text that breaks a naive CSV writer. Never hand-write a
// response body, and never restate a hostile string in a test.
import {
  DESCRIPTION_WITH_COMMA,
  DESCRIPTION_WITH_EVERY_HOSTILE_CHARACTER,
  DESCRIPTION_WITH_LINE_BREAK,
  DESCRIPTION_WITH_QUOTES,
  USER_NOTE_WITH_EVERY_HOSTILE_CHARACTER,
  manyTransactions,
  transactionListResponse,
  transactionsWithCsvHostileText,
} from '@/mocks/data/transaction';

import type { TransactionRead } from '@/types/transactions';

vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const mockGet = get as unknown as ReturnType<typeof vi.fn>;

/**
 * The nine RPT-01 columns, in the fixed order the payment system expects (contract
 * note 3). Stated as the requirement's own literals rather than imported from the
 * implementation — a test that reads the header names out of the code it is checking
 * would agree with any header the code happened to write.
 */
const RPT_01_COLUMNS = [
  'Reference',
  'Transaction date',
  'Account number',
  'Description',
  'Amount',
  'Transaction type',
  'Currency',
  'Status',
  'Decision note',
];

/** R12's default page size, as the requirement's own literal (see contract note 2). */
const DEFAULT_PAGE_SIZE = 20;

/**
 * The app's stated maximum volume: up to 10,000 requests in one batch/list
 * (`documentation/requirements-application.md` §10 Volumes, brief BR6). AC-6 is about
 * this number specifically, so it is not scaled down to make the test cheaper.
 */
const VOLUME_CEILING = 10000;

/** The export control (contract note 1). */
const exportControl = (): HTMLElement =>
  screen.getByRole('button', { name: /export/i });

/**
 * Every file the app has asked the browser to save, in the order it asked.
 *
 * `deliverFile` turns the bytes into a blob address and activates a download link
 * (contract note 8), so the Blob handed to `URL.createObjectURL` IS the file the user
 * receives — which is what the assertions below read. jsdom implements neither
 * `createObjectURL` nor `revokeObjectURL`, so these are stands-in for browser APIs
 * this environment lacks rather than stubs of anything the story owns; the revoke
 * no-op matters because `deliverFile` calls it on the next task, after a test that
 * asserted nothing about it may already have finished.
 */
const deliveredFiles: Blob[] = [];

URL.createObjectURL = ((contents: Blob): string => {
  deliveredFiles.push(contents);
  return `blob:exported-file-${String(deliveredFiles.length)}`;
}) as typeof URL.createObjectURL;

URL.revokeObjectURL = ((): void => {}) as typeof URL.revokeObjectURL;

/** The bytes of a delivered file, as text. jsdom's `Blob` has no `text()`. */
const textOf = (contents: Blob): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(String(reader.result));
    });
    reader.addEventListener('error', () => {
      reject(new Error('The exported file could not be read back as text.'));
    });
    reader.readAsText(contents);
  });

/**
 * A CSV file read back the way a receiving system reads it (RFC 4180): fields
 * separated by commas, records by a line break, and a quoted field carrying commas,
 * line breaks and doubled quotes of its own as ONE value.
 *
 * Deliberately a reader rather than a comparison against the expected escaped text: the
 * standard lets a conforming writer quote more fields than the minimum, and AC-4 is
 * about what the file READS BACK AS, not about which characters it spends doing it.
 *
 * A leading byte-order mark is dropped — some writers add one so a spreadsheet opens
 * the file as UTF-8, and it is a mark about the encoding rather than data in the first
 * column.
 */
const parseCsv = (file: string): string[][] => {
  const text = file.startsWith('﻿') ? file.slice(1) : file;
  const records: string[][] = [];
  let fields: string[] = [];
  let value = '';
  let inQuotes = false;
  let index = 0;

  const endField = (): void => {
    fields.push(value);
    value = '';
  };
  const endRecord = (): void => {
    endField();
    records.push(fields);
    fields = [];
  };

  while (index < text.length) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 2;
        continue;
      }
      if (character === '"') {
        inQuotes = false;
        index += 1;
        continue;
      }
      value += character;
      index += 1;
      continue;
    }

    if (character === '"' && value === '') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (character === ',') {
      endField();
      index += 1;
      continue;
    }
    if (character === '\r' && text[index + 1] === '\n') {
      endRecord();
      index += 2;
      continue;
    }
    if (character === '\n' || character === '\r') {
      endRecord();
      index += 1;
      continue;
    }
    value += character;
    index += 1;
  }

  // A file ending in a record separator has no trailing empty record; one that does not
  // end in a separator still has its last record.
  if (value !== '' || fields.length > 0) {
    endRecord();
  }
  return records;
};

/** One exported row, read by column name. */
type ExportedRow = Record<string, string>;

interface ExportedFile {
  /** The first line: the column names, in the order they were written. */
  header: string[];
  /** How many fields each data record holds — one entry per distinct count. */
  fieldCounts: number[];
  /** The data records, each readable by column name. */
  records: ExportedRow[];
}

const fileFrom = (text: string): ExportedFile => {
  const [header, ...dataRows] = parseCsv(text);
  return {
    header,
    fieldCounts: [...new Set(dataRows.map((fields) => fields.length))],
    records: dataRows.map((fields) =>
      Object.fromEntries(header.map((name, column) => [name, fields[column]])),
    ),
  };
};

/**
 * The one file the export handed the browser, read back. Waiting for it is what makes
 * these tests indifferent to whether construction happens in one pass or in chunks
 * across several tasks (contract note 9).
 */
const readExportedFile = async (timeout: number): Promise<ExportedFile> => {
  await waitFor(
    () => {
      expect(deliveredFiles.length).toBe(1);
    },
    { timeout },
  );
  return fileFrom(await textOf(deliveredFiles[0]));
};

/** The row exported for one request, found by its reference rather than by position. */
const recordFor = (
  file: ExportedFile,
  request: TransactionRead,
): ExportedRow => {
  const matches = file.records.filter(
    (record) => record.Reference === request.Reference,
  );
  expect(matches.length).toBe(1);
  return matches[0];
};

/**
 * The one request in the hostile-text fixture whose description is the given value.
 *
 * Looking the row up by the constant it carries — rather than restating its reference —
 * keeps the fixture the single source of truth for both the value written and the row
 * it belongs to.
 */
const requestDescribedAs = (
  requests: TransactionRead[],
  description: string,
): TransactionRead => {
  const matches = requests.filter(
    (request) => request.Description === description,
  );
  expect(matches.length).toBe(1);
  return matches[0];
};

/** The screen as the root layout always mounts it: inside the toast composition. */
const renderList = () =>
  render(
    <ToastProvider>
      <ExpenseRequestList />
      <ToastContainer />
    </ToastProvider>,
  );

describe('Epic csv-export, Story 1: Export the requests you are looking at', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deliveredFiles.length = 0;
  });

  // AC-4
  // Data-contract: that these values arrive from the real service in this shape is
  // confirmed against the running backend on the manual checklist; what is pinned here
  // is what the file does with them once they have.
  it('writes a description or decision note carrying a comma, a quotation mark or a line break so the file reads it back as that same single value', async () => {
    const user = userEvent.setup();
    // Four requests, each isolating one hostile character, plus one carrying all three
    // in BOTH free-text fields. Fewer than one page, so nothing here depends on paging.
    const listedRequests = transactionsWithCsvHostileText();
    mockGet.mockResolvedValue(transactionListResponse(listedRequests));

    renderList();

    // Every request is listed before the export is taken, so the file's contents can
    // only be about the writing and not about a half-loaded screen.
    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(
        listedRequests.length + 1,
      );
    });

    await user.click(exportControl());

    const exported = await readExportedFile(5000);

    // The nine columns, in RPT-01's fixed order — the precondition for reading any
    // value below by its column name.
    expect(exported.header).toEqual(RPT_01_COLUMNS);

    // NOTHING split. A naive writer turns a comma into an extra column and a line break
    // into an extra record, so these two counts are where that shows: one record per
    // listed request, and every record exactly nine fields wide.
    expect(exported.records.length).toBe(listedRequests.length);
    expect(exported.fieldCounts).toEqual([RPT_01_COLUMNS.length]);

    // Each hostile character, read back as the value the user typed. Asserted against
    // the same constant the mock supplied — never a restated literal.
    const withComma = requestDescribedAs(
      listedRequests,
      DESCRIPTION_WITH_COMMA,
    );
    expect(recordFor(exported, withComma).Description).toBe(
      DESCRIPTION_WITH_COMMA,
    );

    const withQuotes = requestDescribedAs(
      listedRequests,
      DESCRIPTION_WITH_QUOTES,
    );
    expect(recordFor(exported, withQuotes).Description).toBe(
      DESCRIPTION_WITH_QUOTES,
    );

    const withLineBreak = requestDescribedAs(
      listedRequests,
      DESCRIPTION_WITH_LINE_BREAK,
    );
    expect(recordFor(exported, withLineBreak).Description).toBe(
      DESCRIPTION_WITH_LINE_BREAK,
    );

    // The harshest row: a comma, a quotation mark and a `\r\n` — RFC 4180's own record
    // separator — in the description AND in the decision note, both of which are free
    // text a person typed. The line break survives as the user wrote it; normalising it
    // would quietly rewrite their words.
    const withEverything = requestDescribedAs(
      listedRequests,
      DESCRIPTION_WITH_EVERY_HOSTILE_CHARACTER,
    );
    const hostileRecord = recordFor(exported, withEverything);
    expect(hostileRecord.Description).toBe(
      DESCRIPTION_WITH_EVERY_HOSTILE_CHARACTER,
    );
    expect(hostileRecord['Decision note']).toBe(
      USER_NOTE_WITH_EVERY_HOSTILE_CHARACTER,
    );

    // The same row's OTHER values, because escaping is only worth anything if it
    // escaped the right thing: the account number whole and unmasked (contract note 4,
    // the deliberate compliance exception), the transaction type as the service sent it
    // rather than the list's plain-language label, and the status as written.
    expect(hostileRecord['Account number']).toBe(withEverything.AccountNumber);
    expect(hostileRecord['Transaction type']).toBe(
      withEverything.TransactionType,
    );
    expect(hostileRecord.Status).toBe(withEverything.Status);

    // A request with no decision note exports an EMPTY cell — not "undefined", and not
    // a missing field that would have shortened the record above to eight columns
    // (contract note 5).
    expect(withComma.UserNote).toBeUndefined();
    expect(recordFor(exported, withComma)['Decision note']).toBe('');
  });

  // AC-6
  // Data-contract: whether 10,000 real requests arrive in one response is confirmed
  // against the running backend on the manual checklist. What is pinned here is that
  // the file built from them is COMPLETE — and complete is where a chunked build fails,
  // by dropping or repeating rows at a chunk boundary, and where a page-shaped export
  // fails outright (contract note 2).
  //
  // The other half of AC-6 — that the screen does not visibly freeze — is a real-browser
  // judgement no jsdom render can make. What this test can and does state is that the
  // export at the ceiling leaves a WORKING screen behind it: the list still renders, its
  // page controls still respond, and the export can be taken again. The construction
  // must still yield (contract note 9); a single blocking pass over 10,000 rows is what
  // the manual checklist and a human's eyes are for.
  it('exports all 10,000 listed requests as one complete file and leaves the screen working', async () => {
    const user = userEvent.setup();
    const listedRequests = manyTransactions(VOLUME_CEILING);
    mockGet.mockResolvedValue(transactionListResponse(listedRequests));

    renderList();

    // The screen shows its first page — 20 of the 10,000. This is the trap AC-6 is
    // set to catch: the rows the export must NOT be built from.
    await waitFor(
      () => {
        expect(screen.getAllByRole('row')).toHaveLength(DEFAULT_PAGE_SIZE + 1);
      },
      { timeout: 10000 },
    );

    await user.click(exportControl());

    const exported = await readExportedFile(20000);

    expect(exported.header).toEqual(RPT_01_COLUMNS);

    // One record per LISTED request — 10,000, not the 20 on screen.
    expect(exported.records.length).toBe(listedRequests.length);

    // Every listed request is in it, and none is in it twice. The first few missing
    // references are named rather than counted, bounded so an incomplete file reports
    // itself in a readable line instead of thousands.
    const exportedReferences = new Set(
      exported.records.map((record) => record.Reference),
    );
    const missingReferences = listedRequests
      .filter((request) => !exportedReferences.has(request.Reference))
      .slice(0, 3)
      .map((request) => request.Reference);
    expect(missingReferences).toEqual([]);
    expect(exportedReferences.size).toBe(exported.records.length);

    // And it runs from the first listed request to the last, so it is neither a page
    // nor a truncated chunk of one.
    expect(exported.records[0].Reference).toBe(listedRequests[0].Reference);
    expect(exported.records[exported.records.length - 1].Reference).toBe(
      listedRequests[listedRequests.length - 1].Reference,
    );

    // The screen is still working after a 10,000-row file was built from it: paging
    // still answers, and the export is still there to take again.
    const secondPageRequest = listedRequests[DEFAULT_PAGE_SIZE];
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(
      await screen.findByText(secondPageRequest.Reference),
    ).toBeInTheDocument();
    expect(exportControl()).toBeEnabled();

    // The ceiling itself is the cost: 10,000 requests are fetched, narrowed, compared
    // for duplicates, ordered and written out. The raised timeout below is a runaway
    // guard, not an expectation — see vitest.config.ts's own note on the 15s default.
  }, 40000);
});
