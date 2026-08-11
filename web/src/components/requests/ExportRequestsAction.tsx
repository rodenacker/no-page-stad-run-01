'use client';

/**
 * The control that hands the listed expense payment requests to the external payment
 * system as a CSV file (brief R1/R3), and tells the user what it produced (R4/BR1/BR2).
 *
 * Four things here are deliberate and easy to break:
 *
 * - **There is NO role check on this control, and that is structural.** R3 grants the
 *   export to the Finance Uploader (the auth service's `Importer`) and the Approver
 *   alike, for whatever each currently has listed, so this component takes no session and
 *   no role prop: there is nothing on this surface that can differ per role and nothing
 *   to withhold. The `hasRole(session, …)` shape that submitting a file needs must not be
 *   copied here.
 * - **What it exports is what the caller hands it** — the ORDERED, NARROWED set from the
 *   list's narrow → order → slice pipeline, which is every request the search and filters
 *   left, in the order the list is sorted. Never the page on screen (a one-page file) and
 *   never the whole fetched set (which would ignore the narrowing, brief BR1). This
 *   component does not narrow, order or slice anything itself.
 * - **The file is built ON ACTIVATION, never per render.** The list re-renders on every
 *   keystroke in its search box and holds up to 10,000 requests; building a 10,000-row
 *   string in a memo would undo the deferred narrowing that keeps typing responsive. The
 *   build also yields between chunks — see `lib/transactions/exportCsv.ts`.
 * - **The bytes reach the user through `deliverFile`**, the app's one way to save a file,
 *   exactly as a submitted file's download does. There is no export endpoint in the
 *   transactions contract and none is being added (brief §Data Model), so there is no
 *   address to link to: an `<a href>` here would have nowhere to point.
 *
 * The control is never disabled — not while a file is being built, and not when the
 * narrowing has left nothing listed. Disabling the control a keyboard user has just
 * activated takes the focus out from under them, and the export has to stay reachable by
 * keyboard alone (the project's WCAG 2.2 AA bar).
 *
 * ---------------------------------------------------------------------------
 * THE CONFIRMATION IS COMPLIANCE EVIDENCE, NOT POLISH
 * ---------------------------------------------------------------------------
 * The file this control produces carries every account number WHOLE — the one documented
 * exception to the masking rule the rest of the app obeys (brief §Compliance Exception,
 * POPIA). That exception has TWO halves, and this is the second one: the export is
 * ATTRIBUTED to the person who produced it, at the moment they produced it. An export
 * carrying full account numbers with no record of who produced it does not satisfy the
 * exception, so the name and the moment below may never be dropped as decoration.
 *
 * Four more things about the answer the user gets:
 *
 * - **One notification surface, the app's own.** The confirmation goes through
 *   `useToast()` / the root layout's `ToastContainer`, which is what makes it ANNOUNCED
 *   (`role="status"`, inside a live region) rather than merely drawn in a corner. A
 *   bespoke banner in the list would be a second surface, and the export has to be
 *   completable — feedback included — without a mouse.
 * - **It confirms COMPLETION, not the click.** The file is handed over first and the
 *   confirmation follows, so it can never claim an export that failed to be produced.
 * - **The count is the count of the file**, taken from the array actually written, and
 *   nothing else is named beside it. Naming the unfiltered total as well ("2 of 8
 *   requests") invites exactly the misreading BR1 exists to prevent: what left the
 *   building is 2.
 * - **The name arrives as a PROP** from the server page, which holds the session — the
 *   same arrangement as `SubmittedFileDetail`'s `actingUploader`. Nothing here reads an
 *   identity from the browser: there would be a session cookie call to make it work, and
 *   the identity the export is attributed to would then be one the browser asked for
 *   rather than the one the server gated on.
 *
 * When the narrowing has hidden every request, activating the control produces NO file —
 * not an empty one, not a header row on its own — and says why, in the sentence the
 * screen already uses for that state (`NARROWED_EMPTY_MESSAGE`, stated once in
 * `lib/transactions/narrowing.ts` so this and the list cannot word it differently).
 */

import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastContext';
import { deliverFile } from '@/lib/files/deliverFile';
import {
  buildRequestExportCsv,
  expenseRequestExportFileName,
} from '@/lib/transactions/exportCsv';
import { NARROWED_EMPTY_MESSAGE } from '@/lib/transactions/narrowing';
import { onScreenDateTime } from '@/lib/utils/dateTime';

import type { TransactionRead } from '@/types/transactions';

/**
 * The control's own visible wording. It says what it does, so it owes no tooltip — and
 * because the wording is visible it is also the control's accessible name.
 */
export const EXPORT_ACTION_LABEL = 'Export requests to CSV';

/** Heads the answer when there was nothing to hand over. */
const NOTHING_TO_EXPORT_TITLE = 'Nothing to export';

/**
 * Heads a completed export: HOW MANY requests went into the file, with the number
 * against the thing it counts so it cannot be read as anything else.
 */
const exportedTitle = (exported: number): string =>
  `${String(exported)} expense request${exported === 1 ? '' : 's'} exported`;

/**
 * Who produced the file and when — the attribution half of the compliance exception.
 *
 * A render that was given no name says only when, rather than inventing an author or
 * writing an empty one: the prop is optional because a caller without a session cannot
 * fill it, and a half-written sentence would be worse than a short one.
 */
const attributionOf = (producedAt: Date, exportedBy?: string): string =>
  exportedBy === undefined || exportedBy.length === 0
    ? `Produced at ${onScreenDateTime(producedAt)}.`
    : `Produced by ${exportedBy} at ${onScreenDateTime(producedAt)}.`;

export function ExportRequestsAction({
  listedRequests,
  exportedBy,
}: {
  /**
   * Every request currently listed, in the order the list is sorted — the caller's
   * ordered, narrowed set (see this file's header). Read only when the control is
   * activated.
   */
  listedRequests: TransactionRead[];
  /**
   * The signed-in person's name, from the server page that holds the session
   * (`displayNameOf(session)`) — this is a client component and cannot read it.
   * Optional for the same reason `SubmittedFileDetail`'s `actingUploader` is: a caller
   * with no session has no name to give, and the confirmation then names only the
   * moment.
   */
  exportedBy?: string;
}) {
  const { showToast } = useToast();

  const exportListedRequests = (): void => {
    // Read once, at activation: the set, and the moment. Everything the user is told and
    // the file is named for comes from these two, so the confirmation cannot name a
    // different number — or a different minute — from the file it is about.
    const exported = listedRequests;
    const producedAt = new Date();

    if (exported.length === 0) {
      // BR2: no file at all, and the screen's own sentence for this state.
      showToast({
        variant: 'info',
        title: NOTHING_TO_EXPORT_TITLE,
        message: NARROWED_EMPTY_MESSAGE,
      });
      return;
    }

    void buildRequestExportCsv(exported).then((contents) => {
      deliverFile(contents, expenseRequestExportFileName(producedAt));
      // After the hand-over, so this confirms what the user actually received.
      showToast({
        variant: 'success',
        title: exportedTitle(exported.length),
        message: attributionOf(producedAt, exportedBy),
      });
    });
  };

  return (
    <Button type="button" variant="outline" onClick={exportListedRequests}>
      <Download aria-hidden="true" />
      {EXPORT_ACTION_LABEL}
    </Button>
  );
}
