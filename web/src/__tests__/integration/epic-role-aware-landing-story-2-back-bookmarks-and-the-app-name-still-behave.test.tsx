/**
 * Story Metadata:
 * - Route: /
 * - Target File: web/src/app/(authenticated)/page.tsx
 * - Page Action: modify_existing
 *
 * Epic `role-aware-landing`, Story 2 — back, bookmarks and the app's name still
 * behave. This file covers the story's ONE Vitest criterion:
 *
 *   AC-4 — who may open the expense request list and the expense files screen is
 *   unchanged; both remain open to both roles.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE PINS (the developer's contract — read before implementing)
 * ---------------------------------------------------------------------------
 * This epic sends a single-role person straight from the landing address to the
 * screen their role uses. That is a ROUTING decision, never a permissions change
 * (brief §Notes & Caveats): `ACCESS_MAP` in `web/src/lib/auth/access-map.ts` —
 * `allowedRoles` for `/`, `/upload` and `/requests` alike — is not modified by
 * this epic (BR2, R8).
 *
 * So this is a REGRESSION GUARD, and it is asserted through the map's public
 * helpers rather than its literals:
 *
 *   - `canAccess(session, path)` — the answer the destination pages themselves
 *     check before rendering, and therefore the answer a bookmarked or pasted
 *     address gets.
 *   - `entryPointsFor(session)` — the same seeded facts read from the other
 *     side, which is what the landing chooser and the header navigation offer.
 *
 * A tempting shortcut this epic must NOT take is narrowing one destination's
 * `allowedRoles` to "the role that lands there" — that would look harmless while
 * the redirect is doing the steering, and would break the other role's bookmark
 * the moment they typed the address in. This test fails if that happens, from
 * either side of the map.
 *
 * The rest of the story is Playwright's, deliberately not re-asserted here: the
 * Back button after the redirect (AC-1), the header's app-name link (AC-2) and a
 * pasted address opening untouched in a real browser (AC-3) are all browser
 * history and real-navigation behaviour, which jsdom cannot judge.
 *
 * GREEN BY DESIGN. Unlike a feature test, a "must not change" invariant on
 * already-shipped behaviour passes the moment it is written — that is the point.
 * Its job is to fail the instant a story in this epic changes who may open either
 * destination while claiming to change only where a person is sent.
 */
import { describe, expect, it } from 'vitest';

import {
  ACCESS_MAP,
  REQUESTS_PATH,
  UPLOAD_PATH,
  accessEntryFor,
  canAccess,
  entryPointsFor,
} from '@/lib/auth/access-map';
// Project-wide identity source, shared with the Playwright layer: the userinfo
// bodies the app gates on are never hand-written in a test.
import {
  userInfoFor,
  userInfoWithUnrecognisedRole,
} from '@/mocks/data/identity';
// The auth service's OWN role names (project.md §Roles & Permissions).
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/types/auth';

import type { UserInfoRead } from '@/types/auth';

/** This project's two real roles — the two single-role identities this epic redirects. */
const BOTH_ROLES = [ROLE_IMPORTER, ROLE_APPROVER] as const;

/** Both screens this epic sends people to, and neither of which it may re-gate. */
const BOTH_DESTINATIONS = [REQUESTS_PATH, UPLOAD_PATH] as const;

/**
 * The shapes a real bookmark or a pasted address arrives in: the plain address, the
 * same address with a trailing slash, and the same address carrying a narrowing in
 * its query. All three select the same screen, so all three get the same answer.
 */
const addressesFor = (path: string): string[] => [
  path,
  `${path}/`,
  `${path}?from=bookmark`,
];

describe('Epic role-aware-landing, Story 2: the destinations keep exactly the reach they had', () => {
  // AC-4
  it('keeps the expense request list and the expense files screen open to both roles, and closed to an unrecognised account, from both sides of the access map', () => {
    // Each destination is registered ONCE. Two entries for one address would be two
    // answers to the same question, and a redirect could then land on either.
    BOTH_DESTINATIONS.forEach((destination) => {
      expect(accessEntryFor(destination)).toBeDefined();
      expect(
        ACCESS_MAP.filter((registered) => registered.path === destination),
      ).toHaveLength(1);
    });

    BOTH_ROLES.forEach((role) => {
      const session: UserInfoRead = userInfoFor(role);

      // Whichever screen this epic now redirects them to, EITHER role still opens
      // EITHER destination by typing, pasting or bookmarking its address — including
      // with a trailing slash or a narrowing in the query.
      BOTH_DESTINATIONS.forEach((destination) => {
        addressesFor(destination).forEach((address) => {
          expect(canAccess(session, address)).toBe(true);
        });
      });

      // The other side of the same seeded facts: both screens are still offered to
      // both roles, so the chooser a two-role person still sees, and the header
      // navigation on every screen, are unchanged too.
      expect(
        entryPointsFor(session)
          .map((entryPoint) => entryPoint.path)
          .sort(),
      ).toEqual([...BOTH_DESTINATIONS].sort());
    });

    // The exclusion is unchanged as well: an account whose only role this project
    // does not recognise is granted neither destination and offered nothing — this
    // epic redirects nobody into a screen they could not previously open.
    const unrecognised: UserInfoRead = userInfoWithUnrecognisedRole();

    BOTH_DESTINATIONS.forEach((destination) => {
      addressesFor(destination).forEach((address) => {
        expect(canAccess(unrecognised, address)).toBe(false);
      });
    });
    expect(entryPointsFor(unrecognised)).toEqual([]);
  });
});
