/**
 * Project-wide identity source: the `GET /v1/auth/userinfo` body the app gates on.
 *
 * This is the ONE place a userinfo response is defined. Vitest imports it via
 * `@/mocks/data/identity`; Playwright imports it via a relative
 * `../src/mocks/data/identity`; any runtime mock layer composes it too. A spec
 * that inlines its own userinfo body is how the two layers drift apart on the
 * identity contract — don't.
 *
 * Shape anchored to `documentation/auth-api.yaml` → `UserInfoRead`:
 * `Id`, `Email`, `FirstName`, `LastName`, `RolesString`, `Roles[]`,
 * `LastChangedUser`, `LastChangedDate`. Note there is no `Pages[]` field in this
 * project's contract — authorisation is driven purely by `Roles[]` (brief BR3),
 * re-resolved per server-rendered navigation rather than cached.
 *
 * Roles are project facts (generated-docs/project.md §Roles & Permissions): the
 * auth service returns `Importer` (the role the requirements call "Finance
 * Uploader") and `Approver`. The spec's own `"Viewer"` example is not this
 * project's role set (epic brief §Notes & Caveats).
 *
 * Import discipline (so the Playwright layer can import this without alias
 * plumbing): type-only imports, and sibling factories by relative path.
 */
import { ROLE_APPROVER, ROLE_IMPORTER } from './role';
import { createUserWithRoles } from './user';

import type { UserInfoRead } from './user';

/**
 * The userinfo body for a signed-in user holding the named role.
 *
 * Each role gets its own stable identity (distinct `Id`, name and email), so a
 * test asserting "the header shows who I am signed in as" (brief R3) can tell
 * the two roles apart. Throws on an unknown role name.
 *
 * @example userInfoFor('Approver')
 */
export const userInfoFor = (roleName: string): UserInfoRead => {
  switch (roleName) {
    case ROLE_IMPORTER:
      return createUserWithRoles([ROLE_IMPORTER], {
        Id: 101,
        Email: 'frances.nkosi@example.co.za',
        FirstName: 'Frances',
        LastName: 'Nkosi',
      });
    case ROLE_APPROVER:
      return createUserWithRoles([ROLE_APPROVER], {
        Id: 202,
        Email: 'thabo.mokoena@example.co.za',
        FirstName: 'Thabo',
        LastName: 'Mokoena',
      });
    default:
      throw new Error(
        `Unknown role "${roleName}". userInfoFor accepts this project's two roles: ` +
          `${ROLE_IMPORTER}, ${ROLE_APPROVER} ` +
          `(see generated-docs/project.md §Roles & Permissions).`,
      );
  }
};

/**
 * The userinfo body for a user holding several roles at once (`Roles[]` and
 * `RolesString` stay consistent). Useful for the "Approver may also upload"
 * combination; the single-role `userInfoFor` covers the two normal cases.
 */
export const userInfoForRoles = (roleNames: string[]): UserInfoRead => {
  if (roleNames.length === 0) {
    throw new Error(
      'userInfoForRoles requires at least one role — a signed-in user with no ' +
        'roles is not a state this project models.',
    );
  }
  const [primary] = roleNames;
  const base = userInfoFor(primary);
  return createUserWithRoles(roleNames, {
    Id: base.Id,
    Email: base.Email,
    FirstName: base.FirstName,
    LastName: base.LastName,
  });
};

/** Successful `POST /v1/auth/login` body (`DefaultResponse` envelope). */
export const loginSuccessResponse = (): {
  Id: number;
  MessageType: string;
  Messages: string[];
} => ({
  Id: 0,
  MessageType: 'SUCCESS',
  Messages: ['Login successful'],
});

/** Successful `POST /v1/auth/logout` body (`DefaultResponse` envelope). */
export const logoutSuccessResponse = (): {
  Id: number;
  MessageType: string;
  Messages: string[];
} => ({
  Id: 0,
  MessageType: 'SUCCESS',
  Messages: ['Logout successful'],
});

/**
 * `ErrorResponse` body for a rejected `POST /v1/auth/login` (400).
 * The default message is the spec's own missing-credentials wording, which is
 * also the message brief R4/R5 require.
 */
export const loginErrorResponse = (
  message = 'Username and password are required.',
  error = 'INVALID_REQUEST',
): { Error: string; Message: string } => ({ Error: error, Message: message });
