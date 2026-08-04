/**
 * Project-wide entity factory: FileLog (the epic brief's ExpenseFile).
 *
 * Single source of truth for canonical `FileLog` VALUES (the shape and the status
 * names live in the production module `src/types/files.ts` and are re-exported
 * below). Imported by BOTH test layers (Vitest via `@/mocks/data/file-log`,
 * Playwright via a relative `../src/mocks/data/file-log`) and by any runtime mock
 * layer — never re-declared in a test file.
 *
 * Shape anchored to `documentation/transactions-api.yaml` →
 * `components.schemas.FileLog` / `FileLogList`: exact field names and PascalCase
 * casing. `GET /v1/file-logs?IsActive=Yes` returns `{ FileLog: FileLog[] }` (note
 * the singular property holding the array) — build that body with
 * {@link fileLogListResponse}, never by hand.
 *
 * STATUS VALUES: the five recognised values are `Uploaded`, `Validating`,
 * `Validation failed`, `Imported`, `Cancelled` (brief §Data Model). The contract
 * types `CurrentStatus` as a free-form string, so
 * {@link fileLogWithUnrecognisedStatus} exists to cover the value the app must
 * pass through untranslated rather than hide or remap.
 *
 * Import discipline (so the Playwright layer can import this without alias
 * plumbing): type-only imports, and sibling factories by relative path.
 */
import { createFileSetting } from './file-setting';
import {
  FILE_STATUS_CANCELLED,
  FILE_STATUS_IMPORTED,
  FILE_STATUS_UPLOADED,
  FILE_STATUS_VALIDATING,
  FILE_STATUS_VALIDATION_FAILED,
  FILE_STATUSES,
  isKnownFileStatus,
} from '../../types/files';

import type { DefaultResponse, ErrorResponse } from '../../types/api';
import type { FileLog, FileLogList, FileStatus } from '../../types/files';

export {
  FILE_STATUS_CANCELLED,
  FILE_STATUS_IMPORTED,
  FILE_STATUS_UPLOADED,
  FILE_STATUS_VALIDATING,
  FILE_STATUS_VALIDATION_FAILED,
  FILE_STATUSES,
  isKnownFileStatus,
};
export type { FileLog, FileLogList, FileStatus };

/** The setting name a submitted file carries, taken from the FileSetting factory
 * so the two entities cannot disagree about what the file was submitted against. */
const DEFAULT_SETTING = createFileSetting();

/**
 * Canonical `FileLog`: a file that has finished importing. Override any field —
 * or use {@link fileLogWithStatus} to get a file whose activity and record count
 * already match the status you asked for.
 */
export const createFileLog = (overrides: Partial<FileLog> = {}): FileLog => ({
  Id: 5001,
  ProcessDate: '2026-04-30 15:04:00',
  SettingId: DEFAULT_SETTING.Id,
  SettingName: DEFAULT_SETTING.Name,
  CurrentFileName: 'expenses_2026-04-15.csv',
  RecordCount: '142',
  CurrentStatus: FILE_STATUS_IMPORTED,
  LastExecutedActivityName: 'Import complete',
  IsActive: true,
  FileHash: '9f2c4ae1b7d84c0fa1e3',
  Direction: 'Import',
  HasBulkErrorFile: 'No',
  ...overrides,
});

/**
 * The fields that travel WITH a status on a real response — record count, most
 * recent activity, whether an error file exists, and whether the file is still
 * active. Keeping them together here is what stops a test mocking an incoherent
 * row (e.g. `Uploaded` with an import-complete activity).
 */
const STATUS_DEFAULTS: Record<FileStatus, Partial<FileLog>> = {
  [FILE_STATUS_UPLOADED]: {
    RecordCount: '0',
    LastExecutedActivityName: 'File received',
    HasBulkErrorFile: 'No',
    IsActive: true,
  },
  [FILE_STATUS_VALIDATING]: {
    RecordCount: '96',
    LastExecutedActivityName: 'Validating rows',
    HasBulkErrorFile: 'No',
    IsActive: true,
  },
  [FILE_STATUS_VALIDATION_FAILED]: {
    RecordCount: '128',
    LastExecutedActivityName: 'Row validation',
    HasBulkErrorFile: 'Yes',
    BulkErrorFile: 'expenses_2026-04-15_errors.csv',
    IsActive: true,
  },
  [FILE_STATUS_IMPORTED]: {
    RecordCount: '142',
    LastExecutedActivityName: 'Import complete',
    HasBulkErrorFile: 'No',
    IsActive: true,
  },
  [FILE_STATUS_CANCELLED]: {
    RecordCount: '54',
    LastExecutedActivityName: 'Cancelled by user',
    HasBulkErrorFile: 'No',
    IsActive: false,
  },
};

/**
 * A file in the given status, with a coherent record count and most recent
 * activity for that status. Accepts any string — an unrecognised value keeps the
 * canonical defaults and is carried through verbatim, which is exactly the case
 * the app must not translate (see {@link fileLogWithUnrecognisedStatus}).
 *
 * @example fileLogWithStatus(FILE_STATUS_VALIDATION_FAILED, { Id: 5009 })
 */
export const fileLogWithStatus = (
  status: string,
  overrides: Partial<FileLog> = {},
): FileLog =>
  createFileLog({
    CurrentStatus: status,
    ...(isKnownFileStatus(status) ? STATUS_DEFAULTS[status] : {}),
    ...overrides,
  });

/**
 * A status value outside the five the app knows about. The default is a
 * plausible-looking backend addition rather than obvious junk, because the point
 * is that a NEW status the frontend has never heard of must still reach the user
 * as written.
 */
export const fileLogWithUnrecognisedStatus = (
  status = 'Awaiting reconciliation',
  overrides: Partial<FileLog> = {},
): FileLog =>
  fileLogWithStatus(status, {
    Id: 5099,
    CurrentFileName: 'expenses_2026-04-28.csv',
    RecordCount: '77',
    LastExecutedActivityName: 'Reconciliation queued',
    ...overrides,
  });

/**
 * One file per recognised status, each with its own id, file name and record
 * count so a row can be identified without index-based selection. Use this for
 * the list-rendering case (brief R3): the list must surface all five values.
 */
export const fileLogsInEveryStatus = (): FileLog[] =>
  FILE_STATUSES.map((status, index) =>
    fileLogWithStatus(status, {
      Id: 5010 + index,
      CurrentFileName: `expenses_2026-04-${String(21 + index)}.csv`,
      ProcessDate: `2026-04-${String(21 + index)} 09:${String(10 + index * 5)}:00`,
      SettingName:
        index % 2 === 0 ? DEFAULT_SETTING.Name : 'Travel Claims Import',
    }),
  );

/**
 * The SAME file at successive statuses — one snapshot per status, sharing an id,
 * name, setting and process date. For a list that re-reads itself while a file is
 * still processing (brief Feature NFR "List currency"): mock the first response
 * with element 0, the next with element 1, and assert the row changed rather than
 * duplicated.
 *
 * @example fileLogProgression([FILE_STATUS_VALIDATING, FILE_STATUS_IMPORTED])
 */
export const fileLogProgression = (
  statuses: string[],
  overrides: Partial<FileLog> = {},
): FileLog[] => {
  const identity: Partial<FileLog> = {
    Id: 5001,
    ProcessDate: '2026-04-30 15:04:00',
    CurrentFileName: 'expenses_2026-04-15.csv',
    SettingName: DEFAULT_SETTING.Name,
    ...overrides,
  };
  return statuses.map((status) => fileLogWithStatus(status, identity));
};

/**
 * `GET /v1/file-logs?IsActive=Yes` response body. Defaults to a single imported
 * file; pass `[]` for the empty-list case, or {@link fileLogsInEveryStatus} for
 * the full status spread.
 */
export const fileLogListResponse = (
  logs: FileLog[] = [createFileLog()],
): FileLogList => ({ FileLog: logs });

/**
 * `POST /v1/files/upload` success body (`DefaultResponse` envelope). The upload
 * call takes `FileSettingId`, `FileSettingName` and `FileName` as QUERY
 * parameters with the raw file as an `application/octet-stream` body — not a
 * multipart form (brief §Notes & Caveats).
 */
export const uploadSuccessResponse = (): DefaultResponse => ({
  Id: 5001,
  MessageType: 'SUCCESS',
  Messages: ['File uploaded successfully'],
});

/**
 * `POST /v1/files/upload` failure body. The service returns the
 * `DefaultResponse` envelope on 500 (see the spec), so that is the default here;
 * use {@link uploadErrorResponse} for the `ErrorResponse` shape when a test needs
 * the auth-style error body instead.
 */
export const uploadFailureResponse = (
  message = 'The file could not be uploaded. Please try again.',
): DefaultResponse => ({
  Id: 0,
  MessageType: 'ERROR',
  Messages: [message],
});

/** `ErrorResponse` body for a rejected file-related request. */
export const uploadErrorResponse = (
  message = 'The file could not be uploaded. Please try again.',
  error = 'INVALID_REQUEST',
): ErrorResponse => ({ Error: error, Message: message });
