/**
 * The shared expense request list: every imported expense payment request, read-only,
 * for both roles (brief R1, R20 — the Finance Uploader, whom the auth service calls
 * `Importer`, and the Approver).
 *
 * The permission check runs on the server before anything is rendered. Who may open
 * the address is decided in `lib/auth/access-map.ts` and nowhere else; this page adds
 * no second gate, and the `(authenticated)` layout remains the only session gate. Any
 * signed-in account whose roles the map excludes gets a rendered screen (HTTP 200)
 * naming the missing permission, inside the normal signed-in shell.
 *
 * The list itself is a client component because it reads from the BROWSER, at the
 * app's own same-origin address, and owns its loading / empty / failed states.
 * Deciding on a request, bulk actions and export belong to later epics — nothing on
 * this screen changes a request.
 *
 * The session's roles are handed to the list because it cannot read the session itself,
 * and for ONE purpose: the Approver — and only the Approver — is notified when a load
 * finds possible duplicates (brief R21). The list is otherwise identical for both roles,
 * so this is not a second gate; who may open the address is settled above.
 *
 * The signed-in person's NAME is handed down for one purpose too: a CSV export is
 * attributed to whoever produced it (csv-export R4, the second half of that epic's
 * mandatory compliance exception — the file carries account numbers whole). It is taken
 * from the session THIS page already resolved, so the identity the export is attributed
 * to is the one the server gated on; the browser never asks who it is.
 */
import { PermissionDeniedMessage } from '@/components/auth/PermissionDeniedMessage';
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';
import { REQUESTS_PATH, canAccess } from '@/lib/auth/access-map';
import { displayNameOf } from '@/lib/auth/identity';
import { requireSession } from '@/lib/auth/requireSession';
import { rolesOf } from '@/lib/auth/roles';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Expense requests',
  description:
    'Every imported employee expense payment request, with its status and account numbers masked to their last four digits.',
};

export default async function ExpenseRequestsPage() {
  const session = await requireSession();

  if (!canAccess(session, REQUESTS_PATH)) {
    return <PermissionDeniedMessage deniedPath={REQUESTS_PATH} />;
  }

  // No page title above the list: the screen opens with the batch's own control block
  // instead (`request-list-redesign` R11) — a reader arriving here is looking for how much
  // is still outstanding, not for the name of the screen they just navigated to. The
  // `metadata.title` above is a different thing entirely (the browser tab's name) and
  // stays exactly as it is.
  return (
    <ExpenseRequestList
      roles={rolesOf(session)}
      exportedBy={displayNameOf(session)}
    />
  );
}
