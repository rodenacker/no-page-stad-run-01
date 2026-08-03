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
import { get } from '@/lib/api/client';
import { TRANSACTIONS_API_BASE_PATH } from '@/lib/utils/constants';

import type { FileLogList } from '@/types/files';

/** `GET /v1/file-logs` — the submitted expense files. */
export const FILE_LOGS_ENDPOINT = `${TRANSACTIONS_API_BASE_PATH}/v1/file-logs`;

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
