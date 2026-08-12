'use client';

/**
 * The step that asks WHY, before a rejection is confirmed (`expense-decisions`
 * R7/R9/BR4).
 *
 * It sits BETWEEN choosing Reject and the confirmation — not inside it. That
 * separation is the whole shape of this story: the confirmation is the shared
 * `ConfirmAction`, whose way out holds focus so a stray Enter can never decide
 * anything (NFR2), and an editable field inside it would defeat exactly that. So the
 * note is written first, on its own, and the confirmation that follows has nothing to
 * fill in.
 *
 * Five things here are deliberate and easy to break:
 *
 * - **The rule is checked ON SUBMIT, never on a keystroke** (brief BR4, requirements
 *   §6.3). Both `mode` and `reValidateMode` are `'onSubmit'`: an Approver typing a
 *   value that is not yet acceptable is told nothing while they are still typing, and
 *   the refusal appears when they send it. A field that complains mid-word fails this
 *   story even though the same wording eventually appears.
 * - **The send control is never disabled.** A control that only becomes usable once
 *   the note is non-empty can never take keyboard focus while it is empty, so the
 *   refusal would be unreachable without a mouse and BR4's check would have nothing to
 *   run on (NFR1). It stays enabled and answers with the refusal.
 * - **The wording of the rule is the requirement's own**, from
 *   `lib/validation/schemas.ts` — never spelled out here, and never softened.
 * - **The three phrases of a rejection do not read alike**: "Reject" asks (the row's own
 *   control), "Continue" moves on (here), "Reject request" does it (the
 *   confirmation), "Cancel" backs out. Neither a user nor a query can confuse them.
 * - **It hands focus over to the confirmation rather than back to the list.** Radix
 *   returns focus to whatever was focused before a dialog opened, on a timer, as it
 *   unmounts — which would pull focus off the confirmation that is opening in the same
 *   moment and leave the way out unfocused (NFR2). So that restore is suppressed for
 *   the one case where this step is closing because the note was WRITTEN; backing out
 *   restores focus normally, since then there is nowhere else for it to go.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import {
  CONTINUE_FROM_NOTE_LABEL,
  NOTE_STEP_DESCRIPTION,
  REJECTION_NOTE_HINT,
  REJECTION_NOTE_LABEL,
  WAY_OUT_OF_NOTE_STEP,
  continueFromNoteName,
  noteStepTitleFor,
} from '@/lib/transactions/deciding';
import { rejectionNoteSchema } from '@/lib/validation/schemas';

import type { RejectionNoteValues } from '@/lib/validation/schemas';

/** One line explaining the asterisk, as every form in this project has. */
const RequiredMarker = () => <span aria-hidden="true">*</span>;

/** Nothing written yet — the state the refusal has to be reachable from. */
const NOTHING_WRITTEN: RejectionNoteValues = { note: '' };

interface RejectionNoteStepProps {
  /** The request being rejected — named in the title and in the send control. */
  reference: string;
  /**
   * The note the Approver wrote, once it satisfies BR4. Trimmed by the schema, so
   * what travels on is the reason itself rather than the spaces around it.
   *
   * Nothing is recorded here: the caller takes this to the confirmation.
   */
  onNoteWritten: (note: string) => void;
  /** Backing out — the way out, or Escape. The request is left exactly as it was. */
  onCancel: () => void;
}

export function RejectionNoteStep({
  reference,
  onNoteWritten,
  onCancel,
}: RejectionNoteStepProps) {
  const form = useForm<RejectionNoteValues>({
    resolver: zodResolver(rejectionNoteSchema),
    // BR4 is a submit-time rule, both the first time and every time after it.
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    defaultValues: NOTHING_WRITTEN,
  });

  /**
   * Whether this step is closing because the note was written. See this file's header
   * — it is a ref rather than state because it is read after the last render, inside
   * Radix's own unmount handling.
   */
  const handingOverToConfirmation = useRef(false);

  const sendNoteOn = ({ note }: RejectionNoteValues): void => {
    handingOverToConfirmation.current = true;
    onNoteWritten(note);
  };

  return (
    <Dialog
      open
      onOpenChange={(stillOpen) => {
        if (!stillOpen) {
          onCancel();
        }
      }}
    >
      {/* The primitive's own corner close button is off for the same reason the detail
          panel turns it off: an icon-only control would owe a tooltip, and a plainly
          worded way out in the footer is simpler. Escape closes this either way. */}
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          if (handingOverToConfirmation.current) {
            event.preventDefault();
          }
        }}
      >
        <Form {...form}>
          <form
            // The app's own wording is the only wording shown: the browser's native
            // validation bubbles would otherwise pre-empt the requirement's exact
            // sentence, and they cannot be worded to satisfy R9/BR4.
            noValidate
            // Submitting is assembled HERE, inside the handler, rather than during
            // render: `sendNoteOn` records that this step is handing over (below), and
            // a function that touches a ref must not be handed to another function
            // while rendering — nothing about this belongs to a render pass.
            onSubmit={(submission) => {
              void form.handleSubmit(sendNoteOn)(submission);
            }}
            className="grid gap-6"
          >
            <DialogHeader>
              <DialogTitle>{noteStepTitleFor(reference)}</DialogTitle>
              <DialogDescription>{NOTE_STEP_DESCRIPTION}</DialogDescription>
            </DialogHeader>

            <p className="text-muted-foreground text-sm">
              <RequiredMarker /> indicates a required field
            </p>

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {REJECTION_NOTE_LABEL} <RequiredMarker />
                  </FormLabel>
                  <FormControl>
                    <Textarea rows={4} aria-required="true" {...field} />
                  </FormControl>
                  <FormDescription>{REJECTION_NOTE_HINT}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              {/* The way out first, as it is in the confirmation that follows. */}
              <Button type="button" variant="outline" onClick={onCancel}>
                {WAY_OUT_OF_NOTE_STEP}
              </Button>
              {/* Never disabled — see this file's header. Its visible wording is the
                  bare verb; its accessible name says which request it continues
                  with, as every per-request control on this screen does. */}
              <Button
                type="submit"
                aria-label={continueFromNoteName(reference)}
              >
                {CONTINUE_FROM_NOTE_LABEL}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
