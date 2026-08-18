/**
 * What the request list's control block states about the batch (brief R11/R16/R19/R21,
 * BR4) — the figures, and the words each one is labelled with.
 *
 * It lives away from the screen for the reason every module in this folder does: more
 * than one surface has to agree about it. The band states the figures, a later story
 * rolls `AWAITING DECISION` as decisions resolve, and both have to be reading the same
 * derivation — a control total that two places compute differently is a control total
 * nobody can trust.
 *
 * Everything here is DERIVED, CLIENT-SIDE, from the one `TransactionRead[]` the list
 * already holds (brief §Data Model): no new call, no new field, no query parameter —
 * `GET /v1/transactions` accepts none.
 *
 * Four things here are deliberate and easy to break:
 *
 * - **⚠ `DECIDED` is `Status !== Imported`, and `AWAITING DECISION` is
 *   `Status === Imported`, so the two ALWAYS sum to `RECORDS`.** Do NOT reach for
 *   `countRequests()` from `src/mocks/data/transaction.ts`: it was built for the
 *   file-deletion confirmation and defines `decided = approved + rejected`, which counts
 *   a row carrying a status outside the three recognised values as NEITHER. The service
 *   owns that vocabulary (`@/types/transactions` — an unrecognised value is displayed as
 *   received, never remapped), so such a row can legitimately arrive, and it is not
 *   `Imported`. Counting it as neither would ship a wrong outstanding count, which is the
 *   single figure this whole screen is built around. {@link controlTotalsOf} therefore
 *   counts what awaits a decision and takes `DECIDED` as the remainder, so the two cannot
 *   drift apart however the vocabulary grows.
 * - **The condition is `awaitsDecision`, imported rather than restated** — the same one
 *   the decide flow and the selection use, so "still awaiting a decision" cannot come to
 *   mean two things on one screen.
 * - **A figure prints exactly as the rows print it** ({@link figureText}). The list shows
 *   `Amount` and `TransactionDate` as the service sent them (`display.ts` — a formatter
 *   would be the bug), so the totals do too: `26136.31`, never `26 136.31`, `R26,136.31`
 *   or `26136.310`. Grouping or padding a control total would also stop it matching the
 *   figures in the rows it is summarising.
 * - **`BATCH` and `RUN DATE` are settled, not invented** (brief §Notes & Caveats,
 *   "Resolved spec gap", user-decided at the stories approval). `GET /v1/transactions`
 *   answers with requests drawn from MANY originating files and nothing on the wire names
 *   a batch or a run, so: with no originating-file narrowing the screen is a whole-queue
 *   listing and says so ({@link WHOLE_QUEUE_BATCH}), showing the newest `TransactionDate`
 *   in the fetched set; narrowed to one file, both sharpen to that file. Naming one batch
 *   per row belongs to the files-list redesign, where one row genuinely is one batch.
 */
import { awaitsDecision } from '@/lib/transactions/deciding';

import type { TransactionRead } from '@/types/transactions';

/**
 * What each figure is labelled with — the design brief's own words (R11). The band
 * renders these as its visible tracked labels AND names each figure with them, so a
 * screen-reader user reaches "Awaiting decision, 5" rather than a bare numeral.
 */
export const BATCH_LABEL = 'Batch';
export const RUN_DATE_LABEL = 'Run date';
export const RECORDS_LABEL = 'Records';
export const AWAITING_DECISION_LABEL = 'Awaiting decision';
export const DECIDED_LABEL = 'Decided';
export const TOTAL_VALUE_LABEL = 'Total value';

/**
 * The pre-commit wording (R17/BR7) — ONE phrase, deliberately used in two places, so the
 * band and the rows can never come to say two different things about one pending decision:
 *
 * - as the control block's label for the gap, over the number of decisions awaiting
 *   confirmation — and ABSENT from the block while nothing is pending, this project's
 *   convention for an indicator whose only other reading would be a permanent `0` (the
 *   ambient selection count, and the selection subtotal beside it);
 * - as the MARK every affected row carries, in the shared `StatusBadge` grammar — words
 *   paired with a shape and an intent colour, because a shape in the gutter alone would not
 *   satisfy R3/BR3 (see `components/requests/NotYetConfirmedMark`).
 */
export const NOT_YET_CONFIRMED = 'Not yet confirmed';

/**
 * What the whole-batch record count is called while a narrowing is active (R21). It is
 * kept beside the narrowed figures with a line through it, and a line through a number
 * says nothing on its own — so it carries this as its accessible name.
 */
export const WHOLE_BATCH_RECORDS_LABEL = 'Whole batch records';

/**
 * What the selection's own total value is called (R19). Its COUNT is labelled with
 * `SELECTION_COUNT_LABEL` from `selecting.ts`, imported by the band rather than restated
 * here: the ambient indicator already carries that name, and the band must not invent a
 * second phrase for the same fact.
 */
export const SELECTED_VALUE_LABEL = 'Selected value';

/**
 * What `BATCH` reads while no originating-file narrowing is active: this screen is the
 * whole queue, and the band never implies a batch identity the data cannot support.
 */
export const WHOLE_QUEUE_BATCH = 'ALL FILES';

/**
 * What `RUN DATE` reads when there is no `TransactionDate` to show at all — a file
 * narrowing whose requests have since left the fetched set. Defensive: the filters offer
 * only files the fetched set contains, so it takes a refresh landing mid-read to see it.
 * A zero or an epoch would be a figure the data does not support.
 */
export const NO_RUN_DATE = '—';

/**
 * The most decimal places this screen will carry in a summed figure.
 *
 * A guard rather than a format: `Amount` is a JSON number and nothing on the wire promises
 * two decimals, so the scale a sum is settled at is taken from the data itself (below) and
 * merely CAPPED here — high enough that no amount this service has ever sent is affected,
 * low enough that the arithmetic stays inside `Number.MAX_SAFE_INTEGER` at the 10,000-request
 * ceiling.
 */
const MOST_SUMMED_DECIMALS = 6;

/** How many decimal places one amount actually carries, as the service wrote it. */
const decimalsIn = (amount: number): number => {
  const written = String(amount);
  if (written.includes('e') || written.includes('E')) {
    // An amount the runtime prints in exponential form: settle it at the cap rather than
    // reading "no decimals" off a string that has none written in it.
    return MOST_SUMMED_DECIMALS;
  }
  const [, decimals = ''] = written.split('.');
  return Math.min(decimals.length, MOST_SUMMED_DECIMALS);
};

/**
 * A set of amounts added up, settled at the precision the amounts themselves carry.
 *
 * ⚠ **This is arithmetic, NOT formatting** — the distinction this module's header draws.
 * Adding binary floats leaves an error far below the last digit the data carries
 * (`10.10 + 20.20 + 30.30` is `60.599999999999994` in IEEE-754), and `figureText` prints a
 * figure verbatim, so a plain `+=` puts `26136.310000000005` in the control block: a total
 * that cannot be reconciled against the rows above it, which is the one thing a control
 * total exists to allow. Settling the sum at the scale of the widest amount in the set
 * recovers the exact decimal total without grouping, padding, prefixing or otherwise
 * touching how it prints — every input is summed in full and in the order it arrived, and
 * only the accumulated binary noise is dropped.
 */
export const sumOfAmounts = (amounts: readonly number[]): number => {
  const scale =
    10 **
    amounts.reduce((widest, amount) => Math.max(widest, decimalsIn(amount)), 0);
  const summed = amounts.reduce((running, amount) => running + amount, 0);

  return Math.round(summed * scale) / scale;
};

/** The four figures R11 names, over whichever set they are asked about. */
export interface ControlTotals {
  /** How many requests the set holds. */
  records: number;
  /** How many of them are still awaiting a decision (`Status === Imported`). */
  awaitingDecision: number;
  /** How many have been decided — every other status, whatever it is. */
  decided: number;
  /** Their summed `Amount`, as the service sent each one. */
  totalValue: number;
}

/**
 * The four control totals over one set of requests — the whole fetched batch, or
 * whatever the narrowing left (R21).
 *
 * `decided` is the REMAINDER rather than a second count, which is what guarantees
 * `awaitingDecision + decided === records` for any vocabulary the service uses. See this
 * module's header for why that matters more than it looks.
 *
 * The amounts are summed in the order they arrived, which is the order the rows are in
 * and the order a reader adding them up would use — through {@link sumOfAmounts}, so the
 * figure the block prints is the exact decimal total of the rows rather than the binary
 * float that accumulating them leaves behind (see the ⚠ there).
 */
export const controlTotalsOf = (
  requests: readonly TransactionRead[],
): ControlTotals => {
  let awaitingDecision = 0;
  const amounts: number[] = [];

  requests.forEach((request) => {
    if (awaitsDecision(request)) {
      awaitingDecision += 1;
    }
    amounts.push(request.Amount);
  });

  return {
    records: requests.length,
    awaitingDecision,
    decided: requests.length - awaitingDecision,
    totalValue: sumOfAmounts(amounts),
  };
};

/**
 * What the control block states while decisions are AWAITING CONFIRMATION — the batch as
 * it will be, beside the batch as it is (R17/BR7).
 *
 * ⚠ **Only `AWAITING DECISION` moves.** `RECORDS` and `DECIDED` go on stating what the
 * batch actually IS, so the three visibly do not add up while a decision is pending — which
 * is the whole of R17: the reader sees the after-picture and can see it has not happened
 * yet. Moving `DECIDED` with the outstanding count would re-balance the block and leave
 * nothing to see, which defeats the requirement entirely. Nothing here decides anything and
 * nothing here is optimistic: it is arithmetic over a set of ids the screen is still ASKING
 * about, so backing out restores every figure by simply handing over an empty set.
 */
export interface PreCommitReading {
  /**
   * How many decisions are awaiting confirmation. `0` means nothing is pending, and the
   * block states the pair NOT AT ALL rather than a fixture reading zero.
   */
  notYetConfirmed: number;
  /**
   * What `AWAITING DECISION` states: the figure the batch will have once those decisions
   * are committed.
   */
  awaitingDecision: number;
}

/**
 * How many of a set's requests a decision is awaiting confirmation on.
 *
 * Counted over the requests the block is describing — so a narrowing that hides a selected
 * request keeps the named gap and the visible movement in step — and only over requests a
 * decision is still open on (`awaitsDecision`, imported rather than restated, exactly as
 * {@link controlTotalsOf} takes it), so a request a colleague decided while the
 * confirmation stood cannot be counted twice.
 */
export const decisionsAwaitingConfirmationIn = (
  requests: readonly TransactionRead[],
  awaitingConfirmation: ReadonlySet<number>,
): number =>
  awaitingConfirmation.size === 0
    ? 0
    : requests.filter(
        (request) =>
          awaitsDecision(request) && awaitingConfirmation.has(request.Id),
      ).length;

/**
 * The two figures the pre-commit state adds to the block, from the totals it already has
 * and the decisions currently awaiting confirmation. See {@link PreCommitReading} for the
 * ⚠ about which figures may move.
 */
export const preCommitReadingOf = (
  totals: ControlTotals,
  listed: readonly TransactionRead[],
  awaitingConfirmation: ReadonlySet<number>,
): PreCommitReading => {
  const notYetConfirmed = decisionsAwaitingConfirmationIn(
    listed,
    awaitingConfirmation,
  );

  return {
    notYetConfirmed,
    awaitingDecision: totals.awaitingDecision - notYetConfirmed,
  };
};

/**
 * The newest `TransactionDate` in a set, exactly as the service wrote it, or `undefined`
 * for an empty set.
 *
 * Compared as text: in `YYYY-MM-DD HH:MM:SS` text order and chronological order are the
 * same thing, which is the same reasoning the date-range narrowing uses. Nothing is
 * normalised or reformatted — the format is an unverified assumption for this project,
 * and a guessed repair would hide a real difference instead of surfacing it.
 */
export const newestTransactionDateIn = (
  requests: readonly TransactionRead[],
): string | undefined =>
  requests.reduce<string | undefined>(
    (newest, request) =>
      newest === undefined || request.TransactionDate > newest
        ? request.TransactionDate
        : newest,
    undefined,
  );

/**
 * What `BATCH` reads: the whole queue, or the one originating file the narrowing has
 * sharpened to. `''` is the narrowing layer's "not narrowing by file".
 */
export const batchNameOf = (narrowedToFile: string): string =>
  narrowedToFile === '' ? WHOLE_QUEUE_BATCH : narrowedToFile;

/**
 * What `RUN DATE` reads: the newest `TransactionDate` in the fetched batch, or — once the
 * originating-file filter has narrowed to one file — the newest in THAT file.
 *
 * It follows the FILE narrowing alone, not every narrowing: `RUN DATE` says when the work
 * on screen was transacted, and a free-text search is the reader looking for one request
 * rather than a different batch.
 */
export const runDateOf = (
  batch: readonly TransactionRead[],
  narrowedToFile: string,
): string => {
  const dated =
    narrowedToFile === ''
      ? batch
      : batch.filter((request) => request.FileName === narrowedToFile);

  return newestTransactionDateIn(dated) ?? NO_RUN_DATE;
};

/** What is about to be committed, while a selection is live (R19). */
export interface SelectionSubtotal {
  /** How many requests are selected. */
  count: number;
  /** Their summed `Amount` — the money, not just the row count. */
  totalValue: number;
}

/**
 * The selection's own count and total value.
 *
 * The COUNT is the size of the selection itself, not the number of selected requests
 * found in the batch, so the band and the ambient indicator beside it can never state two
 * different figures for one selection. The VALUE can only be summed over requests the
 * batch still holds; the two agree because a request that leaves the list leaves the
 * selection with it (`withDecidedRequestsDropped`).
 *
 * The value goes through {@link sumOfAmounts} for the same reason the batch total does, and
 * it matters more here: this is the money the reader is about to commit, and it is read
 * against the confirmation that commits it.
 */
export const selectionSubtotalOf = (
  batch: readonly TransactionRead[],
  selectedIds: ReadonlySet<number>,
): SelectionSubtotal => ({
  count: selectedIds.size,
  totalValue: sumOfAmounts(
    batch
      .filter((request) => selectedIds.has(request.Id))
      .map((request) => request.Amount),
  ),
});

/**
 * How a figure prints: the number itself, and nothing added to it.
 *
 * Stated once, here, because it is a rule rather than a convenience — the rows print the
 * service's own `Amount` (`display.ts`), so a control total that grouped its thousands,
 * prefixed a currency or padded its decimals would no longer read as the sum of the
 * figures above it.
 */
export const figureText = (value: number): string => String(value);
