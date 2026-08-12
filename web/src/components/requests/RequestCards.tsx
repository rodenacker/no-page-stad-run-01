'use client';

/**
 * The expense request list as a phone-width reader receives it: one card per request,
 * in a real list (brief R16).
 *
 * Four things here are deliberate and easy to break:
 *
 * - **This is a different presentation, not a re-flowed table.** R16 asks for a card
 *   per request; a wide table kept inside a sideways-scrolling wrapper does not satisfy
 *   it, and the page itself must never scroll sideways at 360px (NFR-base-3's floor).
 * - **One list, one `listitem` per request.** The list semantics are what tell a screen
 *   reader how many requests there are and where each one starts, so the cards sit in a
 *   `ul` carrying an explicit `role="list"` — Tailwind's preflight removes the bullets,
 *   and a bulletless list loses its role in some browsers.
 * - **The reference is the primary identifier** (source UI-23), with three key values
 *   beside it — status, amount and transaction date. Everything else about the request,
 *   the account number included, is in the panel the Open control opens.
 * - **The selection tick is here too**, sitting with the reference it selects and
 *   offered on the same condition the table row applies (an Approver, a request still
 *   awaiting a decision). Each card is handed a plain `selected` boolean rather than
 *   the selection itself, so the memo below survives a selection change.
 * - **A card offers exactly what a row offers**, including the decisions as DIRECT
 *   controls: the same `RequestActions`, given `onDecide` on the same condition (an
 *   Approver, a request still awaiting a decision). A phone-width reader is not a
 *   read-only reader, and a decision costs them one tap here too. Those controls sit in
 *   a footer ROW of their own rather than in the card's action corner: four controls
 *   squeezed beside the reference at 360px would either crowd it or push the card
 *   sideways, and the whole point of the card presentation is that the page never
 *   scrolls sideways (NFR-base-3's floor).
 * - **The possible-duplicate mark is here too** (brief R8): the mark has to be readable
 *   in the list itself at every width, so it is the same `PossibleDuplicateMark` the
 *   table row renders, beside the status. Which requests carry it is decided once per
 *   load over the whole fetched set, upstream of the page this card is on.
 * - **The account number is not printed here at all.** At this width the reader gets it
 *   by opening the request, where the reveal control lives; nothing masked or unmasked
 *   is in the card's markup, which is the strongest form the POPIA requirement can take
 *   (project.md §Compliance).
 */

import { memo } from 'react';

import { PossibleDuplicateMark } from '@/components/requests/PossibleDuplicateMark';
import { RequestActions } from '@/components/requests/RequestActions';
import { StatusBadge } from '@/components/status/StatusBadge';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { awaitsDecision } from '@/lib/transactions/deciding';
import { selectRequestLabel } from '@/lib/transactions/selecting';

import type { StatusPresentation } from '@/components/status/StatusBadge';
import type { DecisionOutcome } from '@/lib/api/decisions';
import type { TransactionRead } from '@/types/transactions';

/** Names the list itself, since there is no table caption at this width. */
const LIST_LABEL = 'Imported expense payment requests';

/** Each key value's own wording. */
const FIELD = {
  amount: 'Amount',
  date: 'Transaction date',
} as const;

interface RequestCardProps {
  /** The request this card is showing. */
  request: TransactionRead;
  /** How each recognised status reads; the list owns that vocabulary. */
  presentationOf: (request: TransactionRead) => StatusPresentation | undefined;
  /** Whether this load marked the request a possible duplicate (brief BR2/BR3). */
  possibleDuplicate: boolean;
  /**
   * Whether THIS request may be selected to be approved with others — an Approver, and
   * a request still awaiting a decision (bulk-approval BR1/BR10). False means no
   * control at all, never a disabled one.
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
   * Whether this card's decide controls are the ones being taken away by a decision
   * that has just landed — in which case they hand the keyboard to Open rather than
   * dropping it (NFR1). A phone-width reader with a keyboard is a keyboard user, so
   * this travels to exactly the same `RequestActions` the table row uses.
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
 * One request's card. Memoised on stable props, exactly as the table's row is: a card's
 * contents depend on nothing but the request and one boolean, so narrowing that leaves
 * this page unchanged re-renders no cards at all.
 */
const RequestCard = memo(function RequestCard({
  request,
  presentationOf,
  possibleDuplicate,
  selectable,
  selected,
  selectionLocked,
  onToggleSelection,
  canDecide,
  handOffFocus,
  onFocusHandedOff,
  onOpen,
  onDecide,
}: RequestCardProps) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="gap-1">
        {/* The tick sits with the reference it selects, so a phone-width reader ticks
            the request they are reading rather than a control in a footer three values
            away from it. Named for that request, as the row's is. */}
        <div className="flex items-start gap-2">
          {selectable && (
            <Checkbox
              className="mt-0.5"
              checked={selected}
              disabled={selectionLocked}
              onCheckedChange={() => {
                onToggleSelection(request);
              }}
              aria-label={selectRequestLabel(request.Reference)}
            />
          )}
          <p className="font-medium break-words">{request.Reference}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge
            status={request.Status}
            presentation={presentationOf(request)}
          />
          {possibleDuplicate && <PossibleDuplicateMark />}
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">{FIELD.amount}</dt>
            <dd className="tabular-nums">{request.Amount}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">{FIELD.date}</dt>
            {/* As the service wrote it — nothing here normalises a date. */}
            <dd className="break-words">{request.TransactionDate}</dd>
          </div>
        </dl>
      </CardContent>
      {/* A row of its own, so the two decisions and Open have the card's whole width to
          sit across and wrap into at 360px. */}
      <CardFooter className="justify-end">
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
      </CardFooter>
    </Card>
  );
});

interface RequestCardsProps {
  /** The requests on the page being read — already narrowed, ordered and sliced. */
  requests: TransactionRead[];
  /** How each recognised status reads; the list owns that vocabulary. */
  presentationOf: (request: TransactionRead) => StatusPresentation | undefined;
  /**
   * The ids of every request this load marked a possible duplicate, decided over the
   * WHOLE fetched set rather than the page below — which is what keeps a mark on a
   * request whose match is on another page (brief BR3).
   */
  possibleDuplicateIds: ReadonlySet<number>;
  /**
   * Whether the reader may select requests at all (an Approver — bulk-approval
   * R7/BR10). Which requests may be selected is asked per request below, so this stays
   * one stable boolean.
   */
  maySelect: boolean;
  /**
   * The ids currently selected. Read here and handed to each card as a plain boolean —
   * a card must never receive the set itself, or every card would re-render on every
   * tick and on every refresh (see `ExpenseRequestList`).
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
  possibleDuplicateIds,
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
    <ul role="list" aria-label={LIST_LABEL} className="grid gap-3">
      {requests.map((request) => (
        <li key={request.Id}>
          <RequestCard
            request={request}
            presentationOf={presentationOf}
            possibleDuplicate={possibleDuplicateIds.has(request.Id)}
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
        </li>
      ))}
    </ul>
  );
}
