/**
 * How the signed-in person reads on screen.
 *
 * The auth service returns the identity in parts (`FirstName`, `LastName`,
 * `Roles[]`, plus a display-only `RolesString`). Every surface that shows "who am
 * I signed in as" — the app header today, request lists in later epics — composes
 * those parts the same way by using these two helpers, so the same person is never
 * written two different ways in two places (epic brief R3).
 *
 * The role label is derived from the roles this project RECOGNISES, not from the
 * service's `RolesString`: a role belonging to another application sharing the
 * credential store grants nothing here (`roles.ts`), so showing it would tell the
 * user they have standing they do not have.
 */
import { rolesOf } from './roles';

import type { UserInfoRead } from '@/types/auth';

/** The identity fields a display helper needs — a full userinfo body satisfies it. */
type DisplayableIdentity = Pick<
  UserInfoRead,
  'FirstName' | 'LastName' | 'Roles'
>;

/** The person's name as the app shows it. */
export const displayNameOf = (user: DisplayableIdentity): string =>
  `${user.FirstName} ${user.LastName}`.trim();

/**
 * The role(s) the app shows for this person, comma-separated, or an empty string
 * when they hold none this project recognises — in which case a caller shows no
 * role line at all rather than an empty one.
 */
export const roleLabelOf = (user: DisplayableIdentity): string =>
  rolesOf(user).join(', ');
