/**
 * Story Metadata:
 * - Epic: request-list-redesign — Redesign the request list as a batch listing
 * - Story: 1 — The app's new face, ink and the direction on record
 * - Route: / (root layout — affects every screen)
 * - Target File: web/src/app/layout.tsx
 * - Page Action: modify_existing
 * - Requirements: R23, R24, R25, R9, R28, BR9, BR10
 *
 * Coverage split (feature-planner tags — one tag, one test, one layer):
 * - AC-1 (every screen's text is in the new faces; the retired face appears nowhere),
 *   AC-2 (the served page opens its body with the direction statement, reference key and
 *   all), AC-3 (the six screens this epic does NOT redesign still open and read
 *   correctly on the changed shared layer) and AC-4 (light and dark are both still
 *   resolved before first paint, and a remembered choice still beats the computer's
 *   setting) → this file, one test each.
 * - AC-5 (both themes draw every surface from the shared palette, nothing loses its
 *   colour or its readability) → `none`: the styling gate plus the manual checklist.
 *   Deliberately not simulated here.
 * - No axe scan here. This epic's real-browser accessibility scans belong to the
 *   stories that build the redesigned listing and its controls; this story changes only
 *   the shared type/token layer, and contrast in both themes is AC-5's business
 *   (styling gate + manual check).
 *
 * Two of the four are REGRESSION criteria: AC-3 and AC-4 describe things that hold
 * today and must still hold once the shared layer changes underneath them (R28 is the
 * story's own named risk — changing the app's typeface changes every metric on every
 * screen). AC-3 is red today because it also requires each screen to be set in the NEW
 * text face, exactly as the criterion words it ("still ... read correctly on the new
 * face and colours"). AC-4 is a pure guard and may pass before the story is implemented
 * — that is what a guard is for, and it is not weakened to manufacture a red.
 *
 * ---------------------------------------------------------------------------
 * Mocking strategy — the backend is ALWAYS mocked, never live
 * (testing-policy.md § "Playwright runs against mocks, never live"), even though
 * project.md records both services as running locally. This story reaches every screen
 * in the app, so it crosses BOTH mock boundaries; earlier epics established each one and
 * this spec reuses them rather than adding a harness of its own:
 *
 * 1. Node boundary → the mocked auth service in `./support/auth-api-stub.ts`, started by
 *    `globalSetup` and wired in by `playwright.config.ts`. Every protected screen is
 *    gated SERVER-side (`(authenticated)/layout.tsx` → `requireSession()` →
 *    `GET /v1/auth/userinfo` from inside the Next.js process, epic
 *    `sign-in-and-app-shell` BR1/BR3), and `page.route()` cannot see a fetch the browser
 *    never makes. The stub answers that call from the shared identity source, keyed off
 *    the `session` cookie value seeded below.
 * 2. Browser boundary → `page.route()` (below), for every transactions-service read the
 *    walked screens make: the submitted files list, the named file settings the submit
 *    form reads, a file's processing history, the file's own bytes, its
 *    validation-errors overlay, and the expense requests. Mocking all of them is not
 *    optional even where nothing is asserted about them: `/transactions-api/...` is the
 *    app's OWN same-origin mount point, so an unmocked read is forwarded to the live
 *    transactions service by the app's route handler from inside the Next.js process,
 *    where `blockLiveBackends` cannot see it — and a failed read would put an error
 *    alert on a screen this story has to prove is intact.
 *
 * - Sign-in is faked with the mock `session` cookie the stub recognises for a role
 *   (`sessionTokenFor(role)`), seeded via `context.addCookies()` rather than by driving
 *   the sign-in form — epic `sign-in-and-app-shell` story 2's spec owns that journey,
 *   and the cookie is the app's sole conveyance of session (that epic's BR2). Cookies
 *   ignore port, so one seed serves the dev server (:3000) and the epic-end production
 *   run (:3100).
 * - Every response body comes from the project-wide factories under
 *   `web/src/mocks/data/`, imported relatively so Playwright resolves them without `@/`
 *   alias plumbing. No response shape is authored in this file, so this spec and the
 *   Vitest layer cannot drift on the contract.
 * - The walk is made as the Importer (the auth service's own role name), because that is
 *   the identity that sees the MOST on the six unredesigned screens: the submit form is
 *   theirs alone (hidden-never-disabled), and the rejected-rows notification is
 *   addressed to them. A screen that survives for the Importer survived with more on it,
 *   not less. Nothing in this story is role-dependent, so the Approver adds no coverage
 *   here — role gating on the redesigned listing is R27's, in a later story.
 *
 * Implementation patterns this spec assumes (read these before implementing):
 * - THE DIRECTION CONTRACT MUST BE IN THE MARKUP THE SERVER SENDS (R23/BR10), as an HTML
 *   comment at the top of `<body>` — ahead of every piece of the app's own content, with
 *   only Next.js's own streaming-metadata element in front of it (why it cannot be the
 *   literal first byte is set out on `contractOpeningServedBody` below). AC-2 reads the
 *   navigation response's own bytes, so a JSX comment (compiled away) fails, and so does
 *   anything that inserts the comment from the browser after the document has arrived. At
 *   the epic-end run (`E2E_PROD=1`, a real production build) that same assertion IS the
 *   grep-the-built-output check BR10 asks for.
 * - BOTH FACES ARE LOADED AND SELF-HOSTED THROUGH `next/font` IN THE ROOT LAYOUT, wired
 *   to the existing `--font-sans` / `--font-mono` tokens in `globals.css` (R24). AC-1
 *   reads what the browser actually resolved and actually loaded — the families behind
 *   rendered text, the families the document declares, whether the figure face really
 *   downloads from this app — never a class name or a variable's spelling, so a face
 *   that is declared but never reaches the page fails. No component may name a face;
 *   nothing here asserts one does.
 * - WHICH ELEMENTS take the figure face (figures, references, masked account numbers,
 *   control totals, labels) is settled by the stories that build the listing, and is
 *   asserted where those elements are built. This story's own claim about that face is
 *   that it is loaded, self-hosted and available app-wide — which is what AC-1 reads
 *   below.
 * - THE LIGHT/DARK DECISION STAYS AN INLINE, HEAD-EMBEDDED SCRIPT in the served document
 *   (project.md's `[IMPLEMENTATION TRAP]`). AC-4 aborts every `.js` request, so an
 *   inline script still runs while a hydrated effect — or an external `<script src>` —
 *   never runs at all. Adding the direction contract as the first thing in `<body>` must
 *   not displace or delay that decision.
 * - The resolved version is expressed as the `dark` class on `<html>` (the contract
 *   `globals.css` already declares with `@custom-variant dark (&:is(.dark *))`), and
 *   `body` keeps painting the themed ground (`bg-background`), so AC-4 can read the
 *   colour a reader would actually see.
 * - Cookie assumptions: the mock `session` cookie carries production-like attributes
 *   (HttpOnly, SameSite=Strict). `Secure` is omitted because the E2E server is plain
 *   http on localhost; the real cookie's full attribute set is asserted in the Vitest
 *   layer (epic `sign-in-and-app-shell`, story 1).
 *
 * playwright.config.ts's webServer block boots the FRONTEND only; every backend response
 * below is mocked, so no live backend is contacted and no real credential is needed.
 * AC-1, AC-2 and AC-3 WILL FAIL until the story is implemented (TDD red) — the app is
 * still set in the retired face, and the served `<body>` still opens with the app's own
 * markup rather than with the direction contract.
 * ---------------------------------------------------------------------------
 */
import { expect, test } from '@playwright/test';

import { sessionTokenFor } from './support/auth-api-stub';
import { fileLogListResponse } from '../src/mocks/data/file-log';
import { fileProcessLogListResponse } from '../src/mocks/data/file-process-log';
import { fileSettingListResponse } from '../src/mocks/data/file-setting';
import { userInfoFor } from '../src/mocks/data/identity';
import { ROLE_IMPORTER } from '../src/mocks/data/role';
import {
  SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
  previewWithRejectedRows,
} from '../src/mocks/data/submitted-file';
import {
  createTransaction,
  transactionListResponse,
} from '../src/mocks/data/transaction';

import type { BrowserContext, Locator, Page, Route } from '@playwright/test';

/* -------------------------------------------------------------------------- */
/* The faces, and the one that is retired                                      */
/* -------------------------------------------------------------------------- */

/**
 * The two confirmed faces (R24, design brief §3 Typography) and the face this story
 * retires. Matched on the family NAME rather than exactly, because `next/font` self-hosts
 * each face under a hashed family (`__Public_Sans_a1b2c3`, plus a metric-matched
 * `_Fallback_` twin): the hash is the loader's business, the name is the decision.
 */
const TEXT_FACE = /public[-_ ]?sans/i;
const FIGURE_FACE = /azeret[-_ ]?mono/i;
const RETIRED_FACE = /cabin/i;

/** Either of the two faces the app is allowed to set text in. */
const EITHER_NEW_FACE = new RegExp(
  `(${TEXT_FACE.source})|(${FIGURE_FACE.source})`,
  'i',
);

/* -------------------------------------------------------------------------- */
/* The direction contract (R23 / BR10)                                         */
/* -------------------------------------------------------------------------- */

/**
 * The five blocks the contract carries. Requirement text from the confirmed design brief
 * (§7, "The direction contract") and from AC-2 — which is why these are literal strings
 * rather than data from a factory.
 */
const CONTRACT_BLOCKS = [
  'THESIS',
  'OWN-WORLD',
  'STORY',
  'FIRST VIEWPORT',
  'FORM',
] as const;

/**
 * The design's own reference key. BR10 fails if what ships no longer carries it: a
 * contract nobody can find is a contract nobody can audit.
 */
const REFERENCE_KEY = '29469d17';

/**
 * The closing line, verbatim from the design brief. Compared against the contract with
 * whitespace normalised, so wrapping the comment across lines (it will be) is allowed
 * while rewording it is not.
 */
const FINISH_LINE =
  'FINISH: unreviewed and undocumented is unfinished; this build ends with the ' +
  'finish review, the verdict, DESIGN.md, and every shipping raster carrying its ' +
  'provenance';

/* -------------------------------------------------------------------------- */
/* The data every walked screen is assembled from                              */
/* -------------------------------------------------------------------------- */

/**
 * ONE file, described once: its `FileLog`, its own CSV bytes and the validation-errors
 * body describing the two lines the service rejected. The canonical epic fixture, so the
 * submitted-files list, the import preview and the rejected rows walked below cannot
 * describe three different files.
 */
const PREVIEW = previewWithRejectedRows();

/*
 * Fixture integrity — AC-3 only means anything if this file really has one line of each
 * kind, since the import preview and the rejected rows are addressed below by a line only
 * that section can hold.
 */
if (PREVIEW.willImportRows.length === 0 || PREVIEW.rejectedRows.length === 0) {
  throw new Error(
    'previewWithRejectedRows() no longer has both a will-import line and a rejected ' +
      'line, so the import preview and the rejected rows could not be told apart on the ' +
      "file's page.",
  );
}

/** A line the service did NOT reject — content the import preview alone holds. */
const WILL_IMPORT_REFERENCE = PREVIEW.willImportRows[0].Reference;

/** A line it DID reject — content the rejected-rows section holds. */
const REJECTED_REFERENCE = PREVIEW.rejectedRows[0].Reference;

/** The one expense request the mocked service returns for the request list. */
const LISTED_REQUEST = createTransaction();

/** The addresses walked below. */
const SIGN_IN_PATH = '/sign-in';
const LANDING_PATH = '/';
const UPLOAD_PATH = '/upload';
const REQUESTS_PATH = '/requests';
const FILE_PATH = `/upload/file?LogId=${String(PREVIEW.file.Id)}`;

/** Reads answered by path rather than by glob, so one cannot swallow another. */
const FILE_DOWNLOAD_PATH = '/v1/files/download';
const VALIDATION_ERRORS_PATH = '/v1/files/validation-errors';
const VALIDATION_ERRORS_COLUMNS_PATH = '/v1/files/validation-errors/columns';

/**
 * The real services' own origins (project.md §Data Source & Backend Integration).
 * Blocked outright so a browser-side call can never reach a live backend.
 */
const LIVE_BACKEND_ORIGINS = [
  'http://localhost:4424/**',
  'http://localhost:4423/**',
];

/** Matches the `dark` class as a whole word in the `<html>` class list. */
const DARK_CLASS = /(^|\s)dark(\s|$)/;

/** How a not-found page and the permission message read — neither is a working screen. */
const NOT_FOUND_WORDING =
  /(not be found|not found|does ?n[o']?t exist|no such)/i;
const PERMISSION_MESSAGE_HEADING = /access needed/i;

/* -------------------------------------------------------------------------- */
/* Mocks                                                                       */
/* -------------------------------------------------------------------------- */

const jsonResponse = (
  body: unknown,
): { status: number; contentType: string; body: string } => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/**
 * Blocks the live services (see LIVE_BACKEND_ORIGINS). Registered LAST, because
 * Playwright matches the most recently registered route first: a call sent to a service's
 * own origin is then aborted and fails visibly, instead of being quietly answered by the
 * origin-agnostic mocks above it.
 */
const blockLiveBackends = async (page: Page): Promise<void> => {
  for (const origin of LIVE_BACKEND_ORIGINS) {
    await page.route(origin, (route) => route.abort());
  }
};

/**
 * Puts the browser in a signed-in state as the named role, without a real credential: the
 * mock `session` cookie the Node-side auth stub maps back to this role when the
 * server-side gate asks it who the session belongs to.
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

/**
 * Answers a BROWSER-side identity read from the shared userinfo source, so it can never
 * disagree with what the Node-side stub returns for the same session.
 */
const mockBrowserIdentityCall = async (
  page: Page,
  roleName: string,
): Promise<void> => {
  await page.route('**/v1/auth/userinfo', (route) =>
    route.fulfill(jsonResponse(userInfoFor(roleName))),
  );
};

/** The `FileLogId` this request asked about, or `null` if it sent none. */
const fileAskedAboutBy = (route: Route): string | null =>
  new URL(route.request().url()).searchParams.get('FileLogId');

/**
 * Every browser-side read the walked screens make, answered from the shared factories:
 * the submitted files list, the named file settings the submit form reads, one file's
 * processing history, that file's own bytes (streamed the way the service streams them,
 * so the real binary path in `lib/api/client.ts` is the one exercised), its
 * validation-errors overlay, and the expense requests.
 *
 * The optional validation-error COLUMNS call is aborted, exactly as the import-preview
 * epic's spec does: the preview does not depend on it, and leaving it unmocked would let
 * it reach the live service through the app's own route handler.
 */
const mockEveryScreensReads = async (page: Page): Promise<void> => {
  await page.route('**/transactions-api/v1/file-logs**', (route) =>
    route.fulfill(jsonResponse(fileLogListResponse([PREVIEW.file]))),
  );
  await page.route('**/transactions-api/v1/file-settings**', (route) =>
    route.fulfill(jsonResponse(fileSettingListResponse())),
  );
  await page.route('**/transactions-api/v1/file-process-logs/**', (route) =>
    route.fulfill(jsonResponse(fileProcessLogListResponse())),
  );
  await page.route('**/transactions-api/v1/transactions**', (route) =>
    route.fulfill(jsonResponse(transactionListResponse([LISTED_REQUEST]))),
  );
  await page.route(
    (url) => url.pathname.endsWith(FILE_DOWNLOAD_PATH),
    (route: Route) =>
      fileAskedAboutBy(route) === String(PREVIEW.file.Id)
        ? route.fulfill({
            status: 200,
            contentType: SUBMITTED_FILE_DOWNLOAD_MEDIA_TYPE,
            headers: {
              'content-disposition': `attachment; filename="${PREVIEW.file.CurrentFileName}"`,
            },
            body: PREVIEW.csv,
          })
        : route.abort(),
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
  await page.route(
    (url) => url.pathname.endsWith(VALIDATION_ERRORS_COLUMNS_PATH),
    (route) => route.abort(),
  );
  await blockLiveBackends(page);
};

/* -------------------------------------------------------------------------- */
/* Locators                                                                    */
/* -------------------------------------------------------------------------- */

/** The screen's own content — never the whole body. */
const screenOf = (page: Page): Locator => page.getByRole('main');

/**
 * The submitted file's row in the files list, found by the file's own name and required
 * to carry the status the service reported for it — never by position. One locator, both
 * halves: a row that lost either is not this locator.
 */
const submittedFileRow = (page: Page): Locator =>
  screenOf(page)
    .getByRole('row')
    .filter({ hasText: PREVIEW.file.CurrentFileName })
    .filter({ hasText: PREVIEW.file.CurrentStatus });

/**
 * A preview row for a line the service did not reject, scoped to the preview section —
 * the rejected-rows section on the same page lists the rejected lines over again by
 * design, so the scoping is what keeps the two apart.
 */
const previewRow = (page: Page): Locator =>
  page
    .getByRole('region', { name: /import preview/i })
    .getByRole('row')
    .filter({ hasText: WILL_IMPORT_REFERENCE });

/** A rejected row, scoped to the rejected-rows section for the same reason. */
const rejectedRow = (page: Page): Locator =>
  page
    .getByRole('region', { name: /rejected rows/i })
    .getByRole('row')
    .filter({ hasText: REJECTED_REFERENCE });

/** The row for the mocked expense request, found by its `Reference`. */
const listedRequestRow = (page: Page): Locator =>
  screenOf(page).getByRole('row').filter({ hasText: LISTED_REQUEST.Reference });

/* -------------------------------------------------------------------------- */
/* The screens                                                                 */
/* -------------------------------------------------------------------------- */

interface AppScreen {
  /** How the criterion names this screen. */
  readonly name: string;
  readonly path: string;
  /** Whether reaching it needs a session. */
  readonly needsSession: boolean;
  /** What proves the screen has finished arriving — awaited before anything is read. */
  readonly settled: (page: Page) => Locator;
  /** What a reader must still be able to read on it (AC-3). */
  readonly reads: (page: Page) => readonly Locator[];
}

/**
 * THE SIX SCREENS THIS EPIC DOES NOT REDESIGN (R28 / AC-3), in the order the criterion
 * lists them. Two pairs share an address — the submit form and the submitted-files list
 * are both on `/upload`, the import preview and the rejected rows are both on a file's
 * own page — and they are kept as separate entries anyway, because they are separate
 * screens to a reader and each has its own content to lose.
 */
const UNREDESIGNED_SCREENS: readonly AppScreen[] = [
  {
    name: 'the sign-in screen',
    path: SIGN_IN_PATH,
    needsSession: false,
    settled: (page) => page.getByRole('button', { name: /sign in/i }),
    reads: (page) => [
      page.getByRole('heading', { name: /sign in/i }),
      page.getByLabel(/username/i),
      page.getByLabel(/password/i),
      page.getByRole('button', { name: /sign in/i }),
    ],
  },
  {
    name: 'the landing screen',
    path: LANDING_PATH,
    needsSession: true,
    settled: (page) =>
      screenOf(page).getByRole('heading', { name: /employee expenses/i }),
    reads: (page) => [
      screenOf(page).getByRole('heading', { name: /employee expenses/i }),
      // The role-aware entry points: what this person can actually do, each offered as
      // a real navigational link and located by WHERE IT GOES rather than by its label.
      screenOf(page).locator(`a[href="${UPLOAD_PATH}"]`),
      screenOf(page).locator(`a[href="${REQUESTS_PATH}"]`),
    ],
  },
  {
    name: 'upload',
    path: UPLOAD_PATH,
    needsSession: true,
    // The submit form is the Importer's alone (hidden-never-disabled), which is one
    // reason this walk is made as the Importer.
    settled: (page) =>
      page.getByRole('region', { name: /submit an expense file/i }),
    reads: (page) => [
      page.getByRole('region', { name: /submit an expense file/i }),
      // The setting picker and the file chooser, addressed the way epic
      // `expense-file-upload` story 2's spec addresses them.
      screenOf(page).getByRole('combobox'),
      screenOf(page).locator('input[type="file"]'),
      screenOf(page).getByRole('button', { name: /upload file/i }),
    ],
  },
  {
    name: 'the submitted-files list',
    path: UPLOAD_PATH,
    needsSession: true,
    settled: submittedFileRow,
    reads: (page) => [submittedFileRow(page)],
  },
  {
    name: "a file's import preview",
    path: FILE_PATH,
    needsSession: true,
    settled: previewRow,
    reads: (page) => [
      page.getByRole('region', { name: /import preview/i }),
      previewRow(page),
    ],
  },
  {
    name: 'its rejected rows',
    path: FILE_PATH,
    needsSession: true,
    settled: rejectedRow,
    reads: (page) => [
      page.getByRole('region', { name: /rejected rows/i }),
      rejectedRow(page),
    ],
  },
];

/**
 * The screen this epic DOES redesign. Not one of AC-3's six, but part of AC-1's "every
 * screen" — and the screen where a face that failed to arrive would show most, since the
 * whole redesign is built on its figures.
 */
const REQUEST_LIST_SCREEN: AppScreen = {
  name: 'the expense request list',
  path: REQUESTS_PATH,
  needsSession: true,
  settled: listedRequestRow,
  reads: (page) => [listedRequestRow(page)],
};

const EVERY_SCREEN: readonly AppScreen[] = [
  ...UNREDESIGNED_SCREENS,
  REQUEST_LIST_SCREEN,
];

/* -------------------------------------------------------------------------- */
/* Reading what the browser actually resolved and actually loaded              */
/* -------------------------------------------------------------------------- */

interface FaceReading {
  /** Every distinct family behind text actually rendered on this screen. */
  readonly textFaces: readonly string[];
  /** The families the document declares as loadable faces. */
  readonly declaredFaces: readonly string[];
  /**
   * The figure face the document declares, and whether its files really download from
   * this app. `null` when the document declares no such face at all.
   */
  readonly figureFace: string | null;
  readonly figureFaceDownloads: boolean;
  /** Any `@font-face` source pointing off this origin — i.e. NOT self-hosted (R24). */
  readonly offOriginFaceSources: readonly string[];
  /**
   * A snippet of the app's own CSS naming the retired face, or `null` when none does.
   * Where a retired face survives longest is a token nobody deleted.
   */
  readonly retiredFaceInStyleSheets: string | null;
}

/**
 * What the browser resolved for this screen, and what it can really load.
 *
 * Read from computed style and from the document's own font set rather than from class
 * names on purpose: a class, or a variable's spelling, proves nothing about what a reader
 * sees — and "the old face appears nowhere" is a claim about the whole document, not
 * about one element.
 */
const faceReadingOf = (page: Page): Promise<FaceReading> =>
  page.evaluate(
    async (patterns: { figure: string; retired: string }) => {
      const figurePattern = new RegExp(patterns.figure, 'i');
      const retiredPattern = new RegExp(patterns.retired, 'i');

      // Every family behind text a reader can actually see: elements holding their own
      // non-empty text, not containers that merely wrap some.
      const textFaces = new Set<string>();
      document.querySelectorAll('body *').forEach((element) => {
        // Next's own development overlay is not part of the app and is not set in the
        // app's faces. It normally hides inside a shadow root (so it never reaches this
        // walk at all) and is absent from the production build the epic-end run serves —
        // this skip only keeps an ad-hoc dev run honest.
        if (
          element.closest(
            'nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog]',
          )
        ) {
          return;
        }
        const holdsOwnText = Array.from(element.childNodes).some(
          (node) =>
            node.nodeType === Node.TEXT_NODE &&
            (node.textContent ?? '').trim() !== '',
        );
        if (!holdsOwnText) return;
        textFaces.add(window.getComputedStyle(element).fontFamily);
      });

      const declaredFaces: string[] = [];
      document.fonts.forEach((face) => {
        declaredFaces.push(face.family);
      });

      // The real face, not the metric-matched stand-in `next/font` declares beside it:
      // asking the browser to load that one would prove nothing about the face itself.
      const figureFace =
        declaredFaces.find(
          (family) => figurePattern.test(family) && !/fallback/i.test(family),
        ) ?? null;

      let figureFaceDownloads = false;
      if (figureFace !== null) {
        try {
          const loaded = await document.fonts.load(`1rem "${figureFace}"`);
          figureFaceDownloads = loaded.length > 0;
        } catch {
          figureFaceDownloads = false;
        }
      }

      const offOriginFaceSources: string[] = [];
      let retiredFaceInStyleSheets: string | null = null;
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRule[];
        try {
          rules = Array.from(sheet.cssRules);
        } catch {
          // A stylesheet this document may not read cannot be one of the app's own.
          continue;
        }
        for (const rule of rules) {
          if (rule.cssText.includes('@font-face')) {
            for (const declaration of rule.cssText
              .split(/\bsrc\s*:/)
              .slice(1)) {
              const sources = declaration.split(';')[0].match(/url\([^)]*\)/g);
              for (const source of sources ?? []) {
                if (/^url\(\s*['"]?(?:https?:)?\/\//i.test(source)) {
                  offOriginFaceSources.push(source);
                }
              }
            }
          }
          const retired = retiredPattern.exec(rule.cssText);
          if (retired && retiredFaceInStyleSheets === null) {
            retiredFaceInStyleSheets = rule.cssText.slice(
              Math.max(0, retired.index - 80),
              retired.index + 80,
            );
          }
        }
      }

      return {
        textFaces: Array.from(textFaces),
        declaredFaces,
        figureFace,
        figureFaceDownloads,
        offOriginFaceSources,
        retiredFaceInStyleSheets,
      };
    },
    { figure: FIGURE_FACE.source, retired: RETIRED_FACE.source },
  );

/**
 * How much wider than the window the page is. A typeface swap changes every metric on
 * every screen — line lengths, wrapping, button widths, column widths — and the first
 * thing that gives way is the page's own width (R4/UI-23: no horizontal scrolling of the
 * page). One pixel of slack, for sub-pixel layout rounding.
 */
const horizontalOverflowOf = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

/**
 * The light/dark version a reader can actually SEE, from the relative luminance of the
 * ground the page paints — not from a class or a token name, so it stays true whatever
 * the brand values are.
 */
const paintedSchemeOf = (page: Page): Promise<'light' | 'dark'> =>
  page.evaluate(() => {
    const painted = window.getComputedStyle(document.body).backgroundColor;
    if (!painted.startsWith('rgb')) {
      throw new Error(
        `The page's ground read as "${painted}", which is not an rgb() value — light ` +
          'cannot be told from dark without one. The token layer states its colours as ' +
          'hex (globals.css), which computes to rgb().',
      );
    }
    const parts = painted.match(/[\d.]+/g);
    if (!parts || parts.length < 3) {
      throw new Error(`Unreadable ground colour "${painted}".`);
    }
    const channel = (value: string): number => {
      const srgb = Number(value) / 255;
      return srgb <= 0.03928
        ? srgb / 12.92
        : Math.pow((srgb + 0.055) / 1.055, 2.4);
    };
    const luminance =
      0.2126 * channel(parts[0]) +
      0.7152 * channel(parts[1]) +
      0.0722 * channel(parts[2]);
    return luminance < 0.5 ? 'dark' : 'light';
  });

/* -------------------------------------------------------------------------- */
/* Reading the markup the server actually sent                                 */
/* -------------------------------------------------------------------------- */

/** The served markup from the moment `<body>` opens. */
const insideServedBody = (html: string, path: string): string => {
  const openTag = /<body\b[^>]*>/i.exec(html);
  if (!openTag) {
    throw new Error(
      `The page served at ${path} has no <body> element, so nothing can be first inside it.`,
    );
  }
  return html.slice(openTag.index + openTag[0].length);
};

/**
 * React's own boundary and text-separator comments — `$`, `/$`, `$?`, `F!`, `head`,
 * `body`, a single space. Punctuation and single words, never prose: a direction
 * statement cannot be mistaken for one, and one of these cannot stand in for it.
 */
const FRAMEWORK_MARKER = /^[\s$/&!?A-Za-z]{0,8}$/;

/**
 * The direction statement the app writes at the top of the served `<body>`, or a failure
 * naming what was found there instead. Read from the response's own bytes, because that
 * is where R23/BR10 require the contract to be: in what the app ships, auditable after
 * the build — which is exactly what the epic-end production run (`E2E_PROD=1`) makes
 * this assertion.
 *
 * It is read as "the first comment the APP itself wrote inside `<body>`, ahead of every
 * piece of the app's own content" rather than as "the first byte after `<body>`, and
 * that is a framework limit rather than a loosening. Next.js streams its own
 * metadata element as the first thing inside `<body>` on every page, ahead of anything
 * the root layout renders. The one position ahead of THAT is raw markup on the `<body>`
 * element itself, and React forbids children beside `dangerouslySetInnerHTML` — so the
 * app's whole content would have to be rendered outside `<body>`, and React then
 * re-applies that markup on the next client re-render (`router.refresh()`, which this
 * app runs on sign-in, sign-out and session timeout), emptying every rendered screen out
 * of the document. Verified by experiment during story 1. So what is asserted is what
 * R23 is FOR: the statement is in the shipped bytes, inside `<body>`, before the app's
 * own markup, carrying the design's reference key — auditable by anyone reading or
 * grepping what shipped.
 */
const contractOpeningServedBody = (html: string, path: string): string => {
  const inside = insideServedBody(html, path);
  const appContentAt = inside.search(/<main\b/i);
  if (appContentAt === -1) {
    throw new Error(
      `The page served at ${path} carries no <main>, so where the app's own content ` +
        'begins — and therefore whether the direction statement stands ahead of it — ' +
        'could not be read.',
    );
  }
  const aheadOfTheAppsOwnContent = inside.slice(0, appContentAt);
  const written = [...aheadOfTheAppsOwnContent.matchAll(/<!--([\s\S]*?)-->/g)]
    .map(([, body]) => body)
    .filter((body) => !FRAMEWORK_MARKER.test(body));
  if (written.length === 0) {
    throw new Error(
      `Nothing inside <body> ahead of the app's own content in the markup served at ` +
        `${path} is an HTML comment the app wrote, so the direction statement (R23) is ` +
        `not on record in what ships. Found instead: ${aheadOfTheAppsOwnContent
          .trim()
          .slice(0, 200)}`,
    );
  }
  return written[0];
};

/** One line, spaces collapsed — wrapping the comment is allowed, rewording it is not. */
const asOneLine = (text: string): string => text.replace(/\s+/gu, ' ').trim();

/** The markup the app served for an address. */
const servedMarkupOf = async (page: Page, path: string): Promise<string> => {
  const arrival = await page.goto(path);
  if (!arrival) {
    throw new Error(`Navigating to ${path} produced no response to read.`);
  }
  return arrival.text();
};

/**
 * Opens a screen as the Importer where a session is needed, with every read it makes
 * already answered from the shared fixtures.
 */
const openScreen = async (
  page: Page,
  context: BrowserContext,
  screen: AppScreen,
): Promise<void> => {
  if (screen.needsSession) {
    await seedSession(context, ROLE_IMPORTER);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);
  }
  await page.goto(screen.path);
  // Read a settled screen, never a half-rendered one: a face is resolved per element,
  // so a reading taken mid-render would describe a page nobody saw.
  await expect(
    screen.settled(page).first(),
    `${screen.name} never finished arriving`,
  ).toBeVisible();
};

/* -------------------------------------------------------------------------- */

test.describe("Epic request-list-redesign, Story 1: the app's new face, ink and the direction on record", () => {
  test.beforeEach(async ({ context }) => {
    // Every test starts signed out, with no remembered theme choice, and seeds only what
    // it needs.
    await context.clearCookies();
  });

  // AC-1
  // One walk of the whole app, because the criterion is about the whole app: every
  // screen's text in the two new faces, both faces genuinely declared to the document,
  // the figure face really downloading from this app rather than from a third party —
  // and the retired face nowhere: not behind a piece of text, not among the declared
  // faces, and not left behind as a token in the app's own CSS.
  test('every screen sets its text in the new faces, and the retired face appears nowhere', async ({
    page,
    context,
  }) => {
    await mockEveryScreensReads(page);

    for (const screen of EVERY_SCREEN) {
      await openScreen(page, context, screen);

      const reading = await faceReadingOf(page);

      expect(
        reading.textFaces.length,
        `${screen.name} rendered no text at all, so nothing about its face could be read`,
      ).toBeGreaterThan(0);

      for (const face of reading.textFaces) {
        expect(
          face,
          `text on ${screen.name} is set in "${face}" — every piece of text must be set ` +
            'in the institutional text face (words) or the typewriter-style face ' +
            '(figures, references, masked account numbers, labels), and in nothing else',
        ).toMatch(EITHER_NEW_FACE);
      }

      expect(
        reading.declaredFaces.some((face) => TEXT_FACE.test(face)),
        `${screen.name} declares no text face matching ${String(TEXT_FACE)} — the ` +
          `document declares: ${reading.declaredFaces.join(', ')}`,
      ).toBe(true);
      expect(
        reading.figureFace,
        `${screen.name} declares no figure face matching ${String(FIGURE_FACE)} — the ` +
          `document declares: ${reading.declaredFaces.join(', ')}`,
      ).not.toBeNull();
      expect(
        reading.figureFaceDownloads,
        `the figure face "${String(reading.figureFace)}" is declared on ${screen.name} ` +
          'but its files do not load, so no figure could ever be set in it',
      ).toBe(true);
      expect(
        reading.offOriginFaceSources,
        `${screen.name} loads a face from somewhere other than this app, so a screen ` +
          'waits on a third party to render its text (R24: self-hosted through next/font)',
      ).toEqual([]);

      // The retired face, in each of the three places it could survive.
      expect(
        reading.textFaces.filter((face) => RETIRED_FACE.test(face)),
        `${screen.name} still sets text in the retired face`,
      ).toEqual([]);
      expect(
        reading.declaredFaces.filter((face) => RETIRED_FACE.test(face)),
        `${screen.name} still loads the retired face`,
      ).toEqual([]);
      expect(
        reading.retiredFaceInStyleSheets,
        "the app's own CSS still names the retired face, so it is not retired at all",
      ).toBeNull();
    }
  });

  // AC-2
  // Read from the RESPONSE BYTES rather than from the live document: R23/BR10 are about
  // what the app ships and what can be audited afterwards, and the epic-end run serves a
  // real production build — so this test is that grep. Checked on a public screen and on
  // a signed-in one, because the contract belongs to the ROOT layout: a copy tucked into
  // one page would pass on one address and fail on the other.
  test('the page the app serves opens its body with the direction statement, reference key and all', async ({
    page,
    context,
  }) => {
    await mockEveryScreensReads(page);

    for (const path of [SIGN_IN_PATH, LANDING_PATH]) {
      if (path !== SIGN_IN_PATH) {
        await seedSession(context, ROLE_IMPORTER);
        await mockBrowserIdentityCall(page, ROLE_IMPORTER);
      }

      const contract = asOneLine(
        contractOpeningServedBody(await servedMarkupOf(page, path), path),
      );

      for (const block of CONTRACT_BLOCKS) {
        expect(
          contract,
          `the direction statement served at ${path} is missing its ${block} block`,
        ).toContain(block);
      }

      expect(
        contract,
        `the direction statement served at ${path} does not name the design's own ` +
          'reference key, so what shipped cannot be tied back to the direction that was ' +
          'agreed',
      ).toContain(REFERENCE_KEY);

      expect(
        contract,
        `the direction statement served at ${path} does not close with the FINISH line, ` +
          'word for word',
      ).toContain(FINISH_LINE);
    }
  });

  // AC-3
  // The epic's biggest regression risk, walked screen by screen (R28): six screens are
  // not being redesigned, but every one of them rides the type and token layer this
  // story replaces. Each must still ARRIVE (not the permission message, not a not-found
  // page), still be READABLE (its own content on screen), still be set in the NEW text
  // face — which is what the criterion means by "on the new face and colours" — and
  // still fit the window it is drawn in, since a typeface swap changes every metric that
  // decides that.
  test('the six screens this epic does not redesign all still open and read correctly on the new face', async ({
    page,
    context,
  }) => {
    await mockEveryScreensReads(page);

    for (const screen of UNREDESIGNED_SCREENS) {
      await openScreen(page, context, screen);

      // It arrived — and not with either of the two answers that mean it did not. Both
      // are checked because this story touches the layer every screen is reached through.
      await expect(
        page.getByRole('heading', { name: PERMISSION_MESSAGE_HEADING }),
        `${screen.name} answered with the permission message`,
      ).toHaveCount(0);
      await expect(
        screenOf(page),
        `${screen.name} answered with a not-found page`,
      ).not.toContainText(NOT_FOUND_WORDING);

      // It reads: everything a person came to this screen for is still on it.
      for (const readable of screen.reads(page)) {
        await expect(
          readable.first(),
          `${screen.name} lost part of what a reader needs on it`,
        ).toBeVisible();
      }

      // It is set in the new face — this screen is not restyled, but it IS re-set.
      const reading = await faceReadingOf(page);
      for (const face of reading.textFaces) {
        expect(
          face,
          `${screen.name} still sets text in "${face}" rather than in the app's new faces`,
        ).toMatch(EITHER_NEW_FACE);
      }

      // ...and it still fits: no sideways scrolling of the page at the new metrics.
      expect(
        await horizontalOverflowOf(page),
        `${screen.name} is wider than the window on the new face, so the page scrolls ` +
          'sideways (R4/UI-23)',
      ).toBeLessThanOrEqual(1);
    }
  });

  // AC-4
  // A guard on the layer this story rewrites: the light/dark decision is made in the very
  // root layout that now loads two faces and opens its body with the direction statement.
  // One journey through both halves of the criterion — the computer's setting followed,
  // then a choice of the reader's own beating it — with each before-paint claim read from
  // a document whose JavaScript never ran.
  test('light and dark are both still decided before the screen paints, and a remembered choice still beats the computer setting', async ({
    page,
    context,
  }) => {
    await mockEveryScreensReads(page);
    await seedSession(context, ROLE_IMPORTER);
    await mockBrowserIdentityCall(page, ROLE_IMPORTER);

    // The computer says dark, and the reader has chosen nothing yet.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(LANDING_PATH);
    await expect
      .poll(() => paintedSchemeOf(page), {
        message:
          'a reader who has chosen nothing gets the version their computer is set to',
      })
      .toBe('dark');

    // They choose the other version for themselves, with the switch in the header.
    await page.getByRole('button', { name: /theme/i }).click();
    await expect
      .poll(() => paintedSchemeOf(page), {
        message: 'the switch puts the other version on screen immediately',
      })
      .toBe('light');

    // From here on nothing the browser would have to FETCH is allowed to run. An inline,
    // head-embedded decision is part of the document and still runs; a hydrated effect —
    // or an external script — never runs at all, so a version settled a frame late fails
    // here instead of quietly looking right.
    await page.route(
      (url) => url.pathname.endsWith('.js'),
      (route) => route.abort(),
    );

    // A later visit in the same browser: the computer still says dark, and the reader's
    // own choice is already in place in the document that arrives.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.locator('html'),
      "a remembered light choice must beat the computer's dark setting before the " +
        'page paints, so no flash of the wrong version is possible',
    ).not.toHaveClass(DARK_CLASS);

    // ...and with that choice forgotten again, the computer's own setting is resolved
    // before the paint just the same — the other half of the criterion, on the other
    // version.
    await page.evaluate(() => {
      window.localStorage.clear();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.locator('html'),
      'with no choice of their own, a reader whose computer is set to dark must get dark ' +
        'in the served document, before the page paints',
    ).toHaveClass(DARK_CLASS);
  });
});
