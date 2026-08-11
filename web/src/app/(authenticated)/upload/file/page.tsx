/**
 * One submitted expense file: its own values, its processing history, and what may be
 * done to it. Reached from a file's row in the Expense files list, with the file
 * identified in the address (`/upload/file?LogId=<id>`).
 *
 * The permission check runs on the SERVER before anything is rendered. Both roles may
 * open this screen — the epic's BR4 gives a file's processing history to the Finance
 * Uploader and the Approver alike — and any other signed-in account gets a rendered
 * screen (HTTP 200) naming the missing permission, inside the normal signed-in shell,
 * rather than a browser error page. Who may open the address is decided in
 * `lib/auth/access-map.ts` and nowhere else; this page adds no second gate, and the
 * `(authenticated)` layout remains the only session gate. `addressOf()` in that module
 * strips the query string, so `?LogId=…` resolves against the registered `/upload/file`
 * with no extra gating machinery.
 *
 * This stays an ASYNC SERVER COMPONENT deliberately, and later stories in this epic
 * depend on it: what only the Finance Uploader may DO to a file (retry, cancel) is
 * decided here, from the session, and simply left out of the markup for anybody else —
 * never rendered disabled (source UI-24, the shape `upload/page.tsx` already shows).
 * A client component could not make that decision before the browser saw it.
 *
 * WHICH file is a question for the browser, not for this render: there is no
 * get-one-file endpoint, so the identifier is handed down EXACTLY AS IT ARRIVED and the
 * client surface resolves it against the active file list — where a cancelled or
 * unknown file is simply absent, which is the same answer to the user either way.
 */
import { PermissionDeniedMessage } from '@/components/auth/PermissionDeniedMessage';
import { SubmittedFileDetail } from '@/components/files/SubmittedFileDetail';
import { SUBMITTED_FILE_PATH, canAccess } from '@/lib/auth/access-map';
import { displayNameOf } from '@/lib/auth/identity';
import { requireSession } from '@/lib/auth/requireSession';
import { hasRole } from '@/lib/auth/roles';
import { FILE_ID_PARAM } from '@/lib/files/fileAddress';
import { ROLE_IMPORTER } from '@/types/auth';

import type { Metadata } from 'next';
import type { UserInfoRead } from '@/types/auth';

export const metadata: Metadata = {
  title: 'Submitted file',
  description:
    'One submitted expense file: the setting it was sent against, how it is getting on, and every processing activity recorded for it.',
};

/** The address's own query, as Next hands it to a server component. */
type FileSearchParams = Record<string, string | string[] | undefined>;

/**
 * The identifier as it arrived. A repeated parameter (`?LogId=1&LogId=2`) is answered
 * by the first value rather than by an error: an address a user can type is not a
 * contract, and every unusable identifier gets the same plain answer downstream.
 */
const requestedLogId = (params: FileSearchParams): string | undefined => {
  const value = params[FILE_ID_PARAM];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Who may retry or cancel this file, and under whose name — decided HERE, on the server,
 * from the session (brief BR3, source UI-24).
 *
 * `undefined` for anyone but the Finance Uploader, and that is what leaves the two
 * actions out of the markup entirely rather than rendering them disabled. The same value
 * is the audit identity the cancel call sends, so the name the service records comes
 * from `GET /v1/auth/userinfo` and never from anything the user typed.
 *
 * The match is on `ROLE_IMPORTER` — the auth service's own wire name for the role the
 * requirements call the "Finance Uploader"; matching on the requirements' wording would
 * recognise nobody.
 */
const actingUploaderIn = (session: UserInfoRead): string | undefined =>
  hasRole(session, ROLE_IMPORTER) ? displayNameOf(session) : undefined;

export default async function SubmittedFilePage({
  searchParams,
}: {
  searchParams: Promise<FileSearchParams>;
}) {
  const session = await requireSession();

  if (!canAccess(session, SUBMITTED_FILE_PATH)) {
    return <PermissionDeniedMessage deniedPath={SUBMITTED_FILE_PATH} />;
  }

  const params = await searchParams;

  return (
    <div className="grid gap-8">
      <SubmittedFileDetail
        logId={requestedLogId(params)}
        actingUploader={actingUploaderIn(session)}
      />
    </div>
  );
}
