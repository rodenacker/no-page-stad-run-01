'use client';

/**
 * What a reader may DO with one expense payment request: open it, and nothing else
 * (brief R5/BR1 — every value is read-only, and deciding on a request belongs to a later
 * epic). One component for both presentations, so a table row and a phone-width card
 * offer the same two controls under the same wording.
 *
 * Five things here are deliberate and easy to break:
 *
 * - **Nothing here changes a request.** No edit, no delete, no approve or reject — not
 *   even disabled (BR1/R5). This is the one place per-request controls live, so it is
 *   also the place that rule has to be held.
 * - **Both controls name the REQUEST they act on.** Several rows carry the same two
 *   controls, so "Open" on its own would leave a screen-reader user with a list of
 *   identical buttons. The reference is in each accessible name.
 * - **The overflow is a Shadcn `dropdown-menu`, and it is the mechanism that works at
 *   every width** (brief R16: at phone width each request offers an action overflow).
 *   It is also where a later epic's per-request actions belong, which is why it exists
 *   beside the direct control rather than instead of it.
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/** What the direct control reads as on screen, beside its icon. */
const OPEN_LABEL = 'Open';

/** How each control names itself and the request it acts on (R15). */
const openRequestName = (reference: string): string =>
  `Open request ${reference}`;
const requestActionsName = (reference: string): string =>
  `Actions for request ${reference}`;

interface RequestActionsProps {
  /** The request these controls act on — named in both accessible names. */
  reference: string;
  /** Opens this request's read-only detail panel over the list. */
  onOpen: () => void;
}

export function RequestActions({ reference, onOpen }: RequestActionsProps) {
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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
