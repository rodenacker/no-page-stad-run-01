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
 * Five things here are deliberate and easy to break:
 *
 * - **ASKING IS AN EVENT, AND THE READ STARTS FROM IT.** {@link useDeleteFileConfirmation}
 *   is driven by the user choosing the delete — `ask(file)` opens the confirmation AND
 *   begins the count in the same action. It is deliberately NOT an effect watching an
 *   `open` prop: a render-reaction would both be a `set-state-in-effect` lint failure
 *   and put a render between the dialog opening and the count starting.
 * - **The count is read only for a file that has IMPORTED**, and only because the
 *   delete was asked for. A file in any other status never produced requests, so
 *   nothing is fetched for it at all (R7/BR3).
 * - **The confirmation opens straight into the counting state** for a file that could
 *   have produced requests — `ask` sets the file and that state in one update — so
 *   there is no moment where the short "the file and its rows" wording is on screen
 *   for a file whose requests may already carry an Approver's decision (BR5).
 * - **A refused count is its own state.** It carries the SERVICE's own reason
 *   (`transactionListFailureMessage`, so the client's internal placeholder never
 *   reaches a user) and never falls back to the short wording or to a zero (BR5).
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

import { useCallback, useRef, useState } from 'react';

import { ConfirmAction } from '@/components/common/ConfirmAction';
import { transactionListFailureMessage } from '@/lib/api/transactions';
import {
  CONFIRM_DELETE_LABEL,
  COUNTING,
  KEEP_FILE_LABEL,
  NOT_COUNTED,
  deleteConfirmationMessageFor,
  deleteConfirmationTitleFor,
  fetchRequestCountsFor,
  mayHaveProducedRequests,
} from '@/lib/files/deleteConfirmation';

import type { RequestCountState } from '@/lib/files/deleteConfirmation';
import type { FileLog } from '@/types/files';

/** The file the user is currently being asked about, and what is known about it. */
export interface AskedDeletion {
  file: FileLog;
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
   * The user chose the delete for this file: opens the confirmation and, for a file
   * that could have produced expense payment requests, starts counting them.
   */
  ask: (file: FileLog) => void;
  /** Nothing more is being asked — the way out, Escape, or the choice being taken. */
  close: () => void;
}

export function useDeleteFileConfirmation(): DeleteFileConfirmationController {
  const [asked, setAsked] = useState<AskedDeletion | undefined>(undefined);
  /**
   * Which ask the answer on its way belongs to. A read whose ask has been superseded
   * — the dialog closed, or the delete asked for again — must never answer over the
   * state that replaced it, and must never resurrect a dialog the user has left.
   */
  const currentAsk = useRef(0);

  const ask = useCallback((file: FileLog): void => {
    currentAsk.current += 1;
    const thisAsk = currentAsk.current;
    const countable = mayHaveProducedRequests(file);

    // One update: the file, and the state its status puts the confirmation in. A file
    // that could have produced requests therefore opens ON the counting message, never
    // for a moment on the wording for a file with nothing to lose (BR5).
    setAsked({ file, count: countable ? COUNTING : NOT_COUNTED });

    if (!countable) {
      // A file that never imported produced no requests, so there is nothing to read
      // and nothing is sent (R7/BR3).
      return;
    }

    const settle = (count: RequestCountState): void => {
      if (currentAsk.current !== thisAsk) {
        return;
      }
      setAsked((current) =>
        current === undefined ? current : { ...current, count },
      );
    };

    void fetchRequestCountsFor(file.Id)
      .then((counts) => {
        settle({ phase: 'counted', counts });
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
  }, []);

  const close = useCallback((): void => {
    // Anything still on its way stops mattering the moment the user leaves.
    currentAsk.current += 1;
    setAsked(undefined);
  }, []);

  return { asked, ask, close };
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
      onConfirm={() => {
        if (asked !== undefined) {
          onConfirm(asked.file);
        }
      }}
    />
  );
}
