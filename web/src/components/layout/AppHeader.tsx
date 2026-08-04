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
 *
 * It is also how a person gets BETWEEN screens (epic `expense-file-upload` R11): the
 * app's own name takes them to the signed-in landing screen, and `HeaderNav` beside
 * it offers every other screen their roles allow. Before that, the landing screen's
 * entry-point cards were the only way into a screen and the browser's Back button the
 * only way out.
 */
import Link from 'next/link';

import { LANDING_PATH } from '@/lib/auth/access-map';

import { HeaderNav } from './HeaderNav';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

import type { UserInfoRead } from '@/types/auth';

export function AppHeader({ session }: { session: UserInfoRead }) {
  return (
    <header className="bg-background/95 sticky top-0 z-40 border-b backdrop-blur">
      {/*
        Wrapping rather than collapsing: on a narrow screen the account controls (and,
        if it is long, the navigation) drop onto a second row instead of hiding behind
        a menu button. Nothing in the header is ever taken off screen, so every
        destination stays one Tab away at any width, and the visual order stays the
        order a keyboard walks.
      */}
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
        {/*
          The app's name is the way back to the landing screen — the one screen the
          navigation itself never lists, because it is where the entry points are
          offered.
        */}
        <Link
          href={LANDING_PATH}
          className="focus-visible:border-ring focus-visible:ring-ring/50 rounded-md text-base font-semibold tracking-tight outline-none focus-visible:ring-[3px]"
        >
          Employee Expenses
        </Link>
        <HeaderNav session={session} />
        {/*
          The theme switch sits beside the user menu as a control of its own, not as
          an item inside it: it is a one-press change to how the app looks, and
          burying it behind the identity menu would make it a two-step action.
        */}
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <UserMenu user={session} />
        </div>
      </div>
    </header>
  );
}
