'use client';

/**
 * Every imported expense payment request, as the transactions service reports it —
 * the one shared screen both the Finance Uploader (the auth service's `Importer`) and
 * the Approver work from (brief R1, R20). Read-only: nothing here changes a request
 * (BR1).
 *
 * Six things about this component are deliberate and easy to break:
 *
 * - **The whole set is read once, in the BROWSER, and held in memory.**
 *   `GET /v1/transactions` accepts no query parameters, so there is no server-side
 *   search, filter, sort or paging to ask for (brief §Notes & Caveats): the set below
 *   is the one the later narrowing, sorting and paging layers work over, and none of
 *   them re-reads the service. Reading from the browser is also what lets the session
 *   cookie travel by itself and makes the three non-data states this component's own
 *   business rather than a server render's.
 * - **Everything on screen is the service's own value.** The date is printed exactly
 *   as it arrived (its format is an unverified assumption for this epic — normalising
 *   on speculation would hide a real difference rather than surface it) and the amount
 *   keeps the number the service sent. A status or transaction type this app has never
 *   heard of is shown as written rather than blanked, remapped or treated as an error
 *   — the backend owns both vocabularies.
 * - **An account number never reaches the browser whole.** Only its last four digits
 *   are rendered, on every render path, and there is no control that reveals them
 *   wholesale. This is POPIA (project.md §Compliance), not formatting: a full value in
 *   a title or data attribute would leak it just as surely as printing it.
 * - **The wait is tiered** (R11/R19): under 300ms nothing is drawn at all, because a
 *   flash of skeleton is worse than a moment of stillness; from 300ms an announced
 *   placeholder stands in for the pending list; past 3s a still-loading message JOINS
 *   that placeholder rather than replacing it.
 * - **All three non-data states are answered** (project.md NFR-base-5): the announced
 *   busy state, a plain sentence when nothing has ever been imported plus the upload
 *   action as the next step, and — when the list cannot be read — the service's own
 *   wording plus one action that asks for it again. An empty list is an answer, not a
 *   failure.
 * - **The status chip is the shared `StatusBadge`**, which pairs an intent colour with
 *   the status TEXT and an icon, never colour alone (R14). This screen supplies only
 *   what each status MEANS; the tokens are the badge's.
 *
 * The narrowing layer (R2/R3/R6/R7/R10/R18) sits on top of that one fetched set:
 *
 * - **Nothing narrows on the server and nothing re-reads.** The search term, the three
 *   pick-one filters and the four range bounds are component state, narrowing the set
 *   already in memory. They are deliberately NOT in the URL: the endpoint takes no
 *   parameters, and nothing in this screen asks for a shareable narrowed address.
 * - **A range entered the wrong way round is reported, never applied.** The report sits
 *   with the controls and the range stops narrowing entirely — neither bound — so the
 *   list is left exactly as it was instead of going unexplainedly empty, and the range
 *   contributes nothing to the summary of what is applied. The bounds the user typed stay
 *   in their fields: the screen reports, it never swaps, clamps or blanks a value.
 * - **The term narrows as it is typed, with no timer in the way.** Responsiveness at the
 *   feature NFR's 10,000-row ceiling is React's to manage (`useDeferredValue`, which
 *   re-filters at a lower priority than the keystrokes) rather than a delay the user
 *   waits out.
 * - **The narrowed-empty state is a different answer from the never-imported one**: it
 *   names what is applied and offers Clear all, and it deliberately does NOT offer the
 *   upload action (R10/R18 against R9/R17). Offering "submit a file" to someone whose
 *   own filter hid their requests is the failure mode those requirements exist to
 *   prevent.
 *
 * Ordering and paging (R12/R13) sit on top of the narrowing, in one pipeline:
 *
 * - **Narrow, then order, then slice — in that order.** What is ordered and paged is
 *   what the search and filters LEFT, never the whole fetched set. Slicing first and
 *   narrowing afterwards is the regression this order prevents: a request the user
 *   filtered out would come back on a later page.
 * - **The whole set is ordered once and the page is a slice of it.** Nothing
 *   re-derives the narrowed set per row, which is what the feature NFR's 400ms p95
 *   per-page render at the 10,000-row ceiling needs.
 * - **The heading row is rendered FROM the column definitions**, so every displayed
 *   column has a sort control (R13) by construction. Each one is a real button inside
 *   its `columnheader`, the active column carries `aria-sort`, and the direction is in
 *   the control's own accessible name — the arrow beside it is decoration, and R15
 *   does not let an icon carry state on its own.
 * - **The chosen ordering belongs to the session, not to this component.** It is read
 *   from `lib/transactions/sortPreference.ts` as external state, so it survives leaving
 *   the screen and returning (R13) without being copied into component state.
 * - **The page controls are never taken away.** When the narrowed set fits one page
 *   they are disabled, not removed (R12) — see `RequestListPagination`. The page being
 *   read goes back to the first one whenever the set underneath it changes, because
 *   page 7 of a set the user has just narrowed to four requests is not a page anyone
 *   asked for.
 *
 * Opening one request, and the narrow-viewport presentation (R5/R15/R16/BR1):
 *
 * - **A request opens in a panel OVER the list, one at a time** — the user's own choice
 *   at the stories approval, over an expandable row. This component holds only WHICH
 *   request is open (by id); the panel holds the reveal, so closing it returns the
 *   reader to their place, ordering and page untouched. See `RequestDetailPanel`.
 * - **Still nothing changes a request** (BR1/R5). The only per-request controls are
 *   "open it" — offered directly and through an action overflow, the mechanism R16 asks
 *   for at phone width and the place a later epic's actions will go.
 * - **At phone width the requests are CARDS, not a table.** Which presentation is
 *   rendered is decided by the browser's own media query, watched as external state, so
 *   only one of the two is ever in the markup: a table hidden by CSS would still be read
 *   by assistive technology and would still be the thing a test finds. A wide table in a
 *   sideways-scrolling wrapper does not satisfy R16 either way.
 *
 * Possible duplicates, and who is told about them (R4/R8/R21, BR2/BR3):
 *
 * - **The comparison covers the WHOLE fetched set, once per load.** Which requests are
 *   marked is worked out from every request that came back — see
 *   `lib/transactions/duplicates.ts` for the key and the rejected-request exclusion —
 *   and then carried through the narrow → order → slice pipeline by id. Comparing the
 *   requests currently on screen instead would make the mark depend on the search term,
 *   the filters, the ordering and the page: two matching requests on different pages
 *   would each look unique (story 6 AC-5).
 * - **The mark is a memo of the fetched data, never an effect.** An effect that
 *   re-derived it per render would raise the Approver's notification again every time
 *   the list re-rendered — a keystroke in the search box would bring a dismissed
 *   notification back.
 * - **Only the Approver is notified, once per load** (R21). `roles` is how this client
 *   component learns who is signed in, since the server page holds the session; it
 *   exists for that decision alone. The marks themselves are identical for both roles,
 *   and neither role is offered anything to DO about a duplicate in this epic (BR1).
 *   An Importer sees the marks and is told nothing. Note this is deliberately UNLIKE
 *   the previous epic's import notification, which is not role-gated.
 * - **Which duplicates the user has already been told about lives in a ref**, keyed by
 *   request id, exactly as `SubmittedFilesList` remembers which files it has announced.
 *   That is what makes a dismissed notification stay dismissed across every later
 *   re-render, while a duplicate that appears in a LATER read is still news.
 *
 * Exporting the listed requests for the payment system (csv-export R1/R2/R3):
 *
 * - **The export is handed the ORDERED, NARROWED set, not the page on screen.** The
 *   pipeline above already holds it as `orderedRequests`, so the export is one more
 *   reader of that array — every request the search and filters left, in the order the
 *   list is sorted. Handing it `requestsOnPage` would ship a one-page file that looks
 *   perfectly correct on screen, and handing it the fetched set would ignore the
 *   narrowing (csv-export BR1). Both are silent corruptions of a hand-over file a machine
 *   reads next.
 * - **The file itself is built only when the control is activated**, and the account
 *   number goes into it WHOLE — the one documented exception to the masking rule the rest
 *   of this component obeys. Both are `ExportRequestsAction`'s and
 *   `lib/transactions/exportCsv.ts`'s business, which is where the reasoning lives.
 * - **The control carries no role check**, unlike submitting a file: both roles may
 *   export whatever each has listed.
 * - **What the export TELLS the user is the export control's own business too** (R4/BR2):
 *   a completed export raises the app's one notification naming how many requests went
 *   into the file, who produced it and when, and a narrowing that has hidden everything
 *   produces no file and says so. This component contributes two things to that and
 *   nothing else — the ordered, narrowed set, and the signed-in person's name from the
 *   `exportedBy` prop, which it passes straight through. The narrowed-empty sentence is
 *   the SAME one the rows' place shows (`NARROWED_EMPTY_MESSAGE`, stated once in
 *   `lib/transactions/narrowing.ts`): two near-identical sentences on one screen read as
 *   two different answers.
 *
 * Deciding one request (`expense-decisions` R1/R10/R11/R12/R14/R15, BR3/BR6/BR7):
 *
 * - **This component owns the decide flow; the row, the card and the panel only ask.**
 *   `RequestActions` and `RequestDetailPanel` are handed `onDecide` — and handed it
 *   ONLY for an Approver looking at a request that is still `Imported` — so a reader who
 *   may not decide, or a request that has already been decided, has no decide control in
 *   its markup at all. Absent, never disabled: the project's rule everywhere, and the
 *   thing a greyed-out Approve would quietly break.
 * - **The two decisions are DIRECT controls on the row and on the card** (user decision
 *   at manual test), not items in the ⋯ overflow, which now holds only Open — so
 *   deciding a request costs one activation rather than two. They are therefore on
 *   screen once per listed request, which is why each one's accessible name carries the
 *   request's reference; "Approve" alone would be a screenful of identical controls.
 * - **Nothing is sent until the confirmation is accepted** (R10/BR6). Choosing Approve
 *   or Reject only records WHICH decision is being asked about; the shared
 *   `ConfirmAction` then names the request by its reference, holds focus on the way out
 *   (NFR2) and prints no account number — naming a request must not defeat the masking
 *   the list applies (project.md §Compliance).
 * - **A rejection is asked WHY first** (R7/R9/BR4). Choosing Reject opens
 *   `RejectionNoteStep` — a step of its own, BETWEEN the action and the confirmation,
 *   never inside it: the confirmation's way out holds focus precisely so a stray Enter
 *   decides nothing, and an editable field in it would defeat that. Approving asks for
 *   no note at all. The note then travels with the decision as `UserNote`, and the
 *   same request's confirmation is the same shared dialog either way.
 * - **The confirmation closes as the decision is submitted, whichever way it turns
 *   out.** A refusal is reported behind it, through the app's one notification surface:
 *   a user is never held in a dialog to read why nothing happened, and a message trapped
 *   behind an open dialog is unreachable to a screen reader anyway.
 * - **The outcome arrives by RE-READING, never out of the answer.** Both decide
 *   operations return the same generic envelope whatever happened (brief BR1), so a
 *   recorded decision is followed by a fresh `GET /v1/transactions`, and it is that read
 *   which moves the request's status, withdraws its decide actions and updates the
 *   opened panel. A re-read that fails leaves the last known rows on screen.
 * - **AND THE REQUEST IS RE-READ BEFORE ANYTHING IS SENT** (brief BR1, R4/R13). That
 *   same envelope is also what a decide call answers when the request was ALREADY
 *   decided, so nothing in the answer can tell an Approver they were beaten to it. An
 *   accepted confirmation therefore reads `GET /v1/transactions` FIRST and sends the
 *   decision only while that fresh read still shows the request awaiting one; otherwise
 *   it refuses locally — no decide call at all — tells the Approver in R4/R13's words,
 *   and leaves them looking at the decision that was actually recorded, because the
 *   same read is what puts it on screen. There are now two re-reads in the decide path
 *   and they answer different questions: this one asks "may I still?", the one after a
 *   recorded decision asks "what happened?".
 * - **The two notification lifetimes are the R11 rule, not a choice per message**: a
 *   recorded decision confirms itself on the toast's default 5s (inside the 4-8s
 *   window) and fades; a decision that was NOT recorded is something the Approver has to
 *   act on, so it is raised with `duration: 0` and waits for them.
 * - **A decision that STICKS hands the keyboard back** (NFR1). The decide controls the
 *   Approver was standing on are withdrawn the moment the request stops awaiting a
 *   decision, and a control that is removed while it holds focus drops it on the floor —
 *   the whole page has to be walked again to reach anything. So this component names the
 *   request whose controls are going (`handOffFocusTo`) and the request's own surface
 *   moves focus to its Open control; see `RequestActions`. It is asked for wherever the
 *   offer ENDS — the decision the Approver recorded, and the one a fresh read shows
 *   somebody else had already recorded — and nowhere the request is left exactly as it
 *   was: a refused decision keeps its controls, and focus comes back to them by itself.
 */

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CircleCheck,
  CircleX,
  Inbox,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { ConfirmAction } from '@/components/common/ConfirmAction';
import { AppliedNarrowingSummary } from '@/components/requests/AppliedNarrowingSummary';
import { ExportRequestsAction } from '@/components/requests/ExportRequestsAction';
import { MaskedAccountNumber } from '@/components/requests/MaskedAccountNumber';
import { PossibleDuplicateMark } from '@/components/requests/PossibleDuplicateMark';
import { RejectionNoteStep } from '@/components/requests/RejectionNoteStep';
import { RequestActions } from '@/components/requests/RequestActions';
import { RequestCards } from '@/components/requests/RequestCards';
import { RequestDetailPanel } from '@/components/requests/RequestDetailPanel';
import { RequestListPagination } from '@/components/requests/RequestListPagination';
import { RequestNarrowingControls } from '@/components/requests/RequestNarrowingControls';
import { StatusBadge } from '@/components/status/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/contexts/ToastContext';
import {
  DECISION_REJECT,
  decisionFailureMessage,
  recordDecision,
} from '@/lib/api/decisions';
import {
  fetchTransactions,
  transactionListFailureMessage,
} from '@/lib/api/transactions';
import { UPLOAD_PATH } from '@/lib/auth/access-map';
import {
  isNarrowViewport,
  isNarrowViewportOnServer,
  subscribeToViewportWidth,
} from '@/lib/layout/viewport';
import {
  ALREADY_DECIDED_MESSAGE,
  DECISION_REFUSED_TITLE,
  REQUEST_NO_LONGER_LISTED_MESSAGE,
  WAY_OUT_OF_CONFIRMATION,
  awaitsDecision,
  confirmDecisionLabel,
  confirmationMessageFor,
  confirmationTitleFor,
  decisionInFlightMessage,
  decisionRecordedMessage,
  decisionRecordedTitle,
} from '@/lib/transactions/deciding';
import { transactionTypeLabel } from '@/lib/transactions/display';
import { possibleDuplicateIdsIn } from '@/lib/transactions/duplicates';
import {
  NARROWED_EMPTY_MESSAGE,
  NO_NARROWING,
  appliedNarrowings,
  narrowRequests,
  rangeReports,
  withFilterValue,
} from '@/lib/transactions/narrowing';
import {
  REQUEST_COLUMNS,
  nextSortFor,
  orderRequests,
  pageCountOf,
  pageOf,
  sortStateOf,
} from '@/lib/transactions/ordering';
import {
  rememberSort,
  rememberedSort,
  rememberedSortOnServer,
  subscribeToSort,
} from '@/lib/transactions/sortPreference';
import { PAGINATION } from '@/lib/utils/constants';
import { ROLE_APPROVER } from '@/types/auth';
import {
  TRANSACTION_STATUS_APPROVED,
  TRANSACTION_STATUS_IMPORTED,
  TRANSACTION_STATUS_REJECTED,
  isKnownTransactionStatus,
} from '@/types/transactions';

import type { StatusPresentation } from '@/components/status/StatusBadge';
import type { DecisionOutcome } from '@/lib/api/decisions';
import type {
  NarrowingField,
  RequestNarrowing,
} from '@/lib/transactions/narrowing';
import type {
  RequestColumn,
  RequestColumnDefinition,
  RequestSort,
} from '@/lib/transactions/ordering';
import type { ProjectRole } from '@/types/auth';
import type {
  TransactionRead,
  TransactionReadList,
  TransactionStatus,
} from '@/types/transactions';

/** Announced while the list is being read, so the wait is not shapes and motion only. */
const LOADING_MESSAGE = 'Loading the expense requests…';

/** Said once the wait has gone on long enough to be worth mentioning (R11). */
const STILL_LOADING_MESSAGE =
  'Still loading the expense requests. This is taking longer than usual.';

/** Nothing has ever been imported — an answer, not a failure (R9/R17). */
const EMPTY_MESSAGE = 'No expense requests have been imported yet.';

/** The next step from that empty state: send a file in to be imported. */
const EMPTY_ACTION_LABEL = 'Submit an expense file';

/** Names what did not happen, so the alert is not just an apology. */
const FAILED_TITLE = 'Could not load the expense requests';

/**
 * Requests exist, but everything applied has hidden them all (R10/R18). This is not the
 * never-imported state and must not read like it — nothing here mentions importing, and
 * the upload action is not offered.
 *
 * The sentence itself lives with the narrowing (`lib/transactions/narrowing.ts`) because
 * the export path has to say the SAME thing when activating it produced no file
 * (csv-export BR2). It is re-exported here so every reader of this screen's wording — the
 * rows, the export, and anything asserting there is only ONE such sentence — reaches it
 * from one place.
 */
export { NARROWED_EMPTY_MESSAGE };

/** The way back, in the user's terms — Clear all sits with the summary above it. */
const NARROWED_EMPTY_HINT =
  'Change what is applied, or clear it all, to see the requests again.';

/**
 * Heads the column holding each row's controls. Not sortable — there is no value in it
 * to order by — and read by a screen reader only, since the controls in it name
 * themselves.
 */
const ACTIONS_COLUMN_LABEL = 'Actions';

/** A stable empty set, so narrowing is not recomputed while the list is not loaded. */
const NO_REQUESTS: TransactionRead[] = [];

/**
 * Nobody signed in, as far as this component can tell — which notifies nobody. Stable,
 * so the render that omits the prop does not look like a new set of roles each time.
 */
const NO_ROLES: ProjectRole[] = [];

/** Heads the Approver's notification when a load finds possible duplicates (R21). */
const DUPLICATES_FOUND_TITLE = 'Possible duplicates found';

/**
 * What the Approver is told: how many requests the load marked, why, and that nothing
 * has happened to them. ONE sentence for the load, however many requests were marked —
 * a notification per marked request would bury the screen it is pointing at.
 *
 * Always plural: a match takes at least two requests, so a load that marks anything
 * marks two or more.
 */
const duplicatesFoundMessage = (markedRequests: number): string =>
  `${String(markedRequests)} expense requests share an account number, amount and ` +
  'transaction date with another request. They are marked in the list; nothing has ' +
  'been decided on any of them.';

/**
 * The two thresholds R11/R19 fix. Real durations, deliberately not shortened or
 * made injectable: a threshold a test can move is a threshold nobody has to meet.
 */
const PLACEHOLDER_AFTER_MS = 300;
const STILL_LOADING_AFTER_MS = 3000;

/**
 * How much of the wait the user is shown: nothing at all, a placeholder standing in
 * for the pending list, or that placeholder plus a still-loading message.
 */
type WaitTier = 'brief' | 'placeholder' | 'prolonged';

/**
 * A decision the reader has been asked to confirm. Holding the request itself (not just
 * its id) is what lets the confirmation name it even as the list re-reads underneath.
 */
interface PendingDecision {
  request: TransactionRead;
  outcome: DecisionOutcome;
  /**
   * The reason a rejection carries (R2/R7). Written at the step before this one and
   * held here until the confirmation is accepted, so it travels with the decision
   * rather than being asked for again. An approval never has one (R9).
   */
  note?: string;
}

/**
 * A decision already on its way. Announced per REQUEST rather than as one shared "busy"
 * flag, so two decisions in flight at once cannot clear each other's announcement.
 */
interface DecisionInFlight {
  requestId: number;
  message: string;
}

/** Where the list is: being read, read, or unreadable. */
type ListState =
  | { phase: 'loading'; wait: WaitTier }
  | { phase: 'loaded'; requests: TransactionRead[] }
  | { phase: 'failed'; message: string };

const LOADING: ListState = { phase: 'loading', wait: 'brief' };

/**
 * What each recognised status MEANS (brief §Data Model, R14): an imported request is
 * simply where it stands, an approved one finished well, a rejected one was refused.
 * The colours those intents wear belong to the shared badge.
 *
 * "Cancelled" is not here on purpose: it is a FILE state, and a cancelled file's
 * requests never reach this list. The shared badge keeps a neutral intent available
 * for it, so its absence from this map is expected rather than an omission.
 */
const STATUS_PRESENTATION: Record<TransactionStatus, StatusPresentation> = {
  [TRANSACTION_STATUS_IMPORTED]: { intent: 'informational', icon: Inbox },
  [TRANSACTION_STATUS_APPROVED]: { intent: 'positive', icon: CircleCheck },
  [TRANSACTION_STATUS_REJECTED]: { intent: 'negative', icon: CircleX },
};

/**
 * The requests in a response body, tolerating a body that carries none: an absent
 * property is the empty list, which is a legitimate answer and not a failure.
 */
const requestsIn = (
  body: TransactionReadList | undefined,
): TransactionRead[] =>
  Array.isArray(body?.Transactions) ? body.Transactions : [];

/**
 * How one request's status reads, or `undefined` for a value this app has never heard
 * of — which the shared badge shows neutral, in the service's own words.
 */
const presentationOf = (
  request: TransactionRead,
): StatusPresentation | undefined =>
  isKnownTransactionStatus(request.Status)
    ? STATUS_PRESENTATION[request.Status]
    : undefined;

/**
 * One request's row: the service's values, its type in plain language, its status, and
 * the controls that open it.
 *
 * Memoised, and its props kept stable for that reason — the request itself, whether the
 * load marked it a possible duplicate (a plain boolean, so the memo still holds), and
 * one callback that takes the request rather than a fresh closure per row. A row's
 * contents depend on nothing else, so a keystroke in the search box or a range bound
 * that leaves the page unchanged re-renders no rows at all. That is what keeps a page
 * render inside the feature NFR's 400ms p95 at the 10,000-row ceiling, where every row
 * carries an action overflow of its own.
 */
const ExpenseRequestRow = memo(function ExpenseRequestRow({
  request,
  possibleDuplicate,
  canDecide,
  handOffFocus,
  onFocusHandedOff,
  onOpen,
  onDecide,
}: {
  request: TransactionRead;
  possibleDuplicate: boolean;
  /**
   * Whether this reader is offered a decision on THIS request. A plain boolean, worked
   * out by the list from who is signed in and the request's own status, so the memo
   * still holds and the row itself judges nothing.
   */
  canDecide: boolean;
  /** Whether this row's decide controls are the ones going away (see `RequestActions`). */
  handOffFocus: boolean;
  onFocusHandedOff: () => void;
  onOpen: (request: TransactionRead) => void;
  onDecide: (request: TransactionRead, outcome: DecisionOutcome) => void;
}) {
  return (
    <TableRow>
      <TableCell>{request.FileName}</TableCell>
      <TableCell className="font-medium">{request.Reference}</TableCell>
      <TableCell className="whitespace-nowrap">
        {request.TransactionDate}
      </TableCell>
      <TableCell>
        <MaskedAccountNumber accountNumber={request.AccountNumber} />
      </TableCell>
      <TableCell>{request.Description}</TableCell>
      <TableCell className="text-right tabular-nums">
        {request.Amount}
      </TableCell>
      <TableCell>{transactionTypeLabel(request.TransactionType)}</TableCell>
      <TableCell>
        {/* Where the request stands, and — beside it, in words — whether another
            request in the same load repeats it (R8). The mark sits in the row itself
            so it is readable without opening anything, and it is one element carrying
            one phrase. */}
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge
            status={request.Status}
            presentation={presentationOf(request)}
          />
          {possibleDuplicate && <PossibleDuplicateMark />}
        </div>
      </TableCell>
      <TableCell>
        <RequestActions
          reference={request.Reference}
          handOffFocus={handOffFocus}
          onFocusHandedOff={onFocusHandedOff}
          onOpen={() => {
            onOpen(request);
          }}
          onDecide={
            canDecide
              ? (outcome) => {
                  onDecide(request, outcome);
                }
              : undefined
          }
        />
      </TableCell>
    </TableRow>
  );
});

/** The arrow beside a heading. Decoration: the direction is in the name, not here. */
const SORT_ICONS = {
  ascending: ArrowUp,
  descending: ArrowDown,
  none: ArrowUpDown,
};

/**
 * One column's heading and the control that orders the list by it (R13/R15).
 *
 * The `columnheader` carries the state (`aria-sort`) and the button carries the
 * action, which is the standard accessible sorting pattern: a clickable `<th>` would be
 * unreachable by keyboard, and an arrow on its own would leave the direction to
 * eyesight alone. Only the column in force reports a direction — ordering is
 * single-field, so every other column says `none`.
 */
function SortableColumnHeading({
  column,
  sort,
  onSort,
}: {
  column: RequestColumnDefinition;
  sort: RequestSort | null;
  onSort: (column: RequestColumn) => void;
}) {
  const direction = sortStateOf(sort, column.key);
  const SortIcon = SORT_ICONS[direction];

  return (
    <TableHead
      scope="col"
      aria-sort={direction}
      className={column.numeric === true ? 'text-right' : undefined}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-mx-2"
        onClick={() => {
          onSort(column.key);
        }}
      >
        {column.label}
        {direction !== 'none' && (
          <span className="sr-only">, sorted {direction}</span>
        )}
        <SortIcon
          aria-hidden="true"
          className={direction === 'none' ? 'opacity-50' : undefined}
        />
      </Button>
    </TableHead>
  );
}

interface ExpenseRequestListProps {
  /**
   * The recognised roles the signed-in person holds, from the server page that has the
   * session (`rolesOf(session)`) — this is a client component and cannot read it.
   *
   * It decides ONE thing: who is notified when a load finds a possible duplicate (R21,
   * the Approver only). The list itself is the same for both roles, and neither is
   * offered anything that changes a request (R20/BR1). Optional on purpose — a render
   * that omits it simply notifies nobody.
   */
  roles?: ProjectRole[];
  /**
   * The signed-in person's NAME, from the same server page (`displayNameOf(session)`).
   *
   * It exists for one purpose too: an export is attributed to whoever produced it
   * (csv-export R4 — the second half of that epic's mandatory compliance exception), and
   * this screen is where an export is asked for. Nothing here reads an identity from the
   * browser; this is handed down to the export control unchanged, exactly as
   * `SubmittedFileDetail` is handed its `actingUploader`. Optional for the same reason: a
   * render with no session behind it has no name to give.
   */
  exportedBy?: string;
}

export function ExpenseRequestList({
  roles = NO_ROLES,
  exportedBy,
}: ExpenseRequestListProps) {
  const [state, setState] = useState<ListState>(LOADING);
  /** Bumped by Try again; asking for the list again is what re-runs the read. */
  const [readsRequested, setReadsRequested] = useState(0);

  /**
   * What the user has applied. Every control reads this one, so each shows its own
   * chosen value the instant it is chosen.
   */
  const [narrowing, setNarrowing] = useState<RequestNarrowing>(NO_NARROWING);
  /** What the search box holds, spaces and all; the term applied is the trimmed one. */
  const [searchInput, setSearchInput] = useState('');

  /**
   * The ordering in force. It belongs to the SESSION, not to this component, so it
   * survives leaving the screen and coming back (R13) — watched as external state
   * rather than copied into a `useState` an effect would have to fill in.
   */
  const sort = useSyncExternalStore(
    subscribeToSort,
    rememberedSort,
    rememberedSortOnServer,
  );

  /** How many requests a page holds, and which page is being read (from 0). */
  const [pageSize, setPageSize] = useState<number>(
    PAGINATION.DEFAULT_PAGE_SIZE,
  );
  const [pageIndex, setPageIndex] = useState(0);

  /**
   * Which request is open, by id — never a copy of the request itself, so what the panel
   * shows is always the fetched set's own values. `null` is "the reader is on the list".
   */
  const [openRequestId, setOpenRequestId] = useState<number | null>(null);

  /**
   * The decision the reader is being asked to confirm, if any. Choosing Approve or
   * Reject only sets this: nothing is sent until the confirmation is accepted (R10).
   */
  const [pendingDecision, setPendingDecision] =
    useState<PendingDecision | null>(null);

  /**
   * The request whose rejection note is being written, if any (R7/R9/BR4). A step of
   * its own, before the confirmation: while this is open nothing has been sent and
   * nothing has been confirmed. `null` means no rejection is being written.
   */
  const [rejectionBeingWritten, setRejectionBeingWritten] =
    useState<TransactionRead | null>(null);

  /** The decisions currently on their way, one entry per request. */
  const [decisionsInFlight, setDecisionsInFlight] = useState<
    DecisionInFlight[]
  >([]);

  /**
   * The request whose decide controls are being taken off the screen, by id — the one
   * the Approver just decided, or the one a fresh read has just shown was decided by
   * somebody else. Its surface hands the keyboard to its own Open control rather than
   * letting a control disappear with focus on it (NFR1 — see this file's header).
   *
   * `null` the rest of the time. It STANDS until the request's own controls report the
   * hand-off done, because the read that withdraws them is a round trip away — and it
   * cannot fire twice or fire late, since the controls hand the keyboard over only on
   * the commit that takes them off the screen, which happens once per decision.
   */
  const [handOffFocusTo, setHandOffFocusTo] = useState<number | null>(null);

  /** The hand-off has happened; nothing is waiting for the keyboard any more. */
  const focusHandedOff = useCallback((): void => {
    setHandOffFocusTo(null);
  }, []);

  /** The app's one notification surface, in the root layout (R21, and R11/R15). */
  const { showToast } = useToast();

  /**
   * Which possible duplicates the user has already been told about, by request id. This
   * is a record of what has been SAID, not something rendered, so it lives in a ref —
   * the same arrangement `SubmittedFilesList` uses to tell a file that has just finished
   * from one that was already finished when the screen opened.
   *
   * It is what makes a dismissed notification stay dismissed: re-rendering the list for
   * any reason — a keystroke, a sort, a page change — finds nothing new to announce.
   */
  const duplicatesAlreadyAnnounced = useRef<Set<number>>(new Set());

  /**
   * Whether the reader is at phone width. The browser already knows before React runs,
   * so it is watched rather than copied into state (see `lib/layout/viewport.ts`).
   */
  const narrowViewport = useSyncExternalStore(
    subscribeToViewportWidth,
    isNarrowViewport,
    isNarrowViewportOnServer,
  );

  /**
   * Reads the list and puts what came back on screen.
   *
   * `stillWatching` is how a caller says its read no longer matters: this component
   * has gone away, or the user has asked for the list again.
   */
  const readList = useCallback(
    (stillWatching: () => boolean): Promise<void> =>
      fetchTransactions()
        .then((body) => {
          if (!stillWatching()) {
            return;
          }
          setState({ phase: 'loaded', requests: requestsIn(body) });
        })
        .catch((error: unknown) => {
          if (!stillWatching()) {
            return;
          }
          // The service's own wording when it sent one, from either place a failure
          // can carry it — never the client's placeholder, which is plumbing
          // (project.md NFR-base-5).
          setState({
            phase: 'failed',
            message: transactionListFailureMessage(error),
          });
        }),
    [],
  );

  useEffect(() => {
    // A read still in flight when this component goes away — or when the user asks
    // for the list again — must not land on a screen that has moved on.
    let watching = true;

    /**
     * Moves the wait on one tier, and only while the list is still being read: a
     * timer that fires just after the answer arrived must not put a placeholder back
     * over rows that are already on screen.
     */
    const showWaitTier = (wait: WaitTier): void => {
      if (!watching) {
        return;
      }
      setState((current) =>
        current.phase === 'loading' ? { phase: 'loading', wait } : current,
      );
    };

    const placeholderTimer = setTimeout(() => {
      showWaitTier('placeholder');
    }, PLACEHOLDER_AFTER_MS);
    const stillLoadingTimer = setTimeout(() => {
      showWaitTier('prolonged');
    }, STILL_LOADING_AFTER_MS);

    const stopWaiting = (): void => {
      clearTimeout(placeholderTimer);
      clearTimeout(stillLoadingTimer);
    };

    void readList(() => watching).finally(stopWaiting);

    return () => {
      watching = false;
      stopWaiting();
    };
  }, [readsRequested, readList]);

  const readAgain = (): void => {
    setState(LOADING);
    setReadsRequested((reads) => reads + 1);
  };

  /**
   * The term narrows as the user types (R6), with no timer in the way: a debounce long
   * enough to matter is a debounce the user waits out, and the responsiveness the
   * feature NFR asks for at the 10,000-row ceiling comes from `useDeferredValue` below
   * instead — React keeps the keystrokes smooth by re-filtering at lower priority.
   * Trimmed on the way in: surrounding spaces are typing, not something to narrow by.
   */
  const changeSearchInput = (value: string): void => {
    setSearchInput(value);
    setNarrowing((current) => ({ ...current, search: value.trim() }));
    setPageIndex(0);
  };

  /**
   * A filter choice, or one end of a range, applies as it is made — nothing to commit.
   * A range bound is kept exactly as it was typed; whether it can be used as a bound at
   * all is the narrowing layer's decision, not this screen's.
   */
  const changeFilter = (field: NarrowingField, value: string): void => {
    setNarrowing((current) => withFilterValue(current, field, value));
    setPageIndex(0);
  };

  /** R18: the search term and every filter go at once, and the whole set is back. */
  const clearAllNarrowing = (): void => {
    setSearchInput('');
    setNarrowing(NO_NARROWING);
    setPageIndex(0);
  };

  /**
   * R13: ascending the first time a column is asked for, descending the second. The
   * reader goes back to the first page, because the request that was at the top of page
   * three is not where they were looking once the whole list has been re-ordered.
   */
  const sortBy = (column: RequestColumn): void => {
    rememberSort(nextSortFor(sort, column));
    setPageIndex(0);
  };

  /** A different page size re-cuts the set, so it starts again from the first page. */
  const changePageSize = (size: number): void => {
    setPageSize(size);
    setPageIndex(0);
  };

  /**
   * Opening one request changes nothing else: the narrowing, the ordering and the page
   * are all left where they are, so closing the panel returns the reader to their place.
   *
   * Stable, because every row holds it: a callback rebuilt each render would make the
   * memoised rows re-render on every keystroke, which is the cost they exist to avoid.
   */
  const openRequest = useCallback((request: TransactionRead): void => {
    setOpenRequestId(request.Id);
  }, []);

  /** Back to the list. The panel goes away, and with it everything it was holding. */
  const closeOpenRequest = useCallback((): void => {
    setOpenRequestId(null);
  }, []);

  /**
   * Choosing a decision asks for it — it does not record it (R10/BR6). A rejection is
   * asked WHY first (R7/R9): the note step comes before the confirmation, and an
   * approval goes straight to it with nothing to write. Stable, because every row and
   * card holds it.
   */
  const askToDecide = useCallback(
    (request: TransactionRead, outcome: DecisionOutcome): void => {
      if (outcome === DECISION_REJECT) {
        setRejectionBeingWritten(request);
        return;
      }
      setPendingDecision({ request, outcome });
    },
    [],
  );

  /** Backing out of the note leaves the request exactly as it was — nothing sent. */
  const abandonRejectionNote = useCallback((): void => {
    setRejectionBeingWritten(null);
  }, []);

  /**
   * Reads the list again WITHOUT taking the rows off the screen, and answers with what
   * came back.
   *
   * Both halves of a decision go through this one read (brief BR1): the check BEFORE
   * anything is sent — is this request still awaiting a decision? — and the outcome
   * AFTER one is recorded, since the decide answer says nothing about the request's new
   * status. Putting what came back on screen is part of the same act, so the rows the
   * decision was judged against are the rows the reader is then looking at.
   *
   * It REJECTS when the read fails, so the caller can tell "the request has been
   * decided already" from "nobody could find out" and refuse rather than send blind.
   */
  const rereadRequests = useCallback(
    (): Promise<TransactionRead[]> =>
      fetchTransactions().then((body) => {
        const requests = requestsIn(body);
        setState((current) =>
          current.phase === 'loaded' ? { phase: 'loaded', requests } : current,
        );
        return requests;
      }),
    [],
  );

  /**
   * The same re-read where the answer is only ever the screen catching up. A read that
   * fails changes nothing: the last known rows stay, and the failed-load state is
   * reserved for a read that left the user with nothing.
   */
  const refreshList = useCallback(
    (): Promise<void> =>
      rereadRequests()
        .then(() => undefined)
        .catch(() => {
          // Nothing to say: the user is still looking at the requests they had.
        }),
    [rereadRequests],
  );

  /**
   * The decision the reader has just accepted. The confirmation is already closing —
   * whichever way this turns out, the answer belongs on the screen behind it and not in
   * a dialog the Approver is left sitting in.
   */
  const recordPendingDecision = (): void => {
    if (pendingDecision === null) {
      return;
    }
    const { request, outcome, note } = pendingDecision;
    setPendingDecision(null);

    // One decision at a time PER REQUEST. Confirming closes the dialog, but the row
    // keeps its `Imported` status — and so its decide actions — until the re-read
    // lands, so the same request can be confirmed again while the first call is still
    // out. Sending a second would be a second decision on the request, and the first
    // call's `finally` below would take the "Recording your approval…" line off the
    // screen while the other was still on its way. The announcement already on screen
    // is the answer to a second press.
    if (
      decisionsInFlight.some((decision) => decision.requestId === request.Id)
    ) {
      return;
    }

    setDecisionsInFlight((current) =>
      current.some((decision) => decision.requestId === request.Id)
        ? current
        : [
            ...current,
            {
              requestId: request.Id,
              message: decisionInFlightMessage(outcome, request.Reference),
            },
          ],
    );

    // BR1, the whole of it: the request's CURRENT status, read fresh, before anything
    // is sent. Both decide operations answer the same envelope whether they recorded
    // the decision or refused it as already made, so this read — never the answer — is
    // the only thing that can tell an Approver somebody got there first.
    void rereadRequests()
      .then((requests) => {
        const asRecorded = requests.find((listed) => listed.Id === request.Id);

        if (asRecorded === undefined || !awaitsDecision(asRecorded)) {
          // Refused here, with NOTHING sent (R4/R13): a decide call at this point
          // would be a second decision on the request, and its answer would look
          // exactly like a first one. The read above has already put what was
          // actually recorded on screen, so the Approver is left looking at that
          // rather than at the state they were acting on.
          showToast({
            variant: 'error',
            title: DECISION_REFUSED_TITLE,
            message:
              asRecorded === undefined
                ? REQUEST_NO_LONGER_LISTED_MESSAGE
                : ALREADY_DECIDED_MESSAGE,
            // Something the Approver has to act on (choose another request), so it
            // waits for them rather than fading while they read elsewhere (R11).
            duration: 0,
          });
          // Nothing was sent, but the request has still stopped awaiting a decision —
          // the read above put somebody else's decision on screen — so its controls are
          // going with the same commit and the keyboard needs somewhere to land.
          setHandOffFocusTo(request.Id);
          return;
        }

        return recordDecision({
          TransactionId: request.Id,
          Decision: outcome,
          // A rejection carries the reason written at the step before this one; an
          // approval carries none at all (R9), so the field is absent rather than
          // empty.
          ...(note === undefined ? {} : { UserNote: note }),
        }).then(() => {
          // Transient: the Approver asked for this and it happened, so it says so and
          // then clears itself (R11's 4-8s window, which the toast's default sits in).
          showToast({
            variant: 'success',
            title: decisionRecordedTitle(outcome),
            message: decisionRecordedMessage(outcome, request.Reference),
          });
          // The keyboard is handed over BEFORE that read can withdraw the control the
          // Approver is standing on (NFR1): asked for here, taken by the request's own
          // controls, whether they see this commit or the one the re-read brings.
          setHandOffFocusTo(request.Id);
          // The answer carries no status, so the request's new state comes from a
          // fresh read — which is also what withdraws its decide actions (R12).
          return refreshList();
        });
      })
      .catch((error: unknown) => {
        // Either the service refused the decision, or the read that had to come first
        // could not be made — and then nothing was sent, because a decision goes out
        // only while the app can see the request is still awaiting one (BR1). Both
        // are the same thing to the Approver: it was not recorded. So it waits for
        // them (R11) and carries the service's own reason, never the client's
        // placeholder.
        showToast({
          variant: 'error',
          title: DECISION_REFUSED_TITLE,
          message: decisionFailureMessage(error),
          duration: 0,
        });
      })
      .finally(() => {
        setDecisionsInFlight((current) =>
          current.filter((decision) => decision.requestId !== request.Id),
        );
      });
  };

  /**
   * What the listed requests and the summary are worked out from. It can trail the
   * controls by a render while React re-filters a large set, which is what keeps typing
   * responsive at the volume ceiling; it always catches up, and both surfaces read the
   * SAME value, so the summary can never name a narrowing the rows do not reflect.
   */
  const appliedNarrowing = useDeferredValue(narrowing);

  /** The whole fetched set — what the filters offer their choices from. */
  const fetchedRequests =
    state.phase === 'loaded' ? state.requests : NO_REQUESTS;

  /**
   * Which requests this load marks as possible duplicates (BR2/BR3), worked out over the
   * WHOLE fetched set and keyed on it — so it is derived once per load and not again
   * until the list is read again. Narrowing, ordering and paging all happen downstream
   * of this, and none of them can change what it holds (story 6 AC-5).
   *
   * A memo of the data, deliberately, not an effect: an effect would re-derive on every
   * render and re-raise the notification below with it.
   */
  const possibleDuplicateIds = useMemo(
    () => possibleDuplicateIdsIn(fetchedRequests),
    [fetchedRequests],
  );

  /**
   * Whether the person reading this is an Approver — the one R21 asks to be told about
   * possible duplicates, and the only one who may decide a request at all
   * (`expense-decisions` R14/BR7). Both answers come from the one `roles` prop the
   * server page fills; there is no second, client-side gate.
   */
  const isApprover = roles.includes(ROLE_APPROVER);

  /**
   * R21: when a load finds at least one possible duplicate, the Approver is told — ONCE
   * for the load, however many requests it marked, and only about requests they have not
   * already been told about. An Importer is told nothing: they see the marks in the list,
   * which is all R8 asks for.
   *
   * The notification does not time out. It is a warning the Approver is meant to act on
   * (by looking at the marked requests), so it stays until they dismiss it rather than
   * disappearing while they are reading elsewhere on the screen.
   */
  useEffect(() => {
    if (!isApprover) {
      return;
    }
    const announced = duplicatesAlreadyAnnounced.current;
    const newlyMarked = [...possibleDuplicateIds].filter(
      (id) => !announced.has(id),
    );
    if (newlyMarked.length === 0) {
      return;
    }
    newlyMarked.forEach((id) => announced.add(id));
    showToast({
      variant: 'warning',
      title: DUPLICATES_FOUND_TITLE,
      message: duplicatesFoundMessage(possibleDuplicateIds.size),
      duration: 0,
    });
  }, [isApprover, possibleDuplicateIds, showToast]);

  /** Recomputed only when the set or the narrowing changes, never per render. */
  const visibleRequests = useMemo(
    () => narrowRequests(fetchedRequests, appliedNarrowing),
    [fetchedRequests, appliedNarrowing],
  );
  const applied = useMemo(
    () => appliedNarrowings(appliedNarrowing),
    [appliedNarrowing],
  );
  /**
   * A range the user has entered the wrong way round. Read from the SAME value the rows
   * and the summary are, so the screen can never report a range it is quietly applying —
   * or apply one it says it has not.
   */
  const reports = useMemo(
    () => rangeReports(appliedNarrowing),
    [appliedNarrowing],
  );

  /**
   * The one pipeline: narrow → order → slice. The narrowed set is ordered ONCE per
   * change and the page is a slice of that array, which is what keeps a page render
   * inside the feature NFR's 400ms p95 at the 10,000-row ceiling.
   */
  const orderedRequests = useMemo(
    () => orderRequests(visibleRequests, sort),
    [visibleRequests, sort],
  );
  const pageCount = pageCountOf(orderedRequests.length, pageSize);
  /**
   * The page actually shown. Every control that changes the set underneath already
   * returns the reader to the first page; this keeps them on a real page even when the
   * set shrinks from somewhere else (the deferred narrowing catching up, a re-read
   * returning fewer requests), without a render-time state update to do it.
   */
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  const requestsOnPage = useMemo(
    () => pageOf(orderedRequests, currentPageIndex, pageSize),
    [orderedRequests, currentPageIndex, pageSize],
  );

  /**
   * The request the panel is showing, resolved from the fetched set rather than kept as
   * a copy — so the panel can never show a value the list no longer holds. A request
   * that is no longer there closes the panel rather than freezing an old version of it.
   */
  const openedRequest = useMemo(
    () =>
      openRequestId === null
        ? null
        : (fetchedRequests.find((request) => request.Id === openRequestId) ??
          null),
    [fetchedRequests, openRequestId],
  );

  return (
    <div className="grid gap-4">
      {state.phase === 'loading' && state.wait !== 'brief' && (
        <div role="status" className="grid gap-2">
          <span className="sr-only">{LOADING_MESSAGE}</span>
          {/* Placeholders stand in for the rows that are on their way; the sentence
              above is what a screen reader is given, since a shape says nothing. */}
          <Skeleton aria-hidden="true" className="h-10 w-full" />
          <Skeleton aria-hidden="true" className="h-10 w-full" />
          <Skeleton aria-hidden="true" className="h-10 w-full" />
          {state.wait === 'prolonged' && (
            <p className="text-muted-foreground text-sm">
              {STILL_LOADING_MESSAGE}
            </p>
          )}
        </div>
      )}

      {state.phase === 'failed' && (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none">{FAILED_TITLE}</AlertTitle>
          <AlertDescription className="text-foreground gap-3">
            <p>{state.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={readAgain}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {state.phase === 'loaded' && state.requests.length === 0 && (
        <div className="grid justify-items-start gap-4">
          <p className="text-muted-foreground max-w-prose">{EMPTY_MESSAGE}</p>
          {/* The next step, as a real navigational link rather than a button that
              pushes a route. Offered ONLY here: nothing has ever been imported
              (R9/R17), which is a different answer from a narrowing that hid
              everything (R10/R18) — see this file's header. */}
          <Button asChild variant="outline">
            <Link href={UPLOAD_PATH}>{EMPTY_ACTION_LABEL}</Link>
          </Button>
        </div>
      )}

      {state.phase === 'loaded' && state.requests.length > 0 && (
        <>
          {/* The hand-over file for the payment system (csv-export R1/R3), offered to
              both roles with no role check of any kind — see `ExportRequestsAction`.
              What it exports is `orderedRequests`: every request the search and filters
              LEFT, in the order the list is sorted, never the page on screen and never
              the whole fetched set (BR1). It sits above the controls that decide that
              set, so a keyboard user reaches it early. */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ExportRequestsAction
              listedRequests={orderedRequests}
              exportedBy={exportedBy}
            />
          </div>

          {/* The choices come from the WHOLE fetched set, so a filter always offers
              its own way back out of what it narrowed to. */}
          <RequestNarrowingControls
            requests={state.requests}
            searchInput={searchInput}
            onSearchInputChange={changeSearchInput}
            narrowing={narrowing}
            onFilterChange={changeFilter}
          />

          {/* A range the wrong way round is reported here and applied nowhere: the list
              stays as it was, which is the whole point (R7 against R10/R18). The report
              is announced as it appears, so it is not something only a sighted user
              notices when the list fails to change. */}
          {reports.map((report) => (
            <Alert key={report.id}>
              <TriangleAlert aria-hidden="true" />
              <AlertTitle className="line-clamp-none">
                {report.field}
              </AlertTitle>
              <AlertDescription className="text-foreground">
                <p>{report.message}</p>
              </AlertDescription>
            </Alert>
          ))}

          {applied.length > 0 && (
            <AppliedNarrowingSummary
              applied={applied}
              onClearAll={clearAllNarrowing}
            />
          )}

          {/* One line per decision on its way. Announced, because nothing on screen
              has changed yet: the request keeps its status until the re-read. */}
          {decisionsInFlight.map((decision) => (
            <p
              key={decision.requestId}
              role="status"
              className="text-muted-foreground text-sm"
            >
              {decision.message}
            </p>
          ))}

          {visibleRequests.length === 0 ? (
            <div className="grid gap-2">
              <p className="max-w-prose">{NARROWED_EMPTY_MESSAGE}</p>
              <p className="text-muted-foreground max-w-prose text-sm">
                {NARROWED_EMPTY_HINT}
              </p>
            </div>
          ) : (
            /* One presentation or the other, never both: see this file's header. The
               tooltip provider is context only and renders nothing of its own. */
            <TooltipProvider>
              {narrowViewport ? (
                <RequestCards
                  requests={requestsOnPage}
                  presentationOf={presentationOf}
                  possibleDuplicateIds={possibleDuplicateIds}
                  mayDecide={isApprover}
                  handOffFocusTo={handOffFocusTo}
                  onFocusHandedOff={focusHandedOff}
                  onOpenRequest={openRequest}
                  onDecideRequest={askToDecide}
                />
              ) : (
                <Table>
                  <TableCaption className="sr-only">
                    Imported expense payment requests: the file each came from,
                    its reference, transaction date, the last four digits of its
                    account number, its description, amount, transaction type
                    and status, and the controls each request offers — opening
                    it, and, where one is still awaiting a decision and you may
                    make it, approving or rejecting it. Every value heading
                    orders the list by its own column.
                  </TableCaption>
                  <TableHeader>
                    {/* Drawn from the column definitions, so every displayed
                        column has a sort control (R13) rather than most of them
                        having one. */}
                    <TableRow>
                      {REQUEST_COLUMNS.map((column) => (
                        <SortableColumnHeading
                          key={column.key}
                          column={column}
                          sort={sort}
                          onSort={sortBy}
                        />
                      ))}
                      {/* The controls column: no value in it, so nothing to
                          order by. */}
                      <TableHead scope="col" className="text-right">
                        <span className="sr-only">{ACTIONS_COLUMN_LABEL}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requestsOnPage.map((request) => (
                      <ExpenseRequestRow
                        key={request.Id}
                        request={request}
                        possibleDuplicate={possibleDuplicateIds.has(request.Id)}
                        canDecide={isApprover && awaitsDecision(request)}
                        handOffFocus={handOffFocusTo === request.Id}
                        onFocusHandedOff={focusHandedOff}
                        onOpen={openRequest}
                        onDecide={askToDecide}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </TooltipProvider>
          )}

          {/* Always on the screen, whether or not there is anywhere to page to
              (R12) — including when the narrowing has left nothing listed. */}
          <RequestListPagination
            total={orderedRequests.length}
            pageSize={pageSize}
            onPageSizeChange={changePageSize}
            pageIndex={currentPageIndex}
            pageCount={pageCount}
            onPageChange={setPageIndex}
          />

          {/* One request at a time, over the list. It is MOUNTED only while open, which
              is what makes its reveal die with it (POPIA — see `RequestDetailPanel`);
              the list keeps its narrowing, ordering and page underneath, so closing
              puts the reader back exactly where they were. */}
          {openedRequest !== null && (
            <RequestDetailPanel
              key={openedRequest.Id}
              request={openedRequest}
              statusPresentation={presentationOf(openedRequest)}
              onDecide={
                isApprover && awaitsDecision(openedRequest)
                  ? (outcome) => {
                      askToDecide(openedRequest, outcome);
                    }
                  : undefined
              }
              onClose={closeOpenRequest}
            />
          )}
        </>
      )}

      {/* Why, before anything is confirmed (R7/R9/BR4) — and only for a rejection.
          Mounted only while a note is being written, and it decides nothing itself:
          the note it hands back is what opens the confirmation below. */}
      {rejectionBeingWritten !== null && (
        <RejectionNoteStep
          key={rejectionBeingWritten.Id}
          reference={rejectionBeingWritten.Reference}
          onNoteWritten={(note) => {
            setRejectionBeingWritten(null);
            setPendingDecision({
              request: rejectionBeingWritten,
              outcome: DECISION_REJECT,
              note,
            });
          }}
          onCancel={abandonRejectionNote}
        />
      )}

      {/* Asked from the row's overflow and from the opened request alike, so it lives
          out here with the flow it belongs to rather than inside either of them. It is
          mounted only while a decision is pending: closing it is what ends the ask. */}
      {pendingDecision !== null && (
        <ConfirmAction
          open
          onOpenChange={(stillAsking) => {
            if (!stillAsking) {
              setPendingDecision(null);
            }
          }}
          title={confirmationTitleFor(
            pendingDecision.outcome,
            pendingDecision.request.Reference,
          )}
          description={confirmationMessageFor(pendingDecision.outcome)}
          confirmLabel={confirmDecisionLabel(pendingDecision.outcome)}
          wayOutLabel={WAY_OUT_OF_CONFIRMATION}
          onConfirm={recordPendingDecision}
        />
      )}
    </div>
  );
}
