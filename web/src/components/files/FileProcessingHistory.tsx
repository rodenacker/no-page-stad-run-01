'use client';

/**
 * Every processing activity the transactions service has recorded for one submitted
 * file, with the outcome recorded for it and the times it started and finished
 * (brief FR8, BR4 — both roles read this).
 *
 * Four things about this component are deliberate:
 *
 * - **Everything on screen is the service's own value** (brief BR5). Activity names,
 *   outcomes and both timestamps are printed exactly as they arrived: nothing here
 *   reformats a date, re-cases an outcome or sorts the list. `DecisionResult` is
 *   free-form text the app never judges, and the wire order of the list is not
 *   documented, so the order the service gave is the order the user reads.
 * - **An activity that is still running has NO outcome and NO end time**, which is the
 *   state a retry produces. It is still listed, with the only times it has, and nothing
 *   invents a completed outcome or an end time for it — those two cells say plainly
 *   that nothing has been recorded yet.
 * - **The read happens in the BROWSER**, through the shared API client at the app's own
 *   same-origin address (`lib/api/files.ts`), so the session cookie travels by itself
 *   and the three states below are this component's own business.
 * - **All three non-data states are answered** (project.md NFR-base-5): a wait that is
 *   ANNOUNCED and not merely drawn, a plain sentence when the service has recorded
 *   nothing yet (an answer, not a failure — so no alert and nothing to ask again for),
 *   and a failed read carrying the SERVICE's own wording plus one action that asks for
 *   the history again.
 *
 * The file is identified by its own `Id`, resolved by whatever renders this — there is
 * no get-one-file endpoint, so a file that cannot be resolved never gets this far.
 *
 * KEEPING CURRENT is the caller's decision, not this component's: whoever renders it
 * knows the file's status (this list does not), so it hands down `refreshSignal` and a
 * new value means "ask again". That way one interval on the file's page re-reads the file
 * and its history together, instead of each growing a timer of its own — and a retry,
 * which is not a timer at all, uses the same channel.
 */

import { TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

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
import {
  fetchFileProcessingHistory,
  processingHistoryFailureMessage,
} from '@/lib/api/files';

import type { FileProcessLog, FileProcessLogList } from '@/types/files';

/** What the section is called, and what ties its heading to it. */
const HEADING_ID = 'file-processing-history-heading';
const HEADING = 'Processing history';

/** Announced while the history is being read — a shape on its own says nothing. */
const LOADING_MESSAGE = 'Loading the processing history…';

/** Nothing has been recorded yet: an answer about the file, not a failure. */
const EMPTY_MESSAGE =
  'No processing activity has been recorded for this file yet.';

/** Names what did not happen, so the alert is not just an apology. */
const FAILED_TITLE = 'Could not load the processing history';

/** The one action that asks for the history again. */
const RETRY_LABEL = 'Try again';

/**
 * What an activity's outcome and end time say while it is still running. The service
 * has recorded neither, and saying so is the honest answer — an empty cell reads as an
 * oversight, and any wording that looked like an outcome would be the app inventing one.
 */
const NOT_RECORDED_YET = 'Not recorded yet';

/** Where the history is: being read, read, or unreadable. */
type HistoryState =
  | { phase: 'loading' }
  | { phase: 'loaded'; activities: FileProcessLog[] }
  | { phase: 'failed'; message: string };

const LOADING: HistoryState = { phase: 'loading' };

/**
 * The activities in a response body, tolerating a body that carries none: an absent
 * property is the empty history, which is a legitimate answer and not a failure.
 *
 * WIRE QUIRK: the array property is `FileLog`, not `FileProcessLog` (`@/types/files`).
 */
const activitiesIn = (
  body: FileProcessLogList | undefined,
): FileProcessLog[] => (Array.isArray(body?.FileLog) ? body.FileLog : []);

export function FileProcessingHistory({
  logId,
  refreshSignal = 0,
}: {
  logId: number;
  /**
   * Changed by the caller when the history may have moved on — a retry it accepted, or
   * its own interval while the file is still working. Every value is as good as any
   * other; only CHANGING it means anything.
   *
   * These reads happen behind what the reader is already looking at, so nothing is
   * blanked first and a failure leaves the last known activities exactly where they are.
   */
  refreshSignal?: number;
}) {
  const [state, setState] = useState<HistoryState>(LOADING);
  /** Bumped by Try again; asking for the history again is what re-runs the read. */
  const [readsRequested, setReadsRequested] = useState(0);

  /**
   * Reads the history and puts what came back on screen.
   *
   * A failure is only reported as the failed state when there is nothing on screen to
   * lose — a first read, or a Try again, which puts this back into its busy state
   * first. Once real activities are showing, a read that fails leaves them exactly as
   * they were rather than replacing the answer with an error (the pattern
   * `SubmittedFilesList` established, and what a later re-read on this page relies on).
   *
   * `stillWatching` is how a caller says its read no longer matters: this component has
   * gone away, or the user has asked again since.
   */
  const readHistory = useCallback(
    (stillWatching: () => boolean): Promise<void> =>
      fetchFileProcessingHistory(logId)
        .then((body) => {
          if (!stillWatching()) {
            return;
          }
          setState({ phase: 'loaded', activities: activitiesIn(body) });
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
                  // The service's own wording whenever it sent one, from EITHER place
                  // a failure can carry it; never the client's own placeholder.
                  message: processingHistoryFailureMessage(error),
                },
          );
        }),
    [logId],
  );

  useEffect(() => {
    // A read still in flight when this component goes away — or when the user asks
    // again — must not land on a screen that has moved on.
    let watching = true;

    void readHistory(() => watching);

    return () => {
      watching = false;
    };
  }, [readsRequested, refreshSignal, readHistory]);

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
          {/* Placeholders stand in for the rows on their way; the sentence above is
              what a screen reader is given, since a shape says nothing. */}
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
              {RETRY_LABEL}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {state.phase === 'loaded' &&
        (state.activities.length === 0 ? (
          <p className="text-muted-foreground max-w-prose">{EMPTY_MESSAGE}</p>
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Every processing activity recorded for this file, in the order the
              service reported them, with the outcome recorded for each and the
              times it started and finished.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Activity</TableHead>
                <TableHead scope="col">Outcome</TableHead>
                <TableHead scope="col">Started</TableHead>
                <TableHead scope="col">Finished</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.activities.map((activity, position) => (
                <TableRow
                  // Nothing on an activity is documented as unique — a retry re-runs
                  // the same activity name — so the position in the answer completes
                  // the key rather than standing in for it.
                  key={`${activity.ActivityName}|${activity.StartDate}|${String(position)}`}
                >
                  <TableCell className="font-medium">
                    {activity.ActivityName}
                  </TableCell>
                  <TableCell>
                    {activity.DecisionResult ?? NOT_RECORDED_YET}
                  </TableCell>
                  <TableCell>{activity.StartDate}</TableCell>
                  <TableCell>{activity.EndDate ?? NOT_RECORDED_YET}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}
    </section>
  );
}
