/**
 * Story Metadata:
 * - Epic: files-view-redesign — Redesign the expense files view as a batch register
 * - Story: 1 — The files register as a ruled batch listing
 * - Route: /upload
 * - Target File: web/src/components/files/SubmittedFilesList.tsx
 * - Page Action: modify_existing
 * - Requirements: R10, R11, R12, R22, R23, R1, R2, R6, R7, R8, R9, BR1, BR2, BR4–BR9
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer). This file
 * carries the two `playwright`-tagged criteria and nothing else:
 * - AC-5 — the register still re-reads itself on its own cadence while a file is
 *   getting on, still announces an import and a validation failure in the same words,
 *   and adds no movement of its own.
 * - AC-6 — deleting a file from its row still asks first, still names the file, still
 *   reports a refusal on the screen behind the closed confirmation, and still leaves
 *   the reader on the register.
 * AC-3 (every row still offers Open; Delete only to an Importer; a status still reads
 * as a colour paired with its words) and AC-4 (the three answers that are not rows,
 * and Try again asking for the list again) are the Vitest layer's, at
 * `web/src/__tests__/integration/epic-files-view-redesign-story-1-the-files-register-as-a-ruled-listing.test.tsx`
 * — deliberately not repeated here (testing-policy.md § "one tag, one layer").
 *
 * AC-1 and AC-2 are tagged `none`: full-bleed ruled rows, tracked capitalised column
 * heads, the typewriter face and digits lining up down a column are visual and
 * typographic judgements, already on this story's manual checklist. Nothing in this
 * file asserts a class string, a computed style or a font family to fake covering
 * them.
 *
 * NO ACCESSIBILITY SCAN LIVES HERE, deliberately. This epic places a single
 * `@axe-core/playwright` scan of BOTH redesigned screens in story 6 — the only story
 * that visits `/upload` and `/upload/file` (story 6 §Reuse notes, "Accessibility
 * baseline lives here"). A second scan of `/upload` here would duplicate it.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy
 * ---------------------------------------------------------------------------
 * Backend calls are ALWAYS mocked — this spec never contacts a live backend and never
 * uses a real credential (testing-policy.md § "Playwright runs against mocks, never
 * live"), even though project.md records both real services as running on this
 * machine. Two boundaries, one contract — the arrangement every earlier spec on this
 * screen uses, reused rather than re-invented:
 *
 * 1. Node boundary → `./support/auth-api-stub.ts`, started in `globalSetup` with the
 *    app's auth base URL pointed at it by `playwright.config.ts`. `/upload` is gated
 *    SERVER-side (the `(authenticated)` layout's `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process), and `page.route()`
 *    cannot see a fetch the browser never makes. The stub answers that call from the
 *    shared identity source, keyed off the `session` cookie value seeded below —
 *    which is also what decides, server-side, whether a row carries a delete control
 *    at all (BR7, unchanged by this epic).
 * 2. Browser boundary → `page.route()` below, for everything this screen reads and the
 *    one call it sends:
 *      GET    /transactions-api/v1/file-logs?IsActive=Yes   (the register, and its re-reads)
 *      GET    /transactions-api/v1/transactions             (the confirmation's request count)
 *      GET    /transactions-api/v1/file-settings            (the submission slip's settings)
 *      DELETE /transactions-api/v1/files?LogId=<id>         (the app's one delete call)
 *    Reads this story asserts nothing about are mocked anyway: `/transactions-api` is
 *    the app's OWN same-origin mount point, so an unmocked call is forwarded to the
 *    live transactions service by a route handler INSIDE the Next.js process, where a
 *    live-origin block cannot see it. A catch-all aborts anything else under
 *    `/transactions-api/**`, registered FIRST so it loses to the specific reads; the
 *    live services' own origins are blocked outright, registered LAST so they win over
 *    the origin-agnostic globs above them.
 *
 * Every response body comes from the project-wide factories under
 * `web/src/mocks/data/` (`file-log.ts`, `file-setting.ts`, `identity.ts`, `role.ts`,
 * `transaction.ts`) — no response shape and no canonical value is authored in this
 * file, so this spec and the Vitest layer cannot drift on the contract. In particular
 * `fileLogProgression()` gives the SAME file at successive statuses (one id, one name,
 * one setting, one process date), which is what makes "that row caught up" tellable
 * from "a second row appeared"; and `DELETE_REFUSED_MESSAGE` is phrased as only a
 * backend would phrase it, so a refusal shown in those words cannot be wording the
 * screen wrote for itself.
 *
 * Implementation patterns this spec assumes (read before implementing):
 * - THE REGISTER IS READ, AND THE DELETE IS SENT, FROM THE BROWSER through the shared
 *   API client at the app's own `/transactions-api/...` address (`lib/api/files.ts`).
 *   `page.route()` cannot intercept a fetch made by the Next.js server or by a Server
 *   Action, so moving either call server-side both bypasses these mocks and sends the
 *   request to the live transactions service — and a server-only read could not
 *   self-refresh at all.
 * - THE SELF-REFRESH CADENCE IS UNCHANGED at 15 seconds, re-reading the SAME list call
 *   (`GET /v1/file-logs?IsActive=Yes`) while any listed file is in progress (BR2 names
 *   the cadence as behaviour this redesign must not touch). AC-5 pins it from both
 *   sides: nothing may be re-read before 14s of browser time, and a re-read must have
 *   landed by 15.5s.
 * - THE ANNOUNCEMENTS COME OUT OF THE ROOT LAYOUT'S EXISTING TOAST MACHINERY
 *   (`ToastProvider` / `ToastContainer`), which renders one `role="region"` named
 *   "Notifications" outside `main`. No second notification surface, and no bespoke
 *   banner inside the register.
 * - THE REGISTER KEEPS REAL TABLE SEMANTICS (R12 / CLAUDE.md §1 — the Shadcn table
 *   restyled THROUGH, not replaced): each file is a `row`, addressed by the file's own
 *   name, never by position. A register rebuilt out of `div`s would fail every query
 *   here.
 * - THE ROW IS UPDATED IN PLACE, not torn down and rebuilt: rows stay keyed by the
 *   file's id, so a re-read that changes a row's status does not remount that row's
 *   controls. AC-5 proves it by leaving keyboard focus on a row's `Open` link across a
 *   refresh — a remounted row loses it.
 * - THE ROW'S CONTROLS STAY WHAT THEY ARE through the restyle: `Open` is a real link
 *   (`role="link"`, so the file's page can be opened in a new tab) and the delete is a
 *   real button IN the row, not behind a row menu that must be opened first.
 * - THE CONFIRMATION IS THE SHARED ONE (`DeleteFileConfirmation` over `ConfirmAction`
 *   → a Shadcn `alert-dialog`, `role="alertdialog"`, PORTALLED to the body), in its
 *   unchanged three shapes (R20). Dialog queries below are therefore scoped to the
 *   dialog, not to `main`. A second, register-only confirmation is a defect.
 * - A REFUSED DELETE IS REPORTED ON THE REGISTER ITSELF, behind the confirmation,
 *   which has already closed — in the service's own wording, with the row untouched
 *   and the reader still on `/upload`. Nothing navigates: navigation is the file page's
 *   behaviour on SUCCESS and has no meaning here.
 * - The labels are the shared three, deliberately not confusable with one another:
 *     row action        → /delete file/i        ("Delete the file" does not match it)
 *     confirming choice → /delete the file/i
 *     way out           → /keep the file/i
 * - Every assertion on page content is scoped to `main`, except the notifications
 *   region and the dialog, which are mounted outside it. Next.js also renders a
 *   permanently empty body-level `role="alert"` route announcer, so notifications are
 *   found by their region's own accessible name rather than by an `alert` query, whose
 *   role legitimately varies with the toast's variant.
 *
 * Cookie/storage assumptions: the session travels only in the `session` cookie (epic 1
 * BR2), seeded directly rather than by driving the sign-in form — epic 1's story 2
 * spec owns that journey. Cookies ignore port, so one seed serves the dev server
 * (:3000) and the epic-end production run (:3100). `Secure` is omitted because the E2E
 * app is served over plain http on localhost.
 *
 * TIMING — why nothing here waits real time, and why the clock is STOPPED: the
 * register's refresh is timer-driven, so AC-5 drives the browser clock with
 * `page.clock` (`install()` before navigating, then `fastForward()` across the REAL
 * configured cadence). No test-only "short interval" prop is needed in production code
 * and no test sits waiting. `page.waitForTimeout` is never used.
 *
 * `install()` on its own does NOT stop time. The faked clock goes on flowing with real
 * time and only `pauseAt()` stops it — measured on this app, not assumed: with a clock
 * merely installed, the page's own `Date.now()` advances ~517ms across 500ms of real
 * time. That is what the FLOOR half of AC-5 turns on. While the clock flows, the real
 * seconds spent watching for an early re-read ARE browser seconds, so jumping to 14s and
 * then watching 2s of real time carries the clock to 16s — past the 15s cadence — and a
 * perfectly ON-TIME re-read lands inside the very window that was meant to prove
 * earliness. Nothing about the register's cadence is wrong when that happens; the
 * measurement is.
 *
 * So the clock is STOPPED before the register is given its answer at all, and the answer
 * is what starts the refresh timer. From that follows everything AC-5 needs:
 *   - the timer starts at the instant the stopped clock is standing at, so that instant
 *     is the cadence's exact zero;
 *   - the only browser time that passes afterwards is time a `fastForward` puts on the
 *     clock, so "nothing re-read within 14s" is exactly 14s of the register's own life;
 *   - and real time spent waiting for an early re-read to show up costs no browser time
 *     at all, because a stopped clock fires nothing.
 * The register's first answer is held back in the route handler until the clock has
 * stopped (`holdListReadsUntil` below) — the one device that pins the cadence's zero.
 *
 * AC-6 installs no clock: every file it lists is settled, so nothing is refreshing
 * underneath it.
 *
 * WHAT AC-5's "adds no movement of its own" DOES AND DOES NOT ASSERT:
 * What it asserts, in a real browser and deterministically — a refresh that brings a
 * row up to date moves NOTHING: the register's own box and both rows' boxes sit at the
 * same place with the same height before and after, the page does not scroll itself,
 * there is one row per file throughout (no ghost or duplicate row from an animated
 * swap), and keyboard focus stays exactly where the reader left it.
 * What it deliberately does NOT do is sample geometry every animation frame. Under
 * `page.clock` the browser's `requestAnimationFrame` and `performance.now()` are faked
 * along with the timers, so an in-page frame sampler would take one or two samples per
 * jump and would then pass against any implementation at all — a green-but-worthless
 * test. The project's frame-level roll/shift battery lives where it can honestly run,
 * on the request list's own count
 * (`epic-request-list-redesign-story-9-watching-the-batch-balance.spec.ts`), and
 * `prefers-reduced-motion` parity is a project-wide `globals.css` rule that same story
 * pins. R22 asks this epic to add no competing motion of its own, which is what the
 * layout, scroll and focus stability below observes.
 *
 * WHY THESE TWO TESTS MAY BE GREEN BEFORE THE STORY IS BUILT — and why that is the
 * point. This is a presentation-only redesign: AC-5 and AC-6 are both "still" criteria,
 * so they describe behaviour the screen ALREADY has and which BR2 forbids this epic
 * from changing (the 15s cadence, the two announcements and their words, the ask-first
 * delete, the refusal reported on the register). They are regression guards, not a red
 * specification of new behaviour — the usual TDD-red expectation does not apply to
 * them, and writing them to fail first would mean asserting something other than what
 * the AC says. What they must do is keep passing THROUGH the restyle: a register
 * rebuilt out of `div`s, a row re-keyed so it remounts on every refresh, a re-read
 * timer rewritten rather than reused, a refusal moved into the dialog, or an Open link
 * turned into a click handler each break at least one of them. The story's genuinely
 * new, currently-failing work is visual (AC-1/AC-2, manual) and structural
 * (AC-3/AC-4, Vitest).
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import {
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_WARNING_LEAD_MS,
} from '../src/lib/session/config';
import {
  DELETE_REFUSED_MESSAGE,
  FILE_STATUS_IMPORTED,
  FILE_STATUS_UPLOADED,
  FILE_STATUS_VALIDATING,
  FILE_STATUS_VALIDATION_FAILED,
  deleteFailureResponse,
  deleteSuccessResponse,
  fileLogListResponse,
  fileLogProgression,
} from '../src/mocks/data/file-log';
import { fileSettingListResponse } from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  fileLogsAfterDeleting,
  importedFileToDelete,
  transactionListResponse,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FileLog } from '../src/mocks/data/file-log';
import type { TransactionRead } from '../src/mocks/data/transaction';

/** The register this story redraws (story metadata Route). */
const UPLOAD_ROUTE = '/upload';

/** Its address, for asserting the reader never left it. */
const UPLOAD_URL_PATTERN = new RegExp(`${UPLOAD_ROUTE}$`);

/**
 * The transactions-service calls this screen makes, as the BROWSER addresses them: the
 * app's own `/transactions-api/*` mount point, never a service origin
 * (`web/src/lib/utils/constants.ts`). Trailing `**` so query strings are covered.
 */
const TRANSACTIONS_API_GLOB = '**/transactions-api/**';
const FILE_LOGS_URL_GLOB = '**/transactions-api/v1/file-logs**';
const TRANSACTIONS_URL_GLOB = '**/transactions-api/v1/transactions**';
const FILE_SETTINGS_URL_GLOB = '**/transactions-api/v1/file-settings**';

/** The list call's required query (epic brief §Notes: `IsActive` is required). */
const ACTIVE_FILES_QUERY = 'IsActive=Yes';

/**
 * The delete is `DELETE /transactions-api/v1/files?LogId=<id>` — the BARE `/v1/files`
 * path, which a glob cannot separate from its own children (`/files/download`,
 * `/files/retry-validation`), so it is matched exactly on the pathname instead.
 */
const isDeleteFileCall = (url: URL): boolean =>
  url.pathname.endsWith('/transactions-api/v1/files');

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright, and registered LAST — Playwright matches the most recently
 * registered route first, so a call addressed at a live service fails visibly instead
 * of being quietly answered by an origin-agnostic mock above it.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/**
 * The register's own re-read cadence, which this redesign must not change (BR2, and
 * `SubmittedFilesList`'s `REFRESH_INTERVAL_MS`). Pinned from both sides below: quiet
 * until {@link BEFORE_CADENCE_MS} of browser time has passed, re-read by
 * `BEFORE_CADENCE_MS + PAST_CADENCE_MS`.
 */
const REFRESH_CADENCE_MS = 15_000;
const BEFORE_CADENCE_MS = 14_000;
const PAST_CADENCE_MS = 1_500;

/**
 * Real-time window in which an early re-read would arrive, if the cadence had been
 * shortened. It is watched from the moment the watcher is registered, so the reads the
 * first render issues (React's development double-render included) are already behind
 * it and cannot be mistaken for a poll.
 *
 * It costs no browser time: it is only ever waited out with the clock STOPPED (see the
 * TIMING note above), so nothing can fall due while it runs and its length can never
 * carry the clock towards the cadence it is there to check.
 */
const QUIET_WINDOW_MS = 2_000;

/**
 * How far ahead of where it stands the clock is stopped. `pauseAt` stops the clock AT an
 * instant, so that instant has to still be ahead of the page when the call gets there; a
 * whole second is far more than the round trip needs, and nothing in this app falls due
 * inside it (the register's answer is still held, and the idle-session check is 29
 * minutes out).
 */
const FREEZE_LEAD_MS = 1_000;

/**
 * Every read of the register AC-5 allows: the one the screen opens with, then exactly one
 * per cadence window it crosses. A register asking more often than its cadence shows up
 * here as an extra read, whichever window it came from.
 */
const READS_ALLOWED = 3;

/**
 * Total browser time this spec advances. It is idle time as far as epic 1's
 * idle-session manager is concerned (nothing is clicked or typed between the jumps),
 * so it has to stay well inside the idle window or the session would end mid-test.
 * Checked against the app's own configured values.
 *
 * Note: this process reads the same env names the app does but does not load
 * `web/.env.local` — so if you shorten the idle timings there for manual testing, this
 * guard is what will tell you.
 */
const CLOCK_BUDGET_MS =
  FREEZE_LEAD_MS + BEFORE_CADENCE_MS + PAST_CADENCE_MS + REFRESH_CADENCE_MS;

if (CLOCK_BUDGET_MS >= SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_LEAD_MS) {
  throw new Error(
    `This spec advances the browser clock by ${String(CLOCK_BUDGET_MS)}ms of idle ` +
      `time, which reaches the configured session idle window ` +
      `(${String(SESSION_IDLE_TIMEOUT_MS)}ms idle, ` +
      `${String(SESSION_WARNING_LEAD_MS)}ms warning lead) — the session would end ` +
      `mid-test. Raise NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_SECONDS.`,
  );
}

/**
 * The words each announcement has always used, as a reader meets them (AC-5's "in the
 * same words"): the import is titled for the outcome and says the file finished; the
 * validation failure says which file had rows rejected. The file's name, its record
 * count and the status word itself are asserted from the fixture rather than written
 * out here, so the screen is held to the service's own values (BR5).
 */
const IMPORTED_TITLE_WORDS = /file imported/i;
const IMPORTED_MESSAGE_WORDS = /finished importing/i;
const REJECTED_ROWS_MESSAGE_WORDS = /rows in .* were rejected/i;

/**
 * The shared delete labels. Kept narrow and non-overlapping: the destructive action,
 * its confirmation and the way out must never be confusable, and `/delete file/i`
 * deliberately does not match "Delete the file".
 */
const DELETE_FILE_LABEL = /delete file/i;
const CONFIRM_DELETE_LABEL = /delete the file/i;
const KEEP_THE_FILE_LABEL = /keep the file/i;

/** How a refusal names what did not happen, and which file it did not happen to. */
const DELETE_REFUSED_TITLE_WORDS = /could not delete/i;

/** That row's own way into the file's page — a real link, named for its file. */
const OPEN_THE_FILE_LABEL = /open/i;

/**
 * Attribute stamped on the document element once the first render is on screen. A
 * client-side update leaves it alone; a document reload wipes it — so finding it at the
 * end is the proof that the reader stayed in the document they started in.
 */
const NO_RELOAD_MARKER = 'data-e2e-no-reload';

/** A mocked JSON response, built from a project-wide factory body. */
const jsonResponse = (
  body: unknown,
  status = 200,
): { status: number; contentType: string; body: string } => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/**
 * Puts the browser in a signed-in state without driving the sign-in form and without
 * any real credential: the mock `session` cookie the Node-side stub recognises for this
 * role.
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

/** What the mocked transactions service is currently serving this screen. */
interface UploadScreenFeed {
  /** Change what the NEXT read of the active file list returns — the service moving on. */
  showFiles: (files: FileLog[]) => void;
  /** Every register URL the browser has asked for, in order. */
  fileListReads: string[];
  /** The `LogId` the delete call named, if one was sent — which file was deleted. */
  fileIdDeleted: () => string | null;
}

/**
 * Every backend mock this spec needs, registered in the ONE order that works:
 * Playwright matches the most recently registered route first, so the
 * `/transactions-api/**` catch-all goes on FIRST (it must lose to every specific call
 * below it) and the live-origin block goes on LAST.
 *
 * The register is served from a single mutable snapshot rather than a per-request
 * queue: the browser may legitimately read the list more than once for one on-screen
 * state (React's development double-render being the obvious case), and a queue would
 * then silently skip a status. Keeping the served body under the TEST's control means
 * each assertion below is about one exact transition.
 *
 * `refuseDelete` is how a test says what the service does with the one mutating call:
 * refuse it in its own words, or accept it.
 *
 * `holdListReadsUntil` is how a test says WHEN the register may have its answer. It is
 * already released unless a test hands in a gate, and the only test that does is AC-5,
 * which holds the first answer back until the browser clock has stopped so that the
 * refresh timer's start is an instant it knows exactly (see the TIMING note above).
 */
const serveUploadScreen = async (
  page: Page,
  {
    files,
    requests = [],
    refuseDelete = false,
    holdListReadsUntil = Promise.resolve(),
  }: {
    files: FileLog[];
    requests?: TransactionRead[];
    refuseDelete?: boolean;
    holdListReadsUntil?: Promise<void>;
  },
): Promise<UploadScreenFeed> => {
  let currentFiles = files;
  let fileIdDeleted: string | null = null;
  const fileListReads: string[] = [];

  // 1. Catch-all: anything under the app's transactions mount that this spec has not
  //    mocked is aborted, so it cannot travel on through the same-origin proxy to the
  //    live service.
  await page.route(TRANSACTIONS_API_GLOB, (route) => route.abort());

  // 2. The register itself, and the two other reads that share this screen.
  await page.route(FILE_LOGS_URL_GLOB, async (route) => {
    fileListReads.push(route.request().url());
    // Asked now, answered when the test allows: nothing waits on this by default.
    await holdListReadsUntil;
    return route.fulfill(jsonResponse(fileLogListResponse(currentFiles)));
  });
  // The whole set, other files' rows and all — the app narrows to one file's requests
  // in the browser, because this endpoint takes no query parameters.
  await page.route(TRANSACTIONS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(transactionListResponse(requests))),
  );
  await page.route(FILE_SETTINGS_URL_GLOB, (route) =>
    route.fulfill(jsonResponse(fileSettingListResponse())),
  );

  // 3. The app's ONE delete call. Registered in every test: an unmocked mutating call
  //    would be forwarded to the live transactions service by the app's own proxy.
  await page.route(isDeleteFileCall, (route) => {
    const request = route.request();
    if (request.method() !== 'DELETE') {
      // Nothing in this story addresses this path with another method; letting one
      // through would forward it to the live service.
      return route.abort();
    }
    fileIdDeleted = new URL(request.url()).searchParams.get('LogId');
    return refuseDelete
      ? // The transactions service reports a refusal as a 500 carrying its own
        // sentence in the `DefaultResponse` envelope's `Messages[]`.
        route.fulfill(jsonResponse(deleteFailureResponse(), 500))
      : route.fulfill(jsonResponse(deleteSuccessResponse()));
  });

  // 4. A browser-side identity read, answered from the SAME shared userinfo source the
  //    Node-side stub uses, so the two mock layers cannot disagree about who is here.
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(userInfoFor(ROLE_IMPORTER))),
  );

  // 5. The live services' own origins.
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }

  return {
    showFiles: (next: FileLog[]) => {
      currentFiles = next;
    },
    fileListReads,
    fileIdDeleted: () => fileIdDeleted,
  };
};

/** The screen's own content — everything about the register is scoped to it. */
const screenOf = (page: Page): Locator => page.getByRole('main');

/** The register itself, still a real table through the restyle (R12). */
const register = (page: Page): Locator => screenOf(page).getByRole('table');

/** One file's row, found by the file's OWN NAME — never by position. */
const fileRow = (page: Page, fileName: string): Locator =>
  screenOf(page).getByRole('row').filter({ hasText: fileName });

/** That row's own way into the file's page, so one row's control is never another's. */
const openLinkIn = (row: Locator): Locator =>
  row.getByRole('link', { name: OPEN_THE_FILE_LABEL });

/** That row's own delete action. */
const deleteActionIn = (row: Locator): Locator =>
  row.getByRole('button', { name: DELETE_FILE_LABEL });

/**
 * The app's in-app notification surface — the root layout's `ToastContainer`, named
 * "Notifications". Deliberately NOT an `alert` query: Next renders a permanently empty
 * body-level `role="alert"` route announcer, and a toast's own role legitimately varies
 * with its variant. It is mounted outside `main`, so it is not scoped to it.
 */
const notifications = (page: Page): Locator =>
  page.getByRole('region', { name: /notifications/i });

/** The shared confirmation, portalled to the body by Radix. */
const confirmation = (page: Page): Locator => page.getByRole('alertdialog');

/** Where something sits down the page, and how tall it is, in whole pixels. */
interface VerticalBox {
  y: number;
  height: number;
}

/**
 * Where an element sits DOWN the page, independent of how far the page happens to be
 * scrolled, rounded to whole pixels.
 *
 * Vertical only, on purpose: a value changing from `0` to `142` legitimately changes a
 * column's width in an auto-laid-out table, and this epic's horizontal behaviour is
 * story 6's subject. Vertical position and height are where a reader experiences a
 * register jumping or shifting under them, and they are immune to that reflow.
 */
const verticalBoxOf = (locator: Locator): Promise<VerticalBox> =>
  locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      y: Math.round(rect.top + window.scrollY),
      height: Math.round(rect.height),
    };
  });

/** The same measurement for several named anchors at once, for one readable diff. */
const verticalAnchorsOf = async (
  anchors: Record<string, Locator>,
): Promise<Record<string, VerticalBox>> => {
  const measured: Record<string, VerticalBox> = {};
  for (const [name, locator] of Object.entries(anchors)) {
    measured[name] = await verticalBoxOf(locator);
  }
  return measured;
};

/** How far down the page the reader currently is. */
const scrollPositionOf = (page: Page): Promise<number> =>
  page.evaluate(() => Math.round(window.scrollY));

/** Stamps the reload marker on the document currently on screen. */
const markCurrentDocument = async (page: Page): Promise<void> => {
  await page.evaluate((attribute) => {
    document.documentElement.setAttribute(attribute, 'kept');
  }, NO_RELOAD_MARKER);
};

/** A one-way gate: something to wait on, and the switch that lets it through. */
interface Gate {
  passable: Promise<void>;
  open: () => void;
}

const gate = (): Gate => {
  let open = (): void => undefined;
  const passable = new Promise<void>((letThrough) => {
    open = letThrough;
  });
  return { passable, open };
};

/**
 * Stops the browser clock where it stands — a second ahead of it, which is what
 * `pauseAt` needs (see {@link FREEZE_LEAD_MS}). From here on the only browser time that
 * passes is time a `fastForward` puts on the clock, which is what makes every window
 * below an exact measure of the register's own life rather than of the test's.
 */
const stopTheClock = async (page: Page): Promise<void> => {
  const standingAt = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(standingAt + FREEZE_LEAD_MS);
};

test.describe('Epic files-view-redesign, Story 1: the files register as a ruled batch listing', () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out and seeds the identity it needs.
    await context.clearCookies();
  });

  // AC-5
  test('the register still re-reads itself on its own cadence, still announces an import and a validation failure in the same words, and moves nothing while it does', async ({
    page,
    context,
  }) => {
    // Two files, each the SAME file at successive statuses — one id, one name, one
    // setting, one process date each — so a changed row is unmistakably that row
    // changing rather than a second row appearing. One will import; the other will fail
    // validation, so both announcements are exercised on one register.
    const [uploading, imported] = fileLogProgression(
      [FILE_STATUS_UPLOADED, FILE_STATUS_IMPORTED],
      { Id: 5201, CurrentFileName: 'expenses_2026-05-01.csv' },
    );
    const [validating, failedValidation] = fileLogProgression(
      [FILE_STATUS_VALIDATING, FILE_STATUS_VALIDATION_FAILED],
      { Id: 5202, CurrentFileName: 'expenses_2026-05-02.csv' },
    );

    // Control the browser clock before anything schedules a timer, so the register's
    // real cadence can be crossed instantly and measured from both sides — and hold the
    // register's first answer back, because an installed clock is still a FLOWING clock
    // and the cadence has to be measured from an instant this test knows (TIMING above).
    await page.clock.install();
    const registerAnswer = gate();
    const feed = await serveUploadScreen(page, {
      files: [uploading, validating],
      holdListReadsUntil: registerAnswer.passable,
    });
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(UPLOAD_ROUTE);

    // The clock stops here, with the register still waiting to be answered — so letting
    // the answer through now starts its refresh timer at the instant the stopped clock
    // is standing at. That instant is the cadence's zero, and nothing moves the clock
    // from here on but the jumps below.
    await stopTheClock(page);
    registerAnswer.open();

    // As it lands: both files are getting on, each row showing the status, most recent
    // activity and record count the SERVICE reported.
    const importingRow = fileRow(page, uploading.CurrentFileName);
    const validatingRow = fileRow(page, validating.CurrentFileName);
    await expect(importingRow).toContainText(uploading.CurrentStatus);
    await expect(importingRow).toContainText(
      uploading.LastExecutedActivityName,
    );
    await expect(validatingRow).toContainText(validating.CurrentStatus);
    await expect(validatingRow).toContainText(validating.RecordCount);

    // Nothing has been said to the reader about files that were already getting on when
    // they arrived — which is what makes the announcements below news.
    await expect(notifications(page)).toBeHidden();

    // Marked after the first paint, so only a reload from here on could remove it.
    await markCurrentDocument(page);

    // The reader puts their keyboard on a row's own way into that file. If the refresh
    // rebuilds rows instead of bringing them up to date, this focus is what it loses.
    const openTheImportingFile = openLinkIn(importingRow);
    await openTheImportingFile.focus();
    await expect(openTheImportingFile).toBeFocused();

    // Where everything sits before the register catches up, measured after focusing
    // (focusing may scroll a control into view; the refresh must not).
    const anchors = {
      register: register(page),
      importingRow,
      validatingRow,
    };
    const anchorsBefore = await verticalAnchorsOf(anchors);
    const scrollBefore = await scrollPositionOf(page);

    // Nothing may be re-read before the cadence is due. Watched from HERE, so the read
    // the first render issued is already behind the watcher — and watched against a
    // STOPPED clock, so the watching cannot itself carry the clock towards the cadence:
    // the 14s jumped below is 14s of the register's life and nothing else.
    const earlyReRead = page
      .waitForRequest(FILE_LOGS_URL_GLOB, { timeout: QUIET_WINDOW_MS })
      .then((request) => request.url())
      .catch(() => null);

    await page.clock.fastForward(BEFORE_CADENCE_MS);

    expect(
      await earlyReRead,
      `the register must keep its own cadence: nothing may be re-read within ` +
        `${String(BEFORE_CADENCE_MS)}ms of browser time (BR2 — this redesign does not ` +
        `change how often the service is asked)`,
    ).toBeNull();

    // The service finishes importing the first file. Nobody touches the browser — no
    // click, no keypress, no reload: only time passes, past the cadence.
    feed.showFiles([imported, validating]);
    await page.clock.fastForward(PAST_CADENCE_MS);

    // That row catches up in place, on the service's own values...
    await expect(importingRow).toContainText(imported.CurrentStatus);
    await expect(importingRow).toContainText(imported.LastExecutedActivityName);
    await expect(importingRow).toContainText(imported.RecordCount);
    await expect(importingRow).not.toContainText(uploading.CurrentStatus);
    await expect(importingRow).not.toContainText(
      uploading.LastExecutedActivityName,
    );
    // ...and the file that has not moved on is exactly as it was.
    await expect(validatingRow).toContainText(validating.CurrentStatus);

    // One row per file throughout — brought up to date, not joined by a second copy of
    // itself on the way through.
    await expect(importingRow).toHaveCount(1);
    await expect(validatingRow).toHaveCount(1);

    // The reader is told their file imported, in the words this screen has always used,
    // naming the file and stating the count the SERVICE reported.
    const announcement = notifications(page);
    await expect(announcement).toBeVisible();
    await expect(announcement).toContainText(IMPORTED_TITLE_WORDS);
    await expect(announcement).toContainText(IMPORTED_MESSAGE_WORDS);
    await expect(announcement).toContainText(imported.CurrentFileName);
    await expect(announcement).toContainText(imported.RecordCount);

    // NOTHING MOVED. The register and both rows are where they were, at the height they
    // were; the page did not scroll itself; and the reader's keyboard is still on the
    // very control they left it on — a row brought up to date in place, with no motion
    // of the register's own (R22).
    expect(
      await verticalAnchorsOf(anchors),
      'a row catching up must move nothing: the register and every row must sit ' +
        'exactly where they did, at the same height (R22 — this epic adds no motion ' +
        'of its own)',
    ).toEqual(anchorsBefore);
    expect(
      await scrollPositionOf(page),
      'the register must not scroll the reader when it re-reads itself',
    ).toBe(scrollBefore);
    await expect(
      openTheImportingFile,
      "the reader's keyboard must stay on the control they left it on — a row that " +
        'loses focus on a refresh was rebuilt, not brought up to date',
    ).toBeFocused();

    // Time passes again, and the service finds bad rows in the other file.
    feed.showFiles([imported, failedValidation]);
    await page.clock.fastForward(REFRESH_CADENCE_MS);

    // Its row catches up on its own...
    await expect(validatingRow).toContainText(failedValidation.CurrentStatus);
    await expect(validatingRow).toContainText(
      failedValidation.LastExecutedActivityName,
    );

    // ...and the reader is told, in the words this screen has always used: the
    // service's own status as the heading, and which file had rows rejected.
    await expect(announcement).toBeVisible();
    await expect(announcement).toContainText(failedValidation.CurrentStatus);
    await expect(announcement).toContainText(REJECTED_ROWS_MESSAGE_WORDS);
    await expect(announcement).toContainText(failedValidation.CurrentFileName);

    // Every re-read was the register's existing call, asking for the ACTIVE files as the
    // service requires — not a second, differently-shaped read introduced here.
    expect(
      feed.fileListReads.filter((url) => !url.includes(ACTIVE_FILES_QUERY)),
      `every read of the register must carry ${ACTIVE_FILES_QUERY} (epic brief ` +
        `§Notes: IsActive is a required query parameter)`,
    ).toEqual([]);

    // And the register was asked exactly as often as its cadence allows across the whole
    // of the browser time this test spent: the read it opened with, then one per cadence
    // window. Two in any one window would be a shortened cadence; none would be a
    // register that had stopped asking.
    expect(
      feed.fileListReads,
      `over ${String(CLOCK_BUDGET_MS - FREEZE_LEAD_MS)}ms of browser time the register ` +
        `may ask exactly ${String(READS_ALLOWED)} times — the read it opens with, then ` +
        `one per ${String(REFRESH_CADENCE_MS)}ms cadence window (BR2)`,
    ).toHaveLength(READS_ALLOWED);

    // The reader spent the whole time on the register, in the document they opened.
    await expect(page).toHaveURL(UPLOAD_URL_PATTERN);
    await expect(page.locator('html')).toHaveAttribute(
      NO_RELOAD_MARKER,
      'kept',
      { timeout: 1_000 },
    );
  });

  // AC-6
  test('deleting a file from its row still asks first, names the file, and reports the service’s refusal on the register behind the closed confirmation', async ({
    page,
    context,
  }) => {
    // An imported file that produced requests, listed among other files — so the row
    // this delete is asked from has to be told apart from its neighbours, and the
    // confirmation has a real scale to state.
    const scenario = importedFileToDelete();
    const otherFiles = fileLogsAfterDeleting(scenario);

    // No clock is installed: every file here is settled, so nothing is refreshing
    // underneath this journey.
    const feed = await serveUploadScreen(page, {
      files: [scenario.file, ...otherFiles],
      requests: scenario.transactions,
      refuseDelete: true,
    });
    await seedSession(context, ROLE_IMPORTER);

    await page.goto(UPLOAD_ROUTE);

    // As it lands: the file to be deleted is listed, among the others.
    const targetRow = fileRow(page, scenario.file.CurrentFileName);
    await expect(targetRow).toContainText(FILE_STATUS_IMPORTED);
    for (const other of otherFiles) {
      await expect(fileRow(page, other.CurrentFileName)).toBeVisible();
    }

    // Marked after the first paint, so only a reload from here on could remove it.
    await markCurrentDocument(page);

    // Asking from the row ASKS FIRST — the shared confirmation opens, and it names the
    // file it is about, on a register of many.
    await deleteActionIn(targetRow).click();
    const asked = confirmation(page);
    await expect(asked).toBeVisible();
    await expect(asked).toContainText(scenario.file.CurrentFileName);

    // Nothing has been sent to the service yet: asking is asking.
    expect(
      feed.fileIdDeleted(),
      'opening the confirmation must not delete anything — the delete is sent only ' +
        'when the confirming choice is taken',
    ).toBeNull();

    // Taking the way out leaves the file exactly as it was, and still sends nothing.
    await asked.getByRole('button', { name: KEEP_THE_FILE_LABEL }).click();
    await expect(asked).toBeHidden();
    expect(
      feed.fileIdDeleted(),
      'backing out of the confirmation must not delete anything',
    ).toBeNull();
    await expect(targetRow).toContainText(FILE_STATUS_IMPORTED);
    await expect(screenOf(page)).not.toContainText(DELETE_REFUSED_TITLE_WORDS);

    // Asked again — and this time confirmed. The service refuses, in its own words.
    await deleteActionIn(targetRow).click();
    const confirmed = confirmation(page);
    await expect(confirmed).toBeVisible();
    await expect(confirmed).toContainText(scenario.file.CurrentFileName);
    await confirmed.getByRole('button', { name: CONFIRM_DELETE_LABEL }).click();

    // The refusal is reported ON THE REGISTER, behind a confirmation that has already
    // closed — the reader is never held in a dialog to read why nothing happened.
    await expect(confirmed).toBeHidden();
    const registerScreen = screenOf(page);
    await expect(registerScreen).toContainText(DELETE_REFUSED_TITLE_WORDS);
    await expect(registerScreen).toContainText(scenario.file.CurrentFileName);
    // In the SERVICE's own sentence — phrased as only a backend would phrase it, so
    // this cannot be wording the screen wrote for itself.
    await expect(
      registerScreen,
      "a refused delete must report the service's own wording, never a claimed " +
        'success and never silence',
    ).toContainText(DELETE_REFUSED_MESSAGE);

    // It was THIS row's file the delete was asked for, named by its own id.
    expect(
      feed.fileIdDeleted(),
      'the delete must name the file whose row it was asked from (LogId)',
    ).toBe(String(scenario.file.Id));

    // The file is still listed, exactly as it was — and so is every other file.
    await expect(targetRow).toHaveCount(1);
    await expect(targetRow).toContainText(FILE_STATUS_IMPORTED);
    await expect(deleteActionIn(targetRow)).toBeVisible();
    for (const other of otherFiles) {
      await expect(fileRow(page, other.CurrentFileName)).toBeVisible();
    }

    // And the reader was left on the register, in the document they started in: nothing
    // navigated and nothing reloaded.
    await expect(page).toHaveURL(UPLOAD_URL_PATTERN);
    await expect(page.locator('html')).toHaveAttribute(
      NO_RELOAD_MARKER,
      'kept',
      { timeout: 1_000 },
    );
  });
});
