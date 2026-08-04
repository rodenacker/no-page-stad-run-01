/**
 * Project-wide entity factory: User.
 *
 * Single source of truth for the user/identity payload shape and its canonical
 * values. Imported by BOTH test layers (Vitest via `@/mocks/data/user`,
 * Playwright via a relative `../src/mocks/data/user`) — never re-declared in a
 * test file.
 *
 * Shape anchored to `documentation/auth-api.yaml` → `UserInfoRead` (returned by
 * `GET /v1/auth/userinfo`): `Id`, `Email`, `FirstName`, `LastName`,
 * `RolesString`, `Roles[]`, `LastChangedUser`, `LastChangedDate` — exact field
 * names and PascalCase casing. `documentation/transactions-api.yaml`'s `UserRead`
 * declares the identical shape, so one factory serves both endpoints.
 *
 * For the per-role userinfo bodies the auth gate is tested against, use
 * `userInfoFor(role)` in `./identity` — do not hand-write userinfo in a spec.
 *
 * Import discipline (so the Playwright layer can import this without alias
 * plumbing): type-only imports, and sibling factories by relative path.
 */
import { ROLE_IMPORTER, roleNamed } from './role';

import type { RoleRead } from './role';
import type { UserInfoRead } from '../../types/auth';

/**
 * `UserInfoRead` (auth-api) / `UserRead` (transactions-api) — the same shape,
 * declared once in the production module `src/types/auth.ts` and re-exported here
 * so a mocked identity can never diverge from the shape the app consumes.
 * (`RolesString` is a single readable role value, e.g. "Approver"; for a user
 * holding both roles the factories below join the names with ", ".)
 */
export type UserRead = UserInfoRead;
export type { UserInfoRead };

/**
 * Canonical user. Defaults to an Importer (the role the requirements call
 * "Finance Uploader"); override any field.
 * ZA-locale identity values (project.md §Compliance — POPIA, region ZA).
 */
export const createUser = (overrides: Partial<UserRead> = {}): UserRead => ({
  Id: 101,
  Email: 'frances.nkosi@example.co.za',
  FirstName: 'Frances',
  LastName: 'Nkosi',
  RolesString: ROLE_IMPORTER,
  Roles: [roleNamed(ROLE_IMPORTER)],
  LastChangedUser: 'System',
  LastChangedDate: '2026-04-30 15:00:00',
  ...overrides,
});

/**
 * `RolesString` derived from a role set, so the two role-carrying fields of a
 * mocked response can never disagree with each other.
 */
export const rolesStringFor = (roles: RoleRead[]): string =>
  roles.map((role) => role.Name).join(', ');

/**
 * A user holding exactly the named roles, with `Roles[]` and `RolesString` kept
 * consistent. Throws on an unknown role name (see `roleNamed`).
 */
export const createUserWithRoles = (
  roleNames: string[],
  overrides: Partial<UserRead> = {},
): UserRead => {
  const roles = roleNames.map((name) => roleNamed(name));
  return createUser({
    Roles: roles,
    RolesString: rolesStringFor(roles),
    ...overrides,
  });
};

/** Display name as the app header shows it (brief R3). */
export const fullNameOf = (user: UserRead): string =>
  `${user.FirstName} ${user.LastName}`;
