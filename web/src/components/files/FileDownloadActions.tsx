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
 *   announced in its own right instead. Which is exactly why **EACH DOWNLOAD KEEPS ITS
 *   OWN WAIT AND ITS OWN REFUSAL**: with both controls usable, both files can be on
 *   their way at once, and one shared state would let whichever answered first clear the
 *   other's announced wait or overwrite the other's refusal. A single in-flight guard is
 *   NOT the answer here — it would make the second control silently do nothing, which is
 *   worse than the interference. So the state is per download, and each download's wait
 *   and refusal name the file they are about.
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
  /**
   * The control's own wording — and, because the two on offer are always worded
   * differently, what tells this download's own wait and refusal from the other's.
   */
  label: string;
  /** How this download reads inside a sentence. */
  subject: string;
  /** The name the delivered file must arrive under — the service's own. */
  fileName: string;
  /** The endpoint that answers with this file's bytes. */
  read: () => Promise<Blob>;
}

/** Where ONE download is: not asked for, on its way, or refused. */
type DownloadState =
  | { phase: 'idle' }
  | { phase: 'asking' }
  | { phase: 'refused'; message: string };

const IDLE: DownloadState = { phase: 'idle' };
const ASKING: DownloadState = { phase: 'asking' };

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
  /**
   * Where EACH download is, by its own label. Absent means nobody has asked for it, so
   * the initial state is simply empty rather than one entry per download — and a `Map`,
   * whose answer for a key it does not hold cannot be anything but `undefined`.
   */
  const [states, setStates] = useState<ReadonlyMap<string, DownloadState>>(
    new Map(),
  );

  const offered = downloadsFor(file);

  const stateOf = (download: OfferedDownload): DownloadState =>
    states.get(download.label) ?? IDLE;

  /** Moves ONE download along, leaving every other download's state untouched. */
  const moveDownloadTo = (
    download: OfferedDownload,
    next: DownloadState,
  ): void => {
    setStates((current) => new Map(current).set(download.label, next));
  };

  const startDownload = (download: OfferedDownload): void => {
    // No in-flight guard: choosing a control that appears usable must never be a no-op
    // (see this file's header). Asking twice asks the service twice, which is what the
    // reader just asked for.
    moveDownloadTo(download, ASKING);

    void download
      .read()
      .then((contents) => {
        deliverFile(contents, download.fileName);
        moveDownloadTo(download, IDLE);
      })
      .catch((error: unknown) => {
        // One state change, not two: the refusal being reported and the wait being
        // over are the same moment, and a reader must never meet one without the other.
        moveDownloadTo(download, {
          phase: 'refused',
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

      {/* One refusal per download that was refused, each naming its own file — so a
          refusal on one download can never be overwritten, or explained away, by what
          happened to the other. */}
      {offered.map((download) => {
        const state = stateOf(download);
        if (state.phase !== 'refused') {
          return null;
        }
        return (
          <Alert key={download.label}>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle className="line-clamp-none">
              {failedTitleFor(download.subject)}
            </AlertTitle>
            <AlertDescription className="text-foreground">
              <p>{state.message}</p>
              <p>{ASK_AGAIN_MESSAGE}</p>
            </AlertDescription>
          </Alert>
        );
      })}

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

      {/* And one announced wait per download that is on its way, for the same reason:
          the first file to arrive must not take the other's wait off the screen. */}
      {offered.map((download) =>
        stateOf(download).phase === 'asking' ? (
          <p
            key={download.label}
            role="status"
            className="text-muted-foreground text-sm"
          >
            {preparingMessageFor(download.subject)}
          </p>
        ) : null,
      )}
    </section>
  );
}
