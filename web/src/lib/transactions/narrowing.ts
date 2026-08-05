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
 *
 * Story 3's amount and date ranges belong in `RequestNarrowing`, `narrowRequests` and
 * `appliedNarrowings` here — not in a second mechanism of their own. That is why the
 * summary is built from a LIST of what is applied rather than from three known filters.
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

/**
 * Everything currently narrowing the list. `''` means "this one is not narrowing" —
 * there is no separate "off" flag to keep in step with the value.
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
}

/** Nothing applied: the whole fetched set is listed. */
export const NO_NARROWING: RequestNarrowing = {
  search: '',
  status: '',
  fileName: '',
  transactionType: '',
};

/** The narrowings a user picks one value for, from the values the service sent. */
export type PickOneFilterField = 'status' | 'fileName' | 'transactionType';

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

/**
 * A new narrowing with one pick-one filter changed. An exhaustive switch rather than a
 * computed key, so adding a filter to {@link PickOneFilterField} without handling it
 * here is a type error rather than a silent no-op.
 */
export const withFilterValue = (
  narrowing: RequestNarrowing,
  field: PickOneFilterField,
  value: string,
): RequestNarrowing => {
  switch (field) {
    case 'status':
      return { ...narrowing, status: value };
    case 'fileName':
      return { ...narrowing, fileName: value };
    case 'transactionType':
      return { ...narrowing, transactionType: value };
  }
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
): TransactionRead[] =>
  requests.filter(
    (request) =>
      (narrowing.search === '' || matchesSearch(request, narrowing.search)) &&
      (narrowing.status === '' || request.Status === narrowing.status) &&
      (narrowing.fileName === '' || request.FileName === narrowing.fileName) &&
      (narrowing.transactionType === '' ||
        request.TransactionType === narrowing.transactionType),
  );

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
