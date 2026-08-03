/**
 * Story Metadata:
 * - Route: null (route handlers, not a page)
 * - Target File: web/src/app/v1/auth/[...path]/route.ts
 * - Page Action: create_new
 *
 * Mocking strategy:
 * - Not applicable — no live test in this file. Where this story's behaviour IS
 *   observable in a browser it is already covered by stories 2 and 3's specs, and
 *   there the backend is ALWAYS mocked (the auth-api stub booted by
 *   playwright.config.ts's globalSetup, plus page.route()); never a live backend.
 *
 * E2E placeholder for Epic "Sign in and the signed-in app shell", Story 7: backend
 * addresses resolved at request time, not build time.
 *
 * Why there is nothing new to drive a browser to: this story replaces the
 * `next.config.ts` rewrites with route handlers. It adds no screen, changes no
 * markup, and adds no browser-observable behaviour of its own — it changes WHERE
 * the same `/v1/auth/*` and `/transactions-api/*` calls are resolved. Its proof is
 * therefore the EXISTING specs passing in a mode they previously failed in:
 * `E2E_PROD=1 npm run test:e2e` runs the whole suite against a production build,
 * where the baked rewrite destination used to ignore the harness's stub address and
 * send story 3's sign-out POST to the real auth service. Duplicating that here as a
 * new spec would assert nothing the sign-out specs do not already assert; the
 * request-time contract itself (per-request origin resolution, header hygiene,
 * multi-`Set-Cookie` pass-through, unreachable-backend handling) is pinned in
 * `web/src/__tests__/integration/epic-sign-in-and-app-shell-story-7-request-time-backend-routing.test.tsx`.
 */
import { test } from '@playwright/test';

// Non-routable: infrastructure-only story with no route — verified by stories 2 and 3's specs passing against a production build (`E2E_PROD=1`).
test('Epic 1, Story 7: Backend addresses resolved at request time (deferred to consumer stories)', () => {
  test.fixme(); // skips at runtime; behaves consistently across Playwright
  // versions, unlike the declarative test.fixme('title', fn) form
});
