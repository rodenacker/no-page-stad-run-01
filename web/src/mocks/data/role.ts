/**
 * Project-wide entity factory: Role.
 *
 * Single source of truth for canonical `RoleRead` VALUES (the shape and the role
 * names themselves live in the production module `src/types/auth.ts` and are
 * re-exported below). Imported by BOTH test layers (Vitest via
 * `@/mocks/data/role`, Playwright via a relative `../src/mocks/data/role`) and by
 * any runtime mock layer — never re-declared in a test file.
 *
 * Shape anchored to `documentation/auth-api.yaml` → `components.schemas.RoleRead`
 * (identical schema in `documentation/transactions-api.yaml`): `Id`, `Name`,
 * `LastChangedUser`, `LastChangedDate` — exact field names and PascalCase casing.
 *
 * ROLE NAMES: the OpenAPI spec's own example shows `"Viewer"`. That is NOT this
 * project's role set. The two real roles are `Finance Uploader` and `Approver`
 * (generated-docs/project.md §Roles & Permissions; epic brief §Notes & Caveats).
 * Role checks and mocks use those two names only.
 *
 * Import discipline (so the Playwright layer can import this without alias
 * plumbing): type-only imports, and sibling factories by relative path.
 */

/**
 * The `RoleRead` shape and the two role names come from the production module
 * `src/types/auth.ts` (imported by relative path so the Playwright layer needs no
 * alias plumbing) and are re-exported here for convenience. Both layers therefore
 * gate on the same values the application does — a mock role name cannot drift
 * from the role name production code recognises.
 */
import {
  PROJECT_ROLES,
  ROLE_APPROVER,
  ROLE_FINANCE_UPLOADER,
  type ProjectRole,
  type RoleRead,
} from '../../types/auth';

export { ROLE_APPROVER, ROLE_FINANCE_UPLOADER };
export type { RoleRead };

export type ProjectRoleName = ProjectRole;

/** Stable ids so assertions and fixtures agree on the same role across layers. */
const ROLE_IDS: Record<ProjectRoleName, number> = {
  [ROLE_FINANCE_UPLOADER]: 1,
  [ROLE_APPROVER]: 2,
};

const PROJECT_ROLE_NAMES: readonly ProjectRoleName[] = PROJECT_ROLES;

export const isProjectRoleName = (name: string): name is ProjectRoleName =>
  (PROJECT_ROLE_NAMES as readonly string[]).includes(name);

/**
 * Canonical `RoleRead`. Defaults to Finance Uploader; override any field.
 */
export const createRole = (overrides: Partial<RoleRead> = {}): RoleRead => ({
  Id: ROLE_IDS[ROLE_FINANCE_UPLOADER],
  Name: ROLE_FINANCE_UPLOADER,
  LastChangedUser: 'System',
  LastChangedDate: '2026-04-30 15:00:00',
  ...overrides,
});

/**
 * The `RoleRead` for one of this project's real roles, with its stable id.
 * Throws on an unknown name — a typo'd role in a test must fail loudly rather
 * than silently mint a role the backend would never return.
 */
export const roleNamed = (name: string): RoleRead => {
  if (!isProjectRoleName(name)) {
    throw new Error(
      `Unknown role "${name}". This project has exactly two roles: ` +
        `${PROJECT_ROLE_NAMES.join(', ')} (see generated-docs/project.md §Roles & Permissions).`,
    );
  }
  return createRole({ Id: ROLE_IDS[name], Name: name });
};

/** Both real roles — for lists/selectors that must show more than one value. */
export const allProjectRoles = (): RoleRead[] =>
  PROJECT_ROLE_NAMES.map((name) => roleNamed(name));
