/**
 * The expense files screen: every submitted file, and how each one is getting on.
 *
 * The permission check runs on the server before anything is rendered. Both roles may
 * open this screen — the Finance Uploader sends files, the Approver watches them
 * (brief R9) — and any other signed-in account gets a rendered screen (HTTP 200)
 * explaining which permission is missing, inside the normal signed-in shell, rather
 * than a browser error page (epic `sign-in-and-app-shell` R11, R13). Who may open the
 * address is decided in `lib/auth/access-map.ts` and nowhere else; this page adds no
 * second gate.
 *
 * The list itself is a client component because it reads the files from the browser,
 * at the app's own address, and owns its loading / empty / failed states.
 */
import { PermissionDeniedMessage } from '@/components/auth/PermissionDeniedMessage';
import { SubmittedFilesList } from '@/components/files/SubmittedFilesList';
import { UPLOAD_PATH, canAccess } from '@/lib/auth/access-map';
import { requireSession } from '@/lib/auth/requireSession';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Expense files',
  description:
    'Submit a CSV file of employee expense payment requests and follow every submitted file through validation and import.',
};

export default async function UploadPage() {
  const session = await requireSession();

  if (!canAccess(session, UPLOAD_PATH)) {
    return <PermissionDeniedMessage deniedPath={UPLOAD_PATH} />;
  }

  return (
    <div className="grid gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Expense files</h1>
      <SubmittedFilesList />
    </div>
  );
}
