/**
 * The app's front door for a signed-in user — and the whole app's front door, since
 * it sits at `/` inside the gated route group. This REPLACES the starter template's
 * welcome page: a signed-out visitor typing the app's address is redirected to the
 * sign-in screen by the layout's gate instead of being greeted by a page that has
 * nothing to do with this project (CLAUDE.md §6, AC-3).
 *
 * What the screen offers is decided by the roles on the session resolved for THIS
 * navigation (brief BR3): the intro copy story 3 held here has given way to the
 * role-aware entry points, so the first thing a person sees is what they can
 * actually do. The signed-in person's own name and role are shown once, by the
 * shell's header.
 *
 * `requireSession()` is called again here even though the layout already gated this
 * request: a layout cannot hand props to the page beneath it. It resolves to the
 * same identity without a second call to the auth service — see the note in
 * `lib/auth/requireSession.ts`.
 */
import { RoleEntryPoints } from '@/components/dashboard/RoleEntryPoints';
import { requireSession } from '@/lib/auth/requireSession';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Employee Expenses',
  description:
    'Import batches of employee expense payment requests and review the requests waiting for a decision.',
};

export default async function SignedInHomePage() {
  const session = await requireSession();

  return (
    <div className="grid gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Employee expenses
      </h1>
      <RoleEntryPoints user={session} />
    </div>
  );
}
