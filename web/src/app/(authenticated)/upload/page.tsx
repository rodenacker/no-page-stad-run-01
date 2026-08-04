/**
 * The expense files screen: submit a file, and watch every submitted file get on.
 *
 * The permission check runs on the server before anything is rendered. Both roles may
 * open this screen — the Importer sends files, the Approver watches them
 * (brief R9) — and any other signed-in account gets a rendered screen (HTTP 200)
 * explaining which permission is missing, inside the normal signed-in shell, rather
 * than a browser error page (epic `sign-in-and-app-shell` R11, R13). Who may open the
 * address is decided in `lib/auth/access-map.ts` and nowhere else; this page adds no
 * second gate.
 *
 * WHO MAY SUBMIT is a different question from who may open the address, and it is
 * answered here: submitting is the Importer's alone — the role the requirements
 * call the "Finance Uploader" (brief R8/BR4) — so for
 * any other session the submit form is LEFT OUT of what is sent to the browser
 * altogether — not rendered disabled (source UI-24). Because that decision is made on
 * the server, an Approver's browser never receives the form's markup at all.
 *
 * Both parts are client components because each reads from the BROWSER, at the app's
 * own address, and owns its own loading / empty / failed states.
 */
import { PermissionDeniedMessage } from '@/components/auth/PermissionDeniedMessage';
import { SubmittedFilesList } from '@/components/files/SubmittedFilesList';
import { SubmitExpenseFileForm } from '@/components/upload/SubmitExpenseFileForm';
import { UPLOAD_PATH, canAccess } from '@/lib/auth/access-map';
import { requireSession } from '@/lib/auth/requireSession';
import { hasRole } from '@/lib/auth/roles';
import { ROLE_IMPORTER } from '@/types/auth';

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
      {hasRole(session, ROLE_IMPORTER) && <SubmitExpenseFileForm />}
      <SubmittedFilesList />
    </div>
  );
}
