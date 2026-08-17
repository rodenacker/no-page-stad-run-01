/**
 * Story Metadata:
 * - Epic: file-deletion — Story 1: delete any file from its own page
 * - Route: /upload/file
 * - Target File: web/src/components/files/SubmittedFileActions.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — the rename is COMPLETE: the trigger reads "Delete file", the confirmation
 *   offers "Delete the file" and "Keep the file", and nothing anywhere still reads
 *   "Cancel file" / "Cancel the file".
 * - AC-2 — the status gate is GONE: the delete is offered in every `CurrentStatus`,
 *   including `Imported` where it used to be absent — while the RETRY action's own
 *   status rule is untouched.
 * - AC-3 — a session that may not act on the file receives no delete control in the
 *   markup at all: absent, never disabled or greyed out.
 * - AC-5 — a refused delete is reported in the SERVICE's own words, the user stays
 *   where they were with the delete still offered, and nothing reports success.
 *
 * AC-4 (confirming a delete the service accepts and landing back on the Expense files
 * list, with the file gone from it) and AC-6 (keyboard completability and the
 * accessibility scan with the confirmation open) are this story's Playwright spec's —
 * deliberately not duplicated here (testing-policy.md § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE SURFACE is the SHIPPED component `web/src/components/files/
 *    SubmittedFileActions.tsx`, named export `SubmittedFileActions`, with its prop
 *    shape unchanged: `{ file, actingUploader, onRetried }`. This story MODIFIES it —
 *    it does not add a second, wider action beside the existing one (epic brief §Notes:
 *    "Implementing this correctly means DELETING the `cancelApplies` gate's exclusion
 *    of `Imported`").
 * 2. THE THREE USER-VISIBLE LABELS (brief R4). Trigger `Cancel file` → **`Delete
 *    file`**; confirm `Cancel the file` → **`Delete the file`**; the way out stays
 *    **`Keep the file`** and must NOT be renamed to anything reading "Cancel" — the
 *    destructive choice is now called Delete, so a way out reading "Cancel" would be
 *    the one ambiguous wording left. AC-1 below asserts the absence of the old wording
 *    as well as the presence of the new, because a HALF-DONE rename (trigger renamed,
 *    confirmation not) is the likely way this goes wrong and would sail past an
 *    assertion that only looked for the new labels.
 * 3. THE STATUS GATE GOES (brief R3/BR1). `cancelApplies` currently restricts the
 *    action to `Uploaded` and `Validation failed`. After this story the delete is
 *    offered for a file in ANY `CurrentStatus`. `retryApplies` is a DIFFERENT rule
 *    living in the same component and is NOT touched: retry stays offered only while
 *    the file's validation has failed. Removing the wrong gate is a real risk here,
 *    which is why AC-2 pins both rules in one pass.
 * 4. WHO MAY ACT is still decided on the SERVER and still arrives as one value
 *    (`actingUploader`), which still doubles as the `LastChangedUser` audit identity
 *    the delete call carries (brief R5/BR2/BR7). Absent means NOTHING is rendered —
 *    not a disabled control, not a greyed-out one (source UI-24).
 * 5. ONE DELETE CALL, and only one (brief R9). `DELETE {TRANSACTIONS_API_BASE_PATH}
 *    /v1/files?LogId=<id>` with the `LastChangedUser` header, through the existing
 *    wrapper in `lib/api/files.ts` — renamed to delete vocabulary if you like, but not
 *    duplicated. The mock below fails loudly on any other endpoint or method, so a
 *    second wrapper or a new endpoint constant shows up here as a test failure.
 * 6. A REFUSAL IS THE SERVICE'S OWN WORDING, reported on the screen BEHIND the
 *    confirmation (`serviceMessageOf(e) ?? serviceDetailOf(e) ?? own wording`,
 *    `lib/api/errors.ts`). The transactions service reports a refusal as a 500 carrying
 *    `Messages[]`, which the shared client keeps on `details` while putting its OWN
 *    placeholder on `message` — so `serviceMessageOf` alone finds nothing and
 *    "Internal Server Error: …" would reach the user (project.md NFR-base-5). This is
 *    the genuinely untested case now that an IMPORTED file can reach the call at all
 *    (brief BR6): the outcome must be reported as whatever the service said, never as
 *    a success and never as a silent no-op.
 * 7. WHAT THIS FILE DELIBERATELY DOES NOT PIN: the confirmation's BODY wording. Story 2
 *    owns that (the request-count sentence for an imported file, the simple sentence
 *    otherwise, and the count-could-not-be-read state), so nothing here asserts the
 *    description text — only the file being named and the three control labels. The
 *    transactions read story 2 adds is answered by the mock below so these tests keep
 *    passing once it lands.
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy), plus `next/navigation`, the framework
 * boundary. `lib/api/files.ts`, the toast composition and the Shadcn/Radix dialog are
 * the REAL production code, so what the user meets is asserted as rendered text. Every
 * response body comes from the project-wide `@/mocks/data/*` factories the Playwright
 * layer shares, so the two layers cannot drift onto different shapes.
 *
 * Render scope: the component itself, not the whole file page — this story targets one
 * shipped component (testing-policy.md § Render scope), and the page-level composition
 * is already pinned by `epic-file-validation-and-retry-story-4-*`. No fake timers: this
 * component has no clock of its own. No `axe()` — accessibility is AC-6's Playwright
 * scan.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, {
  PointerEventsCheckLevel,
} from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the shipped actions section this story renames and
// un-gates.
import { SubmittedFileActions } from '@/components/files/SubmittedFileActions';
// Real production toast composition (not mocked) — the surface the root layout wraps
// every signed-in screen in, so a refusal reported through it reads as text either way.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { apiClient, get } from '@/lib/api/client';
import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';
import { displayNameOf } from '@/lib/auth/identity';
// Project-wide factories — the single source both test layers share. The delete
// success/refusal pair and the one refusal SENTENCE are the same single
// `DELETE /v1/files` operation `file-validation-and-retry` used, carried forward under
// delete vocabulary. Never hand-write a response body in a test.
import {
  DELETE_REFUSED_MESSAGE,
  FILE_STATUS_UPLOADED,
  FILE_STATUS_VALIDATION_FAILED,
  deleteFailureResponse,
  deleteSuccessResponse,
} from '@/mocks/data/file-log';
import { userInfoFor } from '@/mocks/data/identity';
// The file-and-its-requests scenarios: one per non-imported status, plus the imported
// file whose rows have already become expense payment requests.
import {
  fileNeverImportedToDelete,
  filesNeverImportedToDelete,
  importedFileToDelete,
  transactionListResponse,
} from '@/mocks/data/transaction';
import { ROLE_IMPORTER } from '@/types/auth';

import type { FileDeletionScenario } from '@/mocks/data/transaction';
import type { APIError, APIRequestConfig } from '@/types/api';
import type { FileLog } from '@/types/files';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/upload/file',
  useSearchParams: () => new URLSearchParams({ LogId: '5150' }),
}));

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;
const mockGet = get as unknown as ReturnType<typeof vi.fn>;

/** The signed-in Finance Uploader, and the audit name the delete call must carry. */
const ACTING_UPLOADER = displayNameOf(userInfoFor(ROLE_IMPORTER));

/**
 * The accessible names of the controls this story is about. Anchored, so the
 * "Delete file" trigger and the confirmation's "Delete the file" choice can never be
 * mistaken for one another.
 */
const DELETE_FILE = /^delete file$/i;
const CONFIRM_DELETE = /^delete the file$/i;
const KEEP_FILE = /^keep the file$/i;
const RETRY = /^retry validation$/i;

/**
 * The wording this story RETIRES. `OLD_CANCEL_WORDING` is the two exact phrases R4
 * replaces; `ANY_CANCEL_CONTROL` is wider on purpose and is only ever applied to
 * CONTROLS — with the destructive choice now called Delete, no button on this surface
 * may read "Cancel" anything, including a way out renamed from "Keep the file".
 */
const OLD_CANCEL_WORDING = /cancel (the )?file/i;
const ANY_CANCEL_CONTROL = /cancel/i;

/** Anything claiming the delete worked — the one thing a refusal must never produce. */
const SUCCESS_WORDING = /succe/i;

/** Informational only: the address the shared client reports a refusal against. */
const DELETE_ENDPOINT = '/transactions-api/v1/files';

/**
 * What the shared client throws when the transactions service REFUSES the delete: its
 * own placeholder on `message`, and the service's `Messages[]` — from the shared
 * failure factory — on `details` (`lib/api/client.ts` → 500 branch). That split is the
 * whole point of AC-5: the service's reason is only reachable through `serviceDetailOf`.
 */
const REFUSED_DELETE: APIError = {
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  details: deleteFailureResponse().Messages,
  endpoint: DELETE_ENDPOINT,
};

/** What the delete call answers with from now on: the service's body, or its refusal. */
let deleteScript: { body: unknown } | { failure: APIError } = {
  body: deleteSuccessResponse(),
};

/** The whole `GET /v1/transactions` body — every file's rows, as the endpoint sends
 * them (it takes no query parameters). Story 2's confirmation narrows it client-side;
 * story 1 does not read it at all, and either way it is answered here so neither
 * version of the component meets an unscripted call. */
let transactionsBody: unknown = transactionListResponse(
  importedFileToDelete().transactions,
);

const noopRetried = vi.fn();

/**
 * The transactions service, as this component addresses it. Every endpoint this story
 * is allowed to touch is answered from a shared factory; anything else fails loudly,
 * because a SECOND delete wrapper or a renamed endpoint is exactly the drift these
 * tests exist to catch (brief R9 — there is one delete call in this app).
 */
const route = async (endpoint: string, method: string): Promise<unknown> => {
  const path = String(endpoint);
  const verb = method.toUpperCase();

  if (verb === 'DELETE' && /\/v1\/files(\?|$)/.test(path)) {
    if ('failure' in deleteScript) {
      throw deleteScript.failure;
    }
    return deleteScript.body;
  }
  if (path.includes('/v1/transactions')) {
    return transactionsBody;
  }

  throw new Error(
    `Unexpected ${verb} ${path}. This component deletes through ` +
      'DELETE /v1/files?LogId= only, and (from story 2) reads GET /v1/transactions ' +
      'for the request count — see the implementation contract above.',
  );
};

const setupUser = () =>
  userEvent.setup({
    // Radix puts `pointer-events: none` on the body while a modal is open; jsdom then
    // reports the dialog's own controls as un-clickable even though a real browser
    // lets them through.
    pointerEventsCheck: PointerEventsCheckLevel.Never,
  });

/** The actions section as the file page mounts it: inside the root layout's toasts. */
const renderActions = (file: FileLog, actingUploader?: string) =>
  render(
    <ToastProvider>
      <SubmittedFileActions
        file={file}
        actingUploader={actingUploader}
        onRetried={noopRetried}
      />
      <ToastContainer />
    </ToastProvider>,
  );

/**
 * Whether a control is offered AT ALL — queried including hidden elements, so a
 * greyed-out or `aria-hidden` stand-in fails just as a visible one would (UI-24), and
 * so controls behind an open Radix modal are still seen.
 */
const controlsNamed = (name: RegExp): HTMLElement[] =>
  screen.queryAllByRole('button', { name, hidden: true });

/** Where the user was sent, if anywhere — read from both router methods. */
const navigationTargets = (): string[] =>
  [...mockReplace.mock.calls, ...mockPush.mock.calls]
    .map((args) => args[0])
    .filter((target): target is string => typeof target === 'string');

describe('Epic file-deletion, Story 1: deleting any file from its own page', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    deleteScript = { body: deleteSuccessResponse() };
    transactionsBody = transactionListResponse(
      importedFileToDelete().transactions,
    );

    mockGet.mockImplementation((endpoint: string) => route(endpoint, 'GET'));
    mockApiClient.mockImplementation(
      (endpoint: string, config?: APIRequestConfig) =>
        route(endpoint, config?.method ?? 'GET'),
    );
  });

  // AC-1
  it('offers "Delete file" with a confirmation reading "Delete the file" and "Keep the file", and leaves no control reading "Cancel file" behind', async () => {
    const { file } = fileNeverImportedToDelete(FILE_STATUS_UPLOADED);
    const user = setupUser();
    renderActions(file, ACTING_UPLOADER);

    // The trigger is the renamed one, and the phrase it replaced is nowhere on the
    // surface — a half-done rename (new trigger, old confirmation, or the reverse) is
    // the likely failure, and looking only for the new labels would pass on it.
    expect(screen.getByRole('button', { name: DELETE_FILE })).toBeVisible();
    expect(screen.queryAllByText(OLD_CANCEL_WORDING)).toEqual([]);

    await user.click(screen.getByRole('button', { name: DELETE_FILE }));
    const confirmation = await screen.findByRole('alertdialog');

    // The two choices: the one that DOES it, and the way out — three distinct phrases
    // across the trigger and the dialog, so no user and no query can confuse them.
    expect(
      within(confirmation).getByRole('button', { name: CONFIRM_DELETE }),
    ).toBeVisible();
    expect(
      within(confirmation).getByRole('button', { name: KEEP_FILE }),
    ).toBeVisible();
    // It still names the file it is about (UI-09). WHAT ELSE it says is story 2's.
    expect(confirmation).toHaveTextContent(file.CurrentFileName);

    // With the confirmation open, every control this story touches is in the markup at
    // once — and not one of them reads "Cancel" anything: not the trigger, not the
    // confirming choice, and not the way out (R4 keeps it "Keep the file" precisely so
    // the only unambiguous wording survives the rename).
    expect(controlsNamed(ANY_CANCEL_CONTROL)).toEqual([]);
    expect(screen.queryAllByText(OLD_CANCEL_WORDING)).toEqual([]);
  });

  // AC-2
  it("offers the delete whatever the file's status — including a file that has already imported — while the retry's own status rule is unchanged", () => {
    // Every non-imported status the app knows, plus the imported case the shipped gate
    // excluded outright. Derived from the factories, so a status added to the app
    // cannot silently escape this criterion.
    const scenarios: FileDeletionScenario[] = [
      ...filesNeverImportedToDelete(),
      importedFileToDelete(),
    ];

    for (const { file } of scenarios) {
      const status = file.CurrentStatus;
      const { unmount } = renderActions(file, ACTING_UPLOADER);

      expect(
        controlsNamed(DELETE_FILE).length,
        `the delete must be offered on a file whose status is "${status}"`,
      ).toBe(1);

      // The OTHER rule in this same component, deliberately untouched: validation is
      // only worth retrying while it has failed. Removing the wrong gate is the real
      // risk when both live side by side.
      const retryApplies = status === FILE_STATUS_VALIDATION_FAILED;
      expect(
        controlsNamed(RETRY).length,
        `retry must ${retryApplies ? '' : 'NOT '}be offered on a file whose status ` +
          `is "${status}"`,
      ).toBe(retryApplies ? 1 : 0);

      unmount();
    }
  });

  // AC-3
  it('renders no delete control at all for a session that may not act on the file', () => {
    // The same file, twice. First told nobody may act on it: the exclusion is decided
    // on the server and arrives as an absent `actingUploader`, and what reaches the
    // browser is NOTHING — no section, no greyed-out control, no disabled one (UI-24).
    const { file } = importedFileToDelete();
    const { unmount } = renderActions(file, undefined);

    expect(controlsNamed(/delete/i)).toEqual([]);
    expect(screen.queryAllByText(/delete/i)).toEqual([]);
    expect(
      screen.queryByRole('heading', { name: /actions/i }),
    ).not.toBeInTheDocument();
    unmount();

    // And then told the signed-in Importer may: the same file now carries the control,
    // so the absence above is the session's doing and not an empty render.
    renderActions(file, ACTING_UPLOADER);
    expect(screen.getByRole('button', { name: DELETE_FILE })).toBeVisible();
  });

  // AC-5
  it("reports a refused delete in the service's own words, leaves the user where they were with the delete still offered, and never claims it worked", async () => {
    // The imported file: the case the shipped gate never let reach this call, and the
    // one the brief names as genuinely unverified against the real service (BR6).
    const { file } = importedFileToDelete();
    const user = setupUser();
    deleteScript = { failure: REFUSED_DELETE };
    renderActions(file, ACTING_UPLOADER);

    await user.click(screen.getByRole('button', { name: DELETE_FILE }));
    const confirmation = await screen.findByRole('alertdialog');
    await user.click(
      within(confirmation).getByRole('button', { name: CONFIRM_DELETE }),
    );

    // The service's own reason reached the user — it travels on `details` for a 500,
    // where `serviceMessageOf` alone finds nothing (`lib/api/errors.ts`). Its presence
    // is also what proves the delete was genuinely attempted: no other source in this
    // test can produce that sentence, so a silent no-op cannot pass here.
    expect(await screen.findByText(DELETE_REFUSED_MESSAGE)).toBeVisible();
    // The client's internal placeholder is never what the user reads.
    expect(
      screen.queryByText(CLIENT_FALLBACK_MESSAGES.serverError),
    ).not.toBeInTheDocument();

    // Nobody is held in a dialog to read why nothing happened.
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    // NOTHING reports the delete as having succeeded — not the service's own success
    // sentence, not any wording of the component's own, and not a request still shown
    // as being on its way.
    expect(screen.queryAllByText(SUCCESS_WORDING)).toEqual([]);
    expect(
      screen.queryByText(deleteSuccessResponse().Messages[0]),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // The user stayed on the file's page — a successful delete is what returns them to
    // the Expense files list, and this was not one.
    expect(navigationTargets()).toEqual([]);

    // The file is exactly as it was, and the delete is still there to try again — the
    // confirmation reopens, still about this same file.
    await user.click(screen.getByRole('button', { name: DELETE_FILE }));
    const reopened = await screen.findByRole('alertdialog');
    expect(reopened).toHaveTextContent(file.CurrentFileName);
    expect(
      within(reopened).getByRole('button', { name: CONFIRM_DELETE }),
    ).toBeVisible();
  });
});
