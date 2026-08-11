'use client';

/**
 * What the Finance Uploader may DO to a submitted file: send it back for validation, or
 * cancel it altogether (brief FR4, FR5, BR3).
 *
 * Six things here are deliberate and easy to break:
 *
 * - **WHO may act is decided on the SERVER and arrives as one value.** `actingUploader`
 *   is `hasRole(session, ROLE_IMPORTER) ? displayNameOf(session) : undefined`, computed
 *   by the page (a server component). Absent means this session may not act on the file,
 *   and then NOTHING is rendered — not a disabled control, not a greyed-out one (source
 *   UI-24). So an Approver's browser never receives this markup at all, which is what
 *   makes the exclusion structural rather than cosmetic.
 * - **That same value is the audit identity the cancel call must carry.** The service
 *   requires `LastChangedUser` on the cancel, and it is the authenticated person's own
 *   name — one value doing both jobs, so the name the service records can never be
 *   anything the user typed or anything the browser chose for itself.
 * - **WHICH action applies is decided from the file's own status.** Retry while
 *   validation has failed; cancel while the file has not been imported (`Uploaded` or
 *   `Validation failed` — the two the brief names). Once the file has imported neither
 *   applies and this section is absent: the file's own status, already on the page, is
 *   the answer instead of a control that cannot be used.
 * - **A CANCELLED file is not a case here at all.** Cancelling sets `IsActive: false`,
 *   so the file leaves `GET /v1/file-logs?IsActive=Yes` and its page stops resolving —
 *   that is `SubmittedFileDetail`'s "not available" answer, not a variant of this
 *   section. Which is also why a confirmed cancel sends the user back to the Expense
 *   files list rather than leaving them on a page whose file no longer exists.
 * - **The cancel is gated by a confirmation (source UI-09).** It NAMES the file, says
 *   the file and its rows go and that it cannot be undone, opens with the way OUT
 *   holding focus (Radix focuses `AlertDialogCancel`, so a stray Enter keeps the file),
 *   and sends nothing until the confirming choice is taken. The way out reads "keep",
 *   never "cancel": the destructive action is itself called Cancel file, so "Cancel"
 *   would mean both things at once.
 * - **A refusal is reported HERE, in the service's own words**, with the confirmation
 *   closed and both actions still on offer — a user is never trapped in a dialog to
 *   read why something did not happen, and the file is left exactly as it was.
 */

import { Ban, RotateCcw, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  cancelFailureMessage,
  cancelSubmittedFile,
  retryFailureMessage,
  retryFileValidation,
} from '@/lib/api/files';
import { UPLOAD_PATH } from '@/lib/auth/access-map';
import {
  FILE_STATUS_UPLOADED,
  FILE_STATUS_VALIDATION_FAILED,
} from '@/types/files';

import type { FileLog } from '@/types/files';

/** What the section is called, and what ties its heading to it. */
const HEADING_ID = 'submitted-file-actions-heading';
const HEADING = 'Actions';

/**
 * The four controls' own wording, reserved across this epic's stories.
 *
 * `RETRY_LABEL` is deliberately NOT the bare "Try again": that belongs to the
 * processing history's own failed read on this same screen. And the three cancel
 * labels are deliberately all different, so no query — and no user — can mistake the
 * control that ASKS for the one that DOES it or the one that backs out.
 */
const RETRY_LABEL = 'Retry validation';
const CANCEL_LABEL = 'Cancel file';
const CONFIRM_CANCEL_LABEL = 'Cancel the file';
const KEEP_FILE_LABEL = 'Keep the file';

/** The confirmation names the file it is about — nothing vague like "this file". */
const confirmationTitleFor = (file: FileLog): string =>
  `Cancel ${file.CurrentFileName}?`;

/**
 * What cancelling actually does, and that there is no way back from it (source UI-09).
 * The rows are named because they, not just the file, are what the user loses.
 */
const CONFIRMATION_MESSAGE =
  'The file and all of its rows are removed, and none of them will become expense payment requests. This cannot be undone — you would have to submit the file again.';

/** Announced while a call is on its way, since nothing on the page has changed yet. */
const RETRY_IN_FLIGHT = 'Asking for this file to be validated again…';
const CANCEL_IN_FLIGHT = 'Cancelling this file…';

/** Names what did not happen, so the alert is not just an apology. */
const RETRY_REFUSED_TITLE = 'Could not start validation again';
const CANCEL_REFUSED_TITLE = 'Could not cancel this file';

/** Says what to do about it — the control itself, which is still right there. */
const ASK_AGAIN_MESSAGE =
  'The file is exactly as it was. Choose the action again to ask once more.';

/** Retry applies only while this file's validation has failed (brief FR4). */
const retryApplies = (file: FileLog): boolean =>
  file.CurrentStatus === FILE_STATUS_VALIDATION_FAILED;

/**
 * Cancel applies while the file has NOT been imported — the two statuses the brief
 * names (FR5, BR2): awaiting processing, or failed validation.
 *
 * `Validating` is deliberately absent: the brief lists exactly `Uploaded` and
 * `Validation failed`, and a file whose validation is under way is not something this
 * app offers to pull out from under the service.
 */
const cancelApplies = (file: FileLog): boolean =>
  file.CurrentStatus === FILE_STATUS_UPLOADED ||
  file.CurrentStatus === FILE_STATUS_VALIDATION_FAILED;

/** Where an action is: none asked for, one on its way, or one the service refused. */
type ActionState =
  | { phase: 'idle' }
  | { phase: 'working'; message: string }
  | { phase: 'refused'; title: string; message: string };

const IDLE: ActionState = { phase: 'idle' };

/**
 * The actions themselves, for a session that may take them. Separate from the component
 * below so the acting person's name is a plain `string` here: there is no such thing as
 * one of these controls without an identity to attribute it to.
 */
function OfferedActions({
  file,
  actingUploader,
  onRetried,
}: {
  file: FileLog;
  actingUploader: string;
  onRetried: () => void;
}) {
  const [state, setState] = useState<ActionState>(IDLE);
  const router = useRouter();

  /** Whether a call is already on its way — a second press must not send a second. */
  const working = state.phase === 'working';

  const startRetry = (): void => {
    if (working) {
      return;
    }
    setState({ phase: 'working', message: RETRY_IN_FLIGHT });

    void retryFileValidation(file.Id)
      .then(() => {
        setState(IDLE);
        // The answer says nothing about the file's new state (it is the generic
        // envelope), so the page finds out by re-reading its own calls.
        onRetried();
      })
      .catch((error: unknown) => {
        // One state change, not two: the refusal being reported and the wait being
        // over are the same moment, and a reader must never meet one without the other.
        setState({
          phase: 'refused',
          title: RETRY_REFUSED_TITLE,
          // The service's own wording whenever it sent one, from EITHER place a
          // failure can carry it; never the client's own placeholder.
          message: retryFailureMessage(error),
        });
      });
  };

  const confirmCancel = (): void => {
    if (working) {
      return;
    }
    setState({ phase: 'working', message: CANCEL_IN_FLIGHT });

    void cancelSubmittedFile(file.Id, actingUploader)
      .then(() => {
        // The file is inactive now, so this page would only be able to say it is no
        // longer available. The list is where there is something to do instead — and
        // `replace`, so Back does not return the user to a file that has gone.
        router.replace(UPLOAD_PATH);
      })
      .catch((error: unknown) => {
        setState({
          phase: 'refused',
          title: CANCEL_REFUSED_TITLE,
          message: cancelFailureMessage(error),
        });
      });
  };

  return (
    <section aria-labelledby={HEADING_ID} className="grid gap-4">
      <h2 id={HEADING_ID} className="text-lg font-semibold tracking-tight">
        {HEADING}
      </h2>

      {state.phase === 'refused' && (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none">{state.title}</AlertTitle>
          <AlertDescription className="text-foreground">
            <p>{state.message}</p>
            <p>{ASK_AGAIN_MESSAGE}</p>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {retryApplies(file) && (
          <Button type="button" onClick={startRetry}>
            <RotateCcw aria-hidden="true" />
            {RETRY_LABEL}
          </Button>
        )}

        {cancelApplies(file) && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline">
                <Ban aria-hidden="true" />
                {CANCEL_LABEL}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirmationTitleFor(file)}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {CONFIRMATION_MESSAGE}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                {/* The way out is the one that holds focus when this opens, which is
                    what `AlertDialogCancel` gives for free — so arriving here and
                    pressing Enter keeps the file. */}
                <AlertDialogCancel>{KEEP_FILE_LABEL}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={confirmCancel}
                >
                  {CONFIRM_CANCEL_LABEL}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {state.phase === 'working' && (
        <p role="status" className="text-muted-foreground text-sm">
          {state.message}
        </p>
      )}
    </section>
  );
}

export function SubmittedFileActions({
  file,
  actingUploader,
  onRetried,
}: {
  file: FileLog;
  /**
   * The signed-in Finance Uploader's own name, decided on the SERVER — or `undefined`
   * for a session that may not act on this file at all.
   */
  actingUploader: string | undefined;
  /** Called once a retry has been accepted, so the page can re-read what it shows. */
  onRetried: () => void;
}) {
  // Nothing at all reaches the browser for a session that may not act on the file, and
  // nothing at all for a file neither action applies to — absent, never disabled.
  if (actingUploader === undefined) {
    return null;
  }
  if (!retryApplies(file) && !cancelApplies(file)) {
    return null;
  }

  return (
    <OfferedActions
      file={file}
      actingUploader={actingUploader}
      onRetried={onRetried}
    />
  );
}
