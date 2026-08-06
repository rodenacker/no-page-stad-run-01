/**
 * The transactions service's file endpoints, as the browser addresses them.
 *
 * Every call goes through the shared API client (CLAUDE.md §2) at the app's OWN
 * address: `/transactions-api/...` is a mount point the route handler at
 * `app/transactions-api/[...path]/route.ts` forwards to the transactions service,
 * so the browser-managed `session` cookie travels same-origin and no service URL
 * appears in browser code (project.md §Data Source & Backend Integration).
 *
 * Endpoint functions live here rather than inside a screen so the request shape is
 * stated once — notably `IsActive`, which the list call REQUIRES (brief §Notes &
 * Caveats) and which a screen could otherwise forget.
 */
import { apiClient, get } from '@/lib/api/client';
import { serviceDetailOf, serviceMessageOf } from '@/lib/api/errors';
import { TRANSACTIONS_API_BASE_PATH } from '@/lib/utils/constants';

import type { DefaultResponse } from '@/types/api';
import type {
  FileLogList,
  FileProcessLogList,
  FileSettingRead,
  FileSettingReadList,
  ValidationErrorRow,
  ValidationErrors,
} from '@/types/files';

/** `GET /v1/file-logs` — the submitted expense files. */
export const FILE_LOGS_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/file-logs`;

/**
 * `GET /v1/file-process-logs/{LogId}` — one file's recorded processing activities.
 *
 * The identifier is a PATH SEGMENT here, not a query parameter
 * (`documentation/transactions-api.yaml` → `FileProcessLogGetList`), which is why
 * this is a prefix that {@link fileProcessingHistoryEndpoint} completes rather than
 * a finished address.
 */
export const FILE_PROCESS_LOGS_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/file-process-logs`;

/**
 * `GET /v1/files/validation-errors?FileLogId={id}` — the rows of one file that
 * validation rejected.
 *
 * There is a second, similarly-named operation in the contract
 * (`/v1/files/validation-errors/columns`, `FileValidationErrorColumnGetList`) whose
 * only example is generic (`Name`, `Age`); nothing in this app reads it, and the
 * column labels come from the app instead.
 */
export const FILE_VALIDATION_ERRORS_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/files/validation-errors`;

/** `GET /v1/file-settings` — the named settings a file can be submitted against. */
export const FILE_SETTINGS_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/file-settings`;

/** `POST /v1/files/upload` — submitting a file against one of those settings. */
export const FILE_UPLOAD_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/files/upload`;

/**
 * `GET /v1/files/download?FileLogId={id}` — one submitted file, exactly as it was
 * submitted (`FilesDownload`, brief FR6).
 *
 * THE TWO DOWNLOADS ARE TWO DIFFERENT ENDPOINTS, and the contract publishes a THIRD
 * operation shaped just like them — `GET /v1/file-logs/data?LogId={id}`
 * (`FileLogDataDownload`), which no requirement in this project maps to and which
 * neither download may use (brief §Notes & Caveats resolves the ambiguity via the
 * requirements' §6.10 mapping). Transposing the two below, or reaching for the third,
 * hands the user the wrong file with no error to show for it — which is why nothing
 * outside this module chooses a download endpoint.
 */
export const FILE_DOWNLOAD_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/files/download`;

/**
 * `GET /v1/files/bulk-errors/download?FileLogId={id}` — the error file the service
 * GENERATED for a file that failed validation (`FilesBulkErrorsDownload`, brief FR7).
 * A different file, on a different endpoint, from {@link FILE_DOWNLOAD_ENDPOINT}.
 */
export const FILE_BULK_ERRORS_DOWNLOAD_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/files/bulk-errors/download`;

/**
 * `IsActive` is a required query parameter on the list call, and `Yes` is the value
 * that returns the files still in play — a cancelled (inactive) file is the next
 * epic's concern (brief §Notes & Caveats).
 */
const ACTIVE_FILES_ONLY = 'Yes';

/**
 * Every submitted expense file that is still active, exactly as the service reports
 * it — the frontend computes none of these values (brief BR5).
 *
 * The body is `FileLogList`: `{ FileLog: [...] }`, the singular property holding the
 * array, which is what the contract declares.
 */
export const fetchSubmittedFiles = (): Promise<FileLogList> =>
  get<FileLogList>(FILE_LOGS_ENDPOINT, { IsActive: ACTIVE_FILES_ONLY });

/**
 * Shown when a file could not be resolved because the list read itself failed —
 * which is a different answer from a file that is simply not in the list (that one
 * is not a failure at all, and says so in its own words on the file's page).
 */
export const FILE_LOOKUP_FAILED_MESSAGE =
  'This file could not be opened. Please try again.';

/**
 * What to tell the user when the read that resolves one file failed.
 *
 * Both places a failure can carry the service's own wording are read, for the same
 * reason {@link uploadFailureMessage} reads both.
 */
export const fileLookupFailureMessage = (error: unknown): string =>
  serviceMessageOf(error) ??
  serviceDetailOf(error) ??
  FILE_LOOKUP_FAILED_MESSAGE;

/** One file's processing-history address — `LogId` as a path segment. */
export const fileProcessingHistoryEndpoint = (logId: number): string =>
  `${FILE_PROCESS_LOGS_ENDPOINT}/${String(logId)}`;

/**
 * Every processing activity the service has recorded for one submitted file, in the
 * service's own words and order — the frontend neither sorts nor reformats them
 * (brief BR5, FR8).
 *
 * WIRE QUIRK: the body is `FileProcessLogList`, whose array property is `FileLog`,
 * NOT `FileProcessLog` (`@/types/files`). That is what the contract declares; do not
 * "correct" it.
 */
export const fetchFileProcessingHistory = (
  logId: number,
): Promise<FileProcessLogList> =>
  get<FileProcessLogList>(fileProcessingHistoryEndpoint(logId));

/**
 * Shown when a file's processing history could not be read and the service said
 * nothing readable about why — the client's internal placeholders ("Internal Server
 * Error: …") never reach a user (project.md NFR-base-5).
 */
export const PROCESSING_HISTORY_FAILED_MESSAGE =
  'The processing history could not be loaded. Please try again.';

/**
 * What to tell the user when a history read was refused. Same two-place lookup as
 * {@link uploadFailureMessage}: the transactions service reports a refusal as a 500
 * carrying `Messages[]`, which the shared client keeps on `details` while putting its
 * own placeholder on `message`, so `serviceMessageOf` alone would find nothing.
 */
export const processingHistoryFailureMessage = (error: unknown): string =>
  serviceMessageOf(error) ??
  serviceDetailOf(error) ??
  PROCESSING_HISTORY_FAILED_MESSAGE;

/**
 * The rows validation rejected for one file, still in the envelope the service sends
 * them in — `{ ValidationErrors: { JsonArray: "<json string>" } }`. Read them with
 * {@link rejectedRowsIn}, which is where that wire quirk is answered.
 *
 * The file is named by `FileLogId`, a query parameter (not a path segment as the
 * processing-history read uses).
 */
export const fetchFileValidationErrors = (
  fileLogId: number,
): Promise<ValidationErrors> =>
  get<ValidationErrors>(FILE_VALIDATION_ERRORS_ENDPOINT, {
    FileLogId: fileLogId,
  });

/**
 * The rejected rows inside a validation-errors body, or `undefined` when the body
 * cannot be read as rows at all.
 *
 * WIRE QUIRK: `ValidationErrors.JsonArray` is a JSON array delivered AS A STRING
 * (`@/types/files`), so it has to be parsed — and there are three separate ways that
 * can fail, all of which a caller must be able to report as a handled state rather
 * than throw on:
 *
 * 1. the property is not a string at all (an envelope shaped differently);
 * 2. the string will not parse (a truncated payload — the most likely way this
 *    endpoint fails without failing);
 * 3. the string parses into something that is NOT a list of rows — the case a bare
 *    `try { JSON.parse } catch {}` sails straight past, because a lone object parses
 *    perfectly well and would then be rendered as an empty table.
 *
 * An EMPTY array is not a failure: it is the service reporting no rejected rows.
 */
export const rejectedRowsIn = (
  body: ValidationErrors | undefined,
): ValidationErrorRow[] | undefined => {
  const jsonArray = body?.ValidationErrors?.JsonArray;
  if (typeof jsonArray !== 'string') {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonArray);
  } catch {
    return undefined;
  }

  if (!Array.isArray(parsed)) {
    return undefined;
  }
  // Every element has to be an object for the row to have values to show; a list of
  // strings or numbers is as unreadable as a body that never parsed.
  const rows = parsed.filter(
    (element): element is ValidationErrorRow =>
      typeof element === 'object' &&
      element !== null &&
      !Array.isArray(element),
  );
  return rows.length === parsed.length ? rows : undefined;
};

/**
 * Shown when a file's rejected rows could not be read and the service said nothing
 * readable about why — the client's internal placeholders never reach a user
 * (project.md NFR-base-5).
 */
export const VALIDATION_ERRORS_FAILED_MESSAGE =
  'The rejected rows could not be loaded. Please ask for them again.';

/**
 * What to tell the user when the rejected-rows read was refused. Same two-place
 * lookup as {@link uploadFailureMessage}: the transactions service reports a refusal
 * as a 500 carrying `Messages[]`, which the shared client keeps on `details`.
 */
export const validationErrorsFailureMessage = (error: unknown): string =>
  serviceMessageOf(error) ??
  serviceDetailOf(error) ??
  VALIDATION_ERRORS_FAILED_MESSAGE;

/**
 * Every named file setting the service holds — active and retired alike.
 *
 * The call takes no parameters at all (`documentation/transactions-api.yaml` →
 * `GET /v1/file-settings`), so there is no server-side `IsActive` filter to ask
 * for: narrowing the list to the settings a file may actually be submitted against
 * is the screen's own job (brief §Data Model, `FileSetting.IsActive`).
 *
 * The body is `FileSettingReadList`: `{ FileSettings: [...] }`.
 */
export const fetchFileSettings = (): Promise<FileSettingReadList> =>
  get<FileSettingReadList>(FILE_SETTINGS_ENDPOINT);

/** The setting a file is submitted against — its identity and its name (BR1). */
export type SubmissionSetting = Pick<FileSettingRead, 'Id' | 'Name'>;

/** What one submission carries: the chosen file, and the setting it is for. */
export interface ExpenseFileSubmission {
  /** The file as the user picked it off their computer. */
  file: File;
  /** The setting chosen in the picker. */
  setting: SubmissionSetting;
}

/**
 * Submits one expense file for import.
 *
 * The request shape is the contract's, and it is unusual enough to be worth
 * spelling out (brief §Notes & Caveats): `FileSettingId`, `FileSettingName` and
 * `FileName` travel as QUERY PARAMETERS, and the file's own bytes are the request
 * body as `application/octet-stream` — NOT a multipart form. That is why this cannot
 * use the `post` helper, which JSON-stringifies whatever it is given and sends
 * `application/json`: it would send `{}` in place of the file. It still goes through
 * the shared client (CLAUDE.md §2), at the app's own same-origin address, so the
 * session cookie travels by itself.
 *
 * The answer is the generic `DefaultResponse` envelope, which carries no file
 * identifier — so a caller learns nothing about the new file from it and finds the
 * file by re-reading {@link fetchSubmittedFiles}.
 */
export const uploadExpenseFile = ({
  file,
  setting,
}: ExpenseFileSubmission): Promise<DefaultResponse> =>
  apiClient<DefaultResponse>(FILE_UPLOAD_ENDPOINT, {
    method: 'POST',
    params: {
      FileSettingId: setting.Id,
      FileSettingName: setting.Name,
      // The file's OWN name, as the service records it against the submission.
      FileName: file.name,
    },
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });

/**
 * Shown when a submission failed and the service said nothing readable about why.
 * The client's internal placeholders ("Internal Server Error: …") are never put in
 * front of a user (project.md NFR-base-5).
 */
export const UPLOAD_FAILED_MESSAGE =
  'The file could not be submitted. Please try again.';

/**
 * What to tell the user when a submission was refused.
 *
 * The service's own reason wins whenever it sent one. It has to be looked for in
 * BOTH places a failure can carry it: the transactions service answers a refused
 * upload with a 500 + `DefaultResponse` body, and for a 500 the shared client keeps
 * its own placeholder on `message` and the service's `Messages[]` on `details` — so
 * `serviceMessageOf` alone would find nothing here and the user would be shown
 * plumbing. Same gap epic 1 closed for sign-in.
 */
export const uploadFailureMessage = (error: unknown): string =>
  serviceMessageOf(error) ?? serviceDetailOf(error) ?? UPLOAD_FAILED_MESSAGE;

/**
 * One file's bytes, from the endpoint that holds that particular file.
 *
 * Both download operations stream `application/octet-stream`, so the client is asked
 * for the BINARY body (`isBinaryResponse`) — left to content-type sniffing, a file
 * whose response is labelled anything else would be read as JSON and arrive empty.
 * `get` cannot carry that flag, which is why this goes through `apiClient` directly.
 *
 * The file is named by `FileLogId`, a query parameter, on both endpoints.
 */
const downloadFileFrom = (endpoint: string, fileLogId: number): Promise<Blob> =>
  apiClient<Blob>(endpoint, {
    method: 'GET',
    params: { FileLogId: fileLogId },
    isBinaryResponse: true,
  });

/** The file exactly as it was submitted (brief FR6) — {@link FILE_DOWNLOAD_ENDPOINT}. */
export const downloadSubmittedFile = (fileLogId: number): Promise<Blob> =>
  downloadFileFrom(FILE_DOWNLOAD_ENDPOINT, fileLogId);

/**
 * The error file the service generated for a file that failed validation (brief FR7)
 * — {@link FILE_BULK_ERRORS_DOWNLOAD_ENDPOINT}, never the submitted-file endpoint.
 */
export const downloadGeneratedErrorFile = (fileLogId: number): Promise<Blob> =>
  downloadFileFrom(FILE_BULK_ERRORS_DOWNLOAD_ENDPOINT, fileLogId);

/**
 * Shown when a download was refused and the service said nothing readable about why
 * — the client's internal placeholders ("Internal Server Error: …") never reach a
 * user (project.md NFR-base-5).
 */
export const DOWNLOAD_FAILED_MESSAGE =
  'This file could not be downloaded. Please ask for it again.';

/**
 * What to tell the user when a download was refused. Same two-place lookup as
 * {@link uploadFailureMessage}: the transactions service reports a refusal as a 500
 * carrying `Messages[]`, which the shared client keeps on `details` while putting its
 * own placeholder on `message`, so `serviceMessageOf` alone would find nothing.
 */
export const downloadFailureMessage = (error: unknown): string =>
  serviceMessageOf(error) ?? serviceDetailOf(error) ?? DOWNLOAD_FAILED_MESSAGE;
