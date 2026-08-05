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
 * - **Read-only means read-only** (BR1/R5): no editable field, no form, nothing to
 *   submit, and no decide action. Approving or rejecting a request is the NEXT epic and
 *   must not be pre-empted here — not even as a disabled control.
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
 */

import { Eye, EyeOff } from 'lucide-react';
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
import { transactionTypeLabel } from '@/lib/transactions/display';

import type { StatusPresentation } from '@/components/status/StatusBadge';
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
  /** Closing puts the reader back on the list, unchanged. */
  onClose: () => void;
}

export function RequestDetailPanel({
  request,
  statusPresentation,
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

        {/* The only other control in the panel, and it goes nowhere near the values.
            Written out rather than taken from the primitive's own `showCloseButton`
            slot so it carries `type="button"`: a button with no type IS a submit
            button, and a read-only panel has nothing to submit (R5/BR1). */}
        <DialogFooter>
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
