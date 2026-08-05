/**
 * How the expense request list is narrowed: what the user has applied, which requests
 * that leaves, and what the choices on offer are.
 *
 * It lives away from the screen because three surfaces have to agree about it — the
 * controls that offer the narrowing, the summary that says what is currently applied,
 * and the filter that decides which requests are still listed. One statement of the
 * rules is what stops a filter choice and a listed row disagreeing.
 *
 * Two things here are deliberate and easy to break:
 *
 * - **Nothing narrows on the server.** `GET /v1/transactions` accepts no query
 *   parameters (epic brief §Notes & Caveats), so every rule below runs in memory over
 *   the ONE set the list already fetched. Adding a parameter would be a re-read of a
 *   contract that has none.
 * - **The search covers only what is on SCREEN** — including just the visible last four
 *   digits of an account number. Searching the unmasked value would be a way around the
 *   masking POPIA requires: a searcher could confirm a guessed account number without
 *   ever revealing it (project.md §Compliance, brief §Notes & Caveats). Do not widen
 *   {@link searchableValuesOf} to `AccountNumber` itself.
 * - **A range entered the wrong way round applies NEITHER of its bounds.** It is
 *   reported instead (see {@link rangeReports}) and contributes nothing to the summary,
 *   so the list stays exactly as it was rather than going unexplainedly empty (brief R7,
 *   R10/R18). Keeping "the last valid bound" applied instead would make what the user
 *   sees depend on which keystroke happened to arrive last.
 * - **The date range compares whole DAYS**, not instants: a bound is measured against
 *   the leading `YYYY-MM-DD` of `TransactionDate`, so the upper bound covers the whole
 *   of its day and a request stored as `2026-04-15 15:00:00` is inside a range whose
 *   latest day is `2026-04-15`. Nothing about `TransactionDate` is normalised — the
 *   format is an unverified assumption for this epic (brief §Notes & Caveats), and a
 *   guessed repair would hide a real difference instead of surfacing it.
 *
 * The two ranges live in `RequestNarrowing`, `narrowRequests` and `appliedNarrowings`
 * here rather than in a mechanism of their own. That is why the summary is built from a
 * LIST of what is applied rather than from a fixed set of known filters.
 */
import { lastFourDigitsOf, transactionTypeLabel } from './display';

import type { TransactionRead } from '@/types/transactions';

/**
 * What each narrowing is called. The controls and the summary both read these, so the
 * field a user picked from and the field the summary names can never drift apart. The
 * search box's own label says more than one word, so only the summary uses this one.
 */
const SEARCH_FIELD_NAME = 'Search';
export const STATUS_FIELD_NAME = 'Status';
export const FILE_FIELD_NAME = 'Originating file';
export const TRANSACTION_TYPE_FIELD_NAME = 'Transaction type';
export const AMOUNT_RANGE_FIELD_NAME = 'Amount range';
export const DATE_RANGE_FIELD_NAME = 'Transaction date range';

/**
 * Everything currently narrowing the list. `''` means "this one is not narrowing" —
 * there is no separate "off" flag to keep in step with the value.
 *
 * The four range bounds hold what the user TYPED, exactly as their fields show it, so
 * the screen never silently swaps, clamps or blanks a bound. What each one means as a
 * bound — and whether the range it belongs to can be applied at all — is worked out
 * here, in one place, by {@link amountRangeOf} and {@link dateRangeOf}.
 */
export interface RequestNarrowing {
  /** The free-text term, already trimmed. */
  search: string;
  /** The service's own `Status` value, never a translated one. */
  status: string;
  /** The originating file's `FileName`, exactly as the service wrote it. */
  fileName: string;
  /** The service's own `TransactionType` value — the raw value, not its label. */
  transactionType: string;
  /** The lowest `Amount` still listed, as typed; `''` leaves that end open. */
  minimumAmount: string;
  /** The highest `Amount` still listed, as typed; `''` leaves that end open. */
  maximumAmount: string;
  /** The earliest transaction day still listed (`YYYY-MM-DD`), as typed. */
  earliestDate: string;
  /** The latest transaction day still listed (`YYYY-MM-DD`), as typed. */
  latestDate: string;
}

/** Nothing applied: the whole fetched set is listed. */
export const NO_NARROWING: RequestNarrowing = {
  search: '',
  status: '',
  fileName: '',
  transactionType: '',
  minimumAmount: '',
  maximumAmount: '',
  earliestDate: '',
  latestDate: '',
};

/** The narrowings a user picks one value for, from the values the service sent. */
export type PickOneFilterField = 'status' | 'fileName' | 'transactionType';

/** One end of one of the two-bound ranges, as the user types it. */
export type RangeBoundField =
  | 'minimumAmount'
  | 'maximumAmount'
  | 'earliestDate'
  | 'latestDate';

/** Every narrowing a control can change, so one channel carries all of them. */
export type NarrowingField = PickOneFilterField | RangeBoundField;

/** One value a pick-one filter offers: the service's value, under its own wording. */
export interface FilterChoice {
  /** What the request is compared against — the service's value, untouched. */
  value: string;
  /** What the user reads: plain language where the app has any, else the value. */
  label: string;
}

/** One narrowing that is currently applied, as the summary states it. */
export interface AppliedNarrowing {
  /** Stable across renders, so React can key the summary's items. */
  id: string;
  /** Which field is narrowing, e.g. "Status". */
  field: string;
  /** What it is narrowed to, as the user reads it. */
  value: string;
}

/** One in-place report that a range cannot be applied as it stands (brief R7). */
export interface RangeReport {
  /** Stable across renders, so React can key the reports. */
  id: string;
  /** Which range it is about, e.g. "Amount range". */
  field: string;
  /** What the user is told, in their own terms. */
  message: string;
}

/**
 * What the screen says when a range's upper bound is below its lower one. It names the
 * range, says what is wrong in the user's words, and — the part that matters — says the
 * range has NOT been applied, so an unchanged list is explained rather than puzzling.
 */
export const AMOUNT_RANGE_WRONG_WAY_ROUND =
  'The amount range is the wrong way round — the maximum amount is below the minimum amount, so it has not been applied.';
export const DATE_RANGE_WRONG_WAY_ROUND =
  'The transaction date range is the wrong way round — the latest date is before the earliest date, so it has not been applied.';

/**
 * A new narrowing with one field changed. An exhaustive switch rather than a computed
 * key, so adding a narrowing to {@link NarrowingField} without handling it here is a
 * type error rather than a silent no-op.
 */
export const withFilterValue = (
  narrowing: RequestNarrowing,
  field: NarrowingField,
  value: string,
): RequestNarrowing => {
  switch (field) {
    case 'status':
      return { ...narrowing, status: value };
    case 'fileName':
      return { ...narrowing, fileName: value };
    case 'transactionType':
      return { ...narrowing, transactionType: value };
    case 'minimumAmount':
      return { ...narrowing, minimumAmount: value };
    case 'maximumAmount':
      return { ...narrowing, maximumAmount: value };
    case 'earliestDate':
      return { ...narrowing, earliestDate: value };
    case 'latestDate':
      return { ...narrowing, latestDate: value };
  }
};

/**
 * A range once read: each end either bounds the list or is open (`undefined`), plus
 * whether the user entered it the wrong way round.
 */
interface ReadRange<TBound> {
  lower: TBound | undefined;
  upper: TBound | undefined;
  /** Both ends were given, and the upper one is below the lower one. */
  wrongWayRound: boolean;
}

/**
 * Reads one range's two typed bounds.
 *
 * A bound its reader cannot use — an empty field, or anything that is not a complete
 * value — simply does not bound the list; it is never treated as 0 or as the epoch, and
 * never reported as a wrong-way-round range (there is nothing to compare yet).
 *
 * When both ends are usable but the upper is below the lower, BOTH are dropped: the
 * range is reported instead of applied (see this module's header).
 */
const readRange = <TBound>(
  lowerTyped: string,
  upperTyped: string,
  boundOf: (typed: string) => TBound | undefined,
  upperIsBelowLower: (upper: TBound, lower: TBound) => boolean,
): ReadRange<TBound> => {
  const lower = boundOf(lowerTyped);
  const upper = boundOf(upperTyped);

  if (
    lower !== undefined &&
    upper !== undefined &&
    upperIsBelowLower(upper, lower)
  ) {
    return { lower: undefined, upper: undefined, wrongWayRound: true };
  }

  return { lower, upper, wrongWayRound: false };
};

/**
 * An amount bound as a NUMBER — the only comparison R7 allows, since by text order 9.99
 * sits inside "100" to "200". An empty field is no bound at all, which is why the blank
 * is caught before `Number()`, whose answer for `''` is 0.
 */
const amountBoundOf = (typed: string): number | undefined => {
  const entered = typed.trim();
  if (entered === '') {
    return undefined;
  }
  const amount = Number(entered);
  return Number.isFinite(amount) ? amount : undefined;
};

/** A complete calendar day, which is the only shape a date bound can be compared in. */
const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** How many characters of a `TransactionDate` the calendar day occupies. */
const ISO_DAY_LENGTH = 10;

/**
 * A date bound as the day it names. A part-typed or unparseable value is no bound —
 * never the year 0002 — so the list is not narrowed by something the user has not
 * finished entering.
 */
const dayBoundOf = (typed: string): string | undefined => {
  const day = typed.trim();
  return ISO_DAY_PATTERN.test(day) ? day : undefined;
};

/**
 * The calendar day a request falls on: the leading `YYYY-MM-DD` of `TransactionDate`,
 * as the service wrote it. Comparing DAYS is what makes each bound cover the whole of
 * its day, so a request stored with a time of day on the latest day of a range is
 * inside it (brief R7) — and, in `YYYY-MM-DD`, day order and text order are the same
 * thing, which is what makes the comparison chronological.
 *
 * Nothing is normalised here: see this module's header.
 */
const transactionDayOf = (request: TransactionRead): string =>
  request.TransactionDate.slice(0, ISO_DAY_LENGTH);

/** The amount range as it applies: numeric bounds, both inclusive, either end open. */
const amountRangeOf = (narrowing: RequestNarrowing): ReadRange<number> =>
  readRange(
    narrowing.minimumAmount,
    narrowing.maximumAmount,
    amountBoundOf,
    (upper, lower) => upper < lower,
  );

/** The date range as it applies: whole-day bounds, both inclusive, either end open. */
const dateRangeOf = (narrowing: RequestNarrowing): ReadRange<string> =>
  readRange(
    narrowing.earliestDate,
    narrowing.latestDate,
    dayBoundOf,
    (upper, lower) => upper < lower,
  );

/**
 * The ranges the user has entered the wrong way round — what the screen reports in
 * place, instead of applying them and leaving an unexplained empty list (R10/R18).
 * Empty whenever both ranges make sense, which is the usual case.
 */
export const rangeReports = (narrowing: RequestNarrowing): RangeReport[] => {
  const reports: RangeReport[] = [];

  if (amountRangeOf(narrowing).wrongWayRound) {
    reports.push({
      id: 'amountRange',
      field: AMOUNT_RANGE_FIELD_NAME,
      message: AMOUNT_RANGE_WRONG_WAY_ROUND,
    });
  }
  if (dateRangeOf(narrowing).wrongWayRound) {
    reports.push({
      id: 'dateRange',
      field: DATE_RANGE_FIELD_NAME,
      message: DATE_RANGE_WRONG_WAY_ROUND,
    });
  }

  return reports;
};

/**
 * The values of a request the search looks at: exactly what the list shows, and the
 * amount as the table prints it. `AccountNumber` contributes only its visible last four
 * digits — see this module's header for why that is a compliance rule, not a shortcut.
 */
const searchableValuesOf = (request: TransactionRead): string[] => [
  request.Reference,
  request.Description,
  request.FileName,
  String(request.Amount),
  lastFourDigitsOf(request.AccountNumber),
];

/** Whether any on-screen value of a request contains the term, ignoring case. */
const matchesSearch = (request: TransactionRead, term: string): boolean => {
  const wanted = term.toLowerCase();
  return searchableValuesOf(request).some((value) =>
    value.toLowerCase().includes(wanted),
  );
};

/**
 * The requests still listed once everything applied has narrowed the set. Several
 * narrowings applied together narrow cumulatively (brief R7); each one that is not
 * applied simply lets every request through.
 */
export const narrowRequests = (
  requests: TransactionRead[],
  narrowing: RequestNarrowing,
): TransactionRead[] => {
  // Read once for the whole set rather than per request — and, for a range the wrong
  // way round, read as no bounds at all (see this module's header).
  const amount = amountRangeOf(narrowing);
  const day = dateRangeOf(narrowing);

  return requests.filter(
    (request) =>
      (narrowing.search === '' || matchesSearch(request, narrowing.search)) &&
      (narrowing.status === '' || request.Status === narrowing.status) &&
      (narrowing.fileName === '' || request.FileName === narrowing.fileName) &&
      (narrowing.transactionType === '' ||
        request.TransactionType === narrowing.transactionType) &&
      // Both ends inclusive, and each one open until it is given.
      (amount.lower === undefined || request.Amount >= amount.lower) &&
      (amount.upper === undefined || request.Amount <= amount.upper) &&
      (day.lower === undefined || transactionDayOf(request) >= day.lower) &&
      (day.upper === undefined || transactionDayOf(request) <= day.upper),
  );
};

/**
 * How a range reads once applied: both ends, or the one end that is applied with the
 * other left open. `undefined` for both ends means the range is not narrowing at all —
 * either nothing was entered, or it was entered the wrong way round and is reported
 * instead of applied — so there is no entry for it.
 */
const rangeApplied = (
  id: string,
  field: string,
  lower: string | undefined,
  upper: string | undefined,
  lowerOnly: (bound: string) => string,
  upperOnly: (bound: string) => string,
): AppliedNarrowing | undefined => {
  if (lower !== undefined && upper !== undefined) {
    return { id, field, value: `${lower} to ${upper}` };
  }
  if (lower !== undefined) {
    return { id, field, value: lowerOnly(lower) };
  }
  if (upper !== undefined) {
    return { id, field, value: upperOnly(upper) };
  }
  return undefined;
};

/** A numeric bound as the summary prints it, or nothing when that end is open. */
const boundText = (bound: number | undefined): string | undefined =>
  bound === undefined ? undefined : String(bound);

/**
 * What is currently applied, in the order the controls offer it — one entry per active
 * narrowing, which is what the summary renders and counts (brief R3/R7/R18).
 */
export const appliedNarrowings = (
  narrowing: RequestNarrowing,
): AppliedNarrowing[] => {
  const applied: AppliedNarrowing[] = [];

  if (narrowing.search !== '') {
    applied.push({
      id: 'search',
      field: SEARCH_FIELD_NAME,
      value: narrowing.search,
    });
  }
  if (narrowing.status !== '') {
    applied.push({
      id: 'status',
      field: STATUS_FIELD_NAME,
      value: narrowing.status,
    });
  }
  if (narrowing.fileName !== '') {
    applied.push({
      id: 'fileName',
      field: FILE_FIELD_NAME,
      value: narrowing.fileName,
    });
  }
  if (narrowing.transactionType !== '') {
    applied.push({
      id: 'transactionType',
      field: TRANSACTION_TYPE_FIELD_NAME,
      // The same wording the type filter and the table cell use — one helper, so a
      // row and its filter choice can never read differently (brief R1).
      value: transactionTypeLabel(narrowing.transactionType),
    });
  }

  const amount = amountRangeOf(narrowing);
  const amountEntry = rangeApplied(
    'amountRange',
    AMOUNT_RANGE_FIELD_NAME,
    boundText(amount.lower),
    boundText(amount.upper),
    (bound) => `${bound} or more`,
    (bound) => `${bound} or less`,
  );
  if (amountEntry !== undefined) {
    applied.push(amountEntry);
  }

  const day = dateRangeOf(narrowing);
  const dayEntry = rangeApplied(
    'dateRange',
    DATE_RANGE_FIELD_NAME,
    day.lower,
    day.upper,
    (bound) => `${bound} onwards`,
    (bound) => `up to ${bound}`,
  );
  if (dayEntry !== undefined) {
    applied.push(dayEntry);
  }

  return applied;
};

/**
 * The choices a pick-one filter offers: one per DISTINCT value present in the fetched
 * requests, ordered by the wording the user reads.
 *
 * The service owns every one of these vocabularies (brief §Notes & Caveats), so nothing
 * is added that the data does not contain and nothing the data contains is left out —
 * there is no accepted-value list to check against. `labelOf` is how a value the app
 * has wording for is offered under it; a value it has none for is offered verbatim.
 *
 * A blank value is the one thing left out: it has no wording to offer it under, and it
 * is not a choice a user could tell from "no choice made".
 */
export const filterChoicesIn = (
  requests: TransactionRead[],
  valueOf: (request: TransactionRead) => string,
  labelOf: (value: string) => string = (value) => value,
): FilterChoice[] =>
  [...new Set(requests.map(valueOf))]
    .filter((value) => value.trim() !== '')
    .map((value) => ({ value, label: labelOf(value) }))
    .sort((first, second) => first.label.localeCompare(second.label));
