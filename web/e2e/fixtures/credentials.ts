/**
 * Mock identities for form-fill in Playwright specs.
 *
 * These are NOT real accounts and the passwords are NOT real credentials — every
 * auth call in the E2E layer is mocked (see `../support/auth-api-stub.ts` and the
 * `page.route()` interceptors in each spec), so nothing here is ever checked
 * against a real credential store. Never put a real password in this file.
 *
 * The usernames are derived from the project-wide identity source
 * (`web/src/mocks/data/identity.ts`) rather than retyped, so the account a spec
 * signs in as and the identity the mocked `GET /v1/auth/userinfo` returns can
 * never disagree. Roles are this project's two real roles
 * (generated-docs/project.md §Roles & Permissions).
 *
 * Import discipline: relative paths into `src/mocks/data/` (not the `@/` alias),
 * so Playwright resolves them with no alias plumbing.
 */
import { userInfoFor } from '../../src/mocks/data/identity';
import {
  ROLE_APPROVER,
  ROLE_FINANCE_UPLOADER,
} from '../../src/mocks/data/role';

export interface MockCredential {
  /** What the user types into the Username field. May be an email — the auth
   *  service's own login example is `demo@test.com` (epic brief §Notes). */
  username: string;
  /** Mock-only value; the auth boundary is stubbed, so this is never verified. */
  password: string;
  /** The role the mocked auth service reports for this identity. */
  role: string;
}

/** Shared placeholder password — mock-only, deliberately self-describing. */
const MOCK_PASSWORD = 'mock-password-not-a-credential';

export const financeUploaderUser: MockCredential = {
  username: userInfoFor(ROLE_FINANCE_UPLOADER).Email,
  password: MOCK_PASSWORD,
  role: ROLE_FINANCE_UPLOADER,
};

export const approverUser: MockCredential = {
  username: userInfoFor(ROLE_APPROVER).Email,
  password: MOCK_PASSWORD,
  role: ROLE_APPROVER,
};

/** Every mock identity the stubbed auth service accepts. */
export const mockCredentials: readonly MockCredential[] = [
  financeUploaderUser,
  approverUser,
];

/**
 * The mock identity matching a submitted username/password pair, or `undefined`
 * when nothing matches (the stub answers those with a 401, as the real service
 * would). Username comparison is case-insensitive, matching how credential
 * stores treat usernames/emails; the password must match exactly.
 */
export const credentialFor = (
  username: string,
  password: string,
): MockCredential | undefined =>
  mockCredentials.find(
    (candidate) =>
      candidate.username.toLowerCase() === username.toLowerCase() &&
      candidate.password === password,
  );
