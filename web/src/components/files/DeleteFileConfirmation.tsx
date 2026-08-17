'use client';

/**
 * The confirmation shown before a submitted file is deleted — ONE implementation for
 * both surfaces the delete is offered on (`file-deletion` R6, R7, R8, BR3, BR4, BR5).
 *
 * The file's own page (`SubmittedFileActions`) and a row of the Expense files list
 * (`SubmittedFilesList`) use this same pair, so the two cannot read differently for
 * the same file. All of the wording lives one level down in
 * `lib/files/deleteConfirmation.ts`; this file decides only WHICH of the three states
 * applies, and reads the count when there is one to read.
 *
 * Six things here are deliberate and easy to break:
 *
 * - **THE FILE IS RE-READ WHILE THE DIALOG IS OPEN, AND THE WORDING IS DERIVED FROM
 *   WHAT THE SERVICE SAYS NOW.** Both surfaces re-read the active file list on a timer
 *   while any file is still being processed, so a file can IMPORT with its own delete
 *   confirmation open on it. The caller therefore hands
 *   {@link useDeleteFileConfirmation} the files it currently has, and everything on
 *   screen — the title's file name, and which of the states applies
 *   (`countStateFor`) — is derived from the row with the asked file's id in that data,
 *   NOT from the snapshot captured when the delete was asked for. A frozen snapshot is
 *   how this dialog would come to say "none of them will become expense payment
 *   requests" about a file that has since imported and may hold already-decided
 *   requests (BR5). A file that has left the caller's data entirely (deleted from
 *   another tab) keeps its snapshot, there being nothing newer to describe it with.
 * - **The count is a read the confirmation is OWED, not an action the ask performs.**
 *   Which is why it is started from that same derivation rather than inside `ask`: the
 *   file that needs counting may only become countable later, and the wording on screen
 *   and the read in flight must agree at every moment. Nothing is set synchronously in
 *   that effect — the state changes only when the read ANSWERS — so this is not the
 *   `set-state-in-effect` shape, and the dialog still paints its counting wording in
 *   the very first render after the ask, because that wording is derived rather than
 *   stored.
 * - **The count is read only for a file that has IMPORTED**, and only because the
 *   delete was asked for. A file in any other status never produced requests, so
 *   nothing is fetched for it at all (R7/BR3).
 * - **A refused count is its own state.** It carries the SERVICE's own reason
 *   (`transactionListFailureMessage`, so the client's internal placeholder never
 *   reaches a user) and never falls back to the short wording or to a zero (BR5).
 * - **An answer only lands on the ask that asked for it.** Every ask carries a
 *   sequence number that no later ask reuses, and a read's answer is written through a
 *   functional update that keeps it only while the state still holds that same ask. So
 *   a read whose dialog was closed, re-asked, or re-asked for a DIFFERENT file can
 *   neither answer over newer state nor resurrect a dialog the user has left.
 * - **The count arriving must not move focus.** Only the description's TEXT changes
 *   when the read lands — the dialog is not re-opened and nothing is re-mounted — so
 *   the way out keeps the focus `AlertDialogCancel` gave it, and a stray Enter still
 *   keeps the file. That is also why the in-flight state is announced in the
 *   description itself rather than in a second live region beside it.
 *
 * Nothing here deletes anything: `onConfirm` is the caller's, exactly as
 * `ConfirmAction` intends. The caller owns the one delete call this app has, and
 * reports a refusal on the screen BEHIND the dialog.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ConfirmAction } from '@/components/common/ConfirmAction';
import {
  TRANSACTION_LIST_FAILED_MESSAGE,
  transactionListFailureMessage,
} from '@/lib/api/transactions';
import {
  CONFIRM_DELETE_LABEL,
  KEEP_FILE_LABEL,
  NOT_COUNTED,
  countStateFor,
  deleteConfirmationMessageFor,
  deleteConfirmationTitleFor,
  fetchRequestCountsFor,
  mayHaveProducedRequests,
} from '@/lib/files/deleteConfirmation';

import type { RequestCountState } from '@/lib/files/deleteConfirmation';
import type { FileLog } from '@/types/files';

/**
 * The file the user is currently being asked about, and what is known about it.
 *
 * `file` is the file as the caller's CURRENT data describes it, not as it read when the
 * delete was asked for — see the header.
 */
export interface AskedDeletion {
  file: FileLog;
  count: RequestCountState;
}

/**
 * One ask, as it is held: the file the user chose, whatever its requests have been
 * counted to, and the sequence number that tells this ask apart from every other.
 */
interface HeldAsk {
  /** Never reused by a later ask, so an answer cannot land on the wrong one. */
  sequence: number;
  /** What the service said about the file at the moment it was asked about. Only ever
   * used where the caller's current data no longer carries the file at all. */
  file: FileLog;
  /** What has actually been READ — `not-counted` until an answer lands. What the user
   * is shown is derived from it and the file's current status (`countStateFor`). */
  count: RequestCountState;
}

/**
 * Which file's deletion is being asked about, and the two things that change it.
 *
 * Held by whichever surface offers the delete: the file's own page has one file, and
 * the Expense files list has one of these for the whole table, since only one row can
 * be being confirmed at a time.
 */
export interface DeleteFileConfirmationController {
  /** The confirmation on screen, or `undefined` while none is being asked. */
  asked: AskedDeletion | undefined;
  /**
   * The user chose the delete for this file: opens the confirmation, which describes
   * what deleting the file as the service NOW reports it would destroy.
   */
  ask: (file: FileLog) => void;
  /** Nothing more is being asked — the way out, Escape, or the choice being taken. */
  close: () => void;
}

/**
 * @param listed the files the asking surface currently has from the service — the whole
 * table for the Expense files list, the one file it is about for a file's own page. The
 * confirmation describes the file with the asked id in THIS data, so a re-read that
 * moves the file on is reflected in what the user is agreeing to.
 */
export function useDeleteFileConfirmation(
  listed: readonly FileLog[],
): DeleteFileConfirmationController {
  const [held, setHeld] = useState<HeldAsk | undefined>(undefined);
  /** Hands out each ask's sequence number, and never hands the same one out twice. */
  const asks = useRef(0);

  const ask = useCallback((file: FileLog): void => {
    asks.current += 1;
    setHeld({ sequence: asks.current, file, count: NOT_COUNTED });
  }, []);

  const close = useCallback((): void => {
    setHeld(undefined);
  }, []);

  /**
   * The file as the service now describes it — or, only where it has left the caller's
   * data altogether, as it read when the delete was asked for.
   */
  const file =
    held === undefined
      ? undefined
      : (listed.find((listedFile) => listedFile.Id === held.file.Id) ??
        held.file);

  /**
   * The file whose requests still have to be read, or `undefined` when there is
   * nothing to count: no confirmation is open, the file never imported, or a count has
   * already answered. Derived, so a file that IMPORTS under an open confirmation is
   * counted from that moment (BR5) exactly as one that had already imported when the
   * delete was asked for.
   */
  const toCount =
    held !== undefined &&
    file !== undefined &&
    held.count.phase === 'not-counted' &&
    mayHaveProducedRequests(file)
      ? file.Id
      : undefined;
  const sequence = held?.sequence;

  useEffect(() => {
    if (toCount === undefined || sequence === undefined) {
      return;
    }

    /**
     * Writes the answer, and only onto the ask that asked for it: a functional update
     * so the decision is made against the state as it stands when the answer lands —
     * which is what stops a superseded read answering over newer state and stops one
     * resurrecting a dialog the user has already left.
     */
    const settle = (count: RequestCountState): void => {
      setHeld((current) =>
        current === undefined || current.sequence !== sequence
          ? current
          : { ...current, count },
      );
    };

    void fetchRequestCountsFor(toCount)
      .then((counts) => {
        // A read that answered with no readable list counted NOTHING, and must not be
        // told as a zero — "this file produced no expense payment requests at all" is
        // the most reassuring thing the confirmation can say, and it would be a guess
        // here (BR5). It gets the same failed-count state a refused read gets, with
        // the same plain sentence used when the service said nothing readable.
        settle(
          counts === undefined
            ? { phase: 'unavailable', reason: TRANSACTION_LIST_FAILED_MESSAGE }
            : { phase: 'counted', counts },
        );
      })
      .catch((error: unknown) => {
        // The service's own wording whenever it sent one, from either place a failure
        // can carry it (project.md NFR-base-5) — never a zero, and never the short
        // wording (BR5).
        settle({
          phase: 'unavailable',
          reason: transactionListFailureMessage(error),
        });
      });
  }, [toCount, sequence]);

  return {
    asked:
      held === undefined || file === undefined
        ? undefined
        : { file, count: countStateFor(file, held.count) },
    ask,
    close,
  };
}

export function DeleteFileConfirmation({
  confirmation,
  onConfirm,
}: {
  /** The state {@link useDeleteFileConfirmation} holds for the asking surface. */
  confirmation: DeleteFileConfirmationController;
  /** Taken only when the confirming choice is; the caller sends the delete. */
  onConfirm: (file: FileLog) => void;
}) {
  const { asked, close } = confirmation;

  return (
    <ConfirmAction
      open={asked !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      // Only ever read while the dialog is open, which is exactly when there is a file
      // to name — the alert dialog renders no content at all while it is closed.
      title={asked === undefined ? '' : deleteConfirmationTitleFor(asked.file)}
      description={
        asked === undefined ? '' : deleteConfirmationMessageFor(asked.count)
      }
      confirmLabel={CONFIRM_DELETE_LABEL}
      wayOutLabel={KEEP_FILE_LABEL}
      destructive
      // This description CHANGES while the dialog is open — the counting wording is
      // replaced by the real numbers — and replacing described-by text announces
      // nothing by itself. Marked live from the OPEN (not from the moment the count
      // lands, which would be too late for the region to exist), so the numbers reach
      // a screen-reader user who arrived on "Counting…" without anything moving focus.
      descriptionLive
      onConfirm={() => {
        if (asked !== undefined) {
          onConfirm(asked.file);
        }
      }}
    />
  );
}
