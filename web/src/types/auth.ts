/**
 * Identity and role types for this project's authentication contract.
 *
 * Shapes are anchored to `documentation/auth-api.yaml` (`UserInfoRead`,
 * `RoleRead`) — exact PascalCase field names, as the auth service returns them.
 * The policy example in `.claude/policies/bff-auth-pattern.md` shows an
 * illustrative `{ username, displayName }` userinfo body; this project's real
 * response is the shape below (epic brief §Notes & Caveats).
 *
 * This module is the single source of truth for the two role names. The test
 * factories in `src/mocks/data/role.ts` re-export these constants rather than
 * re-declaring the strings, so mocks and production role checks cannot drift.
 */

/**
 * `RoleRead` from auth-api.yaml / transactions-api.yaml.
 *
 * The spec declares no `required` list, so every property is nominally optional.
 * `Id` and `Name` are required here because they are what the app gates on; the
 * audit fields stay optional to match responses that omit them.
 */
export interface RoleRead {
  Id: number;
  Name: string;
  LastChangedUser?: string;
  LastChangedDate?: string;
}

/**
 * `UserInfoRead` — the body of `GET /v1/auth/userinfo`: who is signed in and
 * which roles they hold. Carries no session value or credential of any kind; the
 * `session` cookie is the sole conveyance of authentication state (brief BR2).
 */
export interface UserInfoRead {
  Id: number;
  Email: string;
  FirstName: string;
  LastName: string;
  /**
   * A single readable role value, e.g. "Approver". For a user holding both roles
   * the service joins the names. `Roles` carries the same set individually and is
   * what role checks read — `RolesString` is for display only.
   */
  RolesString: string;
  Roles: RoleRead[];
  LastChangedUser?: string;
  LastChangedDate?: string;
}

/**
 * This project's two real roles (generated-docs/project.md §Roles & Permissions).
 * The auth spec's own `RoleRead` example shows "Viewer", which is NOT a role of
 * this project and must grant nothing (epic brief §Notes & Caveats).
 */
export const ROLE_FINANCE_UPLOADER = 'Finance Uploader';
export const ROLE_APPROVER = 'Approver';

/** Every role this project recognises, in a stable display order. */
export const PROJECT_ROLES = [ROLE_FINANCE_UPLOADER, ROLE_APPROVER] as const;

export type ProjectRole = (typeof PROJECT_ROLES)[number];
