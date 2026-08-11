'use client';

/**
 * One expense payment request, opened: everything the transactions service holds for it,
 * read-only, in a panel over the list (brief R5/R15/BR1).
 *
 * Six things here are deliberate and easy to break:
 *
 * - **A panel over the list, one request at a time.** This was the user's own choice at
 *   the stories approval, over an expandable row: the reader looks at one request, and
 *   closing it puts them back on the list with their place, ordering and page exactly as
 *   they left them (the list holds all three — this panel holds none of them).
 * - **It says WHICH request is open.** Its accessible name carries the request's
 *   reference, so a reader who opens the wrong row can tell at once.
 * - **Every value is printed as the service sent it.** Nothing here reformats a date,
 *   re-cases a status or invents a fallback: `TransactionDate` and `LastChangedDate` are
 *   an unverified assumption for this epic (brief §Notes & Caveats), and normalising on
 *   speculation would hide a real difference rather than surface it.
 * - **Every value is read-only** (BR1/R5): no editable field, no form, nothing to
 *   submit. The only thing that can be done to the request from here is to DECIDE it —
 *   `expense-decisions` R10/R14 — and even that only through `onDecide`, which the list
 *   hands over solely for an Approver looking at a request still awaiting a decision.
 *   Absent, that reader is offered nothing: no disabled control, no greyed-out one.
 * - **THE REVEAL IS THIS PANEL'S OWN STATE, and it dies with the panel.** The account
 *   number shows its last four digits until the named reveal control is used, and only
 *   then is the full value rendered at all. Because the list unmounts this component
 *   when it closes, the reveal cannot follow the reader onto another request, onto
 *   another page, or back onto this same request — that containment is POPIA
 *   (project.md §Compliance) made true by construction rather than by remembering to
 *   reset a flag. It must never move into a store, a context, the URL or a ref that
 *   outlives the open panel.
 * - **There is no reveal-all, anywhere.** One request at a time is the compliance
 *   requirement; a control that unmasked the list would defeat the whole arrangement.
 * - **A request that has already been decided SAYS SO where the decisions would be**
 *   (`expense-decisions` R12): the sentence names the state the request itself carries
 *   — approved or rejected — so the reader is told why nothing is on offer rather than
 *   left looking at a panel that has quietly lost its actions. It is shown to both
 *   roles, because it describes the request rather than what this reader may do, and it
 *   is plain text: a status is never carried by colour or by an absence.
 */

import { Check, Eye, EyeOff, X } from 'lucide-react';
import { useState } from 'react';

import { MaskedAccountNumber } from '@/components/requests/MaskedAccountNumber';
import { StatusBadge } from '@/components/status/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DECISION_APPROVE } from '@/lib/api/decisions';
import {
  DECIDE_OUTCOMES,
  awaitsDecision,
  decideActionLabel,
  decideActionName,
  decidedStateMessage,
} from '@/lib/transactions/deciding';
import { transactionTypeLabel } from '@/lib/transactions/display';

import type { StatusPresentation } from '@/components/status/StatusBadge';
import type { DecisionOutcome } from '@/lib/api/decisions';
import type { TransactionRead } from '@/types/transactions';
import type { ReactNode } from 'react';

/** Names the panel for the request it is showing, so the reader knows what they opened. */
const panelTitle = (reference: string): string => `Request ${reference}`;

/** Says what the panel is, and that none of it can be changed here (R5/BR1). */
const PANEL_DESCRIPTION =
  'Everything the service holds for this request. All of it is read-only.';

/** The reveal control's two states. Each names what it acts on AND what it does (R15). */
const REVEAL_ACCOUNT_NUMBER = 'Reveal account number';
const HIDE_ACCOUNT_NUMBER = 'Hide account number';

/** The way out. Escape does the same thing, for a reader who never touches a mouse. */
const CLOSE_LABEL = 'Close';

/** Each field's own wording, in the reader's terms rather than the wire's. */
const FIELD = {
  status: 'Status',
  file: 'Originating file',
  date: 'Transaction date',
  accountNumber: 'Account number',
  description: 'Description',
  amount: 'Amount',
  currency: 'Currency',
  type: 'Transaction type',
  note: 'Rejection note',
  lastChangedUser: 'Last changed by',
  lastChangedDate: 'Last changed',
} as const;

/** One value and its label. A description list, because that is what this is. */
function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

interface RequestDetailPanelProps {
  /** The request being read. Rendered exactly as the service reported it. */
  request: TransactionRead;
  /** How each recognised status reads — the list owns that vocabulary, not this panel. */
  statusPresentation?: StatusPresentation;
  /**
   * Starts recording a decision on this request, which the list asks the reader to
   * confirm before anything is sent. ABSENT means this reader is offered no decision on
   * this request — see this file's header.
   */
  onDecide?: (outcome: DecisionOutcome) => void;
  /** Closing puts the reader back on the list, unchanged. */
  onClose: () => void;
}

export function RequestDetailPanel({
  request,
  statusPresentation,
  onDecide,
  onClose,
}: RequestDetailPanelProps) {
  /**
   * Whether this reader has asked for the full account number of THIS open request.
   * Component state, and nothing more: see this file's header on why it may not live
   * anywhere else.
   */
  const [accountNumberRevealed, setAccountNumberRevealed] = useState(false);

  const hasRejectionNote =
    request.UserNote !== undefined && request.UserNote.trim() !== '';

  return (
    <Dialog
      open
      onOpenChange={(stillOpen) => {
        if (!stillOpen) {
          onClose();
        }
      }}
    >
      {/* The primitive's own corner close button is deliberately off: an icon-only
          control has to reveal its name on hover AND on keyboard focus (R15), and a
          plainly worded Close in the footer is simpler than tooltipping a primitive.
          Escape closes the panel either way. */}
      <DialogContent
        showCloseButton={false}
        className="max-h-[90svh] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{panelTitle(request.Reference)}</DialogTitle>
          <DialogDescription>{PANEL_DESCRIPTION}</DialogDescription>
        </DialogHeader>

        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label={FIELD.status}>
            <StatusBadge
              status={request.Status}
              presentation={statusPresentation}
            />
          </DetailField>
          <DetailField label={FIELD.file}>{request.FileName}</DetailField>
          <DetailField label={FIELD.date}>
            {/* As the service wrote it — nothing in this epic normalises a date. */}
            {request.TransactionDate}
          </DetailField>
          <DetailField label={FIELD.amount}>
            <span className="tabular-nums">{request.Amount}</span>
          </DetailField>
          <DetailField label={FIELD.currency}>{request.Currency}</DetailField>
          <DetailField label={FIELD.type}>
            {transactionTypeLabel(request.TransactionType)}
          </DetailField>
          <DetailField label={FIELD.accountNumber}>
            <span className="flex flex-wrap items-center gap-2">
              {accountNumberRevealed ? (
                <span className="tabular-nums">{request.AccountNumber}</span>
              ) : (
                <MaskedAccountNumber accountNumber={request.AccountNumber} />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setAccountNumberRevealed((revealed) => !revealed);
                }}
              >
                {accountNumberRevealed ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Eye aria-hidden="true" />
                )}
                {accountNumberRevealed
                  ? HIDE_ACCOUNT_NUMBER
                  : REVEAL_ACCOUNT_NUMBER}
              </Button>
            </span>
          </DetailField>
          <DetailField label={FIELD.description}>
            {request.Description}
          </DetailField>
          {/* Only a rejected request carries a note; nothing stands in for one that
              does not have it. */}
          {hasRejectionNote && (
            <DetailField label={FIELD.note}>{request.UserNote}</DetailField>
          )}
          <DetailField label={FIELD.lastChangedUser}>
            {request.LastChangedUser}
          </DetailField>
          <DetailField label={FIELD.lastChangedDate}>
            {request.LastChangedDate}
          </DetailField>
        </dl>

        {/* Where the decisions would be, for a request that has already had one
            (R12). It states the request's own state rather than saying the actions
            are unavailable, and it is here for both roles: an Importer reading a
            decided request is told the same thing, since this describes the request
            and not what the reader may do to it. */}
        {!awaitsDecision(request) && (
          <p className="text-muted-foreground max-w-prose text-sm">
            {decidedStateMessage(request)}
          </p>
        )}

        {/* Close is written out rather than taken from the primitive's own
            `showCloseButton` slot so it carries `type="button"`: a button with no type
            IS a submit button, and there is no form here to submit. The decisions sit
            beside it only when this reader is offered them; each names the request it
            decides, since the confirmation that follows names it too. */}
        <DialogFooter>
          {onDecide !== undefined &&
            DECIDE_OUTCOMES.map((outcome) => (
              <Button
                key={outcome}
                type="button"
                variant={outcome === DECISION_APPROVE ? 'default' : 'secondary'}
                aria-label={decideActionName(outcome, request.Reference)}
                onClick={() => {
                  onDecide(outcome);
                }}
              >
                {outcome === DECISION_APPROVE ? (
                  <Check aria-hidden="true" />
                ) : (
                  <X aria-hidden="true" />
                )}
                {decideActionLabel(outcome)}
              </Button>
            ))}
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {CLOSE_LABEL}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
