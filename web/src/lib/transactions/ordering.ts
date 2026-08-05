/**
 * How the expense request list is ordered and cut into pages: which columns it shows,
 * what each one orders by, and which requests belong on the page being read
 * (brief R12/R13).
 *
 * It lives away from the screen for the same reason the narrowing does — several
 * surfaces have to agree about it. The heading row draws its sort controls from
 * {@link REQUEST_COLUMNS}, the rows are ordered by the same definitions, and the
 * remembered sort ({@link module:lib/transactions/sortPreference}) is validated
 * against them, so a column can never be sortable in one place and unknown in
 * another.
 *
 * Five things here are deliberate and easy to break:
 *
 * - **One pipeline, in this order: narrow → order → slice.** Ordering and paging are
 *   applied to what the narrowing left, never to the whole fetched set (brief R12,
 *   story AC-5). Slicing the fetched set and narrowing afterwards is the regression
 *   this order exists to prevent: a request the user filtered out would reappear on
 *   a later page, and the first page would hold the largest amounts in the file
 *   rather than the largest the user asked to see.
 * - **Nothing orders or pages on the server.** `GET /v1/transactions` accepts no
 *   query parameters (epic brief §Notes & Caveats), so both happen in memory over
 *   the one set the list already fetched.
 * - **A page is a SLICE of an array that was ordered once.** The feature NFR's
 *   400ms p95 per-page render at the 10,000-row ceiling is what that buys: nothing
 *   below re-derives the narrowed set, and nothing sorts per row.
 * - **A column orders by what the row SHOWS, never by a value it hides.** The
 *   account-number column orders by its visible last four digits, because that is
 *   all the screen may show (POPIA — project.md §Compliance); ordering by the full
 *   number would arrange the rows by a value the user is not allowed to see, which
 *   leaks its order. The transaction type orders by its plain-language label for the
 *   same reason: the user reads the label, so the label is what "sorted by type"
 *   has to mean.
 * - **An amount is compared as a NUMBER, everything else as text.** By text order
 *   9.99 sorts above 100, which is the mistake the fixtures straddle deliberately.
 *   Text comparison is a plain code-unit comparison rather than `localeCompare`: the
 *   references and dates in this data are fixed-width, so code-unit order IS their
 *   chronological and numeric order, and a locale's punctuation rules would only
 *   introduce a difference nobody asked for.
 */
import { lastFourDigitsOf, transactionTypeLabel } from './display';

import { PAGINATION } from '@/lib/utils/constants';

import type { TransactionRead } from '@/types/transactions';

/** Which column the list is ordered by. Every displayed column can be one (R13). */
export type RequestColumn =
  | 'fileName'
  | 'reference'
  | 'transactionDate'
  | 'accountNumber'
  | 'description'
  | 'amount'
  | 'transactionType'
  | 'status';

/** Which way round a column orders. The two `aria-sort` values, so nothing maps. */
export type SortDirection = 'ascending' | 'descending';

/** The ordering in force. `null` is the fetched order, which is the starting state. */
export interface RequestSort {
  column: RequestColumn;
  direction: SortDirection;
}

/** One displayed column: its heading, how it reads, and what it orders by. */
export interface RequestColumnDefinition {
  key: RequestColumn;
  /** The heading a user reads — and the name of the control that sorts by it. */
  label: string;
  /** Right-aligned, and compared as a number rather than as text. */
  numeric?: true;
  /** The value this column orders by: what the row shows (see this module's header). */
  orderValueOf: (request: TransactionRead) => string | number;
}

/**
 * Every column the list displays, in the order it displays them. The heading row is
 * rendered FROM this list, which is what makes "every displayed column supports
 * sorting" (R13) true by construction rather than by inspection.
 */
export const REQUEST_COLUMNS: RequestColumnDefinition[] = [
  {
    key: 'fileName',
    label: 'File',
    orderValueOf: (request) => request.FileName,
  },
  {
    key: 'reference',
    label: 'Reference',
    orderValueOf: (request) => request.Reference,
  },
  {
    key: 'transactionDate',
    label: 'Transaction date',
    // Compared as the service wrote it — nothing about `TransactionDate` is
    // normalised anywhere in this epic (its format is an unverified assumption).
    orderValueOf: (request) => request.TransactionDate,
  },
  {
    key: 'accountNumber',
    label: 'Account number',
    orderValueOf: (request) => lastFourDigitsOf(request.AccountNumber),
  },
  {
    key: 'description',
    label: 'Description',
    orderValueOf: (request) => request.Description,
  },
  {
    key: 'amount',
    label: 'Amount',
    numeric: true,
    orderValueOf: (request) => request.Amount,
  },
  {
    key: 'transactionType',
    label: 'Type',
    orderValueOf: (request) => transactionTypeLabel(request.TransactionType),
  },
  { key: 'status', label: 'Status', orderValueOf: (request) => request.Status },
];

/** Whether a value names one of the columns above. */
export const isRequestColumn = (value: unknown): value is RequestColumn =>
  REQUEST_COLUMNS.some((column) => column.key === value);

/**
 * How a column reports its own state to assistive technology: the direction it is
 * ordering by, or `'none'` when it is not the column in force. Single-field ordering,
 * so at most one column ever answers anything but `'none'`.
 */
export const sortStateOf = (
  sort: RequestSort | null,
  column: RequestColumn,
): SortDirection | 'none' =>
  sort !== null && sort.column === column ? sort.direction : 'none';

/**
 * What activating a column's sort control does next: ascending the first time (R13),
 * descending the second, and back to ascending after that — the same column always
 * offers both directions, and there is no third state a user has to click past.
 */
export const nextSortFor = (
  sort: RequestSort | null,
  column: RequestColumn,
): RequestSort =>
  sortStateOf(sort, column) === 'ascending'
    ? { column, direction: 'descending' }
    : { column, direction: 'ascending' };

/** Numbers by value, everything else by code unit — see this module's header. */
const compareValues = (
  first: string | number,
  second: string | number,
): number => {
  if (typeof first === 'number' && typeof second === 'number') {
    return first - second;
  }
  const firstText = String(first);
  const secondText = String(second);
  if (firstText < secondText) {
    return -1;
  }
  return firstText > secondText ? 1 : 0;
};

/**
 * The requests in the order the reader chose, or exactly as they were fetched when
 * nothing is chosen. A copy is sorted rather than the set handed in, because that set
 * is the narrowed view of state the screen still holds.
 *
 * Equal values keep their relative order (`Array.prototype.sort` is stable), so two
 * requests with the same amount stay in the order the service sent them rather than
 * swapping places between renders.
 */
export const orderRequests = (
  requests: TransactionRead[],
  sort: RequestSort | null,
): TransactionRead[] => {
  if (sort === null) {
    return requests;
  }
  const column = REQUEST_COLUMNS.find(
    (candidate) => candidate.key === sort.column,
  );
  if (column === undefined) {
    return requests;
  }
  const towards = sort.direction === 'ascending' ? 1 : -1;
  return [...requests].sort(
    (first, second) =>
      towards *
      compareValues(column.orderValueOf(first), column.orderValueOf(second)),
  );
};

/**
 * How many pages a set of that size fills. Always at least one: an empty set is still
 * "page 1 of 1", which is what keeps the page controls on the screen and merely
 * unusable rather than making them disappear (R12).
 */
export const pageCountOf = (total: number, pageSize: number): number =>
  Math.max(1, Math.ceil(total / pageSize));

/** The requests belonging on a page, counting pages from 0. */
export const pageOf = <TItem>(
  items: TItem[],
  pageIndex: number,
  pageSize: number,
): TItem[] => items.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

/**
 * A chosen page size, as one of the sizes actually on offer (R12). The selector only
 * offers those four, so this is the guard for a value arriving from anywhere else
 * rather than a translation anyone relies on.
 */
export const pageSizeFrom = (chosen: string): number => {
  const size = Number(chosen);
  return PAGINATION.PAGE_SIZE_OPTIONS.some((offered) => offered === size)
    ? size
    : PAGINATION.DEFAULT_PAGE_SIZE;
};
