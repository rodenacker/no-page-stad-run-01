/**
 * Role checks for this project's two roles.
 *
 * Every "may this person do / see this?" decision reads the roles in the CURRENT
 * `GET /v1/auth/userinfo` response (brief BR3) — these helpers take that response
 * as their input rather than caching anything of their own.
 *
 * Any role name the project does not recognise grants nothing at all, so a role
 * the auth service happens to return (the spec's own "Viewer" example, or a role
 * added for another application sharing the same credential store) can never
 * unlock a screen or an action here.
 */
import { PROJECT_ROLES } from '@/types/auth';

import type { ProjectRole, UserInfoRead } from '@/types/auth';

/**
 * The identity fields a role check needs — the full userinfo body satisfies it.
 * Exported so anything else deciding what a session may do (the route access map)
 * asks for the same minimum rather than declaring its own.
 */
export type RoleBearer = Pick<UserInfoRead, 'Roles'>;

/** Whether a role name is one this project recognises. */
export const isProjectRole = (name: string): name is ProjectRole =>
  (PROJECT_ROLES as readonly string[]).includes(name);

/**
 * The recognised roles this identity holds, in the order the auth service
 * returned them. Unrecognised role names are dropped.
 */
export const rolesOf = (session: RoleBearer): ProjectRole[] =>
  session.Roles.reduce<ProjectRole[]>((recognised, role) => {
    if (isProjectRole(role.Name)) {
      recognised.push(role.Name);
    }
    return recognised;
  }, []);

/** Whether this identity holds the given role. */
export const hasRole = (session: RoleBearer, role: ProjectRole): boolean =>
  rolesOf(session).includes(role);
