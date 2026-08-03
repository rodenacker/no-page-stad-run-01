/**
 * The signed-in app's header — the one piece of chrome every protected screen in
 * this project renders inside.
 *
 * It is a `<header>` placed as a SIBLING of the page's `<main>`, never inside it: a
 * header nested in `main` is not a `banner` landmark, which is how a screen-reader
 * user finds the app's identity and account controls (project's WCAG 2.2 AA bar,
 * requirements §6.6.5). The root layout deliberately provides no `<main>` of its own
 * so this stays true.
 *
 * The identity it shows comes from the session the layout resolved for THIS
 * navigation — nothing here caches it (epic brief BR3).
 */
import { UserMenu } from './UserMenu';

import type { UserInfoRead } from '@/types/auth';

export function AppHeader({ session }: { session: UserInfoRead }) {
  return (
    <header className="bg-background/95 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-2">
        <p className="text-base font-semibold tracking-tight">
          Employee Expenses
        </p>
        {/* Story 5's theme switch joins the user menu in this group. */}
        <div className="flex items-center gap-1">
          <UserMenu user={session} />
        </div>
      </div>
    </header>
  );
}
