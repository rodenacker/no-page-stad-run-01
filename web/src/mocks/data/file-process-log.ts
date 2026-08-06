/**
 * Project-wide entity factory: FileProcessLog (one recorded processing activity of
 * a submitted file — the brief's "processing history" row).
 *
 * Single source of truth for canonical `FileProcessLog` VALUES (the shape lives in
 * the production module `src/types/files.ts` and is re-exported below). Imported by
 * BOTH test layers (Vitest via `@/mocks/data/file-process-log`, Playwright via a
 * relative `../src/mocks/data/file-process-log`) and by any runtime mock layer —
 * never re-declared in a test file.
 *
 * Shape anchored to `documentation/transactions-api.yaml` →
 * `components.schemas.FileProcessLog` / `FileProcessLogList`: exact field names and
 * PascalCase casing.
 *
 * WIRE QUIRK: `GET /v1/file-process-logs/{LogId}` returns `{ FileLog: [...] }` —
 * the array property is `FileLog`, NOT `FileProcessLog`. Build that body with
 * {@link fileProcessLogListResponse}, never by hand.
 *
 * OUTCOMES AND ACTIVITY NAMES here are sample VALUES, not an enum: the contract
 * declares `DecisionResult` as a free-form string and the requirements list no
 * accepted set, so the app displays it as received. The activity names reuse the
 * vocabulary `file-log.ts` already puts on `LastExecutedActivityName` ('File
 * received', 'Row validation', 'Import complete') so a file's history and its most
 * recent activity cannot disagree.
 *
 * AN ACTIVITY STILL RUNNING has neither `DecisionResult` nor `EndDate` — that is
 * the state a retry creates, and {@link fileProcessHistoryWithRetryRunning} is the
 * fixture for it. Do not fill those two in "for tidiness"; a screen that assumes
 * they are always present is precisely the bug.
 *
 * Import discipline (so the Playwright layer can import this without alias
 * plumbing): type-only imports, and sibling factories by relative path.
 */
import { createFileLog } from './file-log';

import type { DefaultResponse } from '../../types/api';
import type { FileProcessLog, FileProcessLogList } from '../../types/files';

export type { FileProcessLog, FileProcessLogList };

/**
 * The file whose history these activities belong to, taken from the FileLog factory
 * so the two entities cannot disagree about which file was processed.
 */
const DEFAULT_FILE = createFileLog();

/**
 * Sample `ActivityName` / `DecisionResult` values — NOT production enums (see the
 * header). They are exported so a test asserts against the same strings the mock
 * hands the component, rather than restating them.
 */
export const ACTIVITY_FILE_RECEIVED = 'File received';
export const ACTIVITY_ROW_VALIDATION = 'Row validation';
export const ACTIVITY_IMPORT = 'Import complete';
export const OUTCOME_SUCCESS = 'Success';
export const OUTCOME_VALIDATION_FAILED = 'Validation failed';

/**
 * Canonical `FileProcessLog`: the first activity of the canonical file — its
 * receipt, completed successfully. Override any field.
 */
export const createFileProcessLog = (
  overrides: Partial<FileProcessLog> = {},
): FileProcessLog => ({
  FileName: DEFAULT_FILE.CurrentFileName,
  ActivityName: ACTIVITY_FILE_RECEIVED,
  DecisionResult: OUTCOME_SUCCESS,
  StartDate: '2026-04-30 15:04:00',
  EndDate: '2026-04-30 15:04:04',
  ...overrides,
});

/**
 * An activity that is STILL RUNNING: no outcome and no end time, only a start.
 *
 * Built by deleting the two optional fields rather than setting them to `''` or
 * `null`, because absent is what the contract expresses and what the screen has to
 * cope with (story 1 AC-3, story 4 AC-3).
 */
export const runningFileProcessLog = (
  overrides: Partial<FileProcessLog> = {},
): FileProcessLog => {
  const activity = createFileProcessLog({
    ActivityName: ACTIVITY_ROW_VALIDATION,
    StartDate: '2026-04-30 15:06:00',
    ...overrides,
  });
  delete activity.DecisionResult;
  delete activity.EndDate;
  return activity;
};

/**
 * The history of a file that was received and then FAILED validation — two
 * completed activities, oldest first, each with a distinct activity name, outcome
 * and start/end pair so a row can be identified by its content rather than by
 * position.
 *
 * This is the fixture for story 1's "every recorded activity with its outcome and
 * timing". The wire ORDER is not documented, so nothing here licenses an
 * assumption about sort direction — assert on content, not on index.
 *
 * `overrides` apply to every activity (e.g. `{ FileName: '…' }` to re-point the
 * whole history at another file).
 */
export const fileProcessHistory = (
  overrides: Partial<FileProcessLog> = {},
): FileProcessLog[] => [
  createFileProcessLog({ ...overrides }),
  createFileProcessLog({
    ActivityName: ACTIVITY_ROW_VALIDATION,
    DecisionResult: OUTCOME_VALIDATION_FAILED,
    StartDate: '2026-04-30 15:04:05',
    EndDate: '2026-04-30 15:05:12',
    ...overrides,
  }),
];

/**
 * The history immediately AFTER a retry was asked for: the two activities of
 * {@link fileProcessHistory} plus a NEW validation activity that has not resolved
 * yet (no outcome, no end time).
 *
 * Story 4 AC-3 — "retrying records a new processing activity" — is what this
 * states: three activities where there were two, the newest one still running.
 */
export const fileProcessHistoryWithRetryRunning = (
  overrides: Partial<FileProcessLog> = {},
): FileProcessLog[] => [
  ...fileProcessHistory(overrides),
  runningFileProcessLog(overrides),
];

/**
 * The history once a retry has RESOLVED: the two original activities plus the retry
 * activity carrying its outcome and end time.
 *
 * Defaults to a retry that succeeded; pass {@link OUTCOME_VALIDATION_FAILED} for
 * the failed-again case story 4 AC-3 also covers.
 *
 * @example fileProcessHistoryAfterRetry(OUTCOME_VALIDATION_FAILED)
 */
export const fileProcessHistoryAfterRetry = (
  outcome: string = OUTCOME_SUCCESS,
  overrides: Partial<FileProcessLog> = {},
): FileProcessLog[] => [
  ...fileProcessHistory(overrides),
  createFileProcessLog({
    ActivityName: ACTIVITY_ROW_VALIDATION,
    DecisionResult: outcome,
    StartDate: '2026-04-30 15:06:00',
    EndDate: '2026-04-30 15:07:18',
    ...overrides,
  }),
];

/**
 * `GET /v1/file-process-logs/{LogId}` response body — note the `FileLog` property
 * holding the array (see the header's wire quirk).
 *
 * Defaults to {@link fileProcessHistory}; pass `[]` for the "no activity recorded
 * yet" case (story 1 AC-4).
 */
export const fileProcessLogListResponse = (
  activities: FileProcessLog[] = fileProcessHistory(),
): FileProcessLogList => ({ FileLog: activities });

/**
 * The wording the SERVICE itself gives for a failed read of a file's processing
 * history.
 *
 * Deliberately phrased UNLIKE anything a screen would write for itself, so a test
 * can tell the two apart: this exact sentence on screen proves the service's own
 * reason reached the user, and its absence proves the screen fell back to its own
 * plain wording (story 1 AC-4, and the
 * `serviceMessageOf ?? serviceDetailOf ?? own wording` rule in `lib/api/errors.ts`).
 */
export const FILE_PROCESS_LOG_FAILURE_MESSAGE =
  'The processing log store is temporarily unavailable.';

/**
 * A failed `GET /v1/file-process-logs/{LogId}` body. The transactions service
 * describes a failure with the `DefaultResponse` envelope (`Messages[]`), which is
 * what {@link FILE_PROCESS_LOG_FAILURE_MESSAGE} rides on — `apiClient` keeps it on
 * the failure's `details`, where `serviceDetailOf` finds it.
 *
 * For the other half of that criterion — a failure the service gave no readable
 * reason for — answer with no body at all rather than with an empty envelope: that
 * is what leaves the client holding only its own placeholder, which must never
 * reach the user.
 */
export const fileProcessLogFailureResponse = (
  message: string = FILE_PROCESS_LOG_FAILURE_MESSAGE,
): DefaultResponse => ({
  Id: 0,
  MessageType: 'ERROR',
  Messages: [message],
});
