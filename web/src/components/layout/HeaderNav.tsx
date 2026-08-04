'use client';

/**
 * How a signed-in person gets from the screen they are on to any other screen they
 * are allowed to open (epic brief R11) — the navigation inside the app header.
 *
 * THE OFFERED SET IS THE ACCESS MAP'S ANSWER, NOT A LIST OF ITS OWN (brief BR6).
 * Destinations come from `entryPointsFor(session)` — exactly what the landing
 * screen's own entry points are built from — so the header and the landing screen can
 * never disagree, and an epic that ships a new screen registers it in
 * `lib/auth/access-map.ts` alone rather than having to remember a second place. That
 * also means the wording shown here is the access map's wording.
 *
 * HIDDEN, NEVER DISABLED. A screen the session's roles exclude is simply not in the
 * list, so nothing here needs a disabled state (the UI-24 convention epic 1
 * established). A permitted screen whose own epic has not shipped yet IS still
 * offered and currently reaches a not-found page — deliberate and user-accepted (see
 * the epic brief's Notes & Caveats).
 *
 * Each destination is a real navigational LINK carrying its address, matching the
 * landing screen's entry points: it can be opened in a new tab, and a screen reader
 * announces it as a link.
 *
 * It is a CLIENT component for one reason: which screen is being viewed. The
 * `(authenticated)` layout is a server component and Next.js gives a layout no
 * pathname, so the address cannot be handed down — it is read here with
 * `usePathname()`, and the destination matching it carries `aria-current="page"` plus
 * a visible treatment that is not colour alone.
 *
 * The destinations stay in the markup at every width and simply wrap onto a second
 * row on a narrow screen — no collapsing behind a control. That keeps them reachable
 * by one Tab on a phone as well as a desktop, and keeps every control in the header
 * genuinely focusable (a control hidden by CSS at one width would be an unreachable
 * tab stop at the other).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { accessEntryFor, entryPointsFor } from '@/lib/auth/access-map';
import { cn } from '@/lib/utils';

import type { UserInfoRead } from '@/types/auth';

/**
 * The "you are here" treatment for the destination being viewed. Pairs a surface and
 * a heavier weight with an underline, so it is not told by colour alone, and is
 * distinguishable from the plain hover state (which underlines nothing).
 */
const CURRENT_DESTINATION_CLASSES =
  'bg-accent text-accent-foreground font-semibold underline decoration-2 underline-offset-4';

export function HeaderNav({ session }: { session: UserInfoRead }) {
  /**
   * `usePathname()` is typed as always answering an address, but rendered outside a
   * router context it really answers `null`. Read as nullable so "not known yet"
   * marks nothing as current instead of throwing.
   */
  const viewedPath: string | null = usePathname();

  /**
   * Normalised through the access map itself, so `/upload?from=email` and `/upload/`
   * are recognised as the registered `/upload` — the map already owns that rule, and
   * an unregistered (or unknown) address matches nothing.
   */
  const viewedAddress = accessEntryFor(viewedPath ?? '')?.path;

  const destinations = entryPointsFor(session);

  // A signed-in account whose roles this project does not recognise is offered
  // nothing — an empty navigation landmark would be noise, so there is none. The
  // landing screen is where such an account is told what to do about it.
  if (destinations.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Screens" className="min-w-0">
      <ul className="flex flex-wrap items-center gap-1">
        {destinations.map((destination) => {
          const isCurrent = destination.path === viewedAddress;

          return (
            <li key={destination.path}>
              <Link
                href={destination.path}
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  isCurrent && CURRENT_DESTINATION_CLASSES,
                )}
              >
                {destination.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
