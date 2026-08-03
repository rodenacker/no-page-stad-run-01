/**
 * The expense request list's address, registered now so that reaching it is answered
 * by THIS app rather than by a generic not-found page — the same server-side check,
 * seen from the other role, as `../upload/page.tsx`.
 *
 * The list screen itself belongs to the expense-request-list epic. Until it ships, a
 * PERMITTED Approver following the entry point reaches not-found (story 4 § "Known
 * interim state"). That epic replaces the `notFound()` below with the real screen —
 * and widens this address to BOTH roles in the access map (requirements R86/R87 give
 * both read access to the list and its export), keeping the decide actions
 * themselves Approver-only inside the screen.
 */
import { notFound } from 'next/navigation';

import { PermissionDeniedMessage } from '@/components/auth/PermissionDeniedMessage';
import { REQUESTS_PATH, canAccess } from '@/lib/auth/access-map';
import { requireSession } from '@/lib/auth/requireSession';

export default async function ExpenseRequestsPage() {
  const session = await requireSession();

  if (!canAccess(session, REQUESTS_PATH)) {
    return <PermissionDeniedMessage deniedPath={REQUESTS_PATH} />;
  }

  notFound();
}
