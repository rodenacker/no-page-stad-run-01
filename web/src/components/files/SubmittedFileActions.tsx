'use client';

/**
 * What the Finance Uploader may DO to a submitted file: send it back for validation, or
 * delete it altogether (`file-deletion` R2, R3, R4, R5, R9, R10, R11, BR1, BR2, BR7).
 *
 * Six things here are deliberate and easy to break:
 *
 * - **WHO may act is decided on the SERVER and arrives as one value.** `actingUploader`
 *   is `hasRole(session, ROLE_IMPORTER) ? displayNameOf(session) : undefined`, computed
 *   by the page (a server component). Absent means this session may not act on the file,
 *   and then NOTHING is rendered — not a disabled control, not a greyed-out one (source
 *   UI-24). So an Approver's browser never receives this markup at all, which is what
 *   makes the exclusion structural rather than cosmetic.
 * - **That same value is the audit identity the delete call must carry.** The service
 *   requires `LastChangedUser` on the delete, and it is the authenticated person's own
 *   name — one value doing both jobs, so the name the service records can never be
 *   anything the user typed or anything the browser chose for itself.
 * - **THE DELETE HAS NO STATUS RULE, and that absence is deliberate.** There used to be
 *   one (`cancelApplies`: `Uploaded` or `Validation failed` only, with an imported file
 *   excluded outright), and `file-deletion` BR1 reverses it on the user's explicit
 *   instruction: a file may be deleted whatever its status, INCLUDING once its rows have
 *   become live expense payment requests. Do not reinstate a gate here, and do not add a
 *   second, wider action beside this one. RETRY's own rule is a different rule that
 *   survives untouched: validation is only worth starting again while it has failed.
 * - **A DELETED file is not a case here at all.** The delete sets `IsActive: false`, so
 *   the file leaves `GET /v1/file-logs?IsActive=Yes` and its page stops resolving —
 *   that is `SubmittedFileDetail`'s "not available" answer, not a variant of this
 *   section. Which is also why a confirmed delete sends the user back to the Expense
 *   files list rather than leaving them on a page whose file no longer exists.
 * - **The delete is gated by the project's shared confirmation (source UI-09).**
 *   `DeleteFileConfirmation` — the epic's ONE confirmation, shared with the Expense
 *   files list — wraps `ConfirmAction`: it NAMES the file, states what deleting
 *   actually destroys (the real request numbers for a file that has imported, the
 *   short warning otherwise, and its own state when the count could not be read),
 *   opens with the way OUT holding focus (a stray Enter keeps the file), and sends
 *   nothing until the confirming choice is taken. None of that wording belongs here:
 *   two surfaces must say the same thing, so it lives in
 *   `lib/files/deleteConfirmation.ts`. The way out reads "keep", and must never be
 *   reworded to "Cancel": the destructive choice is called Delete the file, so a way
 *   out reading "Cancel" would be the one ambiguous wording left on the surface.
 * - **A refusal is reported HERE, in the service's own words**, with the confirmation
 *   closed and the delete still on offer — a user is never trapped in a dialog to read
 *   why something did not happen, and the file is left exactly as it was. Whether the
 *   service accepts a delete on a file that has already IMPORTED is unverified against
 *   the real backend (`file-deletion` BR6), so whatever it answers is what the user is
 *   told: never a claimed success, never a silent no-op.
 */

import { RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  DeleteFileConfirmation,
  useDeleteFileConfirmation,
} from '@/components/files/DeleteFileConfirmation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  deleteFailureMessage,
  deleteSubmittedFile,
  retryFailureMessage,
  retryFileValidation,
} from '@/lib/api/files';
import { UPLOAD_PATH } from '@/lib/auth/access-map';
import { DELETE_FILE_LABEL } from '@/lib/files/deleteConfirmation';
import { FILE_STATUS_VALIDATION_FAILED } from '@/types/files';

import type { FileLog } from '@/types/files';

/** What the section is called, and what ties its heading to it. */
const HEADING_ID = 'submitted-file-actions-heading';
const HEADING = 'Actions';

/**
 * This surface's own control wording. The delete's three labels are NOT here: they
 * are shared with the Expense files list, so they live in
 * `lib/files/deleteConfirmation.ts` with everything else the two surfaces must say
 * identically.
 *
 * `RETRY_LABEL` is deliberately NOT the bare "Try again": that belongs to the
 * processing history's own failed read on this same screen.
 */
const RETRY_LABEL = 'Retry validation';

/** Announced while a call is on its way, since nothing on the page has changed yet. */
const RETRY_IN_FLIGHT = 'Asking for this file to be validated again…';
const DELETE_IN_FLIGHT = 'Deleting this file…';

/** Names what did not happen, so the alert is not just an apology. */
const RETRY_REFUSED_TITLE = 'Could not start validation again';
const DELETE_REFUSED_TITLE = 'Could not delete this file';

/** Says what to do about it — the control itself, which is still right there. */
const ASK_AGAIN_MESSAGE =
  'The file is exactly as it was. Choose the action again to ask once more.';

/**
 * Retry applies only while this file's validation has failed
 * (`file-validation-and-retry` FR4) — the ONE status rule left on this surface, and
 * not the one `file-deletion` BR1 removed. Deleting a file has no status rule at all.
 */
const retryApplies = (file: FileLog): boolean =>
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
  /**
   * Whether the user is being asked to confirm the delete, and what the confirmation
   * knows about the file's expense payment requests. Nothing is sent while it is open.
   *
   * The file this page is about is handed in as the confirmation's current data, so the
   * dialog describes the file as the page's own 15-second re-read now reports it: a
   * file that IMPORTS while its confirmation is open stops being described as one that
   * never will (BR5). That is the whole reason this page re-renders this component with
   * a fresh `file` at all.
   */
  const deleteConfirmation = useDeleteFileConfirmation([file]);
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

  const confirmDelete = (confirmed: FileLog): void => {
    if (working) {
      return;
    }
    setState({ phase: 'working', message: DELETE_IN_FLIGHT });

    void deleteSubmittedFile(confirmed.Id, actingUploader)
      .then(() => {
        // The file is inactive now, so this page would only be able to say it is no
        // longer available. The list is where there is something to do instead — and
        // `replace`, so Back does not return the user to a file that has gone.
        router.replace(UPLOAD_PATH);
      })
      .catch((error: unknown) => {
        // Only the service's own answer decides what is said here — including for a
        // file that had already imported, where what the service does is unverified
        // (`file-deletion` BR6). Nothing above reports a success this never had.
        setState({
          phase: 'refused',
          title: DELETE_REFUSED_TITLE,
          message: deleteFailureMessage(error),
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

        {/* No status condition: the delete is offered on every file this session may
            act on, imported ones included (`file-deletion` R3/BR1). */}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            // Asking is the event that both opens the confirmation and starts reading
            // what this file would destroy — never a render reacting to the dialog.
            deleteConfirmation.ask(file);
          }}
        >
          <Trash2 aria-hidden="true" />
          {DELETE_FILE_LABEL}
        </Button>
        {/* The epic's one confirmation, shared with the Expense files list: it names
            the file, says what deleting actually destroys, holds focus on the way out,
            and sends nothing until the confirming choice is taken. */}
        <DeleteFileConfirmation
          confirmation={deleteConfirmation}
          onConfirm={confirmDelete}
        />
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
  // Nothing at all reaches the browser for a session that may not act on the file —
  // absent, never disabled (source UI-24). There is no second reason to render nothing:
  // a session that MAY act is always offered the delete, whatever the file's status.
  if (actingUploader === undefined) {
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
