'use client';

/**
 * What a reader may DO with one expense payment request: open it, and — for an Approver
 * looking at a request that is still awaiting a decision — approve or reject it. One
 * component for both presentations, so a table row and a phone-width card offer the
 * same controls under the same wording.
 *
 * Five things here are deliberate and easy to break:
 *
 * - **The decide actions are OFFERED OR ABSENT, never disabled.** `onDecide` arriving
 *   is the whole condition: the list hands it over only for an Approver
 *   (`expense-decisions` R14/BR7) looking at a request that is still `Imported`
 *   (R6/BR3), and a greyed-out Approve on anything else would fail that rule exactly as
 *   a working one would. Nothing else here changes a request — no edit, no delete.
 * - **Every control names the REQUEST it acts on.** Several rows carry the same
 *   controls, so "Open" or "Approve" on its own would leave a screen-reader user with a
 *   list of identical items. The reference is in each accessible name.
 * - **The overflow is a Shadcn `dropdown-menu`, and it is the mechanism that works at
 *   every width** (brief R16: at phone width each request offers an action overflow).
 *   It is also where this epic's decide actions live, which is why it exists beside the
 *   direct control rather than instead of it.
 * - **The menu is NOT modal** (`modal={false}`), per the project convention: a modal
 *   Radix menu marks the rest of the page `aria-hidden` while it stays focusable (which
 *   fails the accessibility scan) and parks `pointer-events: none` on the body — the
 *   latter races the detail panel this menu opens.
 * - **The icon-only control carries BOTH a tooltip and a matching `aria-label`** (R15).
 *   A native `title` is not enough: browsers never show it on keyboard focus, so a
 *   keyboard user would never learn what the control does. The tooltip's wording and the
 *   accessible name are the same string, from one constant, so the sighted user and the
 *   screen-reader user are told the same thing.
 */

import { MoreHorizontal, PanelRightOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DECIDE_OUTCOMES,
  decideActionLabel,
  decideActionName,
} from '@/lib/transactions/deciding';

import type { DecisionOutcome } from '@/lib/api/decisions';

/** What the direct control reads as on screen, beside its icon. */
const OPEN_LABEL = 'Open';

/** How each control names itself and the request it acts on (R15). */
const openRequestName = (reference: string): string =>
  `Open request ${reference}`;
const requestActionsName = (reference: string): string =>
  `Actions for request ${reference}`;

interface RequestActionsProps {
  /** The request these controls act on — named in every accessible name. */
  reference: string;
  /** Opens this request's read-only detail panel over the list. */
  onOpen: () => void;
  /**
   * Starts recording a decision on this request — asking the user to confirm it first,
   * which the list owns.
   *
   * ABSENT means this reader is not offered a decision on this request at all, and
   * then no decide item is rendered: not a disabled one, not a hidden one. Who may
   * decide, and which requests can still be decided, are the list's to answer.
   */
  onDecide?: (outcome: DecisionOutcome) => void;
}

export function RequestActions({
  reference,
  onOpen,
  onDecide,
}: RequestActionsProps) {
  const openName = openRequestName(reference);
  const actionsName = requestActionsName(reference);

  return (
    <div className="flex items-center justify-end gap-1">
      {/* The direct way in. Its visible wording is short because the row already says
          WHICH request this is; its accessible name says so too, for a reader who
          arrives at the control on its own. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={openName}
        onClick={onOpen}
      >
        <PanelRightOpen aria-hidden="true" />
        {OPEN_LABEL}
      </Button>

      <DropdownMenu modal={false}>
        {/* Tooltip outermost, then the menu trigger, then the button itself: the
            Radix composition order for a trigger that is also a tooltip trigger. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={actionsName}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{actionsName}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onOpen}>{OPEN_LABEL}</DropdownMenuItem>
          {/* The decisions, for a reader who is offered them on this request. The
              visible wording is the bare verb — the item's own accessible name says
              which request it decides, as every control on this screen does. */}
          {onDecide !== undefined && (
            <>
              <DropdownMenuSeparator />
              {DECIDE_OUTCOMES.map((outcome) => (
                <DropdownMenuItem
                  key={outcome}
                  aria-label={decideActionName(outcome, reference)}
                  onSelect={() => {
                    onDecide(outcome);
                  }}
                >
                  {decideActionLabel(outcome)}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
