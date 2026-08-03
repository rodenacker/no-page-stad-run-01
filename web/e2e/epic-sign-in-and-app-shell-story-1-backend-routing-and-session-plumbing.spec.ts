/**
 * Story Metadata:
 * - Route: null (non-routable)
 * - Target File: web/src/lib/auth/requireSession.ts
 * - Page Action: create_new
 *
 * Mocking strategy:
 * - Not applicable — no live test in this file. When these behaviours become
 *   observable in a browser (via Story 2's sign-in journey), the backend is
 *   ALWAYS mocked with page.route() there; never a live backend.
 *
 * E2E placeholder for Epic "Sign in and the signed-in app shell", Story 1:
 * backend routing, session plumbing and role types.
 */
import { test } from '@playwright/test';

// Non-routable: infrastructure-only story with no route — verified by story 2's sign-in journey.
test('Epic 1, Story 1: Backend routing, session plumbing and role types (deferred to consumer stories)', () => {
  test.fixme(); // skips at runtime; behaves consistently across Playwright
  // versions, unlike the declarative test.fixme('title', fn) form
});
