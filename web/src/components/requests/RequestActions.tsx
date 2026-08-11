'use client';

/**
 * What a reader may DO with one expense payment request: open it, and — for an Approver
 * looking at a request that is still awaiting a decision — approve or reject it. One
 * component for both presentations, so a table row and a phone-width card offer the
 * same controls under the same wording.
 *
 * Four things here are deliberate and easy to break:
 *
 * - **EVERY action is a DIRECT control on the request. There is no ⋯ overflow at all.**
 *   A decision is the whole reason an Approver is on this screen, and burying it behind
 *   a menu made every decision cost two clicks (user decision at manual test). The menu
 *   that remained afterwards held only Open — a second way to reach a control already
 *   sitting on the row — so the user had it removed outright at a later manual test.
 *   That supersedes the MECHANISM `expense-request-list` R16 named (an action overflow
 *   at phone width) while still serving its purpose: this one component renders both
 *   the table row and the phone-width card, so every per-request action is reachable at
 *   every width, now in one activation. Do not restore the menu as a missing feature.
 * - **The decide actions are OFFERED OR ABSENT, never disabled.** `onDecide` arriving
 *   is the whole condition: the list hands it over only for an Approver
 *   (`expense-decisions` R14/BR7) looking at a request that is still `Imported`
 *   (R6/BR3), and a greyed-out Approve on anything else would fail that rule exactly as
 *   a working one would. Nothing else here changes a request — no edit, no delete.
 * - **Every control names the REQUEST it acts on.** Several rows carry the same
 *   controls, and there are now MANY Approve buttons on one screen, so "Approve" on its
 *   own would leave a screen-reader user with a list of identical controls. The
 *   reference is in each accessible name — and the visible word is the start of that
 *   name, so the two never disagree (WCAG 2.5.3, label in name). Every control here also
 *   has visible wording of its own, so none of them owes a tooltip.
 * - **When the decide controls are withdrawn, the keyboard is HANDED OVER to Open**
 *   (`handOffFocus`, NFR1). A decision is confirmed from the row's own Approve or
 *   Reject; the confirmation gives focus back to the control that opened it, and the
 *   fresh read then takes that very control off the screen. Nothing catches the focus
 *   it was holding, so it falls to `<body>` and a keyboard user has to walk the whole
 *   page again after every decision. Open is the surviving control ON THE SAME REQUEST,
 *   so the user keeps their place. It is a real hand-off between two elements this
 *   component owns — never a search of the page for a button by its wording.
 */

import { Check, PanelRightOpen, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { DECISION_APPROVE } from '@/lib/api/decisions';
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
  /**
   * The list saying "a decision has just landed on this request, so the controls it was
   * offering are on their way out" — see this file's header. It stands until the
   * hand-off below has had its moment, and it is asked for only where the offer is
   * actually ending: a decision the service REFUSED leaves the decide controls exactly
   * where they were, and focus goes back to them by itself.
   */
  handOffFocus?: boolean;
  /**
   * Says the hand-off has happened, so the list can put its request down. Called once,
   * on the commit that withdrew the controls — whether or not focus needed moving.
   */
  onFocusHandedOff?: () => void;
}

export function RequestActions({
  reference,
  onOpen,
  onDecide,
  handOffFocus = false,
  onFocusHandedOff,
}: RequestActionsProps) {
  const openName = openRequestName(reference);

  /** The control the keyboard is handed to, and the group it is handed from. */
  const controls = useRef<HTMLDivElement | null>(null);
  const openControl = useRef<HTMLButtonElement | null>(null);

  /**
   * Whether the decisions were on offer at the previous commit. The hand-off happens on
   * the commit that WITHDRAWS them, never on the earlier one that merely knows a
   * decision was recorded — because the confirmation gives focus back to whatever opened
   * it (a deferred restore, in Radix's case) and moving the keyboard before that lands
   * would simply be undone, leaving the user back on a control about to disappear.
   */
  const decideOffered = onDecide !== undefined;
  const decideWasOffered = useRef(decideOffered);

  useEffect(() => {
    const justWithdrawn = decideWasOffered.current && !decideOffered;
    decideWasOffered.current = decideOffered;

    if (!justWithdrawn || !handOffFocus) {
      return;
    }

    // Taken only FROM this request's own controls, or from nowhere at all — which is
    // where the keyboard has just been left if the control holding it was the one that
    // went. Anywhere else and the user has moved on under their own steam (the search
    // box, another request, the opened panel), and pulling them back here would be the
    // same rudeness in the other direction.
    const open = openControl.current;
    const focused = document.activeElement;
    const heldHere =
      focused !== null && controls.current?.contains(focused) === true;
    const heldNowhere = focused === null || focused === document.body;

    if (open !== null && (heldHere || heldNowhere)) {
      open.focus();
    }
    // Spent either way: the controls have gone, so there is no second chance to take.
    onFocusHandedOff?.();
  }, [decideOffered, handOffFocus, onFocusHandedOff]);

  return (
    <div
      ref={controls}
      className="flex flex-wrap items-center justify-end gap-1"
    >
      {/* The decisions, for a reader who is offered them on this request — reachable
          in ONE activation. They sit to the LEFT of Open so that Open, which every row
          carries, stays in the same place down the column whether or not a given
          request can still be decided. */}
      {onDecide !== undefined &&
        DECIDE_OUTCOMES.map((outcome) => (
          <Button
            key={outcome}
            type="button"
            variant={outcome === DECISION_APPROVE ? 'default' : 'secondary'}
            size="sm"
            aria-label={decideActionName(outcome, reference)}
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

      {/* The only way in, and the last control on the request. Its visible wording is
          short because the row already says WHICH request this is; its accessible name
          says so too, for a reader who arrives at the control on its own. */}
      <Button
        ref={openControl}
        type="button"
        variant="ghost"
        size="sm"
        aria-label={openName}
        onClick={onOpen}
      >
        <PanelRightOpen aria-hidden="true" />
        {OPEN_LABEL}
      </Button>
    </div>
  );
}
