/**
 * The ordering the reader chose for the expense request list, remembered for the rest
 * of their session (brief R13).
 *
 * Four things here are deliberate:
 *
 * - **`sessionStorage`, not the URL and not the server.** R13 asks for the sort to
 *   survive leaving the screen and coming back within the session — no more. It is
 *   not something to share by address (`GET /v1/transactions` takes no parameters,
 *   so there is nothing to ask the service for), and it is not a preference to keep
 *   across sessions. `sessionStorage` is exactly that lifetime, and it survives the
 *   one thing that has to work: the component unmounting on a client-side
 *   navigation and mounting again on return.
 * - **It is external state React WATCHES, never a copy React keeps.** The value
 *   already exists before this screen renders, so it is read through
 *   `useSyncExternalStore` ({@link rememberedSort} + {@link subscribeToSort}) rather
 *   than copied into component state by an effect — which would both disagree with
 *   storage for a frame and mismatch the server-rendered markup.
 * - **The server's honest answer is "not ordered".** A server render cannot know a
 *   browser's session, so {@link rememberedSortOnServer} says so, and React swaps in
 *   the real answer after hydration.
 * - **A stored value is validated before it is trusted.** Storage is writable by
 *   anything running in this browser, and a stored column name that no longer exists
 *   would otherwise order the list by nothing at all. An unreadable or unrecognised
 *   value simply means "no ordering chosen", which is a legitimate state rather than
 *   an error worth showing anyone.
 */
import { isRequestColumn } from './ordering';

import type { RequestSort } from './ordering';

/**
 * Where the chosen ordering is remembered. Namespaced like the theme's key, so the
 * two cannot collide, and carrying no personal data (project.md §Compliance — POPIA):
 * a column name and a direction.
 */
export const SORT_STORAGE_KEY = 'employee-expenses.request-list-sort';

/**
 * The answer `useSyncExternalStore` is given. Held here so the same object identity
 * comes back on every render until it genuinely changes — a fresh object each time
 * would make React re-render forever. `undefined` means storage has not been read
 * yet, which is different from `null` ("read, and nothing is chosen").
 */
let known: RequestSort | null | undefined;

const watchers = new Set<() => void>();

/** Whether something read out of storage is an ordering this app can apply. */
const isRequestSort = (value: unknown): value is RequestSort => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { column?: unknown; direction?: unknown };
  return (
    isRequestColumn(candidate.column) &&
    (candidate.direction === 'ascending' ||
      candidate.direction === 'descending')
  );
};

/**
 * The ordering written for this session, or `null` when there is none. Storage can be
 * unavailable (private browsing, blocked storage) — that is not an error worth showing
 * anyone, it just means nothing was remembered.
 */
const storedSort = (): RequestSort | null => {
  try {
    const written = window.sessionStorage.getItem(SORT_STORAGE_KEY);
    if (written === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(written);
    return isRequestSort(parsed) ? parsed : null;
  } catch {
    // Unavailable or unparseable storage: no ordering was remembered.
    return null;
  }
};

/** The ordering in force right now — the `getSnapshot` half of the store. */
export const rememberedSort = (): RequestSort | null => {
  if (known === undefined) {
    known = typeof window === 'undefined' ? null : storedSort();
  }
  return known;
};

/** What a server render can honestly say: nothing has been chosen. */
export const rememberedSortOnServer = (): RequestSort | null => null;

/** Watches the chosen ordering; returns the function that stops watching. */
export const subscribeToSort = (onChange: () => void): (() => void) => {
  watchers.add(onChange);
  return () => {
    watchers.delete(onChange);
  };
};

/**
 * Remembers an ordering for the rest of the session and tells everything watching.
 * `null` forgets it, putting the list back in the order the service sent.
 */
export const rememberSort = (sort: RequestSort | null): void => {
  known = sort;
  try {
    if (sort === null) {
      window.sessionStorage.removeItem(SORT_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
    }
  } catch {
    // Storage unavailable: the ordering still applies while the screen is open, it
    // just will not survive leaving it. Nothing worth interrupting the user for.
  }
  watchers.forEach((watcher) => {
    watcher();
  });
};
