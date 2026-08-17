'use client';

/**
 * The control that hands the preview's rejected rows over as a file to correct offline
 * and upload again (epic `import-preview` FR6, FR7, FR8, BR5, BR6, NFR-3).
 *
 * Six things here are deliberate and easy to break:
 *
 * - **IT LIVES INSIDE THE IMPORT PREVIEW, NOT IN THE DOWNLOADS SECTION.** The file is
 *   built from the rows this preview is showing, so the control belongs beside them;
 *   what changes in `FileDownloadActions` is only the wording that says which download
 *   is which (FR7/BR6). The service's own `Download error file` stays where it is, and
 *   neither is a copy of the other.
 * - **NO REJECTED ROWS, NO CONTROL.** With nothing to correct there is no file to
 *   produce, so this renders NOTHING AT ALL — left out of the markup, never a disabled
 *   button (source UI-24, the rule every other conditional action on this page follows).
 * - **THE LABEL NEVER CONTAINS THE WORD "error"** (BR6). The service's generated
 *   diagnostic download owns that word on this page, and the two files are completely
 *   different things: one is the service's report about what went wrong, this one is the
 *   rows themselves, in the shape the upload accepts. The label says what the user DOES
 *   with the file, and the description beside it says which file it is —
 *   `aria-describedby`, so it explains the same thing to somebody listening as it does
 *   to somebody looking. A paragraph merely sitting near two buttons explains neither.
 * - **NO ROLE CHECK, and that is structural.** The epic's access-control table grants
 *   the preview and both downloads to the Importer and the Approver alike, so nothing
 *   here takes a session or a role prop — there is nothing on this surface that can
 *   differ. The `hasRole(session, …)` shape retry and cancel need must not be copied.
 * - **THE FILE IS BUILT ON ACTIVATION and handed over by `deliverFile`.** There is no
 *   correction endpoint and none is being added, so there is no address to link to: an
 *   `<a href>` would have nowhere to point. Building it in a memo instead would rebuild
 *   the whole thing on every re-render of a table that may hold 10,000 rows.
 * - **A FILE THAT CANNOT BE PRODUCED OR HANDED OVER IS A HANDLED STATE** (NFR-3,
 *   project.md NFR-base-5). Building and delivering sit inside one `catch`, the failure
 *   is stated in the app's own plain words — the browser's own error text is not
 *   something to put in front of a user — and the SAME control stays exactly where it
 *   was, which is the whole retry affordance: asking again is pressing it again, and
 *   doing so clears the failure rather than leaving it under a file that did arrive.
 *   The control is never disabled, in this state or while a file is being built:
 *   disabling the control a keyboard user just activated takes the focus out from under
 *   them.
 */

import { Download, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  buildCorrectionCsv,
  correctionFileName,
} from '@/lib/files/correctionCsv';
import { deliverFile } from '@/lib/files/deliverFile';

import type { ImportPreviewRow } from '@/lib/files/importPreviewRows';

/**
 * The control's own visible wording (BR6) — which is also its accessible name, so it
 * owes no tooltip. Reserved on this page: it must never contain the word "error", and it
 * is none of `Download original file`, `Download error file`, `Try again`, `Load this
 * file again`, `Load the preview again`, `Retry validation` or `Cancel file`.
 */
export const CORRECTION_DOWNLOAD_LABEL = 'Download rows to fix and re-upload';

/** Ties the description below to the control it is about. */
const DESCRIPTION_ID = 'correction-rows-download-description';

/**
 * Which file this is, in the user's terms — the half of FR7/BR6 the label cannot carry.
 * It names what the file holds AND what to do with it, so it can never be read as the
 * service's own diagnostic download.
 */
const DESCRIPTION =
  'Just the rejected rows, in the columns the upload accepts, with a reason at the end of each row saying what to fix. Correct them outside this application, then re-upload the file as a new submission.';

/** Announced while the file is being built, since nothing is on screen to see yet. */
const PREPARING_MESSAGE = 'Preparing the rows to fix for download…';

/** Names what did not happen, so the alert is not just an apology. */
const FAILED_TITLE = 'Could not produce the rows to fix';

/**
 * What to do about it — the control itself, which is still right there. The app's own
 * plain wording: whatever the browser said about refusing the file is not a sentence to
 * show a user (project.md NFR-base-5).
 */
const FAILED_MESSAGE =
  'The file could not be produced, so nothing was saved. Choose the download again to ask for it again.';

/** Where the file is: not asked for, being built, or refused. */
type CorrectionState =
  | { phase: 'idle' }
  | { phase: 'building' }
  | { phase: 'failed' };

const IDLE: CorrectionState = { phase: 'idle' };
const BUILDING: CorrectionState = { phase: 'building' };
const FAILED: CorrectionState = { phase: 'failed' };

export function CorrectionRowsDownload({
  rejectedRows,
}: {
  /**
   * The preview's rejected rows, in the order it lists them (`rowsToFixIn`). Each one
   * already carries the values its source held — its own line of the file, or the values
   * the service reported for a rejection matching no line — and the reason the screen
   * shows for it, so nothing about the rows is decided here.
   */
  rejectedRows: ImportPreviewRow[];
}) {
  const [state, setState] = useState<CorrectionState>(IDLE);

  // Nothing was rejected, so there is no file to offer at all.
  if (rejectedRows.length === 0) {
    return null;
  }

  const handOverTheRowsToFix = (): void => {
    // Read once, at activation: the moment the file is named for. Moving to "building"
    // is also what takes a previous failure off the screen, so asking again never leaves
    // a refusal sitting under a file that arrived.
    const producedAt = new Date();
    setState(BUILDING);

    void buildCorrectionCsv(rejectedRows)
      .then((contents) => {
        // Building and handing over are one operation as far as the user is concerned:
        // a browser that refuses to make an address for the file fails here, inside the
        // same `catch`.
        deliverFile(contents, correctionFileName(producedAt));
        setState(IDLE);
      })
      .catch(() => {
        setState(FAILED);
      });
  };

  return (
    <div className="grid justify-items-start gap-2">
      {state.phase === 'failed' && (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none">{FAILED_TITLE}</AlertTitle>
          <AlertDescription className="text-foreground">
            <p>{FAILED_MESSAGE}</p>
          </AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        variant="outline"
        aria-describedby={DESCRIPTION_ID}
        onClick={handOverTheRowsToFix}
      >
        <Download aria-hidden="true" />
        {CORRECTION_DOWNLOAD_LABEL}
      </Button>

      <p
        id={DESCRIPTION_ID}
        className="text-muted-foreground max-w-prose text-sm"
      >
        {DESCRIPTION}
      </p>

      {state.phase === 'building' && (
        <p role="status" className="text-muted-foreground text-sm">
          {PREPARING_MESSAGE}
        </p>
      )}
    </div>
  );
}
