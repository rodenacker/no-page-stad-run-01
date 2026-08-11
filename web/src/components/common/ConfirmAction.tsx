'use client';

/**
 * The project's ONE confirmation for an action that has to be agreed to before it
 * happens (source UI-09, stated in `expense-decisions` R10/BR6 as the project-wide
 * convention: name the object the action is about, let the way OUT hold focus, and do
 * nothing at all until the confirming choice is taken).
 *
 * It exists so the confirmations this app asks for — approving a request, rejecting
 * one, cancelling a submitted file, and whatever a later epic adds — cannot drift into
 * four near-identical dialogs that each behave slightly differently.
 *
 * Four things here are deliberate and easy to break:
 *
 * - **The way out holds initial focus, not the confirming choice.** That is what
 *   `AlertDialogCancel` gives for free, and it is why this is the Shadcn
 *   `alert-dialog` primitive rather than the plain `dialog`: arriving here and pressing
 *   Enter must back out, never act. (`expense-decisions` NFR2 makes this override the
 *   project's usual "first editable field takes focus" rule for confirmations.)
 * - **The two labels are the CALLER's, and they must not read alike.** "Cancel file" /
 *   "Cancel the file" / "Keep the file" is the discipline the file actions already
 *   follow: the control that ASKS, the one that DOES it and the one that BACKS OUT are
 *   three different phrases, so neither a user nor a query can confuse them.
 * - **It is CONTROLLED — the caller owns whether it is open.** A confirmation is
 *   reached from a plain button on one screen and from an item in a per-request
 *   overflow menu on another, and only the caller knows which object the answer is
 *   about. So there is no trigger slot here; the caller renders whatever asks, and
 *   holds what is being confirmed while this is open.
 * - **Nothing here calls anything.** `onConfirm` is the caller's, and this component
 *   has no idea whether it succeeded — a refusal is reported by the caller on the
 *   screen BEHIND this dialog, which closes as the answer is given. A user is never
 *   held in a dialog to read why nothing happened.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmActionProps {
  /** Whether the confirmation is being asked. The caller owns it. */
  open: boolean;
  /**
   * Called with `false` whenever the dialog closes itself — the way out, Escape, or
   * the confirming choice being taken (which closes it as well as confirming).
   */
  onOpenChange: (open: boolean) => void;
  /** Names the object the action is about: "Approve request TXN-20260415-0001?" */
  title: string;
  /** What accepting actually does, in the user's terms. */
  description: string;
  /** The confirming choice's own wording — never the same phrase as the way out. */
  confirmLabel: string;
  /** The way out, which holds focus when this opens. */
  wayOutLabel: string;
  /** Whether the confirming choice is something the user cannot get back. */
  destructive?: boolean;
  /** Taken only when the confirming choice is. */
  onConfirm: () => void;
}

export function ConfirmAction({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  wayOutLabel,
  destructive = false,
  onConfirm,
}: ConfirmActionProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* First in the markup and focused on open: a stray Enter backs out. */}
          <AlertDialogCancel>{wayOutLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
