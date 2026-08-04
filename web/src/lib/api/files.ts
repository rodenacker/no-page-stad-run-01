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
  FileSettingRead,
  FileSettingReadList,
} from '@/types/files';

/** `GET /v1/file-logs` — the submitted expense files. */
export const FILE_LOGS_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/file-logs`;

/** `GET /v1/file-settings` — the named settings a file can be submitted against. */
export const FILE_SETTINGS_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/file-settings`;

/** `POST /v1/files/upload` — submitting a file against one of those settings. */
export const FILE_UPLOAD_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/files/upload`;

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
