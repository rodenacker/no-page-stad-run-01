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
 *   the account number included, is in the panel the action overflow opens.
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
  CardAction,
  CardContent,
  CardHeader,
} from '@/components/ui/card';

import type { StatusPresentation } from '@/components/status/StatusBadge';
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
  /** Opens this request's read-only detail panel. */
  onOpen: (request: TransactionRead) => void;
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
  onOpen,
}: RequestCardProps) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="gap-1">
        <p className="font-medium break-words">{request.Reference}</p>
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge
            status={request.Status}
            presentation={presentationOf(request)}
          />
          {possibleDuplicate && <PossibleDuplicateMark />}
        </div>
        <CardAction>
          <RequestActions
            reference={request.Reference}
            onOpen={() => {
              onOpen(request);
            }}
          />
        </CardAction>
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
  /** Opens one request's read-only detail panel. */
  onOpenRequest: (request: TransactionRead) => void;
}

export function RequestCards({
  requests,
  presentationOf,
  possibleDuplicateIds,
  onOpenRequest,
}: RequestCardsProps) {
  return (
    <ul role="list" aria-label={LIST_LABEL} className="grid gap-3">
      {requests.map((request) => (
        <li key={request.Id}>
          <RequestCard
            request={request}
            presentationOf={presentationOf}
            possibleDuplicate={possibleDuplicateIds.has(request.Id)}
            onOpen={onOpenRequest}
          />
        </li>
      ))}
    </ul>
  );
}
