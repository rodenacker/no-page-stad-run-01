/**
 * Story Metadata:
 * - Epic: files-view-redesign — Story 1: the files register as a ruled batch listing
 * - Route: /upload
 * - Target File: web/src/components/files/SubmittedFilesList.tsx
 * - Page Action: modify_existing
 *
 * Covers the criteria tagged `vitest`:
 * - AC-3 — every row still offers Open, and Delete only to an Importer (an
 *   Approver's rows carry no Delete at all), and each row's status still reads as
 *   a mark paired with its own words rather than as colour alone;
 * - AC-4 — the three answers that are not rows (waiting, nothing submitted yet, a
 *   failed read with its Try again) all still read as themselves, and Try again
 *   still asks the service for the list again.
 *
 * AC-1 (full-bleed register, hairline rules between files, small capitalised column
 * heads, no card / panel / striped rows / status pill) and AC-2 (the record count
 * right-aligned in the typewriter face with the digits lining up, file name and
 * setting as mono identifiers, no new grand total) are tagged `none`: both are
 * judgements made by eye, down a column, on a real screen. jsdom reports every
 * element at 0×0 and computes no layout, so an assertion here could only re-state a
 * class name or a font family — the exact anti-pattern this file must not contain.
 * They are on the story's manual checklist. AC-5 (the self-refresh cadence and the
 * two announcements) and AC-6 (the delete flow from a row) are this story's
 * Playwright spec and are deliberately not duplicated here (testing-policy.md §
 * "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS — a safety net for a PRESENTATION-ONLY change
 * ---------------------------------------------------------------------------
 * This story changes how `SubmittedFilesList` is DRAWN and nothing about what it
 * does (epic brief R1/BR1/BR2): no new entity, no new call, no permission change.
 * Everything asserted below already works today — so these tests fail only where
 * the redesign has not yet been applied, or where it has been applied by rewriting
 * behaviour that was supposed to be reused. That second failure mode is the real
 * risk: a re-drawn row that quietly loses the Importer-only delete, or that turns
 * the status into a bare coloured swatch, still LOOKS right.
 *
 * So the assertions reach for the production layer's own expressions rather than
 * re-typing anything:
 * - who may delete, and under whose name — `actingUploaderIn` (`lib/auth/identity`),
 *   the ONE expression `/upload` and a file's own page both gate on, applied to the
 *   project-wide identity source (`userInfoFor`). The Approver case gets its
 *   `undefined` from production code, not from this test's opinion;
 * - the roles the server hands the list — `rolesOf`, exactly as the page does;
 * - the delete control's visible wording — `DELETE_FILE_LABEL`
 *   (`lib/files/deleteConfirmation`), shared with the file's own page;
 * - a row's Open target — `submittedFileAddress` (`lib/files/fileAddress`);
 * - every response body — the project-wide factories in `@/mocks/data/file-log`.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE UNIT IS THE EXISTING COMPONENT. `@/components/files/SubmittedFilesList`,
 *    named export `SubmittedFilesList`, still a client component taking the same two
 *    server-decided props (`viewerRoles`, `actingUploader`) with their existing
 *    opposite polarities. No second list, no parallel "redesigned" component beside
 *    the old one, no new prop to switch presentation.
 * 2. TABLE SEMANTICS STAY at desktop width. The register remains a real `<table>`
 *    (the Shadcn `table` primitive, restyled — CLAUDE.md §1) with one row per file,
 *    so the assertions below can read a value inside the row that carries it. Only
 *    the card wrapper, the striped rows and the boxed controls go. The narrow-width
 *    presentation belongs to story 6; jsdom answers `matchMedia` with nothing
 *    matching, so every render here is the wide one.
 * 3. EVERY ROW STILL CARRIES ITS OWN IDENTIFIERS: its file name AND its own
 *    `RecordCount`. Both are used below to find a row, and the two must resolve to
 *    the SAME row — no assertion depends on the order the service returned or on a
 *    row's position (testing-policy.md § anti-pattern 7).
 * 4. OPEN STAYS A REAL LINK per row, carrying `submittedFileAddress(file)` and named
 *    in a way that includes the file it opens — so a screen reader tells one row's
 *    Open from another's by more than position. Not a button that pushes a route.
 * 5. DELETE STAYS IN THE ROW, worded `DELETE_FILE_LABEL` and naming its own file,
 *    offered only where the server named an acting uploader. For anybody else it is
 *    ABSENT FROM THE MARKUP — not present-and-disabled, not tucked behind a menu,
 *    not anywhere else on the screen (source UI-24). The queries below find disabled
 *    controls and menu items too, so a greyed-out delete fails.
 * 6. A STATUS IS A MARK PAIRED WITH ITS WORDS, never colour alone: the service's own
 *    status text on the row, with a drawn shape beside it that exists IN THE DOM
 *    (the shared `components/status/StatusBadge` via `FileStatusBadge` — nothing here
 *    draws a second one). A shape produced only by CSS (a border, a pseudo-element)
 *    cannot be seen from here and does not satisfy the criterion.
 * 7. ALL THREE NON-ROW ANSWERS KEEP THEIR EXISTING SHAPE AND WORDING: the wait
 *    ANNOUNCED (a `status` live region saying it is loading, not a shape alone) with
 *    no rows and no stale content beside it; nothing-submitted-yet as a plain
 *    sentence that is NOT reported as a failure; and a failed read as an `alert`
 *    carrying the SERVICE's own reason — never the shared client's placeholder
 *    (project.md NFR-base-5) — plus a Try again that really re-reads the list. The
 *    register still names itself in all three states, since with no card around them
 *    each answer has to be composed deliberately.
 * 8. NO NEW CALL. The list read is still `GET /v1/file-logs` and nothing else is
 *    fetched while the register is merely being looked at; the fake service below
 *    fails loudly on any other endpoint.
 *
 * Mocked here, and why: only `@/lib/api/client` (the fixed convention,
 * testing-policy.md § Mocking strategy) plus `next/navigation` — a library at the
 * client-navigation boundary with no App Router context in jsdom. The toast
 * composition is the real production code the root layout mounts. Every response
 * body comes from the project-wide factories, and both roles come from the
 * project-wide identity source, so this file and the Playwright layer cannot drift
 * onto different data or different people.
 *
 * These tests WILL FAIL until the story is implemented (TDD red).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test — the register this story re-draws.
import { SubmittedFilesList } from '@/components/files/SubmittedFilesList';
// Real production notification composition (not mocked): the same one the root
// layout wraps every signed-in screen in.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';
// The two server-side decisions `/upload` makes about the person watching, taken
// from the production expressions rather than restated here.
import { actingUploaderIn } from '@/lib/auth/identity';
import { rolesOf } from '@/lib/auth/roles';
// The delete control's visible wording, shared with a file's own page.
import { DELETE_FILE_LABEL } from '@/lib/files/deleteConfirmation';
// Where a row's Open goes, from the one module that owns that address.
import { submittedFileAddress } from '@/lib/files/fileAddress';
// Project-wide FileLog factories: the single source of truth for the wire shape and
// its canonical values, shared with the Playwright layer.
import {
  fileLogListResponse,
  fileLogWithStatus,
  fileLogsInEveryStatus,
  isKnownFileStatus,
} from '@/mocks/data/file-log';
// The project-wide identity source both test layers share.
import { userInfoFor } from '@/mocks/data/identity';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/types/auth';
import { FILE_STATUS_IMPORTED } from '@/types/files';

import type { APIError } from '@/types/api';
import type { FileLog, FileLogList } from '@/types/files';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/upload',
  useSearchParams: () => new URLSearchParams(),
}));

const mockGet = get as unknown as ReturnType<typeof vi.fn>;

type User = ReturnType<typeof userEvent.setup>;

/* -------------------------------------------------------------------------- */
/* Who is watching — the SERVER's two decisions, from production code          */
/* -------------------------------------------------------------------------- */

const IMPORTER = userInfoFor(ROLE_IMPORTER);
const APPROVER = userInfoFor(ROLE_APPROVER);

/**
 * The props `/upload` hands the register for one signed-in person: the roles that
 * decide who is TOLD about things (`rolesOf`), and the name under which a file may
 * be deleted (`actingUploaderIn`) — `undefined` for anybody but the Finance
 * Uploader. Both come from the production expressions, so the Approver's missing
 * delete is the app's own decision rather than this test's.
 */
const viewedBy = (
  user: typeof IMPORTER,
): { viewerRoles: string[]; actingUploader: string | undefined } => ({
  viewerRoles: rolesOf(user),
  actingUploader: actingUploaderIn(user),
});

/* -------------------------------------------------------------------------- */
/* The fake transactions service                                              */
/* -------------------------------------------------------------------------- */

/** The one address this register reads (`GET /v1/file-logs?IsActive=Yes`). */
const FILE_LOGS_PATH = '/v1/file-logs';

/**
 * The service's OWN reason for a refused list read, as only a backend would phrase
 * it — so the assertion that the user is shown the service's wording cannot be
 * satisfied by the screen's own fallback sentence.
 *
 * Written here rather than taken from `@/mocks/data/file-log` because that factory
 * carries refusal bodies for the upload, retry and delete calls but none for the
 * list READ, and this is an `APIError` as the shared client throws it rather than a
 * wire body. It follows the real 500 + `DefaultResponse` shape the transactions
 * service uses for these endpoints: the client keeps its own placeholder on
 * `message` and the service's `Messages[]` on `details`, which is why this wording
 * can only reach the user through `serviceDetailOf` (`lib/api/errors.ts`).
 */
const LIST_READ_REFUSED_MESSAGE =
  'The file log could not be read (the process store is unavailable).';

const REFUSED_LIST_READ: APIError = {
  message: CLIENT_FALLBACK_MESSAGES.serverError,
  statusCode: 500,
  details: [LIST_READ_REFUSED_MESSAGE],
  endpoint: `/transactions-api${FILE_LOGS_PATH}`,
};

/** One scripted answer to the list read: a body, a refusal, or a call held open. */
type Scripted =
  | { readonly body: FileLogList }
  | { readonly failure: APIError }
  | { readonly pending: Promise<FileLogList> };

let listScript: Scripted | null = null;

/** What `GET /v1/file-logs` answers from now on. */
const serveFiles = (files: FileLog[]): void => {
  listScript = { body: fileLogListResponse(files) };
};

/** A list read the test holds open, so the waiting state is observable. */
interface Held {
  promise: Promise<FileLogList>;
  answer: (body: FileLogList) => void;
}

const holdTheRead = (): Held => {
  let answer: (body: FileLogList) => void = () => undefined;
  const promise = new Promise<FileLogList>((resolve) => {
    answer = resolve;
  });
  listScript = { pending: promise };
  return { promise, answer };
};

/* -------------------------------------------------------------------------- */
/* Rendering, and reading the register back                                   */
/* -------------------------------------------------------------------------- */

/** The register as `/upload` mounts it: inside the root layout's toast composition. */
const renderRegister = (props: {
  viewerRoles: string[];
  actingUploader: string | undefined;
}) =>
  render(
    <ToastProvider>
      <SubmittedFilesList {...props} />
      <ToastContainer />
    </ToastProvider>,
  );

/** An element's visible text, with runs of whitespace collapsed as the DOM shows it. */
const textOf = (element: HTMLElement): string =>
  (element.textContent ?? '').replace(/\s+/gu, ' ').trim();

/** A file name as a literal inside a pattern — these carry dots. */
const asLiteral = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** What a failed negative assertion should print: the offending control, named. */
const described = (element: HTMLElement): string =>
  `<${element.tagName.toLowerCase()}> "${textOf(element)}"`;

/** Every row of the register that holds values, i.e. without its heading row. */
const fileRows = (): HTMLElement[] =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('cell').length > 0);

/**
 * The row carrying a given value — a file name or a record count — required to be
 * unique, so a widened match can never quietly select the wrong file. Never an
 * index: the fixture gives every file its own name AND its own digit-width record
 * count precisely so a row can be found by what it says about itself.
 */
const rowCarrying = (value: string): HTMLElement => {
  const matches = fileRows().filter(
    (row) => within(row).queryAllByText(value).length > 0,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one row of the register carrying "${value}", found ` +
        `${String(matches.length)} — the register renders one row per submitted ` +
        'file, each carrying its own file name and its own record count (see the ' +
        'implementation contract above).',
    );
  }
  return matches[0];
};

/** Every role a per-row action could be offered under, disabled ones included. */
const CONTROL_ROLES = [
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
] as const;

/** Every activatable control in `surface` whose accessible name matches. */
const controlsNamed = (surface: HTMLElement, name: RegExp): HTMLElement[] =>
  CONTROL_ROLES.flatMap((role) =>
    within(surface).queryAllByRole(role, { name }),
  );

/** The way into a file's own page, from its row. */
const OPEN = /^open\b/iu;

/**
 * A row's delete, anchored at the start so it can never be satisfied by the
 * confirmation's own "Delete the file" choice, and open at the end so the row may
 * add the file's name for a screen reader.
 */
const DELETE = new RegExp(`^${asLiteral(DELETE_FILE_LABEL)}\\b`, 'iu');

/**
 * Whether the status on a row is drawn as a MARK paired with its words: the
 * smallest thing around the status text that still says only the status, carrying a
 * drawn shape beside it.
 *
 * Asked in a way that does not dictate where the shape sits — it walks outward from
 * the word while the text is still just the status, so the shape may live in the
 * same span, a wrapper, or the cell. It deliberately cannot see a shape drawn only
 * by CSS (a border, a pseudo-element), which is why contract item 6 requires the
 * shape to exist in the DOM.
 *
 * Whether the mark's INK is right, and whether it reads in both themes, is a
 * judgement jsdom cannot make: that is on the manual checklist and in the
 * real-browser pass. What is pinned here is the pairing — words, never colour alone.
 */
const markPairedWithWords = (
  row: HTMLElement,
  status: string,
): HTMLElement | null => {
  let scope: HTMLElement | null = within(row).getByText(status);
  while (scope !== null && textOf(scope) === status) {
    if (scope.querySelector('svg') !== null) {
      return scope;
    }
    scope = scope.parentElement;
  }
  return null;
};

/** The register names itself in every state — the anchor a reader carries on from. */
const registerNamesItself = (): HTMLElement =>
  screen.getByRole('heading', { name: /submitted files/iu });

describe('Epic files-view-redesign, Story 1: the files register as a ruled batch listing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listScript = null;
    mockGet.mockImplementation(async (endpoint: string) => {
      const path = String(endpoint);
      if (!path.includes(FILE_LOGS_PATH)) {
        throw new Error(
          `Unexpected read of "${path}". This story RE-DRAWS the register and adds ` +
            'no call: the only thing fetched while it is being looked at is the ' +
            'submitted-files list (see the implementation contract above).',
        );
      }
      if (listScript === null) {
        throw new Error(
          'The register read the file-logs list but the test served no answer — ' +
            'call serveFiles(...) or holdTheRead() before rendering.',
        );
      }
      if ('failure' in listScript) {
        throw listScript.failure;
      }
      if ('pending' in listScript) {
        return listScript.pending;
      }
      return listScript.body;
    });
  });

  // AC-3
  it('still offers Open on every row and Delete only to an Importer — an Approver’s rows carry none at all — and still reads each status as a mark paired with its own words', async () => {
    const files: FileLog[] = fileLogsInEveryStatus();

    // Fixture preconditions, so the loop below really exercises what it claims:
    // every recognised status is present, and each file is identifiable BY ITSELF —
    // its own name and its own record count — rather than by position.
    expect(files.every((file) => isKnownFileStatus(file.CurrentStatus))).toBe(
      true,
    );
    expect(new Set(files.map((file) => file.CurrentStatus)).size).toBe(
      files.length,
    );
    expect(new Set(files.map((file) => file.CurrentFileName)).size).toBe(
      files.length,
    );
    expect(new Set(files.map((file) => file.RecordCount)).size).toBe(
      files.length,
    );

    // --- the Importer: Open and Delete on every row -------------------------
    const importer = viewedBy(IMPORTER);
    // Precondition: the server named this person as the one who may delete.
    expect(importer.actingUploader).toBe(
      `${IMPORTER.FirstName} ${IMPORTER.LastName}`,
    );

    serveFiles(files);
    const importerView = renderRegister(importer);
    await screen.findByRole('table');

    // One row per submitted file — an empty or truncated register cannot pass.
    // (The fixture's Cancelled file is `IsActive: false`; it is served here
    // knowingly, because the register shows whatever the service answered.)
    expect(fileRows()).toHaveLength(files.length);

    files.forEach((file) => {
      const row = rowCarrying(file.CurrentFileName);
      // Both of a file's own identifiers resolve to the SAME row (contract item 3).
      expect(rowCarrying(file.RecordCount)).toBe(row);

      // Open: still a real link, to that file's own address, named for the file it
      // opens so one row's Open is told from another's by more than position.
      const open = within(row).getByRole('link', { name: OPEN });
      expect(open).toHaveAttribute('href', submittedFileAddress(file));
      expect(open).toHaveAccessibleName(
        new RegExp(asLiteral(file.CurrentFileName), 'iu'),
      );

      // Delete: in the row, worded as the file's own page words it, naming its file.
      const deletes = controlsNamed(row, DELETE);
      expect(deletes.map(described)).toHaveLength(1);
      expect(deletes[0]).toHaveAccessibleName(
        new RegExp(asLiteral(file.CurrentFileName), 'iu'),
      );

      // The status: the service's own words, with a drawn mark beside them.
      expect(within(row).getByText(file.CurrentStatus)).toBeInTheDocument();
      expect(markPairedWithWords(row, file.CurrentStatus)).not.toBeNull();
    });

    importerView.unmount();

    // --- the Approver: the same register, and no delete anywhere on it ------
    const approver = viewedBy(APPROVER);
    // Precondition: production code — not this test — decides this person may not
    // delete, and says so by naming nobody.
    expect(approver.actingUploader).toBeUndefined();
    expect(approver.viewerRoles).toContain(ROLE_APPROVER);

    serveFiles(files);
    renderRegister(approver);
    await screen.findByRole('table');

    expect(fileRows()).toHaveLength(files.length);

    files.forEach((file) => {
      const row = rowCarrying(file.CurrentFileName);

      // Everything they came for is still there…
      expect(within(row).getByRole('link', { name: OPEN })).toHaveAttribute(
        'href',
        submittedFileAddress(file),
      );
      expect(within(row).getByText(file.CurrentStatus)).toBeInTheDocument();
      expect(markPairedWithWords(row, file.CurrentStatus)).not.toBeNull();

      // …and the delete is not in the row at all.
      expect(controlsNamed(row, DELETE).map(described)).toEqual([]);
    });

    // Not in a row, not in a toolbar, not greyed out somewhere out of the way, and
    // not behind a menu — absent from the markup, which is what the queries above
    // and this one check (they find disabled controls and menu items too).
    expect(controlsNamed(document.body, DELETE).map(described)).toEqual([]);
  });

  // AC-4
  it('still reads clearly in each of the three answers that are not rows: an announced wait, nothing submitted yet, and a failed read whose Try again asks for the list again', async () => {
    const user: User = userEvent.setup();
    const imported = fileLogWithStatus(FILE_STATUS_IMPORTED, {
      Id: 5001,
      CurrentFileName: 'expenses_2026-04-15.csv',
    });
    const watching = viewedBy(IMPORTER);

    // --- waiting: announced, not merely drawn -------------------------------
    const held = holdTheRead();
    const waitingView = renderRegister(watching);

    const announcedWait = await screen.findByRole('status');
    expect(announcedWait).toHaveTextContent(/loading/iu);
    // The reader still knows WHAT is being waited for…
    expect(registerNamesItself()).toBeVisible();
    // …and the wait is the whole answer: no rows, and nothing standing in for one.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.queryByText(imported.CurrentFileName),
    ).not.toBeInTheDocument();
    // A wait is not a failure.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    held.answer(fileLogListResponse([imported]));

    expect(
      await screen.findByText(imported.CurrentFileName),
    ).toBeInTheDocument();
    // Once the rows are there the announcement has gone, so nothing keeps telling a
    // reader the register is loading. Asked as "nothing still says it" rather than
    // "there is no live region", so a register that legitimately keeps one for
    // something else is not failed for it.
    await waitFor(() => {
      expect(screen.queryByText(/loading/iu)).not.toBeInTheDocument();
    });

    waitingView.unmount();

    // --- nothing submitted yet: an answer, not a failure --------------------
    serveFiles([]);
    const emptyView = renderRegister(watching);

    expect(
      await screen.findByText(/no files have been submitted yet/iu),
    ).toBeInTheDocument();
    expect(registerNamesItself()).toBeVisible();
    // Not reported as a failure, and no empty register drawn around the sentence.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    emptyView.unmount();

    // --- a failed read, then Try again --------------------------------------
    listScript = { failure: REFUSED_LIST_READ };
    renderRegister(watching);

    const failure = await screen.findByRole('alert');
    // The SERVICE's own reason reaches the reader…
    expect(failure).toHaveTextContent(LIST_READ_REFUSED_MESSAGE);
    // …and the shared client's internal placeholder never does (NFR-base-5).
    expect(
      screen.queryByText(CLIENT_FALLBACK_MESSAGES.serverError),
    ).not.toBeInTheDocument();
    // The reader is told what failed, and it is not a blank screen.
    expect(registerNamesItself()).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    // Try again really asks the service for the list again: the rows it answers
    // with are what proves the read happened, not a call count.
    serveFiles([imported]);
    await user.click(screen.getByRole('button', { name: /try again/iu }));

    expect(
      await screen.findByText(imported.CurrentFileName),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(rowCarrying(imported.CurrentFileName)).toBeVisible();
  });
});
