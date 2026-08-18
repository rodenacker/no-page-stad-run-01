'use client';

/**
 * The expense request listing as a PHONE-WIDTH reader receives it: the same ruled batch
 * listing the wide screen draws, tightened to one group of ruled lines per request
 * (`request-list-redesign` R4/R10, source UI-23; the file name is kept for continuity —
 * there are no cards left in it).
 *
 * ⚠ **THE CARD IS GONE AND MUST NOT COME BACK.** A Shadcn `Card` per request is a NAMED
 * ANTI-GOAL of this design direction (brief §4): a stack of boxes standing apart on a
 * page is the dashboard treatment the whole redesign replaces. What a narrow reader gets
 * instead is the wide listing's own notation — a reserved gutter, hairline rules that
 * reach both edges of the page, the reference and the figures in mono — with the columns
 * folded into three lines because 360px has no room for nine. Neither this group nor
 * anything inside it may be, or contain, a card.
 *
 * Nine things here are deliberate and easy to break:
 *
 * - **It is a DIFFERENT presentation, not a re-flowed table.** `ExpenseRequestList`
 *   renders this or the table, never both (`lib/layout/viewport.ts` owns the crossover) —
 *   a wide table kept inside a sideways-scrolling wrapper does not satisfy R4, and the
 *   page itself must never scroll sideways at 360px (NFR-base-3's floor). Nothing here
 *   may introduce an `overflow-x` box in its place.
 * - **One list, exactly ONE `listitem` per request.** The list semantics are what tell a
 *   screen reader how many requests there are and where each one begins, and at this
 *   width the requests are the screen's ONLY list — which is why the continuation line's
 *   page controls deliberately avoid `ul`/`li` (`RequestListPagination`). A second,
 *   nested list inside a group would announce the listing as twice its length; a stack of
 *   plain `div`s would announce nothing at all. The `ul` carries an explicit
 *   `role="list"`, because Tailwind's preflight removes the bullets and a bulletless list
 *   loses its role in some browsers.
 * - **The groups RUN TOGETHER as one ruled sequence.** Each group closes with a hairline
 *   and there is no gap between them, so consecutive groups touch — that is what tells a
 *   ruled listing apart from a card stack, by measurement rather than by class name. The
 *   LAST group's rule is the listing's closing edge and therefore the continuation line's
 *   own top edge, exactly as the wide listing's closing hairline is (R14): the foot draws
 *   none of its own, so this one must stay.
 * - **Full-bleed to the layout's padding** (R13): `-mx-4` cancels `<main>`'s `px-4` so
 *   every rule reaches the edge of the page, and each group re-applies that padding
 *   inside, so its values line up with the control block's labels above. Change the
 *   layout's padding and this changes with it.
 * - **THE RESERVED GUTTER IS HERE TOO** (R15/BR5), two characters wide, on every group
 *   and for every reader, empty on an ordinary request and never collapsed when nothing
 *   on the page needs marking. It carries at most one mark, because two characters hold
 *   one: an Approver's selection tick on a request still awaiting a decision, else the
 *   shared `StatusMark` for a decision already recorded, in that intent's own ink. An
 *   exception is a RULE down the group's outer edge instead, so it is never the thing the
 *   tick displaces.
 * - **The gutter is set at ITS OWN scale here, and that is a touch-target decision.** Two
 *   characters of the listing's mono face at the table's text size is about 17px — fine
 *   for a pointer, too small for a finger. So the gutter's own type scale is larger at
 *   this width: two characters still, measured in the same face, but ~24px — which is
 *   what WCAG 2.2 §2.5.8 (target size, minimum) asks of the tick that lives in it, and
 *   what keeps the decision marks readable at arm's length. `min-h-6 min-w-6` is the
 *   floor stated explicitly, so a face whose advance width differs cannot quietly drop
 *   the target under it.
 * - **A group offers exactly what a row offers**, including both decisions as DIRECT
 *   controls: the same `RequestActions`, handed `onDecide` on the same condition the row
 *   applies (an Approver, a request still awaiting a decision). A phone-width reader is
 *   not a read-only reader, and nothing may be reachable only on a wide screen. Those
 *   controls sit on a line of their own rather than beside the reference: three controls
 *   squeezed in at 360px would either crowd the identifier or push the page sideways.
 * - **A decided group RECEDES, it does not disappear** (R20): still listed, every value
 *   on it, its controls still working, simply dropped to ink-on-ground so only the
 *   requests still awaiting a decision hold full contrast. The decision itself keeps full
 *   ink — the gutter's mark, named through `statusInkFor`, and the status beside it.
 * - **No account number is printed here at all.** At this width the reader gets it by
 *   opening the request, where the reveal lives; nothing masked or unmasked is in the
 *   group's markup, which is the strongest form the POPIA requirement can take
 *   (project.md §Compliance).
 *
 * The possible-duplicate mark is the same `PossibleDuplicateMark` the wide row renders —
 * the mark has to be readable in the listing at every width — and which requests carry it
 * is decided once per load over the whole fetched set, upstream of the page this group is
 * on. The same goes for the pre-commit mark (`NotYetConfirmedMark`, R17/BR7): a phone-width
 * reader being asked to confirm a decision sees the batch's after-picture on the affected
 * groups exactly as a wide-screen reader does, and which groups those are is the list's
 * answer, handed down rather than re-derived here.
 */

import { memo } from 'react';

import { FIELD_LABEL_CLASS } from '@/components/requests/fieldNotation';
import { NotYetConfirmedMark } from '@/components/requests/NotYetConfirmedMark';
import { PossibleDuplicateMark } from '@/components/requests/PossibleDuplicateMark';
import { RequestActions } from '@/components/requests/RequestActions';
import {
  StatusBadge,
  StatusMark,
  statusInkFor,
} from '@/components/status/StatusBadge';
import { Checkbox } from '@/components/ui/checkbox';
import { awaitsDecision } from '@/lib/transactions/deciding';
import { REQUEST_COLUMNS } from '@/lib/transactions/ordering';
import { selectRequestLabel } from '@/lib/transactions/selecting';
import { cn } from '@/lib/utils';

import type {
  StatusIntent,
  StatusPresentation,
} from '@/components/status/StatusBadge';
import type { DecisionOutcome } from '@/lib/api/decisions';
import type { RequestColumn } from '@/lib/transactions/ordering';
import type { TransactionRead } from '@/types/transactions';

/** Names the listing itself, since there is no table caption at this width. */
const LIST_LABEL = 'Imported expense payment requests';

/**
 * A key value's own label, in the SAME words the wide listing heads its column with
 * (`lib/transactions/ordering.ts`): a column head and a group's field label are one
 * wording in this design, so the two presentations cannot name the same value
 * differently.
 */
const labelOfColumn = (key: RequestColumn): string =>
  REQUEST_COLUMNS.find((column) => column.key === key)?.label ?? key;

const AMOUNT_LABEL = labelOfColumn('amount');
const TRANSACTION_DATE_LABEL = labelOfColumn('transactionDate');

/**
 * Full-bleed to the page padding (R13 — the same convention the control block, the
 * narrowing strip and the wide listing use): the box is widened past `<main>`'s `px-4` so
 * every hairline reaches the edge of the page, and each group puts that padding back
 * inside.
 */
const PAGE_BLEED_CLASS = '-mx-4';

/**
 * One request's group of ruled lines. The hairline beneath it is the whole treatment —
 * no card, no panel, no surface — and there is no gap above or below it, so consecutive
 * groups touch and the listing reads as one ruled sequence.
 *
 * The left rule is always drawn, transparent unless the request is an exception, so a
 * marked group and an ordinary one line up to the pixel down the page.
 */
const GROUP_CLASS = 'border-b border-l-2 border-l-transparent px-4 py-3';

/**
 * A request that needs attention, marked as a rule down the group's outer edge — the
 * editorial change-bar a reader scans a margin for (R15/R18). It is a RULE rather than a
 * shape because the gutter's two characters may already be carrying the offer to select
 * the request, and a possible duplicate still awaiting a decision is exactly the request
 * an Approver most needs to find. The wording stays beside the status
 * (`PossibleDuplicateMark`), so the mark supplements words and never replaces them (BR3).
 */
const EXCEPTION_RULE_CLASS = 'border-l-warning';

/**
 * A request somebody has already decided: still listed and still readable, dropped to
 * ink-on-ground so only the requests still awaiting a decision hold full contrast (R20).
 * A relative contrast move, not a disabled state and not a dim.
 */
const DECIDED_GROUP_CLASS = 'text-muted-foreground';

/**
 * THE RESERVED GUTTER at this width (R15/BR5) — see the sixth ⚠ in this file's header for
 * why its type scale is its own. Two characters, measured in the listing's own mono face,
 * with the 24px target size as an explicit floor; present and empty on an ordinary
 * request, never collapsed when nothing on the page needs marking.
 */
const GUTTER_CLASS =
  'flex size-[2ch] min-h-6 min-w-6 shrink-0 items-center justify-center font-mono text-xl';

/** A mark in the gutter: the shape drawn at the gutter's own reserved size. */
const GUTTER_MARK_CLASS = 'size-full';

/**
 * The selection control AS ONE OF THE GUTTER'S MARKS (R15/BR5).
 *
 * Still the Shadcn `checkbox` underneath — a real, focusable control that reports its own
 * checked state and answers the Space key — restyled to the gutter's notation and never
 * rebuilt as a `div` with a click handler. Squared off (nothing in this world has a
 * radius) and stripped of the primitive's drop shadow, so an unticked request reads as
 * the taxonomy's hollow rule-box and a ticked one as the inked box. Centred, because at
 * this size the check glyph would otherwise sit against the top edge of the box.
 *
 * The focus ring is deliberately left exactly as the primitive draws it: a two-character
 * column is precisely where a focus indicator gets styled away, and a keyboard user has
 * to be able to see where they are (R5, WCAG 2.2 AA).
 */
const SELECTION_MARK_CLASS = `${GUTTER_MARK_CLASS} flex items-center justify-center rounded-none shadow-none`;

/**
 * A field's label: the screen's one tracked micro-label notation
 * (`components/requests/fieldNotation.ts`), muted so the ink belongs to the value rather
 * than to the word naming it — exactly as the wide listing's column heads are set.
 */
const FIELD_LABEL = `${FIELD_LABEL_CLASS} text-muted-foreground`;

/**
 * A fixed-field value: mono, because that is the notation this design reads a reference
 * and a date in (project.md §Styling & Branding), and tabular for anything that is a
 * figure so digits line up down the page.
 */
const NOTATION_CLASS = 'font-mono';
const FIGURE_CLASS = 'font-mono tabular-nums';

interface RequestLineGroupProps {
  /** The request this group is showing. */
  request: TransactionRead;
  /** How each recognised status reads; the list owns that vocabulary. */
  presentationOf: (request: TransactionRead) => StatusPresentation | undefined;
  /**
   * Which of the shared shapes this request's own state puts in the gutter, and
   * `undefined` for the requests that carry none. Handed down rather than re-derived: the
   * reading it settles — an empty gutter for a request still awaiting a decision, no
   * shape at all for a status this app has never heard of — is stated once, beside the
   * wide listing's own gutter (`ExpenseRequestList`).
   */
  gutterIntentOf: (request: TransactionRead) => StatusIntent | undefined;
  /** Whether this load marked the request a possible duplicate (brief R18/BR3). */
  possibleDuplicate: boolean;
  /**
   * Whether a decision on this request is waiting to be confirmed — this reader's own,
   * single or as part of a selection (R17/BR7). A plain boolean, so the memo holds, and
   * decided by the list, so the mark cannot appear at one width and not the other.
   */
  awaitingConfirmation: boolean;
  /**
   * Whether THIS request may be selected to be approved with others — an Approver, and
   * a request still awaiting a decision (bulk-approval BR1/BR10). False means no
   * control at all in the gutter, never a disabled one; the gutter itself stays either
   * way, since it is reserved for every request and every reader (BR5).
   */
  selectable: boolean;
  /** Whether this request is in the selection. A plain boolean, so the memo holds. */
  selected: boolean;
  /**
   * Whether the selection is being acted on right now, in which case the tick cannot be
   * moved. Transient state, so it is disabled rather than absent — unlike the permission
   * above it, which never reaches the markup at all (bulk-approval BR10).
   */
  selectionLocked: boolean;
  /** Ticks or unticks this request; the list owns what is selected. */
  onToggleSelection: (request: TransactionRead) => void;
  /**
   * Whether this reader is offered a decision on THIS request — decided by the list
   * from who is signed in and the request's own status. A plain boolean, so the memo
   * below still holds.
   */
  canDecide: boolean;
  /**
   * Whether this group's decide controls are the ones being taken away by a decision
   * that has just landed — in which case they hand the keyboard to Open rather than
   * dropping it (`expense-decisions` NFR1). A phone-width reader with a keyboard is a
   * keyboard user, so this travels to exactly the same `RequestActions` the wide row uses.
   */
  handOffFocus: boolean;
  /** Reports that hand-off done, so the list can put the request down. */
  onFocusHandedOff: () => void;
  /** Opens this request's read-only detail panel. */
  onOpen: (request: TransactionRead) => void;
  /** Starts recording a decision on this request; the list asks for confirmation. */
  onDecide: (request: TransactionRead, outcome: DecisionOutcome) => void;
}

/**
 * One request's group of ruled lines. Memoised on stable props, exactly as the wide
 * listing's row is: a group's contents depend on nothing but the request and three
 * booleans, so a keystroke that leaves this page unchanged re-renders no groups at all.
 */
const RequestLineGroup = memo(function RequestLineGroup({
  request,
  presentationOf,
  gutterIntentOf,
  possibleDuplicate,
  awaitingConfirmation,
  selectable,
  selected,
  selectionLocked,
  onToggleSelection,
  canDecide,
  handOffFocus,
  onFocusHandedOff,
  onOpen,
  onDecide,
}: RequestLineGroupProps) {
  /**
   * Whether this request has stopped awaiting a decision, which is what makes its group
   * recede (R20). Taken as "not awaiting one" rather than as a list of decided statuses,
   * so it agrees with the control totals above the listing — where DECIDED is likewise
   * the remainder — however the service's status vocabulary grows.
   */
  const decided = !awaitsDecision(request);
  const gutterIntent = gutterIntentOf(request);

  return (
    <li
      // Composed through `cn` rather than by concatenation, because the exception rule and
      // the always-drawn transparent one it replaces are the SAME Tailwind property. Two
      // conflicting utilities left in one class attribute resolve by the order the
      // stylesheet happens to emit them in, never by the order they are written — so a
      // plain template string would leave a marked group's rule depending on how the two
      // colour tokens sort against each other. `cn` drops the loser here instead.
      className={cn(
        GROUP_CLASS,
        possibleDuplicate && EXCEPTION_RULE_CLASS,
        decided && DECIDED_GROUP_CLASS,
      )}
    >
      <div className="flex items-start gap-3">
        {/* THE RESERVED GUTTER (R15/BR5) — two characters, on every group, carrying at
            most one mark: this request's selection control where the reader may select
            it, else the shape the shared mark draws for a decision already recorded. An
            ordinary undecided request's gutter carries NOTHING — no placeholder glyph,
            no dash (brief §Data Model). */}
        <span className={GUTTER_CLASS}>
          {selectable ? (
            <Checkbox
              className={SELECTION_MARK_CLASS}
              checked={selected}
              disabled={selectionLocked}
              onCheckedChange={() => {
                onToggleSelection(request);
              }}
              // Every listed request carries one of these, so the control says WHICH
              // request it selects rather than leaving a screen-reader user with a
              // column of identical "Select"s.
              aria-label={selectRequestLabel(request.Reference)}
            />
          ) : (
            gutterIntent !== undefined && (
              // The SAME shape the mark beside the status is drawn as — the shared
              // component's, sized to the gutter, never a second drawing of it. Ink
              // named here because the group around it has receded and the mark
              // carrying the decision must not recede with it.
              <StatusMark
                intent={gutterIntent}
                className={`${GUTTER_MARK_CLASS} ${statusInkFor(gutterIntent)}`}
              />
            )
          )}
        </span>

        {/* Everything the reader reads, in one column that starts at the same place in
            every group — which is what lets the eye run down the gutter's marks and the
            statuses beneath them as columns rather than as ragged text. */}
        <div className="grid min-w-0 flex-1 gap-2">
          {/* The request's primary identifier (UI-23), and the figure the reader is
              deciding about, held to the two ends of the line. Both in the notation this
              design reads a reference and a figure in; the amount is the service's own
              value, unformatted. */}
          <div className="flex items-baseline justify-between gap-3">
            <span className={`${NOTATION_CLASS} break-all`}>
              {request.Reference}
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className={FIELD_LABEL}>{AMOUNT_LABEL}</span>
              <span className={FIGURE_CLASS}>{request.Amount}</span>
            </span>
          </div>

          {/* Where the request stands — first on its line in every group, so the marks
              read as one column down the page — then, in words, whether a decision on it is
              waiting to be confirmed (R17/BR7) and whether another request in the same load
              repeats it (R18/BR3), then the day it happened. The date is printed exactly as
              the service wrote it; nothing here normalises one. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <StatusBadge
              status={request.Status}
              presentation={presentationOf(request)}
            />
            {awaitingConfirmation && <NotYetConfirmedMark />}
            {possibleDuplicate && <PossibleDuplicateMark />}
            <span className="flex items-baseline gap-2">
              <span className={FIELD_LABEL}>{TRANSACTION_DATE_LABEL}</span>
              <span className={`${NOTATION_CLASS} text-sm`}>
                {request.TransactionDate}
              </span>
            </span>
          </div>

          {/* A line of its own, so the two decisions and Open have the group's whole
              width to sit across and wrap into at 360px. */}
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
        </div>
      </div>
    </li>
  );
});

interface RequestCardsProps {
  /** The requests on the page being read — already narrowed, ordered and sliced. */
  requests: TransactionRead[];
  /** How each recognised status reads; the list owns that vocabulary. */
  presentationOf: (request: TransactionRead) => StatusPresentation | undefined;
  /** Which shape a request's own state puts in the gutter; the list owns that reading. */
  gutterIntentOf: (request: TransactionRead) => StatusIntent | undefined;
  /**
   * The ids of every request this load marked a possible duplicate, decided over the
   * WHOLE fetched set rather than the page below — which is what keeps a mark on a
   * request whose match is on another page (brief BR3).
   */
  possibleDuplicateIds: ReadonlySet<number>;
  /**
   * The ids a decision is awaiting confirmation on (R17/BR7). Read here and handed to each
   * group as a plain boolean, exactly as the selection is — a group must never receive the
   * set itself.
   */
  awaitingConfirmationIds: ReadonlySet<number>;
  /**
   * Whether the reader may select requests at all (an Approver — bulk-approval
   * R7/BR10). Which requests may be selected is asked per request below, so this stays
   * one stable boolean.
   */
  maySelect: boolean;
  /**
   * The ids currently selected. Read here and handed to each group as a plain boolean —
   * a group must never receive the set itself, or every one of them would re-render on
   * every tick and on every refresh (see `ExpenseRequestList`).
   */
  selectedIds: ReadonlySet<number>;
  /**
   * Whether a bulk action is running over the selection right now, in which case no
   * tick can be moved underneath it (bulk-approval AC-4).
   */
  selectionLocked: boolean;
  /** Ticks or unticks one request; the list owns what is selected. */
  onToggleSelection: (request: TransactionRead) => void;
  /**
   * Whether the reader may decide requests at all (an Approver). Which requests can
   * still be decided is asked per request below, so this stays one stable boolean.
   */
  mayDecide: boolean;
  /**
   * The request whose decide controls are going away with a decision that has just
   * landed, by id — `null` when nothing has just been decided. The list owns it; see
   * `ExpenseRequestList` and `RequestActions`.
   */
  handOffFocusTo: number | null;
  /** Reports a hand-off done, so the list can put the request down. */
  onFocusHandedOff: () => void;
  /** Opens one request's read-only detail panel. */
  onOpenRequest: (request: TransactionRead) => void;
  /** Starts recording a decision on one request; the list asks for confirmation. */
  onDecideRequest: (request: TransactionRead, outcome: DecisionOutcome) => void;
}

export function RequestCards({
  requests,
  presentationOf,
  gutterIntentOf,
  possibleDuplicateIds,
  awaitingConfirmationIds,
  maySelect,
  selectedIds,
  selectionLocked,
  onToggleSelection,
  mayDecide,
  handOffFocusTo,
  onFocusHandedOff,
  onOpenRequest,
  onDecideRequest,
}: RequestCardsProps) {
  return (
    /* One list, full-bleed, with NO gap between its items: the hairline each group closes
       with is the only thing between one request and the next, which is what makes this a
       ruled listing rather than a stack of boxes. */
    <ul role="list" aria-label={LIST_LABEL} className={PAGE_BLEED_CLASS}>
      {requests.map((request) => (
        <RequestLineGroup
          key={request.Id}
          request={request}
          presentationOf={presentationOf}
          gutterIntentOf={gutterIntentOf}
          possibleDuplicate={possibleDuplicateIds.has(request.Id)}
          awaitingConfirmation={awaitingConfirmationIds.has(request.Id)}
          selectable={maySelect && awaitsDecision(request)}
          selected={selectedIds.has(request.Id)}
          selectionLocked={selectionLocked}
          onToggleSelection={onToggleSelection}
          canDecide={mayDecide && awaitsDecision(request)}
          handOffFocus={handOffFocusTo === request.Id}
          onFocusHandedOff={onFocusHandedOff}
          onOpen={onOpenRequest}
          onDecide={onDecideRequest}
        />
      ))}
    </ul>
  );
}
