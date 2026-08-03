/**
 * The gate, and the shell, for every screen that needs a session.
 *
 * `requireSession()` is awaited BEFORE anything is rendered, so a request without a
 * valid session is answered with a redirect to the sign-in screen rather than with
 * protected markup — there is nothing that could flash up first, and no client-side
 * gate to out-run (epic brief BR1). Every screen in this group, in this epic and in
 * later ones, is gated by this one layout; none of them re-checks.
 *
 * The identity it resolves is re-read from the auth service on each server-rendered
 * navigation, so a change to someone's roles shows up on their next screen instead
 * of a remembered value (epic brief BR3, AC-6).
 */
import { AppHeader } from '@/components/layout/AppHeader';
import { requireSession } from '@/lib/auth/requireSession';

import type { ReactNode } from 'react';

/**
 * Never prerendered and never cached: the answer depends on who is asking, and
 * protected content must not be held in a shared or browser cache where a later
 * visitor — or the Back button after signing out — could be shown it (AC-4,
 * project.md §Compliance).
 */
export const dynamic = 'force-dynamic';

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader session={session} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
