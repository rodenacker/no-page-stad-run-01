'use client';

/**
 * The control that hands the listed expense payment requests to the external payment
 * system as a CSV file (brief R1/R3).
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
 */

import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { deliverFile } from '@/lib/files/deliverFile';
import {
  buildRequestExportCsv,
  expenseRequestExportFileName,
} from '@/lib/transactions/exportCsv';

import type { TransactionRead } from '@/types/transactions';

/**
 * The control's own visible wording. It says what it does, so it owes no tooltip — and
 * because the wording is visible it is also the control's accessible name.
 */
export const EXPORT_ACTION_LABEL = 'Export requests to CSV';

export function ExportRequestsAction({
  listedRequests,
}: {
  /**
   * Every request currently listed, in the order the list is sorted — the caller's
   * ordered, narrowed set (see this file's header). Read only when the control is
   * activated.
   */
  listedRequests: TransactionRead[];
}) {
  const exportListedRequests = (): void => {
    void buildRequestExportCsv(listedRequests).then((contents) => {
      deliverFile(contents, expenseRequestExportFileName());
    });
  };

  return (
    <Button type="button" variant="outline" onClick={exportListedRequests}>
      <Download aria-hidden="true" />
      {EXPORT_ACTION_LABEL}
    </Button>
  );
}
