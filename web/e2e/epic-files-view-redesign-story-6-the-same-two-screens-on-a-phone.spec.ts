/**
 * Story Metadata:
 * - Epic: files-view-redesign — Redesign the expense files view as a batch register
 * - Story: 6 — The same two screens on a phone
 * - Route: /upload (and /upload/file, the file's own page this story also carries)
 * - Target File: web/src/components/files/SubmittedFilesList.tsx
 * - Page Action: modify_existing
 * - Requirements: R3 (UI-23, the 360px floor), R4 (keyboard completability to the
 *   project's WCAG 2.2 AA bar), R21 (the direction contract untouched), R24 (the screens
 *   this epic does not restyle keep working), R1/BR1 (no behaviour lost), BR9 (no card,
 *   no pill)
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - ALL FIVE of this story's acceptance criteria are `playwright`-tagged, so this file is
 *   the story's entire automated coverage. There is no Vitest layer for it, and that is
 *   deliberate: every criterion is about what a real browser does at a real width —
 *   whether the page (or anything inside it) scrolls sideways, whether a mark is painted
 *   large enough to read, whether an action offered on a wide screen is still reachable
 *   on a narrow one by finger and by keystroke, and whether two screens this epic does
 *   NOT restyle still work. jsdom has no layout, no viewport and no gestures, so it can
 *   answer none of them.
 * - AC-1 → "the register at 360px". AC-2 → "the file's own three listings at 360px".
 *   AC-3 → "nothing is reachable only on a wide screen, by tap and by keyboard".
 *   AC-4 → "the marks, verdicts and masked numbers stay legible, and each listing is
 *   still one list of rows". AC-5 → "nothing outside these two screens moved".
 * - ONE FURTHER TEST CARRYING NO AC: the real-browser axe scan. This story's §Reuse
 *   notes place THE EPIC'S ACCESSIBILITY BASELINE here — `epicIntroducesSharedSurface`
 *   is false for this epic (the shell, fonts, tokens and direction contract all already
 *   exist), so no baseline file was placed automatically, and story 6 is the only story
 *   that visits BOTH redesigned screens. It is therefore the epic's SOLE automated
 *   accessibility coverage: both routes, at the narrow width AND at desktop width,
 *   because the redesign changes the row structure at both.
 * - NOT asserted here, because they belong to the stories that own them: the register's
 *   ruled composition and its own control totals at desktop width (story 1), the
 *   submission slip (story 2), the file's own header and its processing history's
 *   grammar (story 3), the import preview's reordering — will-import rows first, the
 *   reject listing appended at the back (story 4) — and the rejected rows' listing
 *   grammar (story 5). This story asserts that what those stories built still READS AND
 *   WORKS at 360px, and that the two screens outside this epic did not move.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * ---------------------------------------------------------------------------
 * This spec never contacts a live backend and never uses a real credential
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running on this machine. Two boundaries, one
 * contract — the arrangement every earlier epic on these two screens established, reused
 * rather than re-invented:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. Both screens are gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()` cannot
 *    see a fetch the browser never makes. The stub answers that call from the shared
 *    identity source, keyed off the `session` cookie value seeded below — which is also
 *    what decides WHICH role is here, and therefore which controls the server puts into
 *    the markup at all (hidden-never-disabled, R6/BR7).
 * 2. Browser boundary → `page.route()` below, for every read these two screens make:
 *    - `GET /transactions-api/v1/file-logs?IsActive=Yes` — the register's own read, and
 *      how `/upload/file` resolves the `LogId` in its address (there is no get-one-file
 *      endpoint);
 *    - `GET /transactions-api/v1/file-process-logs/{LogId}` — the processing history;
 *    - `GET /transactions-api/v1/files/download?FileLogId={id}` — the submitted file's
 *      own bytes, which is where the import preview's rows come from;
 *    - `GET /transactions-api/v1/files/validation-errors?FileLogId={id}` — the overlay
 *      that decides each preview row's verdict, and the rejected-rows section's source;
 *    - `GET /transactions-api/v1/file-settings` — the submission slip's named settings;
 *    - `GET /transactions-api/v1/transactions` — what the delete confirmation reads to
 *      say how much deleting an imported file would destroy.
 *    A catch-all aborts anything else under `/transactions-api/**`: those are the app's
 *    OWN same-origin addresses, so an unmocked call would be forwarded to the live
 *    transactions service by a route handler INSIDE the Next.js process, where the
 *    live-origin block cannot see it. The real services' own origins (:4424 / :4423) are
 *    blocked outright, registered LAST so they win over the origin-agnostic globs above.
 *
 * Every response body comes from the project-wide factories under `web/src/mocks/data/`
 * (`file-log.ts`, `file-process-log.ts`, `file-setting.ts`, `submitted-file.ts`,
 * `transaction.ts`, `identity.ts`, `role.ts`) — no response shape and no canonical value
 * is authored in this file, so this spec and the sibling stories' Vitest layers cannot
 * drift on the contract.
 *
 * ---------------------------------------------------------------------------
 * Implementation patterns this spec assumes — READ BEFORE IMPLEMENTING
 * ---------------------------------------------------------------------------
 * - THE VIEWPORT IS SET EXPLICITLY, and each screen is loaded AT that width rather than
 *   resized after a desktop render — the way a phone user receives it. 360px is the
 *   project's mobile floor (NFR-base-3) and the width R3/UI-23 names, and it is where
 *   sideways scrolling shows up first.
 * - THE CROSSOVER IS THE APP'S OWN. The narrow/wide switch is read out of
 *   `lib/layout/viewport.ts` (`NARROW_VIEWPORT_QUERY`) rather than restated here, so this
 *   spec cannot disagree with the app about where "narrow" ends — and so this story
 *   cannot be implemented against a SECOND breakpoint (story §Reuse notes: do not derive
 *   one). The two widths below are then checked to sit on opposite sides of it.
 * - EVERY READ HAPPENS IN THE BROWSER, through the shared API client at the app's own
 *   same-origin `/transactions-api/...` addresses, as these screens already do.
 *   `page.route()` cannot intercept a read issued by the Next.js server or by a Server
 *   Action — moving one there bypasses these mocks and leaves for the live service.
 * - EACH LISTING IS STILL ONE LIST OF ROWS AT 360px, and that is asserted directly (AC-4)
 *   rather than assumed: ONE grouping holding every record, and each record announced as
 *   exactly ONE row inside it. Both ARIA groupings are accepted — a `list` of `listitem`s
 *   and a `table` of `row`s are both "one list of rows" for a reader, and which one the
 *   ruled narrow presentation uses is the developer's call. `.or()` below is Playwright's
 *   own locator combinator, not a query fallback: only one of the two shapes exists in
 *   any given build.
 * - THE IMPORT PREVIEW MAY BE ONE GROUPING OR TWO. R14/R15 append the reject listing at
 *   the back of the will-import listing, which is honestly expressible either as one
 *   table with a headed break or as two. AC-4's assertion is written to pass for either:
 *   the will-import records must sit in one grouping and the rejected records in one
 *   grouping — the same one, or its own.
 * - NO SIDEWAYS SCROLL, AND NONE SMUGGLED INSIDE THE PAGE EITHER.
 *   `components/ui/table.tsx` wraps every table in `overflow-x-auto` with
 *   `whitespace-nowrap` cells, and that wrapper is exactly what makes today's seven- and
 *   eight-column tables scroll sideways INSIDE their container at this width. A contained
 *   sideways scroll does not satisfy R3 — so both the page's own scroll width AND every
 *   horizontally scrollable box inside `main` are checked, on both screens. This story has
 *   to answer that inherited wrapper rather than keep it.
 * - EACH RECORD IS ONE GROUP OF RULED LINES, NOT A CARD. Asserted by measurement, not by
 *   class name: consecutive records TOUCH (separated by a hairline rule, which is a border
 *   and costs no gap), which is what tells a ruled listing apart from the card stack BR9
 *   forbids.
 * - PER-RECORD ACTIONS MAY SIT ON THE GROUP OR BEHIND AN OVERFLOW. R3/UI-23 names "an
 *   action overflow", while these screens carry their actions directly today. So every
 *   sweep and the tap journey below first OPEN a record's overflow if the narrow
 *   presentation gives it one, and then assert unconditionally that the action is
 *   reachable — written to the OUTCOME, so they pass whichever shape this story lands on.
 *   THE KEYBOARD JOURNEY walks a DIRECT control with Tab, because a menu's keyboard
 *   grammar is a different walk (Enter to open, then arrow keys): if this story moves the
 *   reveal behind an overflow, re-point that half at it — a legitimate BR1 markup
 *   re-point, and the assertion it makes (every action completable by keyboard alone at
 *   360px) stays exactly as strong.
 * - STATUS AND VERDICT ARE COLOUR PAIRED WITH WORDS (R2 — and `StatusBadge` was already
 *   converted project-wide by `request-list-redesign`). The marks below are therefore
 *   located BY THEIR WORDING — the status as the service sent it, matched
 *   case-insensitively so a CSS `text-transform` is free to shout it, and anchored so it
 *   names an element whose whole text is the status.
 * - ACCOUNT NUMBERS STAY MASKED TO THEIR LAST FOUR DIGITS (R5, POPIA) with the existing
 *   per-row reveal on a rejected row. AC-4 says the masked number must stay LEGIBLE at
 *   this width, so it is asserted on the rows that carry that reveal — the rows a reader
 *   has to go and correct.
 * - Both screens live inside epic 1's signed-in shell, so their content is within `main`,
 *   and each listing is addressed through its own named section (`region`) rather than
 *   through the page: the import preview and the rejected-rows section show the SAME
 *   rejected references for the same file, and an unscoped query could not tell them
 *   apart. The four sections are named by their own existing `h2` headings (R1 keeps
 *   them). Next also renders a permanently empty body-level `role="alert"` route
 *   announcer outside `main`.
 * - AC-5 IS THE REGRESSION PASS, and it does NOT assert pixels (the criterion says "still
 *   look and work as they did", and R24 puts restyling them out of scope): the landing
 *   screen and sign-in must still ARRIVE and still WORK, and the root layout's direction
 *   contract (seed key `29469d17`, R21) must still be in the markup the app serves. Its
 *   presence is read from the RESPONSE BYTES ahead of the app's own content, the way
 *   `request-list-redesign` story 1 pinned it — not counted across the whole document,
 *   because Next legitimately repeats the layout's own props inside the RSC payload it
 *   inlines.
 *
 * NO CLOCK IS INSTALLED and nothing here waits real time: every assertion below is
 * auto-waiting, and the register's 15s self-refresh only re-serves whatever the mocks
 * hold — which never moves, so no status transition and therefore no notification is
 * ever announced over these screens. Axe is likewise never run under a faked clock.
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend response
 * below is mocked, so no live backend is contacted and no real credentials are needed.
 * These tests WILL FAIL until the story is implemented (TDD red): at 360px both screens
 * still render seven- and eight-column tables inside `overflow-x-auto` wrappers with
 * `whitespace-nowrap` cells, so they scroll sideways inside their containers.
 * ---------------------------------------------------------------------------
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
// The crossover the APP owns — read from it so this spec cannot introduce a second one.
import { NARROW_VIEWPORT_QUERY } from '../src/lib/layout/viewport';
import {
  fileLogListResponse,
  fileLogsInEveryStatus,
} from '../src/mocks/data/file-log';
import {
  fileProcessHistory,
  fileProcessLogListResponse,
} from '../src/mocks/data/file-process-log';
import { fileSettingListResponse } from '../src/mocks/data/file-setting';
import { UNRECOGNISED_ROLE, userInfoFor } from '../src/mocks/data/identity';
import { ROLE_APPROVER, ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
  previewWithRejectedRows,
} from '../src/mocks/data/submitted-file';
import { transactionListResponse } from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page, Route } from '@playwright/test';
import type { FileLog } from '../src/mocks/data/file-log';
import type { SubmittedFileRow } from '../src/mocks/data/submitted-file';

/* -------------------------------------------------------------------------- */
/* Addresses and widths                                                        */
/* -------------------------------------------------------------------------- */

/** The register's screen (story metadata Route). */
const UPLOAD_PATH = '/upload';

/** A file's own page — the other screen this story carries. */
const FILE_PATH = '/upload/file';

/** The two screens this epic does NOT restyle, and must not have moved (AC-5, R24). */
const LANDING_PATH = '/';
const SIGN_IN_PATH = '/sign-in';

/**
 * The narrow/wide crossover, taken out of the app's own media query rather than restated.
 * If `lib/layout/viewport.ts` ever stops stating a pixel width, this throws instead of
 * quietly checking the wrong thing.
 */
const narrowCrossover = (): number => {
  const stated = /(\d+)px/.exec(NARROW_VIEWPORT_QUERY);
  if (stated === null) {
    throw new Error(
      `lib/layout/viewport.ts no longer states a pixel width (${NARROW_VIEWPORT_QUERY}), ` +
        'so this spec could not check that its two widths really sit on opposite sides of ' +
        "the app's own crossover.",
    );
  }
  return Number(stated[1]);
};

const NARROW_MAX_WIDTH = narrowCrossover();

/**
 * A phone at the project's mobile floor — the width R3/UI-23 names and NFR-base-3 sets
 * (≥360px). Deliberately the narrowest supported width: sideways scrolling, a clipped
 * status mark and an action that will not fit all show up here first.
 */
const PHONE_VIEWPORT = { width: 360, height: 800 };

/** A desktop width, for the parity sweep and the wide half of the accessibility scan. */
const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

if (
  PHONE_VIEWPORT.width > NARROW_MAX_WIDTH ||
  DESKTOP_VIEWPORT.width <= NARROW_MAX_WIDTH
) {
  throw new Error(
    `This spec's two widths (${String(PHONE_VIEWPORT.width)}px and ` +
      `${String(DESKTOP_VIEWPORT.width)}px) no longer straddle the app's own crossover at ` +
      `${String(NARROW_MAX_WIDTH)}px, so "the narrow presentation" and "the wide ` +
      'presentation" would not be the two things being compared.',
  );
}

/* -------------------------------------------------------------------------- */
/* Mock boundaries                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The reads these screens make, as the BROWSER addresses them: the app's own same-origin
 * mount point, never a service origin. Trailing `**` covers query strings.
 */
const TRANSACTIONS_API_GLOB = '**/transactions-api/**';
const FILE_LOGS_URL_GLOB = '**/transactions-api/v1/file-logs**';
const FILE_PROCESS_LOGS_URL_GLOB =
  '**/transactions-api/v1/file-process-logs/**';
const FILE_SETTINGS_URL_GLOB = '**/transactions-api/v1/file-settings**';
const TRANSACTIONS_URL_GLOB = '**/transactions-api/v1/transactions**';

/** Matched by PATH, so the download cannot swallow the validation-errors read. */
const FILE_DOWNLOAD_PATH = '/v1/files/download';
const VALIDATION_ERRORS_PATH = '/v1/files/validation-errors';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration). Blocked
 * outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * WCAG 2.2 AA — this project's effective accessibility bar (project.md §Baseline NFRs,
 * superseding the template's 2.1 AA floor), and the identical tag set every earlier epic's
 * scan used. Scoped explicitly because axe's defaults also run best-practice rules, which
 * would fail this spec on issues outside the agreed bar.
 */
const WCAG_22_AA_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa',
];

/* -------------------------------------------------------------------------- */
/* What is served                                                              */
/* -------------------------------------------------------------------------- */

/**
 * THE canonical preview fixture: a five-line file whose lines 3 and 5 the service
 * rejected. One call gives the `FileLog` (status `Validation failed`, so the file's own
 * page renders ALL THREE of its listings at once — processing history, import preview AND
 * the rejected-rows section), the file's own CSV bytes, and the validation-errors body
 * describing those same two lines. So this spec cannot pair a file with an overlay that
 * describes a different one.
 */
const PREVIEW = previewWithRejectedRows();

/** That file's own page, reached the way a register row addresses it. */
const PREVIEW_FILE_PATH = `${FILE_PATH}?LogId=${String(PREVIEW.file.Id)}`;

/**
 * The register's rows: the previewed file, plus one file per ACTIVE recognised status,
 * each with its own name and record count so a row is always identified by its own
 * content and never by its position.
 *
 * The inactive (`Cancelled`) member of `fileLogsInEveryStatus()` is filtered out on its
 * own `IsActive` flag: a live `GET /v1/file-logs?IsActive=Yes` would not return it, and a
 * fixture that served it would put a row on screen the real screen never shows.
 */
const LISTED_FILES: FileLog[] = [
  PREVIEW.file,
  ...fileLogsInEveryStatus().filter((file) => file.IsActive),
];

/**
 * One recorded activity, reduced to the three things a history row has to state at this
 * width: which activity it was, what came of it, and when it started.
 */
interface RecordedActivity {
  readonly name: string;
  readonly outcome: string;
  readonly startedAt: string;
}

/**
 * The previewed file's recorded activities, in the shape the wire carries them: received,
 * then failed validation — two activities with distinct names, outcomes and start times,
 * coherent with the file's own `Validation failed` status.
 */
const SERVED_HISTORY = fileProcessHistory({
  FileName: PREVIEW.file.CurrentFileName,
});

/**
 * The same activities, reduced to what a history row has to state at this width. Each is
 * required to carry an outcome, because a still running activity (no outcome, no end time)
 * is story 3's case, on its own fixture — and this criterion could not read an outcome that
 * the service never sent.
 */
const HISTORY: RecordedActivity[] = SERVED_HISTORY.map((activity) => {
  if (
    activity.DecisionResult === undefined ||
    activity.DecisionResult === '' ||
    activity.EndDate === undefined
  ) {
    throw new Error(
      `fileProcessHistory() now serves ${activity.ActivityName} as still running, so ` +
        '"the activity states the outcome recorded for it" could not be read here. That ' +
        'absent-not-invented case belongs to story 3, on runningFileProcessLog().',
    );
  }
  return {
    name: activity.ActivityName,
    outcome: activity.DecisionResult,
    startedAt: activity.StartDate,
  };
});

/** The file's lines that will import, and the lines the service rejected (R14's halves). */
const WILL_IMPORT_ROWS: SubmittedFileRow[] = PREVIEW.willImportRows;
const REJECTED_ROWS: SubmittedFileRow[] = PREVIEW.rejectedRows;

/* -------------------------------------------------------------------------- */
/* Fixture integrity — these criteria are only tested if these hold            */
/* -------------------------------------------------------------------------- */

/** Every value a record is FOUND BY has to be unique, or "exactly one row" proves nothing. */
const expectDistinct = (values: string[], what: string): void => {
  if (new Set(values).size !== values.length) {
    throw new Error(
      `Two ${what} share a value (${values.join(', ')}), so a record could not be told ` +
        'apart from another by its own content — and this spec would be selecting rows by ' +
        'position instead.',
    );
  }
  for (const value of values) {
    const contained = values.filter(
      (other) => other !== value && other.includes(value),
    );
    if (contained.length > 0) {
      throw new Error(
        `"${value}" is contained inside ${contained.join(', ')}, so a text query for it ` +
          'would match more than the record it names.',
      );
    }
  }
};

expectDistinct(
  LISTED_FILES.map((file) => file.CurrentFileName),
  'served file names',
);
expectDistinct(
  PREVIEW.rows.map((row) => row.Reference),
  "served file lines' references",
);
expectDistinct(
  HISTORY.map((activity) => activity.name),
  'served activity names',
);

if (REJECTED_ROWS.length === 0 || WILL_IMPORT_ROWS.length === 0) {
  throw new Error(
    'previewWithRejectedRows() no longer holds BOTH a line that will import and a line ' +
      'the service rejected, so neither the two verdicts nor the appended reject listing ' +
      'could be read at this width.',
  );
}

/**
 * The last four digits of an account number — the only part any listing may print (R5,
 * POPIA). Derived here rather than imported from the app, so the masking the screen
 * performs is checked against an independent expression of the same rule.
 */
const lastFourOf = (accountNumber: string): string =>
  accountNumber.replace(/\D/g, '').slice(-4);

expectDistinct(
  REJECTED_ROWS.map((row) => lastFourOf(row.AccountNumber)),
  "rejected lines' last four account digits",
);

for (const row of REJECTED_ROWS) {
  const lastFour = lastFourOf(row.AccountNumber);
  const elsewhereInTheRow = [
    row.Reference,
    row.TransactionDate,
    row.Description,
    row.Amount,
    row.TransactionType,
    row.Currency,
  ].filter((value) => value.includes(lastFour));
  if (lastFour === '' || elsewhereInTheRow.length > 0) {
    throw new Error(
      `Line ${row.Reference}'s last four account digits ("${lastFour}") are empty, or ` +
        `they also appear in its own ${elsewhereInTheRow.join(', ')} — so "the masked ` +
        'number is legible" could be satisfied by another value in the same row.',
    );
  }
}

for (const file of LISTED_FILES) {
  const sameAsAnotherValue = [
    file.CurrentFileName,
    file.SettingName,
    file.ProcessDate,
    file.CurrentStatus,
    file.LastExecutedActivityName,
  ].filter((value) => value === file.RecordCount);
  if (sameAsAnotherValue.length > 0) {
    throw new Error(
      `${file.CurrentFileName}'s record count ("${file.RecordCount}") is also one of its ` +
        'other values word for word, so "the row states its own control total" could be ' +
        'satisfied by the wrong value.',
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Wording these screens already use (R1 keeps it; R19 keeps the actions')      */
/* -------------------------------------------------------------------------- */

/**
 * The four listings' own sections, named by the `h2` each already carries. Every query
 * about a listing is scoped through one of these, because the import preview and the
 * rejected-rows section show the SAME rejected references for the same file.
 */
const SECTION = {
  register: 'Submitted files',
  history: 'Processing history',
  preview: 'Import preview',
  rejectedRows: 'Rejected rows',
} as const;

/** The two verdicts the import preview states against every line (R14, unchanged). */
const WILL_IMPORT_VERDICT = /^will import$/i;
const REJECTED_VERDICT = /^rejected$/i;

/** How the two gesture journeys name the actions they take. */
const REVEAL_ACTION = /reveal/i;
const DELETE_ACTION = /delete/i;

/** The chooser's own heading on the landing screen (AC-5's regression target). */
const CHOOSER_HEADING = /^what you can do$/i;

/** The design's own reference key, and the line the direction contract closes with (R21). */
const DIRECTION_SEED_KEY = '29469d17';
const DIRECTION_FINISH_LINE =
  'FINISH: unreviewed and undocumented is unfinished; this build ends with the ' +
  'finish review, the verdict, DESIGN.md, and every shipping raster carrying its ' +
  'provenance';

/** Comments the framework writes into the served body (Suspense boundary markers). */
const FRAMEWORK_COMMENT = /^\s*\/?[$!]/;

/* -------------------------------------------------------------------------- */
/* Measurement thresholds                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How much space may sit between two consecutive rows. A hairline rule is a border, so it
 * costs no gap at all; two or three pixels of sub-pixel rounding is the most a ruled
 * listing can honestly produce. The gutter a card stack leaves between its cards fails it.
 */
const RULE_TOLERANCE_PX = 3;

/** The smallest a mark can be painted and still be readable at arm's length. */
const MIN_LEGIBLE_PX = 10;

/* -------------------------------------------------------------------------- */
/* Selectors that describe a KIND of thing, not a named one                     */
/* -------------------------------------------------------------------------- */

/**
 * Candidate controls for the parity sweep. Disabled controls are left out: a disabled
 * control offers the reader nothing at either width, so counting one on the wide screen
 * would demand a disabled twin on the narrow one. Text and file inputs are left out too —
 * they are fields to fill, not actions to take, and the submission slip's own narrow
 * behaviour belongs to story 2.
 */
const CONTROL_SELECTOR = [
  'button:not([disabled]):not([aria-disabled="true"])',
  'a[href]:not([aria-disabled="true"])',
  '[role="button"]:not([disabled]):not([aria-disabled="true"])',
  '[role="menuitem"]:not([aria-disabled="true"])',
].join(', ');

/**
 * A record's action overflow, if the narrow presentation gives it one: a control that says
 * of itself that it opens a menu (R3/UI-23 names an action overflow). Used only to REVEAL
 * the actions before anything is asserted about them.
 */
const OVERFLOW_TRIGGER = [
  '[aria-haspopup="menu"]:not([disabled])',
  '[aria-haspopup="true"]:not([disabled])',
].join(', ');

/**
 * The verbs each screen must offer the Importer at desktop width — the guard that keeps
 * the parity sweep honest. NOTHING is compared against these: the parity list itself is
 * swept out of the wide DOM, so an action added later is covered too. They only prove the
 * sweep found the actions these screens have always carried, so a sweep that quietly
 * found nothing cannot pass.
 */
const ACTIONS_THE_WIDE_REGISTER_OFFERS = ['delete', 'open'];
const ACTIONS_THE_WIDE_FILE_PAGE_OFFERS = [
  'delete',
  'download',
  'retry',
  'reveal',
];

/* -------------------------------------------------------------------------- */
/* Mocks                                                                       */
/* -------------------------------------------------------------------------- */

/** A mocked JSON response, built from a project-wide factory body. */
const jsonResponse = (
  body: unknown,
  status = 200,
): { status: number; contentType: string; body: string } => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/** The `FileLogId` a request asked about, or `null` if it sent none. */
const fileAskedAboutBy = (route: Route): string | null =>
  new URL(route.request().url()).searchParams.get('FileLogId');

/**
 * Blocks the live services outright. Registered LAST, because Playwright matches the most
 * recently registered route first: a call sent to a service's own origin is then aborted
 * and fails visibly instead of being quietly answered by the globs above it.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Answers a BROWSER-side identity read from the shared userinfo source, so it can never
 * disagree with what the Node-side stub returns for the same session — one person
 * server-side and another in the browser would mean two different sets of controls.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.unroute('**/v1/auth/userinfo');
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(userInfoFor(roleName))),
  );
};

/**
 * Every read the two screens make, answered from the shared factories.
 *
 * The `/transactions-api/**` catch-all is registered FIRST so it LOSES to each specific
 * read below it: anything else under the app's own transactions mount is aborted rather
 * than forwarded to the live service by the app's own proxy route handler.
 *
 * The file reads answer only the file they were asked about, so a preview or a
 * rejected-rows section assembled from the wrong download fails loudly instead of
 * rendering somebody else's rows.
 */
const serveFilesArea = async (page: Page): Promise<void> => {
  await page.route(TRANSACTIONS_API_GLOB, (route) => route.abort());

  await page.route(FILE_LOGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileLogListResponse(LISTED_FILES))),
  );
  await page.route(FILE_PROCESS_LOGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileProcessLogListResponse(SERVED_HISTORY))),
  );
  await page.route(FILE_SETTINGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileSettingListResponse())),
  );
  // What the delete confirmation reads to say how much deleting an imported file would
  // destroy. Served empty: this spec asserts that the confirmation OPENS, never what it
  // counts — `file-deletion` owns that wording.
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse([]))),
  );

  await page.route(
    (url) => url.pathname.endsWith(VALIDATION_ERRORS_PATH),
    (route: Route) =>
      route.fulfill(
        jsonResponse(
          fileAskedAboutBy(route) === String(PREVIEW.file.Id)
            ? PREVIEW.validationErrors
            : { JsonArray: '[]' },
        ),
      ),
  );

  // The submitted file's own bytes, streamed the way the service streams them, so the real
  // binary-response path in `lib/api/client.ts` is the one exercised.
  await page.route(
    (url) => url.pathname.endsWith(FILE_DOWNLOAD_PATH),
    (route: Route) => {
      if (fileAskedAboutBy(route) !== String(PREVIEW.file.Id)) {
        return route.fulfill(
          jsonResponse(
            {
              Messages: [
                'No file was requested by identifier — a preview must download the file ' +
                  'whose page it is on (GET /v1/files/download?FileLogId=<id>).',
              ],
            },
            404,
          ),
        );
      }
      return route.fulfill({
        status: 200,
        contentType: SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
        headers: {
          'content-disposition': `attachment; filename="${PREVIEW.file.CurrentFileName}"`,
        },
        body: PREVIEW.csv,
      });
    },
  );
};

/**
 * Puts the browser in a signed-in state as the named role, without a real credential: the
 * mock `session` cookie the Node-side auth stub maps back to this role when the
 * server-side gate asks who the session belongs to. Re-seeding overwrites it.
 */
const seedSession = async (
  context: BrowserContext,
  roleName: string,
): Promise<void> => {
  await context.addCookies([
    {
      name: 'session',
      value: sessionTokenFor(roleName),
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
};

/** Everything the two screens need, as the named role, with no live backend reachable. */
const signInAs = async (
  page: Page,
  context: BrowserContext,
  roleName: string,
): Promise<void> => {
  await serveFilesArea(page);
  await mockBrowserIdentityCall(page, roleName);
  await blockLiveBackends(page);
  await seedSession(context, roleName);
};

/* -------------------------------------------------------------------------- */
/* Locating what is on screen                                                  */
/* -------------------------------------------------------------------------- */

/** The screen's own content — every query about a listing is scoped inside it. */
const screenOf = (page: Page): Locator => page.getByRole('main');

/**
 * A listing's own section, checked to be the only one of its name before anything is read
 * out of it. `getByRole`'s `name` matches the WHOLE accessible name, so a nested block
 * carrying a sub-heading of its own is not a match — and a build that grew a second
 * SECTION with the same heading fails here, with a reason, rather than quietly making
 * every assertion below ambiguous.
 */
const settledSection = async (page: Page, name: string): Promise<Locator> => {
  const section = screenOf(page).getByRole('region', { name });
  await expect(
    section,
    `exactly one section on this screen must be headed "${name}" — if the redesign gave ` +
      'another block that same heading as a named section, re-point this query at the one ' +
      'it means (a legitimate BR1 markup re-point; the assertions it scopes stay exactly ' +
      'as strong)',
  ).toHaveCount(1);
  await expect(section).toBeVisible();
  return section;
};

/**
 * Every row-ish item in a scope, whichever ARIA grouping the presentation uses. `.or()` is
 * Playwright's own locator combinator, not a query fallback: a `listitem` and a `row` are
 * the same thing to a reader, and only one of the two shapes exists in any given build
 * (see the header).
 */
const rowsIn = (scope: Locator): Locator =>
  scope.getByRole('listitem').or(scope.getByRole('row'));

/** One record's own row, found by its own content — never by position. */
const recordRow = (scope: Locator, identifier: string): Locator =>
  rowsIn(scope).filter({ hasText: identifier });

/**
 * The ONE grouping inside a section that holds every one of these records — which is what
 * "announced as one list of rows" comes to. A per-row list of fields nested inside a
 * record cannot hold two records' identifiers, so it is excluded by construction.
 */
const groupingHolding = (section: Locator, identifiers: string[]): Locator => {
  let grouping = section.getByRole('list').or(section.getByRole('table'));
  for (const identifier of identifiers) {
    grouping = grouping.filter({ hasText: identifier });
  }
  return grouping;
};

/** A value as an element of its own, whatever letter case the design gives it. */
const wholeText = (value: string): RegExp =>
  new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

/** The one element in a record's row whose whole text is that value. */
const valueOn = (row: Locator, value: string): Locator =>
  row.getByText(wholeText(value));

/** A file's own page, addressed the way a register row must address it. */
const fileAddressPattern = (file: FileLog): RegExp =>
  new RegExp(`${FILE_PATH}\\?(.*&)?LogId=${String(file.Id)}(&|$)`);

/** A row's way into the file's own page, found by WHERE IT GOES, not by its wording. */
const openFileLinkIn = (row: Locator): Locator =>
  row.locator(`a[href*="${FILE_PATH}"]`);

/** The confirmation the delete asks through — an `alertdialog`, portalled out of `main`. */
const confirmation = (page: Page): Locator => page.getByRole('alertdialog');

/* -------------------------------------------------------------------------- */
/* Reading the browser's own layout                                            */
/* -------------------------------------------------------------------------- */

/** A locator's painted box, or a failure saying it is not being drawn at all. */
const boxOf = async (
  locator: Locator,
  what: string,
): Promise<{ x: number; y: number; width: number; height: number }> => {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(
      `${what} has no painted box at ${String(PHONE_VIEWPORT.width)}px wide, so a reader ` +
        'cannot see it at all.',
    );
  }
  return box;
};

/**
 * A mark has to be big enough to read AND drawn where it can be read — inside the
 * viewport, not out past its right edge where only a sideways scroll would reach it.
 */
const expectLegible = async (mark: Locator, what: string): Promise<void> => {
  await expect(
    mark,
    `${what} is not on screen at all at this width`,
  ).toBeVisible();
  const box = await boxOf(mark, what);

  expect(
    Math.round(box.height),
    `${what} is only ${String(Math.round(box.height))}px tall at ` +
      `${String(PHONE_VIEWPORT.width)}px — it has to stay readable there, not shrink out ` +
      'of sight (AC-4)',
  ).toBeGreaterThanOrEqual(MIN_LEGIBLE_PX);

  expect(
    [box.x >= 0, box.x + box.width <= PHONE_VIEWPORT.width + 1],
    `${what} is drawn from ${String(Math.round(box.x))}px to ` +
      `${String(Math.round(box.x + box.width))}px inside a ` +
      `${String(PHONE_VIEWPORT.width)}px viewport, so part of it cannot be read without ` +
      'scrolling sideways',
  ).toEqual([true, true]);
};

/**
 * The gaps, in whole pixels, between each consecutive pair of rows — the measurement that
 * tells a ruled listing (rows separated by a hairline rule, so they touch) apart from the
 * card stack BR9 forbids (each record standing apart in its own box). Read from the
 * browser's own layout, never from class names.
 */
const gapsBetween = async (rows: Locator): Promise<number[]> => {
  const edges = await rows.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    }),
  );
  return edges
    .slice(1)
    .map((edge, index) => Math.round(edge.top - edges[index].bottom));
};

/**
 * The rows of a listing run together as one ruled sequence rather than standing apart as
 * cards. Measured, not described.
 */
const expectRuledNotCards = async (
  rows: Locator,
  what: string,
): Promise<void> => {
  const gaps = await gapsBetween(rows);
  expect(
    gaps.length,
    `the gaps between consecutive rows of ${what} were not measured at all, so nothing ` +
      'here proves the listing is not a card stack',
  ).toBeGreaterThan(0);
  expect(
    Math.max(...gaps),
    `consecutive rows of ${what} are ${String(Math.max(...gaps))}px apart, so each is ` +
      'standing in a box of its own — at phone width a record is one group of ruled lines ' +
      'separated by hairline rules, NOT a card (design brief §4 anti-goals, BR9)',
  ).toBeLessThanOrEqual(RULE_TOLERANCE_PX);
};

/**
 * Every horizontally scrollable box inside the screen's content, described for a failure
 * message. A page whose own scroll width fits can still hide a sideways scroll INSIDE it —
 * and `components/ui/table.tsx` wraps every table in exactly such a box
 * (`overflow-x-auto` with `whitespace-nowrap` cells). R3 refuses that too: a table kept
 * inside a sideways-scrolling wrapper does not satisfy it.
 */
const sidewaysScrollingRegions = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const main = document.querySelector('main');
    if (main === null) {
      return ['there is no <main> on the page at all'];
    }
    return Array.from(main.querySelectorAll('*'))
      .filter((element) => {
        const overflowX = window.getComputedStyle(element).overflowX;
        return (
          (overflowX === 'auto' || overflowX === 'scroll') &&
          element.scrollWidth > element.clientWidth + 1
        );
      })
      .map(
        (element) =>
          `<${element.tagName.toLowerCase()}> holding "${(
            element.textContent ?? ''
          )
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 60)}"`,
      );
  });

/**
 * THE HARD FAIL of this story, in both its forms: the page itself must not scroll sideways
 * at 360px, and nothing inside it may scroll sideways in its place.
 */
const expectNothingScrollsSideways = async (
  page: Page,
  state: string,
): Promise<void> => {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
    clientWidth: document.documentElement.clientWidth,
  }));

  // One pixel of tolerance for sub-pixel layout rounding; anything more is real overflow.
  expect(
    scrollWidth,
    `${state}: the page is ${String(scrollWidth)}px wide inside a ` +
      `${String(clientWidth)}px viewport, so it scrolls sideways — which R3 refuses ` +
      'outright',
  ).toBeLessThanOrEqual(clientWidth + 1);

  expect(
    await sidewaysScrollingRegions(page),
    `${state}: something inside the screen scrolls sideways in the page's place — the ` +
      'inherited overflow-x-auto table wrapper is exactly this, and R3 refuses it just as ' +
      'flatly',
  ).toEqual([]);
};

/* -------------------------------------------------------------------------- */
/* Enumerating what a screen offers                                            */
/* -------------------------------------------------------------------------- */

/** A control's accessible name, for a sweep and for readable failure output. */
const nameOf = (control: Locator): Promise<string> =>
  control.evaluate(
    (element) =>
      (element.getAttribute('aria-label') ?? element.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim() || element.tagName.toLowerCase(),
  );

/** Every enabled control inside a scope, by accessible name. */
const controlNamesIn = async (scope: Locator): Promise<string[]> => {
  const names = await scope
    .locator(CONTROL_SELECTOR)
    .evaluateAll((elements) =>
      elements.map((element) =>
        (element.getAttribute('aria-label') ?? element.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
      ),
    );
  return names.filter((name) => name.length > 0);
};

/**
 * Opens a record's action overflow when the presentation gives it one, LEAVING IT OPEN so
 * the action behind it can be taken.
 *
 * A STEP, never an assertion: R3/UI-23 names an action overflow while these screens carry
 * their actions directly today, and every assertion that follows is unconditional — the
 * action must be reachable — so this only makes it reachable whichever shape this story
 * lands on.
 */
const revealActions = async (page: Page, row: Locator): Promise<void> => {
  const overflow = row.locator(OVERFLOW_TRIGGER);
  if ((await overflow.count()) === 0) {
    return;
  }
  await overflow.first().click();
  await expect(page.getByRole('menu')).toBeVisible();
};

/**
 * One of a record's actions, wherever the presentation puts it: directly on the row, or as
 * an item of the overflow the caller has just opened with `revealActions`. `.or()` is
 * Playwright's own combinator — only one of the two shapes exists in a given build.
 */
const actionOn = (page: Page, row: Locator, name: RegExp): Locator =>
  row
    .getByRole('button', { name })
    .or(page.getByRole('menu').getByRole('menuitem', { name }));

/**
 * Every action a scope offers, on the surface AND behind each overflow it holds — the
 * enumeration the parity sweep compares. Iterating over the triggers is enumeration, not
 * identification: no record is ever selected by its position.
 */
const actionsOffered = async (
  page: Page,
  scope: Locator,
): Promise<string[]> => {
  const names = await controlNamesIn(scope);
  const triggers = scope.locator(OVERFLOW_TRIGGER);
  const menu = page.getByRole('menu');
  const triggerCount = await triggers.count();

  for (let index = 0; index < triggerCount; index += 1) {
    await triggers.nth(index).click();
    await expect(menu).toBeVisible();
    names.push(...(await controlNamesIn(menu)));
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  }

  return names;
};

/**
 * The action a control name describes, reduced to its verb: "Delete file named X" and a
 * menu item reading "Delete" are the same offer to the user, so parity is compared on the
 * verb rather than on the whole sentence — which is what lets the narrow presentation
 * reword a row suffix, or move an action behind an overflow, without weakening the
 * comparison.
 */
const verbOf = (name: string): string => {
  const leadingWord = /^[a-z]+/i.exec(name.trim());
  return leadingWord === null
    ? name.trim().toLowerCase()
    : leadingWord[0].toLowerCase();
};

/**
 * How many controls a screen offers for each action — not just WHICH actions. Counting
 * matters because one verb can cover several distinct offers (a file's own page offers
 * three separate downloads, and every listed record offers its own open and delete), and a
 * narrow presentation that dropped one of them would still pass a set-only comparison.
 */
const actionCountsIn = (names: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const name of names) {
    const verb = verbOf(name);
    counts.set(verb, (counts.get(verb) ?? 0) + 1);
  }
  return counts;
};

/** The distinct actions a set of names offers, sorted for a readable diff. */
const actionsIn = (names: string[]): string[] =>
  [...new Set(names.map(verbOf))].sort();

/** What the narrow presentation offers less of than the wide one did — must be nothing. */
const lostAtPhoneWidth = (
  wide: Map<string, number>,
  narrow: Map<string, number>,
): string[] =>
  [...wide.entries()]
    .filter(([verb, wideCount]) => (narrow.get(verb) ?? 0) < wideCount)
    .map(
      ([verb, wideCount]) =>
        `${verb} (${String(wideCount)} on the wide screen, ` +
        `${String(narrow.get(verb) ?? 0)} at phone width)`,
    );

/**
 * Presses `key` until the control has keyboard focus. Throws (failing the test with a
 * plain-English reason) when the control cannot be reached — that throw IS the
 * keyboard-reachability assertion. The same helper every earlier epic here uses.
 */
const pressUntilFocused = async (
  page: Page,
  key: string,
  control: Locator,
  maxPresses = 160,
): Promise<void> => {
  for (let press = 0; press <= maxPresses; press += 1) {
    const focused = await control.evaluate(
      (element) => element === document.activeElement,
    );
    if (focused) {
      return;
    }
    await page.keyboard.press(key);
  }
  throw new Error(
    `"${await nameOf(control)}" could not be reached with ${String(maxPresses)} "${key}" ` +
      'presses, so it cannot be operated by keyboard alone at ' +
      `${String(PHONE_VIEWPORT.width)}px (AC-3, R4, WCAG 2.2 AA).`,
  );
};

/* -------------------------------------------------------------------------- */
/* Reading the bytes the app served                                            */
/* -------------------------------------------------------------------------- */

/** One line, spaces collapsed — wrapping the statement is allowed, rewording it is not. */
const asOneLine = (text: string): string => text.replace(/\s+/gu, ' ').trim();

/**
 * The direction statement the app wrote into `<body>` ahead of its own content — the
 * artifact R21 says this epic must not remove, duplicate or relocate. Read from the
 * RESPONSE BYTES, because R21 is about what SHIPS and what can be audited afterwards.
 *
 * Nothing here counts occurrences across the whole document: Next legitimately repeats the
 * layout's own props inside the RSC payload it inlines, so a document-wide count would be
 * describing the framework rather than the contract.
 */
const directionStatementServedAt = async (
  page: Page,
  path: string,
): Promise<string> => {
  const arrival = await page.goto(path);
  if (arrival === null) {
    throw new Error(`Navigating to ${path} produced no response to read.`);
  }
  const html = await arrival.text();

  const bodyOpens = /<body[^>]*>/i.exec(html);
  if (bodyOpens === null) {
    throw new Error(`The page served at ${path} carries no <body> to read.`);
  }
  const inside = html.slice(bodyOpens.index + bodyOpens[0].length);
  const appContentAt = inside.search(/<main\b/i);
  if (appContentAt === -1) {
    throw new Error(
      `The page served at ${path} carries no <main>, so whether the direction statement ` +
        "stands ahead of the app's own content could not be read.",
    );
  }

  const written = [
    ...inside.slice(0, appContentAt).matchAll(/<!--([\s\S]*?)-->/g),
  ]
    .map(([, body]) => body)
    .filter((body) => !FRAMEWORK_COMMENT.test(body));

  if (written.length === 0) {
    throw new Error(
      `Nothing inside <body> ahead of the app's own content at ${path} is an HTML comment ` +
        "the app wrote, so the app's recorded design direction is no longer in place in " +
        'what ships (AC-5, R21).',
    );
  }
  return asOneLine(written[0]);
};

/** Real-browser axe scan of whatever state the page is in right now. */
const expectNoAccessibilityViolations = async (
  page: Page,
  state: string,
): Promise<void> => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_22_AA_TAGS)
    .analyze();

  expect(
    violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes.length} node/s)`,
    ),
    `WCAG 2.2 AA violations — ${state}`,
  ).toEqual([]);
};

/* -------------------------------------------------------------------------- */
/* Arriving                                                                    */
/* -------------------------------------------------------------------------- */

/** The register, settled: every served file is listed before anything is measured. */
const openRegister = async (page: Page): Promise<Locator> => {
  await page.goto(UPLOAD_PATH);
  const register = await settledSection(page, SECTION.register);
  for (const file of LISTED_FILES) {
    await expect(
      recordRow(register, file.CurrentFileName),
      `${file.CurrentFileName} must be listed in the register, as exactly one row`,
    ).toHaveCount(1);
  }
  return register;
};

/**
 * The previewed file's own page, settled: all three of its listings have arrived, so
 * nothing below is measured against a placeholder.
 */
const openFilePage = async (
  page: Page,
): Promise<{ history: Locator; preview: Locator; rejectedRows: Locator }> => {
  await page.goto(PREVIEW_FILE_PATH);

  const history = await settledSection(page, SECTION.history);
  const preview = await settledSection(page, SECTION.preview);
  const rejectedRows = await settledSection(page, SECTION.rejectedRows);

  for (const activity of HISTORY) {
    await expect(
      recordRow(history, activity.name),
      `${activity.name} must be in the processing history, as exactly one row`,
    ).toHaveCount(1);
  }
  for (const row of PREVIEW.rows) {
    await expect(
      recordRow(preview, row.Reference),
      `line ${row.Reference} must be in the import preview, as exactly one row`,
    ).toHaveCount(1);
  }
  for (const row of REJECTED_ROWS) {
    await expect(
      recordRow(rejectedRows, row.Reference),
      `rejected line ${row.Reference} must be in the rejected-rows section, as exactly ` +
        'one row',
    ).toHaveCount(1);
  }

  return { history, preview, rejectedRows };
};

/* -------------------------------------------------------------------------- */

test.describe('Epic files-view-redesign, Story 6: the same two screens on a phone', () => {
  // Rendered AT phone width from the first paint, the way a phone user receives it — not
  // resized after a desktop render, which can leave a layout a real phone would never
  // have produced. `hasTouch` is what makes the taps below real taps, not mouse clicks.
  test.use({ viewport: PHONE_VIEWPORT, hasTouch: true });

  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the identity it needs.
    await context.clearCookies();
  });

  // AC-1
  // The register at the 360px floor, measured rather than described: every file is one
  // group carrying its own name, its status in words and its own record count with its
  // actions reachable, the groups run together as one ruled sequence instead of standing
  // apart as cards, and neither the page nor anything inside it scrolls sideways.
  //
  // Run as the Importer — the fuller screen, since the submission slip and the per-row
  // delete are the Importer's alone — so the page-level scroll check covers the slip too.
  test('at phone width each file in the register is one ruled group with its name, key values and actions — not a card — and nothing scrolls sideways', async ({
    page,
    context,
  }) => {
    await signInAs(page, context, ROLE_IMPORTER);
    const register = await openRegister(page);

    for (const file of LISTED_FILES) {
      const row = recordRow(register, file.CurrentFileName);

      // Its primary identifier, and the two key values R10/R11 make load-bearing: the
      // status as WORDS (never colour alone, R2) and the row's own control total.
      await expect(
        valueOn(row, file.CurrentStatus),
        `${file.CurrentFileName} must carry its status in words at phone width, on one ` +
          'mark of its own (R2/R10)',
      ).toBeVisible();
      await expect(
        valueOn(row, file.RecordCount),
        `${file.CurrentFileName} must still state its own record count — the row's own ` +
          'control total (R11) — at phone width',
      ).toBeVisible();

      // ...and its actions are reachable from the group itself. The way in stays a real
      // navigational link, pointing at THIS file and no other.
      await expect(
        openFileLinkIn(row),
        `${file.CurrentFileName}'s row must still offer the way into its own page at ` +
          'phone width, as a real link to that file',
      ).toHaveAttribute('href', fileAddressPattern(file));

      const offered = actionsIn(await actionsOffered(page, row));
      expect(
        offered,
        `${file.CurrentFileName}'s row must still offer an Importer the delete at phone ` +
          `width. What it offers: ${offered.join(', ')}`,
      ).toContain('delete');
    }

    // THE ANTI-GOAL CHECK: the groups run together as one ruled sequence. A card stack
    // leaves a visible gutter between each pair; a hairline rule costs nothing at all.
    await expectRuledNotCards(rowsIn(register), 'the files register');

    await expectNothingScrollsSideways(
      page,
      'the files register at phone width',
    );
  });

  // AC-2
  // The other three listings, all on one screen because the previewed file failed
  // validation: its processing history, its import preview (the will-import rows and the
  // reject listing appended at the back) and its own rejected-rows section. Each has to
  // read the way the register does — identifier, key values, actions reachable — and this
  // screen is where the inherited eight-column tables live, so it is where a sideways
  // scroll is most likely to survive.
  test('at phone width each import-preview row, rejected row and processing-history activity reads the same way, and nothing scrolls sideways', async ({
    page,
    context,
  }) => {
    await signInAs(page, context, ROLE_IMPORTER);
    const { history, preview, rejectedRows } = await openFilePage(page);

    /* ---- 1. The processing history: the activity, its outcome, when it started ---- */

    for (const activity of HISTORY) {
      const row = recordRow(history, activity.name);
      await expect(
        valueOn(row, activity.outcome),
        `${activity.name} must still state the outcome recorded for it at phone width`,
      ).toBeVisible();
      await expect(
        row,
        `${activity.name} must still state when it started at phone width`,
      ).toContainText(activity.startedAt);
    }
    await expectRuledNotCards(rowsIn(history), 'the processing history');

    /* ---- 2. The import preview: every line, its verdict, its actions ---- */

    for (const row of WILL_IMPORT_ROWS) {
      await expect(
        recordRow(preview, row.Reference).getByText(WILL_IMPORT_VERDICT),
        `line ${row.Reference} must still carry its "Will import" verdict in words at ` +
          'phone width (R14, unchanged)',
      ).toBeVisible();
    }
    for (const row of REJECTED_ROWS) {
      const previewRow = recordRow(preview, row.Reference);
      await expect(
        previewRow.getByText(REJECTED_VERDICT),
        `line ${row.Reference} must still carry its "Rejected" verdict in words at phone ` +
          'width',
      ).toBeVisible();

      // A rejected line is one the reader has to go and correct, so the way to see its
      // full account number has to be reachable here too — on the group or from it.
      const offered = actionsIn(await actionsOffered(page, previewRow));
      expect(
        offered,
        `line ${row.Reference} is rejected, so the preview must still offer the way to ` +
          `reveal its account number at phone width. What it offers: ${offered.join(', ')}`,
      ).toContain('reveal');
    }
    await expectRuledNotCards(rowsIn(preview), 'the import preview');

    /* ---- 3. The rejected-rows section: the same lines, in their own listing ---- */

    for (const row of REJECTED_ROWS) {
      const rejectedRow = recordRow(rejectedRows, row.Reference);
      await expect(
        rejectedRow,
        `rejected line ${row.Reference} must still state the amount the file recorded for ` +
          'it at phone width',
      ).toContainText(row.Amount);

      const offered = actionsIn(await actionsOffered(page, rejectedRow));
      expect(
        offered,
        `rejected line ${row.Reference} must still offer its own reveal at phone width. ` +
          `What it offers: ${offered.join(', ')}`,
      ).toContain('reveal');
    }
    await expectRuledNotCards(rowsIn(rejectedRows), 'the rejected rows');

    await expectNothingScrollsSideways(
      page,
      "the file's own page at phone width",
    );
  });

  // AC-3
  // The parity clause, and the one that catches the real regression: an action that is
  // only reachable on a wide screen. Both screens are SWEPT at desktop width for what they
  // offer, rather than checked against a hand-written list, so an action added later is
  // covered too; then the same two screens are read at 360px and every one of those
  // actions has to be offered there, in at least as many places. Then the two gestures: a
  // journey by keyboard alone, and the same kind of journey by tapping.
  //
  // Run as the Importer, whose set of controls is the superset — the Approver is offered
  // everything the Importer is except the submit, the retry and the delete (R6/BR7) — so
  // sweeping the Importer covers both roles' actions at once.
  test('at phone width nothing is reachable only on a wide screen, and the actions work by keyboard alone and by tapping', async ({
    page,
    context,
  }) => {
    // Six navigations across two widths and two screens; the default per-test budget is
    // sized for a single journey.
    test.slow();

    await signInAs(page, context, ROLE_IMPORTER);

    /* ---- 1. What each screen offers at DESKTOP width ---- */

    await page.setViewportSize(DESKTOP_VIEWPORT);

    await openRegister(page);
    const wideRegisterActions = await actionsOffered(page, screenOf(page));
    const wideRegisterCounts = actionCountsIn(wideRegisterActions);
    expect(
      actionsIn(wideRegisterActions),
      'the wide register must offer an Importer ' +
        `${ACTIONS_THE_WIDE_REGISTER_OFFERS.join(', ')} — without them this parity check ` +
        'proves nothing',
    ).toEqual(expect.arrayContaining(ACTIONS_THE_WIDE_REGISTER_OFFERS));

    await openFilePage(page);
    const wideFileActions = await actionsOffered(page, screenOf(page));
    const wideFileCounts = actionCountsIn(wideFileActions);
    expect(
      actionsIn(wideFileActions),
      'the wide file page must offer an Importer ' +
        `${ACTIONS_THE_WIDE_FILE_PAGE_OFFERS.join(', ')} — without them this parity check ` +
        'proves nothing',
    ).toEqual(expect.arrayContaining(ACTIONS_THE_WIDE_FILE_PAGE_OFFERS));

    /* ---- 2. The same two screens at PHONE width ---- */

    await page.setViewportSize(PHONE_VIEWPORT);

    await openRegister(page);
    const registerLost = lostAtPhoneWidth(
      wideRegisterCounts,
      actionCountsIn(await actionsOffered(page, screenOf(page))),
    );
    expect(
      registerLost,
      'these actions are offered on the wide register but not — or not as often — at ' +
        `${String(PHONE_VIEWPORT.width)}px: ${registerLost.join('; ')}. Nothing may be ` +
        'reachable only on a wide screen (AC-3)',
    ).toEqual([]);

    const { preview, rejectedRows } = await openFilePage(page);
    const filePageLost = lostAtPhoneWidth(
      wideFileCounts,
      actionCountsIn(await actionsOffered(page, screenOf(page))),
    );
    expect(
      filePageLost,
      'these actions are offered on the wide file page but not — or not as often — at ' +
        `${String(PHONE_VIEWPORT.width)}px: ${filePageLost.join('; ')}. Nothing may be ` +
        'reachable only on a wide screen (AC-3)',
    ).toEqual([]);

    /* ---- 3. BY KEYBOARD ALONE: reveal a rejected line's account number ---- */

    // The keyboard journey goes first, walking forward with Tab from an untouched page, so
    // nothing it reaches depends on where a pointer gesture happened to leave the focus.
    // It walks a DIRECT control — see the header's note if this story moves the reveal
    // behind an overflow.
    const [typedLine] = REJECTED_ROWS;
    const typedRow = recordRow(rejectedRows, typedLine.Reference);
    const typedReveal = typedRow.getByRole('button', { name: REVEAL_ACTION });

    await pressUntilFocused(page, 'Tab', typedReveal);
    await page.keyboard.press('Enter');
    await expect(
      typedRow,
      `${typedLine.Reference}'s account number must be revealable by keyboard alone at ` +
        'phone width — a control that only answers a tap is not completable by keyboard ' +
        '(R4, WCAG 2.2 AA)',
    ).toContainText(typedLine.AccountNumber);

    /* ---- 4. BY TAPPING: a second line, in the other listing, and then the delete ---- */

    const tappedLine = REJECTED_ROWS[REJECTED_ROWS.length - 1];
    const tappedPreviewRow = recordRow(preview, tappedLine.Reference);
    await revealActions(page, tappedPreviewRow);
    await actionOn(page, tappedPreviewRow, REVEAL_ACTION).tap();
    await expect(
      tappedPreviewRow,
      `${tappedLine.Reference}'s account number must be revealable by tapping at phone ` +
        'width too',
    ).toContainText(tappedLine.AccountNumber);

    // ...and the register's own per-row delete, tapped, still asks before it acts.
    const register = await openRegister(page);
    const deletedRow = recordRow(register, PREVIEW.file.CurrentFileName);
    await revealActions(page, deletedRow);
    await actionOn(page, deletedRow, DELETE_ACTION).tap();
    await expect(
      confirmation(page),
      `${PREVIEW.file.CurrentFileName} must still be deletable from its own row by ` +
        'tapping at phone width, through the confirmation that asks first',
    ).toBeVisible();
  });

  // AC-4
  // What a reader has to be able to READ at 360px, and how the listings are ANNOUNCED.
  // Both halves are about what a person is given: marks and verdicts painted big enough to
  // see and drawn inside the viewport rather than out past its edge, account numbers still
  // masked to their last four digits and still legible, and each listing still one list of
  // rows so anything reading the page aloud says how many there are and where each begins.
  //
  // Run as the Approver — the reading role, offered every listing on both screens and none
  // of the Importer-only controls — so this criterion is checked on the presentation a
  // reader actually gets.
  test('at phone width the status marks, verdicts and masked account numbers stay legible, and each listing is still one list of rows', async ({
    page,
    context,
  }) => {
    await signInAs(page, context, ROLE_APPROVER);

    /* ---- 1. The register: its status marks, and one list of files ---- */

    const register = await openRegister(page);

    for (const file of LISTED_FILES) {
      await expectLegible(
        valueOn(recordRow(register, file.CurrentFileName), file.CurrentStatus),
        `${file.CurrentFileName}'s "${file.CurrentStatus}" mark`,
      );
    }

    const registerListing = groupingHolding(
      register,
      LISTED_FILES.map((file) => file.CurrentFileName),
    );
    await expect(
      registerListing,
      'the files must sit in ONE list of rows at phone width — that is what tells a ' +
        'screen reader how many files there are and where each begins',
    ).toHaveCount(1);
    for (const file of LISTED_FILES) {
      await expect(
        recordRow(registerListing, file.CurrentFileName),
        `${file.CurrentFileName} must be announced as exactly ONE row of the register — a ` +
          'second, nested row inside a file would announce the register as twice its length',
      ).toHaveCount(1);
    }

    /* ---- 2. The file's own page: verdicts, masked numbers, three more listings ---- */

    const { history, preview, rejectedRows } = await openFilePage(page);

    for (const row of WILL_IMPORT_ROWS) {
      await expectLegible(
        recordRow(preview, row.Reference).getByText(WILL_IMPORT_VERDICT),
        `line ${row.Reference}'s "Will import" verdict`,
      );
    }
    for (const row of REJECTED_ROWS) {
      await expectLegible(
        recordRow(preview, row.Reference).getByText(REJECTED_VERDICT),
        `line ${row.Reference}'s "Rejected" verdict`,
      );
    }

    // The masked account number, on the rows a reader has to go and correct: still its last
    // four digits and nothing more (R5, POPIA), and still legible at this width.
    for (const row of REJECTED_ROWS) {
      const lastFour = lastFourOf(row.AccountNumber);
      await expectLegible(
        recordRow(rejectedRows, row.Reference).getByText(new RegExp(lastFour)),
        `rejected line ${row.Reference}'s masked account number (ending ${lastFour})`,
      );
      await expect(
        screenOf(page),
        `${row.Reference}'s full account number must not be printed anywhere until its own ` +
          'reveal is used — masking is compliance, not formatting (R5, project.md ' +
          '§Compliance)',
      ).not.toContainText(row.AccountNumber);
    }

    // Each of the file's three listings, likewise one list of rows. The import preview is
    // allowed to be ONE grouping or TWO — R14/R15 append the reject listing at the back of
    // the will-import listing, which is honestly either — so its two halves are asked for
    // separately: whichever shape this story lands on, each half sits in one.
    await expect(
      groupingHolding(
        history,
        HISTORY.map((activity) => activity.name),
      ),
      'the recorded activities must sit in ONE list of rows at phone width',
    ).toHaveCount(1);
    await expect(
      groupingHolding(
        preview,
        WILL_IMPORT_ROWS.map((row) => row.Reference),
      ),
      'every line that will import must sit in ONE list of rows at phone width',
    ).toHaveCount(1);
    await expect(
      groupingHolding(
        preview,
        REJECTED_ROWS.map((row) => row.Reference),
      ),
      'the reject listing appended at the back must itself be ONE list of rows at phone ' +
        'width — the same grouping as the will-import rows, or its own',
    ).toHaveCount(1);
    await expect(
      groupingHolding(
        rejectedRows,
        REJECTED_ROWS.map((row) => row.Reference),
      ),
      "the rejected-rows section's rows must sit in ONE list of rows at phone width",
    ).toHaveCount(1);
  });

  // AC-5
  // The closing regression pass (R24). Deliberately NOT a pixel comparison: the landing
  // screen and sign-in are out of scope to restyle, so what is asserted is that they still
  // ARRIVE and still WORK, and that the app's recorded design direction — the root
  // layout's own artifact, which R21 says this epic must not remove or relocate — is still
  // in the markup the app serves.
  test('nothing outside these two screens moved: the landing screen and sign-in still work, and the recorded design direction is still in place', async ({
    page,
    context,
  }) => {
    await serveFilesArea(page);
    await blockLiveBackends(page);

    /* ---- 1. Sign-in still works, and still answers the app's front door ---- */

    // A signed-out visitor at the app's own address is still sent to the sign-in screen.
    await page.goto(LANDING_PATH);
    await expect(page).toHaveURL(new RegExp(`${SIGN_IN_PATH}(\\?|$)`));
    await expect(
      page.getByRole('heading', { name: /^sign in$/i }),
      'the sign-in screen must still announce itself',
    ).toBeVisible();

    // Both fields still take what a person types and the submit is still offered — the
    // form still WORKS, which is what R24 protects. No credential is sent: epic 1 story 2
    // owns the sign-in journey itself.
    const username = page.getByLabel(/username/i);
    const password = page.getByLabel(/password/i);
    await username.fill('a-person');
    await password.fill('a-secret');
    await expect(username).toHaveValue('a-person');
    await expect(password).toHaveValue('a-secret');
    await expect(
      page.getByRole('button', { name: /^sign in$/i }),
      'the sign-in form must still offer its submit',
    ).toBeVisible();

    // The direction statement on a PUBLIC screen, read while still signed out.
    const servedAtSignIn = await directionStatementServedAt(page, SIGN_IN_PATH);
    expect(
      servedAtSignIn,
      `the direction statement served at ${SIGN_IN_PATH} no longer names the design's own ` +
        'reference key, so what shipped cannot be tied back to the direction that was ' +
        'agreed (AC-5, R21)',
    ).toContain(DIRECTION_SEED_KEY);
    expect(
      servedAtSignIn,
      `the direction statement served at ${SIGN_IN_PATH} no longer closes with its FINISH ` +
        'line, word for word',
    ).toContain(DIRECTION_FINISH_LINE);

    /* ---- 2. The landing screen itself still works ---- */

    // A signed-in person this project grants nothing is the one identity the landing
    // screen RENDERS for rather than sending onward, so it is how the screen itself is
    // read (`role-aware-landing`).
    await mockBrowserIdentityCall(page, UNRECOGNISED_ROLE);
    await seedSession(context, UNRECOGNISED_ROLE);

    await page.goto(LANDING_PATH);
    await expect(
      page,
      'a signed-in person with no recognised role must still be ANSWERED at the landing ' +
        'address rather than sent anywhere — this is the one identity the landing screen ' +
        'renders for, so being redirected here means the screen can no longer be seen at ' +
        'all (`role-aware-landing`, R24)',
    ).toHaveURL(LANDING_PATH);
    await expect(
      screenOf(page).getByRole('heading', { name: CHOOSER_HEADING }),
      'the landing screen must still render, and still say what the person can do',
    ).toBeVisible();

    /* ---- 3. The same statement on a screen this epic DID redesign ---- */

    // Checked on both a public screen and a redesigned one, because the contract belongs
    // to the ROOT layout: one tucked into a single page would pass on one address and fail
    // on the other.
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
    await seedSession(context, ROLE_IMPORTER);

    const servedAtUpload = await directionStatementServedAt(page, UPLOAD_PATH);
    expect(
      servedAtUpload,
      `the direction statement served at ${UPLOAD_PATH} no longer names the design's own ` +
        'reference key, so this epic removed or relocated it (AC-5, R21)',
    ).toContain(DIRECTION_SEED_KEY);
    expect(
      servedAtUpload,
      `the direction statement served at ${UPLOAD_PATH} no longer closes with its FINISH ` +
        'line, word for word',
    ).toContain(DIRECTION_FINISH_LINE);
  });

  // Accessibility — THE EPIC'S BASELINE (story §Reuse notes). This epic places no baseline
  // file automatically, and this is the only story that visits BOTH redesigned screens, so
  // this scan is the epic's sole automated accessibility coverage. It runs in a real
  // browser, at this project's WCAG 2.2 AA bar (superseding the template's 2.1 floor), on
  // both screens at BOTH widths — the redesign changes the row structure at each, and
  // contrast, focus order and target size are width- and state-specific things jsdom
  // cannot see at all. Every scan is taken on a settled screen, and no clock is installed:
  // axe is never run under faked timers.
  test('both redesigned screens have no accessibility violations, at phone width and at desktop width', async ({
    page,
    context,
  }) => {
    // Four scans across two widths and two screens.
    test.slow();

    await signInAs(page, context, ROLE_IMPORTER);

    await openRegister(page);
    await expectNoAccessibilityViolations(
      page,
      `the files register at ${String(PHONE_VIEWPORT.width)}px`,
    );

    await openFilePage(page);
    await expectNoAccessibilityViolations(
      page,
      "a file's own page — its detail, processing history, import preview and rejected " +
        `rows — at ${String(PHONE_VIEWPORT.width)}px`,
    );

    await page.setViewportSize(DESKTOP_VIEWPORT);

    await openRegister(page);
    await expectNoAccessibilityViolations(
      page,
      `the files register at ${String(DESKTOP_VIEWPORT.width)}px`,
    );

    await openFilePage(page);
    await expectNoAccessibilityViolations(
      page,
      `a file's own page at ${String(DESKTOP_VIEWPORT.width)}px`,
    );
  });
});
