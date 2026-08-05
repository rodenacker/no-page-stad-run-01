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
 */
import { PermissionDeniedMessage } from '@/components/auth/PermissionDeniedMessage';
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';
import { REQUESTS_PATH, canAccess } from '@/lib/auth/access-map';
import { requireSession } from '@/lib/auth/requireSession';

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

  return (
    <div className="grid gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Expense requests
      </h1>
      <ExpenseRequestList />
    </div>
  );
}
