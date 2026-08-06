'use client';

/**
 * The two files a user may take away from a submitted expense file: the file exactly as
 * it was submitted, and — for a file that failed validation — the error file the
 * service generated for it (brief FR6, FR7).
 *
 * Five things here are deliberate and easy to break:
 *
 * - **TWO DOWNLOADS, TWO DIFFERENT ENDPOINTS.** Which endpoint delivers which file is
 *   stated once, in `lib/api/files.ts` (`downloadSubmittedFile` vs
 *   `downloadGeneratedErrorFile`) — including why the third, similarly-shaped operation
 *   in the contract is used by neither. Transposing them would hand the user the wrong
 *   file with no error to show for it, so nothing here builds an address of its own.
 * - **NEITHER DOWNLOAD IS ROLE-GATED, and that is structural.** The epic's
 *   access-control table grants both to the Finance Uploader and to the Approver alike,
 *   so this component takes no session and no role prop: there is nothing on this
 *   surface that can differ per role, and nothing to withhold. The
 *   `hasRole(session, ROLE_IMPORTER) && …` shape that retry and cancel need must not be
 *   copied here.
 * - **The error-file action is offered only when the service says there IS one**, and
 *   `HasBulkErrorFile` is the STRING `'Yes'` / `'No'` on the wire — so a truthiness
 *   check would offer it for `'No'` too. When there is none the control is LEFT OUT of
 *   the markup, never rendered disabled (source UI-24, the same rule as every other
 *   conditional action in this app).
 * - **A CONTROL, NOT A LINK.** A plain `<a href>` at a download endpoint would drop the
 *   user onto a raw error response the moment the service refused, which project.md
 *   NFR-base-5 forbids. Instead the bytes are fetched from the browser through the
 *   shared client and handed over by `deliverFile`, and a refusal is reported here in
 *   the service's own words — with both controls left exactly as they were, so asking
 *   again needs nothing but pressing the same control (which is this section's retry
 *   affordance; the exact words "Try again" belong to the processing history's own
 *   failed read on this same screen and must not be reused).
 * - **Neither control is disabled while its file is on its way.** Disabling the control
 *   a keyboard user has just activated takes the focus out from under them; the wait is
 *   announced in its own right instead.
 */

import { Download, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  downloadFailureMessage,
  downloadGeneratedErrorFile,
  downloadSubmittedFile,
} from '@/lib/api/files';
import { deliverFile } from '@/lib/files/deliverFile';

import type { FileLog } from '@/types/files';

/** What the section is called, and what ties its heading to it. */
const HEADING_ID = 'file-download-actions-heading';
const HEADING = 'Downloads';

/**
 * The two controls' own wording. Reserved across this epic's stories: the queries that
 * find them match these words, so neither may be reworded on its own.
 */
const ORIGINAL_FILE_LABEL = 'Download original file';
const ERROR_FILE_LABEL = 'Download error file';

/** How each download reads inside a sentence about it. */
const ORIGINAL_FILE_SUBJECT = 'the original file';
const ERROR_FILE_SUBJECT = 'the error file';

/** What the reader is told about the two downloads before taking either. */
const DESCRIPTION =
  'Each file is saved under the name the transactions service holds for it. Correct your data outside this application, then submit or retry the file.';

/** The wire value of `HasBulkErrorFile` that means the service generated one. */
const HAS_ERROR_FILE = 'Yes';

/** Names what did not happen, so the alert is not just an apology. */
const failedTitleFor = (subject: string): string =>
  `Could not download ${subject}`;

/** Says what to do about it — the control itself, which is still right there. */
const ASK_AGAIN_MESSAGE =
  'Choose the download again to ask for the file again.';

/** Announced while a file is on its way, since nothing is on screen to see yet. */
const preparingMessageFor = (subject: string): string =>
  `Preparing ${subject} for download…`;

/** One of the downloads on offer for this file. */
interface OfferedDownload {
  /** The control's own wording. */
  label: string;
  /** How this download reads inside a sentence. */
  subject: string;
  /** The name the delivered file must arrive under — the service's own. */
  fileName: string;
  /** The endpoint that answers with this file's bytes. */
  read: () => Promise<Blob>;
}

/** Where a download is: none asked for, one on its way, or one refused. */
type DownloadState =
  | { phase: 'idle' }
  | { phase: 'asking'; subject: string }
  | { phase: 'refused'; subject: string; message: string };

const IDLE: DownloadState = { phase: 'idle' };

/**
 * The downloads this file actually has. The error file is absent from the list — and so
 * from the markup — unless the service reported one for the file.
 */
const downloadsFor = (file: FileLog): OfferedDownload[] => {
  const offered: OfferedDownload[] = [
    {
      label: ORIGINAL_FILE_LABEL,
      subject: ORIGINAL_FILE_SUBJECT,
      fileName: file.CurrentFileName,
      read: () => downloadSubmittedFile(file.Id),
    },
  ];

  if (file.HasBulkErrorFile === HAS_ERROR_FILE) {
    offered.push({
      label: ERROR_FILE_LABEL,
      subject: ERROR_FILE_SUBJECT,
      // The generated error file's own name, as the service reported it on the file
      // log. Nothing is invented where it named none: an empty name leaves the naming
      // to the browser instead.
      fileName: file.BulkErrorFile ?? '',
      read: () => downloadGeneratedErrorFile(file.Id),
    });
  }

  return offered;
};

export function FileDownloadActions({ file }: { file: FileLog }) {
  const [state, setState] = useState<DownloadState>(IDLE);

  const offered = downloadsFor(file);

  const startDownload = (download: OfferedDownload): void => {
    setState({ phase: 'asking', subject: download.subject });

    void download
      .read()
      .then((contents) => {
        deliverFile(contents, download.fileName);
        setState(IDLE);
      })
      .catch((error: unknown) => {
        // One state change, not two: the refusal being reported and the wait being
        // over are the same moment, and a reader must never meet one without the other.
        setState({
          phase: 'refused',
          subject: download.subject,
          // The service's own wording whenever it sent one, from EITHER place a
          // failure can carry it; never the client's own placeholder.
          message: downloadFailureMessage(error),
        });
      });
  };

  return (
    <section aria-labelledby={HEADING_ID} className="grid gap-4">
      <h2 id={HEADING_ID} className="text-lg font-semibold tracking-tight">
        {HEADING}
      </h2>

      <p className="text-muted-foreground max-w-prose text-sm">{DESCRIPTION}</p>

      {state.phase === 'refused' && (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none">
            {failedTitleFor(state.subject)}
          </AlertTitle>
          <AlertDescription className="text-foreground">
            <p>{state.message}</p>
            <p>{ASK_AGAIN_MESSAGE}</p>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {offered.map((download) => (
          <Button
            key={download.label}
            type="button"
            variant="outline"
            onClick={() => {
              startDownload(download);
            }}
          >
            <Download aria-hidden="true" />
            {download.label}
          </Button>
        ))}
      </div>

      {state.phase === 'asking' && (
        <p role="status" className="text-muted-foreground text-sm">
          {preparingMessageFor(state.subject)}
        </p>
      )}
    </section>
  );
}
