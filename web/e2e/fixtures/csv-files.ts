/**
 * CSV file fixtures for the file-upload specs.
 *
 * The submit journey needs a real file to hand to a real `<input type="file">`, so
 * these are in-memory payloads in Playwright's own file shape
 * (`{ name, mimeType, buffer }`, accepted by `locator.setInputFiles()`). Held in
 * memory rather than on disk on purpose: the browser receives a genuine `File` with
 * exactly this name and type, and no spec has to resolve a path relative to
 * whichever directory the run started in.
 *
 * The rows mirror `documentation/transactions_2026-04-15.csv` — the project's real
 * sample — so the bytes travelling through the upload are the shape the service
 * actually receives. None of those columns is an input to the upload call itself
 * (which needs only the file, its name and the chosen setting); they matter to the
 * next epic's row validation.
 *
 * Import discipline, as in `./credentials.ts`: relative paths into
 * `src/mocks/data/` (never the `@/` alias), so Playwright resolves them with no
 * alias plumbing.
 */
import { createFileLog } from '../../src/mocks/data/file-log';

/** A file as `locator.setInputFiles()` accepts it. */
export interface MockUploadFile {
  /** The file's own name — what the app must send as `FileName` (brief BR1). */
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** The sample's header row, verbatim (brief §Notes & Caveats — "Sample file shape"). */
const CSV_HEADER =
  'Reference,TransactionDate,AccountNumber,Description,Amount,TransactionType,Currency';

/** Three rows from the real sample — enough to be a genuine CSV, small enough to read. */
const CSV_ROWS = [
  'TXN-20260415-0001,2026/04/15 08:12,1001-2034-5567,Salary deposit - April,15750,C,ZAR',
  'TXN-20260415-0002,2026/04/15 08:34,1001-2034-5567,Woolworths Sandton,487.32,D,ZAR',
  'TXN-20260415-0003,2026/04/15 09:05,1001-2034-5567,Engen Garage fuel,650,D,ZAR',
];

/**
 * The uploaded file's name comes from the project-wide FileLog factory's canonical
 * `CurrentFileName` rather than being retyped here, so the file a spec submits and
 * the file name the mock data calls canonical are always the same string — the same
 * anti-drift arrangement `./credentials.ts` has with the identity source.
 */
export const EXPENSE_CSV_NAME = createFileLog().CurrentFileName;

/** A valid expense CSV, ready to hand to the file chooser. */
export const expenseCsvFile = (): MockUploadFile => ({
  name: EXPENSE_CSV_NAME,
  mimeType: 'text/csv',
  buffer: Buffer.from([CSV_HEADER, ...CSV_ROWS, ''].join('\r\n'), 'utf8'),
});
