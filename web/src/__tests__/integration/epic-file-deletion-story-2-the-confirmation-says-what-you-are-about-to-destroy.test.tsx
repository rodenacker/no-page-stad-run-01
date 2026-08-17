/**
 * Story Metadata:
 * - Epic: file-deletion — Story 2: the confirmation says what you are about to destroy
 * - Route: /upload/file
 * - Target File: web/src/components/files/SubmittedFileActions.tsx
 *   (plus the NEW shared module web/src/lib/files/deleteConfirmation.ts)
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — an Imported file's confirmation states its REAL numbers: how many requests
 *   it produced, how many are already approved and how many rejected, and that the
 *   record of who decided them goes with them, irreversibly.
 * - AC-2 — a file in any other status gets the short confirmation, and its requests are
 *   never read at all.
 * - AC-3 — BR5, the dangerous case: a failed count read is its OWN state, never the
 *   short wording and never a zero.
 * - AC-4 — a file that genuinely produced nothing says so, and is never confused with
 *   AC-3's state.
 * - AC-5 — the count is announced while it is being read, and nothing is deleted until
 *   the confirming choice is taken.
 *
 * AC-6 (both confirmations opening with "Keep the file" holding focus, backing out on
 * Escape or Enter, and being completable by keyboard alone) is this story's Playwright
 * spec's — deliberately not duplicated here (testing-policy.md § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE SURFACE is the shipped `SubmittedFileActions`, unchanged in prop shape:
 *    `{ file: FileLog; actingUploader: string | undefined; onRetried: () => void }`.
 *    Story 1 has already renamed the three user-visible labels ("Delete file" /
 *    "Delete the file" / "Keep the file") and REMOVED the `cancelApplies` status gate
 *    (R3/BR1) — so every status, `Cancelled` included, reaches the confirmation and
 *    no new gate may be reintroduced here. `ConfirmAction` stays the one confirmation
 *    primitive: it is WRAPPED, never replaced, and its `description` is a single
 *    string — so each of the three states below is ONE sentence-run, not a stack of
 *    paragraphs.
 *
 * 2. THE SHARED MODULE this story creates — `web/src/lib/files/deleteConfirmation.ts`.
 *    Story 3 renders the same confirmation from the list and MUST reuse this rather
 *    than reimplement it, which is why the wording and the counting live here and not
 *    inside the component. What these tests import from it:
 *      - `NEVER_IMPORTED_MESSAGE: string`     — the R7 short wording (names nothing
 *        about counts; the file and its rows are removed and cannot be undone).
 *      - `COUNT_UNAVAILABLE_MESSAGE: string`  — the R8/BR5 state: the count could not
 *        be read, and already-decided requests may still be destroyed.
 *      - `COUNTING_REQUESTS_MESSAGE: string`  — what the user is told WHILE the read is
 *        in flight (AC-5). Announced in exactly ONE place on screen.
 *      - `importedConfirmationMessage(counts): string` — the R6 wording, built from the
 *        counts, including the "produced none" case.
 *    It also owns the counting itself — the BR4 client-side filter on
 *    `FileLogId === file.Id` and the approved/rejected tally — and the `Delete <name>?`
 *    title, so the component decides only WHICH state it is in. `RequestCounts` here is
 *    `{ total; approved; rejected; decided }`, structurally the same object the shared
 *    fixtures count with (`countRequests`), so production owns its own type and the
 *    mocks never leak into `src/lib`.
 *
 * 3. THE COUNT READ is `fetchTransactions()` (`@/lib/api/transactions`) — the existing
 *    call, which takes NO query parameters. The mock below fails loudly if any are
 *    sent: there is no server-side filter to ask for, the whole set is read and
 *    narrowed in the browser (BR4). It happens ONLY for a file whose `CurrentStatus`
 *    is `Imported`, and only because the delete was asked for.
 *
 * 4. THE DELETE is the one that already exists — `DELETE /v1/files?LogId=<id>` with the
 *    `LastChangedUser` header carrying `actingUploader` (R9/BR7). No second wrapper,
 *    no second endpoint, whatever it ends up being called.
 *
 * 5. THE THREE STATES ARE THREE STATES, never two. `Imported` + a count → R6 numbers;
 *    anything else → R7 short wording, with no read attempted; `Imported` + a refused
 *    read → the failed-count state, which must ALSO carry the service's own reason
 *    (`transactionListFailureMessage`, project.md NFR-base-5) and must never be the
 *    R7 wording, never a zero, and never a number it did not read.
 *
 * Mocked here, and why: only `@/lib/api/client`, the fixed HTTP boundary
 * (testing-policy.md § Mocking strategy), plus `next/navigation`, the framework
 * boundary. `lib/api/files.ts`, `lib/api/transactions.ts`, the new wording module and
 * the Shadcn/Radix dialog are the REAL production code, so what the user meets is
 * asserted as rendered text. Every response body comes from the project-wide
 * `@/mocks/data/*` factories the Playwright layer shares — this file states no
 * transaction, no file and no count of its own.
 *
 * No fake timers: nothing here is driven by a clock, only by a promise the test holds.
 * No `axe()` either — accessibility is the Playwright scan's (AC-6).
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, {
  PointerEventsCheckLevel,
} from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the shipped actions section, which this story teaches to
// say what a delete actually destroys.
import { SubmittedFileActions } from '@/components/files/SubmittedFileActions';
import { apiClient, del, get, post } from '@/lib/api/client';
import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';
import { TRANSACTIONS_ENDPOINT } from '@/lib/api/transactions';
import { displayNameOf } from '@/lib/auth/identity';
// The shared wording + counting module this story creates (contract note 2). The import
// fails until it exists — the expected TDD-red signal.
import {
  COUNTING_REQUESTS_MESSAGE,
  COUNT_UNAVAILABLE_MESSAGE,
  NEVER_IMPORTED_MESSAGE,
  importedConfirmationMessage,
} from '@/lib/files/deleteConfirmation';
import { deleteSuccessResponse } from '@/mocks/data/file-log';
import { userInfoFor } from '@/mocks/data/identity';
// The paired file-and-its-requests fixtures built for this story: every scenario carries
// two OTHER files' rows in the same response, so an implementation that forgets the
// client-side filter reports `expectedIfUnfiltered` and is caught by name.
import {
  TRANSACTION_LIST_FAILURE_MESSAGE,
  countRequests,
  filesNeverImportedToDelete,
  importedFileToDelete,
  importedFileWithNoRequests,
  importedFileWithNothingDecided,
  importedFileWithRequests,
  transactionListFailureResponse,
  transactionListResponse,
} from '@/mocks/data/transaction';
import { ROLE_IMPORTER } from '@/types/auth';

import type {
  FileDeletionScenario,
  RequestCounts,
  TransactionReadList,
} from '@/mocks/data/transaction';
import type { APIError, APIRequestConfig, DefaultResponse } from '@/types/api';
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
  useSearchParams: () => new URLSearchParams(),
}));

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;
const mockGet = get as unknown as ReturnType<typeof vi.fn>;
const mockPost = post as unknown as ReturnType<typeof vi.fn>;
const mockDel = del as unknown as ReturnType<typeof vi.fn>;

/** The signed-in Importer, and the audit name the delete call must carry (BR7). */
const ACTING_UPLOADER = displayNameOf(userInfoFor(ROLE_IMPORTER));

/**
 * The three controls' accessible names, anchored — the trigger, the confirming choice
 * and the way out must stay three different phrases (R4).
 */
const DELETE_FILE = /^delete file$/i;
const CONFIRM_DELETE = /^delete the file$/i;

/**
 * What the shared client throws when the transactions service refuses the count read:
 * its own placeholder on `message`, and the service's `Messages[]` on `details`
 * (`lib/api/client.ts` → 500 branch). Reaching the user's eyes therefore depends on
 * `serviceDetailOf`, which is exactly what AC-3 is about.
 */
const COUNT_READ_REFUSED: APIError = {
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  details: transactionListFailureResponse().Messages,
  endpoint: TRANSACTIONS_ENDPOINT,
};

/** One scripted answer: the body the service sends, a failure, or a read still in flight. */
type Scripted<T> =
  | { readonly body: T }
  | { readonly failure: APIError }
  | { readonly pending: Promise<T> };

/** A read the test holds open until it chooses to answer it (AC-5). */
interface Deferred<T> {
  promise: Promise<T>;
  answer: (value: T) => void;
}

const deferred = <T,>(): Deferred<T> => {
  let answer: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    answer = resolve;
  });
  return { promise, answer };
};

let transactionsScript: Scripted<TransactionReadList>;
let deleteScript: Scripted<DefaultResponse>;

const deliver = async <T,>(scripted: Scripted<T>): Promise<T> => {
  if ('failure' in scripted) {
    throw scripted.failure;
  }
  if ('pending' in scripted) {
    return scripted.pending;
  }
  return scripted.body;
};

/** The whole `GET /v1/transactions` body for a scenario — this file's rows AND the two
 * other files' rows, because the narrowing is the browser's job (BR4). */
const serveTransactions = (scenario: FileDeletionScenario): void => {
  transactionsScript = {
    body: transactionListResponse(scenario.transactions),
  };
};

/** The count read is refused from now on — the same failure a real 500 produces. */
const refuseTransactions = (): void => {
  transactionsScript = { failure: COUNT_READ_REFUSED };
};

/** One recorded delete: which file it named, and who it was attributed to. */
interface RecordedDelete {
  logId: string | null;
  lastChangedUser?: string;
}

let deleteRequests: RecordedDelete[] = [];

/** A query-parameter value the request actually carried, as text. */
const scalarOf = (value: unknown): string | null =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : null;

/**
 * The `LogId` a call named, whether it travelled as a client `params` entry or was
 * already spelled into the endpoint's query string.
 */
const logIdIn = (
  endpoint: string,
  config?: APIRequestConfig,
): string | null => {
  const fromParams = scalarOf(config?.params?.LogId);
  if (fromParams !== null) {
    return fromParams;
  }
  const [, query = ''] = endpoint.split('?');
  return new URLSearchParams(query).get('LogId');
};

/**
 * The transactions service, as this component addresses it. Exactly two calls are
 * allowed — the parameterless request read and the single existing delete — and
 * anything else fails loudly, because a second delete wrapper or a speculative
 * server-side filter is precisely the drift this epic must not produce.
 */
const route = async (
  endpoint: string,
  method: string,
  config?: APIRequestConfig,
): Promise<unknown> => {
  const path = String(endpoint);
  const verb = method.toUpperCase();

  if (verb === 'DELETE' && /\/v1\/files(\?|$)/.test(path)) {
    deleteRequests.push({
      logId: logIdIn(path, config),
      lastChangedUser: config?.lastChangedUser,
    });
    return deliver(deleteScript);
  }
  if (path.includes('/v1/transactions')) {
    const asked = Object.keys(config?.params ?? {});
    if (asked.length > 0 || path.includes('?')) {
      throw new Error(
        `GET /v1/transactions takes NO query parameters (documentation/` +
          `transactions-api.yaml), but this call sent ${[...asked, path].join(', ')}. ` +
          "One file's requests are found by reading the whole set and filtering on " +
          'FileLogId in the browser (BR4).',
      );
    }
    return deliver(transactionsScript);
  }

  throw new Error(
    `Unexpected ${verb} ${path}. This confirmation reads GET /v1/transactions and ` +
      'deletes through DELETE /v1/files?LogId= only (see the implementation contract ' +
      'above).',
  );
};

type UserEventInstance = ReturnType<typeof userEvent.setup>;

const setupUser = (): UserEventInstance =>
  userEvent.setup({
    // Radix puts `pointer-events: none` on the body while a modal is open; jsdom then
    // reports the dialog's own controls as un-clickable even though a real browser
    // lets them through.
    pointerEventsCheck: PointerEventsCheckLevel.Never,
  });

/** The actions section as the file's page mounts it, for a session that may act. */
const openActionsFor = (file: FileLog): (() => void) => {
  const { unmount } = render(
    <SubmittedFileActions
      file={file}
      actingUploader={ACTING_UPLOADER}
      onRetried={() => undefined}
    />,
  );
  return unmount;
};

/**
 * Asks to delete the file and waits until the count is no longer in flight — so every
 * assertion below is about the confirmation the user is finally left reading, whether
 * the implementation opens the dialog immediately and fills it in, or waits for the
 * read before opening it at all.
 */
const confirmationAfterCounting = async (
  user: UserEventInstance,
): Promise<HTMLElement> => {
  await user.click(screen.getByRole('button', { name: DELETE_FILE }));
  await waitFor(() => {
    expect(screen.getByRole('alertdialog')).not.toHaveTextContent(
      COUNTING_REQUESTS_MESSAGE,
    );
  });
  return screen.getByRole('alertdialog');
};

const textOf = (element: HTMLElement): string => element.textContent ?? '';

/**
 * The confirmation's text with the file's own NAME taken out — its date makes digits of
 * its own ("expenses_2026-04-20.csv"), and those are not counts. Anything numeric left
 * is something the confirmation is claiming about the file's requests.
 */
const withoutFileName = (text: string, file: FileLog): string =>
  text.split(file.CurrentFileName).join(' ');

/** The sentences of the confirmation, so a number is read WITH the thing it counts. */
const sentencesOf = (text: string): string[] =>
  text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim() !== '');

/**
 * The sentence the confirmation devotes to `subject` — "12 have already been approved"
 * — so an assertion about the approved count cannot be satisfied by a 12 that happened
 * to appear somewhere else in the dialog.
 */
const statementAbout = (text: string, subject: RegExp): string => {
  const sentence = sentencesOf(text).find((candidate) =>
    subject.test(candidate),
  );
  if (sentence === undefined) {
    throw new Error(
      `The confirmation says nothing about ${subject.source}. It reads: "${text}"`,
    );
  }
  return sentence;
};

const numberPattern = (value: number): RegExp =>
  new RegExp(`\\b${String(value)}\\b`);

const numbersOf = (counts: RequestCounts): number[] => [
  counts.total,
  counts.approved,
  counts.rejected,
  counts.decided,
];

/** The numbers an implementation that never filtered would report, minus any that the
 * right answer happens to share (those prove nothing either way). */
const misleadingNumbers = (
  right: RequestCounts,
  wrong: RequestCounts,
): number[] => {
  const correct = numbersOf(right);
  return [...new Set(numbersOf(wrong))].filter(
    (value) => !correct.includes(value),
  );
};

/**
 * The unfiltered numbers are NOWHERE in the confirmation.
 *
 * Asserting only that the right numbers appear would pass against a broken filter in
 * some orderings; stating that 65 requests / 21 approved / 10 rejected are absent will
 * not, because those are precisely what the other two files in the same response add.
 */
const expectNoUnfilteredNumbers = (
  confirmation: HTMLElement,
  scenario: FileDeletionScenario,
): void => {
  const text = withoutFileName(textOf(confirmation), scenario.file);
  const wrong = misleadingNumbers(
    scenario.expected,
    scenario.expectedIfUnfiltered,
  );
  // The fixture must actually differ unfiltered, or this proves nothing.
  expect(wrong).not.toHaveLength(0);
  for (const value of wrong) {
    expect(text).not.toMatch(numberPattern(value));
  }
};

describe('Epic file-deletion, Story 2: the confirmation says what you are about to destroy', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    transactionsScript = { body: transactionListResponse([]) };
    deleteScript = { body: deleteSuccessResponse() };
    deleteRequests = [];

    mockGet.mockImplementation(
      (endpoint: string, params?: APIRequestConfig['params']) =>
        route(endpoint, 'GET', { params }),
    );
    mockApiClient.mockImplementation(
      (endpoint: string, config?: APIRequestConfig) =>
        route(endpoint, config?.method ?? 'GET', config),
    );
    mockPost.mockImplementation(
      (endpoint: string, body: unknown, lastChangedUser?: string) =>
        route(endpoint, 'POST', {
          body: JSON.stringify(body),
          lastChangedUser,
        }),
    );
    mockDel.mockImplementation((endpoint: string, lastChangedUser?: string) =>
      route(endpoint, 'DELETE', { lastChangedUser }),
    );
  });

  // AC-1
  it("states an imported file's real request numbers — produced, already approved, already rejected — and that the record of who decided them goes too", async () => {
    // 40 requests, 12 approved, 3 rejected — and, in the same response, 25 rows
    // belonging to two OTHER imported files, 9 of them already decided.
    const scenario = importedFileToDelete();
    serveTransactions(scenario);
    const close = openActionsFor(scenario.file);

    const confirmation = await confirmationAfterCounting(setupUser());
    const text = textOf(confirmation);

    // It names the file it is about — nothing vague like "this file" (UI-09).
    expect(confirmation).toHaveTextContent(scenario.file.CurrentFileName);
    // ...and states each number beside the thing that number counts.
    expect(statementAbout(text, /\brequests?\b/i)).toMatch(
      numberPattern(scenario.expected.total),
    );
    expect(statementAbout(text, /\bapproved\b/i)).toMatch(
      numberPattern(scenario.expected.approved),
    );
    expect(statementAbout(text, /\brejected\b/i)).toMatch(
      numberPattern(scenario.expected.rejected),
    );
    // What else is destroyed with them (R6), and that there is no way back.
    expect(text).toMatch(/who decided/i);
    expect(text).toMatch(
      /cannot be undone|cannot be reversed|cannot be recovered/i,
    );
    // The numbers a MISSING client-side filter would have produced (65 / 21 / 10 / 31)
    // are nowhere on screen.
    expectNoUnfilteredNumbers(confirmation, scenario);
    close();

    // The same file, but its own `RecordCount` field now disagrees with the rows the
    // service actually holds. The confirmation counts the REQUESTS, not the file's
    // self-reported row count (BR4), so it still says 40 — and never 999.
    const disagreeing = importedFileWithRequests({
      file: { RecordCount: '999' },
    });
    serveTransactions(disagreeing);
    const closeDisagreeing = openActionsFor(disagreeing.file);

    const secondConfirmation = await confirmationAfterCounting(setupUser());
    expect(
      statementAbout(textOf(secondConfirmation), /\brequests?\b/i),
    ).toMatch(numberPattern(disagreeing.expected.total));
    expect(
      withoutFileName(textOf(secondConfirmation), disagreeing.file),
    ).not.toMatch(numberPattern(Number(disagreeing.file.RecordCount)));
    closeDisagreeing();

    // And a file that produced plenty but has had NOTHING decided says exactly that.
    // The other files' rows include decided ones, so an unfiltered count would claim
    // decisions are about to be destroyed here — the most alarming way to be wrong.
    const nothingDecided = importedFileWithNothingDecided();
    serveTransactions(nothingDecided);
    const closeNothingDecided = openActionsFor(nothingDecided.file);

    const thirdConfirmation = await confirmationAfterCounting(setupUser());
    expect(statementAbout(textOf(thirdConfirmation), /\brequests?\b/i)).toMatch(
      numberPattern(nothingDecided.expected.total),
    );
    expect(thirdConfirmation).toHaveTextContent(
      importedConfirmationMessage(nothingDecided.expected),
    );
    expectNoUnfilteredNumbers(thirdConfirmation, nothingDecided);
    closeNothingDecided();
  });

  // AC-2
  it('gives a file that never imported the short confirmation, and never reads its requests at all', async () => {
    // The count read is scripted to FAIL for every one of these files. That is how "no
    // read happened" is proved without counting calls: a read that DID happen would put
    // the failed-count state, or the service's own reason, on screen instead.
    refuseTransactions();

    // One file per non-imported status — Uploaded, Validating, Validation failed,
    // Cancelled — each with its own name, so a failure names the case that broke.
    for (const scenario of filesNeverImportedToDelete()) {
      const close = openActionsFor(scenario.file);

      const confirmation = await confirmationAfterCounting(setupUser());

      expect(confirmation).toHaveTextContent(scenario.file.CurrentFileName);
      expect(confirmation).toHaveTextContent(NEVER_IMPORTED_MESSAGE);
      // Nothing about a count: not the failed-read state, not the service's reason for
      // a failure, not the announcement a read in flight would have made.
      expect(confirmation).not.toHaveTextContent(COUNT_UNAVAILABLE_MESSAGE);
      expect(
        screen.queryByText(TRANSACTION_LIST_FAILURE_MESSAGE),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(COUNTING_REQUESTS_MESSAGE),
      ).not.toBeInTheDocument();

      close();
    }
  });

  // AC-3 — BR5, the one place a partial failure could silently understate what the user
  // is agreeing to.
  it("says plainly when an imported file's count could not be read, still warns about already-decided requests, and never falls back to the short wording or to a zero", async () => {
    const scenario = importedFileToDelete();
    refuseTransactions();
    const close = openActionsFor(scenario.file);

    const confirmation = await confirmationAfterCounting(setupUser());
    const text = textOf(confirmation);

    expect(confirmation).toHaveTextContent(scenario.file.CurrentFileName);
    // It says the count could not be read, in its own words AND the service's — never
    // the client's internal placeholder (project.md NFR-base-5).
    expect(confirmation).toHaveTextContent(COUNT_UNAVAILABLE_MESSAGE);
    expect(confirmation).toHaveTextContent(TRANSACTION_LIST_FAILURE_MESSAGE);
    expect(confirmation).not.toHaveTextContent(
      CLIENT_FALLBACK_MESSAGES.serverError,
    );
    // ...and it still warns that decisions may be destroyed with the file.
    expect(text).toMatch(/already/i);
    expect(text).toMatch(/decided|approved/i);

    // The three things this state must NEVER do.
    // 1. Fall through to the R7 wording, which describes a file with nothing to lose.
    expect(confirmation).not.toHaveTextContent(NEVER_IMPORTED_MESSAGE);
    // 2. Render as zero — neither the sentence a genuine none produces, nor a bare 0.
    expect(confirmation).not.toHaveTextContent(
      importedConfirmationMessage(countRequests([])),
    );
    expect(withoutFileName(text, scenario.file)).not.toMatch(/\b0\b/);
    // 3. State a count it never received.
    expect(confirmation).not.toHaveTextContent(
      importedConfirmationMessage(scenario.expected),
    );

    close();
  });

  // AC-4
  it('describes an imported file that genuinely produced nothing as none — a filter result, never the failed-count state', async () => {
    // The response is still full of other files' rows; this file simply owns none of
    // them. "None" therefore has to be what the filter answered.
    const scenario = importedFileWithNoRequests();
    serveTransactions(scenario);
    const close = openActionsFor(scenario.file);

    const confirmation = await confirmationAfterCounting(setupUser());
    const noneText = textOf(confirmation);

    expect(confirmation).toHaveTextContent(scenario.file.CurrentFileName);
    expect(confirmation).toHaveTextContent(
      importedConfirmationMessage(scenario.expected),
    );
    // The 25 rows the other two files contributed are not this file's, and not here.
    expectNoUnfilteredNumbers(confirmation, scenario);
    // And this is emphatically not the failed-count state.
    expect(confirmation).not.toHaveTextContent(COUNT_UNAVAILABLE_MESSAGE);
    expect(
      screen.queryByText(TRANSACTION_LIST_FAILURE_MESSAGE),
    ).not.toBeInTheDocument();
    close();

    // The SAME file with the read refused instead reads differently — the two states
    // are told apart by what they say, not only by what they leave out.
    refuseTransactions();
    const closeRefused = openActionsFor(scenario.file);

    const refusedConfirmation = await confirmationAfterCounting(setupUser());
    expect(refusedConfirmation).toHaveTextContent(COUNT_UNAVAILABLE_MESSAGE);
    expect(refusedConfirmation).not.toHaveTextContent(
      importedConfirmationMessage(scenario.expected),
    );
    expect(textOf(refusedConfirmation)).not.toEqual(noneText);
    closeRefused();
  });

  // AC-5
  it('tells the user the requests are being counted while the read is in flight, and deletes nothing until the confirming choice is taken', async () => {
    const scenario = importedFileToDelete();
    // The count read is held open until this test answers it.
    const count = deferred<TransactionReadList>();
    transactionsScript = { pending: count.promise };
    const user = setupUser();
    const close = openActionsFor(scenario.file);

    await user.click(screen.getByRole('button', { name: DELETE_FILE }));

    // The user is told what is being waited for, rather than being left with a
    // confirmation that has nothing to say yet...
    expect(
      await screen.findByText(COUNTING_REQUESTS_MESSAGE),
    ).toBeInTheDocument();
    // ...and nothing has been deleted while they wait.
    expect(deleteRequests).toEqual([]);

    count.answer(transactionListResponse(scenario.transactions));

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).not.toHaveTextContent(
        COUNTING_REQUESTS_MESSAGE,
      );
    });
    const confirmation = screen.getByRole('alertdialog');
    expect(statementAbout(textOf(confirmation), /\brequests?\b/i)).toMatch(
      numberPattern(scenario.expected.total),
    );
    // The count arriving is not consent: still nothing deleted.
    expect(deleteRequests).toEqual([]);

    // Only the confirming choice sends the one delete this app has — naming this file,
    // and attributed to the signed-in Importer (R9/BR7).
    await user.click(
      within(confirmation).getByRole('button', { name: CONFIRM_DELETE }),
    );

    await waitFor(() => {
      expect(deleteRequests).toEqual([
        {
          logId: String(scenario.file.Id),
          lastChangedUser: ACTING_UPLOADER,
        },
      ]);
    });

    close();
  });
});
