/**
 * File-processing types for this project's transactions contract.
 *
 * Shapes are anchored to `documentation/transactions-api.yaml`
 * (`FileLog`, `FileLogList`, `FileSettingRead`, `FileSettingReadList`) — exact
 * PascalCase field names, as the transactions service returns them. Field
 * requiredness follows `documentation/requirements-application.md` §7 (Shape:
 * ExpenseFile / Shape: FileSetting) and the epic brief's Data Model; the OpenAPI
 * schemas declare no `required` list, so requiredness here reflects what the
 * application actually reads.
 *
 * This module is the single source of truth for the file-status names. The test
 * factories in `src/mocks/data/file-log.ts` and `src/mocks/data/file-setting.ts`
 * re-export from here rather than re-declaring the shapes or the status strings,
 * so mocks and production code cannot drift — the same arrangement
 * `src/types/auth.ts` has with `src/mocks/data/role.ts`.
 */

/**
 * `FileLog` — one submitted expense file, as `GET /v1/file-logs` returns it.
 * The epic brief calls this entity ExpenseFile; `FileLog` is the backend name and
 * is kept here so the type matches the wire contract exactly.
 *
 * The first block of fields is what this epic's screens read (brief §Data Model)
 * and is therefore required. The rest are fields the service also returns but no
 * screen in this epic consumes; they stay optional so a response that omits one
 * still type-checks, and so later epics (error-file download, retry, cancel) can
 * rely on them without a breaking change here.
 */
export interface FileLog {
  Id: number;
  ProcessDate: string;
  SettingName: string;
  CurrentFileName: string;
  /**
   * The row count as the service reports it — a STRING on the wire, not a
   * number. Rendered as received; the frontend does not compute it (brief BR5).
   */
  RecordCount: string;
  /**
   * Where the file is in processing. Typed as `string`, deliberately NOT narrowed
   * to {@link FileStatus}: the contract declares a free-form string, and an
   * unrecognised value must be displayed as received rather than dropped or
   * remapped. Use {@link isKnownFileStatus} to branch on the five known values.
   */
  CurrentStatus: string;
  /** The most recent processing activity for the file (brief R3/R6). */
  LastExecutedActivityName: string;
  /** Whether the file is still active; drives `GET /v1/file-logs?IsActive=Yes`. */
  IsActive: boolean;
  SettingId?: number;
  ProcessInstanceId?: string;
  CurrentFolder?: string;
  FileHash?: string;
  Direction?: string;
  ProcessDefinitionId?: string;
  ProcessName?: string;
  /** `'Yes'` / `'No'` on the wire — a string, not a boolean. */
  HasBulkErrorFile?: string;
  BulkErrorFile?: string;
}

/**
 * `FileLogList` — the body of `GET /v1/file-logs`. Note the singular `FileLog`
 * property name holding the array; that is what the contract declares.
 */
export interface FileLogList {
  FileLog: FileLog[];
}

/**
 * `FileSettingRead` — a named file setting, as `GET /v1/file-settings` returns
 * it. Required fields are the ones the upload picker uses (brief §Data Model);
 * the remaining contract fields belong to setting administration, which is out of
 * scope for this epic, and stay optional.
 */
export interface FileSettingRead {
  Id: number;
  Name: string;
  SourceName: string;
  TypeName: string;
  /** Only active settings may be offered in the picker. */
  IsActive: boolean;
  SourceId?: number;
  TypeId?: number;
  Direction?: string;
  StagingSchema?: string;
  StagingTable?: string;
  TargetSchema?: string;
  TargetTable?: string;
  ProcessDefinitionId?: string;
  ProcessDefinitionName?: string;
  LastChangedUser?: string;
  LastChangedDate?: string;
}

/** `FileSettingReadList` — the body of `GET /v1/file-settings`. */
export interface FileSettingReadList {
  FileSettings: FileSettingRead[];
}

/**
 * The five `CurrentStatus` values this application recognises
 * (`documentation/requirements-application.md` §7 → Shape: ExpenseFile, Enums;
 * epic brief §Data Model). Spelling and casing are the contract's own — including
 * the lower-case "failed" in `Validation failed`.
 */
export const FILE_STATUS_UPLOADED = 'Uploaded';
export const FILE_STATUS_VALIDATING = 'Validating';
export const FILE_STATUS_VALIDATION_FAILED = 'Validation failed';
export const FILE_STATUS_IMPORTED = 'Imported';
export const FILE_STATUS_CANCELLED = 'Cancelled';

/** Every recognised status, in processing order. */
export const FILE_STATUSES = [
  FILE_STATUS_UPLOADED,
  FILE_STATUS_VALIDATING,
  FILE_STATUS_VALIDATION_FAILED,
  FILE_STATUS_IMPORTED,
  FILE_STATUS_CANCELLED,
] as const;

export type FileStatus = (typeof FILE_STATUSES)[number];

/**
 * Whether a `CurrentStatus` string is one of the five recognised values.
 *
 * The contract permits any string, so this is a genuine runtime question: a value
 * outside the five is passed through to the user untranslated (never hidden, never
 * coerced to a default), so an unexpected backend status stays visible.
 */
export const isKnownFileStatus = (status: string): status is FileStatus =>
  (FILE_STATUSES as readonly string[]).includes(status);

/**
 * The statuses that mean "still working" — a file in one of these is expected to
 * change without the user reloading (brief Feature NFR "List currency").
 */
export const IN_PROGRESS_FILE_STATUSES = [
  FILE_STATUS_UPLOADED,
  FILE_STATUS_VALIDATING,
] as const;

/** Whether a file is still processing and its row is expected to keep changing. */
export const isFileInProgress = (status: string): boolean =>
  (IN_PROGRESS_FILE_STATUSES as readonly string[]).includes(status);
