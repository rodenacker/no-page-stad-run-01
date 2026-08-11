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
import { ROLE_APPROVER, ROLE_IMPORTER, createRole } from './role';
import { createUser, createUserWithRoles } from './user';

import type { UserInfoRead } from './user';

/**
 * A role name this project does NOT recognise — the OpenAPI spec's own `"Viewer"`
 * example, which is not this project's role set (see the note above).
 *
 * It exists because "a signed-in account this project grants nothing" is a real
 * state the app models deliberately (`lib/auth/roles.ts`: an unrecognised role name
 * grants nothing; `RoleEntryPoints` and `HeaderNav` both answer it explicitly), and
 * it is the only exclusion left now that every registered address is open to both
 * real roles. It is what the hidden-never-disabled and in-page-denial criteria are
 * exercised with.
 */
export const UNRECOGNISED_ROLE = 'Viewer';

/**
 * The userinfo body for a signed-in account whose only role this project does not
 * recognise ({@link UNRECOGNISED_ROLE}).
 *
 * The role is built directly rather than through `roleNamed`, which refuses any name
 * outside the project's two on purpose — the point of this identity is to carry a
 * name the app has to grant nothing for, exactly as the auth service could return
 * one.
 */
export const userInfoWithUnrecognisedRole = (): UserInfoRead =>
  createUser({
    Id: 303,
    Email: 'vusi.dlamini@example.co.za',
    FirstName: 'Vusi',
    LastName: 'Dlamini',
    RolesString: UNRECOGNISED_ROLE,
    Roles: [createRole({ Id: 99, Name: UNRECOGNISED_ROLE })],
  });

/**
 * The userinfo body for a signed-in Approver whose name is written in a non-Latin
 * script (Cyrillic here) — a perfectly ordinary person the auth service can return.
 *
 * It exists because such a name cannot travel in an HTTP header: a header value is a
 * byte string, so any code point above U+00FF is not representable in one (accented
 * Latin — "André Müller" — is, and is unremarkable). The transactions service requires
 * the decider's name in a header, so this identity is the one that proves the app
 * reports a failed decision instead of crashing, and never quietly alters the name it
 * would record.
 */
export const userInfoWithNonLatinScriptName = (): UserInfoRead =>
  createUserWithRoles([ROLE_APPROVER], {
    Id: 404,
    Email: 'kirill.ivanov@example.co.za',
    FirstName: 'Кирилл',
    LastName: 'Иванов',
  });

/**
 * The userinfo body for a signed-in user holding the named role.
 *
 * Each role gets its own stable identity (distinct `Id`, name and email), so a
 * test asserting "the header shows who I am signed in as" (brief R3) can tell
 * the two roles apart. Throws on an unknown role name — {@link UNRECOGNISED_ROLE}
 * being the one deliberate exception, so both test layers can sign in as an account
 * this project grants nothing.
 *
 * @example userInfoFor('Approver')
 */
export const userInfoFor = (roleName: string): UserInfoRead => {
  switch (roleName) {
    case UNRECOGNISED_ROLE:
      return userInfoWithUnrecognisedRole();
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
          `${ROLE_IMPORTER}, ${ROLE_APPROVER}, plus "${UNRECOGNISED_ROLE}" for the ` +
          `account this project grants nothing ` +
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
