/**
 * Story Metadata:
 * - Route: null (non-routable)
 * - Target File: web/src/app/api/decisions/route.ts
 * - Page Action: create_new
 *
 * Mocking strategy:
 * - Not applicable — no live test in this file. When these behaviours become
 *   observable in a browser (via Story 2's approve/reject journey on the request
 *   screen), the backend is ALWAYS mocked with page.route() there; never a live
 *   backend.
 *
 * E2E placeholder for Epic 5 "Approve or reject a request", Story 1: the
 * server-side decision endpoint that stamps the signed-in person's own name on
 * an approval or rejection and refuses anyone who is not an Approver.
 */
import { test } from '@playwright/test';

// Non-routable: server route handler plus its browser-side caller, with no screen of its own — verified by story 2's spec.
test('Epic 5, Story 1: Record a decision as the person who made it (deferred to consumer stories)', () => {
  test.fixme(); // skips at runtime; behaves consistently across Playwright
  // versions, unlike the declarative test.fixme('title', fn) form
});
