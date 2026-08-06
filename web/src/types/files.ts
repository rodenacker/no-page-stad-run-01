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
 * `FileProcessLog` — one recorded processing activity for a submitted file, as
 * `GET /v1/file-process-logs/{LogId}` returns it
 * (`documentation/transactions-api.yaml` → `components.schemas.FileProcessLog`).
 *
 * Requiredness follows `documentation/requirements-application.md` §7 (Shape:
 * FileProcessLog): `FileName`, `ActivityName` and `StartDate` are always present;
 * `DecisionResult` and `EndDate` are NOT — an activity still running has no
 * outcome and no end time yet, which is exactly the state a retry produces. Treat
 * both as absent-until-resolved rather than defaulting them to a placeholder.
 *
 * `DecisionResult` is free-form text: the contract declares no enum and the
 * requirements list none, so it is displayed as received and never matched
 * against an app-side list.
 */
export interface FileProcessLog {
  /** The file the activity belongs to. */
  FileName: string;
  /** The processing activity that ran (e.g. validation, retry). */
  ActivityName: string;
  /** The outcome recorded for the activity — absent while it is still running. */
  DecisionResult?: string;
  StartDate: string;
  /** When the activity finished — absent while it is still running. */
  EndDate?: string;
  /** Also returned by the contract; the history view does not read it. */
  LastExecutedActivityName?: string;
}

/**
 * `FileProcessLogList` — the body of `GET /v1/file-process-logs/{LogId}`.
 *
 * WIRE QUIRK: the array property is `FileLog`, **not** `FileProcessLog` — the same
 * singular property name `FileLogList` uses, holding a different entity. That is
 * what the contract declares (`components.schemas.FileProcessLogList`); do not
 * "correct" it.
 */
export interface FileProcessLogList {
  FileLog: FileProcessLog[];
}

/**
 * `ValidationErrors` — the body of
 * `GET /v1/files/validation-errors?FileLogId={id}`.
 *
 * WIRE QUIRK: the rejected rows are NOT delivered as JSON. `JsonArray` is a
 * STRING containing a JSON array, so a consumer must parse it — and a body that
 * will not parse, or that parses to something other than an array of objects, is a
 * handled failure state, never a crash (epic brief FR1; story 2 AC-4).
 */
export interface ValidationErrors {
  ValidationErrors: {
    /** A JSON array, as a string. Parse it; never render it raw. */
    JsonArray: string;
  };
}

/**
 * `ValidationErrorRow` — one rejected row, after `ValidationErrors.JsonArray` has
 * been parsed.
 *
 * ⚠ **INFERRED SHAPE, NOT DOCUMENTED.** `transactions-api.yaml` gives exactly one
 * example for this endpoint and it is from an unrelated domain (zoo/animal records:
 * `Species`, `HabitatId`, `Diet`), showing no expense fields and no defect field at
 * all. The recorded-value fields below are therefore inferred from
 * `TransactionRead` (`src/types/transactions.ts`) per the epic brief's §Data Model,
 * and the two defect fields are inferred outright. Confirm both against a live
 * response during BUILD; where the live shape cannot carry the field-level
 * messages FR2/FR3 require, halt and flag rather than guessing (epic brief §Notes
 * & Caveats; `state.json` → `unverifiedAssumptions`).
 *
 * EVERY field is optional and nothing is narrowed, because this object comes from
 * parsing an untrusted string: a row may legitimately be missing the very value it
 * was rejected for (a row with no `Reference`), and a value that failed validation
 * arrives as whatever text the source file held (an `Amount` that is not a number,
 * a `TransactionDate` that is not a date). Anything that assumed
 * `TransactionRead`'s stricter types here would be wrong about the only rows this
 * list ever contains.
 */
export interface ValidationErrorRow {
  /** The row's own recorded values, as the source file held them. */
  Reference?: string;
  TransactionDate?: string;
  AccountNumber?: string;
  Description?: string;
  /** A number when the file held one — the raw text when it did not (FR2). */
  Amount?: number | string;
  TransactionType?: string;
  Currency?: string;
  /**
   * ⚠ INFERRED: the row field the defect was found on, which is what selects this
   * app's fixed wording for the four rules it owns (`Reference`, `Amount`,
   * `TransactionDate`, `Currency` — FR2) and what identifies a `TransactionType`
   * defect as the one whose reason comes from the service (FR3). Typed as a plain
   * string, not a key of this interface: the service may name a column the app has
   * never heard of, and that must not be a type error.
   */
  ErrorColumn?: string;
  /**
   * ⚠ INFERRED: the service's own reason for rejecting this row. Required reading
   * for a `TransactionType` defect, where FR3 says this text is shown verbatim and
   * the app never judges the type itself. May be absent, or present without an
   * `ErrorColumn` — both are states the screen must survive.
   */
  ErrorMessage?: string;
  /**
   * Row bookkeeping the spec's own example carries — the only part of an element
   * the spec actually evidences. No screen reads these; they are declared so a
   * real response still type-checks.
   */
  Id?: number;
  PrimaryKeyValue?: number;
  ChangeType?: string;
  ChangedBy?: string;
  ChangedAt?: string;
  LastChangedUser?: string;
  LastChangedDate?: string;
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
