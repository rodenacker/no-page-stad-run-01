/**
 * Selecting several expense requests to act on at once (brief R2/R4, BR1/BR10).
 *
 * Everything said about a selection lives here, because four surfaces have to agree
 * about it and none of them may invent its own wording: the request's own row, the
 * same request's card at phone width, the control that takes everything currently
 * listed, and the ambient count beside them.
 *
 * Three things here are deliberate:
 *
 * - **A selection is a set of transaction IDS, never row positions.** That is what
 *   lets a tick follow the REQUEST through the list's narrow → order → slice
 *   pipeline: a selected request stays selected while a search hides it, while a
 *   different ordering moves it, and while it sits on a page nobody is reading
 *   (settled design decision at the stories approval). The accepted consequence is
 *   that a bulk action may cover requests that are not on screen — which is also why
 *   the confirmation that gates it names an exact count.
 * - **`99+` belongs to the AMBIENT indicator and nowhere else** (R4/UI-20 against
 *   UI-09/BR4). {@link ambientSelectionCount} is the truncating form the count on
 *   screen uses; anything that gates an irreversible action states the selection's
 *   literal size, so it must NOT come through here.
 * - **Eligibility is `awaitsDecision`, the same condition a single decision uses**
 *   (BR1: only a request still `Imported` may be selected). It is imported rather
 *   than restated, so "which requests can be acted on" can never mean two different
 *   things on one screen.
 */
import { awaitsDecision } from '@/lib/transactions/deciding';

import type { TransactionRead } from '@/types/transactions';

/**
 * The control that takes every still-`Imported` request the active search and
 * filters LEFT — not only the page on screen, and not the whole fetched set.
 *
 * "listed" is load-bearing wording: it is what the user has narrowed the list down
 * to, which is the set the control actually covers.
 */
export const SELECT_EVERYTHING_LISTED_LABEL = 'Select all listed requests';

/**
 * How one request's own selection control names itself. Every listed request carries
 * one, so a bare "Select" would be a screenful of identical controls to anyone
 * reading by name — the same reason the row's Approve names its request.
 */
export const selectRequestLabel = (reference: string): string =>
  `Select request ${reference}`;

/**
 * The ambient count's own accessible name. The list already renders other, unnamed
 * `role="status"` elements (the tiered wait, a decision on its way), so the
 * indicator carries a name of its own rather than being told apart by its contents.
 */
export const SELECTION_COUNT_LABEL = 'Selected requests';

/** Above this many, the ambient indicator stops counting and says so (R4/UI-20). */
export const AMBIENT_COUNT_CEILING = 99;

/**
 * The count as the ambient indicator prints it: exact up to
 * {@link AMBIENT_COUNT_CEILING}, and `99+` beyond it.
 *
 * This is for the indicator alone. A confirmation that gates an irreversible action
 * names the literal count however large it is (BR4) — truncating there would hide
 * the size of exactly the selections that most need judging before they are acted on.
 */
export const ambientSelectionCount = (selected: number): string =>
  selected > AMBIENT_COUNT_CEILING
    ? `${String(AMBIENT_COUNT_CEILING)}+`
    : String(selected);

/** What the ambient indicator reads, in full. */
export const selectionCountMessage = (selected: number): string =>
  `${ambientSelectionCount(selected)} selected`;

/** Nothing selected. Shared, so the initial state is one stable value. */
export const NOTHING_SELECTED: ReadonlySet<number> = new Set<number>();

/**
 * The ids of the requests in `requests` that may be selected at all — every one
 * still awaiting a decision (BR1). Given the LISTED set, this is what "select
 * everything currently listed" covers.
 */
export const selectableIdsIn = (
  requests: readonly TransactionRead[],
): number[] => requests.filter(awaitsDecision).map((request) => request.Id);

/** One request ticked or unticked, as a new set — nothing is mutated in place. */
export const withSelectionToggled = (
  selected: ReadonlySet<number>,
  id: number,
): ReadonlySet<number> => {
  const next = new Set(selected);
  if (!next.delete(id)) {
    next.add(id);
  }
  return next;
};

/**
 * The given ids ADDED to what is already selected — never replacing it. Taking
 * everything currently listed must not quietly drop a request the user selected
 * before they narrowed the list, which is the whole point of holding ids.
 */
export const withIdsSelected = (
  selected: ReadonlySet<number>,
  ids: readonly number[],
): ReadonlySet<number> => new Set([...selected, ...ids]);

/**
 * The selection with every request that is no longer awaiting a decision taken out of
 * it — because this user's own bulk approval has just decided it, or because a fresh
 * read shows a colleague did (brief BR8).
 *
 * A request nobody can act on any more must not keep a tick and must not keep counting:
 * the visible count simply corrects itself, with no separate interruption. A request
 * that has left the list altogether goes too, for the same reason.
 *
 * The SAME set comes back when nothing changed, so a read that decided nothing costs no
 * re-render of the rows below it.
 */
export const withDecidedRequestsDropped = (
  selected: ReadonlySet<number>,
  requests: readonly TransactionRead[],
): ReadonlySet<number> => {
  const stillSelectable = new Set(selectableIdsIn(requests));
  const kept = [...selected].filter((id) => stillSelectable.has(id));

  return kept.length === selected.size ? selected : new Set(kept);
};
