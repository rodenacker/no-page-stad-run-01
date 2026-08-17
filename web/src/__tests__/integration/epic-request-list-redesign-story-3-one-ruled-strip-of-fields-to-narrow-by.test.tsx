/**
 * Story Metadata:
 * - Epic: request-list-redesign — Story 3: one ruled strip of fields to narrow by
 * - Route: /requests
 * - Target File: web/src/components/requests/RequestNarrowingControls.tsx
 * - Page Action: modify_existing
 * - Requirements: R12, BR6, R6, R7, R27, BR2
 *
 * Covers the criteria tagged `vitest`:
 * - AC-1 — every one of the six narrowing fields is still there, each labelled and
 *   usable, presented as ONE strip.
 * - AC-3 — Clear all still drops the whole narrowing in one action and brings the
 *   full batch back.
 * - AC-4 — a range typed the wrong way round is still reported next to the fields
 *   and still NOT applied: the list stays exactly as it was.
 * - AC-5 — export still hands over exactly what the current narrowing leaves, with
 *   account numbers whole in the file and the file attributed to whoever produced it.
 * - AC-6 — an Importer sees no decision controls, no bulk approval and no
 *   possible-duplicate notification ANYWHERE; an Approver sees all of them.
 *
 * AC-2 (each field and each combination still cuts the list down the same way) is
 * this story's Playwright spec — deliberately not duplicated here (testing-policy.md
 * § "One tag, one layer").
 *
 * ---------------------------------------------------------------------------
 * THIS IS A PRESENTATION-ONLY REDESIGN — EVERY BEHAVIOUR HERE ALREADY SHIPPED
 * ---------------------------------------------------------------------------
 * Nothing in this file is a new capability. Every assertion below re-states a
 * behaviour that `expense-request-list` (R7/R10/R18/R20/R21), `expense-decisions`
 * (R14), `bulk-approval-and-live-refresh` (R7) and `csv-export` (R1–R4) already
 * built, and that this epic's R1/BR2 require to survive the redesign untouched. So
 * these tests are a REGRESSION FENCE around the restyle, and per BR1 none of them
 * may be loosened to accommodate new markup: DOM structure, class names and
 * composition are free to change, an assertion of user-observable behaviour is not.
 * Where a sibling suite already pins one of these behaviours
 * (`epic-expense-request-list-story-2/3`, `epic-bulk-approval-…-story-1`,
 * `epic-csv-export-story-1/2`), the assertions here are deliberately at least as
 * strong as those.
 *
 * ---------------------------------------------------------------------------
 * IMPLEMENTATION CONTRACT these tests pin (read this before implementing)
 * ---------------------------------------------------------------------------
 * 1. THE SIX FIELDS SURVIVE, WITH THEIR LABELS (BR6). status, originating file,
 *    transaction type, amount range (two bounds), transaction date range (two
 *    bounds) and free-text search — eight controls in all, each still reachable by
 *    its own visible label, each still operable. The labels these tests query are
 *    the wording the app already owns (`lib/transactions/narrowing.ts` field names
 *    and the controls' own bound labels), matched case-insensitively so the
 *    design's capitalised micro-labels may be produced by a token/utility class
 *    (`text-transform`) rather than by rewriting the words in the markup.
 * 2. THE STRIP IS ONE GROUP IN THE ACCESSIBILITY TREE. "Reads as one ruled strip"
 *    is a visual claim jsdom cannot judge, so what is pinned here is its only
 *    non-CSS half: the eight controls live inside exactly ONE grouping element
 *    (`<fieldset>` or `role="group"`) whose accessible name says what it does — it
 *    must contain the word "narrow" (e.g. a `<legend>` reading "Narrow the batch").
 *    Nothing here asserts a border, a rule weight, a colour or a font: the
 *    underline-only notation, its `--input`-or-darker rule (WCAG 1.4.11) and the
 *    absence of boxes are the Playwright axe scan's and the manual checklist's.
 * 3. CLEAR ALL STAYS ONE ACTION (`expense-request-list` R18). One control named
 *    "Clear all", which empties every one of the six narrowings at once — including
 *    all four range bounds — and restores the whole fetched batch. It stays the
 *    only reset on the screen; do not add a per-field clear that could disagree
 *    with it.
 * 4. AN INVALID RANGE IS REPORTED IN PLACE AND NEVER APPLIED
 *    (`expense-request-list` R7/R10/R18, restated by this story's BR6). When a
 *    range's upper bound is below its lower one:
 *      - the screen says so in an announceable `role="alert"` sitting WITH the
 *        strip, whose wording contains "wrong way round" and names which range it
 *        is ("amount" / "date"). NOT a toast, and not a message that replaces the
 *        list;
 *      - that whole range stops narrowing — not just the offending bound — so the
 *        list is exactly the set the reader was looking at before either bound was
 *        typed;
 *      - the values the user typed stay in their fields: the screen reports, it
 *        never swaps, clamps or blanks a bound;
 *      - every OTHER narrowing keeps working while one range is invalid;
 *      - the report is withdrawn as soon as the range is emptied or corrected.
 *    Underline-only inputs remove the border that currently carries the error
 *    state, so the error needs a new home in the notation — but the in-place
 *    announceable message below is the part that may not move.
 * 5. EXPORT IS BEHAVIOURALLY UNTOUCHED (R6, `csv-export` R1–R4). The exported set
 *    is the ORDERED, NARROWED set — not the fetched set, and NOT the page on
 *    screen. AC-5's fixture below makes both bugs visible at once: 23 requests
 *    fetched, 22 left by the narrowing, 20 on the page, so a fetched-set export is
 *    out by one and a page-shaped export is out by two. Account numbers are WHOLE
 *    in the file (the documented POPIA exception) while the screen still shows only
 *    their last four digits, and the completion confirmation still names the person
 *    who produced it — the attribution half of that exception, which is compliance
 *    evidence and not polish.
 * 6. HIDDEN, NEVER DISABLED (R7/R27, `expense-decisions` R14,
 *    `bulk-approval-and-live-refresh` R7). An Importer must not find a decision
 *    control, a selection control, the bulk-approve action or the possible-duplicate
 *    NOTIFICATION anywhere on the screen. AC-6's negative queries pass
 *    `{ hidden: true }`, so a control that is present-but-`aria-hidden`,
 *    present-but-`display:none` or present-but-disabled fails exactly as a working
 *    one would. Note the one thing an Importer DOES still see: the possible-duplicate
 *    MARK on the row (`expense-request-list` story 6 AC-3/AC-4 — the mark is for
 *    everyone, the notification is the Approver's). Do not "fix" AC-6 by removing
 *    the mark.
 * 7. This story restyles the CONTROLS. It does not touch
 *    `web/src/lib/transactions/narrowing.ts`, and it adds no endpoint: everything
 *    below is worked out in the browser over the one `GET /v1/transactions` body the
 *    list already holds.
 *
 * Mocked here, and why: only `@/lib/api/client` — the fixed convention
 * (testing-policy.md § Mocking strategy) — plus `next/link` and `next/navigation`,
 * libraries at the client-navigation boundary with no App Router context in jsdom.
 * `URL.createObjectURL` / `revokeObjectURL` are SUPPLIED rather than mocked: jsdom
 * implements neither, so a browser API that simply does not exist here stands in.
 * The real narrowing, ordering, paging, duplicate detection, CSV writer, `deliverFile`
 * and toast composition all run for real.
 *
 * Every response body and every identity comes from the project-wide factories in
 * `@/mocks/data/transaction`, `@/mocks/data/identity` and `@/mocks/data/user`, which
 * the Playwright layer shares — so the two layers cannot drift onto different data.
 *
 * Runtime-only, deliberately NOT here: the underline notation itself, the absence of
 * boxes, the rule weight/colour that carries the error state, and the 3:1 contrast of
 * an underline that is now the only thing marking a field. jsdom cannot see any of
 * them — they belong to this epic's axe scan and the manual checklist.
 *
 * These tests WILL FAIL until the story is implemented (TDD red): the narrowing
 * controls are not yet presented as one named group (contract note 2).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Production code under test: the shared request list and the strip of narrowing
// controls this story rebuilds inside it.
import { ExpenseRequestList } from '@/components/requests/ExpenseRequestList';

// Real production toast composition (not mocked) — the same one the root layout
// wraps every signed-in screen in, and the only surface a notification may use.
import { ToastContainer } from '@/components/toast/ToastContainer';
import { ToastProvider } from '@/contexts/ToastContext';
import { get } from '@/lib/api/client';
// How the server page writes the signed-in person's name, so the name this test
// expects in the export attribution is the one the page will actually pass.
import { displayNameOf } from '@/lib/auth/identity';

// Project-wide fixtures — the single source both test layers share. Never a
// hand-written response body, never a hand-written identity.
import { userInfoFor } from '@/mocks/data/identity';
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  duplicatePair,
  manyTransactions,
  transactionListResponse,
  transactionsForNarrowing,
} from '@/mocks/data/transaction';
import { fullNameOf } from '@/mocks/data/user';
import { ROLE_APPROVER, ROLE_IMPORTER } from '@/types/auth';

import type { UserEvent } from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

import type { ProjectRole } from '@/types/auth';
import type { TransactionRead } from '@/types/transactions';

vi.mock('@/lib/api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

/**
 * `next/link` stubbed with the plain anchor it renders in the browser, so anything
 * the screen links to keeps its `link` role and its `href` without an App Router
 * context. A library, never the code under test.
 */
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/** The other half of that boundary. Inert: nothing here asserts navigation. */
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/requests',
  useSearchParams: () => new URLSearchParams(),
}));

const mockGet = get as unknown as ReturnType<typeof vi.fn>;

/* -------------------------------------------------------------------------- */
/* The strip and its six fields (contract notes 1 and 2)                       */
/* -------------------------------------------------------------------------- */

/**
 * The one grouping the eight controls sit inside. Its accessible name has to say
 * what it does — the design's own words for this screen are "narrow by".
 */
const STRIP_NAME = /narrow/i;

/**
 * The six narrowings, by the label each of their controls must still carry. The
 * two ranges have two ends each, so six fields are eight controls. Matched
 * case-insensitively on purpose: the design's capitalised micro-labels are a
 * presentation of these words, not different words (contract note 1).
 */
const FIELD = {
  search: /search/i,
  status: /status/i,
  file: /originating file/i,
  transactionType: /transaction type/i,
  minimumAmount: /minimum.*amount/i,
  maximumAmount: /maximum.*amount/i,
  earliestDate: /earliest.*date/i,
  latestDate: /latest.*date/i,
} as const;

/** The three pick-one filters, which must still open a list of choices. */
const PICK_ONE_FIELDS = [
  FIELD.status,
  FIELD.file,
  FIELD.transactionType,
] as const;

/** The four range bounds, which must still be typeable. */
const BOUND_FIELDS = [
  FIELD.minimumAmount,
  FIELD.maximumAmount,
  FIELD.earliestDate,
  FIELD.latestDate,
] as const;

/** Every control the strip must offer, in reading order. */
const EVERY_FIELD = [
  FIELD.search,
  ...PICK_ONE_FIELDS,
  ...BOUND_FIELDS,
] as const;

/** The summary of what is applied, and the one way out of all of it. */
const APPLIED_SUMMARY_NAME = /applied/i;
const CLEAR_ALL_NAME = /clear all/i;

/** A permitted per-filter reset choice ("All statuses"), not a value from the data. */
const RESET_CHOICE = /^(all|any)\b/i;

/**
 * The same reset wording as a trigger reads it back, unanchored: the redesign is free
 * to render the field's micro-label inside the control alongside the chosen value, so
 * what matters is that the reset wording is THERE, not that it starts the string.
 */
const RESET_WORDING = /\b(all|any)\b/i;

/** The wording an invalid range must still be reported in (contract note 4). */
const WRONG_WAY_ROUND = /wrong way round/i;

/** Room for the search debounce without an explicit wait. */
const SETTLED = { timeout: 3000 };

/* -------------------------------------------------------------------------- */
/* Role-gated capabilities (contract note 6)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Anything offering to approve or to reject — the per-request decision and the bulk
 * action alike. Anchored at the start of the accessible name, so the "Approved"
 * status a row prints can never be mistaken for an offer to approve it.
 */
const APPROVE_ACTION = /^approve\b/i;
const REJECT_ACTION = /^reject\b/i;

/** The bulk action's own name, which is about the SELECTION, not one request. */
const BULK_APPROVE_ACTION = /^approve selected\b/i;

/** The "take everything currently listed" control. */
const SELECT_EVERYTHING = /^select all\b/i;

/** How one request's own selection control names itself. */
const selectionControlFor = (reference: string): RegExp =>
  new RegExp(`^select\\b.*${reference}`, 'i');

/** How one request's own decision controls name themselves. */
const approveControlFor = (reference: string): RegExp =>
  new RegExp(`^approve\\b.*${reference}`, 'i');
const rejectControlFor = (reference: string): RegExp =>
  new RegExp(`^reject\\b.*${reference}`, 'i');

/** The control every listed request keeps, whoever is reading. */
const openControlFor = (reference: string): RegExp =>
  new RegExp(`^open\\b.*${reference}`, 'i');

/** Every role a capability could be offered under. */
const CONTROL_ROLES = [
  'button',
  'checkbox',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
] as const;

/**
 * Every control anywhere on the screen whose accessible name matches — INCLUDING
 * the ones the accessibility tree hides and the ones that are disabled, which is
 * the whole point: R7/R27 is about absence, and "greyed out" or "aria-hidden" is
 * not absence (contract note 6).
 */
const everyControlNamed = (name: RegExp): HTMLElement[] =>
  CONTROL_ROLES.flatMap((role) =>
    screen.queryAllByRole(role, { name, hidden: true }),
  );

/** What a failed negative assertion should print: the offending control, named. */
const described = (element: HTMLElement): string =>
  `<${element.tagName.toLowerCase()}> "${(element.textContent ?? '').trim()}"` +
  ` (accessible name: "${element.getAttribute('aria-label') ?? ''}")`;

/** The wording a possible-duplicate mark and its notification both carry. */
const POSSIBLE_DUPLICATE = /possible duplicate/i;

/**
 * The app's in-app notification surface (the root layout's `ToastContainer`), which
 * renders nothing at all while there is nothing to tell the reader — so its absence
 * IS "nobody was notified".
 */
const notificationSurface = (): HTMLElement | null =>
  screen.queryByRole('region', { name: /notifications/i });

/* -------------------------------------------------------------------------- */
/* The exported file (contract note 5)                                         */
/* -------------------------------------------------------------------------- */

/** The export control, wherever the strip's notation puts it. */
const exportControl = (): HTMLElement =>
  screen.getByRole('button', { name: /export/i });

/**
 * Every file the app has asked the browser to save, in the order it asked.
 *
 * `deliverFile` turns the bytes into a blob address and activates a hidden
 * `a[download]`, so the Blob handed to `URL.createObjectURL` IS the file the user
 * receives. jsdom implements neither `createObjectURL` nor `revokeObjectURL`, so
 * these are stands-in for browser APIs this environment lacks rather than stubs of
 * anything this story owns.
 */
const deliveredFiles: Blob[] = [];

URL.createObjectURL = ((contents: Blob): string => {
  deliveredFiles.push(contents);
  return `blob:exported-file-${String(deliveredFiles.length)}`;
}) as typeof URL.createObjectURL;

URL.revokeObjectURL = ((): void => {}) as typeof URL.revokeObjectURL;

/**
 * jsdom has no downloads and would try to NAVIGATE to the blob address, which it
 * also does not implement. The user's browser saves the file here; the test's job
 * is only to read what it was handed.
 */
const swallowDownloadNavigation = (event: Event): void => {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('a[download]') !== null) {
    event.preventDefault();
  }
};

/** The bytes of a delivered file, as text. jsdom's `Blob` has no `text()`. */
const bytesOf = (contents: Blob): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(String(reader.result));
    });
    reader.addEventListener('error', () => {
      reject(new Error('The exported file could not be read back as text.'));
    });
    reader.readAsText(contents);
  });

/**
 * A CSV file read back the way a receiving system reads it (RFC 4180): fields
 * separated by commas, records by a line break, and a quoted field carrying commas,
 * line breaks and doubled quotes of its own as ONE value. A leading byte-order mark
 * is dropped — it is a mark about the encoding, not data in the first column.
 */
const parseCsv = (file: string): string[][] => {
  const text = file.startsWith('﻿') ? file.slice(1) : file;
  const records: string[][] = [];
  let fields: string[] = [];
  let value = '';
  let inQuotes = false;
  let index = 0;

  const endField = (): void => {
    fields.push(value);
    value = '';
  };
  const endRecord = (): void => {
    endField();
    records.push(fields);
    fields = [];
  };

  while (index < text.length) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 2;
        continue;
      }
      if (character === '"') {
        inQuotes = false;
        index += 1;
        continue;
      }
      value += character;
      index += 1;
      continue;
    }

    if (character === '"' && value === '') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (character === ',') {
      endField();
      index += 1;
      continue;
    }
    if (character === '\r' && text[index + 1] === '\n') {
      endRecord();
      index += 2;
      continue;
    }
    if (character === '\n' || character === '\r') {
      endRecord();
      index += 1;
      continue;
    }
    value += character;
    index += 1;
  }

  if (value !== '' || fields.length > 0) {
    endRecord();
  }
  return records;
};

/** One exported record, readable by column name. */
type ExportedRecord = Record<string, string>;

/** The one file the export handed the browser, read back by column name. */
const readExportedFile = async (): Promise<ExportedRecord[]> => {
  await waitFor(
    () => {
      expect(deliveredFiles).toHaveLength(1);
    },
    { timeout: 10000 },
  );
  const [header, ...dataRows] = parseCsv(await bytesOf(deliveredFiles[0]));
  return dataRows.map((row) =>
    Object.fromEntries(header.map((name, column) => [name, row[column]])),
  );
};

/* -------------------------------------------------------------------------- */
/* Rendering and reading the screen                                            */
/* -------------------------------------------------------------------------- */

/**
 * The screen as the root layout always mounts it: the list inside the app's one
 * toast composition, with the signed-in person's name arriving as a prop from the
 * server page (`csv-export` story 2's arrangement, unchanged by this epic).
 */
const listAs = (roles: ProjectRole[], exportedBy?: string) => (
  <ToastProvider>
    <ExpenseRequestList roles={roles} exportedBy={exportedBy} />
    <ToastContainer />
  </ToastProvider>
);

/** The list's table — the arrangement jsdom's default viewport renders. */
const requestsTable = (): HTMLElement => screen.getByRole('table');

/**
 * The narrowing strip, with a contract reminder when it is not there. Queried by
 * `group` rather than by a class, because the accessibility tree is the only place
 * "these fields are one thing" is observable outside a browser (contract note 2).
 */
const narrowingStrip = (): HTMLElement => {
  const groups = screen.queryAllByRole('group', { name: STRIP_NAME });
  if (groups.length !== 1) {
    throw new Error(
      `Expected exactly ONE grouping element naming what it narrows (a <fieldset> ` +
        `with a <legend>, or role="group" with an accessible name containing ` +
        `"narrow"), found ${String(groups.length)}. The redesign presents the six ` +
        `narrowing fields as one ruled strip, and its only non-CSS half is that the ` +
        `fields are one named group in the accessibility tree — see contract note 2.`,
    );
  }
  return groups[0];
};

/**
 * One narrowing field, reached THROUGH the strip.
 *
 * Every test in this file drives the fields this way rather than through
 * `screen.getByLabelText` on its own, and that is deliberate: this story's subject is
 * the redesigned strip, so each criterion has to be exercised on the surface the story
 * builds. It also keeps the six fields from drifting out of the strip one at a time —
 * a field that still works but has escaped the strip is not "one ruled strip of fields
 * to narrow by".
 */
const fieldControl = (field: RegExp): HTMLElement =>
  within(narrowingStrip()).getByLabelText(field);

/** The summary of what is applied, or `null` when nothing is applied. */
const appliedSummary = (): HTMLElement | null =>
  screen.queryByRole('region', { name: APPLIED_SUMMARY_NAME });

/** The summary, which must be on screen. */
const shownAppliedSummary = (): HTMLElement =>
  screen.getByRole('region', { name: APPLIED_SUMMARY_NAME });

/** Opens a pick-one filter and hands back its open list of choices. */
const openFilter = async (
  user: UserEvent,
  field: RegExp,
): Promise<HTMLElement> => {
  await user.click(fieldControl(field));
  return screen.getByRole('listbox');
};

/** Closes an open list of choices from the keyboard. */
const closeOpenFilter = async (user: UserEvent): Promise<void> => {
  await user.keyboard('{Escape}');
  await waitFor(() => {
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
};

/** Chooses a filter value the way a reader does: open, then pick. */
const chooseFilterValue = async (
  user: UserEvent,
  field: RegExp,
  name: string | RegExp,
): Promise<void> => {
  const listbox = await openFilter(user, field);
  await user.click(within(listbox).getByRole('option', { name }));
  await waitFor(() => {
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
};

/** Types a value into a range bound, replacing whatever it held. */
const typeBound = async (
  user: UserEvent,
  field: RegExp,
  value: string,
): Promise<void> => {
  const input = fieldControl(field);
  await user.clear(input);
  await user.type(input, value);
};

/** Empties a range bound. */
const clearBound = async (user: UserEvent, field: RegExp): Promise<void> => {
  await user.clear(fieldControl(field));
};

/** An element's visible text, with runs of whitespace collapsed as the DOM shows it. */
const textOf = (element: HTMLElement): string =>
  (element.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * The screen's own in-place report that a range is the wrong way round, as an
 * announceable alert naming which range it is. Says what it DID find when there is
 * no such report, so a red phase names the missing behaviour.
 */
const wrongWayRoundReport = async (
  namingItsRange: RegExp,
): Promise<HTMLElement> =>
  await waitFor(() => {
    const alerts = screen.getAllByRole('alert');
    const report = alerts.find(
      (alert) =>
        WRONG_WAY_ROUND.test(textOf(alert)) &&
        namingItsRange.test(textOf(alert)),
    );
    if (report === undefined) {
      throw new Error(
        `No alert reporting a range as "wrong way round" and naming ` +
          `${String(namingItsRange)}. An upper bound below the lower bound must be ` +
          `reported IN PLACE, beside the fields, and the range must not be applied ` +
          `(contract note 4). Alerts found: ` +
          `${alerts.map((alert) => `"${textOf(alert)}"`).join(', ') || 'none'}.`,
      );
    }
    return report;
  });

/** Whether any wrong-way-round report is on screen at all. */
const wrongWayRoundReports = (): HTMLElement[] =>
  screen
    .queryAllByRole('alert')
    .filter((alert) => WRONG_WAY_ROUND.test(textOf(alert)));

/**
 * The references of a fetched set currently rendered in the table, read in fixture
 * order so no assertion depends on the order the service returned or the sort in
 * force, and scoped to the table so a phone-width arrangement of the same requests
 * could not be counted twice.
 */
const listedReferences = (fetched: TransactionRead[]): string[] =>
  fetched
    .filter(
      (request) =>
        within(requestsTable()).queryAllByText(request.Reference).length > 0,
    )
    .map((request) => request.Reference);

/**
 * Waits until EXACTLY the given requests are listed — nothing missing, nothing
 * extra. Pinned to the fixture, so neither an empty render nor an unnarrowed one
 * can pass.
 */
const expectExactlyListed = async (
  fetched: TransactionRead[],
  expected: TransactionRead[],
): Promise<void> => {
  const wanted = expected.map((request) => request.Reference).sort();
  await waitFor(() => {
    expect(listedReferences(fetched).sort()).toEqual(wanted);
  }, SETTLED);
};

/**
 * The table row for a request, found by the reference it carries rather than by
 * position, and required to be unique.
 */
const rowFor = (reference: string): HTMLElement => {
  const rows = within(requestsTable())
    .getAllByRole('row')
    .filter((row) => row.textContent?.includes(reference));
  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly one table row carrying "${reference}", found ` +
        `${String(rows.length)} — the list renders one row per request, each ` +
        'identified by its Reference.',
    );
  }
  return rows[0];
};

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** The narrowing spread: three statuses, three originating files, three types. */
const NARROWING_SET: TransactionRead[] = transactionsForNarrowing();

const distinct = (values: string[]): string[] => [...new Set(values)];

/**
 * How many VALUE choices each pick-one filter must still offer — one per distinct
 * value present in the fetched batch, derived from the fixture rather than restated,
 * so the count cannot drift from the data it describes. (Which values, under which
 * wording, is `expense-request-list` story 2 AC-6's; what is checked here is that the
 * field survived the restyle as a working pick-one filter rather than as an inert
 * underline.)
 */
const PICK_ONE_VALUE_COUNTS = [
  {
    field: FIELD.status,
    values: distinct(NARROWING_SET.map((request) => request.Status)).length,
  },
  {
    field: FIELD.file,
    values: distinct(NARROWING_SET.map((request) => request.FileName)).length,
  },
  {
    field: FIELD.transactionType,
    values: distinct(NARROWING_SET.map((request) => request.TransactionType))
      .length,
  },
] as const;

/** A fixture request by its reference, so no assertion selects a row by index. */
const requestReferenced = (
  fetched: TransactionRead[],
  reference: string,
): TransactionRead => {
  const found = fetched.find((request) => request.Reference === reference);
  if (found === undefined) {
    throw new Error(
      `No request referenced "${reference}" in the fixture — the shared factory ` +
        `(src/mocks/data/transaction.ts) has moved underneath this test. Re-anchor ` +
        `the fixtures rather than weakening the assertions.`,
    );
  }
  return found;
};

/**
 * The one request in the narrowing spread that satisfies all six narrowings AC-3
 * applies at once: approved, from the April 30th file, of the type the app calls
 * "…money in", describing an EFT, priced inside 100–9000 and dated inside April.
 */
const EFT_REQUEST = requestReferenced(NARROWING_SET, 'TXN-20260430-0016');
/** Its own description is the search term, matching nothing else in the spread. */
const SEARCH_TERM = 'EFT';
/** The app's wording for the credit code (never the bare code a reader would not know). */
const CREDIT_WORDING = /money in/i;

/** The request AC-4 narrows to while a range is reported the wrong way round. */
const NETFLIX_REQUEST = requestReferenced(NARROWING_SET, 'TXN-20260430-0012');
const NETFLIX_TERM = 'Netflix';

/** R12's default page size, as the requirement's own literal. */
const DEFAULT_PAGE_SIZE = 20;

/**
 * AC-5's fetched set: more requests than one page holds, so the exported file can
 * be told apart from BOTH the page on screen and the whole fetched set.
 */
const EXPORT_SET: TransactionRead[] = manyTransactions(23);
/** A minimum that leaves every request but the cheapest one (see preconditions). */
const EXPORT_MINIMUM_AMOUNT = '101';

/** The people these tests read the screen as, from the one project-wide source. */
const IMPORTER = userInfoFor(ROLE_IMPORTER);
const APPROVER = userInfoFor(ROLE_APPROVER);
const IMPORTER_NAME = fullNameOf(IMPORTER);
const APPROVER_NAME = fullNameOf(APPROVER);

describe('Epic request-list-redesign, Story 3: one ruled strip of fields to narrow by', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deliveredFiles.length = 0;
    document.addEventListener('click', swallowDownloadNavigation);
  });

  afterEach(() => {
    document.removeEventListener('click', swallowDownloadNavigation);
    vi.useRealTimers();
  });

  // AC-1
  // Runtime-only, deliberately not asserted: the underline-only notation, the
  // absence of boxes, the rule weight/colour and the 3:1 contrast an underline now
  // has to clear on its own (WCAG 1.4.11). jsdom sees no CSS — those belong to this
  // epic's axe scan and the manual checklist. What is pinned here is the half that
  // survives the restyle or does not: every field still there, still labelled, still
  // usable, and presented as ONE thing (contract notes 1 and 2).
  it('still offers all six narrowing fields as one named strip, each reachable by its own label and each still usable', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue(transactionListResponse(NARROWING_SET));

    render(listAs([ROLE_APPROVER]));

    await expectExactlyListed(NARROWING_SET, NARROWING_SET);

    // One strip, not eight scattered controls: the eight controls of the six
    // narrowings all live inside the single named group.
    const strip = narrowingStrip();

    for (const field of EVERY_FIELD) {
      const control = within(strip).getByLabelText(field);
      // Still there, and still usable — not a decorative reading of a value.
      expect(control).toBeVisible();
      expect(control).toBeEnabled();
      // The label is on the STRIP as readable text, not only in the accessibility
      // tree: the design's micro-labels are visible wording. Matched
      // case-insensitively, so capitalisation may come from a token/utility class.
      expect(strip).toHaveTextContent(field);
    }

    // Nothing was left behind outside the strip either: each label names exactly one
    // control on the whole screen, so there is no second, stray copy of a field.
    for (const field of EVERY_FIELD) {
      expect(screen.getAllByLabelText(field)).toHaveLength(1);
    }

    // The three pick-one filters still offer the values the fetched batch holds —
    // each one opens a list carrying exactly one reset choice and one choice per
    // distinct value in the data, so a filter that survived as an inert underline
    // fails here.
    for (const { field, values } of PICK_ONE_VALUE_COUNTS) {
      const listbox = await openFilter(user, field);
      const choices = within(listbox)
        .getAllByRole('option')
        .map((option) => textOf(option))
        .filter((label) => label.length > 0);
      expect(choices.filter((label) => RESET_CHOICE.test(label))).toHaveLength(
        1,
      );
      expect(choices.filter((label) => !RESET_CHOICE.test(label))).toHaveLength(
        values,
      );
      await closeOpenFilter(user);
    }

    // The four range bounds are still TYPEABLE fields — not a calendar popover on
    // its own, which neither a keyboard user nor a browser test can fill.
    await typeBound(user, FIELD.minimumAmount, '100');
    await typeBound(user, FIELD.maximumAmount, '9000');
    await typeBound(user, FIELD.earliestDate, '2026-04-01');
    await typeBound(user, FIELD.latestDate, '2026-04-30');

    expect(fieldControl(FIELD.minimumAmount)).toHaveDisplayValue('100');
    expect(fieldControl(FIELD.maximumAmount)).toHaveDisplayValue('9000');
    expect(fieldControl(FIELD.earliestDate)).toHaveDisplayValue('2026-04-01');
    expect(fieldControl(FIELD.latestDate)).toHaveDisplayValue('2026-04-30');

    // And the free-text field still holds what is typed into it.
    await user.type(fieldControl(FIELD.search), SEARCH_TERM);
    expect(fieldControl(FIELD.search)).toHaveDisplayValue(SEARCH_TERM);
  });

  // AC-3
  it('drops every one of the six narrowings in one Clear all and brings the whole batch back', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue(transactionListResponse(NARROWING_SET));

    render(listAs([ROLE_APPROVER]));

    // The whole batch, before anything is applied.
    await expectExactlyListed(NARROWING_SET, NARROWING_SET);
    expect(appliedSummary()).not.toBeInTheDocument();

    // --- all six narrowings applied at once -------------------------------
    await user.type(fieldControl(FIELD.search), SEARCH_TERM);
    await chooseFilterValue(user, FIELD.status, TRANSACTION_STATUS_APPROVED);
    await chooseFilterValue(user, FIELD.file, EFT_REQUEST.FileName);
    await chooseFilterValue(user, FIELD.transactionType, CREDIT_WORDING);
    await typeBound(user, FIELD.minimumAmount, '100');
    await typeBound(user, FIELD.maximumAmount, '9000');
    await typeBound(user, FIELD.earliestDate, '2026-04-01');
    await typeBound(user, FIELD.latestDate, '2026-04-30');

    // They really are all applied: exactly the one request that satisfies all six is
    // listed, and the summary carries one item per narrowing.
    await expectExactlyListed(NARROWING_SET, [EFT_REQUEST]);
    await waitFor(() => {
      expect(
        within(shownAppliedSummary()).getAllByRole('listitem'),
      ).toHaveLength(6);
    }, SETTLED);

    // --- one action drops all of it ---------------------------------------
    await user.click(screen.getByRole('button', { name: CLEAR_ALL_NAME }));

    // The whole batch is back — every request the service sent, not just the ones
    // the last narrowing happened to leave.
    await expectExactlyListed(NARROWING_SET, NARROWING_SET);

    // Every field is empty again, so a second narrowing starts from nothing rather
    // than from a value still sitting in a control that stopped applying.
    expect(fieldControl(FIELD.search)).toHaveDisplayValue('');
    for (const bound of BOUND_FIELDS) {
      expect(fieldControl(bound)).toHaveDisplayValue('');
    }
    // Each pick-one filter shows its reset wording again and no longer reads back
    // the value it was narrowed to.
    expect(fieldControl(FIELD.status)).not.toHaveTextContent(
      TRANSACTION_STATUS_APPROVED,
    );
    expect(fieldControl(FIELD.file)).not.toHaveTextContent(
      EFT_REQUEST.FileName,
    );
    expect(fieldControl(FIELD.transactionType)).not.toHaveTextContent(
      CREDIT_WORDING,
    );
    for (const field of PICK_ONE_FIELDS) {
      expect(textOf(fieldControl(field))).toMatch(RESET_WORDING);
    }

    // And with nothing applied there is nothing to summarise: the summary is gone
    // rather than sitting there empty.
    expect(appliedSummary()).not.toBeInTheDocument();
  });

  // AC-4
  it('reports a range typed the wrong way round beside the fields without applying it, leaving the list exactly as it was while every other narrowing keeps working', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue(transactionListResponse(NARROWING_SET));

    render(listAs([ROLE_APPROVER]));

    // The set the reader is looking at before touching a bound.
    await expectExactlyListed(NARROWING_SET, NARROWING_SET);

    // --- an amount range the wrong way round ------------------------------
    // A minimum of 200 with a maximum of 100 can match nothing at all, so an
    // implementation that applied it would empty the list — the unexplained-empty
    // failure mode this behaviour exists to prevent.
    await typeBound(user, FIELD.minimumAmount, '200');
    await typeBound(user, FIELD.maximumAmount, '100');

    const amountReport = await wrongWayRoundReport(/amount/i);
    expect(amountReport).toHaveTextContent(WRONG_WAY_ROUND);
    // Reported IN PLACE, with the fields — not in the notification surface, and not
    // instead of the list.
    expect(narrowingStrip()).toBeInTheDocument();
    expect(notificationSurface()).not.toBeInTheDocument();

    // Not applied — neither bound. The list is exactly the set the reader was
    // looking at before either was typed.
    await expectExactlyListed(NARROWING_SET, NARROWING_SET);
    expect(requestsTable()).toBeInTheDocument();

    // The bounds the reader typed are still theirs: reported, never swapped,
    // clamped or blanked.
    expect(fieldControl(FIELD.minimumAmount)).toHaveDisplayValue('200');
    expect(fieldControl(FIELD.maximumAmount)).toHaveDisplayValue('100');

    // The range never counted as active narrowing, so it contributes nothing to the
    // summary of what is applied.
    expect(appliedSummary()).not.toBeInTheDocument();

    // --- and the rest of the strip keeps working meanwhile -----------------
    await user.type(fieldControl(FIELD.search), NETFLIX_TERM);

    await expectExactlyListed(NARROWING_SET, [NETFLIX_REQUEST]);
    // The report is still standing — one report, for the one range that is the wrong
    // way round: the invalid range is still not applied, and the search narrowed on
    // its own.
    expect(wrongWayRoundReports()).toHaveLength(1);

    await user.clear(fieldControl(FIELD.search));
    await expectExactlyListed(NARROWING_SET, NARROWING_SET);

    // --- emptying the range withdraws the report --------------------------
    await clearBound(user, FIELD.minimumAmount);
    await clearBound(user, FIELD.maximumAmount);

    await waitFor(() => {
      expect(wrongWayRoundReports()).toEqual([]);
    }, SETTLED);
    await expectExactlyListed(NARROWING_SET, NARROWING_SET);

    // --- the same holds for the transaction date range --------------------
    await typeBound(user, FIELD.earliestDate, '2026-04-30');
    await typeBound(user, FIELD.latestDate, '2026-04-01');

    const dateReport = await wrongWayRoundReport(/date/i);
    expect(dateReport).toHaveTextContent(WRONG_WAY_ROUND);

    await expectExactlyListed(NARROWING_SET, NARROWING_SET);
    expect(fieldControl(FIELD.earliestDate)).toHaveDisplayValue('2026-04-30');
    expect(fieldControl(FIELD.latestDate)).toHaveDisplayValue('2026-04-01');
    expect(requestsTable()).toBeInTheDocument();
    expect(appliedSummary()).not.toBeInTheDocument();

    // Corrected rather than emptied, the report goes and the range applies — so the
    // report is about the range being the wrong way round, not about it existing.
    await typeBound(user, FIELD.latestDate, '2026-05-31');

    await waitFor(() => {
      expect(wrongWayRoundReports()).toEqual([]);
    }, SETTLED);
    await expectExactlyListed(
      NARROWING_SET,
      NARROWING_SET.filter((request) =>
        request.TransactionDate.startsWith('2026-04-30'),
      ),
    );
  });

  // AC-5
  // Data-contract: that the real service sends these values in this shape is
  // confirmed against the running backend on the manual checklist. What is pinned
  // here is what the file the reader receives is built FROM (contract note 5).
  it('exports exactly what the narrowing leaves — not the page and not the whole batch — with account numbers whole in the file and the file attributed to whoever produced it', async () => {
    // Only `Date` is faked, so every real timer the list, the CSV writer and the
    // toasts use still runs; what is frozen is the moment the attribution reads.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 3, 30, 14, 35, 0));
    const user = userEvent.setup();

    const stillListed = EXPORT_SET.filter(
      (request) => request.Amount >= Number(EXPORT_MINIMUM_AMOUNT),
    );
    const narrowedOut = EXPORT_SET.filter(
      (request) => request.Amount < Number(EXPORT_MINIMUM_AMOUNT),
    );

    // Fixture preconditions — these are what make the assertion below distinguish
    // all three candidate sets from each other, rather than passing by luck:
    // 23 fetched, 22 left by the narrowing, 20 on the page. So a fetched-set export
    // is out by one record and a page-shaped export is out by two.
    expect(EXPORT_SET).toHaveLength(23);
    expect(stillListed).toHaveLength(22);
    expect(narrowedOut).toHaveLength(1);
    expect(DEFAULT_PAGE_SIZE).toBe(20);
    // The name asserted below is exactly what the server page will pass in, and the
    // two roles' names are told apart — so "attributed to the exporter" cannot pass
    // on a coincidence.
    expect(displayNameOf(APPROVER)).toBe(APPROVER_NAME);
    expect(IMPORTER_NAME).not.toBe(APPROVER_NAME);

    mockGet.mockResolvedValue(transactionListResponse(EXPORT_SET));

    render(listAs([ROLE_APPROVER], APPROVER_NAME));

    // The whole batch is fetched, and the page shows the first 20 of it — the trap
    // this criterion is set to catch.
    await waitFor(() => {
      expect(within(requestsTable()).getAllByRole('row')).toHaveLength(
        DEFAULT_PAGE_SIZE + 1,
      );
    }, SETTLED);

    // Narrow it, through the strip.
    await typeBound(user, FIELD.minimumAmount, EXPORT_MINIMUM_AMOUNT);

    // Still 20 rows on screen, and the narrowed-out request is no longer listed —
    // so "what the narrowing leaves" is neither what is visible nor what was
    // fetched.
    await waitFor(() => {
      expect(
        within(requestsTable()).queryAllByText(narrowedOut[0].Reference),
      ).toEqual([]);
    }, SETTLED);

    await user.click(exportControl());

    const exported = await readExportedFile();

    // Exactly the narrowed set: 22 records, one per request the narrowing left,
    // none of them twice, and the one it removed nowhere in the file.
    const exportedReferences = exported.map((record) => record.Reference);
    expect(exportedReferences).toHaveLength(stillListed.length);
    expect(new Set(exportedReferences)).toEqual(
      new Set(stillListed.map((request) => request.Reference)),
    );
    expect(exportedReferences).not.toContain(narrowedOut[0].Reference);

    // Account numbers are WHOLE in the file — the documented POPIA exception — for
    // every record, against the fixture's own values.
    stillListed.forEach((request) => {
      const record = exported.find(
        (candidate) => candidate.Reference === request.Reference,
      );
      expect(record?.['Account number']).toBe(request.AccountNumber);
    });

    // ...while the screen the file was produced from still shows only the last four
    // digits: the exception is the FILE's, not the list's.
    stillListed.forEach((request) => {
      expect(
        within(requestsTable()).queryAllByText(request.AccountNumber),
      ).toEqual([]);
    });

    // And the file is attributed to whoever produced it — the other half of that
    // exception, announced rather than merely drawn.
    const confirmation = within(
      await screen.findByRole('region', { name: /notifications/i }),
    ).getByRole('status');
    expect(confirmation).toHaveTextContent(
      new RegExp(`\\b${String(stillListed.length)}\\b`),
    );
    expect(confirmation).toHaveTextContent(APPROVER_NAME);
    expect(confirmation).not.toHaveTextContent(IMPORTER_NAME);
    // ...at the moment it was produced, in the app's own date-time shape.
    expect(confirmation).toHaveTextContent('2026-04-30');
    expect(confirmation).toHaveTextContent('14:35');
  }, 40000);

  // AC-6
  it('offers an Importer no decision control, no selection, no bulk approval and no possible-duplicate notification anywhere — while an Approver is offered all of them', async () => {
    const user = userEvent.setup();
    // A genuine duplicate pair, so the Approver-only notification has something to
    // fire about, among requests that collide with nothing.
    const [firstDuplicate, secondDuplicate] = duplicatePair();
    const requests = [firstDuplicate, ...NARROWING_SET, secondDuplicate];

    // Fixture preconditions: both halves of the pair are still awaiting a decision,
    // so the decision controls are genuinely on offer to the Approver, and the whole
    // batch fits on one page so nothing below depends on paging.
    expect(firstDuplicate.Status).toBe(TRANSACTION_STATUS_IMPORTED);
    expect(secondDuplicate.Status).toBe(TRANSACTION_STATUS_IMPORTED);
    expect(requests).toHaveLength(10);

    mockGet.mockResolvedValue(transactionListResponse(requests));

    // --- the Approver, who is the contrast the negatives are read against ---
    const approverView = render(listAs([ROLE_APPROVER], APPROVER_NAME));

    await expectExactlyListed(requests, requests);

    // The decisions, on the request's own row.
    expect(
      within(rowFor(firstDuplicate.Reference)).getByRole('button', {
        name: approveControlFor(firstDuplicate.Reference),
      }),
    ).toBeInTheDocument();
    expect(
      within(rowFor(firstDuplicate.Reference)).getByRole('button', {
        name: rejectControlFor(firstDuplicate.Reference),
      }),
    ).toBeInTheDocument();

    // The selection, per request and for everything listed.
    expect(
      within(rowFor(firstDuplicate.Reference)).getByRole('checkbox', {
        name: selectionControlFor(firstDuplicate.Reference),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: SELECT_EVERYTHING }),
    ).toBeInTheDocument();

    // The possible-duplicate notification, which is the Approver's alone.
    const notification = await screen.findByRole('region', {
      name: /notifications/i,
    });
    expect(notification).toHaveTextContent(POSSIBLE_DUPLICATE);

    // And the bulk action, once there is a selection for it to act on.
    await user.click(
      within(rowFor(firstDuplicate.Reference)).getByRole('checkbox', {
        name: selectionControlFor(firstDuplicate.Reference),
      }),
    );
    expect(
      await screen.findByRole('button', { name: BULK_APPROVE_ACTION }),
    ).toBeInTheDocument();

    approverView.unmount();

    // --- the Importer, offered none of it (R7/R27) -------------------------
    render(listAs([ROLE_IMPORTER], IMPORTER_NAME));

    // The same batch, fully listed — so every absence below is a withheld
    // capability and not an empty screen.
    await expectExactlyListed(requests, requests);
    // ...and the row controls an Importer DOES have are there, so the sweep is not
    // passing because nothing rendered at all.
    expect(
      within(rowFor(firstDuplicate.Reference)).getByRole('button', {
        name: openControlFor(firstDuplicate.Reference),
      }),
    ).toBeInTheDocument();

    // No decision control on the request's own row, where the Approver had two...
    const importerRow = rowFor(firstDuplicate.Reference);
    expect(
      within(importerRow)
        .queryAllByRole('button', { name: APPROVE_ACTION, hidden: true })
        .map(described),
    ).toEqual([]);
    expect(
      within(importerRow)
        .queryAllByRole('button', { name: REJECT_ACTION, hidden: true })
        .map(described),
    ).toEqual([]);

    // ...and none anywhere else on the screen either: no per-request Approve or
    // Reject, and no bulk approval tucked into a toolbar. Queried with
    // `hidden: true`, so present-but-hidden and present-but-disabled fail here
    // exactly as a working control would (contract note 6).
    expect(everyControlNamed(APPROVE_ACTION).map(described)).toEqual([]);
    expect(everyControlNamed(REJECT_ACTION).map(described)).toEqual([]);
    expect(everyControlNamed(BULK_APPROVE_ACTION).map(described)).toEqual([]);

    // Nothing to select with, either — no per-request tick, no "select everything
    // listed", nowhere on the screen.
    expect(
      screen.queryAllByRole('checkbox', { hidden: true }).map(described),
    ).toEqual([]);
    expect(everyControlNamed(SELECT_EVERYTHING).map(described)).toEqual([]);

    // And the Importer is notified of nothing — the possible-duplicate notification
    // is the Approver's alone, so the app's one notification surface is not on the
    // screen at all.
    expect(notificationSurface()).not.toBeInTheDocument();

    // The one thing an Importer DOES still see: the MARK on the row. The
    // notification is withheld; the marking is not, and removing it would be a
    // different regression (contract note 6).
    expect(rowFor(firstDuplicate.Reference)).toHaveTextContent(
      POSSIBLE_DUPLICATE,
    );
    expect(rowFor(secondDuplicate.Reference)).toHaveTextContent(
      POSSIBLE_DUPLICATE,
    );

    // The strip itself is unchanged by role: narrowing and export belong to both
    // roles, so an Importer still gets all six fields and the export.
    for (const field of EVERY_FIELD) {
      expect(fieldControl(field)).toBeVisible();
    }
    expect(exportControl()).toBeEnabled();
  });
});
