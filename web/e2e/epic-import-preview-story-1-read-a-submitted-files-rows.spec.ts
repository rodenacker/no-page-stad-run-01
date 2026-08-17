/**
 * Story Metadata:
 * - Route: null (non-routable)
 * - Target File: web/src/lib/files/parseSubmittedFileCsv.ts
 * - Page Action: create_new
 *
 * Mocking strategy:
 * - Not applicable — no live test in this file. When this parser's behaviour
 *   becomes observable in a browser (via story 2's preview table and story 3's
 *   verdict/error states on /upload/file), the backend is ALWAYS mocked with
 *   page.route() there; never a live backend.
 *
 * E2E placeholder for Epic 8 "Preview the rows of an import", Story 1: the
 * client-side CSV reader that turns a downloaded submitted file into one record
 * per data line, returning an explicit unreadable outcome instead of throwing.
 * Its own behaviour is covered by the story's Vitest suite
 * (web/src/__tests__/integration/epic-import-preview-story-1-read-a-submitted-files-rows.test.tsx).
 */
import { test } from '@playwright/test';

// Non-routable: a lib/ CSV-parsing module with no screen of its own — verified by stories 2 and 3's specs plus this story's Vitest suite.
test("Epic 8, Story 1: Read a submitted file's rows (deferred to consumer stories)", () => {
  test.fixme(); // skips at runtime; behaves consistently across Playwright
  // versions, unlike the declarative test.fixme('title', fn) form
});
