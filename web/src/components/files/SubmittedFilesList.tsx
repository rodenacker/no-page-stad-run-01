'use client';

/**
 * Every expense file that has been submitted, as the transactions service reports
 * it — the screen both the Importer and the Approver watch (brief R3, R9) —
 * keeping itself current while any of those files is still being processed.
 *
 * Five things about this component are deliberate and easy to break:
 *
 * - **Everything on screen is the service's own value** (brief BR5). The status, the
 *   most recent activity and the record count are printed as they arrived, and so is
 *   the process date: nothing here computes, reformats or infers a value. A status
 *   the app has never heard of is shown as written rather than blanked, remapped to a
 *   known one, or treated as an error — the backend owns that vocabulary, and a new
 *   value must reach the user instead of disappearing (project.md's "displayed, not
 *   policed" stance).
 * - **The read happens in the BROWSER**, through the shared API client at the app's
 *   own same-origin address (`lib/api/files.ts`). That is what lets the session
 *   cookie travel by itself, what makes the three states below this component's
 *   own business rather than a server render's, and what makes keeping the rows
 *   current possible at all.
 * - **All three non-data states are answered** (project.md NFR-base-5): a busy state
 *   that is announced and not merely drawn, a plain sentence when nothing has been
 *   submitted yet, and — when the list cannot be loaded — the service's own wording
 *   plus one action that asks for it again. A failed load is never a blank screen.
 * - **The rows keep themselves up to date, and only while that is worth doing**
 *   (brief Feature NFR "List currency", R10/BR2). While any listed file is still
 *   working (`Uploaded` / `Validating`) the SAME list call is re-read on a timer and
 *   the rows catch up in place; once nothing is in progress the timer stops and the
 *   screen goes quiet. There is one timer at most, and it is cleared when this
 *   component goes away.
 * - **A re-read that fails changes nothing on screen.** The failed-load state above
 *   belongs to a read that left the user with nothing; a screen already showing real
 *   values keeps them rather than losing them to one unanswered request (story 3
 *   AC-5). Every re-read — the timer's and the one a submission asks for — behaves
 *   that way.
 *
 * The status chip pairs an intent colour with the status TEXT and an icon, never
 * colour alone (brief §Feature NFRs, source UI-21). It is the shared
 * `components/status/StatusBadge`, which owns the intents and their tokens; all this
 * screen supplies is what each FILE status means.
 */

import {
  CircleCheck,
  CircleSlash,
  FileUp,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { StatusBadge } from '@/components/status/StatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/contexts/ToastContext';
import { serviceDetailOf, serviceMessageOf } from '@/lib/api/errors';
import { fetchSubmittedFiles } from '@/lib/api/files';
import { subscribeToFileSubmissions } from '@/lib/files/fileSubmissions';
import {
  FILE_STATUS_CANCELLED,
  FILE_STATUS_IMPORTED,
  FILE_STATUS_UPLOADED,
  FILE_STATUS_VALIDATING,
  FILE_STATUS_VALIDATION_FAILED,
  isFileInProgress,
  isKnownFileStatus,
} from '@/types/files';

import type { StatusPresentation } from '@/components/status/StatusBadge';
import type { FileLog, FileLogList, FileStatus } from '@/types/files';

/** What the section is called, and what ties its heading to it. */
const HEADING_ID = 'submitted-files-heading';
const HEADING = 'Submitted files';

/** Announced while the list is being read, so the wait is not colour and motion only. */
const LOADING_MESSAGE = 'Loading the submitted files…';

/** Nothing has been submitted yet — an empty list is an answer, not a failure. */
const EMPTY_MESSAGE = 'No files have been submitted yet.';

/** Names what did not happen, so the alert is not just an apology. */
const FAILED_TITLE = 'Could not load the submitted files';

/**
 * Shown when the read failed with nothing readable from the service. The client's own
 * placeholders ("Internal Server Error: …") are never put in front of a user, so this
 * plain sentence stands in for them (project.md NFR-base-5).
 */
const FAILED_MESSAGE =
  'The submitted files could not be loaded. Please try again.';

/**
 * How long the screen waits before asking the service again while a file is still
 * being processed.
 *
 * Short enough that a file finishing is news rather than history, long enough that a
 * screen left open all afternoon is not a load on the service — and it only ever runs
 * while something is actually in progress. Anything up to a minute satisfies this
 * story's tests; the value itself is nobody's contract.
 */
const REFRESH_INTERVAL_MS = 15_000;

/** Said when a submitted file has finished importing (brief R10). */
const IMPORTED_TITLE = 'File imported';

/**
 * What the user is told when a file finishes: the file's own name and the record
 * count the SERVICE reported, both verbatim (brief BR5) — the screen counts nothing.
 */
const importedMessage = (file: FileLog): string =>
  `${file.CurrentFileName} finished importing. Records imported: ${file.RecordCount}.`;

/**
 * What each recognised file status MEANS, following the mapping settled at project
 * level (project.md §Semantic status colors, brief §Feature NFRs): in-progress and
 * finished-well states are informational and successful, a failed validation is
 * something the user acts on, and a cancelled file is inert. The colours those
 * intents wear belong to the shared badge, not to this screen.
 */
const STATUS_PRESENTATION: Record<FileStatus, StatusPresentation> = {
  [FILE_STATUS_UPLOADED]: { intent: 'informational', icon: FileUp },
  [FILE_STATUS_VALIDATING]: { intent: 'informational', icon: LoaderCircle },
  [FILE_STATUS_VALIDATION_FAILED]: { intent: 'attention', icon: TriangleAlert },
  [FILE_STATUS_IMPORTED]: { intent: 'positive', icon: CircleCheck },
  [FILE_STATUS_CANCELLED]: { intent: 'neutral', icon: CircleSlash },
};

/**
 * The status as the service sent it. A status this app has no name for is left without
 * a presentation, so the shared badge shows it neutral and iconless — with the
 * service's own words (brief BR5).
 */
function FileStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge
      status={status}
      presentation={
        isKnownFileStatus(status) ? STATUS_PRESENTATION[status] : undefined
      }
    />
  );
}

/** Where the list is: being read, read, or unreadable. */
type ListState =
  | { phase: 'loading' }
  | { phase: 'loaded'; files: FileLog[] }
  | { phase: 'failed'; message: string };

const LOADING: ListState = { phase: 'loading' };

/**
 * The files in a response body, tolerating a body that carries none: an absent
 * property is the empty list, which is a legitimate answer and not a failure.
 */
const filesIn = (body: FileLogList | undefined): FileLog[] =>
  Array.isArray(body?.FileLog) ? body.FileLog : [];

export function SubmittedFilesList() {
  const [state, setState] = useState<ListState>(LOADING);
  /** Bumped by Try again; asking for the list again is what re-runs the read. */
  const [readsRequested, setReadsRequested] = useState(0);
  /** The app's one notification surface, in the root layout (brief R10). */
  const { showToast } = useToast();

  /**
   * What status each listed file was last seen in, by file id. This is a record of
   * what the user has already been told — not something rendered — so it lives in a
   * ref, and it is what makes a file ARRIVING at `Imported` tellable from a file that
   * was already imported when the screen opened: only the first is news.
   */
  const statusesAlreadySeen = useRef<Map<number, string>>(new Map());

  /**
   * Tells the user about every file that has just finished importing, and remembers
   * what each listed file is now.
   *
   * A file resolving to `Validation failed` is deliberately NOT announced: what to
   * tell the uploader about invalid rows is the `file-validation-and-retry` epic's
   * requirement (R91), and saying something vague here would pre-empt it. The row
   * shows the status either way.
   */
  const announceFinishedImports = useCallback(
    (files: FileLog[]): void => {
      const seen = statusesAlreadySeen.current;

      files.forEach((file) => {
        const previousStatus = seen.get(file.Id);
        seen.set(file.Id, file.CurrentStatus);

        const justImported =
          previousStatus !== undefined &&
          previousStatus !== FILE_STATUS_IMPORTED &&
          file.CurrentStatus === FILE_STATUS_IMPORTED;

        if (justImported) {
          showToast({
            variant: 'success',
            title: IMPORTED_TITLE,
            message: importedMessage(file),
          });
        }
      });
    },
    [showToast],
  );

  /**
   * Reads the list and puts what came back on screen.
   *
   * A failure is only ever reported as the failed-load state when there is nothing on
   * screen to lose (a first read, or a Try again, which puts the screen back into its
   * busy state first). When real rows are already showing, a failed read is left
   * unmentioned and those rows stay exactly as they were — a background refresh must
   * not blank the list or replace it with an error (story 3 AC-5).
   *
   * `stillWatching` is how a caller says its read no longer matters: this component
   * has gone away, or the screen has moved on.
   */
  const readList = useCallback(
    (stillWatching: () => boolean): Promise<void> =>
      fetchSubmittedFiles()
        .then((body) => {
          if (!stillWatching()) {
            return;
          }
          const files = filesIn(body);
          announceFinishedImports(files);
          setState({ phase: 'loaded', files });
        })
        .catch((error: unknown) => {
          if (!stillWatching()) {
            return;
          }
          setState((current) =>
            current.phase === 'loaded'
              ? current
              : {
                  phase: 'failed',
                  // The service's own wording when it sent one, from EITHER place a
                  // failure can carry it — the transactions service describes a
                  // failure with a 500, where the client keeps its own placeholder
                  // on `message` and the service's `Messages[]` on `details`. Never
                  // the placeholder itself: `serviceMessageOf` / `serviceDetailOf`
                  // draw that line (architecture.md §Shared building blocks).
                  message:
                    serviceMessageOf(error) ??
                    serviceDetailOf(error) ??
                    FAILED_MESSAGE,
                },
          );
        }),
    [announceFinishedImports],
  );

  useEffect(() => {
    // A read that is still in flight when this component goes away — or when the
    // user asks for the list again — must not land on a screen that has moved on.
    let watching = true;

    void readList(() => watching);

    return () => {
      watching = false;
    };
  }, [readsRequested, readList]);

  /**
   * Whether any listed file is still working, which is the only reason to keep asking
   * the service anything. Read straight off what is on screen, so it cannot disagree
   * with the rows the user is looking at.
   */
  const somethingIsInProgress =
    state.phase === 'loaded' &&
    state.files.some((file) => isFileInProgress(file.CurrentStatus));

  /**
   * While something is in progress, the same list call is re-read on a timer and the
   * rows catch up in place (brief Feature NFR "List currency"). Once nothing is in
   * progress this effect stops running, which clears the timer: the screen goes quiet
   * rather than asking a settled question forever. One timer at most — it is tied to
   * that single fact, not to every render — and it goes away with the component.
   */
  useEffect(() => {
    if (!somethingIsInProgress) {
      return;
    }

    let watching = true;
    const refresh = setInterval(() => {
      void readList(() => watching);
    }, REFRESH_INTERVAL_MS);

    return () => {
      watching = false;
      clearInterval(refresh);
    };
  }, [somethingIsInProgress, readList]);

  /**
   * A file submitted elsewhere on this screen is not in this list yet, and the
   * upload's answer carries no file identifier — so the only way it can appear is a
   * re-read (brief §Notes & Caveats). The rows already on screen deliberately stay
   * put while that read is in flight: nothing about them has been invalidated, and
   * blanking them would be a worse answer than showing them a moment out of date.
   */
  useEffect(
    () =>
      subscribeToFileSubmissions(() => {
        setReadsRequested((reads) => reads + 1);
      }),
    [],
  );

  const readAgain = (): void => {
    setState(LOADING);
    setReadsRequested((reads) => reads + 1);
  };

  return (
    <section aria-labelledby={HEADING_ID} className="grid gap-4">
      <h2 id={HEADING_ID} className="text-lg font-semibold tracking-tight">
        {HEADING}
      </h2>

      {state.phase === 'loading' && (
        <div role="status" className="grid gap-2">
          <span className="sr-only">{LOADING_MESSAGE}</span>
          {/* Placeholders stand in for the rows that are on their way; the sentence
              above is what a screen reader is given, since a shape says nothing. */}
          <Skeleton aria-hidden="true" className="h-10 w-full" />
          <Skeleton aria-hidden="true" className="h-10 w-full" />
          <Skeleton aria-hidden="true" className="h-10 w-full" />
        </div>
      )}

      {state.phase === 'failed' && (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none">{FAILED_TITLE}</AlertTitle>
          <AlertDescription className="text-foreground gap-3">
            <p>{state.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={readAgain}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {state.phase === 'loaded' &&
        (state.files.length === 0 ? (
          <p className="text-muted-foreground max-w-prose">{EMPTY_MESSAGE}</p>
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Submitted expense files, with the setting each was sent against,
              when it was processed, its status, its most recent processing
              activity and how many records it holds.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">File</TableHead>
                <TableHead scope="col">File setting</TableHead>
                <TableHead scope="col">Processed</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Most recent activity</TableHead>
                <TableHead scope="col" className="text-right">
                  Records
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.files.map((file) => (
                <TableRow key={file.Id}>
                  <TableCell className="font-medium">
                    {file.CurrentFileName}
                  </TableCell>
                  <TableCell>{file.SettingName}</TableCell>
                  <TableCell>{file.ProcessDate}</TableCell>
                  <TableCell>
                    <FileStatusBadge status={file.CurrentStatus} />
                  </TableCell>
                  <TableCell>{file.LastExecutedActivityName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {file.RecordCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}
    </section>
  );
}
