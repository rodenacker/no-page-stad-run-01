/**
 * Story Metadata:
 * - Epic: sign-in-and-app-shell — Sign in and the signed-in app shell
 * - Story: 2 — Sign in
 * - Route: /sign-in
 * - Target File: web/src/app/sign-in/page.tsx
 * - Page Action: create_new
 * - Requirements: R1, R4, R5, R6, R7, R8, R9, R12, R18, NFR1, NFR3
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-1, AC-2, AC-4, AC-5 → this file (`vitest`)
 * - AC-3 (accepted credentials land on the signed-in shell) and AC-6 (keyboard +
 *   axe) → `web/e2e/epic-sign-in-and-app-shell-story-2-sign-in.spec.ts`
 *   (`playwright`). Deliberately NOT duplicated here.
 *
 * ---------------------------------------------------------------------------
 * Implementation contract these tests pin (TDD red — read this before coding):
 *
 * 1. `web/src/app/sign-in/page.tsx` (the story's target file) renders the
 *    interactive form as a client component, `SignInForm`, at
 *    `web/src/components/auth/SignInForm.tsx` (named export). These tests render
 *    that component directly — narrowest scope that covers the ACs
 *    (testing-policy.md § Render scope). Keeping the form in its own client
 *    component leaves `page.tsx` free to stay a server component.
 * 2. The login call goes through the shared API client (`post` from
 *    `@/lib/api/client`, CLAUDE.md Rule 2) to the same-origin auth path
 *    `/v1/auth/login` (epic brief § Notes & Caveats — forwarded by the app, so
 *    the browser never crosses origins and the auth service's `Set-Cookie`
 *    reaches the browser on a browser-side fetch). Never a bare `fetch()`, and
 *    not a Server Action — the Playwright layer intercepts this call with
 *    `page.route()`, which cannot see Server Action requests.
 * 3. Required-field checks report **on blur**; the credential refusal reports
 *    **on submit**; nothing reports on keystroke (R6).
 * 4. A refused sign-in renders the auth service's message **verbatim, exactly
 *    once**, in a form-level live region (`role="alert"`) inside the form — not
 *    duplicated into a toast (double AT announcement) and never decorated with a
 *    field-specific hint or a client-side attempt count. Both fields are cleared
 *    so the user re-enters both (R12).
 * 5. The app does **no** failed-attempt counting of its own: the auth service
 *    owns lockout, so whatever refusal reason it returns — including a temporary
 *    lockout and its retry time (R18) — is what the user sees, on the very first
 *    attempt if that is what the service says.
 * 6. Because the shared client's 400/401 branches only read a `Messages[]`
 *    envelope, the auth service's `ErrorResponse` `{ Error, Message }` body
 *    (documentation/auth-api.yaml) must be surfaced onto the thrown `APIError`
 *    (`message` / `details`) by the auth endpoint layer — otherwise the real app
 *    shows "HTTP 400" where these tests show the service's wording.
 *    // Data-contract: full chain verified during manual checklist
 * ---------------------------------------------------------------------------
 *
 * Mocking: only the HTTP client (`@/lib/api/client`) and Next.js navigation are
 * mocked. Response/error bodies come from the project-wide mock-data modules in
 * `web/src/mocks/data/` — the same source the Playwright layer imports, so the
 * two layers cannot drift on the auth contract.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SignInForm } from '@/components/auth/SignInForm';
import { ToastProvider } from '@/contexts/ToastContext';
import { post } from '@/lib/api/client';
import { loginErrorResponse, userInfoFor } from '@/mocks/data/identity';
import { ROLE_FINANCE_UPLOADER } from '@/mocks/data/role';

import type { APIError } from '@/types/api';

vi.mock('@/lib/api/client', () => ({
  post: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/sign-in',
  useSearchParams: () => new URLSearchParams(),
}));

const mockPost = post as ReturnType<typeof vi.fn>;

/** Same-origin auth path the browser posts to (epic brief § Notes & Caveats). */
const LOGIN_ENDPOINT = '/v1/auth/login';

/**
 * The required-field wording (R4/R5) taken from the shared auth-contract source
 * rather than retyped here, so the message the form shows and the message the
 * auth service documents stay the same string.
 */
const REQUIRED_MESSAGE = loginErrorResponse().Message;

/**
 * The one legend line explaining the asterisk marker (R7):
 * "* indicates a required field".
 */
const REQUIRED_LEGEND = /indicates a required field/i;

/** Labels carry a leading/trailing asterisk marker (R7). */
const USERNAME_LABEL = /username\s*\*/i;
const PASSWORD_LABEL = /password\s*\*/i;

/** A real project identity for form-fill; the password is never a real one. */
const KNOWN_USERNAME = userInfoFor(ROLE_FINANCE_UPLOADER).Email;
const ANY_PASSWORD = 'mock-password-not-a-credential';

/**
 * The `APIError` the shared client rejects with, carrying the auth service's
 * `ErrorResponse` body. Note it is a plain object, not an `Error` instance —
 * that is exactly what `web/src/lib/api/client.ts` throws.
 */
const apiErrorFrom = (
  body: ReturnType<typeof loginErrorResponse>,
  statusCode: number,
): APIError => ({
  message: body.Message,
  statusCode,
  details: [body.Message],
  endpoint: LOGIN_ENDPOINT,
});

/**
 * Renders the form inside the app's real toast provider (the app shell provides
 * it), so the component may use `useToast()` without blowing up. The provider
 * renders no toast UI of its own, which keeps the form's own alert region the
 * single `role="alert"` in the tree.
 */
const renderSignInForm = () =>
  render(
    <ToastProvider>
      <SignInForm />
    </ToastProvider>,
  );

/** Fills both fields and submits — the shared path for the refusal tests. */
const submitCredentials = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(USERNAME_LABEL), KNOWN_USERNAME);
  await user.type(screen.getByLabelText(PASSWORD_LABEL), ANY_PASSWORD);
  await user.click(screen.getByRole('button', { name: /sign in/i }));
};

describe('Epic sign-in-and-app-shell, Story 2: Sign in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC-1
  it('presents one form with required, asterisk-marked Username and Password fields, a single marker legend, and the cursor in Username', () => {
    renderSignInForm();

    const username = screen.getByLabelText(USERNAME_LABEL);
    const password = screen.getByLabelText(PASSWORD_LABEL);

    // Both fields are required (R4/R5) and marked with the asterisk (R7).
    expect(username).toBeRequired();
    expect(password).toBeRequired();

    // Exactly one legend line explains the marker (R7) — not one per field.
    expect(screen.getAllByText(REQUIRED_LEGEND)).toHaveLength(1);

    // A single two-field form with one submit control (R9).
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();

    // The first editable field has focus when the form opens (R8).
    expect(username).toHaveFocus();
  });

  // AC-2
  it('reports the required-field message when the user leaves an empty field, and reports nothing while they are still typing', async () => {
    const user = userEvent.setup();
    renderSignInForm();

    const username = screen.getByLabelText(USERNAME_LABEL);

    // Typing reports nothing (R6 — no check fires on keystroke).
    await user.type(username, KNOWN_USERNAME);
    expect(screen.queryByText(REQUIRED_MESSAGE)).not.toBeInTheDocument();

    // Still nothing while the field is emptied again, focus never having left it.
    await user.clear(username);
    expect(screen.queryByText(REQUIRED_MESSAGE)).not.toBeInTheDocument();

    // Moving off the empty field reports it (R6 — synchronous checks on blur).
    await user.tab();
    expect(await screen.findByText(REQUIRED_MESSAGE)).toBeVisible();
  });

  // AC-4
  it('reports a refused sign-in without revealing which of the two fields was wrong, and clears both fields for re-entry', async () => {
    // The auth service's generic refusal (auth-api.yaml: 401 carries "a
    // deliberately generic message that does not reveal which field was
    // incorrect").
    const refusal = loginErrorResponse(
      'Sign-in failed. Check your details and try again.',
      'INVALID_CREDENTIALS',
    );
    mockPost.mockRejectedValue(apiErrorFrom(refusal, 401));

    const user = userEvent.setup();
    renderSignInForm();
    await submitCredentials(user);

    const alert = await screen.findByRole('alert');
    // Shown as given — the app adds no field-specific hint of its own (R12).
    expect(alert).toHaveTextContent(refusal.Message);
    expect(alert).not.toHaveTextContent(/username/i);
    expect(alert).not.toHaveTextContent(/password/i);

    // The user re-enters both (R12) — neither value is kept.
    expect(screen.getByLabelText(USERNAME_LABEL)).toHaveValue('');
    expect(screen.getByLabelText(PASSWORD_LABEL)).toHaveValue('');
  });

  // AC-5
  it("shows the auth service's temporary-lockout reason and retry time exactly as given, on the first attempt, counting no attempts of its own", async () => {
    // The auth service owns lockout (R18) — this is its response to a single
    // submission, so a form that showed a generic refusal here (or waited for a
    // client-side fifth attempt) would fail.
    const lockout = loginErrorResponse(
      'Your account is temporarily locked. You can try again after 14:35.',
      'ACCOUNT_LOCKED',
    );
    mockPost.mockRejectedValue(apiErrorFrom(lockout, 401));

    const user = userEvent.setup();
    renderSignInForm();
    await submitCredentials(user);

    const alert = await screen.findByRole('alert');
    // Verbatim, including the retry time the service supplied.
    expect(alert).toHaveTextContent(lockout.Message);
    expect(alert).toHaveTextContent('14:35');
    // No client-invented attempt tally layered on top of the service's reason.
    expect(alert).not.toHaveTextContent(/attempt/i);
  });
});
