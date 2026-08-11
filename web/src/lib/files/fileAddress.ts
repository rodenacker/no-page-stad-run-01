/**
 * Where one submitted file's own page lives.
 *
 * Stated once because more than one surface sends a user there — a row of the
 * submitted files list, and (later in this epic) the notification that tells the
 * uploader a file failed validation — and all of them must agree on how a file is
 * identified in the address. The screen itself is registered for permission purposes
 * in `lib/auth/access-map.ts`; this is only how the query is written.
 */
import { SUBMITTED_FILE_PATH } from '@/lib/auth/access-map';

import type { FileLog } from '@/types/files';

/**
 * The query parameter that carries the file, spelled as the transactions contract
 * spells it (`LogId`) so the page and the service never disagree about the name.
 */
export const FILE_ID_PARAM = 'LogId';

/** One submitted file's page, for a file the service has already reported. */
export const submittedFileAddress = (file: Pick<FileLog, 'Id'>): string =>
  `${SUBMITTED_FILE_PATH}?${FILE_ID_PARAM}=${String(file.Id)}`;
